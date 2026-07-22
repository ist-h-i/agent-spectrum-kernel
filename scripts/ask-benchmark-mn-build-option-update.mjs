#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import {
  computeEvaluatorReferenceDigest,
  verifyPrivateEvaluatorBundle,
  verifyPublicEvaluatorReference,
} from "./ask-benchmark-evaluator-boundary.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeOutputContractDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeScoringInputFreezeManifestDigest,
  validateRequirementRecordContract,
} from "./ask-benchmark-scoring-contract.mjs";
import {
  admissionGateSelectorMatches,
  buildSelectorContextArtifact,
  validateAdmissionGateResult,
} from "./ask-benchmark-portfolio-policy.mjs";

export const FIXTURE_ID = "mn-build-option-update";
export const FIXTURE_ROOT_RELATIVE = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_JSON_FILES = [
  "admission-review.json",
  "evaluator-reference.json",
  "evidence-map.json",
  "final-admission-record.json",
  "input-manifest.json",
  "metadata.json",
  "output-contract.json",
  "requirement-record.json",
  "scoring-input-freeze-manifest.json",
];
const REQUIRED_APPLICABLE_GATES = [
  "public_artifact_leakage",
  "private_evaluator_boundary",
  "requirement_recoverability",
  "plain_fair_path",
  "kernel_only_fair_path",
  "ordinary_engineering_task_wording",
  "ask_vocabulary_cue_absence",
  "evidence_removal_mutation",
  "equivalent_solution_coverage",
  "independent_review",
  "input_digest_freeze",
  "evaluator_digest_freeze",
];
const REQUIRED_NON_APPLICABLE_GATES = [
  "suspicious_but_correct_control",
  "false_positive_boundary",
  "unauthorized_attempt_observability",
];
const FORBIDDEN_PUBLIC_KEYS = new Set([
  "expected_patch", "hidden_answer", "hidden_requirements", "hidden_test_source", "hidden_tests", "matcher", "matcher_term",
  "oracle", "oracle_text", "private_evaluator_path", "private_root", "raw_evaluator_prompt", "reference_answer", "rubric",
]);
const FORBIDDEN_TASK_VOCABULARY = /\b(?:ASK|Kernel|Skill|mechanism|lightweight bypass)\b/iu;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function assertEqual(actual, expected, label) {
  if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${label} does not match the frozen fixture contract`);
}

function assertDigest(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} digest mismatch`);
}

function publicArtifactPaths(root) {
  const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
  return Object.fromEntries(PUBLIC_JSON_FILES.map((name) => [name, resolve(fixtureRoot, name)]));
}

export function assertAnswerNeutralPublicValue(value, label = "public artifact") {
  const visit = (entry) => {
    if (Array.isArray(entry)) return entry.forEach(visit);
    if (!entry || typeof entry !== "object") return;
    for (const [key, child] of Object.entries(entry)) {
      if (FORBIDDEN_PUBLIC_KEYS.has(key.toLowerCase())) throw new Error(`${label} contains answer-bearing field: ${key}`);
      visit(child);
    }
  };
  visit(value);
  return true;
}

export function assertPrivateRootOutsideRepository(root, privateRoot) {
  const repository = realpathSync(root);
  const candidate = realpathSync(privateRoot);
  if (candidate === repository || candidate.startsWith(`${repository}${sep}`)) throw new Error("private evaluator bundle must stay outside the repository");
  return true;
}

export function validatePendingIndependentReview(review, admission) {
  if (review.author_self_approval !== false || review.reviewer_status !== "pending_independent_review") throw new Error("fixture authoring must not self-approve independent review");
  if (review.gates.find(({ gate_id }) => gate_id === "independent_review")?.result !== "unknown") throw new Error("pending independent review gate must remain unknown");
  if (review.admission_status !== "admission_pending" || admission.admission_status !== "admission_pending") throw new Error("review-pending fixture must not become admitted or scoring-ready");
  return { scoringReady: false };
}

export function validateFairPaths(review, declaredAgentVisiblePaths) {
  for (const condition of ["plain", "kernel_only"]) {
    const path = review.fair_paths?.[condition];
    if (path?.status !== "pass" || !Array.isArray(path.agent_visible_evidence) || path.agent_visible_evidence.length === 0) throw new Error(`${condition} fair path is missing`);
    if (path.agent_visible_evidence.some((entry) => !declaredAgentVisiblePaths.has(entry))) throw new Error(`${condition} fair path references non-agent-visible evidence`);
  }
  return true;
}

