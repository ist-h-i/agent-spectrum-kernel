#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { computeEngineeringResultDigest, computeEngineeringResultId, validatePortfolioEngineeringResult } from "./ask-benchmark-portfolio-score.mjs";
import {
  assertVerifiedResultInventory,
  collectEngineeringResults,
  computeEngineeringResultSetDigest,
  computeEngineeringResultSetId,
  computeEngineeringResultSourceManifestDigest,
  validatePortfolioEngineeringResultSet,
  verifyEngineeringResultSet,
} from "./ask-benchmark-portfolio-result-set.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(root, ".ask-benchmark-result-set-test-"));
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const ADAPTERS = ["codex", "claude"];
const OUTCOMES = ["completed", "failed", "unavailable", "interrupted", "invalid"];
const TELEMETRY_FIELDS = [
  "duration_ms", "exit_code", "final_output_bytes", "stdout_bytes", "stdout_digest", "stderr_bytes", "stderr_digest",
  "json_event_line_count", "harness_spawned_secondary_agent_count", "runtime_agent_count", "failure_kind",
  "capability_downgrade_count", "capability_downgrade_digest", "runtime_unavailable_reason_code",
  "runtime_unavailable_reason_digest", "runtime_unavailable_reason_bytes", "thermal_state", "model", "reasoning_effort",
  "sandbox_policy", "permission_policy", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost",
  "tool_call_count", "file_read_count", "human_effort", "unsafe_attempted_actions", "subagent_activity",
  "evaluator_quality_metrics",
];
const SOURCE_REVISION = "1".repeat(40);
const RUN_INSTANCE_ID = "00000000-0000-4000-8000-000000000197";
const PLAN_ID = `plan-${hash("synthetic-result-set-plan")}`;
const PLAN_DIGEST = digest("synthetic-result-set-plan-digest");
const covered = new Set();

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value) {
  return `sha256:${hash(value)}`;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, jsonBytes(value));
}

function fileDigest(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(args, { expectedStatus = 0 } = {}) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function projectVerifiedResults(verifiedResults) {
  return verifiedResults.map(({ path, result }) => ({
    path,
    normalized_requirement_score: result.requirement_score.normalized_requirement_score,
    scoring_status: result.scoring_status,
    duration_status: result.overhead_telemetry.duration_ms.status,
  }));
}

function stringValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

function withResultReadTrap(resultRoot, callback) {
  const originalOpenSync = fs.openSync;
  const originalReadFileSync = fs.readFileSync;
  const canonicalRoot = resolve(resultRoot);
  const isResultPath = (candidate) => {
    const absolute = resolve(String(candidate));
    return absolute === canonicalRoot || absolute.startsWith(`${canonicalRoot}${sep}`);
  };
  fs.openSync = function (candidate, ...args) {
    if (isResultPath(candidate)) throw new Error("consumer attempted to reopen a verified result file");
    return originalOpenSync.call(fs, candidate, ...args);
  };
  fs.readFileSync = function (candidate, ...args) {
    if (isResultPath(candidate)) throw new Error("consumer attempted to reread a verified result file");
    return originalReadFileSync.call(fs, candidate, ...args);
  };
  syncBuiltinESMExports();
  try {
    return callback();
  } finally {
    fs.openSync = originalOpenSync;
    fs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
  }
}

function missingMetric(outcome) {
  return { status: outcome === "unavailable" ? "unavailable" : "unknown", value: null, reason: "synthetic_result_set_fixture" };
}

function caseId(adapter, fixture, condition, repetition) {
  return `case-${hash(`${adapter}:${fixture}:${condition}:${repetition}`).slice(0, 16)}-${hash(`case:${adapter}:${fixture}:${condition}:${repetition}`).slice(0, 16)}`;
}

function blockId(adapter, fixture, repetition) {
  return `block-${hash(`${adapter}:${fixture}:${repetition}`).slice(0, 16)}-${hash(`block:${adapter}:${fixture}:${repetition}`).slice(0, 12)}`;
}

function normalizedRecord({ adapter, fixture, repetitions, condition, repetition, outcome }) {
  const case_id = caseId(adapter, fixture, condition, repetition);
  const attempt = "0001";
  const telemetry = Object.fromEntries(TELEMETRY_FIELDS.map((field) => [field, missingMetric(outcome)]));
  const base = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-result.schema.json",
    program: "adaptive_ask_normalized_execution_result",
    lineage: {
      run_instance_id: RUN_INSTANCE_ID,
      plan_id: PLAN_ID,
      plan_digest: PLAN_DIGEST,
      repository_revision: SOURCE_REVISION,
      materialization_manifest_digest: digest("synthetic-materialization"),
      fixture_id: fixture,
      fixture_input_digest: digest(`fixture:${fixture}`),
      suite: fixture === "fixture-three" ? "mechanism_positive" : "calibration",
      task_class: "implementation",
      difficulty: "synthetic",
      registered_repetitions: repetitions,
      aggregate_eligible: fixture !== "fixture-five",
      case_id,
      attempt,
      adapter_track: adapter,
      condition,
      repetition,
      condition_order_position: CONDITIONS.indexOf(condition) + 1,
      block_id: blockId(adapter, fixture, repetition),
      runtime_identity_digest: digest(`runtime:${adapter}`),
      effective_command_digest: digest(`command:${adapter}`),
      environment_snapshot_digest: digest(`environment:${adapter}`),
      request_digest: digest(`request:${case_id}`),
      raw_result_digest: digest(`raw:${case_id}`),
      terminal_commit_digest: digest(`commit:${case_id}`),
      final_output_digest: null,
      final_output_bytes: null,
      adaptive_selection_digest: condition === "adaptive_ask" ? digest(`selection:${case_id}`) : null,
    },
    outcome,
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
  const normalized_result_digest = canonicalDigest(base);
  const normalized_result_id = `normalized-${canonicalDigest({ run_instance_id: RUN_INSTANCE_ID, case_id, attempt, normalized_result_digest }).slice("sha256:".length, "sha256:".length + 32)}`;
  return { ...base, normalized_result_id, normalized_result_digest };
}

function statusCounts(cases) {
  return ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"].map((status) => ({ status, count: cases.filter((entry) => entry.status === status).length }));
}

function groupedCoverage(cases, names, key, selector) {
  return names.map((name) => {
    const selected = cases.filter((entry) => selector(entry) === name);
    return {
      [key]: name,
      expected: selected.length,
      normalized: selected.length,
      terminal: selected.length,
      pending: 0,
      active: 0,
      invalid: selected.filter((entry) => entry.status === "invalid").length,
    };
  });
}

function buildNormalizedRoot(target) {
  const records = [];
  let outcomeIndex = 0;
  for (const adapter of ADAPTERS) {
    for (const [fixture, repetitions] of [["fixture-three", 3], ["fixture-five", 5]]) {
      for (const condition of CONDITIONS) {
        for (let repetition = 1; repetition <= repetitions; repetition += 1) {
          records.push(normalizedRecord({ adapter, fixture, repetitions, condition, repetition, outcome: OUTCOMES[outcomeIndex++ % OUTCOMES.length] }));
        }
      }
    }
  }
  records.sort((left, right) => ADAPTERS.indexOf(left.lineage.adapter_track) - ADAPTERS.indexOf(right.lineage.adapter_track) || left.lineage.case_id.localeCompare(right.lineage.case_id));
  const sourceSnapshotCases = records.map((record) => ({
    case_id: record.lineage.case_id,
    status: record.outcome,
    attempt_count: 1,
    terminal_attempt: record.lineage.attempt,
    state_digest: digest(`state:${record.lineage.case_id}:${record.outcome}`),
    committed_attempts: [{
      attempt: record.lineage.attempt,
      request_digest: record.lineage.request_digest,
      raw_result_digest: record.lineage.raw_result_digest,
      terminal_commit_digest: record.lineage.terminal_commit_digest,
      final_output_digest: null,
      final_output_bytes: null,
    }],
  }));
  const source_snapshot = {
    adapter_identities: [...ADAPTERS].sort().map((adapter) => ({ adapter, runtime_identity_digest: digest(`runtime:${adapter}`) })),
    cases: sourceSnapshotCases,
  };
  const source_snapshot_digest = canonicalDigest(source_snapshot);
  const generationName = `snapshot-${source_snapshot_digest.slice("sha256:".length)}`;
  const generation = resolve(target, "generations", generationName);
  const inventory = [];
  const cases = [];
  for (const record of records) {
    const path = `results/${record.lineage.adapter_track}/${record.lineage.case_id}-${record.lineage.attempt}.json`;
    const bytes = jsonBytes(record);
    mkdirSync(dirname(resolve(generation, path)), { recursive: true });
    writeFileSync(resolve(generation, path), bytes, { flag: "wx" });
    inventory.push({ path, sha256: `sha256:${hash(bytes)}`, bytes: bytes.length });
    cases.push({
      case_id: record.lineage.case_id,
      adapter_track: record.lineage.adapter_track,
      condition: record.lineage.condition,
      fixture_id: record.lineage.fixture_id,
      repetition: record.lineage.repetition,
      condition_order_position: record.lineage.condition_order_position,
      block_id: record.lineage.block_id,
      status: record.outcome,
      attempt_count: 1,
      terminal_attempt: record.lineage.attempt,
      normalized_attempts: [{ attempt: record.lineage.attempt, normalized_result_id: record.normalized_result_id, normalized_result_digest: record.normalized_result_digest, path }],
    });
  }
  const completeness = {
    partial: false,
    expected_cases: cases.length,
    normalized_cases: cases.length,
    terminal_cases: cases.length,
    pending_cases: 0,
    active_cases: 0,
    invalid_cases: cases.filter(({ status }) => status === "invalid").length,
    by_adapter: groupedCoverage(cases, ADAPTERS, "adapter", (entry) => entry.adapter_track),
    by_condition: groupedCoverage(cases, CONDITIONS, "condition", (entry) => entry.condition),
    by_status: statusCounts(cases),
    missing_case_ids: [],
    invalid_case_ids: cases.filter(({ status }) => status === "invalid").map(({ case_id }) => case_id).sort(),
  };
  const telemetry_coverage = TELEMETRY_FIELDS.map((field) => {
    const statuses = records.map((record) => record.telemetry[field].status);
    return {
      field,
      known: 0,
      unknown: statuses.filter((status) => status === "unknown").length,
      unavailable: statuses.filter((status) => status === "unavailable").length,
      not_applicable: 0,
      total: statuses.length,
    };
  });
  const manifestBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-run.schema.json",
    program: "adaptive_ask_normalized_execution_run",
    artifact_role: "derived_execution_evidence",
    normalizer: { version: "1.0.0", source_revision: SOURCE_REVISION },
    source: {
      run_instance_id: RUN_INSTANCE_ID,
      run_identity_digest: digest("run-identity"),
      plan_id: PLAN_ID,
      plan_digest: PLAN_DIGEST,
      repository_revision: SOURCE_REVISION,
      materialization_manifest_digest: digest("synthetic-materialization"),
      selection_state_digest: digest("synthetic-selection-state"),
    },
    source_snapshot,
    source_snapshot_digest,
    output_root_identity: canonicalDigest({ run_instance_id: RUN_INSTANCE_ID, plan_id: PLAN_ID, normalizer_version: "1.0.0", source_snapshot_digest }),
    pool_adapter_results: false,
    completeness,
    telemetry_coverage,
    cases,
    inventory,
    publication_digest: canonicalDigest({ source_snapshot_digest, inventory }),
    boundaries: {
      evaluator_result: false,
      score: false,
      product_value_claim: false,
      raw_execution_artifacts_are_authoritative: true,
      measured_execution_authorized: false,
      issue_198_stage_0_authorized: false,
    },
  };
  const manifest = { ...manifestBase, normalized_run_digest: canonicalDigest(manifestBase) };
  writeJson(resolve(generation, "normalized-run.json"), manifest);
  const collectionBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-root.schema.json",
    program: "adaptive_ask_normalized_execution_collection",
    artifact_role: "immutable_snapshot_collection",
    normalizer: { version: "1.0.0", source_revision: SOURCE_REVISION },
    source: { run_instance_id: RUN_INSTANCE_ID, run_identity_digest: digest("run-identity"), plan_id: PLAN_ID, plan_digest: PLAN_DIGEST, repository_revision: SOURCE_REVISION },
    generations_directory: "generations",
  };
  writeJson(resolve(target, "normalized-results-root.json"), { ...collectionBase, output_collection_identity: canonicalDigest(collectionBase) });
  return { records, manifest, sourceSnapshotDigest: source_snapshot_digest };
}

