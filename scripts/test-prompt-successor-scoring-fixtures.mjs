// Disposable test data only. No real oracle, measured output or admission is read.
// Public synthetic records are committed only in the test's isolated local clone.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { canonicalDigest, stableCanonicalJson } from "./content-addressed-store.mjs";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import {
  computeEvaluationDigest, computeEvaluationId, computeEvaluatorBundleDigest, computeEvaluatorBundleId, computeEvaluatorReferenceDigest,
  deriveEvaluatorAuthorityManifest, deriveEvaluatorDependencyGraph, evaluatorAuthorityPathsForFixture,
} from "./ask-benchmark-evaluator-boundary.mjs";
import {
  BINARY_SCOPE_VERIFICATION_PROFILE_NAME, computeFinalAdmissionRecordDigest, computeFinalAdmissionRequirementAuthorityDigest,
  computeOutputContractDigest, computeRequirementDigest, computeRequirementRecordDigest, computeRequirementSetDigest,
  computeResultProfileDigest, computeScoringInputFreezeManifestDigest,
} from "./ask-benchmark-scoring-contract.mjs";
import {
  computeCommandContractDigest, computeVerificationCommandContractDigest, logicalCommandDigest, renderedEventCommandDigest,
} from "./ask-benchmark-command-evidence.mjs";
import { buildSuccessorScoringInputManifest, SUCCESSOR_SCORING_INPUT_ROLES } from "./ask-benchmark-prompt-successor-scoring-inputs.mjs";

const bytesDigest = b => `sha256:${createHash("sha256").update(b).digest("hex")}`;
const d = text => canonicalDigest({ synthetic_only: text });
const read = path => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value, canonical = false) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonical ? stableCanonicalJson(value) : JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
};
const ASSET_ROLES = ["oracle", "rubric", "hidden_tests", "matchers", "equivalent_solution_rules", "false_positive_boundaries", "scope_boundaries", "unsafe_action_rules", "evidence_removal_mutations", "evaluator_dependency_graph", "human_evaluation_instructions"].sort();

