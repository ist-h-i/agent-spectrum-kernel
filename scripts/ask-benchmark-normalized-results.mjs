import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, parse, posix, relative, resolve, sep, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { inspectVerifiedPortfolioExecution } from "./ask-benchmark-execution.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const NORMALIZER_VERSION = "1.0.0";
export const NORMALIZED_RESULT_SCHEMA_PATH = "benchmarks/schemas/normalized-portfolio-result.schema.json";
export const NORMALIZED_RUN_SCHEMA_PATH = "benchmarks/schemas/normalized-portfolio-run.schema.json";
export const NORMALIZED_ROOT_SCHEMA_PATH = "benchmarks/schemas/normalized-portfolio-root.schema.json";
export const NORMALIZED_RUN_MANIFEST_NAME = "normalized-run.json";
export const NORMALIZED_ROOT_MANIFEST_NAME = "normalized-results-root.json";
export const NORMALIZED_GENERATIONS_DIRECTORY = "generations";

const ADAPTERS = ["codex", "claude"];
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const STATUSES = ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"];
const TERMINAL_STATUSES = new Set(["completed", "failed", "unavailable", "interrupted", "invalid"]);
const TELEMETRY_FIELDS = [
  "duration_ms",
  "exit_code",
  "final_output_bytes",
  "stdout_bytes",
  "stdout_digest",
  "stderr_bytes",
  "stderr_digest",
  "json_event_line_count",
  "harness_spawned_secondary_agent_count",
  "runtime_agent_count",
  "failure_kind",
  "capability_downgrade_count",
  "capability_downgrade_digest",
  "runtime_unavailable_reason_code",
  "runtime_unavailable_reason_digest",
  "runtime_unavailable_reason_bytes",
  "thermal_state",
  "model",
  "reasoning_effort",
  "sandbox_policy",
  "permission_policy",
  "input_tokens",
  "output_tokens",
  "cached_tokens",
  "monetary_cost",
  "tool_call_count",
  "file_read_count",
  "human_effort",
  "unsafe_attempted_actions",
  "subagent_activity",
  "evaluator_quality_metrics",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function assertNoSymlinkSegments(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symlink: ${current}`);
  }
}

function isInside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

function assertDisjoint(path, other, label) {
  if (isInside(path, other) || isInside(other, path)) throw new Error(`${label} must not overlap an input evidence root`);
}

export function assertCurrentPortfolioRunInput(runDir) {
  if (!runDir || !existsSync(runDir) || !lstatSync(runDir).isFile()) return;
  assertNoSymlinkSegments(runDir, "execution input");
  let value;
  try {
    value = JSON.parse(readFileSync(runDir, "utf8"));
  } catch {
    throw new Error("execution input must be a current portfolio run directory");
  }
  if (["B", "B2", "C"].includes(value?.checkpoint)) {
    throw new Error(`historical checkpoint ${value.checkpoint} result schema ${value.schema_version ?? "unknown"} is unsupported by normalize-execution; a versioned migration is required`);
  }
  throw new Error("execution input file is not a supported current portfolio run directory");
}

function known(value) {
  return { status: "known", value, reason: "committed_runtime_evidence" };
}

function missing(status, reason) {
  return { status, value: null, reason };
}

function unavailableOrUnknown(outcome, reason = "runtime_evidence_unavailable") {
  return outcome === "unavailable" ? missing("unavailable", "runtime_unavailable") : missing("unknown", reason);
}

function typedObserved(value, outcome) {
  return value === null || value === undefined ? unavailableOrUnknown(outcome) : known(value);
}

function portableTelemetryScalar(value, label) {
  const text = String(value);
  if (posix.isAbsolute(text) || win32.isAbsolute(text) || /^file:\/\//iu.test(text)) throw new Error(`${label} contains an absolute private path and cannot be normalized`);
  return text;
}

function runtimeUnavailableEvidence(identity, result) {
  const reason = identity.unavailable_reason;
  if (reason === null) {
    return {
      code: missing("not_applicable", "runtime_was_available"),
      digest: missing("not_applicable", "runtime_was_available"),
      bytes: missing("not_applicable", "runtime_was_available"),
    };
  }
  const bytes = Buffer.from(reason);
  return {
    code: known(portableTelemetryScalar(result.failure_kind ?? "runtime_unavailable", "runtime unavailable reason code")),
    digest: known(`sha256:${sha256(bytes)}`),
    bytes: known(bytes.length),
  };
}

function telemetryFor(attempt, adapterIdentity) {
  const { request, result } = attempt;
  const outcome = result.status;
  const downgrades = request.projection.capability_downgrades;
  const unavailable = runtimeUnavailableEvidence(adapterIdentity, result);
  const unavailableMissing = () => unavailableOrUnknown(outcome);
  return {
    duration_ms: typedObserved(result.duration_ms, outcome),
    exit_code: typedObserved(result.exit_code, outcome),
    final_output_bytes: result.final_output ? known(result.final_output.bytes) : missing("not_applicable", "terminal_outcome_has_no_final_output"),
    stdout_bytes: known(result.stdout.bytes),
    stdout_digest: known(`sha256:${result.stdout.sha256}`),
    stderr_bytes: known(result.stderr.bytes),
    stderr_digest: known(`sha256:${result.stderr.sha256}`),
    json_event_line_count: known(result.event_counts.json_lines),
    harness_spawned_secondary_agent_count: known(request.agent.autonomous_agents_started),
    runtime_agent_count: unavailableOrUnknown(outcome, "runtime_agent_count_not_observed"),
    failure_kind: result.failure_kind === null ? missing("not_applicable", "completed_outcome_has_no_failure") : known(portableTelemetryScalar(result.failure_kind, "failure kind")),
    capability_downgrade_count: known(downgrades.length),
    capability_downgrade_digest: known(canonicalDigest(downgrades)),
    runtime_unavailable_reason_code: unavailable.code,
    runtime_unavailable_reason_digest: unavailable.digest,
    runtime_unavailable_reason_bytes: unavailable.bytes,
    thermal_state: known(portableTelemetryScalar(adapterIdentity.thermal_state, "thermal state")),
    model: known(portableTelemetryScalar(adapterIdentity.model, "model")),
    reasoning_effort: known(portableTelemetryScalar(adapterIdentity.reasoning_effort, "reasoning effort")),
    sandbox_policy: known(portableTelemetryScalar(adapterIdentity.sandbox_policy, "sandbox policy")),
    permission_policy: known(portableTelemetryScalar(adapterIdentity.permission_policy, "permission policy")),
    input_tokens: unavailableMissing(),
    output_tokens: unavailableMissing(),
    cached_tokens: unavailableMissing(),
    monetary_cost: unavailableMissing(),
    tool_call_count: unavailableMissing(),
    file_read_count: unavailableMissing(),
    human_effort: missing("unknown", "human_measurement_not_collected"),
    unsafe_attempted_actions: unavailableMissing(),
    subagent_activity: unavailableOrUnknown(outcome, "runtime_subagent_activity_not_observed"),
    evaluator_quality_metrics: missing("not_applicable", "normalized_result_is_pre_evaluation"),
  };
}

function normalizedResultBase({ inspection, inspectedCase, attempt, adapterIdentity }) {
  const { entry } = inspectedCase;
  const telemetry = telemetryFor(attempt, adapterIdentity);
  return {
    schema_version: "1.0.0",
    schema_path: NORMALIZED_RESULT_SCHEMA_PATH,
    program: "adaptive_ask_normalized_execution_result",
    lineage: {
      run_instance_id: inspection.identity.run_instance_id,
      plan_id: inspection.plan.plan_id,
      plan_digest: canonicalDigest(inspection.plan),
      repository_revision: inspection.identity.repository_revision,
      materialization_manifest_digest: inspection.materialization.manifestDigest,
      fixture_id: entry.fixture_id,
      fixture_input_digest: `sha256:${entry.input_manifest_sha256}`,
      suite: entry.suite,
      task_class: portableTelemetryScalar(entry.task_class, "task class"),
      difficulty: portableTelemetryScalar(entry.difficulty, "difficulty"),
      registered_repetitions: entry.registered_repetitions,
      aggregate_eligible: entry.aggregate_eligible,
      case_id: entry.case_id,
      attempt: attempt.attempt,
      adapter_track: entry.adapter_track,
      condition: entry.condition,
      repetition: entry.repetition,
      condition_order_position: entry.condition_order_position,
      block_id: entry.block_id,
      runtime_identity_digest: canonicalDigest(adapterIdentity),
      effective_command_digest: canonicalDigest(adapterIdentity.effective_command),
      environment_snapshot_digest: canonicalDigest(adapterIdentity.environment_snapshot.entries),
      request_digest: attempt.evidence.request_digest,
      raw_result_digest: attempt.evidence.result_digest,
      terminal_commit_digest: attempt.evidence.commit_digest,
      final_output_digest: attempt.evidence.final_output_digest,
      final_output_bytes: attempt.evidence.final_output_bytes,
      adaptive_selection_digest: attempt.request.selection ? `sha256:${attempt.request.selection.digest}` : null,
    },
    outcome: attempt.result.status,
    telemetry,
    privacy: {
      raw_stdout_stored: false,
      raw_stderr_stored: false,
      final_output_content_stored: false,
      prompt_stored: false,
      transcript_stored: false,
      environment_values_stored: false,
      absolute_private_paths_stored: false,
    },
  };
}

function buildNormalizedResult(args) {
  const base = normalizedResultBase(args);
  const normalizedResultDigest = canonicalDigest(base);
  const normalizedResultId = `normalized-${canonicalDigest({
    run_instance_id: base.lineage.run_instance_id,
    case_id: base.lineage.case_id,
    attempt: base.lineage.attempt,
    normalized_result_digest: normalizedResultDigest,
  }).slice("sha256:".length, "sha256:".length + 32)}`;
  return {
    ...base,
    normalized_result_id: normalizedResultId,
    normalized_result_digest: normalizedResultDigest,
  };
}

function assertNormalizedResult(root, record) {
  const { normalized_result_id: id, normalized_result_digest: digest, ...base } = record;
  const expectedDigest = canonicalDigest(base);
  const expectedId = `normalized-${canonicalDigest({
    run_instance_id: base.lineage.run_instance_id,
    case_id: base.lineage.case_id,
    attempt: base.lineage.attempt,
    normalized_result_digest: expectedDigest,
  }).slice("sha256:".length, "sha256:".length + 32)}`;
  if (digest !== expectedDigest || id !== expectedId) throw new Error(`${base.lineage.case_id}/${base.lineage.attempt} normalized result identity is invalid`);
  assertBenchmarkSchemaInstance(record, { schemaPath: resolve(root, NORMALIZED_RESULT_SCHEMA_PATH), label: `${base.lineage.case_id}/${base.lineage.attempt} normalized result` });
}

function countCases(cases, predicate) {
  return cases.filter(predicate).length;
}

function groupedCoverage(cases, values, keyName, selector) {
  return values.map((value) => {
    const selected = cases.filter((entry) => selector(entry) === value);
    return {
      [keyName]: value,
      expected: selected.length,
      normalized: countCases(selected, (entry) => entry.normalized_attempts.length > 0),
      terminal: countCases(selected, (entry) => TERMINAL_STATUSES.has(entry.status)),
      pending: countCases(selected, (entry) => entry.status === "pending"),
      active: countCases(selected, (entry) => entry.status === "active"),
      invalid: countCases(selected, (entry) => entry.status === "invalid"),
    };
  });
}

function telemetryCoverage(records) {
  return TELEMETRY_FIELDS.map((field) => {
    const statuses = records.map((record) => record.telemetry[field].status);
    return {
      field,
      known: statuses.filter((status) => status === "known").length,
      unknown: statuses.filter((status) => status === "unknown").length,
      unavailable: statuses.filter((status) => status === "unavailable").length,
      not_applicable: statuses.filter((status) => status === "not_applicable").length,
      total: statuses.length,
    };
  });
}

function completenessForCases(cases) {
  const terminalCases = cases.filter((entry) => TERMINAL_STATUSES.has(entry.status));
  const missingCaseIds = cases.filter((entry) => ["pending", "active"].includes(entry.status)).map((entry) => entry.case_id).sort();
  const invalidCaseIds = cases.filter((entry) => entry.status === "invalid").map((entry) => entry.case_id).sort();
  return {
    partial: terminalCases.length !== cases.length,
    expected_cases: cases.length,
    normalized_cases: countCases(cases, (entry) => entry.normalized_attempts.length > 0),
    terminal_cases: terminalCases.length,
    pending_cases: countCases(cases, (entry) => entry.status === "pending"),
    active_cases: countCases(cases, (entry) => entry.status === "active"),
    invalid_cases: invalidCaseIds.length,
    by_adapter: groupedCoverage(cases, ADAPTERS, "adapter", (entry) => entry.adapter_track),
    by_condition: groupedCoverage(cases, CONDITIONS, "condition", (entry) => entry.condition),
    by_status: STATUSES.map((status) => ({ status, count: countCases(cases, (entry) => entry.status === status) })),
    missing_case_ids: missingCaseIds,
    invalid_case_ids: invalidCaseIds,
  };
}

function sourceSnapshotFor(inspection, cases) {
  return {
    adapter_identities: [...inspection.adapter_identities.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([adapter, identity]) => ({ adapter, runtime_identity_digest: canonicalDigest(identity) })),
    cases: cases.map((inspectedCase) => ({
      case_id: inspectedCase.entry.case_id,
      status: inspectedCase.state.status,
      attempt_count: inspectedCase.state.attempt_count,
      terminal_attempt: inspectedCase.state.terminal_attempt,
      state_digest: canonicalDigest(inspectedCase.state),
      committed_attempts: inspectedCase.attempts.map((attempt) => ({
        attempt: attempt.attempt,
        request_digest: attempt.evidence.request_digest,
        raw_result_digest: attempt.evidence.result_digest,
        terminal_commit_digest: attempt.evidence.commit_digest,
        final_output_digest: attempt.evidence.final_output_digest,
        final_output_bytes: attempt.evidence.final_output_bytes,
      })),
    })),
  };
}

function normalizedRunDigest(manifest) {
  const { normalized_run_digest: _digest, ...withoutDigest } = manifest;
  return canonicalDigest(withoutDigest);
}

function buildRootManifest({ root, source }) {
  const base = {
    schema_version: "1.0.0",
    schema_path: NORMALIZED_ROOT_SCHEMA_PATH,
    program: "adaptive_ask_normalized_execution_collection",
    artifact_role: "immutable_snapshot_collection",
    normalizer: { version: NORMALIZER_VERSION, source_revision: source.repository_revision },
    source: {
      run_instance_id: source.run_instance_id,
      run_identity_digest: source.run_identity_digest,
      plan_id: source.plan_id,
      plan_digest: source.plan_digest,
      repository_revision: source.repository_revision,
    },
    generations_directory: NORMALIZED_GENERATIONS_DIRECTORY,
  };
  const manifest = { ...base, output_collection_identity: canonicalDigest(base) };
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, NORMALIZED_ROOT_SCHEMA_PATH), label: "normalized result collection manifest" });
  return manifest;
}

function generationName(sourceSnapshotDigest) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(sourceSnapshotDigest ?? "")) throw new Error("source snapshot digest is invalid");
  return `snapshot-${sourceSnapshotDigest.slice("sha256:".length)}`;
}

function buildNormalizedArtifacts({ root, inspection }) {
  const files = new Map();
  const records = [];
  const cases = [...inspection.cases].sort((left, right) => {
    const adapterOrder = ADAPTERS.indexOf(left.entry.adapter_track) - ADAPTERS.indexOf(right.entry.adapter_track);
    return adapterOrder || left.entry.case_id.localeCompare(right.entry.case_id);
  });
  const caseRecords = cases.map((inspectedCase) => {
    const refs = [];
    if (inspectedCase.attempts.length > 0) {
      const adapterIdentity = inspection.adapter_identities.get(inspectedCase.entry.adapter_track);
      if (!adapterIdentity) throw new Error(`${inspectedCase.entry.adapter_track} runtime identity is missing for committed normalized evidence`);
      for (const attempt of inspectedCase.attempts) {
        const record = buildNormalizedResult({ inspection, inspectedCase, attempt, adapterIdentity });
        assertNormalizedResult(root, record);
        const path = `adapters/${inspectedCase.entry.adapter_track}/cases/${inspectedCase.entry.case_id}/attempts/${attempt.attempt}.json`;
        const bytes = jsonBytes(record);
        files.set(path, bytes);
        records.push(record);
        refs.push({
          attempt: attempt.attempt,
          normalized_result_id: record.normalized_result_id,
          normalized_result_digest: record.normalized_result_digest,
          path,
        });
      }
    }
    return {
      case_id: inspectedCase.entry.case_id,
      adapter_track: inspectedCase.entry.adapter_track,
      condition: inspectedCase.entry.condition,
      fixture_id: inspectedCase.entry.fixture_id,
      repetition: inspectedCase.entry.repetition,
      condition_order_position: inspectedCase.entry.condition_order_position,
      block_id: inspectedCase.entry.block_id,
      status: inspectedCase.state.status,
      attempt_count: inspectedCase.state.attempt_count,
      terminal_attempt: inspectedCase.state.terminal_attempt,
      normalized_attempts: refs,
    };
  });
  const inventory = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) => ({ path, sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length }));
  const source = {
    run_instance_id: inspection.identity.run_instance_id,
    run_identity_digest: canonicalDigest(inspection.identity),
    plan_id: inspection.plan.plan_id,
    plan_digest: canonicalDigest(inspection.plan),
    repository_revision: inspection.identity.repository_revision,
    materialization_manifest_digest: inspection.materialization.manifestDigest,
    selection_state_digest: inspection.selections.stateDigest,
  };
  const sourceSnapshot = sourceSnapshotFor(inspection, cases);
  const sourceSnapshotDigest = canonicalDigest(sourceSnapshot);
  const manifestWithoutDigest = {
    schema_version: "1.0.0",
    schema_path: NORMALIZED_RUN_SCHEMA_PATH,
    program: "adaptive_ask_normalized_execution_run",
    artifact_role: "derived_execution_evidence",
    normalizer: { version: NORMALIZER_VERSION, source_revision: inspection.identity.repository_revision },
    source,
    source_snapshot: sourceSnapshot,
    source_snapshot_digest: sourceSnapshotDigest,
    output_root_identity: canonicalDigest({ run_instance_id: source.run_instance_id, plan_id: source.plan_id, normalizer_version: NORMALIZER_VERSION, source_snapshot_digest: sourceSnapshotDigest }),
    pool_adapter_results: false,
    completeness: completenessForCases(caseRecords),
    telemetry_coverage: telemetryCoverage(records),
    cases: caseRecords,
    inventory,
    publication_digest: canonicalDigest({ source_snapshot_digest: sourceSnapshotDigest, inventory }),
    boundaries: {
      evaluator_result: false,
      score: false,
      product_value_claim: false,
      raw_execution_artifacts_are_authoritative: true,
      measured_execution_authorized: false,
      issue_198_stage_0_authorized: false,
    },
  };
  const manifest = { ...manifestWithoutDigest, normalized_run_digest: canonicalDigest(manifestWithoutDigest) };
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, NORMALIZED_RUN_SCHEMA_PATH), label: "normalized run manifest" });
  files.set(NORMALIZED_RUN_MANIFEST_NAME, jsonBytes(manifest));
  return {
    manifest,
    rootManifest: buildRootManifest({ root, source }),
    files,
    sourceSnapshotDigest,
    generationName: generationName(sourceSnapshotDigest),
  };
}

function treeFiles(root) {
  const files = new Map();
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`normalized output contains a symlink: ${path}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.set(path, readFileSync(absolute));
      else throw new Error(`normalized output contains an unsupported filesystem entry: ${path}`);
    }
  }
  walk(root);
  return files;
}

