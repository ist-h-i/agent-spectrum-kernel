#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeEvaluationDigest,
  computeEvaluationId,
  computeEvaluatorBundleDigest,
  computeEvaluatorBundleId,
  computeEvaluatorReferenceDigest,
  verifyEvaluatorBoundary,
  verifyPrivateEvaluatorBundle,
  verifyPublicEvaluatorReference,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(root, ".ask-benchmark-evaluator-boundary-test-"));
const privateWork = mkdtempSync(resolve(tmpdir(), "ask-private-evaluator-boundary-test-"));
const REVISION = "b".repeat(40);
const ADAPTERS = ["codex", "claude"];
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const STATUSES = ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"];
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
const ASSET_ROLES = [
  "oracle",
  "rubric",
  "hidden_tests",
  "matchers",
  "equivalent_solution_rules",
  "false_positive_boundaries",
  "scope_boundaries",
  "unsafe_action_rules",
  "evidence_removal_mutations",
  "human_evaluation_instructions",
  "reference_outcome",
].sort();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value) {
  return `sha256:${sha256(Buffer.from(String(value)))}`;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function clone(value) {
  return structuredClone(value);
}

function snapshot(path) {
  const records = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else records.push({ path: absolute.slice(path.length + 1), bytes: readFileSync(absolute).toString("base64") });
    }
  }
  walk(path);
  return records;
}

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function missing(status, reason) {
  return { status, value: null, reason };
}

function telemetry(outcome) {
  const missingStatus = outcome === "unavailable" ? "unavailable" : "unknown";
  return Object.fromEntries(TELEMETRY_FIELDS.map((field) => [
    field,
    field === "evaluator_quality_metrics"
      ? missing("not_applicable", "synthetic_pre_evaluation")
      : missing(missingStatus, outcome === "unavailable" ? "synthetic_runtime_unavailable" : "synthetic_unknown"),
  ]));
}

function caseId(index) {
  return `case-${index.toString(16).padStart(16, "0")}-${(index + 16).toString(16).padStart(16, "0")}`;
}

function blockId(index) {
  return `block-${index.toString(16).padStart(16, "0")}-${(index + 32).toString(16).padStart(12, "0")}`;
}

function normalizedResult({ source, adapterDigests, caseRecord, attempt, outcome }) {
  const finalOutput = outcome === "completed" ? { digest: digest(`${caseRecord.case_id}:${attempt}:final`), bytes: 64 } : { digest: null, bytes: null };
  const evidence = {
    request_digest: digest(`${caseRecord.case_id}:${attempt}:request`),
    raw_result_digest: digest(`${caseRecord.case_id}:${attempt}:result`),
    terminal_commit_digest: digest(`${caseRecord.case_id}:${attempt}:commit`),
    final_output_digest: finalOutput.digest,
    final_output_bytes: finalOutput.bytes,
  };
  const base = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-result.schema.json",
    program: "adaptive_ask_normalized_execution_result",
    lineage: {
      run_instance_id: source.run_instance_id,
      plan_id: source.plan_id,
      plan_digest: source.plan_digest,
      repository_revision: source.repository_revision,
      materialization_manifest_digest: source.materialization_manifest_digest,
      fixture_id: "synthetic-evaluator-fixture",
      fixture_input_digest: digest("synthetic-fixture-input"),
      suite: "calibration",
      task_class: "review",
      difficulty: "synthetic",
      registered_repetitions: 3,
      aggregate_eligible: false,
      case_id: caseRecord.case_id,
      attempt,
      adapter_track: caseRecord.adapter_track,
      condition: caseRecord.condition,
      repetition: caseRecord.repetition,
      condition_order_position: caseRecord.condition_order_position,
      block_id: caseRecord.block_id,
      runtime_identity_digest: adapterDigests[caseRecord.adapter_track],
      effective_command_digest: digest(`${caseRecord.adapter_track}:command`),
      environment_snapshot_digest: digest(`${caseRecord.adapter_track}:environment`),
      ...evidence,
      adaptive_selection_digest: caseRecord.condition === "adaptive_ask" ? digest(`${caseRecord.case_id}:selection`) : null,
    },
    outcome,
    telemetry: telemetry(outcome),
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
  const normalizedResultDigest = canonicalDigest(base);
  return {
    ...base,
    normalized_result_id: `normalized-${canonicalDigest({
      run_instance_id: source.run_instance_id,
      case_id: caseRecord.case_id,
      attempt,
      normalized_result_digest: normalizedResultDigest,
    }).slice("sha256:".length, "sha256:".length + 32)}`,
    normalized_result_digest: normalizedResultDigest,
  };
}

