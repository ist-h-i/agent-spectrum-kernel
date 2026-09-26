import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { parseJsonRejectDuplicateKeys } from "./ask-benchmark-duplicate-key-json.mjs";
import { CALIBRATION_INPUT_MANIFEST_PATH, CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { computeRequirementDigest, computeRequirementRecordDigest, computeRequirementSetDigest, computeFinalAdmissionRequirementAuthorityDigest, computeFinalAdmissionRecordDigest, computeOutputContractDigest, computeScoringInputFreezeManifestDigest, resolveRequirementAdmissionBindingDigest, computePolicyManifestDigest, computeScoringPolicyDigest } from "./ask-benchmark-scoring-contract.mjs";
import { computeCommandContractDigest, computeVerificationCommandContractDigest, logicalCommandDigest, renderedEventCommandDigest, validateVerificationCommandContract } from "./ask-benchmark-command-evidence.mjs";
import { computeEvaluatorBundleId, computeEvaluatorBundleDigest, computeEvaluatorReferenceDigest, deriveEvaluatorAuthorityManifest, validateEvaluatorSourceIdentity, validateIndependenceStatement } from "./ask-benchmark-evaluator-boundary.mjs";
import { computePortfolioCatalogDigest } from "./ask-benchmark-portfolio-catalog.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_ROOT = "benchmarks/fixtures/checkpoint-b2";
const sha256 = bytes => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const mapId = id => id + "-basis";
const mutationId = id => "remove-" + id + "-basis";
const equivalenceId = id => "equivalent-" + id;
const VERIFIED_PENDING_CANDIDATES = new WeakMap();
const PRIVATE_ASSET_PATHS = Object.freeze({
  evidence_removal_mutations: "evidence-removal-mutations.json",
  equivalent_solution_rules: "equivalent-solutions.json",
});
const IMPLEMENTATION_ALLOWED = Object.freeze({
  "cal-atomic-rule-batch": ["workspace/src/errors.mjs", "workspace/src/index.mjs", "workspace/src/rule-service.mjs", "workspace/src/rule-store.mjs", "workspace/src/validation.mjs", "workspace/test/rule-service.test.mjs"],
  "cal-concurrent-transfer": ["workspace/src/account-store.mjs", "workspace/src/errors.mjs", "workspace/src/index.mjs", "workspace/src/transfer-service.mjs", "workspace/src/validation.mjs", "workspace/test/transfer-service.test.mjs"],
});
const IMPLEMENTATION_REQUIRED = Object.freeze({
  "cal-atomic-rule-batch": ["workspace/src/index.mjs", "workspace/src/rule-service.mjs"],
  "cal-concurrent-transfer": ["workspace/src/index.mjs", "workspace/src/transfer-service.mjs"],
});
const IMPLEMENTATION_NEW_PATH_PREFIXES = Object.freeze({
  "cal-atomic-rule-batch": ["workspace/test/"],
  "cal-concurrent-transfer": ["workspace/test/"],
});

// Public scoring semantics refer only to the frozen agent-visible source.
// Private evaluator rules and answer-bearing material are authored separately.
export const CALIBRATION_REQUIREMENTS = Object.freeze({
  "cal-session-refresh": [
    ["rotation-atomicity", 4, ["workspace/docs/sessions.md", "workspace/src/auth-service.mjs", "workspace/src/session-store.mjs", "workspace/test/auth-service.test.mjs"]],
    ["current-account-authority", 3, ["workspace/docs/session.schema.json", "workspace/src/account-store.mjs", "workspace/src/http-handlers.mjs"]],
    ["expiry-and-recovery", 2, ["workspace/src/tokens.mjs", "workspace/src/errors.mjs", "workspace/test/http-handlers.test.mjs"]],
    ["review-evidence", 1, ["task.md", "workspace/pr.diff", "workspace/package.json"]],
  ],
  "cal-export-lease": [
    ["lease-ownership-and-claim", 4, ["workspace/docs/export-jobs.md", "workspace/src/export-service.mjs", "workspace/src/job-store.mjs"]],
    ["tenant-authorization", 3, ["workspace/docs/job.schema.json", "workspace/src/http-handlers.mjs", "workspace/test/export-service.test.mjs"]],
    ["retry-state-machine", 2, ["workspace/src/retry-policy.mjs", "workspace/src/errors.mjs", "workspace/test/job-store.test.mjs"]],
    ["review-evidence", 1, ["task.md", "workspace/pr.diff", "workspace/package.json"]],
  ],
  "cal-atomic-rule-batch": [
    ["atomic-state-and-version", 4, ["workspace/docs/rule-batches.md", "workspace/src/rule-store.mjs", "workspace/src/rule-service.mjs"]],
    ["strict-input-and-canonicalization", 3, ["workspace/docs/rule-batch.schema.json", "workspace/src/validation.mjs", "workspace/src/errors.mjs"]],
    ["idempotency-and-isolation", 2, ["workspace/src/rule-service.mjs", "workspace/src/rule-store.mjs", "workspace/src/index.mjs"]],
    ["verification-quality", 1, ["task.md", "workspace/package.json", "workspace/test/rule-service.test.mjs"]],
  ],
  "cal-concurrent-transfer": [
    ["atomic-transfer-and-audit", 4, ["workspace/docs/transfers.md", "workspace/src/account-store.mjs", "workspace/src/transfer-service.mjs"]],
    ["concurrent-idempotency", 3, ["workspace/src/serial-executor.mjs", "workspace/src/transfer-service.mjs", "workspace/test/transfer-service.test.mjs"]],
    ["strict-contract-and-isolation", 2, ["workspace/docs/transfer.schema.json", "workspace/src/validation.mjs", "workspace/src/index.mjs"]],
    ["verification-quality", 1, ["task.md", "workspace/package.json", "workspace/test/transfer-service.test.mjs"]],
  ],
});

export function calibrationPublicSource({ root = ROOT, fixtureId }) {
  const sourceId = CALIBRATION_SOURCE_BINDINGS.find(([id]) => id === fixtureId)?.[1];
  const requirements = CALIBRATION_REQUIREMENTS[fixtureId];
  if (!sourceId || !requirements) throw new Error("unknown calibration fixture");
  const inputBytes = readFileSync(resolve(root, CALIBRATION_INPUT_MANIFEST_PATH));
  const input = JSON.parse(inputBytes);
  const visiblePaths = input.fixtures?.[sourceId]?.files?.map(({ path }) => path);
  if (!visiblePaths?.length || new Set(visiblePaths).size !== visiblePaths.length) throw new Error("calibration source input is missing or ambiguous");
  const visible = new Set(visiblePaths);
  for (const [id, weight, paths] of requirements) {
    if (!id || !Number.isInteger(weight) || weight < 1 || !paths.length || paths.some(path => !visible.has(path))) {
      throw new Error("public requirement references non-visible source evidence");
    }
  }
  return { fixtureId, sourceId, inputDigest: sha256(inputBytes), visiblePaths, requirements, fixtureRoot: FIXTURE_ROOT + "/" + fixtureId };
}

export function buildCalibrationEvidenceAuthority(source) {
  const allowed = IMPLEMENTATION_ALLOWED[source.fixtureId] ?? [];
  const required = IMPLEMENTATION_REQUIRED[source.fixtureId] ?? [];
  const newPathPrefixes = IMPLEMENTATION_NEW_PATH_PREFIXES[source.fixtureId] ?? [];
  if (allowed.some(path => !source.visiblePaths.includes(path)) || required.some(path => !allowed.includes(path))) {
    throw new Error("calibration candidate scope differs from frozen source input");
  }
  const scopeBase = { allowed_candidate_paths: allowed,
    required_candidate_paths: required,
    allowed_new_candidate_path_prefixes: newPathPrefixes,
    required_changed_candidate_path_prefixes: newPathPrefixes,
    protected_candidate_paths: source.visiblePaths.filter(path => !allowed.includes(path)),
    unmanaged_additions: "forbidden", unmanaged_deletions: "forbidden" };
  const maps = source.requirements.map(([id, , paths]) => ({ evidence_map_id: mapId(id), agent_visible_paths: paths }));
  // Evidence removal is pending: other visible files can still reveal a defect.
  // No admitted authority may promote this ambiguous claim without review proof.
  const mutations = source.requirements.map(([id, , paths]) => {
    const base = { mutation_id: mutationId(id), requirement_id: id, target_evidence_map_id: mapId(id),
      remove_paths: paths, expected_recoverability_state: "ambiguous", expected_admission_result: "fail" };
    return { ...base, mutation_digest: canonicalDigest(base) };
  });
  const evidenceMap = { schema_version: "1.0.0", fixture_id: source.fixtureId,
    scope_boundary_authority: { ...scopeBase, authority_digest: canonicalDigest(scopeBase) }, maps,
    mutation_contracts: mutations.map(({ mutation_id, target_evidence_map_id, expected_recoverability_state, expected_admission_result, mutation_digest }) =>
      ({ mutation_id, target_evidence_map_id, expected_recoverability_state, expected_admission_result, mutation_digest })) };
  return { evidenceMap, mutationAsset: { fixture_id: source.fixtureId, mutations } };
}

// Frozen scope policy to apply to normalized candidate changes at evaluation time.
// This check cannot itself create pre-result admission authority.
export function validateCalibrationCandidateChangedPaths(source, changes) {
  if (!Array.isArray(changes)) throw new Error("calibration changed-path entries are required");
  const scope = buildCalibrationEvidenceAuthority(source).evidenceMap.scope_boundary_authority;
  const allowed = new Set(scope.allowed_candidate_paths);
  const required = new Set(scope.required_candidate_paths);
  const visible = new Set(source.visiblePaths);
  const seen = new Set();
  const requiredPrefixes = new Set(scope.required_changed_candidate_path_prefixes);
  for (const entry of changes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || Object.keys(entry).sort().join(",") !== "operation,path") {
      throw new Error("invalid calibration changed-path entry");
    }
    const { path, operation } = entry;
    if (typeof path !== "string" || !path.startsWith("workspace/") || path.includes("\\") || path.includes("\0")
        || path.split("/").some(segment => !segment || segment === "." || segment === "..") || seen.has(path)) {
      throw new Error("invalid calibration changed path");
    }
    seen.add(path);
    if (operation === "modify" && allowed.has(path)) {
      required.delete(path);
      for (const prefix of requiredPrefixes) if (path.startsWith(prefix)) requiredPrefixes.delete(prefix);
    } else if (operation === "add" && !visible.has(path)
        && scope.allowed_new_candidate_path_prefixes.some(prefix => path.startsWith(prefix) && path.length > prefix.length)) {
      for (const prefix of requiredPrefixes) if (path.startsWith(prefix)) requiredPrefixes.delete(prefix);
      continue;
    } else {
      throw new Error("calibration candidate change exceeds frozen scope");
    }
  }
  if (required.size) throw new Error("calibration candidate misses required changed paths");
  if (requiredPrefixes.size) throw new Error("calibration candidate misses required changed-path prefix");
  return true;
}

