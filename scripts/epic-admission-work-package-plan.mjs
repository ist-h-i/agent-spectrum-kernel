#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest,
  readJsonFileStrict,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";

export const EPIC_ADMISSION_SCHEMA_VERSION = "1.1.0";
export const WORK_PACKAGE_PLAN_SCHEMA_VERSION = "1.2.0";
export const EPIC_ADMISSION_PROGRAM = "ask_epic_admission";
export const WORK_PACKAGE_PLAN_PROGRAM = "ask_work_package_plan";

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATHS = Object.freeze({
  policySchema: "schemas/epic-admission-policy.schema.json",
  decisionSchema: "schemas/epic-admission-decision.schema.json",
  contextSchema: "schemas/work-package-plan-validation-context.schema.json",
  planSchema: "schemas/work-package-plan.schema.json",
  policy: "docs/fixtures/epic-admission-policy.json",
  decision: "docs/fixtures/issue-275-slice-1-epic-admission-decision.json",
  context: "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json",
  plan: "docs/fixtures/issue-275-slice-1-work-package-plan.json",
  firstContext: "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r1.json",
  firstPlan: "docs/fixtures/issue-275-slice-1-work-package-plan-r1.json",
  previousContext: "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json",
  previousPlan: "docs/fixtures/issue-275-slice-1-work-package-plan-r2.json",
  cases: "docs/fixtures/epic-admission-work-package-plan-cases.json",
});

const HISTORICAL_ARTIFACT_PINS = Object.freeze({
  firstContext: Object.freeze({
    label: "r1 context",
    digestField: "context_digest",
    canonicalDigest: "sha256:77d060f40ac11a74f5d9e39bf28f5653ecade591b09bb090b9a42958ec6c11db",
    rawDigest: "sha256:0d1de9f8979799c16fd7ed8ea677e360d74dd3a980a3eab58f73a9e6afb51236",
  }),
  firstPlan: Object.freeze({
    label: "r1 plan",
    digestField: "plan_digest",
    canonicalDigest: "sha256:11adfda1e0a27c5aee8460807ef26f77b65ebd13ed26835b9e1e3af7654bb65d",
    rawDigest: "sha256:c65c703eb760467289847364d6dcb68c0bcc863ae091a641d892550e3a815437",
  }),
  previousContext: Object.freeze({
    label: "r2 context",
    digestField: "context_digest",
    canonicalDigest: "sha256:e33aebb1eacbeb9edb0dea3a33e252c4e686556677c44c47b013b45894d8bc1e",
    rawDigest: "sha256:e8d28d9b431d3118563d2db44f8eeeb56851678f3fc9163aeb485b8df3de0d3b",
  }),
  previousPlan: Object.freeze({
    label: "r2 plan",
    digestField: "plan_digest",
    canonicalDigest: "sha256:e97a2ef854ab5350d11ca00e305aaf44eb01939744500513bfee313ff94b8e3f",
    rawDigest: "sha256:545a7d08d055c1e99e95d9b49fca4e26021945328865b686febe94b276c275b4",
  }),
});

const AUTHORITY_SIGNAL_NAMES = Object.freeze([
  "acceptance_condition_count",
  "acceptance_registry_digest",
  "configured_epic",
  "independent_publication_units",
  "ordered_dependency",
  "scope_boundary_count",
  "scope_resolution",
]);

const REQUIRED_CASE_IDS = Object.freeze([
  "POS-SMALL-ORDINARY",
  "POS-CONFIGURED-EPIC",
  "POS-CONFIGURED-EPIC-ONLY",
  "POS-MULTI-BOUNDARY-THRESHOLD-ONLY",
  "POS-ORDERED-DEPENDENCY-ONLY",
  "POS-INDEPENDENT-PUBLICATION-ONLY",
  "POS-SCOPE-HUMAN-DECISION",
  "POS-VALID-MULTI-PACKAGE",
  "POS-VALID-SHARED-OWNERSHIP",
  "POS-PLAN-DERIVED-STACK-ORDER",
  "POS-INDEPENDENT-PUBLICATION-CONSOLIDATED",
  "POS-TRUSTED-HUMAN-APPROVAL",
  "POS-LIFECYCLE-WORK-PACKAGE-PROJECTION",
  "POS-OBSERVED-ARTIFACT-CLOSURE",
  "POS-EXPLICIT-OVERRIDE",
  "POS-DETERMINISTIC-IDENTITY",
  "NEG-SMALL-FALSE-EPIC",
  "NEG-AI-ESTIMATE-SOLE-BLOCK",
  "NEG-EVIDENCE-REF-BLANK",
  "NEG-EVALUATION-INPUT-COUNT",
  "NEG-EVALUATION-INPUT-EVIDENCE",
  "NEG-EVALUATION-INPUT-SCOPE",
  "NEG-POLICY-UNKNOWN-SCOPE-FAIL-OPEN",
  "NEG-OVERRIDE-REASON",
  "NEG-OVERRIDE-AUTHORITY",
  "NEG-OVERRIDE-AUTHORITY-REF",
  "NEG-OVERRIDE-GRANT",
  "NEG-OVERRIDE-GRANT-EVIDENCE-BLANK",
  "NEG-OVERRIDE-BASIS-REPLAY",
  "NEG-OVERRIDE-NOT-REQUESTED-PAYLOAD",
  "NEG-OVERRIDE-POLICY",
  "NEG-OVERRIDE-BOUNDARY",
  "NEG-PACKAGE-ID-MISSING",
  "NEG-PACKAGE-ID-DUPLICATE",
  "NEG-DAG-CYCLE",
  "NEG-DEPENDENCY-UNKNOWN",
  "NEG-DEPENDENCY-TARGET-MISSING",
  "NEG-AC-UNCOVERED",
  "NEG-AC-CONFLICT",
  "NEG-AC-OWNER-UNKNOWN",
  "NEG-AC-SHARED-AMBIGUOUS",
  "NEG-SCOPE-MISSING",
  "NEG-SCOPE-OVERLAP",
  "NEG-SCOPE-PATH-BACKSLASH",
  "NEG-SCOPE-PATH-CONTROL",
  "NEG-STACK-BASE",
  "NEG-INTEGRATION-ORDER",
  "NEG-INDEPENDENT-BRANCH",
  "NEG-PUBLICATION-UNRECONSTRUCTABLE",
  "NEG-REVIEW-UNRECONSTRUCTABLE",
  "NEG-ARTIFACT-OWNERSHIP-CONFLICT",
  "NEG-WORK-PACKAGE-ARTIFACT-ID-DUPLICATE",
  "NEG-TASK-ID-DUPLICATE",
  "NEG-STOP-CONDITION-DUPLICATE",
  "NEG-EXPECTED-ARTIFACT-PATH-INVALID",
  "NEG-EXPECTED-ARTIFACT-OUTSIDE-SCOPE",
  "NEG-EXPECTED-ARTIFACT-FORBIDDEN",
  "NEG-FOCUSED-GATE-MISSING",
  "NEG-FULL-GATE-PROCEDURE-BLANK",
  "NEG-FULL-GATE-PURPOSE-BLANK",
  "NEG-FULL-CHECKPOINT-MISSING",
  "NEG-HIDDEN-BLOCKER",
  "NEG-BLOCKER-STATUS-DOWNGRADE",
  "NEG-HIDDEN-HUMAN-DECISION",
  "NEG-HIDDEN-HUMAN-APPROVAL",
  "NEG-BLOCKER-ID-DUPLICATE",
  "NEG-DECISION-ID-DUPLICATE",
  "NEG-APPROVAL-ID-DUPLICATE",
  "NEG-APPROVAL-AUTHORITY-MISSING",
  "NEG-APPROVAL-AUTHORITY-MISMATCH",
  "NEG-APPROVAL-STATUS-SELF-ASSERTED",
  "NEG-DIGEST-TAMPER",
  "NEG-IDENTITY-TAMPER",
  "NEG-STALE",
  "NEG-PLAN-CONTENT-STALE",
  "NEG-GATE-DEFINITION-WEAKENED",
  "NEG-ADMISSION-AC-COUNT-STALE",
  "NEG-ADMISSION-AC-REGISTRY-STALE",
  "NEG-ORDERED-DEPENDENCY-SIGNAL-MISMATCH",
  "NEG-STACK-DEPENDENCY-CLOSURE",
  "NEG-REVISION-ONE-LINEAGE-PAYLOAD",
  "NEG-LIFECYCLE-PROJECTION-DRIFT",
  "NEG-PREVIOUS-PLAN-CONTENT-MISMATCH",
  "NEG-OBSERVED-ARTIFACT-MISSING",
  "NEG-OBSERVED-ARTIFACT-UNPLANNED",
  "NEG-CROSS-PLAN",
  "NEG-CROSS-REPOSITORY",
  "NEG-PARTIAL",
  "NEG-PROPOSED-NOT-EXECUTABLE",
  "NEG-EXECUTABLE-OPEN-BLOCKER",
  "NEG-EXECUTABLE-UNRESOLVED-DECISION",
  "NEG-EXECUTABLE-APPROVAL-REQUIRED",
  "NEG-EXECUTABLE-ADMISSION-HUMAN",
  "NEG-DUPLICATE-KEY",
  "NEG-UNKNOWN-FIELD",
  "NEG-UNKNOWN-STATE",
  "NEG-ADMISSION-DECISION-DEPENDENCY-MALFORMED",
  "NEG-PREVIOUS-REVISION-DEPENDENCY-MALFORMED",
  "NEG-REPOSITORY-DECISION-MALFORMED",
  "NEG-REPOSITORY-HISTORICAL-R1-CONTEXT-MALFORMED",
  "NEG-REPOSITORY-HISTORICAL-R1-PLAN-MALFORMED",
  "NEG-REPOSITORY-HISTORICAL-R2-CONTEXT-MALFORMED",
  "NEG-REPOSITORY-HISTORICAL-R2-PLAN-MALFORMED",
  "NEG-POLICY-DEPENDENCY-MALFORMED",
  "NEG-REPOSITORY-POLICY-MALFORMED",
  "NEG-REPOSITORY-CATALOG-MALFORMED",
]);

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepClone(value) {
  return structuredClone(value);
}

function withoutField(value, field) {
  const clone = deepClone(value);
  delete clone[field];
  return clone;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareAscii);
}

function sortByKey(values, key) {
  return [...values].sort((left, right) => compareAscii(left[key], right[key]));
}

function tupleKey(reference) {
  return `${reference.artifact_id}\0${reference.observed_revision}\0${reference.item_id ?? ""}`;
}

function sameJson(left, right) {
  return stableCanonicalJson(left) === stableCanonicalJson(right);
}

function derivedStableId(prefix, seed) {
  return `${prefix}-${canonicalDigest(seed).slice("sha256:".length, "sha256:".length + 24)}`;
}

function issue(code, path, message) {
  return { code, path, message };
}

function sortedIssues(issues) {
  return [...issues].sort((left, right) => compareAscii(
    `${left.code}\0${left.path}\0${left.message}`,
    `${right.code}\0${right.path}\0${right.message}`,
  ));
}

function schemaIssues(value, schemaPath) {
  return validateJsonSchema(value, { schemaPath }).map((message) => {
    const separator = message.indexOf(":");
    return issue(
      "SCHEMA_INVALID",
      separator === -1 ? "$" : message.slice(0, separator),
      separator === -1 ? message : message.slice(separator + 1).trim(),
    );
  });
}

function resolvedPaths(root, overrides = {}) {
  return Object.fromEntries(Object.entries({ ...DEFAULT_PATHS, ...overrides }).map(([key, path]) => [key, resolve(root, path)]));
}

function normalizePolicyDraft(value) {
  const normalized = deepClone(value);
  if (normalized.rules) {
    normalized.rules.configured_epic_goal_ids = uniqueSorted(normalized.rules.configured_epic_goal_ids ?? []);
    normalized.rules.human_decision_scope_states = uniqueSorted(normalized.rules.human_decision_scope_states ?? []);
    normalized.rules.accepted_authority_evidence_statuses = uniqueSorted(normalized.rules.accepted_authority_evidence_statuses ?? []);
  }
  normalized.override_rules = sortByKey(normalized.override_rules ?? [], "rule_id").map((rule) => ({
    ...rule,
    authority_grants: sortByKey(rule.authority_grants ?? [], "grant_id"),
    non_overridable_reason_codes: uniqueSorted(rule.non_overridable_reason_codes ?? []),
  }));
  return normalized;
}

