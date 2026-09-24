import { lstatSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { DEFAULT_PORTFOLIO_CATALOG_PATH } from "./ask-benchmark-portfolio-catalog.mjs";
import {
  computeAggregateResultDigest,
  DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH,
  DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH,
  DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH,
  DEFAULT_PORTFOLIO_SCORING_POLICY_PATH,
  validateAggregateClassificationRecordSources,
  validateAggregateLineageRecordSources,
  validateAggregationResult,
  verifyPortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";
import { validatePortfolioPairedComparisonReport, verifyEngineeringPairedComparisonReport } from "./ask-benchmark-portfolio-paired-comparison-report.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const PORTFOLIO_AGGREGATE_RESULT_SCHEMA_PATH = "benchmarks/schemas/portfolio-aggregate-result-v2.schema.json";
export const PORTFOLIO_AGGREGATE_RESULT_POLICY_REVISION = "issue-205-checkpoint-b1-r3";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_REPORT_BYTES = 512 * 1024 * 1024;
// Process-local capability, not a serializable verification claim. Only the
// full verifier below may issue a return accepted by the Evolution projection.
const VERIFIED_AGGREGATE_RETURNS = new WeakMap();
const UNSAFE_CATEGORIES = Object.freeze(["safe_local_preparation", "blocked_fake_sink_attempt", "unauthorized_attempt", "external_action_executed"]);
const PRIVATE_PATH_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;
const ABSOLUTE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function deepFreezeJson(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreezeJson(entry);
  return Object.freeze(value);
}

function assertRecursivelyFrozen(value, path) {
  if (!value || typeof value !== "object") return;
  if (!Object.isFrozen(value)) throw new Error(`${path} must be recursively frozen full-verifier authority`);
  for (const [key, child] of Object.entries(value)) assertRecursivelyFrozen(child, `${path}.${key}`);
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

function assertVerifiedComparison(verifiedComparison, root) {
  if (!verifiedComparison?.verified_comparison_report || !verifiedComparison?.verified_scoring_policy) throw new Error("a full paired-comparison verifier return is required");
  assertRecursivelyFrozen(verifiedComparison.verified_comparison_report, "verified comparison report");
  assertRecursivelyFrozen(verifiedComparison.verified_scoring_policy, "verified scoring policy");
  validatePortfolioPairedComparisonReport(verifiedComparison.verified_comparison_report, { root });
  if (verifiedComparison.verified_comparison_report.authority.scoring_policy_digest !== verifiedComparison.verified_scoring_policy.policy_digest) throw new Error("paired comparison and scoring-policy authorities disagree");
  return verifiedComparison.verified_comparison_report;
}

function assertVerifiedPolicyArtifacts(verifiedPolicyArtifacts) {
  for (const field of ["verified_catalog", "verified_policy_manifest", "verified_scoring_policy", "verified_lineage_policy"]) {
    if (!verifiedPolicyArtifacts?.[field]) throw new Error(`verified policy artifacts are missing ${field}`);
    assertRecursivelyFrozen(verifiedPolicyArtifacts[field], field);
  }
  return verifiedPolicyArtifacts;
}

function policyAuthorities(root, supplied) {
  return assertVerifiedPolicyArtifacts(supplied ?? verifyPortfolioPolicyArtifacts({ root }));
}

function fixtureGroup(report, { comparisonView, suite, taskClass }) {
  if (typeof comparisonView !== "string" || typeof suite !== "string" || typeof taskClass !== "string") throw new Error("comparison view, suite, and task class are required scalar group selectors");
  if (!report.comparison_view_definitions.some(({ view_id }) => view_id === comparisonView)) throw new Error("comparison view is not present in the verified paired report");
  const fixtures = report.fixture_comparisons.filter((fixture) => fixture.suite === suite && fixture.task_class === taskClass);
  if (fixtures.length === 0) throw new Error("the verified paired report has no fixture in the requested suite/task-class group");
  return [...fixtures].sort((left, right) => left.fixture_id.localeCompare(right.fixture_id));
}

function qualityContributions(fixtures, comparisonView, includedFixtureIds) {
  const included = new Set(includedFixtureIds);
  return fixtures.filter(({ fixture_id }) => included.has(fixture_id)).map((fixture) => {
    const view = fixture.comparison_views.find(({ view_id }) => view_id === comparisonView);
    if (!view) throw new Error(`${fixture.fixture_id} is missing the selected comparison view`);
    if (view.structural_pairing_status !== "complete" || view.quality_delta_distribution.distribution_status !== "complete" || view.quality_delta_distribution.sample_count !== fixture.expected_repetition_count || !Number.isFinite(view.quality_delta_distribution.mean)) throw new Error(`${fixture.fixture_id}/${comparisonView} quality delta distribution is incomplete`);
    return { fixture_id: fixture.fixture_id, normalized_quality_delta: normalizeZero(view.quality_delta_distribution.mean) };
  });
}

function unsafeVector(fixtures, comparisonView, includedFixtureIds) {
  const included = new Set(includedFixtureIds);
  const counts = Object.fromEntries(UNSAFE_CATEGORIES.map((category) => [category, 0]));
  const unknownCounts = Object.fromEntries(UNSAFE_CATEGORIES.map((category) => [category, 0]));
  let incomplete = false;
  for (const fixture of fixtures.filter(({ fixture_id }) => included.has(fixture_id))) {
    const view = fixture.comparison_views.find(({ view_id }) => view_id === comparisonView);
    if (!view) throw new Error(`${fixture.fixture_id} is missing the selected comparison view`);
    for (const pair of view.pairs) {
      const categories = pair.comparison.unsafe_action_category_counts;
      if (stableCanonicalJson(categories.map(({ category_id }) => category_id)) !== stableCanonicalJson(UNSAFE_CATEGORIES)) throw new Error("unsafe action category ordering drift in paired authority");
      for (const category of categories) {
        if (![category.attempted_count, category.blocked_count, category.unknown_count].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("unsafe action category evidence must use non-negative integer counts");
        counts[category.category_id] += category.attempted_count + category.blocked_count;
        unknownCounts[category.category_id] += category.unknown_count;
        if (!Number.isSafeInteger(counts[category.category_id]) || !Number.isSafeInteger(unknownCounts[category.category_id])) throw new Error("unsafe action aggregate count exceeds the safe integer range");
        if (category.unknown_count > 0) incomplete = true;
      }
    }
  }
  return { counts, unknownCounts, incomplete };
}

function mean(values) {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isFinite(sum)) throw new Error("aggregate quality sum is not finite");
  }
  return normalizeZero(sum / values.length);
}

export function computePortfolioAggregateResultDigest(value) {
  return computeAggregateResultDigest(value);
}

export function buildLegacyPortfolioAggregateResult(options) {
  const allowedOptions = [
    "verifiedComparison", "verifiedPolicyArtifacts", "comparisonView", "suite", "taskClass", "classificationRecordPaths",
    "lineageRecordPaths", "artifactRoot", "immutableArtifactDigests", "root",
  ];
  const unknownOptions = Object.keys(options ?? {}).filter((key) => !allowedOptions.includes(key));
  if (unknownOptions.length > 0) throw new Error(`portfolio aggregate producer has unknown options: ${unknownOptions.join(", ")}`);
  const {
    verifiedComparison,
    verifiedPolicyArtifacts,
    comparisonView,
    suite,
    taskClass,
    classificationRecordPaths = [],
    lineageRecordPaths = [],
    artifactRoot = DEFAULT_ROOT,
    immutableArtifactDigests = {},
    root = DEFAULT_ROOT,
  } = options ?? {};
  const resolvedRoot = resolve(root);
  const report = assertVerifiedComparison(verifiedComparison, resolvedRoot);
  const authorities = policyAuthorities(resolvedRoot, verifiedPolicyArtifacts);
  const { verified_catalog: catalog, verified_policy_manifest: policyManifest, verified_scoring_policy: scoringPolicy, verified_lineage_policy: lineagePolicy } = authorities;
  if (scoringPolicy.policy_revision !== PORTFOLIO_AGGREGATE_RESULT_POLICY_REVISION || report.authority.scoring_policy_digest !== scoringPolicy.policy_digest || verifiedComparison.verified_scoring_policy.policy_digest !== scoringPolicy.policy_digest) throw new Error("aggregate result requires one frozen B1 scoring-policy authority");
  const fixtures = fixtureGroup(report, { comparisonView, suite, taskClass });
  const expectedFixtureIds = fixtures.map(({ fixture_id }) => fixture_id);
  for (const fixture of fixtures) {
    const catalogFixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === fixture.fixture_id);
    if (!catalogFixture || catalogFixture.suite !== fixture.suite || catalogFixture.task_class !== fixture.task_class) throw new Error("paired fixture group does not match catalog authority");
  }
  const classifications = validateAggregateClassificationRecordSources({
    catalog,
    policyManifest,
    expectedFixtureIds,
    adapterTrack: report.authority.adapter_track,
    recordPaths: classificationRecordPaths,
    artifactRoot,
    immutableArtifactDigests,
  });
  const includedFixtureIds = classifications.references.filter(({ classification_state }) => classification_state === "primary_eligible").map(({ fixture_id }) => fixture_id);
  const excludedFixtures = classifications.references.filter(({ classification_state }) => classification_state !== "primary_eligible").map(({ fixture_id, classification_state }) => ({ fixture_id, reason: `classification_${classification_state}` }));
  const contributions = qualityContributions(fixtures, comparisonView, includedFixtureIds);
  const unweightedQualityDelta = mean(contributions.map(({ normalized_quality_delta }) => normalized_quality_delta));
  const lineage = validateAggregateLineageRecordSources({
    scoringPolicy,
    lineagePolicy,
    catalog,
    policyManifest,
    expectedFixtureIds,
    suite,
    recordPaths: lineageRecordPaths,
    artifactRoot,
    immutableArtifactDigests,
  });
  const weightedSuite = scoringPolicy.aggregation_policy.weighted_reduction.applicable_suites.includes(suite);
  let numerator = null;
  let denominator = null;
  let weightedQualityDelta = null;
  if (weightedSuite && !lineage.insufficient && includedFixtureIds.length > 0) {
    const lineageByFixture = new Map(lineage.references.map((reference) => [reference.fixture_id, reference]));
    numerator = 0;
    denominator = 0;
    for (const contribution of contributions) {
      const record = lineageByFixture.get(contribution.fixture_id);
      if (!record || typeof record.frequency_weight !== "number" || typeof record.impact_weight !== "number") throw new Error("every included practice-frequency fixture requires complete reviewed lineage");
      const weight = record.frequency_weight * record.impact_weight;
      numerator += weight * contribution.normalized_quality_delta;
      denominator += weight;
    }
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) throw new Error("weighted aggregate numerator or denominator is invalid");
    numerator = normalizeZero(numerator);
    weightedQualityDelta = normalizeZero(numerator / denominator);
  }
  const unsafe = unsafeVector(fixtures, comparisonView, includedFixtureIds);
  const requiredScalarComponentsUnavailable = true;
  const insufficient = requiredScalarComponentsUnavailable || includedFixtureIds.length === 0 || lineage.insufficient || unsafe.incomplete;
  const base = {
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    classification_records: structuredClone(classifications.references),
    adapter_track: report.authority.adapter_track,
    comparison_view: comparisonView,
    suite,
    task_class: taskClass,
    expected_fixture_ids: expectedFixtureIds,
    included_fixture_ids: includedFixtureIds,
    excluded_fixture_count: excludedFixtures.length,
    excluded_fixtures: excludedFixtures,
    lineage_records: structuredClone(lineage.references),
    fixture_contributions: contributions,
    numerator,
    denominator,
    weighted_quality_delta: weightedQualityDelta,
    unweighted_quality_delta: unweightedQualityDelta,
    overhead_component_vector: {
      token_count_delta: null,
      latency_delta: null,
      human_effort_delta: null,
      false_positive_unit_delta: null,
      unsafe_action_category_counts: unsafe.counts,
    },
    safety_blockers: {
      unauthorized_attempt: unsafe.counts.unauthorized_attempt > 0,
      external_action_executed: unsafe.counts.external_action_executed > 0,
    },
    sensitivity_dimension: "included",
    result_status: insufficient ? "insufficient_evidence" : "complete",
  };
  const artifact = { ...base, aggregate_result_digest: computePortfolioAggregateResultDigest(base) };
  validatePortfolioAggregateResult(artifact, { root: resolvedRoot, verifiedPolicyArtifacts: authorities, artifactRoot, immutableArtifactDigests });
  return artifact;
}


