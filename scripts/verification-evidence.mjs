#!/usr/bin/env node
import { dirname, isAbsolute, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest,
  contentAddressedObjectPath,
  listContentAddressedJson,
  putContentAddressedJson,
  readContentAddressedJson,
  readJsonFileStrict,
  stableCanonicalJson,
  writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VERIFICATION_EVIDENCE_SCHEMA_PATH = resolve(ROOT, "schemas/verification-evidence.schema.json");
export const VERIFICATION_EVIDENCE_TRANSFER_SCHEMA_PATH = resolve(ROOT, "schemas/verification-evidence-transfer.schema.json");
export const VERIFICATION_REUSE_PLAN_SCHEMA_PATH = resolve(ROOT, "schemas/verification-reuse-plan.schema.json");
export const VERIFICATION_EVIDENCE_SCHEMA_REVISION = "1.0.0";
export const VERIFICATION_REUSE_PLANNER_REVISION = "1.0.0";

const EVIDENCE_ID_PATTERN = /^verification-evidence-([a-f0-9]{64})$/u;
const SENSITIVE_ABSOLUTE_PATH = /(?:^|=)(?:\/|[A-Za-z]:[\\/])|(?:\/Users\/|\/home\/|\/private\/|\/var\/folders\/)/u;
const ENVIRONMENT_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
const SENSITIVE_ARGUMENT_ASSIGNMENT = /^--?(?:api[-_]?key|credential|password|secret|token)=/iu;
const SENSITIVE_ARGUMENT_FLAG = /^--?(?:api[-_]?key|credential|password|secret|token)$/iu;

export { stableCanonicalJson };

function clone(value) {
  return structuredClone(value);
}

function failSchema(value, schemaPath, label) {
  const errors = validateJsonSchema(value, { schemaPath });
  if (errors.length > 0) throw new Error(`${label} failed JSON Schema validation:\n${errors.join("\n")}`);
}

function uniqueCanonical(values, label) {
  const keys = values.map((entry) => stableCanonicalJson(entry));
  if (new Set(keys).size !== keys.length) throw new Error(`${label} contains duplicate or conflicting entries`);
}

function sortedCopy(values, label, key = (entry) => stableCanonicalJson(entry)) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  uniqueCanonical(values, label);
  return clone(values).sort((left, right) => key(left).localeCompare(key(right)));
}

function assertCanonicalOrder(values, label, key = (entry) => stableCanonicalJson(entry)) {
  const expected = sortedCopy(values, label, key);
  if (stableCanonicalJson(values) !== stableCanonicalJson(expected)) throw new Error(`${label} must use canonical sorted order`);
}

function assertUniqueBy(values, label, key) {
  const seen = new Set();
  for (const entry of values) {
    const identity = key(entry);
    if (seen.has(identity)) throw new Error(`${label} contains a duplicate or conflicting identity: ${identity}`);
    seen.add(identity);
  }
}

function assertDisjoint(left, right, label) {
  const rightValues = new Set(right);
  const overlap = left.filter((entry) => rightValues.has(entry));
  if (overlap.length > 0) throw new Error(`${label} contains contradictory entries: ${overlap.join(", ")}`);
}

function assertPortableRelativePath(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || isAbsolute(value)
    || win32.isAbsolute(value)
    || value.includes("\\")
    || value.startsWith("./")
    || (value !== "." && (posix.normalize(value) !== value || value.split("/").some((part) => !part || part === "." || part === "..")))
  ) throw new Error(`${label} must be a portable repository-relative path`);
  return value;
}

function assertCommandBoundary(command) {
  assertPortableRelativePath(command.working_directory, "verification command working_directory");
  for (let index = 0; index < command.arguments.length; index += 1) {
    const argument = command.arguments[index];
    if (SENSITIVE_ABSOLUTE_PATH.test(argument) || argument.startsWith("file://")) throw new Error("verification command argument contains an absolute private path");
    if (ENVIRONMENT_ASSIGNMENT.test(argument)) throw new Error("verification command arguments must not embed environment assignments");
    if (SENSITIVE_ARGUMENT_ASSIGNMENT.test(argument) || (SENSITIVE_ARGUMENT_FLAG.test(argument) && command.arguments[index + 1] !== undefined)) throw new Error("verification command arguments must not embed credential or secret values");
  }
}

