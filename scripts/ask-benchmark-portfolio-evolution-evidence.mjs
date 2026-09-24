import { resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson, stableCanonicalJson } from "./content-addressed-store.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { portfolioAggregateEvolutionContext, verifyPortfolioAggregateResult } from "./ask-benchmark-portfolio-aggregate-result-v2.mjs";
import { buildPortfolioConsumerReport } from "./ask-benchmark-portfolio-consumer-report.mjs";
import { verifyHighImpactSensitivityReport, highImpactSensitivityEvidenceIdentity } from "./ask-benchmark-portfolio-high-impact-sensitivity.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { computeEvolutionArtifactInventoryDigest, deriveEvolutionRecommendation, verifyEvolutionExperiment } from "./evolution-loop.mjs";

const ROOT = resolve(import.meta.dirname, "..");
export const PORTFOLIO_EVOLUTION_BINDING_SCHEMA = "benchmarks/schemas/portfolio-evolution-binding.schema.json";
const B1_MAPPING = Object.freeze({
  schema_version: "1.0.0", binding_kind: "portfolio_aggregate_v2_execution_to_selection",
  baseline: "kernel_only", challenger: "adaptive_ask", comparison_view: "adaptive_vs_kernel",
});
const equal = (left, right) => stableCanonicalJson(left) === stableCanonicalJson(right);
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Call with planned identities before outcomes exist, and seal the returned
// projection in an Evolution experiment. Building a digest does not establish
// chronology or trust: the consumer separately requires that exact experiment
// object digest from the caller's pre-result trust context.
export function buildPortfolioEvolutionProjection({ roles, execution, highImpactRegistrationObjectDigest = null, root = ROOT }) {
  const binding = { roles: structuredClone(roles), execution: structuredClone(execution) };
  assertBenchmarkSchemaInstance(binding, { schemaPath: resolve(root, PORTFOLIO_EVOLUTION_BINDING_SCHEMA), label: "portfolio Evolution execution binding" });
  const ids = execution.fixtures.map(({ fixture_id }) => fixture_id);
  if (new Set(ids).size !== ids.length || !equal(ids, [...ids].sort((a, b) => a.localeCompare(b)))) throw new Error("execution binding fixtures must be unique and canonically ordered");
  if (!equal(execution.classification_records.map(({ fixture_id }) => fixture_id), ids)) throw new Error("execution binding classification inventory must exactly cover the planned fixtures");
  if (highImpactRegistrationObjectDigest !== null && (typeof highImpactRegistrationObjectDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(highImpactRegistrationObjectDigest))) throw new Error("high-impact projection requires an exact registration object digest");
  const sensitivityBinding = highImpactRegistrationObjectDigest === null ? {} : { high_impact_registration_object_digest: highImpactRegistrationObjectDigest };
  return freeze({
    mode: "fixed_b1_exact", baseline_condition: "kernel_only", challenger_condition: "adaptive_ask",
    mapping_digest: canonicalDigest(B1_MAPPING),
    projection_evidence_digest: canonicalDigest({ mapping: B1_MAPPING, ...binding, ...sensitivityBinding }),
  });
}