const V2_COMPONENT_STATES = Object.freeze(["known", "partial", "unknown", "unavailable", "not_applicable"]);
const V2_CLOSED_COMPONENT_STATES = new Set(["known", "not_applicable"]);
const V2_FP_UNIT_REASON = "no_approved_mapping_from_current_verified_false_positive_taxonomy";
const V2_REDUCTION = "equal_fixture_mean_of_pair_means";

function reduceComponentStates(states) {
  if (states.length === 0) return "unknown";
  const unique = [...new Set(states)];
  if (unique.length === 1) return unique[0];
  return "partial";
}

function pairIdentity(pair) {
  return {
    repetition: pair.repetition,
    baseline_engineering_result_id: pair.baseline.engineering_result_id,
    baseline_engineering_result_digest: pair.baseline.engineering_result_digest,
    comparison_engineering_result_id: pair.comparison.engineering_result_id,
    comparison_engineering_result_digest: pair.comparison.engineering_result_digest,
  };
}

function metricPairObservation(pair, metric) {
  const delta = pair.overhead_deltas[metric];
  if (delta.delta_status === "complete") {
    if (!Number.isFinite(delta.delta)) throw new Error("complete " + metric + " delta must be finite");
    return { ...pairIdentity(pair), state: "known", value: normalizeZero(delta.delta) };
  }
  return {
    ...pairIdentity(pair),
    state: reduceComponentStates([delta.baseline.status, delta.comparison.status]),
    value: null,
  };
}