function observation() {
  return { state: "unknown", evidence_references: [] };
}

function engineeringResult(record, index) {
  const evaluatorStatuses = ["completed", "evaluator_unavailable", "evaluator_failed", "invalid_input", "manual_review_required"];
  const evaluation_status = record.outcome === "completed" ? evaluatorStatuses[index % evaluatorStatuses.length] : "completed";
  const complete = record.outcome === "completed" && evaluation_status === "completed";
  const normalizedReasons = { failed: "normalized_execution_failed", unavailable: "normalized_execution_unavailable", interrupted: "normalized_execution_interrupted", invalid: "normalized_execution_invalid" };
  const evaluatorReasons = { evaluator_unavailable: "evaluator_unavailable", evaluator_failed: "evaluator_failed", invalid_input: "evaluation_invalid_input", manual_review_required: "manual_review_required" };
  const scoring_reason = complete ? "completed_evaluation_scoring_ready" : record.outcome === "completed" ? evaluatorReasons[evaluation_status] : normalizedReasons[record.outcome];
  const metric = (field) => structuredClone(record.telemetry[field]);
  const base = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/portfolio-engineering-result.schema.json",
    program: "adaptive_ask_portfolio_engineering_result",
    scoring_status: complete ? "complete" : "not_scoring_ready",
    scoring_reason,
    scoring_input_freeze_manifest_source_digest: digest("freeze-source"),
    scoring_input_freeze_manifest_digest: digest("freeze-manifest"),
    catalog_digest: digest("catalog"),
    policy_manifest_digest: digest("policy-manifest"),
    scoring_policy_digest: digest("scoring-policy"),
    admission_record_digest: digest(`admission:${record.lineage.fixture_id}`),
    requirement_record_digest: digest(`requirements:${record.lineage.fixture_id}`),
    requirement_set_digest: digest(`requirement-set:${record.lineage.fixture_id}`),
    output_contract_digest: digest(`output-contract:${record.lineage.fixture_id}`),
    evaluator_public_reference_digest: digest(`evaluator-reference:${record.lineage.fixture_id}`),
    evaluation_id: `evaluation-${hash(`evaluation:${record.normalized_result_id}`).slice(0, 32)}`,
    evaluation_digest: digest(`evaluation:${record.normalized_result_id}`),
    evaluation_status,
    evaluator_bundle_id: `evaluator-${hash(`bundle:${record.lineage.fixture_id}`)}`,
    evaluator_bundle_digest: digest(`bundle-digest:${record.lineage.fixture_id}`),
    evaluator_revision: SOURCE_REVISION,
    normalized_result_id: record.normalized_result_id,
    normalized_result_digest: record.normalized_result_digest,
    normalized_outcome: record.outcome,
    source_snapshot_digest: null,
    run_instance_id: record.lineage.run_instance_id,
    plan_id: record.lineage.plan_id,
    plan_digest: record.lineage.plan_digest,
    fixture_id: record.lineage.fixture_id,
    fixture_input_digest: record.lineage.fixture_input_digest,
    suite: record.lineage.suite,
    task_class: record.lineage.task_class,
    case_id: record.lineage.case_id,
    attempt: record.lineage.attempt,
    adapter: record.lineage.adapter_track,
    condition: record.lineage.condition,
    repetition: record.lineage.repetition,
    requirement_score: complete
      ? { scored_requirement_count: 1, requirement_points_earned: 1, requirement_points_possible: 1, normalized_requirement_score: 1 }
      : { scored_requirement_count: null, requirement_points_earned: null, requirement_points_possible: null, normalized_requirement_score: null },
    blockers: complete
      ? { requirement_ids: [], outcomes: [], non_pass_requirement_ids: [], gate_status: "not_applicable" }
      : { requirement_ids: [], outcomes: [], non_pass_requirement_ids: [], gate_status: "not_scoring_ready" },
    false_positives: { raw_count: 0, findings: [], severity_counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }, false_positive_units: null, unit_mapping_status: "not_implemented_no_approved_mapping" },
    scope_deviations: { raw_count: 0, findings: [] },
    correctness_observations: {
      decision_correctness: observation(), verification_correctness: observation(), evidence_correctness: observation(), approval_correctness: observation(),
      completion_claim_correctness: observation(), under_processing: observation(), over_processing: observation(), quality: observation(), safety: observation(),
    },
    unsafe_actions: {
      categories: ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"].map((category_id) => ({ category_id, attempted_count: 0, blocked_count: 0, unknown_count: 0, action_ids: [], evidence_references: [] })),
    },
    safety_blocker: { status: complete ? "pass" : "not_scoring_ready", reason: scoring_reason, category_ids: [], action_ids: [] },
    mechanism_observations: { required_mechanisms: [], unnecessary_mechanisms: [], quality_credit_applied: false },
    overhead_telemetry: {
      duration_ms: metric("duration_ms"), input_tokens: metric("input_tokens"), output_tokens: metric("output_tokens"), cached_tokens: metric("cached_tokens"),
      monetary_cost: metric("monetary_cost"), human_effort: metric("human_effort"), tool_call_count: metric("tool_call_count"), file_read_count: metric("file_read_count"),
      final_output_bytes: metric("final_output_bytes"), runtime_agent_count: metric("runtime_agent_count"), harness_spawned_secondary_agent_count: metric("harness_spawned_secondary_agent_count"),
      subagent_activity: metric("subagent_activity"), capability_downgrade_count: metric("capability_downgrade_count"),
      runtime_unavailable_reason: { code: metric("runtime_unavailable_reason_code"), digest: metric("runtime_unavailable_reason_digest"), bytes: metric("runtime_unavailable_reason_bytes") },
    },
    boundaries: {
      single_evaluator_result: true, single_normalized_attempt: true, aggregate_result: false, comparison_result: false,
      false_positive_units_calculated: false, correctness_penalty_calculated: false, mechanism_scorecard_calculated: false,
      variance_calculated: false, practice_weight_applied: false,
    },
    privacy: { private_evaluator_content_stored: false, private_path_stored: false, raw_evaluator_prompt_stored: false, secret_customer_or_personal_data_stored: false },
  };
  const withId = { ...base, engineering_result_id: computeEngineeringResultId(base) };
  return { ...withId, engineering_result_digest: computeEngineeringResultDigest(withId) };
}

