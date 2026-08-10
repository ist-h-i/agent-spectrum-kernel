#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import {
  computeCommandContractDigest,
  computeVerificationCommandContractDigest,
  logicalCommandDigest,
  renderedEventCommandDigest,
  validateVerificationCommandContract,
} from "./ask-benchmark-command-evidence.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { validateMnDocConfigCorrectionProductionAuthority } from "./ask-benchmark-mn-doc-config-correction-authority.mjs";

export const FIXTURE_ID = "mn-doc-config-correction";
export const FIXTURE_ROOT_RELATIVE = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ARTIFACT_NAMES = [
  "evidence-map.json",
  "input-manifest.json",
  "metadata.json",
  "output-contract.json",
  "source-freeze-candidate.json",
  "requirement-record.json",
  "verification-command-contract.json",
];
const AGENT_VISIBLE_PATTERN = /^(?:task\.md|workspace\/.+)$/u;
const PRIVATE_NAME_PATTERN = /(?:^|[._/-])(?:evaluator|hidden|oracle|rubric|private)(?:[._/-]|$)/iu;
const FORBIDDEN_PUBLIC_KEYS = new Set(["expected_patch", "hidden_answer", "hidden_tests", "matcher", "oracle", "private_root", "reference_answer", "rubric"]);
const FORBIDDEN_TASK_VOCABULARY = /\b(?:ASK|benchmark|evaluator|routing|scoring|minimal patch|hidden tests?|over-processing|mechanism selection)\b/iu;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function withoutField(value, field) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`); }
}

function portablePath(value, label) {
  const segments = typeof value === "string" ? value.split("/") : [];
  if (typeof value !== "string" || !AGENT_VISIBLE_PATTERN.test(value) || value.includes("\\") || segments.some((segment) => segment === "" || segment === "." || segment === "..") || PRIVATE_NAME_PATTERN.test(value)) throw new Error(`${label} is not an allowed agent-visible path`);
  return value;
}

function walkFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = resolve(current, entry.name);
    const path = relative(root, absolute).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new Error(`agent-visible input traverses a symlink: ${path}`);
    if (entry.isDirectory()) files.push(...walkFiles(root, absolute));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`agent-visible input is not a regular file: ${path}`);
  }
  return files;
}

function publicValueIsAnswerNeutral(value, label) {
  const visit = (entry) => {
    if (Array.isArray(entry)) return entry.forEach(visit);
    if (!entry || typeof entry !== "object") return;
    for (const [key, child] of Object.entries(entry)) {
      if (FORBIDDEN_PUBLIC_KEYS.has(key.toLowerCase())) throw new Error(`${label} contains private answer-bearing field ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function agentVisibleFiles(fixtureRoot) {
  const paths = ["task.md", ...walkFiles(resolve(fixtureRoot, "workspace")).map((path) => `workspace/${path}`)];
  return paths.map((path) => {
    const bytes = readFileSync(resolve(fixtureRoot, path));
    return { path, sha256: sha256(bytes).slice("sha256:".length), bytes: bytes.length };
  });
}

function closeCommand(command) {
  const withLogical = { ...command, logical_command_digest: logicalCommandDigest(command) };
  const withRendered = { ...withLogical, rendered_event_command_digest: renderedEventCommandDigest(withLogical) };
  return { ...withRendered, command_contract_digest: computeCommandContractDigest(withRendered) };
}