function normalizeEvidenceDraft(draft) {
  const normalized = clone(draft);
  delete normalized.evidence_id;
  delete normalized.evidence_digest;
  delete normalized.reuse_identity_digest;
  if (!Array.isArray(normalized.consumed_inputs)) throw new Error("verification evidence consumed_inputs must be present");
  if (!Array.isArray(normalized.execution?.toolchain)) throw new Error("verification evidence execution.toolchain must be present");
  if (!Array.isArray(normalized.coverage?.obligation_refs)) throw new Error("verification evidence coverage.obligation_refs must be present");
  if (!Array.isArray(normalized.coverage?.explicit_non_coverage)) throw new Error("verification evidence coverage.explicit_non_coverage must be present");
  normalized.consumed_inputs = sortedCopy(normalized.consumed_inputs, "verification evidence consumed_inputs", (entry) => `${entry.path}\0${entry.kind}\0${entry.digest}`);
  normalized.execution.toolchain = sortedCopy(normalized.execution.toolchain, "verification evidence toolchain", (entry) => `${entry.name}\0${entry.version}\0${entry.identity_digest}`);
  normalized.coverage.obligation_refs = sortedCopy(normalized.coverage.obligation_refs, "verification evidence obligation_refs", (entry) => entry);
  normalized.coverage.explicit_non_coverage = sortedCopy(normalized.coverage.explicit_non_coverage, "verification evidence explicit_non_coverage", (entry) => entry);
  return normalized;
}

function evidenceContent(evidence) {
  const content = clone(evidence);
  delete content.evidence_id;
  delete content.evidence_digest;
  return content;
}

function evidenceIdFromDigest(digest) {
  return `verification-evidence-${digest.slice("sha256:".length)}`;
}

function evidenceDigestFromId(evidenceId) {
  const match = EVIDENCE_ID_PATTERN.exec(evidenceId ?? "");
  if (!match) throw new Error("verification evidence ID is invalid");
  return `sha256:${match[1]}`;
}

export function reuseIdentityFromEvidence(evidence) {
  return {
    gate: clone(evidence.gate),
    target: clone(evidence.target),
    consumed_inputs: clone(evidence.consumed_inputs),
    execution: {
      command: clone(evidence.execution.command),
      runner: clone(evidence.execution.runner),
      toolchain: clone(evidence.execution.toolchain),
      environment: clone(evidence.execution.environment),
    },
  };
}

function validateReuseIdentity(identity, label) {
  if (identity.gate.gate_id.length === 0) throw new Error(`${label} gate ID is missing`);
  for (const input of identity.consumed_inputs) assertPortableRelativePath(input.path, `${label} consumed input`);
  assertCommandBoundary(identity.execution.command);
  assertCanonicalOrder(identity.consumed_inputs, `${label} consumed_inputs`, (entry) => `${entry.path}\0${entry.kind}\0${entry.digest}`);
  assertUniqueBy(identity.consumed_inputs, `${label} consumed_inputs`, (entry) => entry.path);
  assertCanonicalOrder(identity.execution.toolchain, `${label} toolchain`, (entry) => `${entry.name}\0${entry.version}\0${entry.identity_digest}`);
  assertUniqueBy(identity.execution.toolchain, `${label} toolchain`, (entry) => entry.name);
  return identity;
}

export function sealVerificationEvidence(draft) {
  const content = normalizeEvidenceDraft(draft);
  const reuseIdentity = reuseIdentityFromEvidence(content);
  content.reuse_identity_digest = canonicalDigest(reuseIdentity);
  const evidenceDigest = canonicalDigest(content);
  const evidence = {
    ...content,
    evidence_id: evidenceIdFromDigest(evidenceDigest),
    evidence_digest: evidenceDigest,
  };
  validateVerificationEvidence(evidence);
  return evidence;
}