export function createSuccessorSyntheticScoringInputs({ root, privateBase, parent, revision }) {
  const catalogPath = resolve(root, "benchmarks/portfolio-catalog.json");
  const policyPath = resolve(root, "benchmarks/portfolio-policy-manifest.json");
  const scorePath = resolve(root, "benchmarks/portfolio-scoring-policy.json");
  const configPath = resolve(root, "benchmarks/prompt-successor-execution.config.json");
  const catalog = read(catalogPath); const policy = read(policyPath); const score = read(scorePath);
  const rel = path => relative(root, path).split(sep).join("/");
  const fileRef = path => { const b = readFileSync(path); return { path: rel(path), raw_digest: bytesDigest(b), bytes: b.length }; };
  const semanticRef = (path, digest) => ({ path: rel(path), raw_byte_digest: fileRef(path).raw_digest, semantic_digest: digest });
  const inputDigest = bytesDigest(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/input-manifest.json")));
  const contexts = {};
  const fixtures = CALIBRATION_SOURCE_BINDINGS.map(([fixtureId, sourceId, taskClass]) => {
    const publicRoot = resolve(root, "scripts/test-fixtures/generated-successor-scoring", fixtureId);
    const privateRoot = resolve(privateBase, fixtureId);
    mkdirSync(privateRoot, { recursive: true });
    const assetInventory = ASSET_ROLES.map(role => {
      const path = `assets/${role}.json`;
      const b = Buffer.from(`${JSON.stringify({ test_only_role: role, fixture_id: fixtureId, no_real_oracle: true })}\n`);
      const absolute = resolve(privateRoot, path); mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, b, { flag: "wx" });
      return { role, path, sha256: bytesDigest(b), bytes: b.length, media_type: "application/json", required: true };
    });
    const bundle = {
      schema_version: "1.0.0", schema_path: "benchmarks/schemas/private-evaluator-bundle.schema.json", program: "adaptive_ask_private_evaluator_bundle",
      execution_budget_ms: 120000, evaluator_bundle_id: `evaluator-${"0".repeat(64)}`, evaluator_bundle_digest: d("pending-digest"),
      fixture_identity: { fixture_id: fixtureId, task_class: taskClass, suite: "calibration" },
      input_identity: { fixture_input_digest: inputDigest }, evaluator_revision: revision,
      generator: { id: "successor-synthetic-contract-fixture", version: "1.0.0", source_digest: d("no-real-oracle-generator") },
      independence: { statement_digest: d(`synthetic-independence:${fixtureId}`), generated_without_agent_output: true, public_answer_sources_used: false, measured_agent_access_allowed: false },
      // This is required schema data for a disposable test fixture, NOT approval
      // of any real fixture. The corresponding admission remains pending below.
      review: { record_digest: d(`test-only-review:${fixtureId}`), status: "approved", reviewer_count: 2 },
      asset_inventory: assetInventory, capabilities: { automated_evaluation: true, manual_evaluation: true },
      boundaries: { private_evaluator_bundle: true, public_repository_allowed: false, public_ci_artifact_allowed: false, contains_answer_bearing_content: true },
      dependency_graph: { entry_paths: ["scripts/synthetic-entry.mjs"], node_inventory: [{ path: "scripts/synthetic-entry.mjs", bytes: 1, sha256: d("synthetic-node"), file_type: "module", base_git_revision_bytes: 1, base_git_revision_sha256: d("synthetic-node") }], edge_inventory: [], graph_digest: d("synthetic-graph") },
    };
    bundle.evaluator_bundle_id = computeEvaluatorBundleId(bundle);
    bundle.evaluator_bundle_digest = computeEvaluatorBundleDigest(bundle);
    const manifestPath = resolve(privateRoot, "private-evaluator-bundle.json"); write(manifestPath, bundle);
    const reference = {
      schema_version: "1.0.0", schema_path: "benchmarks/schemas/evaluator-reference.schema.json", program: "adaptive_ask_evaluator_reference",
      evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_bundle_schema_version: bundle.schema_version,
      fixture_id: fixtureId, fixture_input_digest: inputDigest, task_class: taskClass, suite: "calibration", evaluator_revision: revision,
      generator_identity: canonicalDigest(bundle.generator), independence_statement_digest: bundle.independence.statement_digest,
      review_record_digest: bundle.review.record_digest, storage_class: "private_evaluator", public_metadata_digest: d("pending-digest"),
    };
    reference.public_metadata_digest = computeEvaluatorReferenceDigest(reference);
    const referencePath = resolve(publicRoot, "evaluator-reference.json"); write(referencePath, reference);
    const requirement = {
      requirement_id: "synthetic-contract-observation", requirement_kind: "weighted", max_points: 1, partial_credit_allowed: false,
      evidence_map_ids: ["synthetic-evidence"], mutation_ids: ["synthetic-mutation"], equivalence_class_ids: ["synthetic-equivalence"],
      finding_group_id: "synthetic-finding-group", safety_dimension: "completion_correctness", requirement_digest: d("pending-digest"),
    };
    requirement.requirement_digest = computeRequirementDigest(requirement);
    const admission = {
      fixture_id: fixtureId, catalog_digest: catalog.catalog_digest, input_manifest_digest: inputDigest,
      evaluator_reference_schema: reference.schema_path, evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest,
      evaluator_byte_count: 1, evaluator_requirement_count: 1, evidence_map_ids: requirement.evidence_map_ids,
      mutation_set_ids: requirement.mutation_ids, reviewer_record_id: "synthetic-not-real-admission", admission_revision: 1,
      admission_status: "admission_pending", admission_digest: d("pending-digest"),
    };
    admission.admission_digest = computeFinalAdmissionRecordDigest(admission);
    const admissionRecordPath = resolve(publicRoot, "final-admission-record.json"); write(admissionRecordPath, admission);
    const requirementRecordPath = resolve(publicRoot, "requirement-record.json");
    const requirements = {
      requirement_record_id: `synthetic-${fixtureId}`, requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
      requirement_record_path: rel(requirementRecordPath), fixture_id: fixtureId, catalog_digest: catalog.catalog_digest,
      policy_manifest_digest: policy.manifest_digest, scoring_policy_digest: score.policy_digest, admission_record_digest: admission.admission_digest,
      requirements: [requirement], requirement_set_digest: d("pending-digest"), requirement_record_digest: d("pending-digest"),
    };
    requirements.requirement_set_digest = computeRequirementSetDigest(requirements);
    requirements.requirement_record_digest = computeRequirementRecordDigest(requirements); write(requirementRecordPath, requirements);
    const outputContractPath = resolve(publicRoot, "output-contract.json");
    const output = { output_contract_id: `synthetic-${fixtureId}`, output_contract_schema_path: "benchmarks/schemas/portfolio-output-contract.schema.json",
      output_contract_path: rel(outputContractPath), fixture_id: fixtureId, catalog_digest: catalog.catalog_digest, policy_manifest_digest: policy.manifest_digest,
      evaluator_public_reference_path: rel(referencePath), evaluator_public_reference_digest: reference.public_metadata_digest,
      declares_findings: true, output_contract_digest: d("pending-digest") };
    output.output_contract_digest = computeOutputContractDigest(output); write(outputContractPath, output);
    const freeze = {
      schema_version: "1.0.0", schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json", program: "adaptive_ask_scoring_input_freeze",
      fixture_id: fixtureId, fixture_input_digest: inputDigest,
      catalog: semanticRef(catalogPath, catalog.catalog_digest), policy_manifest: semanticRef(policyPath, policy.manifest_digest),
      scoring_policy: semanticRef(scorePath, score.policy_digest), admission_record: semanticRef(admissionRecordPath, admission.admission_digest),
      requirement_record: { path: rel(requirementRecordPath), raw_byte_digest: fileRef(requirementRecordPath).raw_digest, record_digest: requirements.requirement_record_digest, set_digest: requirements.requirement_set_digest },
      output_contract: semanticRef(outputContractPath, output.output_contract_digest), evaluator_public_reference: semanticRef(referencePath, reference.public_metadata_digest),
      freeze_revision: "successor-synthetic-r1", manifest_digest: d("pending-digest"),
    };
    freeze.manifest_digest = computeScoringInputFreezeManifestDigest(freeze);
    const freezePath = resolve(publicRoot, "scoring-input-freeze-manifest.json"); write(freezePath, freeze);
    const paths = { catalog: catalogPath, policy_manifest: policyPath, scoring_policy: scorePath, admission_record: admissionRecordPath,
      requirement_record: requirementRecordPath, output_contract: outputContractPath, evaluator_public_reference: referencePath, freeze_manifest: freezePath };
    contexts[fixtureId] = { privateRoot, manifestPath, bundle, reference, admission, requirements, output, freeze,
      freezeRawDigest: fileRef(freezePath).raw_digest, catalogDigest: catalog.catalog_digest, policyDigest: policy.manifest_digest, scoringPolicyDigest: score.policy_digest };
    return { fixture_id: fixtureId, source_fixture_id: sourceId, input_manifest_digest: inputDigest,
      artifacts: Object.fromEntries(SUCCESSOR_SCORING_INPUT_ROLES.map(role => [role, fileRef(paths[role])])) };
  });
  const manifest = buildSuccessorScoringInputManifest({ parent, executionConfig: fileRef(configPath), fixtures });
  const publicManifestPath = resolve(root, "scripts/test-fixtures/generated-successor-scoring/manifest.json");
  write(publicManifestPath, manifest, true);
  return { contexts, manifest, publicManifestPath };
}