export function sealEpicAdmissionPolicy(draft) {
  const normalized = normalizePolicyDraft(withoutField(withoutField(draft, "policy_id"), "policy_digest"));
  normalized.schema_version = EPIC_ADMISSION_SCHEMA_VERSION;
  normalized.artifact_type = "epic_admission_policy";
  normalized.program = EPIC_ADMISSION_PROGRAM;
  normalized.policy_id = derivedStableId("EAP", {
    program: normalized.program,
    policy_key: normalized.policy_key,
  });
  normalized.digest_contract = {
    algorithm: "sha256",
    canonicalization: "sorted_key_canonical_json",
    excluded_field: "policy_digest",
  };
  normalized.policy_digest = canonicalDigest(normalized);
  return normalized;
}

function normalizeDecisionDraft(value) {
  const normalized = deepClone(value);
  normalized.reason_codes = uniqueSorted(normalized.reason_codes ?? []);
  normalized.unresolved_scope = uniqueSorted(normalized.unresolved_scope ?? []);
  normalized.blockers = uniqueSorted(normalized.blockers ?? []);
  return normalized;
}

export function sealEpicAdmissionDecision(draft) {
  const normalized = normalizeDecisionDraft(withoutField(withoutField(draft, "decision_id"), "decision_digest"));
  normalized.schema_version = EPIC_ADMISSION_SCHEMA_VERSION;
  normalized.artifact_type = "epic_admission_decision";
  normalized.program = EPIC_ADMISSION_PROGRAM;
  normalized.decision_id = derivedStableId("EAD", {
    program: normalized.program,
    repository_id: normalized.subject?.repository_id,
    goal_id: normalized.subject?.goal_id,
    task_id: normalized.subject?.task_id,
  });
  normalized.digest_contract = {
    algorithm: "sha256",
    canonicalization: "sorted_key_canonical_json",
    excluded_field: "decision_digest",
  };
  normalized.decision_digest = canonicalDigest(normalized);
  return normalized;
}

function policyRef(policy) {
  return {
    policy_id: policy.policy_id,
    policy_revision: policy.policy_revision,
    policy_digest: policy.policy_digest,
  };
}

function decisionRef(decision) {
  return {
    decision_id: decision.decision_id,
    decision_revision: decision.decision_revision,
    decision_digest: decision.decision_digest,
  };
}

function contextRef(context) {
  return {
    context_id: context.context_id,
    context_revision: context.context_revision,
    context_digest: context.context_digest,
  };
}

export function validateEpicAdmissionPolicy(policy, { schemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.policySchema) } = {}) {
  const issues = schemaIssues(policy, schemaPath);
  if (issues.length > 0) return sortedIssues(issues);

  const resealed = sealEpicAdmissionPolicy(policy);
  if (policy.policy_id !== resealed.policy_id) {
    issues.push(issue("POLICY_IDENTITY_MISMATCH", "$.policy_id", "policy_id does not match the deterministic policy identity"));
  }
  if (policy.policy_digest !== resealed.policy_digest) {
    issues.push(issue("POLICY_DIGEST_MISMATCH", "$.policy_digest", "policy_digest does not match canonical policy content"));
  }
  if (!sameJson(withoutField(withoutField(policy, "policy_id"), "policy_digest"), withoutField(withoutField(resealed, "policy_id"), "policy_digest"))) {
    issues.push(issue("POLICY_NON_CANONICAL", "$", "policy set-like fields are not in canonical order"));
  }

  const ruleIds = policy.override_rules.map((rule) => rule.rule_id);
  if (new Set(ruleIds).size !== ruleIds.length) {
    issues.push(issue("OVERRIDE_RULE_DUPLICATE", "$.override_rules", "override rule IDs must be unique"));
  }
  policy.override_rules.forEach((rule, index) => {
    if (rule.from_decision === rule.to_decision) {
      issues.push(issue("OVERRIDE_TRANSITION_NOOP", `$.override_rules[${index}]`, "override transition must change the admission decision"));
    }
    if (rule.from_decision === "human_decision_required" || rule.to_decision === "human_decision_required") {
      issues.push(issue("OVERRIDE_AUTHORITY_BOUNDARY", `$.override_rules[${index}]`, "human decision state is not policy-overridable"));
    }
    for (const grantId of duplicateIds(rule.authority_grants, "grant_id")) {
      issues.push(issue("OVERRIDE_GRANT_DUPLICATE", `$.override_rules[${index}].authority_grants`, `authority grant ${grantId} is duplicated`));
    }
    const grantClaims = rule.authority_grants.map((grant) => stableCanonicalJson({
      authority_kind: grant.authority_kind,
      authority_ref: grant.authority_ref,
      subject_binding: grant.subject_binding,
    }));
    if (new Set(grantClaims).size !== grantClaims.length) {
      issues.push(issue("OVERRIDE_GRANT_CLAIM_DUPLICATE", `$.override_rules[${index}].authority_grants`, "the same authority claim and subject binding must not appear under multiple grant IDs"));
    }
  });
  for (const state of ["contradictory", "unknown", "unresolved"]) {
    if (!policy.rules.human_decision_scope_states.includes(state)) {
      issues.push(issue("POLICY_HUMAN_STATE_COVERAGE", "$.rules.human_decision_scope_states", `scope state ${state} must fail closed to a human decision`));
    }
  }
  return sortedIssues(issues);
}

function admissionReasonState(policy, subject, observedSignals) {
  const reasonCodes = [];
  const blockers = [];
  const unresolvedScope = [];
  const acceptedEvidence = new Set(policy.rules.accepted_authority_evidence_statuses);
  const weakSignals = AUTHORITY_SIGNAL_NAMES.filter((name) => !acceptedEvidence.has(observedSignals[name].evidence_status));
  const configuredByPolicy = policy.rules.configured_epic_goal_ids.includes(subject.goal_id);

  if (observedSignals.configured_epic.value !== configuredByPolicy) {
    reasonCodes.push("CONFIGURED_EPIC_SIGNAL_CONTRADICTION");
    blockers.push("CONFIGURED_EPIC_SIGNAL_CONTRADICTION");
  }
  if (weakSignals.length > 0) {
    reasonCodes.push("ADMISSION_SIGNAL_INSUFFICIENT");
    blockers.push(...weakSignals.map((name) => `ADMISSION_SIGNAL_INSUFFICIENT:${name}`));
  }
  if (policy.rules.human_decision_scope_states.includes(observedSignals.scope_resolution.value)) {
    const code = `SCOPE_${observedSignals.scope_resolution.value.toUpperCase()}`;
    reasonCodes.push(code);
    blockers.push(code);
    unresolvedScope.push(observedSignals.scope_resolution.value);
  }

  if (blockers.length > 0) {
    return {
      computedDecision: "human_decision_required",
      reasonCodes: uniqueSorted(reasonCodes),
      blockers: uniqueSorted(blockers),
      unresolvedScope: uniqueSorted(unresolvedScope),
    };
  }

  if (configuredByPolicy) reasonCodes.push("CONFIGURED_EPIC");
  if (observedSignals.ordered_dependency.value) reasonCodes.push("ORDERED_DEPENDENCY");
  if (observedSignals.independent_publication_units.value) reasonCodes.push("INDEPENDENT_PUBLICATION_UNITS");
  if (
    observedSignals.acceptance_condition_count.value >= policy.rules.multi_boundary_threshold.acceptance_condition_count
    && observedSignals.scope_boundary_count.value >= policy.rules.multi_boundary_threshold.scope_boundary_count
  ) reasonCodes.push("MULTI_BOUNDARY_THRESHOLD");

  if (reasonCodes.length > 0) {
    return {
      computedDecision: "work_package_plan_required",
      reasonCodes: uniqueSorted(reasonCodes),
      blockers: [],
      unresolvedScope: [],
    };
  }
  return {
    computedDecision: "ordinary_execution_allowed",
    reasonCodes: ["SINGLE_BOUNDARY_ORDINARY_TASK"],
    blockers: [],
    unresolvedScope: [],
  };
}

export function deriveEpicAdmissionOverrideBasisDigest({
  subject,
  observed_signals: observedSignals,
  computed_decision: computedDecision,
  requested_decision: requestedDecision,
}) {
  return canonicalDigest({
    digest_domain: "ask_epic_admission_override_basis_v1",
    subject: deepClone(subject),
    observed_signals: deepClone(observedSignals),
    computed_decision: computedDecision,
    requested_decision: requestedDecision,
  });
}

const OVERRIDE_REQUEST_FIELDS = Object.freeze([
  "rule_id",
  "requested_decision",
  "reason",
  "authority_grant_id",
  "authority_ref",
  "authority_kind",
]);

function admissionEvaluationInputIssues({ policy, subject, observedSignals, overrideRequest, decisionRevision }) {
  const issues = [];
  const requestIsObject = overrideRequest !== null && typeof overrideRequest === "object" && !Array.isArray(overrideRequest);
  if (overrideRequest !== null && !requestIsObject) {
    issues.push(issue("SCHEMA_INVALID", "$.override_request", "override request must be an object or null"));
  }
  if (requestIsObject) {
    for (const key of Object.keys(overrideRequest)) {
      if (!OVERRIDE_REQUEST_FIELDS.includes(key)) {
        issues.push(issue("SCHEMA_INVALID", `$.override_request.${key}`, "override request contains an unknown field"));
      }
    }
  }

  const override = requestIsObject
    ? {
        state: "rejected",
        rule_id: overrideRequest.rule_id ?? null,
        requested_decision: overrideRequest.requested_decision ?? null,
        reason: overrideRequest.reason ?? null,
        authority_grant_id: overrideRequest.authority_grant_id ?? null,
        authority_ref: overrideRequest.authority_ref ?? null,
        authority_kind: overrideRequest.authority_kind ?? null,
      }
    : {
        state: "not_requested",
        rule_id: null,
        requested_decision: null,
        reason: null,
        authority_grant_id: null,
        authority_ref: null,
        authority_kind: null,
      };
  const probe = {
    schema_version: EPIC_ADMISSION_SCHEMA_VERSION,
    artifact_type: "epic_admission_decision",
    program: EPIC_ADMISSION_PROGRAM,
    decision_id: "EAD-INPUT-PREFLIGHT",
    decision_revision: decisionRevision,
    subject,
    policy_ref: policyRef(policy),
    observed_signals: observedSignals,
    computed_decision: "human_decision_required",
    effective_decision: "human_decision_required",
    reason_codes: ["ADMISSION_INPUT_PREFLIGHT"],
    unresolved_scope: [],
    blockers: ["ADMISSION_INPUT_PREFLIGHT"],
    override,
    digest_contract: {
      algorithm: "sha256",
      canonicalization: "sorted_key_canonical_json",
      excluded_field: "decision_digest",
    },
    decision_digest: `sha256:${"0".repeat(64)}`,
  };
  issues.push(...schemaIssues(probe, resolve(MODULE_ROOT, DEFAULT_PATHS.decisionSchema)));

  if (subject && typeof subject === "object" && !Array.isArray(subject) && typeof subject.branch === "string" && !subject.branch.trim()) {
    issues.push(issue("SCHEMA_INVALID", "$.subject.branch", "branch must contain non-whitespace text"));
  }
  if (observedSignals && typeof observedSignals === "object" && !Array.isArray(observedSignals)) {
    for (const [signalName, signalRecord] of Object.entries(observedSignals)) {
      if (
        signalRecord
        && typeof signalRecord === "object"
        && !Array.isArray(signalRecord)
        && typeof signalRecord.evidence_ref === "string"
        && !signalRecord.evidence_ref.trim()
      ) {
        issues.push(issue("ADMISSION_EVIDENCE_REF_INVALID", `$.observed_signals.${signalName}.evidence_ref`, "admission evidence references must contain non-whitespace authority text"));
      }
    }
  }
  return sortedIssues(issues.filter((entry, index, values) => values.findIndex((candidate) => (
    candidate.code === entry.code && candidate.path === entry.path && candidate.message === entry.message
  )) === index));
}