function actualExecution(context, normalized) {
  const aggregate = context.aggregate;
  const authority = context.comparison.authority;
  if (normalized.normalized_run_digest !== authority.normalized_manifest_digest
    || normalized.source_snapshot_digest !== authority.source_snapshot_digest) throw new Error("normalized execution snapshot transplant rejected");
  const runtime = normalized.source_snapshot.adapter_identities.filter(({ adapter }) => adapter === aggregate.adapter_track);
  if (runtime.length !== 1) throw new Error("execution binding requires exactly one selected adapter runtime identity");
  return {
    source_revision: authority.source_revision, plan_id: authority.plan_id, plan_digest: authority.plan_digest,
    run_instance_id: authority.run_instance_id, adapter_track: aggregate.adapter_track,
    runtime_identity_digest: runtime[0].runtime_identity_digest,
    materialization_manifest_digest: normalized.source.materialization_manifest_digest,
    selection_state_digest: normalized.source.selection_state_digest,
    group: { comparison_view: aggregate.comparison_view, suite: aggregate.suite, task_class: aggregate.task_class },
    fixtures: context.comparison.fixture_comparisons.filter(({ fixture_id }) => aggregate.expected_fixture_ids.includes(fixture_id))
      .map(({ fixture_id, fixture_input_digest, expected_repetition_count }) => ({ fixture_id, fixture_input_digest, expected_repetition_count }))
      .sort((a, b) => a.fixture_id.localeCompare(b.fixture_id)),
    catalog_digest: aggregate.catalog_digest, policy_manifest_digest: aggregate.policy_manifest_digest,
    scoring_policy_digest: aggregate.scoring_policy_digest,
    classification_records: structuredClone(aggregate.classification_records), lineage_records: structuredClone(aggregate.lineage_records),
  };
}
function assertScope(experiment, execution) {
  if (experiment.projection.mode !== "fixed_b1_exact") throw new Error("aggregate v2 consumer requires fixed B1 roles; keep the existing Prompt full_ask wrapper separate");
  const protocol = experiment.protocol;
  if (protocol.source_revision !== execution.source_revision || protocol.adapter.name !== execution.adapter_track
    || protocol.scoring_policy_digest !== execution.scoring_policy_digest
    || !equal(protocol.fixture_ids, execution.fixtures.map(({ fixture_id }) => fixture_id))
    || !equal(protocol.task_classes, [execution.group.task_class])
    || execution.fixtures.some(({ expected_repetition_count }) => expected_repetition_count !== protocol.repetitions)) {
    throw new Error("aggregate execution differs from the exact pre-result experiment scope");
  }
}
function dimension(identity, status, conclusion) {
  return { status, conclusion, source_kind: identity.source_kind, artifact_id: identity.artifact_id, artifact_digest: identity.artifact_digest, causal_credit_applied: false, factor_ids: [] };
}
function absentDimension(experimentDigest, name, sourceKind) {
  const marker = { object_kind: "unavailable_evolution_dimension", experiment_digest: experimentDigest, dimension: name, source_kind: sourceKind, reason: "not_collected_by_aggregate_consumer", measured_evidence: false };
  const digest = canonicalDigest(marker);
  return {
    marker,
    dimension: dimension({ source_kind: sourceKind, artifact_id: `unavailable-${name}-${digest.slice(7, 39)}`, artifact_digest: digest }, "unavailable", "unavailable"),
  };
}
function descriptiveEvidence({ context, report, experiment, evaluationAuthority }) {
  const aggregate = context.aggregate;
  const identity = context.identity;
  const weighted = context.scoringPolicy.aggregation_policy.weighted_reduction.applicable_suites.includes(aggregate.suite);
  const qualityClosed = aggregate.included_fixture_ids.length > 0 && (weighted ? aggregate.weighted_quality_delta : aggregate.unweighted_quality_delta) !== null;
  const challenger = report.safety_inventory.comparison;
  const quality = dimension(identity, qualityClosed ? "complete" : "insufficient_evidence", qualityClosed ? (challenger.requirement_blocker_observed ? "contradicted" : "observed") : "unknown");
  // A witnessed violation settles the existence of a blocker even when other
  // observations are missing. The report retains incomplete coverage separately.
  const safety = dimension(identity,
    challenger.safety_blocker_observed || challenger.evidence_status === "complete" ? "complete" : "insufficient_evidence",
    challenger.safety_blocker_observed ? "unsafe" : challenger.evidence_status === "complete" ? "observed" : "unknown");
  const native = ["token_count_delta", "latency_delta", "human_effort_delta", "false_positive_raw_count_delta", "false_positive_unit_delta"].map((name) => aggregate.overhead_component_vector[name]);
  const costClosed = aggregate.included_fixture_ids.length > 0 && native.every(({ state }) => ["known", "not_applicable"].includes(state));
  const cost = dimension(identity, costClosed ? "complete" : "insufficient_evidence", costClosed ? "observed" : "unknown");
  const selected = context.comparison.fixture_comparisons.filter(({ fixture_id }) => aggregate.included_fixture_ids.includes(fixture_id));
  const varianceClosed = selected.length > 0 && selected.every((fixture) => {
    const view = fixture.comparison_views.find(({ view_id }) => view_id === aggregate.comparison_view);
    return view.structural_pairing_status === "complete" && view.quality_delta_distribution.distribution_status === "complete";
  });
  const variance = dimension({ source_kind: "repetition_report", artifact_id: context.repetition.repetition_report_id, artifact_digest: context.repetition.repetition_report_digest }, varianceClosed ? "complete" : "insufficient_evidence", varianceClosed ? "observed" : "unknown");
  const mechanism = absentDimension(experiment.experiment_digest, "mechanism", "mechanism_scorecard");
  const external = absentDimension(experiment.experiment_digest, "external_outcome", "external_outcome_report");
  const dimensions = { quality, safety, cost, variance, mechanism: mechanism.dimension, external_outcome: external.dimension };
  const evidence = {
    authority: {
      ...structuredClone(evaluationAuthority), kind: "external_evolution_evaluation_authority",
      experiment_digest: experiment.experiment_digest, verification_mode: "full_verifier",
      artifact_inventory_digest: computeEvolutionArtifactInventoryDigest(dimensions),
    },
    dimensions,
    causal_attribution: { status: "not_claimed", factor_ids: [], evidence_digests: [] },
    reason_codes: ["descriptive_observations_only", "exact_aggregate_identity", "native_components_not_scalarized", "uncollected_dimensions_unavailable"],
  };
  return { evidence, unavailableArtifacts: [mechanism.marker, external.marker] };
}