/**
 * Build a fully closed public scoring chain only inside a disposable test clone.
 * The synthetic final-admission records exercise the admitted branch of the real
 * assembler/consumer contract. They are never written to the product branch,
 * contain no private evaluator bytes, and grant no measured-execution authority.
 */
export function createSuccessorSyntheticAdmittedCalibrationPackages({ root, revision }) {
  if (!/^[a-f0-9]{40}$/u.test(revision ?? "")) throw new Error("synthetic admitted calibration revision is invalid");
  const catalogPath = resolve(root, "benchmarks/portfolio-catalog.json");
  const policyPath = resolve(root, "benchmarks/portfolio-policy-manifest.json");
  const scorePath = resolve(root, "benchmarks/portfolio-scoring-policy.json");
  const inputPath = resolve(root, "benchmarks/fixtures/checkpoint-b2/input-manifest.json");
  const catalog = read(catalogPath);
  const policy = read(policyPath);
  const score = read(scorePath);
  const inputDigest = bytesDigest(readFileSync(inputPath));
  const rel = path => relative(root, path).split(sep).join("/");
  const fileRef = path => {
    const bytes = readFileSync(path);
    return { path: rel(path), raw_digest: bytesDigest(bytes), bytes: bytes.length };
  };
  const semanticRef = (path, digest) => ({ path: rel(path), raw_byte_digest: fileRef(path).raw_digest, semantic_digest: digest });
  const dependencyGraph = deriveEvaluatorDependencyGraph({ root, baseRevision: revision });
  const sourceFiles = dependencyGraph.node_inventory.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
  const sourceIdentity = {
    base_git_revision: revision,
    source_tree_digest: canonicalDigest(sourceFiles),
    generator_source_digest: d(`synthetic-admitted-public-generator:${revision}`),
    source_files: sourceFiles,
    dependency_graph: dependencyGraph,
  };
  const resultProfile = {
    name: BINARY_SCOPE_VERIFICATION_PROFILE_NAME,
    digest: computeResultProfileDigest({ name: BINARY_SCOPE_VERIFICATION_PROFILE_NAME }),
  };
  const created = [];

  const buildVerificationContract = fixtureId => {
    const command = {
      command_id: "synthetic-public-validation",
      purpose: "validation",
      working_directory: { path: ".", evidence_requirement: "not_required" },
      safe_argv: ["node", "--version"],
      execution_form: "direct_argv",
      shell_family: null,
      shell_envelope: null,
      canonical_script: null,
      logical_command_digest: "",
      rendered_event_command_digest: "",
      requirement: "required",
      alternative_group_id: null,
      timeout_ms: 10_000,
      command_contract_digest: "",
    };
    command.logical_command_digest = logicalCommandDigest(command);
    command.rendered_event_command_digest = renderedEventCommandDigest(command);
    command.command_contract_digest = computeCommandContractDigest(command);
    const base = {
      schema_version: "1.2.0",
      schema_path: "benchmarks/schemas/portfolio-verification-command-contract.schema.json",
      program: "adaptive_ask_verification_command_contract",
      fixture_id: fixtureId,
      fixture_input_digest: inputDigest,
      commands: [command],
    };
    return { ...base, contract_digest: computeVerificationCommandContractDigest(base) };
  };

  for (const [fixtureId, sourceId, taskClass, repetitions] of CALIBRATION_SOURCE_BINDINGS) {
    const catalogFixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === fixtureId);
    if (!catalogFixture || catalogFixture.fixture_role !== "calibration" || catalogFixture.suite !== "calibration"
        || catalogFixture.task_class !== taskClass || catalogFixture.repetitions !== repetitions || catalogFixture.aggregate_eligible !== false) {
      throw new Error(`synthetic admitted calibration catalog identity drift: ${fixtureId}`);
    }
    const publicRoot = resolve(root, "benchmarks/fixtures/checkpoint-b2", fixtureId);
    const evidencePath = resolve(publicRoot, "evidence-map.json");
    const evidenceMap = {
      schema_version: "1.0.0",
      fixture_id: fixtureId,
      maps: [{ evidence_map_id: "synthetic-evidence", agent_visible_paths: ["task.md"] }],
      mutation_contracts: [{ mutation_id: "synthetic-mutation", target_evidence_map_id: "synthetic-evidence", expected_admission_result: "fail" }],
    };
    write(evidencePath, evidenceMap);

    const commandPath = resolve(publicRoot, "verification-command-contract.json");
    const commandContract = buildVerificationContract(fixtureId);
    write(commandPath, commandContract);

    const evaluatorBundleId = `evaluator-${d(`synthetic-admitted-bundle-id:${fixtureId}`).slice("sha256:".length)}`;
    const evaluatorBundleDigest = d(`synthetic-admitted-bundle:${fixtureId}`);
    const admissionSeedBase = {
      fixture_id: fixtureId,
      catalog_digest: catalog.catalog_digest,
      input_manifest_digest: inputDigest,
      evaluator_reference_schema: "benchmarks/schemas/evaluator-reference.schema.json",
      evaluator_bundle_id: evaluatorBundleId,
      evaluator_bundle_digest: evaluatorBundleDigest,
      evaluator_byte_count: 1,
      evaluator_requirement_count: 1,
      evidence_map_ids: ["synthetic-evidence"],
      mutation_set_ids: ["synthetic-mutation"],
      reviewer_record_id: "synthetic-test-review",
      admission_revision: 1,
      admission_status: "admitted",
      evaluator_source_identity: sourceIdentity,
    };
    const admissionSeed = {
      ...admissionSeedBase,
      requirement_authority_digest: computeFinalAdmissionRequirementAuthorityDigest(admissionSeedBase),
    };
    const requirement = {
      requirement_id: "synthetic-contract-observation",
      requirement_kind: "weighted",
      max_points: 1,
      partial_credit_allowed: false,
      evidence_map_ids: ["synthetic-evidence"],
      mutation_ids: ["synthetic-mutation"],
      equivalence_class_ids: ["synthetic-equivalence"],
      finding_group_id: "synthetic-finding-group",
      safety_dimension: "completion_correctness",
      requirement_digest: d("pending-digest"),
    };
    requirement.requirement_digest = computeRequirementDigest(requirement);
    const requirementPath = resolve(publicRoot, "requirement-record.json");
    const requirementBase = {
      requirement_record_id: `synthetic-${fixtureId}`,
      requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
      requirement_record_path: rel(requirementPath),
      fixture_id: fixtureId,
      catalog_digest: catalog.catalog_digest,
      policy_manifest_digest: policy.manifest_digest,
      scoring_policy_digest: score.policy_digest,
      admission_record_digest: admissionSeed.requirement_authority_digest,
      requirements: [requirement],
      requirement_set_digest: computeRequirementSetDigest([requirement]),
    };
    const requirementRecord = { ...requirementBase, requirement_record_digest: computeRequirementRecordDigest(requirementBase) };
    write(requirementPath, requirementRecord);

    const layout = evaluatorAuthorityPathsForFixture(fixtureId);
    const authorityBuffers = new Map(layout.bindingPaths.map(path => [path, readFileSync(resolve(root, path))]));
    const evaluatorAuthorityManifest = deriveEvaluatorAuthorityManifest({ buffers: authorityBuffers, evaluatorRevision: revision, fixtureId });
    const evaluatorAuthorityPath = resolve(root, layout.manifestPath);
    write(evaluatorAuthorityPath, evaluatorAuthorityManifest);
    const authorityBinding = {
      evaluator_authority_manifest_path: layout.manifestPath,
      evaluator_authority_manifest_raw_sha256: fileRef(evaluatorAuthorityPath).raw_digest,
      evaluator_authority_manifest_digest: evaluatorAuthorityManifest.manifest_digest,
    };

    const referencePath = resolve(publicRoot, "evaluator-reference.json");
    const referenceBase = {
      schema_version: "1.0.0",
      schema_path: "benchmarks/schemas/evaluator-reference.schema.json",
      program: "adaptive_ask_evaluator_reference",
      evaluator_bundle_id: evaluatorBundleId,
      evaluator_bundle_digest: evaluatorBundleDigest,
      evaluator_bundle_schema_version: "1.0.0",
      fixture_id: fixtureId,
      fixture_input_digest: inputDigest,
      task_class: taskClass,
      suite: "calibration",
      evaluator_revision: revision,
      evaluator_source_identity: sourceIdentity,
      generator_identity: sourceIdentity.generator_source_digest,
      independence_statement_digest: d(`synthetic-admitted-independence:${fixtureId}`),
      review_record_digest: d(`synthetic-admitted-review:${fixtureId}`),
      ...authorityBinding,
      storage_class: "private_evaluator",
    };
    const reference = { ...referenceBase, public_metadata_digest: computeEvaluatorReferenceDigest(referenceBase) };
    write(referencePath, reference);

    const outputPath = resolve(publicRoot, "output-contract.json");
    const outputBase = {
      output_contract_id: `synthetic-${fixtureId}`,
      output_contract_schema_path: "benchmarks/schemas/portfolio-output-contract.schema.json",
      output_contract_path: rel(outputPath),
      fixture_id: fixtureId,
      catalog_digest: catalog.catalog_digest,
      policy_manifest_digest: policy.manifest_digest,
      evaluator_public_reference_path: rel(referencePath),
      evaluator_public_reference_digest: reference.public_metadata_digest,
      verification_command_contract_path: rel(commandPath),
      verification_command_contract_digest: commandContract.contract_digest,
      ...authorityBinding,
      result_profile: resultProfile,
      declares_findings: false,
    };
    const output = { ...outputBase, output_contract_digest: computeOutputContractDigest(outputBase) };
    write(outputPath, output);

    const admissionPath = resolve(publicRoot, "final-admission-record.json");
    const finalAdmissionBase = { ...admissionSeed, ...authorityBinding };
    const admission = { ...finalAdmissionBase, admission_digest: computeFinalAdmissionRecordDigest(finalAdmissionBase) };
    write(admissionPath, admission);

    const freezePath = resolve(publicRoot, "scoring-input-freeze-manifest.json");
    const freezeBase = {
      schema_version: "1.0.0",
      schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
      program: "adaptive_ask_scoring_input_freeze",
      fixture_id: fixtureId,
      fixture_input_digest: inputDigest,
      catalog: semanticRef(catalogPath, catalog.catalog_digest),
      policy_manifest: semanticRef(policyPath, policy.manifest_digest),
      scoring_policy: semanticRef(scorePath, score.policy_digest),
      admission_record: semanticRef(admissionPath, admission.admission_digest),
      requirement_record: { path: rel(requirementPath), raw_byte_digest: fileRef(requirementPath).raw_digest, record_digest: requirementRecord.requirement_record_digest, set_digest: requirementRecord.requirement_set_digest },
      output_contract: semanticRef(outputPath, output.output_contract_digest),
      evaluator_public_reference: semanticRef(referencePath, reference.public_metadata_digest),
      verification_command_contract: semanticRef(commandPath, commandContract.contract_digest),
      evidence_map: semanticRef(evidencePath, canonicalDigest(evidenceMap)),
      evaluator_authority_manifest: semanticRef(evaluatorAuthorityPath, evaluatorAuthorityManifest.manifest_digest),
      result_profile: resultProfile,
      freeze_revision: "synthetic-admitted-r1",
    };
    const freeze = { ...freezeBase, manifest_digest: computeScoringInputFreezeManifestDigest(freezeBase) };
    write(freezePath, freeze);

    const metadataPath = resolve(publicRoot, "metadata.json");
    const metadataBase = {
      schema_version: "1.0.0",
      fixture_id: fixtureId,
      fixture_role: "calibration",
      suite: "calibration",
      task_class: taskClass,
      domain: "synthetic_test_only",
      difficulty: catalogFixture.difficulty,
      repetitions,
      aggregate_eligible: false,
      review_status: "synthetic_test_only",
      measured_execution_performed: false,
    };
    write(metadataPath, { ...metadataBase, metadata_digest: canonicalDigest(metadataBase) });
    created.push({ fixture_id: fixtureId, source_fixture_id: sourceId });
  }
  return { fixtures: created, input_manifest_digest: inputDigest, evaluator_revision: revision };
}
/** A synthetic legacy-profile envelope, verified by the real #197 validator.
 * The test never claims this data was produced by a real/private evaluator.
 * Admission remains pending and the report must remain insufficient evidence.
 */
