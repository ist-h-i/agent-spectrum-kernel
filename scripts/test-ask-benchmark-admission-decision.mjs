import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertAdmissionDecisionAppendOnly,
  assertImmutableGitDiffUnchanged,
  changedPathsFromGitDiff,
  computeAdmissionDecisionDigest,
  computeAdmissionDecisionId,
  ImmutableAuthorityRevisionUnavailableError,
  resolveEffectiveAdmissionAuthority,
  validatePortfolioAdmissionDecision,
} from "./ask-benchmark-admission-decision.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { validateMnBuildOptionUpdatePublicFixture } from "./ask-benchmark-mn-build-option-update.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stableTmp = realpathSync(tmpdir());
const digest = (value) => canonicalDigest({ value });
const bytes = (value, space = 2) => Buffer.from(`${JSON.stringify(value, null, space)}\n`);
const rawDigest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const REVIEW_ARCHIVE_BYTES = Buffer.from("synthetic independent admission review archive\n");

function frozenAdmission(status = "admission_pending", fixtureId = "synthetic-fixture") {
  const base = {
    fixture_id: fixtureId,
    catalog_digest: digest("catalog"),
    input_manifest_digest: digest(`input:${fixtureId}`),
    evaluator_reference_schema: "benchmarks/schemas/evaluator-reference.schema.json",
    evaluator_bundle_id: `evaluator-${"a".repeat(64)}`,
    evaluator_bundle_digest: digest("bundle"),
    evaluator_byte_count: 4096,
    evaluator_requirement_count: 1,
    evidence_map_ids: ["evidence-one"],
    mutation_set_ids: ["mutation-one"],
    reviewer_record_id: "review-pending",
    admission_revision: 1,
    admission_status: status,
  };
  return { ...base, admission_digest: canonicalDigest(base) };
}

function requirementRecord(admission) {
  const requirement = {
    requirement_id: "requirement-one",
    requirement_kind: "weighted",
    max_points: 1,
    partial_credit_allowed: false,
    safety_dimension: "none",
    evidence_map_ids: ["evidence-one"],
    mutation_ids: ["mutation-one"],
    equivalence_class_ids: ["equivalent-one"],
    finding_group_id: "finding-one",
  };
  requirement.requirement_digest = canonicalDigest(requirement);
  const base = {
    requirement_record_id: "requirement-record-synthetic",
    requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
    requirement_record_path: "benchmarks/fixtures/synthetic/requirement-record.json",
    fixture_id: admission.fixture_id,
    catalog_digest: admission.catalog_digest,
    policy_manifest_digest: digest("policy-manifest"),
    scoring_policy_digest: digest("scoring-policy"),
    admission_record_digest: admission.requirement_authority_digest ?? admission.admission_digest,
    requirements: [requirement],
    requirement_set_digest: canonicalDigest([requirement]),
  };
  return { ...base, requirement_record_digest: canonicalDigest(base) };
}

function evaluatorReference(admission) {
  const base = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/evaluator-reference.schema.json",
    program: "adaptive_ask_evaluator_reference",
    evaluator_bundle_id: admission.evaluator_bundle_id,
    evaluator_bundle_digest: admission.evaluator_bundle_digest,
    evaluator_bundle_schema_version: "1.0.0",
    fixture_id: admission.fixture_id,
    fixture_input_digest: admission.input_manifest_digest,
    task_class: "implementation",
    suite: "calibration",
    evaluator_revision: "b".repeat(40),
    generator_identity: { id: "generator", version: "1.0.0", source_digest: digest("generator") },
    independence_statement_digest: digest("independence"),
    review_record_digest: digest("bundle-review"),
    storage_class: "private_external",
  };
  return { ...base, public_metadata_digest: canonicalDigest(base) };
}

function reviewAuthority() {
  return {
    review_status: "approved",
    author_self_approval: false,
    reviewer_type: "independent_panel",
    reviewer_record_id: "independent-review-r1",
    reviewer_count: 2,
    reviewed_at: "2026-08-03T00:00:00Z",
    reviewed_repository: "ist-h-i/agent-spectrum-kernel",
    reviewed_pull_request: 224,
    reviewed_head_revision: "c".repeat(40),
    blocking_finding_count: 0,
    review_evidence: { archive_sha256: rawDigest(REVIEW_ARCHIVE_BYTES), archive_bytes: REVIEW_ARCHIVE_BYTES.length },
  };
}

