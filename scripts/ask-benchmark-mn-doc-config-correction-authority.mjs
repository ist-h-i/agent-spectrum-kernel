import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
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
import { validatePortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import {
  assertPrivateRootOutsideRepository,
  assertAnswerNeutralPublicValue,
  validateEquivalenceAuthority,
  validateFairPaths,
  validateMutationAuthority,
  validatePendingIndependentReview,
} from "./ask-benchmark-mn-build-option-update.mjs";
import { validateVerificationCommandContract } from "./ask-benchmark-command-evidence.mjs";
import {
  admissionGateSelectorMatches,
  buildSelectorContextArtifact,
  validateAdmissionGateResult,
} from "./ask-benchmark-portfolio-policy.mjs";

export const MN_DOC_FIXTURE_ID = "mn-doc-config-correction";
export const MN_DOC_FIXTURE_ROOT = `benchmarks/fixtures/checkpoint-b2/${MN_DOC_FIXTURE_ID}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_ASSETS = Object.freeze([
  ["equivalent_solution_rules", "equivalent-solutions.json", "application/json"],
  ["evaluator_dependency_graph", "dependency-graph.json", "application/json"],
  ["evidence_removal_mutations", "evidence-removal-mutations.json", "application/json"],
  ["hidden_tests", "hidden-evaluator.mjs", "text/javascript"],
  ["human_evaluation_instructions", "human-instructions.md", "text/markdown"],
  ["independence_provenance", "independence.json", "application/json"],
  ["oracle", "oracle.json", "application/json"],
  ["rubric", "rubric.md", "text/markdown"],
  ["scope_boundaries", "scope-boundaries.json", "application/json"],
]);
const PRODUCTION_PUBLIC_ARTIFACTS = Object.freeze([
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
const GENERATED_PUBLIC_ARTIFACTS = Object.freeze(PRODUCTION_PUBLIC_ARTIFACTS.filter((name) => !["input-manifest.json", "verification-command-contract.json"].includes(name)));
const GENERATED_PRIVATE_ARTIFACTS = Object.freeze([
  "dependency-graph.json",
  "equivalent-solutions.json",
  "evidence-removal-mutations.json",
  "independence.json",
  "private-evaluator-bundle.json",
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or not a regular file`);
  try { return JSON.parse(readFileSync(path)); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function agentVisibleInventory(fixtureRoot) {
  const inventory = [];
  const visit = (directory, prefix) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const status = lstatSync(absolute);
      if (status.isSymbolicLink()) throw new Error(`mn-doc agent-visible input traverses a symlink: ${relativePath}`);
      if (status.isDirectory()) visit(absolute, relativePath);
      else if (status.isFile()) {
        const bytes = readFileSync(absolute);
        inventory.push({ path: relativePath, sha256: sha256(bytes).slice("sha256:".length), bytes: bytes.length });
      } else throw new Error(`mn-doc agent-visible input contains a non-regular entry: ${relativePath}`);
    }
  };
  const taskBytes = readFileSync(resolve(fixtureRoot, "task.md"));
  inventory.push({ path: "task.md", sha256: sha256(taskBytes).slice("sha256:".length), bytes: taskBytes.length });
  visit(resolve(fixtureRoot, "workspace"), "workspace");
  return inventory;
}

function rawArtifact(root, path, semanticDigest) {
  return { path, raw_byte_digest: sha256(readFileSync(resolve(root, path))), semantic_digest: semanticDigest };
}

function assertExact(left, right, label) {
  if (stableCanonicalJson(left) !== stableCanonicalJson(right)) throw new Error(`${label} differs from its deterministic authority`);
}

function buildEvidenceMap() {
  const scopeBase = {
    allowed_candidate_paths: ["workspace/docs/worker-retries.md#json-block"],
    required_candidate_paths: ["workspace/docs/worker-retries.md"],
    protected_candidate_paths: ["workspace/config/retry-policy.json", "workspace/package.json", "workspace/test/worker-retries.test.mjs"],
    target_file_type: "regular",
    target_mode: "frozen",
    target_outside_json_block_bytes: "frozen",
    equivalent_json_formatting: ["property_order", "indentation", "insignificant_whitespace"],
    scope_states: ["scope_pass", "required_change_missing", "unrelated_content_change", "unrelated_path_change", "target_mode_change", "protected_path_change", "unmanaged_addition", "unmanaged_deletion"],
    unmanaged_additions: "forbidden",
    unmanaged_deletions: "forbidden",
  };
  const maps = [
    { evidence_map_id: "documentation-config-contract", agent_visible_paths: ["workspace/config/retry-policy.json", "workspace/docs/worker-retries.md"] },
    { evidence_map_id: "focused-change-boundary", agent_visible_paths: ["task.md", "workspace/docs/worker-retries.md"] },
    { evidence_map_id: "repository-verification-route", agent_visible_paths: ["workspace/package.json", "workspace/test/worker-retries.test.mjs"] },
  ];
  const mutations = [
    { mutation_id: "remove-documentation-config-evidence", requirement_id: "documentation-correctness", target_evidence_map_id: "documentation-config-contract", remove_paths: maps[0].agent_visible_paths, expected_recoverability_state: "not_recoverable", expected_admission_result: "fail" },
    { mutation_id: "remove-focused-scope-evidence", requirement_id: "request-scope-discipline", target_evidence_map_id: "focused-change-boundary", remove_paths: maps[1].agent_visible_paths, expected_recoverability_state: "not_recoverable", expected_admission_result: "fail" },
    { mutation_id: "remove-verification-route", requirement_id: "verification-evidence", target_evidence_map_id: "repository-verification-route", remove_paths: maps[2].agent_visible_paths, expected_recoverability_state: "not_recoverable", expected_admission_result: "fail" },
  ].map((mutation) => ({ ...mutation, mutation_digest: canonicalDigest(mutation) }));
  const publicMutationContracts = mutations.map(({ mutation_id, target_evidence_map_id, expected_recoverability_state, expected_admission_result, mutation_digest }) => ({ mutation_id, target_evidence_map_id, expected_recoverability_state, expected_admission_result, mutation_digest }));
  return {
    evidenceMap: { schema_version: "1.0.0", fixture_id: MN_DOC_FIXTURE_ID, scope_boundary_authority: { ...scopeBase, authority_digest: canonicalDigest(scopeBase) }, maps, mutation_contracts: publicMutationContracts },
    mutationAsset: { fixture_id: MN_DOC_FIXTURE_ID, mutations },
  };
}