export function buildCalibrationRequirementRecord(source, { catalogDigest, policyManifestDigest, scoringPolicyDigest, admissionRequirementDigest }) {
  const requirements = source.requirements.map(([id, weight]) => {
    const base = { requirement_id: id, requirement_kind: "weighted", max_points: weight, partial_credit_allowed: false,
      evidence_map_ids: [mapId(id)], mutation_ids: [mutationId(id)], equivalence_class_ids: [equivalenceId(id)],
      finding_group_id: id + "-outcome", safety_dimension: ["cal-session-refresh", "cal-export-lease"].includes(source.fixtureId)
        ? "merge_correctness" : "completion_correctness" };
    return { ...base, requirement_digest: computeRequirementDigest(base) };
  });
  const base = { requirement_record_id: "requirement-record-" + source.fixtureId,
    requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
    requirement_record_path: source.fixtureRoot + "/requirement-record.json", fixture_id: source.fixtureId,
    catalog_digest: catalogDigest, policy_manifest_digest: policyManifestDigest,
    scoring_policy_digest: scoringPolicyDigest, admission_record_digest: admissionRequirementDigest,
    requirements, requirement_set_digest: computeRequirementSetDigest(requirements) };
  return { ...base, requirement_record_digest: computeRequirementRecordDigest(base) };
}

