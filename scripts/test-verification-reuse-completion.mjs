#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalDigest } from "./content-addressed-store.mjs";
import {
  attestVerificationEvidence, buildEvidenceTransfer, importEvidenceTransfer,
  producerIdentityDigestFromPublicKey, putVerificationEvidence, verificationCommandIdentity,
} from "./verification-evidence.mjs";
import {
  currentRuntimeIdentity, dependencyInventory, gitTreeDigest, sealDependencyManifest,
  sealScopedGateInventory, sealScopedRequirements, VERIFICATION_SCOPED_GATE_INVENTORY_PATH,
  VERIFICATION_SCOPED_REQUIREMENTS_PATH,
} from "./verification-scoped-reuse.mjs";
import {
  buildFinalVerificationCoverage, prepareVerificationCompletion, VERIFICATION_COMPLETION_POLICY_PATH,
} from "./verification-reuse-completion.mjs";
import { OBSERVATION_KINDS, summarizeVerificationWork } from "./verification-decision-core.mjs";

const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const repositoryId = "github.com/example/verification-completion-fixture";
const actor = "fixture-independent-reviewer";
function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function write(root, path, content) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}
function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function fixture(t, { adapter = "codex", independent = false, unknown = false, current = [] } = {}) {
  const parent = mkdtempSync(resolve(tmpdir(), "ask-verification-completion-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = resolve(parent, "repository");
  const store = resolve(parent, "evidence");
  mkdirSync(root);
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "ASK fixture"]);
  git(root, ["config", "user.email", "ask-fixture@example.invalid"]);
  git(root, ["remote", "add", "origin", "https://github.com/example/verification-completion-fixture.git"]);
  write(root, "src/app.mjs", "export const answer = 42;\n");
  write(root, "src/view.mjs", "export const view = 'ready';\n");
  write(root, "generator/build.mjs", "export const version = 1;\n");
  write(root, "config/gate.json", { strict: true });
  write(root, "schema/model.json", { type: "object" });
  write(root, "docs/readme.md", "# Fixture\n");
  write(root, "checks/source.mjs", `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answer } from '../src/app.mjs';
import { view } from '../src/view.mjs';
import { version } from '../generator/build.mjs';
assert.ok(Number.isInteger(answer) && answer >= 0);
assert.equal(typeof view, 'string');
assert.ok(Number.isInteger(version));
assert.equal(JSON.parse(readFileSync('config/gate.json', 'utf8')).strict, true);
process.stdout.write('source-pass\\n');
`);
  write(root, "checks/schema.mjs", `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
assert.equal(JSON.parse(readFileSync('schema/model.json', 'utf8')).type, 'object');
process.stdout.write('schema-pass\\n');
`);
  const sourceRevision = commit(root, "fixture source");
  const keys = generateKeyPairSync("ed25519");
  const developerId = producerIdentityDigestFromPublicKey(keys.publicKey);
  const authority = { independent_judgment_required: false, accepted_producers: [{ kind: "developer", identity_digest: developerId }], accepted_evidence_levels: ["executed"] };
  const runner = { runner_id: "ask-fixture-node", runner_version: "1.0.0", adapter_id: adapter, adapter_version: "1.0.0", evidence_level: "executed" };
  const definitions = [
    { id: "source-test", entry: "checks/source.mjs", patterns: ["src/**", "generator/**", "config/**", "checks/source.mjs"] },
    { id: "schema-test", entry: "checks/schema.mjs", patterns: ["schema/**", "checks/schema.mjs"] },
  ];
  const gates = definitions.map((definition) => {
    const selectors = definition.patterns.map((pattern) => ({ kind: pattern.includes("*") ? "glob" : "file", pattern, evidence_kind: "file" }));
    const inventory = dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors });
    const manifestPath = `.ask/manifests/${definition.id}.json`;
    const manifest = sealDependencyManifest({
      gate_id: definition.id, gate_contract_digest: canonicalDigest({ gate: definition.id, revision: 1 }),
      dependency_completeness: unknown && definition.id === "source-test" ? "incomplete" : "complete",
      base_inventory_digest: inventory.inventory_digest, selectors,
      execution: {
        command: verificationCommandIdentity({ executable: "node", argument_identities: [{ kind: "public", identity_digest: hash(definition.entry) }], working_directory: "." }),
        runner,
      },
      runtime_observation: { mode: "node_process_v1", toolchain_names: ["node"] },
      invalidation: { unknown_dependencies_require_rerun: true },
    });
    write(root, manifestPath, manifest);
    return { ...definition, manifestPath, manifest, requirement: {
      gate_id: definition.id, dependency_manifest_path: manifestPath,
      required_obligation_refs: [`AC-${definition.id}`],
      authority: { ...authority, independent_judgment_required: independent && definition.id === "source-test" },
      execution_availability: "available",
      delta_review: definition.id === "source-test" ? { surface_selectors: [{ kind: "glob", pattern: "src/**" }], obligation_refs: ["AC-semantic-review"], prior_review_ref: "fixture-baseline-review", prior_finding_refs: ["fixture-prior-finding"] } : null,
    } };
  });
  const inventory = sealScopedGateInventory({ required_gates: gates.map((gate) => gate.requirement), current_obligations: current });
  write(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, inventory);
  const policy = {
    schema_version: "1.0.0", repository_id: repositoryId, maximum_decision_ms: 60000,
    providers: OBSERVATION_KINDS.map((kind) => ({ kind, provider_id: "fixture-refresh", actor_ids: [actor] })),
    forbidden_actor_ids: [developerId, "fixture-developer"],
  };
  write(root, VERIFICATION_COMPLETION_POLICY_PATH, policy);
  const base = commit(root, "declare immutable gate and decision policy");
  function execute(gate, revision, destination = store, events = [], mutate = null) {
    assert.equal(git(root, ["rev-parse", "HEAD"]), revision);
    const started = performance.now();
    // Hard-coded public fixture entrypoint: never execute an evidence-supplied argv.
    const result = spawnSync(process.execPath, [gate.entry], { cwd: root, encoding: null, timeout: 10000 });
    const duration = Math.max(0, Math.round(performance.now() - started));
    assert.equal(result.status, 0, result.stderr?.toString("utf8"));
    events.push({ kind: "deterministic_execution", gate_id: gate.id, status: "succeeded" });
    const inputs = dependencyInventory({ repositoryRoot: root, revision, selectors: gate.manifest.selectors });
    const draft = {
      schema_version: "1.0.0", schema_path: "schemas/verification-evidence.schema.json", program: "ask_verification_evidence",
      gate: { gate_id: gate.id, contract_digest: gate.manifest.gate_contract_digest, category: "test" },
      target: { repository_id: repositoryId, target_revision: revision, tree_digest: gitTreeDigest({ repositoryRoot: root, revision }) },
      consumed_inputs: [...inputs.entries.map((entry) => ({ kind: entry.evidence_kind, path: entry.path, digest: entry.content_digest })), { kind: "manifest", path: gate.manifestPath, digest: hash(readFileSync(resolve(root, gate.manifestPath))) }],
      execution: { ...gate.manifest.execution, ...currentRuntimeIdentity(), terminal: { status: "succeeded", exit_code: 0, duration_ms: duration, output_bytes: result.stdout.length + result.stderr.length, output_digest: hash(Buffer.concat([result.stdout, result.stderr])) } },
      coverage: { obligation_refs: gate.requirement.required_obligation_refs, explicit_non_coverage: [] },
      invalidation: { mode: "exact_identity_only", unknown_dependencies_require_rerun: true },
      producer: { kind: "developer" }, authority: { independent_review_status: "not_independent" },
      privacy: { classification: "internal", exportability: "exportable", raw_prompts_stored: false, transcripts_stored: false, raw_output_stored: false, secrets_stored: false, absolute_private_paths_stored: false, private_evaluators_stored: false, review_archives_stored: false },
    };
    if (mutate) mutate(draft); // Negative-test-only signed counterexamples, never reported as measured success.
    const evidence = attestVerificationEvidence(draft, { privateKey: keys.privateKey });
    putVerificationEvidence({ storeRoot: destination, evidence });
    return evidence;
  }
  const evidence = gates.map((gate) => execute(gate, base));
  const transfer = buildEvidenceTransfer({ storeRoot: store, evidenceIds: evidence.map((entry) => entry.evidence_id) });
  const requirements = sealScopedRequirements({ base_revision: base, gate_inventory_id: inventory.inventory_id, gate_inventory_digest: inventory.inventory_digest, required_gates: gates.map((gate, index) => ({ ...gate.requirement, source_evidence_id: evidence[index].evidence_id })), current_obligations: current });
  write(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, requirements);
  const initial = commit(root, "bind source verification evidence");
  const calls = [];
  const refresh = (query) => {
    calls.push({ kind: query.kind, phase: query.phase });
    // Synthetic authoritative system, not a live PR, AI review or human approval.
    return { query, status: "satisfied", actor_id: actor, evidence_digest: canonicalDigest({ target: query.target_revision, request: query.request_digest, kind: query.kind, ref: query.ref }) };
  };
  const options = (revision = git(root, ["rev-parse", "HEAD"]), destination = store) => ({ repositoryRoot: root, storeRoot: destination, targetRevision: revision });
  return { parent, root, store, base, initial, gates, evidence, transfer, policy, developerId, execute, calls, refresh, options, providers: { "fixture-refresh": refresh } };
}