function buildArtifacts(root = ROOT) {
  const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
  const files = agentVisibleFiles(fixtureRoot);
  const inputManifest = {
    schema_version: 1,
    hash_algorithm: "sha256",
    scope: "agent-visible task.md + workspace/**",
    fixtures: {
      [FIXTURE_ID]: { class: "documentation", difficulty: "easy", target_minutes: 5, files },
    },
  };
  const inputBytes = Buffer.from(`${JSON.stringify(inputManifest, null, 2)}\n`);
  const protectedPaths = ["config/retry-policy.json", "package.json", "test/worker-retries.test.mjs"];
  const protectedDigests = Object.fromEntries(protectedPaths.map((path) => [path, files.find((entry) => entry.path === `workspace/${path}`).sha256]));
  const anchorScript = `node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected=${JSON.stringify(protectedDigests)};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}'`;
  const command = closeCommand({
    command_id: "worker-retry-doc-test",
    purpose: "test",
    working_directory: { path: ".", evidence_requirement: "not_required" },
    safe_argv: null,
    execution_form: "codex_shell_command",
    shell_family: "posix_bash",
    shell_envelope: { executable: "/bin/bash", arguments: ["-lc"] },
    canonical_script: `${anchorScript} && [ -f docs/worker-retries.md ] && npm test`,
    requirement: "required",
    alternative_group_id: null,
    timeout_ms: 60000,
  });
  const verificationBase = {
    schema_version: "1.2.0",
    schema_path: "benchmarks/schemas/portfolio-verification-command-contract.schema.json",
    program: "adaptive_ask_verification_command_contract",
    fixture_id: FIXTURE_ID,
    fixture_input_digest: sha256(inputBytes),
    commands: [command],
  };
  const verification = { ...verificationBase, contract_digest: computeVerificationCommandContractDigest(verificationBase) };
  const scopeBase = {
    allowed_candidate_paths: ["workspace/docs/worker-retries.md"],
    required_candidate_paths: ["workspace/docs/worker-retries.md"],
    protected_candidate_paths: ["workspace/config/retry-policy.json", "workspace/package.json", "workspace/test/worker-retries.test.mjs"],
    unmanaged_additions: "forbidden",
    unmanaged_deletions: "forbidden",
  };
  const evidenceMap = {
    schema_version: "1.0.0",
    fixture_id: FIXTURE_ID,
    scope_boundary_authority: { ...scopeBase, authority_digest: canonicalDigest(scopeBase) },
    maps: [
      { evidence_map_id: "documentation-config-contract", agent_visible_paths: ["workspace/config/retry-policy.json", "workspace/docs/worker-retries.md"] },
      { evidence_map_id: "focused-change-boundary", agent_visible_paths: ["task.md", "workspace/docs/worker-retries.md"] },
      { evidence_map_id: "repository-verification-route", agent_visible_paths: ["workspace/package.json", "workspace/test/worker-retries.test.mjs"] },
    ],
  };
  evidenceMap.evidence_map_digest = canonicalDigest(evidenceMap);
  const requirementSeeds = [
    ["documentation-correctness", 5, "documentation-config-contract", "remove-documentation-config-evidence", "observable-documentation-contract"],
    ["request-scope-discipline", 3, "focused-change-boundary", "remove-focused-scope-evidence", "equivalent-focused-change"],
    ["verification-evidence", 2, "repository-verification-route", "remove-verification-route", "equivalent-focused-verification"],
  ];
  const requirements = requirementSeeds.map(([requirement_id, max_points, evidenceMapId, mutationId, equivalenceId]) => {
    const base = { requirement_id, requirement_kind: "weighted", max_points, partial_credit_allowed: false, evidence_map_ids: [evidenceMapId], mutation_ids: [mutationId], equivalence_class_ids: [equivalenceId], finding_group_id: `${requirement_id}-outcome`, safety_dimension: "completion_correctness" };
    return { ...base, requirement_digest: canonicalDigest(base) };
  });
  const requirementBase = { schema_version: "1.0.0", fixture_id: FIXTURE_ID, requirements, requirement_set_digest: canonicalDigest(requirements) };
  const requirementRecord = { ...requirementBase, requirement_record_digest: canonicalDigest(requirementBase) };
  const outputBase = {
    schema_version: "1.0.0",
    fixture_id: FIXTURE_ID,
    requirement_record_digest: requirementRecord.requirement_record_digest,
    evidence_map_digest: evidenceMap.evidence_map_digest,
    verification_command_contract_digest: verification.contract_digest,
    result_profile: { name: "binary_scope_verification_v1", digest: canonicalDigest({ name: "binary_scope_verification_v1" }) },
    declares_findings: false,
  };
  const outputContract = { ...outputBase, output_contract_digest: canonicalDigest(outputBase) };
  const metadataBase = {
    schema_version: "1.0.0", fixture_id: FIXTURE_ID, fixture_role: "primary", suite: "mechanism_negative", task_class: "documentation", domain: "docs_config", difficulty: "easy", repetitions: 3, risk_boundary: "none",
    capability_families: ["documentation_accuracy", "focused_implementation"], evidence_topologies: ["documentation_and_config", "single_file_spec"], outcome_dimensions: ["configuration_accuracy", "scope_discipline"],
    source_freeze_state: "candidate", reviewer_status: "pending_independent_review", admission_status: "admission_pending", measured_execution_performed: false, scoring_published: false,
  };
  const metadata = { ...metadataBase, metadata_digest: canonicalDigest(metadataBase) };
  const candidateBase = {
    schema_version: "1.0.0", fixture_id: FIXTURE_ID, candidate_state: "source_freeze_candidate", reviewer_state: "pending", admission_state: "admission_pending", measured_execution: false, scoring_published: false,
    public_bindings: {
      input_manifest: { path: `${FIXTURE_ROOT_RELATIVE}/input-manifest.json`, raw_sha256: sha256(inputBytes) },
      evidence_map: { path: `${FIXTURE_ROOT_RELATIVE}/evidence-map.json`, semantic_digest: evidenceMap.evidence_map_digest },
      requirement_record: { path: `${FIXTURE_ROOT_RELATIVE}/requirement-record.json`, semantic_digest: requirementRecord.requirement_record_digest },
      output_contract: { path: `${FIXTURE_ROOT_RELATIVE}/output-contract.json`, semantic_digest: outputContract.output_contract_digest },
      verification_command_contract: { path: `${FIXTURE_ROOT_RELATIVE}/verification-command-contract.json`, semantic_digest: verification.contract_digest },
    },
  };
  const candidate = { ...candidateBase, candidate_digest: canonicalDigest(candidateBase) };
  return { inputManifest, verification, evidenceMap, requirementRecord, outputContract, metadata, candidate };
}