function sourceEntry(path, resultPath, result) {
  const bytes = readFileSync(resultPath);
  return {
    path,
    raw_byte_digest: `sha256:${hash(bytes)}`,
    bytes: bytes.length,
    engineering_result_id: result.engineering_result_id,
    engineering_result_digest: result.engineering_result_digest,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    case_id: result.case_id,
    attempt: result.attempt,
    condition: result.condition,
    repetition: result.repetition,
  };
}

function buildEngineeringRoot(target, normalized, adapter) {
  const resultRoot = resolve(target, `engineering-${adapter}`);
  const inventory = [];
  let completedIndex = 0;
  for (const record of normalized.records.filter((entry) => entry.lineage.adapter_track === adapter)) {
    const result = engineeringResult(record, record.outcome === "completed" ? completedIndex++ : 0);
    result.source_snapshot_digest = normalized.sourceSnapshotDigest;
    result.engineering_result_id = computeEngineeringResultId(result);
    result.engineering_result_digest = computeEngineeringResultDigest(result);
    const path = `${result.fixture_id}/${result.condition}/${String(result.repetition).padStart(2, "0")}.json`;
    const resultPath = resolve(resultRoot, path);
    writeJson(resultPath, result);
    inventory.push(sourceEntry(path, resultPath, result));
  }
  inventory.sort((left, right) => left.path.localeCompare(right.path));
  const sourceBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json",
    program: "adaptive_ask_portfolio_engineering_result_source_manifest",
    plan_id: PLAN_ID,
    plan_digest: PLAN_DIGEST,
    run_instance_id: RUN_INSTANCE_ID,
    source_snapshot_digest: normalized.sourceSnapshotDigest,
    adapter_track: adapter,
    normalized_generation_id: `snapshot-${normalized.sourceSnapshotDigest.slice("sha256:".length)}`,
    normalized_manifest_digest: normalized.manifest.normalized_run_digest,
    inventory,
    source_revision: SOURCE_REVISION,
  };
  const source = { ...sourceBase, manifest_digest: computeEngineeringResultSourceManifestDigest(sourceBase) };
  const sourcePath = resolve(target, `source-${adapter}.json`);
  writeJson(sourcePath, source);
  return { resultRoot, sourcePath, sourceDigest: fileDigest(sourcePath) };
}

