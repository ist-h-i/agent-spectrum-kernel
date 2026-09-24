// Canonical boundary controller. Checkpoint/evidence authority stays in Slice 2/#274.
import { resolve } from "node:path";
import { validateMetricsEvent } from "./execution-envelope.mjs";
import { canonicalDigest, stableCanonicalJson, putContentAddressedJson, readContentAddressedJson, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { persistSessionCheckpoint, validateSessionResume } from "./session-checkpoint.mjs";
import { evaluateEpicAdmission, validateWorkPackagePlan, validateWorkPackagePlanExecutable } from "./epic-admission-work-package-plan.mjs";
import { assertRolloverArtifact, completeCounter, evaluateRolloverPolicy } from "./context-runtime-observation.mjs";

const fail = (code) => { throw new Error(code); };
function authorityBundle(bundle) {
  if (!bundle || typeof bundle !== "object") fail("PLAN_INVALID");
  const { plan, policy, decision, context, previousPlan, previousContext, previousPolicy, previousDecision } = bundle;
  return { plan, policy, decision, context, previousPlan, previousContext, previousPolicy, previousDecision };
}
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
function save(storeRoot, artifact) {
  const { digest } = putContentAddressedJson({ storeRoot, artifact, maximumBytes: 65536 });
  if (!equal(readContentAddressedJson({ storeRoot, digest, maximumBytes: 65536 }).value, artifact)) fail("ROLLOVER_READBACK_FAILED");
  return digest;
}
function read(storeRoot, digest, kind) {
  return assertRolloverArtifact(readContentAddressedJson({ storeRoot, digest, maximumBytes: 65536 }).value, kind);
}
const scopeFor = (pkg) => canonicalDigest({ repository_id: pkg.repository.repository_id, plan_id: pkg.plan_ref.plan_id, package_id: pkg.active_package_id });

/** Admission before a host runner can mutate. Small tasks need no checkpoint. */
export function runtimePreflight({ admission, planBundle = null }) {
  const decision = evaluateEpicAdmission(admission);
  if (decision.effective_decision === "ordinary_execution_allowed") return { status: "ordinary_execution_allowed", decision };
  if (!planBundle) return { status: decision.effective_decision, decision };
  // A saved waiting plan is allowed; only the existing executable validator may
  // authorize mutation. This preflight never turns waiting state into approval.
  if (validateWorkPackagePlan(planBundle.plan, authorityBundle(planBundle)).length) fail("PLAN_INVALID");
  if (decision.decision_digest !== planBundle.decision.decision_digest) fail("ADMISSION_PLAN_MISMATCH");
  const issues = validateWorkPackagePlanExecutable(planBundle.plan, authorityBundle(planBundle));
  return { status: issues.length ? "blocked" : "work_package_execution_allowed", decision, reasons: issues.map((entry) => entry.code) };
}

function continuationFor(plan, restartPackage) {
  const workPackage = plan.packages.find(entry => entry.package_id === restartPackage.active_package_id);
  if (!workPackage) fail("WORK_PACKAGE_MISSING");
  const continuation = {
    goal_id: plan.goal_id, plan_ref: restartPackage.plan_ref, package_id: workPackage.package_id,
    next_task: restartPackage.next_action.kind === "ordered_task" ? workPackage.ordered_tasks.find(entry => entry.task_id === restartPackage.next_action.task_id) : null,
    allowed_scope: workPackage.allowed_scope, forbidden_scope: workPackage.forbidden_scope,
    expected_artifacts: workPackage.expected_artifacts, expected_evidence_ids: workPackage.expected_evidence_ids,
    acceptance_ownership: plan.acceptance_ownership.filter(entry => entry.owner_package_ids.includes(workPackage.package_id)),
    stop_conditions: workPackage.stop_conditions, upstream_refs: workPackage.upstream_refs,
  };
  if (continuation.next_task === undefined || Buffer.byteLength(stableCanonicalJson(continuation)) > 16384) fail("CONTINUATION_UNBOUNDED_OR_MISSING");
  return continuation;
}

function previousReceipt(options, scopeDigest) {
  if (!options.previousReceiptDigest) return null;
  const { receipt, binding: prior } = inspectRolloverReceipt({ storeRoot: options.storeRoot, receiptDigest: options.previousReceiptDigest });
  if (receipt.scope_digest !== scopeDigest || prior.scope_digest !== scopeDigest ||
      prior.policy_digest !== canonicalDigest(options.policy) || prior.runtime_policy_digest !== options.runtimePolicyDigest ||
      !equal(receipt.target_session_identity, options.observation.session_identity) ||
      !equal(receipt.target_process_identity, options.observation.process_identity)) fail("ROLLOVER_LINEAGE_MISMATCH");
  return receipt;
}

/** Throws before contacting a runtime if publication, read-back or authority fails. */
export function prepareContextRollover(options) {
  const { policy, observation, runtimePolicyDigest, planBundle, storeRoot } = options;
  const decision = evaluateRolloverPolicy(policy, observation, { operatorRequest: options.operatorRequest ?? false });
  if (observation.runtime_policy_digest !== runtimePolicyDigest) fail("RUNTIME_POLICY_MISMATCH");
  if (!planBundle || validateWorkPackagePlan(planBundle.plan, authorityBundle(planBundle)).length) fail("PLAN_INVALID");
  if (decision.status !== "checkpoint_required") return { ...decision, state_valid: true, restart_package: null };
  // The existing publisher checks real Git bytes, DAG/control state and #274 refs,
  // validates output locations, writes CAS and reopens it. No second snapshot engine.
  const saved = persistSessionCheckpoint({ ...options, rolloverReason: decision.trigger_reasons.includes("operator_request") ? "operator_request" : "context_pressure" });
  const resume = validateSessionResume({ ...options, checkpointDigest: saved.checkpointDigest });
  if (!resume.state_valid) fail("CHECKPOINT_INVALID");
  const scopeDigest = scopeFor(resume.restart_package);
  const previous = previousReceipt(options, scopeDigest);
  const sequence = previous ? previous.sequence + 1 : 1;
  if (sequence > policy.maximum_rollovers) fail("ROLLOVER_LIMIT_REACHED");
  if (previous && (!completeCounter(observation.counters.runtime_steps) || observation.counters.runtime_steps.value < policy.minimum_runtime_steps_between_rollovers)) fail("ROLLOVER_TOO_SOON_OR_UNOBSERVED");
  save(storeRoot, policy);
  const binding = assertRolloverArtifact({
    artifact_kind: "ask_context_rollover_binding", schema_version: "1.0.0", adapter_id: observation.adapter_id,
    policy_digest: decision.policy_digest, policy_id: policy.policy_id, policy_revision: policy.revision,
    runtime_policy_digest: runtimePolicyDigest,
    source_process_identity: observation.process_identity, source_session_identity: observation.session_identity,
    checkpoint_digest: saved.checkpointDigest, snapshot_digest: saved.snapshotDigest,
    restart_package_digest: resume.restart_package_digest, continuation_digest: canonicalDigest(continuationFor(planBundle.plan, resume.restart_package)), scope_digest: scopeDigest, sequence,
    previous_receipt_digest: options.previousReceiptDigest ?? null, trigger_reasons: decision.trigger_reasons,
    observation_digest: policy.telemetry_enabled ? save(storeRoot, observation) : null,
  }, "ask_context_rollover_binding");
  const bindingDigest = save(storeRoot, binding);
  return { ...validateContextRolloverResume({ ...options, bindingDigest }), trigger_reasons: decision.trigger_reasons };
}

/** The expected binding digest is out-of-band authority, never a mutable "latest". */
export function validateContextRolloverResume(options) {
  const { storeRoot, bindingDigest, policy, runtimePolicyDigest } = options;
  assertRolloverArtifact(policy, "ask_context_rollover_policy");
  const binding = read(storeRoot, bindingDigest, "ask_context_rollover_binding");
  if (binding.policy_digest !== canonicalDigest(policy) || binding.policy_revision !== policy.revision || binding.policy_id !== policy.policy_id ||
      binding.runtime_policy_digest !== runtimePolicyDigest) fail("ROLLOVER_POLICY_MISMATCH");
  const storedPolicy = read(storeRoot, binding.policy_digest, "ask_context_rollover_policy");
  if (!equal(policy, storedPolicy) || binding.sequence > policy.maximum_rollovers) fail("ROLLOVER_POLICY_MISMATCH");
  if (policy.telemetry_enabled !== (binding.observation_digest !== null)) fail("TELEMETRY_POLICY_MISMATCH");
  if (binding.observation_digest) {
    const observation = read(storeRoot, binding.observation_digest, "ask_runtime_observation");
    if (observation.runtime_policy_digest !== runtimePolicyDigest || observation.adapter_id !== binding.adapter_id ||
        !equal(observation.session_identity, binding.source_session_identity) || !equal(observation.process_identity, binding.source_process_identity)) fail("OBSERVATION_TRANSPLANT");
  }
  let child = binding;
  for (let sequence = binding.sequence; sequence > 1; sequence--) {
    if (!child.previous_receipt_digest) fail("ROLLOVER_LINEAGE_MISSING");
    const previous = inspectRolloverReceipt({ storeRoot, receiptDigest: child.previous_receipt_digest });
    if (previous.binding.sequence !== sequence - 1 || previous.binding.scope_digest !== binding.scope_digest ||
        previous.binding.policy_digest !== binding.policy_digest || previous.binding.runtime_policy_digest !== binding.runtime_policy_digest ||
        !equal(previous.receipt.target_process_identity, child.source_process_identity) || !equal(previous.receipt.target_session_identity, child.source_session_identity)) fail("ROLLOVER_LINEAGE_MISMATCH");
    child = previous.binding;
  }
  if (child.previous_receipt_digest !== null) fail("ROLLOVER_LINEAGE_INVALID");
  const resume = validateSessionResume({ ...options, checkpointDigest: binding.checkpoint_digest });
  if (!resume.state_valid || resume.restart_package_digest !== binding.restart_package_digest ||
      resume.restart_package.snapshot_digest !== binding.snapshot_digest || scopeFor(resume.restart_package) !== binding.scope_digest) fail("CHECKPOINT_INVALID");
  const continuation = continuationFor(options.planBundle.plan, resume.restart_package);
  if (canonicalDigest(continuation) !== binding.continuation_digest) fail("CONTINUATION_BINDING_MISMATCH");
  return {
    ...resume, binding_digest: bindingDigest, binding, continuation,
    next_executable_action: { kind: resume.status === "blocked" ? "await_control_resolution" : "validate_in_fresh_context", binding_digest: bindingDigest },
    source_context_may_be_discarded: false,
  };
}
function authorizationFor(binding, bindingDigest, processIdentity, sessionIdentity) {
  return { artifact_kind: "ask_context_continuation_authorization", schema_version: "1.0.0", binding_digest: bindingDigest,
    restart_package_digest: binding.restart_package_digest, continuation_digest: binding.continuation_digest, runtime_policy_digest: binding.runtime_policy_digest,
    target_process_identity: processIdentity, target_session_identity: sessionIdentity };
}
/** Inspect historical receipt closure, not current-target verification authority. */
export function inspectRolloverReceipt({ storeRoot, receiptDigest }) {
  const receipt = read(storeRoot, receiptDigest, "ask_context_rollover_receipt");
  const binding = read(storeRoot, receipt.binding_digest, "ask_context_rollover_binding");
  const authorization = readContentAddressedJson({ storeRoot, digest: receipt.authorization_digest, maximumBytes: 65536 }).value;
  const snapshot = readContentAddressedJson({ storeRoot, digest: binding.snapshot_digest }).value;
  const checkpoint = readContentAddressedJson({ storeRoot, digest: binding.checkpoint_digest }).value;
  if (receipt.scope_digest !== binding.scope_digest || receipt.sequence !== binding.sequence ||
      !equal(authorization, authorizationFor(binding, receipt.binding_digest, receipt.target_process_identity, receipt.target_session_identity)) ||
      receipt.input_digest !== canonicalDigest({ authorization_digest: receipt.authorization_digest, restart_package_digest: binding.restart_package_digest }) ||
      checkpoint.snapshot_ref?.digest !== binding.snapshot_digest || snapshot.artifact_kind !== "ask_repository_snapshot") fail("ROLLOVER_RECEIPT_MISMATCH");
  return { receipt, binding, snapshot };
}

async function bounded(call, milliseconds) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(call), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("RUNTIME_OUTCOME_UNCONFIRMED")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/** adapter is trusted host code, not caller-authored JSON claiming capability. */
export async function executeContextRollover(options, adapter = null) {
  let prepared;
  try { prepared = prepareContextRollover(options); }
  catch { return { status: "blocked", reasons: ["CHECKPOINT_PUBLICATION_OR_VALIDATION_FAILED"], source_context_may_be_discarded: false, restart_package: null }; }
  if (prepared.status !== "context_rollover_required" || !adapter) return prepared;
  const binding = prepared.binding;
  if (adapter.adapterId !== binding.adapter_id || adapter.runtimePolicyDigest !== binding.runtime_policy_digest ||
      binding.source_session_identity.status !== "observed" || binding.source_process_identity.status !== "observed") {
    return { ...prepared, reasons: ["FRESH_CONTEXT_UNAVAILABLE_OR_UNVERIFIED"] };
  }
  try {
    // Durable per-scope/sequence claim remains on timeout/crash. Never silently
    // retry a possible launch, even after host process death or changed checkpoint.
    const claim = writeCanonicalJsonNoReplace({
      outputPath: resolve(options.storeRoot, "rollover-claims", binding.scope_digest.slice(7), `${binding.sequence}.json`),
      artifact: { binding_digest: prepared.binding_digest, sequence: binding.sequence }, label: "rollover launch claim",
    });
    if (!claim.created) fail("ROLLOVER_ALREADY_CLAIMED");
    validateContextRolloverResume({ ...options, bindingDigest: prepared.binding_digest });
    const target = await bounded(() => adapter.createFreshContext(), options.policy.runtime_timeout_ms);
    // Normalize/validate identities through the closed observation schema.
    assertRolloverArtifact({ ...options.observation, process_identity: target.processIdentity, session_identity: target.sessionIdentity }, "ask_runtime_observation");
    if (target.processIdentity.status !== "observed" || target.sessionIdentity.status !== "observed" ||
        equal(target.sessionIdentity, binding.source_session_identity) || target.runtimePolicyDigest !== binding.runtime_policy_digest) fail("FRESH_CONTEXT_IDENTITY_INVALID");
    const checked = validateContextRolloverResume({ ...options, bindingDigest: prepared.binding_digest });
    if (checked.status !== "context_rollover_required") fail("RESUME_BLOCKED");
    const authorization = authorizationFor(binding, prepared.binding_digest, target.processIdentity, target.sessionIdentity);
    const authorizationDigest = save(options.storeRoot, authorization);
    const inputDigest = canonicalDigest({ authorization_digest: authorizationDigest, restart_package_digest: binding.restart_package_digest });
    const acknowledgement = await bounded(() => adapter.continueFromCheckpoint({ target, authorization, authorizationDigest, restartPackage: checked.restart_package, continuation: checked.continuation, inputDigest }), options.policy.runtime_timeout_ms);
    if (acknowledgement.inputDigest !== inputDigest || !equal(acknowledgement.sessionIdentity, target.sessionIdentity)) fail("CONTINUATION_ACKNOWLEDGEMENT_INVALID");
    const receipt = assertRolloverArtifact({
      artifact_kind: "ask_context_rollover_receipt", schema_version: "1.0.0", binding_digest: prepared.binding_digest,
      scope_digest: binding.scope_digest, sequence: binding.sequence, authorization_digest: authorizationDigest,
      target_process_identity: target.processIdentity, target_session_identity: target.sessionIdentity,
      input_digest: inputDigest, turn_identity: acknowledgement.turnIdentity, status: "continuation_started",
    }, "ask_context_rollover_receipt");
    const receiptDigest = save(options.storeRoot, receipt);
    return { ...checked, status: "continuation_started", receipt_digest: receiptDigest, source_context_may_be_discarded: true };
  } catch {
    // No raw runtime error, prompt, source or command output is returned/logged.
    return { ...prepared, status: "blocked", reasons: ["ROLLOVER_FAILED_OR_ALREADY_CLAIMED"], source_context_may_be_discarded: false };
  }
}

/** Opt-in Metrics Event at a validated checkpoint boundary. No fake outcome counts. */
export function buildRolloverMetricsEvent(options, occurredAt) {
  const checked = validateContextRolloverResume(options);
  if (!options.policy.telemetry_enabled) return null;
  const event = {
    schema_version: "1.0.0", event_id: `rollover:${checked.binding_digest.slice(7)}`,
    task_id: `sha256:${checked.binding.scope_digest.slice(7)}`, task_type: "handoff", occurred_at: occurredAt,
    skills_used: [], outcome_metrics: {}, verification_metrics: {}, debt_movement_metrics: {},
    evidence_references: [checked.binding_digest, checked.binding.observation_digest],
    privacy_note: { raw_prompts_stored: false, secrets_stored: false, customer_data_stored: false, personal_data_stored: false, external_publication: false, note: "Opt-in bounded checkpoint observation; no transcript, source or command output." },
  };
  if (validateMetricsEvent(event).length) fail("ROLLOVER_METRICS_EVENT_INVALID");
  return event;
}
