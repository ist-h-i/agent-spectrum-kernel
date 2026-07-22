#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildSelectorContextArtifact,
  buildPortfolioPolicyArtifacts,
  computeAggregateResultDigest,
  computeClassificationRecordDigest,
  computeLineageRecordDigest,
  computeOutputContractDigest,
  computePortfolioPolicyDigest,
  computePortfolioPolicyManifestDigest,
  computeRequirementDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeSelectorContextDigest,
  determineAggregateClassification,
  validateAdmissionGateResult,
  validateAggregateClassificationTransition,
  validateAggregationResult,
  validatePortfolioPolicyArtifacts,
  verifyPortfolioPolicyArtifacts,
  validateRequirementMaxPoints,
} from "./ask-benchmark-portfolio-policy.mjs";
import { computeEvaluatorReferenceDigest } from "./ask-benchmark-evaluator-boundary.mjs";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(tmpdir(), "ask-portfolio-policy-test-"));
const authoritativeRoot = resolve(work, "authoritative");
mkdirSync(authoritativeRoot);
const immutableArtifactDigests = {};
let artifactSequence = 0;
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

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function writeAuthoritativeJson(relativePath, value, { authorize = true } = {}) {
  const path = resolve(authoritativeRoot, relativePath);
  mkdirSync(resolve(path, ".."), { recursive: true });
  const bytes = Buffer.from(serialized(value));
  writeFileSync(path, bytes);
  if (authorize) immutableArtifactDigests[relativePath] = rawDigest(bytes);
  else delete immutableArtifactDigests[relativePath];
  return value;
}

function nextArtifactId(prefix, fixtureId) {
  artifactSequence += 1;
  return `${prefix}-${fixtureId}-${artifactSequence}`;
}

function sealRequirementRecord(requirementRecord) {
  for (const requirement of requirementRecord.requirements) requirement.requirement_digest = computeRequirementDigest(requirement);
  requirementRecord.requirement_set_digest = computeRequirementSetDigest(requirementRecord);
  requirementRecord.requirement_record_digest = computeRequirementRecordDigest(requirementRecord);
  return requirementRecord;
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

function predicateEvidenceFor(fixtureId, { requirementKinds = ["weighted"], authorize = true, overrides = {} } = {}) {
  const requirementRecordId = nextArtifactId("requirement-record", fixtureId);
  const requirementRecord = {
    requirement_record_id: requirementRecordId,
    requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
    requirement_record_path: `requirements/${requirementRecordId}.json`,
    fixture_id: fixtureId,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: base.manifest.manifest_digest,
    scoring_policy_digest: base.scoringPolicy.policy_digest,
    admission_record_digest: `sha256:${"a".repeat(64)}`,
    requirements: requirementKinds.map((requirementKind, index) => ({
      requirement_id: `requirement_${index + 1}`,
      requirement_kind: requirementKind,
      max_points: requirementKind === "informational" ? 0 : requirementKind === "weighted" ? 4 : 2,
      partial_credit_allowed: requirementKind === "weighted",
      evidence_map_ids: requirementKind === "informational" ? [] : [`evidence_${index + 1}`],
      mutation_ids: [`mutation_${index + 1}`],
      equivalence_class_ids: [`equivalence_${index + 1}`],
      finding_group_id: `finding_group_${index + 1}`,
      safety_dimension: ["completion_correctness", "merge_correctness", "safe_operation_correctness"][index % 3],
      requirement_digest: `sha256:${"0".repeat(64)}`,
    })),
    ...overrides,
  };
  sealRequirementRecord(requirementRecord);
  writeAuthoritativeJson(requirementRecord.requirement_record_path, requirementRecord, { authorize });
  return { requirement_record: structuredClone(requirementRecord) };
}

function writeRequirementEvidence(predicateEvidence, { closeRequirements = true, closeSet = true, closeRecord = true } = {}) {
  const record = predicateEvidence.requirement_record;
  if (closeRequirements) for (const requirement of record.requirements) requirement.requirement_digest = computeRequirementDigest(requirement);
  if (closeSet) record.requirement_set_digest = computeRequirementSetDigest(record);
  if (closeRecord) record.requirement_record_digest = computeRequirementRecordDigest(record);
  writeAuthoritativeJson(record.requirement_record_path, record);
  return predicateEvidence;
}

function outputPredicateEvidenceFor(fixtureId, { declaresFindings = true, referenceOverrides = {}, outputOverrides = {} } = {}) {
  const fixture = catalog.fixtures.find((entry) => entry.fixture_id === fixtureId);
  const evaluatorReferenceId = nextArtifactId("evaluator-reference", fixtureId);
  const evaluatorReferencePath = `evaluator-references/${evaluatorReferenceId}.json`;
  const evaluatorReference = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-reference.schema.json",
    program: "adaptive_ask_evaluator_reference",
    evaluator_bundle_id: `evaluator-${"1".repeat(64)}`,
    evaluator_bundle_digest: `sha256:${"2".repeat(64)}`,
    evaluator_bundle_schema_version: "1.0.0",
    fixture_id: fixtureId,
    fixture_input_digest: `sha256:${"3".repeat(64)}`,
    task_class: fixture.task_class,
    suite: fixture.suite,
    evaluator_revision: "4".repeat(40),
    generator_identity: `sha256:${"5".repeat(64)}`,
    independence_statement_digest: `sha256:${"6".repeat(64)}`,
    review_record_digest: `sha256:${"7".repeat(64)}`,
    storage_class: "private_evaluator",
    public_metadata_digest: `sha256:${"0".repeat(64)}`,
    ...referenceOverrides,
  };
  evaluatorReference.public_metadata_digest = computeEvaluatorReferenceDigest(evaluatorReference);
  writeAuthoritativeJson(evaluatorReferencePath, evaluatorReference);
  const outputContractId = nextArtifactId("output-contract", fixtureId);
  const outputContract = {
    output_contract_id: outputContractId,
    output_contract_schema_path: "benchmarks/schemas/portfolio-output-contract.schema.json",
    output_contract_path: `output-contracts/${outputContractId}.json`,
    fixture_id: fixtureId,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: base.manifest.manifest_digest,
    evaluator_public_reference_path: evaluatorReferencePath,
    evaluator_public_reference_digest: evaluatorReference.public_metadata_digest,
    declares_findings: declaresFindings,
    ...outputOverrides,
  };
  outputContract.output_contract_digest = computeOutputContractDigest(outputContract);
  writeAuthoritativeJson(outputContract.output_contract_path, outputContract);
  const evidence = predicateEvidenceFor(fixtureId);
  evidence.output_contract = structuredClone(outputContract);
  return { evidence, evaluatorReference, outputContract };
}