for (const adapter of ["codex", "claude-code"]) test(`multi-revision real gate execution and portable evidence: ${adapter}`, async (t) => {
  const f = fixture(t, { adapter });
  const baselineStore = resolve(f.parent, "full-rerun");
  importEvidenceTransfer({ storeRoot: baselineStore, transfer: f.transfer });
  const revisions = [
    ["initial", null, null], ["docs-only", "docs/readme.md", "# Docs changed\n"],
    ["source", "src/app.mjs", "export const answer = 43;\n"],
    ["generator", "generator/build.mjs", "export const version = 2;\n"],
    ["schema", "schema/model.json", { type: "object", additionalProperties: false }],
  ];
  const rows = [];
  function dispatchFixtureReview(request, events) {
    assert.equal(request.program, "ask_verification_selective_review");
    events.push({ kind: "review_request_dispatch" });
    return { request_digest: request.artifact_digest, model_called: false };
  }
  for (const [name, path, content] of revisions) {
    if (path) { write(f.root, path, content); commit(f.root, name); }
    const before = prepareVerificationCompletion(f.options());
    if (["initial", "docs-only"].includes(name)) assert.equal(before.review_request.status, "not_required");
    if (name === "source") assert.deepEqual(before.review_request.affected_paths, ["src/app.mjs"]);
    if (name === "generator") {
      assert.deepEqual(before.review_request.affected_paths, ["src/app.mjs", "src/view.mjs"]);
      assert.deepEqual(before.review_request.newly_affected_paths, ["src/view.mjs"]);
    }
    const fullEvents = [];
    for (const gate of f.gates) f.execute(gate, f.options().targetRevision, baselineStore, fullEvents);
    dispatchFixtureReview(before.review_request, fullEvents);
    const selectiveEvents = [];
    for (const disposition of before.dispositions) {
      if (!disposition.execution_evidence_reusable) f.execute(f.gates.find((gate) => gate.id === disposition.gate_id), f.options().targetRevision, f.store, selectiveEvents);
    }
    if (before.review_request.status === "independent_judgment_required") dispatchFixtureReview(before.review_request, selectiveEvents);
    const selective = await buildFinalVerificationCoverage({ ...f.options(), providers: f.providers });
    const full = await buildFinalVerificationCoverage({ ...f.options(undefined, baselineStore), providers: f.providers });
    assert.equal(selective.status, "covered", JSON.stringify(selective.blockers));
    assert.equal(full.status, "covered", JSON.stringify(full.blockers));
    assert.equal(selective.authorizes_action, false);
    assert.equal(selective.deterministic_covered_count, full.deterministic_covered_count);
    const metrics = summarizeVerificationWork({ dispositions: before.dispositions, requiredJudgmentRefs: before.review_request.required_judgment_refs, events: selectiveEvents });
    const baseline = summarizeVerificationWork({ dispositions: before.dispositions, requiredJudgmentRefs: before.review_request.required_judgment_refs, events: fullEvents });
    const exact = prepareVerificationCompletion(f.options(undefined, baselineStore));
    assert.ok(exact.dispositions.every((entry) => entry.execution_evidence_reusable && entry.reuse_basis === "exact_target"));
    const exactMetrics = summarizeVerificationWork({ dispositions: exact.dispositions, requiredJudgmentRefs: exact.review_request.required_judgment_refs, events: [] });
    assert.equal(exactMetrics.reuse_exact_count, 2);
    assert.equal(metrics.uncovered_gate_count, 0);
    assert.equal(metrics.ai_request_count, 0);
    assert.equal(metrics.runtime_measurements.elapsed_ms.status, "unavailable");
    rows.push({ revision: name, baseline, selective: metrics, exact_reuse: exactMetrics });
  }
  const sum = (condition, key) => rows.reduce((total, row) => total + row[condition][key], 0);
  assert.equal(sum("baseline", "deterministic_execution_count"), 10);
  assert.equal(sum("selective", "deterministic_execution_count"), 4);
  assert.equal(sum("selective", "saved_deterministic_executions"), 6);
  assert.equal(sum("baseline", "review_request_dispatch_count"), 5);
  assert.equal(sum("selective", "review_request_dispatch_count"), 3);
  // These are observed deterministic fixture executions, NOT a model benchmark.
  console.log(JSON.stringify({ program: "ask_verification_multirevision_fixture", adapter, rows }));
});