export function writeMnDocConfigCorrectionArtifacts({ root = ROOT } = {}) {
  const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
  const artifacts = buildArtifacts(root);
  for (const [name, value] of [
    ["input-manifest.json", artifacts.inputManifest], ["verification-command-contract.json", artifacts.verification], ["evidence-map.json", artifacts.evidenceMap], ["requirement-record.json", artifacts.requirementRecord], ["output-contract.json", artifacts.outputContract], ["metadata.json", artifacts.metadata], ["source-freeze-candidate.json", artifacts.candidate],
  ]) writeJson(resolve(fixtureRoot, name), value);
  return validateMnDocConfigCorrectionPublicFixture({ root });
}

function validateInputClosure({ fixtureRoot, manifest }) {
  if (manifest.scope !== "agent-visible task.md + workspace/**") throw new Error("input manifest scope is invalid");
  const record = manifest.fixtures?.[FIXTURE_ID];
  if (!record || record.class !== "documentation" || record.difficulty !== "easy" || !Array.isArray(record.files)) throw new Error("input manifest fixture record is invalid");
  const declared = record.files.map((entry) => portablePath(entry.path, "input manifest path"));
  if (new Set(declared).size !== declared.length || stableCanonicalJson(declared) !== stableCanonicalJson([...declared].sort())) throw new Error("input manifest path inventory must be ordered and unique");
  const actual = agentVisibleFiles(fixtureRoot);
  if (stableCanonicalJson(record.files) !== stableCanonicalJson(actual)) throw new Error("input manifest does not exactly bind the agent-visible inventory");
  return new Set(declared);
}

export function validateMnDocConfigCorrectionPublicFixture({ root = ROOT } = {}) {
  const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
  if (existsSync(resolve(fixtureRoot, "evaluator-reference.json"))) {
    return validateMnDocConfigCorrectionProductionAuthority({ root });
  }
  const artifacts = Object.fromEntries(PUBLIC_ARTIFACT_NAMES.map((name) => [name, readJson(resolve(fixtureRoot, name), `${FIXTURE_ID} ${name}`)]));
  for (const [name, value] of Object.entries(artifacts)) publicValueIsAnswerNeutral(value, name);
  const task = readFileSync(resolve(fixtureRoot, "task.md"), "utf8");
  if (FORBIDDEN_TASK_VOCABULARY.test(task)) throw new Error("public task contains benchmark-specific vocabulary");
  const inputBytes = readFileSync(resolve(fixtureRoot, "input-manifest.json"));
  const visiblePaths = validateInputClosure({ fixtureRoot, manifest: artifacts["input-manifest.json"] });
  const expected = buildArtifacts(root);
  for (const [name, value] of [["verification-command-contract.json", expected.verification], ["evidence-map.json", expected.evidenceMap], ["requirement-record.json", expected.requirementRecord], ["output-contract.json", expected.outputContract], ["metadata.json", expected.metadata], ["source-freeze-candidate.json", expected.candidate]]) {
    if (stableCanonicalJson(artifacts[name]) !== stableCanonicalJson(value)) throw new Error(`${name} does not match the deterministic source-freeze contract`);
  }
  const verification = validateVerificationCommandContract(artifacts["verification-command-contract.json"], { root });
  if (verification.fixture_input_digest !== sha256(inputBytes)) throw new Error("verification contract input binding is invalid");
  const evidence = artifacts["evidence-map.json"];
  for (const map of evidence.maps) if (map.agent_visible_paths.some((path) => !visiblePaths.has(path))) throw new Error(`evidence map ${map.evidence_map_id} references non-visible evidence`);
  const requirements = artifacts["requirement-record.json"];
  const evidenceIds = new Set(evidence.maps.map(({ evidence_map_id }) => evidence_map_id));
  for (const requirement of requirements.requirements) if (requirement.evidence_map_ids.some((id) => !evidenceIds.has(id)) || requirement.mutation_ids.length === 0 || requirement.equivalence_class_ids.length === 0) throw new Error(`requirement authority is incomplete at ${requirement.requirement_id}`);
  const config = readJson(resolve(root, "benchmarks/adaptive-portfolio.config.json"), "adaptive portfolio config");
  const runtime = config.fixtures.find(({ id }) => id === FIXTURE_ID);
  if (!runtime) throw new Error("source-freeze candidate is not registered in the adaptive portfolio config");
  const expectedRuntime = { id: FIXTURE_ID, suite: "mechanism_negative", task_class: "documentation", difficulty: "easy", repetitions: 3, aggregate_eligible: true, input_manifest_path: `${FIXTURE_ROOT_RELATIVE}/input-manifest.json`, input_manifest_sha256: sha256(inputBytes).slice(7), verification_command_contract: { path: `${FIXTURE_ROOT_RELATIVE}/verification-command-contract.json`, sha256: sha256(readFileSync(resolve(fixtureRoot, "verification-command-contract.json"))).slice(7) } };
  if (stableCanonicalJson(runtime) !== stableCanonicalJson(expectedRuntime)) throw new Error("adaptive portfolio fixture registration is invalid");
  return { fixtureId: FIXTURE_ID, inputDigest: sha256(inputBytes), candidateDigest: artifacts["source-freeze-candidate.json"].candidate_digest, reviewStatus: "pending_independent_review", scoringReady: false };
}