export function buildCalibrationCommandContract(source, { root = ROOT } = {}) {
  const base = { command_id: "visible-fixture-tests", purpose: "test",
    working_directory: { path: ".", evidence_requirement: "not_required" }, safe_argv: ["npm", "test"],
    execution_form: "direct_argv", shell_family: null, shell_envelope: null, canonical_script: null,
    requirement: "required", alternative_group_id: null, timeout_ms: 60000 };
  const withDigests = { ...base, logical_command_digest: logicalCommandDigest(base),
    rendered_event_command_digest: renderedEventCommandDigest(base) };
  const command = { ...withDigests, command_contract_digest: computeCommandContractDigest(withDigests) };
  const body = { schema_version: "1.2.0",
    schema_path: "benchmarks/schemas/portfolio-verification-command-contract.schema.json",
    program: "adaptive_ask_verification_command_contract", fixture_id: source.fixtureId,
    fixture_input_digest: source.inputDigest, commands: [command] };
  const contract = { ...body, contract_digest: computeVerificationCommandContractDigest(body) };
  validateVerificationCommandContract(contract, { root });
  return contract;
}

export function validateCalibrationPrivateMutationAuthority(source, mutationAsset) {
  const expected = buildCalibrationEvidenceAuthority(source).mutationAsset;
  if (canonicalDigest(mutationAsset) !== canonicalDigest(expected)) {
    throw new Error("private calibration mutation authority differs from frozen public requirement evidence");
  }
  return expected;
}