function snapshot(path) {
  const values = [];
  const rootStatus = lstatSync(path);
  values.push({ path: ".", kind: "directory", dev: rootStatus.dev, ino: rootStatus.ino, size: rootStatus.size, mtimeMs: rootStatus.mtimeMs, ctimeMs: rootStatus.ctimeMs });
  function walk(current, prefix = "") {
    for (const name of readdirSync(current).sort()) {
      const absolute = resolve(current, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const status = lstatSync(absolute);
      const identity = { path: relativePath, dev: status.dev, ino: status.ino, size: status.size, mtimeMs: status.mtimeMs, ctimeMs: status.ctimeMs };
      if (status.isSymbolicLink()) values.push({ ...identity, kind: "symlink" });
      else if (status.isDirectory()) {
        values.push({ ...identity, kind: "directory" });
        walk(absolute, relativePath);
      } else if (status.isFile()) values.push({ ...identity, kind: "file", bytes: readFileSync(absolute).toString("base64") });
      else values.push({ path: relativePath, kind: "non-regular" });
    }
  }
  walk(path);
  return values;
}

function cloneFixture(name) {
  const target = resolve(work, name);
  cpSync(resolve(work, "base"), target, { recursive: true });
  const normalizedRoot = resolve(target, "normalized");
  const manifest = readJson(resolve(normalizedRoot, "generations", readdirSync(resolve(normalizedRoot, "generations"))[0], "normalized-run.json"));
  return {
    target,
    normalizedRoot,
    sourceSnapshotDigest: manifest.source_snapshot_digest,
    resultRoot: resolve(target, "engineering-codex"),
    sourcePath: resolve(target, "source-codex.json"),
    sourceDigest: fileDigest(resolve(target, "source-codex.json")),
    outputPath: resolve(target, "result-set.json"),
  };
}

function options(fixture, overrides = {}) {
  return {
    root,
    normalizedResultsPath: fixture.normalizedRoot,
    sourceSnapshotDigest: fixture.sourceSnapshotDigest,
    engineeringResultsPath: fixture.resultRoot,
    sourceManifestPath: fixture.sourcePath,
    sourceManifestSourceDigest: fixture.sourceDigest,
    adapter: "codex",
    outputPath: fixture.outputPath,
    ...overrides,
  };
}

function resealSource(fixture) {
  const source = readJson(fixture.sourcePath);
  source.inventory = source.inventory.map((entry) => {
    const resultPath = resolve(fixture.resultRoot, entry.path);
    if (!existsSync(resultPath)) return entry;
    const result = readJson(resultPath);
    return sourceEntry(entry.path, resultPath, result);
  }).sort((left, right) => left.path.localeCompare(right.path));
  source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
  writeJson(fixture.sourcePath, source);
  fixture.sourceDigest = fileDigest(fixture.sourcePath);
}

function rewriteFirstResult(fixture, mutate, { closeIdentity = true } = {}) {
  const source = readJson(fixture.sourcePath);
  const entry = source.inventory[0];
  const path = resolve(fixture.resultRoot, entry.path);
  const value = readJson(path);
  mutate(value);
  if (closeIdentity) {
    value.engineering_result_id = computeEngineeringResultId(value);
    value.engineering_result_digest = computeEngineeringResultDigest(value);
  }
  writeJson(path, value);
  resealSource(fixture);
  return { path, value };
}

function expectFailure(name, mutate, pattern, optionOverrides = {}) {
  const fixture = cloneFixture(`negative-${name}`);
  mutate(fixture);
  const before = {
    normalized: snapshot(fixture.normalizedRoot),
    results: snapshot(fixture.resultRoot),
    source: readFileSync(fixture.sourcePath),
  };
  assert.throws(() => collectEngineeringResults(options(fixture, optionOverrides)), pattern, name);
  assert.deepEqual(snapshot(fixture.normalizedRoot), before.normalized, `${name}: normalized input must remain unchanged`);
  assert.deepEqual(snapshot(fixture.resultRoot), before.results, `${name}: engineering result input must remain unchanged`);
  assert.deepEqual(readFileSync(fixture.sourcePath), before.source, `${name}: source manifest must remain unchanged`);
  assert.equal(existsSync(fixture.outputPath), false, `${name}: failure must not publish output`);
  covered.add(name);
}

function addOptionalInputRoots(fixture) {
  for (const [field, name] of [["materializedPath", "materialized"], ["selectionState", "selection-state"], ["runDir", "run"]]) {
    const path = resolve(fixture.target, name);
    mkdirSync(path, { recursive: true });
    writeFileSync(resolve(path, "sentinel.txt"), `${name}\n`);
    fixture[field] = path;
  }
  return fixture;
}

function inputEvidence(fixture) {
  const evidence = {
    normalized: snapshot(fixture.normalizedRoot),
    results: snapshot(fixture.resultRoot),
    source: { bytes: readFileSync(fixture.sourcePath).toString("base64"), ...(() => {
      const status = lstatSync(fixture.sourcePath);
      return { dev: status.dev, ino: status.ino, size: status.size, mtimeMs: status.mtimeMs, ctimeMs: status.ctimeMs };
    })() },
  };
  for (const field of ["materializedPath", "selectionState", "runDir"]) if (fixture[field]) evidence[field] = snapshot(fixture[field]);
  return evidence;
}

function assertInputEvidenceUnchanged(fixture, before, name) {
  assert.deepEqual(inputEvidence(fixture), before, `${name}: every input root and source manifest must remain byte-, inventory-, and inode-identical`);
}

function expectBoundaryFailure(name, fixtureMutator, optionOverrides, pattern) {
  const fixture = addOptionalInputRoots(cloneFixture(`negative-${name}`));
  fixtureMutator(fixture);
  const before = inputEvidence(fixture);
  const target = optionOverrides(fixture);
  assert.throws(() => collectEngineeringResults(options(fixture, target)), pattern, name);
  assertInputEvidenceUnchanged(fixture, before, name);
  if (target.outputPath && !Object.values(fixture).includes(target.outputPath)) assert.equal(existsSync(target.outputPath), false, `${name}: failure must not publish output`);
  covered.add(name);
}

function addDuplicateResult(fixture, mutate = null) {
  const source = readJson(fixture.sourcePath);
  const original = source.inventory[0];
  const value = readJson(resolve(fixture.resultRoot, original.path));
  if (mutate) {
    mutate(value);
    value.engineering_result_id = computeEngineeringResultId(value);
    value.engineering_result_digest = computeEngineeringResultDigest(value);
  }
  const path = `duplicate/${hash(JSON.stringify(value)).slice(0, 12)}.json`;
  const absolute = resolve(fixture.resultRoot, path);
  writeJson(absolute, value);
  source.inventory.push(sourceEntry(path, absolute, value));
  source.inventory.sort((left, right) => left.path.localeCompare(right.path));
  source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
  writeJson(fixture.sourcePath, source);
  fixture.sourceDigest = fileDigest(fixture.sourcePath);
}

async function concurrentCollect(fixture) {
  const args = [
    runner,
    "collect-engineering-results",
    "--normalized-results", fixture.normalizedRoot,
    "--snapshot-digest", fixture.sourceSnapshotDigest,
    "--engineering-results", fixture.resultRoot,
    "--engineering-result-source-manifest", fixture.sourcePath,
    "--engineering-result-source-manifest-source-digest", fixture.sourceDigest,
    "--adapter", "codex",
    "--output", fixture.outputPath,
  ];
  const launch = () => new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolvePromise({ status, stderr }));
  });
  return Promise.all([launch(), launch()]);
}

async function waitForPath(path, child) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (existsSync(path)) return;
    if (child.exitCode !== null) throw new Error(`verification child exited before the synchronized replacement checkpoint: ${child.exitCode}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error("verification child did not reach the synchronized replacement checkpoint");
}

async function concurrentVerifyReplacement(fixture, replacementPath) {
  const markerPath = resolve(fixture.target, `verify-read-${hash(replacementPath).slice(0, 8)}.marker`);
  const continuePath = `${markerPath}.continue`;
  const preloadPath = `${markerPath}.preload.mjs`;
  writeFileSync(preloadPath, `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve, sep } from "node:path";