export function validateVerificationEvidence(evidence, { schemaPath = VERIFICATION_EVIDENCE_SCHEMA_PATH } = {}) {
  failSchema(evidence, schemaPath, "verification evidence");
  assertCanonicalOrder(evidence.consumed_inputs, "verification evidence consumed_inputs", (entry) => `${entry.path}\0${entry.kind}\0${entry.digest}`);
  assertCanonicalOrder(evidence.execution.toolchain, "verification evidence toolchain", (entry) => `${entry.name}\0${entry.version}\0${entry.identity_digest}`);
  assertCanonicalOrder(evidence.coverage.obligation_refs, "verification evidence obligation_refs", (entry) => entry);
  assertCanonicalOrder(evidence.coverage.explicit_non_coverage, "verification evidence explicit_non_coverage", (entry) => entry);
  assertDisjoint(evidence.coverage.obligation_refs, evidence.coverage.explicit_non_coverage, "verification evidence coverage");
  const identity = validateReuseIdentity(reuseIdentityFromEvidence(evidence), "verification evidence reuse identity");
  const expectedReuseDigest = canonicalDigest(identity);
  if (evidence.reuse_identity_digest !== expectedReuseDigest) throw new Error("verification evidence reuse identity digest mismatch");
  const expectedEvidenceDigest = canonicalDigest(evidenceContent(evidence));
  if (evidence.evidence_digest !== expectedEvidenceDigest || evidence.evidence_id !== evidenceIdFromDigest(expectedEvidenceDigest)) throw new Error("verification evidence digest or ID mismatch; evidence may be tampered");
  if (evidenceDigestFromId(evidence.evidence_id) !== evidence.evidence_digest) throw new Error("verification evidence ID and digest disagree");
  return evidence;
}

export function evidenceObjectPath({ storeRoot, evidenceId }) {
  return contentAddressedObjectPath({ storeRoot, digest: evidenceDigestFromId(evidenceId) });
}

export function putVerificationEvidence({ storeRoot, evidence }) {
  const validated = validateVerificationEvidence(evidence);
  const publication = putContentAddressedJson({
    storeRoot,
    artifact: evidenceContent(validated),
    digest: validated.evidence_digest,
  });
  return {
    evidence_id: validated.evidence_id,
    evidence_digest: validated.evidence_digest,
    path: publication.path,
    created: publication.created,
  };
}

export function readVerificationEvidence({ storeRoot, evidenceId }) {
  const digest = evidenceDigestFromId(evidenceId);
  const stored = readContentAddressedJson({ storeRoot, digest });
  const evidence = sealVerificationEvidence(stored.value);
  if (evidence.evidence_id !== evidenceId || evidence.evidence_digest !== stored.digest) throw new Error("stored verification evidence content-addressed identity mismatch");
  return evidence;
}

function storedVerificationEvidence(storeRoot) {
  return listContentAddressedJson({ storeRoot })
    .filter((record) => record.value?.program === "ask_verification_evidence")
    .map((record) => {
      const evidence = sealVerificationEvidence(record.value);
      if (evidence.evidence_digest !== record.digest) throw new Error("stored verification evidence digest does not match the object address");
      return evidence;
    })
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
}

function selfDigest(value, idField, digestField) {
  const content = clone(value);
  delete content[idField];
  delete content[digestField];
  return canonicalDigest(content);
}

function normalizeAuthorityRequirement(authority) {
  const normalized = clone(authority);
  normalized.accepted_producer_kinds = sortedCopy(authority.accepted_producer_kinds, "accepted producer kinds", (entry) => entry);
  normalized.accepted_producer_identity_digests = sortedCopy(authority.accepted_producer_identity_digests, "accepted producer identity digests", (entry) => entry);
  normalized.accepted_evidence_levels = sortedCopy(authority.accepted_evidence_levels, "accepted evidence levels", (entry) => entry);
  return normalized;
}

