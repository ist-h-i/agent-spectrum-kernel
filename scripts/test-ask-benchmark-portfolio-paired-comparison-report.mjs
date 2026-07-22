#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPortfolioPairedComparisonReport,
  computePortfolioPairedComparisonReportDigest,
  computePortfolioPairedComparisonReportId,
  validatePortfolioPairedComparisonReport,
} from "./ask-benchmark-portfolio-paired-comparison-report.mjs";
import { buildPortfolioRepetitionReport } from "./ask-benchmark-portfolio-repetition-report.mjs";
import { verifyPortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const CORRECTNESS_KEYS = ["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety"];
const UNSAFE_CATEGORIES = ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"];
const METRICS = ["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "human_effort", "tool_call_count", "file_read_count", "final_output_bytes", "runtime_agent_count", "harness_spawned_secondary_agent_count", "subagent_activity", "capability_downgrade_count"];
const policyVerification = verifyPortfolioPolicyArtifacts({ root });
const policy = policyVerification.verified_scoring_policy;
const covered = new Set();

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function digest(value) { return `sha256:${hash(value)}`; }
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function metric(value, status = value === null ? "unknown" : "known") { return status === "known" ? { status, value, reason: "committed_runtime_evidence" } : { status, value: null, reason: "synthetic_fixture" }; }
function correctness(state = "pass") { return { state, evidence_references: [] }; }
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
    correctness_observations: Object.fromEntries(CORRECTNESS_KEYS.map((keyName) => [keyName, correctness()])),
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
      result_set_id: `engineering-result-set-${hash("set").slice(0, 32)}`, result_set_digest: digest("set-digest"), source_manifest_raw_byte_digest: digest("source-bytes"),
      source_manifest_digest: digest("source"), normalized_generation_id: `snapshot-${hash("snapshot")}`, normalized_manifest_digest: digest("normalized-manifest"),
      source_snapshot_digest: digest("snapshot-digest"), plan_id: `plan-${hash("plan")}`, plan_digest: digest("plan-digest"), run_instance_id: "00000000-0000-4000-8000-000000000197",
      source_revision: "1".repeat(40), adapter_track: "codex", completeness: { expected_result_count: verified_results.length },
    },
    verified_results,
  };
}

function inputs(mutate = null) {
  const verified = verifiedResultSet();
  if (mutate) mutate(verified);
  const report = buildPortfolioRepetitionReport({ verified, policyRevision: policy.policy_revision, scoringPolicyDigest: policy.policy_digest });
  return { verifiedReport: freeze(structuredClone(report)), verifiedResultSet: verified, verifiedScoringPolicy: policy };
}

function build(mutate = null) { return buildPortfolioPairedComparisonReport(inputs(mutate)); }
function close(report) { report.paired_comparison_report_id = computePortfolioPairedComparisonReportId(report); report.paired_comparison_report_digest = computePortfolioPairedComparisonReportDigest(report); return report; }
function check(name, callback) { callback(); covered.add(name); }
function fixture(report, id = "fixture-three") { return report.fixture_comparisons.find((entry) => entry.fixture_id === id); }
function view(report, id = "kernel_vs_plain", fixtureId = "fixture-three") { return fixture(report, fixtureId).comparison_views.find((entry) => entry.view_id === id); }
function pair(report, repetition = 1, viewId = "kernel_vs_plain") { return view(report, viewId).pairs.find((entry) => entry.repetition === repetition); }
function expectReclosedFailure(name, source, mutate, pattern = /closure|drift|Schema validation|ordering|authority|identity|condition|mechanism/u) {
  check(name, () => { const changed = structuredClone(source); mutate(changed); close(changed); assert.throws(() => validatePortfolioPairedComparisonReport(changed, { root }), pattern); });
}

const report = build();
validatePortfolioPairedComparisonReport(report, { root });