function freezeManifest(admission, requirement, reference, admissionBytes, requirementBytes) {
  const base = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
    program: "adaptive_ask_scoring_input_freeze",
    fixture_id: admission.fixture_id,
    admission_record: {
      path: "benchmarks/fixtures/synthetic/final-admission-record.json",
      raw_byte_digest: rawDigest(admissionBytes),
      semantic_digest: admission.admission_digest,
    },
    requirement_record: {
      path: "benchmarks/fixtures/synthetic/requirement-record.json",
      raw_byte_digest: rawDigest(requirementBytes),
      record_digest: requirement.requirement_record_digest,
      set_digest: requirement.requirement_set_digest,
    },
    evaluator_public_reference: {
      path: "benchmarks/fixtures/synthetic/evaluator-reference.json",
      raw_byte_digest: digest("reference-raw"),
      semantic_digest: reference.public_metadata_digest,
    },
  };
  return { ...base, manifest_digest: canonicalDigest(base) };
}

function fixture(status = "admission_pending") {
  const admission = frozenAdmission(status);
  const requirement = requirementRecord(admission);
  const reference = evaluatorReference(admission);
  const admissionBytes = bytes(admission);
  const requirementBytes = bytes(requirement);
  const freeze = freezeManifest(admission, requirement, reference, admissionBytes, requirementBytes);
  const options = {
    frozenAdmissionRecord: admission,
    frozenAdmissionSource: { path: "benchmarks/fixtures/synthetic/final-admission-record.json", bytes: admissionBytes },
    requirementRecord: requirement,
    requirementRecordSource: { path: "benchmarks/fixtures/synthetic/requirement-record.json", bytes: requirementBytes },
    evaluatorReference: reference,
    scoringInputFreezeManifest: freeze,
    scoringInputFreezeManifestSource: { path: "benchmarks/fixtures/synthetic/scoring-input-freeze-manifest.json", bytes: bytes(freeze) },
    reviewAuthority: reviewAuthority(),
    reviewArchiveSource: { bytes: REVIEW_ARCHIVE_BYTES },
  };
  const decisionBase = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/portfolio-admission-decision.schema.json",
    program: "adaptive_ask_portfolio_admission_decision",
    decision_revision: 1,
    fixture_id: admission.fixture_id,
    decision_status: "admitted",
    ...structuredClone(options.reviewAuthority),
    evaluator: {
      evaluator_revision: reference.evaluator_revision,
      evaluator_bundle_id: reference.evaluator_bundle_id,
      evaluator_bundle_digest: reference.evaluator_bundle_digest,
      evaluator_bundle_bytes: admission.evaluator_byte_count,
    },
    evaluator_public_reference_digest: reference.public_metadata_digest,
    frozen_admission_authority: {
      path: options.frozenAdmissionSource.path,
      raw_byte_digest: freeze.admission_record.raw_byte_digest,
      semantic_digest: admission.admission_digest,
      requirement_authority_digest: admission.requirement_authority_digest ?? admission.admission_digest,
    },
    frozen_requirement_record: {
      path: options.requirementRecordSource.path,
      raw_byte_digest: freeze.requirement_record.raw_byte_digest,
      record_digest: requirement.requirement_record_digest,
      set_digest: requirement.requirement_set_digest,
    },
    frozen_scoring_input_manifest: {
      path: options.scoringInputFreezeManifestSource.path,
      raw_byte_digest: rawDigest(bytes(freeze)),
      semantic_digest: freeze.manifest_digest,
    },
  };
  decisionBase.decision_id = computeAdmissionDecisionId(decisionBase);
  const decision = { ...decisionBase, decision_digest: computeAdmissionDecisionDigest(decisionBase) };
  return { options, decision, admissionBytes: Buffer.from(admissionBytes), requirementBytes: Buffer.from(requirementBytes) };
}

function reseal(decision) {
  decision.decision_id = computeAdmissionDecisionId(decision);
  decision.decision_digest = computeAdmissionDecisionDigest(decision);
}

function rejectsMutation(label, mutate, pattern = /authority|identity|digest|fixture|evaluator|review/i) {
  test(label, () => {
    const { options, decision } = fixture();
    mutate({ options, decision });
    assert.throws(() => resolveEffectiveAdmissionAuthority({ ...options, decisionOverlay: decision }), pattern);
  });
}