export function buildVerificationRequirements({ requiredGates }) {
  if (!Array.isArray(requiredGates) || requiredGates.length === 0) throw new Error("verification requirements need at least one required gate");
  const normalizedGates = requiredGates.map((entry) => {
    const gate = clone(entry);
    gate.reuse_identity.consumed_inputs = sortedCopy(gate.reuse_identity.consumed_inputs, `${gate.gate_id} consumed_inputs`, (input) => `${input.path}\0${input.kind}\0${input.digest}`);
    gate.reuse_identity.execution.toolchain = sortedCopy(gate.reuse_identity.execution.toolchain, `${gate.gate_id} toolchain`, (tool) => `${tool.name}\0${tool.version}\0${tool.identity_digest}`);
    gate.reuse_identity_digest = canonicalDigest(gate.reuse_identity);
    gate.required_obligation_refs = sortedCopy(gate.required_obligation_refs, `${gate.gate_id} required obligation refs`, (entry) => entry);
    gate.authority = normalizeAuthorityRequirement(gate.authority);
    return gate;
  }).sort((left, right) => left.gate_id.localeCompare(right.gate_id));
  uniqueCanonical(normalizedGates.map((entry) => entry.gate_id), "required gate IDs");
  const target = clone(normalizedGates[0].reuse_identity.target);
  const content = {
    schema_version: VERIFICATION_EVIDENCE_SCHEMA_REVISION,
    schema_path: "schemas/verification-reuse-plan.schema.json",
    program: "ask_verification_requirements",
    planner_scope: "exact_only",
    target,
    required_gates: normalizedGates,
  };
  const digest = canonicalDigest(content);
  const requirements = {
    ...content,
    requirements_id: `verification-requirements-${digest.slice("sha256:".length)}`,
    requirements_digest: digest,
  };
  validateVerificationRequirements(requirements);
  return requirements;
}

export function validateVerificationRequirements(requirements, { schemaPath = VERIFICATION_REUSE_PLAN_SCHEMA_PATH } = {}) {
  failSchema(requirements, schemaPath, "verification requirements");
  assertCanonicalOrder(requirements.required_gates, "verification required_gates", (entry) => entry.gate_id);
  uniqueCanonical(requirements.required_gates.map((entry) => entry.gate_id), "verification required gate IDs");
  for (const gate of requirements.required_gates) {
    if (gate.gate_id !== gate.reuse_identity.gate.gate_id) throw new Error(`${gate.gate_id} does not match the reuse identity gate ID`);
    if (stableCanonicalJson(gate.reuse_identity.target) !== stableCanonicalJson(requirements.target)) throw new Error(`${gate.gate_id} target does not match verification requirements target`);
    validateReuseIdentity(gate.reuse_identity, `${gate.gate_id} reuse identity`);
    if (canonicalDigest(gate.reuse_identity) !== gate.reuse_identity_digest) throw new Error(`${gate.gate_id} reuse identity digest mismatch`);
    assertCanonicalOrder(gate.required_obligation_refs, `${gate.gate_id} required obligation refs`, (entry) => entry);
    assertCanonicalOrder(gate.authority.accepted_producer_kinds, `${gate.gate_id} accepted producer kinds`, (entry) => entry);
    assertCanonicalOrder(gate.authority.accepted_producer_identity_digests, `${gate.gate_id} accepted producer identity digests`, (entry) => entry);
    assertCanonicalOrder(gate.authority.accepted_evidence_levels, `${gate.gate_id} accepted evidence levels`, (entry) => entry);
  }
  const digest = selfDigest(requirements, "requirements_id", "requirements_digest");
  if (requirements.requirements_digest !== digest || requirements.requirements_id !== `verification-requirements-${digest.slice("sha256:".length)}`) throw new Error("verification requirements digest or ID mismatch");
  return requirements;
}

function obligationDispositionFields(gate, covered) {
  const required = clone(gate.required_obligation_refs);
  return {
    required_obligation_refs: required,
    covered_obligation_refs: covered ? clone(required) : [],
    uncovered_obligation_refs: covered ? [] : clone(required),
  };
}

function evidenceCoversRequiredObligations(evidence, gate) {
  const covered = new Set(evidence.coverage.obligation_refs);
  const explicitlyUncovered = new Set(evidence.coverage.explicit_non_coverage);
  return gate.required_obligation_refs.every((obligation) => covered.has(obligation) && !explicitlyUncovered.has(obligation));
}

