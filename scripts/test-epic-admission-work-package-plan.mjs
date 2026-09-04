#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalDigest,
  parseJsonRejectDuplicateKeys,
  readJsonFileStrict,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";
import {
  deriveEpicAdmissionOverrideBasisDigest,
  deriveWorkPackagePlanContentDigest,
  evaluateEpicAdmission,
  projectWorkPackagePlanEntryToLifecycleArtifact,
  sealEpicAdmissionDecision,
  sealEpicAdmissionPolicy,
  sealWorkPackagePlan,
  sealWorkPackagePlanValidationContext,
  validateEpicAdmissionDecision,
  validateEpicAdmissionPolicy,
  validateObservedWorkPackageArtifacts,
  validateRepositoryEpicAdmissionWorkPackagePlan,
  validateWorkPackagePlan,
  validateWorkPackagePlanExecutable,
  validateWorkPackageLifecycleProjection,
  validateWorkPackagePlanValidationContext,
} from "./epic-admission-work-package-plan.mjs";
import {
  buildEpicAdmissionDecision,
  buildEpicAdmissionPolicy,
  buildEpicAdmissionSubject,
  buildIssue275PlanBundle,
  buildObservedSignals,
} from "./test-fixtures/epic-admission-work-package-plan-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const catalog = readJsonFileStrict(resolve(root, "docs/fixtures/epic-admission-work-package-plan-cases.json"), "Issue #275 contract cases");
const expectedById = new Map(catalog.cases.map((entry) => [entry.case_id, entry]));
const executedCaseIds = new Set();

function clone(value) {
  return structuredClone(value);
}

const APPROVAL_EVIDENCE_DIGEST = canonicalDigest({ fixture: "trusted-human-approval" });

function approvalRecord(overrides = {}) {
  const status = overrides.status ?? "approved";
  return {
    approval_id: "APPROVAL-CURRENT",
    description: "Current approval supplied by trusted context.",
    authority_kind: "human_program_owner",
    status,
    authority_ref: "fixture:approval-current",
    approval_evidence_ref: status === "approved" ? "fixture:approval-current-record" : null,
    approval_evidence_digest: status === "approved" ? APPROVAL_EVIDENCE_DIGEST : null,
    ...overrides,
  };
}

function codes(issues) {
  return issues.map((entry) => entry.code);
}

function expectCodes(caseId, issues) {
  assert.ok(expectedById.has(caseId), `unknown fixture case ${caseId}`);
  executedCaseIds.add(caseId);
  assert.deepEqual(codes(issues), expectedById.get(caseId).expected_issue_codes, caseId);
}

function expectDeterministicIssues(caseId, validate, expectedPaths) {
  assert.ok(expectedById.has(caseId), `unknown fixture case ${caseId}`);
  const expectedCodes = expectedById.get(caseId).expected_issue_codes;
  assert.equal(expectedPaths.length, expectedCodes.length, `${caseId} must bind every expected issue code to a path`);
  const first = validate();
  const second = validate();
  assert.deepEqual(second, first, `${caseId} must return deterministic issues`);
  expectCodes(caseId, first);
  assert.deepEqual(
    first.map(({ code, path }) => ({ code, path })),
    expectedCodes.map((code, index) => ({ code, path: expectedPaths[index] })),
    `${caseId} must return the expected ordered issue code/path pairs`,
  );
  return first;
}