export function evaluateEvidenceRemoval({ evidenceMap, removedPaths, expectedRecoverabilityState }) {
  const remaining = evidenceMap.agent_visible_paths.filter((path) => !removedPaths.includes(path));
  const recoverabilityState = remaining.length === 0 ? "not_recoverable" : "recoverable";
  if (recoverabilityState !== expectedRecoverabilityState) throw new Error("evidence-removal recoverability expectation is invalid");
  return recoverabilityState;
}

function assertUniqueIds(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.length === 0)) throw new Error(`${label} must be a non-empty string array`);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains a duplicate ID`);
}

function assertExactIdSet(actual, expected, label) {
  assertUniqueIds(actual, `${label} actual inventory`);
  assertUniqueIds(expected, `${label} expected inventory`);
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (stableCanonicalJson(actualSorted) !== stableCanonicalJson(expectedSorted)) throw new Error(`${label} inventory does not exactly match authority`);
}

export function validateMutationAuthority({ requirementRecord, admissionRecord, evidenceMapArtifact, inputManifestRecord, mutationAsset }) {
  if (!Array.isArray(mutationAsset?.mutations)) throw new Error("private mutation asset must declare a mutation array");
  const expectedIds = requirementRecord.requirements.flatMap((requirement) => requirement.mutation_ids);
  const privateIds = mutationAsset.mutations.map((mutation) => mutation.mutation_id);
  assertExactIdSet(admissionRecord.mutation_set_ids, expectedIds, "final admission mutation");
  assertExactIdSet(privateIds, expectedIds, "private mutation");

  const publicContracts = evidenceMapArtifact.mutation_contracts;
  if (!Array.isArray(publicContracts)) throw new Error("public mutation contract inventory is missing");
  assertExactIdSet(publicContracts.map((entry) => entry.mutation_id), expectedIds, "public mutation contract");
  const publicContractById = new Map(publicContracts.map((entry) => [entry.mutation_id, entry]));
  const evidenceMapById = new Map(evidenceMapArtifact.maps.map((entry) => [entry.evidence_map_id, entry]));
  const agentVisiblePaths = new Set(inputManifestRecord.files.map((entry) => entry.path));
  const requirementByMutation = new Map(requirementRecord.requirements.flatMap((requirement) => requirement.mutation_ids.map((mutationId) => [mutationId, requirement])));

  for (const mutation of mutationAsset.mutations) {
    const requirement = requirementByMutation.get(mutation.mutation_id);
    if (!requirement) throw new Error(`private mutation references unknown ID: ${mutation.mutation_id}`);
    if (mutation.requirement_id !== requirement.requirement_id) throw new Error(`private mutation ${mutation.mutation_id} is transplanted across requirements`);
    const evidenceMap = evidenceMapById.get(mutation.target_evidence_map_id);
    if (!evidenceMap) throw new Error(`private mutation ${mutation.mutation_id} targets an unknown public evidence map`);
    if (!requirement.evidence_map_ids.includes(mutation.target_evidence_map_id)) throw new Error(`private mutation ${mutation.mutation_id} targets another requirement's evidence map`);
    assertUniqueIds(mutation.remove_paths, `private mutation ${mutation.mutation_id} remove paths`);
    if (mutation.remove_paths.length === 0) throw new Error(`private mutation ${mutation.mutation_id} remove paths must not be empty`);
    if (mutation.remove_paths.some((path) => !agentVisiblePaths.has(path))) throw new Error(`private mutation ${mutation.mutation_id} removes a non-agent-visible path`);
    assertExactIdSet(mutation.remove_paths, evidenceMap.agent_visible_paths, `private mutation ${mutation.mutation_id} remove path`);
    if (mutation.mutation_digest !== canonicalDigest(withoutField(mutation, "mutation_digest"))) throw new Error(`private mutation ${mutation.mutation_id} digest mismatch`);
    if (mutation.expected_admission_result !== "fail") throw new Error(`private mutation ${mutation.mutation_id} admission expectation is invalid`);
    evaluateEvidenceRemoval({ evidenceMap, removedPaths: mutation.remove_paths, expectedRecoverabilityState: mutation.expected_recoverability_state });
    const publicContract = publicContractById.get(mutation.mutation_id);
    assertEqual(publicContract, {
      mutation_id: mutation.mutation_id,
      target_evidence_map_id: mutation.target_evidence_map_id,
      expected_recoverability_state: mutation.expected_recoverability_state,
      expected_admission_result: mutation.expected_admission_result,
      mutation_digest: mutation.mutation_digest,
    }, `public mutation contract ${mutation.mutation_id}`);
  }
  return { mutationIds: [...expectedIds] };
}