test("imported developer evidence never becomes independent judgment or approval", async (t) => {
  const f = fixture(t, { independent: true, current: [{ obligation_id: "human-boundary", kind: "approval" }] });
  const reviewerStore = resolve(f.parent, "reviewer");
  importEvidenceTransfer({ storeRoot: reviewerStore, transfer: f.transfer });
  const prepared = prepareVerificationCompletion(f.options(undefined, reviewerStore));
  assert.equal(prepared.deterministic_coverage, "covered");
  assert.equal(prepared.review_request.prior_review_authority, "baseline_reference_only");
  assert.equal((await buildFinalVerificationCoverage(f.options(undefined, reviewerStore))).status, "blocked");
  const developer = (query) => ({ ...f.refresh(query), actor_id: f.developerId });
  assert.equal((await buildFinalVerificationCoverage({ ...f.options(undefined, reviewerStore), providers: { "fixture-refresh": developer } })).status, "blocked");
  const result = await buildFinalVerificationCoverage({ ...f.options(undefined, reviewerStore), providers: f.providers });
  assert.equal(result.status, "covered");
  assert.equal(result.authorizes_action, false);
  assert.equal(f.transfer.evidence_objects[0].authority.independent_review_status, "not_independent");
  const altered = structuredClone(f.transfer);
  altered.evidence_objects[0].authority.independent_review_status = "independent";
  assert.throws(() => importEvidenceTransfer({ storeRoot: resolve(f.parent, "forged"), transfer: altered }));
});