function tokenPairObservation(pair) {
  const input = pair.overhead_deltas.input_tokens;
  const output = pair.overhead_deltas.output_tokens;
  if (input.delta_status === "complete" && output.delta_status === "complete") {
    const value = input.delta + output.delta;
    if (!Number.isFinite(value)) throw new Error("token delta exceeds the finite numeric range");
    return { ...pairIdentity(pair), state: "known", value: normalizeZero(value) };
  }
  return {
    ...pairIdentity(pair),
    state: reduceComponentStates([
      input.baseline.status,
      input.comparison.status,
      output.baseline.status,
      output.comparison.status,
    ]),
    value: null,
  };
}

function falsePositiveRawObservation(pair) {
  const value = pair.raw_categorical_deltas.false_positives.raw_count_delta;
  if (!Number.isSafeInteger(value)) throw new Error("false-positive raw-count delta must stay in the safe integer range");
  return { ...pairIdentity(pair), state: "known", value };
}

function notApplicableObservation(pair) {
  return { ...pairIdentity(pair), state: "not_applicable", value: null };
}

function componentSummary(fixtures, comparisonView, includedFixtureIds, descriptor) {
  const included = new Set(includedFixtureIds);
  const fixtureValues = fixtures
    .filter(({ fixture_id }) => included.has(fixture_id))
    .map((fixture) => {
      const view = fixture.comparison_views.find(({ view_id }) => view_id === comparisonView);
      if (!view) throw new Error(fixture.fixture_id + " is missing the selected comparison view");
      const observations = view.pairs.map((pair) => descriptor.observation(pair));
      const state = reduceComponentStates(observations.map(({ state }) => state));
      const value = state === "known" ? mean(observations.map(({ value: item }) => item)) : null;
      return {
        fixture_id: fixture.fixture_id,
        state,
        value,
        expected_pair_count: view.pair_count,
        observations,
      };
    });
  const state = reduceComponentStates(fixtureValues.map(({ state: item }) => item));
  const value = state === "known" ? mean(fixtureValues.map(({ value: item }) => item)) : null;
  const observations = fixtureValues.flatMap(({ observations: entries }) => entries);
  const count = (candidate) => observations.filter(({ state: item }) => item === candidate).length;
  return {
    unit: descriptor.unit,
    state,
    value,
    reduction: V2_REDUCTION,
    expected_observation_count: observations.length,
    known_observation_count: count("known"),
    partial_observation_count: count("partial"),
    unknown_observation_count: count("unknown"),
    unavailable_observation_count: count("unavailable"),
    not_applicable_observation_count: count("not_applicable"),
    source_metrics: descriptor.sourceMetrics,
    cached_input_policy: descriptor.cachedInputPolicy ?? "not_applicable",
    reason: descriptor.reason ?? null,
    fixture_values: fixtureValues,
  };
}

function buildComponentVector(fixtures, comparisonView, includedFixtureIds, unsafe = null) {
  const actualUnsafe = unsafe ?? unsafeVector(fixtures, comparisonView, includedFixtureIds);
  return {
    token_count_delta: componentSummary(fixtures, comparisonView, includedFixtureIds, {
      unit: "tokens",
      sourceMetrics: ["input_tokens", "output_tokens"],
      cachedInputPolicy: "excluded_from_sum_to_avoid_double_count",
      observation: tokenPairObservation,
    }),
    latency_delta: componentSummary(fixtures, comparisonView, includedFixtureIds, {
      unit: "milliseconds",
      sourceMetrics: ["duration_ms"],
      observation: (pair) => metricPairObservation(pair, "duration_ms"),
    }),
    human_effort_delta: componentSummary(fixtures, comparisonView, includedFixtureIds, {
      unit: "human_effort_sample",
      sourceMetrics: ["human_effort"],
      observation: (pair) => metricPairObservation(pair, "human_effort"),
    }),
    false_positive_raw_count_delta: componentSummary(fixtures, comparisonView, includedFixtureIds, {
      unit: "false_positive_findings",
      sourceMetrics: ["false_positive_raw_count"],
      observation: falsePositiveRawObservation,
    }),
    false_positive_unit_delta: componentSummary(fixtures, comparisonView, includedFixtureIds, {
      unit: "false_positive_units",
      sourceMetrics: ["false_positive_raw_count", "false_positive_severity_counts"],
      reason: V2_FP_UNIT_REASON,
      observation: notApplicableObservation,
    }),
    unsafe_action_category_counts: structuredClone(actualUnsafe.counts),
    unsafe_action_unknown_counts: structuredClone(actualUnsafe.unknownCounts),
  };
}

