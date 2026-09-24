import { resolve } from "node:path";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson, stableCanonicalJson } from "./content-addressed-store.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { verifyPortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import { portfolioAggregateEvolutionContext, portfolioAggregatePopulationDetails } from "./ask-benchmark-portfolio-aggregate-result-v2.mjs";
import { buildPortfolioConsumerReport, portfolioConsumerSafetyInventory } from "./ask-benchmark-portfolio-consumer-report.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const POLICY_PATH = "benchmarks/portfolio-high-impact-sensitivity-policy.json";
const SCHEMA = "benchmarks/schemas/portfolio-high-impact-sensitivity-";
export const HIGH_IMPACT_POLICY_DIGEST = "sha256:38c8bc08756dcafeb407a19495c42aaf405f85645535990727be7c6e450a4264";
const SCOPE_FIELDS = Object.freeze(["source_revision", "plan_id", "plan_digest", "run_instance_id", "adapter_track", "group", "fixtures", "catalog_digest", "policy_manifest_digest", "scoring_policy_digest"]);
const COMPONENTS = Object.freeze(["token_count_delta", "latency_delta", "human_effort_delta", "false_positive_raw_count_delta", "false_positive_unit_delta"]);
const ISSUED = new WeakMap();
const equal = (left, right) => stableCanonicalJson(left) === stableCanonicalJson(right);
const clone = (value) => structuredClone(value);
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function withoutDigest(value, key) { const base = clone(value); delete base[key]; return canonicalDigest(base); }
function schema(value, name, root) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, `${SCHEMA}${name}.schema.json`), label: `high-impact sensitivity ${name}` });
}
export function loadHighImpactSensitivityPolicy({ root = ROOT } = {}) {
  const file = readStableFile(resolve(root, POLICY_PATH), "high-impact sensitivity policy", 64 * 1024, { allowEmpty: false });
  const policy = JSON.parse(file.bytes.toString("utf8"));
  schema(policy, "policy", root);
  if (policy.policy_digest !== HIGH_IMPACT_POLICY_DIGEST || withoutDigest(policy, "policy_digest") !== HIGH_IMPACT_POLICY_DIGEST) {
    throw new Error("high-impact policy is not the frozen result-blind version; resealing does not authorize mutation");
  }
  return freeze(policy);
}
// Strip runtime/result-side fields ONLY when constructing the pre-result scope.
// Validation of an already stored scope remains closed; it never drops fields.
export function highImpactRegistrationScope(execution) {
  return Object.fromEntries(SCOPE_FIELDS.map((key) => [key, clone(execution[key])]));
}
function validateRegistration(registration, root) {
  schema(registration, "registration", root);
  if (registration.registration_digest !== withoutDigest(registration, "registration_digest")) throw new Error("high-impact registration digest mismatch");
  const policy = loadHighImpactSensitivityPolicy({ root });
  if (registration.policy_digest !== policy.policy_digest || registration.policy_revision !== policy.policy_revision) throw new Error("high-impact cross-policy registration transplant rejected");
  const authorities = verifyPortfolioPolicyArtifacts({ root });
  const catalog = authorities.verified_catalog;
  const scope = registration.scope;
  if (scope.catalog_digest !== policy.catalog_digest || scope.catalog_digest !== catalog.catalog_digest
    || scope.scoring_policy_digest !== policy.scoring_policy_digest || scope.scoring_policy_digest !== authorities.verified_scoring_policy.policy_digest
    || scope.policy_manifest_digest !== authorities.verified_policy_manifest.manifest_digest) throw new Error("high-impact registration frozen source policy mismatch");
  const fixtures = catalog.fixtures.filter((f) => f.fixture_role === "primary" && f.suite === scope.group.suite && f.task_class === scope.group.task_class)
    .sort((a, b) => a.fixture_id.localeCompare(b.fixture_id));
  if (!fixtures.length || !equal(fixtures.map((f) => f.fixture_id), scope.fixtures.map((f) => f.fixture_id))
    || fixtures.some((f, i) => f.repetitions !== scope.fixtures[i].expected_repetition_count)) {
    throw new Error("high-impact registration must contain the exact complete ordered catalog group and frozen repetitions");
  }
  if (fixtures.some((f) => f.risk_boundary !== "none" && !policy.high_impact_risk_boundaries.includes(f.risk_boundary))) throw new Error("unknown catalog risk boundary is not an authorized high-impact classification");
  return { policy, fixtures };
}
export function publishHighImpactSensitivityRegistration({ storeRoot, scope, root = ROOT }) {
  const policy = loadHighImpactSensitivityPolicy({ root });
  const base = { schema_version: "1.0.0", object_kind: "portfolio_high_impact_sensitivity_registration", policy_revision: policy.policy_revision, policy_digest: policy.policy_digest, scope: clone(scope) };
  const registration = { ...base, registration_digest: withoutDigest(base, "registration_digest") };
  validateRegistration(registration, root);
  const stored = putContentAddressedJson({ storeRoot, artifact: registration });
  // Publication does not grant chronology, execution, admission or result authority.
  return freeze({ registration, object_digest: stored.digest });
}
function readRegistration({ storeRoot, registrationObjectDigest, trustedRegistrationObjectDigests, root }) {
  if (!Array.isArray(trustedRegistrationObjectDigests) || !trustedRegistrationObjectDigests.includes(registrationObjectDigest)) {
    throw new Error("an independently pinned exact pre-result high-impact registration object is required");
  }
  const registration = readContentAddressedJson({ storeRoot, digest: registrationObjectDigest }).value;
  const validation = validateRegistration(registration, root);
  return { registration, ...validation };
}
function actualScope(context) {
  const aggregate = context.aggregate;
  const authority = context.comparison.authority;
  return {
    ...Object.fromEntries(["source_revision", "plan_id", "plan_digest", "run_instance_id"].map((key) => [key, authority[key]])),
    adapter_track: aggregate.adapter_track,
    group: { comparison_view: aggregate.comparison_view, suite: aggregate.suite, task_class: aggregate.task_class },
    fixtures: context.comparison.fixture_comparisons.filter((f) => aggregate.expected_fixture_ids.includes(f.fixture_id))
      .map(({ fixture_id, fixture_input_digest, expected_repetition_count }) => ({ fixture_id, fixture_input_digest, expected_repetition_count }))
      .sort((a, b) => a.fixture_id.localeCompare(b.fixture_id)),
    ...Object.fromEntries(["catalog_digest", "policy_manifest_digest", "scoring_policy_digest"].map((key) => [key, aggregate[key]])),
  };
}
function buildView(verifiedAggregate, context, ids, excludedSources, root) {
  const population = portfolioAggregatePopulationDetails(verifiedAggregate, { fixtureIds: ids, root });
  const safety = portfolioConsumerSafetyInventory(verifiedAggregate, { fixtureIds: ids, root });
  const aggregate = context.aggregate;
  const weighted = context.scoringPolicy.aggregation_policy.weighted_reduction.applicable_suites.includes(aggregate.suite);
  const lineage = new Map(aggregate.lineage_records.map((record) => [record.fixture_id, record]));
  const reasons = [];
  if (ids.length === 0) reasons.push("empty_eligible_population");
  for (const name of COMPONENTS) if (!["known", "not_applicable"].includes(population.components[name].state)) reasons.push(`${name}_${population.components[name].state}`);
  for (const [role, value] of Object.entries(safety)) {
    if (value.evidence_status !== "complete") reasons.push(`${role}_safety_observation_coverage_incomplete`);
    if (value.requirement_unknown_observation_count > 0) reasons.push(`${role}_requirement_observation_coverage_incomplete`);
  }
  // B1 requires reviewed lineage for every expected fixture, including exclusions.
  const lineageComplete = aggregate.expected_fixture_ids.every((id) => Number.isFinite(lineage.get(id)?.frequency_weight) && Number.isFinite(lineage.get(id)?.impact_weight));
  if (weighted && !lineageComplete) reasons.push("reviewed_lineage_incomplete");
  const contributions = population.quality_contributions.map((part) => ({
    ...clone(part), frequency_weight: weighted ? lineage.get(part.fixture_id)?.frequency_weight ?? null : null,
    impact_weight: weighted ? lineage.get(part.fixture_id)?.impact_weight ?? null : null,
  }));
  let numerator = null;
  let denominator = null;
  let value = null;
  if (weighted && lineageComplete && ids.length > 0) {
    numerator = 0; denominator = 0;
    for (const part of contributions) {
      const weight = part.frequency_weight * part.impact_weight;
      numerator += weight * part.normalized_quality_delta; denominator += weight;
    }
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) throw new Error("high-impact weighted population overflow or invalid denominator");
    value = numerator / denominator;
    if (Object.is(numerator, -0)) numerator = 0;
    if (Object.is(value, -0)) value = 0;
  }
  return {
    details: {
      snapshot: { ...clone(population.snapshot), excluded_sources: excludedSources, evidence_status: reasons.length ? "insufficient_evidence" : "complete" },
      component_observations: Object.fromEntries(COMPONENTS.map((name) => [name, clone(population.components[name].fixture_values)])),
      omitted_observations: [],
      quality_denominators: {
        expected_fixture_count: aggregate.expected_fixture_ids.length, observed_fixture_count: ids.length,
        observed_pair_count: population.snapshot.population_pair_count,
        weighted_numerator: numerator, weighted_denominator: denominator, weighted_quality_delta: value,
      },
      insufficient_evidence_reasons: reasons,
    },
    safety_inventory: clone(safety), quality_contributions: contributions, quality_observations: clone(population.quality_observations),
  };
}
function comparisonSurface(view) {
  const snapshot = view.details.snapshot;
  // Counts/identities change necessarily on exclusion; retain them as evidence,
  // not as a tautological reason to label every legitimate contrast "changed".
  return {
    unweighted_quality_delta: snapshot.unweighted_quality_delta,
    weighted_quality_delta: view.details.quality_denominators.weighted_quality_delta,
    components: Object.fromEntries(COMPONENTS.map((name) => [name, Object.fromEntries(["unit", "state", "value"].map((key) => [key, snapshot.components[name][key]]))])),
    blockers: Object.fromEntries(Object.entries(view.safety_inventory).map(([role, value]) => [role, {
      safety_blocker_observed: value.safety_blocker_observed, requirement_blocker_observed: value.requirement_blocker_observed,
      unsafe_action_category_counts: clone(value.unsafe_action_category_counts),
    }])),
  };
}
export function computeHighImpactSensitivityReportDigest(value) { return withoutDigest(value, "report_digest"); }
export function buildHighImpactSensitivityReport({ storeRoot, registrationObjectDigest, trustedRegistrationObjectDigests = [], verifiedAggregate, root = ROOT }) {
  const { registration, policy, fixtures } = readRegistration({ storeRoot, registrationObjectDigest, trustedRegistrationObjectDigests, root });
  const context = portfolioAggregateEvolutionContext(verifiedAggregate, { root });
  if (!equal(registration.scope, actualScope(context))) throw new Error("high-impact aggregate scope/adapter/policy/input transplant rejected");
  const sourceReport = buildPortfolioConsumerReport({ verifiedAggregate, root });
  const membership = fixtures.map((fixture) => ({
    fixture_id: fixture.fixture_id, fixture_metadata_digest: fixture.fixture_metadata_digest, risk_boundary: fixture.risk_boundary,
    high_impact: policy.high_impact_risk_boundaries.includes(fixture.risk_boundary),
    classification_state: sourceReport.classification_records.find((r) => r.fixture_id === fixture.fixture_id).classification_state,
  }));
  const eligibleIds = context.aggregate.included_fixture_ids;
  const highImpactIds = membership.filter((f) => f.high_impact && eligibleIds.includes(f.fixture_id)).map((f) => f.fixture_id);
  const retainedIds = eligibleIds.filter((id) => !highImpactIds.includes(id));
  const included = buildView(verifiedAggregate, context, eligibleIds, [], root);
  const excluded = buildView(verifiedAggregate, context, retainedIds, highImpactIds.map((fixture_id) => ({ fixture_id, reason: "high_impact_fixture_excluded" })), root);
  const allSafety = sourceReport.safety_inventory;
  let reason = "exact_descriptive_native_vector_comparison";
  let conclusion = equal(comparisonSurface(included), comparisonSurface(excluded)) ? "stable" : "changed";
  if (!highImpactIds.length) reason = "no_eligible_high_impact_fixture";
  else if (!retainedIds.length) reason = "exclusion_removes_entire_eligible_population";
  else if ([included, excluded].some((view) => view.details.snapshot.evidence_status !== "complete")) reason = "included_or_excluded_evidence_incomplete";
  else if (Object.values(allSafety).some((v) => v.evidence_status !== "complete" || v.requirement_unknown_observation_count > 0)) reason = "all_population_safety_or_requirement_coverage_incomplete";
  if (reason !== "exact_descriptive_native_vector_comparison") conclusion = "insufficient_evidence";
  const base = {
    schema_version: "1.0.0", object_kind: "portfolio_high_impact_sensitivity_report",
    registration_object_digest: registrationObjectDigest, registration: clone(registration), source_report: clone(sourceReport),
    membership_inventory: membership, included, excluded, all_population_safety_inventory: clone(allSafety), conclusion, reason,
    boundaries: { native_units_preserved: true, all_population_safety_preserved: true, conclusions_are_descriptive: true,
      chronology_proven_by_hash: false, cross_group_pooling: false, cross_unit_scalar_calculated: false,
      historical_artifact_reinterpreted: false, lifecycle_authority_implied: false, product_value_claim: false },
  };
  const report = { ...base, report_digest: computeHighImpactSensitivityReportDigest(base) };
  schema(report, "report", root);
  return freeze(report);
}
export function publishHighImpactSensitivityReport(options) {
  const report = buildHighImpactSensitivityReport(options);
  const stored = putContentAddressedJson({ storeRoot: options.storeRoot, artifact: report });
  return freeze({ report, object_digest: stored.digest });
}
export function verifyHighImpactSensitivityReport({ objectDigest, ...options }) {
  const stored = readContentAddressedJson({ storeRoot: options.storeRoot, digest: objectDigest }).value;
  schema(stored, "report", options.root ?? ROOT);
  if (stored.report_digest !== computeHighImpactSensitivityReportDigest(stored)) throw new Error("high-impact report digest mismatch");
  const derived = buildHighImpactSensitivityReport(options);
  if (!equal(stored, derived)) throw new Error("high-impact report does not match full-verifier reconstruction");
  const result = freeze({ report: derived, object_digest: objectDigest });
  ISSUED.set(result, freeze({ report_digest: derived.report_digest, object_digest: objectDigest, registration_object_digest: derived.registration_object_digest,
    aggregate_identity: clone(derived.source_report.aggregate_identity) }));
  return result;
}
export function highImpactSensitivityEvidenceIdentity(verifiedReport) {
  const identity = ISSUED.get(verifiedReport);
  if (!identity) throw new Error("high-impact authority must be issued by verifyHighImpactSensitivityReport; copies or resealing are not authority");
  return identity;
}