function dispositionForGate(gate, allEvidence) {
  const digestCandidates = allEvidence.filter((evidence) => evidence.reuse_identity_digest === gate.reuse_identity_digest);
  const exact = digestCandidates.filter((evidence) => stableCanonicalJson(reuseIdentityFromEvidence(evidence)) === stableCanonicalJson(gate.reuse_identity));
  if (exact.length !== digestCandidates.length) throw new Error(`${gate.gate_id} reuse identity digest maps to non-identical material inputs`);
  const authorityAccepted = exact.filter((evidence) => (
    gate.authority.accepted_producer_kinds.includes(evidence.producer.kind)
    && gate.authority.accepted_producer_identity_digests.includes(evidence.producer.identity_digest)
    && gate.authority.accepted_evidence_levels.includes(evidence.execution.runner.evidence_level)
  ));
  if (exact.length > 0 && authorityAccepted.length === 0) {
    return {
      gate_id: gate.gate_id,
      reuse_identity_digest: gate.reuse_identity_digest,
      ...obligationDispositionFields(gate, false),
      disposition: gate.execution_availability === "unavailable" ? "blocked_uncovered" : "rerun_required",
      reason_code: "exact_evidence_authority_mismatch",
      evidence_id: null,
      evidence_digest: null,
      execution_evidence_reusable: false,
    };
  }
  const outcomes = new Set(authorityAccepted.map((evidence) => evidence.execution.terminal.status));
  if (outcomes.has("succeeded") && [...outcomes].some((status) => status !== "succeeded")) {
    return {
      gate_id: gate.gate_id,
      reuse_identity_digest: gate.reuse_identity_digest,
      ...obligationDispositionFields(gate, false),
      disposition: "rerun_required",
      reason_code: "conflicting_exact_evidence",
      evidence_id: null,
      evidence_digest: null,
      execution_evidence_reusable: false,
    };
  }
  const passing = authorityAccepted.filter((evidence) => evidence.execution.terminal.status === "succeeded");
  const covering = passing.filter((evidence) => evidenceCoversRequiredObligations(evidence, gate));
  if (covering.length > 0) {
    const evidence = covering[0];
    const independent = gate.authority.independent_judgment_required;
    return {
      gate_id: gate.gate_id,
      reuse_identity_digest: gate.reuse_identity_digest,
      ...obligationDispositionFields(gate, true),
      disposition: independent ? "independent_judgment_required" : "reuse_exact",
      reason_code: independent ? "independent_judgment_required" : "exact_identity_verified",
      evidence_id: evidence.evidence_id,
      evidence_digest: evidence.evidence_digest,
      execution_evidence_reusable: true,
    };
  }
  if (passing.length > 0) {
    return {
      gate_id: gate.gate_id,
      reuse_identity_digest: gate.reuse_identity_digest,
      ...obligationDispositionFields(gate, false),
      disposition: gate.execution_availability === "unavailable" ? "blocked_uncovered" : "rerun_required",
      reason_code: "exact_evidence_coverage_mismatch",
      evidence_id: null,
      evidence_digest: null,
      execution_evidence_reusable: false,
    };
  }
  if (authorityAccepted.length > 0) {
    return {
      gate_id: gate.gate_id,
      reuse_identity_digest: gate.reuse_identity_digest,
      ...obligationDispositionFields(gate, false),
      disposition: gate.execution_availability === "unavailable" ? "blocked_uncovered" : "rerun_required",
      reason_code: "exact_evidence_not_passing",
      evidence_id: null,
      evidence_digest: null,
      execution_evidence_reusable: false,
    };
  }
  return {
    gate_id: gate.gate_id,
    reuse_identity_digest: gate.reuse_identity_digest,
    ...obligationDispositionFields(gate, false),
    disposition: gate.execution_availability === "unavailable" ? "blocked_uncovered" : "rerun_required",
    reason_code: gate.execution_availability === "unavailable" ? "execution_unavailable" : "no_exact_evidence",
    evidence_id: null,
    evidence_digest: null,
    execution_evidence_reusable: false,
  };
}

function coverageFromDispositions(dispositions) {
  const count = (disposition) => dispositions.filter((entry) => entry.disposition === disposition).length;
  const covered = dispositions.filter((entry) => entry.disposition === "reuse_exact").map((entry) => entry.gate_id).sort();
  const blocking = dispositions.filter((entry) => entry.disposition !== "reuse_exact").map((entry) => entry.gate_id).sort();
  return {
    status: blocking.length === 0 ? "covered" : "blocked",
    required_gate_count: dispositions.length,
    reuse_exact_count: count("reuse_exact"),
    reuse_scoped_count: count("reuse_scoped"),
    rerun_required_count: count("rerun_required"),
    independent_judgment_required_count: count("independent_judgment_required"),
    blocked_uncovered_count: count("blocked_uncovered"),
    covered_gate_ids: covered,
    blocking_gate_ids: blocking,
  };
}