// Trust arguments are configuration supplied by the evaluation controller, not
// values copied from the result or recommendation being inspected. No returned
// evidence is automatically inserted into Evolution's evaluation trust list.
export function verifyPortfolioEvolutionEvidence({
  aggregateOptions, storeRoot, experimentObjectDigest, trustedExperimentObjectDigests = [],
  trustedExperimentAuthorities = [], trustedAssetAuthorityContexts = [], trustedPortfolioAuthorityContexts = [], trustedHighImpactApprovalGrants = [],
  evaluationAuthority, highImpactRegistrationObjectDigest = null, highImpactReportObjectDigest = null, trustedHighImpactRegistrationObjectDigests = [],
}) {
  if (!Array.isArray(trustedExperimentObjectDigests) || !trustedExperimentObjectDigests.includes(experimentObjectDigest)) throw new Error("an exact independently pinned pre-result experiment object digest is required");
  const verifiedExperiment = verifyEvolutionExperiment({ storeRoot, experimentObjectDigest, trustedExperimentAuthorities, trustedAssetAuthorityContexts, trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants });
  const { experiment, candidate } = verifiedExperiment;
  if ([candidate.generation.actor.actor_id, candidate.authorities.experiment.authority_id, candidate.authorities.decision.authority_id].includes(evaluationAuthority?.authority_id)) throw new Error("aggregate evaluation authority must be distinct from generation, experiment, and human decision authorities");
  const allowedAuthorityFields = ["authority_id", "authority_revision", "authority_evidence_digest"];
  if (!evaluationAuthority || Object.keys(evaluationAuthority).some((key) => !allowedAuthorityFields.includes(key))) throw new Error("evaluation authority requires closed identity metadata only");
  for (const role of Object.values(experiment.roles)) {
    // verifyEvolutionExperiment has already reconstructed these exact selections.
    const selection = readContentAddressedJson({ storeRoot, digest: role.selection_object_digest }).value;
    const selectionContext = readContentAddressedJson({ storeRoot, digest: selection.context_object_digest }).value;
    if (selectionContext.task_class !== experiment.protocol.task_classes[0]
      || selectionContext.adapter !== experiment.protocol.adapter.name
      || selectionContext.model !== experiment.protocol.model
      || selectionContext.source_revision !== experiment.protocol.source_revision
      || selectionContext.tree_digest !== experiment.protocol.tree_digest) throw new Error("Evolution selection context does not match the frozen execution protocol");
  }
  const root = aggregateOptions?.root ?? ROOT;
  const verifiedAggregate = verifyPortfolioAggregateResult(aggregateOptions);
  const context = portfolioAggregateEvolutionContext(verifiedAggregate, { root });
  const normalized = verifyNormalizedPortfolioResults({ root, outputPath: aggregateOptions.normalizedResultsPath, sourceSnapshotDigest: aggregateOptions.sourceSnapshotDigest });
  const execution = actualExecution(context, normalized.manifest);
  assertScope(experiment, execution);
  if ((highImpactRegistrationObjectDigest === null) !== (highImpactReportObjectDigest === null)) throw new Error("high-impact consumption requires both registration and report objects");
  const projection = buildPortfolioEvolutionProjection({ roles: experiment.roles, execution, highImpactRegistrationObjectDigest, root });
  if (!equal(projection, experiment.projection)) throw new Error("aggregate execution/Asset/Portfolio/selection binding differs from the pinned pre-result projection");
  const report = buildPortfolioConsumerReport({ verifiedAggregate, root });
  const highImpact = highImpactRegistrationObjectDigest === null ? null : verifyHighImpactSensitivityReport({
    root, storeRoot, verifiedAggregate, objectDigest: highImpactReportObjectDigest,
    registrationObjectDigest: highImpactRegistrationObjectDigest, trustedRegistrationObjectDigests: trustedHighImpactRegistrationObjectDigests,
  });
  const { evidence, unavailableArtifacts } = descriptiveEvidence({ context, report, experiment, evaluationAuthority });
  const recommendation = deriveEvolutionRecommendation({ experiment, evidence });
  if (report.safety_inventory.comparison.requirement_blocker_observed && ["expand", "retain"].includes(recommendation.recommendation)) throw new Error("a witnessed requirement blocker cannot be hidden by an aggregate recommendation");
  return freeze({
    report, execution_binding: execution, experiment_object_digest: experimentObjectDigest,
    experiment_digest: experiment.experiment_digest, evidence, recommendation, unavailable_artifacts: unavailableArtifacts,
    ...(highImpact === null ? {} : { high_impact_sensitivity: { identity: highImpactSensitivityEvidenceIdentity(highImpact), verified_report: highImpact } }),
    authority_implied: false,
  });
}