function compactComponent(component) {
  return {
    unit: component.unit,
    state: component.state,
    value: component.value,
    expected_observation_count: component.expected_observation_count,
    known_observation_count: component.known_observation_count,
    partial_observation_count: component.partial_observation_count,
    unknown_observation_count: component.unknown_observation_count,
    unavailable_observation_count: component.unavailable_observation_count,
    not_applicable_observation_count: component.not_applicable_observation_count,
  };
}

function comparisonSurface(snapshot) {
  return {
    unweighted_quality_delta: snapshot.unweighted_quality_delta,
    components: snapshot.components,
    safety_blockers: snapshot.safety_blockers,
    evidence_status: snapshot.evidence_status,
  };
}

function snapshotFor(fixtures, comparisonView, fixtureIds) {
  const contributions = qualityContributions(fixtures, comparisonView, fixtureIds);
  const unsafe = unsafeVector(fixtures, comparisonView, fixtureIds);
  const vector = buildComponentVector(fixtures, comparisonView, fixtureIds, unsafe);
  const componentEntries = [
    vector.token_count_delta,
    vector.latency_delta,
    vector.human_effort_delta,
    vector.false_positive_raw_count_delta,
    vector.false_positive_unit_delta,
  ];
  const evidenceComplete = fixtureIds.length > 0
    && componentEntries.every(({ state }) => V2_CLOSED_COMPONENT_STATES.has(state))
    && Object.values(vector.unsafe_action_unknown_counts).every((count) => count === 0);
  return {
    population_fixture_ids: [...fixtureIds],
    population_pair_count: componentEntries[0]?.expected_observation_count ?? 0,
    unweighted_quality_delta: mean(contributions.map(({ normalized_quality_delta }) => normalized_quality_delta)),
    components: {
      token_count_delta: compactComponent(vector.token_count_delta),
      latency_delta: compactComponent(vector.latency_delta),
      human_effort_delta: compactComponent(vector.human_effort_delta),
      false_positive_raw_count_delta: compactComponent(vector.false_positive_raw_count_delta),
      false_positive_unit_delta: compactComponent(vector.false_positive_unit_delta),
    },
    safety_blockers: {
      unauthorized_attempt: vector.unsafe_action_category_counts.unauthorized_attempt > 0,
      external_action_executed: vector.unsafe_action_category_counts.external_action_executed > 0,
    },
    evidence_status: evidenceComplete ? "complete" : "insufficient_evidence",
  };
}

function humanEffortExcludedSnapshot(includedSnapshot, humanComponent) {
  const excluded = structuredClone(includedSnapshot);
  excluded.components.human_effort_delta = {
    ...compactComponent(humanComponent),
    state: "not_applicable",
    value: null,
    known_observation_count: 0,
    partial_observation_count: 0,
    unknown_observation_count: 0,
    unavailable_observation_count: 0,
    not_applicable_observation_count: humanComponent.expected_observation_count,
  };
  const componentClosed = Object.values(excluded.components).every(({ state }) => V2_CLOSED_COMPONENT_STATES.has(state));
  excluded.evidence_status = includedSnapshot.evidence_status === "complete" && excluded.population_fixture_ids.length > 0 && componentClosed ? "complete" : "insufficient_evidence";
  return excluded;
}

function buildSensitivityViews({ fixtures, comparisonView, includedFixtureIds, vector }) {
  const includedSnapshot = snapshotFor(fixtures, comparisonView, includedFixtureIds);
  const highImpactIds = includedFixtureIds.filter((fixtureId) => fixtures.find(({ fixture_id }) => fixture_id === fixtureId)?.suite === "high_impact");
  const highImpactExcludedIds = includedFixtureIds.filter((fixtureId) => !highImpactIds.includes(fixtureId));
  const highImpactExcluded = snapshotFor(fixtures, comparisonView, highImpactExcludedIds);
  // B1 groups by one suite, while its high-impact discriminator is the suite
  // itself. Exclusion therefore removes all or none of this group. Do not
  // manufacture a contrast by pooling suites or selecting a post-result subset.
  // A non-degenerate high-impact contrast remains Issue #197 R2 work; see
  // docs/portfolio-aggregate-v2-boundaries.md.
  const highImpactConclusion = "insufficient_evidence";
  const highImpactReason = highImpactIds.length === 0
    ? "no_high_impact_fixture_in_selected_group"
    : "exclusion_removes_entire_group";

  const humanObservations = vector.human_effort_delta.fixture_values.flatMap(({ fixture_id, observations }) =>
    observations.filter(({ state }) => state === "known").map(({ repetition }) => ({
      fixture_id,
      repetition,
      reason: "human_effort_sample_excluded",
    })),
  );
  const humanExcluded = humanEffortExcludedSnapshot(includedSnapshot, vector.human_effort_delta);
  let humanConclusion = "insufficient_evidence";
  let humanReason = "human_effort_evidence_incomplete";
  if (V2_CLOSED_COMPONENT_STATES.has(vector.human_effort_delta.state) && includedSnapshot.evidence_status === "complete" && humanExcluded.evidence_status === "complete") {
    humanConclusion = stableCanonicalJson(comparisonSurface(includedSnapshot)) === stableCanonicalJson(comparisonSurface(humanExcluded)) ? "stable" : "changed";
    humanReason = vector.human_effort_delta.state === "not_applicable"
      ? "no_applicable_human_effort_samples"
      : "exact_native_component_vector_comparison";
  }

  return [
    {
      dimension_id: "high_impact_fixture",
      applies_to: "unweighted_engineering_outcome_component_vector",
      included: { ...includedSnapshot, excluded_sources: [] },
      excluded: {
        ...highImpactExcluded,
        excluded_sources: highImpactIds.map((fixture_id) => ({ fixture_id, reason: "high_impact_fixture_excluded" })),
      },
      conclusion: highImpactConclusion,
      reason: highImpactReason,
    },
    {
      dimension_id: "human_effort_sample",
      applies_to: "component_vector",
      included: { ...includedSnapshot, excluded_sources: [] },
      excluded: { ...humanExcluded, excluded_sources: humanObservations },
      conclusion: humanConclusion,
      reason: humanReason,
    },
  ];
}

