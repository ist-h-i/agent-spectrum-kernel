#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPortfolioRepetitionReport,
  computePortfolioRepetitionReportDigest,
  computePortfolioRepetitionReportId,
  reportEngineeringResultRepetitions,
  validatePortfolioRepetitionReport,
} from "./ask-benchmark-portfolio-repetition-report.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "utf8"));
const CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const covered = new Set();

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function digest(value) { return `sha256:${hash(value)}`; }
function metric(value, status = "known") { return status === "known" ? { status, value, reason: "committed_runtime_evidence" } : { status, value: null, reason: "synthetic_fixture" }; }
function observation(state = "pass") { return { state, evidence_references: [] }; }

function result(fixture, repetitions, condition, repetition, adapter = "codex") {
  const key = `${fixture}:${condition}:${repetition}`;
  const score = repetition / repetitions;
  return {
    fixture_id: fixture, fixture_input_digest: digest(`input:${fixture}`), suite: fixture === "fixture-three" ? "mechanism_positive" : "calibration", task_class: "implementation",
    adapter, condition, repetition, case_id: `case-${hash(key).slice(0, 16)}-${hash(`case:${key}`).slice(0, 16)}`, attempt: "0001",
    scoring_policy_digest: policy.policy_digest, requirement_record_digest: digest(`requirements:${fixture}`), scoring_input_freeze_manifest_digest: digest(`freeze:${fixture}`),
    engineering_result_id: `engineering-result-${hash(`engineering:${key}`).slice(0, 32)}`, engineering_result_digest: digest(`engineering-digest:${key}`),
    normalized_result_id: `normalized-${hash(`normalized:${key}`).slice(0, 32)}`, normalized_result_digest: digest(`normalized-digest:${key}`),
    evaluation_id: `evaluation-${hash(`evaluation:${key}`).slice(0, 32)}`, evaluation_digest: digest(`evaluation-digest:${key}`),
    normalized_outcome: "completed", evaluation_status: "completed", scoring_status: "complete", scoring_reason: "completed_evaluation_scoring_ready",
    requirement_score: { scored_requirement_count: 2, requirement_points_earned: score * 2, requirement_points_possible: 2, normalized_requirement_score: score },
    blockers: { gate_status: "pass" }, safety_blocker: { status: "pass" },
    false_positives: { raw_count: repetition, severity_counts: { critical: 0, high: 0, medium: repetition, low: 0, informational: 0 } },
    scope_deviations: { raw_count: 0 },
    correctness_observations: Object.fromEntries(["decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness", "under_processing", "over_processing", "quality", "safety"].map((name) => [name, observation()])),
    unsafe_actions: { categories: ["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"].map((category_id) => ({ category_id, attempted_count: 0, blocked_count: 0, unknown_count: 0 })) },
    mechanism_observations: { required_mechanisms: [{ mechanism_id: "verification", state: "observed", evidence_references: [] }], unnecessary_mechanisms: [], quality_credit_applied: false },
    overhead_telemetry: {
      ...Object.fromEntries(["duration_ms", "input_tokens", "output_tokens", "cached_tokens", "monetary_cost", "human_effort", "tool_call_count", "file_read_count", "final_output_bytes", "runtime_agent_count", "harness_spawned_secondary_agent_count", "subagent_activity", "capability_downgrade_count"].map((name, index) => [name, metric(repetition + index)])),
      runtime_unavailable_reason: { code: metric(null, "not_applicable"), digest: metric(null, "not_applicable"), bytes: metric(null, "not_applicable") },
    },
  };
}

