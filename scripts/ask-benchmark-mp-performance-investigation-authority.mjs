import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import {
  computeEvaluatorBundleDigest,
  computeEvaluatorBundleId,
  computeEvaluatorReferenceDigest,
  computeIndependenceStatementDigest,
  deriveEvaluatorAuthorityManifest,
  deriveEvaluatorDependencyGraph,
  evaluatorAuthorityPathsForFixture,
  validateEvaluatorAuthorityManifest,
  validateEvaluatorSourceIdentity,
  validateIndependenceStatement,
  verifyPrivateEvaluatorBundle,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import {
  BINARY_SCOPE_VERIFICATION_PROFILE_NAME,
  computeFinalAdmissionRecordDigest,
  computeFinalAdmissionRequirementAuthorityDigest,
  computeOutputContractDigest,
  computePolicyManifestDigest,
  computeRequirementDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeResultProfileDigest,
  computeScoringInputFreezeManifestDigest,
  computeScoringPolicyDigest,
  resolveRequirementAdmissionBindingDigest,
  validateFrozenFinalAdmissionRecordContract,
  validateRequirementRecordContract,
} from "./ask-benchmark-scoring-contract.mjs";
import { computePortfolioCatalogDigest } from "./ask-benchmark-portfolio-catalog.mjs";
import {
  admissionGateSelectorMatches,
  buildSelectorContextArtifact,
  validateAdmissionGateResult,
  validatePortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";
import {
  assertAnswerNeutralPublicValue,
  assertPrivateRootOutsideRepository,
  validateEquivalenceAuthority,
  validateFairPaths,
  validateMutationAuthority,
  validatePendingIndependentReview,
} from "./ask-benchmark-mn-build-option-update.mjs";
import { validateVerificationCommandContract } from "./ask-benchmark-command-evidence.mjs";
import {
  assertFlatRegularAuthorityDirectory,
  prepareAuthorityPublication,
  publishPreparedAuthority,
  writeAuthorityJsonNoFollow as writeJson,
} from "./ask-benchmark-authority-publication.mjs";
import {
  MP_PERFORMANCE_FIXTURE_ID,
  MP_PERFORMANCE_FIXTURE_ROOT,
  agentVisibleFiles,
  readJson,
  sha256,
  validateMpPerformanceInvestigationInputClosure,
} from "./ask-benchmark-mp-performance-investigation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_ASSETS = Object.freeze([
  ["equivalent_solution_rules", "equivalent-solutions.json", "application/json"],
  ["evaluator_dependency_graph", "dependency-graph.json", "application/json"],
  ["evidence_removal_mutations", "evidence-removal-mutations.json", "application/json"],
  ["false_positive_boundaries", "false-positive-boundaries.json", "application/json"],
  ["hidden_tests", "hidden-evaluator.mjs", "text/javascript"],
  ["human_evaluation_instructions", "human-instructions.md", "text/markdown"],
  ["independence_provenance", "independence.json", "application/json"],
  ["oracle", "oracle.json", "application/json"],
  ["rubric", "rubric.md", "text/markdown"],
  ["scope_boundaries", "scope-boundaries.json", "application/json"],
]);
const PUBLIC_ARTIFACTS = Object.freeze([
  "admission-review.json",
  "evaluator-authority-manifest.json",
  "evaluator-reference.json",
  "evidence-map.json",
  "final-admission-record.json",
  "input-manifest.json",
  "metadata.json",
  "output-contract.json",
  "requirement-record.json",
  "scoring-input-freeze-manifest.json",
  "source-freeze-candidate.json",
  "verification-command-contract.json",
]);
const GENERATED_PUBLIC = Object.freeze(PUBLIC_ARTIFACTS.filter((name) => !["input-manifest.json", "verification-command-contract.json"].includes(name)));
const GENERATED_PRIVATE = Object.freeze(["dependency-graph.json", "equivalent-solutions.json", "evidence-removal-mutations.json", "independence.json", "private-evaluator-bundle.json"]);

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function assertExact(actual, expected, label) {
  if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${label} differs from deterministic authority`);
}

function rawArtifact(root, path, semanticDigest) {
  return { path, raw_byte_digest: sha256(readFileSync(resolve(root, path))), semantic_digest: semanticDigest };
}

function candidateBinding(root, path, semanticDigest) {
  return { path, raw_sha256: sha256(readFileSync(resolve(root, path))), semantic_digest: semanticDigest };
}

function validateCandidateBinding(root, record, expectedPath, expectedSemanticDigest, label) {
  if (record?.path !== expectedPath || record.raw_sha256 !== sha256(readFileSync(resolve(root, expectedPath))) || record.semantic_digest !== expectedSemanticDigest) throw new Error(`${label} source-freeze binding is invalid`);
}

function validateRawBinding(root, record, expectedPath, expectedSemanticDigest, label) {
  if (record?.path !== expectedPath || record.raw_byte_digest !== sha256(readFileSync(resolve(root, expectedPath))) || record.semantic_digest !== expectedSemanticDigest) throw new Error(`${label} scoring-input freeze binding is invalid`);
}

export function buildMpPerformanceInvestigationAuthority() {
  const scopeBase = {
    allowed_candidate_paths: ["workspace/investigation.json"],
    required_candidate_paths: ["workspace/investigation.json"],
    protected_candidate_paths: [
      "workspace/docs/investigation-contract.md",
      "workspace/investigation.schema.json",
      "workspace/observability/cache-samples.csv",
      "workspace/observability/release-events.json",
      "workspace/observability/request-windows.csv",
      "workspace/observability/runtime-profile.json",
      "workspace/package-lock.json",
      "workspace/package.json",
      "workspace/scripts/replay-summary.mjs",
      "workspace/scripts/validate-investigation.mjs",
      "workspace/src/cache-key.mjs",
      "workspace/src/summary-replay.mjs",
      "workspace/src/summary-service.mjs",
      "workspace/test/integration/summary-replay.test.mjs",
      "workspace/test/unit/cache-key.test.mjs"
    ],
    unmanaged_additions: "forbidden",
    unmanaged_deletions: "forbidden",
  };
  const maps = [
    { evidence_map_id: "cache-key-causal-basis", agent_visible_paths: ["workspace/docs/investigation-contract.md", "workspace/observability/cache-samples.csv", "workspace/observability/release-events.json", "workspace/observability/request-windows.csv", "workspace/observability/runtime-profile.json", "workspace/src/cache-key.mjs", "workspace/src/summary-replay.mjs", "workspace/src/summary-service.mjs", "workspace/test/integration/summary-replay.test.mjs"] },
    { evidence_map_id: "competing-hypothesis-basis", agent_visible_paths: ["workspace/docs/investigation-contract.md", "workspace/observability/release-events.json", "workspace/observability/request-windows.csv", "workspace/observability/runtime-profile.json"] },
    { evidence_map_id: "causal-confidence-basis", agent_visible_paths: ["task.md", "workspace/docs/investigation-contract.md", "workspace/observability/cache-samples.csv", "workspace/observability/request-windows.csv", "workspace/observability/runtime-profile.json"] },
    { evidence_map_id: "bounded-next-check-basis", agent_visible_paths: ["task.md", "workspace/docs/investigation-contract.md", "workspace/observability/cache-samples.csv", "workspace/observability/request-windows.csv", "workspace/package.json", "workspace/scripts/replay-summary.mjs", "workspace/src/cache-key.mjs", "workspace/src/summary-replay.mjs", "workspace/test/integration/summary-replay.test.mjs"] },
    { evidence_map_id: "investigation-precision-basis", agent_visible_paths: ["task.md", "workspace/docs/investigation-contract.md", "workspace/investigation.schema.json", "workspace/observability/cache-samples.csv", "workspace/observability/release-events.json", "workspace/observability/request-windows.csv", "workspace/observability/runtime-profile.json", "workspace/package.json", "workspace/scripts/validate-investigation.mjs", "workspace/src/cache-key.mjs", "workspace/src/summary-replay.mjs", "workspace/src/summary-service.mjs", "workspace/test/integration/summary-replay.test.mjs", "workspace/test/unit/cache-key.test.mjs"] },
  ];
  const seeds = [
    ["remove-cache-key-causal-basis", "cache-key-causal-hypothesis", "cache-key-causal-basis", maps[0].agent_visible_paths],
    ["remove-competing-hypothesis-basis", "competing-hypothesis-falsification", "competing-hypothesis-basis", maps[1].agent_visible_paths],
    ["remove-causal-confidence-basis", "causal-confidence-calibration", "causal-confidence-basis", maps[2].agent_visible_paths],
    ["remove-bounded-next-check-basis", "bounded-next-check", "bounded-next-check-basis", maps[3].agent_visible_paths],
    ["remove-investigation-precision-basis", "evidence-and-scope-precision", "investigation-precision-basis", maps[4].agent_visible_paths],
  ];
  const mutations = seeds.map(([mutation_id, requirement_id, target_evidence_map_id, remove_paths]) => {
    const base = { mutation_id, requirement_id, target_evidence_map_id, remove_paths, expected_recoverability_state: "not_recoverable", expected_admission_result: "fail" };
    return { ...base, mutation_digest: canonicalDigest(base) };
  });
  const publicMutations = mutations.map(({ mutation_id, target_evidence_map_id, expected_recoverability_state, expected_admission_result, mutation_digest }) => ({ mutation_id, target_evidence_map_id, expected_recoverability_state, expected_admission_result, mutation_digest }));
  const evidenceMap = { schema_version: "1.0.0", fixture_id: MP_PERFORMANCE_FIXTURE_ID, scope_boundary_authority: { ...scopeBase, authority_digest: canonicalDigest(scopeBase) }, maps, mutation_contracts: publicMutations };
  const equivalenceSeeds = [
    ["equivalent-request-id-cache-fragmentation", "cache-key-causal-hypothesis", ["request_id_cache_key", "per_request_key", "cache_fragmentation", "cache_miss", "summary_rebuild", "latency_regression", "observable_behavior"]],
    ["equivalent-stable-traffic-db-falsification", "competing-hypothesis-falsification", ["stable_request_rate", "stable_db_latency", "stable_gc_pause", "traffic_hypothesis_weakened", "database_hypothesis_weakened", "observable_behavior"]],
    ["equivalent-supported-not-proven-assessment", "causal-confidence-calibration", ["association_not_causation", "supported_not_proven", "controlled_intervention_missing", "causal_restraint", "observable_behavior"]],
    ["equivalent-isolated-cache-key-replay", "bounded-next-check", ["local_replay", "stable_cache_identity", "remove_request_id", "compare_hit_rate", "compare_builds", "compare_latency", "stop_condition", "no_production_action", "observable_behavior"]],
    ["equivalent-evidence-bounded-investigation", "evidence-and-scope-precision", ["visible_evidence", "path_and_line", "closed_output", "no_source_change", "no_production_action", "unsupported_claim_absence", "observable_behavior"]],
  ];
  const rules = equivalenceSeeds.map(([equivalence_class_id, requirement_id, match_basis]) => {
    const base = { equivalence_class_id, requirement_id, match_basis, property_order_only: false };
    return { ...base, rule_digest: canonicalDigest(base) };
  });
  return { evidenceMap, mutationAsset: { fixture_id: MP_PERFORMANCE_FIXTURE_ID, mutations }, equivalenceAsset: { fixture_id: MP_PERFORMANCE_FIXTURE_ID, rules } };
}

function buildRequirementRecord({ catalog, policyManifest, scoringPolicy, admissionRequirementDigest }) {
  const seeds = [
    ["cache-key-causal-hypothesis", 4, "cache-key-causal-basis", "remove-cache-key-causal-basis", "equivalent-request-id-cache-fragmentation"],
    ["competing-hypothesis-falsification", 2, "competing-hypothesis-basis", "remove-competing-hypothesis-basis", "equivalent-stable-traffic-db-falsification"],
    ["causal-confidence-calibration", 1, "causal-confidence-basis", "remove-causal-confidence-basis", "equivalent-supported-not-proven-assessment"],
    ["bounded-next-check", 2, "bounded-next-check-basis", "remove-bounded-next-check-basis", "equivalent-isolated-cache-key-replay"],
    ["evidence-and-scope-precision", 1, "investigation-precision-basis", "remove-investigation-precision-basis", "equivalent-evidence-bounded-investigation"],
  ];
  const requirements = seeds.map(([requirement_id, max_points, evidenceMapId, mutationId, equivalenceId]) => {
    const base = { requirement_id, requirement_kind: "weighted", max_points, partial_credit_allowed: false, evidence_map_ids: [evidenceMapId], mutation_ids: [mutationId], equivalence_class_ids: [equivalenceId], finding_group_id: `${requirement_id}-outcome`, safety_dimension: "completion_correctness" };
    return { ...base, requirement_digest: computeRequirementDigest(base) };
  });
  const base = {
    requirement_record_id: `requirement-record-${MP_PERFORMANCE_FIXTURE_ID}`,
    requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
    requirement_record_path: `${MP_PERFORMANCE_FIXTURE_ROOT}/requirement-record.json`,
    fixture_id: MP_PERFORMANCE_FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: admissionRequirementDigest,
    requirements,
    requirement_set_digest: computeRequirementSetDigest(requirements),
  };
  return { ...base, requirement_record_digest: computeRequirementRecordDigest(base) };
}

function privateInventory(privateRoot) {
  return PRIVATE_ASSETS.map(([role, path, media_type]) => {
    const bytes = readFileSync(resolve(privateRoot, path));
    return { role, path, bytes: bytes.length, sha256: sha256(bytes), media_type, required: true };
  });
}

function writePrivateAuthority({ root, privateRoot, evaluatorRevision, generationDate, inputDigest }) {
  assertPrivateRootOutsideRepository(root, privateRoot);
  const canonicalPrivateRoot = realpathSync(privateRoot);
  const dependencyGraph = deriveEvaluatorDependencyGraph({ root, baseRevision: evaluatorRevision });
  const runnerBytes = readFileSync(resolve(root, "scripts/ask-benchmark-private-evaluator-runner.mjs"));
  const generator = { id: "mp-performance-investigation-private-authority", version: "1.0.0", source_digest: sha256(runnerBytes) };
  const sourceFiles = dependencyGraph.node_inventory.map(({ path, bytes, sha256: digest }) => ({ path, bytes, sha256: digest }));
  const sourceIdentity = { base_git_revision: evaluatorRevision, source_tree_digest: canonicalDigest(sourceFiles), generator_source_digest: generator.source_digest, source_files: sourceFiles, dependency_graph: dependencyGraph };
  validateEvaluatorSourceIdentity({ identity: sourceIdentity, root, expectedRevision: evaluatorRevision, expectedGeneratorSourceDigest: generator.source_digest, label: "mp-performance evaluator source identity" });
  const authority = buildMpPerformanceInvestigationAuthority();
  writeJson(resolve(canonicalPrivateRoot, "evidence-removal-mutations.json"), authority.mutationAsset);
  writeJson(resolve(canonicalPrivateRoot, "equivalent-solutions.json"), authority.equivalenceAsset);
  writeJson(resolve(canonicalPrivateRoot, "dependency-graph.json"), dependencyGraph);
  const contamination = { state: "not_used", evidence_basis: "Prohibited issue bodies, comments, histories, and legacy answers were not accessed or used." };
  const independenceBase = {
    schema_version: "1.1.0",
    fixture_id: MP_PERFORMANCE_FIXTURE_ID,
    generator_role_identity: generator,
    generation_date: generationDate,
    generation_revision: evaluatorRevision,
    evaluator_source_identity: sourceIdentity,
    frozen_candidate_input: { public_source_path: `${MP_PERFORMANCE_FIXTURE_ROOT}/input-manifest.json`, raw_byte_digest: inputDigest, digest: canonicalDigest(readJson(resolve(root, MP_PERFORMANCE_FIXTURE_ROOT, "input-manifest.json"), "mp-performance input manifest")) },
    source_classification: ["current_canonical_public_contracts", "frozen_agent_visible_fixture", "repository_production_contracts", "independently_created_engineering_scenario"],
    excluded_source_classification: ["historical_private_case_review_bytes_unavailable", "historical_private_case_review_bytes_not_reconstructed", "measured_agent_output", "measured_scoring_result", "prohibited_legacy_fixture_sources"],
    measured_output_used: false,
    measured_result_used: false,
    author_scratch: { used: true, scope: "private evaluator construction only", contamination_assessment: { state: "not_used", evidence_basis: "No measured output, score, or prohibited legacy answer was available to the generator." } },
    contaminated_issues_193_196_as_oracle_source: contamination,
    issue_194_body_used: contamination,
    issue_194_edit_history_used: contamination,
    issue_194_legacy_answer_structure_used: contamination,
  };
  const independence = { ...independenceBase, statement_digest: computeIndependenceStatementDigest(independenceBase) };
  writeJson(resolve(canonicalPrivateRoot, "independence.json"), independence);
  const manifestBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/private-evaluator-bundle.schema.json",
    program: "adaptive_ask_private_evaluator_bundle",
    execution_budget_ms: 120_000,
    fixture_identity: { fixture_id: MP_PERFORMANCE_FIXTURE_ID, task_class: "investigation", suite: "mechanism_positive" },
    input_identity: { fixture_input_digest: inputDigest },
    evaluator_revision: evaluatorRevision,
    evaluator_source_identity: sourceIdentity,
    generator,
    independence: { statement_digest: independence.statement_digest, generated_without_agent_output: true, public_answer_sources_used: false, measured_agent_access_allowed: false },
    review: { record_digest: canonicalDigest({ fixture_id: MP_PERFORMANCE_FIXTURE_ID, status: "pending_independent_review", evaluator_revision: evaluatorRevision }), status: "pending", reviewer_count: 1 },
    asset_inventory: privateInventory(canonicalPrivateRoot),
    capabilities: { automated_evaluation: true, manual_evaluation: true },
    boundaries: { private_evaluator_bundle: true, public_repository_allowed: false, public_ci_artifact_allowed: false, contains_answer_bearing_content: true },
    dependency_graph: dependencyGraph,
  };
  const withId = { ...manifestBase, evaluator_bundle_id: computeEvaluatorBundleId(manifestBase) };
  const manifest = { ...withId, evaluator_bundle_digest: computeEvaluatorBundleDigest(withId) };
  writeJson(resolve(canonicalPrivateRoot, "private-evaluator-bundle.json"), manifest);
  validateIndependenceStatement({ statement: independence, manifest, root });
  return manifest;
}

function admissionSeed({ catalog, inputDigest, bundle, requirementCount, evidenceMapIds, mutationIds }) {
  const base = {
    fixture_id: MP_PERFORMANCE_FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    input_manifest_digest: inputDigest,
    evaluator_reference_schema: "benchmarks/schemas/evaluator-reference.schema.json",
    evaluator_bundle_id: bundle.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.evaluator_bundle_digest,
    evaluator_byte_count: bundle.asset_inventory.reduce((total, asset) => total + asset.bytes, 0),
    evaluator_requirement_count: requirementCount,
    evidence_map_ids: evidenceMapIds,
    mutation_set_ids: mutationIds,
    reviewer_record_id: `review-${MP_PERFORMANCE_FIXTURE_ID}-pending`,
    admission_revision: 1,
    admission_status: "admission_pending",
    evaluator_source_identity: bundle.evaluator_source_identity,
  };
  return { ...base, requirement_authority_digest: computeFinalAdmissionRequirementAuthorityDigest(base) };
}

function buildAdmissionReview({ inputDigest, bundle, visiblePaths }) {
  const fair = { status: "pass", agent_visible_evidence: visiblePaths };
  const applicable = [
    "public_artifact_leakage", "private_evaluator_boundary", "requirement_recoverability", "plain_fair_path", "kernel_only_fair_path", "ordinary_engineering_task_wording", "ask_vocabulary_cue_absence", "evidence_removal_mutation", "equivalent_solution_coverage", "false_positive_boundary", "independent_review", "input_digest_freeze", "evaluator_digest_freeze",
  ];
  const gates = applicable.map((gate_id) => ({ gate_id, selector_result: "applicable", result: gate_id === "independent_review" ? "unknown" : "pass" }));
  gates.push({ gate_id: "suspicious_but_correct_control", selector_result: "not_applicable", result: "not_applicable" });
  gates.push({ gate_id: "unauthorized_attempt_observability", selector_result: "not_applicable", result: "not_applicable" });
  const base = { schema_version: "1.0.0", fixture_id: MP_PERFORMANCE_FIXTURE_ID, candidate_input_digest: inputDigest, candidate_evaluator_digest: bundle.evaluator_bundle_digest, reviewer_status: "pending_independent_review", author_self_approval: false, admission_status: "admission_pending", fair_paths: { plain: fair, kernel_only: fair }, gates };
  return { ...base, review_package_digest: canonicalDigest(base) };
}

function generateInPlace({ root, privateRoot, evaluatorRevision, generationDate }) {
  validateMpPerformanceInvestigationInputClosure({ root });
  if (!/^[a-f0-9]{40}$/u.test(evaluatorRevision ?? "")) throw new Error("mp-performance evaluator revision is invalid");
  const fixtureRoot = resolve(root, MP_PERFORMANCE_FIXTURE_ROOT);
  const inputPath = `${MP_PERFORMANCE_FIXTURE_ROOT}/input-manifest.json`;
  const input = readJson(resolve(root, inputPath), "mp-performance input manifest");
  const inputDigest = sha256(readFileSync(resolve(root, inputPath)));
  const verification = readJson(resolve(fixtureRoot, "verification-command-contract.json"), "mp-performance verification contract");
  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"), "portfolio catalog");
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "policy manifest");
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "scoring policy");
  if (catalog.catalog_digest !== computePortfolioCatalogDigest(catalog) || policyManifest.manifest_digest !== computePolicyManifestDigest(policyManifest) || scoringPolicy.policy_digest !== computeScoringPolicyDigest(scoringPolicy)) throw new Error("portfolio policy identity is not closed before mp-performance generation");
  const authority = buildMpPerformanceInvestigationAuthority();
  writeJson(resolve(fixtureRoot, "evidence-map.json"), authority.evidenceMap);
  const bundle = writePrivateAuthority({ root, privateRoot, evaluatorRevision, generationDate, inputDigest });
  const seed = admissionSeed({ catalog, inputDigest, bundle, requirementCount: 5, evidenceMapIds: authority.evidenceMap.maps.map(({ evidence_map_id }) => evidence_map_id), mutationIds: authority.mutationAsset.mutations.map(({ mutation_id }) => mutation_id) });
  const requirement = buildRequirementRecord({ catalog, policyManifest, scoringPolicy, admissionRequirementDigest: seed.requirement_authority_digest });
  writeJson(resolve(fixtureRoot, "requirement-record.json"), requirement);
  const layout = evaluatorAuthorityPathsForFixture(MP_PERFORMANCE_FIXTURE_ID);
  const buffers = new Map(layout.bindingPaths.map((path) => [path, readFileSync(resolve(root, path))]));
  const authorityManifest = deriveEvaluatorAuthorityManifest({ buffers, evaluatorRevision, fixtureId: MP_PERFORMANCE_FIXTURE_ID });
  writeJson(resolve(root, layout.manifestPath), authorityManifest);
  const authorityBinding = { evaluator_authority_manifest_path: layout.manifestPath, evaluator_authority_manifest_raw_sha256: sha256(readFileSync(resolve(root, layout.manifestPath))), evaluator_authority_manifest_digest: authorityManifest.manifest_digest };
  const referenceBase = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/evaluator-reference.schema.json", program: "adaptive_ask_evaluator_reference",
    evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_bundle_schema_version: bundle.schema_version,
    fixture_id: MP_PERFORMANCE_FIXTURE_ID, fixture_input_digest: inputDigest, task_class: "investigation", suite: "mechanism_positive", evaluator_revision: evaluatorRevision,
    evaluator_source_identity: bundle.evaluator_source_identity, generator_identity: canonicalDigest(bundle.generator), independence_statement_digest: bundle.independence.statement_digest, review_record_digest: bundle.review.record_digest,
    ...authorityBinding, storage_class: "private_evaluator",
  };
  const reference = { ...referenceBase, public_metadata_digest: computeEvaluatorReferenceDigest(referenceBase) };
  writeJson(resolve(fixtureRoot, "evaluator-reference.json"), reference);
  const outputBase = {
    output_contract_id: `output-contract-${MP_PERFORMANCE_FIXTURE_ID}`, output_contract_schema_path: "benchmarks/schemas/portfolio-output-contract.schema.json", output_contract_path: `${MP_PERFORMANCE_FIXTURE_ROOT}/output-contract.json`,
    fixture_id: MP_PERFORMANCE_FIXTURE_ID, catalog_digest: catalog.catalog_digest, policy_manifest_digest: policyManifest.manifest_digest,
    evaluator_public_reference_path: `${MP_PERFORMANCE_FIXTURE_ROOT}/evaluator-reference.json`, evaluator_public_reference_digest: reference.public_metadata_digest,
    verification_command_contract_path: `${MP_PERFORMANCE_FIXTURE_ROOT}/verification-command-contract.json`, verification_command_contract_digest: verification.contract_digest,
    scope_boundary_authority_path: `${MP_PERFORMANCE_FIXTURE_ROOT}/evidence-map.json`, scope_boundary_authority_digest: authority.evidenceMap.scope_boundary_authority.authority_digest,
    result_profile: { name: BINARY_SCOPE_VERIFICATION_PROFILE_NAME, digest: computeResultProfileDigest() }, declares_findings: true, ...authorityBinding,
  };
  const output = { ...outputBase, output_contract_digest: computeOutputContractDigest(outputBase) };
  writeJson(resolve(fixtureRoot, "output-contract.json"), output);
  const admissionBase = { ...seed, ...authorityBinding };
  const admission = { ...admissionBase, admission_digest: computeFinalAdmissionRecordDigest(admissionBase) };
  writeJson(resolve(fixtureRoot, "final-admission-record.json"), admission);
  const evidencePath = `${MP_PERFORMANCE_FIXTURE_ROOT}/evidence-map.json`;
  const requirementPath = `${MP_PERFORMANCE_FIXTURE_ROOT}/requirement-record.json`;
  const outputPath = `${MP_PERFORMANCE_FIXTURE_ROOT}/output-contract.json`;
  const admissionPath = `${MP_PERFORMANCE_FIXTURE_ROOT}/final-admission-record.json`;
  const referencePath = `${MP_PERFORMANCE_FIXTURE_ROOT}/evaluator-reference.json`;
  const verificationPath = `${MP_PERFORMANCE_FIXTURE_ROOT}/verification-command-contract.json`;
  const freezeBase = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json", program: "adaptive_ask_scoring_input_freeze", fixture_id: MP_PERFORMANCE_FIXTURE_ID, fixture_input_digest: inputDigest,
    catalog: rawArtifact(root, "benchmarks/portfolio-catalog.json", catalog.catalog_digest), policy_manifest: rawArtifact(root, "benchmarks/portfolio-policy-manifest.json", policyManifest.manifest_digest), scoring_policy: rawArtifact(root, "benchmarks/portfolio-scoring-policy.json", scoringPolicy.policy_digest),
    admission_record: rawArtifact(root, admissionPath, admission.admission_digest), requirement_record: { path: requirementPath, raw_byte_digest: sha256(readFileSync(resolve(root, requirementPath))), record_digest: requirement.requirement_record_digest, set_digest: requirement.requirement_set_digest },
    output_contract: rawArtifact(root, outputPath, output.output_contract_digest), evaluator_public_reference: rawArtifact(root, referencePath, reference.public_metadata_digest), verification_command_contract: rawArtifact(root, verificationPath, verification.contract_digest), evidence_map: rawArtifact(root, evidencePath, canonicalDigest(authority.evidenceMap)), evaluator_authority_manifest: rawArtifact(root, layout.manifestPath, authorityManifest.manifest_digest),
    result_profile: output.result_profile, freeze_revision: "issue-267-mp-performance-investigation-r1",
  };
  const freeze = { ...freezeBase, manifest_digest: computeScoringInputFreezeManifestDigest(freezeBase) };
  writeJson(resolve(fixtureRoot, "scoring-input-freeze-manifest.json"), freeze);
  const visiblePaths = input.fixtures[MP_PERFORMANCE_FIXTURE_ID].files.map(({ path }) => path);
  const review = buildAdmissionReview({ inputDigest, bundle, visiblePaths });
  writeJson(resolve(fixtureRoot, "admission-review.json"), review);
  const metadataBase = {
    schema_version: "1.0.0", fixture_id: MP_PERFORMANCE_FIXTURE_ID, fixture_role: "primary", suite: "mechanism_positive", task_class: "investigation", domain: "performance", difficulty: "hard", repetitions: 5, risk_boundary: "none",
    capability_families: ["hypothesis_testing", "performance_diagnosis"], evidence_topologies: ["observability_signals", "runtime_measurements"], outcome_dimensions: ["causal_confidence", "performance_stability"], output_contract_type: "findings_producing",
    requirement_record_id: requirement.requirement_record_id, output_contract_id: output.output_contract_id, evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_byte_count: admission.evaluator_byte_count, review_status: "pending_independent_review", measured_execution_performed: false,
  };
  const metadata = { ...metadataBase, metadata_digest: canonicalDigest(metadataBase) };
  writeJson(resolve(fixtureRoot, "metadata.json"), metadata);
  const candidateBase = {
    schema_version: "1.1.0", fixture_id: MP_PERFORMANCE_FIXTURE_ID, candidate_state: "source_freeze_candidate", reviewer_state: "pending", admission_state: "admission_pending", measured_execution: false, scoring_published: false,
    public_bindings: {
      input_manifest: candidateBinding(root, inputPath, canonicalDigest(input.fixtures[MP_PERFORMANCE_FIXTURE_ID])), evidence_map: candidateBinding(root, evidencePath, canonicalDigest(authority.evidenceMap)), requirement_record: candidateBinding(root, requirementPath, requirement.requirement_record_digest), output_contract: candidateBinding(root, outputPath, output.output_contract_digest), verification_command_contract: candidateBinding(root, verificationPath, verification.contract_digest), metadata: candidateBinding(root, `${MP_PERFORMANCE_FIXTURE_ROOT}/metadata.json`, metadata.metadata_digest), evaluator_public_reference: candidateBinding(root, referencePath, reference.public_metadata_digest), evaluator_authority_manifest: candidateBinding(root, layout.manifestPath, authorityManifest.manifest_digest), final_admission_record: candidateBinding(root, admissionPath, admission.admission_digest), scoring_input_freeze_manifest: candidateBinding(root, `${MP_PERFORMANCE_FIXTURE_ROOT}/scoring-input-freeze-manifest.json`, freeze.manifest_digest), admission_review: candidateBinding(root, `${MP_PERFORMANCE_FIXTURE_ROOT}/admission-review.json`, review.review_package_digest),
    },
    evaluator_private_binding: { evaluator_revision: evaluatorRevision, evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_byte_count: admission.evaluator_byte_count, source_tree_digest: bundle.evaluator_source_identity.source_tree_digest, dependency_graph_digest: bundle.dependency_graph.graph_digest },
  };
  const candidate = { ...candidateBase, candidate_digest: canonicalDigest(candidateBase) };
  writeJson(resolve(fixtureRoot, "source-freeze-candidate.json"), candidate);
  return validateMpPerformanceInvestigationProductionAuthority({ root });
}

function runGit(root, args, label) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

export function writeMpPerformanceInvestigationProductionAuthority({ root = ROOT, privateRoot, evaluatorRevision, generationDate, boundaryRoots }) {
  if (!privateRoot || !existsSync(privateRoot) || !lstatSync(privateRoot).isDirectory() || lstatSync(privateRoot).isSymbolicLink()) throw new Error("mp-performance writer requires an existing non-symlink private root");
  assertPrivateRootOutsideRepository(root, privateRoot);
  if (!/^[a-f0-9]{40}$/u.test(evaluatorRevision ?? "")) throw new Error("mp-performance evaluator revision is invalid");
  runGit(root, ["cat-file", "-e", `${evaluatorRevision}^{commit}`], "mp-performance evaluator revision lookup");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(generationDate ?? "")) throw new Error("mp-performance generation date must be YYYY-MM-DD");
  const requiredBoundaries = ["materializedPath", "selectionState", "runDir", "normalizedResultsPath"];
  if (!boundaryRoots || requiredBoundaries.some((key) => !boundaryRoots[key] || !existsSync(boundaryRoots[key]) || !lstatSync(boundaryRoots[key]).isDirectory())) throw new Error("mp-performance writer requires complete boundary roots");
  const repositoryRoot = realpathSync(root);
  const privateDirectory = realpathSync(privateRoot);
  assertFlatRegularAuthorityDirectory(privateDirectory, "mp-performance private root");
  const frozenBefore = agentVisibleFiles(resolve(repositoryRoot, MP_PERFORMANCE_FIXTURE_ROOT));
  const inputBefore = readFileSync(resolve(repositoryRoot, MP_PERFORMANCE_FIXTURE_ROOT, "input-manifest.json"));
  const verificationBefore = readFileSync(resolve(repositoryRoot, MP_PERFORMANCE_FIXTURE_ROOT, "verification-command-contract.json"));
  const staging = resolve(tmpdir(), `ask-mp-performance-authority-${randomUUID()}`);
  const stagedRepository = resolve(staging, "repository");
  const stagedPrivate = resolve(staging, "private");
  mkdirSync(staging, { recursive: false });
  let worktreeAdded = false;
  try {
    runGit(repositoryRoot, ["worktree", "add", "--detach", stagedRepository, evaluatorRevision], "mp-performance staging worktree creation");
    worktreeAdded = true;
    cpSync(privateDirectory, stagedPrivate, { recursive: true, force: false, errorOnExist: true });
    assertFlatRegularAuthorityDirectory(stagedPrivate, "mp-performance staged private root");
    generateInPlace({ root: stagedRepository, privateRoot: stagedPrivate, evaluatorRevision, generationDate });
    validateMpPerformanceInvestigationProductionAuthority({ root: stagedRepository, privateRoot: stagedPrivate, boundaryRoots });
    if (!inputBefore.equals(readFileSync(resolve(stagedRepository, MP_PERFORMANCE_FIXTURE_ROOT, "input-manifest.json"))) || !verificationBefore.equals(readFileSync(resolve(stagedRepository, MP_PERFORMANCE_FIXTURE_ROOT, "verification-command-contract.json"))) || stableCanonicalJson(frozenBefore) !== stableCanonicalJson(agentVisibleFiles(resolve(stagedRepository, MP_PERFORMANCE_FIXTURE_ROOT)))) throw new Error("mp-performance production generation changed frozen agent-visible inputs");
    const transaction = randomUUID();
    const publicTransaction = resolve(repositoryRoot, "benchmarks/fixtures/checkpoint-b2", `.mp-performance-authority-${transaction}`);
    const privateTransaction = resolve(dirname(privateDirectory), `.mp-performance-authority-${transaction}`);
    const publicPairs = GENERATED_PUBLIC.map((name) => ({ source: resolve(stagedRepository, MP_PERFORMANCE_FIXTURE_ROOT, name), target: resolve(repositoryRoot, MP_PERFORMANCE_FIXTURE_ROOT, name), transactionDirectory: publicTransaction, label: `mp-performance public ${name}` }));
    const privatePairs = GENERATED_PRIVATE.map((name) => ({ source: resolve(stagedPrivate, name), target: resolve(privateDirectory, name), transactionDirectory: privateTransaction, label: `mp-performance private ${name}` }));
    return publishPreparedAuthority(prepareAuthorityPublication([...publicPairs, ...privatePairs]), () => validateMpPerformanceInvestigationProductionAuthority({ root: repositoryRoot, privateRoot: privateDirectory, boundaryRoots }));
  } finally {
    if (worktreeAdded) {
      const removal = spawnSync("git", ["-C", repositoryRoot, "worktree", "remove", "--force", stagedRepository], { encoding: "utf8" });
      if (removal.status !== 0 && existsSync(stagedRepository)) rmSync(stagedRepository, { recursive: true, force: true });
    }
    rmSync(staging, { recursive: true, force: true });
  }
}

export function validateMpPerformanceInvestigationProductionAuthority({ root = ROOT, privateRoot = null, boundaryRoots = null } = {}) {
  const fixtureRoot = resolve(root, MP_PERFORMANCE_FIXTURE_ROOT);
  const artifacts = Object.fromEntries(PUBLIC_ARTIFACTS.map((name) => [name, readJson(resolve(fixtureRoot, name), `mp-performance ${name}`)]));
  for (const [name, value] of Object.entries(artifacts)) assertAnswerNeutralPublicValue(value, `mp-performance ${name}`);
  const input = artifacts["input-manifest.json"];
  const inputRecord = input.fixtures?.[MP_PERFORMANCE_FIXTURE_ID];
  if (!inputRecord || stableCanonicalJson(inputRecord.files) !== stableCanonicalJson(agentVisibleFiles(fixtureRoot))) throw new Error("mp-performance input closure is invalid");
  validateMpPerformanceInvestigationInputClosure({ root });
  const visiblePaths = new Set(inputRecord.files.map(({ path }) => path));
  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"), "portfolio catalog");
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "policy manifest");
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "scoring policy");
  validatePortfolioPolicyArtifacts({ root });
  const requirement = artifacts["requirement-record.json"];
  const output = artifacts["output-contract.json"];
  const admission = artifacts["final-admission-record.json"];
  const reference = artifacts["evaluator-reference.json"];
  const manifest = artifacts["evaluator-authority-manifest.json"];
  const freeze = artifacts["scoring-input-freeze-manifest.json"];
  const evidenceMap = artifacts["evidence-map.json"];
  const verification = validateVerificationCommandContract(artifacts["verification-command-contract.json"], { root });
  assertBenchmarkSchemaInstance(requirement, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json"), label: "mp-performance requirement record" });
  validateRequirementRecordContract({ scoringPolicy, requirementRecord: requirement, requirementRecordSchema: readJson(resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json"), "requirement schema"), evaluatorResultSchema: readJson(resolve(root, "benchmarks/schemas/evaluator-result-envelope.schema.json"), "result schema") });
  assertBenchmarkSchemaInstance(output, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-output-contract.schema.json"), label: "mp-performance output contract" });
  if (output.output_contract_digest !== computeOutputContractDigest(output) || output.declares_findings !== true) throw new Error("mp-performance findings output contract is invalid");
  assertBenchmarkSchemaInstance(admission, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-final-admission-record.schema.json"), label: "mp-performance admission record" });
  validateFrozenFinalAdmissionRecordContract({ admissionPolicy: readJson(resolve(root, "benchmarks/portfolio-admission-policy.json"), "admission policy"), admissionRecord: admission, finalAdmissionRecordSchema: readJson(resolve(root, "benchmarks/schemas/portfolio-final-admission-record.schema.json"), "admission schema") });
  if (admission.admission_status !== "admission_pending" || requirement.admission_record_digest !== resolveRequirementAdmissionBindingDigest(admission)) throw new Error("mp-performance pending admission binding is invalid");
  assertBenchmarkSchemaInstance(reference, { schemaPath: resolve(root, "benchmarks/schemas/evaluator-reference.schema.json"), label: "mp-performance evaluator reference" });
  if (reference.public_metadata_digest !== computeEvaluatorReferenceDigest(reference)) throw new Error("mp-performance evaluator reference digest is invalid");
  validateEvaluatorSourceIdentity({ identity: reference.evaluator_source_identity, root, expectedRevision: reference.evaluator_revision, expectedGeneratorSourceDigest: reference.evaluator_source_identity.generator_source_digest, label: "mp-performance source identity" });
  const layout = evaluatorAuthorityPathsForFixture(MP_PERFORMANCE_FIXTURE_ID);
  const buffers = new Map(layout.bindingPaths.map((path) => [path, readFileSync(resolve(root, path))]));
  validateEvaluatorAuthorityManifest({ manifest, buffers, evaluatorRevision: reference.evaluator_revision, root, label: "mp-performance evaluator authority manifest" });
  const manifestRaw = sha256(readFileSync(resolve(root, layout.manifestPath)));
  for (const artifact of [reference, output, admission]) if (artifact.evaluator_authority_manifest_path !== layout.manifestPath || artifact.evaluator_authority_manifest_raw_sha256 !== manifestRaw || artifact.evaluator_authority_manifest_digest !== manifest.manifest_digest) throw new Error("mp-performance evaluator authority binding is transplanted");
  assertBenchmarkSchemaInstance(freeze, { schemaPath: resolve(root, "benchmarks/schemas/scoring-input-freeze-manifest.schema.json"), label: "mp-performance scoring-input freeze" });
  if (freeze.manifest_digest !== computeScoringInputFreezeManifestDigest(freeze)) throw new Error("mp-performance scoring-input freeze digest is invalid");
  const authority = buildMpPerformanceInvestigationAuthority();
  assertExact(evidenceMap, authority.evidenceMap, "mp-performance evidence map");
  for (const map of evidenceMap.maps) if (map.agent_visible_paths.some((path) => !visiblePaths.has(path))) throw new Error(`mp-performance evidence map references non-visible path: ${map.evidence_map_id}`);
  if (output.evaluator_public_reference_digest !== reference.public_metadata_digest || output.verification_command_contract_digest !== verification.contract_digest || output.scope_boundary_authority_digest !== evidenceMap.scope_boundary_authority.authority_digest) throw new Error("mp-performance output authority binding is invalid");
  if (admission.evaluator_bundle_id !== reference.evaluator_bundle_id || admission.evaluator_bundle_digest !== reference.evaluator_bundle_digest) throw new Error("mp-performance public evaluator bundle binding is invalid");
  const metadata = artifacts["metadata.json"];
  if (metadata.metadata_digest !== canonicalDigest(withoutField(metadata, "metadata_digest")) || metadata.output_contract_type !== "findings_producing" || metadata.measured_execution_performed !== false) throw new Error("mp-performance metadata is invalid");
  const review = artifacts["admission-review.json"];
  if (review.review_package_digest !== canonicalDigest(withoutField(review, "review_package_digest")) || review.reviewer_status !== "pending_independent_review" || review.author_self_approval !== false || review.admission_status !== "admission_pending") throw new Error("mp-performance pending review authority is invalid");
  validateFairPaths(review, visiblePaths);
  const admissionPolicy = readJson(resolve(root, "benchmarks/portfolio-admission-policy.json"), "admission policy");
  const immutableArtifactDigests = { [requirement.requirement_record_path]: sha256(readFileSync(resolve(root, requirement.requirement_record_path))), [output.output_contract_path]: sha256(readFileSync(resolve(root, output.output_contract_path))), [output.evaluator_public_reference_path]: sha256(readFileSync(resolve(root, output.evaluator_public_reference_path))) };
  const predicateEvidence = { requirement_record: requirement, output_contract: output };
  const selector = buildSelectorContextArtifact({ admissionPolicy, scoringPolicy, policyManifest, catalog, fixtureId: MP_PERFORMANCE_FIXTURE_ID, predicateEvidence, artifactRoot: root, immutableArtifactDigests });
  const byGate = new Map(review.gates.map((entry) => [entry.gate_id, entry]));
  if (byGate.size !== admissionPolicy.admission_gates.length) throw new Error("mp-performance admission review gate inventory is incomplete");
  for (const gate of admissionPolicy.admission_gates) {
    const record = byGate.get(gate.gate_id);
    const matches = admissionGateSelectorMatches(gate, selector);
    if (!record || record.selector_result !== (matches ? "applicable" : "not_applicable")) throw new Error(`mp-performance admission gate selector drift: ${gate.gate_id}`);
    validateAdmissionGateResult({ admissionPolicy, scoringPolicy, policyManifest, catalog, gateId: gate.gate_id, selectorContext: selector, predicateEvidence, result: record.result, artifactRoot: root, immutableArtifactDigests });
  }
  validatePendingIndependentReview(review, admission);
  const candidate = artifacts["source-freeze-candidate.json"];
  if (candidate.candidate_digest !== canonicalDigest(withoutField(candidate, "candidate_digest")) || candidate.admission_state !== "admission_pending" || candidate.measured_execution !== false || candidate.scoring_published !== false) throw new Error("mp-performance source-freeze candidate state is invalid");
  validateRawBinding(root, freeze.catalog, "benchmarks/portfolio-catalog.json", catalog.catalog_digest, "mp-performance catalog");
  validateRawBinding(root, freeze.policy_manifest, "benchmarks/portfolio-policy-manifest.json", policyManifest.manifest_digest, "mp-performance policy manifest");
  validateRawBinding(root, freeze.scoring_policy, "benchmarks/portfolio-scoring-policy.json", scoringPolicy.policy_digest, "mp-performance scoring policy");
  validateRawBinding(root, freeze.admission_record, `${MP_PERFORMANCE_FIXTURE_ROOT}/final-admission-record.json`, admission.admission_digest, "mp-performance admission record");
  validateRawBinding(root, freeze.output_contract, output.output_contract_path, output.output_contract_digest, "mp-performance output contract");
  validateRawBinding(root, freeze.evaluator_public_reference, output.evaluator_public_reference_path, reference.public_metadata_digest, "mp-performance evaluator reference");
  validateRawBinding(root, freeze.verification_command_contract, output.verification_command_contract_path, verification.contract_digest, "mp-performance verification contract");
  validateRawBinding(root, freeze.evidence_map, `${MP_PERFORMANCE_FIXTURE_ROOT}/evidence-map.json`, canonicalDigest(evidenceMap), "mp-performance evidence map");
  validateRawBinding(root, freeze.evaluator_authority_manifest, layout.manifestPath, manifest.manifest_digest, "mp-performance evaluator authority manifest");
  if (freeze.requirement_record.path !== requirement.requirement_record_path || freeze.requirement_record.raw_byte_digest !== sha256(readFileSync(resolve(root, requirement.requirement_record_path))) || freeze.requirement_record.record_digest !== requirement.requirement_record_digest || freeze.requirement_record.set_digest !== requirement.requirement_set_digest) throw new Error("mp-performance requirement scoring-input freeze binding is invalid");
  const candidateBindings = [
    ["input_manifest", `${MP_PERFORMANCE_FIXTURE_ROOT}/input-manifest.json`, canonicalDigest(inputRecord)],
    ["evidence_map", `${MP_PERFORMANCE_FIXTURE_ROOT}/evidence-map.json`, canonicalDigest(evidenceMap)],
    ["requirement_record", requirement.requirement_record_path, requirement.requirement_record_digest],
    ["output_contract", output.output_contract_path, output.output_contract_digest],
    ["verification_command_contract", output.verification_command_contract_path, verification.contract_digest],
    ["metadata", `${MP_PERFORMANCE_FIXTURE_ROOT}/metadata.json`, metadata.metadata_digest],
    ["evaluator_public_reference", output.evaluator_public_reference_path, reference.public_metadata_digest],
    ["evaluator_authority_manifest", layout.manifestPath, manifest.manifest_digest],
    ["final_admission_record", `${MP_PERFORMANCE_FIXTURE_ROOT}/final-admission-record.json`, admission.admission_digest],
    ["scoring_input_freeze_manifest", `${MP_PERFORMANCE_FIXTURE_ROOT}/scoring-input-freeze-manifest.json`, freeze.manifest_digest],
    ["admission_review", `${MP_PERFORMANCE_FIXTURE_ROOT}/admission-review.json`, review.review_package_digest],
  ];
  for (const [key, path, semanticDigest] of candidateBindings) validateCandidateBinding(root, candidate.public_bindings?.[key], path, semanticDigest, `mp-performance ${key}`);
  if (candidate.evaluator_private_binding.evaluator_revision !== reference.evaluator_revision || candidate.evaluator_private_binding.evaluator_bundle_id !== reference.evaluator_bundle_id || candidate.evaluator_private_binding.evaluator_bundle_digest !== reference.evaluator_bundle_digest || candidate.evaluator_private_binding.source_tree_digest !== reference.evaluator_source_identity.source_tree_digest || candidate.evaluator_private_binding.dependency_graph_digest !== reference.evaluator_source_identity.dependency_graph.graph_digest) throw new Error("mp-performance private source-freeze binding is invalid");
  const config = readJson(resolve(root, "benchmarks/adaptive-portfolio.config.json"), "adaptive portfolio config");
  const runtime = config.fixtures.find(({ id }) => id === MP_PERFORMANCE_FIXTURE_ID);
  const expectedRuntime = { id: MP_PERFORMANCE_FIXTURE_ID, suite: "mechanism_positive", task_class: "investigation", difficulty: "hard", repetitions: 5, aggregate_eligible: true, input_manifest_path: `${MP_PERFORMANCE_FIXTURE_ROOT}/input-manifest.json`, input_manifest_sha256: sha256(readFileSync(resolve(fixtureRoot, "input-manifest.json"))).slice(7), verification_command_contract: { path: `${MP_PERFORMANCE_FIXTURE_ROOT}/verification-command-contract.json`, sha256: sha256(readFileSync(resolve(fixtureRoot, "verification-command-contract.json"))).slice(7) } };
  assertExact(runtime, expectedRuntime, "mp-performance runtime registration");
  if (privateRoot) {
    if (!boundaryRoots) throw new Error("mp-performance private validation requires boundary roots");
    const bundle = verifyPrivateEvaluatorBundle({ root, referencePath: resolve(fixtureRoot, "evaluator-reference.json"), privateRoot, manifestPath: resolve(privateRoot, "private-evaluator-bundle.json"), ...boundaryRoots });
    validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: readJson(resolve(privateRoot, "evidence-removal-mutations.json"), "mp-performance mutation authority") });
    validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: readJson(resolve(privateRoot, "equivalent-solutions.json"), "mp-performance equivalence authority") });
    assertExact(readJson(resolve(privateRoot, "evidence-removal-mutations.json"), "mp-performance mutation authority"), authority.mutationAsset, "mp-performance private mutations");
    assertExact(readJson(resolve(privateRoot, "equivalent-solutions.json"), "mp-performance equivalence authority"), authority.equivalenceAsset, "mp-performance private equivalence");
    if (bundle.manifest.evaluator_bundle_id !== reference.evaluator_bundle_id || bundle.manifest.evaluator_bundle_digest !== reference.evaluator_bundle_digest) throw new Error("mp-performance public/private evaluator transplant");
  }
  return { fixtureId: MP_PERFORMANCE_FIXTURE_ID, inputDigest: reference.fixture_input_digest, candidateDigest: candidate.candidate_digest, requirementRecordDigest: requirement.requirement_record_digest, requirementSetDigest: requirement.requirement_set_digest, outputContractDigest: output.output_contract_digest, evaluatorBundleId: reference.evaluator_bundle_id, evaluatorBundleDigest: reference.evaluator_bundle_digest, evaluatorRevision: reference.evaluator_revision, evaluatorAuthorityDigest: manifest.manifest_digest, admissionState: admission.admission_status, reviewStatus: review.reviewer_status, scoringReady: false };
}

function parseProductionArgs(argv) {
  const args = { root: ROOT, boundaryRoots: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "write-production") continue;
    if (name === "--root") args.root = resolve(argv[++index]);
    else if (name === "--private-root") args.privateRoot = resolve(argv[++index]);
    else if (name === "--evaluator-revision") args.evaluatorRevision = argv[++index];
    else if (name === "--generation-date") args.generationDate = argv[++index];
    else if (name === "--materialized") args.boundaryRoots.materializedPath = resolve(argv[++index]);
    else if (name === "--selection-state") args.boundaryRoots.selectionState = resolve(argv[++index]);
    else if (name === "--run-dir") args.boundaryRoots.runDir = resolve(argv[++index]);
    else if (name === "--normalized-results") args.boundaryRoots.normalizedResultsPath = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${name}`);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const args = parseProductionArgs(argv);
  console.log(JSON.stringify(argv.includes("write-production") ? writeMpPerformanceInvestigationProductionAuthority(args) : validateMpPerformanceInvestigationProductionAuthority(args)));
}
