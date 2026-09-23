#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonSchema } from "./json-schema-validation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASE_CLAIM_MATRIX_SCHEMA_PATH = resolve(ROOT, "schemas/release-claim-matrix.schema.json");
export const RELEASE_EVIDENCE_CATALOG_SCHEMA_PATH = resolve(ROOT, "schemas/release-evidence-catalog.schema.json");
export const RELEASE_ASSESSMENT_SCHEMA_PATH = resolve(ROOT, "schemas/release-assessment.schema.json");
export const RELEASE_EVIDENCE_GATE_REVISION = "1.0.0";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const NON_PRIMARY_KINDS = new Set(["independent_review", "formal_approval"]);
const OUTCOME_KINDS = new Set(["controlled_benchmark", "adopting_project"]);

export const REQUIRED_RELEASE_GATES = Object.freeze([
  Object.freeze({ gate_id: "release.repository_validation", accepted_kinds: Object.freeze(["static_verification"]), independent_review_required: false }),
  Object.freeze({ gate_id: "release.verification_evidence_store", accepted_kinds: Object.freeze(["static_verification", "runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.epic_admission", accepted_kinds: Object.freeze(["runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.asset_registry", accepted_kinds: Object.freeze(["static_verification", "runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.portfolio_manager", accepted_kinds: Object.freeze(["static_verification", "runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.governed_candidate_lifecycle", accepted_kinds: Object.freeze(["synthetic_fixture", "runtime_execution", "controlled_benchmark"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.guided_setup", accepted_kinds: Object.freeze(["runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.evaluation_report_authority", accepted_kinds: Object.freeze(["static_verification", "runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.activation_bypass_decisions", accepted_kinds: Object.freeze(["controlled_benchmark"]), independent_review_required: true, outcome_guardrails_required: true }),
  Object.freeze({ gate_id: "release.clean_install_upgrade", accepted_kinds: Object.freeze(["runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.supported_adapter_runtime", accepted_kinds: Object.freeze(["runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.benchmark_report_publication", accepted_kinds: Object.freeze(["controlled_benchmark"]), independent_review_required: true, outcome_guardrails_required: true }),
  Object.freeze({ gate_id: "release.documentation_claim_consistency", accepted_kinds: Object.freeze(["static_verification"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.rollback_migration_notes", accepted_kinds: Object.freeze(["runtime_execution"]), independent_review_required: true }),
  Object.freeze({ gate_id: "release.semantic_version_changelog", accepted_kinds: Object.freeze(["static_verification"]), independent_review_required: false }),
  Object.freeze({ gate_id: "release.human_approval", accepted_kinds: Object.freeze(["formal_approval"]), independent_review_required: false }),
]);

const CLAIM_KINDS = Object.freeze({
  implementation: Object.freeze(["implementation", "static_verification", "synthetic_fixture", "runtime_execution", "controlled_benchmark", "adopting_project"]),
  runtime: Object.freeze(["runtime_execution", "controlled_benchmark", "adopting_project"]),
  controlled_effect: Object.freeze(["controlled_benchmark", "adopting_project"]),
  adopting_project_outcome: Object.freeze(["adopting_project"]),
  roi: Object.freeze(["adopting_project"]),
});

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(stableCanonicalJson(value)).digest("hex")}`;
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function compareIdentifiers(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareIdentifiers);
}

function sameJson(left, right) {
  return stableCanonicalJson(left) === stableCanonicalJson(right);
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} contains duplicate identity: ${value}`);
    seen.add(value);
  }
}

function assertPortableRelativePath(path, label) {
  if (
    typeof path !== "string"
    || path.length === 0
    || isAbsolute(path)
    || win32.isAbsolute(path)
    || path.includes("\\")
    || path.startsWith("./")
    || posix.normalize(path) !== path
    || path.split("/").some((part) => !part || part === "." || part === "..")
  ) throw new Error(`${label} must be a portable repository-relative path`);
}

function resolveBoundedArtifact(root, path) {
  assertPortableRelativePath(path, "release evidence artifact path");
  const absoluteRoot = realpathSync(root);
  const absolute = resolve(absoluteRoot, path);
  const rel = relative(absoluteRoot, absolute);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error("release evidence artifact path escapes repository root");
  let current = absoluteRoot;
  for (const part of path.split("/")) {
    current = resolve(current, part);
    if (!existsSync(current)) throw new Error("artifact_missing");
    if (lstatSync(current).isSymbolicLink()) throw new Error("artifact_symlink_forbidden");
  }
  if (!lstatSync(absolute).isFile()) throw new Error("artifact_not_regular_file");
  return absolute;
}

function readJson(path, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
  return value;
}

function failSchema(value, schemaPath, label) {
  const errors = validateJsonSchema(value, { schemaPath });
  if (errors.length > 0) throw new Error(`${label} failed JSON Schema validation:\n${errors.join("\n")}`);
}

function evidenceArtifactReasons(record, root, targetRevision) {
  const reasons = [];
  if (record.source_revision !== targetRevision) reasons.push("stale_source_revision");
  if (record.artifact === null) {
    if (["passed", "failed"].includes(record.status)) reasons.push("artifact_missing");
    return sortedUnique(reasons);
  }
  if (!DIGEST_PATTERN.test(record.artifact.digest ?? "")) reasons.push("artifact_digest_invalid");
  try {
    const path = resolveBoundedArtifact(root, record.artifact.path);
    const observed = rawDigest(readFileSync(path));
    if (observed !== record.artifact.digest) reasons.push("artifact_integrity_mismatch");
  } catch (error) {
    reasons.push(error.message === "artifact_missing" ? "artifact_missing" : "artifact_unreadable");
  }
  return sortedUnique(reasons);
}

function validateEvidenceSemantics(catalog) {
  const evidenceIds = catalog.evidence.map((entry) => entry.evidence_id);
  assertUnique(evidenceIds, "release evidence IDs");
  assertUnique(catalog.blockers.map((entry) => entry.blocker_id), "release blocker IDs");
  assertUnique(catalog.accepted_risks.map((entry) => entry.risk_id), "release accepted-risk IDs");
  const evidenceById = new Map(catalog.evidence.map((entry) => [entry.evidence_id, entry]));
  for (const entry of catalog.evidence) {
    if (["passed", "failed"].includes(entry.status) && entry.artifact === null) throw new Error(`${entry.evidence_id} ${entry.status} evidence requires an artifact`);
    if (entry.authority.kind === "none" && entry.authority.identity_digest !== null) throw new Error(`${entry.evidence_id} none authority cannot carry an identity digest`);
    if (entry.authority.kind !== "none" && !DIGEST_PATTERN.test(entry.authority.identity_digest ?? "")) throw new Error(`${entry.evidence_id} authority requires a sha256 identity digest`);
    if (entry.kind === "independent_review") {
      if (entry.authority.kind !== "independent_reviewer") throw new Error(`${entry.evidence_id} independent review requires independent_reviewer authority`);
      if (entry.related_evidence_refs.length === 0) throw new Error(`${entry.evidence_id} independent review must bind reviewed evidence`);
    } else if (entry.kind === "formal_approval") {
      if (entry.authority.kind !== "release_owner") throw new Error(`${entry.evidence_id} formal approval requires release_owner authority`);
      if (!entry.gate_ids.includes("release.human_approval")) throw new Error(`${entry.evidence_id} formal approval must bind release.human_approval`);
    } else if (entry.related_evidence_refs.length > 0) {
      throw new Error(`${entry.evidence_id} only review evidence may bind related evidence refs`);
    }
    if (entry.related_evidence_refs.includes(entry.evidence_id)) throw new Error(`${entry.evidence_id} cannot review itself`);
    for (const ref of entry.related_evidence_refs) if (!evidenceById.has(ref)) throw new Error(`${entry.evidence_id} references missing evidence ${ref}`);
  }
  for (const blocker of catalog.blockers) {
    for (const ref of blocker.evidence_refs) if (!evidenceById.has(ref)) throw new Error(`${blocker.blocker_id} references missing evidence ${ref}`);
  }
  for (const risk of catalog.accepted_risks) {
    const acceptance = evidenceById.get(risk.acceptance_evidence_ref);
    if (!acceptance) throw new Error(`${risk.risk_id} references missing acceptance evidence`);
    if (!["independent_review", "formal_approval"].includes(acceptance.kind) || acceptance.status !== "passed") throw new Error(`${risk.risk_id} acceptance evidence is not an observed review or approval`);
  }
}

function guardrailReasons(record, { publicationPermission = false, humanEffort = false } = {}) {
  const reasons = [];
  for (const field of ["quality", "safety", "lower_tail", "variance"]) {
    if (record.guardrails[field] !== "passed") reasons.push(`guardrail_${field}_${record.guardrails[field]}`);
  }
  if (publicationPermission && record.guardrails.publication_permission !== "granted") reasons.push(`publication_permission_${record.guardrails.publication_permission}`);
  if (humanEffort && record.guardrails.human_effort !== "measured") reasons.push(`human_effort_${record.guardrails.human_effort}`);
  return sortedUnique(reasons);
}

function reviewIdentityReasons(evidence, review) {
  const reasons = [];
  if (NON_PRIMARY_KINDS.has(evidence.kind) || evidence.authority.kind !== "producer"
    || !DIGEST_PATTERN.test(evidence.authority.identity_digest ?? "")) reasons.push("evidence_producer_identity_missing");
  if (review.authority.identity_digest === evidence.authority.identity_digest) reasons.push("independent_review_identity_conflict");
  return reasons;
}

function assessIndependentReviews({ evidence, evidenceById, gateId = null, claim = null, required = true, root, targetRevision }) {
  const reviews = [...evidenceById.values()]
    .filter((entry) => entry.kind === "independent_review" && entry.related_evidence_refs.includes(evidence.evidence_id))
    .filter((entry) => gateId === null || entry.gate_ids.includes(gateId))
    .filter((entry) => claim === null || entry.claim_ids.includes(claim.claim_id))
    .sort((left, right) => compareIdentifiers(left.evidence_id, right.evidence_id));
  const reasons = [];
  let passedCount = 0;
  // This release-scoped catalog has no supersession contract: never select only a favorable review.
  for (const review of reviews) {
    const reviewReasons = reviewIdentityReasons(evidence, review);
    if (review.status !== "passed") reviewReasons.push(`independent_review_${review.status}`);
    if (!sameJson(review.scope, evidence.scope) || (claim && !sameJson(review.scope, claim.scope))) reviewReasons.push("independent_review_scope_mismatch");
    reviewReasons.push(...evidenceArtifactReasons(review, root, targetRevision));
    if (reviewReasons.length === 0) passedCount += 1;
    reasons.push(...reviewReasons);
  }
  if (required && passedCount === 0) reasons.push("independent_review_missing");
  return { evidence_refs: reviews.map((entry) => entry.evidence_id), reason_codes: sortedUnique(reasons) };
}

function assessRiskAcceptance(risk, { evidenceById, root, targetRevision }) {
  // Kind, status, authority role and reference existence were checked by validateEvidenceSemantics.
  const acceptance = evidenceById.get(risk.acceptance_evidence_ref);
  const reasons = evidenceArtifactReasons(acceptance, root, targetRevision);
  if (acceptance.kind === "independent_review") {
    for (const ref of acceptance.related_evidence_refs) {
      const subject = evidenceById.get(ref);
      reasons.push(...reviewIdentityReasons(subject, acceptance));
      if (!sameJson(subject.scope, acceptance.scope)) reasons.push("independent_review_scope_mismatch");
      reasons.push(...evidenceArtifactReasons(subject, root, targetRevision));
    }
  }
  return { risk_id: risk.risk_id, reason_codes: sortedUnique(reasons.map((reason) => `risk_acceptance_${reason}`)) };
}

function assessGate(spec, { catalog, evidenceById, root, targetRevision }) {
  const primary = catalog.evidence
    .filter((entry) => entry.gate_ids.includes(spec.gate_id) && entry.kind !== "independent_review")
    .sort((left, right) => compareIdentifiers(left.evidence_id, right.evidence_id));
  if (primary.length === 0) return { gate_id: spec.gate_id, status: "not_ready", evidence_refs: [], reason_codes: ["required_gate_evidence_missing"] };
  const statuses = new Set(primary.map((entry) => entry.status));
  if (statuses.has("passed") && statuses.has("failed")) {
    return { gate_id: spec.gate_id, status: "not_ready", evidence_refs: primary.map((entry) => entry.evidence_id), reason_codes: ["contradictory_gate_evidence"] };
  }
  const reasons = [];
  const assessedRefs = primary.map((entry) => entry.evidence_id);
  for (const entry of primary) {
    const candidateReasons = [];
    if (!spec.accepted_kinds.includes(entry.kind)) candidateReasons.push("evidence_kind_insufficient");
    if (entry.status === "failed") candidateReasons.push("evidence_failed");
    if (entry.status === "not_checked") candidateReasons.push("evidence_not_checked");
    if (entry.status === "not_applicable") candidateReasons.push("required_gate_not_applicable");
    candidateReasons.push(...evidenceArtifactReasons(entry, root, targetRevision));
    if (spec.outcome_guardrails_required && OUTCOME_KINDS.has(entry.kind)) candidateReasons.push(...guardrailReasons(entry));
    if (candidateReasons.length === 0 && spec.independent_review_required) {
      const review = assessIndependentReviews({ evidence: entry, evidenceById, gateId: spec.gate_id, root, targetRevision });
      assessedRefs.push(...review.evidence_refs);
      candidateReasons.push(...review.reason_codes);
    }
    reasons.push(...candidateReasons);
  }
  if (reasons.length > 0) {
    return { gate_id: spec.gate_id, status: "not_ready", evidence_refs: sortedUnique(assessedRefs), reason_codes: sortedUnique(reasons) };
  }
  return { gate_id: spec.gate_id, status: "pass", evidence_refs: sortedUnique(assessedRefs), reason_codes: [] };
}

function assessClaim(claim, { evidenceById, root, targetRevision }) {
  const reasons = [];
  if (claim.disposition === "excluded" && !claim.release_required) return { claim_id: claim.claim_id, disposition: claim.disposition, status: "excluded", evidence_refs: [], reason_codes: [] };
  if (claim.source_revision !== targetRevision) reasons.push("claim_source_revision_stale");
  const catalogPrimaryRefs = [...evidenceById.values()]
    .filter((entry) => !NON_PRIMARY_KINDS.has(entry.kind) && entry.claim_ids.includes(claim.claim_id))
    .map((entry) => entry.evidence_id);
  if (catalogPrimaryRefs.some((ref) => !claim.evidence_refs.includes(ref))) reasons.push("claim_evidence_reference_missing");
  const assessedRefs = sortedUnique([...claim.evidence_refs, ...catalogPrimaryRefs]);
  const referenced = assessedRefs.map((ref) => evidenceById.get(ref));
  if (referenced.some((entry) => !entry)) reasons.push("claim_evidence_missing");
  const present = referenced.filter(Boolean);
  const statuses = new Set(present.map((entry) => entry.status));
  if (statuses.has("passed") && statuses.has("failed")) reasons.push("contradictory_claim_evidence");
  for (const evidence of present) {
    if (!evidence.claim_ids.includes(claim.claim_id)) reasons.push("claim_evidence_binding_missing");
    if (!sameJson(evidence.scope, claim.scope)) reasons.push("claim_evidence_scope_mismatch");
    reasons.push(...evidenceArtifactReasons(evidence, root, targetRevision));
  }
  if (claim.disposition === "supported") {
    if (claim.evidence_refs.length === 0) reasons.push("supported_claim_has_no_evidence");
    const primary = present.filter((entry) => !NON_PRIMARY_KINDS.has(entry.kind));
    for (const evidence of primary) {
      if (evidence.status === "failed") reasons.push("claim_evidence_failed");
      if (evidence.status === "not_checked") reasons.push("claim_evidence_not_checked");
      if (evidence.status === "not_applicable") reasons.push("claim_evidence_not_applicable");
    }
    const allowedKinds = new Set(CLAIM_KINDS[claim.claim_class]);
    const qualified = primary
      .filter((entry) => entry.status === "passed" && allowedKinds.has(entry.kind))
      .filter((entry) => sameJson(entry.scope, claim.scope) && entry.source_revision === targetRevision)
      .filter((entry) => evidenceArtifactReasons(entry, root, targetRevision).length === 0);
    if (qualified.length === 0) reasons.push("supported_claim_evidence_kind_or_status_insufficient");
    const qualifiedIds = new Set(qualified.map((entry) => entry.evidence_id));
    const outcomeClaim = ["controlled_effect", "adopting_project_outcome", "roi"].includes(claim.claim_class);
    // Proof strength limits positive support, not which adverse evidence remains visible.
    for (const evidence of primary) {
      const qualifies = qualifiedIds.has(evidence.evidence_id);
      if (outcomeClaim && OUTCOME_KINDS.has(evidence.kind)) {
        reasons.push(...guardrailReasons(evidence, {
          publicationPermission: qualifies && ["adopting_project_outcome", "roi"].includes(claim.claim_class),
          humanEffort: qualifies && claim.claim_class === "roi",
        }));
      }
      const review = assessIndependentReviews({ evidence, evidenceById, claim, required: qualifies, root, targetRevision });
      assessedRefs.push(...review.evidence_refs);
      reasons.push(...review.reason_codes);
      if (review.reason_codes.includes("independent_review_missing")) reasons.push("supported_claim_independent_review_missing");
    }
  } else if (claim.release_required) {
    reasons.push(`release_required_claim_${claim.disposition}`);
  }
  const uniqueReasons = sortedUnique(reasons);
  if (uniqueReasons.length > 0) return { claim_id: claim.claim_id, disposition: claim.disposition, status: "not_ready", evidence_refs: sortedUnique(assessedRefs), reason_codes: uniqueReasons };
  return {
    claim_id: claim.claim_id,
    disposition: claim.disposition,
    status: claim.disposition === "supported" ? "supported" : "non_blocking",
    evidence_refs: sortedUnique(assessedRefs),
    reason_codes: [],
  };
}

export function assessRelease({ matrix, catalog, repositoryRoot = ROOT, sourceRevision }) {
  failSchema(matrix, RELEASE_CLAIM_MATRIX_SCHEMA_PATH, "release claim matrix");
  failSchema(catalog, RELEASE_EVIDENCE_CATALOG_SCHEMA_PATH, "release evidence catalog");
  assertUnique(matrix.claims.map((entry) => entry.claim_id), "release claim IDs");
  validateEvidenceSemantics(catalog);
  if (!REVISION_PATTERN.test(sourceRevision ?? "")) throw new Error("sourceRevision must be a 40-character lowercase git revision");
  if (matrix.repository_id !== catalog.repository_id) throw new Error("release matrix and evidence catalog repository identity mismatch");
  const evidenceById = new Map(catalog.evidence.map((entry) => [entry.evidence_id, entry]));
  for (const claim of matrix.claims) {
    for (const ref of claim.evidence_refs) if (!evidenceById.has(ref)) throw new Error(`${claim.claim_id} references missing evidence ${ref}`);
  }

  const gateResults = REQUIRED_RELEASE_GATES.map((spec) => assessGate(spec, {
    catalog, evidenceById, root: repositoryRoot, targetRevision: sourceRevision,
  })).sort((left, right) => compareIdentifiers(left.gate_id, right.gate_id));
  const claimResults = matrix.claims.map((claim) => assessClaim(claim, {
    evidenceById, root: repositoryRoot, targetRevision: sourceRevision,
  })).sort((left, right) => compareIdentifiers(left.claim_id, right.claim_id));

  const riskResults = catalog.accepted_risks.map((risk) => assessRiskAcceptance(risk, {
    evidenceById, root: repositoryRoot, targetRevision: sourceRevision,
  }));
  const openBlockers = catalog.blockers.filter((entry) => entry.status === "open").map((entry) => entry.blocker_id).sort();
  const identityReasons = [];
  if (matrix.source_revision !== sourceRevision) identityReasons.push("matrix_source_revision_stale");
  if (catalog.source_revision !== sourceRevision) identityReasons.push("catalog_source_revision_stale");
  const reasonCodes = sortedUnique([
    ...identityReasons,
    ...gateResults.flatMap((entry) => entry.reason_codes),
    ...claimResults.flatMap((entry) => entry.reason_codes),
    ...riskResults.flatMap((entry) => entry.reason_codes),
    ...(openBlockers.length > 0 ? ["unresolved_release_blocker"] : []),
  ]);
  const decision = reasonCodes.length === 0 ? "ready" : "not_ready";
  const assessment = {
    schema_version: "1.0.0",
    schema_path: "schemas/release-assessment.schema.json",
    program: "ask_release_evidence_gate",
    program_revision: RELEASE_EVIDENCE_GATE_REVISION,
    repository_id: matrix.repository_id,
    source_revision: sourceRevision,
    matrix_id: matrix.matrix_id,
    matrix_digest: canonicalDigest(matrix),
    catalog_id: catalog.catalog_id,
    catalog_digest: canonicalDigest(catalog),
    decision,
    gate_results: gateResults,
    claim_results: claimResults,
    blockers: openBlockers,
    accepted_risks: riskResults.filter((entry) => entry.reason_codes.length === 0).map((entry) => entry.risk_id).sort(),
    reason_codes: reasonCodes,
  };
  failSchema(assessment, RELEASE_ASSESSMENT_SCHEMA_PATH, "release assessment");
  return assessment;
}

function parseCli(argv) {
  const [command, ...tokens] = argv;
  if (command !== "assess") throw new Error("release evidence gate command must be assess");
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(`invalid release evidence gate option: ${flag ?? "missing"}`);
    const key = flag.slice(2).replaceAll("-", "_");
    if (Object.hasOwn(options, key)) throw new Error(`duplicate release evidence gate option: ${flag}`);
    options[key] = value;
  }
  const allowed = new Set(["matrix", "evidence", "source_revision", "root"]);
  const unknown = Object.keys(options).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`unknown release evidence gate option: --${unknown.replaceAll("_", "-")}`);
  for (const key of ["matrix", "evidence", "source_revision"]) if (!options[key]) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  return options;
}

function runCli(argv) {
  const options = parseCli(argv);
  const matrix = readJson(resolve(options.matrix), "release claim matrix");
  const catalog = readJson(resolve(options.evidence), "release evidence catalog");
  const assessment = assessRelease({
    matrix,
    catalog,
    repositoryRoot: options.root ? resolve(options.root) : ROOT,
    sourceRevision: options.source_revision,
  });
  process.stdout.write(`${stableCanonicalJson(assessment)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Release evidence gate failed: ${error.message}`);
    process.exit(1);
  }
}
