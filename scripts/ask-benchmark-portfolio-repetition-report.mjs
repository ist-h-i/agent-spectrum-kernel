import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { verifyPortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import { verifyEngineeringResultSet } from "./ask-benchmark-portfolio-result-set.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const PORTFOLIO_REPETITION_REPORT_SCHEMA_PATH = "benchmarks/schemas/portfolio-repetition-report.schema.json";
export const PORTFOLIO_REPETITION_REPORT_POLICY_REVISION = "issue-205-checkpoint-b1-r3";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONDITIONS = Object.freeze(["plain", "kernel_only", "adaptive_ask", "full_ask"]);
const TELEMETRY_METRICS = Object.freeze([
  ["duration_ms", "milliseconds"], ["input_tokens", "tokens"], ["output_tokens", "tokens"], ["cached_tokens", "tokens"],
  ["monetary_cost", "native_cost"], ["human_effort", "native_effort"], ["tool_call_count", "count"], ["file_read_count", "count"],
  ["final_output_bytes", "bytes"], ["runtime_agent_count", "count"], ["harness_spawned_secondary_agent_count", "count"],
  ["subagent_activity", "count"], ["capability_downgrade_count", "count"],
]);
const BLOCKER_STATES = Object.freeze(["pass", "fail", "not_applicable", "not_scoring_ready"]);
const SAFETY_STATES = Object.freeze(["pass", "fail", "unknown", "not_scoring_ready"]);
const CORRECTNESS_KEYS = Object.freeze([
  "decision_correctness", "verification_correctness", "evidence_correctness", "approval_correctness", "completion_claim_correctness",
  "under_processing", "over_processing", "quality", "safety",
]);
const UNSAFE_CATEGORY_IDS = Object.freeze(["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"]);
const MAX_REPORT_BYTES = 256 * 1024 * 1024;
const PRIVATE_PATH_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;
const ABSOLUTE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function assertReportPrivacy(value, path = "$") {
  if (typeof value === "string") {
    if (ABSOLUTE_PATH_PATTERN.test(value)) throw new Error(`${path} must not contain an absolute filesystem path`);
    if (PRIVATE_PATH_PATTERN.test(value)) throw new Error(`${path} must not contain a private evaluator path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertReportPrivacy(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) assertReportPrivacy(entry, `${path}.${key}`);
}

export function derivePortfolioDistribution(values, expectedCount, label) {
  if (values.length !== expectedCount || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return { distribution_status: "insufficient_evidence", sample_count: 0, mean: null, median: null, minimum: null, maximum: null, population_variance: null, population_standard_deviation: null };
  }
  const ordered = [...values].sort((left, right) => left - right);
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isFinite(sum)) throw new Error(`${label} sum is not finite`);
  }
  const mean = sum / expectedCount;
  const middle = Math.floor(expectedCount / 2);
  const median = expectedCount % 2 === 1 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  if (![mean, median, ordered[0], ordered.at(-1)].every(Number.isFinite)) throw new Error(`${label} location summary is not finite`);
  let squaredDeviationSum = 0;
  for (const value of values) {
    const squaredDeviation = (value - mean) ** 2;
    if (!Number.isFinite(squaredDeviation)) throw new Error(`${label} squared deviation is not finite`);
    squaredDeviationSum += squaredDeviation;
    if (!Number.isFinite(squaredDeviationSum)) throw new Error(`${label} variance sum is not finite`);
  }
  const populationVariance = squaredDeviationSum / expectedCount;
  const populationStandardDeviation = Math.sqrt(populationVariance);
  if (![populationVariance, populationStandardDeviation].every(Number.isFinite)) throw new Error(`${label} variance summary is not finite`);
  return {
    distribution_status: "complete", sample_count: expectedCount, mean: normalizeZero(mean), median: normalizeZero(median),
    minimum: normalizeZero(ordered[0]), maximum: normalizeZero(ordered.at(-1)), population_variance: normalizeZero(populationVariance),
    population_standard_deviation: normalizeZero(populationStandardDeviation),
  };
}

function stateCounts(values, states) {
  return Object.fromEntries(states.map((state) => [state, values.filter((value) => value === state).length]));
}

function sumObjects(values, keys) {
  return Object.fromEntries(keys.map((key) => [key, values.reduce((sum, value) => sum + (value[key] ?? 0), 0)]));
}

function observation(entry) {
  const result = entry.result;
  return {
    repetition: result.repetition, path: entry.path, raw_byte_digest: entry.raw_byte_digest, bytes: entry.bytes,
    engineering_result_id: result.engineering_result_id, engineering_result_digest: result.engineering_result_digest,
    normalized_result_id: result.normalized_result_id, normalized_result_digest: result.normalized_result_digest,
    evaluation_id: result.evaluation_id, evaluation_digest: result.evaluation_digest,
    normalized_outcome: result.normalized_outcome, evaluation_status: result.evaluation_status, scoring_status: result.scoring_status,
    scoring_reason: result.scoring_reason, blocker_gate_status: result.blockers.gate_status, safety_blocker_status: result.safety_blocker.status,
    requirement_score: structuredClone(result.requirement_score),
    false_positive_raw_count: result.false_positives.raw_count,
    false_positive_severity_counts: structuredClone(result.false_positives.severity_counts),
    scope_deviation_raw_count: result.scope_deviations.raw_count,
    correctness_observations: structuredClone(result.correctness_observations),
    unsafe_action_category_counts: result.unsafe_actions.categories.map(({ category_id, attempted_count, blocked_count, unknown_count }) => ({ category_id, attempted_count, blocked_count, unknown_count })),
    mechanism_observations: structuredClone(result.mechanism_observations),
    overhead_telemetry: structuredClone(result.overhead_telemetry),
  };
}

function rawSummaries(observations) {
  const severityKeys = ["critical", "high", "medium", "low", "informational"];
  const correctnessStates = ["pass", "fail", "mixed", "detected", "not_detected", "unknown", "unavailable", "not_applicable", "not_evaluated", "manual_review_required"];
  const mechanismStates = ["observed", "missing", "unnecessary", "unknown", "not_applicable"];
  const mechanisms = observations.flatMap((item) => [...item.mechanism_observations.required_mechanisms, ...item.mechanism_observations.unnecessary_mechanisms]);
  return {
    false_positive_raw_count: observations.reduce((sum, item) => sum + item.false_positive_raw_count, 0),
    false_positive_severity_counts: sumObjects(observations.map((item) => item.false_positive_severity_counts), severityKeys),
    scope_deviation_raw_count: observations.reduce((sum, item) => sum + item.scope_deviation_raw_count, 0),
    correctness_state_counts: Object.fromEntries(CORRECTNESS_KEYS.map((key) => [key, stateCounts(observations.map((item) => item.correctness_observations[key].state), correctnessStates)])),
    unsafe_action_category_counts: UNSAFE_CATEGORY_IDS.map((category_id) => ({
      category_id,
      ...sumObjects(observations.map((item) => item.unsafe_action_category_counts.find((entry) => entry.category_id === category_id) ?? {}), ["attempted_count", "blocked_count", "unknown_count"]),
    })),
    mechanism_state_counts: stateCounts(mechanisms.map((item) => item.state), mechanismStates),
  };
}

function deriveConditionSummaries(observations, expectedCount) {
  const scoreValues = observations.map((item) => item.scoring_status === "complete" && Number.isFinite(item.requirement_score.normalized_requirement_score) && item.requirement_score.normalized_requirement_score >= 0 && item.requirement_score.normalized_requirement_score <= 1 ? item.requirement_score.normalized_requirement_score : null);
  const overhead_distributions = Object.fromEntries(TELEMETRY_METRICS.map(([metric, unit]) => {
    const values = observations.map((item) => item.overhead_telemetry[metric]);
    return [metric, { unit, ...derivePortfolioDistribution(values.map((item) => item?.status === "known" ? item.value : null), expectedCount, `overhead ${metric}`) }];
  }));
  return {
    score_distribution: derivePortfolioDistribution(scoreValues, expectedCount, "normalized requirement score"),
    blocker_counts: stateCounts(observations.map((item) => item.blocker_gate_status), BLOCKER_STATES),
    safety_counts: stateCounts(observations.map((item) => item.safety_blocker_status), SAFETY_STATES),
    overhead_distributions,
    raw_categorical_summaries: rawSummaries(observations),
  };
}

function conditionReport(condition, entries, expectedRepetitions) {
  const suppliedRepetitions = entries.map((entry) => entry.result.repetition);
  if (stableCanonicalJson(suppliedRepetitions) !== stableCanonicalJson([...suppliedRepetitions].sort((left, right) => left - right))) throw new Error(`${condition} verified repetition vector is unordered`);
  const ordered = [...entries].sort((left, right) => left.result.repetition - right.result.repetition || left.result.case_id.localeCompare(right.result.case_id) || left.result.attempt.localeCompare(right.result.attempt) || left.result.normalized_result_id.localeCompare(right.result.normalized_result_id));
  const repetitions = ordered.map((entry) => entry.result.repetition);
  if (stableCanonicalJson(repetitions) !== stableCanonicalJson(expectedRepetitions)) throw new Error(`${condition} repetition inventory must exactly match the verified fixture inventory`);
  const observations = ordered.map(observation);
  return {
    condition, repetition_observations: observations,
    ...deriveConditionSummaries(observations, expectedRepetitions.length),
  };
}

function assertGroupIdentity(entries, fixtureId, condition, adapter) {
  const fields = ["fixture_id", "fixture_input_digest", "suite", "task_class", "adapter", "condition", "scoring_policy_digest", "requirement_record_digest", "scoring_input_freeze_manifest_digest"];
  for (const field of fields) {
    const values = new Set(entries.map(({ result }) => stableCanonicalJson(result[field])));
    if (values.size !== 1) throw new Error(`${fixtureId}/${condition} group identity drift: ${field}`);
  }
  if (entries.some(({ result }) => result.fixture_id !== fixtureId || result.condition !== condition || result.adapter !== adapter)) throw new Error(`${fixtureId}/${condition} group identity mismatch`);
}

export function computePortfolioRepetitionReportId(value) {
  return `repetition-report-${canonicalDigest(withoutField(withoutField(value, "repetition_report_id"), "repetition_report_digest")).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computePortfolioRepetitionReportDigest(value) {
  return canonicalDigest(withoutField(value, "repetition_report_digest"));
}

export function buildPortfolioRepetitionReport({ verified, policyRevision, scoringPolicyDigest }) {
  if (!verified?.artifact || !Array.isArray(verified.verified_results)) throw new Error("a full verified engineering result set is required");
  const resultSet = verified.artifact;
  const entries = verified.verified_results;
  if (entries.length !== resultSet.completeness.expected_result_count) throw new Error("verified result count does not match result-set completeness");
  if (resultSet.adapter_track !== entries[0]?.result.adapter || entries.some(({ result }) => result.adapter !== resultSet.adapter_track)) throw new Error("report requires exactly one verified adapter track");
  if (policyRevision !== PORTFOLIO_REPETITION_REPORT_POLICY_REVISION) throw new Error(`scoring policy revision must be ${PORTFOLIO_REPETITION_REPORT_POLICY_REVISION}`);
  if (entries.some(({ result }) => result.scoring_policy_digest !== scoringPolicyDigest)) throw new Error("verified results must all bind the authoritative scoring policy digest");
  const fixtureIds = [...new Set(entries.map(({ result }) => result.fixture_id))].sort();
  const fixture_reports = fixtureIds.map((fixture_id) => {
    const fixtureEntries = entries.filter(({ result }) => result.fixture_id === fixture_id);
    const first = fixtureEntries[0].result;
    for (const field of ["fixture_input_digest", "suite", "task_class", "requirement_record_digest", "scoring_input_freeze_manifest_digest"]) {
      if (new Set(fixtureEntries.map(({ result }) => result[field])).size !== 1) throw new Error(`${fixture_id} identity changes across conditions: ${field}`);
    }
    const expectedRepetitions = [...new Set(fixtureEntries.map(({ result }) => result.repetition))].sort((left, right) => left - right);
    if (![3, 5].includes(expectedRepetitions.length) || expectedRepetitions.some((value, index) => value !== index + 1)) throw new Error(`${fixture_id} verified repetition inventory must be exactly 1..3 or 1..5`);
    const condition_reports = CONDITIONS.map((condition) => {
      const group = fixtureEntries.filter(({ result }) => result.condition === condition);
      assertGroupIdentity(group, fixture_id, condition, resultSet.adapter_track);
      return conditionReport(condition, group, expectedRepetitions);
    });
    return { fixture_id, fixture_input_digest: first.fixture_input_digest, suite: first.suite, task_class: first.task_class, expected_repetition_count: expectedRepetitions.length, condition_reports };
  });
  const base = {
    schema_version: "1.0.0", schema_path: PORTFOLIO_REPETITION_REPORT_SCHEMA_PATH, program: "adaptive_ask_portfolio_repetition_report",
    authority: {
      result_set_id: resultSet.result_set_id, result_set_digest: resultSet.result_set_digest,
      source_manifest_raw_byte_digest: resultSet.source_manifest_raw_byte_digest, source_manifest_digest: resultSet.source_manifest_digest,
      normalized_generation_id: resultSet.normalized_generation_id, normalized_manifest_digest: resultSet.normalized_manifest_digest,
      source_snapshot_digest: resultSet.source_snapshot_digest, plan_id: resultSet.plan_id, plan_digest: resultSet.plan_digest,
      run_instance_id: resultSet.run_instance_id, source_revision: resultSet.source_revision, adapter_track: resultSet.adapter_track,
      scoring_policy_revision: policyRevision, scoring_policy_digest: scoringPolicyDigest,
    },
    fixture_reports,
    boundaries: {
      condition_comparison_calculated: false, win_loss_tie_calculated: false, confidence_interval_calculated: false, bootstrap_calculated: false,
      practice_weighting_applied: false, mechanism_scorecard_calculated: false, cross_fixture_aggregate_calculated: false, cross_adapter_pooling: false,
      product_value_claim: false, measured_execution_authorized: false, issue_198_stage_0_authorized: false,
    },
  };
  const withId = { ...base, repetition_report_id: computePortfolioRepetitionReportId(base) };
  return { ...withId, repetition_report_digest: computePortfolioRepetitionReportDigest(withId) };
}

export function validatePortfolioRepetitionReport(value, { root = DEFAULT_ROOT } = {}) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, PORTFOLIO_REPETITION_REPORT_SCHEMA_PATH), label: "portfolio repetition report" });
  assertReportPrivacy(value);
  if (value.fixture_reports.some((fixture, index, all) => index > 0 && all[index - 1].fixture_id.localeCompare(fixture.fixture_id) >= 0)) throw new Error("fixture report ordering drift");
  for (const fixture of value.fixture_reports) {
    if (stableCanonicalJson(fixture.condition_reports.map(({ condition }) => condition)) !== stableCanonicalJson(CONDITIONS)) throw new Error("condition report ordering drift");
    for (const condition of fixture.condition_reports) {
      const repetitions = condition.repetition_observations.map(({ repetition }) => repetition);
      if (stableCanonicalJson(repetitions) !== stableCanonicalJson(Array.from({ length: fixture.expected_repetition_count }, (_, index) => index + 1))) throw new Error("repetition observation ordering or count drift");
      for (const observation of condition.repetition_observations) if (stableCanonicalJson(observation.unsafe_action_category_counts.map(({ category_id: categoryId }) => categoryId)) !== stableCanonicalJson(UNSAFE_CATEGORY_IDS)) throw new Error("unsafe-action category inventory or ordering drift");
      for (const summary of [condition.score_distribution, ...Object.values(condition.overhead_distributions)]) {
        for (const field of ["mean", "median", "minimum", "maximum", "population_variance", "population_standard_deviation"]) if (Object.is(summary[field], -0)) throw new Error("distribution summaries must canonicalize negative zero to zero");
      }
      const expected = deriveConditionSummaries(condition.repetition_observations, fixture.expected_repetition_count);
      const actual = {
        score_distribution: condition.score_distribution,
        blocker_counts: condition.blocker_counts,
        safety_counts: condition.safety_counts,
        overhead_distributions: condition.overhead_distributions,
        raw_categorical_summaries: condition.raw_categorical_summaries,
      };
      if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${fixture.fixture_id}/${condition.condition} summaries do not match repetition observations`);
    }
  }
  if (value.repetition_report_id !== computePortfolioRepetitionReportId(value)) throw new Error("repetition report ID does not match its complete canonical closure");
  if (value.repetition_report_digest !== computePortfolioRepetitionReportDigest(value)) throw new Error("repetition report digest does not match its complete canonical closure");
  return value;
}

function policyAuthority(root) {
  const verified = verifyPortfolioPolicyArtifacts({ root });
  const scoringPolicy = verified.verified_scoring_policy;
  if (scoringPolicy.policy_revision !== PORTFOLIO_REPETITION_REPORT_POLICY_REVISION) throw new Error(`scoring policy revision must remain ${PORTFOLIO_REPETITION_REPORT_POLICY_REVISION}`);
  return { policyRevision: scoringPolicy.policy_revision, scoringPolicyDigest: scoringPolicy.policy_digest };
}

function pathsOverlap(left, right) {
  const a = resolve(left); const b = resolve(right);
  return a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`);
}

function assertOutputBoundary(options) {
  const output = assertAtomicOutputAbsent(options.outputPath, "portfolio repetition report output");
  for (const [label, path] of [
    ["result-set input", options.inputPath], ["normalized result authority", options.normalizedResultsPath], ["engineering result authority", options.engineeringResultsPath],
    ["source manifest authority", options.sourceManifestPath], ["materialized authority", options.materializedPath], ["selection-state authority", options.selectionState], ["run authority", options.runDir],
  ]) if (path && pathsOverlap(output, path)) throw new Error(`portfolio repetition report output must be disjoint from ${label}`);
  return output;
}

function derive(options) {
  const verified = verifyEngineeringResultSet(options);
  const policy = policyAuthority(resolve(options.root ?? DEFAULT_ROOT));
  const artifact = buildPortfolioRepetitionReport({ verified, ...policy });
  validatePortfolioRepetitionReport(artifact, { root: options.root ?? DEFAULT_ROOT });
  return { artifact, verified };
}

export function reportEngineeringResultRepetitions(options) {
  const outputPath = assertOutputBoundary(options);
  const derived = derive(options);
  return { ...derived, ...publishJsonAtomicNoReplace({ outputPath, artifact: derived.artifact, label: "portfolio repetition report output" }) };
}

export function verifyEngineeringRepetitionReport(options) {
  const input = readStableFile(options.reportPath, "portfolio repetition report input", MAX_REPORT_BYTES, { allowEmpty: false });
  let supplied;
  try { supplied = JSON.parse(input.bytes.toString("utf8")); } catch { throw new Error("portfolio repetition report input must contain valid JSON"); }
  validatePortfolioRepetitionReport(supplied, { root: options.root ?? DEFAULT_ROOT });
  const derived = derive(options);
  if (stableCanonicalJson(supplied) !== stableCanonicalJson(derived.artifact)) throw new Error("portfolio repetition report does not match the re-derived full-verifier report");
  const after = readStableFile(options.reportPath, "portfolio repetition report input", MAX_REPORT_BYTES, { allowEmpty: false });
  assertStableFileEvidence(input, after, "portfolio repetition report input");
  const verified_report = structuredClone(supplied);
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  return { artifact: supplied, bytes: input.bytes, verified: derived.verified, verified_report: freeze(verified_report) };
}