function expectEvaluationInputError(caseId, evaluate) {
  assert.ok(expectedById.has(caseId), `unknown fixture case ${caseId}`);
  let caught = null;
  try {
    evaluate();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${caseId} must fail before producing an admission decision`);
  assert.equal(caught.code, "EPIC_ADMISSION_INPUT_INVALID", `${caseId} must expose a typed evaluator input error`);
  assert.deepEqual(codes(caught.issues), expectedById.get(caseId).expected_issue_codes, caseId);
  assert.deepEqual(caught.issues.map((entry) => entry.path), expectedById.get(caseId).expected_issue_paths, caseId);
  executedCaseIds.add(caseId);
}

function canonicalDigestExcluding(value, digestField) {
  const content = clone(value);
  delete content[digestField];
  return canonicalDigest(content);
}

function rawDigest(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function closePlanContextBinding(bundle, inputPlan) {
  const context = clone(bundle.context);
  const planDraft = clone(inputPlan);
  planDraft.validation_context_ref = {
    context_id: context.context_id,
    context_revision: context.context_revision,
    context_digest: context.context_digest,
  };
  let plan = sealWorkPackagePlan(planDraft);
  context.current_plan_ref = {
    plan_id: plan.plan_id,
    plan_revision: plan.plan_revision,
    lifecycle_state: plan.lifecycle_state,
    plan_content_digest: deriveWorkPackagePlanContentDigest(plan),
  };
  const sealedContext = sealWorkPackagePlanValidationContext(context);
  plan.validation_context_ref = {
    context_id: sealedContext.context_id,
    context_revision: sealedContext.context_revision,
    context_digest: sealedContext.context_digest,
  };
  plan = sealWorkPackagePlan(plan);
  assert.equal(deriveWorkPackagePlanContentDigest(plan), sealedContext.current_plan_ref.plan_content_digest);
  return { ...bundle, context: sealedContext, plan };
}

function mutatePlan(bundle, mutate, { preserveContextBinding = false } = {}) {
  const plan = clone(bundle.plan);
  mutate(plan);
  const sealedPlan = sealWorkPackagePlan(plan);
  return preserveContextBinding
    ? { ...bundle, plan: sealedPlan }
    : closePlanContextBinding(bundle, sealedPlan);
}

function mutateContext(bundle, mutate) {
  const context = clone(bundle.context);
  mutate(context);
  const sealedContext = sealWorkPackagePlanValidationContext(context);
  const plan = clone(bundle.plan);
  plan.validation_context_ref = {
    context_id: sealedContext.context_id,
    context_revision: sealedContext.context_revision,
    context_digest: sealedContext.context_digest,
  };
  return { ...bundle, context: sealedContext, plan: sealWorkPackagePlan(plan) };
}

function validatePlanBundle(bundle) {
  return validateWorkPackagePlan(bundle.plan, {
    policy: bundle.policy,
    decision: bundle.decision,
    context: bundle.context,
    previousContext: bundle.previousContext,
    previousPlan: bundle.previousPlan,
  });
}

function rebindDecision(bundle, decision) {
  const plan = clone(bundle.plan);
  plan.admission_decision_ref = {
    decision_id: decision.decision_id,
    decision_revision: decision.decision_revision,
    decision_digest: decision.decision_digest,
  };
  const context = clone(bundle.context);
  context.current_admission_decision_ref = clone(plan.admission_decision_ref);
  return closePlanContextBinding({ ...bundle, decision, context }, plan);
}

const canonical = buildIssue275PlanBundle();

assert.deepEqual(validateEpicAdmissionPolicy(canonical.policy), []);
assert.deepEqual(validateEpicAdmissionDecision(canonical.decision, { policy: canonical.policy }), []);
assert.deepEqual(validateWorkPackagePlanValidationContext(canonical.context, { policy: canonical.policy, decision: canonical.decision }), []);
expectCodes("POS-VALID-MULTI-PACKAGE", validatePlanBundle(canonical));

const checkedArtifacts = new Map([
  ["policy", "docs/fixtures/epic-admission-policy.json"],
  ["decision", "docs/fixtures/issue-275-slice-1-epic-admission-decision.json"],
  ["context", "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json"],
  ["plan", "docs/fixtures/issue-275-slice-1-work-package-plan.json"],
  ["previousContext", "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json"],
  ["previousPlan", "docs/fixtures/issue-275-slice-1-work-package-plan-r2.json"],
]);
for (const [key, path] of checkedArtifacts) {
  const checked = readJsonFileStrict(resolve(root, path), path);
  assert.deepEqual(checked, canonical[key], `${path} must match the frozen deterministic fixture`);
  assert.equal(readFileSync(resolve(root, path), "utf8"), `${JSON.stringify(canonical[key], null, 2)}\n`, `${path} bytes must be deterministic pretty JSON`);
}
assert.equal(canonical.previousContext.context_digest, "sha256:e33aebb1eacbeb9edb0dea3a33e252c4e686556677c44c47b013b45894d8bc1e");
assert.equal(canonical.previousPlan.plan_digest, "sha256:e97a2ef854ab5350d11ca00e305aaf44eb01939744500513bfee313ff94b8e3f");
const historicalPins = [
  ["docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r1.json", "context_digest", "sha256:77d060f40ac11a74f5d9e39bf28f5653ecade591b09bb090b9a42958ec6c11db", "sha256:0d1de9f8979799c16fd7ed8ea677e360d74dd3a980a3eab58f73a9e6afb51236"],
  ["docs/fixtures/issue-275-slice-1-work-package-plan-r1.json", "plan_digest", "sha256:11adfda1e0a27c5aee8460807ef26f77b65ebd13ed26835b9e1e3af7654bb65d", "sha256:c65c703eb760467289847364d6dcb68c0bcc863ae091a641d892550e3a815437"],
  ["docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json", "context_digest", "sha256:e33aebb1eacbeb9edb0dea3a33e252c4e686556677c44c47b013b45894d8bc1e", "sha256:e8d28d9b431d3118563d2db44f8eeeb56851678f3fc9163aeb485b8df3de0d3b"],
  ["docs/fixtures/issue-275-slice-1-work-package-plan-r2.json", "plan_digest", "sha256:e97a2ef854ab5350d11ca00e305aaf44eb01939744500513bfee313ff94b8e3f", "sha256:545a7d08d055c1e99e95d9b49fca4e26021945328865b686febe94b276c275b4"],
];
for (const [path, digestField, expectedCanonicalDigest, expectedRawDigest] of historicalPins) {
  const artifact = readJsonFileStrict(resolve(root, path), `historical artifact ${path}`);
  assert.equal(artifact[digestField], expectedCanonicalDigest, `${path} must retain its pinned stored digest`);
  assert.equal(canonicalDigestExcluding(artifact, digestField), expectedCanonicalDigest, `${path} content must recompute to its pinned digest`);
  assert.equal(rawDigest(resolve(root, path)), expectedRawDigest, `${path} must retain its pinned repository bytes`);
}

const rebuilt = buildIssue275PlanBundle();
assert.equal(stableCanonicalJson(rebuilt), stableCanonicalJson(canonical), "repeated builds must be canonical-byte equivalent");
assert.equal(rebuilt.plan.plan_id, canonical.plan.plan_id);
assert.equal(rebuilt.plan.plan_digest, canonical.plan.plan_digest);
expectCodes("POS-DETERMINISTIC-IDENTITY", []);

const smallPolicy = buildEpicAdmissionPolicy();
smallPolicy.rules.configured_epic_goal_ids = [];
const resealedSmallPolicy = sealEpicAdmissionPolicy(smallPolicy);
const smallDecision = evaluateEpicAdmission({
  policy: resealedSmallPolicy,
  subject: buildEpicAdmissionSubject({ goal_id: "github:ist-h-i/agent-spectrum-kernel#small-fixture", task_id: "SMALL-FIXTURE" }),
  observed_signals: buildObservedSignals("small"),
});
assert.equal(smallDecision.effective_decision, expectedById.get("POS-SMALL-ORDINARY").expected_decision);
expectCodes("POS-SMALL-ORDINARY", validateEpicAdmissionDecision(smallDecision, { policy: resealedSmallPolicy }));

assert.equal(canonical.decision.effective_decision, expectedById.get("POS-CONFIGURED-EPIC").expected_decision);
assert.deepEqual(canonical.decision.reason_codes, ["CONFIGURED_EPIC", "MULTI_BOUNDARY_THRESHOLD", "ORDERED_DEPENDENCY"]);
expectCodes("POS-CONFIGURED-EPIC", validateEpicAdmissionDecision(canonical.decision, { policy: canonical.policy }));

function assertIsolatedAdmission(caseId, { configured, acceptanceCount, scopeCount, ordered, independent }, expectedReason) {
  const policyDraft = buildEpicAdmissionPolicy();
  const goalId = configured ? canonical.decision.subject.goal_id : "github:ist-h-i/agent-spectrum-kernel#isolated-fixture";
  policyDraft.rules.configured_epic_goal_ids = configured ? [goalId] : [];
  const policy = sealEpicAdmissionPolicy(policyDraft);
  const observedSignals = buildObservedSignals("small");
  observedSignals.configured_epic = { value: configured, evidence_status: "verified", evidence_ref: `fixture:${caseId}` };
  observedSignals.acceptance_condition_count = { value: acceptanceCount, evidence_status: "verified", evidence_ref: `fixture:${caseId}` };
  observedSignals.scope_boundary_count = { value: scopeCount, evidence_status: "verified", evidence_ref: `fixture:${caseId}` };
  observedSignals.ordered_dependency = { value: ordered, evidence_status: "verified", evidence_ref: `fixture:${caseId}` };
  observedSignals.independent_publication_units = { value: independent, evidence_status: "verified", evidence_ref: `fixture:${caseId}` };
  const decision = evaluateEpicAdmission({
    policy,
    subject: buildEpicAdmissionSubject({ goal_id: goalId, task_id: caseId }),
    observed_signals: observedSignals,
  });
  assert.equal(decision.effective_decision, expectedById.get(caseId).expected_decision);
  assert.deepEqual(decision.reason_codes, [expectedReason]);
  expectCodes(caseId, validateEpicAdmissionDecision(decision, { policy }));
}

assertIsolatedAdmission("POS-CONFIGURED-EPIC-ONLY", { configured: true, acceptanceCount: 1, scopeCount: 1, ordered: false, independent: false }, "CONFIGURED_EPIC");
assertIsolatedAdmission("POS-MULTI-BOUNDARY-THRESHOLD-ONLY", { configured: false, acceptanceCount: 4, scopeCount: 2, ordered: false, independent: false }, "MULTI_BOUNDARY_THRESHOLD");
assertIsolatedAdmission("POS-ORDERED-DEPENDENCY-ONLY", { configured: false, acceptanceCount: 1, scopeCount: 1, ordered: true, independent: false }, "ORDERED_DEPENDENCY");
assertIsolatedAdmission("POS-INDEPENDENT-PUBLICATION-ONLY", { configured: false, acceptanceCount: 1, scopeCount: 1, ordered: false, independent: true }, "INDEPENDENT_PUBLICATION_UNITS");

const unresolvedDecision = buildEpicAdmissionDecision({ policy: canonical.policy, kind: "unresolved" });
assert.equal(unresolvedDecision.effective_decision, expectedById.get("POS-SCOPE-HUMAN-DECISION").expected_decision);
expectCodes("POS-SCOPE-HUMAN-DECISION", validateEpicAdmissionDecision(unresolvedDecision, { policy: canonical.policy }));

const overrideRequest = {
  rule_id: "OVERRIDE-PLAN-REQUIREMENT",
  requested_decision: "ordinary_execution_allowed",
  reason: "The human program owner accepts ordinary execution for this bounded fixture only.",
  authority_grant_id: "GRANT-ISSUE-275-OVERRIDE-FIXTURE",
  authority_ref: "fixture:human-program-owner-approval",
  authority_kind: "human_program_owner",
};
const overridePolicyDraft = buildEpicAdmissionPolicy();
overridePolicyDraft.override_rules[0].authority_grants.push({
  grant_id: overrideRequest.authority_grant_id,
  authority_kind: overrideRequest.authority_kind,
  authority_ref: overrideRequest.authority_ref,
  approval_status: "approved",
  evidence_ref: "fixture:human-program-owner-approval-record",
  evidence_digest: canonicalDigest({ fixture: "human-program-owner-approval-record" }),
  subject_binding: buildEpicAdmissionSubject(),
  admission_basis_digest: deriveEpicAdmissionOverrideBasisDigest({
    subject: buildEpicAdmissionSubject(),
    observed_signals: buildObservedSignals("epic"),
    computed_decision: "work_package_plan_required",
    requested_decision: overrideRequest.requested_decision,
  }),
});
const overridePolicy = sealEpicAdmissionPolicy(overridePolicyDraft);
const overriddenDecision = buildEpicAdmissionDecision({ policy: overridePolicy, override_request: overrideRequest });
assert.equal(overriddenDecision.override.state, "applied");
assert.equal(overriddenDecision.effective_decision, expectedById.get("POS-EXPLICIT-OVERRIDE").expected_decision);
expectCodes("POS-EXPLICIT-OVERRIDE", validateEpicAdmissionDecision(overriddenDecision, { policy: overridePolicy }));

expectCodes("POS-VALID-SHARED-OWNERSHIP", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.acceptance_ownership[0].mode = "shared";
  plan.acceptance_ownership[0].owner_package_ids = ["WP3", "WP4"];
  plan.acceptance_ownership[0].shared_reason = "WP3 owns topology representation while WP4 owns the ordinary-task behavioral oracle.";
})));

{
  const signals = clone(canonical.decision.observed_signals);
  signals.ordered_dependency.value = false;
  const decision = evaluateEpicAdmission({ policy: canonical.policy, subject: canonical.decision.subject, observed_signals: signals });
  expectCodes("POS-PLAN-DERIVED-STACK-ORDER", validatePlanBundle(rebindDecision(canonical, decision)));
}
{
  const signals = clone(canonical.decision.observed_signals);
  signals.independent_publication_units.value = true;
  const decision = evaluateEpicAdmission({ policy: canonical.policy, subject: canonical.decision.subject, observed_signals: signals });
  expectCodes("POS-INDEPENDENT-PUBLICATION-CONSOLIDATED", validatePlanBundle(rebindDecision(canonical, decision)));
}
{
  const trustedApproval = approvalRecord();
  const withContext = mutateContext(canonical, (context) => context.required_human_approvals.push(clone(trustedApproval)));
  const withPlan = mutatePlan(withContext, (plan) => plan.human_approvals.push(clone(trustedApproval)));
  expectCodes("POS-TRUSTED-HUMAN-APPROVAL", validatePlanBundle(withPlan));
}
{
  const workPackage = canonical.plan.packages[0];
  const projection = projectWorkPackagePlanEntryToLifecycleArtifact(workPackage);
  expectCodes("POS-LIFECYCLE-WORK-PACKAGE-PROJECTION", validateWorkPackageLifecycleProjection(workPackage, projection));
  const drifted = clone(projection);
  drifted.revision += 1;
  drifted.upstream_refs[0].observed_revision += 1;
  expectCodes("NEG-LIFECYCLE-PROJECTION-DRIFT", validateWorkPackageLifecycleProjection(workPackage, drifted));
  const revisedWorkPackage = clone(workPackage);
  revisedWorkPackage.revision += 1;
  revisedWorkPackage.upstream_refs[0].observed_revision += 1;
  assert.notDeepEqual(projectWorkPackagePlanEntryToLifecycleArtifact(revisedWorkPackage), projection, "lifecycle projection must preserve package and upstream revisions");
}

const plannedArtifactPaths = canonical.plan.packages.flatMap((workPackage) => workPackage.expected_artifacts.map((artifact) => artifact.path));
expectCodes("POS-OBSERVED-ARTIFACT-CLOSURE", validateObservedWorkPackageArtifacts(canonical.plan, plannedArtifactPaths));
expectCodes("NEG-OBSERVED-ARTIFACT-MISSING", validateObservedWorkPackageArtifacts(canonical.plan, plannedArtifactPaths.slice(1)));
expectCodes("NEG-OBSERVED-ARTIFACT-UNPLANNED", validateObservedWorkPackageArtifacts(canonical.plan, [...plannedArtifactPaths, "unplanned/change.txt"]));

const currentBranch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
if (currentBranch === canonical.plan.repository.branch || process.env.GITHUB_HEAD_REF === canonical.plan.repository.branch) {
  const tracked = execFileSync("git", ["diff", "--name-only", canonical.plan.repository.base_commit], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  assert.deepEqual(validateObservedWorkPackageArtifacts(canonical.plan, [...tracked, ...untracked]), [], "current Issue #275 branch publication paths must exactly match the accepted plan");
}

for (const caseId of ["NEG-SMALL-FALSE-EPIC", "NEG-AI-ESTIMATE-SOLE-BLOCK"]) {
  const invalid = clone(smallDecision);
  invalid.computed_decision = "work_package_plan_required";
  invalid.effective_decision = "work_package_plan_required";
  invalid.reason_codes = [caseId === "NEG-AI-ESTIMATE-SOLE-BLOCK" ? "AI_ESTIMATED_COMPLEXITY" : "FALSE_EPIC_CLASSIFICATION"];
  const sealed = sealEpicAdmissionDecision(invalid);
  expectCodes(caseId, validateEpicAdmissionDecision(sealed, { policy: resealedSmallPolicy }));
}
{
  const invalid = clone(canonical.decision);
  invalid.observed_signals.configured_epic.evidence_ref = " ";
  expectCodes("NEG-EVIDENCE-REF-BLANK", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: canonical.policy }));
}
for (const [caseId, mutate] of [
  ["NEG-EVALUATION-INPUT-COUNT", (signals) => { signals.acceptance_condition_count.value = -1; }],
  ["NEG-EVALUATION-INPUT-EVIDENCE", (signals) => { signals.configured_epic.evidence_ref = " "; }],
  ["NEG-EVALUATION-INPUT-SCOPE", (signals) => { signals.scope_resolution.value = "invalid"; }],
]) {
  const signals = buildObservedSignals("small");
  mutate(signals);
  expectEvaluationInputError(caseId, () => evaluateEpicAdmission({
    policy: resealedSmallPolicy,
    subject: buildEpicAdmissionSubject({ goal_id: "github:ist-h-i/agent-spectrum-kernel#evaluation-input-fixture", task_id: caseId }),
    observed_signals: signals,
  }));
}
{
  const invalid = clone(canonical.policy);
  invalid.rules.human_decision_scope_states = invalid.rules.human_decision_scope_states.filter((state) => state !== "unknown");
  expectCodes("NEG-POLICY-UNKNOWN-SCOPE-FAIL-OPEN", validateEpicAdmissionPolicy(sealEpicAdmissionPolicy(invalid)));
}

{
  const invalid = clone(overriddenDecision);
  invalid.override.reason = null;
  expectCodes("NEG-OVERRIDE-REASON", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: overridePolicy }));
}
{
  const invalid = clone(overriddenDecision);
  invalid.override.authority_kind = "untrusted_agent";
  invalid.override.authority_ref = "fixture:untrusted-agent";
  expectCodes("NEG-OVERRIDE-AUTHORITY", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: overridePolicy }));
}
{
  const invalid = clone(overriddenDecision);
  invalid.override.authority_ref = "attacker:self-asserted";
  expectCodes("NEG-OVERRIDE-AUTHORITY-REF", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: overridePolicy }));
}
{
  const invalid = clone(smallDecision);
  invalid.override.rule_id = "OVERRIDE-PLAN-REQUIREMENT";
  invalid.override.requested_decision = "ordinary_execution_allowed";
  invalid.override.reason = "Payload hidden behind not_requested state.";
  invalid.override.authority_grant_id = "GRANT-ISSUE-275-OVERRIDE-FIXTURE";
  invalid.override.authority_ref = "attacker:self-asserted";
  invalid.override.authority_kind = "human_program_owner";
  expectCodes("NEG-OVERRIDE-NOT-REQUESTED-PAYLOAD", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: resealedSmallPolicy }));
}
{
  const invalid = clone(overriddenDecision);
  invalid.override.authority_grant_id = "GRANT-UNKNOWN";
  expectCodes("NEG-OVERRIDE-GRANT", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: overridePolicy }));
}
{
  const invalidPolicyDraft = clone(overridePolicy);
  invalidPolicyDraft.override_rules[0].authority_grants[0].evidence_ref = " ";
  const invalidPolicy = sealEpicAdmissionPolicy(invalidPolicyDraft);
  expectDeterministicIssues(
    "NEG-OVERRIDE-GRANT-EVIDENCE-BLANK",
    () => validateEpicAdmissionPolicy(invalidPolicy),
    ["$.override_rules[0].authority_grants[0].evidence_ref"],
  );
  assert.throws(() => evaluateEpicAdmission({
    policy: invalidPolicy,
    subject: buildEpicAdmissionSubject(),
    observed_signals: buildObservedSignals("epic"),
    override_request: overrideRequest,
  }), /epic admission policy is invalid: SCHEMA_INVALID/u, "blank grant evidence must fail before an allowed decision is returned");
}
{
  const replayed = clone(overriddenDecision);
  replayed.observed_signals.acceptance_condition_count.value -= 1;
  expectCodes("NEG-OVERRIDE-BASIS-REPLAY", validateEpicAdmissionDecision(sealEpicAdmissionDecision(replayed), { policy: overridePolicy }));
}
{
  const invalid = clone(overriddenDecision);
  invalid.override.rule_id = "OVERRIDE-UNKNOWN";
  expectCodes("NEG-OVERRIDE-POLICY", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: overridePolicy }));
}
{
  const invalid = clone(unresolvedDecision);
  invalid.effective_decision = "ordinary_execution_allowed";
  invalid.reason_codes.push("EPIC_ADMISSION_OVERRIDE_APPLIED");
  invalid.override = { state: "applied", ...overrideRequest };
  expectCodes("NEG-OVERRIDE-BOUNDARY", validateEpicAdmissionDecision(sealEpicAdmissionDecision(invalid), { policy: canonical.policy }));
}

{
  const partial = clone(canonical.plan);
  delete partial.packages[0].package_id;
  expectCodes("NEG-PACKAGE-ID-MISSING", validateWorkPackagePlan(partial, canonical));
}
expectCodes("NEG-PACKAGE-ID-DUPLICATE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].package_id = plan.packages[0].package_id;
})));
expectCodes("NEG-DAG-CYCLE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].depends_on_package_ids = ["WP4"];
})));
expectCodes("NEG-DEPENDENCY-UNKNOWN", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].depends_on_package_ids = ["WP404"];
})));
{
  const partial = clone(canonical.plan);
  delete partial.packages[1].depends_on_package_ids;
  expectCodes("NEG-DEPENDENCY-TARGET-MISSING", validateWorkPackagePlan(partial, canonical));
}
expectCodes("NEG-AC-UNCOVERED", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.acceptance_ownership.pop();
})));
expectCodes("NEG-AC-CONFLICT", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.acceptance_ownership.push(clone(plan.acceptance_ownership[0]));
})));
expectCodes("NEG-AC-OWNER-UNKNOWN", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.acceptance_ownership[0].owner_package_ids = ["WP404"];
})));
expectCodes("NEG-AC-SHARED-AMBIGUOUS", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.acceptance_ownership[0].mode = "shared";
  plan.acceptance_ownership[0].shared_reason = null;
})));
expectCodes("NEG-SCOPE-MISSING", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].allowed_scope = [];
})));
expectCodes("NEG-SCOPE-OVERLAP", validatePlanBundle(mutatePlan(canonical, (plan) => {
  const overlap = { kind: "repository_path", value: "docs/unplanned-overlap.json", match: "exact" };
  plan.packages[0].allowed_scope.push(clone(overlap));
  plan.packages[0].forbidden_scope.push(clone(overlap));
})));
expectCodes("NEG-SCOPE-PATH-BACKSLASH", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].allowed_scope.push({ kind: "repository_path", value: "bad\\path", match: "exact" });
})));
expectCodes("NEG-SCOPE-PATH-CONTROL", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].allowed_scope.push({ kind: "repository_path", value: "bad\u0000path", match: "exact" });
})));
expectCodes("NEG-STACK-BASE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].stack_base = { kind: "repository_base", package_id: null };
})));
expectCodes("NEG-INTEGRATION-ORDER", validatePlanBundle(mutatePlan(canonical, (plan) => {
  const order = ["WP4", "WP3", "WP5", "WP6"];
  plan.topology.integration_order = order;
  plan.topology.publication_units[0].package_ids = order;
  plan.topology.review_units[0].package_ids = order;
  for (const checkpoint of plan.verification.full_gate_checkpoints) checkpoint.after_package_ids = order;
})));
expectCodes("NEG-INDEPENDENT-BRANCH", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].target_binding.branch = "feat/independent-wp4";
})));
expectCodes("NEG-PUBLICATION-UNRECONSTRUCTABLE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.topology.publication_units[0].artifact_ids.pop();
})));
expectCodes("NEG-REVIEW-UNRECONSTRUCTABLE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.topology.review_units[0].artifact_ids.pop();
})));
expectCodes("NEG-ARTIFACT-OWNERSHIP-CONFLICT", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].expected_artifacts[0].artifact_id = plan.packages[0].expected_artifacts[0].artifact_id;
  const artifactIds = [...new Set(plan.packages.flatMap((workPackage) => workPackage.expected_artifacts.map((artifact) => artifact.artifact_id)))].sort();
  plan.topology.publication_units[0].artifact_ids = artifactIds;
  plan.topology.review_units[0].artifact_ids = artifactIds;
})));
expectCodes("NEG-WORK-PACKAGE-ARTIFACT-ID-DUPLICATE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].artifact_id = plan.packages[0].artifact_id;
})));
expectCodes("NEG-TASK-ID-DUPLICATE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].ordered_tasks[1].task_id = plan.packages[0].ordered_tasks[0].task_id;
})));
expectCodes("NEG-STOP-CONDITION-DUPLICATE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].stop_conditions[1].code = plan.packages[0].stop_conditions[0].code;
})));
expectCodes("NEG-EXPECTED-ARTIFACT-PATH-INVALID", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].expected_artifacts[0].path = "../outside.json";
  plan.packages[0].allowed_scope.push({ kind: "repository_path", value: "../outside.json", match: "exact" });
})));
expectCodes("NEG-EXPECTED-ARTIFACT-OUTSIDE-SCOPE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].expected_artifacts[0].path = "outside/unplanned.json";
})));
expectCodes("NEG-EXPECTED-ARTIFACT-FORBIDDEN", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].expected_artifacts[0].path = "benchmarks/escape.json";
  plan.packages[0].allowed_scope.push({ kind: "repository_path", value: "benchmarks/escape.json", match: "exact" });
})));
expectCodes("NEG-FOCUSED-GATE-MISSING", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.verification.focused_cadence = plan.verification.focused_cadence.filter((entry) => entry.after_package_id !== "WP4");
})));
for (const [caseId, field] of [
  ["NEG-FULL-GATE-PROCEDURE-BLANK", "procedure"],
  ["NEG-FULL-GATE-PURPOSE-BLANK", "purpose"],
]) {
  const context = clone(canonical.context);
  const plan = clone(canonical.plan);
  const gateId = context.non_overridable_gates[0].verification_id;
  const stepIndex = plan.verification.steps.findIndex((step) => step.verification_id === gateId);
  assert.notEqual(stepIndex, -1, `${caseId} fixture must contain the non-overridable full-gate step`);
  context.non_overridable_gates[0][field] = " ";
  plan.verification.steps[stepIndex][field] = " ";
  const bundle = closePlanContextBinding({ ...canonical, context }, plan);
  expectDeterministicIssues(
    caseId,
    () => validateWorkPackagePlanValidationContext(bundle.context, { policy: bundle.policy, decision: bundle.decision }),
    [`$.non_overridable_gates[0].${field}`],
  );
  expectDeterministicIssues(
    caseId,
    () => validatePlanBundle(bundle),
    [`$.verification.steps[${stepIndex}].${field}`],
  );
}
expectCodes("NEG-FULL-CHECKPOINT-MISSING", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.verification.full_gate_checkpoints = plan.verification.full_gate_checkpoints.filter((entry) => entry.checkpoint_id !== "CHECKPOINT-EXACT-HEAD-CI");
})));
expectCodes("NEG-HIDDEN-BLOCKER", validatePlanBundle(mutateContext(canonical, (context) => {
  context.known_blockers.push({ blocker_id: "BLOCKER-CURRENT", status: "open", description: "Current blocker supplied by trusted context." });
})));
{
  const withBlocker = mutateContext(canonical, (context) => {
    context.known_blockers.push({ blocker_id: "BLOCKER-CURRENT", status: "open", description: "Current blocker supplied by trusted context." });
  });
  const downgraded = mutatePlan(withBlocker, (plan) => {
    plan.blockers.push({ blocker_id: "BLOCKER-CURRENT", status: "resolved", description: "Incorrectly downgraded blocker." });
  });
  expectCodes("NEG-BLOCKER-STATUS-DOWNGRADE", validatePlanBundle(downgraded));
}
expectCodes("NEG-HIDDEN-HUMAN-DECISION", validatePlanBundle(mutateContext(canonical, (context) => {
  context.required_human_decisions.push({ decision_id: "DECISION-CURRENT", description: "Current human decision supplied by trusted context.", authority_kind: "human_program_owner" });
})));
expectCodes("NEG-HIDDEN-HUMAN-APPROVAL", validatePlanBundle(mutateContext(canonical, (context) => {
  context.required_human_approvals.push(approvalRecord({ approval_id: "APPROVAL-HIDDEN", status: "required", authority_ref: null }));
})));
expectCodes("NEG-BLOCKER-ID-DUPLICATE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.blockers.push({ blocker_id: "BLOCKER-DUPLICATE", status: "resolved", description: "First record." });
  plan.blockers.push({ blocker_id: "BLOCKER-DUPLICATE", status: "resolved", description: "Second record." });
})));
expectCodes("NEG-DECISION-ID-DUPLICATE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.unresolved_decisions.push({ decision_id: "DECISION-DUPLICATE", description: "First record.", authority_kind: "human_program_owner", status: "resolved" });
  plan.unresolved_decisions.push({ decision_id: "DECISION-DUPLICATE", description: "Second record.", authority_kind: "human_program_owner", status: "resolved" });
})));
{
  const trustedApproval = approvalRecord({ approval_id: "APPROVAL-DUPLICATE" });
  const withApproval = mutateContext(canonical, (context) => context.required_human_approvals.push(clone(trustedApproval)));
  const duplicated = mutatePlan(withApproval, (plan) => {
    plan.human_approvals.push(clone(trustedApproval));
    plan.human_approvals.push(clone(trustedApproval));
  });
  expectCodes("NEG-APPROVAL-ID-DUPLICATE", validatePlanBundle(duplicated));
}
{
  const trustedApproval = approvalRecord();
  const withApproval = mutateContext(canonical, (context) => context.required_human_approvals.push(clone(trustedApproval)));
  const missingAuthority = mutatePlan(withApproval, (plan) => {
    plan.human_approvals.push(approvalRecord({ description: "Approval without authority evidence.", authority_ref: null }));
  });
  expectCodes("NEG-APPROVAL-AUTHORITY-MISSING", validatePlanBundle(missingAuthority));
}
{
  const trustedApproval = approvalRecord();
  const withApproval = mutateContext(canonical, (context) => context.required_human_approvals.push(clone(trustedApproval)));
  const mismatchedAuthority = mutatePlan(withApproval, (plan) => {
    plan.human_approvals.push(approvalRecord({ authority_ref: "attacker:self-asserted" }));
  });
  expectCodes("NEG-APPROVAL-AUTHORITY-MISMATCH", validatePlanBundle(mismatchedAuthority));
}
{
  const requiredApproval = approvalRecord({ status: "required" });
  const withApproval = mutateContext(canonical, (context) => context.required_human_approvals.push(clone(requiredApproval)));
  const selfAsserted = mutatePlan(withApproval, (plan) => plan.human_approvals.push(approvalRecord()));
  expectCodes("NEG-APPROVAL-STATUS-SELF-ASSERTED", validatePlanBundle(selfAsserted));
}
{
  const invalid = clone(canonical.plan);
  invalid.plan_digest = `sha256:${"f".repeat(64)}`;
  expectCodes("NEG-DIGEST-TAMPER", validateWorkPackagePlan(invalid, canonical));
}
{
  const invalid = clone(canonical.decision);
  invalid.decision_id = "EAD-tampered-identity";
  const withoutDigest = clone(invalid);
  delete withoutDigest.decision_digest;
  invalid.decision_digest = canonicalDigest(withoutDigest);
  expectCodes("NEG-IDENTITY-TAMPER", validateEpicAdmissionDecision(invalid, { policy: canonical.policy }));
}
expectCodes("NEG-STALE", validatePlanBundle(mutateContext(canonical, (context) => {
  context.current_plan_ref.plan_revision = canonical.plan.plan_revision + 1;
})));
expectCodes("NEG-PLAN-CONTENT-STALE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[0].ordered_tasks[0].description = "Meaning changed without a trusted context revision.";
}, { preserveContextBinding: true })));
expectCodes("NEG-GATE-DEFINITION-WEAKENED", validatePlanBundle(mutatePlan(canonical, (plan) => {
  const gate = plan.verification.steps.find((step) => step.verification_id === "GATE-EXACT-HEAD-CI");
  gate.procedure = "true";
  gate.purpose = "Bypass exact-head CI.";
})));
{
  let staleCount = mutateContext(canonical, (context) => {
    context.upstream_artifacts.find((artifact) => artifact.artifact_id === "SPEC-275-SLICE-1").item_ids.push("AC-275-S1-10-NEW");
  });
  staleCount = mutatePlan(staleCount, (plan) => {
    plan.acceptance_ownership.push({
      acceptance_ref: { artifact_id: "SPEC-275-SLICE-1", item_id: "AC-275-S1-10-NEW", observed_revision: 1 },
      mode: "exclusive",
      owner_package_ids: ["WP4"],
      shared_reason: null,
    });
  });
  expectCodes("NEG-ADMISSION-AC-COUNT-STALE", validatePlanBundle(staleCount));
}
{
  const substituted = mutateContext(canonical, (context) => {
    const itemIds = context.upstream_artifacts.find((artifact) => artifact.artifact_id === "SPEC-275-SLICE-1").item_ids;
    itemIds[itemIds.length - 1] = "AC-275-S1-09-SUBSTITUTED";
  });
  const updatedOwnership = mutatePlan(substituted, (plan) => {
    plan.acceptance_ownership[plan.acceptance_ownership.length - 1].acceptance_ref.item_id = "AC-275-S1-09-SUBSTITUTED";
  });
  expectCodes("NEG-ADMISSION-AC-REGISTRY-STALE", validatePlanBundle(updatedOwnership));
}
expectCodes("NEG-ORDERED-DEPENDENCY-SIGNAL-MISMATCH", validatePlanBundle(mutatePlan(canonical, (plan) => {
  for (const workPackage of plan.packages) workPackage.depends_on_package_ids = [];
})));
expectCodes("NEG-STACK-DEPENDENCY-CLOSURE", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[2].depends_on_package_ids = ["WP3"];
})));
{
  const revisionOneContextDraft = clone(canonical.context);
  revisionOneContextDraft.context_revision = 1;
  delete revisionOneContextDraft.supersedes_context_ref;
  delete revisionOneContextDraft.supersedes_plan_ref;
  delete revisionOneContextDraft.revision_reason;
  const revisionOnePlanDraft = clone(canonical.plan);
  revisionOnePlanDraft.plan_revision = 1;
  delete revisionOnePlanDraft.supersedes_plan_ref;
  delete revisionOnePlanDraft.revision_reason;
  for (const workPackage of revisionOnePlanDraft.packages) {
    workPackage.revision = 1;
    workPackage.plan_binding.plan_revision = 1;
  }
  const revisionOne = closePlanContextBinding({ ...canonical, context: revisionOneContextDraft }, revisionOnePlanDraft);
  assert.deepEqual(validateWorkPackagePlan(revisionOne.plan, {
    policy: revisionOne.policy,
    decision: revisionOne.decision,
    context: revisionOne.context,
  }), [], "a Schema 1.2 revision 1 plan/context pair must be valid without predecessor references");

  const revisionTwoContextDraft = clone(revisionOne.context);
  revisionTwoContextDraft.context_revision = 2;
  revisionTwoContextDraft.supersedes_context_ref = {
    context_id: revisionOne.context.context_id,
    context_revision: revisionOne.context.context_revision,
    context_digest: revisionOne.context.context_digest,
  };
  revisionTwoContextDraft.supersedes_plan_ref = {
    plan_id: revisionOne.plan.plan_id,
    plan_revision: revisionOne.plan.plan_revision,
    plan_digest: revisionOne.plan.plan_digest,
  };
  revisionTwoContextDraft.revision_reason = "Publish the first accepted successor without rewriting revision 1.";
  const revisionTwoPlanDraft = clone(revisionOne.plan);
  revisionTwoPlanDraft.plan_revision = 2;
  revisionTwoPlanDraft.supersedes_plan_ref = {
    plan_id: revisionOne.plan.plan_id,
    plan_revision: revisionOne.plan.plan_revision,
    plan_digest: revisionOne.plan.plan_digest,
  };
  revisionTwoPlanDraft.revision_reason = revisionTwoContextDraft.revision_reason;
  for (const workPackage of revisionTwoPlanDraft.packages) {
    workPackage.revision = 2;
    workPackage.plan_binding.plan_revision = 2;
  }
  const revisionTwo = closePlanContextBinding({ ...revisionOne, context: revisionTwoContextDraft }, revisionTwoPlanDraft);
  expectDeterministicIssues(
    "POS-REVISION-ONE-TO-TWO",
    () => validateWorkPackagePlan(revisionTwo.plan, {
      policy: revisionTwo.policy,
      decision: revisionTwo.decision,
      context: revisionTwo.context,
      previousContext: revisionOne.context,
      previousPlan: revisionOne.plan,
    }),
    [],
  );

  const buildExactRevisionTwoSuccessor = (previous, reason, template = previous) => {
    const previousPlanRef = {
      plan_id: previous.plan.plan_id,
      plan_revision: previous.plan.plan_revision,
      plan_digest: previous.plan.plan_digest,
    };
    const successorContextDraft = clone(template.context);
    successorContextDraft.context_revision = previous.context.context_revision + 1;
    successorContextDraft.supersedes_context_ref = {
      context_id: previous.context.context_id,
      context_revision: previous.context.context_revision,
      context_digest: previous.context.context_digest,
    };
    successorContextDraft.supersedes_plan_ref = previousPlanRef;
    successorContextDraft.revision_reason = reason;
    const successorPlanDraft = clone(template.plan);
    successorPlanDraft.plan_revision = previous.plan.plan_revision + 1;
    successorPlanDraft.supersedes_plan_ref = previousPlanRef;
    successorPlanDraft.revision_reason = reason;
    for (const workPackage of successorPlanDraft.packages) {
      workPackage.revision = successorPlanDraft.plan_revision;
      workPackage.plan_binding.plan_revision = successorPlanDraft.plan_revision;
    }
    return closePlanContextBinding({ ...template, context: successorContextDraft }, successorPlanDraft);
  };
  const revisionOnePlanRef = {
    plan_id: revisionOne.plan.plan_id,
    plan_revision: revisionOne.plan.plan_revision,
    plan_digest: revisionOne.plan.plan_digest,
  };
  const revisionOneContextRef = {
    context_id: revisionOne.context.context_id,
    context_revision: revisionOne.context.context_revision,
    context_digest: revisionOne.context.context_digest,
  };

  const invalidRevisionOnePlanDraft = clone(revisionOne.plan);
  invalidRevisionOnePlanDraft.supersedes_plan_ref = revisionOnePlanRef;
  invalidRevisionOnePlanDraft.revision_reason = "Schema-invalid lineage payload on a revision 1 predecessor plan.";
  const invalidRevisionOnePlan = closePlanContextBinding(revisionOne, invalidRevisionOnePlanDraft);
  const invalidRevisionOnePlanSuccessor = buildExactRevisionTwoSuccessor(
    invalidRevisionOnePlan,
    "Reject a revision 1 predecessor plan that claims lineage.",
  );
  expectDeterministicIssues(
    "NEG-PREVIOUS-REVISION-ONE-PLAN-LINEAGE-PAYLOAD",
    () => validateWorkPackagePlan(invalidRevisionOnePlanSuccessor.plan, {
      policy: invalidRevisionOnePlanSuccessor.policy,
      decision: invalidRevisionOnePlanSuccessor.decision,
      context: invalidRevisionOnePlanSuccessor.context,
      previousContext: invalidRevisionOnePlan.context,
      previousPlan: invalidRevisionOnePlan.plan,
    }),
    ["$.supersedes_plan_ref"],
  );

  const invalidRevisionOneContextDraft = clone(revisionOne.context);
  invalidRevisionOneContextDraft.supersedes_context_ref = revisionOneContextRef;
  invalidRevisionOneContextDraft.supersedes_plan_ref = revisionOnePlanRef;
  invalidRevisionOneContextDraft.revision_reason = "Schema-invalid lineage payload on a revision 1 predecessor context.";
  const invalidRevisionOneContext = closePlanContextBinding(
    { ...revisionOne, context: invalidRevisionOneContextDraft },
    revisionOne.plan,
  );
  const invalidRevisionOneContextSuccessor = buildExactRevisionTwoSuccessor(
    invalidRevisionOneContext,
    "Reject a revision 1 predecessor context that claims lineage.",
  );
  expectDeterministicIssues(
    "NEG-PREVIOUS-REVISION-ONE-CONTEXT-LINEAGE-PAYLOAD",
    () => validateWorkPackagePlan(invalidRevisionOneContextSuccessor.plan, {
      policy: invalidRevisionOneContextSuccessor.policy,
      decision: invalidRevisionOneContextSuccessor.decision,
      context: invalidRevisionOneContextSuccessor.context,
      previousContext: invalidRevisionOneContext.context,
      previousPlan: invalidRevisionOneContext.plan,
    }),
    ["$.supersedes_plan_ref"],
  );

  const downgradedPlan = clone(revisionOne.plan);
  downgradedPlan.schema_version = "1.0.0";
  downgradedPlan.unrecognized_legacy_payload = true;
  downgradedPlan.plan_digest = canonicalDigestExcluding(downgradedPlan, "plan_digest");
  const downgradedPlanContextDraft = clone(revisionOne.context);
  downgradedPlanContextDraft.current_plan_ref.plan_content_digest = deriveWorkPackagePlanContentDigest(downgradedPlan);
  const downgradedPlanContext = sealWorkPackagePlanValidationContext(downgradedPlanContextDraft);
  downgradedPlan.validation_context_ref.context_digest = downgradedPlanContext.context_digest;
  downgradedPlan.plan_digest = canonicalDigestExcluding(downgradedPlan, "plan_digest");
  assert.equal(
    downgradedPlanContext.current_plan_ref.plan_content_digest,
    deriveWorkPackagePlanContentDigest(downgradedPlan),
    "the downgraded predecessor plan must retain an exact content binding",
  );
  const downgradedPlanPair = { ...revisionOne, context: downgradedPlanContext, plan: downgradedPlan };
  const downgradedPlanSuccessor = buildExactRevisionTwoSuccessor(
    downgradedPlanPair,
    "Reject an arbitrary predecessor that claims a legacy plan Schema.",
    revisionOne,
  );
  expectDeterministicIssues(
    "NEG-PREVIOUS-PLAN-SCHEMA-DOWNGRADE",
    () => validateWorkPackagePlan(downgradedPlanSuccessor.plan, {
      policy: downgradedPlanSuccessor.policy,
      decision: downgradedPlanSuccessor.decision,
      context: downgradedPlanSuccessor.context,
      previousContext: downgradedPlanPair.context,
      previousPlan: downgradedPlanPair.plan,
    }),
    ["$.supersedes_plan_ref"],
  );

  const downgradedContext = clone(revisionOne.context);
  downgradedContext.schema_version = "1.0.0";
  downgradedContext.unrecognized_legacy_payload = true;
  downgradedContext.context_digest = canonicalDigestExcluding(downgradedContext, "context_digest");
  const downgradedContextPlan = clone(revisionOne.plan);
  downgradedContextPlan.validation_context_ref.context_digest = downgradedContext.context_digest;
  downgradedContextPlan.plan_digest = canonicalDigestExcluding(downgradedContextPlan, "plan_digest");
  assert.equal(
    downgradedContext.current_plan_ref.plan_content_digest,
    deriveWorkPackagePlanContentDigest(downgradedContextPlan),
    "the downgraded predecessor context must retain an exact plan content binding",
  );
  const downgradedContextPair = { ...revisionOne, context: downgradedContext, plan: downgradedContextPlan };
  const downgradedContextSuccessor = buildExactRevisionTwoSuccessor(
    downgradedContextPair,
    "Reject an arbitrary predecessor that claims a legacy context Schema.",
    revisionOne,
  );
  expectDeterministicIssues(
    "NEG-PREVIOUS-CONTEXT-SCHEMA-DOWNGRADE",
    () => validateWorkPackagePlan(downgradedContextSuccessor.plan, {
      policy: downgradedContextSuccessor.policy,
      decision: downgradedContextSuccessor.decision,
      context: downgradedContextSuccessor.context,
      previousContext: downgradedContextPair.context,
      previousPlan: downgradedContextPair.plan,
    }),
    ["$.supersedes_plan_ref"],
  );
}
{
  const revisionOne = clone(canonical.context);
  revisionOne.context_revision = 1;
  expectCodes("NEG-REVISION-ONE-LINEAGE-PAYLOAD", validateWorkPackagePlanValidationContext(sealWorkPackagePlanValidationContext(revisionOne), {
    policy: canonical.policy,
    decision: canonical.decision,
  }));
}
{
  const colonProperty = clone(canonical.context);
  colonProperty["bad:key"] = true;
  const issues = validateWorkPackagePlanValidationContext(sealWorkPackagePlanValidationContext(colonProperty), {
    policy: canonical.policy,
    decision: canonical.decision,
  });
  assert.equal(issues.some(({ path }) => path === '$["bad:key"]'), true, "deterministic Schema paths must preserve colons in property names");
}
{
  const mixedInvalid = clone(canonical.context);
  mixedInvalid.context_revision = 1;
  mixedInvalid["bad:key"] = true;
  const issues = validateWorkPackagePlanValidationContext(sealWorkPackagePlanValidationContext(mixedInvalid), {
    policy: canonical.policy,
    decision: canonical.decision,
  });
  assert.equal(issues.every(({ code }) => code === "SCHEMA_INVALID"), true, "lineage compatibility must not mask independent Schema failures");
  assert.equal(issues.some(({ path }) => path === '$["bad:key"]'), true, "mixed-invalid Schema path must remain exact");
}
{
  const alteredPreviousPlan = clone(canonical.plan);
  alteredPreviousPlan.packages[0].ordered_tasks[0].description = "Resealed predecessor meaning that its trusted context did not accept.";
  const sealedAlteredPreviousPlan = sealWorkPackagePlan(alteredPreviousPlan);
  const successorContext = clone(canonical.context);
  successorContext.context_revision += 1;
  successorContext.supersedes_context_ref = {
    context_id: canonical.context.context_id,
    context_revision: canonical.context.context_revision,
    context_digest: canonical.context.context_digest,
  };
  successorContext.supersedes_plan_ref = {
    plan_id: sealedAlteredPreviousPlan.plan_id,
    plan_revision: sealedAlteredPreviousPlan.plan_revision,
    plan_digest: sealedAlteredPreviousPlan.plan_digest,
  };
  successorContext.revision_reason = "Adversarial lineage probe.";
  const successorPlan = clone(canonical.plan);
  successorPlan.plan_revision += 1;
  successorPlan.supersedes_plan_ref = {
    plan_id: sealedAlteredPreviousPlan.plan_id,
    plan_revision: sealedAlteredPreviousPlan.plan_revision,
    plan_digest: sealedAlteredPreviousPlan.plan_digest,
  };
  successorPlan.revision_reason = "Adversarial lineage probe.";
  for (const workPackage of successorPlan.packages) {
    workPackage.revision += 1;
    workPackage.plan_binding.plan_revision = successorPlan.plan_revision;
  }
  const successor = closePlanContextBinding({
    ...canonical,
    context: successorContext,
    previousContext: canonical.context,
    previousPlan: sealedAlteredPreviousPlan,
  }, successorPlan);
  expectCodes("NEG-PREVIOUS-PLAN-CONTENT-MISMATCH", validatePlanBundle(successor));
}
expectCodes("NEG-CROSS-PLAN", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].plan_binding.plan_id = "WPP-other-plan";
})));
expectCodes("NEG-CROSS-REPOSITORY", validatePlanBundle(mutatePlan(canonical, (plan) => {
  plan.packages[1].target_binding.repository_id = "other/repository";
})));
{
  const partial = clone(canonical.plan);
  delete partial.topology;
  expectCodes("NEG-PARTIAL", validateWorkPackagePlan(partial, canonical));
}
expectCodes("NEG-PROPOSED-NOT-EXECUTABLE", validateWorkPackagePlanExecutable(mutatePlan(canonical, (plan) => {
  plan.lifecycle_state = "proposed";
}).plan, mutatePlan(canonical, (plan) => {
  plan.lifecycle_state = "proposed";
})));
{
  const bundle = mutatePlan(canonical, (plan) => {
    plan.blockers.push({ blocker_id: "BLOCKER-EXECUTABLE", status: "open", description: "Open plan blocker." });
  });
  expectCodes("NEG-EXECUTABLE-OPEN-BLOCKER", validateWorkPackagePlanExecutable(bundle.plan, bundle));
}
{
  const bundle = mutatePlan(canonical, (plan) => {
    plan.unresolved_decisions.push({ decision_id: "DECISION-EXECUTABLE", description: "Unresolved plan decision.", authority_kind: "human_program_owner", status: "unresolved" });
  });
  expectCodes("NEG-EXECUTABLE-UNRESOLVED-DECISION", validateWorkPackagePlanExecutable(bundle.plan, bundle));
}
{
  const requiredApproval = approvalRecord({ approval_id: "APPROVAL-EXECUTABLE", description: "Required plan approval.", status: "required", authority_ref: null });
  const withContext = mutateContext(canonical, (context) => context.required_human_approvals.push(clone(requiredApproval)));
  const bundle = mutatePlan(withContext, (plan) => plan.human_approvals.push(clone(requiredApproval)));
  expectCodes("NEG-EXECUTABLE-APPROVAL-REQUIRED", validateWorkPackagePlanExecutable(bundle.plan, bundle));
}
{
  const humanDecision = buildEpicAdmissionDecision({ policy: canonical.policy, kind: "unresolved" });
  const bundle = rebindDecision(canonical, humanDecision);
  expectCodes("NEG-EXECUTABLE-ADMISSION-HUMAN", validateWorkPackagePlanExecutable(bundle.plan, bundle));
}
{
  let duplicateKeyCode = null;
  try {
    parseJsonRejectDuplicateKeys('{"schema_version":"1.0.0","schema_version":"1.0.0"}', "duplicate-key fixture");
  } catch (error) {
    duplicateKeyCode = error.code === "DUPLICATE_JSON_OBJECT_KEY" ? "DUPLICATE_JSON_KEY" : error.code;
  }
  expectCodes("NEG-DUPLICATE-KEY", [{ code: duplicateKeyCode }]);
}
{
  const invalid = clone(canonical.plan);
  invalid.unreviewed_extension = true;
  expectCodes("NEG-UNKNOWN-FIELD", validateWorkPackagePlan(sealWorkPackagePlan(invalid), canonical));
}
{
  const invalid = clone(canonical.plan);
  invalid.lifecycle_state = "executing";
  expectCodes("NEG-UNKNOWN-STATE", validateWorkPackagePlan(sealWorkPackagePlan(invalid), canonical));
}
for (const decision of [null, {}]) {
  expectDeterministicIssues(
    "NEG-ADMISSION-DECISION-DEPENDENCY-MALFORMED",
    () => validateWorkPackagePlan(canonical.plan, { ...canonical, decision }),
    ["$.admission_decision_ref"],
  );
  expectDeterministicIssues(
    "NEG-ADMISSION-DECISION-DEPENDENCY-MALFORMED",
    () => validateWorkPackagePlanValidationContext(canonical.context, { policy: canonical.policy, decision }),
    ["$.current_admission_decision_ref"],
  );
}
expectDeterministicIssues(
  "NEG-POLICY-DEPENDENCY-MALFORMED",
  () => validateWorkPackagePlanValidationContext(canonical.context, { policy: {}, decision: canonical.decision }),
  ["$.current_policy_ref"],
);
expectDeterministicIssues(
  "NEG-POLICY-DEPENDENCY-MALFORMED",
  () => validateWorkPackagePlan(canonical.plan, { ...canonical, policy: {} }),
  ["$.admission_decision_ref"],
);
for (const malformedPrevious of [
  { previousPlan: {} },
  { previousContext: {} },
]) {
  expectDeterministicIssues(
    "NEG-PREVIOUS-REVISION-DEPENDENCY-MALFORMED",
    () => validateWorkPackagePlan(canonical.plan, { ...canonical, ...malformedPrevious }),
    ["$.supersedes_plan_ref"],
  );
}
expectDeterministicIssues(
  "NEG-REPOSITORY-DECISION-MALFORMED",
  () => validateRepositoryEpicAdmissionWorkPackagePlan({ root, paths: { decision: "manifest.json" } }).issues,
  ["$paths.decision"],
);
expectDeterministicIssues(
  "NEG-REPOSITORY-POLICY-MALFORMED",
  () => validateRepositoryEpicAdmissionWorkPackagePlan({ root, paths: { policy: "manifest.json" } }).issues,
  ["$paths.policy"],
);
for (const [caseId, key, expectedPath] of [
  ["NEG-REPOSITORY-HISTORICAL-R1-CONTEXT-MALFORMED", "firstContext", "$paths.firstContext"],
  ["NEG-REPOSITORY-HISTORICAL-R1-PLAN-MALFORMED", "firstPlan", "$paths.firstPlan"],
  ["NEG-REPOSITORY-HISTORICAL-R2-CONTEXT-MALFORMED", "previousContext", "$paths.previousContext"],
  ["NEG-REPOSITORY-HISTORICAL-R2-PLAN-MALFORMED", "previousPlan", "$paths.previousPlan"],
]) {
  expectDeterministicIssues(
    caseId,
    () => validateRepositoryEpicAdmissionWorkPackagePlan({ root, paths: { [key]: "manifest.json" } }).issues,
    [expectedPath],
  );
}
expectDeterministicIssues(
  "NEG-REPOSITORY-CATALOG-MALFORMED",
  () => {
    const result = validateRepositoryEpicAdmissionWorkPackagePlan({ root, paths: { cases: "manifest.json" } });
    assert.equal(result.caseCount, 0, "malformed fixture catalog must not report admitted cases");
    return result.issues;
  },
  ["$.cases"],
);

const repositoryResult = validateRepositoryEpicAdmissionWorkPackagePlan({ root });
assert.deepEqual(repositoryResult.issues, [], "checked-in repository artifacts must validate");
assert.equal(repositoryResult.plan.plan_id, canonical.plan.plan_id);
assert.equal(repositoryResult.plan.plan_digest, canonical.plan.plan_digest);
assert.equal(repositoryResult.caseCount, catalog.cases.length);
assert.deepEqual([...executedCaseIds].sort(), catalog.cases.map((entry) => entry.case_id).sort(), "every catalog case must execute an exact oracle");

console.log(`Epic admission and Work Package Plan tests passed: ${catalog.cases.length} cases, plan=${canonical.plan.plan_id}, digest=${canonical.plan.plan_digest}`);