export function buildCalibrationEquivalenceAuthority(source) {
  const rules = source.requirements.map(([id]) => {
    const base = { equivalence_class_id: equivalenceId(id), requirement_id: id,
      match_basis: ["observable_behavior", id], property_order_only: false };
    return { ...base, rule_digest: canonicalDigest(base) };
  });
  return { fixture_id: source.fixtureId, rules };
}

function verifyPrivateAssetBytes(bundle, role, bytes, expectedValue) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error("actual private calibration asset bytes are required");
  const inventory = bundle.asset_inventory.filter(asset => asset.role === role);
  if (inventory.length !== 1 || inventory[0].path !== PRIVATE_ASSET_PATHS[role]) throw new Error("private calibration asset role or path is invalid");
  const actual = Buffer.from(bytes);
  if (inventory[0].bytes !== actual.length || inventory[0].sha256 !== sha256(actual)) throw new Error("private calibration asset byte identity drift");
  const parsed = parseJsonRejectDuplicateKeys(actual, "private calibration asset");
  if (stableCanonicalJson(parsed) !== stableCanonicalJson(expectedValue)) throw new Error("private calibration asset semantics differ from frozen public requirements");
  return { role, path: inventory[0].path, bytes: actual.length, sha256: inventory[0].sha256 };
}

export function assertCalibrationPrivateAssets(source, { bundle, mutationBytes, equivalenceBytes }) {
  const expectedMutation = buildCalibrationEvidenceAuthority(source).mutationAsset;
  const expectedEquivalence = buildCalibrationEquivalenceAuthority(source);
  const mutation = verifyPrivateAssetBytes(bundle, "evidence_removal_mutations", mutationBytes, expectedMutation);
  const equivalence = verifyPrivateAssetBytes(bundle, "equivalent_solution_rules", equivalenceBytes, expectedEquivalence);
  return { mutation_digest: canonicalDigest(expectedMutation), equivalence_digest: canonicalDigest(expectedEquivalence), mutation, equivalence };
}

