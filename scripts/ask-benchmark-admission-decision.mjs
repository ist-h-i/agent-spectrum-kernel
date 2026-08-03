import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const ADMISSION_DECISION_SCHEMA_PATH = "benchmarks/schemas/portfolio-admission-decision.schema.json";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const AUTHORITY_MODES = new Set(["legacy_admitted_record", "admitted_overlay", "not_admitted"]);
const EFFECTIVE_STATUSES = new Set(["admitted", "admission_pending", "changes_requested", "rejected"]);
const REVIEW_AUTHORITY_FIELDS = Object.freeze([
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

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertClosedObject(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const keys = Object.keys(value);
  const unknown = keys.filter((key) => !fields.includes(key));
  const missing = fields.filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown fields: ${unknown.join(", ")}`);
  if (missing.length > 0) throw new Error(`${label} is missing fields: ${missing.join(", ")}`);
  return value;
}

function assertPortablePath(path, label) {
  const segments = typeof path === "string" ? path.split("/") : [];
  if (
    typeof path !== "string"
    || path.length === 0
    || path.includes("\\")
    || path.includes(":")
    || path.includes("\0")
    || posix.isAbsolute(path)
    || win32.isAbsolute(path)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || posix.normalize(path) !== path
  ) throw new Error(`${label} must be a portable repository-relative path`);
  return path;
}

function normalizeBytes(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new Error(`${label} bytes must be a Buffer, Uint8Array, or string`);
}

function artifactEvidence(source, expectedValue, label) {
  assertClosedObject(source, ["path", "bytes"], label);
  const bytes = normalizeBytes(source.bytes, label);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} bytes must contain valid JSON`);
  }
  if (stableCanonicalJson(parsed) !== stableCanonicalJson(expectedValue)) throw new Error(`${label} bytes do not encode the supplied frozen artifact`);
  return { path: assertPortablePath(source.path, `${label} path`), raw_byte_digest: sha256(bytes) };
}

function computeFrozenAdmissionRequirementAuthorityDigest(record) {
  if (!Object.hasOwn(record, "requirement_authority_digest")) return record.admission_digest;
  const {
    admission_digest: _admissionDigest,
    evaluator_authority_manifest_path: _authorityManifestPath,
    evaluator_authority_manifest_raw_sha256: _authorityManifestRawSha256,
    evaluator_authority_manifest_digest: _authorityManifestDigest,
    requirement_authority_digest: _requirementAuthorityDigest,
    ...requirementAuthority
  } = record;
  return canonicalDigest(requirementAuthority);
}

function validateFrozenAdmissionRecord(record) {
  const semanticDigest = canonicalDigest(withoutField(record, "admission_digest"));
  if (record.admission_digest !== semanticDigest) throw new Error("frozen admission record semantic digest is invalid");
  const requirementAuthorityDigest = computeFrozenAdmissionRequirementAuthorityDigest(record);
  if (record.requirement_authority_digest && record.requirement_authority_digest !== requirementAuthorityDigest) throw new Error("frozen admission requirement-authority digest is invalid");
  return { semanticDigest, requirementAuthorityDigest };
}

function validateRequirementRecord(record, requirementAuthorityDigest) {
  if (!Array.isArray(record?.requirements)) throw new Error("frozen requirement record requirements must be an array");
  const recordDigest = canonicalDigest(withoutField(record, "requirement_record_digest"));
  const setDigest = canonicalDigest(record.requirements);
  if (record.requirement_record_digest !== recordDigest) throw new Error("frozen requirement record digest is invalid");
  if (record.requirement_set_digest !== setDigest) throw new Error("frozen requirement set digest is invalid");
  if (record.admission_record_digest !== requirementAuthorityDigest) throw new Error("requirement record does not bind the frozen admission authority");
  return { recordDigest, setDigest };
}

function validateEvaluatorReference(reference) {
  const digest = canonicalDigest(withoutField(reference, "public_metadata_digest"));
  if (reference.public_metadata_digest !== digest) throw new Error("evaluator public-reference digest is invalid");
  return digest;
}

function validateFreezeManifest(manifest) {
  const digest = canonicalDigest(withoutField(manifest, "manifest_digest"));
  if (manifest.manifest_digest !== digest) throw new Error("frozen scoring-input manifest semantic digest is invalid");
  return digest;
}