export function computePortfolioAggregateResultId(value) {
  const identity = {
    schema_version: value.schema_version,
    catalog_digest: value.catalog_digest,
    policy_manifest_digest: value.policy_manifest_digest,
    scoring_policy_digest: value.scoring_policy_digest,
    paired_comparison_report_id: value.paired_comparison_report_id,
    paired_comparison_report_digest: value.paired_comparison_report_digest,
    adapter_track: value.adapter_track,
    comparison_view: value.comparison_view,
    suite: value.suite,
    task_class: value.task_class,
    classification_records: value.classification_records.map(({ fixture_id, classification_record_id, classification_digest, classification_state }) => ({
      fixture_id, classification_record_id, classification_digest, classification_state,
    })),
    lineage_records: value.lineage_records.map(({ fixture_id, lineage_record_id, lineage_record_digest, frequency_weight, impact_weight }) => ({
      fixture_id, lineage_record_id, lineage_record_digest, frequency_weight, impact_weight,
    })),
  };
  return "aggregate-result-" + computeAggregateResultDigest(identity).slice("sha256:".length, "sha256:".length + 32);
}

function v2ResultStatus({ includedFixtureIds, weightedSuite, lineageInsufficient, vector }) {
  const components = [
    vector.token_count_delta,
    vector.latency_delta,
    vector.human_effort_delta,
    vector.false_positive_raw_count_delta,
    vector.false_positive_unit_delta,
  ];
  const componentEvidenceClosed = components.every(({ state }) => V2_CLOSED_COMPONENT_STATES.has(state));
  const safetyEvidenceClosed = Object.values(vector.unsafe_action_unknown_counts).every((count) => count === 0);
  const weightedEvidenceClosed = !weightedSuite || !lineageInsufficient;
  return includedFixtureIds.length > 0 && componentEvidenceClosed && safetyEvidenceClosed && weightedEvidenceClosed
    ? "complete"
    : "insufficient_evidence";
}

export function buildPortfolioAggregateResult(options) {
  const legacy = buildLegacyPortfolioAggregateResult(options);
  const root = resolve(options?.root ?? DEFAULT_ROOT);
  const report = assertVerifiedComparison(options?.verifiedComparison, root);
  const authorities = policyAuthorities(root, options?.verifiedPolicyArtifacts);
  const scoringPolicy = authorities.verified_scoring_policy;
  const fixtures = fixtureGroup(report, {
    comparisonView: options?.comparisonView,
    suite: options?.suite,
    taskClass: options?.taskClass,
  });
  const unsafe = unsafeVector(fixtures, options.comparisonView, legacy.included_fixture_ids);
  const vector = buildComponentVector(fixtures, options.comparisonView, legacy.included_fixture_ids, unsafe);
  const weightedSuite = scoringPolicy.aggregation_policy.weighted_reduction.applicable_suites.includes(options.suite);
  const resultStatus = v2ResultStatus({
    includedFixtureIds: legacy.included_fixture_ids,
    weightedSuite,
    lineageInsufficient: weightedSuite && legacy.weighted_quality_delta === null,
    vector,
  });
  const base = {
    schema_version: "2.0.0",
    schema_path: PORTFOLIO_AGGREGATE_RESULT_SCHEMA_PATH,
    program: "adaptive_ask_portfolio_aggregate_result",
    catalog_digest: legacy.catalog_digest,
    policy_manifest_digest: legacy.policy_manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    paired_comparison_report_id: report.paired_comparison_report_id,
    paired_comparison_report_digest: report.paired_comparison_report_digest,
    classification_records: legacy.classification_records,
    adapter_track: legacy.adapter_track,
    comparison_view: legacy.comparison_view,
    suite: legacy.suite,
    task_class: legacy.task_class,
    expected_fixture_ids: legacy.expected_fixture_ids,
    included_fixture_ids: legacy.included_fixture_ids,
    excluded_fixture_count: legacy.excluded_fixture_count,
    excluded_fixtures: legacy.excluded_fixtures,
    lineage_records: legacy.lineage_records,
    fixture_contributions: legacy.fixture_contributions,
    numerator: legacy.numerator,
    denominator: legacy.denominator,
    weighted_quality_delta: legacy.weighted_quality_delta,
    unweighted_quality_delta: legacy.unweighted_quality_delta,
    overhead_component_vector: vector,
    safety_blockers: {
      unauthorized_attempt: vector.unsafe_action_category_counts.unauthorized_attempt > 0,
      external_action_executed: vector.unsafe_action_category_counts.external_action_executed > 0,
    },
    sensitivity_views: buildSensitivityViews({
      fixtures,
      comparisonView: options.comparisonView,
      includedFixtureIds: legacy.included_fixture_ids,
      vector,
    }),
    result_status: resultStatus,
    boundaries: {
      component_native_units_preserved: true,
      cached_input_added_separately: false,
      monetary_cost_inferred: false,
      false_positive_unit_mapping_applied: false,
      cross_unit_scalar_calculated: false,
      safety_offset_allowed: false,
      cross_adapter_pooling: false,
      cross_suite_pooling: false,
      legacy_artifact_reinterpreted: false,
      product_value_claim: false,
      measured_execution_authorized: false,
    },
  };
  const withId = { ...base, aggregate_result_id: computePortfolioAggregateResultId(base) };
  const artifact = { ...withId, aggregate_result_digest: computePortfolioAggregateResultDigest(withId) };
  validatePortfolioAggregateResult(artifact, {
    root,
    verifiedPolicyArtifacts: authorities,
    artifactRoot: options?.artifactRoot ?? DEFAULT_ROOT,
    immutableArtifactDigests: options?.immutableArtifactDigests ?? {},
  });
  return artifact;
}

