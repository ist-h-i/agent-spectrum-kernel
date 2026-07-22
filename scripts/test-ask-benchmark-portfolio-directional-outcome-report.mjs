#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPortfolioDirectionalOutcomeReport,
  classifyPortfolioDirectionalOutcome,
  computePortfolioDirectionalOutcomeReportDigest,
  computePortfolioDirectionalOutcomeReportId,
  validatePortfolioDirectionalOutcomeReport,
} from "./ask-benchmark-portfolio-directional-outcome-report.mjs";
import {
  buildPortfolioPairedComparisonReport,
  computePortfolioPairedComparisonReportDigest,
  computePortfolioPairedComparisonReportId,
} from "./ask-benchmark-portfolio-paired-comparison-report.mjs";
import { buildPortfolioRepetitionReport } from "./ask-benchmark-portfolio-repetition-report.mjs";
import { verifyPortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const CORRECTNESS_KEYS = ["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety"];
const UNSAFE_CATEGORIES = ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"];
const METRICS = ["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "human_effort", "tool_call_count", "file_read_count", "final_output_bytes", "runtime_agent_count", "harness_spawned_secondary_agent_count", "subagent_activity", "capability_downgrade_count"];
const policy = verifyPortfolioPolicyArtifacts({ root }).verified_scoring_policy;
const covered = new Set();

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function digest(value) { return `sha256:${hash(value)}`; }
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function metric(value, status = value === null ? "unknown" : "known") { return status === "known" ? { status, value, reason: "committed_runtime_evidence" } : { status, value: null, reason: "synthetic_fixture" }; }
function scoreFor(condition, repetition, repetitions) { return ((CONDITIONS.indexOf(condition) + 1) * repetition) / (4 * repetitions); }

function result(fixture, repetitions, condition, repetition) {
  const key = `${fixture}:${condition}:${repetition}`;
  const score = scoreFor(condition, repetition, repetitions);
  return {
    fixture_id: fixture, fixture_input_digest: digest(`fixture:${fixture}`), suite: fixture === "fixture-three" ? "mechanism_positive" : "calibration", task_class: "implementation",
    case_id: `case-${hash(key).slice(0, 16)}-${hash(`case:${key}`).slice(0, 16)}`, attempt: "0001", adapter: "codex", condition, repetition,
    scoring_policy_digest: policy.policy_digest, requirement_record_digest: digest(`requirements:${fixture}`), scoring_input_freeze_manifest_digest: digest(`freeze:${fixture}`),
    engineering_result_id: `engineering-result-${hash(`engineering:${key}`).slice(0, 32)}`, engineering_result_digest: digest(`engineering-digest:${key}`),
    normalized_result_id: `normalized-${hash(`normalized:${key}`).slice(0, 32)}`, normalized_result_digest: digest(`normalized-digest:${key}`),
    evaluation_id: `evaluation-${hash(`evaluation:${key}`).slice(0, 32)}`, evaluation_digest: digest(`evaluation-digest:${key}`),
    normalized_outcome: "completed", evaluation_status: "completed", scoring_status: "complete", scoring_reason: "completed_evaluation_scoring_ready",
    requirement_score: { scored_requirement_count: 2, requirement_points_earned: score * 2, requirement_points_possible: 2, normalized_requirement_score: score },
    blockers: { gate_status: "pass" }, safety_blocker: { status: "pass" },
    false_positives: { raw_count: repetition, severity_counts: { critical: 0, high: 0, medium: repetition, low: 0, informational: 0 } },
    scope_deviations: { raw_count: repetition % 2 },
    correctness_observations: Object.fromEntries(CORRECTNESS_KEYS.map((keyName) => [keyName, { state: "pass", evidence_references: [] }])),
    unsafe_actions: { categories: UNSAFE_CATEGORIES.map((category_id) => ({ category_id, attempted_count: repetition, blocked_count: 0, unknown_count: 0 })) },
    mechanism_observations: { required_mechanisms: [{ mechanism_id: "verification", state: condition === "plain" ? "missing" : "observed", evidence_references: [] }], unnecessary_mechanisms: [], quality_credit_applied: false },
    overhead_telemetry: {
      ...Object.fromEntries(METRICS.map((name, index) => [name, metric((CONDITIONS.indexOf(condition) + 1) * 100 + repetition + index)])),
      runtime_unavailable_reason: { code: metric(null, "not_applicable"), digest: metric(null, "not_applicable"), bytes: metric(null, "not_applicable") },
    },
  };
}

function verifiedResultSet() {
  const verified_results = [];
  for (const [fixture, repetitions] of [["fixture-three", 3], ["fixture-five", 5]]) for (const condition of CONDITIONS) for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const item = result(fixture, repetitions, condition, repetition);
    verified_results.push({ path: `${fixture}/${condition}/${repetition}.json`, raw_byte_digest: digest(`bytes:${fixture}:${condition}:${repetition}`), bytes: 1000 + repetition, result: item });
  }
  return {
    artifact: {
      result_set_id: `engineering-result-set-${hash("set").slice(0, 32)}`, result_set_digest: digest("set-digest"), source_manifest_raw_byte_digest: digest("source-bytes"), source_manifest_digest: digest("source"),
      normalized_generation_id: `snapshot-${hash("snapshot")}`, normalized_manifest_digest: digest("normalized-manifest"), source_snapshot_digest: digest("snapshot-digest"),
      plan_id: `plan-${hash("plan")}`, plan_digest: digest("plan-digest"), run_instance_id: "00000000-0000-4000-8000-000000000197", source_revision: "1".repeat(40), adapter_track: "codex",
      completeness: { expected_result_count: verified_results.length },
    },
    verified_results,
  };
}

function pairedReport() {
  const verified = verifiedResultSet();
  const repetition = buildPortfolioRepetitionReport({ verified, policyRevision: policy.policy_revision, scoringPolicyDigest: policy.policy_digest });
  return buildPortfolioPairedComparisonReport({ verifiedReport: freeze(structuredClone(repetition)), verifiedResultSet: verified, verifiedScoringPolicy: policy });
}

function closePaired(report) {
  report.paired_comparison_report_id = computePortfolioPairedComparisonReportId(report);
  report.paired_comparison_report_digest = computePortfolioPairedComparisonReportDigest(report);
  return report;
}

function build(mutate = null) {
  const paired = pairedReport();
  if (mutate) mutate(paired);
  closePaired(paired);
  return buildPortfolioDirectionalOutcomeReport({ verifiedComparisonReport: freeze(paired), verifiedScoringPolicy: policy });
}

function close(report) {
  report.directional_outcome_report_id = computePortfolioDirectionalOutcomeReportId(report);
  report.directional_outcome_report_digest = computePortfolioDirectionalOutcomeReportDigest(report);
  return report;
}

function check(name, callback) { callback(); covered.add(name); }
function fixture(report, id = "fixture-three") { return report.fixture_outcomes.find((entry) => entry.fixture_id === id); }
function view(report, id = "kernel_vs_plain", fixtureId = "fixture-three") { return fixture(report, fixtureId).comparison_views.find((entry) => entry.view_id === id); }
function pair(report, repetition = 1, viewId = "kernel_vs_plain", fixtureId = "fixture-three") { return view(report, viewId, fixtureId).pair_outcomes.find((entry) => entry.repetition === repetition); }
function pairedPair(report, repetition = 1, viewId = "kernel_vs_plain", fixtureId = "fixture-three") { return report.fixture_comparisons.find((entry) => entry.fixture_id === fixtureId).comparison_views.find((entry) => entry.view_id === viewId).pairs.find((entry) => entry.repetition === repetition); }
function setDelta(report, delta, status = "complete", repetition = 1, viewId = "kernel_vs_plain") { const item = pairedPair(report, repetition, viewId); item.quality_delta.delta_status = status; item.quality_delta.normalized_requirement_score_delta = delta; }
function expectReclosedFailure(name, source, mutate, pattern = /closure|drift|Schema validation|ordering|inventory|authority|condition|B1 comparison views/u) {
  check(name, () => { const changed = structuredClone(source); mutate(changed); close(changed); assert.throws(() => validatePortfolioDirectionalOutcomeReport(changed, { root }), pattern); });
}

const report = build();
validatePortfolioDirectionalOutcomeReport(report, { root });

check("exactly three B1 views", () => assert.equal(report.comparison_view_definitions.length, 3));
check("B1 policy order", () => assert.deepEqual(report.comparison_view_definitions.map(({ view_id }) => view_id), ["kernel_vs_plain", "adaptive_vs_kernel", "full_vs_kernel_diagnostic"]));
check("diagnostic role preserved", () => assert.equal(report.comparison_view_definitions[2].view_role, "diagnostic_only"));
check("one adapter only", () => assert.equal(report.authority.adapter_track, "codex"));
check("exact 3-pair inventory", () => assert.equal(view(report).pair_outcomes.length, 3));
check("exact 5-pair inventory", () => assert.equal(view(report, "kernel_vs_plain", "fixture-five").pair_outcomes.length, 5));
check("positive delta is comparison win", () => assert.equal(pair(report).directional_outcome, "comparison_win"));
check("negative delta is comparison loss", () => assert.equal(pair(build((source) => setDelta(source, -0.25))).directional_outcome, "comparison_loss"));
check("zero delta is exact tie", () => assert.equal(pair(build((source) => setDelta(source, 0))).directional_outcome, "exact_tie"));
check("negative zero becomes exact zero", () => { const item = pair(build((source) => setDelta(source, -0))); assert.equal(item.directional_outcome, "exact_tie"); assert.equal(Object.is(item.paired_normalized_quality_delta, -0), false); });
check("tiny positive remains win", () => assert.equal(pair(build((source) => setDelta(source, Number.MIN_VALUE))).directional_outcome, "comparison_win"));
check("tiny negative remains loss", () => assert.equal(pair(build((source) => setDelta(source, -Number.MIN_VALUE))).directional_outcome, "comparison_loss"));
check("non-finite delta is insufficient", () => assert.deepEqual(classifyPortfolioDirectionalOutcome("complete", Number.POSITIVE_INFINITY), { directional_outcome: "insufficient_evidence", paired_normalized_quality_delta: null }));
check("NaN delta is insufficient", () => assert.deepEqual(classifyPortfolioDirectionalOutcome("complete", Number.NaN), { directional_outcome: "insufficient_evidence", paired_normalized_quality_delta: null }));
check("non-ready baseline is insufficient", () => { const changed = build((source) => { const item = pairedPair(source); item.baseline.scoring_status = "not_scoring_ready"; setDelta(source, null, "insufficient_evidence"); }); assert.equal(pair(changed).directional_outcome, "insufficient_evidence"); });
check("non-ready comparison is insufficient", () => { const changed = build((source) => { const item = pairedPair(source); item.comparison.scoring_status = "not_scoring_ready"; setDelta(source, null, "insufficient_evidence"); }); assert.equal(pair(changed).directional_outcome, "insufficient_evidence"); });
check("null delta is insufficient", () => assert.equal(pair(build((source) => setDelta(source, null, "complete"))).directional_outcome, "insufficient_evidence"));
check("unavailable is not tie", () => assert.notEqual(pair(build((source) => setDelta(source, null, "insufficient_evidence"))).directional_outcome, "exact_tie"));
check("manual review is not loss", () => assert.notEqual(pair(build((source) => setDelta(source, null, "insufficient_evidence"))).directional_outcome, "comparison_loss"));
check("structural missing pair fails", () => assert.throws(() => build((source) => { source.fixture_comparisons[0].comparison_views[0].pairs.pop(); }), /missing a structural pair/u));
check("duplicate pair fails", () => assert.throws(() => build((source) => { source.fixture_comparisons[0].comparison_views[0].pairs[1].repetition = 1; source.fixture_comparisons[0].comparison_views[0].pairs[1].baseline.repetition = 1; source.fixture_comparisons[0].comparison_views[0].pairs[1].comparison.repetition = 1; }), /missing or duplicate pair/u));
check("cross-fixture pair fails", () => assert.throws(() => build((source) => { pairedPair(source).comparison.fixture_id = "fixture-five"; }), /cross-fixture/u));
check("cross-adapter pair fails", () => assert.throws(() => build((source) => { pairedPair(source).comparison.adapter = "claude"; }), /cross-adapter/u));
check("cross-repetition pair fails", () => assert.throws(() => build((source) => { pairedPair(source).comparison.repetition = 2; }), /cross-repetition/u));
check("baseline comparison reversal fails", () => assert.throws(() => build((source) => { const item = pairedPair(source); [item.baseline, item.comparison] = [item.comparison, item.baseline]; }), /reversal or drift/u));

check("complete view count closure", () => assert.equal(view(report).comparison_win_count + view(report).comparison_loss_count + view(report).exact_tie_count, view(report).expected_pair_count));
check("complete view status", () => assert.equal(view(report).directional_summary_status, "complete"));
check("complete view has no insufficient", () => assert.equal(view(report).insufficient_evidence_count, 0));
check("insufficient view status", () => assert.equal(view(build((source) => setDelta(source, null, "insufficient_evidence"))).directional_summary_status, "insufficient_evidence"));
check("insufficient count preserved", () => assert.equal(view(build((source) => setDelta(source, null, "insufficient_evidence"))).insufficient_evidence_count, 1));
check("complete directional count preserved beside insufficient", () => assert.equal(view(build((source) => setDelta(source, null, "insufficient_evidence"))).comparison_win_count, 2));
check("no ready subset denominator", () => assert.equal(Object.hasOwn(view(report), "complete_subset_denominator"), false));
check("no win rate", () => assert.equal(Object.hasOwn(view(report), "win_rate"), false));
check("no majority winner", () => assert.equal(Object.hasOwn(view(report), "majority_winner"), false));
check("no net win scalar", () => assert.equal(Object.hasOwn(view(report), "net_wins"), false));

expectReclosedFailure("reclosed wrong pair outcome", report, (changed) => { pair(changed).directional_outcome = "exact_tie"; });
expectReclosedFailure("reclosed wrong win count", report, (changed) => { view(changed).comparison_win_count -= 1; });
expectReclosedFailure("reclosed wrong loss count", report, (changed) => { view(changed).comparison_loss_count += 1; });
expectReclosedFailure("reclosed wrong tie count", report, (changed) => { view(changed).exact_tie_count += 1; });
expectReclosedFailure("reclosed wrong insufficient count", report, (changed) => { view(changed).insufficient_evidence_count += 1; });
expectReclosedFailure("reclosed wrong view status", report, (changed) => { view(changed).directional_summary_status = "insufficient_evidence"; });
expectReclosedFailure("comparison definition drift", report, (changed) => { changed.comparison_view_definitions[0].comparison_condition = "adaptive_ask"; });
expectReclosedFailure("unknown nested property", report, (changed) => { pair(changed).unexpected = true; });
expectReclosedFailure("absolute path leakage", report, (changed) => { changed.fixture_outcomes[0].fixture_id = "/private/fixture"; }, /absolute filesystem path|Schema validation/u);
expectReclosedFailure("private path leakage", report, (changed) => { changed.fixture_outcomes[0].fixture_id = "private-evaluator/fixture"; }, /private evaluator path/u);
for (const field of ["threshold", "epsilon", "tolerance", "confidence", "weighting", "aggregate"]) expectReclosedFailure(`${field} field rejected`, report, (changed) => { pair(changed)[field] = 0; }, /Schema validation/u);

check("policy digest mismatch", () => { const changedPolicy = structuredClone(policy); changedPolicy.policy_digest = digest("wrong-policy"); assert.throws(() => buildPortfolioDirectionalOutcomeReport({ verifiedComparisonReport: freeze(pairedReport()), verifiedScoringPolicy: freeze(changedPolicy) }), /authority mismatch/u); });
check("paired authority is copied", () => assert.equal(report.authority.paired_comparison_report_id, pairedReport().paired_comparison_report_id));
check("repetition authority is copied", () => assert.match(report.authority.repetition_report_id, /^repetition-report-/u));
check("result-set authority is copied", () => assert.match(report.authority.result_set_id, /^engineering-result-set-/u));
check("report ID drift", () => { const changed = structuredClone(report); changed.directional_outcome_report_id = `directional-outcome-report-${"0".repeat(32)}`; assert.throws(() => validatePortfolioDirectionalOutcomeReport(changed, { root }), /ID/u); });
check("report digest drift", () => { const changed = structuredClone(report); changed.directional_outcome_report_digest = digest("wrong"); assert.throws(() => validatePortfolioDirectionalOutcomeReport(changed, { root }), /digest/u); });
check("deterministic byte-identical regeneration", () => assert.equal(JSON.stringify(build()), JSON.stringify(build())));
check("paired authority is in report identity", () => { const changed = structuredClone(report); changed.authority.paired_comparison_report_digest = digest("changed"); assert.notEqual(computePortfolioDirectionalOutcomeReportId(changed), report.directional_outcome_report_id); });
check("raw delta is in report identity", () => { const changed = structuredClone(report); pair(changed).paired_normalized_quality_delta += 0.01; assert.notEqual(computePortfolioDirectionalOutcomeReportId(changed), report.directional_outcome_report_id); });
check("direction is in report identity", () => { const changed = structuredClone(report); pair(changed).directional_outcome = "comparison_loss"; assert.notEqual(computePortfolioDirectionalOutcomeReportId(changed), report.directional_outcome_report_id); });
check("counts are in report identity", () => { const changed = structuredClone(report); view(changed).comparison_win_count -= 1; assert.notEqual(computePortfolioDirectionalOutcomeReportId(changed), report.directional_outcome_report_id); });
check("boundaries are in report identity", () => { const changed = structuredClone(report); changed.boundaries.product_value_claim = true; assert.notEqual(computePortfolioDirectionalOutcomeReportId(changed), report.directional_outcome_report_id); });

check("meaningful classification remains false", () => assert.equal(report.boundaries.meaningful_delta_classified, false));
check("meaningful threshold remains false", () => assert.equal(report.boundaries.meaningful_delta_threshold_applied, false));
check("product value remains false", () => assert.equal(report.boundaries.product_value_claim, false));
check("Issue 198 remains false", () => assert.equal(report.boundaries.issue_198_stage_0_authorized, false));
check("cross fixture aggregate remains false", () => assert.equal(report.boundaries.cross_fixture_aggregate_calculated, false));
check("cross suite aggregate remains false", () => assert.equal(report.boundaries.cross_suite_aggregate_calculated, false));
check("cross adapter pooling remains false", () => assert.equal(report.boundaries.cross_adapter_pooling, false));
check("win rate remains false", () => assert.equal(report.boundaries.win_rate_calculated, false));
check("majority winner remains false", () => assert.equal(report.boundaries.majority_winner_calculated, false));
check("outcome perspective is comparison condition", () => assert.ok(report.fixture_outcomes.every((item) => item.comparison_views.every((itemView) => itemView.pair_outcomes.every((itemPair) => itemPair.outcome_perspective === "comparison_condition")))));
check("serialized artifact excludes runtime verifier body", () => assert.equal(Object.hasOwn(report, "verified_comparison_report"), false));

assert.ok(covered.size >= 70, `expected at least 70 focused closures, received ${covered.size}`);
console.log(`Portfolio directional outcome report contract test passed (${covered.size} closures).`);
