import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys, readStableBytes, stableCanonicalJson } from "./content-addressed-store.mjs";
import { CALIBRATION_INPUT_MANIFEST_SHA256, CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { inspectSuccessorScoringInputs, successorScoringOptions } from "./ask-benchmark-prompt-successor-scoring-inputs.mjs";
import { validatePromptSuccessorPreparation, successorClosed, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { inspectVerifiedPortfolioExecution } from "./ask-benchmark-execution.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { verifyPortfolioScoringInputs, verifyPrivateEvaluatorBundle, verifyPublicEvaluatorReference, computeEvaluatorBundleId, computeEvaluatorBundleDigest, validateEvaluatorSourceIdentity, validateIndependenceStatement } from "./ask-benchmark-evaluator-boundary.mjs";
import { resolveRepositoryAdmissionDecision, resolveEffectiveAdmissionAuthorityFromRepositoryOverlayFiles, computeEffectiveAdmissionAuthorityDigest } from "./ask-benchmark-admission-decision.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const HANDLES = new WeakMap();
const ROLES = Object.freeze(["current_prompt", "prompt_v2"]);
const FIXTURE_IDS = Object.freeze(CALIBRATION_SOURCE_BINDINGS.map(([id]) => id));
const INPUT_DIGEST = `sha256:${CALIBRATION_INPUT_MANIFEST_SHA256}`;
const MAX_PRIVATE_BYTES = 256 * 1024 * 1024;
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function fail(detail) { successorFail("SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION", detail); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is required`);
  successorClosed(value, keys, label);
}
function regular(path, label) {
  assertNoSymlinkPathSegments(path, label);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file`);
}
function directory(path, label) {
  assertNoSymlinkPathSegments(path, label);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a real directory`);
  return realpathSync(path);
}
function inside(parent, path) {
  const offset = relative(parent, path);
  return offset === "" || (offset !== ".." && !offset.startsWith(`..${sep}`) && !offset.startsWith("/"));
}
function externalFile(root, path, label) {
  const absolute = resolve(path);
  regular(absolute, label);
  const repository = realpathSync(root);
  const canonical = realpathSync(absolute);
  if (inside(repository, canonical) || inside(canonical, repository)) fail(`${label} must remain outside the repository`);
  return absolute;
}
function rawJson(path, label) {
  regular(path, label);
  const bytes = readStableBytes(path, label, 1024 * 1024);
  return { bytes, value: parseJsonRejectDuplicateKeys(bytes, label), digest: hash(bytes) };
}
function git(root, args, encoding = "utf8") {
  return execFileSync("git", ["-C", root, ...args], { encoding, timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}
function reviewedPublicBytes(root, reviewedHead, paths) {
  if (!/^[a-f0-9]{40}$/u.test(reviewedHead ?? "")) fail("independent review lacks an exact source SHA");
  git(root, ["cat-file", "-e", `${reviewedHead}^{commit}`]);
  const tree = git(root, ["rev-parse", `${reviewedHead}^{tree}`]).trim();
  for (const path of paths) {
    const current = readStableBytes(resolve(root, path), `reviewed public ${path}`, 1024 * 1024);
    const reviewed = git(root, ["show", `${reviewedHead}:${path}`], null);
    if (!current.equals(reviewed)) fail(`public authority changed after independent review: ${path}`);
  }
  return tree;
}

// This inventory uses names and file types only. It must run before an API
// capable of reading a run or result file, including the private byte scanner.
function assertUnstartedRunInventory(runDir) {
  directory(runDir, "native run root");
  const names = readdirSync(runDir).sort();
  successorExact(names, ["adapters", "cases", "run-identity.json"], "pre-result run inventory");
  regular(resolve(runDir, "run-identity.json"), "run identity");
  directory(resolve(runDir, "adapters"), "adapter identity root");
  for (const name of readdirSync(resolve(runDir, "adapters"))) {
    if (!["codex.json", "claude.json"].includes(name)) fail("unrecognized adapter material before freeze");
    regular(resolve(runDir, "adapters", name), "adapter identity");
  }
  const casesRoot = directory(resolve(runDir, "cases"), "native cases root");
  const caseNames = readdirSync(casesRoot);
  if (caseNames.length === 0) fail("native case inventory is empty");
  for (const name of caseNames) {
    if (!/^[a-z0-9][a-z0-9_-]*$/u.test(name)) fail("native case path is invalid");
    const path = directory(resolve(casesRoot, name), "native case root");
    successorExact(readdirSync(path).sort(), ["attempts", "state.json"], "pre-result case inventory");
    regular(resolve(path, "state.json"), "native case state");
    const attempts = directory(resolve(path, "attempts"), "native attempts root");
    if (readdirSync(attempts).length !== 0) fail("an attempt exists before result-blind admission");
  }
}
function assertEmptyResultRoot(path) {
  directory(path, "normalized result root");
  // A root containing only the marker cannot be advanced by the normalizer.
  // The baseline is the normalizer's real zero-attempt collection, published
  // before admission and containing no normalized case result bytes.
  successorExact(readdirSync(path).sort(), ["generations", "normalized-results-root.json"], "pre-result normalized result inventory");
  regular(resolve(path, "normalized-results-root.json"), "normalized result marker");
  const generations = directory(resolve(path, "generations"), "normalized generations root");
  const names = readdirSync(generations);
  if (names.length !== 1 || !/^snapshot-[a-f0-9]{64}$/u.test(names[0])) fail("pre-result normalized collection requires one baseline generation");
  const baseline = directory(resolve(generations, names[0]), "normalized baseline generation");
  successorExact(readdirSync(baseline), ["normalized-run.json"], "pre-result normalized baseline inventory");
  regular(resolve(baseline, "normalized-run.json"), "normalized baseline manifest");
}
/** Inventory-only guard. Its return value is never an admission capability. */
export function inspectCalibrationUnstartedInventories({ sources, normalizedRoots }) {
  successorClosed(sources, ROLES, "paired sources");
  exactKeys(normalizedRoots, ROLES, "normalized result roots");
  for (const role of ROLES) {
    assertUnstartedRunInventory(sources[role].execution.runDir);
    assertEmptyResultRoot(normalizedRoots[role]);
  }
  return { kind: "calibration_unstarted_inventory_inspection", verified_native_state: false,
    verified_private_admission: false, measured_result_bytes_read: 0 };
}
function preflightNative({ preparation, sources, normalizedRoots, root }) {
  inspectCalibrationUnstartedInventories({ sources, normalizedRoots });
  const experiment = sources.current_prompt.scope.run_instance_id;
  const runParent = resolve(dirname(sources.current_prompt.execution.runDir));
  successorExact(runParent, resolve(dirname(sources.prompt_v2.execution.runDir)), "paired run parent");
  for (const extension of ["journal.json", "journal.json.lock", "authority.json"]) {
    if (existsSync(resolve(runParent, `.ask-successor-issue291-${experiment}.${extension}`))) fail("a prior measured journal, claim, or freeze exists");
  }
  const native = {};
  for (const role of ROLES) {
    const source = sources[role];
    const actual = inspectVerifiedPortfolioExecution({ ...source.execution, root });
    if (actual.cases.some(item => item.state.status !== "pending" || item.state.attempt_count !== 0 || item.attempts.length !== 0)) {
      fail("native execution has already started");
    }
    successorExact(actual.identity.repository_revision, preparation.implementation.revision, "native execution source commit");
    successorExact(actual.identity.plan.digest, source.scope.source.plan_digest, "native execution plan");
    successorExact(actual.identity.run_instance_id, source.scope.source.run_instance_id, "native run identity");
    const baseline = verifyNormalizedPortfolioResults({ root, ...source.execution, outputPath: normalizedRoots[role] });
    successorExact(baseline.manifest.inventory, [], "pre-result normalized case result inventory");
    successorExact(baseline.manifest.cases.length, actual.cases.length, "pre-result normalized case count");
    if (baseline.manifest.cases.some(item => item.status !== "pending" || item.attempt_count !== 0 || item.normalized_attempts.length !== 0)) {
      fail("pre-result normalized collection contains a started case");
    }
    native[role] = {
      run_instance_id: actual.identity.run_instance_id,
      plan_id: actual.plan.plan_id,
      plan_digest: actual.identity.plan.digest,
      materialization_manifest_digest: actual.materialization.manifestDigest,
      case_count: actual.cases.length,
      pending_count: actual.cases.length,
      attempt_count: 0,
    };
  }
  return native;
}

function privateManifest(root, entry, expectedReference) {
  const privateRoot = directory(resolve(entry.privateRoot), "private evaluator root");
  const repository = directory(root, "repository root");
  if (inside(repository, privateRoot) || inside(privateRoot, repository)) fail("private evaluator overlaps the repository");
  const manifestPath = resolve(entry.manifestPath);
  if (!inside(privateRoot, manifestPath)) fail("private manifest is outside its private root");
  const source = rawJson(manifestPath, "private evaluator manifest");
  const manifest = source.value;
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, "benchmarks/schemas/private-evaluator-bundle.schema.json"), label: "calibration private evaluator manifest" });
  if (manifest.evaluator_bundle_id !== computeEvaluatorBundleId(manifest) || manifest.evaluator_bundle_digest !== computeEvaluatorBundleDigest(manifest)) fail("private bundle identity drift");
  successorExact(manifest.fixture_identity.fixture_id, expectedReference.fixture_id, "private fixture identity");
  successorExact(manifest.fixture_identity.suite, "calibration", "private fixture suite");
  successorExact(manifest.input_identity.fixture_input_digest, INPUT_DIGEST, "private input identity");
  successorExact(manifest.evaluator_bundle_id, expectedReference.evaluator_bundle_id, "private bundle ID");
  successorExact(manifest.evaluator_bundle_digest, expectedReference.evaluator_bundle_digest, "private bundle digest");
  successorExact(manifest.evaluator_source_identity, expectedReference.evaluator_source_identity, "private evaluator source identity");
  successorExact(manifest.dependency_graph, expectedReference.evaluator_source_identity.dependency_graph, "private evaluator graph");
  validateEvaluatorSourceIdentity({ identity: manifest.evaluator_source_identity, root, expectedRevision: manifest.evaluator_revision,
    expectedGeneratorSourceDigest: manifest.generator.source_digest, label: "calibration private evaluator source" });
  const expectedFiles = new Set([relative(privateRoot, manifestPath).split(sep).join("/")]);
  let independence = null;
  for (const asset of manifest.asset_inventory) {
    const path = resolve(privateRoot, asset.path);
    if (!inside(privateRoot, path) || expectedFiles.has(asset.path)) fail("private asset path is invalid or duplicated");
    expectedFiles.add(asset.path);
    regular(path, "private evaluator asset");
    const bytes = readStableBytes(path, `private evaluator asset ${asset.role}`, MAX_PRIVATE_BYTES);
    successorExact([bytes.length, hash(bytes)], [asset.bytes, asset.sha256], "private evaluator asset bytes");
    if (asset.role === "independence_provenance") independence = parseJsonRejectDuplicateKeys(bytes, "private evaluator independence statement");
  }
  if (!independence) fail("private independence statement is missing");
  validateIndependenceStatement({ statement: independence, manifest, root });
  const actualFiles = new Set();
  function visit(path) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const absolute = resolve(path, item.name);
      if (item.isSymbolicLink()) fail("private evaluator contains a symlink");
      if (item.isDirectory()) visit(absolute);
      else if (item.isFile()) actualFiles.add(relative(privateRoot, absolute).split(sep).join("/"));
      else fail("private evaluator contains a non-regular entry");
    }
  }
  visit(privateRoot);
  successorExact([...actualFiles].sort(), [...expectedFiles].sort(), "private evaluator file inventory");
  return { manifest, manifest_source_digest: source.digest, private_inventory_digest: canonicalDigest([...actualFiles].sort()), independence_status: "verified" };
}

/** Pure shape guard; the scoring-input handle and #197 resolver remain required. */
export function assertCalibrationScoringAdmissionCandidate(scoring) {
  successorExact(scoring?.fixtures?.map(f => [f.fixture_id, f.source_fixture_id]),
    CALIBRATION_SOURCE_BINDINGS.map(([id, sourceId]) => [id, sourceId]), "calibration fixture/source mapping");
  for (const entry of scoring.fixtures) {
    if (entry.admission_status !== "admission_pending" || entry.effective_admission_status !== "review_evidence_missing"
        || entry.admission_overlay === null || !entry.admission_overlay?.decision_digest) {
      fail(`${entry.fixture_id} lacks frozen pending authority and an independently reviewable pinned decision`);
    }
  }
  return { kind: "calibration_scoring_candidate_inspection", creates_admission: false };
}

function staticClosure({ preparation, sources, scoringInputs, admissionSourcesByFixture, normalizedRoots, root }) {
  validatePromptSuccessorPreparation(preparation);
  successorExact(resolve(root), ROOT, "calibration admission repository");
  successorClosed(sources, ROLES, "paired sources");
  exactKeys(admissionSourcesByFixture, FIXTURE_IDS, "private admission inventory");
  exactKeys(normalizedRoots, ROLES, "normalized result roots");
  const scoring = inspectSuccessorScoringInputs(scoringInputs, preparation);
  successorExact(scoring.manifest_digest, preparation.scoring_input_manifest_digest, "preparation scoring identity");
  assertCalibrationScoringAdmissionCandidate(scoring);
  const sourceIdentity = preparation.implementation;
  const fixtures = [];
  const effectiveAuthorities = new Map();
  for (const [fixtureId, sourceId] of CALIBRATION_SOURCE_BINDINGS) {
    const score = scoring.fixtures.find(item => item.fixture_id === fixtureId);
    const entry = admissionSourcesByFixture[fixtureId];
    exactKeys(entry, ["privateRoot", "manifestPath", "reviewAuthorityPath", "reviewAuthoritySourceDigest", "reviewArchivePath"], `${fixtureId} private admission sources`);
    externalFile(root, entry.reviewAuthorityPath, "independent review authority");
    externalFile(root, entry.reviewArchivePath, "independent review archive");
    const options = successorScoringOptions(scoringInputs, preparation, fixtureId);
    const { scoringInputFreezeManifestPath: freezeManifestPath, scoringInputFreezeManifestSourceDigest: freezeManifestSourceDigest, ...paths } = options;
    const publicInputs = verifyPortfolioScoringInputs({ ...paths, freezeManifestPath, freezeManifestSourceDigest });
    successorExact(publicInputs.freezeManifest.fixture_id, fixtureId, "public freeze fixture");
    successorExact(publicInputs.freezeManifest.fixture_input_digest, INPUT_DIGEST, "public freeze input");
    const repositoryDecision = resolveRepositoryAdmissionDecision({ root, repositoryRevision: sourceIdentity.revision, fixtureId });
    if (!repositoryDecision) fail(`${fixtureId} repository admission decision is missing`);
    successorExact(repositoryDecision.path, score.admission_overlay.path, "pinned admission decision path");
    successorExact(repositoryDecision.raw_byte_digest, score.admission_overlay.raw_digest, "pinned admission decision bytes");
    const effective = resolveEffectiveAdmissionAuthorityFromRepositoryOverlayFiles({
      root, repositoryDecision: repositoryDecision.decision,
      reviewAuthorityPath: entry.reviewAuthorityPath, reviewAuthoritySourceDigest: entry.reviewAuthoritySourceDigest,
      reviewArchivePath: entry.reviewArchivePath,
      frozenAdmissionRecord: publicInputs.admissionRecord,
      frozenAdmissionSource: publicInputs.sources.admissionRecord,
      requirementRecord: publicInputs.requirementRecord,
      requirementRecordSource: publicInputs.sources.requirementRecord,
      evaluatorReference: publicInputs.evaluatorReference,
      scoringInputFreezeManifest: publicInputs.freezeManifest,
      scoringInputFreezeManifestSource: publicInputs.freezeManifestSource,
    });
    if (effective.effective_admission_status !== "admitted" || effective.authority_mode !== "admitted_overlay") fail(`${fixtureId} lacks approved independent execution admission`);
    const review = rawJson(resolve(entry.reviewAuthorityPath), "independent review authority").value;
    successorExact(review.review_status, "approved", "independent review status");
    successorExact(review.author_self_approval, false, "independent review self approval");
    successorExact(review.blocking_finding_count, 0, "independent review findings");
    successorExact(review.reviewed_repository, "ist-h-i/agent-spectrum-kernel", "independent review repository");
    successorExact(review.reviewed_head_revision, repositoryDecision.decision.reviewed_head_revision, "exact reviewed source SHA");
    git(root, ["merge-base", "--is-ancestor", review.reviewed_head_revision, sourceIdentity.revision]);
    const publicPaths = ["final-admission-record.json", "requirement-record.json", "output-contract.json", "evaluator-reference.json",
      "scoring-input-freeze-manifest.json", "metadata.json", "evidence-map.json", "verification-command-contract.json", "evaluator-authority-manifest.json"]
      .map(name => `benchmarks/fixtures/checkpoint-b2/${fixtureId}/${name}`);
    const reviewedTree = reviewedPublicBytes(root, review.reviewed_head_revision, publicPaths);
    const publicReference = verifyPublicEvaluatorReference({ root, referencePath: paths.referencePath, privateRoot: entry.privateRoot });
    successorExact(publicReference, publicInputs.evaluatorReference, "public evaluator reference after review");
    const privateIdentity = privateManifest(root, entry, publicReference);
    effectiveAuthorities.set(fixtureId, effective);
    fixtures.push({ fixture_id: fixtureId, source_fixture_id: sourceId, input_manifest_digest: INPUT_DIGEST,
      public_freeze_manifest_digest: publicInputs.freezeManifest.manifest_digest,
      public_freeze_source_digest: publicInputs.freezeManifestSourceDigest,
      evaluator_public_reference_digest: publicReference.public_metadata_digest,
      evaluator_authority_manifest_digest: publicInputs.evaluatorAuthorityManifest?.manifest_digest ?? null,
      private_bundle_id: privateIdentity.manifest.evaluator_bundle_id,
      private_bundle_digest: privateIdentity.manifest.evaluator_bundle_digest,
      private_root_path_digest: canonicalDigest({ path: realpathSync(entry.privateRoot) }),
      private_manifest_path_digest: canonicalDigest({ path: realpathSync(entry.manifestPath) }),
      private_manifest_source_digest: privateIdentity.manifest_source_digest,
      private_inventory_digest: privateIdentity.private_inventory_digest,
      evaluator_revision: privateIdentity.manifest.evaluator_revision,
      evaluator_source_identity_digest: canonicalDigest(privateIdentity.manifest.evaluator_source_identity),
      dependency_graph_digest: privateIdentity.manifest.dependency_graph.graph_digest,
      independence_statement_digest: privateIdentity.manifest.independence.statement_digest,
      independence_status: privateIdentity.independence_status,
      review_status: review.review_status, reviewer_type: review.reviewer_type,
      review_authority_digest: review.authority_digest, review_authority_source_digest: entry.reviewAuthoritySourceDigest,
      review_authority_path_digest: canonicalDigest({ path: realpathSync(entry.reviewAuthorityPath) }),
      review_archive_path_digest: canonicalDigest({ path: realpathSync(entry.reviewArchivePath) }),
      review_archive_digest: review.review_evidence.archive_sha256,
      reviewed_head_revision: review.reviewed_head_revision, reviewed_head_tree: reviewedTree,
      admission_decision_digest: repositoryDecision.decision.decision_digest,
      effective_admission_digest: computeEffectiveAdmissionAuthorityDigest(effective),
    });
  }
  const body = { schema_version: "1.0.0", kind: "calibration_private_execution_admission", issue: 291,
    phase: "pre_result", implementation: structuredClone(sourceIdentity),
    preparation_digest: preparation.preparation_digest,
    scoring_input_manifest_digest: scoring.manifest_digest,
    execution_config_digest: scoring.execution_config_digest,
    runtime_identity_digest: canonicalDigest(preparation.runtime),
    experiment_run_instance_id: sources.current_prompt.scope.run_instance_id,
    source_scope_digests: Object.fromEntries(ROLES.map(role => [role, sources[role].scope.scope_digest])),
    run_root_identity_digest: canonicalDigest(ROLES.map(role => resolve(sources[role].execution.runDir))),
    result_root_identity_digest: canonicalDigest(ROLES.map(role => resolve(normalizedRoots[role]))),
    fixtures, automatic_retry_authorized: false, measured_result_reads_at_admission: 0,
  };
  return { evidence: { ...body, admission_digest: canonicalDigest(body) }, effectiveAuthorities };
}

function createHandle(input, { preflightComplete, expectedDigest = null } = {}) {
  const closure = staticClosure(input);
  if (expectedDigest !== null) successorExact(closure.evidence.admission_digest, expectedDigest, "reopened calibration execution admission");
  const handle = Object.freeze({ kind: "calibration_execution_admission_handle" });
  HANDLES.set(handle, { input, evidence: closure.evidence, preflightComplete });
  return handle;
}

/** Open only before any claim or result. This reads no measured output bytes. */
export function openCalibrationExecutionAdmission(input) {
  const { preparation, sources, admissionSourcesByFixture, normalizedRoots, root = ROOT } = input ?? {};
  const trusted = { preparation, sources, scoringInputs: input?.scoringInputs, admissionSourcesByFixture, normalizedRoots, root };
  preflightNative({ preparation, sources, normalizedRoots, root });
  const handle = createHandle(trusted, { preflightComplete: true });
  for (const fixtureId of FIXTURE_IDS) {
    const entry = admissionSourcesByFixture[fixtureId];
    const referencePath = successorScoringOptions(input.scoringInputs, preparation, fixtureId).referencePath;
    for (const role of ROLES) {
      inspectCalibrationUnstartedInventories({ sources, normalizedRoots });
      verifyPrivateEvaluatorBundle({ root, referencePath,
        privateRoot: entry.privateRoot, manifestPath: entry.manifestPath,
        materializedPath: sources[role].execution.materializedPath,
        selectionState: sources[role].execution.selectionState,
        runDir: sources[role].execution.runDir, normalizedResultsPath: normalizedRoots[role] });
      inspectCalibrationUnstartedInventories({ sources, normalizedRoots });
    }
  }
  return handle;
}

/** Recovery requires the exact private/review sources supplied again. No run or result bytes are read. */
export function reopenCalibrationExecutionAdmission(input, expectedDigest) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(expectedDigest ?? "")) fail("reopen requires a frozen admission digest");
  return createHandle({ ...input, root: input?.root ?? ROOT }, { preflightComplete: false, expectedDigest });
}

export function assertCalibrationExecutionAdmission(handle, { preparation, sources, scoringInputs, requirePreflight = false } = {}) {
  const value = HANDLES.get(handle);
  if (!value) fail("opaque admission handle is required");
  if (requirePreflight && !value.preflightComplete) fail("a recovery handle cannot create a new freeze");
  const current = staticClosure({ ...value.input, preparation, sources, scoringInputs });
  successorExact(current.evidence, value.evidence, "calibration execution admission drift");
  return structuredClone(value.evidence);
}

export function calibratedEffectiveAdmission(handle, fixtureId, context) {
  assertCalibrationExecutionAdmission(handle, context);
  if (!FIXTURE_IDS.includes(fixtureId)) fail("cross-fixture effective admission request");
  return staticClosure({ ...HANDLES.get(handle).input, ...context }).effectiveAuthorities.get(fixtureId);
}

export function assertCalibrationResultRoot(handle, role, path, context) {
  assertCalibrationExecutionAdmission(handle, context);
  if (!ROLES.includes(role)) fail("unknown Prompt role for normalized result root");
  successorExact(resolve(path), resolve(HANDLES.get(handle).input.normalizedRoots[role]), "frozen normalized result root");
}

export function inspectCalibrationExecutionAdmission(handle) {
  const value = HANDLES.get(handle);
  if (!value) fail("opaque admission handle is required");
  return structuredClone(value.evidence);
}
