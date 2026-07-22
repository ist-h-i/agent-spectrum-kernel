import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { DEFAULT_PORTFOLIO_CATALOG_PATH } from "./ask-benchmark-portfolio-catalog.mjs";
import {
  DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH,
  DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH,
  DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH,
  DEFAULT_PORTFOLIO_SCORING_POLICY_PATH,
  verifyPortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";
import { derivePortfolioDistribution, verifyEngineeringRepetitionReport } from "./ask-benchmark-portfolio-repetition-report.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const PORTFOLIO_PAIRED_COMPARISON_REPORT_SCHEMA_PATH = "benchmarks/schemas/portfolio-paired-comparison-report.schema.json";
export const PORTFOLIO_PAIRED_COMPARISON_POLICY_REVISION = "issue-205-checkpoint-b1-r3";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONDITIONS = Object.freeze(["plain", "kernel_only", "adaptive_ask", "full_ask"]);
const EXPECTED_VIEWS = Object.freeze([
  Object.freeze({ view_id: "kernel_vs_plain", comparison_condition: "kernel_only", baseline_condition: "plain", view_role: "primary_product_hypothesis" }),
  Object.freeze({ view_id: "adaptive_vs_kernel", comparison_condition: "adaptive_ask", baseline_condition: "kernel_only", view_role: "primary_product_hypothesis" }),
  Object.freeze({ view_id: "full_vs_kernel_diagnostic", comparison_condition: "full_ask", baseline_condition: "kernel_only", view_role: "diagnostic_only" }),
]);
const TELEMETRY_METRICS = Object.freeze([
  ["duration_ms", "milliseconds"], ["input_tokens", "tokens"], ["output_tokens", "tokens"], ["cached_tokens", "tokens"],
  ["monetary_cost", "native_cost"], ["human_effort", "native_effort"], ["tool_call_count", "count"], ["file_read_count", "count"],
  ["final_output_bytes", "bytes"], ["runtime_agent_count", "count"], ["harness_spawned_secondary_agent_count", "count"],
  ["subagent_activity", "count"], ["capability_downgrade_count", "count"],
]);
const SEVERITIES = Object.freeze(["critical", "high", "medium", "low", "informational"]);
const CORRECTNESS_KEYS = Object.freeze([
  "decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness",
  "under_processing", "over_processing", "quality", "safety",
]);
const UNSAFE_CATEGORY_IDS = Object.freeze(["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"]);
const BLOCKER_STATES = Object.freeze(["pass", "fail", "not_applicable", "not_scoring_ready"]);
const SAFETY_STATES = Object.freeze(["pass", "fail", "unknown", "not_scoring_ready"]);
const MAX_REPORT_BYTES = 512 * 1024 * 1024;
const PRIVATE_PATH_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;
const ABSOLUTE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function finiteDelta(comparison, baseline, label) {
  const value = comparison - baseline;
  if (!Number.isFinite(value)) throw new Error(`${label} delta is not finite`);
  return normalizeZero(value);
}

function assertPrivacy(value, path = "$") {
  if (typeof value === "string") {
    if (ABSOLUTE_PATH_PATTERN.test(value)) throw new Error(`${path} must not contain an absolute filesystem path`);
    if (PRIVATE_PATH_PATTERN.test(value)) throw new Error(`${path} must not contain a private evaluator path`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => assertPrivacy(entry, `${path}[${index}]`));
  if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) assertPrivacy(entry, `${path}.${key}`);
}

function assertComparisonViews(views) {
  if (stableCanonicalJson(views) !== stableCanonicalJson(EXPECTED_VIEWS)) throw new Error("B1 comparison views must match the frozen three-view order and definitions");
  if (new Set(views.map(({ view_id }) => view_id)).size !== views.length) throw new Error("B1 comparison view IDs must be unique");
  for (const view of views) {
    if (view.baseline_condition === view.comparison_condition) throw new Error(`${view.view_id} baseline and comparison conditions must differ`);
    if (![view.baseline_condition, view.comparison_condition].every((condition) => CONDITIONS.includes(condition))) throw new Error(`${view.view_id} uses a condition outside the four-condition contract`);
  }
}

function mechanismProjection(observation) {
  const projected = [
    ...observation.mechanism_observations.required_mechanisms.map(({ mechanism_id, state }) => ({ mechanism_id, classification: "required", state })),
    ...observation.mechanism_observations.unnecessary_mechanisms.map(({ mechanism_id, state }) => ({ mechanism_id, classification: "unnecessary", state })),
  ].sort((left, right) => left.mechanism_id.localeCompare(right.mechanism_id) || left.classification.localeCompare(right.classification));
  if (new Set(projected.map(({ mechanism_id }) => mechanism_id)).size !== projected.length) throw new Error("mechanism IDs must be unique across required and unnecessary inventories");
  return projected;
}

function sourceProjection(observation, rawResult, fixture) {
  for (const [field, observed] of [
    ["repetition", observation.repetition], ["condition", rawResult.condition], ["engineering_result_id", observation.engineering_result_id],
    ["engineering_result_digest", observation.engineering_result_digest], ["normalized_result_id", observation.normalized_result_id],
    ["normalized_result_digest", observation.normalized_result_digest], ["evaluation_id", observation.evaluation_id], ["evaluation_digest", observation.evaluation_digest],
  ]) if (rawResult[field] !== observed) throw new Error(`verified repetition observation and result-set authority disagree on ${field}`);
  const correctness_states = Object.fromEntries(CORRECTNESS_KEYS.map((key) => [key, observation.correctness_observations[key].state]));
  return {
    repetition: observation.repetition,
    condition: rawResult.condition,
    path: observation.path,
    raw_byte_digest: observation.raw_byte_digest,
    bytes: observation.bytes,
    engineering_result_id: observation.engineering_result_id,
    engineering_result_digest: observation.engineering_result_digest,
    normalized_result_id: observation.normalized_result_id,
    normalized_result_digest: observation.normalized_result_digest,
    evaluation_id: observation.evaluation_id,
    evaluation_digest: observation.evaluation_digest,
    fixture_id: rawResult.fixture_id,
    fixture_input_digest: rawResult.fixture_input_digest,
    suite: rawResult.suite,
    task_class: rawResult.task_class,
    adapter: rawResult.adapter,
    expected_repetition_count: fixture.expected_repetition_count,
    scoring_policy_digest: rawResult.scoring_policy_digest,
    requirement_record_digest: rawResult.requirement_record_digest,
    scoring_input_freeze_manifest_digest: rawResult.scoring_input_freeze_manifest_digest,
    normalized_outcome: observation.normalized_outcome,
    evaluation_status: observation.evaluation_status,
    scoring_status: observation.scoring_status,
    scoring_reason: observation.scoring_reason,
    blocker_gate_status: observation.blocker_gate_status,
    safety_blocker_status: observation.safety_blocker_status,
    normalized_requirement_score: observation.requirement_score.normalized_requirement_score,
    false_positive_raw_count: observation.false_positive_raw_count,
    false_positive_severity_counts: structuredClone(observation.false_positive_severity_counts),
    scope_deviation_raw_count: observation.scope_deviation_raw_count,
    correctness_states,
    unsafe_action_category_counts: structuredClone(observation.unsafe_action_category_counts),
    mechanisms: mechanismProjection(observation),
    overhead_telemetry: Object.fromEntries(TELEMETRY_METRICS.map(([metric]) => [metric, structuredClone(observation.overhead_telemetry[metric])])),
  };
}

function assertPairIdentity(baseline, comparison, view) {
  if (baseline.condition !== view.baseline_condition || comparison.condition !== view.comparison_condition) throw new Error(`${view.view_id} baseline/comparison condition reversal or drift`);
  const fields = [
    "fixture_id", "fixture_input_digest", "suite", "task_class", "adapter", "repetition", "expected_repetition_count", "scoring_policy_digest",
    "requirement_record_digest", "scoring_input_freeze_manifest_digest",
  ];
  for (const field of fields) if (stableCanonicalJson(baseline[field]) !== stableCanonicalJson(comparison[field])) throw new Error(`${view.view_id} pair identity drift: ${field}`);
  if (baseline.engineering_result_id === comparison.engineering_result_id) throw new Error(`${view.view_id} pair must use distinct engineering results`);
}

function statusPair(baseline, comparison) {
  const fields = ["normalized_outcome", "evaluation_status", "scoring_status", "scoring_reason", "blocker_gate_status", "safety_blocker_status"];
  return Object.fromEntries(fields.flatMap((field) => [[`baseline_${field}`, baseline[field]], [`comparison_${field}`, comparison[field]]]));
}

function qualityDelta(baseline, comparison) {
  const ready = baseline.scoring_status === "complete" && comparison.scoring_status === "complete"
    && Number.isFinite(baseline.normalized_requirement_score) && Number.isFinite(comparison.normalized_requirement_score);
  return {
    baseline_normalized_requirement_score: baseline.normalized_requirement_score,
    comparison_normalized_requirement_score: comparison.normalized_requirement_score,
    delta_status: ready ? "complete" : "insufficient_evidence",
    normalized_requirement_score_delta: ready ? finiteDelta(comparison.normalized_requirement_score, baseline.normalized_requirement_score, "normalized requirement score") : null,
  };
}

function overheadDeltas(baseline, comparison) {
  return Object.fromEntries(TELEMETRY_METRICS.map(([metric, unit]) => {
    const left = baseline.overhead_telemetry[metric];
    const right = comparison.overhead_telemetry[metric];
    const complete = left.status === "known" && right.status === "known" && Number.isFinite(left.value) && Number.isFinite(right.value);
    return [metric, {
      unit,
      baseline: structuredClone(left),
      comparison: structuredClone(right),
      delta_status: complete ? "complete" : "insufficient_evidence",
      delta: complete ? finiteDelta(right.value, left.value, `overhead ${metric}`) : null,
    }];
  }));
}

function rawCategoricalDeltas(baseline, comparison) {
  const severity_counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, {
    baseline: baseline.false_positive_severity_counts[severity],
    comparison: comparison.false_positive_severity_counts[severity],
    delta: comparison.false_positive_severity_counts[severity] - baseline.false_positive_severity_counts[severity],
  }]));
  const correctness_state_pairs = Object.fromEntries(CORRECTNESS_KEYS.map((key) => [key, { baseline_state: baseline.correctness_states[key], comparison_state: comparison.correctness_states[key] }]));
  if (stableCanonicalJson(baseline.unsafe_action_category_counts.map(({ category_id }) => category_id)) !== stableCanonicalJson(UNSAFE_CATEGORY_IDS)
    || stableCanonicalJson(comparison.unsafe_action_category_counts.map(({ category_id }) => category_id)) !== stableCanonicalJson(UNSAFE_CATEGORY_IDS)) throw new Error("unsafe-action category inventory or ordering drift");
  const unsafe_action_category_deltas = UNSAFE_CATEGORY_IDS.map((category_id, index) => {
    const left = baseline.unsafe_action_category_counts[index];
    const right = comparison.unsafe_action_category_counts[index];
    return {
      category_id,
      baseline_attempted_count: left.attempted_count, comparison_attempted_count: right.attempted_count, attempted_count_delta: right.attempted_count - left.attempted_count,
      baseline_blocked_count: left.blocked_count, comparison_blocked_count: right.blocked_count, blocked_count_delta: right.blocked_count - left.blocked_count,
      baseline_unknown_count: left.unknown_count, comparison_unknown_count: right.unknown_count, unknown_count_delta: right.unknown_count - left.unknown_count,
    };
  });
  if (stableCanonicalJson(baseline.mechanisms.map(({ mechanism_id, classification }) => ({ mechanism_id, classification })))
    !== stableCanonicalJson(comparison.mechanisms.map(({ mechanism_id, classification }) => ({ mechanism_id, classification })))) {
    throw new Error("baseline and comparison mechanism ID/classification inventories must match exactly");
  }
  const mechanism_state_pairs = baseline.mechanisms.map((left, index) => ({
    mechanism_id: left.mechanism_id,
    classification: left.classification,
    baseline_state: left.state,
    comparison_state: comparison.mechanisms[index].state,
    quality_credit_applied: false,
  }));
  return {
    false_positives: {
      baseline_raw_count: baseline.false_positive_raw_count,
      comparison_raw_count: comparison.false_positive_raw_count,
      raw_count_delta: comparison.false_positive_raw_count - baseline.false_positive_raw_count,
      severity_counts,
      false_positive_unit_mapping_applied: false,
    },
    scope_deviations: {
      baseline_count: baseline.scope_deviation_raw_count,
      comparison_count: comparison.scope_deviation_raw_count,
      count_delta: comparison.scope_deviation_raw_count - baseline.scope_deviation_raw_count,
    },
    correctness_state_pairs,
    correctness_penalty_applied: false,
    unsafe_action_category_deltas,
    safety_scalar_calculated: false,
    mechanism_state_pairs,
    mechanism_quality_credit_applied: false,
  };
}