export function planExactReuse({ storeRoot, requirements }) {
  validateVerificationRequirements(requirements);
  const evidence = storedVerificationEvidence(storeRoot);
  const dispositions = requirements.required_gates.map((gate) => dispositionForGate(gate, evidence));
  const content = {
    schema_version: VERIFICATION_EVIDENCE_SCHEMA_REVISION,
    schema_path: "schemas/verification-reuse-plan.schema.json",
    program: "ask_verification_reuse_plan",
    planner_revision: VERIFICATION_REUSE_PLANNER_REVISION,
    planner_scope: "exact_only",
    requirements_id: requirements.requirements_id,
    requirements_digest: requirements.requirements_digest,
    target: clone(requirements.target),
    dispositions,
    coverage: coverageFromDispositions(dispositions),
  };
  const digest = canonicalDigest(content);
  const plan = {
    ...content,
    plan_id: `verification-reuse-plan-${digest.slice("sha256:".length)}`,
    plan_digest: digest,
  };
  validateVerificationReusePlan(plan, { requirements });
  return plan;
}

function validatePlanRequirementsBinding(plan, requirements) {
  validateVerificationRequirements(requirements);
  if (plan.requirements_id !== requirements.requirements_id || plan.requirements_digest !== requirements.requirements_digest) throw new Error("verification reuse plan requirements identity mismatch");
  if (stableCanonicalJson(plan.target) !== stableCanonicalJson(requirements.target)) throw new Error("verification reuse plan requirements target mismatch");
  if (plan.dispositions.length !== requirements.required_gates.length) throw new Error("verification reuse plan does not cover every required gate");
  const requiredByGate = new Map(requirements.required_gates.map((gate) => [gate.gate_id, gate]));
  for (const disposition of plan.dispositions) {
    const requiredGate = requiredByGate.get(disposition.gate_id);
    if (!requiredGate) throw new Error(`${disposition.gate_id} is not present in the bound verification requirements`);
    if (disposition.reuse_identity_digest !== requiredGate.reuse_identity_digest) throw new Error(`${disposition.gate_id} reuse identity does not match the bound verification requirements`);
    if (stableCanonicalJson(disposition.required_obligation_refs) !== stableCanonicalJson(requiredGate.required_obligation_refs)) throw new Error(`${disposition.gate_id} obligations do not match the bound verification requirements`);
  }
}

