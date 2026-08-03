import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  assertAdmissionDecisionAppendOnly,
  assertImmutablePathInventoryUnchanged,
  computeAdmissionDecisionDigest,
  computeAdmissionDecisionId,
  resolveEffectiveAdmissionAuthority,
} from "./ask-benchmark-admission-decision.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";

const digest = (value) => canonicalDigest({ value });
const bytes = (value, space = 2) => Buffer.from(`${JSON.stringify(value, null, space)}\n`);
const rawDigest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

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
    review_evidence: { archive_sha256: digest("review-archive"), archive_bytes: 8192 },
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
rejectsMutation("admitted overlay rejects wrong fixture", ({ decision }) => { decision.fixture_id = "other-fixture"; reseal(decision); });
rejectsMutation("admitted overlay rejects wrong reviewed head", ({ decision }) => { decision.reviewed_head_revision = "d".repeat(40); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong evaluator revision", ({ decision }) => { decision.evaluator.evaluator_revision = "d".repeat(40); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong bundle ID", ({ decision }) => { decision.evaluator.evaluator_bundle_id = `evaluator-${"d".repeat(64)}`; reseal(decision); });
rejectsMutation("admitted overlay rejects wrong bundle digest", ({ decision }) => { decision.evaluator.evaluator_bundle_digest = digest("other-bundle"); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong bundle bytes", ({ decision }) => { decision.evaluator.evaluator_bundle_bytes += 1; reseal(decision); });
rejectsMutation("admitted overlay rejects wrong archive SHA", ({ decision }) => { decision.review_evidence.archive_sha256 = digest("other-archive"); reseal(decision); });
rejectsMutation("admitted overlay rejects wrong archive bytes", ({ decision }) => { decision.review_evidence.archive_bytes += 1; reseal(decision); });
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

test("immutable path inventory rejects any changed frozen source path", () => {
  const immutablePaths = [
    "benchmarks/schemas/evaluation-input-failure-artifact.schema.json",
    "benchmarks/schemas/evaluator-authority-manifest.schema.json",
    "benchmarks/schemas/evaluator-check-artifact.schema.json",
    "benchmarks/schemas/evaluator-reference.schema.json",
    "benchmarks/schemas/evaluator-result-envelope.schema.json",
    "benchmarks/schemas/normalized-portfolio-result.schema.json",
    "benchmarks/schemas/original-workspace-authority.schema.json",
    "benchmarks/schemas/portfolio-final-admission-record.schema.json",
    "benchmarks/schemas/portfolio-output-contract.schema.json",
    "benchmarks/schemas/portfolio-requirement-record.schema.json",
    "benchmarks/schemas/private-evaluation-record.schema.json",
    "benchmarks/schemas/private-evaluator-bundle.schema.json",
    "benchmarks/schemas/private-evaluator-fragment.schema.json",
    "benchmarks/schemas/private-evaluator-independence-statement.schema.json",
    "benchmarks/schemas/repository-diff-artifact.schema.json",
    "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
    "scripts/adapter-runtime-inventory.mjs",
    "scripts/ask-benchmark-atomic-publication.mjs",
    "scripts/ask-benchmark-command-evidence.mjs",
    "scripts/ask-benchmark-evaluator-boundary.mjs",
    "scripts/ask-benchmark-execution.mjs",
    "scripts/ask-benchmark-materialize.mjs",
    "scripts/ask-benchmark-normalized-results.mjs",
    "scripts/ask-benchmark-plan.mjs",
    "scripts/ask-benchmark-portfolio-catalog.mjs",
    "scripts/ask-benchmark-portfolio-policy.mjs",
    "scripts/ask-benchmark-private-evaluator-runner.mjs",
    "scripts/ask-benchmark-schema.mjs",
    "scripts/ask-benchmark-scoring-contract.mjs",
    "scripts/ask-benchmark-selection.mjs",
    "scripts/ask-benchmark-stable-file.mjs",
    "scripts/ask-benchmark-terminal-candidate.mjs",
    "scripts/ask-benchmark-terminal-workspace.mjs",
    "scripts/ask-shared.mjs",
    "scripts/codex-runtime-profile.mjs",
    "scripts/execution-envelope.mjs",
    "scripts/install-claude-adapter.mjs",
    "scripts/install-codex-adapter.mjs",
    "scripts/installer-lifecycle.mjs",
  ];
  const sharedChangePaths = [
    ".github/workflows/validate.yml",
    "benchmarks/README.md",
    "benchmarks/admission-decision-overlay.md",
    "benchmarks/schemas/portfolio-admission-decision.schema.json",
    "benchmarks/schemas/portfolio-directional-outcome-report.schema.json",
    "benchmarks/schemas/portfolio-engineering-result-set.schema.json",
    "benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json",
    "benchmarks/schemas/portfolio-engineering-result.schema.json",
    "benchmarks/schemas/portfolio-mechanism-scorecard.schema.json",
    "benchmarks/schemas/portfolio-paired-comparison-report.schema.json",
    "benchmarks/schemas/portfolio-repetition-report.schema.json",
    "docs/fixtures/adapter-runtime-bundle.json",
    "scripts/ask-benchmark-admission-decision.mjs",
    "scripts/ask-benchmark-portfolio-directional-outcome-report.mjs",
    "scripts/ask-benchmark-portfolio-mechanism-scorecard.mjs",
    "scripts/ask-benchmark-portfolio-paired-comparison-report.mjs",
    "scripts/ask-benchmark-portfolio-repetition-report.mjs",
    "scripts/ask-benchmark-portfolio-result-set.mjs",
    "scripts/ask-benchmark-portfolio-score.mjs",
    "scripts/test-ask-benchmark-admission-decision.mjs",
    "scripts/test-ask-benchmark-portfolio-directional-outcome-report.mjs",
    "scripts/test-ask-benchmark-portfolio-mechanism-scorecard.mjs",
    "scripts/test-ask-benchmark-portfolio-paired-comparison-report.mjs",
    "scripts/test-ask-benchmark-portfolio-repetition-report.mjs",
    "scripts/test-ask-benchmark-portfolio-result-set.mjs",
    "scripts/test-ask-benchmark-portfolio-score.mjs",
  ];
  assertImmutablePathInventoryUnchanged({ immutablePaths, changedPaths: sharedChangePaths });
  assert.throws(() => assertImmutablePathInventoryUnchanged({ immutablePaths, changedPaths: [immutablePaths[0]] }), /immutable source paths changed/);
});