function pairedObservation(baseline, comparison, view) {
  assertPairIdentity(baseline, comparison, view);
  return {
    repetition: baseline.repetition,
    baseline,
    comparison,
    status_pair: statusPair(baseline, comparison),
    quality_delta: qualityDelta(baseline, comparison),
    overhead_deltas: overheadDeltas(baseline, comparison),
    raw_categorical_deltas: rawCategoricalDeltas(baseline, comparison),
  };
}

function transitionCounts(pairs, field, states) {
  const result = Object.fromEntries(states.flatMap((baseline) => states.map((comparison) => [`${baseline}_to_${comparison}`, 0])));
  for (const pair of pairs) result[`${pair.baseline[field]}_to_${pair.comparison[field]}`] += 1;
  return result;
}

function viewSummaries(pairs, expectedCount) {
  const qualityValues = pairs.map((pair) => pair.quality_delta.delta_status === "complete" ? pair.quality_delta.normalized_requirement_score_delta : null);
  const overhead_delta_distributions = Object.fromEntries(TELEMETRY_METRICS.map(([metric, unit]) => [metric, {
    unit,
    ...derivePortfolioDistribution(pairs.map((pair) => pair.overhead_deltas[metric].delta_status === "complete" ? pair.overhead_deltas[metric].delta : null), expectedCount, `${metric} paired delta`),
  }]));
  return {
    quality_delta_distribution: derivePortfolioDistribution(qualityValues, expectedCount, "normalized requirement score paired delta"),
    overhead_delta_distributions,
    blocker_transition_counts: transitionCounts(pairs, "blocker_gate_status", BLOCKER_STATES),
    safety_transition_counts: transitionCounts(pairs, "safety_blocker_status", SAFETY_STATES),
  };
}

