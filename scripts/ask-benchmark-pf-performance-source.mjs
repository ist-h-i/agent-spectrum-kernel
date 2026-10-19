import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeCommandContractDigest,
  computeVerificationCommandContractDigest,
  logicalCommandDigest,
  renderedEventCommandDigest,
  validateVerificationCommandContract,
} from "./ask-benchmark-command-evidence.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const PF_PERFORMANCE_FIXTURE_ID = "pf-performance-regression";
export const PF_PERFORMANCE_FIXTURE_ROOT = `benchmarks/fixtures/checkpoint-b2/${PF_PERFORMANCE_FIXTURE_ID}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_VISIBLE_PATTERN = /^(?:task\.md|workspace\/.+)$/u;
const PRIVATE_NAME_PATTERN = /(?:^|[._/-])(?:evaluator|hidden|oracle|rubric|private)(?:[._/-]|$)/iu;
const FORBIDDEN_TASK_VOCABULARY = /\b(?:ASK|benchmark|evaluator|routing|scoring|mechanism|hidden tests?|expected findings?|over-processing)\b/iu;
const PLACEHOLDER_FILES = [
  "admission-review.json",
  "evaluator-authority-manifest.json",
  "evaluator-reference.json",
  "evidence-map.json",
  "final-admission-record.json",
  "metadata.json",
  "output-contract.json",
  "requirement-record.json",
  "scoring-input-freeze-manifest.json",
  "source-freeze-candidate.json",
];

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or not a regular file`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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

export function agentVisibleFiles(fixtureRoot) {
  for (const [path, directory] of [["task.md", false], ["workspace", true]]) {
    const stat = lstatSync(resolve(fixtureRoot, path));
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error(`agent-visible root is not regular: ${path}`);
  }
  const paths = ["task.md", ...walkFiles(resolve(fixtureRoot, "workspace")).map((path) => `workspace/${path}`)];
  return paths.map((path) => {
    if (!AGENT_VISIBLE_PATTERN.test(path) || PRIVATE_NAME_PATTERN.test(path)) throw new Error(`agent-visible path is prohibited: ${path}`);
    const bytes = readFileSync(resolve(fixtureRoot, path));
    return { path, sha256: sha256(bytes).slice(7), bytes: bytes.length };
  });
}

function closeCommand(command) {
  const withLogical = { ...command, logical_command_digest: logicalCommandDigest(command) };
  const withRendered = { ...withLogical, rendered_event_command_digest: renderedEventCommandDigest(withLogical) };
  return { ...withRendered, command_contract_digest: computeCommandContractDigest(withRendered) };
}

export function buildPfPerformanceInputArtifacts(root = ROOT) {
  const fixtureRoot = resolve(root, PF_PERFORMANCE_FIXTURE_ROOT);
  const files = agentVisibleFiles(fixtureRoot);
  const inputManifest = {
    schema_version: 1,
    hash_algorithm: "sha256",
    scope: "agent-visible task.md + workspace/**",
    fixtures: {
      [PF_PERFORMANCE_FIXTURE_ID]: {
        class: "performance_investigation_implementation",
        difficulty: "hard",
        target_minutes: 45,
        files,
      },
    },
  };
  const inputBytes = Buffer.from(`${JSON.stringify(inputManifest, null, 2)}\n`);
  const protectedPaths = files.filter(({path})=>path.startsWith('workspace/')&&path!=='workspace/src/event-lookup.mjs').map(({path})=>path.slice('workspace/'.length));
  const protectedDigests = Object.fromEntries(protectedPaths.map((path) => {
    const entry = files.find((candidate) => candidate.path === `workspace/${path}`);
    if (!entry) throw new Error(`protected verification input is missing: ${path}`);
    return [path, entry.sha256];
  }));
  const anchor = `node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected=${JSON.stringify(protectedDigests)};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}'`;
  const command = closeCommand({
    command_id: "performance-event-lookup-validation",
    purpose: "test",
    working_directory: { path: ".", evidence_requirement: "not_required" },
    safe_argv: null,
    execution_form: "codex_shell_command",
    shell_family: "posix_bash",
    shell_envelope: { executable: "/bin/bash", arguments: ["-lc"] },
    canonical_script: `${anchor} && [ -f test/event-lookup.test.mjs ] && npm test && npm run measure`,
    requirement: "required",
    alternative_group_id: null,
    timeout_ms: null,
  });
  const verificationBase = {
    schema_version: "1.2.0",
    schema_path: "benchmarks/schemas/portfolio-verification-command-contract.schema.json",
    program: "adaptive_ask_verification_command_contract",
    fixture_id: PF_PERFORMANCE_FIXTURE_ID,
    fixture_input_digest: sha256(inputBytes),
    commands: [command],
  };
  const verification = { ...verificationBase, contract_digest: computeVerificationCommandContractDigest(verificationBase) };
  return { inputManifest, inputBytes, verification };
}