function expectedDecisionAuthority({
  frozenAdmissionRecord,
  frozenAdmissionSource,
  requirementRecord,
  requirementRecordSource,
  evaluatorReference,
  scoringInputFreezeManifest = null,
  scoringInputFreezeManifestSource = null,
  reviewAuthority,
}) {
  const admission = validateFrozenAdmissionRecord(frozenAdmissionRecord);
  const requirement = validateRequirementRecord(requirementRecord, admission.requirementAuthorityDigest);
  const evaluatorPublicReferenceDigest = validateEvaluatorReference(evaluatorReference);
  const admissionEvidence = artifactEvidence(frozenAdmissionSource, frozenAdmissionRecord, "frozen admission source");
  const requirementEvidence = artifactEvidence(requirementRecordSource, requirementRecord, "frozen requirement source");
  const freezeEvidence = scoringInputFreezeManifest === null && scoringInputFreezeManifestSource === null
    ? null
    : artifactEvidence(scoringInputFreezeManifestSource, scoringInputFreezeManifest, "frozen scoring-input manifest source");
  if ((scoringInputFreezeManifest === null) !== (freezeEvidence === null)) throw new Error("frozen scoring-input manifest and source evidence must be supplied together");
  const frozenScoringInputManifest = freezeEvidence ? {
    ...freezeEvidence,
    semantic_digest: validateFreezeManifest(scoringInputFreezeManifest),
  } : null;
  if (frozenAdmissionRecord.fixture_id !== requirementRecord.fixture_id || frozenAdmissionRecord.fixture_id !== evaluatorReference.fixture_id) throw new Error("frozen admission, requirement, and evaluator-reference fixture identities differ");
  if (frozenAdmissionRecord.evaluator_bundle_id !== evaluatorReference.evaluator_bundle_id || frozenAdmissionRecord.evaluator_bundle_digest !== evaluatorReference.evaluator_bundle_digest) throw new Error("frozen admission and evaluator-reference bundle identities differ");
  if (scoringInputFreezeManifest) {
    if (scoringInputFreezeManifest.fixture_id !== frozenAdmissionRecord.fixture_id) throw new Error("frozen scoring-input manifest fixture identity differs");
    const expectedEntries = {
      admission_record: { ...admissionEvidence, semantic_digest: admission.semanticDigest },
      requirement_record: { ...requirementEvidence, record_digest: requirement.recordDigest, set_digest: requirement.setDigest },
      evaluator_public_reference: { semantic_digest: evaluatorPublicReferenceDigest },
    };
    for (const [field, expected] of Object.entries(expectedEntries)) {
      const actual = scoringInputFreezeManifest[field];
      if (!actual || Object.entries(expected).some(([key, value]) => actual[key] !== value)) throw new Error(`frozen scoring-input manifest ${field} identity differs`);
    }
  }
  assertClosedObject(reviewAuthority, REVIEW_AUTHORITY_FIELDS, "external review authority");
  return {
    fixture_id: frozenAdmissionRecord.fixture_id,
    ...reviewAuthority,
    evaluator: {
      evaluator_revision: evaluatorReference.evaluator_revision,
      evaluator_bundle_id: evaluatorReference.evaluator_bundle_id,
      evaluator_bundle_digest: evaluatorReference.evaluator_bundle_digest,
      evaluator_bundle_bytes: frozenAdmissionRecord.evaluator_byte_count,
    },
    evaluator_public_reference_digest: evaluatorPublicReferenceDigest,
    frozen_admission_authority: {
      ...admissionEvidence,
      semantic_digest: admission.semanticDigest,
      requirement_authority_digest: admission.requirementAuthorityDigest,
    },
    frozen_requirement_record: {
      ...requirementEvidence,
      record_digest: requirement.recordDigest,
      set_digest: requirement.setDigest,
    },
    frozen_scoring_input_manifest: frozenScoringInputManifest,
  };
}