function assertExactFiles(actual, expected, label) {
  const actualPaths = [...actual.keys()].sort();
  const expectedPaths = [...expected.keys()].sort();
  if (stableCanonicalJson(actualPaths) !== stableCanonicalJson(expectedPaths)) throw new Error(`${label} inventory mismatch`);
  for (const path of expectedPaths) {
    if (!actual.get(path).equals(expected.get(path))) throw new Error(`${label} differs at ${path}`);
  }
}

function outputBoundary({ outputPath, runDir, materializedPath, selectionState }) {
  if (!outputPath) throw new Error("normalize-execution requires --output");
  const output = resolve(outputPath);
  for (const [path, label] of [[runDir, "run root"], [materializedPath, "materialized root"], [selectionState, "selection state"]]) {
    if (path) assertDisjoint(output, path, `normalized output and ${label}`);
  }
  assertNoSymlinkSegments(dirname(output), "normalized output parent");
  if (existsSync(output) && lstatSync(output).isSymbolicLink()) throw new Error("normalized output root must not be a symlink");
  return output;
}

function processIsLive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function assertNoAbandonedStaging(parent, prefix) {
  if (!existsSync(parent)) return;
  for (const name of readdirSync(parent).filter((entry) => entry.startsWith(prefix)).sort()) {
    const directory = resolve(parent, name);
    assertNoSymlinkSegments(directory, "normalized publication staging");
    const ownerPath = resolve(directory, ".owner.json");
    let owner = null;
    try {
      owner = JSON.parse(readFileSync(ownerPath, "utf8"));
    } catch {
      throw new Error(`interrupted normalized publication staging requires explicit inspection: ${name}`);
    }
    if (!processIsLive(owner.pid)) throw new Error(`interrupted normalized publication staging requires explicit inspection: ${name}`);
  }
}

