import { resolve } from "node:path";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson, stableCanonicalJson } from "./content-addressed-store.mjs";
import { portfolioAggregateEvolutionContext } from "./ask-benchmark-portfolio-aggregate-result-v2.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";

const ROOT = resolve(import.meta.dirname, "..");
export const PORTFOLIO_CONSUMER_REPORT_SCHEMA = "benchmarks/schemas/portfolio-consumer-report.schema.json";
const COMPONENTS = Object.freeze(["token_count_delta", "latency_delta", "human_effort_delta", "false_positive_raw_count_delta", "false_positive_unit_delta"]);
const CLOSED = new Set(["known", "not_applicable"]);
const CATEGORIES = Object.freeze(["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"]);
const IDENTITY_FIELDS = Object.freeze(["path", "raw_byte_digest", "bytes", "engineering_result_id", "engineering_result_digest", "normalized_result_id", "normalized_result_digest", "evaluation_id", "evaluation_digest"]);
const clone = (value) => structuredClone(value);
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function selectedFixtures(context) {
  return context.comparison.fixture_comparisons.filter(({ suite, task_class }) => suite === context.aggregate.suite && task_class === context.aggregate.task_class)
    .sort((a, b) => a.fixture_id.localeCompare(b.fixture_id));
}
function selectedView(fixture, view) { return fixture.comparison_views.find(({ view_id }) => view_id === view); }
function safeAdd(left, right) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("consumer report count exceeds the safe integer range");
  return value;
}
function safetySurface(fixtures, comparisonView, role) {
  const counts = Object.fromEntries(CATEGORIES.map((name) => [name, 0]));
  const unknown = Object.fromEntries(CATEGORIES.map((name) => [name, 0]));
  const witnesses = [];
  let safetyUnknown = 0;
  let blockerUnknown = 0;
  let observations = 0;
  for (const fixture of fixtures) for (const pair of selectedView(fixture, comparisonView).pairs) {
    const source = pair[role];
    observations = safeAdd(observations, 1);
    if (["unknown", "not_scoring_ready"].includes(source.safety_blocker_status)) safetyUnknown = safeAdd(safetyUnknown, 1);
    if (source.blocker_gate_status === "not_scoring_ready") blockerUnknown = safeAdd(blockerUnknown, 1);
    for (const category of source.unsafe_action_category_counts) {
      counts[category.category_id] = safeAdd(counts[category.category_id], safeAdd(category.attempted_count, category.blocked_count));
      unknown[category.category_id] = safeAdd(unknown[category.category_id], category.unknown_count);
    }
    const unsafe = source.unsafe_action_category_counts.filter((category) => ["unauthorized_attempt", "external_action_executed"].includes(category.category_id)
      && category.attempted_count + category.blocked_count > 0).map(({ category_id }) => category_id);
    if (unsafe.length || source.safety_blocker_status === "fail" || source.blocker_gate_status === "fail") witnesses.push({
      fixture_id: fixture.fixture_id, repetition: pair.repetition,
      engineering_result_id: source.engineering_result_id, engineering_result_digest: source.engineering_result_digest,
      unsafe_categories: unsafe, safety_gate_failed: source.safety_blocker_status === "fail", requirement_gate_failed: source.blocker_gate_status === "fail",
    });
  }
  return {
    population_fixture_ids: fixtures.map(({ fixture_id }) => fixture_id), observation_count: observations,
    unsafe_action_category_counts: counts, unsafe_action_unknown_counts: unknown,
    safety_unknown_observation_count: safetyUnknown, requirement_unknown_observation_count: blockerUnknown,
    safety_blocker_observed: witnesses.some((entry) => entry.unsafe_categories.length > 0 || entry.safety_gate_failed),
    requirement_blocker_observed: witnesses.some((entry) => entry.requirement_gate_failed),
    evidence_status: observations > 0 && safetyUnknown === 0 && Object.values(unknown).every((n) => n === 0) ? "complete" : "insufficient_evidence",
    witnesses,
  };
}
function sourceInventory(context, fixtures) {
  const classifications = new Map(context.aggregate.classification_records.map((entry) => [entry.fixture_id, entry]));
  const source = (entry) => Object.fromEntries(IDENTITY_FIELDS.map((key) => [key, entry[key]]));
  return fixtures.map((fixture) => ({
    fixture_id: fixture.fixture_id, fixture_input_digest: fixture.fixture_input_digest,
    expected_repetition_count: fixture.expected_repetition_count,
    classification_state: classifications.get(fixture.fixture_id).classification_state,
    pairs: selectedView(fixture, context.aggregate.comparison_view).pairs.map((pair) => ({
      repetition: pair.repetition, baseline: source(pair.baseline), comparison: source(pair.comparison),
      human_effort: clone(pair.overhead_deltas.human_effort),
    })),
  }));
}
function viewDetails(context, fixtures, dimension, viewName) {
  const aggregate = context.aggregate;
  const snapshot = clone(dimension[viewName]);
  const population = new Set(snapshot.population_fixture_ids);
  const componentObservations = Object.fromEntries(COMPONENTS.map((name) => [name,
    clone(aggregate.overhead_component_vector[name].fixture_values.filter(({ fixture_id }) => population.has(fixture_id))),
  ]));
  const omitted = [];
  if (dimension.dimension_id === "human_effort_sample" && viewName === "excluded") {
    for (const fixture of componentObservations.human_effort_delta) {
      for (const observation of fixture.observations) {
        // Preserve the input state and value in this inventory before masking.
        // Omitting an unknown sample is not observing it as zero.
        omitted.push({ fixture_id: fixture.fixture_id, ...clone(observation), reason: "human_effort_component_omitted" });
        observation.state = "not_applicable";
        observation.value = null;
      }
      fixture.state = "not_applicable";
      fixture.value = null;
    }
  }
  const reasons = [];
  if (population.size === 0) reasons.push("empty_eligible_population");
  for (const name of COMPONENTS) if (!CLOSED.has(snapshot.components[name].state)) reasons.push(`${name}_${snapshot.components[name].state}`);
  const retained = fixtures.filter(({ fixture_id }) => population.has(fixture_id));
  const safety = safetySurface(retained, aggregate.comparison_view, "comparison");
  if (safety.evidence_status !== "complete") reasons.push("safety_observation_coverage_incomplete");
  const weighted = context.scoringPolicy.aggregation_policy.weighted_reduction.applicable_suites.includes(aggregate.suite);
  // B1 high-impact exclusion removes all or none. Do not introduce a new subset
  // or recalculate lineage bands to manufacture a weighted contrast.
  const useWeights = population.size > 0 && weighted;
  if (useWeights && aggregate.weighted_quality_delta === null) reasons.push("reviewed_lineage_incomplete");
  const samePopulation = stableCanonicalJson(snapshot.population_fixture_ids) === stableCanonicalJson(aggregate.included_fixture_ids);
  if (population.size > 0 && !samePopulation) throw new Error("consumer report requires a new policy before a partial high-impact population is defined");
  // Unlike the historical v2 summary, excluded-view coverage is independently
  // computed. Missing effort can leave included insufficient and excluded closed.
  snapshot.evidence_status = reasons.length === 0 ? "complete" : "insufficient_evidence";
  return {
    snapshot, component_observations: componentObservations, omitted_observations: omitted,
    quality_denominators: {
      expected_fixture_count: aggregate.expected_fixture_ids.length,
      observed_fixture_count: snapshot.population_fixture_ids.length,
      observed_pair_count: snapshot.population_pair_count,
      weighted_numerator: useWeights ? aggregate.numerator : null,
      weighted_denominator: useWeights ? aggregate.denominator : null,
      weighted_quality_delta: useWeights ? aggregate.weighted_quality_delta : null,
    },
    insufficient_evidence_reasons: reasons,
  };
}
export function computePortfolioConsumerReportDigest(value) {
  const base = clone(value); delete base.consumer_report_digest;
  return canonicalDigest(base);
}
export function validatePortfolioConsumerReport(report, { root = ROOT } = {}) {
  assertBenchmarkSchemaInstance(report, { schemaPath: resolve(root, PORTFOLIO_CONSUMER_REPORT_SCHEMA), label: "portfolio consumer report" });
  if (report.consumer_report_digest !== computePortfolioConsumerReportDigest(report)) throw new Error("portfolio consumer report digest mismatch");
  return report;
}
export function buildPortfolioConsumerReport({ verifiedAggregate, root = ROOT }) {
  const context = portfolioAggregateEvolutionContext(verifiedAggregate, { root });
  const aggregate = context.aggregate;
  const fixtures = selectedFixtures(context);
  const views = aggregate.sensitivity_views.map((dimension) => {
    const included = viewDetails(context, fixtures, dimension, "included");
    const excluded = viewDetails(context, fixtures, dimension, "excluded");
    // Stable/changed is only exact representation sensitivity, never significance.
    // Retain the B1 high-impact insufficiency rather than treating an empty view as
    // a neutral result. Legacy labels are not upgraded from additional metadata.
    const insufficient = included.snapshot.evidence_status !== "complete" || excluded.snapshot.evidence_status !== "complete";
    return {
      dimension_id: dimension.dimension_id, applies_to: dimension.applies_to,
      included, excluded, conclusion: insufficient ? "insufficient_evidence" : dimension.conclusion,
      reason: insufficient && dimension.dimension_id === "human_effort_sample" ? "included_or_excluded_evidence_incomplete" : dimension.reason,
    };
  });
  const base = {
    schema_version: "1.0.0", object_kind: "portfolio_aggregate_consumer_report",
    aggregate_identity: clone(context.identity),
    group: Object.fromEntries(["adapter_track", "comparison_view", "suite", "task_class"].map((key) => [key, aggregate[key]])),
    paired_report: { artifact_id: context.comparison.paired_comparison_report_id, artifact_digest: context.comparison.paired_comparison_report_digest, authority: clone(context.comparison.authority) },
    classification_records: clone(aggregate.classification_records), lineage_records: clone(aggregate.lineage_records),
    classification_exclusions: clone(aggregate.excluded_fixtures), source_inventory: sourceInventory(context, fixtures),
    sensitivity_views: views,
    safety_inventory: { baseline: safetySurface(fixtures, aggregate.comparison_view, "baseline"), comparison: safetySurface(fixtures, aggregate.comparison_view, "comparison") },
    boundaries: {
      native_units_preserved: true, safety_includes_classification_exclusions: true,
      conclusions_are_descriptive: true, cross_unit_scalar_calculated: false, cross_group_pooling: false,
      historical_artifact_reinterpreted: false, statistical_confidence_claim: false, product_value_claim: false, lifecycle_authority_implied: false,
    },
  };
  const report = { ...base, consumer_report_digest: computePortfolioConsumerReportDigest(base) };
  validatePortfolioConsumerReport(report, { root });
  return freeze(report);
}
export function publishPortfolioConsumerReport({ storeRoot, verifiedAggregate, root = ROOT }) {
  const report = buildPortfolioConsumerReport({ verifiedAggregate, root });
  const stored = putContentAddressedJson({ storeRoot, artifact: report });
  return freeze({ report, object_digest: stored.digest });
}
export function verifyPortfolioConsumerReport({ storeRoot, objectDigest, verifiedAggregate, root = ROOT }) {
  const stored = readContentAddressedJson({ storeRoot, digest: objectDigest }).value;
  validatePortfolioConsumerReport(stored, { root });
  const derived = buildPortfolioConsumerReport({ verifiedAggregate, root });
  if (stableCanonicalJson(stored) !== stableCanonicalJson(derived)) throw new Error("portfolio consumer report does not match full-verifier reconstruction");
  return freeze({ report: derived, object_digest: objectDigest });
}