export function validateEquivalenceAuthority({ requirementRecord, equivalenceAsset }) {
  if (!Array.isArray(equivalenceAsset?.rules)) throw new Error("private equivalence asset must declare a rule array");
  const expectedIds = requirementRecord.requirements.flatMap((requirement) => requirement.equivalence_class_ids);
  const privateIds = equivalenceAsset.rules.map((rule) => rule.equivalence_class_id);
  assertExactIdSet(privateIds, expectedIds, "private equivalence rule");
  const requirementByEquivalence = new Map(requirementRecord.requirements.flatMap((requirement) => requirement.equivalence_class_ids.map((equivalenceId) => [equivalenceId, requirement])));
  for (const rule of equivalenceAsset.rules) {
    const requirement = requirementByEquivalence.get(rule.equivalence_class_id);
    if (!requirement) throw new Error(`private equivalence rule references unknown ID: ${rule.equivalence_class_id}`);
    if (rule.requirement_id !== requirement.requirement_id) throw new Error(`private equivalence rule ${rule.equivalence_class_id} is transplanted across requirements`);
    assertUniqueIds(rule.match_basis, `private equivalence rule ${rule.equivalence_class_id} match basis`);
    if (!rule.match_basis.includes("observable_behavior") || rule.property_order_only !== false) throw new Error(`private equivalence rule ${rule.equivalence_class_id} lacks observable-contract authority`);
    if (rule.rule_digest !== canonicalDigest(withoutField(rule, "rule_digest"))) throw new Error(`private equivalence rule ${rule.equivalence_class_id} digest mismatch`);
  }
  return { equivalenceIds: [...expectedIds] };
}

export function validateMatchedEquivalenceIds({ requirementRecord, equivalenceAsset, matchedEquivalenceClassIds }) {
  const { equivalenceIds } = validateEquivalenceAuthority({ requirementRecord, equivalenceAsset });
  assertUniqueIds(matchedEquivalenceClassIds, "hidden evaluator matched equivalence IDs");
  if (matchedEquivalenceClassIds.some((id) => !equivalenceIds.includes(id))) throw new Error("hidden evaluator returned an undeclared equivalence ID");
  return true;
}

function validateRawFreezeArtifact(root, record, semanticDigest, label) {
  const path = resolve(root, record.path);
  assertDigest(record.raw_byte_digest, sha256(readFileSync(path)), `${label} raw byte`);
  assertDigest(record.semantic_digest, semanticDigest, `${label} semantic`);
}

