import { canonicalDigest } from "./ask-benchmark-materialize.mjs";

export const REQUIREMENT_RECORD_SCHEMA_PATH = "benchmarks/schemas/portfolio-requirement-record.schema.json";
export const OUTPUT_CONTRACT_SCHEMA_PATH = "benchmarks/schemas/portfolio-output-contract.schema.json";
export const EVALUATOR_RESULT_SCHEMA_PATH = "benchmarks/schemas/evaluator-result-envelope.schema.json";
export const FINAL_ADMISSION_RECORD_SCHEMA_PATH = "benchmarks/schemas/portfolio-final-admission-record.schema.json";
export const SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH = "benchmarks/schemas/scoring-input-freeze-manifest.schema.json";

export const REQUIREMENT_FIELD_IDS = Object.freeze([
  "requirement_id",
  "requirement_kind",
  "max_points",
  "partial_credit_allowed",
  "evidence_map_ids",
  "mutation_ids",
  "equivalence_class_ids",
  "finding_group_id",
  "safety_dimension",
  "requirement_digest",
]);

export const REQUIREMENT_RESULT_FIELD_IDS = Object.freeze([
  "requirement_id",
  "outcome",
  "earned_points",
  "matched_equivalence_class_ids",
  "finding_ids",
  "evidence_references",
]);

export const SCORING_IDENTITY_FIELD_IDS = Object.freeze([
  "scoring_input_freeze_manifest_source_digest",
  "scoring_input_freeze_manifest_digest",
  "catalog_digest",
  "policy_manifest_digest",
  "scoring_policy_digest",
  "admission_record_digest",
  "requirement_record_digest",
  "requirement_set_digest",
  "output_contract_digest",
  "evaluator_public_reference_digest",
]);

export const FINAL_ADMISSION_RECORD_FIELD_IDS = Object.freeze([
  "fixture_id",
  "catalog_digest",
  "input_manifest_digest",
  "evaluator_reference_schema",
  "evaluator_bundle_id",
  "evaluator_bundle_digest",
  "evaluator_byte_count",
  "evaluator_requirement_count",
  "evidence_map_ids",
  "mutation_set_ids",
  "reviewer_record_id",
  "admission_revision",
  "admission_status",
  "admission_digest",
]);

const REQUIREMENT_RECORD_FIELD_IDS = Object.freeze([
  "requirement_record_id",
  "requirement_record_schema_path",
  "requirement_record_path",
  "fixture_id",
  "catalog_digest",
  "policy_manifest_digest",
  "scoring_policy_digest",
  "admission_record_digest",
  "requirements",
  "requirement_set_digest",
  "requirement_record_digest",
]);

const SCORED_OUTCOMES = new Set(["pass", "fail", "partial"]);
const NON_SCORING_OUTCOMES = new Set(["not_evaluated", "manual_review_required", "unavailable"]);

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertClosedKeys(value, allowedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const keys = Object.keys(value);
  const unknown = keys.filter((key) => !allowedKeys.includes(key));
  const missing = allowedKeys.filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown fields: ${unknown.join(", ")}`);
  if (missing.length > 0) throw new Error(`${label} is missing fields: ${missing.join(", ")}`);
}

function assertExactFieldList(actual, expected, label) {
  if (!Array.isArray(actual) || !arraysEqual(actual, expected)) throw new Error(`${label} must match the frozen ordered field names`);
}

function assertUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.length === 0)) throw new Error(`${label} must be a string array`);
  if (new Set(values).size !== values.length) throw new Error(`${label} must be a unique string array`);
}

function assertNoCrossRequirementDuplicates(requirements, field, label) {
  const values = field === "finding_group_id"
    ? requirements.map((requirement) => requirement[field])
    : requirements.flatMap((requirement) => requirement[field]);
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique across the requirement record`);
}