export function writePfPerformanceInputArtifacts({ root = ROOT } = {}) {
  const fixtureRoot = resolve(root, PF_PERFORMANCE_FIXTURE_ROOT);
  const { inputManifest, verification } = buildPfPerformanceInputArtifacts(root);
  writeJson(resolve(fixtureRoot, "input-manifest.json"), inputManifest);
  writeJson(resolve(fixtureRoot, "verification-command-contract.json"), verification);
  for (const name of PLACEHOLDER_FILES) {
    const path = resolve(fixtureRoot, name);
    if (!existsSync(path)) writeJson(path, { fixture_id: PF_PERFORMANCE_FIXTURE_ID, candidate_state: "generation_pending" });
  }
  return {
    fixtureId: PF_PERFORMANCE_FIXTURE_ID,
    inputDigest: sha256(readFileSync(resolve(fixtureRoot, "input-manifest.json"))),
    verificationDigest: verification.contract_digest,
  };
}

export function validatePfPerformanceInputClosure({ root = ROOT } = {}) {
  const fixtureRoot = resolve(root, PF_PERFORMANCE_FIXTURE_ROOT);
  const task = readFileSync(resolve(fixtureRoot, "task.md"), "utf8");
  if (FORBIDDEN_TASK_VOCABULARY.test(task)) throw new Error("public task contains benchmark-specific vocabulary");
  const manifest = readJson(resolve(fixtureRoot, "input-manifest.json"), "pf-performance-regression input manifest");
  const record = manifest.fixtures?.[PF_PERFORMANCE_FIXTURE_ID];
  if (manifest.scope !== "agent-visible task.md + workspace/**" || record?.class !== "performance_investigation_implementation" || record?.difficulty !== "hard") throw new Error("pf-performance-regression input manifest fixture record is invalid");
  const expected = agentVisibleFiles(fixtureRoot);
  if (stableCanonicalJson(record.files) !== stableCanonicalJson(expected)) throw new Error("pf-performance-regression input manifest does not exactly bind the agent-visible inventory");
  const verification = validateVerificationCommandContract(readJson(resolve(fixtureRoot, "verification-command-contract.json"), "pf-performance-regression verification contract"), { root });
  if (!verification.commands.every(({ canonical_script }) => task.includes(`\n${canonical_script}\n`))) throw new Error("public task does not expose the verification invocation");
  const inputDigest = sha256(readFileSync(resolve(fixtureRoot, "input-manifest.json")));
  if (verification.fixture_input_digest !== inputDigest) throw new Error("pf-performance-regression verification/input binding is invalid");
  return { fixtureId: PF_PERFORMANCE_FIXTURE_ID, inputDigest, verificationDigest: verification.contract_digest };
}

/** Validate retained measurement data only. Authentication belongs to the existing
 * execution authority; a candidate-written JSON object never supplies it. */