export function validateMnBuildOptionUpdatePublicFixture({ root = ROOT } = {}) {
  const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
  const paths = publicArtifactPaths(root);
  const artifacts = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, readJson(path, `${FIXTURE_ID} ${name}`)]));
  for (const [name, value] of Object.entries(artifacts)) assertAnswerNeutralPublicValue(value, name);

  const task = readFileSync(resolve(fixtureRoot, "task.md"), "utf8");
  if (FORBIDDEN_TASK_VOCABULARY.test(task)) throw new Error("fixture task contains benchmark-specific vocabulary");

  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"), "portfolio catalog");
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "portfolio policy manifest");
  const admissionPolicy = readJson(resolve(root, "benchmarks/portfolio-admission-policy.json"), "portfolio admission policy");
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "portfolio scoring policy");
  const config = readJson(resolve(root, "benchmarks/adaptive-portfolio.config.json"), "portfolio runtime config");
  const inputManifestPath = resolve(fixtureRoot, "input-manifest.json");
  const inputManifestBytes = readFileSync(inputManifestPath);
  const inputManifest = JSON.parse(inputManifestBytes);
  const fixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === FIXTURE_ID);
  const runtimeFixture = config.fixtures.find(({ id }) => id === FIXTURE_ID);
  if (!fixture || !runtimeFixture) throw new Error("fixture is missing from catalog or runtime config");
  assertEqual({
    suite: fixture.suite, task_class: fixture.task_class, domain: fixture.domain, difficulty: fixture.difficulty,
    repetitions: fixture.repetitions, risk_boundary: fixture.risk_boundary, capability_families: fixture.capability_families,
    evidence_topologies: fixture.evidence_topologies, outcome_dimensions: fixture.outcome_dimensions,
  }, {
    suite: "mechanism_negative", task_class: "configuration", domain: "ci_build", difficulty: "medium", repetitions: 3,
    risk_boundary: "none", capability_families: ["configuration_change", "focused_implementation"],
    evidence_topologies: ["ci_logs_and_config", "documentation_and_config"],
    outcome_dimensions: ["configuration_accuracy", "scope_discipline"],
  }, "catalog fixture metadata");
  assertEqual(runtimeFixture, {
    id: FIXTURE_ID, suite: "mechanism_negative", task_class: "configuration", difficulty: "medium", repetitions: 3,
    aggregate_eligible: true, input_manifest_path: `${FIXTURE_ROOT_RELATIVE}/input-manifest.json`,
    input_manifest_sha256: sha256(inputManifestBytes).slice("sha256:".length),
  }, "runtime fixture registration");

  const manifestFixture = inputManifest.fixtures?.[FIXTURE_ID];
  if (!manifestFixture || !manifestFixture.files.some(({ path }) => path === "task.md") || !manifestFixture.files.some(({ path }) => path.startsWith("workspace/"))) throw new Error("fixture input manifest is incomplete");
  const declaredPaths = new Set(manifestFixture.files.map(({ path }) => path));
  for (const record of manifestFixture.files) {
    const bytes = readFileSync(resolve(fixtureRoot, record.path));
    if (record.bytes !== bytes.length || record.sha256 !== sha256(bytes).slice("sha256:".length)) throw new Error(`input manifest drift: ${record.path}`);
  }

  const reference = verifyPublicEvaluatorReference({ root, referencePath: paths["evaluator-reference.json"] });
  assertDigest(reference.fixture_input_digest, sha256(inputManifestBytes), "fixture input binding");
  if (reference.fixture_id !== FIXTURE_ID || reference.task_class !== fixture.task_class || reference.suite !== fixture.suite) throw new Error("evaluator reference fixture identity mismatch");

  const requirementRecord = artifacts["requirement-record.json"];
  validateRequirementRecordContract({
    scoringPolicy,
    requirementRecord,
    requirementRecordSchema: readJson(resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json"), "requirement record Schema"),
    evaluatorResultSchema: readJson(resolve(root, "benchmarks/schemas/evaluator-result-envelope.schema.json"), "evaluator result Schema"),
  });
  const admission = artifacts["final-admission-record.json"];
  assertBenchmarkSchemaInstance(admission, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-final-admission-record.schema.json"), label: "fixture final admission record" });
  assertDigest(admission.admission_digest, computeFinalAdmissionRecordDigest(admission), "final admission record");
  if (requirementRecord.admission_record_digest !== admission.admission_digest) throw new Error("requirement/admission binding mismatch");
  if (admission.evaluator_bundle_id !== reference.evaluator_bundle_id || admission.evaluator_bundle_digest !== reference.evaluator_bundle_digest) throw new Error("admission/evaluator binding mismatch");

  const outputContract = artifacts["output-contract.json"];
  assertBenchmarkSchemaInstance(outputContract, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-output-contract.schema.json"), label: "fixture output contract" });
  assertDigest(outputContract.output_contract_digest, computeOutputContractDigest(outputContract), "output contract");
  if (outputContract.declares_findings !== false || outputContract.evaluator_public_reference_digest !== reference.public_metadata_digest) throw new Error("implementation output contract binding mismatch");

  const metadata = artifacts["metadata.json"];
  assertDigest(metadata.metadata_digest, canonicalDigest(withoutField(metadata, "metadata_digest")), "fixture metadata");
  if (metadata.output_contract_type !== "implementation_producing" || metadata.measured_execution_performed !== false) throw new Error("fixture metadata output or measurement state mismatch");

  const evidenceMap = artifacts["evidence-map.json"];
  const mapsById = new Map(evidenceMap.maps.map((entry) => [entry.evidence_map_id, entry]));
  for (const requirement of requirementRecord.requirements) {
    for (const evidenceMapId of requirement.evidence_map_ids) {
      const map = mapsById.get(evidenceMapId);
      if (!map || map.agent_visible_paths.some((path) => !declaredPaths.has(path))) throw new Error(`requirement evidence map is not agent-visible: ${evidenceMapId}`);
    }
    if (requirement.equivalence_class_ids.length === 0) throw new Error("requirement lacks equivalent-solution coverage");
  }

  const freeze = artifacts["scoring-input-freeze-manifest.json"];
  assertBenchmarkSchemaInstance(freeze, { schemaPath: resolve(root, "benchmarks/schemas/scoring-input-freeze-manifest.schema.json"), label: "fixture scoring input freeze" });
  assertDigest(freeze.manifest_digest, computeScoringInputFreezeManifestDigest(freeze), "scoring input freeze manifest");
  assertDigest(freeze.fixture_input_digest, reference.fixture_input_digest, "freeze fixture input");
  validateRawFreezeArtifact(root, freeze.catalog, catalog.catalog_digest, "catalog");
  validateRawFreezeArtifact(root, freeze.policy_manifest, policyManifest.manifest_digest, "policy manifest");
  validateRawFreezeArtifact(root, freeze.scoring_policy, scoringPolicy.policy_digest, "scoring policy");
  validateRawFreezeArtifact(root, freeze.admission_record, admission.admission_digest, "admission record");
  validateRawFreezeArtifact(root, freeze.output_contract, outputContract.output_contract_digest, "output contract");
  validateRawFreezeArtifact(root, freeze.evaluator_public_reference, reference.public_metadata_digest, "evaluator reference");
  assertDigest(freeze.requirement_record.raw_byte_digest, sha256(readFileSync(paths["requirement-record.json"])), "requirement record raw byte");
  assertDigest(freeze.requirement_record.record_digest, computeRequirementRecordDigest(requirementRecord), "requirement record semantic");
  assertDigest(freeze.requirement_record.set_digest, computeRequirementSetDigest(requirementRecord), "requirement set");

  const immutableArtifactDigests = Object.fromEntries([
    [requirementRecord.requirement_record_path, paths["requirement-record.json"]],
    [outputContract.output_contract_path, paths["output-contract.json"]],
    [outputContract.evaluator_public_reference_path, paths["evaluator-reference.json"]],
  ].map(([path, absolute]) => [path, sha256(readFileSync(absolute))]));
  const predicateEvidence = { requirement_record: requirementRecord, output_contract: outputContract };
  const selectorContext = buildSelectorContextArtifact({ admissionPolicy, scoringPolicy, policyManifest, catalog, fixtureId: FIXTURE_ID, predicateEvidence, artifactRoot: root, immutableArtifactDigests });
  const review = artifacts["admission-review.json"];
  assertDigest(review.review_package_digest, canonicalDigest(withoutField(review, "review_package_digest")), "admission review package");
  const reviewByGate = new Map(review.gates.map((entry) => [entry.gate_id, entry]));
  validateFairPaths(review, declaredPaths);
  if (reviewByGate.size !== admissionPolicy.admission_gates.length) throw new Error("admission review gate inventory is incomplete");
  for (const gate of admissionPolicy.admission_gates) {
    const record = reviewByGate.get(gate.gate_id);
    if (!record) throw new Error(`admission review is missing gate ${gate.gate_id}`);
    const matches = admissionGateSelectorMatches(gate, selectorContext);
    if ((matches ? "applicable" : "not_applicable") !== record.selector_result) throw new Error(`${gate.gate_id} selector was not re-derived from the implemented fixture`);
    validateAdmissionGateResult({ admissionPolicy, scoringPolicy, policyManifest, catalog, gateId: gate.gate_id, selectorContext, predicateEvidence, result: record.result, artifactRoot: root, immutableArtifactDigests });
  }
  assertEqual([...reviewByGate].filter(([, value]) => value.selector_result === "applicable").map(([key]) => key), REQUIRED_APPLICABLE_GATES, "applicable admission gates");
  assertEqual([...reviewByGate].filter(([, value]) => value.selector_result === "not_applicable").map(([key]) => key), REQUIRED_NON_APPLICABLE_GATES, "non-applicable admission gates");
  validatePendingIndependentReview(review, admission);

  return {
    fixtureId: FIXTURE_ID,
    evaluatorBundleId: reference.evaluator_bundle_id,
    evaluatorBundleDigest: reference.evaluator_bundle_digest,
    evaluatorByteCount: admission.evaluator_byte_count,
    inputDigest: reference.fixture_input_digest,
    requirementRecordId: requirementRecord.requirement_record_id,
    outputContractId: outputContract.output_contract_id,
    reviewStatus: review.reviewer_status,
    applicableGateCount: REQUIRED_APPLICABLE_GATES.length,
    nonApplicableGateCount: REQUIRED_NON_APPLICABLE_GATES.length,
    scoringReady: false,
  };
}

export function validateMnBuildOptionUpdatePrivateFixture(options) {
  const { root = ROOT, privateRoot } = options;
  assertPrivateRootOutsideRepository(root, privateRoot);
  const publicSummary = validateMnBuildOptionUpdatePublicFixture({ root });
  const bundle = verifyPrivateEvaluatorBundle({
    ...options,
    root,
    privateRoot,
    referencePath: resolve(root, FIXTURE_ROOT_RELATIVE, "evaluator-reference.json"),
    manifestPath: resolve(privateRoot, "private-evaluator-bundle.json"),
  });
  const requiredRoles = ["equivalent_solution_rules", "evidence_removal_mutations", "hidden_tests", "human_evaluation_instructions", "oracle", "rubric", "scope_boundaries"];
  assertEqual(bundle.manifest.asset_inventory.map(({ role }) => role), requiredRoles, "private evaluator role inventory");
  const requirementRecord = readJson(resolve(root, FIXTURE_ROOT_RELATIVE, "requirement-record.json"), "public requirement record");
  const admissionRecord = readJson(resolve(root, FIXTURE_ROOT_RELATIVE, "final-admission-record.json"), "public final admission record");
  const evidenceMapArtifact = readJson(resolve(root, FIXTURE_ROOT_RELATIVE, "evidence-map.json"), "public evidence map");
  const inputManifestRecord = readJson(resolve(root, FIXTURE_ROOT_RELATIVE, "input-manifest.json"), "public input manifest").fixtures[FIXTURE_ID];
  const mutationAsset = bundle.manifest.asset_inventory.find(({ role }) => role === "evidence_removal_mutations");
  const equivalenceAsset = bundle.manifest.asset_inventory.find(({ role }) => role === "equivalent_solution_rules");
  validateMutationAuthority({
    requirementRecord,
    admissionRecord,
    evidenceMapArtifact,
    inputManifestRecord,
    mutationAsset: readJson(resolve(privateRoot, mutationAsset.path), "private evidence-removal contract"),
  });
  validateEquivalenceAuthority({ requirementRecord, equivalenceAsset: readJson(resolve(privateRoot, equivalenceAsset.path), "private equivalent-solution contract") });
  if (bundle.manifest.evaluator_bundle_id !== publicSummary.evaluatorBundleId || bundle.manifest.evaluator_bundle_digest !== publicSummary.evaluatorBundleDigest) throw new Error("public/private evaluator identity mismatch");
  return publicSummary;
}

function parseArgs(argv) {
  const args = { root: ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--private-root") args.privateRoot = resolve(argv[++index]);
    else if (argv[index] === "--root") args.root = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const summary = args.privateRoot ? validateMnBuildOptionUpdatePrivateFixture(args) : validateMnBuildOptionUpdatePublicFixture(args);
  console.log(JSON.stringify({
    fixture_id: summary.fixtureId,
    evaluator_bundle_id: summary.evaluatorBundleId,
    evaluator_bundle_digest: summary.evaluatorBundleDigest,
    evaluator_byte_count: summary.evaluatorByteCount,
    review_status: summary.reviewStatus,
    public_validation: "pass",
    private_validation: args.privateRoot ? "pass" : "not_run",
    scoring_ready: summary.scoringReady,
  }));
}