test("admitted overlay resolves pending frozen authority without changing frozen bytes", () => {
  const { options, decision, admissionBytes, requirementBytes } = fixture();
  const resolved = resolveEffectiveAdmissionAuthority({ ...options, decisionOverlay: decision });
  assert.equal(resolved.authority_mode, "admitted_overlay");
  assert.equal(resolved.effective_admission_status, "admitted");
  assert.equal(resolved.admission_decision_digest, decision.decision_digest);
  assert.deepEqual(options.frozenAdmissionSource.bytes, admissionBytes);
  assert.deepEqual(options.requirementRecordSource.bytes, requirementBytes);
});

test("legacy admitted record remains admitted without an overlay", () => {
  const { options } = fixture("admitted");
  const resolved = resolveEffectiveAdmissionAuthority({
    frozenAdmissionRecord: options.frozenAdmissionRecord,
    requirementRecord: options.requirementRecord,
    evaluatorReference: options.evaluatorReference,
  });
  assert.equal(resolved.authority_mode, "legacy_admitted_record");
  assert.equal(resolved.effective_admission_status, "admitted");
  assert.equal(resolved.admission_decision_digest, null);
});

test("pending frozen authority is non-scoring-ready without an overlay", () => {
  const { options } = fixture();
  const resolved = resolveEffectiveAdmissionAuthority({
    frozenAdmissionRecord: options.frozenAdmissionRecord,
    requirementRecord: options.requirementRecord,
    evaluatorReference: options.evaluatorReference,
  });
  assert.equal(resolved.authority_mode, "not_admitted");
  assert.equal(resolved.effective_admission_status, "admission_pending");
});

