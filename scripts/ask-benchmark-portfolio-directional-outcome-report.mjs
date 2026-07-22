import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { verifyEngineeringPairedComparisonReport } from "./ask-benchmark-portfolio-paired-comparison-report.mjs";
import { DEFAULT_PORTFOLIO_CATALOG_PATH } from "./ask-benchmark-portfolio-catalog.mjs";
import {
  DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH,
  DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH,
  DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH,
  DEFAULT_PORTFOLIO_SCORING_POLICY_PATH,
  verifyPortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const PORTFOLIO_DIRECTIONAL_OUTCOME_REPORT_SCHEMA_PATH = "benchmarks/schemas/portfolio-directional-outcome-report.schema.json";
export const PORTFOLIO_DIRECTIONAL_OUTCOME_POLICY_REVISION = "issue-205-checkpoint-b1-r3";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_REPORT_BYTES = 512 * 1024 * 1024;
const PRIVATE_PATH_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;
const ABSOLUTE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;
const EXPECTED_VIEWS = Object.freeze([
  Object.freeze({ view_id: "kernel_vs_plain", comparison_condition: "kernel_only", baseline_condition: "plain", view_role: "primary_product_hypothesis" }),
  Object.freeze({ view_id: "adaptive_vs_kernel", comparison_condition: "adaptive_ask", baseline_condition: "kernel_only", view_role: "primary_product_hypothesis" }),
  Object.freeze({ view_id: "full_vs_kernel_diagnostic", comparison_condition: "full_ask", baseline_condition: "kernel_only", view_role: "diagnostic_only" }),
]);

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
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
}

export function classifyPortfolioDirectionalOutcome(deltaStatus, delta) {
  if (deltaStatus === "complete") {
    if (!Number.isFinite(delta)) throw new Error("a complete directional delta must be a finite number");
    const canonicalDelta = normalizeZero(delta);
    return {
      directional_outcome: canonicalDelta > 0 ? "comparison_win" : canonicalDelta < 0 ? "comparison_loss" : "exact_tie",
      paired_normalized_quality_delta: canonicalDelta,
    };
  }
  if (deltaStatus === "insufficient_evidence") {
    if (delta !== null) throw new Error("an insufficient_evidence directional pair must have a null delta");
    return { directional_outcome: "insufficient_evidence", paired_normalized_quality_delta: null };
  }
  throw new Error(`unsupported paired quality delta status: ${deltaStatus}`);
}

function directionalPair(pair, view) {
  const classified = classifyPortfolioDirectionalOutcome(pair.quality_delta.delta_status, pair.quality_delta.normalized_requirement_score_delta);
  return {
    repetition: pair.repetition,
    view_id: view.view_id,
    baseline_condition: view.baseline_condition,
    comparison_condition: view.comparison_condition,
    baseline_engineering_result_id: pair.baseline.engineering_result_id,
    baseline_engineering_result_digest: pair.baseline.engineering_result_digest,
    comparison_engineering_result_id: pair.comparison.engineering_result_id,
    comparison_engineering_result_digest: pair.comparison.engineering_result_digest,
    baseline_normalized_result_id: pair.baseline.normalized_result_id,
    baseline_normalized_result_digest: pair.baseline.normalized_result_digest,
    comparison_normalized_result_id: pair.comparison.normalized_result_id,
    comparison_normalized_result_digest: pair.comparison.normalized_result_digest,
    paired_quality_delta_status: pair.quality_delta.delta_status,
    paired_normalized_quality_delta: classified.paired_normalized_quality_delta,
    directional_outcome: classified.directional_outcome,
    outcome_perspective: "comparison_condition",
  };
}

function summarizeDirectionalPairs(pairs, expectedPairCount) {
  const counts = { comparison_win: 0, comparison_loss: 0, exact_tie: 0, insufficient_evidence: 0 };
  for (const pair of pairs) counts[pair.directional_outcome] += 1;
  return {
    expected_pair_count: expectedPairCount,
    observed_pair_count: pairs.length,
    comparison_win_count: counts.comparison_win,
    comparison_loss_count: counts.comparison_loss,
    exact_tie_count: counts.exact_tie,
    insufficient_evidence_count: counts.insufficient_evidence,
    directional_summary_status: counts.insufficient_evidence === 0 ? "complete" : "insufficient_evidence",
  };
}