export function validateVerificationReusePlan(plan, { schemaPath = VERIFICATION_REUSE_PLAN_SCHEMA_PATH, requirements } = {}) {
  failSchema(plan, schemaPath, "verification reuse plan");
  assertCanonicalOrder(plan.dispositions, "verification reuse dispositions", (entry) => entry.gate_id);
  uniqueCanonical(plan.dispositions.map((entry) => entry.gate_id), "verification reuse disposition gate IDs");
  if (plan.dispositions.some((entry) => entry.disposition === "reuse_scoped")) throw new Error("reuse_scoped is unavailable while planner_scope is exact_only");
  const expectedCoverage = coverageFromDispositions(plan.dispositions);
  if (stableCanonicalJson(plan.coverage) !== stableCanonicalJson(expectedCoverage)) throw new Error("verification reuse plan coverage summary mismatch");
  const allowedReasons = {
    reuse_exact: new Set(["exact_identity_verified"]),
    rerun_required: new Set(["no_exact_evidence", "exact_evidence_not_passing", "exact_evidence_authority_mismatch", "exact_evidence_coverage_mismatch", "conflicting_exact_evidence"]),
    independent_judgment_required: new Set(["independent_judgment_required"]),
    blocked_uncovered: new Set(["execution_unavailable", "exact_evidence_not_passing", "exact_evidence_authority_mismatch", "exact_evidence_coverage_mismatch"]),
  };
  for (const disposition of plan.dispositions) {
    assertCanonicalOrder(disposition.required_obligation_refs, `${disposition.gate_id} required obligation refs`, (entry) => entry);
    assertCanonicalOrder(disposition.covered_obligation_refs, `${disposition.gate_id} covered obligation refs`, (entry) => entry);
    assertCanonicalOrder(disposition.uncovered_obligation_refs, `${disposition.gate_id} uncovered obligation refs`, (entry) => entry);
    assertDisjoint(disposition.covered_obligation_refs, disposition.uncovered_obligation_refs, `${disposition.gate_id} obligation coverage`);
    const partition = [...disposition.covered_obligation_refs, ...disposition.uncovered_obligation_refs].sort((left, right) => left.localeCompare(right));
    if (stableCanonicalJson(partition) !== stableCanonicalJson(disposition.required_obligation_refs)) throw new Error(`${disposition.gate_id} obligation coverage does not partition its requirements`);
    const hasEvidence = disposition.evidence_id !== null || disposition.evidence_digest !== null;
    const fullyCovered = ["reuse_exact", "independent_judgment_required"].includes(disposition.disposition);
    if (hasEvidence && (disposition.evidence_id === null || disposition.evidence_digest === null || evidenceDigestFromId(disposition.evidence_id) !== disposition.evidence_digest)) throw new Error(`${disposition.gate_id} disposition evidence reference is incomplete or mismatched`);
    if (!allowedReasons[disposition.disposition]?.has(disposition.reason_code)) throw new Error(`${disposition.gate_id} disposition reason contradicts its state`);
    if (fullyCovered !== hasEvidence) throw new Error(`${disposition.gate_id} disposition evidence presence contradicts its state`);
    if (disposition.execution_evidence_reusable !== fullyCovered) throw new Error(`${disposition.gate_id} execution_evidence_reusable contradicts its disposition`);
    if (fullyCovered && disposition.uncovered_obligation_refs.length > 0) throw new Error(`${disposition.gate_id} reusable evidence leaves required obligations uncovered`);
    if (!fullyCovered && disposition.covered_obligation_refs.length > 0) throw new Error(`${disposition.gate_id} blocking disposition cannot claim covered obligations`);
  }
  if (requirements) validatePlanRequirementsBinding(plan, requirements);
  const digest = selfDigest(plan, "plan_id", "plan_digest");
  if (plan.plan_digest !== digest || plan.plan_id !== `verification-reuse-plan-${digest.slice("sha256:".length)}`) throw new Error("verification reuse plan digest or ID mismatch");
  return plan;
}

function transferContent(transfer) {
  const content = clone(transfer);
  delete content.transfer_id;
  delete content.transfer_digest;
  return content;
}

export function buildEvidenceTransfer({ storeRoot, evidenceIds }) {
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) throw new Error("evidence export needs at least one evidence ID");
  const ids = sortedCopy(evidenceIds, "evidence export IDs", (entry) => entry);
  const objects = ids.map((evidenceId) => readVerificationEvidence({ storeRoot, evidenceId }));
  if (objects.some((evidence) => evidence.privacy.exportability !== "exportable")) throw new Error("local_only verification evidence cannot be exported");
  const content = {
    schema_version: VERIFICATION_EVIDENCE_SCHEMA_REVISION,
    schema_path: "schemas/verification-evidence-transfer.schema.json",
    program: "ask_verification_evidence_transfer",
    evidence_refs: objects.map((evidence) => ({
      evidence_id: evidence.evidence_id,
      evidence_digest: evidence.evidence_digest,
      reuse_identity_digest: evidence.reuse_identity_digest,
    })),
    evidence_objects: objects,
    privacy: {
      bounded_structured_evidence_only: true,
      raw_logs_stored: false,
      raw_prompts_stored: false,
      secrets_stored: false,
      private_evaluators_stored: false,
      review_archives_stored: false,
    },
  };
  const digest = canonicalDigest(content);
  const transfer = {
    ...content,
    transfer_id: `verification-evidence-transfer-${digest.slice("sha256:".length)}`,
    transfer_digest: digest,
  };
  validateEvidenceTransfer(transfer);
  return transfer;
}

