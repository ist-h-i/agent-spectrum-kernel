#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  FIXTURE_ROOT_RELATIVE,
  validateActualPrivateEvaluator,
  validateMnDocConfigCorrectionPublicFixture,
} from "./ask-benchmark-mn-doc-config-correction.mjs";
import {
  computeAdmissionDecisionDigest,
  computeAdmissionDecisionId,
  computeAdmissionReviewAuthorityDigest,
  computeAdmissionReviewAuthorityId,
} from "./ask-benchmark-admission-decision.mjs";
import {
  computeEvaluatorReferenceDigest,
  createSealedEvaluatorExecutionForTest,
  deriveEvaluatorAuthorityManifest,
  evaluatorAuthorityPathsForFixture,
  executeSealedEvaluatorForTest,
  readEvaluatorAuthorityAnchorFromFreeze,
  validateEvaluatorSourceIdentity,
  validateEvaluatorAuthorityManifest,
  validatePrivateEvaluatorFragment,
  verifyPrivateEvaluatorBundle,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { buildPortfolioPlan, readExecutionAdmissionEvidenceManifest, resolvePortfolioExecutionAdmission } from "./ask-benchmark-plan.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, materializePortfolio } from "./ask-benchmark-materialize.mjs";
import { validateEquivalenceAuthority, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMnDocConfigCorrectionProductionAuthority, writeMnDocConfigCorrectionProductionAuthority } from "./ask-benchmark-mn-doc-config-correction-authority.mjs";
import {
  generateMnDocConfigCorrectionReviewArchive,
  validateReviewArchiveInventory,
  validateReviewArchiveInventoryAgainstSources,
  verifyMnDocConfigCorrectionReviewArchive,
} from "./ask-benchmark-mn-doc-config-correction-review-archive.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
const work = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-mn-doc-config-correction-")));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function makeTreeRemovable(path) {
  if (!existsSync(path)) return;
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return;
  if (status.isDirectory()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeTreeRemovable(resolve(path, name));
  } else if (status.isFile()) chmodSync(path, 0o600);
}

function validationRoot(name) {
  const target = resolve(work, name);
  mkdirSync(resolve(target, "benchmarks/fixtures/checkpoint-b2"), { recursive: true });
  mkdirSync(resolve(target, "benchmarks/schemas"), { recursive: true });
  cpSync(fixtureRoot, resolve(target, FIXTURE_ROOT_RELATIVE), { recursive: true });
  cpSync(resolve(root, "benchmarks/adaptive-portfolio.config.json"), resolve(target, "benchmarks/adaptive-portfolio.config.json"));
  cpSync(resolve(root, "benchmarks/schemas/portfolio-verification-command-contract.schema.json"), resolve(target, "benchmarks/schemas/portfolio-verification-command-contract.schema.json"));
  return target;
}

function rejectsPublicMutation(name, mutate, pattern) {
  const target = validationRoot(name);
  mutate(target);
  assert.throws(() => validateMnDocConfigCorrectionPublicFixture({ root: target }), pattern, name);
}

function authorityBuffers(fixtureId) {
  const { bindingPaths } = evaluatorAuthorityPathsForFixture(fixtureId);
  return new Map(bindingPaths.map((path) => [path, readFileSync(resolve(root, path))]));
}