function rawResultIndex(verifiedResultSet) {
  const index = new Map();
  for (const entry of verifiedResultSet.verified_results) {
    const id = entry.result.engineering_result_id;
    if (index.has(id)) throw new Error(`duplicate verified engineering result ID: ${id}`);
    index.set(id, entry.result);
  }
  return index;
}

export function computePortfolioPairedComparisonReportId(value) {
  const closure = withoutField(withoutField(value, "paired_comparison_report_id"), "paired_comparison_report_digest");
  return `paired-comparison-report-${canonicalDigest(closure).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computePortfolioPairedComparisonReportDigest(value) {
  return canonicalDigest(withoutField(value, "paired_comparison_report_digest"));
}

export function buildPortfolioPairedComparisonReport({ verifiedReport, verifiedResultSet, verifiedScoringPolicy }) {
  if (!verifiedReport || !Object.isFrozen(verifiedReport)) throw new Error("a recursively frozen full-verifier repetition report is required");
  if (!verifiedResultSet?.artifact || !Array.isArray(verifiedResultSet.verified_results)) throw new Error("the underlying full verified result-set authority is required");
  if (!verifiedScoringPolicy || !Object.isFrozen(verifiedScoringPolicy)) throw new Error("a recursively frozen full-verifier scoring policy is required");
  const views = structuredClone(verifiedScoringPolicy.aggregation_policy.comparison_views);
  assertComparisonViews(views);
  if (verifiedScoringPolicy.policy_revision !== PORTFOLIO_PAIRED_COMPARISON_POLICY_REVISION) throw new Error("paired comparison requires the frozen B1 policy revision");
  if (verifiedReport.authority.scoring_policy_revision !== verifiedScoringPolicy.policy_revision || verifiedReport.authority.scoring_policy_digest !== verifiedScoringPolicy.policy_digest) throw new Error("repetition report and B1 policy authority mismatch");
  if (verifiedReport.authority.result_set_id !== verifiedResultSet.artifact.result_set_id || verifiedReport.authority.result_set_digest !== verifiedResultSet.artifact.result_set_digest) throw new Error("repetition report and result-set authority mismatch");
  const resultIndex = rawResultIndex(verifiedResultSet);
  const fixture_comparisons = verifiedReport.fixture_reports.map((fixture) => {
    const observationByCondition = new Map(fixture.condition_reports.map((report) => [report.condition, new Map(report.repetition_observations.map((observation) => [observation.repetition, observation]))]));
    const comparison_views = views.map((view) => {
      const pairs = [];
      for (let repetition = 1; repetition <= fixture.expected_repetition_count; repetition += 1) {
        const baselineObservation = observationByCondition.get(view.baseline_condition)?.get(repetition);
        const comparisonObservation = observationByCondition.get(view.comparison_condition)?.get(repetition);
        if (!baselineObservation || !comparisonObservation) throw new Error(`${fixture.fixture_id}/${view.view_id} is missing a structural pair for repetition ${repetition}`);
        const baselineRaw = resultIndex.get(baselineObservation.engineering_result_id);
        const comparisonRaw = resultIndex.get(comparisonObservation.engineering_result_id);
        if (!baselineRaw || !comparisonRaw) throw new Error(`${fixture.fixture_id}/${view.view_id} pair is absent from verified result-set authority`);
        pairs.push(pairedObservation(sourceProjection(baselineObservation, baselineRaw, fixture), sourceProjection(comparisonObservation, comparisonRaw, fixture), view));
      }
      pairs.sort((left, right) => left.repetition - right.repetition || left.baseline.engineering_result_id.localeCompare(right.baseline.engineering_result_id) || left.comparison.engineering_result_id.localeCompare(right.comparison.engineering_result_id));
      return { ...view, structural_pairing_status: "complete", pair_count: pairs.length, pairs, ...viewSummaries(pairs, fixture.expected_repetition_count) };
    });
    return {
      fixture_id: fixture.fixture_id,
      fixture_input_digest: fixture.fixture_input_digest,
      suite: fixture.suite,
      task_class: fixture.task_class,
      expected_repetition_count: fixture.expected_repetition_count,
      comparison_views,
    };
  });
  fixture_comparisons.sort((left, right) => left.fixture_id.localeCompare(right.fixture_id));
  const base = {
    schema_version: "1.0.0",
    schema_path: PORTFOLIO_PAIRED_COMPARISON_REPORT_SCHEMA_PATH,
    program: "adaptive_ask_portfolio_paired_comparison_report",
    authority: {
      repetition_report_id: verifiedReport.repetition_report_id,
      repetition_report_digest: verifiedReport.repetition_report_digest,
      ...structuredClone(verifiedReport.authority),
    },
    comparison_view_definitions: views,
    fixture_comparisons,
    boundaries: {
      paired_condition_comparison_calculated: true,
      meaningful_delta_classified: false,
      win_loss_tie_calculated: false,
      confidence_interval_calculated: false,
      bootstrap_calculated: false,
      probability_of_improvement_calculated: false,
      within_condition_variance_exceedance_classified: false,
      practice_weighting_applied: false,
      lineage_weighting_applied: false,
      mechanism_scorecard_calculated: false,
      cross_fixture_aggregate_calculated: false,
      cross_suite_aggregate_calculated: false,
      cross_adapter_pooling: false,
      ceiling_floor_classification_calculated: false,
      product_value_claim: false,
      measured_execution_authorized: false,
      issue_198_stage_0_authorized: false,
    },
  };
  const withId = { ...base, paired_comparison_report_id: computePortfolioPairedComparisonReportId(base) };
  return { ...withId, paired_comparison_report_digest: computePortfolioPairedComparisonReportDigest(withId) };
}

export function validatePortfolioPairedComparisonReport(value, { root = DEFAULT_ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, PORTFOLIO_PAIRED_COMPARISON_REPORT_SCHEMA_PATH), label: "portfolio paired comparison report" });
  assertPrivacy(value);
  assertComparisonViews(value.comparison_view_definitions);
  if (value.fixture_comparisons.some((fixture, index, all) => index > 0 && all[index - 1].fixture_id.localeCompare(fixture.fixture_id) >= 0)) throw new Error("fixture comparison ordering drift");
  for (const fixture of value.fixture_comparisons) {
    if (stableCanonicalJson(fixture.comparison_views.map(({ view_id, comparison_condition, baseline_condition, view_role }) => ({ view_id, comparison_condition, baseline_condition, view_role }))) !== stableCanonicalJson(value.comparison_view_definitions)) throw new Error(`${fixture.fixture_id} comparison view ordering or definition drift`);
    for (const view of fixture.comparison_views) {
      if (view.structural_pairing_status !== "complete" || view.pair_count !== fixture.expected_repetition_count || view.pairs.length !== fixture.expected_repetition_count) throw new Error(`${fixture.fixture_id}/${view.view_id} structural pairing is incomplete`);
      const definition = value.comparison_view_definitions.find(({ view_id }) => view_id === view.view_id);
      const rebuiltPairs = view.pairs.map((pair) => pairedObservation(pair.baseline, pair.comparison, definition));
      if (stableCanonicalJson(rebuiltPairs) !== stableCanonicalJson(view.pairs)) throw new Error(`${fixture.fixture_id}/${view.view_id} paired source delta closure mismatch`);
      const repetitions = view.pairs.map(({ repetition }) => repetition);
      if (stableCanonicalJson(repetitions) !== stableCanonicalJson(Array.from({ length: fixture.expected_repetition_count }, (_, index) => index + 1))) throw new Error(`${fixture.fixture_id}/${view.view_id} pair ordering or inventory drift`);
      for (const pair of view.pairs) {
        for (const field of ["fixture_id", "fixture_input_digest", "suite", "task_class", "expected_repetition_count"]) if (pair.baseline[field] !== fixture[field] || pair.comparison[field] !== fixture[field]) throw new Error(`${fixture.fixture_id}/${view.view_id} pair fixture authority drift: ${field}`);
        if (pair.baseline.adapter !== value.authority.adapter_track || pair.comparison.adapter !== value.authority.adapter_track) throw new Error(`${fixture.fixture_id}/${view.view_id} pair adapter authority drift`);
        if (pair.baseline.scoring_policy_digest !== value.authority.scoring_policy_digest || pair.comparison.scoring_policy_digest !== value.authority.scoring_policy_digest) throw new Error(`${fixture.fixture_id}/${view.view_id} pair scoring-policy authority drift`);
      }
      const expected = viewSummaries(view.pairs, fixture.expected_repetition_count);
      const actual = {
        quality_delta_distribution: view.quality_delta_distribution,
        overhead_delta_distributions: view.overhead_delta_distributions,
        blocker_transition_counts: view.blocker_transition_counts,
        safety_transition_counts: view.safety_transition_counts,
      };
      if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${fixture.fixture_id}/${view.view_id} paired summary closure mismatch`);
      for (const summary of [view.quality_delta_distribution, ...Object.values(view.overhead_delta_distributions)]) for (const field of ["mean", "median", "minimum", "maximum", "population_variance", "population_standard_deviation"]) if (Object.is(summary[field], -0)) throw new Error("paired distributions must canonicalize negative zero");
    }
  }
  if (value.paired_comparison_report_id !== computePortfolioPairedComparisonReportId(value)) throw new Error("paired comparison report ID does not match its complete ordered closure");
  if (value.paired_comparison_report_digest !== computePortfolioPairedComparisonReportDigest(value)) throw new Error("paired comparison report digest does not match its complete ordered closure");
  return value;
}