test("current merge and release facts are refreshed, not historical green authority", async (t) => {
  const f = fixture(t);
  const absent = await buildFinalVerificationCoverage({ ...f.options(), claim: "merge" });
  assert.equal(absent.status, "blocked");
  assert.deepEqual(absent.blockers.map((entry) => entry.kind).sort(), ["approval", "authorization", "mergeability", "pr_head", "required_ci"]);
  const present = await buildFinalVerificationCoverage({ ...f.options(), claim: "release", providers: f.providers });
  assert.equal(present.status, "covered");
  assert.ok(present.observations.some((entry) => entry.kind === "release_state"));
  assert.equal(f.calls.length, 12);
  const history = await buildFinalVerificationCoverage({ ...f.options(), claim: "merge", providers: { "fixture-refresh": present } });
  assert.equal(history.status, "blocked");
  const changed = (query) => ({ ...f.refresh(query), status: query.phase === "confirm" && query.kind === "required_ci" ? "unsatisfied" : "satisfied" });
  assert.equal((await buildFinalVerificationCoverage({ ...f.options(), claim: "merge", providers: { "fixture-refresh": changed } })).status, "blocked");
});

test("unknown dependencies remain rerun/uncovered and cannot be discharged by judgment", async (t) => {
  const f = fixture(t, { unknown: true });
  const prepared = prepareVerificationCompletion(f.options());
  assert.equal(prepared.dispositions.find((entry) => entry.gate_id === "source-test").disposition, "rerun_required");
  const result = await buildFinalVerificationCoverage({ ...f.options(), providers: f.providers });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.kind === "gate"));
  assert.equal(summarizeVerificationWork({ dispositions: prepared.dispositions, events: [] }).saved_deterministic_executions, 1);
});