export function computeAdmissionDecisionId(value) {
  return `admission-decision-${canonicalDigest({
    fixture_id: value.fixture_id,
    reviewed_repository: value.reviewed_repository,
    reviewed_pull_request: value.reviewed_pull_request,
  }).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computeAdmissionDecisionDigest(value) {
  return canonicalDigest(withoutField(value, "decision_digest"));
}

function validateDecisionClosure(value, root) {
  assertBenchmarkSchemaInstance(value, { schemaPath: resolve(root, ADMISSION_DECISION_SCHEMA_PATH), label: "portfolio admission decision" });
  if (value.decision_id !== computeAdmissionDecisionId(value)) throw new Error("admission decision ID is invalid");
  if (value.decision_digest !== computeAdmissionDecisionDigest(value)) throw new Error("admission decision canonical digest is invalid");
}

export function validatePortfolioAdmissionDecision(value, { root = DEFAULT_ROOT, expectedAuthority = null } = {}) {
  validateDecisionClosure(value, root);
  if (value.decision_status === "admitted") {
    if (value.review_status !== "approved") throw new Error("admitted decision requires approved review status");
    if (value.author_self_approval !== false) throw new Error("admitted decision prohibits author self-approval");
    if (value.blocking_finding_count !== 0) throw new Error("admitted decision requires zero blocking findings");
    if (!expectedAuthority) throw new Error("admitted decision requires external frozen and review authority");
  } else if (value.decision_status === "changes_requested" && value.review_status !== "changes_requested") {
    throw new Error("changes-requested decision requires changes-requested review status");
  } else if (value.decision_status === "rejected" && value.review_status !== "rejected") {
    throw new Error("rejected decision requires rejected review status");
  }
  if (expectedAuthority) {
    const actual = Object.fromEntries(Object.keys(expectedAuthority).map((field) => [field, value[field]]));
    if (stableCanonicalJson(actual) !== stableCanonicalJson(expectedAuthority)) throw new Error("admission decision differs from external frozen or review authority");
  }
  return value;
}

export function resolveEffectiveAdmissionAuthority(options) {
  const {
    frozenAdmissionRecord,
    requirementRecord,
    evaluatorReference,
    decisionOverlay = null,
  } = options ?? {};
  if (!frozenAdmissionRecord || !requirementRecord || !evaluatorReference) throw new Error("effective admission resolution requires frozen admission, requirement, and evaluator-reference records");
  const admission = validateFrozenAdmissionRecord(frozenAdmissionRecord);
  const requirement = validateRequirementRecord(requirementRecord, admission.requirementAuthorityDigest);
  const evaluatorPublicReferenceDigest = validateEvaluatorReference(evaluatorReference);
  if (frozenAdmissionRecord.fixture_id !== requirementRecord.fixture_id || frozenAdmissionRecord.fixture_id !== evaluatorReference.fixture_id) throw new Error("effective admission authority has a cross-fixture transplant");
  if (frozenAdmissionRecord.evaluator_bundle_id !== evaluatorReference.evaluator_bundle_id || frozenAdmissionRecord.evaluator_bundle_digest !== evaluatorReference.evaluator_bundle_digest) throw new Error("effective admission authority has a cross-evaluator transplant");

  let authorityMode;
  let effectiveAdmissionStatus;
  let decisionDigest = null;
  let decisionRevision = null;
  if (decisionOverlay) {
    const expectedAuthority = expectedDecisionAuthority(options);
    validatePortfolioAdmissionDecision(decisionOverlay, { root: options.root ?? DEFAULT_ROOT, expectedAuthority });
    decisionDigest = decisionOverlay.decision_digest;
    decisionRevision = decisionOverlay.decision_revision;
    if (decisionOverlay.decision_status === "admitted") {
      authorityMode = "admitted_overlay";
      effectiveAdmissionStatus = "admitted";
    } else {
      authorityMode = "not_admitted";
      effectiveAdmissionStatus = decisionOverlay.decision_status;
    }
  } else if (frozenAdmissionRecord.admission_status === "admitted") {
    authorityMode = "legacy_admitted_record";
    effectiveAdmissionStatus = "admitted";
  } else {
    authorityMode = "not_admitted";
    effectiveAdmissionStatus = frozenAdmissionRecord.admission_status === "rejected" ? "rejected" : "admission_pending";
  }
  const resolved = {
    authority_mode: authorityMode,
    effective_admission_status: effectiveAdmissionStatus,
    frozen_admission_record_digest: admission.semanticDigest,
    requirement_authority_digest: admission.requirementAuthorityDigest,
    requirement_record_digest: requirement.recordDigest,
    admission_decision_digest: decisionDigest,
    admission_decision_revision: decisionRevision,
    evaluator_bundle_id: evaluatorReference.evaluator_bundle_id,
    evaluator_bundle_digest: evaluatorReference.evaluator_bundle_digest,
    evaluator_revision: evaluatorReference.evaluator_revision,
    evaluator_public_reference_digest: evaluatorPublicReferenceDigest,
    fixture_id: frozenAdmissionRecord.fixture_id,
  };
  if (!AUTHORITY_MODES.has(resolved.authority_mode) || !EFFECTIVE_STATUSES.has(resolved.effective_admission_status)) throw new Error("effective admission resolver produced an unsupported state");
  return Object.freeze(resolved);
}

export function assertAdmissionDecisionAppendOnly(previousDecision, nextDecision, { root = DEFAULT_ROOT } = {}) {
  validateDecisionClosure(previousDecision, root);
  validateDecisionClosure(nextDecision, root);
  if (nextDecision.decision_id !== previousDecision.decision_id) throw new Error("admission decision revision must retain its decision ID");
  if (nextDecision.fixture_id !== previousDecision.fixture_id) throw new Error("admission decision revision cannot change fixture identity");
  if (nextDecision.decision_revision <= previousDecision.decision_revision) throw new Error("admission decision revision must increase");
  if (nextDecision.decision_digest === previousDecision.decision_digest) throw new Error("a new admission decision revision must have a new digest");
  return true;
}

export function assertImmutablePathInventoryUnchanged({ immutablePaths, changedPaths }) {
  if (!Array.isArray(immutablePaths) || immutablePaths.length === 0) throw new Error("immutable path inventory must be a non-empty array");
  if (!Array.isArray(changedPaths)) throw new Error("changed path inventory must be an array");
  const frozen = immutablePaths.map((entry) => assertPortablePath(typeof entry === "string" ? entry : entry?.path, "immutable inventory path"));
  if (new Set(frozen).size !== frozen.length) throw new Error("immutable path inventory contains duplicates");
  const changed = changedPaths.map((entry) => assertPortablePath(entry, "changed path"));
  const conflicts = changed.filter((path) => frozen.includes(path));
  if (conflicts.length > 0) throw new Error(`immutable source paths changed: ${conflicts.join(", ")}`);
  return true;
}