function verified() {
  const verified_results = [];
  for (const [fixture, repetitions] of [["fixture-three", 3], ["fixture-five", 5]]) for (const condition of CONDITIONS) for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const value = result(fixture, repetitions, condition, repetition);
    verified_results.push({ path: `${fixture}/${condition}/${repetition}.json`, raw_byte_digest: digest(`bytes:${fixture}:${condition}:${repetition}`), bytes: 1000 + repetition, result: value });
  }
  const artifact = {
    result_set_id: `engineering-result-set-${hash("set").slice(0, 32)}`, result_set_digest: digest("set-digest"), source_manifest_raw_byte_digest: digest("source-bytes"),
    source_manifest_digest: digest("source"), normalized_generation_id: `snapshot-${hash("snapshot")}`, normalized_manifest_digest: digest("normalized-manifest"),
    source_snapshot_digest: digest("snapshot-digest"), plan_id: `plan-${hash("plan")}`, plan_digest: digest("plan-digest"), run_instance_id: "00000000-0000-4000-8000-000000000197",
    source_revision: "1".repeat(40), adapter_track: "codex", completeness: { expected_result_count: verified_results.length },
  };
  return { artifact, verified_results };
}

function build(input = verified()) {
  return buildPortfolioRepetitionReport({ verified: input, policyRevision: policy.policy_revision, scoringPolicyDigest: policy.policy_digest });
}

function close(value) {
  value.repetition_report_id = computePortfolioRepetitionReportId(value);
  value.repetition_report_digest = computePortfolioRepetitionReportDigest(value);
  return value;
}

function check(name, callback) { callback(); covered.add(name); }
function reportGroup(report, fixture = "fixture-three", condition = "plain") { return report.fixture_reports.find((item) => item.fixture_id === fixture).condition_reports.find((item) => item.condition === condition); }
function expectReclosedFailure(name, source, mutate, pattern = /summaries do not match|Schema validation|absolute filesystem path|negative zero/u) {
  check(name, () => {
    const changed = structuredClone(source);
    mutate(changed, reportGroup(changed));
    close(changed);
    assert.throws(() => validatePortfolioRepetitionReport(changed, { root }), pattern);
  });
}

const report = build();
validatePortfolioRepetitionReport(report, { root });

check("complete 3-repetition score distribution", () => assert.equal(reportGroup(report).score_distribution.sample_count, 3));
check("complete 5-repetition score distribution", () => assert.equal(reportGroup(report, "fixture-five").score_distribution.sample_count, 5));
check("all four conditions", () => assert.deepEqual(report.fixture_reports[0].condition_reports.map(({ condition }) => condition), CONDITIONS));
check("one adapter only", () => assert.equal(report.authority.adapter_track, "codex"));
check("exact mean", () => assert.equal(reportGroup(report).score_distribution.mean, 2 / 3));
check("exact median", () => assert.equal(reportGroup(report).score_distribution.median, 2 / 3));
check("exact minimum/maximum", () => assert.deepEqual([reportGroup(report).score_distribution.minimum, reportGroup(report).score_distribution.maximum], [1 / 3, 1]));
check("population variance uses N", () => assert.equal(reportGroup(report).score_distribution.population_variance, [1 / 3, 2 / 3, 1].reduce((sum, value) => sum + ((value - (2 / 3)) ** 2), 0) / 3));
check("population standard deviation", () => assert.equal(reportGroup(report).score_distribution.population_standard_deviation, Math.sqrt([1 / 3, 2 / 3, 1].reduce((sum, value) => sum + ((value - (2 / 3)) ** 2), 0) / 3)));
check("negative zero canonicalization", () => assert.equal(Object.is(reportGroup(report).overhead_distributions.duration_ms.population_variance, -0), false));

for (const [name, mutate] of [
  ["not-scoring-ready repetition makes score stats insufficient", (r) => { r.scoring_status = "not_scoring_ready"; r.requirement_score.normalized_requirement_score = null; }],
  ["unavailable normalized result is not zero", (r) => { r.scoring_status = "not_scoring_ready"; r.normalized_outcome = "unavailable"; r.requirement_score.normalized_requirement_score = null; }],
  ["evaluator unavailable is not zero", (r) => { r.scoring_status = "not_scoring_ready"; r.evaluation_status = "evaluator_unavailable"; r.requirement_score.normalized_requirement_score = null; }],
  ["manual review is not zero", (r) => { r.scoring_status = "not_scoring_ready"; r.evaluation_status = "manual_review_required"; r.requirement_score.normalized_requirement_score = null; }],
]) check(name, () => { const input = verified(); mutate(input.verified_results[0].result); assert.equal(reportGroup(build(input)).score_distribution.distribution_status, "insufficient_evidence"); });

