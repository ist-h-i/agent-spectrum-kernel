// Contract exercise only. Every review, private asset, and host observation
// produced here is synthetic and must never be used as Issue #291 authority.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest } from "../content-addressed-store.mjs";
import { CALIBRATION_SOURCE_BINDINGS } from "../ask-benchmark-calibration-source.mjs";
import {
  buildCalibrationEvidenceAuthority, buildCalibrationEquivalenceAuthority,
  buildPendingCalibrationCandidate, buildPendingCalibrationPublicArtifacts, calibrationPublicSource,
} from "../ask-benchmark-calibration-public-authority.mjs";
import {
  computeEvaluatorBundleDigest, computeEvaluatorBundleId, computeIndependenceStatementDigest,
  deriveEvaluatorDependencyGraph,
} from "../ask-benchmark-evaluator-boundary.mjs";
import {
  computeAdmissionDecisionDigest, computeAdmissionDecisionId,
  computeAdmissionReviewAuthorityDigest, computeAdmissionReviewAuthorityId,
} from "../ask-benchmark-admission-decision.mjs";

const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const read = path => JSON.parse(readFileSync(path, "utf8"));
function write(path, bytes, { replace = false } = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { flag: replace ? "w" : "wx", mode: 0o600 });
}

function sourceIdentity(root, revision) {
  const graph = deriveEvaluatorDependencyGraph({ root, baseRevision: revision });
  const files = graph.node_inventory.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
  const generatorDigest = digest(readFileSync(fileURLToPath(import.meta.url)));
  return { base_git_revision: revision, source_tree_digest: canonicalDigest(files),
    generator_source_digest: generatorDigest, source_files: files, dependency_graph: graph };
}

function privateCandidate({ root, privateBase, fixtureId, revision, identity }) {
  const source = calibrationPublicSource({ root, fixtureId });
  const taskClass = CALIBRATION_SOURCE_BINDINGS.find(([id]) => id === fixtureId)?.[2];
  const privateRoot = resolve(privateBase, fixtureId);
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const generator = { id: "issue291_synthetic_contract_test", version: "1.0.0", source_digest: identity.generator_source_digest };
  const inputPath = resolve(root, "benchmarks/fixtures/checkpoint-b2/input-manifest.json");
  const inputBytes = readFileSync(inputPath);
  const unused = { state: "not_used", evidence_basis: "Disposable synthetic contract test; no prior answer or measured output is consumed." };
  const statementBase = { schema_version: "1.1.0", fixture_id: fixtureId, generator_role_identity: generator,
    generation_date: "2026-09-27", generation_revision: revision, evaluator_source_identity: identity,
    frozen_candidate_input: { public_source_path: "benchmarks/fixtures/checkpoint-b2/input-manifest.json",
      raw_byte_digest: digest(inputBytes), digest: canonicalDigest(JSON.parse(inputBytes)) },
    source_classification: ["synthetic_test_fixture_input"], excluded_source_classification: ["public_answer_oracle", "measured_output"],
    measured_output_used: false, measured_result_used: false,
    author_scratch: { used: false, scope: "Disposable synthetic contract fixture only", contamination_assessment: unused },
    contaminated_issues_193_196_as_oracle_source: unused, issue_194_body_used: unused,
    issue_194_edit_history_used: unused, issue_194_legacy_answer_structure_used: unused };
  const statement = { ...statementBase, statement_digest: computeIndependenceStatementDigest(statementBase) };
  const assetSources = [
    ["evidence_removal_mutations", "evidence-removal-mutations.json", json(buildCalibrationEvidenceAuthority(source).mutationAsset)],
    ["equivalent_solution_rules", "equivalent-solutions.json", json(buildCalibrationEquivalenceAuthority(source))],
    ["independence_provenance", "independence-provenance.json", json(statement)],
    ["oracle", "oracle.json", json({ synthetic_test_only: true, fixture_id: fixtureId, answer: "dummy" })],
  ].sort(([a], [b]) => a.localeCompare(b));
  const assets = assetSources.map(([role, path, bytes]) => {
    write(resolve(privateRoot, path), bytes);
    return { role, path, sha256: digest(bytes), bytes: bytes.length, media_type: "application/json", required: true };
  });
  const bundle = { schema_version: "1.0.0", schema_path: "benchmarks/schemas/private-evaluator-bundle.schema.json",
    program: "adaptive_ask_private_evaluator_bundle", execution_budget_ms: 120000,
    evaluator_bundle_id: `evaluator-${"0".repeat(64)}`, evaluator_bundle_digest: digest(Buffer.from("pending")),
    fixture_identity: { fixture_id: fixtureId, task_class: taskClass, suite: "calibration" },
    input_identity: { fixture_input_digest: source.inputDigest }, evaluator_revision: revision,
    evaluator_source_identity: identity, generator,
    independence: { statement_digest: statement.statement_digest, generated_without_agent_output: true,
      public_answer_sources_used: false, measured_agent_access_allowed: false },
    review: { record_digest: canonicalDigest({ fixture_id: fixtureId, synthetic_review_pending: true }), status: "pending", reviewer_count: 1 },
    asset_inventory: assets, capabilities: { automated_evaluation: true, manual_evaluation: true },
    boundaries: { private_evaluator_bundle: true, public_repository_allowed: false,
      public_ci_artifact_allowed: false, contains_answer_bearing_content: true },
    dependency_graph: identity.dependency_graph };
  bundle.evaluator_bundle_id = computeEvaluatorBundleId(bundle);
  bundle.evaluator_bundle_digest = computeEvaluatorBundleDigest(bundle);
  const manifestPath = resolve(privateRoot, "private-evaluator-bundle.json");
  write(manifestPath, json(bundle));
  return { privateRoot, manifestPath, bundle, independenceStatement: statement,
    mutationBytes: assetSources.find(([role]) => role === "evidence_removal_mutations")[2],
    equivalenceBytes: assetSources.find(([role]) => role === "equivalent_solution_rules")[2] };
}

