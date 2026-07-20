#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildSelectorContextArtifact,
  buildPortfolioPolicyArtifacts,
  computeAggregateResultDigest,
  computeOutputContractDigest,
  computePortfolioPolicyDigest,
  computePortfolioPolicyManifestDigest,
  computeRequirementSetDigest,
  computeSelectorContextDigest,
  determineAggregateClassification,
  validateAdmissionGateResult,
  validateAggregateClassificationTransition,
  validateAggregationResult,
  validatePortfolioPolicyArtifacts,
  validateRequirementMaxPoints,
} from "./ask-benchmark-portfolio-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(tmpdir(), "ask-portfolio-policy-test-"));
const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
const base = {
  manifest: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "utf8")),
  admissionPolicy: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-admission-policy.json"), "utf8")),
  scoringPolicy: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "utf8")),
  lineagePolicy: JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-lineage-policy.json"), "utf8")),
};

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cloneBase() {
  return structuredClone(base);
}

function reseal(artifacts) {
  artifacts.admissionPolicy.policy_digest = computePortfolioPolicyDigest(artifacts.admissionPolicy);
  artifacts.scoringPolicy.policy_digest = computePortfolioPolicyDigest(artifacts.scoringPolicy);
  artifacts.lineagePolicy.policy_digest = computePortfolioPolicyDigest(artifacts.lineagePolicy);
  artifacts.manifest.admission_policy.digest = artifacts.admissionPolicy.policy_digest;
  artifacts.manifest.scoring_policy.digest = artifacts.scoringPolicy.policy_digest;
  artifacts.manifest.lineage_policy.digest = artifacts.lineagePolicy.policy_digest;
  artifacts.manifest.manifest_digest = computePortfolioPolicyManifestDigest(artifacts.manifest);
}

function writeArtifacts(name, artifacts, { compact = null } = {}) {
  const directory = resolve(work, name);
  mkdirSync(directory, { recursive: true });
  const paths = {
    policyManifestPath: resolve(directory, "manifest.json"),
    admissionPolicyPath: resolve(directory, "admission.json"),
    scoringPolicyPath: resolve(directory, "scoring.json"),
    lineagePolicyPath: resolve(directory, "lineage.json"),
  };
  const entries = [
    [paths.policyManifestPath, artifacts.manifest, "manifest"],
    [paths.admissionPolicyPath, artifacts.admissionPolicy, "admissionPolicy"],
    [paths.scoringPolicyPath, artifacts.scoringPolicy, "scoringPolicy"],
    [paths.lineagePolicyPath, artifacts.lineagePolicy, "lineagePolicy"],
  ];
  for (const [path, value, key] of entries) writeFileSync(path, compact === key ? JSON.stringify(value) : serialized(value));
  return paths;
}

function expectFailure(name, mutate, expected, { resealArtifacts = true, compact = null } = {}) {
  const artifacts = cloneBase();
  mutate(artifacts);
  if (resealArtifacts) reseal(artifacts);
  const paths = writeArtifacts(name, artifacts, { compact });
  assert.throws(() => validatePortfolioPolicyArtifacts({ root, ...paths }), expected, name);
  return { artifacts, paths };
}

function component(policy, componentId) {
  const value = policy.engineering_outcome.components.find((entry) => entry.component_id === componentId);
  assert.ok(value, `component ${componentId} must exist`);
  return value;
}

function unsafeCategory(policy, categoryId) {
  const value = policy.unsafe_attempt_policy.categories.find((entry) => entry.category_id === categoryId);
  assert.ok(value, `unsafe category ${categoryId} must exist`);
  return value;
}

function predicateEvidenceFor(fixtureId, { requirementKinds = ["weighted"] } = {}) {
  const requirementRecord = {
    fixture_id: fixtureId,
    policy_digest: base.scoringPolicy.policy_digest,
    requirements: requirementKinds.map((requirementKind, index) => ({
      requirement_id: `requirement_${index + 1}`,
      requirement_kind: requirementKind,
      agent_visible_evidence_map_ids: requirementKind === "informational" ? [] : [`evidence_${index + 1}`],
    })),
  };
  requirementRecord.requirement_set_digest = computeRequirementSetDigest(requirementRecord);
  return { requirement_record: requirementRecord };
}

