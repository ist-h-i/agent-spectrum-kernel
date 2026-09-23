import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { computeEngineeringResultDigest, computeEngineeringResultId } from "./ask-benchmark-portfolio-score.mjs";
import { collectEngineeringResults, computeEngineeringResultSourceManifestDigest } from "./ask-benchmark-portfolio-result-set.mjs";
import { reportEngineeringResultRepetitions } from "./ask-benchmark-portfolio-repetition-report.mjs";
import { reportEngineeringPairedComparisons } from "./ask-benchmark-portfolio-paired-comparison-report.mjs";
import { reportPortfolioAggregateResult as reportLegacyAggregate } from "./ask-benchmark-portfolio-aggregate-result.mjs";
import {
  computePortfolioAggregateResultDigest,
  portfolioAggregateEvolutionEvidenceIdentity,
  reportPortfolioAggregateResult,
  verifyPortfolioAggregateResult,
} from "./ask-benchmark-portfolio-aggregate-result-v2.mjs";
import { computeClassificationRecordDigest, verifyPortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import { computeEvolutionArtifactInventoryDigest } from "./evolution-loop.mjs";

// Closed-file fixtures follow test-ask-benchmark-portfolio-result-set.mjs.
// Every source below is synthetic. No runtime/provider or private evaluator is
// invoked, and no production classification, admission or run is rewritten.
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const ADAPTERS = ["codex", "claude"];
const FIXTURE = "mp-accessibility-interaction-review";
const REPETITIONS = 3;
const REVISION = "1".repeat(40);
const RUN = "00000000-0000-4000-8000-000000000197";
const TELEMETRY = [
  "duration_ms", "exit_code", "final_output_bytes", "stdout_bytes", "stdout_digest", "stderr_bytes", "stderr_digest",
  "json_event_line_count", "harness_spawned_secondary_agent_count", "runtime_agent_count", "failure_kind",
  "capability_downgrade_count", "capability_downgrade_digest", "runtime_unavailable_reason_code",
  "runtime_unavailable_reason_digest", "runtime_unavailable_reason_bytes", "thermal_state", "model", "reasoning_effort",
  "sandbox_policy", "permission_policy", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost",
  "tool_call_count", "file_read_count", "human_effort", "unsafe_attempted_actions", "subagent_activity", "evaluator_quality_metrics",
];
const METRICS = ["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "human_effort", "tool_call_count", "file_read_count", "final_output_bytes", "runtime_agent_count", "harness_spawned_secondary_agent_count", "subagent_activity", "capability_downgrade_count"];
const CORRECTNESS = ["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety"];
const CATEGORIES = ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const digest = (value) => `sha256:${hash(value)}`;
const PLAN = `plan-${hash("aggregate-v2-file-plan")}`;
const PLAN_DIGEST = digest("aggregate-v2-file-plan-digest");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, jsonBytes(value));
}
function freezeJson(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}
function workspaceFields() {
  return {
    terminal_workspace_authority_availability: "unavailable", terminal_workspace_authority_support: "supported",
    terminal_workspace_authority_digest: null, terminal_workspace_tree_digest: null, terminal_workspace_authority_bytes: null,
  };
}
function normalizedRecord(adapter, condition, repetition) {
  const key = `${adapter}:${FIXTURE}:${condition}:${repetition}`;
  const caseId = `case-${hash(key).slice(0, 16)}-${hash(`case:${key}`).slice(0, 16)}`;
  const blockKey = `${adapter}:${FIXTURE}:${repetition}`;
  const ordinal = CONDITIONS.indexOf(condition) + 1;
  const telemetry = Object.fromEntries(TELEMETRY.map((field) => [field, { status: "unknown", value: null, reason: "synthetic_result_set_fixture" }]));
  for (const [field, value] of Object.entries({ input_tokens: ordinal * 10, output_tokens: ordinal * 20, duration_ms: ordinal * 5, human_effort: ordinal * 2, cached_tokens: ordinal })) {
    telemetry[field] = { status: "known", value, reason: "synthetic_result_set_fixture" };
  }
  const base = {
    schema_version: "1.3.0", schema_path: "benchmarks/schemas/normalized-portfolio-result.schema.json", program: "adaptive_ask_normalized_execution_result",
    lineage: {
      run_instance_id: RUN, plan_id: PLAN, plan_digest: PLAN_DIGEST, repository_revision: REVISION,
      materialization_manifest_digest: digest("synthetic-materialization"), fixture_id: FIXTURE, fixture_input_digest: digest(`fixture:${FIXTURE}`),
      suite: "mechanism_positive", task_class: "pr_review", difficulty: "synthetic", registered_repetitions: REPETITIONS, aggregate_eligible: true,
      case_id: caseId, attempt: "0001", adapter_track: adapter, condition, repetition, condition_order_position: ordinal,
      block_id: `block-${hash(blockKey).slice(0, 16)}-${hash(`block:${blockKey}`).slice(0, 12)}`,
      runtime_identity_digest: digest(`runtime:${adapter}`), effective_command_digest: digest(`command:${adapter}`), environment_snapshot_digest: digest(`environment:${adapter}`),
      request_digest: digest(`request:${caseId}`), raw_result_digest: digest(`raw:${caseId}`), terminal_commit_digest: digest(`commit:${caseId}`),
      final_output_digest: null, final_output_bytes: null, adaptive_selection_digest: condition === "adaptive_ask" ? digest(`selection:${caseId}`) : null,
      ...workspaceFields(),
    },
    outcome: "completed",
    command_evidence: {
      manifest_digest: digest(`command-evidence:${caseId}`), capture_support: adapter === "codex" ? "supported" : "unsupported", evidence_level: "unavailable", command_event_count: 0,
      verification_command_contract_digest: null, required_command_ids: [], required_alternative_groups: [], command_summaries: [], attempted_command_ids: [], succeeded_command_ids: [], failed_command_ids: [], declined_command_ids: [], unavailable_command_ids: [], unmatched_command_count: 0, cwd_unverified_command_count: 0, references: [], declined_references: [],
    },
    telemetry,
    privacy: { raw_stdout_stored: false, raw_stderr_stored: false, final_output_content_stored: false, prompt_stored: false, transcript_stored: false, environment_values_stored: false, absolute_private_paths_stored: false },
  };
  const normalized_result_digest = canonicalDigest(base);
  const normalized_result_id = `normalized-${canonicalDigest({ run_instance_id: RUN, case_id: caseId, attempt: "0001", normalized_result_digest }).slice(7, 39)}`;
  return { ...base, normalized_result_id, normalized_result_digest };
}
function buildNormalizedRoot(target) {
  const records = ADAPTERS.flatMap((adapter) => CONDITIONS.flatMap((condition) => Array.from({ length: REPETITIONS }, (_, index) => normalizedRecord(adapter, condition, index + 1))));
  records.sort((a, b) => ADAPTERS.indexOf(a.lineage.adapter_track) - ADAPTERS.indexOf(b.lineage.adapter_track) || a.lineage.case_id.localeCompare(b.lineage.case_id));
  const source_snapshot = {
    adapter_identities: [...ADAPTERS].sort().map((adapter) => ({ adapter, runtime_identity_digest: digest(`runtime:${adapter}`) })),
    cases: records.map(({ lineage: l, outcome }) => ({
      case_id: l.case_id, status: outcome, attempt_count: 1, terminal_attempt: l.attempt, state_digest: digest(`state:${l.case_id}:${outcome}`),
      committed_attempts: [{ attempt: l.attempt, request_digest: l.request_digest, command_evidence_digest: digest(`command-evidence-file:${l.case_id}`), raw_result_digest: l.raw_result_digest, terminal_commit_digest: l.terminal_commit_digest, final_output_digest: null, final_output_bytes: null, ...workspaceFields() }],
    })),
  };
  const sourceSnapshotDigest = canonicalDigest(source_snapshot);
  const generation = resolve(target, "generations", `snapshot-${sourceSnapshotDigest.slice(7)}`);
  const inventory = [];
  const cases = records.map((record) => {
    const l = record.lineage;
    const path = `results/${l.adapter_track}/${l.case_id}-${l.attempt}.json`;
    writeJson(resolve(generation, path), record);
    const bytes = readFileSync(resolve(generation, path));
    inventory.push({ path, sha256: digest(bytes), bytes: bytes.length });
    return {
      case_id: l.case_id, adapter_track: l.adapter_track, condition: l.condition, fixture_id: FIXTURE, repetition: l.repetition,
      condition_order_position: l.condition_order_position, block_id: l.block_id, status: record.outcome, attempt_count: 1, terminal_attempt: l.attempt,
      normalized_attempts: [{ attempt: l.attempt, normalized_result_id: record.normalized_result_id, normalized_result_digest: record.normalized_result_digest, path }],
    };
  });
  const coverage = (names, key, field) => names.map((name) => {
    const count = cases.filter((item) => item[field] === name).length;
    return { [key]: name, expected: count, normalized: count, terminal: count, pending: 0, active: 0, invalid: 0 };
  });
  const manifestBase = {
    schema_version: "1.3.0", schema_path: "benchmarks/schemas/normalized-portfolio-run.schema.json", program: "adaptive_ask_normalized_execution_run", artifact_role: "derived_execution_evidence",
    normalizer: { version: "1.3.0", source_revision: REVISION },
    source: { run_instance_id: RUN, run_identity_digest: digest("run-identity"), plan_id: PLAN, plan_digest: PLAN_DIGEST, repository_revision: REVISION, materialization_manifest_digest: digest("synthetic-materialization"), selection_state_digest: digest("synthetic-selection-state") },
    source_snapshot, source_snapshot_digest: sourceSnapshotDigest,
    output_root_identity: canonicalDigest({ run_instance_id: RUN, plan_id: PLAN, normalizer_version: "1.3.0", source_snapshot_digest: sourceSnapshotDigest }),
    pool_adapter_results: false,
    completeness: {
      partial: false, expected_cases: cases.length, normalized_cases: cases.length, terminal_cases: cases.length, pending_cases: 0, active_cases: 0, invalid_cases: 0,
      by_adapter: coverage(ADAPTERS, "adapter", "adapter_track"), by_condition: coverage(CONDITIONS, "condition", "condition"),
      by_status: ["pending", "active", "completed", "failed", "unavailable", "interrupted", "invalid"].map((status) => ({ status, count: cases.filter((item) => item.status === status).length })),
      missing_case_ids: [], invalid_case_ids: [],
    },
    telemetry_coverage: TELEMETRY.map((field) => ({
      field, ...Object.fromEntries(["known", "unknown", "unavailable", "not_applicable"].map((status) => [status, records.filter((record) => record.telemetry[field].status === status).length])), total: records.length,
    })),
    cases, inventory, publication_digest: canonicalDigest({ source_snapshot_digest: sourceSnapshotDigest, inventory }),
    boundaries: { evaluator_result: false, score: false, product_value_claim: false, raw_execution_artifacts_are_authoritative: true, measured_execution_authorized: false, issue_198_stage_0_authorized: false },
  };
  const manifest = { ...manifestBase, normalized_run_digest: canonicalDigest(manifestBase) };
  writeJson(resolve(generation, "normalized-run.json"), manifest);
  const collection = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/normalized-portfolio-root.schema.json", program: "adaptive_ask_normalized_execution_collection", artifact_role: "immutable_snapshot_collection",
    normalizer: { version: "1.3.0", source_revision: REVISION },
    source: { run_instance_id: RUN, run_identity_digest: digest("run-identity"), plan_id: PLAN, plan_digest: PLAN_DIGEST, repository_revision: REVISION }, generations_directory: "generations",
  };
  writeJson(resolve(target, "normalized-results-root.json"), { ...collection, output_collection_identity: canonicalDigest(collection) });
  return { records, manifest, sourceSnapshotDigest };
}
function engineeringResult(record, sourceSnapshotDigest, policyDigest) {
  const l = record.lineage;
  const score = (CONDITIONS.indexOf(l.condition) + 1) / 4;
  const metric = (name) => structuredClone(record.telemetry[name]);
  const base = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-engineering-result.schema.json", program: "adaptive_ask_portfolio_engineering_result",
    scoring_status: "complete", scoring_reason: "completed_evaluation_scoring_ready", scoring_input_freeze_manifest_source_digest: digest("freeze-source"), scoring_input_freeze_manifest_digest: digest("freeze-manifest"),
    catalog_digest: digest("catalog"), policy_manifest_digest: digest("policy-manifest"), scoring_policy_digest: policyDigest, admission_record_digest: digest(`admission:${FIXTURE}`),
    effective_admission_mode: "legacy_admitted_record", effective_admission_status: "admitted", frozen_admission_record_digest: digest(`admission:${FIXTURE}`), requirement_authority_digest: digest(`admission:${FIXTURE}`), admission_decision_digest: null, admission_decision_revision: null,
    requirement_record_digest: digest(`requirements:${FIXTURE}`), requirement_set_digest: digest(`requirement-set:${FIXTURE}`), output_contract_digest: digest(`output-contract:${FIXTURE}`), evaluator_public_reference_digest: digest(`evaluator-reference:${FIXTURE}`),
    evaluation_id: `evaluation-${hash(`evaluation:${record.normalized_result_id}`).slice(0, 32)}`, evaluation_digest: digest(`evaluation:${record.normalized_result_id}`), evaluation_status: "completed",
    evaluator_bundle_id: `evaluator-${hash(`bundle:${FIXTURE}`)}`, evaluator_bundle_digest: digest(`bundle-digest:${FIXTURE}`), evaluator_revision: REVISION,
    normalized_result_id: record.normalized_result_id, normalized_result_digest: record.normalized_result_digest, normalized_outcome: record.outcome, source_snapshot_digest: sourceSnapshotDigest,
    run_instance_id: RUN, plan_id: PLAN, plan_digest: PLAN_DIGEST, fixture_id: FIXTURE, fixture_input_digest: l.fixture_input_digest, suite: l.suite, task_class: l.task_class, case_id: l.case_id, attempt: l.attempt, adapter: l.adapter_track, condition: l.condition, repetition: l.repetition,
    requirement_score: { scored_requirement_count: 1, requirement_points_earned: score, requirement_points_possible: 1, normalized_requirement_score: score },
    blockers: { requirement_ids: [], outcomes: [], non_pass_requirement_ids: [], gate_status: "not_applicable" },
    false_positives: { raw_count: 0, findings: [], severity_counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }, false_positive_units: null, unit_mapping_status: "not_implemented_no_approved_mapping" },
    scope_deviations: { raw_count: 0, findings: [] }, correctness_observations: Object.fromEntries(CORRECTNESS.map((name) => [name, { state: "unknown", evidence_references: [] }])),
    unsafe_actions: { categories: CATEGORIES.map((category_id) => ({ category_id, attempted_count: 0, blocked_count: 0, unknown_count: 0, action_ids: [], evidence_references: [] })) },
    safety_blocker: { status: "pass", reason: "completed_evaluation_scoring_ready", category_ids: [], action_ids: [] }, mechanism_observations: { required_mechanisms: [], unnecessary_mechanisms: [], quality_credit_applied: false },
    overhead_telemetry: { ...Object.fromEntries(METRICS.map((name) => [name, metric(name)])), runtime_unavailable_reason: { code: metric("runtime_unavailable_reason_code"), digest: metric("runtime_unavailable_reason_digest"), bytes: metric("runtime_unavailable_reason_bytes") } },
    boundaries: { single_evaluator_result: true, single_normalized_attempt: true, aggregate_result: false, comparison_result: false, false_positive_units_calculated: false, correctness_penalty_calculated: false, mechanism_scorecard_calculated: false, variance_calculated: false, practice_weight_applied: false },
    privacy: { private_evaluator_content_stored: false, private_path_stored: false, raw_evaluator_prompt_stored: false, secret_customer_or_personal_data_stored: false },
  };
  const withId = { ...base, engineering_result_id: computeEngineeringResultId(base) };
  return { ...withId, engineering_result_digest: computeEngineeringResultDigest(withId) };
}
function buildFileInputs(root, target, authorities) {
  const normalizedRoot = resolve(target, "normalized");
  const normalized = buildNormalizedRoot(normalizedRoot);
  const resultRoot = resolve(target, "engineering-codex");
  const inventory = normalized.records.filter((record) => record.lineage.adapter_track === "codex").map((record) => {
    const result = engineeringResult(record, normalized.sourceSnapshotDigest, authorities.verified_scoring_policy.policy_digest);
    const path = `${FIXTURE}/${result.condition}/${String(result.repetition).padStart(2, "0")}.json`;
    writeJson(resolve(resultRoot, path), result);
    const bytes = readFileSync(resolve(resultRoot, path));
    const keys = ["engineering_result_id", "engineering_result_digest", "effective_admission_mode", "effective_admission_status", "frozen_admission_record_digest", "requirement_authority_digest", "admission_decision_digest", "admission_decision_revision", "normalized_result_id", "normalized_result_digest", "case_id", "attempt", "condition", "repetition"];
    return { path, raw_byte_digest: digest(bytes), bytes: bytes.length, ...Object.fromEntries(keys.map((key) => [key, result[key]])) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const source = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json", program: "adaptive_ask_portfolio_engineering_result_source_manifest",
    plan_id: PLAN, plan_digest: PLAN_DIGEST, run_instance_id: RUN, source_snapshot_digest: normalized.sourceSnapshotDigest, adapter_track: "codex",
    normalized_generation_id: `snapshot-${normalized.sourceSnapshotDigest.slice(7)}`, normalized_manifest_digest: normalized.manifest.normalized_run_digest, inventory, source_revision: REVISION,
  };
  const sourcePath = resolve(target, "source-codex.json");
  writeJson(sourcePath, { ...source, manifest_digest: computeEngineeringResultSourceManifestDigest(source) });
  return { root, normalizedResultsPath: normalizedRoot, sourceSnapshotDigest: normalized.sourceSnapshotDigest, engineeringResultsPath: resultRoot, sourceManifestPath: sourcePath, sourceManifestSourceDigest: digest(readFileSync(sourcePath)), adapter: "codex" };
}
function classificationOptions(authorityRoot, authorities, excluded) {
  const name = excluded ? "excluded" : "eligible";
  const path = `classification/${name}.json`;
  const record = {
    classification_record_id: `classification-v2-files-${name}`, classification_record_schema_path: "benchmarks/schemas/portfolio-classification-record.schema.json", classification_record_path: path,
    fixture_id: FIXTURE, fixture_role: "primary", catalog_digest: authorities.verified_catalog.catalog_digest, policy_manifest_digest: authorities.verified_policy_manifest.manifest_digest,
    pilot_result_digest: digest("synthetic-file-pilot"), supported_adapter_tracks: ["codex"], ceiling_classification_result: excluded ? "candidate" : "not_candidate", floor_classification_result: "not_candidate",
    classification_state: excluded ? "redesign_required" : "primary_eligible", reason_codes: [excluded ? "ceiling_candidate" : "ceiling_and_floor_not_candidate"], classification_revision: 1,
  };
  writeJson(resolve(authorityRoot, path), { ...record, classification_digest: computeClassificationRecordDigest(record) });
  return { aggregateAuthorityRoot: authorityRoot, classificationRecordPaths: [path], lineageRecordPaths: [], immutableArtifactDigests: { [path]: digest(readFileSync(resolve(authorityRoot, path))) } };
}

export function runAggregateV2FileRegressions({ root, work, check }) {
  const target = resolve(work, "v2-files");
  const authorities = verifyPortfolioPolicyArtifacts({ root });
  const inputs = buildFileInputs(root, target, authorities);
  const authorityRoot = resolve(target, "classification-authority");
  const resultSetPath = resolve(target, "result-set.json");
  const repetitionReportPath = resolve(target, "repetition.json");
  const comparisonReportPath = resolve(target, "paired.json");
  const aggregateResultPath = resolve(target, "aggregate.json");
  const options = { ...inputs, ...classificationOptions(authorityRoot, authorities, false), resultSetPath, repetitionReportPath, comparisonReportPath, comparisonView: "adaptive_vs_kernel", suite: "mechanism_positive", taskClass: "pr_review" };
  let verified;
  let identity;
  check("v2 files pass real upstream verifiers publication and aggregate reverification", () => {
    collectEngineeringResults({ ...inputs, outputPath: resultSetPath });
    reportEngineeringResultRepetitions({ ...inputs, inputPath: resultSetPath, outputPath: repetitionReportPath });
    reportEngineeringPairedComparisons({ ...options, outputPath: comparisonReportPath });
    const published = reportPortfolioAggregateResult({ ...options, outputPath: aggregateResultPath });
    assert.throws(() => portfolioAggregateEvolutionEvidenceIdentity(published), /issued by verifyPortfolioAggregateResult/);
    verified = verifyPortfolioAggregateResult({ ...options, aggregateResultPath });
    const artifact = verified.verified_aggregate_result;
    assert.equal(artifact.overhead_component_vector.token_count_delta.value, 30);
    assert.equal(artifact.overhead_component_vector.latency_delta.value, 5);
    assert.equal(artifact.overhead_component_vector.human_effort_delta.value, 2);
    assert.equal(artifact.result_status, "complete");
    identity = portfolioAggregateEvolutionEvidenceIdentity(verified);
    assert.deepEqual(identity, { source_kind: "portfolio_aggregate_result", artifact_id: artifact.aggregate_result_id, artifact_digest: artifact.aggregate_result_digest, result_status: "complete" });
    assert.deepEqual(JSON.parse(readFileSync(aggregateResultPath, "utf8")), artifact);
  });
  check("issued aggregate authority cannot be replaced and copied wrappers are untrusted", () => {
    assert.ok(Object.isFrozen(verified));
    assert.throws(() => { verified.verified_aggregate_result = {}; }, TypeError);
    assert.throws(() => { verified.verified_aggregate_result.result_status = "insufficient_evidence"; }, TypeError);
    assert.throws(() => portfolioAggregateEvolutionEvidenceIdentity({ ...verified }), /issued by verifyPortfolioAggregateResult/);
    assert.deepEqual(portfolioAggregateEvolutionEvidenceIdentity(verified), identity);
  });
  let excludedVerified;
  check("all-excluded files publish and reverify as insufficient instead of throwing", () => {
    const excludedOptions = { ...options, ...classificationOptions(authorityRoot, authorities, true) };
    const path = resolve(target, "excluded-aggregate.json");
    reportPortfolioAggregateResult({ ...excludedOptions, outputPath: path });
    excludedVerified = verifyPortfolioAggregateResult({ ...excludedOptions, aggregateResultPath: path });
    assert.deepEqual(excludedVerified.verified_aggregate_result.included_fixture_ids, []);
    assert.equal(excludedVerified.verified_aggregate_result.overhead_component_vector.false_positive_unit_delta.state, "unknown");
    assert.equal(portfolioAggregateEvolutionEvidenceIdentity(excludedVerified).result_status, "insufficient_evidence");
  });
  check("cloned refrozen and rehashed complete claims never become issued authority", () => {
    for (const reseal of [false, true]) {
      // Copy only JSON authority fields, not the verifier's byte buffers.
      const forged = structuredClone({ verified_aggregate_result: excludedVerified.verified_aggregate_result, verified_comparison: { verified_comparison_report: excludedVerified.verified_comparison.verified_comparison_report }, verified_policy_artifacts: { verified_scoring_policy: excludedVerified.verified_policy_artifacts.verified_scoring_policy } });
      forged.verified_aggregate_result.result_status = "complete";
      if (reseal) forged.verified_aggregate_result.aggregate_result_digest = computePortfolioAggregateResultDigest(forged.verified_aggregate_result);
      freezeJson(forged);
      assert.throws(() => portfolioAggregateEvolutionEvidenceIdentity(forged), /issued by verifyPortfolioAggregateResult/);
    }
  });
  check("rehashed sensitivity file tampering is rejected by full rederivation", () => {
    const forged = structuredClone(verified.verified_aggregate_result);
    forged.sensitivity_views[0].conclusion = "stable";
    forged.aggregate_result_digest = computePortfolioAggregateResultDigest(forged);
    const path = resolve(target, "forged-aggregate.json");
    writeJson(path, forged);
    assert.throws(() => verifyPortfolioAggregateResult({ ...options, aggregateResultPath: path }), /does not match the re-derived full authority report/);
  });
  check("legacy files remain readable but cannot mint v2 Evolution identities", () => {
    const path = resolve(target, "legacy-aggregate.json");
    reportLegacyAggregate({ ...options, outputPath: path });
    const legacy = verifyPortfolioAggregateResult({ ...options, aggregateResultPath: path });
    assert.equal(legacy.verified_aggregate_result.result_status, "insufficient_evidence");
    assert.throws(() => portfolioAggregateEvolutionEvidenceIdentity(legacy), /legacy aggregate artifacts are not v2 Evolution evidence/);
  });
  check("issued v2 identities bind the existing six-dimension inventory exactly", () => {
    // Inventory integration only; uncollected dimensions are not scored or
    // represented as complete recommendation/Asset/Portfolio evidence.
    const dimensions = {
      quality: identity, safety: identity, cost: identity,
      variance: { source_kind: "repetition_report", artifact_id: verified.verified_comparison.verified_repetition_report.repetition_report_id, artifact_digest: verified.verified_comparison.verified_repetition_report.repetition_report_digest },
      mechanism: { source_kind: "mechanism_scorecard", artifact_id: "not-collected-mechanism", artifact_digest: digest("synthetic-unavailable-mechanism"), status: "unavailable" },
      external_outcome: { source_kind: "external_outcome_report", artifact_id: "not-collected-external", artifact_digest: digest("synthetic-unavailable-external"), status: "unavailable" },
    };
    const inventoryDigest = computeEvolutionArtifactInventoryDigest(dimensions);
    assert.match(inventoryDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(inventoryDigest, computeEvolutionArtifactInventoryDigest(structuredClone(dimensions)));
    const transplanted = structuredClone(dimensions);
    transplanted.cost.artifact_digest = digest("different-aggregate");
    assert.notEqual(inventoryDigest, computeEvolutionArtifactInventoryDigest(transplanted));
  });
  check("changed pinned source bytes fail reverification without changing output", () => {
    const before = readFileSync(aggregateResultPath);
    const source = readFileSync(inputs.sourceManifestPath);
    try {
      writeFileSync(inputs.sourceManifestPath, Buffer.concat([source, Buffer.from(" ")]));
      assert.throws(() => verifyPortfolioAggregateResult({ ...options, aggregateResultPath }), /digest|source bytes|source manifest/);
      assert.deepEqual(readFileSync(aggregateResultPath), before);
    } finally {
      writeFileSync(inputs.sourceManifestPath, source);
    }
  });
}