function pathsOverlap(left, right) {
  const a = resolve(left); const b = resolve(right);
  return a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`);
}

function policyPaths(root) {
  if (root === DEFAULT_ROOT) return [DEFAULT_PORTFOLIO_CATALOG_PATH, DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH, DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH, DEFAULT_PORTFOLIO_SCORING_POLICY_PATH, DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH];
  return ["benchmarks/portfolio-catalog.json", "benchmarks/portfolio-policy-manifest.json", "benchmarks/portfolio-admission-policy.json", "benchmarks/portfolio-scoring-policy.json", "benchmarks/portfolio-lineage-policy.json"].map((path) => resolve(root, path));
}

function assertOutputBoundary(options) {
  const output = assertAtomicOutputAbsent(options.outputPath, "portfolio paired comparison report output");
  const root = resolve(options.root ?? DEFAULT_ROOT);
  for (const [label, path] of [
    ["result-set input", options.resultSetPath], ["repetition-report input", options.repetitionReportPath],
    ["normalized result authority", options.normalizedResultsPath], ["engineering result authority", options.engineeringResultsPath],
    ["source manifest authority", options.sourceManifestPath], ["materialized authority", options.materializedPath],
    ["selection-state authority", options.selectionState], ["run authority", options.runDir],
    ...policyPaths(root).map((path) => ["policy authority", path]),
  ]) if (path && pathsOverlap(output, path)) throw new Error(`portfolio paired comparison report output must be disjoint from ${label}`);
  return output;
}

function derive(options) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const report = verifyEngineeringRepetitionReport({ ...options, inputPath: options.resultSetPath, reportPath: options.repetitionReportPath });
  const policy = verifyPortfolioPolicyArtifacts({ root });
  const artifact = buildPortfolioPairedComparisonReport({
    verifiedReport: report.verified_report,
    verifiedResultSet: report.verified,
    verifiedScoringPolicy: policy.verified_scoring_policy,
  });
  validatePortfolioPairedComparisonReport(artifact, { root });
  return { artifact, verified_report: report.verified_report, verified_result_set: report.verified, verified_scoring_policy: policy.verified_scoring_policy };
}

export function reportEngineeringPairedComparisons(options) {
  const outputPath = assertOutputBoundary(options);
  const derived = derive(options);
  return { ...derived, ...publishJsonAtomicNoReplace({ outputPath, artifact: derived.artifact, label: "portfolio paired comparison report output" }) };
}

export function verifyEngineeringPairedComparisonReport(options) {
  const input = readStableFile(options.comparisonReportPath, "portfolio paired comparison report input", MAX_REPORT_BYTES, { allowEmpty: false });
  let supplied;
  try { supplied = JSON.parse(input.bytes.toString("utf8")); } catch { throw new Error("portfolio paired comparison report input must contain valid JSON"); }
  validatePortfolioPairedComparisonReport(supplied, { root: options.root ?? DEFAULT_ROOT });
  const derived = derive(options);
  if (stableCanonicalJson(supplied) !== stableCanonicalJson(derived.artifact)) throw new Error("paired comparison report does not match the re-derived full authority report");
  const after = readStableFile(options.comparisonReportPath, "portfolio paired comparison report input", MAX_REPORT_BYTES, { allowEmpty: false });
  assertStableFileEvidence(input, after, "portfolio paired comparison report input");
  return { artifact: supplied, bytes: input.bytes };
}