rejectsMutation("admitted overlay rejects pending review", ({ decision }) => { decision.review_status = "pending"; reseal(decision); }, /approved/);
rejectsMutation("admitted overlay rejects unknown review", ({ decision }) => { decision.review_status = "unknown"; reseal(decision); }, /approved/);
rejectsMutation("admitted overlay rejects author self-approval", ({ decision }) => { decision.author_self_approval = true; reseal(decision); }, /equal false|self-approval/i);
rejectsMutation("admitted overlay rejects blockers", ({ decision }) => { decision.blocking_finding_count = 1; reseal(decision); }, /zero blocking/);
rejectsMutation("cross-fixture overlay transplant is rejected", ({ decision }) => { decision.fixture_id = "other-fixture"; reseal(decision); });
rejectsMutation("admitted overlay rejects wrong reviewed head", ({ decision }) => { decision.reviewed_head_revision = "d".repeat(40); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong evaluator revision", ({ decision }) => { decision.evaluator.evaluator_revision = "d".repeat(40); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong bundle ID", ({ decision }) => { decision.evaluator.evaluator_bundle_id = `evaluator-${"d".repeat(64)}`; reseal(decision); });
rejectsMutation("admitted overlay rejects wrong bundle digest", ({ decision }) => { decision.evaluator.evaluator_bundle_digest = digest("other-bundle"); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong bundle bytes", ({ decision }) => { decision.evaluator.evaluator_bundle_bytes += 1; reseal(decision); });
rejectsMutation("admitted overlay rejects wrong archive SHA", ({ decision }) => { decision.review_evidence.archive_sha256 = digest("other-archive"); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong archive bytes", ({ decision }) => { decision.review_evidence.archive_bytes += 1; reseal(decision); });
rejectsMutation("admitted overlay rejects review archive raw-byte drift", ({ options }) => { options.reviewArchiveSource.bytes = Buffer.from("drifted review archive\n"); }, /archive raw identity/);
rejectsMutation("admitted overlay rejects frozen admission raw drift", ({ options }) => { options.frozenAdmissionSource.bytes = bytes(options.frozenAdmissionRecord, 0); });
rejectsMutation("admitted overlay rejects frozen admission semantic drift", ({ options }) => {
  options.frozenAdmissionRecord.admission_revision += 1;
  const base = { ...options.frozenAdmissionRecord };
  delete base.admission_digest;
  options.frozenAdmissionRecord.admission_digest = canonicalDigest(base);
  options.frozenAdmissionSource.bytes = bytes(options.frozenAdmissionRecord);
});
rejectsMutation("admitted overlay rejects requirement raw drift", ({ options }) => { options.requirementRecordSource.bytes = bytes(options.requirementRecord, 0); });
rejectsMutation("admitted overlay rejects requirement record drift", ({ options }) => {
  options.requirementRecord.requirement_record_id = "requirement-record-other";
  const base = { ...options.requirementRecord };
  delete base.requirement_record_digest;
  options.requirementRecord.requirement_record_digest = canonicalDigest(base);
  options.requirementRecordSource.bytes = bytes(options.requirementRecord);
});
rejectsMutation("admitted overlay rejects requirement set drift", ({ options }) => {
  options.requirementRecord.requirement_set_digest = digest("other-set");
  const base = { ...options.requirementRecord };
  delete base.requirement_record_digest;
  options.requirementRecord.requirement_record_digest = canonicalDigest(base);
  options.requirementRecordSource.bytes = bytes(options.requirementRecord);
}, /requirement set/);
rejectsMutation("admitted overlay rejects evaluator-reference digest drift", ({ options }) => {
  options.evaluatorReference.review_record_digest = digest("other-review");
  const base = { ...options.evaluatorReference };
  delete base.public_metadata_digest;
  options.evaluatorReference.public_metadata_digest = canonicalDigest(base);
});
rejectsMutation("outer decision reseal cannot replace an inner authority identity", ({ decision }) => {
  decision.frozen_admission_authority.semantic_digest = digest("resealed-inner");
  reseal(decision);
});
rejectsMutation("cross-evaluator overlay transplant is rejected", ({ decision }) => {
  decision.evaluator.evaluator_bundle_digest = digest("transplanted-evaluator");
  reseal(decision);
});

test("changes-requested and rejected overlays remain non-scoring-ready", () => {
  for (const status of ["changes_requested", "rejected"]) {
    const { options, decision } = fixture();
    decision.decision_status = status;
    decision.review_status = status;
    if (status === "changes_requested") decision.blocking_finding_count = 1;
    options.reviewAuthority.review_status = status;
    options.reviewAuthority.blocking_finding_count = decision.blocking_finding_count;
    reseal(decision);
    const resolved = resolveEffectiveAdmissionAuthority({ ...options, decisionOverlay: decision });
    assert.equal(resolved.authority_mode, "not_admitted");
    assert.equal(resolved.effective_admission_status, status);
  }
});

test("a later decision revision has a new digest and cannot rewrite the consumed revision", () => {
  const { decision } = fixture();
  const next = structuredClone(decision);
  next.decision_revision += 1;
  reseal(next);
  assertAdmissionDecisionAppendOnly(decision, next);
  assert.notEqual(next.decision_digest, decision.decision_digest);
  assert.throws(() => assertAdmissionDecisionAppendOnly(next, decision), /increase/);
});

test("caller-supplied empty or partial expected authority cannot validate an admitted decision", () => {
  const { decision } = fixture();
  for (const expectedAuthority of [{}, { fixture_id: decision.fixture_id }, { reviewed_head_revision: decision.reviewed_head_revision }]) {
    assert.throws(() => validatePortfolioAdmissionDecision(decision, { expectedAuthority }), /caller-supplied expected admission authority is prohibited/);
  }
});

test("complete authority sources reject missing review, archive, evaluator, or head identity", () => {
  for (const field of ["review_evidence", "reviewed_head_revision"]) {
    const { options, decision } = fixture();
    delete options.reviewAuthority[field];
    assert.throws(() => validatePortfolioAdmissionDecision(decision, { authoritySources: options }), /missing fields|archive/i);
  }
  const { options, decision } = fixture();
  delete options.evaluatorReference.evaluator_revision;
  assert.throws(() => validatePortfolioAdmissionDecision(decision, { authoritySources: options }), /evaluator|digest/i);
});

test("actual Git diff closes the historical R21 to required R22 transition", () => {
  const inventory = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/admission-decision/approved-r21-immutable-paths.json"), "utf8"));
  assert.equal(inventory.authority_source.reviewed_head_revision, "7db95b7a33878aa327192648d5ffc191d22c005e");
  assert.equal(inventory.authority_source.evaluator_public_reference_digest, "sha256:186111ffa02586e36c86b1e375e4d62aa74e0c9da9b51ab2d08c8cd5d4a27839");
  assert.equal(inventory.inventory_digest, canonicalDigest(inventory.paths));
  assert.equal(inventory.paths.length, 44);
  assert.deepEqual(inventory.lifecycle_transition, {
    r21_status: "historical_reviewed_authority",
    post_pr_238_evaluator_revision: "R22",
    required_generation_count_after_pr_238_merge: 1,
    r22_frozen_admission_status: "admission_pending",
    later_admission_authority: "append_only_admission_decision_overlay",
    later_admission_requires_r23: false,
  });
  const fixturePrefix = `benchmarks/fixtures/checkpoint-b2/${inventory.authority_source.fixture_id}/`;
  const frozenFixturePaths = inventory.paths.filter((path) => path.startsWith(fixturePrefix));
  const historicalSourcePaths = inventory.paths.filter((path) => !path.startsWith(fixturePrefix));
  assert.equal(frozenFixturePaths.length, inventory.path_partition.frozen_fixture_authority_count);
  assert.equal(historicalSourcePaths.length, inventory.path_partition.historical_evaluator_source_count);
  const reviewedHead = inventory.authority_source.reviewed_head_revision;
  const reviewedCommit = spawnSync("git", ["cat-file", "-e", `${reviewedHead}^{commit}`], { cwd: root, encoding: "utf8" });
  assert.equal(reviewedCommit.status, 0, reviewedCommit.stderr || `historical R21 reviewed HEAD is unavailable: ${reviewedHead}`);
  const historicalFixtureBytes = new Map(frozenFixturePaths.map((path) => {
    const historical = spawnSync("git", ["show", `${reviewedHead}:${path}`], { cwd: root, encoding: null, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(historical.status, 0, historical.stderr?.toString("utf8") || `historical R21 path is unavailable: ${path}`);
    return [path, historical.stdout];
  }));
  const referencePath = frozenFixturePaths.find((path) => path.endsWith("/evaluator-reference.json"));
  assert.ok(referencePath, "historical R21 inventory must include the evaluator reference");
  const historicalReference = JSON.parse(historicalFixtureBytes.get(referencePath).toString("utf8"));
  const historicalReferenceAuthority = { ...historicalReference };
  delete historicalReferenceAuthority.public_metadata_digest;
  assert.equal(historicalReference.fixture_id, inventory.authority_source.fixture_id);
  assert.match(historicalReference.evaluator_revision, /^[0-9a-f]{40}$/u);
  assert.equal(historicalReference.public_metadata_digest, canonicalDigest(historicalReferenceAuthority));
  assert.equal(historicalReference.public_metadata_digest, inventory.authority_source.evaluator_public_reference_digest);

  const currentReference = JSON.parse(readFileSync(resolve(root, referencePath), "utf8"));
  if (currentReference.public_metadata_digest === historicalReference.public_metadata_digest) {
    for (const [path, historicalBytes] of historicalFixtureBytes) assert.deepEqual(readFileSync(resolve(root, path)), historicalBytes, `pre-R22 fixture path must retain historical bytes: ${path}`);
  } else {
    assert.equal(currentReference.evaluator_revision, "166ac26fbc58035ed00114e4035d202ace758433");
    assert.notEqual(currentReference.evaluator_revision, historicalReference.evaluator_revision);
    const frozenDiff = spawnSync("git", ["diff", "--name-only", reviewedHead, "HEAD", "--", ...frozenFixturePaths], { cwd: root, encoding: "utf8" });
    assert.equal(frozenDiff.status, 0, frozenDiff.stderr || frozenDiff.stdout);
    assert.deepEqual(frozenDiff.stdout.trim().split("\n").sort(), [...frozenFixturePaths].sort(), "R22 successor projection must replace all five current fixture authority paths");
    const publicSummary = validateMnBuildOptionUpdatePublicFixture({ root });
    const currentAdmission = JSON.parse(readFileSync(resolve(root, fixturePrefix, "final-admission-record.json"), "utf8"));
    const currentReview = JSON.parse(readFileSync(resolve(root, fixturePrefix, "admission-review.json"), "utf8"));
    const currentMetadata = JSON.parse(readFileSync(resolve(root, fixturePrefix, "metadata.json"), "utf8"));
    assert.equal(currentAdmission.admission_status, "admission_pending");
    assert.equal(currentReview.reviewer_status, "pending_independent_review");
    assert.equal(currentReview.admission_status, "admission_pending");
    assert.equal(currentMetadata.measured_execution_performed, false);
    assert.equal(publicSummary.reviewStatus, "pending_independent_review");
    assert.equal(publicSummary.scoringReady, false);
  }
  const sourceDiff = spawnSync("git", ["diff", "--name-only", "origin/main", "--", ...historicalSourcePaths], { cwd: root, encoding: "utf8" });
  assert.equal(sourceDiff.status, 0, sourceDiff.stderr || sourceDiff.stdout);
  assert.notEqual(sourceDiff.stdout.trim(), "", "the post-PR #238 evaluator source must require R22 instead of claiming R21 reuse");
});

test("actual protected-path commit is rejected without a caller-maintained changed-path list", () => {
  const repository = mkdtempSync(resolve(stableTmp, "ask-admission-immutable-diff-"));
  const protectedPath = "scripts/ask-benchmark-evaluator-boundary.mjs";
  const git = (...args) => spawnSync("git", args, { cwd: repository, encoding: "utf8" });
  try {
    mkdirSync(resolve(repository, "scripts"), { recursive: true });
    writeFileSync(resolve(repository, protectedPath), "export const frozen = true;\n");
    assert.equal(git("init", "-q").status, 0);
    assert.equal(git("add", "--", protectedPath).status, 0);
    assert.equal(git("-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "commit", "-qm", "base").status, 0);
    const baseRevision = git("rev-parse", "HEAD").stdout.trim();
    writeFileSync(resolve(repository, protectedPath), "export const frozen = false;\n");
    assert.equal(git("add", "--", protectedPath).status, 0);
    assert.equal(git("-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "commit", "-qm", "mutate protected path").status, 0);
    assert.throws(() => assertImmutableGitDiffUnchanged({ root: repository, baseRevision, immutablePaths: [protectedPath] }), /immutable source paths changed/);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

function gitOk(repository, ...args) {
  const result = spawnSync("git", args, { cwd: repository, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout || args.join(" "));
  return result.stdout.trim();
}

function commitAll(repository, message) {
  gitOk(repository, "add", "-A");
  gitOk(repository, "-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "commit", "-qm", message);
  return gitOk(repository, "rev-parse", "HEAD");
}

test("R22 is required once after the R21 source transition and the later overlay does not require R23", () => {
  const repository = mkdtempSync(resolve(stableTmp, "ask-admission-r21-dag-"));
  const protectedPath = "scripts/ask-benchmark-evaluator-boundary.mjs";
  const successorSourcePath = "scripts/ask-benchmark-scoring-contract.mjs";
  const inventoryPath = "benchmarks/fixtures/admission-decision/approved-r21-immutable-paths.json";
  try {
    gitOk(repository, "init", "-q", "-b", "main");
    mkdirSync(resolve(repository, "scripts"), { recursive: true });
    writeFileSync(resolve(repository, protectedPath), "export const frozen = 'main-base';\n");
    writeFileSync(resolve(repository, successorSourcePath), "export const api = 'legacy';\n");
    commitAll(repository, "main base");

    gitOk(repository, "checkout", "-qb", "r21");
    writeFileSync(resolve(repository, protectedPath), "export const frozen = 'approved-r21';\n");
    const reviewedHead = commitAll(repository, "approved R21 head");

    gitOk(repository, "checkout", "-q", "main");
    writeFileSync(resolve(repository, successorSourcePath), "export const api = 'post-pr-238-r22-source';\n");
    const inventory = {
      schema_version: "1.0.0",
      program: "adaptive_ask_approved_immutable_path_inventory",
      authority_source: { fixture_id: "mn-build-option-update", reviewed_head_revision: reviewedHead },
      inventory_digest: canonicalDigest([protectedPath, successorSourcePath]),
      paths: [protectedPath, successorSourcePath],
    };
    mkdirSync(resolve(repository, dirname(inventoryPath)), { recursive: true });
    writeFileSync(resolve(repository, inventoryPath), `${JSON.stringify(inventory, null, 2)}\n`);
    commitAll(repository, "shared admission contract");

    gitOk(repository, "checkout", "-q", "r21");
    gitOk(repository, "-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "merge", "--no-ff", "-qm", "merge shared contract", "main");
    assert.throws(() => assertImmutableGitDiffUnchanged({ root: repository }), /immutable source paths changed/);
    assert.equal(changedPathsFromGitDiff({ root: repository }).includes(successorSourcePath), true);

    const r22SourceRevision = gitOk(repository, "rev-parse", "HEAD");
    writeFileSync(resolve(repository, "admission-decision-overlay.json"), "{\"decision_status\":\"admitted\"}\n");
    commitAll(repository, "append admission decision overlay");
    assert.equal(assertImmutableGitDiffUnchanged({ root: repository, baseRevision: r22SourceRevision, immutablePaths: [protectedPath, successorSourcePath] }), true);
    assert.equal(changedPathsFromGitDiff({ root: repository, baseRevision: r22SourceRevision }).some((path) => [protectedPath, successorSourcePath].includes(path)), false);

    writeFileSync(resolve(repository, protectedPath), "export const frozen = 'post-review-mutation';\n");
    commitAll(repository, "mutate protected path after review");
    assert.throws(() => assertImmutableGitDiffUnchanged({ root: repository, baseRevision: r22SourceRevision, immutablePaths: [protectedPath, successorSourcePath] }), /immutable source paths changed/);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("missing reviewed head fails closed with a typed error in an R21 repository context", () => {
  const repository = mkdtempSync(resolve(stableTmp, "ask-admission-missing-reviewed-head-"));
  const protectedPath = "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/final-admission-record.json";
  const inventoryPath = "benchmarks/fixtures/admission-decision/approved-r21-immutable-paths.json";
  try {
    gitOk(repository, "init", "-q", "-b", "main");
    mkdirSync(resolve(repository, dirname(protectedPath)), { recursive: true });
    writeFileSync(resolve(repository, protectedPath), "{}\n");
    const inventory = {
      schema_version: "1.0.0",
      program: "adaptive_ask_approved_immutable_path_inventory",
      authority_source: { fixture_id: "mn-build-option-update", reviewed_head_revision: "f".repeat(40) },
      inventory_digest: canonicalDigest([protectedPath]),
      paths: [protectedPath],
    };
    mkdirSync(resolve(repository, dirname(inventoryPath)), { recursive: true });
    writeFileSync(resolve(repository, inventoryPath), `${JSON.stringify(inventory, null, 2)}\n`);
    commitAll(repository, "R21 context without reviewed object");
    assert.throws(
      () => changedPathsFromGitDiff({ root: repository }),
      (error) => error instanceof ImmutableAuthorityRevisionUnavailableError && error.code === "APPROVED_R21_REVIEWED_HEAD_UNAVAILABLE",
    );
    rmSync(resolve(repository, protectedPath));
    commitAll(repository, "delete R21 authority while reviewed object remains unavailable");
    assert.throws(
      () => changedPathsFromGitDiff({ root: repository }),
      (error) => error instanceof ImmutableAuthorityRevisionUnavailableError && error.code === "APPROVED_R21_REVIEWED_HEAD_UNAVAILABLE",
    );
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("immutable proof rejects modification, deletion, rename, copy, and symlink type change", () => {
  const scenarios = {
    modification(repository, protectedPath) {
      writeFileSync(resolve(repository, protectedPath), "export const frozen = 'modified';\n");
    },
    deletion(repository, protectedPath) {
      rmSync(resolve(repository, protectedPath));
    },
    rename(repository, protectedPath) {
      gitOk(repository, "mv", protectedPath, "scripts/renamed-evaluator-boundary.mjs");
    },
    copy(repository, protectedPath) {
      writeFileSync(resolve(repository, "scripts/copied-evaluator-boundary.mjs"), readFileSync(resolve(repository, protectedPath)));
    },
    type_change(repository, protectedPath) {
      rmSync(resolve(repository, protectedPath));
      symlinkSync("replacement-evaluator-boundary.mjs", resolve(repository, protectedPath));
    },
  };
  for (const [name, mutate] of Object.entries(scenarios)) {
    const repository = mkdtempSync(resolve(stableTmp, `ask-admission-status-${name}-`));
    const protectedPath = "scripts/ask-benchmark-evaluator-boundary.mjs";
    try {
      gitOk(repository, "init", "-q", "-b", "main");
      mkdirSync(resolve(repository, "scripts"), { recursive: true });
      writeFileSync(resolve(repository, protectedPath), "export const frozen = true;\n");
      const baseRevision = commitAll(repository, "base");
      mutate(repository, protectedPath);
      commitAll(repository, name);
      assert.ok(changedPathsFromGitDiff({ root: repository, baseRevision }).includes(protectedPath), `${name} must include the protected path`);
      assert.throws(() => assertImmutableGitDiffUnchanged({ root: repository, baseRevision, immutablePaths: [protectedPath] }), /immutable source paths changed/, name);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  }
});