function resolveOverride(policy, subject, computedDecision, baseReasonCodes, request) {
  if (!request) {
    return {
      effectiveDecision: computedDecision,
      reasonCodes: baseReasonCodes,
      blockers: [],
      record: {
        state: "not_requested",
        rule_id: null,
        requested_decision: null,
        reason: null,
        authority_grant_id: null,
        authority_ref: null,
        authority_kind: null,
      },
    };
  }

  const blockers = [];
  const rule = policy.override_rules.find((candidate) => candidate.rule_id === request.rule_id);
  const grant = rule?.authority_grants.find((candidate) => candidate.grant_id === request.authority_grant_id);
  const expectedBasisDigest = deriveEpicAdmissionOverrideBasisDigest({
    subject,
    observed_signals: request.observed_signals,
    computed_decision: computedDecision,
    requested_decision: request.requested_decision,
  });
  if (!rule) blockers.push("OVERRIDE_POLICY_MISMATCH");
  if (!request.reason?.trim()) blockers.push("OVERRIDE_REASON_MISSING");
  if (rule && (
    !request.authority_grant_id?.trim()
    || !request.authority_ref?.trim()
    || !request.authority_kind?.trim()
    || !grant
    || grant.approval_status !== "approved"
    || grant.authority_kind !== request.authority_kind
    || grant.authority_ref !== request.authority_ref
    || !sameJson(grant.subject_binding, subject)
    || grant.admission_basis_digest !== expectedBasisDigest
  )) {
    blockers.push("OVERRIDE_AUTHORITY_INVALID");
  }
  if (rule && (rule.from_decision !== computedDecision || rule.to_decision !== request.requested_decision)) {
    blockers.push("OVERRIDE_TRANSITION_INVALID");
  }
  if (rule && (rule.may_weaken_required_gates || baseReasonCodes.some((code) => rule.non_overridable_reason_codes.includes(code)))) {
    blockers.push("OVERRIDE_AUTHORITY_BOUNDARY");
  }

  const record = {
    state: blockers.length === 0 ? "applied" : "rejected",
    rule_id: request.rule_id ?? null,
    requested_decision: request.requested_decision ?? null,
    reason: request.reason ?? null,
    authority_grant_id: request.authority_grant_id ?? null,
    authority_ref: request.authority_ref ?? null,
    authority_kind: request.authority_kind ?? null,
  };
  return blockers.length === 0
    ? {
        effectiveDecision: rule.to_decision,
        reasonCodes: uniqueSorted([...baseReasonCodes, "EPIC_ADMISSION_OVERRIDE_APPLIED"]),
        blockers: [],
        record,
      }
    : {
        effectiveDecision: "human_decision_required",
        reasonCodes: uniqueSorted([...baseReasonCodes, "EPIC_ADMISSION_OVERRIDE_REJECTED"]),
        blockers: uniqueSorted(blockers),
        record,
      };
}

export function evaluateEpicAdmission({
  policy,
  subject,
  observed_signals: observedSignals,
  override_request: overrideRequest = null,
  decision_revision: decisionRevision = 1,
}) {
  const policyIssues = validateEpicAdmissionPolicy(policy);
  if (policyIssues.length > 0) throw new Error(`epic admission policy is invalid: ${formatIssues(policyIssues)}`);
  const inputIssues = admissionEvaluationInputIssues({ policy, subject, observedSignals, overrideRequest, decisionRevision });
  if (inputIssues.length > 0) {
    const error = new Error(`epic admission input is invalid: ${formatIssues(inputIssues)}`);
    error.code = "EPIC_ADMISSION_INPUT_INVALID";
    error.issues = inputIssues;
    throw error;
  }
  const base = admissionReasonState(policy, subject, observedSignals);
  const override = resolveOverride(policy, subject, base.computedDecision, base.reasonCodes, overrideRequest
    ? { ...overrideRequest, observed_signals: observedSignals }
    : null);
  return sealEpicAdmissionDecision({
    decision_revision: decisionRevision,
    subject: deepClone(subject),
    policy_ref: policyRef(policy),
    observed_signals: deepClone(observedSignals),
    computed_decision: base.computedDecision,
    effective_decision: override.effectiveDecision,
    reason_codes: override.reasonCodes,
    unresolved_scope: base.unresolvedScope,
    blockers: uniqueSorted([...base.blockers, ...override.blockers]),
    override: override.record,
  });
}

export function validateEpicAdmissionDecision(decision, {
  policy,
  expectedSubject = null,
  schemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.decisionSchema),
  policySchemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.policySchema),
} = {}) {
  const issues = schemaIssues(decision, schemaPath);
  if (issues.length > 0) return sortedIssues(issues);
  const policyIssues = validateEpicAdmissionPolicy(policy, { schemaPath: policySchemaPath });
  if (policyIssues.length > 0) {
    return sortedIssues([issue("POLICY_INVALID", "$.policy_ref", formatIssues(policyIssues))]);
  }

  const resealed = sealEpicAdmissionDecision(decision);
  if (decision.decision_id !== resealed.decision_id) {
    issues.push(issue("DECISION_IDENTITY_MISMATCH", "$.decision_id", "decision_id does not match the deterministic subject identity"));
  }
  if (decision.decision_digest !== resealed.decision_digest) {
    issues.push(issue("DECISION_DIGEST_MISMATCH", "$.decision_digest", "decision_digest does not match canonical decision content"));
  }
  if (!sameJson(decision.policy_ref, policyRef(policy))) {
    issues.push(issue("POLICY_BINDING_MISMATCH", "$.policy_ref", "decision is not bound to the supplied current policy"));
  }
  if (expectedSubject && !sameJson(decision.subject, expectedSubject)) {
    issues.push(issue("DECISION_SUBJECT_MISMATCH", "$.subject", "decision subject does not match the caller-supplied repository and goal context"));
  }
  for (const [signalName, signalRecord] of Object.entries(decision.observed_signals)) {
    if (!signalRecord.evidence_ref?.trim()) {
      issues.push(issue("ADMISSION_EVIDENCE_REF_INVALID", `$.observed_signals.${signalName}.evidence_ref`, "admission evidence references must contain non-whitespace authority text"));
    }
  }

  const request = decision.override.state === "not_requested" ? null : {
    rule_id: decision.override.rule_id,
    requested_decision: decision.override.requested_decision,
    reason: decision.override.reason,
    authority_grant_id: decision.override.authority_grant_id,
    authority_ref: decision.override.authority_ref,
    authority_kind: decision.override.authority_kind,
  };
  let recomputed;
  try {
    recomputed = evaluateEpicAdmission({
      policy,
      subject: decision.subject,
      observed_signals: decision.observed_signals,
      override_request: request,
      decision_revision: decision.decision_revision,
    });
  } catch (error) {
    if (error.code !== "EPIC_ADMISSION_INPUT_INVALID") throw error;
    for (const inputIssue of error.issues) {
      if (!issues.some((entry) => entry.code === inputIssue.code && entry.path === inputIssue.path)) issues.push(inputIssue);
    }
    return sortedIssues(issues);
  }

  if (decision.override.state === "applied") {
    if (!decision.override.reason?.trim()) issues.push(issue("OVERRIDE_REASON_MISSING", "$.override.reason", "applied override requires an explicit reason"));
    const rule = policy.override_rules.find((candidate) => candidate.rule_id === decision.override.rule_id);
    const grant = rule?.authority_grants.find((candidate) => candidate.grant_id === decision.override.authority_grant_id);
    if (!rule) issues.push(issue("OVERRIDE_POLICY_MISMATCH", "$.override.rule_id", "applied override does not reference the current policy"));
    if (rule && (
      !decision.override.authority_grant_id?.trim()
      || !decision.override.authority_ref?.trim()
      || !grant
      || grant.approval_status !== "approved"
      || grant.authority_kind !== decision.override.authority_kind
    || grant.authority_ref !== decision.override.authority_ref
    || !sameJson(grant.subject_binding, decision.subject)
      || grant.admission_basis_digest !== deriveEpicAdmissionOverrideBasisDigest({
        subject: decision.subject,
        observed_signals: decision.observed_signals,
        computed_decision: decision.computed_decision,
        requested_decision: decision.override.requested_decision,
      })
    )) {
      issues.push(issue("OVERRIDE_AUTHORITY_INVALID", "$.override.authority_grant_id", "applied override lacks an exact approved policy grant bound to this subject"));
    }
    if (rule?.may_weaken_required_gates || rule?.non_overridable_reason_codes.some((code) => decision.reason_codes.includes(code))) {
      issues.push(issue("OVERRIDE_AUTHORITY_BOUNDARY", "$.override", "override would weaken a non-overridable authority boundary"));
    }
  }
  if (decision.override.state === "not_requested" && [
    decision.override.rule_id,
    decision.override.requested_decision,
    decision.override.reason,
    decision.override.authority_grant_id,
    decision.override.authority_ref,
    decision.override.authority_kind,
  ].some((value) => value !== null)) {
    issues.push(issue("OVERRIDE_NOT_REQUESTED_PAYLOAD", "$.override", "not_requested override state requires every request and authority field to be null"));
  }

  if (decision.computed_decision !== recomputed.computed_decision) {
    const nonAiSignalsAreOrdinary = admissionReasonState(policy, decision.subject, {
      ...decision.observed_signals,
      ai_estimated_complexity: { value: "unknown", evidence_status: "unknown", evidence_ref: "ignored-by-policy" },
    }).computedDecision === "ordinary_execution_allowed";
    const claimsAiAuthority = decision.reason_codes.includes("AI_ESTIMATED_COMPLEXITY");
    issues.push(issue(
      decision.computed_decision === "work_package_plan_required" && nonAiSignalsAreOrdinary && claimsAiAuthority ? "AI_ESTIMATE_SOLE_AUTHORITY" : "ADMISSION_DECISION_MISMATCH",
      "$.computed_decision",
      "stored computed decision does not match deterministic policy evaluation",
    ));
  }
  if (
    decision.effective_decision !== recomputed.effective_decision
    || decision.override.state !== recomputed.override.state
    || !sameJson(decision.reason_codes, recomputed.reason_codes)
    || !sameJson(decision.unresolved_scope, recomputed.unresolved_scope)
    || !sameJson(decision.blockers, recomputed.blockers)
  ) {
    issues.push(issue("DECISION_RECOMPUTATION_MISMATCH", "$", "stored admission result does not match deterministic recomputation"));
  }
  return sortedIssues(issues);
}

function normalizeArtifactRefs(references) {
  return [...(references ?? [])].sort((left, right) => compareAscii(tupleKey(left), tupleKey(right)));
}

function normalizeScopeEntries(entries) {
  return [...(entries ?? [])].sort((left, right) => compareAscii(
    `${left.kind}\0${left.value}\0${left.match}`,
    `${right.kind}\0${right.value}\0${right.match}`,
  ));
}

function normalizeContextDraft(value) {
  const normalized = deepClone(value);
  normalized.upstream_artifacts = sortByKey(normalized.upstream_artifacts ?? [], "artifact_id").map((artifact) => ({
    ...artifact,
    item_ids: uniqueSorted(artifact.item_ids ?? []),
  }));
  normalized.required_full_checkpoint_ids = uniqueSorted(normalized.required_full_checkpoint_ids ?? []);
  normalized.non_overridable_gates = sortByKey(normalized.non_overridable_gates ?? [], "verification_id");
  normalized.known_blockers = sortByKey(normalized.known_blockers ?? [], "blocker_id");
  normalized.required_human_decisions = sortByKey(normalized.required_human_decisions ?? [], "decision_id");
  normalized.required_human_approvals = sortByKey(normalized.required_human_approvals ?? [], "approval_id");
  return normalized;
}

export function deriveWorkPackagePlanId({ goal_id: goalId, repository, upstream_refs: upstreamRefs }) {
  return derivedStableId("WPP", {
    program: WORK_PACKAGE_PLAN_PROGRAM,
    goal_id: goalId,
    repository_id: repository.repository_id,
    upstream_artifact_ids: uniqueSorted((upstreamRefs ?? []).map((reference) => reference.artifact_id)),
  });
}