function executionAdmissionRoot(name) {
  const target = resolve(work, `execution-${name}`);
  mkdirSync(resolve(target, "benchmarks/fixtures/checkpoint-b2"), { recursive: true });
  mkdirSync(resolve(target, "benchmarks/fixtures/admission-decision"), { recursive: true });
  cpSync(resolve(root, "benchmarks/schemas"), resolve(target, "benchmarks/schemas"), { recursive: true });
  cpSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update"), resolve(target, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update"), { recursive: true });
  cpSync(fixtureRoot, resolve(target, FIXTURE_ROOT_RELATIVE), { recursive: true });
  cpSync(resolve(root, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json"), resolve(target, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json"));
  execFileSync("git", ["init", "--quiet"], { cwd: target });
  execFileSync("git", ["add", "."], { cwd: target });
  execFileSync("git", ["-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "commit", "--quiet", "-m", "Initialize execution admission test repository"], { cwd: target });
  return target;
}

function fullRepositoryClone(name) {
  const target = resolve(work, `repository-${name}`);
  execFileSync("git", ["clone", "--quiet", "--no-local", root, target]);
  return target;
}

function commitRepository(target, message) {
  execFileSync("git", ["add", "-A"], { cwd: target });
  execFileSync("git", ["-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "commit", "--quiet", "-m", message], { cwd: target });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: target, encoding: "utf8" }).trim();
}

function boundaryRoots(name) {
  const base = resolve(work, `boundaries-${name}`);
  const roots = {
    materializedPath: resolve(base, "materialized"),
    selectionState: resolve(base, "selection"),
    runDir: resolve(base, "run"),
    normalizedResultsPath: resolve(base, "normalized"),
  };
  for (const path of Object.values(roots)) mkdirSync(path, { recursive: true });
  writeJson(resolve(roots.materializedPath, "materialization-manifest.json"), {});
  writeJson(resolve(roots.selectionState, "selection-state.json"), {});
  writeJson(resolve(roots.runDir, "run-identity.json"), {});
  writeJson(resolve(roots.normalizedResultsPath, "normalized-results-root.json"), {});
  return roots;
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function treeSnapshot(path) {
  const inventory = [];
  const visit = (directory, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const status = lstatSync(absolute);
      if (status.isDirectory()) visit(absolute, relativePath);
      else if (status.isFile()) inventory.push({ path: relativePath, bytes: status.size, digest: digestBytes(readFileSync(absolute)) });
      else inventory.push({ path: relativePath, type: status.isSymbolicLink() ? "symlink" : "other" });
    }
  };
  visit(path);
  return inventory;
}

function filesystemTreeProjection(path) {
  const inventory = [];
  const visit = (directory, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const status = lstatSync(absolute);
      if (status.isDirectory()) {
        inventory.push({ path: `${relativePath}/`, type: "directory", mode: status.mode & 0o777 });
        visit(absolute, relativePath);
      } else if (status.isFile()) inventory.push({ path: relativePath, type: "file", mode: status.mode & 0o777, bytes: status.size, digest: digestBytes(readFileSync(absolute)) });
      else inventory.push({ path: relativePath, type: status.isSymbolicLink() ? "symlink" : "other", mode: status.mode & 0o777 });
    }
  };
  visit(path);
  return inventory;
}

function privateFragmentProjection(fragment) {
  return {
    classification: fragment.classification,
    scoring_ready: fragment.scoring_ready,
    requirement_results: fragment.requirement_results.map((result) => [
      result.requirement_id,
      result.outcome,
      result.finding_ids,
      result.scope_deviation_references,
      result.verification_evidence_state ?? null,
    ]),
    findings: fragment.findings.map(({ finding_id, category, severity }) => [finding_id, category, severity]),
    scope_deviations: fragment.scope_deviations.map(({ finding_id, category, severity }) => [finding_id, category, severity]),
    observations: {
      verification_correctness: fragment.verification_correctness.state,
      evidence_correctness: fragment.evidence_correctness.state,
      under_processing: fragment.under_processing.state,
      over_processing: fragment.over_processing.state,
    },
  };
}

function archiveInventoryNegativeTests() {
  const sourceRoot = resolve(work, "archive-inventory-sources");
  const privateRoot = resolve(sourceRoot, "private-source");
  const caseRoot = resolve(sourceRoot, "case-source");
  mkdirSync(privateRoot, { recursive: true });
  mkdirSync(resolve(caseRoot, "target-deletion/docs"), { recursive: true });
  mkdirSync(resolve(caseRoot, "target-directory/docs/worker-retries.md"), { recursive: true });
  writeFileSync(resolve(privateRoot, "asset.json"), "{}\n");
  const fileBytes = readFileSync(resolve(privateRoot, "asset.json"));
  const entries = [
    { archive_path: "cases/", entry_type: "directory", mode: 0o755, category: "package", source_scope: "package", source_path: "cases" },
    { archive_path: "cases/target-deletion/", entry_type: "directory", mode: 0o755, category: "case", source_scope: "private_case_root", source_path: "target-deletion" },
    { archive_path: "cases/target-deletion/docs/", entry_type: "directory", mode: 0o755, category: "case", source_scope: "private_case_root", source_path: "target-deletion/docs" },
    { archive_path: "cases/target-directory/", entry_type: "directory", mode: 0o755, category: "case", source_scope: "private_case_root", source_path: "target-directory" },
    { archive_path: "cases/target-directory/docs/", entry_type: "directory", mode: 0o755, category: "case", source_scope: "private_case_root", source_path: "target-directory/docs" },
    { archive_path: "cases/target-directory/docs/worker-retries.md/", entry_type: "directory", mode: 0o755, category: "case", source_scope: "private_case_root", source_path: "target-directory/docs/worker-retries.md" },
    { archive_path: "private/", entry_type: "directory", mode: 0o755, category: "package", source_scope: "package", source_path: "private" },
    { archive_path: "private/asset.json", entry_type: "file", mode: 0o644, category: "private", source_scope: "private_evaluator_root", source_path: "asset.json", bytes: fileBytes.length, sha256: digestBytes(fileBytes) },
  ];
  const expected = ["REVIEW-MANIFEST.json", ...entries.map(({ archive_path }) => archive_path)];
  assert.doesNotThrow(() => validateReviewArchiveInventory(entries, expected));
  assert.doesNotThrow(() => validateReviewArchiveInventoryAgainstSources(entries, { root: sourceRoot, privateRoot, caseRoot }));
  const mutation = (mutate) => { const value = structuredClone(entries); mutate(value); return value; };
  assert.throws(() => validateReviewArchiveInventory(mutation((value) => value.splice(2, 1)), expected), /missing|required|differs/u, "missing directory inventory entry must be rejected");
  assert.throws(() => validateReviewArchiveInventory(mutation((value) => value.splice(3, 0, structuredClone(value[2]))), ["REVIEW-MANIFEST.json", ...mutation((value) => value.splice(3, 0, structuredClone(value[2]))).map(({ archive_path }) => archive_path)]), /duplicate/u, "duplicate directory inventory entry must be rejected");
  assert.throws(() => validateReviewArchiveInventory(mutation((value) => { [value[0], value[1]] = [value[1], value[0]]; }), expected), /reordered/u, "reordered inventory must be rejected");
  assert.throws(() => validateReviewArchiveInventory(entries, [...expected].reverse()), /expected entry inventory differs/u, "reordered expected archive entries must be rejected");
  assert.throws(() => validateReviewArchiveInventoryAgainstSources(mutation((value) => { value[2].mode = 0o700; }), { root: sourceRoot, privateRoot, caseRoot }), /mode drift/u, "wrong directory mode must be rejected");
  assert.throws(() => validateReviewArchiveInventoryAgainstSources(mutation((value) => { value[2] = { ...value[2], archive_path: "cases/target-deletion/docs", entry_type: "file", bytes: 0, sha256: digestBytes(Buffer.alloc(0)) }; }), { root: sourceRoot, privateRoot, caseRoot }), /file-for-directory/u, "file-for-directory inventory entry must be rejected");
  assert.throws(() => validateReviewArchiveInventoryAgainstSources(mutation((value) => { value[7] = { archive_path: "private/asset.json/", entry_type: "directory", mode: 0o644, category: "private", source_scope: "private_evaluator_root", source_path: "asset.json" }; }), { root: sourceRoot, privateRoot, caseRoot }), /directory-for-file/u, "directory-for-file inventory entry must be rejected");
}

const REVIEW_PROJECTION_FIELDS = Object.freeze([
  "review_status",
  "author_self_approval",
  "reviewer_type",
  "reviewer_record_id",
  "reviewer_count",
  "reviewed_at",
  "reviewed_repository",
  "reviewed_pull_request",
  "reviewed_head_revision",
  "blocking_finding_count",
  "review_evidence",
]);

function externalAdmissionEvidence(name, { archiveBytes, authorityMutate = null, decisionMutate = null } = {}) {
  const directory = resolve(work, `external-admission-${name}`);
  mkdirSync(directory);
  const archivePath = resolve(directory, "review.archive");
  writeFileSync(archivePath, archiveBytes ?? Buffer.from(`independent execution admission review ${name}\n`));
  const checkedDecision = readJson(resolve(root, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json"));
  const authorityDraft = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/portfolio-admission-review-authority.schema.json",
    program: "adaptive_ask_portfolio_admission_review_authority",
    authority_id: "",
    authority_revision: checkedDecision.decision_revision,
    fixture_id: checkedDecision.fixture_id,
    ...Object.fromEntries(REVIEW_PROJECTION_FIELDS.map((field) => [field, structuredClone(checkedDecision[field])])),
  };
  authorityDraft.review_evidence = { archive_sha256: digestBytes(readFileSync(archivePath)), archive_bytes: readFileSync(archivePath).length };
  authorityMutate?.(authorityDraft);
  authorityDraft.authority_id = computeAdmissionReviewAuthorityId(authorityDraft);
  const authority = { ...authorityDraft, authority_digest: computeAdmissionReviewAuthorityDigest(authorityDraft) };
  const authorityPath = resolve(directory, "review-authority.json");
  writeJson(authorityPath, authority);

  const decision = structuredClone(checkedDecision);
  for (const field of REVIEW_PROJECTION_FIELDS) decision[field] = structuredClone(authority[field]);
  decision.decision_revision = authority.authority_revision;
  decision.decision_id = computeAdmissionDecisionId(decision);
  decisionMutate?.(decision);
  decision.decision_id = computeAdmissionDecisionId(decision);
  decision.decision_digest = computeAdmissionDecisionDigest(decision);
  const decisionPath = resolve(directory, "decision.json");
  writeJson(decisionPath, decision);
  return {
    reviewAuthorityPath: authorityPath,
    reviewAuthoritySourceDigest: digestBytes(readFileSync(authorityPath)),
    reviewArchivePath: archivePath,
    callerDecisionPath: decisionPath,
  };
}

function syntheticRepositoryAdmission(repository, name, { archiveBytes, reviewedAt, reviewerRecordId }) {
  const fixtureId = "mn-doc-config-correction";
  const fixtureDirectory = resolve(repository, "benchmarks/fixtures/checkpoint-b2", fixtureId);
  const admissionPath = resolve(fixtureDirectory, "final-admission-record.json");
  const requirementPath = resolve(fixtureDirectory, "requirement-record.json");
  const referencePath = resolve(fixtureDirectory, "evaluator-reference.json");
  const freezePath = resolve(fixtureDirectory, "scoring-input-freeze-manifest.json");
  const admission = readJson(admissionPath);
  const requirement = readJson(requirementPath);
  const reference = readJson(referencePath);
  const freeze = readJson(freezePath);
  const directory = resolve(work, `synthetic-repository-admission-${name}`);
  mkdirSync(directory);
  const archivePath = resolve(directory, "review.archive");
  writeFileSync(archivePath, archiveBytes);
  const reviewProjection = {
    review_status: "approved",
    author_self_approval: false,
    reviewer_type: "independent_agent",
    reviewer_record_id: reviewerRecordId,
    reviewer_count: 1,
    reviewed_at: reviewedAt,
    reviewed_repository: "test/repository",
    reviewed_pull_request: 999,
    reviewed_head_revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
    blocking_finding_count: 0,
    review_evidence: {
      archive_sha256: digestBytes(archiveBytes),
      archive_bytes: archiveBytes.length,
    },
  };
  const authorityDraft = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/portfolio-admission-review-authority.schema.json",
    program: "adaptive_ask_portfolio_admission_review_authority",
    authority_id: "",
    authority_revision: 1,
    fixture_id: fixtureId,
    ...reviewProjection,
  };
  authorityDraft.authority_id = computeAdmissionReviewAuthorityId(authorityDraft);
  const authority = { ...authorityDraft, authority_digest: computeAdmissionReviewAuthorityDigest(authorityDraft) };
  const authorityPath = resolve(directory, "review-authority.json");
  writeJson(authorityPath, authority);
  const decision = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/portfolio-admission-decision.schema.json",
    program: "adaptive_ask_portfolio_admission_decision",
    decision_id: "",
    decision_revision: 1,
    fixture_id: fixtureId,
    decision_status: "admitted",
    ...reviewProjection,
    evaluator: {
      evaluator_revision: reference.evaluator_revision,
      evaluator_bundle_id: reference.evaluator_bundle_id,
      evaluator_bundle_digest: reference.evaluator_bundle_digest,
      evaluator_bundle_bytes: admission.evaluator_byte_count,
    },
    evaluator_public_reference_digest: reference.public_metadata_digest,
    frozen_admission_authority: {
      path: relative(repository, admissionPath),
      raw_byte_digest: digestBytes(readFileSync(admissionPath)),
      semantic_digest: admission.admission_digest,
      requirement_authority_digest: admission.requirement_authority_digest,
    },
    frozen_requirement_record: {
      path: relative(repository, requirementPath),
      raw_byte_digest: digestBytes(readFileSync(requirementPath)),
      record_digest: requirement.requirement_record_digest,
      set_digest: requirement.requirement_set_digest,
    },
    frozen_scoring_input_manifest: {
      path: relative(repository, freezePath),
      raw_byte_digest: digestBytes(readFileSync(freezePath)),
      semantic_digest: freeze.manifest_digest,
    },
  };
  decision.decision_id = computeAdmissionDecisionId(decision);
  decision.decision_digest = computeAdmissionDecisionDigest(decision);
  const overlayPath = resolve(repository, "benchmarks/fixtures/admission-decision/mn-doc-config-correction-test-admission-decision.json");
  writeJson(overlayPath, decision);
  return {
    decision,
    overlayPath,
    evidence: {
      reviewAuthorityPath: authorityPath,
      reviewAuthoritySourceDigest: digestBytes(readFileSync(authorityPath)),
      reviewArchivePath: archivePath,
    },
  };
}

try {
  archiveInventoryNegativeTests();
  const productionAuthority = existsSync(resolve(fixtureRoot, "evaluator-reference.json"));
  const summary = validateMnDocConfigCorrectionPublicFixture({ root });
  assert.equal(summary.scoringReady, false);

  if (productionAuthority) {
    const beforeLegacyWrite = {
      fixture: treeSnapshot(fixtureRoot),
      status: execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }),
    };
    const legacyWrite = spawnSync(process.execPath, [resolve(root, "scripts/ask-benchmark-mn-doc-config-correction.mjs"), "write"], { cwd: root, encoding: "utf8" });
    assert.notEqual(legacyWrite.status, 0, "legacy writer must reject a production authority tree");
    assert.match(`${legacyWrite.stderr}\n${legacyWrite.stdout}`, /legacy mn-doc candidate write is prohibited/u);
    assert.deepEqual({ fixture: treeSnapshot(fixtureRoot), status: execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }) }, beforeLegacyWrite, "legacy writer rejection must not change repository bytes");

    const invalidWriterBoundaries = boundaryRoots("invalid-writer-inputs");
    const dummyPrivateRoot = resolve(work, "dummy-private-root");
    mkdirSync(dummyPrivateRoot);
    const publicBeforeInvalidWriter = treeSnapshot(fixtureRoot);
    assert.throws(() => writeMnDocConfigCorrectionProductionAuthority({ root, privateRoot: resolve(work, "missing-private-root"), evaluatorRevision: "0".repeat(40), generationDate: "2026-08-11", boundaryRoots: invalidWriterBoundaries }), /private root/u, "missing private root must fail before generation");
    assert.throws(() => writeMnDocConfigCorrectionProductionAuthority({ root, privateRoot: dummyPrivateRoot, evaluatorRevision: "not-a-revision", generationDate: "2026-08-11", boundaryRoots: invalidWriterBoundaries }), /evaluator revision is invalid/u, "invalid evaluator revision must fail before generation");
    assert.deepEqual(treeSnapshot(fixtureRoot), publicBeforeInvalidWriter, "invalid production writer inputs must not change frozen public bytes");
  }

  const config = readJson(resolve(root, "benchmarks/adaptive-portfolio.config.json"));
  const planConfig = { ...config, _configPath: resolve(root, "benchmarks/adaptive-portfolio.config.json"), _protocolPath: resolve(root, config.protocol_path) };
  const candidateFixture = config.fixtures.find(({ id }) => id === "mn-doc-config-correction");
  const fixtureOne = config.fixtures.find(({ id }) => id === "mn-build-option-update");
  assert.equal(resolvePortfolioExecutionAdmission({ root, fixture: candidateFixture }).execution_eligible, false, "source-freeze candidate must remain outside measured execution");
  assert.equal(resolvePortfolioExecutionAdmission({ root, fixture: fixtureOne }).execution_eligible, false, "repository overlay without external review authority must not make fixture #1 execution-eligible");
  const repositoryRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const focusedPlan = buildPortfolioPlan({ root, config: planConfig, repositoryRevision, seed: "mn-doc-pre-admission-gate" });
  assert.equal(focusedPlan.cases.some(({ fixture_id }) => fixture_id === "mn-doc-config-correction"), false, "source-freeze candidate must not enter the execution plan");
  assert.equal(focusedPlan.cases.some(({ fixture_id }) => fixture_id === "mn-build-option-update"), false, "overlay fixture without external authority must not enter the execution plan");

  const forgedMarkerRoot = executionAdmissionRoot("forged-marker");
  const forgedMarkerPath = resolve(forgedMarkerRoot, FIXTURE_ROOT_RELATIVE, "source-freeze-candidate.json");
  const forgedMarker = readJson(forgedMarkerPath);
  forgedMarker.admission_state = "admitted";
  forgedMarker.candidate_state = "source_frozen";
  writeJson(forgedMarkerPath, forgedMarker);
  assert.equal(resolvePortfolioExecutionAdmission({ root: forgedMarkerRoot, fixture: candidateFixture }).execution_eligible, false, "marker-only admission forgery must not enable execution");

  const forgedOverlayRoot = executionAdmissionRoot("forged-self-consistent-overlay");
  const forgedOverlayPath = resolve(forgedOverlayRoot, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json");
  const forgedOverlay = readJson(forgedOverlayPath);
  forgedOverlay.review_evidence = { archive_sha256: `sha256:${"4".repeat(64)}`, archive_bytes: 4242 };
  forgedOverlay.decision_digest = computeAdmissionDecisionDigest(forgedOverlay);
  writeJson(forgedOverlayPath, forgedOverlay);
  assert.throws(() => resolvePortfolioExecutionAdmission({ root: forgedOverlayRoot, fixture: fixtureOne }), /working-tree bytes differ/u, "repository overlay working-tree byte drift must be rejected");

  const syntheticEvidenceA = externalAdmissionEvidence("synthetic-a", { archiveBytes: Buffer.from("synthetic exact review archive A\n") });
  assert.throws(
    () => resolvePortfolioExecutionAdmission({
      root,
      fixture: candidateFixture,
      externalAdmissionEvidence: {
        ...syntheticEvidenceA,
        decisionPath: syntheticEvidenceA.callerDecisionPath,
      },
    }),
    /decisionPath|repository.*overlay|unknown fields/u,
    "caller-created admitted decision must not create execution authority for a fixture without a repository overlay",
  );

  for (const [name, mutate, pattern] of [
    ["missing review authority", (value) => { delete value.reviewAuthorityPath; }, /partial.*reviewAuthorityPath/u],
    ["missing review authority source digest", (value) => { delete value.reviewAuthoritySourceDigest; }, /partial.*reviewAuthoritySourceDigest/u],
    ["missing archive", (value) => { delete value.reviewArchivePath; }, /partial.*reviewArchivePath/u],
    ["caller-created admitted object injection", (value) => { value.resolvedAuthority = { authority_mode: "admitted_overlay", effective_admission_status: "admitted" }; }, /unknown fields.*resolvedAuthority/u],
  ]) {
    const { callerDecisionPath: _callerDecisionPath, ...evidence } = syntheticEvidenceA;
    mutate(evidence);
    assert.throws(() => resolvePortfolioExecutionAdmission({ root, fixture: fixtureOne, externalAdmissionEvidence: evidence }), pattern, name);
  }

  const archiveReplacementPath = resolve(work, "replacement-review.archive");
  writeFileSync(archiveReplacementPath, "replacement archive bytes\n");
  const { callerDecisionPath: _callerDecisionPath, ...syntheticReviewEvidence } = syntheticEvidenceA;
  assert.throws(() => resolvePortfolioExecutionAdmission({ root, fixture: fixtureOne, externalAdmissionEvidence: { ...syntheticReviewEvidence, reviewArchivePath: archiveReplacementPath } }), /archive raw identity differs/u, "review archive replacement must be rejected");
  for (const [name, mutate] of [
    ["wrong reviewed repository", (decision) => { decision.reviewed_repository = "wrong/repository"; }],
    ["wrong reviewed PR", (decision) => { decision.reviewed_pull_request += 1; }],
    ["wrong reviewed HEAD", (decision) => { decision.reviewed_head_revision = "0".repeat(40); }],
  ]) {
    const evidence = externalAdmissionEvidence(name.replaceAll(" ", "-"), { decisionMutate: mutate });
    assert.throws(() => resolvePortfolioExecutionAdmission({ root, fixture: fixtureOne, externalAdmissionEvidence: { ...evidence, decisionPath: evidence.callerDecisionPath } }), /decisionPath|repository.*overlay|unknown fields/u, name);
  }

  const r22ArchiveIndex = process.argv.indexOf("--r22-review-archive");
  if (r22ArchiveIndex !== -1) {
    const r22ArchiveBytes = readFileSync(resolve(process.argv[r22ArchiveIndex + 1]));
    assert.equal(r22ArchiveBytes.length, 65010, "exact R22 review archive byte count");
    assert.equal(digestBytes(r22ArchiveBytes), "sha256:5ce11995836830f7925aa8ede6f6961b48bc78abf567d7ab42165ea1f7e10fd0", "exact R22 review archive digest");
    const exactR22EvidenceWithCallerDecision = externalAdmissionEvidence("exact-r22", { archiveBytes: r22ArchiveBytes });
    const { callerDecisionPath: _exactR22CallerDecisionPath, ...exactR22Evidence } = exactR22EvidenceWithCallerDecision;
    assert.equal(digestBytes(readFileSync(exactR22Evidence.reviewAuthorityPath)), "sha256:389d2094bdb4497f47abbc388b33c4942d3dfac39d4404455c21031a9ce32624", "exact R22 review-authority raw source digest");
    const exactR22 = resolvePortfolioExecutionAdmission({ root, fixture: fixtureOne, externalAdmissionEvidence: exactR22Evidence });
    assert.equal(exactR22.execution_eligible, true, "fixture #1 exact R22 external review authority and archive must be eligible");
    assert.equal(exactR22.resolved_authority.admission_decision_digest, "sha256:3877018309e29a15330d6bbe396ec777dbef3a46a3ea883fd5d8a26c7de273d9");

    const multiRepository = fullRepositoryClone("multi-fixture-admission");
    const multiConfigValue = readJson(resolve(multiRepository, "benchmarks/adaptive-portfolio.config.json"));
    const multiConfig = {
      ...multiConfigValue,
      _configPath: resolve(multiRepository, "benchmarks/adaptive-portfolio.config.json"),
      _protocolPath: resolve(multiRepository, multiConfigValue.protocol_path),
    };
    const multiFixtureOne = multiConfig.fixtures.find(({ id }) => id === "mn-build-option-update");
    const multiFixtureTwo = multiConfig.fixtures.find(({ id }) => id === "mn-doc-config-correction");
    const repositoryBaseRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: multiRepository, encoding: "utf8" }).trim();
    const untrackedAdmission = syntheticRepositoryAdmission(multiRepository, "untracked", {
      archiveBytes: Buffer.from("synthetic repository review archive A\n"),
      reviewedAt: "2026-08-12T00:00:00+09:00",
      reviewerRecordId: "synthetic-independent-review-a",
    });
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: repositoryBaseRevision, externalAdmissionEvidence: untrackedAdmission.evidence }),
      /cannot create admission without a repository-managed overlay/u,
      "untracked admission decision must not create execution authority",
    );
    const callerDecisionPath = resolve(work, "caller-created-admitted-decision.json");
    writeJson(callerDecisionPath, untrackedAdmission.decision);
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: repositoryBaseRevision, externalAdmissionEvidence: { ...untrackedAdmission.evidence, decisionPath: callerDecisionPath } }),
      /unknown fields.*decisionPath/u,
      "caller-created admitted decision must be rejected even when its digests are self-consistent",
    );
    writeJson(untrackedAdmission.overlayPath, readJson(resolve(multiRepository, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json")));
    const wrongFixtureRevision = commitRepository(multiRepository, "Add wrong-fixture test overlay");
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: wrongFixtureRevision, externalAdmissionEvidence: untrackedAdmission.evidence }),
      /cannot create admission without a repository-managed overlay/u,
      "wrong-fixture repository overlay must not authorize the target fixture",
    );
    rmSync(untrackedAdmission.overlayPath);
    const beforeSecondOverlayRevision = commitRepository(multiRepository, "Remove wrong-fixture test overlay");

    const admittedSecondA = syntheticRepositoryAdmission(multiRepository, "multi-a", {
      archiveBytes: Buffer.from("synthetic repository review archive A\n"),
      reviewedAt: "2026-08-12T00:00:00+09:00",
      reviewerRecordId: "synthetic-independent-review-a",
    });
    const admittedSecondRevisionA = commitRepository(multiRepository, "Add test-only second admitted overlay A");
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: beforeSecondOverlayRevision, externalAdmissionEvidence: admittedSecondA.evidence }),
      /cannot create admission without a repository-managed overlay/u,
      "overlay from another repository revision must not authorize execution",
    );

    const evidenceManifestPathA = resolve(work, "multi-fixture-execution-admission-a.json");
    writeJson(evidenceManifestPathA, {
      [multiFixtureOne.id]: {
        review_authority_path: exactR22Evidence.reviewAuthorityPath,
        review_authority_source_digest: exactR22Evidence.reviewAuthoritySourceDigest,
        review_archive_path: exactR22Evidence.reviewArchivePath,
      },
      [multiFixtureTwo.id]: {
        review_authority_path: admittedSecondA.evidence.reviewAuthorityPath,
        review_authority_source_digest: admittedSecondA.evidence.reviewAuthoritySourceDigest,
        review_archive_path: admittedSecondA.evidence.reviewArchivePath,
      },
    });
    const evidenceInventoryA = readExecutionAdmissionEvidenceManifest(evidenceManifestPathA);
    const multiPlanA = buildPortfolioPlan({ root: multiRepository, config: multiConfig, repositoryRevision: admittedSecondRevisionA, seed: "multi-fixture-admission", executionAdmissionEvidenceByFixture: evidenceInventoryA });
    assert.equal(multiPlanA.cases.some(({ fixture_id }) => fixture_id === multiFixtureOne.id), true, "fixture #1 must enter the authenticated multi-fixture plan");
    assert.equal(multiPlanA.cases.some(({ fixture_id }) => fixture_id === multiFixtureTwo.id), true, "test-only second admitted fixture must enter the same plan");
    const multiPlanPathA = resolve(work, "multi-fixture-plan-a.json");
    const multiMaterializedA = resolve(work, "multi-fixture-materialized-a");
    writeJson(multiPlanPathA, multiPlanA);
    const multiManifestA = materializePortfolio({ root: multiRepository, config: multiConfig, planPath: multiPlanPathA, outputPath: multiMaterializedA, repositoryRevision: admittedSecondRevisionA, executionAdmissionEvidenceByFixture: evidenceInventoryA });
    assert.equal(multiManifestA.case_count, multiPlanA.cases.length, "plan and materialize must use the same multi-fixture evidence manifest");

    const duplicateKeyManifestPath = resolve(work, "duplicate-fixture-evidence.json");
    writeFileSync(duplicateKeyManifestPath, `{"${multiFixtureOne.id}":{},"${multiFixtureOne.id}":{}}\n`);
    assert.throws(() => readExecutionAdmissionEvidenceManifest(duplicateKeyManifestPath), /duplicate JSON object key/u, "duplicate fixture identity in the evidence manifest must be rejected");
    const partialManifestPath = resolve(work, "partial-fixture-evidence.json");
    writeJson(partialManifestPath, { [multiFixtureOne.id]: { review_authority_path: exactR22Evidence.reviewAuthorityPath } });
    assert.throws(() => readExecutionAdmissionEvidenceManifest(partialManifestPath), /partial/u, "partial fixture evidence manifest entry must be rejected");
    const unknownManifestPath = resolve(work, "unknown-fixture-evidence.json");
    writeJson(unknownManifestPath, {
      unknown_fixture: {
        review_authority_path: exactR22Evidence.reviewAuthorityPath,
        review_authority_source_digest: exactR22Evidence.reviewAuthoritySourceDigest,
        review_archive_path: exactR22Evidence.reviewArchivePath,
      },
    });
    assert.throws(
      () => buildPortfolioPlan({ root: multiRepository, config: multiConfig, repositoryRevision: admittedSecondRevisionA, seed: "unknown-fixture-admission", executionAdmissionEvidenceByFixture: readExecutionAdmissionEvidenceManifest(unknownManifestPath) }),
      /unknown fixture identities/u,
      "unknown fixture evidence must be rejected",
    );

    const overlayBytesA = readFileSync(admittedSecondA.overlayPath);
    writeFileSync(admittedSecondA.overlayPath, Buffer.concat([overlayBytesA, Buffer.from("\n")]));
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: admittedSecondRevisionA, externalAdmissionEvidence: admittedSecondA.evidence }),
      /working-tree bytes differ/u,
      "repository overlay working-tree drift must be rejected",
    );
    writeFileSync(admittedSecondA.overlayPath, overlayBytesA);

    const replacementArchivePath = resolve(work, "multi-fixture-replacement.archive");
    writeFileSync(replacementArchivePath, "replacement archive\n");
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: admittedSecondRevisionA, externalAdmissionEvidence: { ...admittedSecondA.evidence, reviewArchivePath: replacementArchivePath } }),
      /archive raw identity differs/u,
      "archive digest mismatch must be rejected",
    );
    const mismatchedAuthority = readJson(admittedSecondA.evidence.reviewAuthorityPath);
    mismatchedAuthority.reviewer_record_id = "projection-mismatch";
    mismatchedAuthority.authority_id = computeAdmissionReviewAuthorityId(mismatchedAuthority);
    mismatchedAuthority.authority_digest = computeAdmissionReviewAuthorityDigest(mismatchedAuthority);
    const mismatchedAuthorityPath = resolve(work, "projection-mismatch-authority.json");
    writeJson(mismatchedAuthorityPath, mismatchedAuthority);
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: admittedSecondRevisionA, externalAdmissionEvidence: { ...admittedSecondA.evidence, reviewAuthorityPath: mismatchedAuthorityPath, reviewAuthoritySourceDigest: digestBytes(readFileSync(mismatchedAuthorityPath)) } }),
      /differs from external frozen or review authority/u,
      "review authority projection mismatch must be rejected",
    );

    const duplicateOverlayPath = resolve(multiRepository, "benchmarks/fixtures/admission-decision/mn-doc-config-correction-test-admission-decision-duplicate.json");
    writeFileSync(duplicateOverlayPath, overlayBytesA);
    const duplicateOverlayRevision = commitRepository(multiRepository, "Add duplicate test-only admission overlay");
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: duplicateOverlayRevision, externalAdmissionEvidence: admittedSecondA.evidence }),
      /multiple managed overlays/u,
      "duplicate repository overlays for one fixture must be rejected",
    );
    rmSync(duplicateOverlayPath);
    commitRepository(multiRepository, "Remove duplicate test-only admission overlay");

    const admittedSecondB = syntheticRepositoryAdmission(multiRepository, "multi-b", {
      archiveBytes: Buffer.from("synthetic repository review archive B\n"),
      reviewedAt: "2026-08-12T00:01:00+09:00",
      reviewerRecordId: "synthetic-independent-review-b",
    });
    const admittedSecondRevisionB = commitRepository(multiRepository, "Update test-only second admitted overlay identity");
    const evidenceManifestPathB = resolve(work, "multi-fixture-execution-admission-b.json");
    writeJson(evidenceManifestPathB, {
      [multiFixtureOne.id]: {
        review_authority_path: exactR22Evidence.reviewAuthorityPath,
        review_authority_source_digest: exactR22Evidence.reviewAuthoritySourceDigest,
        review_archive_path: exactR22Evidence.reviewArchivePath,
      },
      [multiFixtureTwo.id]: {
        review_authority_path: admittedSecondB.evidence.reviewAuthorityPath,
        review_authority_source_digest: admittedSecondB.evidence.reviewAuthoritySourceDigest,
        review_archive_path: admittedSecondB.evidence.reviewArchivePath,
      },
    });
    const multiPlanB = buildPortfolioPlan({ root: multiRepository, config: multiConfig, repositoryRevision: admittedSecondRevisionB, seed: "multi-fixture-admission", executionAdmissionEvidenceByFixture: readExecutionAdmissionEvidenceManifest(evidenceManifestPathB) });
    assert.notEqual(multiPlanA.execution_admission_authority_digest, multiPlanB.execution_admission_authority_digest, "changing one fixture review authority/archive identity must change the execution admission authority digest");
    assert.notEqual(multiPlanA.plan_id, multiPlanB.plan_id, "changing one fixture review authority/archive identity must change the plan ID");
    assert.notDeepEqual(multiPlanA.cases.map(({ case_id }) => case_id), multiPlanB.cases.map(({ case_id }) => case_id), "case IDs must follow the changed plan identity");

    const nonAdmittedOverlay = structuredClone(admittedSecondB.decision);
    nonAdmittedOverlay.decision_status = "changes_requested";
    nonAdmittedOverlay.review_status = "changes_requested";
    nonAdmittedOverlay.blocking_finding_count = 1;
    nonAdmittedOverlay.decision_digest = computeAdmissionDecisionDigest(nonAdmittedOverlay);
    writeJson(admittedSecondB.overlayPath, nonAdmittedOverlay);
    const nonAdmittedRevision = commitRepository(multiRepository, "Record non-admitted test-only overlay status");
    assert.throws(
      () => resolvePortfolioExecutionAdmission({ root: multiRepository, fixture: multiFixtureTwo, repositoryRevision: nonAdmittedRevision, externalAdmissionEvidence: admittedSecondB.evidence }),
      /does not record admitted status/u,
      "repository overlay with a non-admitted decision status must not authorize execution",
    );
  }

  for (const [name, missing] of [["missing-reference", "evaluator-reference.json"], ["missing-final-admission", "final-admission-record.json"]]) {
    const target = executionAdmissionRoot(name);
    rmSync(resolve(target, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update", missing));
    assert.equal(resolvePortfolioExecutionAdmission({ root: target, fixture: fixtureOne }).execution_eligible, false, `${name} must fail closed`);
  }
  const pendingRoot = executionAdmissionRoot("admission-pending");
  rmSync(resolve(pendingRoot, "benchmarks/fixtures/admission-decision/mn-build-option-update-r22-admission-decision.json"));
  assert.throws(() => resolvePortfolioExecutionAdmission({ root: pendingRoot, fixture: fixtureOne }), /working-tree file is missing/u, "missing tracked admission overlay must fail closed");

  const transplantRoot = executionAdmissionRoot("cross-fixture-transplant");
  const transplantFixtureRoot = resolve(transplantRoot, FIXTURE_ROOT_RELATIVE);
  for (const name of ["final-admission-record.json", "requirement-record.json", "evaluator-reference.json", "scoring-input-freeze-manifest.json"]) cpSync(resolve(transplantRoot, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update", name), resolve(transplantFixtureRoot, name));
  assert.throws(() => resolvePortfolioExecutionAdmission({ root: transplantRoot, fixture: candidateFixture }), /cross-fixture|fixture identity|does not match constant/u, "cross-fixture admission authority transplant must be rejected");

  const baseline = spawnSync(process.execPath, ["--test", "test/worker-retries.test.mjs"], { cwd: resolve(fixtureRoot, "workspace"), encoding: "utf8" });
  assert.notEqual(baseline.status, 0, "the frozen task workspace must retain the visible inconsistency");

  rejectsPublicMutation("unlisted-public-input", (target) => writeFileSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/unlisted.txt"), "unlisted\n"), /input manifest does not exactly bind/u);
  rejectsPublicMutation("public-byte-drift", (target) => writeFileSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/config/retry-policy.json"), "{}\n"), /input manifest does not exactly bind/u);
  rejectsPublicMutation("private-field-leakage", (target) => {
    const path = resolve(target, FIXTURE_ROOT_RELATIVE, "metadata.json");
    const value = readJson(path);
    value.private_root = "private/evaluator";
    writeJson(path, value);
  }, /answer-bearing field/u);
  if (!productionAuthority) rejectsPublicMutation("requirement-reference-corruption", (target) => {
      const path = resolve(target, FIXTURE_ROOT_RELATIVE, "requirement-record.json");
      const value = readJson(path);
      value.requirements[0].evidence_map_ids = ["unknown-evidence"];
      writeJson(path, value);
    }, /deterministic source-freeze contract/u);
  if (!productionAuthority) rejectsPublicMutation("cross-fixture-config-transplant", (target) => {
      const path = resolve(target, "benchmarks/adaptive-portfolio.config.json");
      const value = readJson(path);
      value.fixtures.find(({ id }) => id === "mn-doc-config-correction").id = "mn-build-option-update-copy";
      writeJson(path, value);
    }, /not registered/u);
  rejectsPublicMutation("symlink-traversal", (target) => {
    const path = resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/docs/worker-retries.md");
    rmSync(path);
    symlinkSync(resolve(target, FIXTURE_ROOT_RELATIVE, "workspace/config/retry-policy.json"), path);
  }, /symlink/u);

  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixtureOneBuffers = authorityBuffers("mn-build-option-update");
  const fixtureOneManifest = readJson(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-authority-manifest.json"));
  validateEvaluatorAuthorityManifest({ manifest: fixtureOneManifest, buffers: fixtureOneBuffers, evaluatorRevision: fixtureOneManifest.evaluator_revision, root });
  const fixtureTwoBuffers = authorityBuffers("mn-doc-config-correction");
  const fixtureTwoManifest = deriveEvaluatorAuthorityManifest({ buffers: fixtureTwoBuffers, evaluatorRevision: revision, fixtureId: "mn-doc-config-correction" });
  assert.equal(fixtureTwoManifest.fixture_id, "mn-doc-config-correction");
  assert.deepEqual(fixtureTwoManifest.file_inventory.map(({ path }) => path), evaluatorAuthorityPathsForFixture("mn-doc-config-correction").bindingPaths);

  const privateRootIndex = process.argv.indexOf("--private-root");
  const caseRootIndex = process.argv.indexOf("--private-case-root");
  let privateValidation = "not_run";
  if (privateRootIndex !== -1 || caseRootIndex !== -1) {
    assert.notEqual(privateRootIndex, -1, "--private-root is required with private cases");
    assert.notEqual(caseRootIndex, -1, "--private-case-root is required with a private evaluator");
    const privateRoot = resolve(process.argv[privateRootIndex + 1]);
    const caseRoot = resolve(process.argv[caseRootIndex + 1]);
    const productionBoundaries = boundaryRoots("actual-private");
    const expectations = readJson(resolve(caseRoot, "expectations.json"));
    if (productionAuthority) {
      const requirementRecord = readJson(resolve(fixtureRoot, "requirement-record.json"));
      const admissionRecord = readJson(resolve(fixtureRoot, "final-admission-record.json"));
      const evidenceMap = readJson(resolve(fixtureRoot, "evidence-map.json"));
      const inputRecord = readJson(resolve(fixtureRoot, "input-manifest.json")).fixtures["mn-doc-config-correction"];
      const mutationAsset = readJson(resolve(privateRoot, "evidence-removal-mutations.json"));
      const equivalenceAsset = readJson(resolve(privateRoot, "equivalent-solutions.json"));
      assert.doesNotThrow(() => validateMutationAuthority({ requirementRecord, admissionRecord, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset }));
      assert.doesNotThrow(() => validateEquivalenceAuthority({ requirementRecord, equivalenceAsset }));
      for (const [name, mutate, pattern] of [
        ["mutation omission", (value) => value.mutations.pop(), /inventory/u],
        ["mutation addition", (value) => value.mutations.push({ ...value.mutations[0], mutation_id: "extra-mutation" }), /inventory/u],
        ["mutation duplicate", (value) => value.mutations.push(structuredClone(value.mutations[0])), /duplicate|inventory/u],
        ["mutation transplant", (value) => { value.mutations[0].requirement_id = "configuration-contract"; }, /transplanted/u],
        ["mutation unknown target", (value) => { value.mutations[0].target_evidence_map_id = "unknown-evidence-map"; }, /unknown public evidence map/u],
        ["mutation wrong target", (value) => { value.mutations[0].target_evidence_map_id = value.mutations[1].target_evidence_map_id; }, /another requirement/u],
        ["mutation digest drift", (value) => { value.mutations[0].mutation_digest = `sha256:${"0".repeat(64)}`; }, /digest mismatch/u],
      ]) {
        const value = structuredClone(mutationAsset);
        mutate(value);
        assert.throws(() => validateMutationAuthority({ requirementRecord, admissionRecord, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: value }), pattern, name);
      }
      for (const [name, mutate, pattern] of [
        ["equivalence omission", (value) => value.rules.pop(), /inventory/u],
        ["equivalence transplant", (value) => { value.rules[0].requirement_id = "configuration-contract"; }, /transplanted/u],
      ]) {
        const value = structuredClone(equivalenceAsset);
        mutate(value);
        assert.throws(() => validateEquivalenceAuthority({ requirementRecord, equivalenceAsset: value }), pattern, name);
      }
      const requirementSchema = resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json");
      const outputSchema = resolve(root, "benchmarks/schemas/portfolio-output-contract.schema.json");
      assert.throws(() => assertBenchmarkSchemaInstance({ ...requirementRecord, extra_contract: true }, { schemaPath: requirementSchema, label: "mutated requirement" }), /Schema validation/u, "production requirement Schema must reject additions");
      const outputContract = readJson(resolve(fixtureRoot, "output-contract.json"));
      const invalidOutput = structuredClone(outputContract);
      delete invalidOutput.evaluator_public_reference_path;
      assert.throws(() => assertBenchmarkSchemaInstance(invalidOutput, { schemaPath: outputSchema, label: "mutated output" }), /Schema validation/u, "production output Schema must reject omissions");
      const candidate = readJson(resolve(fixtureRoot, "source-freeze-candidate.json"));
      for (const binding of Object.keys(candidate.public_bindings)) {
        const mutated = structuredClone(candidate);
        mutated.public_bindings[binding].semantic_digest = `sha256:${"0".repeat(64)}`;
        assert.notEqual(canonicalDigest(Object.fromEntries(Object.entries(mutated).filter(([key]) => key !== "candidate_digest"))), candidate.candidate_digest, `candidate digest must bind ${binding}`);
      }
      const privateMutation = structuredClone(candidate);
      privateMutation.evaluator_private_binding.source_tree_digest = `sha256:${"0".repeat(64)}`;
      assert.notEqual(canonicalDigest(Object.fromEntries(Object.entries(privateMutation).filter(([key]) => key !== "candidate_digest"))), candidate.candidate_digest, "candidate digest must bind private source identity");
      const reference = readJson(resolve(fixtureRoot, "evaluator-reference.json"));
      const bundleManifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
      const hiddenAsset = bundleManifest.asset_inventory.find(({ role }) => role === "hidden_tests");

      const invalidPrivateRoot = resolve(work, "invalid-private-publication-source");
      cpSync(privateRoot, invalidPrivateRoot, { recursive: true });
      rmSync(resolve(invalidPrivateRoot, hiddenAsset.path));
      const beforeFailedPublication = { public: treeSnapshot(fixtureRoot), private: treeSnapshot(invalidPrivateRoot) };
      assert.throws(() => writeMnDocConfigCorrectionProductionAuthority({
        root,
        privateRoot: invalidPrivateRoot,
        evaluatorRevision: reference.evaluator_revision,
        generationDate: readJson(resolve(privateRoot, "independence.json")).generation_date,
        boundaryRoots: productionBoundaries,
      }), /missing|ENOENT|hidden/u, "staged production validation failure must reject before publication");
      assert.deepEqual({ public: treeSnapshot(fixtureRoot), private: treeSnapshot(invalidPrivateRoot) }, beforeFailedPublication, "staged validation failure must leave public and private production roots unchanged");

      const transplantedReference = structuredClone(reference);
      transplantedReference.evaluator_bundle_id = `evaluator-${"0".repeat(64)}`;
      transplantedReference.public_metadata_digest = computeEvaluatorReferenceDigest(transplantedReference);
      assert.notEqual(transplantedReference.public_metadata_digest, reference.public_metadata_digest, "public reference digest must bind the private bundle identity");

      const staleRevision = structuredClone(reference.evaluator_source_identity);
      assert.throws(() => validateEvaluatorSourceIdentity({ identity: staleRevision, root, expectedRevision: "0".repeat(40) }), /revision drift/u, "stale evaluator revision must be rejected");
      const mismatchedGraph = structuredClone(reference.evaluator_source_identity);
      mismatchedGraph.dependency_graph.graph_digest = `sha256:${"0".repeat(64)}`;
      assert.throws(() => validateEvaluatorSourceIdentity({ identity: mismatchedGraph, root, expectedRevision: reference.evaluator_revision }), /dependency graph closure/u, "dependency graph mismatch must be rejected");
      const fakeGraph = structuredClone(reference.evaluator_source_identity);
      fakeGraph.dependency_graph.edge_inventory[0].specifier = "./self-consistent-fake.mjs";
      const { graph_digest: _oldGraphDigest, ...fakeGraphClosure } = fakeGraph.dependency_graph;
      fakeGraph.dependency_graph.graph_digest = canonicalDigest(fakeGraphClosure);
      assert.throws(() => validateEvaluatorSourceIdentity({ identity: fakeGraph, root, expectedRevision: reference.evaluator_revision }), /dependency graph closure/u, "self-consistent fake dependency graph must be rejected");

      const mutableRoot = resolve(work, "production-authority-mutations");
      cpSync(root, mutableRoot, { recursive: true });
      const mutableFixtureRoot = resolve(mutableRoot, FIXTURE_ROOT_RELATIVE);
      const rejectsArtifactMutation = (name, fileName, mutate, pattern) => {
        const path = resolve(mutableFixtureRoot, fileName);
        const original = readFileSync(path);
        try {
          const value = JSON.parse(original);
          mutate(value);
          writeJson(path, value);
          assert.throws(() => validateMnDocConfigCorrectionProductionAuthority({ root: mutableRoot }), pattern, name);
        } finally {
          writeFileSync(path, original);
        }
      };
      rejectsArtifactMutation("evaluator revision mismatch", "evaluator-reference.json", (value) => {
        value.evaluator_revision = "0".repeat(40);
        value.public_metadata_digest = computeEvaluatorReferenceDigest(value);
      }, /revision drift/u);
      rejectsArtifactMutation("evaluator authority manifest path transplant", "evaluator-reference.json", (value) => {
        value.evaluator_authority_manifest_path = "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-authority-manifest.json";
        value.public_metadata_digest = computeEvaluatorReferenceDigest(value);
      }, /manifest path transplant/u);
      rejectsArtifactMutation("public reference bundle transplant", "evaluator-reference.json", (value) => {
        value.evaluator_bundle_id = `evaluator-${"0".repeat(64)}`;
        value.public_metadata_digest = computeEvaluatorReferenceDigest(value);
      }, /frozen evaluator_public_reference|authority binding|bundle transplant/u);

      const mutableReferencePath = resolve(mutableFixtureRoot, "evaluator-reference.json");
      const mutableReferenceBytes = readFileSync(mutableReferencePath);
      try {
        const value = JSON.parse(mutableReferenceBytes);
        value.evaluator_bundle_id = `evaluator-${"0".repeat(64)}`;
        value.public_metadata_digest = computeEvaluatorReferenceDigest(value);
        writeJson(mutableReferencePath, value);
        assert.throws(() => verifyPrivateEvaluatorBundle({
          root: mutableRoot,
          referencePath: mutableReferencePath,
          privateRoot,
          manifestPath: resolve(privateRoot, "private-evaluator-bundle.json"),
          ...productionBoundaries,
        }), /public\/private evaluator identity mismatch/u, "public reference/private bundle transplant must be rejected");
      } finally {
        writeFileSync(mutableReferencePath, mutableReferenceBytes);
      }

      const privateMaterialLeakPath = resolve(mutableFixtureRoot, "private-material-leak.mjs");
      writeFileSync(privateMaterialLeakPath, readFileSync(resolve(privateRoot, hiddenAsset?.path ?? "hidden-evaluator.mjs")));
      execFileSync("git", ["add", relative(mutableRoot, privateMaterialLeakPath)], { cwd: mutableRoot });
      assert.throws(() => verifyPrivateEvaluatorBundle({
        root: mutableRoot,
        referencePath: mutableReferencePath,
        privateRoot,
        manifestPath: resolve(privateRoot, "private-evaluator-bundle.json"),
        ...productionBoundaries,
      }), /byte-identical private evaluator material/u, "managed private material publication must be rejected");

      const wrongRepositoryRoot = resolve(work, "wrong-repository-bytes");
      cpSync(root, wrongRepositoryRoot, { recursive: true });
      writeFileSync(resolve(wrongRepositoryRoot, "scripts/ask-benchmark-scoring-contract.mjs"), `${readFileSync(resolve(wrongRepositoryRoot, "scripts/ask-benchmark-scoring-contract.mjs"), "utf8")}\n`);
      assert.throws(() => validateEvaluatorSourceIdentity({ identity: reference.evaluator_source_identity, root: wrongRepositoryRoot, expectedRevision: reference.evaluator_revision }), /source bytes drift/u, "wrong repository bytes must be rejected");

      const externalAuthorityAnchor = readEvaluatorAuthorityAnchorFromFreeze({
        root,
        freezeManifestPath: resolve(fixtureRoot, "scoring-input-freeze-manifest.json"),
        freezeManifestSourceDigest: `sha256:${createHash("sha256").update(readFileSync(resolve(fixtureRoot, "scoring-input-freeze-manifest.json"))).digest("hex")}`,
        referencePath: resolve(fixtureRoot, "evaluator-reference.json"),
        label: "mn-doc pre-review external authority",
      });
      const sealedAuthorityRoot = resolve(work, "sealed-pre-review-authority");
      const evaluationInputRoot = resolve(work, "sealed-pre-review-input");
      mkdirSync(sealedAuthorityRoot);
      mkdirSync(evaluationInputRoot);
      writeJson(resolve(evaluationInputRoot, "pre-review-authority.json"), { measured_execution: false, scoring_ready: false });
      const sealedLineage = { run_instance_id: "24124124-1241-4241-8241-241241241241", case_id: "case-2412412412412412-4242424242424242", attempt: "0001" };
      const sealedExecution = createSealedEvaluatorExecutionForTest({
        root,
        privateEvaluationRoot: sealedAuthorityRoot,
        privateRoot,
        hiddenAsset,
        frozenWorkspace: resolve(caseRoot, "frozen"),
        candidateWorkspace: resolve(caseRoot, "correct"),
        evaluationInputRoot,
        evaluationLineage: sealedLineage,
        evaluatorRevision: reference.evaluator_revision,
        externalAuthorityAnchor,
        executionDirectoryName: "sealed-pre-review",
        label: "mn-doc sealed pre-review evaluator",
      });
      const eventReference = { command_id: "worker-retry-doc-test", digest: `sha256:${"2".repeat(64)}`, bytes: 64, outcome: "succeeded", exit_code: 0, match_state: "matched" };
      const normalized = {
        normalized_result_digest: `sha256:${"3".repeat(64)}`,
        lineage: sealedLineage,
        command_evidence: { capture_support: "supported", evidence_level: "complete", required_command_ids: ["worker-retry-doc-test"], required_alternative_groups: [], references: [eventReference], cwd_unverified_command_count: 0 },
      };
      const sealedResult = executeSealedEvaluatorForTest({ execution: sealedExecution, externalAuthorityAnchor, repositoryRoot: root, normalized, label: "mn-doc sealed pre-review evaluator" });
      assert.equal(sealedResult.firstFragment.classification, "correct_narrow_execution");
      validatePrivateEvaluatorFragment({ root, fragment: sealedResult.firstFragment, scoringPolicy: readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json")), requirementRecord, normalizedResult: normalized });

      for (const entry of [
        { name: "executed-failure", expected_projection: "failed_verification", event: { command_id: "worker-retry-doc-test", digest: `sha256:${"4".repeat(64)}`, bytes: 64, outcome: "failed", exit_code: 1, match_state: "matched" }, evidence_level: "complete" },
        { name: "missing", expected_projection: "missing_verification", event: null, evidence_level: "partial" },
      ]) {
        const lineage = { run_instance_id: entry.name === "missing" ? "24124124-1241-4241-8241-241241241243" : "24124124-1241-4241-8241-241241241242", case_id: entry.name === "missing" ? "case-2412412412412412-4242424242424244" : "case-2412412412412412-4242424242424243", attempt: "0001" };
        const commandEvidence = { capture_support: "supported", evidence_level: entry.evidence_level, required_command_ids: ["worker-retry-doc-test"], required_alternative_groups: [], references: entry.event ? [entry.event] : [], cwd_unverified_command_count: 0 };
        const typedNormalized = { normalized_result_digest: entry.name === "missing" ? `sha256:${"6".repeat(64)}` : `sha256:${"5".repeat(64)}`, lineage, command_evidence: commandEvidence };
        const typedExecution = createSealedEvaluatorExecutionForTest({
          root,
          privateEvaluationRoot: sealedAuthorityRoot,
          privateRoot,
          hiddenAsset,
          frozenWorkspace: resolve(caseRoot, "frozen"),
          candidateWorkspace: resolve(caseRoot, "correct"),
          evaluationInputRoot,
          evaluationLineage: lineage,
          evaluatorRevision: reference.evaluator_revision,
          externalAuthorityAnchor,
          executionDirectoryName: `sealed-pre-review-${entry.name}`,
          label: `mn-doc sealed ${entry.name} evaluator`,
        });
        const typedResult = executeSealedEvaluatorForTest({ execution: typedExecution, externalAuthorityAnchor, repositoryRoot: root, normalized: typedNormalized, label: `mn-doc sealed ${entry.name} evaluator` });
        validatePrivateEvaluatorFragment({ root, fragment: typedResult.firstFragment, scoringPolicy: readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json")), requirementRecord, normalizedResult: typedNormalized });
        assert.deepEqual(privateFragmentProjection(typedResult.firstFragment), expectations.fragment_projections[entry.expected_projection], `sealed ${entry.name} command evidence`);
      }

      for (const [index, entry] of (expectations.adversarial_cases ?? []).entries()) {
        const lineage = { run_instance_id: `24124124-1241-4241-8241-24124124125${index}`, case_id: `case-2412412412412412-424242424242425${index}`, attempt: "0001" };
        const adversarialNormalized = { normalized_result_digest: `sha256:${String(index + 7).repeat(64)}`, lineage, command_evidence: { capture_support: "supported", evidence_level: "complete", required_command_ids: ["worker-retry-doc-test"], required_alternative_groups: [], references: [eventReference], cwd_unverified_command_count: 0 } };
        const adversarialExecution = createSealedEvaluatorExecutionForTest({
          root,
          privateEvaluationRoot: sealedAuthorityRoot,
          privateRoot,
          hiddenAsset,
          frozenWorkspace: resolve(caseRoot, expectations.frozen_workspace),
          candidateWorkspace: resolve(caseRoot, entry.candidate_workspace),
          evaluationInputRoot,
          evaluationLineage: lineage,
          evaluatorRevision: reference.evaluator_revision,
          externalAuthorityAnchor,
          executionDirectoryName: `sealed-pre-review-${entry.case_id}`,
          label: `mn-doc sealed ${entry.case_id} evaluator`,
        });
        const sealedAdversarial = executeSealedEvaluatorForTest({ execution: adversarialExecution, externalAuthorityAnchor, repositoryRoot: root, normalized: adversarialNormalized, label: `mn-doc sealed ${entry.case_id} evaluator` });
        validatePrivateEvaluatorFragment({ root, fragment: sealedAdversarial.firstFragment, scoringPolicy: readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json")), requirementRecord, normalizedResult: adversarialNormalized });
        assert.deepEqual(privateFragmentProjection(sealedAdversarial.firstFragment), expectations.fragment_projections[entry.expected_projection], `production-safe adversarial case ${entry.case_id}`);
        assert.deepEqual(sealedAdversarial.firstFragment.requirement_results.map(({ earned_points, matched_equivalence_class_ids }) => [earned_points, matched_equivalence_class_ids]), [[0, []], [0, []], [2, ["equivalent-focused-verification"]]], `production-safe adversarial authority ${entry.case_id}`);
      }

      if (process.argv.includes("--verify-production-regeneration")) {
        const regenerationBefore = {
          public: treeSnapshot(fixtureRoot),
          private: treeSnapshot(privateRoot),
          status: execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }),
        };
        const regenerated = writeMnDocConfigCorrectionProductionAuthority({
          root,
          privateRoot,
          evaluatorRevision: reference.evaluator_revision,
          generationDate: readJson(resolve(privateRoot, "independence.json")).generation_date,
          boundaryRoots: productionBoundaries,
        });
        assert.equal(regenerated.candidateDigest, summary.candidateDigest);
        assert.deepEqual({
          public: treeSnapshot(fixtureRoot),
          private: treeSnapshot(privateRoot),
          status: execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }),
        }, regenerationBefore, "exact production regeneration must preserve public bytes, private inventory, digests, and git diff");
      }
    }
    const privateRequirementAuthority = new Map(readJson(resolve(fixtureRoot, "requirement-record.json")).requirements.map((requirement) => [requirement.requirement_id, requirement]));
    assert.equal(expectations.cases.length, 15, "private authority must cover the exact 15-case review inventory");
    for (const entry of expectations.cases) {
      const fragment = await validateActualPrivateEvaluator({
        root,
        privateRoot,
        boundaryRoots: productionBoundaries,
        frozenWorkspace: resolve(caseRoot, entry.frozen_workspace ?? expectations.frozen_workspace),
        candidateWorkspace: resolve(caseRoot, entry.candidate_workspace),
        verificationState: entry.verification_state,
        investigatedPaths: entry.investigated_paths ?? [],
      });
      for (const result of fragment.requirement_results) {
        const authority = privateRequirementAuthority.get(result.requirement_id);
        assert.ok(authority, `actual private case ${entry.case_id} returned an unknown requirement`);
        assert.equal(result.earned_points, result.outcome === "pass" ? authority.max_points : 0, `actual private case ${entry.case_id} requirement points`);
        assert.deepEqual(result.matched_equivalence_class_ids, result.outcome === "pass" ? authority.equivalence_class_ids : [], `actual private case ${entry.case_id} equivalence identity`);
      }
      assert.deepEqual(privateFragmentProjection(fragment), expectations.fragment_projections[entry.expected_projection], `actual private case ${entry.case_id}`);
    }
    for (const entry of expectations.adversarial_cases ?? []) {
      const fragment = await validateActualPrivateEvaluator({
        root,
        privateRoot,
        boundaryRoots: productionBoundaries,
        frozenWorkspace: resolve(caseRoot, expectations.frozen_workspace),
        candidateWorkspace: resolve(caseRoot, entry.candidate_workspace),
        verificationState: entry.verification_state,
      });
      assert.deepEqual(privateFragmentProjection(fragment), expectations.fragment_projections[entry.expected_projection], `direct adversarial case ${entry.case_id}`);
      assert.deepEqual(fragment.requirement_results.map(({ earned_points, matched_equivalence_class_ids }) => [earned_points, matched_equivalence_class_ids]), [[0, []], [0, []], [2, ["equivalent-focused-verification"]]], `direct adversarial authority ${entry.case_id}`);
    }

    const reviewArchiveOutputIndex = process.argv.indexOf("--review-archive-output");
    const reviewArchivePath = reviewArchiveOutputIndex === -1 ? resolve(work, "mn-doc-review-a.zip") : resolve(process.argv[reviewArchiveOutputIndex + 1]);
    const repeatedReviewArchivePath = resolve(work, "mn-doc-review-b.zip");
    const reviewedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const firstArchive = generateMnDocConfigCorrectionReviewArchive({ root, privateRoot, caseRoot, outputPath: reviewArchivePath, reviewedHead, pullRequest: 242 });
    const secondArchive = generateMnDocConfigCorrectionReviewArchive({ root, privateRoot, caseRoot, outputPath: repeatedReviewArchivePath, reviewedHead, pullRequest: 242 });
    assert.deepEqual(readFileSync(reviewArchivePath), readFileSync(repeatedReviewArchivePath), "exact review archive regeneration must preserve raw ZIP bytes");
    assert.equal(firstArchive.raw_sha256, secondArchive.raw_sha256, "exact review archive regeneration digest");
    assert.equal(firstArchive.manifest.schema_version, "pr242-exact-private-review-manifest.v3", "review archive manifest revision");
    assert.equal(firstArchive.manifest.archive_format.revision, "pr242-node-store-zip.v1", "review archive format revision");
    assert.equal(firstArchive.manifest.archive_format.fixed_dos_timestamp, "1980-01-01T00:00:00", "review archive fixed DOS timestamp");
    assert.deepEqual(firstArchive.manifest.archive_format.compression_method, { name: "store", code: 0 }, "review archive compression authority");
    assert.match(firstArchive.manifest.archive_format.generator.source_digest, /^sha256:[a-f0-9]{64}$/u, "review archive generator source digest");
    const timezoneIdentities = [];
    let extractedTimezoneProjection = null;
    for (const [timezone, filename] of [["UTC", "mn-doc-review-utc.zip"], ["Asia/Tokyo", "mn-doc-review-tokyo.zip"], ["America/Los_Angeles", "mn-doc-review-los-angeles.zip"]]) {
      const timezoneArchivePath = resolve(work, filename);
      const generated = spawnSync(process.execPath, [
        resolve(root, "scripts/ask-benchmark-mn-doc-config-correction-review-archive.mjs"),
        "generate",
        "--private-root", privateRoot,
        "--case-root", caseRoot,
        "--output", timezoneArchivePath,
        "--reviewed-head", reviewedHead,
        "--pull-request", "242",
      ], { cwd: root, env: { ...process.env, TZ: timezone }, encoding: "utf8" });
      assert.equal(generated.status, 0, `fresh-process ${timezone} review archive generation: ${generated.stderr}`);
      const timezoneBytes = readFileSync(timezoneArchivePath);
      assert.deepEqual(timezoneBytes, readFileSync(reviewArchivePath), `raw review archive bytes must not depend on ${timezone}`);
      timezoneIdentities.push({ timezone, bytes: timezoneBytes.length, digest: digestBytes(timezoneBytes) });
      const timezoneVerification = verifyMnDocConfigCorrectionReviewArchive({ archivePath: timezoneArchivePath, root, privateRoot, caseRoot });
      try {
        const projection = filesystemTreeProjection(timezoneVerification.extraction_root);
        if (extractedTimezoneProjection === null) extractedTimezoneProjection = projection;
        else assert.deepEqual(projection, extractedTimezoneProjection, `ordinary extraction must not depend on ${timezone}`);
      } finally {
        timezoneVerification.cleanup();
      }
    }
    assert.equal(new Set(timezoneIdentities.map(({ digest }) => digest)).size, 1, "timezone archive SHA-256 identities");
    assert.equal(new Set(timezoneIdentities.map(({ bytes }) => bytes)).size, 1, "timezone archive byte counts");
    const verifiedArchive = verifyMnDocConfigCorrectionReviewArchive({ archivePath: reviewArchivePath, root, privateRoot, caseRoot });
    try {
      assert.equal(verifiedArchive.manifest.review_cases.count, 15, "review archive must retain the exact base 15-case inventory");
      assert.equal(verifiedArchive.manifest.adversarial_cases.count, 3, "review archive must include three duplicate-name adversarial cases");
      assert.equal(readdirSync(resolve(verifiedArchive.extraction_root, "cases/target-deletion/docs")).length, 0, "extracted target-deletion docs directory must be empty");
      assert.equal(lstatSync(resolve(verifiedArchive.extraction_root, "cases/target-directory/docs/worker-retries.md")).isDirectory(), true, "extracted target-document target must be a directory");
      const extractedPrivateRoot = resolve(verifiedArchive.extraction_root, "private");
      const extractedCaseRoot = resolve(verifiedArchive.extraction_root, "cases");
      const extractedBoundaries = boundaryRoots("extracted-review-archive");
      for (const entry of [...expectations.cases, ...(expectations.adversarial_cases ?? [])]) {
        const fragment = await validateActualPrivateEvaluator({
          root,
          privateRoot: extractedPrivateRoot,
          boundaryRoots: extractedBoundaries,
          frozenWorkspace: resolve(extractedCaseRoot, entry.frozen_workspace ?? expectations.frozen_workspace),
          candidateWorkspace: resolve(extractedCaseRoot, entry.candidate_workspace),
          verificationState: entry.verification_state,
          investigatedPaths: entry.investigated_paths ?? [],
        });
        assert.deepEqual(privateFragmentProjection(fragment), expectations.fragment_projections[entry.expected_projection], `extracted review archive full projection ${entry.case_id}`);
        const expectedPoints = fragment.requirement_results.map(({ outcome }, index) => outcome === "pass" ? [5, 3, 2][index] : 0);
        assert.deepEqual(fragment.requirement_results.map(({ earned_points }) => earned_points), expectedPoints, `extracted review archive requirement points ${entry.case_id}`);
      }
    } finally {
      verifiedArchive.cleanup();
    }
    const totalityEvaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?totality=${Date.now()}`);
    for (const entry of expectations.totality_cases) {
      const candidate = resolve(work, `totality-${entry.state}`);
      cpSync(resolve(caseRoot, "correct"), candidate, { recursive: true });
      const target = resolve(candidate, "docs/worker-retries.md");
      if (entry.state === "symlink") {
        rmSync(target);
        symlinkSync(resolve(candidate, "config/retry-policy.json"), target);
      } else if (entry.state === "non_regular") {
        rmSync(target);
        execFileSync("mkfifo", [target]);
      } else if (entry.state === "unreadable") chmodSync(target, 0o000);
      else if (entry.state === "json_block_missing") writeFileSync(target, "# Worker retry policy\n\nNo example is present.\n");
      const fragment = await totalityEvaluator.evaluateCandidate({ frozenWorkspace: resolve(caseRoot, "frozen"), candidateWorkspace: candidate, verificationState: "executed_success", investigatedPaths: [] });
      assertBenchmarkSchemaInstance(fragment, { schemaPath: resolve(root, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `total candidate state ${entry.state}` });
      assert.equal(fragment.classification, "under_processing", `${entry.state} must be a candidate-quality result`);
      assert.equal(fragment.scoring_ready, false, `${entry.state} must stay non-scoring`);
      assert.deepEqual(fragment.scope_deviations, [], `${entry.state} must not create a false scope-expansion finding`);
      assert.deepEqual(fragment.requirement_results.slice(0, 2).map(({ outcome }) => outcome), ["fail", "fail"], `${entry.state} must fail documentation correctness and scope`);
      assert.deepEqual(fragment.findings.slice(0, 2).map(({ finding_id, category }) => [finding_id, category]), entry.expected_findings, `${entry.state} candidate finding authority`);
    }
    privateValidation = "pass";
  }

  console.log(JSON.stringify({ fixture_id: "mn-doc-config-correction", public_validation: "pass", synthetic_private_validation: "not_run", actual_private_validation: privateValidation, fixture_one_regression: "pass", scoring_ready: false }));
} finally {
  makeTreeRemovable(work);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