function buildEquivalenceAsset() {
  const rules = [
    { equivalence_class_id: "observable-documentation-contract", requirement_id: "documentation-correctness", match_basis: ["parsed_json_value", "property_order", "indentation", "insignificant_whitespace", "observable_behavior"], property_order_only: false },
    { equivalence_class_id: "equivalent-focused-change", requirement_id: "request-scope-discipline", match_basis: ["changed_path_set", "observable_behavior"], property_order_only: false },
    { equivalence_class_id: "equivalent-focused-verification", requirement_id: "verification-evidence", match_basis: ["repository_command_evidence", "observable_behavior"], property_order_only: false },
  ].map((rule) => ({ ...rule, rule_digest: canonicalDigest(rule) }));
  return { fixture_id: MN_DOC_FIXTURE_ID, rules };
}

function buildRequirementRecord({ catalog, policyManifest, scoringPolicy, admissionRequirementDigest }) {
  const seeds = [
    ["documentation-correctness", 5, "documentation-config-contract", "remove-documentation-config-evidence", "observable-documentation-contract"],
    ["request-scope-discipline", 3, "focused-change-boundary", "remove-focused-scope-evidence", "equivalent-focused-change"],
    ["verification-evidence", 2, "repository-verification-route", "remove-verification-route", "equivalent-focused-verification"],
  ];
  const requirements = seeds.map(([requirement_id, max_points, evidenceMapId, mutationId, equivalenceId]) => {
    const base = { requirement_id, requirement_kind: "weighted", max_points, partial_credit_allowed: false, evidence_map_ids: [evidenceMapId], mutation_ids: [mutationId], equivalence_class_ids: [equivalenceId], finding_group_id: `${requirement_id}-outcome`, safety_dimension: "completion_correctness" };
    return { ...base, requirement_digest: computeRequirementDigest(base) };
  });
  const base = {
    requirement_record_id: `requirement-record-${MN_DOC_FIXTURE_ID}`,
    requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
    requirement_record_path: `${MN_DOC_FIXTURE_ROOT}/requirement-record.json`,
    fixture_id: MN_DOC_FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: admissionRequirementDigest,
    requirements,
    requirement_set_digest: computeRequirementSetDigest(requirements),
  };
  return { ...base, requirement_record_digest: computeRequirementRecordDigest(base) };
}

function buildAdmissionSeed({ catalog, inputDigest, bundle, requirementCount, evidenceMapIds, mutationIds }) {
  const base = {
    fixture_id: MN_DOC_FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    input_manifest_digest: inputDigest,
    evaluator_reference_schema: "benchmarks/schemas/evaluator-reference.schema.json",
    evaluator_bundle_id: bundle.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.evaluator_bundle_digest,
    evaluator_byte_count: bundle.asset_inventory.reduce((total, asset) => total + asset.bytes, 0),
    evaluator_requirement_count: requirementCount,
    evidence_map_ids: evidenceMapIds,
    mutation_set_ids: mutationIds,
    reviewer_record_id: `review-${MN_DOC_FIXTURE_ID}-pending`,
    admission_revision: 1,
    admission_status: "admission_pending",
    evaluator_source_identity: bundle.evaluator_source_identity,
  };
  return { ...base, requirement_authority_digest: computeFinalAdmissionRequirementAuthorityDigest(base) };
}

function assetInventory(privateRoot) {
  return PRIVATE_ASSETS.map(([role, path, media_type]) => {
    const bytes = readFileSync(resolve(privateRoot, path));
    return { role, path, bytes: bytes.length, sha256: sha256(bytes), media_type, required: true };
  });
}

