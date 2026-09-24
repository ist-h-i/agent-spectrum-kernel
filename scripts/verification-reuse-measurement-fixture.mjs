import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { attestVerificationEvidence, buildEvidenceTransfer, importEvidenceTransfer, producerIdentityDigestFromPublicKey,
  putVerificationEvidence, verificationCommandIdentity } from "./verification-evidence.mjs";
import { currentRuntimeIdentity, dependencyInventory, gitTreeDigest, sealDependencyManifest, sealScopedGateInventory,
  sealScopedRequirements, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, VERIFICATION_SCOPED_REQUIREMENTS_PATH } from "./verification-scoped-reuse.mjs";
import { VERIFICATION_COMPLETION_POLICY_PATH } from "./verification-reuse-completion.mjs";

export const MATERIAL = Object.freeze({
  "src/limit.mjs": "export const withinLimit = (amount, limit) => amount >= 0 && amount <= limit;\n",
  "src/view.mjs": "export const view = 'ready';\n",
  "schema/model.json": '{"type":"object"}\n',
  "docs/readme.md": "# Public verification reuse fixture\n",
  "checks/source.mjs": "import assert from 'node:assert/strict'; import { withinLimit } from '../src/limit.mjs'; assert.equal(withinLimit(5,10),true); assert.equal(withinLimit(-1,10),false);\n",
  "checks/schema.mjs": "import assert from 'node:assert/strict'; import { view } from '../src/view.mjs'; import { readFileSync } from 'node:fs'; assert.equal(view,'ready'); assert.equal(JSON.parse(readFileSync('schema/model.json','utf8')).type,'object');\n",
});
export const REVISIONS = Object.freeze([
  { name: "A", path: null, content: null },
  { name: "B", path: "docs/readme.md", content: "# Public fixture: docs-only clarification\n" },
  { name: "C", path: "src/limit.mjs", content: "export const withinLimit = (amount, limit) => amount >= 0 && amount < limit;\n" },
]);
export const OBLIGATIONS = Object.freeze([
  { ref: "AC-limit-inclusive", path: "src/limit.mjs", text: "For finite non-negative inputs, amount equal to limit must be accepted; amounts above limit and negative amounts must be rejected. A violation is a blocker." },
  { ref: "AC-view-ready", path: "src/view.mjs", text: "The exported view must be the string ready. A violation is a blocker." },
]);
const repositoryId = "github.com/example/verification-reuse-measurement";
export const REVIEW_ACTOR = "measurement-independent-reviewer";
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export function git(root, args) {
  const result = spawnSync("git", ["--no-replace-objects", "-C", root, ...args], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 10000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  if (result.error || result.status !== 0) throw new Error("fixture Git command failed");
  return result.stdout.trim();
}
function write(root, path, content) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}
function commit(root, name) {
  git(root, ["add", "-A"]); git(root, ["commit", "-m", name]); return git(root, ["rev-parse", "HEAD"]);
}

