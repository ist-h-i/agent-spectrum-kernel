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
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { inspectVerifiedPortfolioExecution } from "./ask-benchmark-execution.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const NORMALIZER_VERSION = "1.0.0";
export const NORMALIZED_RESULT_SCHEMA_PATH = "benchmarks/schemas/normalized-portfolio-result.schema.json";
export const NORMALIZED_RUN_SCHEMA_PATH = "benchmarks/schemas/normalized-portfolio-run.schema.json";
export const NORMALIZED_RUN_MANIFEST_NAME = "normalized-run.json";

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
  "autonomous_agent_count",
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
  if (isAbsolute(text) || /^[A-Za-z]:[\\/]/u.test(text) || /^file:\/\//iu.test(text)) throw new Error(`${label} contains an absolute private path and cannot be normalized`);
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
    autonomous_agent_count: known(request.agent.autonomous_agents_started),
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
    subagent_activity: unavailableMissing(),
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
      normalized: countCases(selected, (entry) => TERMINAL_STATUSES.has(entry.state.status)),
      terminal: countCases(selected, (entry) => TERMINAL_STATUSES.has(entry.state.status)),
      pending: countCases(selected, (entry) => entry.state.status === "pending"),
      active: countCases(selected, (entry) => entry.state.status === "active"),
      invalid: countCases(selected, (entry) => entry.state.status === "invalid"),
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

function buildNormalizedArtifacts({ root, inspection }) {
  const files = new Map();
  const records = [];
  const cases = [...inspection.cases].sort((left, right) => {
    const adapterOrder = ADAPTERS.indexOf(left.entry.adapter_track) - ADAPTERS.indexOf(right.entry.adapter_track);
    return adapterOrder || left.entry.case_id.localeCompare(right.entry.case_id);
  });
  const caseRecords = cases.map((inspectedCase) => {
    const refs = [];
    if (TERMINAL_STATUSES.has(inspectedCase.state.status)) {
      const adapterIdentity = inspection.adapter_identities.get(inspectedCase.entry.adapter_track);
      if (!adapterIdentity) throw new Error(`${inspectedCase.entry.adapter_track} runtime identity is missing for normalized terminal evidence`);
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
  const inventory = [...files.entries()].map(([path, bytes]) => ({ path, sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length }));
  const terminalCases = cases.filter((entry) => TERMINAL_STATUSES.has(entry.state.status));
  const missingCaseIds = cases.filter((entry) => ["pending", "active"].includes(entry.state.status)).map((entry) => entry.entry.case_id).sort();
  const invalidCaseIds = cases.filter((entry) => entry.state.status === "invalid").map((entry) => entry.entry.case_id).sort();
  const source = {
    run_instance_id: inspection.identity.run_instance_id,
    run_identity_digest: canonicalDigest(inspection.identity),
    plan_id: inspection.plan.plan_id,
    plan_digest: canonicalDigest(inspection.plan),
    repository_revision: inspection.identity.repository_revision,
    materialization_manifest_digest: inspection.materialization.manifestDigest,
    selection_state_digest: inspection.selections.stateDigest,
  };
  const manifest = {
    schema_version: "1.0.0",
    schema_path: NORMALIZED_RUN_SCHEMA_PATH,
    program: "adaptive_ask_normalized_execution_run",
    artifact_role: "derived_execution_evidence",
    normalizer: { version: NORMALIZER_VERSION, source_revision: inspection.identity.repository_revision },
    source,
    output_root_identity: canonicalDigest({ run_instance_id: source.run_instance_id, plan_id: source.plan_id, normalizer_version: NORMALIZER_VERSION }),
    pool_adapter_results: false,
    completeness: {
      partial: terminalCases.length !== cases.length,
      expected_cases: cases.length,
      normalized_cases: terminalCases.length,
      terminal_cases: terminalCases.length,
      pending_cases: countCases(cases, (entry) => entry.state.status === "pending"),
      active_cases: countCases(cases, (entry) => entry.state.status === "active"),
      invalid_cases: invalidCaseIds.length,
      by_adapter: groupedCoverage(cases, ADAPTERS, "adapter", (entry) => entry.entry.adapter_track),
      by_condition: groupedCoverage(cases, CONDITIONS, "condition", (entry) => entry.entry.condition),
      by_status: STATUSES.map((status) => ({ status, count: countCases(cases, (entry) => entry.state.status === status) })),
      missing_case_ids: missingCaseIds,
      invalid_case_ids: invalidCaseIds,
    },
    telemetry_coverage: telemetryCoverage(records),
    cases: caseRecords,
    inventory,
    publication_digest: canonicalDigest(inventory),
    boundaries: {
      evaluator_result: false,
      score: false,
      product_value_claim: false,
      raw_execution_artifacts_are_authoritative: true,
      measured_execution_authorized: false,
      issue_198_stage_0_authorized: false,
    },
  };
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, NORMALIZED_RUN_SCHEMA_PATH), label: "normalized run manifest" });
  files.set(NORMALIZED_RUN_MANIFEST_NAME, jsonBytes(manifest));
  return { manifest, files };
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

function existingPublication(output, expected) {
  if (!existsSync(output)) return "missing";
  assertNoSymlinkSegments(output, "normalized output root");
  if (!lstatSync(output).isDirectory()) throw new Error("normalized output root must be a directory");
  if (readdirSync(output).length === 0) return "empty";
  if (!existsSync(resolve(output, NORMALIZED_RUN_MANIFEST_NAME))) throw new Error("non-empty unmanaged normalized output root is not owned by this normalizer");
  try {
    assertExactFiles(treeFiles(output), expected, "existing normalized publication");
    return "identical";
  } catch (error) {
    throw new Error(`duplicate normalized publication conflicts with existing content: ${error.message}`);
  }
}

function publishArtifacts({ output, artifacts }) {
  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  const prefix = `.${basename(output)}.normalized-staging-`;
  assertNoAbandonedStaging(parent, prefix);
  const existing = existingPublication(output, artifacts.files);
  if (existing === "identical") return { ...artifacts, idempotent: true };
  const staging = mkdtempSync(resolve(parent, prefix));
  writeFileSync(resolve(staging, ".owner.json"), `${JSON.stringify({ pid: process.pid, token: randomUUID() })}\n`, { flag: "wx" });
  fault("after_normalized_staging_created");
  try {
    writeStaging(staging, artifacts.files);
    fault("after_normalized_staging_complete");
    const staged = treeFiles(staging);
    staged.delete(".owner.json");
    assertExactFiles(staged, artifacts.files, "normalized staging publication");
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
      return { ...artifacts, idempotent: false };
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EISDIR"].includes(error?.code)) throw error;
      const raced = existingPublication(output, artifacts.files);
      if (raced !== "identical") throw error;
      rmSync(staging, { recursive: true, force: true });
      return { ...artifacts, idempotent: true };
    }
  } catch (error) {
    if (process.env.ASK_BENCHMARK_NORMALIZE_FAULT) throw error;
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function inspectAndBuild({ root, config, planPath, materializedPath, selectionState, runDir }) {
  assertCurrentPortfolioRunInput(runDir);
  const inspection = inspectVerifiedPortfolioExecution({ root, config, planPath, materializedPath, selectionState, runDir });
  return buildNormalizedArtifacts({ root, inspection });
}

export function normalizePortfolioExecution({ root, config, planPath, materializedPath, selectionState, runDir, outputPath }) {
  const output = outputBoundary({ outputPath, runDir, materializedPath, selectionState });
  const artifacts = inspectAndBuild({ root, config, planPath, materializedPath, selectionState, runDir });
  return publishArtifacts({ output, artifacts });
}

export function verifyNormalizedPortfolioResults({ root, config, planPath, materializedPath, selectionState, runDir, outputPath }) {
  const output = outputBoundary({ outputPath, runDir, materializedPath, selectionState });
  const artifacts = inspectAndBuild({ root, config, planPath, materializedPath, selectionState, runDir });
  if (!existsSync(output) || !lstatSync(output).isDirectory()) throw new Error("normalized output root is missing or not a directory");
  assertExactFiles(treeFiles(output), artifacts.files, "normalized output verification");
  return artifacts.manifest;
}