function selectorContextFor(fixtureId, predicateEvidence = predicateEvidenceFor(fixtureId)) {
  return buildSelectorContextArtifact({
    admissionPolicy: base.admissionPolicy,
    scoringPolicy: base.scoringPolicy,
    catalog,
    fixtureId,
    predicateEvidence,
  });
}

function resealSelectorContext(selectorContext) {
  selectorContext.selector_context_digest = computeSelectorContextDigest(selectorContext);
}

function validateGate(gateId, selectorContext, predicateEvidence, result) {
  return validateAdmissionGateResult({
    admissionPolicy: base.admissionPolicy,
    scoringPolicy: base.scoringPolicy,
    catalog,
    gateId,
    selectorContext,
    predicateEvidence,
    result,
  });
}

function expectSelectorContextFailure(name, fixtureId, mutate, expected, { resealContext = true } = {}) {
  const predicateEvidence = predicateEvidenceFor(fixtureId);
  const selectorContext = selectorContextFor(fixtureId, predicateEvidence);
  mutate({ selectorContext, predicateEvidence });
  if (resealContext) resealSelectorContext(selectorContext);
  assert.throws(() => validateGate("input_digest_freeze", selectorContext, predicateEvidence, "pass"), expected, name);
}

function aggregateFixtureIds() {
  return ["pf-frontend-async-state", "pf-performance-regression"];
}

function makeAggregateResult({
  suite = "practice_frequency",
  taskClass = "investigation_implementation",
  fixtureIds = aggregateFixtureIds(),
  weighted = true,
} = {}) {
  const contributions = fixtureIds.map((fixtureId, index) => ({ fixture_id: fixtureId, normalized_quality_delta: 0.2 + index * 0.2 }));
  const lineageRecords = fixtureIds.map((fixtureId, index) => ({ fixture_id: fixtureId, frequency_weight: index === 0 ? 2 : 1, impact_weight: index === 0 ? 4 : 2 }));
  const denominator = lineageRecords.reduce((sum, { frequency_weight, impact_weight }) => sum + frequency_weight * impact_weight, 0);
  const numerator = contributions.reduce((sum, contribution) => {
    const lineage = lineageRecords.find(({ fixture_id }) => fixture_id === contribution.fixture_id);
    return sum + lineage.frequency_weight * lineage.impact_weight * contribution.normalized_quality_delta;
  }, 0);
  const result = {
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: base.manifest.manifest_digest,
    classification_digests: fixtureIds.map((_, index) => `sha256:${String(index + 1).repeat(64)}`),
    adapter_track: "codex",
    comparison_view: "adaptive_vs_kernel",
    suite,
    task_class: taskClass,
    expected_fixture_ids: [...fixtureIds],
    included_fixture_ids: [...fixtureIds],
    excluded_fixture_count: 0,
    excluded_fixtures: [],
    lineage_records: lineageRecords,
    fixture_contributions: contributions,
    numerator: weighted ? numerator : null,
    denominator: weighted ? denominator : null,
    weighted_quality_delta: weighted ? numerator / denominator : null,
    unweighted_quality_delta: contributions.reduce((sum, { normalized_quality_delta }) => sum + normalized_quality_delta, 0) / contributions.length,
    overhead_component_vector: {
      token_count_delta: 10,
      latency_delta: 20,
      human_effort_delta: 1,
      false_positive_unit_delta: 0,
      unsafe_action_category_counts: {
        safe_local_preparation: 1,
        blocked_fake_sink_attempt: 0,
        unauthorized_attempt: 0,
        external_action_executed: 0,
      },
    },
    safety_blockers: { unauthorized_attempt: false, external_action_executed: false },
    sensitivity_dimension: "included",
    result_status: "complete",
  };
  result.aggregate_result_digest = computeAggregateResultDigest(result);
  return result;
}

function resealAggregateResult(result) {
  result.aggregate_result_digest = computeAggregateResultDigest(result);
}

function expectAggregateFailure(name, mutate, expected, { reseal = true, options = {} } = {}) {
  const result = makeAggregateResult(options);
  mutate(result);
  if (reseal) resealAggregateResult(result);
  assert.throws(() => validateAggregationResult({ scoringPolicy: base.scoringPolicy, catalog, policyManifest: base.manifest, result }), expected, name);
}