function assertDigestClosure(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} does not match its sorted-key canonical JSON closure`);
}

export function computeRequirementDigest(requirement) {
  return canonicalDigest(withoutField(requirement, "requirement_digest"));
}

export function computeRequirementSetDigest(requirementRecord) {
  return canonicalDigest(Array.isArray(requirementRecord) ? requirementRecord : requirementRecord.requirements);
}

export function computeRequirementRecordDigest(requirementRecord) {
  return canonicalDigest(withoutField(requirementRecord, "requirement_record_digest"));
}

export function computeOutputContractDigest(outputContract) {
  return canonicalDigest(withoutField(outputContract, "output_contract_digest"));
}

export function computeFinalAdmissionRecordDigest(admissionRecord) {
  return canonicalDigest(withoutField(admissionRecord, "admission_digest"));
}

export function computeScoringInputFreezeManifestDigest(freezeManifest) {
  return canonicalDigest(withoutField(freezeManifest, "manifest_digest"));
}

export function computeScoringPolicyDigest(scoringPolicy) {
  return canonicalDigest(withoutField(scoringPolicy, "policy_digest"));
}

export function computePolicyManifestDigest(policyManifest) {
  return canonicalDigest(withoutField(policyManifest, "manifest_digest"));
}

export function validateRequirementMaxPoints(scoringPolicy, requirement) {
  const kind = scoringPolicy.requirement_contract.requirement_kinds.find((entry) => entry.requirement_kind === requirement.requirement_kind);
  if (!kind) throw new Error(`unknown requirement kind: ${requirement.requirement_kind}`);
  if (typeof requirement.max_points !== "number" || !Number.isFinite(requirement.max_points) || requirement.max_points < 0) throw new Error("max_points must be a non-negative finite number");
  if (kind.max_points_constraint === "positive" && requirement.max_points <= 0) throw new Error("weighted max_points must be positive");
  if (kind.max_points_constraint === "required_zero" && requirement.max_points !== 0) throw new Error("informational max_points must be zero");
  return true;
}

export function validateScoringContractSchemaParity({ scoringPolicy, requirementRecordSchema, evaluatorResultSchema }) {
  const policyFields = scoringPolicy.requirement_contract.required_fields.map(({ field_id }) => field_id);
  const requirementDefinition = requirementRecordSchema?.$defs?.requirement;
  const requirementResultDefinition = evaluatorResultSchema?.$defs?.requirementResult;
  if (!requirementDefinition || !requirementResultDefinition) throw new Error("scoring contract Schema definitions are missing");

  assertUniqueStrings(policyFields, "scoring policy requirement field names");
  assertExactFieldList(policyFields, REQUIREMENT_FIELD_IDS, "scoring policy requirement fields");
  assertExactFieldList(requirementDefinition.required, policyFields, "requirement record Schema required fields");
  assertExactFieldList(Object.keys(requirementDefinition.properties ?? {}), policyFields, "requirement record Schema allowed fields");
  assertExactFieldList(requirementDefinition.required, REQUIREMENT_FIELD_IDS, "requirement validator semantic fields");

  const policyKinds = scoringPolicy.requirement_contract.requirement_kinds.map(({ requirement_kind }) => requirement_kind);
  if (!arraysEqual(requirementDefinition.properties.requirement_kind?.enum ?? [], policyKinds)) throw new Error("requirement kind values drifted between policy and Schema");
  const safetyDimensions = scoringPolicy.requirement_contract.blocker_failure_prohibits_pass;
  if (!arraysEqual(requirementDefinition.properties.safety_dimension?.enum ?? [], safetyDimensions)) throw new Error("safety dimension values drifted between policy and Schema");

  assertExactFieldList(requirementResultDefinition.required, REQUIREMENT_RESULT_FIELD_IDS, "evaluator requirement result required fields");
  assertExactFieldList(Object.keys(requirementResultDefinition.properties ?? {}), REQUIREMENT_RESULT_FIELD_IDS, "evaluator requirement result allowed fields");
  const evaluatorRequired = evaluatorResultSchema.required ?? [];
  for (const field of [...SCORING_IDENTITY_FIELD_IDS, "plan_digest", "requirement_results"]) {
    if (!evaluatorRequired.includes(field) || !Object.hasOwn(evaluatorResultSchema.properties ?? {}, field)) throw new Error(`evaluator result Schema is missing scoring input field: ${field}`);
  }
  return true;
}

export function validateFinalAdmissionContractSchemaParity({ admissionPolicy, finalAdmissionRecordSchema }) {
  const policyFields = admissionPolicy?.final_admission_record_contract?.required_fields?.map(({ field_id }) => field_id) ?? [];
  assertExactFieldList(policyFields, FINAL_ADMISSION_RECORD_FIELD_IDS, "final admission policy fields");
  assertExactFieldList(finalAdmissionRecordSchema?.required ?? [], policyFields, "final admission record Schema required fields");
  assertExactFieldList(Object.keys(finalAdmissionRecordSchema?.properties ?? {}), policyFields, "final admission record Schema allowed fields");
  return true;
}

export function validateFinalAdmissionRecordContract({ admissionPolicy, admissionRecord, finalAdmissionRecordSchema = null }) {
  if (finalAdmissionRecordSchema) validateFinalAdmissionContractSchemaParity({ admissionPolicy, finalAdmissionRecordSchema });
  assertClosedKeys(admissionRecord, FINAL_ADMISSION_RECORD_FIELD_IDS, "authoritative final admission record");
  assertUniqueStrings(admissionRecord.evidence_map_ids, "final admission evidence-map IDs");
  assertUniqueStrings(admissionRecord.mutation_set_ids, "final admission mutation-set IDs");
  if (admissionRecord.evidence_map_ids.length === 0 || admissionRecord.mutation_set_ids.length === 0) throw new Error("admitted final admission record requires evidence-map and mutation-set IDs");
  if (admissionRecord.admission_status !== "admitted") throw new Error("scoring input freeze requires an admitted final admission record");
  assertDigestClosure(admissionRecord.admission_digest, computeFinalAdmissionRecordDigest(admissionRecord), "final admission record digest");
  return admissionRecord;
}

export function validateRequirementRecordContract({ scoringPolicy, requirementRecord, requirementRecordSchema = null, evaluatorResultSchema = null }) {
  if (requirementRecordSchema && evaluatorResultSchema) validateScoringContractSchemaParity({ scoringPolicy, requirementRecordSchema, evaluatorResultSchema });
  assertClosedKeys(requirementRecord, REQUIREMENT_RECORD_FIELD_IDS, "authoritative requirement record");
  if (!Array.isArray(requirementRecord.requirements)) throw new Error("authoritative requirement record requirements must be an array");

  assertUniqueStrings(requirementRecord.requirements.map(({ requirement_id }) => requirement_id), "requirement IDs");
  const safetyDimensions = new Set(scoringPolicy.requirement_contract.blocker_failure_prohibits_pass);
  const minimumEvidenceIds = scoringPolicy.requirement_contract.scored_requirement_minimum_agent_visible_evidence_map_ids;
  for (const requirement of requirementRecord.requirements) {
    assertClosedKeys(requirement, REQUIREMENT_FIELD_IDS, `requirement ${requirement.requirement_id ?? "<unknown>"}`);
    validateRequirementMaxPoints(scoringPolicy, requirement);
    if (typeof requirement.partial_credit_allowed !== "boolean") throw new Error("partial_credit_allowed must be boolean");
    assertUniqueStrings(requirement.evidence_map_ids, "requirement evidence-map IDs");
    assertUniqueStrings(requirement.mutation_ids, "requirement mutation IDs");
    assertUniqueStrings(requirement.equivalence_class_ids, "requirement equivalence class IDs");
    if (["blocker", "weighted"].includes(requirement.requirement_kind) && requirement.evidence_map_ids.length < minimumEvidenceIds) {
      throw new Error("scored requirement must have at least one agent-visible evidence-map ID");
    }
    if (!safetyDimensions.has(requirement.safety_dimension)) throw new Error(`requirement safety_dimension is not allowed by the scoring policy: ${requirement.safety_dimension}`);
    assertDigestClosure(requirement.requirement_digest, computeRequirementDigest(requirement), `requirement ${requirement.requirement_id} digest`);
  }
  assertNoCrossRequirementDuplicates(requirementRecord.requirements, "mutation_ids", "mutation IDs");
  assertNoCrossRequirementDuplicates(requirementRecord.requirements, "equivalence_class_ids", "equivalence class IDs");
  assertNoCrossRequirementDuplicates(requirementRecord.requirements, "finding_group_id", "finding group IDs");
  assertDigestClosure(requirementRecord.requirement_set_digest, computeRequirementSetDigest(requirementRecord), "requirement set digest");
  assertDigestClosure(requirementRecord.requirement_record_digest, computeRequirementRecordDigest(requirementRecord), "requirement record digest");
  return requirementRecord;
}

function assertRequirementOutcome(requirement, observation) {
  const { outcome, earned_points: earnedPoints } = observation;
  if (SCORED_OUTCOMES.has(outcome)) {
    if (!Array.isArray(observation.evidence_references) || observation.evidence_references.length === 0) throw new Error(`scored requirement result ${outcome} requires at least one evidence reference`);
    if (typeof earnedPoints !== "number" || !Number.isFinite(earnedPoints) || earnedPoints < 0) throw new Error(`${outcome} requirement result requires non-negative finite earned_points`);
    if (earnedPoints > requirement.max_points) throw new Error("requirement result earned_points exceeds max_points");
    if (outcome === "pass" && earnedPoints !== requirement.max_points) throw new Error("pass requirement result earned_points must equal max_points");
    if (outcome === "fail" && earnedPoints !== 0) throw new Error("fail requirement result earned_points must be zero");
    if (outcome === "partial" && (!requirement.partial_credit_allowed || !(earnedPoints > 0 && earnedPoints < requirement.max_points))) {
      throw new Error("partial requirement result requires partial_credit_allowed and points strictly between zero and max_points");
    }
  } else if (NON_SCORING_OUTCOMES.has(outcome)) {
    if (earnedPoints !== null) throw new Error(`${outcome} requirement result must retain null earned_points and must not be converted to zero`);
  } else {
    throw new Error(`unknown requirement result outcome: ${outcome}`);
  }
  if (requirement.requirement_kind === "informational" && earnedPoints !== null && earnedPoints !== 0) throw new Error("informational requirement earned_points must be zero");
}

export function validateRequirementResultObservations({ scoringPolicy, requirementRecord, evaluatorResult }) {
  if (!Array.isArray(evaluatorResult.requirement_results)) throw new Error("evaluator requirement_results must be an array");
  const requirements = new Map(requirementRecord.requirements.map((requirement) => [requirement.requirement_id, requirement]));
  const resultIds = evaluatorResult.requirement_results.map(({ requirement_id }) => requirement_id);
  assertUniqueStrings(resultIds, "evaluator requirement result IDs");
  const findingIds = new Set([...evaluatorResult.findings, ...evaluatorResult.false_positives, ...evaluatorResult.scope_deviations].map(({ finding_id }) => finding_id));

  for (const observation of evaluatorResult.requirement_results) {
    assertClosedKeys(observation, REQUIREMENT_RESULT_FIELD_IDS, `requirement result ${observation.requirement_id ?? "<unknown>"}`);
    const requirement = requirements.get(observation.requirement_id);
    if (!requirement) throw new Error(`evaluator result references unknown requirement ID: ${observation.requirement_id}`);
    assertUniqueStrings(observation.matched_equivalence_class_ids, "matched equivalence class IDs");
    assertUniqueStrings(observation.finding_ids, "requirement result finding IDs");
    const allowedEquivalenceIds = new Set(requirement.equivalence_class_ids);
    if (observation.matched_equivalence_class_ids.some((id) => !allowedEquivalenceIds.has(id))) throw new Error("matched equivalence class IDs must be a subset of the authoritative requirement");
    if (observation.finding_ids.some((id) => !findingIds.has(id))) throw new Error("requirement result finding reference does not close within the evaluator envelope");
    assertRequirementOutcome(requirement, observation);
  }

  if (evaluatorResult.evaluation_status === "completed") {
    const expectedIds = [...requirements.keys()];
    if (resultIds.length !== expectedIds.length || expectedIds.some((id) => !resultIds.includes(id))) throw new Error("completed evaluation must exactly cover the authoritative requirement set");
    if (evaluatorResult.requirement_results.some(({ outcome }) => !SCORED_OUTCOMES.has(outcome))) throw new Error("completed evaluation contains a non-scoring requirement outcome");
    return { scoringReady: true };
  }
  return { scoringReady: false };
}

export function validateScoringInputBindings({ freezeManifest, freezeManifestSourceDigest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference, normalizedResult, evaluatorResult }) {
  assertDigestClosure(policyManifest.manifest_digest, computePolicyManifestDigest(policyManifest), "policy manifest digest");
  assertDigestClosure(scoringPolicy.policy_digest, computeScoringPolicyDigest(scoringPolicy), "scoring policy digest");
  assertDigestClosure(outputContract.output_contract_digest, computeOutputContractDigest(outputContract), "output contract digest");
  if (policyManifest.catalog_digest !== catalog.catalog_digest || scoringPolicy.catalog_digest !== catalog.catalog_digest) throw new Error("scoring policy or manifest catalog binding does not match");
  if (policyManifest.scoring_policy?.digest !== scoringPolicy.policy_digest) throw new Error("policy manifest scoring policy binding does not match");
  if (requirementRecord.fixture_id !== normalizedResult.lineage.fixture_id) throw new Error("requirement record fixture binding does not match normalized result");
  if (requirementRecord.catalog_digest !== catalog.catalog_digest) throw new Error("requirement record catalog binding does not match");
  if (requirementRecord.policy_manifest_digest !== policyManifest.manifest_digest) throw new Error("requirement record policy manifest binding does not match");
  if (requirementRecord.scoring_policy_digest !== scoringPolicy.policy_digest) throw new Error("requirement record scoring policy binding does not match");
  if (requirementRecord.admission_record_digest !== admissionRecord.admission_digest) throw new Error("requirement record admission binding does not match the authoritative final admission record");
  if (outputContract.fixture_id !== normalizedResult.lineage.fixture_id) throw new Error("output contract fixture binding does not match normalized result");
  if (outputContract.catalog_digest !== catalog.catalog_digest || outputContract.policy_manifest_digest !== policyManifest.manifest_digest) throw new Error("output contract policy or catalog binding does not match");
  if (outputContract.evaluator_public_reference_digest !== evaluatorReference.public_metadata_digest) throw new Error("output contract evaluator public reference binding does not match");
  const fixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === normalizedResult.lineage.fixture_id);
  if (!fixture) throw new Error("normalized result fixture is absent from the bound catalog");
  if (fixture.suite !== normalizedResult.lineage.suite || fixture.task_class !== normalizedResult.lineage.task_class) throw new Error("normalized result suite or task class does not match the bound catalog");

  const expected = {
    scoring_input_freeze_manifest_source_digest: freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: freezeManifest.manifest_digest,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: admissionRecord.admission_digest,
    requirement_record_digest: requirementRecord.requirement_record_digest,
    requirement_set_digest: requirementRecord.requirement_set_digest,
    output_contract_digest: outputContract.output_contract_digest,
    evaluator_public_reference_digest: evaluatorReference.public_metadata_digest,
    plan_digest: normalizedResult.lineage.plan_digest,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (evaluatorResult[field] !== value) throw new Error(`evaluator scoring input binding mismatch at ${field}`);
  }
  if (evaluatorReference.fixture_id !== normalizedResult.lineage.fixture_id || evaluatorReference.fixture_input_digest !== normalizedResult.lineage.fixture_input_digest) throw new Error("evaluator public reference fixture or input binding does not match normalized result");
  return validateRequirementResultObservations({ scoringPolicy, requirementRecord, evaluatorResult });
}

export function scoringContractFingerprint({ scoringPolicy, requirementRecordSchema, evaluatorResultSchema }) {
  return canonicalDigest({
    policy_fields: scoringPolicy.requirement_contract.required_fields,
    requirement_schema: requirementRecordSchema.$defs.requirement,
    evaluator_requirement_result_schema: evaluatorResultSchema.$defs.requirementResult,
    scoring_identity_fields: SCORING_IDENTITY_FIELD_IDS,
  });
}