export async function validateActualPrivateEvaluator({ root = ROOT, privateRoot, boundaryRoots, frozenWorkspace, candidateWorkspace, verificationExecuted = true, investigatedPaths = [] }) {
  const repository = realpathSync(root);
  const privateDirectory = realpathSync(privateRoot);
  if (privateDirectory === repository || privateDirectory.startsWith(`${repository}${sep}`)) throw new Error("private evaluator root must stay outside the repository");
  const production = validateMnDocConfigCorrectionProductionAuthority({ root, privateRoot: privateDirectory, boundaryRoots });
  if (production.scoringReady !== false) throw new Error("private evaluator production authority must remain pre-review and non-scoring");
  const manifest = readJson(resolve(privateDirectory, "private-evaluator-bundle.json"), "private evaluator bundle manifest");
  const hidden = manifest.asset_inventory.find(({ role }) => role === "hidden_tests");
  const module = await import(`${pathToFileURL(resolve(privateDirectory, hidden.path)).href}?digest=${hidden.sha256}`);
  if (typeof module.evaluateCandidate !== "function") throw new Error("private hidden evaluator entry point is missing");
  const options = { frozenWorkspace: realpathSync(frozenWorkspace), candidateWorkspace: realpathSync(candidateWorkspace), verificationExecuted, investigatedPaths };
  const first = await module.evaluateCandidate(options);
  const second = await module.evaluateCandidate(options);
  if (stableCanonicalJson(first) !== stableCanonicalJson(second)) throw new Error("private hidden evaluator is not deterministic");
  assertBenchmarkSchemaInstance(first, { schemaPath: resolve(root, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: "actual private evaluator fragment" });
  const requirements = readJson(resolve(root, FIXTURE_ROOT_RELATIVE, "requirement-record.json"), "public source requirements");
  const expectedIds = requirements.requirements.map(({ requirement_id }) => requirement_id).sort();
  if (stableCanonicalJson(first.requirement_results.map(({ requirement_id }) => requirement_id).sort()) !== stableCanonicalJson(expectedIds) || first.scoring_ready !== false) throw new Error("private evaluator requirement closure is invalid");
  return first;
}

function parseArgs(argv) {
  const args = { root: ROOT, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "write") args.write = true;
    else if (argv[index] === "--root") args.root = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const summary = args.write ? writeMnDocConfigCorrectionArtifacts(args) : validateMnDocConfigCorrectionPublicFixture(args);
  console.log(JSON.stringify({ fixture_id: summary.fixtureId, input_digest: summary.inputDigest, source_freeze_candidate_digest: summary.candidateDigest, review_status: summary.reviewStatus, public_validation: "pass", scoring_ready: summary.scoringReady }));
}