export function validateEvidenceTransfer(transfer, { schemaPath = VERIFICATION_EVIDENCE_TRANSFER_SCHEMA_PATH } = {}) {
  failSchema(transfer, schemaPath, "verification evidence transfer");
  assertCanonicalOrder(transfer.evidence_refs, "verification evidence transfer refs", (entry) => entry.evidence_id);
  assertCanonicalOrder(transfer.evidence_objects, "verification evidence transfer objects", (entry) => entry.evidence_id);
  uniqueCanonical(transfer.evidence_refs.map((entry) => entry.evidence_id), "verification evidence transfer ref IDs");
  uniqueCanonical(transfer.evidence_objects.map((entry) => entry.evidence_id), "verification evidence transfer object IDs");
  transfer.evidence_objects.forEach((evidence) => validateVerificationEvidence(evidence));
  if (transfer.evidence_objects.some((evidence) => evidence.privacy.exportability !== "exportable")) throw new Error("verification evidence transfer contains local_only evidence");
  const expectedRefs = transfer.evidence_objects.map((evidence) => ({
    evidence_id: evidence.evidence_id,
    evidence_digest: evidence.evidence_digest,
    reuse_identity_digest: evidence.reuse_identity_digest,
  }));
  if (stableCanonicalJson(transfer.evidence_refs) !== stableCanonicalJson(expectedRefs)) throw new Error("verification evidence transfer references do not match its objects");
  const digest = canonicalDigest(transferContent(transfer));
  if (transfer.transfer_digest !== digest || transfer.transfer_id !== `verification-evidence-transfer-${digest.slice("sha256:".length)}`) throw new Error("verification evidence transfer digest or identity mismatch; transfer may be tampered");
  return transfer;
}

export function importEvidenceTransfer({ storeRoot, transfer }) {
  validateEvidenceTransfer(transfer);
  const publications = transfer.evidence_objects.map((evidence) => putVerificationEvidence({ storeRoot, evidence }));
  return {
    transfer_id: transfer.transfer_id,
    evidence_ids: publications.map((entry) => entry.evidence_id),
    created_count: publications.filter((entry) => entry.created).length,
  };
}

function parseCliArgs(argv) {
  const [command, ...tokens] = argv;
  if (!command) throw new Error("verification evidence command is required");
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(`invalid verification evidence option: ${flag ?? "missing"}`);
    const key = flag.slice(2).replaceAll("-", "_");
    if (Object.hasOwn(options, key)) throw new Error(`duplicate verification evidence option: ${flag}`);
    options[key] = value;
  }
  return { command, options };
}

function requiredOption(options, key) {
  if (!options[key]) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  return options[key];
}

function emitCliArtifact(artifact, output) {
  if (output) writeCanonicalJsonNoReplace({ outputPath: output, artifact, label: "verification evidence CLI output" });
  else process.stdout.write(`${stableCanonicalJson(artifact)}\n`);
}

function runCli(argv) {
  const { command, options } = parseCliArgs(argv);
  if (command === "put") {
    const storeRoot = requiredOption(options, "store");
    const input = readJsonFileStrict(requiredOption(options, "input"), "verification evidence input");
    const evidence = input.evidence_id ? validateVerificationEvidence(input) : sealVerificationEvidence(input);
    const publication = putVerificationEvidence({ storeRoot, evidence });
    if (options.output) writeCanonicalJsonNoReplace({ outputPath: options.output, artifact: evidence, label: "sealed verification evidence" });
    process.stdout.write(`${stableCanonicalJson(publication)}\n`);
    return;
  }
  if (command === "verify") {
    const evidence = readVerificationEvidence({ storeRoot: requiredOption(options, "store"), evidenceId: requiredOption(options, "evidence_id") });
    emitCliArtifact(evidence, options.output);
    return;
  }
  if (command === "plan") {
    const input = readJsonFileStrict(requiredOption(options, "requirements"), "verification requirements input");
    const requirements = input.requirements_id ? validateVerificationRequirements(input) : buildVerificationRequirements(input);
    emitCliArtifact(planExactReuse({ storeRoot: requiredOption(options, "store"), requirements }), options.output);
    return;
  }
  if (command === "export") {
    const ids = requiredOption(options, "evidence_ids").split(",").filter(Boolean);
    emitCliArtifact(buildEvidenceTransfer({ storeRoot: requiredOption(options, "store"), evidenceIds: ids }), options.output);
    return;
  }
  if (command === "import") {
    const transfer = readJsonFileStrict(requiredOption(options, "input"), "verification evidence transfer input");
    const result = importEvidenceTransfer({ storeRoot: requiredOption(options, "store"), transfer });
    process.stdout.write(`${stableCanonicalJson(result)}\n`);
    return;
  }
  throw new Error(`unknown verification evidence command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Verification evidence failed: ${error.message}`);
    process.exit(1);
  }
}