function fault(name) {
  if (process.env.ASK_BENCHMARK_NORMALIZE_FAULT === name) process.exit(86);
}

function writeStaging(staging, files) {
  for (const [path, bytes] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const destination = resolve(staging, path);
    if (!isInside(staging, destination)) throw new Error(`normalized output path escapes staging: ${path}`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: "wx" });
  }
}

function existingGeneration(output, expected) {
  if (!existsSync(output)) return "missing";
  assertNoSymlinkSegments(output, "normalized generation root");
  if (!lstatSync(output).isDirectory()) throw new Error("normalized generation root must be a directory");
  if (readdirSync(output).length === 0) return "empty";
  if (!existsSync(resolve(output, NORMALIZED_RUN_MANIFEST_NAME))) throw new Error("non-empty unmanaged normalized generation is not owned by this normalizer");
  try {
    assertExactFiles(treeFiles(output), expected, "existing normalized generation");
    return "identical";
  } catch (error) {
    throw new Error(`duplicate normalized generation conflicts with existing content: ${error.message}`);
  }
}

function publishDirectory({ output, files }) {
  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  const prefix = `.${basename(output)}.normalized-staging-`;
  assertNoAbandonedStaging(parent, prefix);
  const existing = existingGeneration(output, files);
  if (existing === "identical") return true;
  const staging = mkdtempSync(resolve(parent, prefix));
  writeFileSync(resolve(staging, ".owner.json"), `${JSON.stringify({ pid: process.pid, token: randomUUID() })}\n`, { flag: "wx" });
  fault("after_normalized_staging_created");
  try {
    writeStaging(staging, files);
    fault("after_normalized_staging_complete");
    const staged = treeFiles(staging);
    staged.delete(".owner.json");
    assertExactFiles(staged, files, "normalized staging publication");
    rmSync(resolve(staging, ".owner.json"));
    if (existing === "empty" && existsSync(output) && readdirSync(output).length === 0) {
      try {
        rmdirSync(output);
      } catch (error) {
        if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) throw error;
      }
    }
    try {
      renameSync(staging, output);
      return false;
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EISDIR"].includes(error?.code)) throw error;
      const raced = existingGeneration(output, files);
      if (raced !== "identical") throw error;
      rmSync(staging, { recursive: true, force: true });
      return true;
    }
  } catch (error) {
    if (process.env.ASK_BENCHMARK_NORMALIZE_FAULT) throw error;
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function assertManagedCollection({ root, output, expectedRootManifest = null }) {
  assertNoSymlinkSegments(output, "normalized output root");
  if (!existsSync(output) || !lstatSync(output).isDirectory()) throw new Error("normalized output root is missing or not a directory");
  const expectedRootInventory = [NORMALIZED_GENERATIONS_DIRECTORY, NORMALIZED_ROOT_MANIFEST_NAME].sort();
  const actualRootInventory = readdirSync(output).sort();
  if (stableCanonicalJson(actualRootInventory) !== stableCanonicalJson(expectedRootInventory)) {
    if (!actualRootInventory.includes(NORMALIZED_ROOT_MANIFEST_NAME)) throw new Error("non-empty unmanaged normalized output root is not owned by this normalizer");
    throw new Error("normalized output root inventory mismatch");
  }
  const generations = resolve(output, NORMALIZED_GENERATIONS_DIRECTORY);
  assertNoSymlinkSegments(generations, "normalized generations root");
  if (!lstatSync(generations).isDirectory() || lstatSync(generations).isSymbolicLink()) throw new Error("normalized generations root must be a real directory");
  for (const name of readdirSync(generations).sort()) {
    if (!/^snapshot-[a-f0-9]{64}$/u.test(name)) throw new Error(`normalized generations root contains an unmanaged entry: ${name}`);
    const generation = resolve(generations, name);
    assertNoSymlinkSegments(generation, `normalized generation ${name}`);
    if (!lstatSync(generation).isDirectory() || lstatSync(generation).isSymbolicLink()) throw new Error(`normalized generation ${name} must be a real directory`);
  }
  const manifestPath = resolve(output, NORMALIZED_ROOT_MANIFEST_NAME);
  assertNoSymlinkSegments(manifestPath, "normalized result collection manifest");
  if (!existsSync(manifestPath) || !lstatSync(manifestPath).isFile() || lstatSync(manifestPath).isSymbolicLink()) throw new Error("normalized result collection manifest must be a real file");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error("normalized result collection manifest is invalid JSON");
  }
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, NORMALIZED_ROOT_SCHEMA_PATH), label: "normalized result collection manifest" });
  const { output_collection_identity: identity, ...base } = manifest;
  if (identity !== canonicalDigest(base)) throw new Error("normalized result collection identity is invalid");
  if (expectedRootManifest && stableCanonicalJson(manifest) !== stableCanonicalJson(expectedRootManifest)) throw new Error("normalized output collection conflicts with the source run identity");
  return manifest;
}