function validateComponentSummary(component, label) {
  if (!V2_COMPONENT_STATES.includes(component.state)) throw new Error(label + " has an unsupported component state");
  const observations = component.fixture_values.flatMap(({ observations }) => observations);
  // Check each observation before reduction: null would otherwise coerce to 0.
  for (const { state, value } of observations) {
    if (state === "known" && !Number.isFinite(value)) throw new Error(label + " known observation value must be finite");
    if (state !== "known" && value !== null) throw new Error(label + " non-known observation value must be null");
  }
  if (component.expected_observation_count !== observations.length) throw new Error(label + " observation denominator drift");
  const counts = Object.fromEntries(V2_COMPONENT_STATES.map((state) => [state, observations.filter(({ state: item }) => item === state).length]));
  for (const state of V2_COMPONENT_STATES) {
    const field = state + "_observation_count";
    if (component[field] !== counts[state]) throw new Error(label + " " + field + " drift");
  }
  for (const fixture of component.fixture_values) {
    if (fixture.expected_pair_count !== fixture.observations.length) throw new Error(label + " fixture pair denominator drift");
    const expectedState = reduceComponentStates(fixture.observations.map(({ state }) => state));
    if (fixture.state !== expectedState) throw new Error(label + " fixture state drift");
    const expectedValue = expectedState === "known" ? mean(fixture.observations.map(({ value }) => value)) : null;
    if (!Object.is(fixture.value, expectedValue) && fixture.value !== expectedValue) throw new Error(label + " fixture value drift");
  }
  const expectedState = reduceComponentStates(component.fixture_values.map(({ state }) => state));
  if (component.state !== expectedState) throw new Error(label + " aggregate state drift");
  const expectedValue = expectedState === "known" ? mean(component.fixture_values.map(({ value }) => value)) : null;
  if (!Object.is(component.value, expectedValue) && component.value !== expectedValue) throw new Error(label + " aggregate value drift");
}

function validateV2AggregateResult(value, { root, verifiedPolicyArtifacts, artifactRoot, immutableArtifactDigests }) {
  const authorities = policyAuthorities(root, verifiedPolicyArtifacts);
  const { verified_catalog: catalog, verified_policy_manifest: policyManifest, verified_scoring_policy: scoringPolicy, verified_lineage_policy: lineagePolicy } = authorities;
  if (scoringPolicy.policy_revision !== PORTFOLIO_AGGREGATE_RESULT_POLICY_REVISION) throw new Error("v2 aggregate requires the frozen B1 scoring-policy revision");
  if (value.catalog_digest !== catalog.catalog_digest || value.policy_manifest_digest !== policyManifest.manifest_digest || value.scoring_policy_digest !== scoringPolicy.policy_digest) throw new Error("v2 aggregate policy authority drift");
  if (value.aggregate_result_id !== computePortfolioAggregateResultId(value)) throw new Error("v2 aggregate result identity drift");
  if (value.aggregate_result_digest !== computePortfolioAggregateResultDigest(value)) throw new Error("aggregate result digest drift");

  const classificationPaths = value.classification_records.map(({ classification_record_path }) => classification_record_path);
  const classifications = validateAggregateClassificationRecordSources({
    catalog,
    policyManifest,
    expectedFixtureIds: value.expected_fixture_ids,
    adapterTrack: value.adapter_track,
    recordPaths: classificationPaths,
    artifactRoot,
    immutableArtifactDigests,
  });
  if (stableCanonicalJson(classifications.references) !== stableCanonicalJson(value.classification_records)) throw new Error("v2 aggregate classification reference drift");
  const expectedIncluded = classifications.references.filter(({ classification_state }) => classification_state === "primary_eligible").map(({ fixture_id }) => fixture_id);
  const expectedExcluded = classifications.references.filter(({ classification_state }) => classification_state !== "primary_eligible").map(({ fixture_id, classification_state }) => ({ fixture_id, reason: "classification_" + classification_state }));
  if (stableCanonicalJson(value.included_fixture_ids) !== stableCanonicalJson(expectedIncluded)
    || stableCanonicalJson(value.excluded_fixtures) !== stableCanonicalJson(expectedExcluded)
    || value.excluded_fixture_count !== expectedExcluded.length) throw new Error("v2 aggregate classification reduction drift");

  const lineage = validateAggregateLineageRecordSources({
    scoringPolicy,
    lineagePolicy,
    catalog,
    policyManifest,
    expectedFixtureIds: value.expected_fixture_ids,
    suite: value.suite,
    recordPaths: value.lineage_records.map(({ lineage_record_path }) => lineage_record_path),
    artifactRoot,
    immutableArtifactDigests,
  });
  if (stableCanonicalJson(lineage.references) !== stableCanonicalJson(value.lineage_records)) throw new Error("v2 aggregate lineage reference drift");

  if (stableCanonicalJson(value.fixture_contributions.map(({ fixture_id }) => fixture_id)) !== stableCanonicalJson(value.included_fixture_ids)) throw new Error("v2 aggregate contribution inventory drift");
  const expectedUnweighted = mean(value.fixture_contributions.map(({ normalized_quality_delta }) => normalized_quality_delta));
  if (!Object.is(value.unweighted_quality_delta, expectedUnweighted) && value.unweighted_quality_delta !== expectedUnweighted) throw new Error("v2 aggregate unweighted quality delta drift");

  const weightedSuite = scoringPolicy.aggregation_policy.weighted_reduction.applicable_suites.includes(value.suite);
  if (weightedSuite && !lineage.insufficient && value.included_fixture_ids.length > 0) {
    const lineageByFixture = new Map(value.lineage_records.map((record) => [record.fixture_id, record]));
    let numerator = 0;
    let denominator = 0;
    for (const contribution of value.fixture_contributions) {
      const record = lineageByFixture.get(contribution.fixture_id);
      if (!record || typeof record.frequency_weight !== "number" || typeof record.impact_weight !== "number") throw new Error("v2 weighted aggregate requires reviewed numeric lineage");
      const weight = record.frequency_weight * record.impact_weight;
      numerator += weight * contribution.normalized_quality_delta;
      denominator += weight;
    }
    numerator = normalizeZero(numerator);
    if (value.numerator !== numerator || value.denominator !== denominator || value.weighted_quality_delta !== normalizeZero(numerator / denominator)) throw new Error("v2 weighted aggregation reduction drift");
  } else if (value.numerator !== null || value.denominator !== null || value.weighted_quality_delta !== null) {
    throw new Error("v2 aggregate cannot publish weighted values without complete required lineage");
  }

  const vector = value.overhead_component_vector;
  for (const name of ["token_count_delta", "latency_delta", "human_effort_delta", "false_positive_raw_count_delta", "false_positive_unit_delta"]) validateComponentSummary(vector[name], name);
  if (vector.token_count_delta.cached_input_policy !== "excluded_from_sum_to_avoid_double_count") throw new Error("cached input must not be added separately to token delta");
  // With no eligible observations every component is unknown, including FP
  // units. A mapping being unavailable must not turn an empty population into
  // applicable evidence, nor prevent publishing its insufficient report.
  const expectedFpUnitState = value.included_fixture_ids.length === 0 ? "unknown" : "not_applicable";
  if (vector.false_positive_unit_delta.state !== expectedFpUnitState || vector.false_positive_unit_delta.value !== null || vector.false_positive_unit_delta.reason !== V2_FP_UNIT_REASON) throw new Error("false-positive unit delta must remain explicitly not-applicable without an approved taxonomy mapping, or unknown for an empty population");
  if (value.safety_blockers.unauthorized_attempt !== (vector.unsafe_action_category_counts.unauthorized_attempt > 0)
    || value.safety_blockers.external_action_executed !== (vector.unsafe_action_category_counts.external_action_executed > 0)) throw new Error("v2 safety blocker reduction drift");

  const expectedStatus = v2ResultStatus({
    includedFixtureIds: value.included_fixture_ids,
    weightedSuite,
    lineageInsufficient: weightedSuite && lineage.insufficient,
    vector,
  });
  if (value.result_status !== expectedStatus) throw new Error("v2 aggregate result status does not match actual evidence closure");

  const expectedSensitivityIds = scoringPolicy.aggregation_policy.sensitivity_dimensions.map(({ dimension_id }) => dimension_id);
  if (stableCanonicalJson(value.sensitivity_views.map(({ dimension_id }) => dimension_id)) !== stableCanonicalJson(expectedSensitivityIds)) throw new Error("v2 sensitivity dimension inventory drift");
  for (const dimension of value.sensitivity_views) {
    if (dimension.included.population_fixture_ids.some((fixtureId) => !value.included_fixture_ids.includes(fixtureId))) throw new Error("sensitivity included population escapes aggregate fixture authority");
    if (dimension.excluded.population_fixture_ids.some((fixtureId) => !value.included_fixture_ids.includes(fixtureId))) throw new Error("sensitivity excluded population escapes aggregate fixture authority");
  }
  return value;
}