function selectorContextFor(fixtureId, predicateEvidence = predicateEvidenceFor(fixtureId)) {
  return buildSelectorContextArtifact({
    admissionPolicy: base.admissionPolicy,
    scoringPolicy: base.scoringPolicy,
    policyManifest: base.manifest,
    catalog,
    fixtureId,
    predicateEvidence,
    artifactRoot: authoritativeRoot,
    immutableArtifactDigests,
  });
}

function resealSelectorContext(selectorContext) {
  selectorContext.selector_context_digest = computeSelectorContextDigest(selectorContext);
}

function validateGate(gateId, selectorContext, predicateEvidence, result) {
  return validateAdmissionGateResult({
    admissionPolicy: base.admissionPolicy,
    scoringPolicy: base.scoringPolicy,
    policyManifest: base.manifest,
    catalog,
    gateId,
    selectorContext,
    predicateEvidence,
    result,
    artifactRoot: authoritativeRoot,
    immutableArtifactDigests,
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

function classificationReferenceFor(fixtureId, classificationState = "primary_eligible") {
  const fixture = catalog.fixtures.find((entry) => entry.fixture_id === fixtureId);
  const recordId = nextArtifactId("classification-record", fixtureId);
  const record = {
    classification_record_id: recordId,
    classification_record_schema_path: "benchmarks/schemas/portfolio-classification-record.schema.json",
    classification_record_path: `classifications/${recordId}.json`,
    fixture_id: fixtureId,
    fixture_role: fixture.fixture_role,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: base.manifest.manifest_digest,
    pilot_result_digest: `sha256:${"8".repeat(64)}`,
    supported_adapter_tracks: ["codex"],
    ceiling_classification_result: classificationState === "redesign_required" ? "candidate" : "not_candidate",
    floor_classification_result: "not_candidate",
    classification_state: classificationState,
    reason_codes: [classificationState === "primary_eligible" ? "ceiling_and_floor_not_candidate" : "ceiling_candidate"],
    classification_revision: 1,
  };
  record.classification_digest = computeClassificationRecordDigest(record);
  writeAuthoritativeJson(record.classification_record_path, record);
  return {
    fixture_id: fixtureId,
    classification_record_id: record.classification_record_id,
    classification_record_path: record.classification_record_path,
    classification_digest: record.classification_digest,
    classification_state: record.classification_state,
    policy_manifest_digest: record.policy_manifest_digest,
    catalog_digest: record.catalog_digest,
  };
}

function lineageReferenceFor(fixtureId, index) {
  const recordId = nextArtifactId("lineage-record", fixtureId);
  const frequencyBand = index === 0 ? "medium" : "low";
  const impactBand = index === 0 ? "high" : "medium";
  const record = {
    lineage_record_id: recordId,
    lineage_record_schema_path: "benchmarks/schemas/portfolio-lineage-record.schema.json",
    lineage_record_path: `lineage/${recordId}.json`,
    fixture_id: fixtureId,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: base.manifest.manifest_digest,
    lineage_policy_digest: base.lineagePolicy.policy_digest,
    source_type: "two_repository_occurrences",
    source_reference_ids: [`source-${index + 1}`],
    review_status: "reviewed",
    frequency_band: frequencyBand,
    frequency_evidence_ids: [`frequency-evidence-${index + 1}`],
    frequency_reviewer_record_id: `frequency-review-${index + 1}`,
    impact_band: impactBand,
    impact_evidence_ids: [`impact-evidence-${index + 1}`],
    impact_reviewer_record_id: `impact-review-${index + 1}`,
    lineage_revision: 1,
  };
  record.lineage_record_digest = computeLineageRecordDigest(record);
  writeAuthoritativeJson(record.lineage_record_path, record);
  const frequencyWeight = base.lineagePolicy.frequency_bands.find(({ band_id }) => band_id === frequencyBand).weight;
  const impactWeight = base.lineagePolicy.impact_bands.find(({ band_id }) => band_id === impactBand).weight;
  return {
    fixture_id: fixtureId,
    lineage_record_id: record.lineage_record_id,
    lineage_record_path: record.lineage_record_path,
    lineage_record_digest: record.lineage_record_digest,
    lineage_policy_digest: record.lineage_policy_digest,
    frequency_band: frequencyBand,
    impact_band: impactBand,
    frequency_weight: frequencyWeight,
    impact_weight: impactWeight,
  };
}

function mutateLineageSource(reference, mutate, { syncFixture = false } = {}) {
  const record = JSON.parse(readFileSync(resolve(authoritativeRoot, reference.lineage_record_path), "utf8"));
  mutate(record);
  record.lineage_record_digest = computeLineageRecordDigest(record);
  writeAuthoritativeJson(record.lineage_record_path, record);
  reference.lineage_record_digest = record.lineage_record_digest;
  reference.lineage_policy_digest = record.lineage_policy_digest;
  reference.frequency_band = record.frequency_band;
  reference.impact_band = record.impact_band;
  reference.frequency_weight = base.lineagePolicy.frequency_bands.find(({ band_id }) => band_id === record.frequency_band)?.weight;
  reference.impact_weight = base.lineagePolicy.impact_bands.find(({ band_id }) => band_id === record.impact_band)?.weight;
  if (syncFixture) reference.fixture_id = record.fixture_id;
  return record;
}

function mutateClassificationSource(reference, mutate, { syncFixture = false, syncState = true } = {}) {
  const record = JSON.parse(readFileSync(resolve(authoritativeRoot, reference.classification_record_path), "utf8"));
  mutate(record);
  record.classification_digest = computeClassificationRecordDigest(record);
  writeAuthoritativeJson(record.classification_record_path, record);
  reference.classification_digest = record.classification_digest;
  reference.catalog_digest = record.catalog_digest;
  reference.policy_manifest_digest = record.policy_manifest_digest;
  if (syncFixture) reference.fixture_id = record.fixture_id;
  if (syncState) reference.classification_state = record.classification_state;
  return record;
}

function makeAggregateResult({
  suite = "practice_frequency",
  taskClass = "investigation_implementation",
  fixtureIds = aggregateFixtureIds(),
  weighted = true,
} = {}) {
  const contributions = fixtureIds.map((fixtureId, index) => ({ fixture_id: fixtureId, normalized_quality_delta: 0.2 + index * 0.2 }));
  const lineageRecords = weighted ? fixtureIds.map((fixtureId, index) => lineageReferenceFor(fixtureId, index)) : [];
  const denominator = lineageRecords.reduce((sum, { frequency_weight, impact_weight }) => sum + frequency_weight * impact_weight, 0);
  const numerator = weighted ? contributions.reduce((sum, contribution) => {
    const lineage = lineageRecords.find(({ fixture_id }) => fixture_id === contribution.fixture_id);
    return sum + lineage.frequency_weight * lineage.impact_weight * contribution.normalized_quality_delta;
  }, 0) : null;
  const result = {
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: base.manifest.manifest_digest,
    classification_records: fixtureIds.map((fixtureId) => classificationReferenceFor(fixtureId)),
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
    numerator,
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
  assert.throws(() => validateAggregate(result), expected, name);
}

function validateAggregate(result) {
  return validateAggregationResult({
    scoringPolicy: base.scoringPolicy,
    lineagePolicy: base.lineagePolicy,
    catalog,
    policyManifest: base.manifest,
    result,
    artifactRoot: authoritativeRoot,
    immutableArtifactDigests,
  });
}

try {
  const summary = validatePortfolioPolicyArtifacts({ root });
  assert.equal(summary.policyRevision, "issue-205-checkpoint-b1-r3");
  assert.equal(summary.policyStatus, "contracts_frozen_design_records_pending");
  assert.equal(summary.catalogDigest, catalog.catalog_digest);
  assert.equal(summary.admissionGateCount, 15);
  assert.equal(summary.lifecycleStateCount, 6);
  assert.equal(summary.requirementKindCount, 3);
  assert.equal(summary.frequencyBandCount, 4);
  assert.equal(summary.impactBandCount, 4);
  assert.equal(summary.ceilingThreshold, 0.95);
  assert.equal(summary.floorThreshold, 0.2);
  const verifiedPolicy = verifyPortfolioPolicyArtifacts({ root });
  assert.equal(verifiedPolicy.verified_scoring_policy.policy_revision, "issue-205-checkpoint-b1-r3");
  assert.equal(verifiedPolicy.verified_scoring_policy.policy_digest, "sha256:1e8fd6732d5748e42706f8c7cd3cae6b178e39407d0988c8eae68e1586846831");
  assert.equal(Object.isFrozen(verifiedPolicy.verified_scoring_policy), true);
  assert.equal(Object.isFrozen(verifiedPolicy.verified_scoring_policy.requirement_contract), true);
  assert.throws(() => { verifiedPolicy.verified_scoring_policy.policy_revision = "mutated"; }, TypeError);
  assert.equal(verifiedPolicy.verified_scoring_policy.policy_revision, "issue-205-checkpoint-b1-r3");
  const checkedInScoringPolicy = spawnSync("git", ["show", "HEAD:benchmarks/portfolio-scoring-policy.json"], { cwd: root, encoding: null });
  assert.equal(checkedInScoringPolicy.status, 0, checkedInScoringPolicy.stderr?.toString());
  assert.deepEqual(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json")), checkedInScoringPolicy.stdout);

  const cliSuccess = spawnSync(process.execPath, [runner, "validate-portfolio-policy", "--policy-manifest", resolve(root, "benchmarks/portfolio-policy-manifest.json")], { cwd: root, encoding: "utf8" });
  assert.equal(cliSuccess.status, 0, cliSuccess.stderr);
  for (const expected of ["revision=issue-205-checkpoint-b1-r3", `catalog=${catalog.catalog_digest}`, `manifest=${base.manifest.manifest_digest}`, "gates=15", "lifecycle_states=6", "requirement_kinds=3", "frequency_bands=4", "impact_bands=4", "ceiling=0.95", "floor=0.2", "status=contracts_frozen_design_records_pending"]) {
    assert.match(cliSuccess.stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(cliSuccess.stdout, /verified_scoring_policy|requirement_contract|ceiling_floor_policy/u);

  expectFailure("catalog-digest-drift", ({ manifest }) => {
    manifest.catalog_digest = `sha256:${"f".repeat(64)}`;
  }, /catalog_digest does not match the frozen policy\/catalog binding/);

  expectFailure("child-policy-digest-drift", ({ admissionPolicy }) => {
    admissionPolicy.policy_digest = `sha256:${"f".repeat(64)}`;
  }, /admission policy digest does not match/, { resealArtifacts: false });

  expectFailure("verified-scoring-policy-digest-drift", ({ scoringPolicy }) => {
    scoringPolicy.policy_digest = `sha256:${"f".repeat(64)}`;
  }, /scoring policy digest does not match/, { resealArtifacts: false });

  expectFailure("manifest-digest-drift", ({ manifest }) => {
    manifest.manifest_digest = `sha256:${"f".repeat(64)}`;
  }, /policy manifest digest does not match/, { resealArtifacts: false });

  expectFailure("policy-version-mismatch", ({ admissionPolicy }) => {
    admissionPolicy.policy_contract_version = "3.7.1-portfolio-policy";
  }, /policy_contract_version/);

  expectFailure("verified-scoring-policy-revision-mismatch", ({ scoringPolicy }) => {
    scoringPolicy.policy_revision = "issue-205-checkpoint-b1-r4";
  }, /policy_revision|deterministic policy recomputation/);

  expectFailure("verified-scoring-policy-resealed-modification", ({ scoringPolicy }) => {
    scoringPolicy.ceiling_floor_policy.universal_ceiling_candidate.median_normalized_requirement_score_minimum = 0.94;
  }, /ceiling|deterministic policy recomputation/);

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

  expectFailure("requirement-evidence-field-alias-drift", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.required_fields.find(({ field_id }) => field_id === "evidence_map_ids").field_id = "agent_visible_evidence_map_ids";
  }, /scoring policy requirement fields must match the frozen ordered field names/);

  expectFailure("requirement-policy-field-added-without-schema-or-validator", ({ scoringPolicy }) => {
    scoringPolicy.requirement_contract.required_fields.push({ field_id: "unregistered_scoring_field", value_type: "identifier" });
  }, /too many items|scoring policy requirement fields must match the frozen ordered field names/);

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
    predicateEvidence.requirement_record.requirements[0].evidence_map_ids.push("forged_evidence");
  }, /does not match authoritative source/, { resealContext: false });

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

  const { evidence: outputPredicateEvidence } = outputPredicateEvidenceFor("mn-build-option-update");
  const outputSelectorContext = selectorContextFor("mn-build-option-update", outputPredicateEvidence);
  assert.ok(outputSelectorContext.fixture_predicates.includes("finding_producing_task"));
  assert.equal(outputSelectorContext.requirement_record_digest, outputPredicateEvidence.requirement_record.requirement_record_digest);

  const selfAuthoredEmpty = predicateEvidenceFor("mn-build-option-update", { requirementKinds: [], authorize: false });
  assert.throws(() => selectorContextFor("mn-build-option-update", selfAuthoredEmpty), /supplied immutable artifact digest/);

  const resealedEmpty = predicateEvidenceFor("mn-build-option-update", { requirementKinds: [], authorize: false });
  resealedEmpty.requirement_record.requirement_set_digest = computeRequirementSetDigest(resealedEmpty.requirement_record);
  resealedEmpty.requirement_record.requirement_record_digest = computeRequirementRecordDigest(resealedEmpty.requirement_record);
  assert.throws(() => selectorContextFor("mn-build-option-update", resealedEmpty), /supplied immutable artifact digest/);

  const staleRequirement = predicateEvidenceFor("mn-build-option-update");
  staleRequirement.requirement_record.requirement_record_digest = `sha256:${"f".repeat(64)}`;
  writeAuthoritativeJson(staleRequirement.requirement_record.requirement_record_path, staleRequirement.requirement_record);
  assert.throws(() => selectorContextFor("mn-build-option-update", staleRequirement), /requirement record digest does not match/);

  assert.throws(() => selectorContextFor("mn-build-option-update", predicateEvidenceFor("mn-build-option-update", { overrides: { fixture_id: "cal-atomic-rule-batch" } })), /fixture_id binding/);
  assert.throws(() => selectorContextFor("mn-build-option-update", predicateEvidenceFor("mn-build-option-update", { overrides: { catalog_digest: `sha256:${"b".repeat(64)}` } })), /catalog digest binding/);
  assert.throws(() => selectorContextFor("mn-build-option-update", predicateEvidenceFor("mn-build-option-update", { overrides: { scoring_policy_digest: `sha256:${"c".repeat(64)}` } })), /scoring policy digest binding/);
  assert.throws(() => selectorContextFor("mn-build-option-update", predicateEvidenceFor("mn-build-option-update", { overrides: { policy_manifest_digest: `sha256:${"d".repeat(64)}` } })), /policy manifest digest binding/);

  const unknownRequirementPath = predicateEvidenceFor("mn-build-option-update");
  unknownRequirementPath.requirement_record.requirement_record_path = "requirements/unknown-record.json";
  unknownRequirementPath.requirement_record.requirement_record_digest = computeRequirementRecordDigest(unknownRequirementPath.requirement_record);
  assert.throws(() => selectorContextFor("mn-build-option-update", unknownRequirementPath), /authoritative requirement record is missing/);

  const escapingRequirementPath = predicateEvidenceFor("mn-build-option-update");
  escapingRequirementPath.requirement_record.requirement_record_path = "../escape.json";
  escapingRequirementPath.requirement_record.requirement_record_digest = computeRequirementRecordDigest(escapingRequirementPath.requirement_record);
  assert.throws(() => selectorContextFor("mn-build-option-update", escapingRequirementPath), /repository-relative normalized path/);

  const symlinkRequirement = predicateEvidenceFor("mn-build-option-update");
  const symlinkRequirementPath = `symlinks/${nextArtifactId("requirement-link", "mn-build-option-update")}.json`;
  mkdirSync(resolve(authoritativeRoot, "symlinks"), { recursive: true });
  symlinkSync(resolve(authoritativeRoot, symlinkRequirement.requirement_record.requirement_record_path), resolve(authoritativeRoot, symlinkRequirementPath));
  symlinkRequirement.requirement_record.requirement_record_path = symlinkRequirementPath;
  symlinkRequirement.requirement_record.requirement_record_digest = computeRequirementRecordDigest(symlinkRequirement.requirement_record);
  assert.throws(() => selectorContextFor("mn-build-option-update", symlinkRequirement), /must not traverse a symlink/);

  const duplicateRequirementIds = predicateEvidenceFor("mn-build-option-update", { requirementKinds: ["weighted", "blocker"] });
  duplicateRequirementIds.requirement_record.requirements[1].requirement_id = duplicateRequirementIds.requirement_record.requirements[0].requirement_id;
  sealRequirementRecord(duplicateRequirementIds.requirement_record);
  writeAuthoritativeJson(duplicateRequirementIds.requirement_record.requirement_record_path, duplicateRequirementIds.requirement_record);
  assert.throws(() => selectorContextFor("mn-build-option-update", duplicateRequirementIds), /requirement IDs must be a unique string array/);

  const missingEvidenceMap = predicateEvidenceFor("mn-build-option-update");
  missingEvidenceMap.requirement_record.requirements[0].evidence_map_ids = [];
  sealRequirementRecord(missingEvidenceMap.requirement_record);
  writeAuthoritativeJson(missingEvidenceMap.requirement_record.requirement_record_path, missingEvidenceMap.requirement_record);
  assert.throws(() => selectorContextFor("mn-build-option-update", missingEvidenceMap), /scored requirement must have at least one/);

  const missingMaxPoints = predicateEvidenceFor("mn-build-option-update");
  delete missingMaxPoints.requirement_record.requirements[0].max_points;
  writeRequirementEvidence(missingMaxPoints);
  assert.throws(() => selectorContextFor("mn-build-option-update", missingMaxPoints), /max_points.*required/);

  const zeroWeightedPoints = predicateEvidenceFor("mn-build-option-update");
  zeroWeightedPoints.requirement_record.requirements[0].max_points = 0;
  writeRequirementEvidence(zeroWeightedPoints);
  assert.throws(() => selectorContextFor("mn-build-option-update", zeroWeightedPoints), /weighted max_points must be positive/);

  const nonzeroInformationalPoints = predicateEvidenceFor("mn-build-option-update", { requirementKinds: ["informational"] });
  nonzeroInformationalPoints.requirement_record.requirements[0].max_points = 1;
  writeRequirementEvidence(nonzeroInformationalPoints);
  assert.throws(() => selectorContextFor("mn-build-option-update", nonzeroInformationalPoints), /informational max_points must be zero/);

  const requirementDigestDrift = predicateEvidenceFor("mn-build-option-update");
  requirementDigestDrift.requirement_record.requirements[0].requirement_digest = `sha256:${"f".repeat(64)}`;
  writeRequirementEvidence(requirementDigestDrift, { closeRequirements: false });
  assert.throws(() => selectorContextFor("mn-build-option-update", requirementDigestDrift), /requirement requirement_1 digest/);

  const requirementSetDigestDrift = predicateEvidenceFor("mn-build-option-update");
  requirementSetDigestDrift.requirement_record.requirement_set_digest = `sha256:${"e".repeat(64)}`;
  writeRequirementEvidence(requirementSetDigestDrift, { closeRequirements: false, closeSet: false });
  assert.throws(() => selectorContextFor("mn-build-option-update", requirementSetDigestDrift), /requirement set digest/);

  const duplicateRequirementBindings = predicateEvidenceFor("mn-build-option-update", { requirementKinds: ["weighted", "blocker"] });
  duplicateRequirementBindings.requirement_record.requirements[1].mutation_ids = [...duplicateRequirementBindings.requirement_record.requirements[0].mutation_ids];
  writeRequirementEvidence(duplicateRequirementBindings);
  assert.throws(() => selectorContextFor("mn-build-option-update", duplicateRequirementBindings), /mutation IDs must be unique across/);

  const duplicateEquivalenceBindings = predicateEvidenceFor("mn-build-option-update", { requirementKinds: ["weighted", "blocker"] });
  duplicateEquivalenceBindings.requirement_record.requirements[1].equivalence_class_ids = [...duplicateEquivalenceBindings.requirement_record.requirements[0].equivalence_class_ids];
  writeRequirementEvidence(duplicateEquivalenceBindings);
  assert.throws(() => selectorContextFor("mn-build-option-update", duplicateEquivalenceBindings), /equivalence class IDs must be unique across/);

  const duplicateFindingGroups = predicateEvidenceFor("mn-build-option-update", { requirementKinds: ["weighted", "blocker"] });
  duplicateFindingGroups.requirement_record.requirements[1].finding_group_id = duplicateFindingGroups.requirement_record.requirements[0].finding_group_id;
  writeRequirementEvidence(duplicateFindingGroups);
  assert.throws(() => selectorContextFor("mn-build-option-update", duplicateFindingGroups), /finding group IDs must be unique across/);

  const unknownRequirementField = predicateEvidenceFor("mn-build-option-update");
  unknownRequirementField.requirement_record.requirements[0].unexpected_scoring_field = "closed";
  writeRequirementEvidence(unknownRequirementField);
  assert.throws(() => selectorContextFor("mn-build-option-update", unknownRequirementField), /unexpected_scoring_field.*unknown property/);

  const arbitraryEvaluatorDigest = outputPredicateEvidenceFor("mn-build-option-update", { outputOverrides: { evaluator_public_reference_digest: `sha256:${"a".repeat(64)}` } });
  assert.throws(() => selectorContextFor("mn-build-option-update", arbitraryEvaluatorDigest.evidence), /evaluator public reference digest binding/);

  const missingEvaluatorReference = outputPredicateEvidenceFor("mn-build-option-update", { outputOverrides: { evaluator_public_reference_path: "evaluator-references/missing-reference.json" } });
  assert.throws(() => selectorContextFor("mn-build-option-update", missingEvaluatorReference.evidence), /authoritative evaluator public reference is missing/);

  const mismatchedEvaluatorFixture = outputPredicateEvidenceFor("mn-build-option-update", { referenceOverrides: { fixture_id: "cal-atomic-rule-batch" } });
  assert.throws(() => selectorContextFor("mn-build-option-update", mismatchedEvaluatorFixture.evidence), /evaluator public reference fixture binding/);

  const staleEvaluatorBinding = outputPredicateEvidenceFor("mn-build-option-update");
  staleEvaluatorBinding.evaluatorReference.review_record_digest = `sha256:${"9".repeat(64)}`;
  staleEvaluatorBinding.evaluatorReference.public_metadata_digest = computeEvaluatorReferenceDigest(staleEvaluatorBinding.evaluatorReference);
  writeAuthoritativeJson(staleEvaluatorBinding.outputContract.evaluator_public_reference_path, staleEvaluatorBinding.evaluatorReference);
  assert.throws(() => selectorContextFor("mn-build-option-update", staleEvaluatorBinding.evidence), /evaluator public reference digest binding/);

  const changedDeclaresFindings = outputPredicateEvidenceFor("mn-build-option-update");
  changedDeclaresFindings.evidence.output_contract.declares_findings = false;
  changedDeclaresFindings.evidence.output_contract.output_contract_digest = computeOutputContractDigest(changedDeclaresFindings.evidence.output_contract);
  assert.throws(() => selectorContextFor("mn-build-option-update", changedDeclaresFindings.evidence), /output contract reference does not match authoritative source/);

  const mismatchedOutputFixture = outputPredicateEvidenceFor("mn-build-option-update", { outputOverrides: { fixture_id: "cal-atomic-rule-batch" } });
  assert.throws(() => selectorContextFor("mn-build-option-update", mismatchedOutputFixture.evidence), /output contract fixture_id binding/);

  const alternatePredicateRecord = predicateEvidenceFor("mn-build-option-update", { requirementKinds: [], authorize: false });
  assert.throws(() => selectorContextFor("mn-build-option-update", { alternate_requirement_record: alternatePredicateRecord.requirement_record }), /predicate evidence has unknown fields|missing fields/);

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

  assert.equal(validateAggregate(makeAggregateResult()), true);

  expectAggregateFailure("arbitrary-numeric-frequency-weight", (result) => {
    result.lineage_records[0].frequency_weight += 1;
  }, /policy-derived band weight/);

  expectAggregateFailure("arbitrary-numeric-impact-weight", (result) => {
    result.lineage_records[0].impact_weight += 1;
  }, /policy-derived band weight/);

  expectAggregateFailure("lineage-band-weight-mismatch", (result) => {
    const reference = result.lineage_records[0];
    const originalWeight = reference.frequency_weight;
    mutateLineageSource(reference, (record) => {
      record.frequency_band = "high";
    });
    reference.frequency_weight = originalWeight;
  }, /policy-derived band weight/);

  expectAggregateFailure("stale-lineage-digest", (result) => {
    result.lineage_records[0].lineage_record_digest = `sha256:${"f".repeat(64)}`;
  }, /lineage record digest does not match/);

  expectAggregateFailure("wrong-fixture-lineage", (result) => {
    mutateLineageSource(result.lineage_records[0], (record) => {
      record.fixture_id = "pf-performance-regression";
    });
  }, /lineage fixture binding/);

  expectAggregateFailure("wrong-catalog-lineage-binding", (result) => {
    mutateLineageSource(result.lineage_records[0], (record) => {
      record.catalog_digest = `sha256:${"b".repeat(64)}`;
    });
  }, /lineage record catalog digest binding/);

  expectAggregateFailure("wrong-lineage-policy-binding", (result) => {
    mutateLineageSource(result.lineage_records[0], (record) => {
      record.lineage_policy_digest = `sha256:${"c".repeat(64)}`;
    });
  }, /lineage record policy digest binding/);

  expectAggregateFailure("unreviewed-authoritative-lineage", (result) => {
    mutateLineageSource(result.lineage_records[0], (record) => {
      record.review_status = "pending_review";
    });
  }, /requires insufficient_evidence/);

  expectAggregateFailure("missing-frequency-evidence", (result) => {
    mutateLineageSource(result.lineage_records[0], (record) => {
      record.frequency_evidence_ids = [];
    });
  }, /requires insufficient_evidence/);

  expectAggregateFailure("missing-impact-evidence", (result) => {
    mutateLineageSource(result.lineage_records[0], (record) => {
      record.impact_evidence_ids = [];
    });
  }, /requires insufficient_evidence/);

  expectAggregateFailure("unknown-authoritative-lineage-band", (result) => {
    mutateLineageSource(result.lineage_records[0], (record) => {
      record.frequency_band = "unknown";
    });
  }, /requires insufficient_evidence/);

  const missingLineageResult = makeAggregateResult();
  missingLineageResult.lineage_records.pop();
  missingLineageResult.result_status = "insufficient_evidence";
  missingLineageResult.numerator = null;
  missingLineageResult.denominator = null;
  missingLineageResult.weighted_quality_delta = null;
  resealAggregateResult(missingLineageResult);
  assert.equal(validateAggregate(missingLineageResult), true);

  expectAggregateFailure("duplicate-lineage-record", (result) => {
    result.lineage_records.push(structuredClone(result.lineage_records[0]));
  }, /lineage fixture IDs must be a unique string array/);

  expectAggregateFailure("classification-digest-unrelated-to-fixture", (result) => {
    result.classification_records[0].classification_digest = result.classification_records[1].classification_digest;
  }, /classification digest does not match/);

  expectAggregateFailure("classification-fixture-mismatch", (result) => {
    mutateClassificationSource(result.classification_records[0], (record) => {
      record.fixture_id = "pf-performance-regression";
    });
  }, /classification fixture binding/);

  expectAggregateFailure("non-primary-eligible-included", (result) => {
    mutateClassificationSource(result.classification_records[0], (record) => {
      record.classification_state = "redesign_required";
      record.reason_codes = ["ceiling_candidate"];
    });
  }, /only primary_eligible classifications may be included/);

  expectAggregateFailure("missing-classification-record", (result) => {
    result.classification_records.pop();
  }, /must map one-to-one/);

  expectAggregateFailure("excluded-reason-not-derived-from-classification", (result) => {
    const fixtureId = result.included_fixture_ids.shift();
    mutateClassificationSource(result.classification_records.find((reference) => reference.fixture_id === fixtureId), (record) => {
      record.classification_state = "redesign_required";
      record.reason_codes = ["ceiling_candidate"];
    });
    result.excluded_fixtures = [{ fixture_id: fixtureId, reason: "manual_exclusion" }];
    result.excluded_fixture_count = 1;
    result.fixture_contributions.shift();
    result.unweighted_quality_delta = result.fixture_contributions[0].normalized_quality_delta;
  }, /reason must be derived from classification state/);

  expectAggregateFailure("aggregate-digest-drift-after-lineage-replacement", (result) => {
    result.lineage_records[0] = lineageReferenceFor(result.lineage_records[0].fixture_id, 0);
  }, /aggregate result digest drift/, { reseal: false });

  const deterministicAggregate = makeAggregateResult();
  const deterministicClone = structuredClone(deterministicAggregate);
  assert.equal(serialized(deterministicAggregate), serialized(deterministicClone));
  assert.equal(computeAggregateResultDigest(deterministicAggregate), computeAggregateResultDigest(deterministicClone));

  const noWriteAggregate = makeAggregateResult();
  const noWritePaths = [
    ...noWriteAggregate.lineage_records.map(({ lineage_record_path }) => lineage_record_path),
    ...noWriteAggregate.classification_records.map(({ classification_record_path }) => classification_record_path),
  ];
  const noWriteBefore = noWritePaths.map((path) => readFileSync(resolve(authoritativeRoot, path)));
  noWriteAggregate.lineage_records[0].frequency_weight += 1;
  resealAggregateResult(noWriteAggregate);
  assert.throws(() => validateAggregate(noWriteAggregate), /policy-derived band weight/);
  assert.deepEqual(noWritePaths.map((path) => readFileSync(resolve(authoritativeRoot, path))), noWriteBefore);

  expectAggregateFailure("weight-applied-outside-practice-frequency", () => {}, /allowed only for practice_frequency/, {
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
  }, /policy-derived band weight/);

  expectAggregateFailure("zero-eligible-fixtures", (result) => {
    result.included_fixture_ids = [];
    for (const reference of result.classification_records) {
      mutateClassificationSource(reference, (record) => {
        record.classification_state = "redesign_required";
        record.reason_codes = ["ceiling_candidate"];
      });
    }
    result.excluded_fixtures = result.expected_fixture_ids.map((fixtureId) => ({ fixture_id: fixtureId, reason: "classification_redesign_required" }));
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
  }, /policy-derived band weight/);

  expectAggregateFailure("unknown-impact-weight", (result) => {
    result.lineage_records[0].impact_weight = null;
  }, /policy-derived band weight/);

  const unknownLineageResult = makeAggregateResult();
  mutateLineageSource(unknownLineageResult.lineage_records[0], (record) => {
    record.frequency_band = "unknown";
  });
  unknownLineageResult.result_status = "insufficient_evidence";
  unknownLineageResult.numerator = null;
  unknownLineageResult.denominator = null;
  unknownLineageResult.weighted_quality_delta = null;
  resealAggregateResult(unknownLineageResult);
  assert.equal(validateAggregate(unknownLineageResult), true);
  assert.equal(typeof unknownLineageResult.unweighted_quality_delta, "number");

  expectAggregateFailure("unknown-excluded-practice-lineage", (result) => {
    const excludedId = result.included_fixture_ids.shift();
    mutateClassificationSource(result.classification_records.find(({ fixture_id }) => fixture_id === excludedId), (record) => {
      record.classification_state = "insufficient_evidence";
      record.reason_codes = ["unknown_classification_input"];
    });
    result.excluded_fixtures = [{ fixture_id: excludedId, reason: "classification_insufficient_evidence" }];
    result.excluded_fixture_count = 1;
    result.fixture_contributions.shift();
    result.unweighted_quality_delta = result.fixture_contributions[0].normalized_quality_delta;
    mutateLineageSource(result.lineage_records.find(({ fixture_id }) => fixture_id === excludedId), (record) => {
      record.frequency_band = "unknown";
    });
  }, /requires insufficient_evidence/);

  expectAggregateFailure("partial-lineage-silent-exclusion", (result) => {
    result.lineage_records.pop();
  }, /requires insufficient_evidence/);

  expectAggregateFailure("high-impact-in-weighted-view", () => {}, /allowed only for practice_frequency/, {
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