function existingCollection({ root, output, expectedRootManifest }) {
  if (!existsSync(output)) return "missing";
  if (lstatSync(output).isSymbolicLink()) throw new Error("normalized output root must not be a symlink");
  if (!lstatSync(output).isDirectory()) throw new Error("normalized output root must be a directory");
  if (readdirSync(output).length === 0) return "empty";
  assertManagedCollection({ root, output, expectedRootManifest });
  return "managed";
}

function generationPath(output, sourceSnapshotDigest) {
  return resolve(output, NORMALIZED_GENERATIONS_DIRECTORY, generationName(sourceSnapshotDigest));
}

function initialCollectionFiles(artifacts) {
  const files = new Map([[NORMALIZED_ROOT_MANIFEST_NAME, jsonBytes(artifacts.rootManifest)]]);
  for (const [path, bytes] of artifacts.files) files.set(`${NORMALIZED_GENERATIONS_DIRECTORY}/${artifacts.generationName}/${path}`, bytes);
  return files;
}

function publishGeneration({ root, output, artifacts }) {
  assertManagedCollection({ root, output, expectedRootManifest: artifacts.rootManifest });
  const target = generationPath(output, artifacts.sourceSnapshotDigest);
  const idempotent = publishDirectory({ output: target, files: artifacts.files });
  return { ...artifacts, idempotent, generationPath: target };
}