export function portfolioAggregateEvolutionEvidenceIdentity(verifiedAggregate, { root = DEFAULT_ROOT } = {}) {
  if (!VERIFIED_AGGREGATE_RETURNS.has(verifiedAggregate)) throw new Error("portfolio aggregate evolution evidence requires the complete aggregate full-verifier return issued by verifyPortfolioAggregateResult in this module instance");
  if (!verifiedAggregate?.verified_aggregate_result) throw new Error("portfolio aggregate evolution evidence requires the complete aggregate full-verifier return");
  const artifact = verifiedAggregate.verified_aggregate_result;
  assertRecursivelyFrozen(artifact, "verified aggregate result");
  if (artifact.schema_version !== "2.0.0") throw new Error("legacy aggregate artifacts are not v2 Evolution evidence");
  const { comparison, scoringPolicy } = VERIFIED_AGGREGATE_RETURNS.get(verifiedAggregate);
  if (artifact.paired_comparison_report_id !== comparison.paired_comparison_report_id
    || artifact.paired_comparison_report_digest !== comparison.paired_comparison_report_digest
    || artifact.scoring_policy_digest !== scoringPolicy.policy_digest) throw new Error("verified aggregate Evolution identity is not bound to its full-verifier authorities");
  assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, PORTFOLIO_AGGREGATE_RESULT_SCHEMA_PATH), label: "verified portfolio aggregate result" });
  return Object.freeze({
    source_kind: "portfolio_aggregate_result",
    artifact_id: artifact.aggregate_result_id,
    artifact_digest: artifact.aggregate_result_digest,
    result_status: artifact.result_status,
  });
}

// Downstream reporting must not read replaceable convenience fields on the
// verifier return. These snapshots are captured privately at issuance, before
// any caller can replace verified_comparison or its nested properties.
export function portfolioAggregateEvolutionContext(verifiedAggregate, options = {}) {
  const identity = portfolioAggregateEvolutionEvidenceIdentity(verifiedAggregate, options);
  const { comparison, repetition, scoringPolicy } = VERIFIED_AGGREGATE_RETURNS.get(verifiedAggregate);
  return Object.freeze({ identity, aggregate: verifiedAggregate.verified_aggregate_result, comparison, repetition, scoringPolicy });
}

// Reuse native reductions for an explicitly selected subset of already eligible
// fixtures. This helper grants no population/policy authority; versioned consumers
// must independently bind their full population before requesting a subset.
export function portfolioAggregatePopulationDetails(verifiedAggregate, { fixtureIds, root = DEFAULT_ROOT } = {}) {
  const context = portfolioAggregateEvolutionContext(verifiedAggregate, { root });
  const aggregate = context.aggregate;
  if (!Array.isArray(fixtureIds) || new Set(fixtureIds).size !== fixtureIds.length
    || fixtureIds.some((id) => !aggregate.included_fixture_ids.includes(id))
    || stableCanonicalJson(fixtureIds) !== stableCanonicalJson([...fixtureIds].sort((a, b) => a.localeCompare(b)))) {
    throw new Error("population must be an ordered unique subset of verified eligible fixtures");
  }
  const fixtures = fixtureGroup(context.comparison, { comparisonView: aggregate.comparison_view, suite: aggregate.suite, taskClass: aggregate.task_class });
  return deepFreezeJson({
    snapshot: snapshotFor(fixtures, aggregate.comparison_view, fixtureIds),
    components: buildComponentVector(fixtures, aggregate.comparison_view, fixtureIds),
    quality_contributions: qualityContributions(fixtures, aggregate.comparison_view, fixtureIds),
    quality_observations: fixtures.filter((fixture) => fixtureIds.includes(fixture.fixture_id)).map((fixture) => {
      const view = fixture.comparison_views.find((entry) => entry.view_id === aggregate.comparison_view);
      return { fixture_id: fixture.fixture_id, distribution: structuredClone(view.quality_delta_distribution),
        pairs: view.pairs.map((pair) => ({ ...pairIdentity(pair), quality_delta: structuredClone(pair.quality_delta) })) };
    }),
  });
}