const originalOpenSync = fs.openSync;
const markerPath = process.env.ASK_RESULT_SET_TEST_MARKER;
const continuePath = process.env.ASK_RESULT_SET_TEST_CONTINUE;
const resultRoot = resolve(process.env.ASK_RESULT_SET_TEST_RESULT_ROOT);
let synchronized = false;
fs.openSync = function (path, ...args) {
  const absolute = resolve(String(path));
  if (!synchronized && (absolute === resultRoot || absolute.startsWith(resultRoot + sep))) {
    synchronized = true;
    fs.writeFileSync(markerPath, "initial input read completed\\n", { flag: "wx" });
    const waitArray = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(continuePath)) Atomics.wait(waitArray, 0, 0, 10);
  }
  return originalOpenSync.call(fs, path, ...args);
};
syncBuiltinESMExports();
`);
  const args = [
    "--import", preloadPath,
    runner,
    "verify-engineering-result-set",
    "--normalized-results", fixture.normalizedRoot,
    "--snapshot-digest", fixture.sourceSnapshotDigest,
    "--engineering-results", fixture.resultRoot,
    "--engineering-result-source-manifest", fixture.sourcePath,
    "--engineering-result-source-manifest-source-digest", fixture.sourceDigest,
    "--adapter", "codex",
    "--input", fixture.outputPath,
  ];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      ASK_RESULT_SET_TEST_MARKER: markerPath,
      ASK_RESULT_SET_TEST_CONTINUE: continuePath,
      ASK_RESULT_SET_TEST_RESULT_ROOT: fixture.resultRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await waitForPath(markerPath, child);
  renameSync(replacementPath, fixture.outputPath);
  writeFileSync(continuePath, "continue\n", { flag: "wx" });
  const status = await new Promise((resolvePromise) => child.on("close", resolvePromise));
  return { status, stdout, stderr };
}

try {
  const base = resolve(work, "base");
  const normalizedRoot = resolve(base, "normalized");
  const normalized = buildNormalizedRoot(normalizedRoot);
  const codex = buildEngineeringRoot(base, normalized, "codex");
  const claude = buildEngineeringRoot(base, normalized, "claude");

  const positive = cloneFixture("positive");
  const collected = collectEngineeringResults(options(positive));
  assert.equal(collected.artifact.completeness.completeness_status, "complete");
  assert.equal(collected.artifact.source_revision, SOURCE_REVISION);
  assert.equal(collected.artifact.completeness.expected_result_count, 32);
  assert.deepEqual(collected.artifact.structural_counts.by_condition.map(({ name }) => name), CONDITIONS);
  assert.deepEqual(collected.artifact.structural_counts.by_repetition.map(({ name }) => name), ["1", "2", "3", "4", "5"]);
  assert.ok(collected.artifact.inventory.some(({ scoring_status }) => scoring_status === "not_scoring_ready"));
  assert.ok(collected.artifact.inventory.some(({ normalized_outcome }) => normalized_outcome === "unavailable"));
  assert.deepEqual([...new Set(collected.artifact.inventory.map(({ evaluation_status: status }) => status))].sort(), ["completed", "evaluator_failed", "evaluator_unavailable", "invalid_input", "manual_review_required"].sort());
  const fullyVerified = verifyEngineeringResultSet({ ...options(positive), inputPath: positive.outputPath, outputPath: undefined });
  assert.deepEqual(Object.keys(collected).sort(), ["artifact", "authority", "bytes", "outputPath", "verified_results"]);
  assert.deepEqual(Object.keys(fullyVerified).sort(), ["artifact", "authority", "bytes", "verified_results"]);
  for (const returned of [collected, fullyVerified]) {
    assert.equal(Object.hasOwn(returned.authority, "path"), false);
    assert.equal(Object.hasOwn(returned.authority, "evidence"), false);
    assert.equal(stringValues(returned.authority).some((value) => isAbsolute(value) || value.includes(positive.resultRoot)), false);
    assert.equal(returned.verified_results.length, returned.artifact.inventory.length);
    returned.verified_results.forEach((entry, index) => {
      const inventory = returned.artifact.inventory[index];
      assert.deepEqual(
        {
          path: entry.path,
          raw_byte_digest: entry.raw_byte_digest,
          bytes: entry.bytes,
          engineering_result_id: entry.result.engineering_result_id,
          engineering_result_digest: entry.result.engineering_result_digest,
          normalized_result_id: entry.result.normalized_result_id,
          normalized_result_digest: entry.result.normalized_result_digest,
          case_id: entry.result.case_id,
          attempt: entry.result.attempt,
          condition: entry.result.condition,
          repetition: entry.result.repetition,
        },
        {
          path: inventory.path,
          raw_byte_digest: inventory.raw_byte_digest,
          bytes: inventory.bytes,
          engineering_result_id: inventory.engineering_result_id,
          engineering_result_digest: inventory.engineering_result_digest,
          normalized_result_id: inventory.normalized_result_id,
          normalized_result_digest: inventory.normalized_result_digest,
          case_id: inventory.case_id,
          attempt: inventory.attempt,
          condition: inventory.condition,
          repetition: inventory.repetition,
        },
      );
      validatePortfolioEngineeringResult(entry.result, { root });
      assert.equal(resolve(positive.resultRoot, entry.path).startsWith(`${positive.resultRoot}/`), true);
      assert.equal(isAbsolute(entry.path), false);
      const strings = stringValues(entry.result);
      assert.equal(strings.some((value) => value.startsWith("/") || value.includes(positive.resultRoot) || /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu.test(value)), false);
    });
  }
  assert.equal(Object.hasOwn(JSON.parse(collected.bytes.toString("utf8")), "verified_results"), false);
  assert.equal(Object.hasOwn(collected.artifact, "verified_results"), false);
  covered.add("full-verifier-returns-verified-results");
  covered.add("verified-results-match-inventory-order");

  const verifiedBodies = fullyVerified.verified_results.map(({ result }) => result);
  const normalizedOutcomes = new Set(verifiedBodies.map(({ normalized_outcome: outcome }) => outcome));
  for (const outcome of ["unavailable", "failed", "interrupted", "invalid"]) assert.equal(normalizedOutcomes.has(outcome), true);
  const evaluatorStatuses = new Set(verifiedBodies.map(({ evaluation_status: status }) => status));
  for (const status of ["evaluator_unavailable", "evaluator_failed", "invalid_input", "manual_review_required"]) assert.equal(evaluatorStatuses.has(status), true);
  assert.ok(verifiedBodies.some(({ scoring_status: status, requirement_score: score }) => status === "not_scoring_ready" && score.normalized_requirement_score === null && score.requirement_points_earned === null && score.requirement_points_possible === null));
  covered.add("verified-results-preserve-non-ready-bodies");

  const scoringReadyBody = verifiedBodies.find(({ scoring_status: status }) => status === "complete");
  assert.ok(scoringReadyBody);
  assert.equal(scoringReadyBody.requirement_score.normalized_requirement_score, 1);
  assert.equal(scoringReadyBody.requirement_score.requirement_points_earned, 1);
  assert.equal(scoringReadyBody.requirement_score.requirement_points_possible, 1);
  for (const field of ["blockers", "safety_blocker", "false_positives", "correctness_observations", "mechanism_observations"]) assert.equal(Object.hasOwn(scoringReadyBody, field), true);
  for (const field of ["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "human_effort"]) assert.equal(Object.hasOwn(scoringReadyBody.overhead_telemetry, field), true);
  covered.add("verified-results-expose-score-and-telemetry");

  assert.equal(Object.isFrozen(fullyVerified.verified_results), true);
  assert.equal(Object.isFrozen(fullyVerified.verified_results[0]), true);
  assert.equal(Object.isFrozen(fullyVerified.verified_results[0].result), true);
  const originalScoringStatus = fullyVerified.verified_results[0].result.scoring_status;
  assert.throws(() => { fullyVerified.verified_results[0].result.scoring_status = "mutated"; }, TypeError);
  assert.equal(fullyVerified.verified_results[0].result.scoring_status, originalScoringStatus);
  const independentlyVerified = verifyEngineeringResultSet({ ...options(positive), inputPath: positive.outputPath, outputPath: undefined });
  assert.notEqual(independentlyVerified.verified_results[0].result, fullyVerified.verified_results[0].result);
  assert.equal(independentlyVerified.verified_results[0].result.scoring_status, originalScoringStatus);
  covered.add("verified-results-mutation-isolated");

  const bareValidated = validatePortfolioEngineeringResultSet(structuredClone(collected.artifact), { root });
  assert.equal(Object.hasOwn(bareValidated, "verified_results"), false);
  covered.add("bare-validator-does-not-return-result-bodies");

  const mismatchedVerifiedResults = structuredClone(fullyVerified.verified_results);
  [mismatchedVerifiedResults[0], mismatchedVerifiedResults[1]] = [mismatchedVerifiedResults[1], mismatchedVerifiedResults[0]];
  assert.throws(() => assertVerifiedResultInventory(fullyVerified.artifact, mismatchedVerifiedResults), /inventory/u);
  covered.add("verified-result-inventory-mismatch-rejected");
  const cliVerified = run([
    "verify-engineering-result-set", "--normalized-results", positive.normalizedRoot, "--snapshot-digest", positive.sourceSnapshotDigest,
    "--engineering-results", positive.resultRoot, "--engineering-result-source-manifest", positive.sourcePath,
    "--engineering-result-source-manifest-source-digest", positive.sourceDigest, "--adapter", "codex", "--input", positive.outputPath,
  ]);
  assert.match(cliVerified.stdout, /Verified complete codex engineering result set/u);
  assert.doesNotMatch(cliVerified.stdout, /normalized_requirement_score|requirement_points_earned|overhead_telemetry/u);
  const postReturnFixture = cloneFixture("post-return-result-replacement");
  collectEngineeringResults(options(postReturnFixture));
  const postReturnVerified = verifyEngineeringResultSet(options(postReturnFixture, { inputPath: postReturnFixture.outputPath, outputPath: undefined }));
  const projectionBeforeReplacement = projectVerifiedResults(postReturnVerified.verified_results);
  const replacedEntry = postReturnVerified.verified_results[0];
  writeFileSync(resolve(postReturnFixture.resultRoot, replacedEntry.path), "{}\n");
  assert.deepEqual(withResultReadTrap(postReturnFixture.resultRoot, () => projectVerifiedResults(postReturnVerified.verified_results)), projectionBeforeReplacement);
  assert.throws(
    () => verifyEngineeringResultSet(options(postReturnFixture, { inputPath: postReturnFixture.outputPath, outputPath: undefined })),
    /raw-byte digest drifted|Schema validation/u,
  );
  covered.add("consumer-does-not-reread-result-files");
  covered.add("verified-results-survive-post-return-file-replacement");
  for (const name of ["complete-one-adapter", "all-four-conditions", "plan-three-repetitions", "plan-five-repetitions", "complete-with-non-ready", "unknown-unavailable-not-zero", "source-revision-matches-normalized-authority"]) covered.add(name);

  const checkedIn = cloneFixture("checked-in-authority");
  cpSync(resolve(root, "benchmarks/schemas"), resolve(checkedIn.target, "benchmarks/schemas"), { recursive: true });
  for (const args of [["init", "-q"], ["config", "user.name", "ASK Result Set Test"], ["config", "user.email", "result-set-test@example.invalid"], ["add", "source-codex.json"], ["commit", "-q", "-m", "Anchor synthetic source manifest"]]) {
    const result = spawnSync("git", args, { cwd: checkedIn.target, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const checkedInResult = collectEngineeringResults(options(checkedIn, { root: checkedIn.target, sourceManifestSourceDigest: null }));
  assert.equal(checkedInResult.authority.authority, "checked_in_head");
  covered.add("checked-in-source-authority");

  const checkedInRevisionMismatch = cloneFixture("checked-in-revision-mismatch");
  cpSync(resolve(root, "benchmarks/schemas"), resolve(checkedInRevisionMismatch.target, "benchmarks/schemas"), { recursive: true });
  const checkedInMismatchSource = readJson(checkedInRevisionMismatch.sourcePath);
  checkedInMismatchSource.source_revision = "2".repeat(40);
  checkedInMismatchSource.manifest_digest = computeEngineeringResultSourceManifestDigest(checkedInMismatchSource);
  writeJson(checkedInRevisionMismatch.sourcePath, checkedInMismatchSource);
  for (const args of [["init", "-q"], ["config", "user.name", "ASK Result Set Test"], ["config", "user.email", "result-set-test@example.invalid"], ["add", "source-codex.json"], ["commit", "-q", "-m", "Anchor mismatched synthetic source manifest"]]) {
    const result = spawnSync("git", args, { cwd: checkedInRevisionMismatch.target, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const checkedInMismatchBefore = inputEvidence(checkedInRevisionMismatch);
  assert.throws(
    () => collectEngineeringResults(options(checkedInRevisionMismatch, { root: checkedInRevisionMismatch.target, sourceManifestSourceDigest: null })),
    /source_revision does not match the verified normalized authority/u,
  );
  assertInputEvidenceUnchanged(checkedInRevisionMismatch, checkedInMismatchBefore, "checked-in-source-revision-mismatch");
  assert.equal(existsSync(checkedInRevisionMismatch.outputPath), false);
  covered.add("checked-in-source-revision-mismatch");

  const claudeFixture = cloneFixture("positive-claude");
  claudeFixture.resultRoot = resolve(claudeFixture.target, "engineering-claude");
  claudeFixture.sourcePath = resolve(claudeFixture.target, "source-claude.json");
  claudeFixture.sourceDigest = fileDigest(claudeFixture.sourcePath);
  claudeFixture.outputPath = resolve(claudeFixture.target, "claude-set.json");
  const claudeSet = collectEngineeringResults(options(claudeFixture, { adapter: "claude" }));
  assert.equal(claudeSet.artifact.adapter_track, "claude");
  assert.notEqual(claudeSet.artifact.result_set_id, collected.artifact.result_set_id);
  covered.add("adapter-separate-result-sets");

  const deterministic = cloneFixture("deterministic");
  const first = collectEngineeringResults(options(deterministic));
  const secondOutput = resolve(deterministic.target, "result-set-second.json");
  const second = collectEngineeringResults(options(deterministic, { outputPath: secondOutput }));
  assert.deepEqual(first.bytes, second.bytes);
  covered.add("byte-identical-regeneration");

  const immutableSuccess = addOptionalInputRoots(cloneFixture("successful-external-output-inputs-unchanged"));
  immutableSuccess.outputPath = resolve(work, "external-publication", "result-set.json");
  mkdirSync(dirname(immutableSuccess.outputPath), { recursive: true });
  const immutableBefore = inputEvidence(immutableSuccess);
  collectEngineeringResults(options(immutableSuccess, {
    materializedPath: immutableSuccess.materializedPath,
    selectionState: immutableSuccess.selectionState,
    runDir: immutableSuccess.runDir,
  }));
  assertInputEvidenceUnchanged(immutableSuccess, immutableBefore, "successful-external-output-inputs-unchanged");
  covered.add("successful-external-output-inputs-unchanged");

  expectFailure("missing-result", (fixture) => {
    const source = readJson(fixture.sourcePath);
    unlinkSync(resolve(fixture.resultRoot, source.inventory[0].path));
  }, /inventory do not match exactly/u);
  expectFailure("extra-result", (fixture) => addDuplicateResult(fixture, (value) => {
    value.normalized_result_id = `normalized-${hash("foreign-normalized").slice(0, 32)}`;
    value.normalized_result_digest = digest("foreign-normalized-digest");
    value.case_id = caseId("codex", "foreign-fixture", "plain", 1);
    value.attempt = "0002";
    value.fixture_id = "foreign-fixture";
  }), /extra normalized attempt|subset and cherry-pick/u);
  for (const [name, pattern] of [
    ["duplicate-engineering-result-id", /duplicate engineering result ID/u],
    ["duplicate-engineering-result-digest", /duplicate engineering result digest/u],
    ["duplicate-normalized-result-id", /duplicate normalized result ID/u],
    ["duplicate-case-attempt", /duplicate case-attempt identity/u],
  ]) expectFailure(name, (fixture) => addDuplicateResult(fixture), pattern);
  expectFailure("duplicate-condition-repetition", (fixture) => addDuplicateResult(fixture, (value) => {
    value.normalized_result_id = `normalized-${hash("duplicate-condition").slice(0, 32)}`;
    value.normalized_result_digest = digest("duplicate-condition");
    value.case_id = caseId("codex", value.fixture_id, value.condition, value.repetition + 10);
    value.attempt = "0002";
  }), /duplicate fixture-condition-repetition identity/u);
  expectFailure("cross-adapter", (fixture) => rewriteFirstResult(fixture, (value) => { value.adapter = "claude"; }), /different adapter/u);
  expectFailure("cross-plan", (fixture) => rewriteFirstResult(fixture, (value) => { value.plan_id = `plan-${hash("foreign-plan")}`; value.plan_digest = digest("foreign-plan"); }), /cross-plan-id|cross-plan-digest/u);
  expectFailure("cross-run", (fixture) => rewriteFirstResult(fixture, (value) => { value.run_instance_id = "00000000-0000-4000-8000-000000000999"; }), /cross-run-instance-id/u);
  expectFailure("cross-snapshot", (fixture) => rewriteFirstResult(fixture, (value) => { value.source_snapshot_digest = digest("foreign-snapshot"); }), /cross-source-snapshot-digest/u);
  expectFailure("cross-condition", (fixture) => rewriteFirstResult(fixture, (value) => { value.condition = value.condition === "plain" ? "kernel_only" : "plain"; }), /cross-condition|duplicate fixture-condition-repetition/u);
  expectFailure("cross-repetition", (fixture) => rewriteFirstResult(fixture, (value) => { value.repetition = value.repetition === 1 ? 2 : 1; }), /cross-repetition|duplicate fixture-condition-repetition/u);
  expectFailure("cross-fixture", (fixture) => rewriteFirstResult(fixture, (value) => { value.fixture_id = "foreign-fixture"; value.fixture_input_digest = digest("foreign-fixture"); }), /cross-fixture-id/u);
  expectFailure("normalized-digest-mismatch", (fixture) => rewriteFirstResult(fixture, (value) => { value.normalized_result_digest = digest("foreign-normalized-digest"); }), /cross-normalized-result-digest/u);
  expectFailure("engineering-result-digest-drift", (fixture) => rewriteFirstResult(fixture, (value) => { value.engineering_result_digest = digest("drift"); }, { closeIdentity: false }), /engineering result digest/u);
  expectFailure("engineering-result-id-drift", (fixture) => rewriteFirstResult(fixture, (value) => { value.engineering_result_id = `engineering-result-${hash("drift").slice(0, 32)}`; }, { closeIdentity: false }), /engineering result ID/u);
  expectFailure("source-manifest-raw-digest-drift", () => {}, /approved immutable source digest/u, { sourceManifestSourceDigest: digest("wrong-source") });
  expectFailure("source-manifest-semantic-digest-drift", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.manifest_digest = digest("wrong-semantic");
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /semantic digest/u);
  expectFailure("source-revision-mismatch", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.source_revision = "2".repeat(40);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /semantic digest/u);
  expectFailure("source-revision-resealed-approved-mismatch", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.source_revision = "2".repeat(40);
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /source_revision does not match the verified normalized authority/u);
  expectFailure("source-revision-arbitrary-valid-hex", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.source_revision = "abcdef0123456789abcdef0123456789abcdef01";
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /source_revision does not match the verified normalized authority/u);
  expectFailure("source-revision-missing", (fixture) => {
    const source = readJson(fixture.sourcePath);
    delete source.source_revision;
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /Schema validation/u);
  expectFailure("unapproved-resealed-source-manifest", (fixture) => {
    const oldDigest = fixture.sourceDigest;
    const source = readJson(fixture.sourcePath);
    source.source_revision = "2".repeat(40);
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = oldDigest;
  }, /approved immutable source digest/u);
  expectFailure("unanchored-source-manifest", () => {}, /requires checked-in bytes/u, { sourceManifestSourceDigest: null });
  expectFailure("result-file-raw-byte-drift", (fixture) => {
    const entry = readJson(fixture.sourcePath).inventory[0];
    writeFileSync(resolve(fixture.resultRoot, entry.path), " \n", { flag: "a" });
  }, /raw-byte digest drifted/u);
  expectFailure("result-file-byte-count-drift", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.inventory[0].bytes += 1;
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /byte count drifted/u);
  expectFailure("source-manifest-subset-cherry-pick", (fixture) => {
    const source = readJson(fixture.sourcePath);
    const removed = source.inventory.shift();
    unlinkSync(resolve(fixture.resultRoot, removed.path));
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /subset and cherry-pick/u);
  expectFailure("source-directory-inventory-mismatch", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.inventory.pop();
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /inventory do not match exactly/u);
  expectFailure("unexpected-file", (fixture) => writeJson(resolve(fixture.resultRoot, "unexpected.json"), { unexpected: true }), /inventory do not match exactly/u);
  expectFailure("missing-file", (fixture) => {
    const entry = readJson(fixture.sourcePath).inventory.at(-1);
    unlinkSync(resolve(fixture.resultRoot, entry.path));
  }, /inventory do not match exactly/u);
  expectFailure("source-root-symlink", (fixture) => {
    const real = `${fixture.resultRoot}-real`;
    cpSync(fixture.resultRoot, real, { recursive: true });
    rmSync(fixture.resultRoot, { recursive: true });
    symlinkSync(real, fixture.resultRoot);
  }, /symlink/u);
  expectFailure("child-path-symlink", (fixture) => {
    const entry = readJson(fixture.sourcePath).inventory[0];
    const path = resolve(fixture.resultRoot, entry.path);
    const target = `${path}.target`;
    cpSync(path, target);
    unlinkSync(path);
    symlinkSync(target, path);
  }, /symlink/u);
  expectFailure("path-escape", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.inventory[0].path = "../escape.json";
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /Schema validation|portable/u);
  expectFailure("windows-path", (fixture) => {
    const source = readJson(fixture.sourcePath);
    source.inventory[0].path = "C:\\result.json";
    source.manifest_digest = computeEngineeringResultSourceManifestDigest(source);
    writeJson(fixture.sourcePath, source);
    fixture.sourceDigest = fileDigest(fixture.sourcePath);
  }, /Schema validation|portable/u);
  expectFailure("non-regular-entry", (fixture) => {
    const fifo = resolve(fixture.resultRoot, "fifo.json");
    const made = spawnSync("mkfifo", [fifo]);
    assert.equal(made.status, 0, made.stderr?.toString());
  }, /non-regular/u);

  const unordered = structuredClone(collected.artifact);
  [unordered.inventory[0], unordered.inventory[1]] = [unordered.inventory[1], unordered.inventory[0]];
  unordered.result_set_id = computeEngineeringResultSetId(unordered);
  unordered.result_set_digest = computeEngineeringResultSetDigest(unordered);
  assert.throws(() => validatePortfolioEngineeringResultSet(unordered, { root }), /ordering/u);
  covered.add("unordered-inventory");
  const countDrift = structuredClone(collected.artifact);
  countDrift.completeness.collected_result_count -= 1;
  countDrift.result_set_digest = computeEngineeringResultSetDigest(countDrift);
  assert.throws(() => validatePortfolioEngineeringResultSet(countDrift, { root }), /completeness/u);
  covered.add("count-drift");
  const idDrift = structuredClone(collected.artifact);
  idDrift.result_set_id = `engineering-result-set-${hash("wrong-id").slice(0, 32)}`;
  idDrift.result_set_digest = computeEngineeringResultSetDigest(idDrift);
  assert.throws(() => validatePortfolioEngineeringResultSet(idDrift, { root }), /ID is invalid/u);
  covered.add("result-set-id-drift");
  const digestDrift = structuredClone(collected.artifact);
  digestDrift.result_set_digest = digest("wrong-result-set-digest");
  assert.throws(() => validatePortfolioEngineeringResultSet(digestDrift, { root }), /digest is invalid/u);
  covered.add("result-set-digest-drift");
  const revisionIdentityDrift = structuredClone(collected.artifact);
  revisionIdentityDrift.source_revision = "2".repeat(40);
  const changedRevisionId = computeEngineeringResultSetId(revisionIdentityDrift);
  assert.notEqual(changedRevisionId, collected.artifact.result_set_id);
  covered.add("result-set-id-binds-source-revision");

  const fullAuthorityRevisionDrift = cloneFixture("result-set-revision-drift");
  const authoritativeRevisionSet = collectEngineeringResults(options(fullAuthorityRevisionDrift));
  const revisionDriftArtifact = structuredClone(authoritativeRevisionSet.artifact);
  revisionDriftArtifact.source_revision = "2".repeat(40);
  revisionDriftArtifact.result_set_id = computeEngineeringResultSetId(revisionDriftArtifact);
  revisionDriftArtifact.result_set_digest = computeEngineeringResultSetDigest(revisionDriftArtifact);
  validatePortfolioEngineeringResultSet(revisionDriftArtifact, { root });
  const revisionDriftPath = resolve(fullAuthorityRevisionDrift.target, "self-consistent-revision-drift.json");
  writeJson(revisionDriftPath, revisionDriftArtifact);
  const revisionDriftBefore = inputEvidence(fullAuthorityRevisionDrift);
  assert.throws(
    () => verifyEngineeringResultSet(options(fullAuthorityRevisionDrift, { inputPath: revisionDriftPath, outputPath: undefined })),
    /does not match the re-derived authoritative complete inventory/u,
  );
  assertInputEvidenceUnchanged(fullAuthorityRevisionDrift, revisionDriftBefore, "result-set-revision-drift");
  covered.add("result-set-revision-drift");
  covered.add("bare-validator-is-not-full-authority-verification");

  const concurrentReplacement = cloneFixture("concurrent-verify-replacement");
  const concurrentReplacementSet = collectEngineeringResults(options(concurrentReplacement));
  const replacementArtifact = structuredClone(concurrentReplacementSet.artifact);
  replacementArtifact.source_revision = "2".repeat(40);
  replacementArtifact.result_set_id = computeEngineeringResultSetId(replacementArtifact);
  replacementArtifact.result_set_digest = computeEngineeringResultSetDigest(replacementArtifact);
  validatePortfolioEngineeringResultSet(replacementArtifact, { root });
  const replacementPath = resolve(concurrentReplacement.target, "replacement-result-set.json");
  writeJson(replacementPath, replacementArtifact);
  const concurrentReplacementBefore = inputEvidence(concurrentReplacement);
  const replacementOutcome = await concurrentVerifyReplacement(concurrentReplacement, replacementPath);
  assert.notEqual(replacementOutcome.status, 0, "concurrent input replacement must make verification fail closed");
  assert.doesNotMatch(replacementOutcome.stdout, /Verified complete/u);
  assert.match(replacementOutcome.stderr, /changed|replaced|does not match/u);
  assertInputEvidenceUnchanged(concurrentReplacement, concurrentReplacementBefore, "concurrent-verify-input-replacement");
  covered.add("concurrent-verify-input-replacement");

  const sameByteReplacement = cloneFixture("same-byte-inode-replacement");
  collectEngineeringResults(options(sameByteReplacement));
  const sameByteReplacementPath = resolve(sameByteReplacement.target, "same-byte-replacement.json");
  cpSync(sameByteReplacement.outputPath, sameByteReplacementPath);
  assert.notEqual(lstatSync(sameByteReplacement.outputPath).ino, lstatSync(sameByteReplacementPath).ino);
  const sameByteBefore = inputEvidence(sameByteReplacement);
  const sameByteOutcome = await concurrentVerifyReplacement(sameByteReplacement, sameByteReplacementPath);
  assert.notEqual(sameByteOutcome.status, 0, "same-byte inode replacement must make verification fail closed");
  assert.doesNotMatch(sameByteOutcome.stdout, /Verified complete/u);
  assert.match(sameByteOutcome.stderr, /changed|replaced/u);
  assertInputEvidenceUnchanged(sameByteReplacement, sameByteBefore, "same-byte-inode-replacement");
  covered.add("same-byte-inode-replacement");
  const statistics = structuredClone(collected.artifact);
  statistics.mean = 0.5;
  assert.throws(() => validatePortfolioEngineeringResultSet(statistics, { root }), /Schema validation/u);
  covered.add("statistics-aggregate-schema-rejected");

  const existing = cloneFixture("pre-existing-output");
  writeFileSync(existing.outputPath, "unchanged\n");
  assert.throws(() => collectEngineeringResults(options(existing)), /must not already exist/u);
  assert.equal(readFileSync(existing.outputPath, "utf8"), "unchanged\n");
  covered.add("pre-existing-output");
  const outputSymlink = cloneFixture("output-symlink");
  const symlinkTarget = resolve(outputSymlink.target, "symlink-target.json");
  writeFileSync(symlinkTarget, "unchanged\n");
  symlinkSync(symlinkTarget, outputSymlink.outputPath);
  assert.throws(() => collectEngineeringResults(options(outputSymlink)), /must not be a symlink/u);
  assert.equal(readFileSync(symlinkTarget, "utf8"), "unchanged\n");
  covered.add("output-symlink");
  const concurrent = cloneFixture("concurrent-output");
  const outcomes = await concurrentCollect(concurrent);
  assert.deepEqual(outcomes.map(({ status }) => status).sort(), [0, 1]);
  assert.ok(existsSync(concurrent.outputPath));
  covered.add("concurrent-output-publication");
  covered.add("failure-inputs-unchanged");

  expectFailure("adapter-pooling-rejected", (fixture) => rewriteFirstResult(fixture, (value) => { value.adapter = "claude"; }), /different adapter/u);
  expectFailure("input-root-overlap", () => {}, /must not overlap the materialized root/u, { materializedPath: resolve(work, "negative-input-root-overlap", "engineering-codex") });
  expectBoundaryFailure("output-inside-normalized-root", () => {}, (fixture) => ({
    materializedPath: fixture.materializedPath, selectionState: fixture.selectionState, runDir: fixture.runDir,
    outputPath: resolve(fixture.normalizedRoot, "result-set.json"),
  }), /output must not overlap the normalized results root/u);
  expectBoundaryFailure("output-equal-normalized-root", () => {}, (fixture) => ({
    materializedPath: fixture.materializedPath, selectionState: fixture.selectionState, runDir: fixture.runDir,
    outputPath: fixture.normalizedRoot,
  }), /output must not overlap the normalized results root/u);
  expectBoundaryFailure("output-inside-materialized-root", () => {}, (fixture) => ({
    materializedPath: fixture.materializedPath, selectionState: fixture.selectionState, runDir: fixture.runDir,
    outputPath: resolve(fixture.materializedPath, "result-set.json"),
  }), /output must not overlap the materialized root/u);
  expectBoundaryFailure("output-inside-selection-state-root", () => {}, (fixture) => ({
    materializedPath: fixture.materializedPath, selectionState: fixture.selectionState, runDir: fixture.runDir,
    outputPath: resolve(fixture.selectionState, "result-set.json"),
  }), /output must not overlap the selection-state root/u);
  expectBoundaryFailure("output-inside-run-root", () => {}, (fixture) => ({
    materializedPath: fixture.materializedPath, selectionState: fixture.selectionState, runDir: fixture.runDir,
    outputPath: resolve(fixture.runDir, "result-set.json"),
  }), /output must not overlap the execution run root/u);
  expectBoundaryFailure("output-inside-engineering-result-root", () => {}, (fixture) => ({
    materializedPath: fixture.materializedPath, selectionState: fixture.selectionState, runDir: fixture.runDir,
    outputPath: resolve(fixture.resultRoot, "result-set.json"),
  }), /output must not overlap the engineering result root/u);
  expectBoundaryFailure("output-ancestor-of-authority-roots", () => {}, (fixture) => ({
    materializedPath: fixture.materializedPath, selectionState: fixture.selectionState, runDir: fixture.runDir,
    outputPath: fixture.target,
  }), /output must not overlap the engineering result root|output must not overlap the normalized results root/u);

  for (const [name, inputRootField, expected] of [
    ["verify-input-inside-normalized-root", "normalizedRoot", /input must not overlap the normalized results root/u],
    ["verify-input-inside-engineering-result-root", "resultRoot", /input must not overlap the engineering result root/u],
  ]) {
    const fixture = cloneFixture(name);
    collectEngineeringResults(options(fixture));
    const contaminatedInput = resolve(fixture[inputRootField], "result-set-input.json");
    cpSync(fixture.outputPath, contaminatedInput);
    const before = inputEvidence(fixture);
    assert.throws(() => verifyEngineeringResultSet(options(fixture, { inputPath: contaminatedInput, outputPath: undefined })), expected, name);
    assertInputEvidenceUnchanged(fixture, before, name);
    covered.add(name);
  }

  const privateRepository = cloneFixture("repository-private-root");
  cpSync(resolve(root, "benchmarks/schemas"), resolve(privateRepository.target, "benchmarks/schemas"), { recursive: true });
  const privateResultRoot = resolve(privateRepository.target, "benchmarks/private-evaluator/results");
  cpSync(privateRepository.resultRoot, privateResultRoot, { recursive: true });
  assert.throws(() => collectEngineeringResults(options(privateRepository, { root: privateRepository.target, engineeringResultsPath: privateResultRoot })), /private evaluator root/u);
  covered.add("repository-private-root-overlap");

  const required = [
    "complete-one-adapter", "all-four-conditions", "plan-three-repetitions", "plan-five-repetitions", "complete-with-non-ready",
    "missing-result", "extra-result", "duplicate-engineering-result-id", "duplicate-engineering-result-digest", "duplicate-normalized-result-id",
    "duplicate-case-attempt", "duplicate-condition-repetition", "cross-adapter", "cross-plan", "cross-run", "cross-snapshot", "cross-condition",
    "cross-repetition", "cross-fixture", "normalized-digest-mismatch", "engineering-result-digest-drift", "engineering-result-id-drift",
    "source-manifest-raw-digest-drift", "source-manifest-semantic-digest-drift", "unapproved-resealed-source-manifest", "unanchored-source-manifest",
    "source-revision-matches-normalized-authority", "source-revision-mismatch", "source-revision-resealed-approved-mismatch",
    "source-revision-arbitrary-valid-hex", "source-revision-missing", "checked-in-source-revision-mismatch",
    "result-file-raw-byte-drift", "result-file-byte-count-drift", "source-manifest-subset-cherry-pick", "source-directory-inventory-mismatch",
    "unexpected-file", "missing-file", "source-root-symlink", "child-path-symlink", "path-escape", "windows-path", "non-regular-entry",
    "unordered-inventory", "count-drift", "result-set-id-drift", "result-set-digest-drift", "pre-existing-output", "output-symlink",
    "concurrent-output-publication", "failure-inputs-unchanged", "byte-identical-regeneration", "unknown-unavailable-not-zero",
    "result-set-id-binds-source-revision", "result-set-revision-drift", "bare-validator-is-not-full-authority-verification",
    "concurrent-verify-input-replacement", "same-byte-inode-replacement", "successful-external-output-inputs-unchanged",
    "full-verifier-returns-verified-results", "verified-results-match-inventory-order", "verified-results-preserve-non-ready-bodies",
    "verified-results-expose-score-and-telemetry", "consumer-does-not-reread-result-files",
    "verified-results-survive-post-return-file-replacement", "verified-results-mutation-isolated",
    "bare-validator-does-not-return-result-bodies", "verified-result-inventory-mismatch-rejected",
    "statistics-aggregate-schema-rejected", "adapter-pooling-rejected", "adapter-separate-result-sets", "checked-in-source-authority",
    "input-root-overlap", "output-inside-normalized-root", "output-equal-normalized-root", "output-inside-materialized-root",
    "output-inside-selection-state-root", "output-inside-run-root", "output-inside-engineering-result-root",
    "output-ancestor-of-authority-roots", "verify-input-inside-normalized-root", "verify-input-inside-engineering-result-root",
    "repository-private-root-overlap",
  ];
  assert.deepEqual([...covered].filter((name) => required.includes(name)).sort(), [...required].sort(), "focused result-set coverage inventory must remain closed");
  console.log(`ASK benchmark portfolio engineering result-set tests passed (${required.length} named closures)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