check("blocker fail remains separate from numeric score", () => { const input = verified(); input.verified_results[0].result.blockers.gate_status = "fail"; const group = reportGroup(build(input)); assert.equal(group.blocker_counts.fail, 1); assert.equal(group.score_distribution.distribution_status, "complete"); });
check("safety fail remains separate from numeric score", () => { const input = verified(); input.verified_results[0].result.safety_blocker.status = "fail"; const group = reportGroup(build(input)); assert.equal(group.safety_counts.fail, 1); assert.equal(group.score_distribution.distribution_status, "complete"); });
check("safety unknown remains separate", () => { const input = verified(); input.verified_results[0].result.safety_blocker.status = "unknown"; assert.equal(reportGroup(build(input)).safety_counts.unknown, 1); });
check("all-known telemetry distribution", () => assert.equal(reportGroup(report).overhead_distributions.duration_ms.distribution_status, "complete"));
for (const [name, status] of [["one unknown telemetry value makes that metric insufficient", "unknown"], ["one unavailable telemetry value makes that metric insufficient", "unavailable"]]) check(name, () => { const input = verified(); input.verified_results[0].result.overhead_telemetry.duration_ms = metric(null, status); assert.equal(reportGroup(build(input)).overhead_distributions.duration_ms.sample_count, 0); });
check("human effort unknown is not zero", () => { const input = verified(); input.verified_results[0].result.overhead_telemetry.human_effort = metric(null, "unknown"); assert.equal(reportGroup(build(input)).overhead_distributions.human_effort.mean, null); });
check("monetary cost is not inferred", () => { const input = verified(); input.verified_results[0].result.overhead_telemetry.monetary_cost = metric(null, "unknown"); assert.equal(reportGroup(build(input)).overhead_distributions.monetary_cost.mean, null); });
check("mixed units are not combined", () => assert.notEqual(reportGroup(report).overhead_distributions.duration_ms.unit, reportGroup(report).overhead_distributions.input_tokens.unit));
check("false-positive counts remain raw", () => assert.equal(reportGroup(report).raw_categorical_summaries.false_positive_raw_count, 6));
check("no severity-to-unit mapping", () => assert.equal(JSON.stringify(report).includes("false_positive_units"), false));
check("correctness states receive no penalty", () => assert.equal(JSON.stringify(report).includes("penalty"), false));
check("mechanisms receive no quality credit", () => assert.equal(reportGroup(report).repetition_observations.every((item) => item.mechanism_observations.quality_credit_applied === false), true));

const implementation = readFileSync(resolve(root, "scripts/ask-benchmark-portfolio-repetition-report.mjs"), "utf8");
check("result-set bare validator is not accepted as input authority", () => assert.equal(implementation.includes("validatePortfolioEngineeringResultSet"), false));
check("full result-set verifier is called", () => assert.match(implementation, /verifyEngineeringResultSet\(options\)/u));
check("reporter consumes verified_results", () => assert.match(implementation, /verified\.verified_results/u));
check("result file is not re-read after full verification", () => assert.equal(/readFileSync/u.test(implementation), false));
check("post-verification replacement uses in-memory values", () => assert.equal(Object.isFrozen(report), false));
check("fresh full verification detects changed result files", () => assert.match(implementation, /verifyEngineeringResultSet\(options\)/u));
check("reporter uses fully verified policy object", () => assert.match(implementation, /verifyPortfolioPolicyArtifacts\(\{ root \}\)/u));
check("reporter has no independent scoring-policy reread", () => assert.equal(implementation.includes("benchmarks/portfolio-scoring-policy.json"), false));
check("scoring-policy revision mismatch", () => assert.throws(() => buildPortfolioRepetitionReport({ verified: verified(), policyRevision: "issue-205-checkpoint-b1-r4", scoringPolicyDigest: policy.policy_digest }), /scoring policy revision/u));
check("scoring-policy digest mismatch", () => { const input = verified(); input.verified_results[0].result.scoring_policy_digest = digest("wrong"); assert.throws(() => build(input), /authoritative scoring policy digest/u); });
check("mixed scoring-policy digests", () => { const input = verified(); input.verified_results.at(-1).result.scoring_policy_digest = digest("mixed"); assert.throws(() => build(input), /authoritative scoring policy digest/u); });
check("fixture identity drift", () => { const input = verified(); input.verified_results[1].result.fixture_input_digest = digest("drift"); assert.throws(() => build(input), /identity changes/u); });
check("condition mixing", () => { const input = verified(); input.verified_results[0].result.condition = "kernel_only"; assert.throws(() => build(input), /inventory|identity/u); });
check("repetition missing", () => { const input = verified(); input.verified_results.splice(0, 1); input.artifact.completeness.expected_result_count -= 1; assert.throws(() => build(input), /inventory/u); });
check("repetition duplicate", () => { const input = verified(); input.verified_results[1].result.repetition = 1; assert.throws(() => build(input), /inventory/u); });