export function validatePortfolioAggregateResult(value, { root = DEFAULT_ROOT, verifiedPolicyArtifacts = null, artifactRoot = root, immutableArtifactDigests = {} } = {}) {
  const resolvedRoot = resolve(root);
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(resolvedRoot, PORTFOLIO_AGGREGATE_RESULT_SCHEMA_PATH), label: "portfolio aggregate result" });
  assertPrivacy(value);
  const authorities = policyAuthorities(resolvedRoot, verifiedPolicyArtifacts);
  if (value.schema_version === "2.0.0") {
    return validateV2AggregateResult(value, {
      root: resolvedRoot,
      verifiedPolicyArtifacts: authorities,
      artifactRoot,
      immutableArtifactDigests,
    });
  }
  validateAggregationResult({
    scoringPolicy: authorities.verified_scoring_policy,
    lineagePolicy: authorities.verified_lineage_policy,
    catalog: authorities.verified_catalog,
    policyManifest: authorities.verified_policy_manifest,
    result: value,
    artifactRoot,
    immutableArtifactDigests,
  });
  return value;
}

function pathsOverlap(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`);
}

function resolveAggregateAuthorityRoot(options, fallbackRoot = DEFAULT_ROOT) {
  const suppliedRoot = resolve(options.aggregateAuthorityRoot ?? options.artifactRoot ?? fallbackRoot);
  if (lstatSync(suppliedRoot).isSymbolicLink()) throw new Error("aggregate source authority root must be canonical and must not be a symlink");
  const canonicalRoot = realpathSync(suppliedRoot);
  return canonicalRoot;
}

function policyPaths(root) {
  if (root === DEFAULT_ROOT) return [DEFAULT_PORTFOLIO_CATALOG_PATH, DEFAULT_PORTFOLIO_POLICY_MANIFEST_PATH, DEFAULT_PORTFOLIO_ADMISSION_POLICY_PATH, DEFAULT_PORTFOLIO_SCORING_POLICY_PATH, DEFAULT_PORTFOLIO_LINEAGE_POLICY_PATH];
  return ["benchmarks/portfolio-catalog.json", "benchmarks/portfolio-policy-manifest.json", "benchmarks/portfolio-admission-policy.json", "benchmarks/portfolio-scoring-policy.json", "benchmarks/portfolio-lineage-policy.json"].map((path) => resolve(root, path));
}

function authorityPaths(options) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const artifactRoot = resolveAggregateAuthorityRoot(options, root);
  return [
    ["paired-comparison input", options.comparisonReportPath],
    ["repetition-report input", options.repetitionReportPath],
    ["result-set input", options.resultSetPath],
    ["normalized result authority", options.normalizedResultsPath],
    ["engineering result authority", options.engineeringResultsPath],
    ["source manifest authority", options.sourceManifestPath],
    ["materialized authority", options.materializedPath],
    ["selection-state authority", options.selectionState],
    ["run authority", options.runDir],
    ["aggregate source authority root", artifactRoot],
    ...policyPaths(root).map((path) => ["policy authority", path]),
  ];
}

function assertDisjointFromAuthorities(path, options, label) {
  for (const [authorityLabel, authorityPath] of authorityPaths(options)) if (authorityPath && pathsOverlap(path, authorityPath)) throw new Error(`${label} must be disjoint from ${authorityLabel}`);
}

function derive(options) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  if (!options.comparisonReportPath) throw new Error("paired comparison report input is missing");
  const verifiedComparison = verifyEngineeringPairedComparisonReport(options);
  const verifiedPolicyArtifacts = verifyPortfolioPolicyArtifacts({ root });
  const artifactRoot = resolveAggregateAuthorityRoot(options, root);
  const builder = options.legacyAggregate === true ? buildLegacyPortfolioAggregateResult : buildPortfolioAggregateResult;
  const artifact = builder({
    verifiedComparison,
    verifiedPolicyArtifacts,
    comparisonView: options.comparisonView,
    suite: options.suite,
    taskClass: options.taskClass,
    classificationRecordPaths: options.classificationRecordPaths ?? [],
    lineageRecordPaths: options.lineageRecordPaths ?? [],
    artifactRoot,
    immutableArtifactDigests: options.immutableArtifactDigests ?? {},
    root,
  });
  return { artifact, verified_comparison: verifiedComparison, verified_policy_artifacts: verifiedPolicyArtifacts };
}

export function reportPortfolioAggregateResult(options) {
  const outputPath = assertAtomicOutputAbsent(options.outputPath, "portfolio aggregate result output");
  assertDisjointFromAuthorities(outputPath, options, "portfolio aggregate result output");
  const derived = derive(options);
  return { ...derived, ...publishJsonAtomicNoReplace({ outputPath, artifact: derived.artifact, label: "portfolio aggregate result output" }) };
}

export function verifyPortfolioAggregateResult(options) {
  if (!options.aggregateResultPath) throw new Error("portfolio aggregate result input is missing");
  const reportPath = resolve(options.aggregateResultPath);
  assertDisjointFromAuthorities(reportPath, options, "portfolio aggregate result input");
  const input = readStableFile(reportPath, "portfolio aggregate result input", MAX_REPORT_BYTES, { allowEmpty: false });
  let supplied;
  try {
    supplied = JSON.parse(input.bytes.toString("utf8"));
  } catch {
    throw new Error("portfolio aggregate result input must contain valid JSON");
  }
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const artifactRoot = resolveAggregateAuthorityRoot(options, root);
  validatePortfolioAggregateResult(supplied, { root, artifactRoot, immutableArtifactDigests: options.immutableArtifactDigests ?? {} });
  const derived = derive({ ...options, legacyAggregate: supplied.schema_version !== "2.0.0" });
  if (stableCanonicalJson(supplied) !== stableCanonicalJson(derived.artifact)) throw new Error("portfolio aggregate result does not match the re-derived full authority report");
  const after = readStableFile(reportPath, "portfolio aggregate result input", MAX_REPORT_BYTES, { allowEmpty: false });
  assertStableFileEvidence(input, after, "portfolio aggregate result input");
  const verified = Object.freeze({
    artifact: supplied,
    bytes: input.bytes,
    verified_aggregate_result: deepFreezeJson(structuredClone(supplied)),
    verified_comparison: derived.verified_comparison,
    verified_policy_artifacts: derived.verified_policy_artifacts,
  });
  VERIFIED_AGGREGATE_RETURNS.set(verified, deepFreezeJson({
    comparison: structuredClone(derived.verified_comparison.verified_comparison_report),
    repetition: structuredClone(derived.verified_comparison.verified_repetition_report),
    scoringPolicy: structuredClone(derived.verified_policy_artifacts.verified_scoring_policy),
  }));
  return verified;
}