test("current reruns preserve repository, target, adapter, environment and obligation binding", async (t) => {
  const f = fixture(t);
  write(f.root, "src/app.mjs", "export const answer = 44;\n");
  const target = commit(f.root, "source requires rerun");
  const mutations = [
    (draft) => { draft.target.repository_id = "github.com/example/other"; },
    (draft) => { draft.target.target_revision = "a".repeat(40); },
    (draft) => { draft.execution.runner = { ...draft.execution.runner, adapter_id: "other" }; },
    (draft) => { draft.execution.environment.identity_digest = hash("different environment"); },
    (draft) => { draft.coverage.obligation_refs = ["AC-other"]; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const store = resolve(f.parent, `transplant-${index}`);
    importEvidenceTransfer({ storeRoot: store, transfer: f.transfer });
    f.execute(f.gates[0], target, store, [], mutate);
    const result = await buildFinalVerificationCoverage({ ...f.options(target, store), providers: f.providers });
    assert.equal(result.status, "blocked");
    assert.ok(result.blockers.some((entry) => entry.kind === "gate" && entry.ref === "source-test"));
  }
  f.execute(f.gates[0], target);
  const withoutReview = await buildFinalVerificationCoverage(f.options());
  assert.equal(withoutReview.status, "blocked");
  assert.ok(withoutReview.blockers.some((entry) => entry.kind === "independent_judgment"));
  assert.equal((await buildFinalVerificationCoverage({ ...f.options(), providers: f.providers })).status, "covered");
});

test("conflicting baseline PASS is not selected out of an imported evidence bundle", async (t) => {
  const f = fixture(t);
  git(f.root, ["checkout", "--detach", f.base]);
  f.execute(f.gates[0], f.base, f.store, [], (draft) => {
    draft.execution.terminal.status = "failed";
    draft.execution.terminal.exit_code = 1;
  });
  git(f.root, ["checkout", "main"]);
  const prepared = prepareVerificationCompletion(f.options());
  assert.equal(prepared.dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "source_evidence_conflicting_or_invalid");
  assert.equal((await buildFinalVerificationCoverage({ ...f.options(), providers: f.providers })).status, "blocked");
});

test("HEAD, dirty state, hidden flags and changed policy cannot claim current coverage", async (t) => {
  const f = fixture(t);
  assert.equal((await buildFinalVerificationCoverage(f.options(f.base))).status, "blocked");
  write(f.root, "src/app.mjs", "export const answer = 50;\n");
  assert.equal((await buildFinalVerificationCoverage(f.options())).status, "blocked");
  git(f.root, ["checkout", "--", "src/app.mjs"]);
  git(f.root, ["update-index", "--assume-unchanged", "src/app.mjs"]);
  assert.equal((await buildFinalVerificationCoverage(f.options())).status, "blocked");
  git(f.root, ["update-index", "--no-assume-unchanged", "src/app.mjs"]);
  write(f.root, VERIFICATION_COMPLETION_POLICY_PATH, { ...f.policy, maximum_decision_ms: 59000 });
  commit(f.root, "change authority policy after source baseline");
  assert.equal((await buildFinalVerificationCoverage({ ...f.options(), providers: f.providers })).status, "blocked");
});

test("CAS and worktree are revalidated after current observers return", async (t) => {
  const f = fixture(t, { independent: true });
  let mutated = false;
  const provider = (query) => {
    if (!mutated) { write(f.root, "docs/readme.md", "# Concurrent mutation\n"); mutated = true; }
    return f.refresh(query);
  };
  const result = await buildFinalVerificationCoverage({ ...f.options(), providers: { "fixture-refresh": provider } });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.reason_code === "decision_inputs_changed_or_expired"));
});

test("over-bound semantic input blocks instead of retaining a truncated request", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 257; i += 1) write(f.root, `src/added-${i}.mjs`, `export const value = ${i};\n`);
  commit(f.root, "many affected paths");
  const prepared = prepareVerificationCompletion(f.options());
  assert.equal(prepared.review_request.status, "blocked_unbounded_or_unknown");
  assert.deepEqual(prepared.review_request.affected_paths, []);
  assert.equal((await buildFinalVerificationCoverage({ ...f.options(), providers: f.providers })).status, "blocked");
});

test("CLI emits bounded prepare output, rejects history flags, and fails blocked claims", async (t) => {
  const f = fixture(t);
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "verification-reuse-completion.mjs");
  const args = ["--repository", f.root, "--store", f.store, "--target", f.initial];
  const output = resolve(f.parent, "prepared.json");
  const prepare = spawnSync(process.execPath, [script, "prepare", ...args, "--output", output], { encoding: "utf8" });
  assert.equal(prepare.status, 0, prepare.stderr);
  assert.equal(JSON.parse(readFileSync(output, "utf8")).program, "ask_verification_completion_plan");
  const blocked = spawnSync(process.execPath, [script, "coverage", ...args, "--claim", "merge"], { encoding: "utf8" });
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stdout).status, "blocked");
  const history = spawnSync(process.execPath, [script, "coverage", ...args, "--fresh", "true"], { encoding: "utf8" });
  assert.equal(history.status, 1);
});