export function buildPendingCalibrationCandidate({ root = ROOT, fixtureId, privateAuthority }) {
  // The reviewed promotion contract is intentionally separate. This builder
  // cannot turn pending inputs into an admitted scoring authority.
  const source = calibrationPublicSource({ root, fixtureId });
  const { bundle, independenceStatement, mutationBytes, equivalenceBytes } = privateAuthority ?? {};
  if (!bundle || !independenceStatement || !mutationBytes || !equivalenceBytes) throw new Error("complete private calibration candidate is required");
  assertBenchmarkSchemaInstance(bundle, { schemaPath: resolve(root, "benchmarks/schemas/private-evaluator-bundle.schema.json"), label: "private calibration bundle" });
  if (bundle.evaluator_bundle_id !== computeEvaluatorBundleId(bundle) || bundle.evaluator_bundle_digest !== computeEvaluatorBundleDigest(bundle)) throw new Error("private calibration bundle identity drift");
  if (bundle.fixture_identity.fixture_id !== fixtureId || bundle.fixture_identity.suite !== "calibration"
      || bundle.input_identity.fixture_input_digest !== source.inputDigest) throw new Error("private calibration bundle is transplanted");
  if (bundle.review.status !== "pending" || bundle.review.reviewer_count < 1) throw new Error("public candidate requires pending independent review");
  validateEvaluatorSourceIdentity({ identity: bundle.evaluator_source_identity, root,
    expectedRevision: bundle.evaluator_revision, expectedGeneratorSourceDigest: bundle.generator.source_digest,
    label: "calibration evaluator source identity" });
  validateIndependenceStatement({ statement: independenceStatement, manifest: bundle, root });
  const privateDigests = assertCalibrationPrivateAssets(source, { bundle, mutationBytes, equivalenceBytes });
  const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json")));
  const policy = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-policy-manifest.json")));
  const scoring = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json")));
  if (catalog.catalog_digest !== computePortfolioCatalogDigest(catalog)
      || policy.manifest_digest !== computePolicyManifestDigest(policy)
      || scoring.policy_digest !== computeScoringPolicyDigest(scoring)) throw new Error("portfolio policy digest drift");
  const catalogFixture = catalog.fixtures.find(entry => entry.fixture_id === fixtureId);
  if (!catalogFixture || catalogFixture.fixture_role !== "calibration" || catalogFixture.aggregate_eligible !== false
      || catalogFixture.task_class !== bundle.fixture_identity.task_class) throw new Error("calibration catalog identity drift");
  const { evidenceMap } = buildCalibrationEvidenceAuthority(source);
  const command = buildCalibrationCommandContract(source, { root });
  const admissionBase = {
    fixture_id: fixtureId, catalog_digest: catalog.catalog_digest, input_manifest_digest: source.inputDigest,
    evaluator_reference_schema: "benchmarks/schemas/evaluator-reference.schema.json",
    evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest,
    evaluator_byte_count: bundle.asset_inventory.reduce((sum, asset) => sum + asset.bytes, 0),
    evaluator_requirement_count: source.requirements.length,
    evidence_map_ids: evidenceMap.maps.map(entry => entry.evidence_map_id),
    mutation_set_ids: buildCalibrationEvidenceAuthority(source).mutationAsset.mutations.map(entry => entry.mutation_id),
    reviewer_record_id: "review-" + fixtureId + "-pending", admission_revision: 1,
    admission_status: "admission_pending", evaluator_source_identity: bundle.evaluator_source_identity,
  };
  admissionBase.requirement_authority_digest = computeFinalAdmissionRequirementAuthorityDigest(admissionBase);
  const requirement = buildCalibrationRequirementRecord(source, {
    catalogDigest: catalog.catalog_digest, policyManifestDigest: policy.manifest_digest,
    scoringPolicyDigest: scoring.policy_digest, admissionRequirementDigest: admissionBase.requirement_authority_digest,
  });
  const candidate = { source, repositoryRoot: root, catalog, policy, scoring, catalogFixture, bundle, privateDigests,
    catalogRawDigest: sha256(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"))),
    policyRawDigest: sha256(readFileSync(resolve(root, "benchmarks/portfolio-policy-manifest.json"))),
    scoringRawDigest: sha256(readFileSync(resolve(root, "benchmarks/portfolio-scoring-policy.json"))),
    evidenceMap, command, admissionBase, requirement };
  VERIFIED_PENDING_CANDIDATES.set(candidate, canonicalDigest(candidate));
  return candidate;
}

export function buildPendingCalibrationPublicArtifacts(candidate) {
  if (!candidate || VERIFIED_PENDING_CANDIDATES.get(candidate) !== canonicalDigest(candidate)
      || candidate.admissionBase?.admission_status !== "admission_pending"
      || candidate.bundle?.review?.status !== "pending") throw new Error("verified pending candidate authority is required");
  const { source, bundle, evidenceMap, command, requirement, catalog, policy, scoring, catalogFixture } = candidate;
  const root = source.fixtureRoot;
  const documents = new Map();
  const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
  const put = (name, value) => {
    const path = root + "/" + name;
    documents.set(path, jsonBytes(value));
    return path;
  };
  const rawAt = path => {
    const value = documents.get(path);
    if (!value) throw new Error("pending public artifact dependency is missing");
    return sha256(value);
  };
  const bindAt = (path, semantic) => ({ path, raw_byte_digest: rawAt(path), semantic_digest: semantic });
  put("evidence-map.json", evidenceMap);
  put("verification-command-contract.json", command);
  put("requirement-record.json", requirement);
  const authorityBuffers = new Map([
    [CALIBRATION_INPUT_MANIFEST_PATH, readFileSync(resolve(candidate.repositoryRoot ?? ROOT, CALIBRATION_INPUT_MANIFEST_PATH))],
    [root + "/evidence-map.json", documents.get(root + "/evidence-map.json")],
    [root + "/verification-command-contract.json", documents.get(root + "/verification-command-contract.json")],
    [root + "/requirement-record.json", documents.get(root + "/requirement-record.json")],
  ]);
  const manifest = deriveEvaluatorAuthorityManifest({ buffers: authorityBuffers, evaluatorRevision: bundle.evaluator_revision, fixtureId: source.fixtureId });
  const manifestPath = put("evaluator-authority-manifest.json", manifest);
  const authorityBinding = { evaluator_authority_manifest_path: manifestPath,
    evaluator_authority_manifest_raw_sha256: rawAt(manifestPath), evaluator_authority_manifest_digest: manifest.manifest_digest };
  const referenceBase = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/evaluator-reference.schema.json",
    program: "adaptive_ask_evaluator_reference", evaluator_bundle_id: bundle.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_bundle_schema_version: bundle.schema_version,
    fixture_id: source.fixtureId, fixture_input_digest: source.inputDigest,
    task_class: catalogFixture.task_class, suite: "calibration", evaluator_revision: bundle.evaluator_revision,
    evaluator_source_identity: bundle.evaluator_source_identity, generator_identity: canonicalDigest(bundle.generator),
    independence_statement_digest: bundle.independence.statement_digest, review_record_digest: bundle.review.record_digest,
    ...authorityBinding, storage_class: "private_evaluator",
  };
  const reference = { ...referenceBase, public_metadata_digest: computeEvaluatorReferenceDigest(referenceBase) };
  const referencePath = put("evaluator-reference.json", reference);
  const outputBase = {
    output_contract_id: "output-contract-" + source.fixtureId,
    output_contract_schema_path: "benchmarks/schemas/portfolio-output-contract.schema.json",
    output_contract_path: root + "/output-contract.json", fixture_id: source.fixtureId,
    catalog_digest: catalog.catalog_digest, policy_manifest_digest: policy.manifest_digest,
    evaluator_public_reference_path: referencePath, evaluator_public_reference_digest: reference.public_metadata_digest,
    verification_command_contract_path: root + "/verification-command-contract.json",
    verification_command_contract_digest: command.contract_digest,
    scope_boundary_authority_path: root + "/evidence-map.json",
    scope_boundary_authority_digest: evidenceMap.scope_boundary_authority.authority_digest,
    declares_findings: calibrationOutputKind(source).declares_findings, ...authorityBinding,
  };
  const output = { ...outputBase, output_contract_digest: computeOutputContractDigest(outputBase) };
  const outputPath = put("output-contract.json", output);
  const admissionBase = { ...candidate.admissionBase, ...authorityBinding };
  const admission = { ...admissionBase, admission_digest: computeFinalAdmissionRecordDigest(admissionBase) };
  if (requirement.admission_record_digest !== resolveRequirementAdmissionBindingDigest(admission)) throw new Error("pending requirement and admission authority differ");
  const admissionPath = put("final-admission-record.json", admission);
  const metadataBase = {
    schema_version: "1.0.0", fixture_id: source.fixtureId, fixture_role: "calibration",
    suite: "calibration", task_class: catalogFixture.task_class, domain: catalogFixture.domain,
    difficulty: catalogFixture.difficulty, repetitions: catalogFixture.repetitions,
    risk_boundary: catalogFixture.risk_boundary, capability_families: catalogFixture.capability_families,
    evidence_topologies: catalogFixture.evidence_topologies, outcome_dimensions: catalogFixture.outcome_dimensions,
    output_contract_type: calibrationOutputKind(source).output_contract_type, requirement_record_id: requirement.requirement_record_id,
    output_contract_id: output.output_contract_id, evaluator_bundle_id: bundle.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.evaluator_bundle_digest, evaluator_byte_count: admission.evaluator_byte_count,
    review_status: "pending_independent_review", measured_execution_performed: false,
  };
  const metadata = { ...metadataBase, metadata_digest: canonicalDigest(metadataBase) };
  put("metadata.json", metadata);
  const base = {
    schema_version: "1.0.0", schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
    program: "adaptive_ask_scoring_input_freeze", fixture_id: source.fixtureId,
    fixture_input_digest: source.inputDigest,
    catalog: { path: "benchmarks/portfolio-catalog.json", raw_byte_digest: candidate.catalogRawDigest, semantic_digest: catalog.catalog_digest },
    policy_manifest: { path: "benchmarks/portfolio-policy-manifest.json", raw_byte_digest: candidate.policyRawDigest, semantic_digest: policy.manifest_digest },
    scoring_policy: { path: "benchmarks/portfolio-scoring-policy.json", raw_byte_digest: candidate.scoringRawDigest, semantic_digest: scoring.policy_digest },
    admission_record: bindAt(admissionPath, admission.admission_digest),
    requirement_record: { path: root + "/requirement-record.json", raw_byte_digest: rawAt(root + "/requirement-record.json"),
      record_digest: requirement.requirement_record_digest, set_digest: requirement.requirement_set_digest },
    output_contract: bindAt(outputPath, output.output_contract_digest),
    evaluator_public_reference: bindAt(referencePath, reference.public_metadata_digest),
    verification_command_contract: bindAt(root + "/verification-command-contract.json", command.contract_digest),
    evidence_map: bindAt(root + "/evidence-map.json", canonicalDigest(evidenceMap)),
    evaluator_authority_manifest: bindAt(manifestPath, manifest.manifest_digest),
    freeze_revision: "issue-291-calibration-pending-r1",
  };
  const freeze = { ...base, manifest_digest: computeScoringInputFreezeManifestDigest(base) };
  put("scoring-input-freeze-manifest.json", freeze);
  return { documents, admission, requirement, reference, output, manifest, freeze, metadata };
}

export function calibrationOutputKind(source) {
  if (!CALIBRATION_REQUIREMENTS[source?.fixtureId]) throw new Error("unknown calibration fixture");
  const review = ["cal-session-refresh", "cal-export-lease"].includes(source.fixtureId);
  return { declares_findings: review, output_contract_type: review ? "findings_producing" : "implementation_producing" };
}