// Only this closed public fixture can execute commands. No repository-supplied argv/provider loader.
export function createMeasurementFixture({ independent = false } = {}) {
  const parent = mkdtempSync(resolve(tmpdir(), "ask-reuse-measurement-"));
  const root = resolve(parent, "repository"); mkdirSync(root);
  const stores = { baseline: resolve(parent, "baseline"), reuse: resolve(parent, "reuse") };
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "ASK public fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["remote", "add", "origin", `https://${repositoryId}.git`]);
  for (const [path, content] of Object.entries(MATERIAL)) write(root, path, content);
  const materialRevision = commit(root, "public source material");
  const keys = generateKeyPairSync("ed25519");
  const developer = producerIdentityDigestFromPublicKey(keys.publicKey);
  const runner = { runner_id: "ask-measurement-node", runner_version: "1.0.0", adapter_id: "codex", adapter_version: "1.0.0", evidence_level: "executed" };
  const gates = [
    { id: "source-test", entry: "checks/source.mjs", selectors: [{ kind: "file", pattern: "src/limit.mjs", evidence_kind: "file" }, { kind: "file", pattern: "checks/source.mjs", evidence_kind: "file" }] },
    { id: "schema-test", entry: "checks/schema.mjs", selectors: [{ kind: "glob", pattern: "schema/**", evidence_kind: "file" }, { kind: "file", pattern: "src/view.mjs", evidence_kind: "file" }, { kind: "file", pattern: "checks/schema.mjs", evidence_kind: "file" }] },
  ].map((definition) => {
    const manifestPath = `.ask/manifests/${definition.id}.json`;
    const manifest = sealDependencyManifest({ gate_id: definition.id, gate_contract_digest: canonicalDigest({ id: definition.id, revision: 1 }),
      dependency_completeness: "complete", selectors: definition.selectors,
      base_inventory_digest: dependencyInventory({ repositoryRoot: root, revision: materialRevision, selectors: definition.selectors }).inventory_digest,
      execution: { command: verificationCommandIdentity({ executable: "node", argument_identities: [{ kind: "public", identity_digest: hash(definition.entry) }], working_directory: "." }), runner },
      runtime_observation: { mode: "node_process_v1", toolchain_names: ["node"] }, invalidation: { unknown_dependencies_require_rerun: true } });
    write(root, manifestPath, manifest);
    return { ...definition, manifestPath, manifest, requirement: {
      gate_id: definition.id, dependency_manifest_path: manifestPath, required_obligation_refs: [`AC-${definition.id}`],
      authority: { independent_judgment_required: independent && definition.id === "source-test", accepted_producers: [{ kind: "developer", identity_digest: developer }], accepted_evidence_levels: ["executed"] },
      execution_availability: "available", delta_review: {
        surface_selectors: [{ kind: "file", pattern: definition.id === "source-test" ? "src/limit.mjs" : "src/view.mjs" }],
        obligation_refs: [definition.id === "source-test" ? "AC-limit-inclusive" : "AC-view-ready"],
        prior_review_ref: "measurement-baseline-review", prior_finding_refs: [],
      },
    } };
  });
  const inventory = sealScopedGateInventory({ required_gates: gates.map((gate) => gate.requirement), current_obligations: [] });
  write(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, inventory);
  write(root, VERIFICATION_COMPLETION_POLICY_PATH, { schema_version: "1.0.0", repository_id: repositoryId, maximum_decision_ms: 60000,
    providers: [{ kind: "independent_judgment", provider_id: "measurement-review-state", actor_ids: [REVIEW_ACTOR] }], forbidden_actor_ids: [developer] });
  const base = commit(root, "pin gates and review authority");
  const head = () => git(root, ["rev-parse", "HEAD"]);
  function execute(gate, store) {
    const revision = head();
    assert.equal(git(root, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
    const started = performance.now();
    const result = spawnSync(process.execPath, [gate.entry], { cwd: root, encoding: null, timeout: 10000, maxBuffer: 65536,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8" } });
    const duration = Math.max(0, Math.round(performance.now() - started));
    if (result.error || result.status !== 0) throw new Error("deterministic fixture gate failed");
    assert.equal(head(), revision); assert.equal(git(root, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
    const inputs = dependencyInventory({ repositoryRoot: root, revision, selectors: gate.manifest.selectors });
    const evidence = attestVerificationEvidence({
      schema_version: "1.0.0", schema_path: "schemas/verification-evidence.schema.json", program: "ask_verification_evidence",
      gate: { gate_id: gate.id, contract_digest: gate.manifest.gate_contract_digest, category: "test" },
      target: { repository_id: repositoryId, target_revision: revision, tree_digest: gitTreeDigest({ repositoryRoot: root, revision }) },
      consumed_inputs: [...inputs.entries.map((entry) => ({ kind: entry.evidence_kind, path: entry.path, digest: entry.content_digest })), { kind: "manifest", path: gate.manifestPath, digest: hash(readFileSync(resolve(root, gate.manifestPath))) }],
      execution: { ...gate.manifest.execution, ...currentRuntimeIdentity(), terminal: { status: "succeeded", exit_code: 0, duration_ms: duration,
        output_bytes: result.stdout.length + result.stderr.length, output_digest: hash(Buffer.concat([result.stdout, result.stderr])) } },
      coverage: { obligation_refs: gate.requirement.required_obligation_refs, explicit_non_coverage: [] },
      invalidation: { mode: "exact_identity_only", unknown_dependencies_require_rerun: true }, producer: { kind: "developer" }, authority: { independent_review_status: "not_independent" },
      privacy: { classification: "internal", exportability: "exportable", raw_prompts_stored: false, transcripts_stored: false, raw_output_stored: false,
        secrets_stored: false, absolute_private_paths_stored: false, private_evaluators_stored: false, review_archives_stored: false },
    }, { privateKey: keys.privateKey });
    putVerificationEvidence({ storeRoot: store, evidence });
    return { evidence, duration_ms: duration, event: { kind: "deterministic_execution", gate_id: gate.id, status: "succeeded" } };
  }
  let baselineIds = [];
  function bindBaseline(sourceCondition, executions) {
    const evidence = executions.map((entry) => entry.evidence);
    baselineIds = evidence.map((entry) => entry.evidence_id);
    const transfer = buildEvidenceTransfer({ storeRoot: stores[sourceCondition], evidenceIds: evidence.map((entry) => entry.evidence_id) });
    for (const store of Object.values(stores)) importEvidenceTransfer({ storeRoot: store, transfer });
    write(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({ base_revision: base,
      gate_inventory_id: inventory.inventory_id, gate_inventory_digest: inventory.inventory_digest,
      required_gates: gates.map((gate, index) => ({ ...gate.requirement, source_evidence_id: evidence[index].evidence_id })), current_obligations: [] }));
    return commit(root, "bind common baseline evidence");
  }
  return { parent, root, stores, gates, base, developer, head, execute, bindBaseline, sourceEvidenceIds: () => [...baselineIds],
    revise: (revision) => { if (revision.path) { write(root, revision.path, revision.content); commit(root, revision.name); } return head(); },
    options: (condition) => ({ repositoryRoot: root, storeRoot: stores[condition], targetRevision: head() }),
    material: (paths) => paths.map((path) => ({ path, content: git(root, ["show", `${head()}:${path}`]) })),
    dispose: () => rmSync(parent, { recursive: true, force: true }),
  };
}