function assertB1Authority(source, policy) {
  if (policy.policy_revision !== PORTFOLIO_DIRECTIONAL_OUTCOME_POLICY_REVISION) throw new Error("directional outcomes require the frozen B1 policy revision");
  const views = policy.aggregation_policy.comparison_views;
  assertComparisonViews(views);
  assertComparisonViews(source.comparison_view_definitions);
  if (source.authority.scoring_policy_revision !== policy.policy_revision || source.authority.scoring_policy_digest !== policy.policy_digest) throw new Error("paired comparison report and B1 scoring policy authority mismatch");
  if (stableCanonicalJson(source.comparison_view_definitions) !== stableCanonicalJson(views)) throw new Error("paired comparison report comparison definitions drifted from B1 policy authority");
}

export function computePortfolioDirectionalOutcomeReportId(value) {
  const closure = withoutField(withoutField(value, "directional_outcome_report_id"), "directional_outcome_report_digest");
  return `directional-outcome-report-${canonicalDigest(closure).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computePortfolioDirectionalOutcomeReportDigest(value) {
  return canonicalDigest(withoutField(value, "directional_outcome_report_digest"));
}

export function buildPortfolioDirectionalOutcomeReport({ verifiedComparisonReport, verifiedScoringPolicy }) {
  if (!verifiedComparisonReport || !Object.isFrozen(verifiedComparisonReport)) throw new Error("a recursively frozen full-verifier paired comparison report is required");
  if (!verifiedScoringPolicy || !Object.isFrozen(verifiedScoringPolicy)) throw new Error("a recursively frozen full-verifier scoring policy is required");
  assertB1Authority(verifiedComparisonReport, verifiedScoringPolicy);
  const definitions = structuredClone(verifiedScoringPolicy.aggregation_policy.comparison_views);
  const fixture_outcomes = verifiedComparisonReport.fixture_comparisons.map((fixture) => {
    const comparison_views = fixture.comparison_views.map((sourceView, index) => {
      const definition = definitions[index];
      if (!definition || stableCanonicalJson({ view_id: sourceView.view_id, comparison_condition: sourceView.comparison_condition, baseline_condition: sourceView.baseline_condition, view_role: sourceView.view_role }) !== stableCanonicalJson(definition)) throw new Error(`${fixture.fixture_id} comparison view ordering or definition drift`);
      if (sourceView.structural_pairing_status !== "complete" || sourceView.pair_count !== fixture.expected_repetition_count || sourceView.pairs.length !== fixture.expected_repetition_count) throw new Error(`${fixture.fixture_id}/${sourceView.view_id} is missing a structural pair`);
      const pair_outcomes = sourceView.pairs.map((pair) => {
        if (pair.repetition !== pair.baseline.repetition || pair.repetition !== pair.comparison.repetition) throw new Error(`${fixture.fixture_id}/${sourceView.view_id} contains a cross-repetition pair`);
        if (pair.baseline.fixture_id !== fixture.fixture_id || pair.comparison.fixture_id !== fixture.fixture_id) throw new Error(`${fixture.fixture_id}/${sourceView.view_id} contains a cross-fixture pair`);
        if (pair.baseline.adapter !== verifiedComparisonReport.authority.adapter_track || pair.comparison.adapter !== verifiedComparisonReport.authority.adapter_track) throw new Error(`${fixture.fixture_id}/${sourceView.view_id} contains a cross-adapter pair`);
        if (pair.baseline.condition !== definition.baseline_condition || pair.comparison.condition !== definition.comparison_condition) throw new Error(`${fixture.fixture_id}/${sourceView.view_id} baseline/comparison condition reversal or drift`);
        return directionalPair(pair, definition);
      });
      pair_outcomes.sort((left, right) => left.repetition - right.repetition || left.baseline_engineering_result_id.localeCompare(right.baseline_engineering_result_id) || left.comparison_engineering_result_id.localeCompare(right.comparison_engineering_result_id));
      if (stableCanonicalJson(pair_outcomes.map(({ repetition }) => repetition)) !== stableCanonicalJson(Array.from({ length: fixture.expected_repetition_count }, (_, pairIndex) => pairIndex + 1))) throw new Error(`${fixture.fixture_id}/${sourceView.view_id} contains a missing or duplicate pair`);
      return { ...definition, ...summarizeDirectionalPairs(pair_outcomes, fixture.expected_repetition_count), pair_outcomes };
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
  fixture_outcomes.sort((left, right) => left.fixture_id.localeCompare(right.fixture_id));
  const base = {
    schema_version: "1.0.0",
    schema_path: PORTFOLIO_DIRECTIONAL_OUTCOME_REPORT_SCHEMA_PATH,
    program: "adaptive_ask_portfolio_directional_outcome_report",
    authority: {
      paired_comparison_report_id: verifiedComparisonReport.paired_comparison_report_id,
      paired_comparison_report_digest: verifiedComparisonReport.paired_comparison_report_digest,
      ...structuredClone(verifiedComparisonReport.authority),
    },
    comparison_view_definitions: definitions,
    fixture_outcomes,
    boundaries: {
      directional_win_loss_tie_calculated: true,
      meaningful_delta_classified: false,
      meaningful_delta_threshold_applied: false,
      majority_winner_calculated: false,
      win_rate_calculated: false,
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
  const withId = { ...base, directional_outcome_report_id: computePortfolioDirectionalOutcomeReportId(base) };
  return { ...withId, directional_outcome_report_digest: computePortfolioDirectionalOutcomeReportDigest(withId) };
}

export function validatePortfolioDirectionalOutcomeReport(value, { root = DEFAULT_ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, PORTFOLIO_DIRECTIONAL_OUTCOME_REPORT_SCHEMA_PATH), label: "portfolio directional outcome report" });
  assertPrivacy(value);
  assertComparisonViews(value.comparison_view_definitions);
  if (value.authority.scoring_policy_revision !== PORTFOLIO_DIRECTIONAL_OUTCOME_POLICY_REVISION) throw new Error("directional report B1 policy revision drift");
  if (value.fixture_outcomes.some((fixture, index, all) => index > 0 && all[index - 1].fixture_id.localeCompare(fixture.fixture_id) >= 0)) throw new Error("fixture outcome ordering drift");
  for (const fixture of value.fixture_outcomes) {
    if (fixture.comparison_views.length !== EXPECTED_VIEWS.length) throw new Error(`${fixture.fixture_id} must contain exactly the three B1 comparison views`);
    for (const [index, view] of fixture.comparison_views.entries()) {
      const definition = value.comparison_view_definitions[index];
      if (stableCanonicalJson({ view_id: view.view_id, comparison_condition: view.comparison_condition, baseline_condition: view.baseline_condition, view_role: view.view_role }) !== stableCanonicalJson(definition)) throw new Error(`${fixture.fixture_id} comparison view ordering or definition drift`);
      if (view.expected_pair_count !== fixture.expected_repetition_count || view.observed_pair_count !== fixture.expected_repetition_count || view.pair_outcomes.length !== fixture.expected_repetition_count) throw new Error(`${fixture.fixture_id}/${view.view_id} structural pair inventory is incomplete`);
      const repetitions = view.pair_outcomes.map(({ repetition }) => repetition);
      if (stableCanonicalJson(repetitions) !== stableCanonicalJson(Array.from({ length: fixture.expected_repetition_count }, (_, pairIndex) => pairIndex + 1))) throw new Error(`${fixture.fixture_id}/${view.view_id} pair ordering or inventory drift`);
      const rebuilt = view.pair_outcomes.map((pair) => {
        if (Object.is(pair.paired_normalized_quality_delta, -0)) throw new Error("directional pair deltas must canonicalize negative zero");
        if (pair.view_id !== view.view_id || pair.baseline_condition !== view.baseline_condition || pair.comparison_condition !== view.comparison_condition) throw new Error(`${fixture.fixture_id}/${view.view_id} pair view or condition authority drift`);
        const classified = classifyPortfolioDirectionalOutcome(pair.paired_quality_delta_status, pair.paired_normalized_quality_delta);
        return { ...pair, paired_normalized_quality_delta: classified.paired_normalized_quality_delta, directional_outcome: classified.directional_outcome, outcome_perspective: "comparison_condition" };
      });
      if (stableCanonicalJson(rebuilt) !== stableCanonicalJson(view.pair_outcomes)) throw new Error(`${fixture.fixture_id}/${view.view_id} directional pair closure mismatch`);
      const expectedSummary = summarizeDirectionalPairs(rebuilt, fixture.expected_repetition_count);
      for (const [field, expected] of Object.entries(expectedSummary)) if (view[field] !== expected) throw new Error(`${fixture.fixture_id}/${view.view_id} directional count or summary closure mismatch: ${field}`);
    }
  }
  if (value.directional_outcome_report_id !== computePortfolioDirectionalOutcomeReportId(value)) throw new Error("directional outcome report ID does not match its complete ordered closure");
  if (value.directional_outcome_report_digest !== computePortfolioDirectionalOutcomeReportDigest(value)) throw new Error("directional outcome report digest does not match its complete ordered closure");
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
  const output = assertAtomicOutputAbsent(options.outputPath, "portfolio directional outcome report output");
  const root = resolve(options.root ?? DEFAULT_ROOT);
  for (const [label, path] of [
    ["result-set input", options.resultSetPath], ["repetition-report input", options.repetitionReportPath], ["paired-comparison input", options.comparisonReportPath],
    ["normalized result authority", options.normalizedResultsPath], ["engineering result authority", options.engineeringResultsPath],
    ["source manifest authority", options.sourceManifestPath], ["materialized authority", options.materializedPath],
    ["selection-state authority", options.selectionState], ["run authority", options.runDir],
    ...policyPaths(root).map((path) => ["policy authority", path]),
  ]) if (path && pathsOverlap(output, path)) throw new Error(`portfolio directional outcome report output must be disjoint from ${label}`);
  return output;
}

function derive(options) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const verified = verifyEngineeringPairedComparisonReport(options);
  const source = verified.verified_comparison_report;
  const policy = verifyPortfolioPolicyArtifacts({ root });
  const artifact = buildPortfolioDirectionalOutcomeReport({ verifiedComparisonReport: source, verifiedScoringPolicy: policy.verified_scoring_policy });
  validatePortfolioDirectionalOutcomeReport(artifact, { root });
  return { artifact, verified_comparison_report: source, verified_repetition_report: verified.verified_repetition_report, verified_result_set: verified.verified_result_set, verified_scoring_policy: policy.verified_scoring_policy };
}

export function reportEngineeringDirectionalOutcomes(options) {
  const outputPath = assertOutputBoundary(options);
  const derived = derive(options);
  return { ...derived, ...publishJsonAtomicNoReplace({ outputPath, artifact: derived.artifact, label: "portfolio directional outcome report output" }) };
}

export function verifyEngineeringDirectionalOutcomeReport(options) {
  const input = readStableFile(options.directionalReportPath, "portfolio directional outcome report input", MAX_REPORT_BYTES, { allowEmpty: false });
  let supplied;
  try { supplied = JSON.parse(input.bytes.toString("utf8")); } catch { throw new Error("portfolio directional outcome report input must contain valid JSON"); }
  validatePortfolioDirectionalOutcomeReport(supplied, { root: options.root ?? DEFAULT_ROOT });
  const derived = derive(options);
  if (stableCanonicalJson(supplied) !== stableCanonicalJson(derived.artifact)) throw new Error("directional outcome report does not match the re-derived full authority report");
  const after = readStableFile(options.directionalReportPath, "portfolio directional outcome report input", MAX_REPORT_BYTES, { allowEmpty: false });
  assertStableFileEvidence(input, after, "portfolio directional outcome report input");
  return { artifact: supplied, bytes: input.bytes };
}