export function syntheticSuccessorEvaluatorEnvelope({ normalized, sourceSnapshotDigest, context }) {
  const l = normalized.lineage; const c = context;
  const ref = [{ kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: null }];
  const observation = () => ({ state: "unknown", evidence_references: [] });
  const value = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/evaluator-result-envelope.schema.json", program: "adaptive_ask_evaluator_result",
    scoring_input_freeze_manifest_source_digest: c.freezeRawDigest, scoring_input_freeze_manifest_digest: c.freeze.manifest_digest,
    catalog_digest: c.catalogDigest, policy_manifest_digest: c.policyDigest, scoring_policy_digest: c.scoringPolicyDigest,
    admission_record_digest: c.admission.admission_digest, requirement_record_digest: c.requirements.requirement_record_digest,
    requirement_set_digest: c.requirements.requirement_set_digest, output_contract_digest: c.output.output_contract_digest,
    evaluator_public_reference_digest: c.reference.public_metadata_digest,
    normalized_result_id: normalized.normalized_result_id, normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: l.run_instance_id, plan_id: l.plan_id, plan_digest: l.plan_digest, fixture_id: l.fixture_id,
    fixture_input_digest: l.fixture_input_digest, case_id: l.case_id, attempt: l.attempt, adapter: l.adapter_track,
    condition: l.condition, repetition: l.repetition, source_snapshot_digest: sourceSnapshotDigest,
    evaluator_bundle_id: c.bundle.evaluator_bundle_id, evaluator_bundle_digest: c.bundle.evaluator_bundle_digest, evaluator_revision: c.bundle.evaluator_revision,
    evaluation_id: `evaluation-${"0".repeat(32)}`, evaluation_digest: d("pending-digest"), evaluation_status: "completed",
    requirement_results: [{ requirement_id: c.requirements.requirements[0].requirement_id, outcome: "pass", earned_points: 1,
      matched_equivalence_class_ids: [], finding_ids: [], evidence_references: ref }],
    quality: observation(), safety: observation(), findings: [], false_positives: [], scope_deviations: [],
    decision_correctness: observation(), verification_correctness: observation(), evidence_correctness: observation(),
    approval_correctness: observation(), completion_claim_correctness: observation(), under_processing: observation(), over_processing: observation(),
    required_mechanisms: [], unnecessary_mechanisms: [], unsafe_attempted_actions: [],
    evaluator_notes_state: { state: "not_recorded", digest: null, bytes: null },
    privacy: { oracle_content_stored: false, rubric_content_stored: false, hidden_test_content_stored: false, matcher_content_stored: false,
      reference_answer_stored: false, raw_evaluator_prompt_stored: false, private_path_stored: false, secret_customer_or_personal_data_stored: false },
  };
  value.evaluation_id = computeEvaluationId(value); value.evaluation_digest = computeEvaluationDigest(value);
  return value;
}