function coverage(cases, values, keyName, selector) {
  return values.map((value) => {
    const selected = cases.filter((entry) => selector(entry) === value);
    return {
      [keyName]: value,
      expected: selected.length,
      normalized: selected.filter((entry) => entry.normalized_attempts.length > 0).length,
      terminal: selected.filter((entry) => !["pending", "active"].includes(entry.status)).length,
      pending: selected.filter((entry) => entry.status === "pending").length,
      active: selected.filter((entry) => entry.status === "active").length,
      invalid: selected.filter((entry) => entry.status === "invalid").length,
    };
  });
}

function buildNormalizedCollection(path) {
  const source = {
    run_instance_id: "00000000-0000-4000-8000-000000000204",
    run_identity_digest: digest("synthetic-run-identity"),
    plan_id: `plan-${"2".repeat(64)}`,
    plan_digest: digest("synthetic-plan"),
    repository_revision: REVISION,
    materialization_manifest_digest: digest("synthetic-materialization"),
    selection_state_digest: digest("synthetic-selection-state"),
  };
  const adapterDigests = { codex: digest("codex-runtime-identity"), claude: digest("claude-runtime-identity") };
  const definitions = [
    { adapter_track: "codex", condition: "plain", status: "completed", attempts: ["completed"] },
    { adapter_track: "codex", condition: "kernel_only", status: "failed", attempts: ["failed", "failed"] },
    { adapter_track: "claude", condition: "adaptive_ask", status: "completed", attempts: ["completed"] },
    { adapter_track: "claude", condition: "full_ask", status: "unavailable", attempts: ["unavailable"] },
  ];
  const files = new Map();
  const records = [];
  const cases = definitions.map((definition, index) => {
    const record = {
      case_id: caseId(index + 1),
      adapter_track: definition.adapter_track,
      condition: definition.condition,
      fixture_id: "synthetic-evaluator-fixture",
      repetition: 1,
      condition_order_position: index + 1,
      block_id: blockId(index + 1),
      status: definition.status,
      attempt_count: definition.attempts.length,
      terminal_attempt: String(definition.attempts.length).padStart(4, "0"),
      normalized_attempts: [],
    };
    definition.attempts.forEach((outcome, attemptIndex) => {
      const attempt = String(attemptIndex + 1).padStart(4, "0");
      const normalized = normalizedResult({ source, adapterDigests, caseRecord: record, attempt, outcome });
      const resultPath = `adapters/${definition.adapter_track}/cases/${record.case_id}/attempts/${attempt}.json`;
      const bytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`);
      files.set(resultPath, bytes);
      records.push(normalized);
      record.normalized_attempts.push({ attempt, normalized_result_id: normalized.normalized_result_id, normalized_result_digest: normalized.normalized_result_digest, path: resultPath });
    });
    return record;
  }).sort((left, right) => ADAPTERS.indexOf(left.adapter_track) - ADAPTERS.indexOf(right.adapter_track) || left.case_id.localeCompare(right.case_id));

  const sourceSnapshot = {
    adapter_identities: [...ADAPTERS].sort().map((adapter) => ({ adapter, runtime_identity_digest: adapterDigests[adapter] })),
    cases: cases.map((entry) => ({
      case_id: entry.case_id,
      status: entry.status,
      attempt_count: entry.attempt_count,
      terminal_attempt: entry.terminal_attempt,
      state_digest: digest(`${entry.case_id}:state`),
      committed_attempts: entry.normalized_attempts.map((attempt) => {
        const normalized = records.find((candidate) => candidate.normalized_result_id === attempt.normalized_result_id);
        return {
          attempt: attempt.attempt,
          request_digest: normalized.lineage.request_digest,
          raw_result_digest: normalized.lineage.raw_result_digest,
          terminal_commit_digest: normalized.lineage.terminal_commit_digest,
          final_output_digest: normalized.lineage.final_output_digest,
          final_output_bytes: normalized.lineage.final_output_bytes,
        };
      }),
    })),
  };
  const sourceSnapshotDigest = canonicalDigest(sourceSnapshot);
  const inventory = [...files.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([resultPath, bytes]) => ({ path: resultPath, sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length }));
  const telemetryCoverage = TELEMETRY_FIELDS.map((field) => {
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
  const manifestWithoutDigest = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-run.schema.json",
    program: "adaptive_ask_normalized_execution_run",
    artifact_role: "derived_execution_evidence",
    normalizer: { version: "1.0.0", source_revision: source.repository_revision },
    source,
    source_snapshot: sourceSnapshot,
    source_snapshot_digest: sourceSnapshotDigest,
    output_root_identity: canonicalDigest({ run_instance_id: source.run_instance_id, plan_id: source.plan_id, normalizer_version: "1.0.0", source_snapshot_digest: sourceSnapshotDigest }),
    pool_adapter_results: false,
    completeness: {
      partial: false,
      expected_cases: cases.length,
      normalized_cases: cases.length,
      terminal_cases: cases.length,
      pending_cases: 0,
      active_cases: 0,
      invalid_cases: 0,
      by_adapter: coverage(cases, ADAPTERS, "adapter", (entry) => entry.adapter_track),
      by_condition: coverage(cases, CONDITIONS, "condition", (entry) => entry.condition),
      by_status: STATUSES.map((status) => ({ status, count: cases.filter((entry) => entry.status === status).length })),
      missing_case_ids: [],
      invalid_case_ids: [],
    },
    telemetry_coverage: telemetryCoverage,
    cases,
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
  const rootBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/normalized-portfolio-root.schema.json",
    program: "adaptive_ask_normalized_execution_collection",
    artifact_role: "immutable_snapshot_collection",
    normalizer: { version: "1.0.0", source_revision: source.repository_revision },
    source: {
      run_instance_id: source.run_instance_id,
      run_identity_digest: source.run_identity_digest,
      plan_id: source.plan_id,
      plan_digest: source.plan_digest,
      repository_revision: source.repository_revision,
    },
    generations_directory: "generations",
  };
  writeJson(resolve(path, "normalized-results-root.json"), { ...rootBase, output_collection_identity: canonicalDigest(rootBase) });
  const generation = resolve(path, "generations", `snapshot-${sourceSnapshotDigest.slice("sha256:".length)}`);
  for (const [resultPath, bytes] of files) {
    const target = resolve(generation, resultPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeJson(resolve(generation, "normalized-run.json"), manifest);
  return { generation, manifest, records, sourceSnapshotDigest };
}

function closeBundle(manifest) {
  manifest.evaluator_bundle_id = computeEvaluatorBundleId(manifest);
  manifest.evaluator_bundle_digest = computeEvaluatorBundleDigest(manifest);
  return manifest;
}

function referenceFor(manifest) {
  const reference = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-reference.schema.json",
    program: "adaptive_ask_evaluator_reference",
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_bundle_schema_version: manifest.schema_version,
    fixture_id: manifest.fixture_identity.fixture_id,
    fixture_input_digest: manifest.input_identity.fixture_input_digest,
    task_class: manifest.fixture_identity.task_class,
    suite: manifest.fixture_identity.suite,
    evaluator_revision: manifest.evaluator_revision,
    generator_identity: canonicalDigest(manifest.generator),
    independence_statement_digest: manifest.independence.statement_digest,
    review_record_digest: manifest.review.record_digest,
    storage_class: "private_evaluator",
    public_metadata_digest: digest("placeholder"),
  };
  reference.public_metadata_digest = computeEvaluatorReferenceDigest(reference);
  return reference;
}

function createPrivateBundle(path, normalized) {
  mkdirSync(path);
  const assetInventory = ASSET_ROLES.map((role) => {
    const assetPath = `assets/${role}.json`;
    const bytes = Buffer.from(`${JSON.stringify({ synthetic_role: role, fixture: "synthetic-evaluator-fixture" })}\n`);
    const target = resolve(path, assetPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return { role, path: assetPath, sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length, media_type: "application/json", required: true };
  });
  const manifest = closeBundle({
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/private-evaluator-bundle.schema.json",
    program: "adaptive_ask_private_evaluator_bundle",
    evaluator_bundle_id: `evaluator-${"0".repeat(64)}`,
    evaluator_bundle_digest: digest("placeholder"),
    fixture_identity: {
      fixture_id: normalized.lineage.fixture_id,
      task_class: normalized.lineage.task_class,
      suite: normalized.lineage.suite,
    },
    input_identity: { fixture_input_digest: normalized.lineage.fixture_input_digest },
    evaluator_revision: REVISION,
    generator: { id: "synthetic-generator", version: "1.0.0", source_digest: digest("synthetic-generator-source") },
    independence: {
      statement_digest: digest("synthetic-independent-generation-statement"),
      generated_without_agent_output: true,
      public_answer_sources_used: false,
      measured_agent_access_allowed: false,
    },
    review: { record_digest: digest("synthetic-independent-review-record"), status: "approved", reviewer_count: 2 },
    asset_inventory: assetInventory,
    capabilities: { automated_evaluation: true, manual_evaluation: true },
    boundaries: {
      private_evaluator_bundle: true,
      public_repository_allowed: false,
      public_ci_artifact_allowed: false,
      contains_answer_bearing_content: true,
    },
  });
  const manifestPath = resolve(path, "private-evaluator-bundle.json");
  writeJson(manifestPath, manifest);
  return { manifest, manifestPath };
}

function observation(state, normalized) {
  return {
    state,
    evidence_references: state === "pass" ? [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }] : [],
  };
}

function evaluatorResultFor(normalized, sourceSnapshotDigest, manifest, evaluationStatus) {
  const state = evaluationStatus === "completed" ? "pass" : evaluationStatus === "manual_review_required" ? "manual_review_required" : "unavailable";
  const result = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-result-envelope.schema.json",
    program: "adaptive_ask_evaluator_result",
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: normalized.lineage.run_instance_id,
    plan_id: normalized.lineage.plan_id,
    fixture_id: normalized.lineage.fixture_id,
    fixture_input_digest: normalized.lineage.fixture_input_digest,
    case_id: normalized.lineage.case_id,
    attempt: normalized.lineage.attempt,
    adapter: normalized.lineage.adapter_track,
    condition: normalized.lineage.condition,
    repetition: normalized.lineage.repetition,
    source_snapshot_digest: sourceSnapshotDigest,
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_revision: manifest.evaluator_revision,
    evaluation_id: `evaluation-${"0".repeat(32)}`,
    evaluation_digest: digest("placeholder"),
    evaluation_status: evaluationStatus,
    quality: observation(state, normalized),
    safety: observation(state, normalized),
    findings: evaluationStatus === "completed" ? [{ finding_id: "synthetic-finding", category: "scope-control", severity: "medium", evidence_references: [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }] }] : [],
    false_positives: [],
    scope_deviations: [],
    decision_correctness: observation(state, normalized),
    verification_correctness: observation(state, normalized),
    evidence_correctness: observation(state, normalized),
    approval_correctness: observation(state, normalized),
    completion_claim_correctness: observation(state, normalized),
    under_processing: observation(state, normalized),
    over_processing: observation(state, normalized),
    required_mechanisms: evaluationStatus === "completed" ? [{ mechanism_id: "scope-control", state: "observed", evidence_references: [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }] }] : [],
    unnecessary_mechanisms: [],
    unsafe_attempted_actions: [],
    evaluator_notes_state: { state: evaluationStatus === "manual_review_required" ? "manual_review_required" : "not_recorded", digest: null, bytes: null },
    privacy: {
      oracle_content_stored: false,
      rubric_content_stored: false,
      hidden_test_content_stored: false,
      matcher_content_stored: false,
      reference_answer_stored: false,
      raw_evaluator_prompt_stored: false,
      private_path_stored: false,
      secret_customer_or_personal_data_stored: false,
    },
  };
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  return result;
}

function closeResult(result) {
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  return result;
}

try {
  const materialized = resolve(work, "materialized");
  const selectionState = resolve(work, "selection-state");
  const runDir = resolve(work, "execution-run");
  const normalizedResults = resolve(work, "normalized-results");
  const publicArtifactRoot = resolve(work, "public-artifact");
  for (const path of [materialized, selectionState, runDir, publicArtifactRoot]) mkdirSync(path);
  const normalized = buildNormalizedCollection(normalizedResults);
  const completedCodex = normalized.records.find((entry) => entry.outcome === "completed" && entry.lineage.adapter_track === "codex");
  const failedCodex = normalized.records.filter((entry) => entry.outcome === "failed").at(-1);
  const completedClaude = normalized.records.find((entry) => entry.outcome === "completed" && entry.lineage.adapter_track === "claude");
  const unavailableClaude = normalized.records.find((entry) => entry.outcome === "unavailable");
  assert.ok(completedCodex && failedCodex && completedClaude && unavailableClaude);
  assert.equal(completedCodex.telemetry.input_tokens.status, "unknown", "synthetic normalized evidence must preserve typed unknown telemetry");
  assert.equal(failedCodex.lineage.attempt, "0002", "synthetic normalized evidence must include multiple attempts");

  const privateRoot = resolve(privateWork, "bundle");
  const { manifest, manifestPath } = createPrivateBundle(privateRoot, completedCodex);
  const referencePath = resolve(work, "evaluator-reference.json");
  writeJson(referencePath, referenceFor(manifest));
  const resultPaths = new Map();
  for (const [name, record, status] of [
    ["completed", completedCodex, "completed"],
    ["failed", failedCodex, "evaluator_failed"],
    ["manual", completedClaude, "manual_review_required"],
    ["unavailable", unavailableClaude, "evaluator_unavailable"],
  ]) {
    const path = resolve(work, `${name}-evaluator-result.json`);
    writeJson(path, evaluatorResultFor(record, normalized.sourceSnapshotDigest, manifest, status));
    resultPaths.set(name, path);
  }

  const commonCli = [
    "--reference", referencePath,
    "--private-root", privateRoot,
    "--manifest", manifestPath,
    "--materialized", materialized,
    "--selection-state", selectionState,
    "--run-dir", runDir,
    "--normalized-results", normalizedResults,
  ];
  const beforePrivate = snapshot(privateRoot);
  const beforeNormalized = snapshot(normalizedResults);
  const bundleVerification = run(["verify-evaluator-bundle", ...commonCli, "--public-artifact-root", publicArtifactRoot]);
  assert.equal(bundleVerification.stdout.includes(privateRoot), false, "public CLI output must not disclose the private evaluator root");
  for (const name of resultPaths.keys()) run(["verify-evaluator-result", ...commonCli, "--result", resultPaths.get(name)]);
  run(["verify-evaluator-boundary", ...commonCli, "--result", resultPaths.get("completed"), "--public-artifact-root", publicArtifactRoot]);
  assert.deepEqual(snapshot(privateRoot), beforePrivate, "evaluator verification must keep the private bundle byte-identical");
  assert.deepEqual(snapshot(normalizedResults), beforeNormalized, "evaluator verification must keep normalized results byte-identical");

  const baseOptions = {
    root,
    referencePath,
    privateRoot,
    manifestPath,
    resultPath: resultPaths.get("completed"),
    materializedPath: materialized,
    selectionState,
    runDir,
    normalizedResultsPath: normalizedResults,
  };
  const expectBoundaryFailure = (overrides, pattern, message) => assert.throws(() => verifyEvaluatorBoundary({ ...baseOptions, ...overrides }), pattern, message);

  const repositoryPrivateRoot = resolve(work, "private-inside-repository");
  cpSync(privateRoot, repositoryPrivateRoot, { recursive: true });
  expectBoundaryFailure({ privateRoot: repositoryPrivateRoot, manifestPath: resolve(repositoryPrivateRoot, "private-evaluator-bundle.json") }, /must not overlap the repository/u, "repository-local private bundles must be rejected");
  for (const [field, label, pattern] of [
    ["materializedPath", "materialized", /must not overlap the materialized/u],
    ["selectionState", "selection", /must not overlap the selection-state/u],
    ["runDir", "run", /must not overlap the execution run/u],
    ["normalizedResultsPath", "normalized", /must not overlap the normalized-results/u],
    ["publicArtifactRoot", "public artifact", /must not overlap the public artifact/u],
  ]) {
    expectBoundaryFailure({ [field]: privateRoot }, pattern, `private root overlap with ${label} evidence must be rejected`);
  }

  function referenceMutation(name, mutate) {
    const value = referenceFor(manifest);
    mutate(value);
    const path = resolve(work, `${name}-reference.json`);
    writeJson(path, value);
    assert.throws(() => verifyPublicEvaluatorReference({ root, referencePath: path, privateRoot }), /Schema validation|prohibited|private path|identity/u, `${name} public reference leakage must be rejected`);
  }
  referenceMutation("oracle-text", (value) => { value.oracle_text = "synthetic answer-bearing text"; });
  referenceMutation("private-inventory", (value) => { value.asset_inventory = [{ path: "assets/oracle.json" }]; });
  referenceMutation("absolute-posix-public", (value) => { value.private_evaluator_path = "/private/evaluator"; });
  referenceMutation("secret-public", (value) => { value.secret = "synthetic-secret"; });
  const driftedReference = referenceFor(manifest);
  driftedReference.review_record_digest = digest("drifted-review");
  const driftedReferencePath = resolve(work, "drifted-reference.json");
  writeJson(driftedReferencePath, driftedReference);
  assert.throws(() => verifyPublicEvaluatorReference({ root, referencePath: driftedReferencePath, privateRoot }), /deterministic identity/u, "public reference identity drift must be rejected");

  function clonedBundle(name) {
    const target = resolve(privateWork, name);
    cpSync(privateRoot, target, { recursive: true });
    return { privateRoot: target, manifestPath: resolve(target, "private-evaluator-bundle.json") };
  }

  function bundleMutation(name, mutate, { close = false, writeReference = false } = {}) {
    const bundle = clonedBundle(name);
    const value = JSON.parse(readFileSync(bundle.manifestPath, "utf8"));
    mutate(value, bundle.privateRoot);
    if (close) closeBundle(value);
    writeJson(bundle.manifestPath, value);
    const mutatedReferencePath = resolve(work, `${name}-bundle-reference.json`);
    if (writeReference) writeJson(mutatedReferencePath, referenceFor(value));
    return { ...bundle, referencePath: writeReference ? mutatedReferencePath : referencePath };
  }

  for (const [name, injectedPath] of [
    ["absolute-posix", "/private/oracle.json"],
    ["windows-drive", "C:\\private\\oracle.json"],
    ["unc", "\\\\server\\share\\oracle.json"],
    ["windows-device", "\\\\?\\C:\\private\\oracle.json"],
    ["path-escape", "../oracle.json"],
  ]) {
    const mutated = bundleMutation(name, (value) => { value.asset_inventory[0].path = injectedPath; });
    assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...mutated }), /Schema validation|portable normalized relative path/u, `${name} private asset path must be rejected`);
  }

  const rootLink = resolve(privateWork, "root-symlink");
  symlinkSync(privateRoot, rootLink);
  expectBoundaryFailure({ privateRoot: rootLink, manifestPath: resolve(rootLink, "private-evaluator-bundle.json") }, /must not be a symlink/u, "private root symlinks must be rejected");

  const manifestLink = clonedBundle("manifest-symlink");
  const externalManifest = resolve(privateWork, "external-manifest.json");
  cpSync(manifestLink.manifestPath, externalManifest);
  rmSync(manifestLink.manifestPath);
  symlinkSync(externalManifest, manifestLink.manifestPath);
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...manifestLink }), /traverses a symlink|must not be a symlink/u, "manifest symlinks must be rejected");

  const assetLink = clonedBundle("asset-symlink");
  const linkedAsset = manifest.asset_inventory[0].path;
  const externalAsset = resolve(privateWork, "external-asset.json");
  cpSync(resolve(assetLink.privateRoot, linkedAsset), externalAsset);
  rmSync(resolve(assetLink.privateRoot, linkedAsset));
  symlinkSync(externalAsset, resolve(assetLink.privateRoot, linkedAsset));
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...assetLink }), /contains a symlink|traverses a symlink/u, "asset symlinks must be rejected");

  const unexpected = clonedBundle("unexpected-file");
  writeFileSync(resolve(unexpected.privateRoot, "unexpected.txt"), "synthetic unmanaged file\n");
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...unexpected }), /unexpected or unmanaged/u, "unexpected private files must be rejected");
  const incomplete = clonedBundle("incomplete-staging");
  mkdirSync(resolve(incomplete.privateRoot, ".bundle-staging"));
  writeFileSync(resolve(incomplete.privateRoot, ".bundle-staging", "partial.json"), "{}\n");
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...incomplete }), /unexpected or unmanaged/u, "incomplete staging must be rejected");
  const missingAsset = clonedBundle("missing-required-asset");
  rmSync(resolve(missingAsset.privateRoot, manifest.asset_inventory[0].path));
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...missingAsset }), /asset is missing/u, "missing required assets must be rejected");

  const duplicateRole = bundleMutation("duplicate-role", (value) => { value.asset_inventory[1].role = value.asset_inventory[0].role; }, { close: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...duplicateRole }), /role inventory contains duplicates/u, "duplicate asset roles must be rejected");
  const duplicatePath = bundleMutation("duplicate-path", (value) => { value.asset_inventory[1].path = value.asset_inventory[0].path; }, { close: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...duplicatePath }), /path inventory contains duplicates/u, "duplicate asset paths must be rejected");
  const digestDrift = bundleMutation("asset-digest-drift", (value) => { value.asset_inventory[0].sha256 = digest("wrong-asset"); }, { close: true, writeReference: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...digestDrift }), /asset digest is invalid/u, "asset digest drift must be rejected");
  const bytesDrift = bundleMutation("asset-bytes-drift", (value) => { value.asset_inventory[0].bytes += 1; }, { close: true, writeReference: true });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...bytesDrift }), /byte count is invalid/u, "asset byte drift must be rejected");
  const bundleIdDrift = bundleMutation("bundle-id-drift", (value) => { value.evaluator_bundle_id = `evaluator-${"f".repeat(64)}`; });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...bundleIdDrift }), /bundle ID is invalid/u, "bundle ID drift must be rejected");
  const manifestDrift = bundleMutation("manifest-drift", (value) => { value.generator.version = "1.0.1"; });
  assert.throws(() => verifyPrivateEvaluatorBundle({ ...baseOptions, ...manifestDrift }), /bundle digest closure is invalid/u, "manifest modification must be rejected");

  const fixtureTransplant = bundleMutation("fixture-transplant", (value) => { value.fixture_identity.fixture_id = "other-fixture"; }, { close: true, writeReference: true });
  const fixtureTransplantResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  const fixtureTransplantManifest = JSON.parse(readFileSync(fixtureTransplant.manifestPath, "utf8"));
  fixtureTransplantResult.evaluator_bundle_id = fixtureTransplantManifest.evaluator_bundle_id;
  fixtureTransplantResult.evaluator_bundle_digest = fixtureTransplantManifest.evaluator_bundle_digest;
  closeResult(fixtureTransplantResult);
  const fixtureTransplantResultPath = resolve(work, "fixture-transplant-result.json");
  writeJson(fixtureTransplantResultPath, fixtureTransplantResult);
  expectBoundaryFailure({ ...fixtureTransplant, resultPath: fixtureTransplantResultPath }, /fixture_id|transplanted/u, "cross-fixture transplant must be rejected");
  const inputTransplant = bundleMutation("input-transplant", (value) => { value.input_identity.fixture_input_digest = digest("other-input"); }, { close: true, writeReference: true });
  const inputTransplantResult = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
  const inputTransplantManifest = JSON.parse(readFileSync(inputTransplant.manifestPath, "utf8"));
  inputTransplantResult.evaluator_bundle_id = inputTransplantManifest.evaluator_bundle_id;
  inputTransplantResult.evaluator_bundle_digest = inputTransplantManifest.evaluator_bundle_digest;
  closeResult(inputTransplantResult);
  const inputTransplantResultPath = resolve(work, "input-transplant-result.json");
  writeJson(inputTransplantResultPath, inputTransplantResult);
  expectBoundaryFailure({ ...inputTransplant, resultPath: inputTransplantResultPath }, /fixture_input_digest|transplanted/u, "cross-input transplant must be rejected");

  function resultMutation(name, mutate, { close = true } = {}) {
    const value = JSON.parse(readFileSync(resultPaths.get("completed"), "utf8"));
    mutate(value);
    if (close) closeResult(value);
    const path = resolve(work, `${name}-result.json`);
    writeJson(path, value);
    return path;
  }
  const otherNormalized = completedClaude;
  const normalizedTransplant = resultMutation("normalized-transplant", (value) => {
    value.normalized_result_id = otherNormalized.normalized_result_id;
    value.normalized_result_digest = otherNormalized.normalized_result_digest;
  });
  expectBoundaryFailure({ resultPath: normalizedTransplant }, /lineage mismatch|normalized result digest|mismatched normalized-result/u, "normalized-result transplant must be rejected");
  const crossRun = resultMutation("cross-run", (value) => { value.run_instance_id = "00000000-0000-4000-8000-000000000999"; });
  expectBoundaryFailure({ resultPath: crossRun }, /run_instance_id/u, "cross-run transplant must be rejected");
  const crossCase = resultMutation("cross-case", (value) => { value.case_id = otherNormalized.lineage.case_id; });
  expectBoundaryFailure({ resultPath: crossCase }, /case_id/u, "cross-case transplant must be rejected");
  const crossAttempt = resultMutation("cross-attempt", (value) => { value.attempt = "0002"; });
  expectBoundaryFailure({ resultPath: crossAttempt }, /attempt/u, "cross-attempt transplant must be rejected");
  const crossAdapter = resultMutation("cross-adapter", (value) => { value.adapter = "claude"; });
  expectBoundaryFailure({ resultPath: crossAdapter }, /adapter/u, "cross-adapter transplant must be rejected");
  const evaluationDigestDrift = resultMutation("evaluation-digest-drift", (value) => { value.quality.state = "fail"; }, { close: false });
  expectBoundaryFailure({ resultPath: evaluationDigestDrift }, /digest closure is invalid/u, "evaluator result digest drift must be rejected");
  for (const [name, field, value] of [
    ["hidden-answer", "hidden_answer", "synthetic hidden answer"],
    ["private-path", "private_evaluator_path", "/private/evaluator"],
    ["raw-prompt", "raw_evaluator_prompt", "synthetic evaluator prompt"],
    ["secret", "secret", "synthetic secret"],
  ]) {
    const path = resultMutation(name, (result) => { result[field] = value; });
    expectBoundaryFailure({ resultPath: path }, /Schema validation|prohibited|private path/u, `${name} evaluator result leakage must be rejected`);
  }

  const publication = resolve(work, "private-publication-attempt");
  mkdirSync(publication);
  cpSync(resolve(privateRoot, manifest.asset_inventory[0].path), resolve(publication, "artifact.json"));
  expectBoundaryFailure({ publicArtifactRoot: publication }, /byte-identical private evaluator material/u, "public CI artifact publication of private assets must be rejected");
  const manifestPublication = resolve(work, "private-manifest-publication-attempt");
  mkdirSync(manifestPublication);
  cpSync(manifestPath, resolve(manifestPublication, "bundle.json"));
  expectBoundaryFailure({ publicArtifactRoot: manifestPublication }, /byte-identical private evaluator material|private evaluator bundle manifest/u, "public CI artifact publication of the private manifest must be rejected");

  console.log("ASK benchmark evaluator boundary tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(privateWork, { recursive: true, force: true });
}