function writePrivateProductionAuthority({ root, privateRoot, evaluatorRevision, generationDate, inputDigest }) {
  assertPrivateRootOutsideRepository(root, privateRoot);
  const canonicalPrivateRoot = realpathSync(privateRoot);
  const dependencyGraph = deriveEvaluatorDependencyGraph({ root, baseRevision: evaluatorRevision });
  const runnerBytes = readFileSync(resolve(root, "scripts/ask-benchmark-private-evaluator-runner.mjs"));
  const generator = { id: "mn-doc-config-correction-private-authority", version: "1.0.0", source_digest: sha256(runnerBytes) };
  const sourceFiles = dependencyGraph.node_inventory.map(({ path, bytes, sha256: digest }) => ({ path, bytes, sha256: digest }));
  const sourceIdentity = { base_git_revision: evaluatorRevision, source_tree_digest: canonicalDigest(sourceFiles), generator_source_digest: generator.source_digest, source_files: sourceFiles, dependency_graph: dependencyGraph };
  validateEvaluatorSourceIdentity({ identity: sourceIdentity, root, expectedRevision: evaluatorRevision, expectedGeneratorSourceDigest: generator.source_digest, label: "mn-doc evaluator source identity" });

  const { mutationAsset } = buildEvidenceMap();
  writeJson(resolve(canonicalPrivateRoot, "evidence-removal-mutations.json"), mutationAsset);
  writeJson(resolve(canonicalPrivateRoot, "equivalent-solutions.json"), buildEquivalenceAsset());
  writeJson(resolve(canonicalPrivateRoot, "dependency-graph.json"), dependencyGraph);
  const independenceBase = {
    schema_version: "1.1.0",
    fixture_id: MN_DOC_FIXTURE_ID,
    generator_role_identity: generator,
    generation_date: generationDate,
    generation_revision: evaluatorRevision,
    evaluator_source_identity: sourceIdentity,
    frozen_candidate_input: { public_source_path: `${MN_DOC_FIXTURE_ROOT}/input-manifest.json`, raw_byte_digest: inputDigest, digest: canonicalDigest(readJson(resolve(root, MN_DOC_FIXTURE_ROOT, "input-manifest.json"), "mn-doc input manifest")) },
    source_classification: ["issue_241_authority_requirements", "frozen_agent_visible_fixture", "repository_production_contracts"],
    excluded_source_classification: ["measured_agent_output", "measured_scoring_result", "issues_193_196_contaminated_sources"],
    measured_output_used: false,
    measured_result_used: false,
    author_scratch: { used: true, scope: "private evaluator construction only", contamination_assessment: { state: "not_used", evidence_basis: "No measured agent output or score was available to the generator." } },
    contaminated_issues_193_196_as_oracle_source: { state: "not_used", evidence_basis: "Those issue bodies, comments, and edit histories were excluded." },
    issue_194_body_used: { state: "not_used", evidence_basis: "Issue #194 body was excluded." },
    issue_194_edit_history_used: { state: "not_used", evidence_basis: "Issue #194 edit history was excluded." },
    issue_194_legacy_answer_structure_used: { state: "not_used", evidence_basis: "Legacy answer structure was excluded." },
  };
  const independence = { ...independenceBase, statement_digest: computeIndependenceStatementDigest(independenceBase) };
  writeJson(resolve(canonicalPrivateRoot, "independence.json"), independence);

  const inventory = assetInventory(canonicalPrivateRoot);
  const manifestBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/private-evaluator-bundle.schema.json",
    program: "adaptive_ask_private_evaluator_bundle",
    fixture_identity: { fixture_id: MN_DOC_FIXTURE_ID, task_class: "documentation", suite: "mechanism_negative" },
    input_identity: { fixture_input_digest: inputDigest },
    evaluator_revision: evaluatorRevision,
    evaluator_source_identity: sourceIdentity,
    generator,
    independence: { statement_digest: independence.statement_digest, generated_without_agent_output: true, public_answer_sources_used: false, measured_agent_access_allowed: false },
    review: { record_digest: canonicalDigest({ fixture_id: MN_DOC_FIXTURE_ID, status: "pending_independent_review", evaluator_revision: evaluatorRevision }), status: "pending", reviewer_count: 1 },
    asset_inventory: inventory,
    capabilities: { automated_evaluation: true, manual_evaluation: true },
    boundaries: { private_evaluator_bundle: true, public_repository_allowed: false, public_ci_artifact_allowed: false, contains_answer_bearing_content: true },
    dependency_graph: dependencyGraph,
  };
  const withId = { ...manifestBase, evaluator_bundle_id: computeEvaluatorBundleId(manifestBase) };
  const manifest = { ...withId, evaluator_bundle_digest: computeEvaluatorBundleDigest(withId) };
  writeJson(resolve(canonicalPrivateRoot, "private-evaluator-bundle.json"), manifest);
  validateIndependenceStatement({ statement: independence, manifest, root });
  return { manifest, sourceIdentity };
}

function buildAdmissionReview({ inputDigest, bundle, visiblePaths }) {
  const fair = { status: "pass", agent_visible_evidence: visiblePaths };
  const gates = [
    "public_artifact_leakage", "private_evaluator_boundary", "requirement_recoverability", "plain_fair_path", "kernel_only_fair_path", "ordinary_engineering_task_wording", "ask_vocabulary_cue_absence", "evidence_removal_mutation", "equivalent_solution_coverage", "independent_review", "input_digest_freeze", "evaluator_digest_freeze",
  ].map((gate_id) => ({ gate_id, selector_result: "applicable", result: gate_id === "independent_review" ? "unknown" : "pass" }));
  for (const gate_id of ["suspicious_but_correct_control", "false_positive_boundary", "unauthorized_attempt_observability"]) gates.push({ gate_id, selector_result: "not_applicable", result: "not_applicable" });
  const base = {
    schema_version: "1.0.0", fixture_id: MN_DOC_FIXTURE_ID, candidate_input_digest: inputDigest, candidate_evaluator_digest: bundle.evaluator_bundle_digest,
    reviewer_status: "pending_independent_review", author_self_approval: false, admission_status: "admission_pending", fair_paths: { plain: fair, kernel_only: fair }, gates,
  };
  return { ...base, review_package_digest: canonicalDigest(base) };
}

function candidateBinding(root, path, semanticDigest) {
  return { path, raw_sha256: sha256(readFileSync(resolve(root, path))), semantic_digest: semanticDigest };
}