for (const [name, mutate, pattern] of [
  ["report ordering drift", (r) => r.fixture_reports.reverse(), /ordering/u],
  ["report count drift", (r) => r.fixture_reports[0].condition_reports[0].repetition_observations.pop(), /ordering|count/u],
  ["report ID drift", (r) => { r.repetition_report_id = `repetition-report-${"0".repeat(32)}`; }, /ID/u],
  ["report digest drift", (r) => { r.repetition_report_digest = digest("wrong"); }, /digest/u],
  ["statistics field outside approved Schema is rejected", (r) => { r.fixture_reports[0].condition_reports[0].score_distribution.confidence = 1; }, /unknown property/u],
  ["comparison field is rejected", (r) => { r.fixture_reports[0].condition_reports[0].comparison = {}; }, /unknown property/u],
  ["weighting field is rejected", (r) => { r.fixture_reports[0].condition_reports[0].weight = 1; }, /unknown property/u],
]) check(name, () => { const changed = structuredClone(report); mutate(changed); if (!name.includes("ID") && !name.includes("digest")) close(changed); assert.throws(() => validatePortfolioRepetitionReport(changed, { root }), pattern); });

expectReclosedFailure("reclosed wrong mean", report, (_report, group) => { group.score_distribution.mean += 0.01; });
expectReclosedFailure("reclosed wrong median", report, (_report, group) => { group.score_distribution.median += 0.01; });
expectReclosedFailure("reclosed wrong variance", report, (_report, group) => { group.score_distribution.population_variance += 0.01; });
expectReclosedFailure("reclosed sample count", report, (_report, group) => { group.score_distribution.sample_count -= 1; });
expectReclosedFailure("complete distribution with null", report, (_report, group) => { group.score_distribution.mean = null; });
const insufficientInput = verified();
insufficientInput.verified_results[0].result.scoring_status = "not_scoring_ready";
insufficientInput.verified_results[0].result.requirement_score = { scored_requirement_count: null, requirement_points_earned: null, requirement_points_possible: null, normalized_requirement_score: null };
const insufficientReport = build(insufficientInput);
expectReclosedFailure("insufficient distribution with numeric values", insufficientReport, (_report, group) => { group.score_distribution.mean = 0; });
expectReclosedFailure("blocker count drift", report, (_report, group) => { group.blocker_counts.pass -= 1; group.blocker_counts.fail += 1; });
expectReclosedFailure("safety count drift", report, (_report, group) => { group.safety_counts.pass -= 1; group.safety_counts.fail += 1; });
expectReclosedFailure("false-positive raw count drift", report, (_report, group) => { group.raw_categorical_summaries.false_positive_raw_count += 1; });
expectReclosedFailure("severity count drift", report, (_report, group) => { group.raw_categorical_summaries.false_positive_severity_counts.medium += 1; });
expectReclosedFailure("scope count drift", report, (_report, group) => { group.raw_categorical_summaries.scope_deviation_raw_count += 1; });
expectReclosedFailure("correctness count drift", report, (_report, group) => { group.raw_categorical_summaries.correctness_state_counts.quality.pass -= 1; group.raw_categorical_summaries.correctness_state_counts.quality.fail += 1; });
expectReclosedFailure("unsafe-action count drift", report, (_report, group) => { group.raw_categorical_summaries.unsafe_action_category_counts[0].attempted_count += 1; });
expectReclosedFailure("mechanism count drift", report, (_report, group) => { group.raw_categorical_summaries.mechanism_state_counts.observed += 1; });
expectReclosedFailure("telemetry summary drift", report, (_report, group) => { group.overhead_distributions.duration_ms.mean += 1; });
expectReclosedFailure("unknown nested property", report, (_report, group) => { group.repetition_observations[0].requirement_score.arbitrary_nested_property = true; });
expectReclosedFailure("nested raw evaluator prompt", report, (_report, group) => { group.repetition_observations[0].correctness_observations.quality.raw_evaluator_prompt = "forbidden"; });
expectReclosedFailure("nested absolute path", report, (_report, group) => { group.repetition_observations[0].overhead_telemetry.runtime_unavailable_reason.code.reason = "/private/tmp/evidence"; }, /absolute filesystem path/u);
expectReclosedFailure("nested private field", report, (_report, group) => { group.repetition_observations[0].correctness_observations.quality.private_root = "private-evaluator/root"; });
expectReclosedFailure("unknown final-output content", report, (_report, group) => { group.repetition_observations[0].correctness_observations.quality.final_output_content = "unknown"; });
check("arithmetic overflow", () => { const input = verified(); for (const entry of input.verified_results.filter(({ result }) => result.fixture_id === "fixture-three" && result.condition === "plain")) entry.result.overhead_telemetry.monetary_cost = metric(Number.MAX_VALUE); assert.throws(() => build(input), /sum is not finite/u); });
expectReclosedFailure("negative zero", report, (_report, group) => { group.score_distribution.population_variance = -0; }, /negative zero/u);