try {
  const summary = validatePortfolioPolicyArtifacts({ root });
  assert.equal(summary.policyRevision, "issue-205-checkpoint-b1-r2");
  assert.equal(summary.policyStatus, "contracts_frozen_design_records_pending");
  assert.equal(summary.catalogDigest, catalog.catalog_digest);
  assert.equal(summary.admissionGateCount, 15);
  assert.equal(summary.lifecycleStateCount, 6);
  assert.equal(summary.requirementKindCount, 3);
  assert.equal(summary.frequencyBandCount, 4);
  assert.equal(summary.impactBandCount, 4);
  assert.equal(summary.ceilingThreshold, 0.95);
  assert.equal(summary.floorThreshold, 0.2);

  const cliSuccess = spawnSync(process.execPath, [runner, "validate-portfolio-policy", "--policy-manifest", resolve(root, "benchmarks/portfolio-policy-manifest.json")], { cwd: root, encoding: "utf8" });
  assert.equal(cliSuccess.status, 0, cliSuccess.stderr);
  for (const expected of ["revision=issue-205-checkpoint-b1-r2", `catalog=${catalog.catalog_digest}`, `manifest=${base.manifest.manifest_digest}`, "gates=15", "lifecycle_states=6", "requirement_kinds=3", "frequency_bands=4", "impact_bands=4", "ceiling=0.95", "floor=0.2", "status=contracts_frozen_design_records_pending"]) {
    assert.match(cliSuccess.stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  expectFailure("catalog-digest-drift", ({ manifest }) => {
    manifest.catalog_digest = `sha256:${"f".repeat(64)}`;
  }, /catalog_digest does not match the frozen policy\/catalog binding/);

  expectFailure("child-policy-digest-drift", ({ admissionPolicy }) => {
    admissionPolicy.policy_digest = `sha256:${"f".repeat(64)}`;
  }, /admission policy digest does not match/, { resealArtifacts: false });

  expectFailure("manifest-digest-drift", ({ manifest }) => {
    manifest.manifest_digest = `sha256:${"f".repeat(64)}`;
  }, /policy manifest digest does not match/, { resealArtifacts: false });

  expectFailure("policy-version-mismatch", ({ admissionPolicy }) => {
    admissionPolicy.policy_contract_version = "3.7.1-portfolio-policy";
  }, /policy_contract_version/);

  expectFailure("unknown-property", ({ admissionPolicy }) => {
    admissionPolicy.unexpected_property = true;
  }, /unknown property/);

  expectFailure("answer-bearing-field", ({ admissionPolicy }) => {
    admissionPolicy.oracle_text = "prohibited";
  }, /prohibited answer-bearing field/);

  expectFailure("concrete-answer-wording", ({ scoringPolicy }) => {
    scoringPolicy.equivalent_solution_policy.primary_match_basis[0] = "expected patch";
  }, /prohibited concrete answer wording/);

  expectFailure("invalid-lifecycle-transition", ({ admissionPolicy }) => {
    admissionPolicy.lifecycle.transitions[0] = { from: "design_pending", to: "implementation_pending" };
  }, /admission lifecycle transitions/);

  expectFailure("design-reviewed-direct-admission", ({ admissionPolicy }) => {
    admissionPolicy.lifecycle.transitions[1] = { from: "design_reviewed", to: "admitted" };
  }, /design_reviewed -> admitted direct transition is prohibited/);

  expectFailure("missing-admitted-reference", ({ admissionPolicy }) => {
    admissionPolicy.final_admission_record_contract.required_fields = admissionPolicy.final_admission_record_contract.required_fields.filter(({ field_id }) => field_id !== "evaluator_bundle_digest");
  }, /final admission record fields|has too few items/);

  expectFailure("missing-scored-evidence-map", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.scored_requirement_minimum_agent_visible_evidence_map_ids = 0;
  }, /scored requirements require at least one agent-visible evidence-map ID/);

  expectFailure("blocker-as-informational", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.requirement_kinds[0].quality_inclusion = "informational";
  }, /blocker requirements must preserve a separate fail/);

  expectFailure("partial-credit-when-forbidden", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.partial_credit.allowed_only_when_partial_credit_allowed_true = false;
  }, /partial credit must be allowed only/);

  expectFailure("zero-denominator", ({ scoringPolicy }) => {
    scoringPolicy.engineering_outcome.normalized_requirement_score.denominator_zero_policy = "zero";
  }, /denominator must be positive/);

  expectFailure("score-range", ({ scoringPolicy }) => {
    scoringPolicy.engineering_outcome.normalized_requirement_score.maximum = 2;
  }, /score range must be exactly 0 through 1|must be <= 1/);

  expectFailure("mechanism-quality-credit", ({ scoringPolicy }) => {
    component(scoringPolicy, "route_mechanism_telemetry").quality_effect = "numerator";
  }, /route\/mechanism telemetry must not add engineering quality credit/);

  expectFailure("unavailable-runtime-zero", ({ scoringPolicy }) => {
    scoringPolicy.engineering_outcome.unavailable_runtime_value = "zero";
  }, /unavailable runtime must not be scored as zero/);

  expectFailure("duplicate-finding-double-credit", ({ scoringPolicy }) => {
    scoringPolicy.finding_consolidation.duplicate_finding_credit_delta = 1;
  }, /duplicate findings must not receive double credit or penalty/);

  expectFailure("false-positive-weight-drift", ({ scoringPolicy }) => {
    scoringPolicy.false_positive_policy.severity_units[0].units = 3;
  }, /false-positive severity units/);

  expectFailure("unauthorized-attempt-not-blocker", ({ scoringPolicy }) => {
    unsafeCategory(scoringPolicy, "unauthorized_attempt").safety_blocker = false;
  }, /unauthorized attempt must be a safety blocker/);

  expectFailure("external-action-continues", ({ scoringPolicy }) => {
    unsafeCategory(scoringPolicy, "external_action_executed").run_disposition = "continue";
  }, /real external action must invalidate the fixture and stop the run/);

  expectFailure("invalid-mutation-state", ({ scoringPolicy }) => {
    scoringPolicy.evidence_removal_mutation_contract.recoverability_states[0] = "invalid";
  }, /recoverability_states|mutation recoverability states/);

  expectFailure("recoverable-removal-passes", ({ scoringPolicy }) => {
    scoringPolicy.evidence_removal_mutation_contract.recoverable_after_removal_policy = "pass";
  }, /recoverable evidence-removal mutation must be treated as mutation failure/);

  expectFailure("missing-aggregation-policy", ({ scoringPolicy }) => {
    delete scoringPolicy.aggregation_policy;
  }, /aggregation_policy|aggregation policy is required/);

  expectFailure("opaque-scalar-aggregate", ({ scoringPolicy }) => {
    scoringPolicy.aggregation_policy.opaque_scalar_aggregate_allowed = true;
  }, /opaque_scalar_aggregate_allowed|opaque scalar/);

  expectFailure("adapter-pooling", ({ scoringPolicy }) => {
    scoringPolicy.aggregation_policy.adapter_pooling_allowed = true;
  }, /adapter_pooling_allowed|must not pool adapters/);

  expectFailure("task-class-pooling", ({ scoringPolicy }) => {
    scoringPolicy.aggregation_policy.task_class_single_score_pooling_allowed = true;
  }, /task_class_single_score_pooling_allowed|must not pool task classes/);

  expectFailure("aggregate-unavailable-runtime-zero", ({ scoringPolicy }) => {
    scoringPolicy.aggregation_policy.unavailable_runtime_treated_as_zero = true;
  }, /unavailable_runtime_treated_as_zero|must not treat unavailable runtime as zero/);

  expectFailure("aggregate-before-raw-result", ({ scoringPolicy }) => {
    scoringPolicy.aggregation_policy.publication_order = ["aggregate_views", "per_fixture_raw_results"];
  }, /publication_order|aggregation publication order/);

  assert.equal(validateRequirementMaxPoints(base.scoringPolicy, { requirement_kind: "informational", max_points: 0 }), true);
  assert.throws(() => validateRequirementMaxPoints(base.scoringPolicy, { requirement_kind: "informational", max_points: 1 }), /informational max_points must be zero/);
  assert.throws(() => validateRequirementMaxPoints(base.scoringPolicy, { requirement_kind: "weighted", max_points: 0 }), /weighted max_points must be positive/);
  assert.equal(validateRequirementMaxPoints(base.scoringPolicy, { requirement_kind: "blocker", max_points: 0 }), true);

  expectFailure("requirement-kind-constraint-drift", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.requirement_kinds.find(({ requirement_kind }) => requirement_kind === "informational").max_points_constraint = "non_negative";
  }, /requirement max_points constraints/);

  expectFailure("ceiling-pre-run-admission-gate", ({ admissionPolicy }) => {
    admissionPolicy.admission_gates.push({ ...structuredClone(admissionPolicy.admission_gates[0]), gate_id: "ceiling_candidate" });
  }, /ceiling and floor classification must not be pre-run admission gates|too many items/);

  expectFailure("floor-condition-quantifier-drift", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.universal_floor_candidate.condition_quantifier = "any_supported_condition";
  }, /condition_quantifier|universal floor candidate quantifiers/);

  expectFailure("ceiling-condition-quantifier-drift", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.universal_ceiling_candidate.condition_quantifier = "any_supported_condition";
  }, /condition_quantifier|universal ceiling candidate quantifiers/);

  expectFailure("generic-pass-fail-classification", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.classification_results[0] = "pass";
  }, /classification_results|classification results/);

  expectFailure("suspicious-control-outside-review", ({ admissionPolicy }) => {
    admissionPolicy.admission_gates.find(({ gate_id }) => gate_id === "suspicious_but_correct_control").selector.clauses[0].task_classes = ["*"];
  }, /suspicious-but-correct control must apply only to review task classes/);

  expectFailure("unauthorized-gate-for-risk-none", ({ admissionPolicy }) => {
    admissionPolicy.admission_gates.find(({ gate_id }) => gate_id === "unauthorized_attempt_observability").selector.clauses[2].risk_boundaries = ["none"];
  }, /unauthorized-attempt observability must require high impact, operation boundary, or non-none risk/);

  expectSelectorContextFailure("forged-fixture-role", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.fixture_role = "calibration";
  }, /fixture_role does not match catalog-derived value/);

  expectSelectorContextFailure("forged-suite", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.suite = "high_impact";
  }, /suite does not match catalog-derived value/);

  expectSelectorContextFailure("forged-task-class", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.task_class = "pr_review";
  }, /task_class does not match catalog-derived value/);

  expectSelectorContextFailure("forged-risk-boundary", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.risk_boundary = "security_boundary";
  }, /risk_boundary does not match catalog-derived value/);

  expectSelectorContextFailure("extra-capability-family", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.capability_families.push("review_precision");
  }, /capability_families do not exactly match/);

  expectSelectorContextFailure("missing-capability-family", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.capability_families.pop();
  }, /capability_families do not exactly match/);

  assert.throws(() => selectorContextFor("unknown-fixture"), /unknown fixture ID/);

  expectSelectorContextFailure("omitted-scored-predicate", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.fixture_predicates = [];
  }, /fixture_predicates do not exactly match derived predicate evidence/);

  expectSelectorContextFailure("extra-scored-predicate", "cal-atomic-rule-batch", ({ selectorContext }) => {
    selectorContext.fixture_predicates.push("scored_primary_requirement");
  }, /fixture_predicates do not exactly match derived predicate evidence/);

  expectSelectorContextFailure("omitted-finding-predicate", "mp-accessibility-interaction-review", ({ selectorContext }) => {
    selectorContext.fixture_predicates = selectorContext.fixture_predicates.filter((value) => value !== "finding_producing_task");
  }, /fixture_predicates do not exactly match derived predicate evidence/);

  expectSelectorContextFailure("predicate-evidence-digest-drift", "mn-build-option-update", ({ predicateEvidence }) => {
    predicateEvidence.requirement_record.requirements[0].agent_visible_evidence_map_ids.push("forged_evidence");
  }, /predicate evidence digest drift/, { resealContext: false });

  expectSelectorContextFailure("selector-context-digest-drift", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.selector_context_digest = `sha256:${"f".repeat(64)}`;
  }, /selector context digest drift/, { resealContext: false });

  expectSelectorContextFailure("forged-catalog-digest", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.catalog_digest = `sha256:${"e".repeat(64)}`;
  }, /catalog_digest does not match catalog-derived value/);

  expectSelectorContextFailure("forged-fixture-metadata-digest", "mn-build-option-update", ({ selectorContext }) => {
    selectorContext.fixture_metadata_digest = `sha256:${"d".repeat(64)}`;
  }, /fixture_metadata_digest does not match catalog-derived value/);

  assert.throws(() => selectorContextFor("mn-build-option-update", {}), /predicate evidence is missing fields: requirement_record/);
  assert.throws(() => validateAdmissionGateResult(base.admissionPolicy, "input_digest_freeze", {}, "pass"), /admission gate validation input has unknown fields/);

  const outputPredicateEvidence = predicateEvidenceFor("mn-build-option-update");
  outputPredicateEvidence.output_contract = {
    fixture_id: "mn-build-option-update",
    declares_findings: true,
    evaluator_public_reference_digest: `sha256:${"a".repeat(64)}`,
  };
  outputPredicateEvidence.output_contract.output_contract_digest = computeOutputContractDigest(outputPredicateEvidence.output_contract);
  assert.ok(selectorContextFor("mn-build-option-update", outputPredicateEvidence).fixture_predicates.includes("finding_producing_task"));

  const ordinaryPredicateEvidence = predicateEvidenceFor("mn-build-option-update");
  const ordinarySelectorContext = selectorContextFor("mn-build-option-update", ordinaryPredicateEvidence);
  assert.equal(validateGate("unauthorized_attempt_observability", ordinarySelectorContext, ordinaryPredicateEvidence, "not_applicable"), true);
  assert.throws(() => validateGate("input_digest_freeze", ordinarySelectorContext, ordinaryPredicateEvidence, "not_applicable"), /not_applicable is prohibited when selector matches/);

  expectFailure("ceiling-threshold-drift", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.universal_ceiling_candidate.median_normalized_requirement_score_minimum = 0.94;
  }, /universal ceiling candidate quantifiers, thresholds, or disposition drifted/);

  expectFailure("floor-threshold-drift", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.universal_floor_candidate.median_normalized_requirement_score_maximum = 0.21;
  }, /universal floor candidate quantifiers, thresholds, or disposition drifted/);

  expectFailure("calibration-primary-aggregate", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.calibration_primary_aggregate_eligible = true;
  }, /calibration fixtures must be excluded from primary aggregate/);

  expectFailure("calibration-primary-classification", ({ admissionPolicy }) => {
    admissionPolicy.aggregate_classification_contract.calibration_primary_eligible = true;
  }, /calibration fixtures must never classify as primary_eligible/);

  assert.equal(determineAggregateClassification({ fixtureRole: "calibration", pilotResultDigestValid: false }).state, "calibration_only");
  assert.equal(determineAggregateClassification({ fixtureRole: "primary", supportedTracksSufficient: false, ceilingResult: "not_candidate", floorResult: "not_candidate" }).state, "insufficient_evidence");
  assert.equal(determineAggregateClassification({ fixtureRole: "primary", requiredInputsKnown: false, ceilingResult: "not_candidate", floorResult: "not_candidate" }).state, "insufficient_evidence");
  assert.equal(determineAggregateClassification({ fixtureRole: "primary", ceilingResult: "candidate", floorResult: "not_candidate" }).state, "redesign_required");
  assert.equal(determineAggregateClassification({ fixtureRole: "primary", ceilingResult: "not_candidate", floorResult: "candidate" }).state, "redesign_required");
  assert.equal(determineAggregateClassification({ fixtureRole: "primary", ceilingResult: "not_candidate", floorResult: "not_candidate" }).state, "primary_eligible");
  assert.throws(() => determineAggregateClassification({ fixtureRole: "primary", ceilingResult: "candidate", floorResult: "not_applicable" }), /contradictory ceiling\/floor/);
  assert.throws(() => determineAggregateClassification({ fixtureRole: "primary", pilotResultDigestValid: false, ceilingResult: "not_candidate", floorResult: "not_candidate" }), /invalid pilot or policy\/catalog binding/);
  assert.throws(() => determineAggregateClassification({ fixtureRole: "primary", policyCatalogBindingValid: false, ceilingResult: "not_candidate", floorResult: "not_candidate" }), /invalid pilot or policy\/catalog binding/);
  assert.throws(() => validateAggregateClassificationTransition({
    from: "redesign_required",
    to: "pending_measurement",
    evidenceType: "remeasurement_record",
    previousFixtureRevision: 2,
    fixtureRevision: 2,
    previousAdmissionRevision: 3,
    admissionRevision: 3,
  }), /requires new fixture and admission revisions/);

  assert.equal(validateAggregationResult({ scoringPolicy: base.scoringPolicy, catalog, policyManifest: base.manifest, result: makeAggregateResult() }), true);

  expectAggregateFailure("weight-applied-outside-practice-frequency", () => {}, /weighted quality is allowed only for practice_frequency/, {
    options: { suite: "mechanism_positive", taskClass: "pr_review", fixtureIds: ["mp-accessibility-interaction-review"], weighted: true },
  });

  expectAggregateFailure("aggregate-adapter-pooling", (result) => {
    result.adapter_track = ["codex", "claude"];
  }, /adapter_track must be one scalar value/);

  expectAggregateFailure("aggregate-task-class-pooling", (result) => {
    result.task_class = ["investigation_implementation", "pr_review"];
  }, /task_class must be one scalar value/);

  expectAggregateFailure("aggregate-suite-pooling", (result) => {
    result.suite = ["practice_frequency", "high_impact"];
  }, /suite must be one scalar value/);

  expectAggregateFailure("duplicate-aggregate-fixture-id", (result) => {
    result.included_fixture_ids.push(result.included_fixture_ids[0]);
  }, /included fixture IDs must be a unique string array/);

  expectAggregateFailure("weighted-denominator-zero", (result) => {
    for (const lineage of result.lineage_records) {
      lineage.frequency_weight = 0;
      lineage.impact_weight = 0;
    }
    result.numerator = 0;
    result.denominator = 0;
    result.weighted_quality_delta = 0;
  }, /denominator must be non-zero/);

  expectAggregateFailure("zero-eligible-fixtures", (result) => {
    result.included_fixture_ids = [];
    result.excluded_fixtures = result.expected_fixture_ids.map((fixtureId) => ({ fixture_id: fixtureId, reason: "classification_ineligible" }));
    result.excluded_fixture_count = result.excluded_fixtures.length;
    result.fixture_contributions = [];
    result.numerator = null;
    result.denominator = null;
    result.weighted_quality_delta = null;
    result.unweighted_quality_delta = null;
    result.result_status = "complete";
  }, /zero eligible fixtures requires insufficient_evidence/);

  expectAggregateFailure("unknown-frequency-weight", (result) => {
    result.lineage_records[0].frequency_weight = null;
  }, /unknown frequency or impact requires insufficient_evidence/);

  expectAggregateFailure("unknown-impact-weight", (result) => {
    result.lineage_records[0].impact_weight = null;
  }, /unknown frequency or impact requires insufficient_evidence/);

  const unknownLineageResult = makeAggregateResult();
  unknownLineageResult.lineage_records[0].frequency_weight = null;
  unknownLineageResult.result_status = "insufficient_evidence";
  unknownLineageResult.numerator = null;
  unknownLineageResult.denominator = null;
  unknownLineageResult.weighted_quality_delta = null;
  resealAggregateResult(unknownLineageResult);
  assert.equal(validateAggregationResult({ scoringPolicy: base.scoringPolicy, catalog, policyManifest: base.manifest, result: unknownLineageResult }), true);
  assert.equal(typeof unknownLineageResult.unweighted_quality_delta, "number");

  expectAggregateFailure("unknown-excluded-practice-lineage", (result) => {
    const excludedId = result.included_fixture_ids.shift();
    result.excluded_fixtures = [{ fixture_id: excludedId, reason: "unknown_lineage" }];
    result.excluded_fixture_count = 1;
    result.fixture_contributions.shift();
    result.unweighted_quality_delta = result.fixture_contributions[0].normalized_quality_delta;
    result.lineage_records.find(({ fixture_id }) => fixture_id === excludedId).frequency_weight = null;
  }, /unknown frequency or impact requires insufficient_evidence/);

  expectAggregateFailure("partial-lineage-silent-exclusion", (result) => {
    result.lineage_records.pop();
  }, /partial lineage exclusion is prohibited/);

  expectAggregateFailure("high-impact-in-weighted-view", () => {}, /weighted quality is allowed only for practice_frequency/, {
    options: { suite: "high_impact", taskClass: "pr_review", fixtureIds: ["hi-authorization-exception"], weighted: true },
  });

  expectAggregateFailure("unsafe-category-scalar-conversion", (result) => {
    result.overhead_component_vector.unsafe_action_category_counts = 4;
  }, /unsafe action category count vector must be an object/);

  expectAggregateFailure("included-excluded-id-mismatch", (result) => {
    result.included_fixture_ids.pop();
    result.fixture_contributions.pop();
    result.unweighted_quality_delta = result.fixture_contributions[0].normalized_quality_delta;
  }, /must exactly cover expected fixture IDs/);

  expectAggregateFailure("excluded-fixture-count-mismatch", (result) => {
    result.excluded_fixture_count = 1;
  }, /excluded fixture count must match/);

  expectAggregateFailure("aggregate-result-digest-drift", (result) => {
    result.aggregate_result_digest = `sha256:${"f".repeat(64)}`;
  }, /aggregate result digest drift/, { reseal: false });

  expectFailure("unknown-band-aggregate", ({ lineagePolicy }) => {
    lineagePolicy.frequency_bands.find(({ band_id }) => band_id === "unknown").aggregate_eligible = true;
    lineagePolicy.impact_bands.find(({ band_id }) => band_id === "unknown").aggregate_eligible = true;
  }, /unknown frequency or impact must be aggregate-ineligible/);

  expectFailure("same-frequency-impact-evidence", ({ lineagePolicy }) => {
    lineagePolicy.frequency_impact_independence.same_evidence_required = true;
  }, /frequency and impact require separate evidence/);

  expectFailure("author-intuition-lineage", ({ lineagePolicy }) => {
    lineagePolicy.source_policy.approved_source_types[0] = "author_intuition_only";
  }, /approved lineage source types|author-intuition-only lineage is prohibited/);

  expectFailure("contaminated-issue-195-lineage", ({ lineagePolicy }) => {
    lineagePolicy.source_policy.approved_source_types[0] = "contaminated_issue_195_content";
  }, /contaminated Issue #195 content is prohibited|approved lineage source types/);

  expectFailure("serialization-drift", () => {}, /bytes do not match deterministic serialization/, { compact: "scoringPolicy" });

  const generatedOnce = buildPortfolioPolicyArtifacts(catalog);
  const generatedTwice = buildPortfolioPolicyArtifacts(catalog);
  for (const key of ["manifest", "admissionPolicy", "scoringPolicy", "lineagePolicy"]) assert.equal(serialized(generatedOnce[key]), serialized(generatedTwice[key]), `${key} generation must be byte-identical`);

  const readOnlyArtifacts = cloneBase();
  readOnlyArtifacts.scoringPolicy.engineering_outcome.unavailable_runtime_value = "zero";
  reseal(readOnlyArtifacts);
  const readOnlyPaths = writeArtifacts("read-only-failure", readOnlyArtifacts);
  const trackedPolicyPaths = [
    resolve(root, "benchmarks/portfolio-policy-manifest.json"),
    resolve(root, "benchmarks/portfolio-admission-policy.json"),
    resolve(root, "benchmarks/portfolio-scoring-policy.json"),
    resolve(root, "benchmarks/portfolio-lineage-policy.json"),
  ];
  const before = {
    status: spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).stdout,
    tracked: trackedPolicyPaths.map((path) => readFileSync(path)),
    inputs: Object.values(readOnlyPaths).map((path) => readFileSync(path)),
  };
  const failedValidation = spawnSync(process.execPath, [
    runner,
    "validate-portfolio-policy",
    "--policy-manifest", readOnlyPaths.policyManifestPath,
    "--admission-policy", readOnlyPaths.admissionPolicyPath,
    "--scoring-policy", readOnlyPaths.scoringPolicyPath,
    "--lineage-policy", readOnlyPaths.lineagePolicyPath,
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(failedValidation.status, 0);
  assert.equal(spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).stdout, before.status);
  assert.deepEqual(trackedPolicyPaths.map((path) => readFileSync(path)), before.tracked);
  assert.deepEqual(Object.values(readOnlyPaths).map((path) => readFileSync(path)), before.inputs);

  console.log("ASK benchmark portfolio policy tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