export function createIssue291SyntheticPendingPackages({ root, privateBase, revision }) {
  const identity = sourceIdentity(root, revision);
  const privateCandidates = {};
  for (const [fixtureId] of CALIBRATION_SOURCE_BINDINGS) {
    const privateAuthority = privateCandidate({ root, privateBase, fixtureId, revision, identity });
    const candidate = buildPendingCalibrationCandidate({ root, fixtureId, privateAuthority });
    const built = buildPendingCalibrationPublicArtifacts(candidate);
    for (const [path, bytes] of built.documents) write(resolve(root, path), bytes, { replace: true });
    privateCandidates[fixtureId] = { privateRoot: privateAuthority.privateRoot, manifestPath: privateAuthority.manifestPath };
  }
  return privateCandidates;
}

export function createIssue291SyntheticReviewOverlays({ root, privateBase, candidates, reviewedHead }) {
  const admissionSourcesByFixture = {};
  for (const [fixtureId] of CALIBRATION_SOURCE_BINDINGS) {
    const publicRoot = resolve(root, "benchmarks/fixtures/checkpoint-b2", fixtureId);
    const admissionPath = resolve(publicRoot, "final-admission-record.json");
    const requirementPath = resolve(publicRoot, "requirement-record.json");
    const referencePath = resolve(publicRoot, "evaluator-reference.json");
    const freezePath = resolve(publicRoot, "scoring-input-freeze-manifest.json");
    const admission = read(admissionPath); const requirement = read(requirementPath);
    const reference = read(referencePath); const freeze = read(freezePath);
    const archive = Buffer.from(`SYNTHETIC CONTRACT TEST ONLY: ${fixtureId}; no independent review occurred.\n`);
    const reviewArchivePath = resolve(privateBase, "reviews", `${fixtureId}-archive.txt`);
    write(reviewArchivePath, archive);
    const reviewFields = { review_status: "approved", author_self_approval: false,
      reviewer_type: "independent_agent", reviewer_record_id: `synthetic_test_review_${fixtureId}`,
      reviewer_count: 1, reviewed_at: "2026-09-27T00:00:00Z",
      reviewed_repository: "ist-h-i/agent-spectrum-kernel", reviewed_pull_request: 1,
      reviewed_head_revision: reviewedHead, blocking_finding_count: 0,
      review_evidence: { archive_sha256: digest(archive), archive_bytes: archive.length } };
    const authorityBase = { schema_version: "1.0.0",
      schema_path: "benchmarks/schemas/portfolio-admission-review-authority.schema.json",
      program: "adaptive_ask_portfolio_admission_review_authority", authority_revision: 1,
      fixture_id: fixtureId, ...reviewFields };
    authorityBase.authority_id = computeAdmissionReviewAuthorityId(authorityBase);
    const reviewAuthority = { ...authorityBase, authority_digest: computeAdmissionReviewAuthorityDigest(authorityBase) };
    const reviewAuthorityPath = resolve(privateBase, "reviews", `${fixtureId}-authority.json`);
    const authorityBytes = json(reviewAuthority); write(reviewAuthorityPath, authorityBytes);
    const relativePublic = name => `benchmarks/fixtures/checkpoint-b2/${fixtureId}/${name}`;
    const decisionBase = { schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-admission-decision.schema.json",
      program: "adaptive_ask_portfolio_admission_decision", decision_revision: 1, fixture_id: fixtureId,
      decision_status: "admitted", ...reviewFields,
      evaluator: { evaluator_revision: reference.evaluator_revision, evaluator_bundle_id: reference.evaluator_bundle_id,
        evaluator_bundle_digest: reference.evaluator_bundle_digest, evaluator_bundle_bytes: admission.evaluator_byte_count },
      evaluator_public_reference_digest: reference.public_metadata_digest,
      frozen_admission_authority: { path: relativePublic("final-admission-record.json"),
        raw_byte_digest: digest(readFileSync(admissionPath)), semantic_digest: admission.admission_digest,
        requirement_authority_digest: admission.requirement_authority_digest },
      frozen_requirement_record: { path: relativePublic("requirement-record.json"),
        raw_byte_digest: digest(readFileSync(requirementPath)), record_digest: requirement.requirement_record_digest,
        set_digest: requirement.requirement_set_digest },
      frozen_scoring_input_manifest: { path: relativePublic("scoring-input-freeze-manifest.json"),
        raw_byte_digest: digest(readFileSync(freezePath)), semantic_digest: freeze.manifest_digest } };
    decisionBase.decision_id = computeAdmissionDecisionId(decisionBase);
    const decision = { ...decisionBase, decision_digest: computeAdmissionDecisionDigest(decisionBase) };
    write(resolve(root, "benchmarks/fixtures/admission-decision", `issue291-synthetic-${fixtureId}.json`), json(decision));
    admissionSourcesByFixture[fixtureId] = { ...candidates[fixtureId], reviewAuthorityPath,
      reviewAuthoritySourceDigest: digest(authorityBytes), reviewArchivePath };
  }
  return admissionSourcesByFixture;
}