export function sealWorkPackagePlanValidationContext(draft) {
  const normalized = normalizeContextDraft(withoutField(withoutField(draft, "context_id"), "context_digest"));
  normalized.schema_version = WORK_PACKAGE_PLAN_SCHEMA_VERSION;
  normalized.artifact_type = "work_package_plan_validation_context";
  normalized.program = WORK_PACKAGE_PLAN_PROGRAM;
  normalized.context_id = derivedStableId("WPPC", {
    program: normalized.program,
    context_key: normalized.context_key,
    repository_id: normalized.repository?.repository_id,
    goal_id: normalized.goal_id,
  });
  normalized.digest_contract = {
    algorithm: "sha256",
    canonicalization: "sorted_key_canonical_json",
    excluded_field: "context_digest",
  };
  normalized.context_digest = canonicalDigest(normalized);
  return normalized;
}

function normalizePlanDraft(value) {
  const normalized = deepClone(value);
  normalized.upstream_refs = normalizeArtifactRefs(normalized.upstream_refs);
  normalized.packages = (normalized.packages ?? []).map((workPackage) => ({
    ...workPackage,
    upstream_refs: normalizeArtifactRefs(workPackage.upstream_refs),
    depends_on_package_ids: uniqueSorted(workPackage.depends_on_package_ids ?? []),
    dependencies: uniqueSorted(workPackage.dependencies ?? []),
    allowed_scope: normalizeScopeEntries(workPackage.allowed_scope),
    forbidden_scope: normalizeScopeEntries(workPackage.forbidden_scope),
    expected_artifacts: sortByKey(workPackage.expected_artifacts ?? [], "artifact_id"),
    expected_evidence_ids: uniqueSorted(workPackage.expected_evidence_ids ?? []),
    stop_conditions: sortByKey(workPackage.stop_conditions ?? [], "code"),
  }));
  normalized.acceptance_ownership = [...(normalized.acceptance_ownership ?? [])]
    .map((ownership) => ({ ...ownership, owner_package_ids: uniqueSorted(ownership.owner_package_ids ?? []) }))
    .sort((left, right) => compareAscii(tupleKey(left.acceptance_ref), tupleKey(right.acceptance_ref)));
  if (normalized.topology) {
    normalized.topology.publication_units = sortByKey(normalized.topology.publication_units ?? [], "unit_id").map((unit) => ({
      ...unit,
      artifact_ids: uniqueSorted(unit.artifact_ids ?? []),
    }));
    normalized.topology.review_units = sortByKey(normalized.topology.review_units ?? [], "unit_id").map((unit) => ({
      ...unit,
      artifact_ids: uniqueSorted(unit.artifact_ids ?? []),
    }));
  }
  if (normalized.verification) {
    normalized.verification.steps = sortByKey(normalized.verification.steps ?? [], "verification_id");
    normalized.verification.focused_cadence = sortByKey(normalized.verification.focused_cadence ?? [], "after_package_id").map((entry) => ({
      ...entry,
      verification_ids: uniqueSorted(entry.verification_ids ?? []),
    }));
    normalized.verification.full_gate_checkpoints = sortByKey(normalized.verification.full_gate_checkpoints ?? [], "checkpoint_id").map((entry) => ({
      ...entry,
      verification_ids: uniqueSorted(entry.verification_ids ?? []),
    }));
  }
  normalized.unresolved_decisions = sortByKey(normalized.unresolved_decisions ?? [], "decision_id");
  normalized.human_approvals = sortByKey(normalized.human_approvals ?? [], "approval_id");
  normalized.blockers = sortByKey(normalized.blockers ?? [], "blocker_id");
  return normalized;
}

export function sealWorkPackagePlan(draft) {
  const normalized = normalizePlanDraft(withoutField(withoutField(draft, "plan_id"), "plan_digest"));
  normalized.schema_version = WORK_PACKAGE_PLAN_SCHEMA_VERSION;
  normalized.artifact_type = "work_package_plan";
  normalized.program = WORK_PACKAGE_PLAN_PROGRAM;
  normalized.plan_id = deriveWorkPackagePlanId(normalized);
  normalized.digest_contract = {
    algorithm: "sha256",
    canonicalization: "sorted_key_canonical_json",
    excluded_field: "plan_digest",
  };
  normalized.plan_digest = canonicalDigest(normalized);
  return normalized;
}

export function deriveWorkPackagePlanContentDigest(plan) {
  const content = deepClone(plan);
  delete content.plan_digest;
  if (content.validation_context_ref) delete content.validation_context_ref.context_digest;
  return canonicalDigest(content);
}

function storedDigestMatches(value, digestField) {
  const content = deepClone(value);
  const stored = content[digestField];
  delete content[digestField];
  return stored === canonicalDigest(content);
}

function rawFileDigest(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveRevision(value) {
  return Number.isInteger(value) && value >= 1;
}

function isDigest(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isPlanReference(value) {
  return isPlainRecord(value)
    && isNonEmptyString(value.plan_id)
    && isPositiveRevision(value.plan_revision)
    && isDigest(value.plan_digest);
}

function isContextReference(value) {
  return isPlainRecord(value)
    && isNonEmptyString(value.context_id)
    && isPositiveRevision(value.context_revision)
    && isDigest(value.context_digest);
}

function isCurrentPlanReference(value, { requireContentDigest = false } = {}) {
  return isPlainRecord(value)
    && isNonEmptyString(value.plan_id)
    && isPositiveRevision(value.plan_revision)
    && isNonEmptyString(value.lifecycle_state)
    && (!requireContentDigest || isDigest(value.plan_content_digest));
}

function isHistoricalPlanArtifact(value, { requireSupersedes = false } = {}) {
  return isPlainRecord(value)
    && isNonEmptyString(value.plan_id)
    && isPositiveRevision(value.plan_revision)
    && isDigest(value.plan_digest)
    && isNonEmptyString(value.lifecycle_state)
    && isContextReference(value.validation_context_ref)
    && (!requireSupersedes || isPlanReference(value.supersedes_plan_ref));
}

function isHistoricalContextArtifact(value, { requireSupersedes = false } = {}) {
  return isPlainRecord(value)
    && isNonEmptyString(value.context_id)
    && isPositiveRevision(value.context_revision)
    && isDigest(value.context_digest)
    && isCurrentPlanReference(value.current_plan_ref, { requireContentDigest: requireSupersedes })
    && (!requireSupersedes || (
      isPlanReference(value.supersedes_plan_ref)
      && isContextReference(value.supersedes_context_ref)
    ));
}

function historicalArtifactShapeIssues(artifacts) {
  const checks = [
    ["firstContext", "HISTORICAL_R1_CONTEXT_INVALID", isHistoricalContextArtifact(artifacts.firstContext)],
    ["firstPlan", "HISTORICAL_R1_PLAN_INVALID", isHistoricalPlanArtifact(artifacts.firstPlan)],
    ["previousContext", "HISTORICAL_R2_CONTEXT_INVALID", isHistoricalContextArtifact(artifacts.previousContext, { requireSupersedes: true })],
    ["previousPlan", "HISTORICAL_R2_PLAN_INVALID", isHistoricalPlanArtifact(artifacts.previousPlan, { requireSupersedes: true })],
  ];
  return checks
    .filter(([, , valid]) => !valid)
    .map(([key, code]) => issue(
      code,
      `$paths.${key}`,
      `${key} must be a structured historical plan or validation-context artifact before lineage and digest validation`,
    ));
}

function historicalArtifactIssues(paths, artifacts) {
  const shapeIssues = historicalArtifactShapeIssues(artifacts);
  if (shapeIssues.length > 0) return sortedIssues(shapeIssues);
  const issues = [];
  for (const [key, pin] of Object.entries(HISTORICAL_ARTIFACT_PINS)) {
    const artifact = artifacts[key];
    const revision = key.startsWith("first") ? "R1" : "R2";
    const kind = key.endsWith("Plan") ? "PLAN" : "CONTEXT";
    const prefix = `HISTORICAL_${revision}_${kind}`;
    const content = deepClone(artifact);
    const storedDigest = content[pin.digestField];
    delete content[pin.digestField];
    const computedDigest = canonicalDigest(content);
    if (storedDigest !== pin.canonicalDigest || computedDigest !== pin.canonicalDigest) {
      issues.push(issue(
        `${prefix}_DIGEST_MISMATCH`,
        `$paths.${key}`,
        `${pin.label} must preserve its pinned stored and recomputed canonical digest`,
      ));
    }
    if (rawFileDigest(paths[key]) !== pin.rawDigest) {
      issues.push(issue(
        `${prefix}_BYTES_MISMATCH`,
        `$paths.${key}`,
        `${pin.label} must preserve its pinned repository bytes`,
      ));
    }
  }

  const { firstContext, firstPlan, previousContext, previousPlan } = artifacts;
  const firstPlanRef = {
    plan_id: firstPlan.plan_id,
    plan_revision: firstPlan.plan_revision,
    plan_digest: firstPlan.plan_digest,
  };
  const firstContextRef = contextRef(firstContext);
  if (!sameJson(firstPlan.validation_context_ref, firstContextRef)) {
    issues.push(issue("HISTORICAL_R1_PLAN_CONTEXT_BINDING_MISMATCH", "$paths.firstPlan", "r1 plan must bind the exact pinned r1 context"));
  }
  if (
    firstContext.current_plan_ref?.plan_id !== firstPlan.plan_id
    || firstContext.current_plan_ref?.plan_revision !== firstPlan.plan_revision
    || firstContext.current_plan_ref?.lifecycle_state !== firstPlan.lifecycle_state
  ) {
    issues.push(issue("HISTORICAL_R1_CONTEXT_PLAN_BINDING_MISMATCH", "$paths.firstContext", "r1 context must name the exact pinned r1 plan revision and lifecycle state"));
  }

  const previousPlanRef = {
    plan_id: previousPlan.plan_id,
    plan_revision: previousPlan.plan_revision,
    plan_digest: previousPlan.plan_digest,
  };
  if (!sameJson(previousPlan.validation_context_ref, contextRef(previousContext))) {
    issues.push(issue("HISTORICAL_R2_PLAN_CONTEXT_BINDING_MISMATCH", "$paths.previousPlan", "r2 plan must bind the exact pinned r2 context"));
  }
  if (
    previousContext.current_plan_ref?.plan_id !== previousPlan.plan_id
    || previousContext.current_plan_ref?.plan_revision !== previousPlan.plan_revision
    || previousContext.current_plan_ref?.lifecycle_state !== previousPlan.lifecycle_state
    || previousContext.current_plan_ref?.plan_content_digest !== deriveWorkPackagePlanContentDigest(previousPlan)
  ) {
    issues.push(issue("HISTORICAL_R2_CONTEXT_PLAN_BINDING_MISMATCH", "$paths.previousContext", "r2 context must bind the exact pinned r2 plan meaning"));
  }
  if (
    !sameJson(previousPlan.supersedes_plan_ref, firstPlanRef)
    || previousPlan.plan_id !== firstPlan.plan_id
    || previousPlan.plan_revision !== firstPlan.plan_revision + 1
  ) {
    issues.push(issue("HISTORICAL_R2_PLAN_LINEAGE_MISMATCH", "$paths.previousPlan", "r2 plan must exactly supersede the pinned r1 plan"));
  }
  if (
    !sameJson(previousContext.supersedes_plan_ref, firstPlanRef)
    || !sameJson(previousContext.supersedes_context_ref, firstContextRef)
    || previousContext.context_id !== firstContext.context_id
    || previousContext.context_revision !== firstContext.context_revision + 1
    || !sameJson(previousContext.supersedes_plan_ref, previousPlan.supersedes_plan_ref)
  ) {
    issues.push(issue("HISTORICAL_R2_CONTEXT_LINEAGE_MISMATCH", "$paths.previousContext", "r2 context must exactly supersede the pinned r1 plan and context"));
  }
  if (previousPlanRef.plan_revision !== previousContext.current_plan_ref?.plan_revision) {
    issues.push(issue("HISTORICAL_R2_PAIR_REVISION_MISMATCH", "$paths.previousPlan", "r2 plan and context must describe the same plan revision"));
  }
  return sortedIssues(issues);
}

function duplicateIds(values, key) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    const id = value[key];
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort(compareAscii);
}

export function validateWorkPackagePlanValidationContext(context, {
  policy,
  decision,
  schemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.contextSchema),
  policySchemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.policySchema),
  decisionSchemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.decisionSchema),
} = {}) {
  const issues = schemaIssues(context, schemaPath);
  if (issues.length > 0) return sortedIssues(issues);
  if (policy !== undefined) {
    const policyIssues = validateEpicAdmissionPolicy(policy, { schemaPath: policySchemaPath });
    if (policyIssues.length > 0) {
      return sortedIssues([issue("POLICY_INVALID", "$.current_policy_ref", formatIssues(policyIssues))]);
    }
  }
  if (decision !== undefined) {
    const decisionIssues = schemaIssues(decision, decisionSchemaPath);
    if (decisionIssues.length > 0) {
      return sortedIssues([issue("ADMISSION_DECISION_INVALID", "$.current_admission_decision_ref", formatIssues(decisionIssues))]);
    }
  }

  const resealed = sealWorkPackagePlanValidationContext(context);
  if (context.context_id !== resealed.context_id) {
    issues.push(issue("CONTEXT_IDENTITY_MISMATCH", "$.context_id", "context_id does not match the deterministic authority context identity"));
  }
  if (context.context_digest !== resealed.context_digest) {
    issues.push(issue("CONTEXT_DIGEST_MISMATCH", "$.context_digest", "context_digest does not match canonical context content"));
  }
  if (!sameJson(withoutField(withoutField(context, "context_id"), "context_digest"), withoutField(withoutField(resealed, "context_id"), "context_digest"))) {
    issues.push(issue("CONTEXT_NON_CANONICAL", "$", "validation context set-like fields are not in canonical order"));
  }
  if (policy && !sameJson(context.current_policy_ref, policyRef(policy))) {
    issues.push(issue("CONTEXT_POLICY_MISMATCH", "$.current_policy_ref", "validation context does not bind the supplied current policy"));
  }
  if (decision && !sameJson(context.current_admission_decision_ref, decisionRef(decision))) {
    issues.push(issue("CONTEXT_DECISION_MISMATCH", "$.current_admission_decision_ref", "validation context does not bind the supplied current admission decision"));
  }
  if (decision && (
    context.goal_id !== decision.subject.goal_id
    || context.repository.repository_id !== decision.subject.repository_id
    || context.repository.base_commit !== decision.subject.base_commit
    || context.repository.base_tree !== decision.subject.base_tree
    || context.repository.branch !== decision.subject.branch
  )) {
    issues.push(issue("CONTEXT_SUBJECT_MISMATCH", "$.repository", "validation context target differs from the admission decision subject"));
  }
  if (context.context_revision === 1 && (
    context.supersedes_context_ref
    || context.supersedes_plan_ref
    || context.revision_reason
  )) {
    issues.push(issue("REVISION_LINEAGE_UNEXPECTED", "$.supersedes_context_ref", "context revision 1 cannot claim a predecessor or revision reason"));
  }

  for (const [collection, key, code] of [
    [context.upstream_artifacts, "artifact_id", "UPSTREAM_ARTIFACT_DUPLICATE"],
    [context.known_blockers, "blocker_id", "CONTEXT_BLOCKER_DUPLICATE"],
    [context.required_human_decisions, "decision_id", "CONTEXT_HUMAN_DECISION_DUPLICATE"],
    [context.required_human_approvals, "approval_id", "CONTEXT_HUMAN_APPROVAL_DUPLICATE"],
    [context.non_overridable_gates, "verification_id", "CONTEXT_GATE_DUPLICATE"],
  ]) {
    for (const id of duplicateIds(collection, key)) issues.push(issue(code, "$", `${key} ${id} is duplicated`));
  }
  return sortedIssues(issues);
}