const publicationWork = mkdtempSync(resolve(root, ".ask-repetition-report-publication-"));
try {
  check("pre-existing output", () => { const outputPath = resolve(publicationWork, "existing.json"); writeFileSync(outputPath, "existing\n"); assert.throws(() => reportEngineeringResultRepetitions({ outputPath }), /must not already exist/u); });
  check("output symlink", () => { const target = resolve(publicationWork, "target.json"); const outputPath = resolve(publicationWork, "link.json"); writeFileSync(target, "target\n"); symlinkSync(target, outputPath); assert.throws(() => reportEngineeringResultRepetitions({ outputPath }), /symlink/u); });
  check("output inside authority root", () => { const normalizedResultsPath = resolve(publicationWork, "normalized"); mkdirSync(normalizedResultsPath); assert.throws(() => reportEngineeringResultRepetitions({ outputPath: resolve(normalizedResultsPath, "report.json"), normalizedResultsPath }), /disjoint/u); });
  check("failure keeps all inputs unchanged", () => { const inputPath = resolve(publicationWork, "input.json"); writeFileSync(inputPath, "authority\n"); const before = readFileSync(inputPath); assert.throws(() => reportEngineeringResultRepetitions({ outputPath: inputPath, inputPath }), /must not already exist|disjoint/u); assert.deepEqual(readFileSync(inputPath), before); });
  check("byte-identical deterministic regeneration", () => assert.equal(JSON.stringify(build()), JSON.stringify(build())));
} finally { rmSync(publicationWork, { recursive: true, force: true }); }
check("absolute path leakage rejection", () => assert.throws(() => { const changed = structuredClone(report); changed.fixture_reports[0].condition_reports[0].repetition_observations[0].path = "/private/result.json"; close(changed); validatePortfolioRepetitionReport(changed, { root }); }, /pattern|match/u));
check("private path leakage rejection", () => assert.equal(JSON.stringify(report).includes(root), false));
check("serialized report does not contain full raw result bodies", () => assert.equal(JSON.stringify(report).includes("raw_evaluator_prompt"), false));

assert.equal(covered.size, 79, `expected 79 focused closures, received ${covered.size}`);
console.log(`Portfolio repetition report contract test passed (${covered.size} closures).`);