check("exactly three B1 comparison views", () => assert.equal(report.comparison_view_definitions.length, 3));
check("B1 policy view order", () => assert.deepEqual(report.comparison_view_definitions.map(({ view_id }) => view_id), ["kernel_vs_plain", "adaptive_vs_kernel", "full_vs_kernel_diagnostic"]));
check("correct baseline/comparison conditions", () => assert.deepEqual(report.comparison_view_definitions.map(({ baseline_condition, comparison_condition }) => [baseline_condition, comparison_condition]), [["plain", "kernel_only"], ["kernel_only", "adaptive_ask"], ["kernel_only", "full_ask"]]));
check("diagnostic role preserved", () => assert.equal(report.comparison_view_definitions[2].view_role, "diagnostic_only"));
check("one adapter only", () => assert.equal(new Set(report.fixture_comparisons.flatMap((item) => item.comparison_views.flatMap((itemView) => itemView.pairs.flatMap((itemPair) => [itemPair.baseline.adapter, itemPair.comparison.adapter])))).size, 1));
check("one fixture only per comparison group", () => assert.equal(new Set(view(report).pairs.flatMap((item) => [item.baseline.fixture_id, item.comparison.fixture_id])).size, 1));
check("exact 3-pair inventory", () => assert.equal(view(report).pairs.length, 3));
check("exact 5-pair inventory", () => assert.equal(view(report, "kernel_vs_plain", "fixture-five").pairs.length, 5));
check("same-repetition pairing", () => assert.ok(view(report).pairs.every((item) => item.repetition === item.baseline.repetition && item.repetition === item.comparison.repetition)));
check("quality delta comparison-minus-baseline", () => assert.equal(pair(report).quality_delta.normalized_requirement_score_delta, pair(report).comparison.normalized_requirement_score - pair(report).baseline.normalized_requirement_score));
check("positive quality delta", () => assert.ok(pair(report).quality_delta.normalized_requirement_score_delta > 0));
check("negative quality delta", () => { const changed = build((verified) => { const a = verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain" && item.repetition === 1).result; const b = verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "kernel_only" && item.repetition === 1).result; a.requirement_score.normalized_requirement_score = 0.9; b.requirement_score.normalized_requirement_score = 0.1; }); assert.ok(pair(changed).quality_delta.normalized_requirement_score_delta < 0); });
check("zero delta canonicalization", () => { const changed = build((verified) => { const entries = verified.verified_results.filter(({ result: item }) => item.fixture_id === "fixture-three" && item.repetition === 1 && ["plain", "kernel_only"].includes(item.condition)); entries.forEach(({ result: item }) => { item.requirement_score.normalized_requirement_score = 0.5; }); }); assert.equal(Object.is(pair(changed).quality_delta.normalized_requirement_score_delta, -0), false); });
check("complete quality delta distribution", () => assert.equal(view(report).quality_delta_distribution.distribution_status, "complete"));
check("exact paired mean", () => assert.equal(view(report).quality_delta_distribution.mean, view(report).pairs.reduce((sum, item) => sum + item.quality_delta.normalized_requirement_score_delta, 0) / 3));
check("exact paired median", () => assert.equal(view(report).quality_delta_distribution.median, view(report).pairs[1].quality_delta.normalized_requirement_score_delta));
check("population variance uses N", () => { const values = view(report).pairs.map((item) => item.quality_delta.normalized_requirement_score_delta); const mean = values.reduce((sum, value) => sum + value, 0) / values.length; assert.equal(view(report).quality_delta_distribution.population_variance, values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length); });
check("population standard deviation", () => assert.equal(view(report).quality_delta_distribution.population_standard_deviation, Math.sqrt(view(report).quality_delta_distribution.population_variance)));

for (const [name, condition, status, outcome] of [
  ["non-ready baseline makes quality distribution insufficient", "plain", "not_scoring_ready", "unavailable"],
  ["non-ready comparison makes quality distribution insufficient", "kernel_only", "not_scoring_ready", "unavailable"],
  ["unavailable is not zero", "plain", "not_scoring_ready", "unavailable"],
  ["manual review is not zero", "plain", "not_scoring_ready", "completed"],
]) check(name, () => {
  const changed = build((verified) => { const item = verified.verified_results.find(({ result: entry }) => entry.fixture_id === "fixture-three" && entry.condition === condition && entry.repetition === 1).result; item.scoring_status = status; item.normalized_outcome = outcome; item.evaluation_status = name.includes("manual") ? "manual_review_required" : "evaluator_unavailable"; item.scoring_reason = name.includes("manual") ? "manual_review_required" : "evaluator_unavailable"; item.requirement_score = { scored_requirement_count: null, requirement_points_earned: null, requirement_points_possible: null, normalized_requirement_score: null }; item.blockers.gate_status = "not_scoring_ready"; item.safety_blocker.status = "not_scoring_ready"; });
  assert.equal(view(changed).quality_delta_distribution.distribution_status, "insufficient_evidence"); assert.equal(view(changed).quality_delta_distribution.mean, null);
});
check("no ready-subset averaging", () => { const changed = build((verified) => { const item = verified.verified_results.find(({ result: entry }) => entry.fixture_id === "fixture-three" && entry.condition === "plain" && entry.repetition === 1).result; item.scoring_status = "not_scoring_ready"; item.normalized_outcome = "unavailable"; item.evaluation_status = "evaluator_unavailable"; item.scoring_reason = "evaluator_unavailable"; item.requirement_score = { scored_requirement_count: null, requirement_points_earned: null, requirement_points_possible: null, normalized_requirement_score: null }; item.blockers.gate_status = "not_scoring_ready"; item.safety_blocker.status = "not_scoring_ready"; }); assert.equal(view(changed).quality_delta_distribution.sample_count, 0); });

check("all-known overhead delta", () => assert.equal(pair(report).overhead_deltas.duration_ms.delta_status, "complete"));
for (const [name, condition, status] of [["unknown baseline metric makes metric insufficient", "plain", "unknown"], ["unknown comparison metric makes metric insufficient", "kernel_only", "unknown"], ["unavailable metric is not zero", "plain", "unavailable"]]) check(name, () => { const changed = build((verified) => { verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === condition && item.repetition === 1).result.overhead_telemetry.duration_ms = metric(null, status); }); assert.equal(view(changed).overhead_delta_distributions.duration_ms.distribution_status, "insufficient_evidence"); assert.equal(view(changed).overhead_delta_distributions.duration_ms.mean, null); });
check("monetary cost not inferred", () => { const changed = build((verified) => { verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain" && item.repetition === 1).result.overhead_telemetry.monetary_cost = metric(null, "unknown"); }); assert.equal(pair(changed).overhead_deltas.monetary_cost.delta, null); });
check("human effort not inferred", () => { const changed = build((verified) => { verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain" && item.repetition === 1).result.overhead_telemetry.human_effort = metric(null, "unknown"); }); assert.equal(pair(changed).overhead_deltas.human_effort.delta, null); });
check("mixed units not combined", () => assert.notEqual(pair(report).overhead_deltas.duration_ms.unit, pair(report).overhead_deltas.input_tokens.unit));
check("false-positive raw delta", () => assert.equal(pair(report).raw_categorical_deltas.false_positives.raw_count_delta, pair(report).comparison.false_positive_raw_count - pair(report).baseline.false_positive_raw_count));
check("no false-positive unit mapping", () => assert.equal(pair(report).raw_categorical_deltas.false_positives.false_positive_unit_mapping_applied, false));
check("scope-deviation raw delta", () => assert.equal(pair(report).raw_categorical_deltas.scope_deviations.count_delta, pair(report).comparison.scope_deviation_raw_count - pair(report).baseline.scope_deviation_raw_count));
check("correctness states remain state pairs", () => assert.deepEqual(pair(report).raw_categorical_deltas.correctness_state_pairs.quality, { baseline_state: "pass", comparison_state: "pass" }));
check("no correctness penalty", () => assert.equal(pair(report).raw_categorical_deltas.correctness_penalty_applied, false));
check("unsafe actions remain category vectors", () => assert.equal(pair(report).raw_categorical_deltas.unsafe_action_category_deltas.length, 4));
check("no safety scalar", () => assert.equal(pair(report).raw_categorical_deltas.safety_scalar_calculated, false));
check("blocker transitions separate", () => assert.equal(view(report).blocker_transition_counts.pass_to_pass, 3));
check("safety transitions separate", () => assert.equal(view(report).safety_transition_counts.pass_to_pass, 3));
check("mechanisms receive no credit", () => assert.equal(pair(report).raw_categorical_deltas.mechanism_quality_credit_applied, false));

check("policy digest mismatch", () => { const changedPolicy = structuredClone(policy); changedPolicy.policy_digest = digest("wrong-policy"); assert.throws(() => buildPortfolioPairedComparisonReport({ ...inputs(), verifiedScoringPolicy: freeze(changedPolicy) }), /policy authority mismatch/u); });
check("policy view definition drift", () => { const changedPolicy = structuredClone(policy); changedPolicy.aggregation_policy.comparison_views[0].comparison_condition = "adaptive_ask"; assert.throws(() => buildPortfolioPairedComparisonReport({ ...inputs(), verifiedScoringPolicy: freeze(changedPolicy) }), /B1 comparison views/u); });
check("repetition report authority drift", () => { const input = inputs(); const changed = structuredClone(input.verifiedReport); changed.authority.result_set_digest = digest("wrong-set"); assert.throws(() => buildPortfolioPairedComparisonReport({ ...input, verifiedReport: freeze(changed) }), /result-set authority mismatch/u); });
check("result-set authority drift", () => { const input = inputs(); input.verifiedResultSet.artifact.result_set_digest = digest("wrong-set"); assert.throws(() => buildPortfolioPairedComparisonReport(input), /result-set authority mismatch/u); });
check("mechanism inventory mismatch fails closed", () => assert.throws(() => build((verified) => { verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "kernel_only" && item.repetition === 1).result.mechanism_observations.required_mechanisms[0].mechanism_id = "different"; }), /mechanism ID\/classification inventories/u));
check("missing baseline", () => assert.throws(() => build((verified) => { const index = verified.verified_results.findIndex(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain" && item.repetition === 1); verified.verified_results.splice(index, 1); verified.artifact.completeness.expected_result_count -= 1; }), /inventory/u));
check("missing comparison", () => assert.throws(() => build((verified) => { const index = verified.verified_results.findIndex(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "kernel_only" && item.repetition === 1); verified.verified_results.splice(index, 1); verified.artifact.completeness.expected_result_count -= 1; }), /inventory/u));
check("duplicate baseline", () => assert.throws(() => build((verified) => { verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain" && item.repetition === 2).result.repetition = 1; }), /inventory/u));
check("duplicate comparison", () => assert.throws(() => build((verified) => { verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "kernel_only" && item.repetition === 2).result.repetition = 1; }), /inventory/u));
check("extra repetition", () => assert.throws(() => build((verified) => { const extra = structuredClone(verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain" && item.repetition === 3)); extra.result.repetition = 4; extra.result.engineering_result_id = `engineering-result-${hash("extra").slice(0, 32)}`; verified.verified_results.push(extra); verified.artifact.completeness.expected_result_count += 1; }), /inventory/u));
check("three and five repetition inventories do not mix", () => assert.throws(() => build((verified) => { verified.verified_results.find(({ result: item }) => item.fixture_id === "fixture-three" && item.condition === "plain" && item.repetition === 3).result.repetition = 5; }), /inventory/u));

expectReclosedFailure("baseline/comparison reversal rejection", report, (changed) => { const item = pair(changed); [item.baseline, item.comparison] = [item.comparison, item.baseline]; });
expectReclosedFailure("cross-fixture pairing", report, (changed) => { pair(changed).comparison.fixture_id = "fixture-five"; });
expectReclosedFailure("cross-adapter pairing", report, (changed) => { pair(changed).comparison.adapter = "claude"; });
expectReclosedFailure("cross-repetition pairing", report, (changed) => { pair(changed).comparison.repetition = 2; });
expectReclosedFailure("reclosed pair policy digest drift", report, (changed) => { pair(changed).comparison.scoring_policy_digest = digest("pair-policy-drift"); }, /authority|identity/u);
expectReclosedFailure("reclosed wrong score delta", report, (changed) => { pair(changed).quality_delta.normalized_requirement_score_delta += 0.1; });
expectReclosedFailure("reclosed wrong telemetry delta", report, (changed) => { pair(changed).overhead_deltas.duration_ms.delta += 1; });
expectReclosedFailure("reclosed wrong distribution", report, (changed) => { view(changed).quality_delta_distribution.mean += 0.1; });
expectReclosedFailure("reclosed blocker transition drift", report, (changed) => { view(changed).blocker_transition_counts.pass_to_pass -= 1; view(changed).blocker_transition_counts.pass_to_fail += 1; });
expectReclosedFailure("reclosed safety transition drift", report, (changed) => { view(changed).safety_transition_counts.pass_to_pass -= 1; view(changed).safety_transition_counts.pass_to_fail += 1; });
expectReclosedFailure("reclosed raw category drift", report, (changed) => { pair(changed).raw_categorical_deltas.false_positives.raw_count_delta += 1; });
expectReclosedFailure("unknown nested property", report, (changed) => { pair(changed).quality_delta.arbitrary = true; });
expectReclosedFailure("absolute path leakage", report, (changed) => { pair(changed).baseline.path = "/private/result.json"; }, /absolute filesystem path|Schema validation/u);
expectReclosedFailure("private path leakage", report, (changed) => { pair(changed).baseline.path = "private-evaluator/result.json"; }, /private evaluator path/u);
check("report ID drift", () => { const changed = structuredClone(report); changed.paired_comparison_report_id = `paired-comparison-report-${"0".repeat(32)}`; assert.throws(() => validatePortfolioPairedComparisonReport(changed, { root }), /ID/u); });
check("report digest drift", () => { const changed = structuredClone(report); changed.paired_comparison_report_digest = digest("wrong"); assert.throws(() => validatePortfolioPairedComparisonReport(changed, { root }), /digest/u); });
check("byte-identical deterministic regeneration", () => assert.equal(JSON.stringify(build()), JSON.stringify(build())));
check("serialized artifact contains no runtime-only verifier body", () => assert.equal(Object.hasOwn(report, "verified_report"), false));
check("frozen report input rejects mutation", () => { const input = inputs(); assert.throws(() => { input.verifiedReport.fixture_reports[0].fixture_id = "mutated"; }, TypeError); });
for (const [name, field] of [["no condition classification fields", "win_loss_tie"], ["no weighting fields", "weight"], ["no aggregate fields", "aggregate"], ["no bootstrap/confidence fields", "confidence_interval"]]) check(name, () => assert.equal(JSON.stringify(report).includes(`\"${field}\"`), false));
check("comparison definition is in report identity", () => { const changed = structuredClone(report); changed.comparison_view_definitions[0].view_role = "diagnostic_only"; assert.notEqual(computePortfolioPairedComparisonReportId(changed), report.paired_comparison_report_id); });
check("pair source values are in report identity", () => { const changed = structuredClone(report); pair(changed).baseline.bytes += 1; assert.notEqual(computePortfolioPairedComparisonReportId(changed), report.paired_comparison_report_id); });
check("quality insufficient is independent from overhead", () => { const changed = build((verified) => { const item = verified.verified_results.find(({ result: entry }) => entry.fixture_id === "fixture-three" && entry.condition === "plain" && entry.repetition === 1).result; item.scoring_status = "not_scoring_ready"; item.normalized_outcome = "unavailable"; item.evaluation_status = "evaluator_unavailable"; item.scoring_reason = "evaluator_unavailable"; item.requirement_score = { scored_requirement_count: null, requirement_points_earned: null, requirement_points_possible: null, normalized_requirement_score: null }; item.blockers.gate_status = "not_scoring_ready"; item.safety_blocker.status = "not_scoring_ready"; }); assert.equal(view(changed).quality_delta_distribution.distribution_status, "insufficient_evidence"); assert.equal(view(changed).overhead_delta_distributions.duration_ms.distribution_status, "complete"); });
check("diagnostic view is not product claim", () => assert.equal(report.boundaries.product_value_claim, false));
check("paired report does not authorize measured execution", () => assert.equal(report.boundaries.measured_execution_authorized, false));
check("paired report does not authorize Issue 198", () => assert.equal(report.boundaries.issue_198_stage_0_authorized, false));
check("cross-fixture aggregate is false", () => assert.equal(report.boundaries.cross_fixture_aggregate_calculated, false));
check("cross-suite aggregate is false", () => assert.equal(report.boundaries.cross_suite_aggregate_calculated, false));
check("cross-adapter pooling is false", () => assert.equal(report.boundaries.cross_adapter_pooling, false));

assert.equal(covered.size, 83, `expected 83 focused closures, received ${covered.size}`);
console.log(`Portfolio paired comparison report contract test passed (${covered.size} closures).`);