function validRepositoryPath(value) {
  if (!value || !/^[A-Za-z0-9._-][A-Za-z0-9._/-]*$/.test(value) || value.startsWith("/") || value.endsWith("/") || value.includes("//")) return false;
  return !value.split("/").some((part) => part === "." || part === "..");
}

function pathContains(parent, child) {
  return child === parent || child.startsWith(`${parent}/`);
}

function pathScopeContains(scope, path) {
  if (scope.kind !== "repository_path") return false;
  return scope.match === "exact" ? scope.value === path : pathContains(scope.value, path);
}

function scopesOverlap(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "repository_path") return left.value === right.value;
  if (left.value === right.value) return true;
  if (left.match === "subtree" && pathContains(left.value, right.value)) return true;
  return right.match === "subtree" && pathContains(right.value, left.value);
}

function cyclePath(packagesById) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(packageId) {
    if (visiting.has(packageId)) return [...stack.slice(stack.indexOf(packageId)), packageId];
    if (visited.has(packageId)) return null;
    visiting.add(packageId);
    stack.push(packageId);
    for (const dependencyId of packagesById.get(packageId)?.depends_on_package_ids ?? []) {
      if (!packagesById.has(dependencyId)) continue;
      const cycle = visit(dependencyId);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(packageId);
    visited.add(packageId);
    return null;
  }
  for (const packageId of packagesById.keys()) {
    const cycle = visit(packageId);
    if (cycle) return cycle;
  }
  return null;
}

export function deriveAcceptanceRegistryDigest(references) {
  const normalizedReferences = [...(references ?? [])]
    .map((reference) => ({
      artifact_id: reference.artifact_id,
      item_id: reference.item_id,
      observed_revision: reference.observed_revision,
    }))
    .sort((left, right) => compareAscii(tupleKey(left), tupleKey(right)));
  return canonicalDigest({
    digest_domain: "ask_epic_admission_acceptance_registry_v1",
    acceptance_refs: normalizedReferences,
  });
}

function expectedAcceptanceRefs(context) {
  const references = [];
  for (const artifact of context.upstream_artifacts) {
    for (const itemId of artifact.item_ids) {
      references.push({
        artifact_id: artifact.artifact_id,
        item_id: itemId,
        observed_revision: artifact.revision,
      });
    }
  }
  return references.sort((left, right) => compareAscii(tupleKey(left), tupleKey(right)));
}

export function projectWorkPackagePlanEntryToLifecycleArtifact(workPackage) {
  return {
    id: workPackage.artifact_id,
    type: "work_package",
    revision: workPackage.revision,
    upstream_refs: normalizeArtifactRefs(workPackage.upstream_refs ?? []),
    fields: {
      allowed_scope: deepClone(workPackage.allowed_scope ?? []),
      forbidden_scope: deepClone(workPackage.forbidden_scope ?? []),
      ordered_tasks: deepClone(workPackage.ordered_tasks ?? []),
      dependencies: uniqueSorted(workPackage.dependencies ?? []),
      stop_conditions: deepClone(workPackage.stop_conditions ?? []),
      evidence_expectations: uniqueSorted(workPackage.expected_evidence_ids ?? []),
    },
  };
}

export function validateWorkPackageLifecycleProjection(workPackage, lifecycleArtifact) {
  const expected = projectWorkPackagePlanEntryToLifecycleArtifact(workPackage);
  return sameJson(lifecycleArtifact, expected)
    ? []
    : [issue("LIFECYCLE_PROJECTION_MISMATCH", "$lifecycleArtifact", `lifecycle Work Package projection ${expected.id} differs from the accepted plan package` )];
}

function allExpectedArtifactIds(packages) {
  return uniqueSorted(packages.flatMap((workPackage) => workPackage.expected_artifacts.map((artifact) => artifact.artifact_id)));
}

function allExpectedArtifactPaths(packages) {
  return uniqueSorted(packages.flatMap((workPackage) => workPackage.expected_artifacts.map((artifact) => artifact.path)));
}

export function validateObservedWorkPackageArtifacts(plan, observedPaths) {
  if (!Array.isArray(observedPaths)) return [issue("OBSERVED_ARTIFACT_PATHS_INVALID", "$observedPaths", "observed artifact paths must be an array")];
  const issues = [];
  const expectedPaths = allExpectedArtifactPaths(plan.packages ?? []);
  const normalizedObservedPaths = uniqueSorted(observedPaths);
  for (const path of normalizedObservedPaths) {
    if (!validRepositoryPath(path)) issues.push(issue("OBSERVED_ARTIFACT_PATH_INVALID", "$observedPaths", `observed artifact path ${path} is not normalized and repository-relative`));
    if (!expectedPaths.includes(path)) issues.push(issue("OBSERVED_ARTIFACT_UNPLANNED", "$observedPaths", `observed artifact path ${path} is absent from the accepted plan`));
  }
  for (const path of expectedPaths) {
    if (!normalizedObservedPaths.includes(path)) issues.push(issue("OBSERVED_ARTIFACT_MISSING", "$observedPaths", `planned artifact path ${path} is absent from observed publication content`));
  }
  return sortedIssues(issues);
}

function exactArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateWorkPackagePlan(plan, {
  policy,
  decision,
  context,
  previousPlan = null,
  previousContext = null,
  planSchemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.planSchema),
  contextSchemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.contextSchema),
  policySchemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.policySchema),
  decisionSchemaPath = resolve(MODULE_ROOT, DEFAULT_PATHS.decisionSchema),
} = {}) {
  const issues = schemaIssues(plan, planSchemaPath);
  if (issues.length > 0) return sortedIssues(issues);

  const policyIssues = validateEpicAdmissionPolicy(policy, { schemaPath: policySchemaPath });
  if (policyIssues.length > 0) {
    return sortedIssues([issue("POLICY_INVALID", "$.admission_decision_ref", formatIssues(policyIssues))]);
  }
  const initialDecisionIssues = validateEpicAdmissionDecision(decision, {
    policy,
    schemaPath: decisionSchemaPath,
    policySchemaPath,
  });
  if (initialDecisionIssues.length > 0) {
    return sortedIssues([issue("ADMISSION_DECISION_INVALID", "$.admission_decision_ref", formatIssues(initialDecisionIssues))]);
  }
  const contextIssues = validateWorkPackagePlanValidationContext(context, {
    policy,
    decision,
    schemaPath: contextSchemaPath,
    policySchemaPath,
    decisionSchemaPath,
  });
  if (contextIssues.length > 0) {
    return sortedIssues([issue("VALIDATION_CONTEXT_INVALID", "$.validation_context_ref", formatIssues(contextIssues))]);
  }
  const decisionIssues = validateEpicAdmissionDecision(decision, {
    policy,
    schemaPath: decisionSchemaPath,
    policySchemaPath,
    expectedSubject: {
      repository_id: context.repository.repository_id,
      goal_id: context.goal_id,
      task_id: decision.subject.task_id,
      base_commit: context.repository.base_commit,
      base_tree: context.repository.base_tree,
      branch: context.repository.branch,
    },
  });
  if (decisionIssues.length > 0) {
    return sortedIssues([issue("ADMISSION_DECISION_INVALID", "$.admission_decision_ref", formatIssues(decisionIssues))]);
  }
  if (
    plan.plan_revision > 1
    && previousPlan
    && previousContext
    && (
      !isHistoricalPlanArtifact(previousPlan, { requireSupersedes: true })
      || !isHistoricalContextArtifact(previousContext, { requireSupersedes: true })
    )
  ) {
    return sortedIssues([issue(
      "PREVIOUS_REVISION_INVALID",
      "$.supersedes_plan_ref",
      "the supplied previous plan and validation context must be structured artifacts before lineage and digest validation",
    )]);
  }

  const resealed = sealWorkPackagePlan(plan);
  if (plan.plan_id !== resealed.plan_id) {
    issues.push(issue("PLAN_IDENTITY_MISMATCH", "$.plan_id", "plan_id does not match repository, goal, and upstream identities"));
  }
  if (plan.plan_digest !== resealed.plan_digest) {
    issues.push(issue("PLAN_DIGEST_MISMATCH", "$.plan_digest", "plan_digest does not match canonical plan content"));
  }
  if (!sameJson(withoutField(withoutField(plan, "plan_id"), "plan_digest"), withoutField(withoutField(resealed, "plan_id"), "plan_digest"))) {
    issues.push(issue("PLAN_NON_CANONICAL", "$", "plan set-like fields are not in canonical order"));
  }
  if (!sameJson(plan.validation_context_ref, contextRef(context))) {
    issues.push(issue("PLAN_CONTEXT_BINDING_MISMATCH", "$.validation_context_ref", "plan is not bound to the supplied current validation context"));
  }
  if (!sameJson(plan.admission_decision_ref, decisionRef(decision))) {
    issues.push(issue("PLAN_ADMISSION_BINDING_MISMATCH", "$.admission_decision_ref", "plan is not bound to the supplied current admission decision"));
  }
  if (!sameJson(plan.repository, context.repository) || plan.goal_id !== context.goal_id) {
    issues.push(issue("PLAN_REPOSITORY_MISMATCH", "$.repository", "plan repository or goal differs from current validation context"));
  }
  if (
    context.current_plan_ref.plan_id !== plan.plan_id
    || context.current_plan_ref.plan_revision !== plan.plan_revision
    || context.current_plan_ref.lifecycle_state !== plan.lifecycle_state
  ) {
    issues.push(issue("PLAN_STALE", "$.plan_revision", "plan is not the current revision and lifecycle state named by the trusted context"));
  }
  if (context.current_plan_ref.plan_content_digest !== deriveWorkPackagePlanContentDigest(plan)) {
    issues.push(issue("PLAN_CONTENT_BINDING_MISMATCH", "$.plan_digest", "plan content differs from the exact content digest named by the trusted current context"));
  }
  if (context.context_revision !== plan.plan_revision) {
    issues.push(issue("PLAN_CONTEXT_REVISION_MISMATCH", "$.validation_context_ref", "current plan and validation context must advance as one paired revision"));
  }

  if (plan.plan_revision > 1) {
    if (!previousPlan || !previousContext) {
      issues.push(issue("PREVIOUS_REVISION_REQUIRED", "$.supersedes_plan_ref", "a revised plan requires the exact previous plan and context for lineage validation"));
    } else {
      if (!storedDigestMatches(previousPlan, "plan_digest")) issues.push(issue("PREVIOUS_PLAN_DIGEST_MISMATCH", "$.supersedes_plan_ref", "superseded plan bytes do not match their stored digest"));
      if (!storedDigestMatches(previousContext, "context_digest")) issues.push(issue("PREVIOUS_CONTEXT_DIGEST_MISMATCH", "$.supersedes_context_ref", "superseded context bytes do not match their stored digest"));
      if (previousContext.current_plan_ref?.plan_content_digest && previousContext.current_plan_ref.plan_content_digest !== deriveWorkPackagePlanContentDigest(previousPlan)) {
        issues.push(issue("PREVIOUS_PLAN_CONTENT_BINDING_MISMATCH", "$.supersedes_plan_ref", "superseded plan content differs from its trusted predecessor context"));
      }
      if (previousPlan.validation_context_ref && !sameJson(previousPlan.validation_context_ref, contextRef(previousContext))) {
        issues.push(issue("PREVIOUS_PLAN_CONTEXT_BINDING_MISMATCH", "$.supersedes_plan_ref", "superseded plan does not bind the supplied predecessor context"));
      }
      if (
        previousContext.current_plan_ref?.plan_id !== previousPlan.plan_id
        || previousContext.current_plan_ref?.plan_revision !== previousPlan.plan_revision
        || previousContext.current_plan_ref?.lifecycle_state !== previousPlan.lifecycle_state
      ) {
        issues.push(issue("PREVIOUS_PLAN_STALE", "$.supersedes_plan_ref", "superseded plan is not the plan revision/state named by its predecessor context"));
      }
      const expectedPlanRef = {
        plan_id: previousPlan.plan_id,
        plan_revision: previousPlan.plan_revision,
        plan_digest: previousPlan.plan_digest,
      };
      const expectedContextRef = {
        context_id: previousContext.context_id,
        context_revision: previousContext.context_revision,
        context_digest: previousContext.context_digest,
      };
      if (!sameJson(plan.supersedes_plan_ref, expectedPlanRef) || previousPlan.plan_id !== plan.plan_id || previousPlan.plan_revision + 1 !== plan.plan_revision) {
        issues.push(issue("PLAN_REVISION_LINEAGE_MISMATCH", "$.supersedes_plan_ref", "plan revision does not exactly supersede the supplied immediately previous stable plan"));
      }
      if (!sameJson(context.supersedes_plan_ref, expectedPlanRef) || !sameJson(context.supersedes_plan_ref, plan.supersedes_plan_ref)) {
        issues.push(issue("CONTEXT_PREVIOUS_PLAN_BINDING_MISMATCH", "$.supersedes_plan_ref", "trusted current context does not bind the exact plan predecessor claimed by the current plan"));
      }
      if (!sameJson(context.supersedes_context_ref, expectedContextRef) || previousContext.context_id !== context.context_id || previousContext.context_revision + 1 !== context.context_revision) {
        issues.push(issue("CONTEXT_REVISION_LINEAGE_MISMATCH", "$.supersedes_context_ref", "context revision does not exactly supersede the supplied immediately previous stable context"));
      }
    }
  } else if (
    plan.supersedes_plan_ref
    || plan.revision_reason
    || context.supersedes_context_ref
    || context.supersedes_plan_ref
    || context.revision_reason
  ) {
    issues.push(issue("REVISION_LINEAGE_UNEXPECTED", "$.supersedes_plan_ref", "revision 1 cannot claim a superseded predecessor"));
  }

  const expectedUpstreamRefs = context.upstream_artifacts.map((artifact) => ({
    artifact_id: artifact.artifact_id,
    observed_revision: artifact.revision,
  })).sort((left, right) => compareAscii(tupleKey(left), tupleKey(right)));
  if (!sameJson(plan.upstream_refs, expectedUpstreamRefs)) {
    issues.push(issue("UPSTREAM_REFERENCE_CLOSURE_MISMATCH", "$.upstream_refs", "plan upstream refs do not exactly match current authority artifacts"));
  }

  const duplicatePackageIds = duplicateIds(plan.packages, "package_id");
  for (const packageId of duplicatePackageIds) {
    issues.push(issue("PACKAGE_ID_DUPLICATE", "$.packages", `package ID ${packageId} is duplicated`));
  }
  if (duplicatePackageIds.length > 0) return sortedIssues(issues);
  const packagesById = new Map(plan.packages.map((workPackage) => [workPackage.package_id, workPackage]));
  const packageIds = plan.packages.map((workPackage) => workPackage.package_id);
  const verificationStepsById = new Map(plan.verification.steps.map((step) => [step.verification_id, step]));
  const artifactOwnerById = new Map();
  const artifactOwnerByPath = new Map();

  const hasOrderedPackageDependency = plan.packages.some((workPackage) => workPackage.depends_on_package_ids.length > 0);
  if (decision.observed_signals.ordered_dependency.value && !hasOrderedPackageDependency) {
    issues.push(issue("ADMISSION_ORDERED_DEPENDENCY_MISMATCH", "$.admission_decision_ref", "an observed ordered dependency is absent from the plan package DAG"));
  }
  const missingStackDependencies = plan.packages.slice(1).filter((workPackage, index) => !workPackage.depends_on_package_ids.includes(plan.packages[index].package_id));
  if (missingStackDependencies.length > 0) {
    issues.push(issue("STACK_DEPENDENCY_CLOSURE_MISMATCH", "$.packages", `stacked packages omit their immediate predecessor dependency: ${missingStackDependencies.map((entry) => entry.package_id).join(", ")}`));
  }
  for (const artifactId of duplicateIds(plan.packages, "artifact_id")) {
    issues.push(issue("WORK_PACKAGE_ARTIFACT_ID_DUPLICATE", "$.packages", `Work Package lifecycle artifact ID ${artifactId} is duplicated`));
  }

  plan.packages.forEach((workPackage, index) => {
    const path = `$.packages[${index}]`;
    if (workPackage.plan_binding.plan_id !== plan.plan_id || workPackage.plan_binding.plan_revision !== plan.plan_revision) {
      issues.push(issue("PACKAGE_PLAN_BINDING_MISMATCH", `${path}.plan_binding`, "package was transplanted from another plan or revision"));
    }
    if (!sameJson(workPackage.target_binding, plan.repository)) {
      issues.push(issue("PACKAGE_TARGET_BINDING_MISMATCH", `${path}.target_binding`, "package target differs from the plan repository/base/branch"));
    }
    if (!sameJson(workPackage.upstream_refs, plan.upstream_refs)) {
      issues.push(issue("PACKAGE_UPSTREAM_BINDING_MISMATCH", `${path}.upstream_refs`, "package upstream refs differ from the plan authority set"));
    }
    for (const dependencyId of workPackage.depends_on_package_ids) {
      if (!packagesById.has(dependencyId)) issues.push(issue("DEPENDENCY_TARGET_MISSING", `${path}.depends_on_package_ids`, `dependency ${dependencyId} is not a plan package`));
      if (dependencyId === workPackage.package_id) issues.push(issue("DEPENDENCY_SELF_REFERENCE", `${path}.depends_on_package_ids`, "package cannot depend on itself"));
    }
    for (const [scopeName, entries] of [["allowed_scope", workPackage.allowed_scope], ["forbidden_scope", workPackage.forbidden_scope]]) {
      entries.forEach((entry, entryIndex) => {
        if (entry.kind === "repository_path" && !validRepositoryPath(entry.value)) {
          issues.push(issue("SCOPE_PATH_INVALID", `${path}.${scopeName}[${entryIndex}].value`, "repository path must be normalized and repository-relative"));
        }
        if (entry.kind !== "repository_path" && entry.match !== "exact") {
          issues.push(issue("SCOPE_MATCH_INVALID", `${path}.${scopeName}[${entryIndex}].match`, "non-path scope kinds support exact matching only"));
        }
      });
    }
    for (const allowed of workPackage.allowed_scope) {
      for (const forbidden of workPackage.forbidden_scope) {
        if (scopesOverlap(allowed, forbidden)) {
          issues.push(issue("SCOPE_ALLOWED_FORBIDDEN_OVERLAP", `${path}.allowed_scope`, `${allowed.kind}:${allowed.value} overlaps forbidden scope ${forbidden.kind}:${forbidden.value}`));
        }
      }
    }
    for (const artifactId of duplicateIds(workPackage.expected_artifacts, "artifact_id")) {
      issues.push(issue("EXPECTED_ARTIFACT_ID_DUPLICATE", `${path}.expected_artifacts`, `expected artifact ${artifactId} is duplicated`));
    }
    for (const taskId of duplicateIds(workPackage.ordered_tasks, "task_id")) {
      issues.push(issue("ORDERED_TASK_ID_DUPLICATE", `${path}.ordered_tasks`, `ordered task ${taskId} is duplicated`));
    }
    for (const stopCode of duplicateIds(workPackage.stop_conditions, "code")) {
      issues.push(issue("STOP_CONDITION_CODE_DUPLICATE", `${path}.stop_conditions`, `stop condition ${stopCode} is duplicated`));
    }
    for (const artifact of workPackage.expected_artifacts) {
      if (!validRepositoryPath(artifact.path)) {
        issues.push(issue("EXPECTED_ARTIFACT_PATH_INVALID", `${path}.expected_artifacts`, `expected artifact path ${artifact.path} must be normalized and repository-relative`));
      }
      if (!workPackage.allowed_scope.some((scope) => pathScopeContains(scope, artifact.path))) {
        issues.push(issue("EXPECTED_ARTIFACT_OUTSIDE_ALLOWED_SCOPE", `${path}.expected_artifacts`, `expected artifact path ${artifact.path} is not contained by repository_path allowed scope`));
      }
      if (workPackage.forbidden_scope.some((scope) => pathScopeContains(scope, artifact.path))) {
        issues.push(issue("EXPECTED_ARTIFACT_IN_FORBIDDEN_SCOPE", `${path}.expected_artifacts`, `expected artifact path ${artifact.path} is contained by forbidden scope`));
      }
      if (artifactOwnerById.has(artifact.artifact_id)) {
        issues.push(issue("EXPECTED_ARTIFACT_OWNERSHIP_CONFLICT", `${path}.expected_artifacts`, `artifact ${artifact.artifact_id} is also owned by package ${artifactOwnerById.get(artifact.artifact_id)}`));
      } else artifactOwnerById.set(artifact.artifact_id, workPackage.package_id);
      if (artifactOwnerByPath.has(artifact.path)) {
        issues.push(issue("EXPECTED_ARTIFACT_PATH_CONFLICT", `${path}.expected_artifacts`, `path ${artifact.path} is also owned by package ${artifactOwnerByPath.get(artifact.path)}`));
      } else artifactOwnerByPath.set(artifact.path, workPackage.package_id);
    }
    for (const evidenceId of workPackage.expected_evidence_ids) {
      if (!verificationStepsById.has(evidenceId)) issues.push(issue("EXPECTED_EVIDENCE_UNKNOWN", `${path}.expected_evidence_ids`, `verification step ${evidenceId} is not declared`));
    }
  });

  const cycle = cyclePath(packagesById);
  if (cycle) issues.push(issue("DEPENDENCY_CYCLE", "$.packages", `dependency cycle: ${cycle.join(" -> ")}`));

  const integrationOrder = plan.topology.integration_order;
  if (!exactArray(integrationOrder, packageIds) || new Set(integrationOrder).size !== packagesById.size) {
    issues.push(issue("INTEGRATION_ORDER_INVALID", "$.topology.integration_order", "integration order must list every package exactly once in declared package order"));
  }
  const integrationIndex = new Map(integrationOrder.map((packageId, index) => [packageId, index]));
  for (const workPackage of plan.packages) {
    for (const dependencyId of workPackage.depends_on_package_ids) {
      if (integrationIndex.has(dependencyId) && integrationIndex.get(dependencyId) >= integrationIndex.get(workPackage.package_id)) {
        issues.push(issue("DEPENDENCY_ORDER_IMPOSSIBLE", "$.topology.integration_order", `${workPackage.package_id} is integrated before dependency ${dependencyId}`));
      }
    }
  }
  plan.packages.forEach((workPackage, index) => {
    const expectedBase = index === 0
      ? { kind: "repository_base", package_id: null }
      : { kind: "package", package_id: plan.packages[index - 1].package_id };
    if (!sameJson(workPackage.stack_base, expectedBase)) {
      issues.push(issue("STACK_BASE_INCOMPATIBLE", `$.packages[${index}].stack_base`, "stack base must follow the single-branch integration predecessor"));
    }
  });

  const expectedAcceptance = expectedAcceptanceRefs(context);
  if (decision.observed_signals.acceptance_condition_count.value !== expectedAcceptance.length) {
    issues.push(issue("ADMISSION_ACCEPTANCE_COUNT_MISMATCH", "$.admission_decision_ref", "admission acceptance-condition count differs from the trusted current acceptance registry"));
  }
  if (decision.observed_signals.acceptance_registry_digest.value !== deriveAcceptanceRegistryDigest(expectedAcceptance)) {
    issues.push(issue("ADMISSION_ACCEPTANCE_REGISTRY_MISMATCH", "$.admission_decision_ref", "admission acceptance registry digest differs from the trusted current acceptance identities"));
  }
  const ownershipByRef = new Map();
  plan.acceptance_ownership.forEach((ownership, index) => {
    const key = tupleKey(ownership.acceptance_ref);
    if (ownershipByRef.has(key)) {
      issues.push(issue("AC_OWNERSHIP_CONFLICT", `$.acceptance_ownership[${index}]`, `acceptance ref ${key} has multiple ownership records`));
    }
    ownershipByRef.set(key, ownership);
    for (const ownerId of ownership.owner_package_ids) {
      if (!packagesById.has(ownerId)) issues.push(issue("AC_OWNER_UNKNOWN", `$.acceptance_ownership[${index}].owner_package_ids`, `owner package ${ownerId} is unknown`));
    }
    if (ownership.mode === "exclusive" && (ownership.owner_package_ids.length !== 1 || ownership.shared_reason !== null)) {
      issues.push(issue("AC_EXCLUSIVE_OWNERSHIP_INVALID", `$.acceptance_ownership[${index}]`, "exclusive ownership requires one owner and no shared reason"));
    }
    if (ownership.mode === "shared" && (ownership.owner_package_ids.length < 2 || !ownership.shared_reason?.trim())) {
      issues.push(issue("AC_SHARED_OWNERSHIP_AMBIGUOUS", `$.acceptance_ownership[${index}]`, "shared ownership requires at least two owners and an explicit reason"));
    }
  });
  const expectedAcceptanceKeys = expectedAcceptance.map(tupleKey);
  for (const key of expectedAcceptanceKeys) {
    if (!ownershipByRef.has(key)) issues.push(issue("AC_UNCOVERED", "$.acceptance_ownership", `current acceptance ref ${key} has no owner`));
  }
  for (const key of ownershipByRef.keys()) {
    if (!expectedAcceptanceKeys.includes(key)) issues.push(issue("AC_REFERENCE_STALE_OR_UNKNOWN", "$.acceptance_ownership", `acceptance ref ${key} is not current`));
  }

  const expectedArtifactIds = allExpectedArtifactIds(plan.packages);
  if (plan.topology.publication_units.length !== 1) {
    issues.push(issue("PUBLICATION_UNIT_COUNT_INVALID", "$.topology.publication_units", "Slice 1 topology requires one reconstructable pull request unit"));
  }
  const publicationById = new Map();
  plan.topology.publication_units.forEach((unit, index) => {
    publicationById.set(unit.unit_id, unit);
    if (unit.branch !== plan.repository.branch || unit.base_commit !== plan.repository.base_commit) {
      issues.push(issue("PUBLICATION_TARGET_MISMATCH", `$.topology.publication_units[${index}]`, "publication unit target differs from the plan target"));
    }
    if (!exactArray(unit.package_ids, integrationOrder)) {
      issues.push(issue("PUBLICATION_PACKAGE_COVERAGE_MISMATCH", `$.topology.publication_units[${index}].package_ids`, "publication unit cannot reconstruct the integrated package sequence"));
    }
    if (!exactArray(unit.artifact_ids, expectedArtifactIds)) {
      issues.push(issue("PUBLICATION_ARTIFACT_COVERAGE_MISMATCH", `$.topology.publication_units[${index}].artifact_ids`, "publication unit does not cover the exact planned artifact set"));
    }
  });
  if (plan.topology.review_units.length !== 1) {
    issues.push(issue("REVIEW_UNIT_COUNT_INVALID", "$.topology.review_units", "Slice 1 topology requires one exact-head independent review unit"));
  }
  plan.topology.review_units.forEach((unit, index) => {
    const publication = publicationById.get(unit.publication_unit_id);
    if (!publication) issues.push(issue("REVIEW_PUBLICATION_UNKNOWN", `$.topology.review_units[${index}].publication_unit_id`, "review unit references an unknown publication unit"));
    else if (!exactArray(unit.package_ids, publication.package_ids) || !exactArray(unit.artifact_ids, publication.artifact_ids)) {
      issues.push(issue("REVIEW_CONTENT_COVERAGE_MISMATCH", `$.topology.review_units[${index}]`, "review unit content cannot be related exactly to its publication unit"));
    }
  });

  for (const verificationId of duplicateIds(plan.verification.steps, "verification_id")) {
    issues.push(issue("VERIFICATION_ID_DUPLICATE", "$.verification.steps", `verification step ${verificationId} is duplicated`));
  }
  const cadenceByPackage = new Map();
  plan.verification.focused_cadence.forEach((entry, index) => {
    if (cadenceByPackage.has(entry.after_package_id)) issues.push(issue("FOCUSED_CADENCE_DUPLICATE", `$.verification.focused_cadence[${index}]`, "package has more than one focused cadence record"));
    cadenceByPackage.set(entry.after_package_id, entry);
    if (!packagesById.has(entry.after_package_id)) issues.push(issue("FOCUSED_CADENCE_PACKAGE_UNKNOWN", `$.verification.focused_cadence[${index}].after_package_id`, "focused cadence references an unknown package"));
    for (const verificationId of entry.verification_ids) {
      if (verificationStepsById.get(verificationId)?.kind !== "focused") issues.push(issue("FOCUSED_VERIFICATION_INVALID", `$.verification.focused_cadence[${index}].verification_ids`, `${verificationId} is not a declared focused verification step`));
    }
  });
  for (const packageId of packageIds) {
    if (!cadenceByPackage.has(packageId)) issues.push(issue("FOCUSED_CADENCE_MISSING", "$.verification.focused_cadence", `package ${packageId} has no focused verification boundary`));
  }

  const checkpointsById = new Map(plan.verification.full_gate_checkpoints.map((checkpoint) => [checkpoint.checkpoint_id, checkpoint]));
  for (const checkpointId of duplicateIds(plan.verification.full_gate_checkpoints, "checkpoint_id")) {
    issues.push(issue("FULL_CHECKPOINT_DUPLICATE", "$.verification.full_gate_checkpoints", `checkpoint ${checkpointId} is duplicated`));
  }
  for (const requiredId of context.required_full_checkpoint_ids) {
    if (!checkpointsById.has(requiredId)) issues.push(issue("FULL_CHECKPOINT_MISSING", "$.verification.full_gate_checkpoints", `required checkpoint ${requiredId} is missing`));
  }
  plan.verification.full_gate_checkpoints.forEach((checkpoint, index) => {
    if (!exactArray(checkpoint.after_package_ids, integrationOrder)) {
      issues.push(issue("FULL_CHECKPOINT_BOUNDARY_INVALID", `$.verification.full_gate_checkpoints[${index}].after_package_ids`, "full checkpoint must bind the complete integrated package sequence"));
    }
    for (const verificationId of checkpoint.verification_ids) {
      if (verificationStepsById.get(verificationId)?.kind !== "full") issues.push(issue("FULL_VERIFICATION_INVALID", `$.verification.full_gate_checkpoints[${index}].verification_ids`, `${verificationId} is not a declared full verification step`));
    }
  });
  const fullCheckpointEvidence = new Set(plan.verification.full_gate_checkpoints.flatMap((checkpoint) => checkpoint.verification_ids));
  for (const gate of context.non_overridable_gates) {
    const plannedGate = verificationStepsById.get(gate.verification_id);
    if (!sameJson(plannedGate, { ...gate, kind: "full" })) {
      issues.push(issue("NON_OVERRIDABLE_GATE_DEFINITION_MISMATCH", "$.verification.steps", `required authority gate ${gate.verification_id} differs from the trusted procedure and purpose`));
    }
    if (plannedGate?.kind !== "full" || !fullCheckpointEvidence.has(gate.verification_id)) {
      issues.push(issue("NON_OVERRIDABLE_GATE_MISSING", "$.verification", `required authority gate ${gate.verification_id} is absent from full checkpoints`));
    }
  }
  for (const workPackage of plan.packages) {
    const focusedEvidence = new Set(cadenceByPackage.get(workPackage.package_id)?.verification_ids ?? []);
    const applicableFullEvidence = new Set(plan.verification.full_gate_checkpoints
      .filter((checkpoint) => checkpoint.after_package_ids.includes(workPackage.package_id))
      .flatMap((checkpoint) => checkpoint.verification_ids));
    for (const evidenceId of workPackage.expected_evidence_ids) {
      if (!focusedEvidence.has(evidenceId) && !applicableFullEvidence.has(evidenceId)) {
        issues.push(issue("EXPECTED_EVIDENCE_UNBOUND", "$.verification", `package ${workPackage.package_id} evidence ${evidenceId} is not bound to a focused cadence or full checkpoint`));
      }
    }
  }

  const planBlockers = new Map(plan.blockers.map((blocker) => [blocker.blocker_id, blocker]));
  for (const blocker of context.known_blockers.filter((candidate) => candidate.status !== "resolved")) {
    if (!planBlockers.has(blocker.blocker_id)) issues.push(issue("HIDDEN_BLOCKER", "$.blockers", `current blocker ${blocker.blocker_id} is omitted from the plan`));
    else if (planBlockers.get(blocker.blocker_id).status !== blocker.status) issues.push(issue("BLOCKER_STATUS_MISMATCH", "$.blockers", `plan blocker ${blocker.blocker_id} does not preserve current status ${blocker.status}`));
  }
  const planDecisions = new Map(plan.unresolved_decisions.map((decisionRecord) => [decisionRecord.decision_id, decisionRecord]));
  for (const requiredDecision of context.required_human_decisions) {
    if (!planDecisions.has(requiredDecision.decision_id)) issues.push(issue("HIDDEN_HUMAN_DECISION", "$.unresolved_decisions", `required human decision ${requiredDecision.decision_id} is omitted from the plan`));
    else if (planDecisions.get(requiredDecision.decision_id).authority_kind !== requiredDecision.authority_kind) issues.push(issue("HUMAN_DECISION_AUTHORITY_MISMATCH", "$.unresolved_decisions", `human decision ${requiredDecision.decision_id} has the wrong authority kind`));
  }
  const planApprovals = new Map(plan.human_approvals.map((approval) => [approval.approval_id, approval]));
  for (const blockerId of duplicateIds(plan.blockers, "blocker_id")) issues.push(issue("PLAN_BLOCKER_DUPLICATE", "$.blockers", `plan blocker ${blockerId} is duplicated`));
  for (const decisionId of duplicateIds(plan.unresolved_decisions, "decision_id")) issues.push(issue("PLAN_HUMAN_DECISION_DUPLICATE", "$.unresolved_decisions", `plan human decision ${decisionId} is duplicated`));
  for (const approvalId of duplicateIds(plan.human_approvals, "approval_id")) issues.push(issue("PLAN_HUMAN_APPROVAL_DUPLICATE", "$.human_approvals", `plan human approval ${approvalId} is duplicated`));
  for (const requiredApproval of context.required_human_approvals) {
    if (!planApprovals.has(requiredApproval.approval_id)) issues.push(issue("HIDDEN_HUMAN_APPROVAL", "$.human_approvals", `required human approval ${requiredApproval.approval_id} is omitted from the plan`));
    else {
      const plannedApproval = planApprovals.get(requiredApproval.approval_id);
      if (!sameJson(plannedApproval, requiredApproval)) {
        issues.push(issue("HUMAN_APPROVAL_AUTHORITY_MISMATCH", "$.human_approvals", `human approval ${requiredApproval.approval_id} must exactly mirror status, authority, and immutable evidence from the trusted context`));
      }
    }
  }
  for (const plannedApproval of plan.human_approvals) {
    if (!context.required_human_approvals.some((requiredApproval) => requiredApproval.approval_id === plannedApproval.approval_id)) {
      issues.push(issue("HUMAN_APPROVAL_CLOSURE_MISMATCH", "$.human_approvals", `plan approval ${plannedApproval.approval_id} is absent from the trusted context`));
    }
  }
  for (const approval of plan.human_approvals) {
    if (approval.status === "approved" && (
      !approval.authority_ref?.trim()
      || !approval.approval_evidence_ref?.trim()
      || !approval.approval_evidence_digest?.startsWith("sha256:")
    )) {
      issues.push(issue("HUMAN_APPROVAL_AUTHORITY_MISSING", "$.human_approvals", `approved record ${approval.approval_id} lacks trusted authority or immutable approval evidence`));
    }
  }
  if (plan.lifecycle_state === "accepted") {
    if (plan.unresolved_decisions.some((entry) => entry.status !== "resolved")) issues.push(issue("UNRESOLVED_HUMAN_DECISION", "$.unresolved_decisions", "accepted plan cannot contain an unresolved or unknown human decision"));
    if (plan.human_approvals.some((entry) => entry.status !== "approved")) issues.push(issue("HUMAN_APPROVAL_UNRESOLVED", "$.human_approvals", "accepted plan cannot contain a required, rejected, or unknown approval"));
    if (plan.blockers.some((entry) => entry.status !== "resolved")) issues.push(issue("OPEN_BLOCKER_IN_EXECUTABLE_PLAN", "$.blockers", "accepted plan cannot contain an open or unknown blocker"));
    if (context.known_blockers.some((entry) => entry.status !== "resolved")) issues.push(issue("CURRENT_BLOCKER_UNRESOLVED", "$.blockers", "trusted current context still contains an open or unknown blocker"));
    if (context.required_human_decisions.length > 0) issues.push(issue("CURRENT_HUMAN_DECISION_REQUIRED", "$.unresolved_decisions", "trusted current context still requires a human decision"));
    if (context.required_human_approvals.some((entry) => entry.status !== "approved")) issues.push(issue("CURRENT_HUMAN_APPROVAL_UNRESOLVED", "$.human_approvals", "trusted current context still contains a non-approved human approval"));
    if (decision.effective_decision === "human_decision_required") issues.push(issue("ADMISSION_HUMAN_DECISION", "$.admission_decision_ref", "human admission decision remains unresolved"));
  }
  return sortedIssues(issues);
}