function publishArtifacts({ root, output, artifacts }) {
  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  const prefix = `.${basename(output)}.normalized-staging-`;
  assertNoAbandonedStaging(parent, prefix);
  const existing = existingCollection({ root, output, expectedRootManifest: artifacts.rootManifest });
  if (existing === "managed") return publishGeneration({ root, output, artifacts });

  const staging = mkdtempSync(resolve(parent, prefix));
  writeFileSync(resolve(staging, ".owner.json"), `${JSON.stringify({ pid: process.pid, token: randomUUID() })}\n`, { flag: "wx" });
  fault("after_normalized_staging_created");
  try {
    const files = initialCollectionFiles(artifacts);
    writeStaging(staging, files);
    fault("after_normalized_staging_complete");
    const staged = treeFiles(staging);
    staged.delete(".owner.json");
    assertExactFiles(staged, files, "normalized collection staging publication");
    rmSync(resolve(staging, ".owner.json"));
    if (existing === "empty" && existsSync(output) && readdirSync(output).length === 0) {
      try {
        rmdirSync(output);
      } catch (error) {
        if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) throw error;
      }
    }
    try {
      renameSync(staging, output);
      return { ...artifacts, idempotent: false, generationPath: generationPath(output, artifacts.sourceSnapshotDigest) };
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EISDIR"].includes(error?.code)) throw error;
      assertManagedCollection({ root, output, expectedRootManifest: artifacts.rootManifest });
      rmSync(staging, { recursive: true, force: true });
      return publishGeneration({ root, output, artifacts });
    }
  } catch (error) {
    if (process.env.ASK_BENCHMARK_NORMALIZE_FAULT) throw error;
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function assertNormalizedManifestIdentity(manifest) {
  if (manifest.source_snapshot_digest !== canonicalDigest(manifest.source_snapshot)) throw new Error("normalized source snapshot digest is invalid");
  const expectedOutputIdentity = canonicalDigest({
    run_instance_id: manifest.source.run_instance_id,
    plan_id: manifest.source.plan_id,
    normalizer_version: manifest.normalizer.version,
    source_snapshot_digest: manifest.source_snapshot_digest,
  });
  if (manifest.output_root_identity !== expectedOutputIdentity) throw new Error("normalized output root identity is invalid");
  if (manifest.publication_digest !== canonicalDigest({ source_snapshot_digest: manifest.source_snapshot_digest, inventory: manifest.inventory })) throw new Error("normalized publication digest is invalid");
  if (manifest.normalized_run_digest !== normalizedRunDigest(manifest)) throw new Error("normalized run digest is invalid");
}

function assertSelfContainedGeneration({ root, collection, generation, requestedSnapshotDigest }) {
  const files = treeFiles(generation);
  const manifestBytes = files.get(NORMALIZED_RUN_MANIFEST_NAME);
  if (!manifestBytes) throw new Error("normalized generation manifest is missing");
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("normalized generation manifest is invalid JSON");
  }
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, NORMALIZED_RUN_SCHEMA_PATH), label: "normalized run manifest" });
  if (manifest.source_snapshot_digest !== requestedSnapshotDigest) throw new Error("normalized generation does not match the requested source snapshot digest");
  assertNormalizedManifestIdentity(manifest);
  if (collection.normalizer.version !== manifest.normalizer.version || collection.normalizer.source_revision !== manifest.normalizer.source_revision || collection.source.run_instance_id !== manifest.source.run_instance_id || collection.source.run_identity_digest !== manifest.source.run_identity_digest || collection.source.plan_id !== manifest.source.plan_id || collection.source.plan_digest !== manifest.source.plan_digest || collection.source.repository_revision !== manifest.source.repository_revision) throw new Error("normalized generation source does not match its collection");

  const expectedPaths = [NORMALIZED_RUN_MANIFEST_NAME, ...manifest.inventory.map((entry) => entry.path)].sort();
  if (stableCanonicalJson([...files.keys()].sort()) !== stableCanonicalJson(expectedPaths)) throw new Error("normalized generation inventory mismatch");
  const records = [];
  const recordsByPath = new Map();
  for (const item of manifest.inventory) {
    const bytes = files.get(item.path);
    if (!bytes || item.sha256 !== `sha256:${sha256(bytes)}` || item.bytes !== bytes.length) throw new Error(`normalized generation inventory evidence mismatch at ${item.path}`);
    let record;
    try {
      record = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error(`normalized result is invalid JSON at ${item.path}`);
    }
    assertNormalizedResult(root, record);
    records.push(record);
    recordsByPath.set(item.path, record);
  }

  const expectedCaseOrder = [...manifest.cases].sort((left, right) => {
    const adapterOrder = ADAPTERS.indexOf(left.adapter_track) - ADAPTERS.indexOf(right.adapter_track);
    return adapterOrder || left.case_id.localeCompare(right.case_id);
  });
  if (stableCanonicalJson(manifest.cases) !== stableCanonicalJson(expectedCaseOrder)) throw new Error("normalized manifest case order is invalid");
  if (stableCanonicalJson(manifest.completeness) !== stableCanonicalJson(completenessForCases(manifest.cases))) throw new Error("normalized completeness is invalid");
  if (stableCanonicalJson(manifest.telemetry_coverage) !== stableCanonicalJson(telemetryCoverage(records))) throw new Error("normalized telemetry coverage is invalid");

  const snapshotCases = new Map(manifest.source_snapshot.cases.map((entry) => [entry.case_id, entry]));
  if (snapshotCases.size !== manifest.cases.length) throw new Error("normalized source snapshot case inventory is invalid");
  const adapterIdentities = new Map(manifest.source_snapshot.adapter_identities.map((entry) => [entry.adapter, entry.runtime_identity_digest]));
  if (adapterIdentities.size !== manifest.source_snapshot.adapter_identities.length) throw new Error("normalized source snapshot adapter inventory is invalid");
  if (stableCanonicalJson(manifest.source_snapshot.cases.map((entry) => entry.case_id)) !== stableCanonicalJson(manifest.cases.map((entry) => entry.case_id))) throw new Error("normalized source snapshot case order is invalid");
  const expectedAdapterOrder = [...manifest.source_snapshot.adapter_identities].sort((left, right) => left.adapter.localeCompare(right.adapter));
  if (stableCanonicalJson(manifest.source_snapshot.adapter_identities) !== stableCanonicalJson(expectedAdapterOrder)) throw new Error("normalized source snapshot adapter order is invalid");
  const referencedPaths = [];
  for (const caseRecord of manifest.cases) {
    const snapshotCase = snapshotCases.get(caseRecord.case_id);
    if (!snapshotCase || snapshotCase.status !== caseRecord.status || snapshotCase.attempt_count !== caseRecord.attempt_count || snapshotCase.terminal_attempt !== caseRecord.terminal_attempt) throw new Error(`${caseRecord.case_id} source snapshot state is inconsistent`);
    if (snapshotCase.committed_attempts.length !== caseRecord.normalized_attempts.length) throw new Error(`${caseRecord.case_id} committed attempt inventory is inconsistent`);
    for (let index = 0; index < caseRecord.normalized_attempts.length; index += 1) {
      const reference = caseRecord.normalized_attempts[index];
      const snapshotAttempt = snapshotCase.committed_attempts[index];
      const record = recordsByPath.get(reference.path);
      if (!record || reference.attempt !== snapshotAttempt.attempt || reference.normalized_result_id !== record.normalized_result_id || reference.normalized_result_digest !== record.normalized_result_digest) throw new Error(`${caseRecord.case_id}/${reference.attempt} normalized attempt reference is invalid`);
      if (record.lineage.run_instance_id !== manifest.source.run_instance_id || record.lineage.plan_id !== manifest.source.plan_id || record.lineage.plan_digest !== manifest.source.plan_digest || record.lineage.repository_revision !== manifest.source.repository_revision || record.lineage.materialization_manifest_digest !== manifest.source.materialization_manifest_digest || record.lineage.case_id !== caseRecord.case_id || record.lineage.attempt !== reference.attempt || record.lineage.adapter_track !== caseRecord.adapter_track || record.lineage.condition !== caseRecord.condition || record.lineage.fixture_id !== caseRecord.fixture_id || record.lineage.repetition !== caseRecord.repetition || record.lineage.condition_order_position !== caseRecord.condition_order_position || record.lineage.block_id !== caseRecord.block_id) throw new Error(`${caseRecord.case_id}/${reference.attempt} normalized lineage is inconsistent`);
      if (record.lineage.runtime_identity_digest !== adapterIdentities.get(caseRecord.adapter_track)) throw new Error(`${caseRecord.case_id}/${reference.attempt} runtime identity is inconsistent`);
      if (record.lineage.request_digest !== snapshotAttempt.request_digest || record.lineage.raw_result_digest !== snapshotAttempt.raw_result_digest || record.lineage.terminal_commit_digest !== snapshotAttempt.terminal_commit_digest || record.lineage.final_output_digest !== snapshotAttempt.final_output_digest || record.lineage.final_output_bytes !== snapshotAttempt.final_output_bytes) throw new Error(`${caseRecord.case_id}/${reference.attempt} source attempt evidence is inconsistent`);
      referencedPaths.push(reference.path);
    }
  }
  if (stableCanonicalJson(referencedPaths.sort()) !== stableCanonicalJson(manifest.inventory.map((entry) => entry.path).sort())) throw new Error("normalized attempt references do not close over the generation inventory");
  return manifest;
}