export function inspectPfPerformanceMeasurement(report, { sourceDigest, config } = {}) {
  const unknown = reason => ({ state: "unavailable", reason, quality: null });
  if (report == null) return unknown("measurement_output_unavailable");
  const invalid = reason => ({ state: "invalid", reason, quality: null });
  if (!/^sha256:[a-f0-9]{64}$/u.test(sourceDigest ?? "") || report.candidate_source_digest !== sourceDigest) return invalid("measurement_source_binding_mismatch");
  if (report.measurement_version !== "1.0.0" || report.clock !== "performance.now" || report.fictional_local_workloads !== true || report.measured_external_service !== false) return invalid("measurement_identity_invalid");
  if (!config || !Array.isArray(config.workloads) || config.workloads.length !== 2 || config.workloads.some((workload,index)=>!workload || workload.name !== ["sparse","dense"][index] || !Number.isSafeInteger(workload.events) || workload.events <= 0 || !Number.isSafeInteger(workload.requests) || workload.requests <= 0 || !Number.isSafeInteger(workload.events*workload.requests)) || !Number.isInteger(config.samples) || config.samples < 3 || config.samples % 2 !== 1 || !Number.isFinite(config.minimum_baseline_ms) || config.minimum_baseline_ms <= 0 || !Number.isFinite(config.maximum_dispersion_ratio) || config.maximum_dispersion_ratio < 1 || !Number.isFinite(config.maximum_candidate_median_ratio) || config.maximum_candidate_median_ratio <= 0) return invalid("measurement_config_invalid");
  if (!Array.isArray(report.records) || report.records.length !== config.workloads.length) return invalid("measurement_workload_inventory_invalid");
  const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const equal = (actual, expected) => Number.isFinite(actual) && Math.abs(actual-expected) <= Number.EPSILON * Math.max(1,Math.abs(expected))*8;
  const states = [];
  for (const [index, workload] of config.workloads.entries()) {
    const record = report.records[index];
    if (!record || record.workload !== workload.name || record.event_count !== workload.events || record.request_count !== workload.requests || !Number.isSafeInteger(record.output_count) || record.output_count < 0 || record.output_count > workload.events*workload.requests || !Number.isSafeInteger(record.consumed) || record.consumed !== record.output_count*config.samples*2) return invalid("measurement_workload_counts_invalid");
    const durations = record.durations_ms;
    if (!durations || Object.keys(durations).sort().join(",") !== "candidate,reference" || Object.values(durations).some(series=>!Array.isArray(series)||series.length!==config.samples||series.some(value=>!Number.isFinite(value)||value<0))) return invalid("measurement_samples_invalid");
    const baseline = median(durations.reference), candidate = median(durations.candidate), ratio = candidate/baseline;
    if (!equal(record.reference_median_ms,baseline) || !equal(record.candidate_median_ms,candidate) || (Number.isFinite(ratio) ? !equal(record.candidate_to_reference_ratio,ratio) : record.candidate_to_reference_ratio !== null)) return invalid("measurement_summary_mismatch");
    const dispersion = series=>Math.max(...series)/Math.max(Math.min(...series),Number.EPSILON);
    const bounded = Number.isFinite(ratio)&&baseline>=config.minimum_baseline_ms&&Object.values(durations).every(series=>dispersion(series)<=config.maximum_dispersion_ratio);
    const state = !bounded ? "inconclusive" : ratio<=config.maximum_candidate_median_ratio ? "within_local_target" : "local_regression";
    if (record.state !== state) return invalid("measurement_claim_mismatch");
    states.push(state);
  }
  return { state: states.includes("inconclusive") ? "inconclusive" : states.includes("local_regression") ? "local_regression" : "within_local_target", reason: null, quality: null,
    authentication: "not_established_by_data_validation", source_digest: sourceDigest };
}

function parseArgs(argv) {
  const args = { root: ROOT, command: "validate" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "write") args.command = argv[index];
    else if (argv[index] === "--root") args.root = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(args.command === "write" ? writePfPerformanceInputArtifacts(args) : validatePfPerformanceInputClosure(args)));
}