export function validateWorkPackagePlanExecutable(plan, options = {}) {
  const issues = validateWorkPackagePlan(plan, options);
  if (issues.some((entry) => entry.code === "SCHEMA_INVALID")) return issues;
  if (plan.lifecycle_state !== "accepted") {
    issues.push(issue("PLAN_NOT_EXECUTABLE", "$.lifecycle_state", "repository mutation requires an accepted current Work Package Plan"));
  }
  if (plan.unresolved_decisions.some((entry) => entry.status !== "resolved")) {
    issues.push(issue("UNRESOLVED_HUMAN_DECISION", "$.unresolved_decisions", "executable plan cannot contain an unresolved or unknown human decision"));
  }
  if (plan.human_approvals.some((entry) => entry.status !== "approved")) {
    issues.push(issue("HUMAN_APPROVAL_UNRESOLVED", "$.human_approvals", "executable plan cannot contain a required, rejected, or unknown approval"));
  }
  if (plan.blockers.some((entry) => entry.status !== "resolved")) {
    issues.push(issue("OPEN_BLOCKER_IN_EXECUTABLE_PLAN", "$.blockers", "executable plan cannot contain an open or unknown blocker"));
  }
  if (options.context?.known_blockers?.some((entry) => entry.status !== "resolved")) {
    issues.push(issue("CURRENT_BLOCKER_UNRESOLVED", "$.blockers", "trusted current context still contains an open or unknown blocker"));
  }
  if ((options.context?.required_human_decisions?.length ?? 0) > 0) {
    issues.push(issue("CURRENT_HUMAN_DECISION_REQUIRED", "$.unresolved_decisions", "trusted current context still requires a human decision"));
  }
  if (options.context?.required_human_approvals?.some((entry) => entry.status !== "approved")) {
    issues.push(issue("CURRENT_HUMAN_APPROVAL_UNRESOLVED", "$.human_approvals", "trusted current context still contains a non-approved human approval"));
  }
  if (options.decision?.effective_decision === "human_decision_required") {
    issues.push(issue("ADMISSION_HUMAN_DECISION", "$.admission_decision_ref", "human admission decision remains unresolved"));
  }
  return sortedIssues(issues.filter((entry, index, values) => values.findIndex((candidate) => candidate.code === entry.code && candidate.path === entry.path) === index));
}