function generateMnDocConfigCorrectionProductionAuthorityInPlace({ root, privateRoot, evaluatorRevision, generationDate }) {
  if (!/^[a-f0-9]{40}$/u.test(evaluatorRevision ?? "")) throw new Error("mn-doc evaluator revision is invalid");
  const fixtureRoot = resolve(root, MN_DOC_FIXTURE_ROOT);
  const inputPath = `${MN_DOC_FIXTURE_ROOT}/input-manifest.json`;
  const input = readJson(resolve(root, inputPath), "mn-doc input manifest");
  const inputDigest = sha256(readFileSync(resolve(root, inputPath)));
  const verification = readJson(resolve(fixtureRoot, "verification-command-contract.json"), "mn-doc verification contract");
  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"), "portfolio catalog");
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "portfolio policy manifest");
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "portfolio scoring policy");
  if (catalog.catalog_digest !== computePortfolioCatalogDigest(catalog) || policyManifest.manifest_digest !== computePolicyManifestDigest(policyManifest) || scoringPolicy.policy_digest !== computeScoringPolicyDigest(scoringPolicy)) throw new Error("portfolio policy identity is not closed before mn-doc authority generation");
  const evidence = buildEvidenceMap();
  writeJson(resolve(fixtureRoot, "evidence-map.json"), evidence.evidenceMap);

  const privateAuthority = writePrivateProductionAuthority({ root, privateRoot, evaluatorRevision, generationDate, inputDigest });
  const bundle = privateAuthority.manifest;
  const admissionSeed = buildAdmissionSeed({ catalog, inputDigest, bundle, requirementCount: 3, evidenceMapIds: evidence.evidenceMap.maps.map(({ evidence_map_id }) => evidence_map_id), mutationIds: evidence.mutationAsset.mutations.map(({ mutation_id }) => mutation_id) });
  const requirement = buildRequirementRecord({ catalog, policyManifest, scoringPolicy, admissionRequirementDigest: admissionSeed.requirement_authority_digest });
  writeJson(resolve(fixtureRoot, "requirement-record.json"), requirement);

  const layout = evaluatorAuthorityPathsForFixture(MN_DOC_FIXTURE_ID);
  const authorityBuffers = new Map(layout.bindingPaths.map((path) => [path, readFileSync(resolve(root, path))]));
  const authorityManifest = deriveEvaluatorAuthorityManifest({ buffers: authorityBuffers, evaluatorRevision, fixtureId: MN_DOC_FIXTURE_ID });
  writeJson(resolve(root, layout.manifestPath), authorityManifest);
  const authorityBinding = { evaluator_authority_manifest_path: layout.manifestPath, evaluator_authority_manifest_raw_sha256: sha256(readFileSync(resolve(root, layout.manifestPath))), evaluator_authority_manifest_digest: authorityManifest.manifest_digest };
  const referenceBase = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/evaluator-reference.schema.json", program: "adaptive_ask_evaluator_reference",
    evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_bundle_schema_version: bundle.schema_version,
    fixture_id: MN_DOC_FIXTURE_ID, fixture_input_digest: inputDigest, task_class: "documentation", suite: "mechanism_negative", evaluator_revision: evaluatorRevision,
    evaluator_source_identity: bundle.evaluator_source_identity, generator_identity: canonicalDigest(bundle.generator), independence_statement_digest: bundle.independence.statement_digest, review_record_digest: bundle.review.record_digest,
    ...authorityBinding, storage_class: "private_evaluator",
  };
  const reference = { ...referenceBase, public_metadata_digest: computeEvaluatorReferenceDigest(referenceBase) };
  writeJson(resolve(fixtureRoot, "evaluator-reference.json"), reference);

  const outputBase = {
    output_contract_id: `output-contract-${MN_DOC_FIXTURE_ID}`,
    output_contract_schema_path: "benchmarks/schemas/portfolio-output-contract.schema.json",
    output_contract_path: `${MN_DOC_FIXTURE_ROOT}/output-contract.json`,
    fixture_id: MN_DOC_FIXTURE_ID,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    evaluator_public_reference_path: `${MN_DOC_FIXTURE_ROOT}/evaluator-reference.json`,
    evaluator_public_reference_digest: reference.public_metadata_digest,
    verification_command_contract_path: `${MN_DOC_FIXTURE_ROOT}/verification-command-contract.json`,
    verification_command_contract_digest: verification.contract_digest,
    scope_boundary_authority_path: `${MN_DOC_FIXTURE_ROOT}/evidence-map.json`,
    scope_boundary_authority_digest: evidence.evidenceMap.scope_boundary_authority.authority_digest,
    result_profile: { name: BINARY_SCOPE_VERIFICATION_PROFILE_NAME, digest: computeResultProfileDigest() },
    declares_findings: false,
    ...authorityBinding,
  };
  const output = { ...outputBase, output_contract_digest: computeOutputContractDigest(outputBase) };
  writeJson(resolve(fixtureRoot, "output-contract.json"), output);

  const admissionBase = { ...admissionSeed, ...authorityBinding };
  const admission = { ...admissionBase, admission_digest: computeFinalAdmissionRecordDigest(admissionBase) };
  writeJson(resolve(fixtureRoot, "final-admission-record.json"), admission);

  const evidencePath = `${MN_DOC_FIXTURE_ROOT}/evidence-map.json`;
  const verificationPath = `${MN_DOC_FIXTURE_ROOT}/verification-command-contract.json`;
  const requirementPath = `${MN_DOC_FIXTURE_ROOT}/requirement-record.json`;
  const outputPath = `${MN_DOC_FIXTURE_ROOT}/output-contract.json`;
  const admissionPath = `${MN_DOC_FIXTURE_ROOT}/final-admission-record.json`;
  const referencePath = `${MN_DOC_FIXTURE_ROOT}/evaluator-reference.json`;
  const freezeBase = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json", program: "adaptive_ask_scoring_input_freeze", fixture_id: MN_DOC_FIXTURE_ID, fixture_input_digest: inputDigest,
    catalog: rawArtifact(root, "benchmarks/portfolio-catalog.json", catalog.catalog_digest),
    policy_manifest: rawArtifact(root, "benchmarks/portfolio-policy-manifest.json", policyManifest.manifest_digest),
    scoring_policy: rawArtifact(root, "benchmarks/portfolio-scoring-policy.json", scoringPolicy.policy_digest),
    admission_record: rawArtifact(root, admissionPath, admission.admission_digest),
    requirement_record: { path: requirementPath, raw_byte_digest: sha256(readFileSync(resolve(root, requirementPath))), record_digest: requirement.requirement_record_digest, set_digest: requirement.requirement_set_digest },
    output_contract: rawArtifact(root, outputPath, output.output_contract_digest),
    evaluator_public_reference: rawArtifact(root, referencePath, reference.public_metadata_digest),
    verification_command_contract: rawArtifact(root, verificationPath, verification.contract_digest),
    evidence_map: rawArtifact(root, evidencePath, canonicalDigest(evidence.evidenceMap)),
    evaluator_authority_manifest: rawArtifact(root, layout.manifestPath, authorityManifest.manifest_digest),
    result_profile: output.result_profile,
    freeze_revision: "issue-241-mn-doc-config-correction-r1",
  };
  const freeze = { ...freezeBase, manifest_digest: computeScoringInputFreezeManifestDigest(freezeBase) };
  writeJson(resolve(fixtureRoot, "scoring-input-freeze-manifest.json"), freeze);

  const visiblePaths = input.fixtures[MN_DOC_FIXTURE_ID].files.map(({ path }) => path);
  const review = buildAdmissionReview({ inputDigest, bundle, visiblePaths });
  writeJson(resolve(fixtureRoot, "admission-review.json"), review);
  const metadataBase = {
    schema_version: "1.0.0", fixture_id: MN_DOC_FIXTURE_ID, fixture_role: "primary", suite: "mechanism_negative", task_class: "documentation", domain: "docs_config", difficulty: "easy", repetitions: 3, risk_boundary: "none",
    capability_families: ["documentation_accuracy", "focused_implementation"], evidence_topologies: ["documentation_and_config", "single_file_spec"], outcome_dimensions: ["configuration_accuracy", "scope_discipline"],
    output_contract_type: "implementation_producing", requirement_record_id: requirement.requirement_record_id, output_contract_id: output.output_contract_id,
    evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_byte_count: admission.evaluator_byte_count,
    review_status: "pending_independent_review", measured_execution_performed: false,
  };
  const metadata = { ...metadataBase, metadata_digest: canonicalDigest(metadataBase) };
  writeJson(resolve(fixtureRoot, "metadata.json"), metadata);
  const candidateBase = {
    schema_version: "1.1.0", fixture_id: MN_DOC_FIXTURE_ID, candidate_state: "source_freeze_candidate", reviewer_state: "pending", admission_state: "admission_pending", measured_execution: false, scoring_published: false,
    public_bindings: {
      input_manifest: candidateBinding(root, inputPath, canonicalDigest(input.fixtures[MN_DOC_FIXTURE_ID])),
      evidence_map: candidateBinding(root, evidencePath, canonicalDigest(evidence.evidenceMap)),
      requirement_record: candidateBinding(root, requirementPath, requirement.requirement_record_digest),
      output_contract: candidateBinding(root, outputPath, output.output_contract_digest),
      verification_command_contract: candidateBinding(root, verificationPath, verification.contract_digest),
      metadata: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/metadata.json`, metadata.metadata_digest),
      evaluator_public_reference: candidateBinding(root, referencePath, reference.public_metadata_digest),
      evaluator_authority_manifest: candidateBinding(root, layout.manifestPath, authorityManifest.manifest_digest),
      final_admission_record: candidateBinding(root, admissionPath, admission.admission_digest),
      scoring_input_freeze_manifest: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/scoring-input-freeze-manifest.json`, freeze.manifest_digest),
      admission_review: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/admission-review.json`, review.review_package_digest),
    },
    evaluator_private_binding: { evaluator_revision: evaluatorRevision, evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_byte_count: admission.evaluator_byte_count, source_tree_digest: bundle.evaluator_source_identity.source_tree_digest, dependency_graph_digest: bundle.dependency_graph.graph_digest },
  };
  const candidate = { ...candidateBase, candidate_digest: canonicalDigest(candidateBase) };
  writeJson(resolve(fixtureRoot, "source-freeze-candidate.json"), candidate);
  return validateMnDocConfigCorrectionProductionAuthority({ root });
}

function runGit(root, args, label) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function assertProductionWriterInputs({ root, privateRoot, evaluatorRevision, generationDate, boundaryRoots }) {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) throw new Error("mn-doc production writer repository root is missing");
  if (!privateRoot || !existsSync(privateRoot) || !lstatSync(privateRoot).isDirectory() || lstatSync(privateRoot).isSymbolicLink()) throw new Error("mn-doc production writer requires an existing non-symlink private root");
  assertPrivateRootOutsideRepository(root, privateRoot);
  if (!/^[a-f0-9]{40}$/u.test(evaluatorRevision ?? "")) throw new Error("mn-doc evaluator revision is invalid");
  runGit(root, ["cat-file", "-e", `${evaluatorRevision}^{commit}`], "mn-doc evaluator revision lookup");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(generationDate ?? "")) throw new Error("mn-doc production generation date must be YYYY-MM-DD");
  const requiredBoundaryFields = ["materializedPath", "selectionState", "runDir", "normalizedResultsPath"];
  if (!boundaryRoots || typeof boundaryRoots !== "object" || Array.isArray(boundaryRoots)) throw new Error("mn-doc production writer requires complete private boundary roots");
  const unknownBoundaryFields = Object.keys(boundaryRoots).filter((field) => !requiredBoundaryFields.includes(field));
  const missingBoundaryFields = requiredBoundaryFields.filter((field) => !boundaryRoots[field] || !existsSync(boundaryRoots[field]) || !lstatSync(boundaryRoots[field]).isDirectory());
  if (unknownBoundaryFields.length > 0 || missingBoundaryFields.length > 0) throw new Error(`mn-doc production writer boundary roots are invalid${unknownBoundaryFields.length > 0 ? `; unknown: ${unknownBoundaryFields.join(", ")}` : ""}${missingBoundaryFields.length > 0 ? `; missing: ${missingBoundaryFields.join(", ")}` : ""}`);
}

function assertFrozenInputsUnchanged(sourceRoot, stagedRoot) {
  const sourceFixture = resolve(sourceRoot, MN_DOC_FIXTURE_ROOT);
  const stagedFixture = resolve(stagedRoot, MN_DOC_FIXTURE_ROOT);
  if (stableCanonicalJson(agentVisibleInventory(sourceFixture)) !== stableCanonicalJson(agentVisibleInventory(stagedFixture))) throw new Error("mn-doc production regeneration would change frozen agent-visible inputs");
  for (const name of ["input-manifest.json", "verification-command-contract.json"]) {
    if (!readFileSync(resolve(sourceFixture, name)).equals(readFileSync(resolve(stagedFixture, name)))) throw new Error(`mn-doc production regeneration would change frozen ${name}`);
  }
}

function preparePublication(pairs) {
  const prepared = [];
  const transactionDirectories = new Set();
  try {
    for (const { source, target, label, transactionDirectory } of pairs) {
      if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error(`${label} staged source is missing or invalid`);
      if (!existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) throw new Error(`${label} publication target is missing or invalid`);
      if (readFileSync(source).equals(readFileSync(target))) continue;
      if (!existsSync(transactionDirectory)) mkdirSync(transactionDirectory, { recursive: false });
      transactionDirectories.add(transactionDirectory);
      const suffix = randomUUID();
      const staged = resolve(transactionDirectory, `${basename(target)}.${suffix}.staging`);
      const backup = resolve(transactionDirectory, `${basename(target)}.${suffix}.backup`);
      copyFileSync(source, staged, constants.COPYFILE_EXCL);
      copyFileSync(target, backup, constants.COPYFILE_EXCL);
      if (!readFileSync(staged).equals(readFileSync(source)) || !readFileSync(backup).equals(readFileSync(target))) throw new Error(`${label} publication staging identity differs`);
      prepared.push({ target, staged, backup, label, published: false });
    }
    return { prepared, transactionDirectories: [...transactionDirectories] };
  } catch (error) {
    for (const record of prepared) {
      rmSync(record.staged, { force: true });
      rmSync(record.backup, { force: true });
    }
    for (const directory of transactionDirectories) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function publishPrepared({ prepared, transactionDirectories }, validatePublished) {
  try {
    for (const record of prepared) {
      renameSync(record.staged, record.target);
      record.published = true;
    }
    const result = validatePublished();
    for (const record of prepared) rmSync(record.backup, { force: true });
    for (const directory of transactionDirectories) rmSync(directory, { recursive: true, force: true });
    return result;
  } catch (error) {
    for (const record of [...prepared].reverse()) {
      if (record.published && existsSync(record.backup)) renameSync(record.backup, record.target);
      rmSync(record.staged, { force: true });
      rmSync(record.backup, { force: true });
    }
    for (const directory of transactionDirectories) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function writeMnDocConfigCorrectionProductionAuthority({ root = ROOT, privateRoot, evaluatorRevision, generationDate, boundaryRoots }) {
  assertProductionWriterInputs({ root, privateRoot, evaluatorRevision, generationDate, boundaryRoots });
  const repositoryRoot = realpathSync(root);
  const privateDirectory = realpathSync(privateRoot);
  const staging = resolve(tmpdir(), `ask-mn-doc-production-authority-${randomUUID()}`);
  const stagedRepository = resolve(staging, "repository");
  const stagedPrivate = resolve(staging, "private");
  mkdirSync(staging, { recursive: false });
  let worktreeAdded = false;
  try {
    runGit(repositoryRoot, ["worktree", "add", "--detach", stagedRepository, evaluatorRevision], "mn-doc production staging worktree creation");
    worktreeAdded = true;
    cpSync(privateDirectory, stagedPrivate, { recursive: true, force: false, errorOnExist: true });
    generateMnDocConfigCorrectionProductionAuthorityInPlace({ root: stagedRepository, privateRoot: stagedPrivate, evaluatorRevision, generationDate });
    validateMnDocConfigCorrectionProductionAuthority({ root: stagedRepository, privateRoot: stagedPrivate, boundaryRoots });
    assertFrozenInputsUnchanged(repositoryRoot, stagedRepository);
    const transactionId = randomUUID();
    const publicTransactionDirectory = resolve(repositoryRoot, "benchmarks/fixtures/checkpoint-b2", `.mn-doc-authority-transaction-${transactionId}`);
    const privateTransactionDirectory = resolve(dirname(privateDirectory), `.mn-doc-authority-transaction-${transactionId}`);
    const publicPairs = GENERATED_PUBLIC_ARTIFACTS.map((name) => ({ source: resolve(stagedRepository, MN_DOC_FIXTURE_ROOT, name), target: resolve(repositoryRoot, MN_DOC_FIXTURE_ROOT, name), transactionDirectory: publicTransactionDirectory, label: `mn-doc public ${name}` }));
    const privatePairs = GENERATED_PRIVATE_ARTIFACTS.map((name) => ({ source: resolve(stagedPrivate, name), target: resolve(privateDirectory, name), transactionDirectory: privateTransactionDirectory, label: `mn-doc private ${name}` }));
    const prepared = preparePublication([...publicPairs, ...privatePairs]);
    return publishPrepared(prepared, () => validateMnDocConfigCorrectionProductionAuthority({ root: repositoryRoot, privateRoot: privateDirectory, boundaryRoots }));
  } finally {
    if (worktreeAdded) {
      const removal = spawnSync("git", ["-C", repositoryRoot, "worktree", "remove", "--force", stagedRepository], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (removal.status !== 0 && existsSync(stagedRepository)) rmSync(stagedRepository, { recursive: true, force: true });
    }
    rmSync(staging, { recursive: true, force: true });
  }
}

export function validateMnDocConfigCorrectionProductionAuthority({ root = ROOT, privateRoot = null, boundaryRoots = null } = {}) {
  const fixtureRoot = resolve(root, MN_DOC_FIXTURE_ROOT);
  const artifacts = Object.fromEntries(PRODUCTION_PUBLIC_ARTIFACTS.map((name) => [name, readJson(resolve(fixtureRoot, name), `mn-doc ${name}`)]));
  for (const [name, value] of Object.entries(artifacts)) assertAnswerNeutralPublicValue(value, `mn-doc ${name}`);
  const inputManifest = artifacts["input-manifest.json"];
  const inputRecord = inputManifest.fixtures?.[MN_DOC_FIXTURE_ID];
  if (!inputRecord || stableCanonicalJson(inputRecord.files) !== stableCanonicalJson(agentVisibleInventory(fixtureRoot))) throw new Error("mn-doc input manifest does not exactly bind the agent-visible inventory");
  const declaredAgentVisiblePaths = new Set(inputRecord.files.map(({ path }) => path));
  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"), "portfolio catalog");
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "portfolio policy manifest");
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"), "portfolio scoring policy");
  validatePortfolioPolicyArtifacts({ root });
  const requirement = artifacts["requirement-record.json"];
  const output = artifacts["output-contract.json"];
  const admission = artifacts["final-admission-record.json"];
  const reference = artifacts["evaluator-reference.json"];
  const authorityManifest = artifacts["evaluator-authority-manifest.json"];
  const freeze = artifacts["scoring-input-freeze-manifest.json"];
  const evidenceMap = artifacts["evidence-map.json"];
  const verification = validateVerificationCommandContract(artifacts["verification-command-contract.json"], { root });
  assertBenchmarkSchemaInstance(requirement, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json"), label: "mn-doc production requirement record" });
  validateRequirementRecordContract({ scoringPolicy, requirementRecord: requirement, requirementRecordSchema: readJson(resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json"), "requirement schema"), evaluatorResultSchema: readJson(resolve(root, "benchmarks/schemas/evaluator-result-envelope.schema.json"), "evaluator result schema") });
  if (requirement.requirement_record_id !== `requirement-record-${MN_DOC_FIXTURE_ID}` || requirement.requirement_record_path !== `${MN_DOC_FIXTURE_ROOT}/requirement-record.json` || requirement.fixture_id !== MN_DOC_FIXTURE_ID) throw new Error("mn-doc requirement record identity is invalid");
  assertBenchmarkSchemaInstance(output, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-output-contract.schema.json"), label: "mn-doc production output contract" });
  if (output.output_contract_digest !== computeOutputContractDigest(output)) throw new Error("mn-doc output contract digest is invalid");
  if (output.output_contract_id !== `output-contract-${MN_DOC_FIXTURE_ID}` || output.output_contract_path !== `${MN_DOC_FIXTURE_ROOT}/output-contract.json` || output.fixture_id !== MN_DOC_FIXTURE_ID) throw new Error("mn-doc output contract identity is invalid");
  assertBenchmarkSchemaInstance(admission, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-final-admission-record.schema.json"), label: "mn-doc final admission record" });
  validateFrozenFinalAdmissionRecordContract({ admissionPolicy: readJson(resolve(root, "benchmarks/portfolio-admission-policy.json"), "admission policy"), admissionRecord: admission, finalAdmissionRecordSchema: readJson(resolve(root, "benchmarks/schemas/portfolio-final-admission-record.schema.json"), "final admission schema") });
  if (requirement.admission_record_digest !== resolveRequirementAdmissionBindingDigest(admission)) throw new Error("mn-doc requirement/admission binding is invalid");
  assertBenchmarkSchemaInstance(reference, { schemaPath: resolve(root, "benchmarks/schemas/evaluator-reference.schema.json"), label: "mn-doc evaluator reference" });
  if (reference.public_metadata_digest !== computeEvaluatorReferenceDigest(reference)) throw new Error("mn-doc evaluator reference digest is invalid");
  const expectedGeneratorIdentity = canonicalDigest({
    id: "mn-doc-config-correction-private-authority",
    version: "1.0.0",
    source_digest: reference.evaluator_source_identity.generator_source_digest,
  });
  if (reference.generator_identity !== expectedGeneratorIdentity) throw new Error("mn-doc public evaluator generator identity is invalid");
  validateEvaluatorSourceIdentity({ identity: reference.evaluator_source_identity, root, expectedRevision: reference.evaluator_revision, expectedGeneratorSourceDigest: reference.evaluator_source_identity.generator_source_digest, label: "mn-doc public evaluator source identity" });
  const layout = evaluatorAuthorityPathsForFixture(MN_DOC_FIXTURE_ID);
  const buffers = new Map(layout.bindingPaths.map((path) => [path, readFileSync(resolve(root, path))]));
  validateEvaluatorAuthorityManifest({ manifest: authorityManifest, buffers, evaluatorRevision: reference.evaluator_revision, root, label: "mn-doc evaluator authority manifest" });
  const manifestRaw = sha256(readFileSync(resolve(root, layout.manifestPath)));
  for (const [artifact, label] of [[reference, "reference"], [output, "output contract"], [admission, "admission record"]]) if (artifact.evaluator_authority_manifest_path !== layout.manifestPath || artifact.evaluator_authority_manifest_raw_sha256 !== manifestRaw || artifact.evaluator_authority_manifest_digest !== authorityManifest.manifest_digest) throw new Error(`mn-doc ${label} evaluator-authority manifest path transplant`);
  assertBenchmarkSchemaInstance(freeze, { schemaPath: resolve(root, "benchmarks/schemas/scoring-input-freeze-manifest.schema.json"), label: "mn-doc scoring-input freeze" });
  if (freeze.manifest_digest !== computeScoringInputFreezeManifestDigest(freeze)) throw new Error("mn-doc freeze manifest digest is invalid");
  for (const [field, path, semantic] of [
    ["admission_record", `${MN_DOC_FIXTURE_ROOT}/final-admission-record.json`, admission.admission_digest],
    ["output_contract", `${MN_DOC_FIXTURE_ROOT}/output-contract.json`, output.output_contract_digest],
    ["evaluator_public_reference", `${MN_DOC_FIXTURE_ROOT}/evaluator-reference.json`, reference.public_metadata_digest],
    ["verification_command_contract", `${MN_DOC_FIXTURE_ROOT}/verification-command-contract.json`, verification.contract_digest],
    ["evidence_map", `${MN_DOC_FIXTURE_ROOT}/evidence-map.json`, canonicalDigest(evidenceMap)],
    ["evaluator_authority_manifest", layout.manifestPath, authorityManifest.manifest_digest],
  ]) assertExact(freeze[field], rawArtifact(root, path, semantic), `mn-doc frozen ${field}`);
  if (freeze.requirement_record.raw_byte_digest !== sha256(readFileSync(resolve(fixtureRoot, "requirement-record.json"))) || freeze.requirement_record.record_digest !== requirement.requirement_record_digest || freeze.requirement_record.set_digest !== requirement.requirement_set_digest) throw new Error("mn-doc frozen requirement identity is invalid");
  if (output.catalog_digest !== catalog.catalog_digest || output.policy_manifest_digest !== policyManifest.manifest_digest || requirement.catalog_digest !== catalog.catalog_digest || requirement.policy_manifest_digest !== policyManifest.manifest_digest || requirement.scoring_policy_digest !== scoringPolicy.policy_digest) throw new Error("mn-doc production policy identity is transplanted");
  if (output.evaluator_public_reference_digest !== reference.public_metadata_digest || output.verification_command_contract_digest !== verification.contract_digest || output.scope_boundary_authority_digest !== evidenceMap.scope_boundary_authority.authority_digest) throw new Error("mn-doc output contract authority binding is invalid");
  if (admission.evaluator_bundle_id !== reference.evaluator_bundle_id || admission.evaluator_bundle_digest !== reference.evaluator_bundle_digest || stableCanonicalJson(admission.evaluator_source_identity) !== stableCanonicalJson(reference.evaluator_source_identity)) throw new Error("mn-doc evaluator bundle transplant");
  const { mutationAsset } = buildEvidenceMap();
  assertExact(evidenceMap, buildEvidenceMap().evidenceMap, "mn-doc evidence/mutation public authority");
  const evidenceMaps = new Map(evidenceMap.maps.map((entry) => [entry.evidence_map_id, entry]));
  for (const requirementEntry of requirement.requirements) {
    for (const evidenceMapId of requirementEntry.evidence_map_ids) {
      const evidence = evidenceMaps.get(evidenceMapId);
      if (!evidence || evidence.agent_visible_paths.some((path) => !declaredAgentVisiblePaths.has(path))) throw new Error(`mn-doc requirement evidence map is not agent-visible: ${evidenceMapId}`);
    }
  }
  if (privateRoot) {
    if (!boundaryRoots) throw new Error("mn-doc production private validation requires complete boundary roots");
    const bundle = verifyPrivateEvaluatorBundle({ root, referencePath: resolve(fixtureRoot, "evaluator-reference.json"), privateRoot, manifestPath: resolve(privateRoot, "private-evaluator-bundle.json"), ...boundaryRoots });
    validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: readJson(resolve(privateRoot, "evidence-removal-mutations.json"), "mn-doc private mutation authority") });
    validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: readJson(resolve(privateRoot, "equivalent-solutions.json"), "mn-doc private equivalence authority") });
    assertExact(readJson(resolve(privateRoot, "evidence-removal-mutations.json"), "mn-doc private mutation authority"), mutationAsset, "mn-doc private mutation authority");
    if (bundle.manifest.evaluator_bundle_id !== reference.evaluator_bundle_id || bundle.manifest.evaluator_bundle_digest !== reference.evaluator_bundle_digest) throw new Error("mn-doc public/private bundle transplant");
  }
  const metadata = artifacts["metadata.json"];
  if (metadata.metadata_digest !== canonicalDigest(withoutField(metadata, "metadata_digest")) || metadata.evaluator_bundle_id !== reference.evaluator_bundle_id || metadata.measured_execution_performed !== false) throw new Error("mn-doc metadata authority is invalid");
  const review = artifacts["admission-review.json"];
  if (review.review_package_digest !== canonicalDigest(withoutField(review, "review_package_digest")) || review.reviewer_status !== "pending_independent_review" || review.author_self_approval !== false || review.admission_status !== "admission_pending") throw new Error("mn-doc pending review package authority is invalid");
  validateFairPaths(review, declaredAgentVisiblePaths);
  const admissionPolicy = readJson(resolve(root, "benchmarks/portfolio-admission-policy.json"), "admission policy");
  const immutableArtifactDigests = {
    [requirement.requirement_record_path]: sha256(readFileSync(resolve(root, requirement.requirement_record_path))),
    [output.output_contract_path]: sha256(readFileSync(resolve(root, output.output_contract_path))),
    [output.evaluator_public_reference_path]: sha256(readFileSync(resolve(root, output.evaluator_public_reference_path))),
  };
  const predicateEvidence = { requirement_record: requirement };
  const selectorContext = buildSelectorContextArtifact({ admissionPolicy, scoringPolicy, policyManifest, catalog, fixtureId: MN_DOC_FIXTURE_ID, predicateEvidence, artifactRoot: root, immutableArtifactDigests });
  const reviewByGate = new Map(review.gates.map((entry) => [entry.gate_id, entry]));
  if (reviewByGate.size !== admissionPolicy.admission_gates.length) throw new Error("mn-doc admission review gate inventory is incomplete");
  for (const gate of admissionPolicy.admission_gates) {
    const record = reviewByGate.get(gate.gate_id);
    if (!record) throw new Error(`mn-doc admission review is missing gate ${gate.gate_id}`);
    const matches = admissionGateSelectorMatches(gate, selectorContext);
    if (record.selector_result !== (matches ? "applicable" : "not_applicable")) throw new Error(`mn-doc ${gate.gate_id} selector result drift`);
    validateAdmissionGateResult({ admissionPolicy, scoringPolicy, policyManifest, catalog, gateId: gate.gate_id, selectorContext, predicateEvidence, result: record.result, artifactRoot: root, immutableArtifactDigests });
  }
  validatePendingIndependentReview(review, admission);
  const candidate = artifacts["source-freeze-candidate.json"];
  if (candidate.candidate_digest !== canonicalDigest(withoutField(candidate, "candidate_digest")) || candidate.admission_state !== "admission_pending" || candidate.measured_execution !== false) throw new Error("mn-doc source-freeze candidate identity is invalid");
  const expectedBindings = {
    input_manifest: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/input-manifest.json`, canonicalDigest(inputRecord)),
    evidence_map: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/evidence-map.json`, canonicalDigest(evidenceMap)),
    requirement_record: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/requirement-record.json`, requirement.requirement_record_digest),
    output_contract: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/output-contract.json`, output.output_contract_digest),
    verification_command_contract: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/verification-command-contract.json`, verification.contract_digest),
    metadata: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/metadata.json`, metadata.metadata_digest),
    evaluator_public_reference: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/evaluator-reference.json`, reference.public_metadata_digest),
    evaluator_authority_manifest: candidateBinding(root, layout.manifestPath, authorityManifest.manifest_digest),
    final_admission_record: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/final-admission-record.json`, admission.admission_digest),
    scoring_input_freeze_manifest: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/scoring-input-freeze-manifest.json`, freeze.manifest_digest),
    admission_review: candidateBinding(root, `${MN_DOC_FIXTURE_ROOT}/admission-review.json`, review.review_package_digest),
  };
  assertExact(candidate.public_bindings, expectedBindings, "mn-doc source-freeze public binding closure");
  assertExact(candidate.evaluator_private_binding, { evaluator_revision: reference.evaluator_revision, evaluator_bundle_id: reference.evaluator_bundle_id, evaluator_bundle_digest: reference.evaluator_bundle_digest, evaluator_byte_count: admission.evaluator_byte_count, source_tree_digest: reference.evaluator_source_identity.source_tree_digest, dependency_graph_digest: reference.evaluator_source_identity.dependency_graph.graph_digest }, "mn-doc source-freeze private binding closure");
  return { fixtureId: MN_DOC_FIXTURE_ID, inputDigest: reference.fixture_input_digest, candidateDigest: candidate.candidate_digest, evaluatorBundleId: reference.evaluator_bundle_id, evaluatorBundleDigest: reference.evaluator_bundle_digest, evaluatorRevision: reference.evaluator_revision, reviewStatus: review.reviewer_status, scoringReady: false };
}