function verifyGeneration({ root, output, sourceSnapshotDigest, expectedRootManifest = null, expectedFiles = null }) {
  const collection = assertManagedCollection({ root, output, expectedRootManifest });
  const generation = generationPath(output, sourceSnapshotDigest);
  if (!existsSync(generation) || !lstatSync(generation).isDirectory()) throw new Error(`normalized snapshot generation is missing: ${sourceSnapshotDigest}`);
  const manifest = assertSelfContainedGeneration({ root, collection, generation, requestedSnapshotDigest: sourceSnapshotDigest });
  if (expectedFiles) assertExactFiles(treeFiles(generation), expectedFiles, "normalized current snapshot verification");
  return { manifest, generationPath: generation };
}

function inspectAndBuild({ root, config, planPath, materializedPath, selectionState, runDir }) {
  assertCurrentPortfolioRunInput(runDir);
  const inspection = inspectVerifiedPortfolioExecution({ root, config, planPath, materializedPath, selectionState, runDir });
  return buildNormalizedArtifacts({ root, inspection });
}

export function normalizePortfolioExecution({ root, config, planPath, materializedPath, selectionState, runDir, outputPath }) {
  const output = outputBoundary({ outputPath, runDir, materializedPath, selectionState });
  const artifacts = inspectAndBuild({ root, config, planPath, materializedPath, selectionState, runDir });
  return publishArtifacts({ root, output, artifacts });
}

export function verifyNormalizedPortfolioResults({ root, config = null, planPath = null, materializedPath = null, selectionState = null, runDir = null, outputPath, sourceSnapshotDigest = null }) {
  const output = outputBoundary({ outputPath, runDir, materializedPath, selectionState });
  if (sourceSnapshotDigest) {
    const verified = verifyGeneration({ root, output, sourceSnapshotDigest });
    return { ...verified, freshness: "not_checked" };
  }
  const artifacts = inspectAndBuild({ root, config, planPath, materializedPath, selectionState, runDir });
  const verified = verifyGeneration({ root, output, sourceSnapshotDigest: artifacts.sourceSnapshotDigest, expectedRootManifest: artifacts.rootManifest, expectedFiles: artifacts.files });
  return { ...verified, freshness: "current" };
}