function validateCaseCatalog(catalog) {
  const issues = [];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return [issue("FIXTURE_CATALOG_INVALID", "$", "fixture catalog must be an object")];
  if (catalog.schema_version !== EPIC_ADMISSION_SCHEMA_VERSION) issues.push(issue("FIXTURE_CATALOG_INVALID", "$.schema_version", `fixture catalog schema_version must be ${EPIC_ADMISSION_SCHEMA_VERSION}`));
  if (!Array.isArray(catalog.cases)) return [issue("FIXTURE_CATALOG_INVALID", "$.cases", "fixture catalog cases must be an array")];
  const caseIds = catalog.cases.map((entry) => entry?.case_id);
  for (const id of REQUIRED_CASE_IDS) {
    if (!caseIds.includes(id)) issues.push(issue("FIXTURE_CASE_MISSING", "$.cases", `required case ${id} is missing`));
  }
  for (const id of caseIds) {
    if (!REQUIRED_CASE_IDS.includes(id)) issues.push(issue("FIXTURE_CASE_UNKNOWN", "$.cases", `unknown case ${id}`));
  }
  if (new Set(caseIds).size !== caseIds.length) issues.push(issue("FIXTURE_CASE_DUPLICATE", "$.cases", "fixture case IDs must be unique"));
  return sortedIssues(issues);
}

export function validateRepositoryEpicAdmissionWorkPackagePlan({ root = MODULE_ROOT, paths: pathOverrides = {} } = {}) {
  const paths = resolvedPaths(root, pathOverrides);
  for (const key of ["policy", "decision", "context", "plan", "firstContext", "firstPlan", "previousContext", "previousPlan", "cases"]) {
    if (!existsSync(paths[key])) return { issues: [issue("ARTIFACT_MISSING", `$paths.${key}`, `${paths[key]} is missing`)] };
  }
  let policy;
  let decision;
  let context;
  let plan;
  let firstContext;
  let firstPlan;
  let previousContext;
  let previousPlan;
  let cases;
  try {
    policy = readJsonFileStrict(paths.policy, "epic admission policy");
    decision = readJsonFileStrict(paths.decision, "epic admission decision");
    context = readJsonFileStrict(paths.context, "Work Package Plan validation context");
    plan = readJsonFileStrict(paths.plan, "Work Package Plan");
    firstContext = readJsonFileStrict(paths.firstContext, "pinned r1 Work Package Plan validation context");
    firstPlan = readJsonFileStrict(paths.firstPlan, "pinned r1 Work Package Plan");
    previousContext = readJsonFileStrict(paths.previousContext, "superseded Work Package Plan validation context");
    previousPlan = readJsonFileStrict(paths.previousPlan, "superseded Work Package Plan");
    cases = readJsonFileStrict(paths.cases, "epic admission and Work Package Plan fixture catalog");
  } catch (error) {
    return { issues: [issue(error.code === "DUPLICATE_JSON_OBJECT_KEY" ? "DUPLICATE_JSON_KEY" : "STRICT_JSON_READ_FAILED", "$", error.message)] };
  }
  const policyIssues = validateEpicAdmissionPolicy(policy, { schemaPath: paths.policySchema });
  const decisionIssues = policyIssues.length === 0
    ? validateEpicAdmissionDecision(decision, {
      policy,
      schemaPath: paths.decisionSchema,
      policySchemaPath: paths.policySchema,
    })
    : [];
  const historicalIssues = historicalArtifactIssues(paths, { firstContext, firstPlan, previousContext, previousPlan });
  const dependencyIssues = policyIssues.length > 0
    ? [issue("POLICY_INVALID", "$paths.policy", formatIssues(policyIssues))]
    : decisionIssues.length > 0
      ? [issue("ADMISSION_DECISION_INVALID", "$paths.decision", formatIssues(decisionIssues))]
      : [];
  const planIssues = policyIssues.length === 0 && decisionIssues.length === 0 && historicalIssues.length === 0
    ? validateWorkPackagePlanExecutable(plan, {
      policy,
      decision,
      context,
      previousContext,
      previousPlan,
      planSchemaPath: paths.planSchema,
      contextSchemaPath: paths.contextSchema,
      policySchemaPath: paths.policySchema,
      decisionSchemaPath: paths.decisionSchema,
    })
    : [];
  const issues = [
    ...dependencyIssues,
    ...historicalIssues,
    ...planIssues,
    ...validateCaseCatalog(cases),
  ];
  return {
    issues: sortedIssues(issues),
    policy,
    decision,
    context,
    plan,
    caseCount: Array.isArray(cases?.cases) ? cases.cases.length : 0,
  };
}

export function formatIssues(issues) {
  return issues.map((entry) => `${entry.code} ${entry.path}: ${entry.message}`).join("; ");
}

function runCli() {
  const unsupported = process.argv.slice(2).filter((argument) => argument !== "--check");
  if (unsupported.length > 0) throw new Error(`unsupported arguments: ${unsupported.join(" ")}`);
  const result = validateRepositoryEpicAdmissionWorkPackagePlan();
  if (result.issues.length > 0) throw new Error(formatIssues(result.issues));
  console.log(`Epic admission and Work Package Plan validation passed: plan=${result.plan.plan_id}@${result.plan.plan_revision} digest=${result.plan.plan_digest} cases=${result.caseCount}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`Epic admission and Work Package Plan validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
