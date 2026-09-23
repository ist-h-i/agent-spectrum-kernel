import { realpathSync } from "node:fs";
import { canonicalJson, jsonDigest, pathInside } from "./ask-setup-inputs.mjs";
import {
  SetupApplyError, applyAssert, assertNoSetupInProgress, assertSetupWritePaths,
  captureApplyTarget, invokeSetupInstaller, managedSetupIdentities,
  setupInstallerInvocations, setupRecovery, validApplyDigest,
} from "./ask-setup-apply-state.mjs";

const equals = (a, b) => canonicalJson(a) === canonicalJson(b);
// Existing installers may normalize whitespace outside a managed block during
// a new planning pass. A repeat of the original exact plan must not perform
// that new update. Compare canonical ownership/projection identities, while the
// original final target binding already proves the exact current whole files.
function repeatProjectionIdentity(identities) {
  return identities.map(({ identity_digest, files, ...identity }) => ({
    ...identity,
    files: files.map(({ actual_sha256, ...file }) => file.ownership === "managed_file"
      ? { ...file, actual_sha256 } : file),
  }));
}
const readiness = (installed = "unknown") => ({ installed, activated: "insufficient_evidence", operational: "insufficient_evidence" });
const nextVerification = {
  command: ["node", "scripts/ask-setup.mjs", "doctor", "--target", "<target>", "--json"],
  first_workflow: "not_executed; separately obtain bounded runtime and applied-contract evidence",
};
function seal(result) {
  const { result_digest, ...body } = result;
  return { ...body, result_digest: jsonDigest(body) };
}
function reasonCode(error, fallback) {
  return error instanceof SetupApplyError && /^[a-z0-9_]+$/u.test(error.code) ? error.code : fallback;
}

export function blockedApplyResult(reason, { authorized = false, dryRun = false, planDigest = null } = {}) {
  return seal({
    schema_version: "1.0.0", kind: "ask.adoption-apply-result", status: "blocked", reason,
    plan_digest: validApplyDigest(planDigest) ? planDigest : null,
    plan_validation: "not_validated",
    authorization: { action: "apply", explicit: authorized === true, dry_run: dryRun === true, mutation_allowed: false },
    mutation_attempted: false, observation: "not_started", repository_changed: null,
    selection: null, source: null,
    recovery_semantics: "non_transactional_installer_snapshots_only; initialized_project_owned_state_and_directories_may_remain",
    phases: [], applied_operations: [], not_applied_operations: [], preserved_operations: [], blocked_operations: [],
    resulting_managed_identities: [], assets: { status: "not_verified", exact_refs: [] },
    portfolio: { status: "not_verified", identity: null }, capabilities: [],
    recovery_required: false, recovery: [], readiness: readiness(), next_verification: nextVerification,
  });
}

function attachPlanFacts(result, plan) {
  result.selection = plan.selection ?? null;
  result.source = plan.source ? {
    identity_digest: plan.source.identity_digest, revision: plan.source.revision,
    projection_digest: plan.source.projection_digest,
    runtime_profile_fixture_digest: plan.source.runtime_profile_fixture_digest,
  } : null;
  result.assets = plan.assets;
  result.portfolio = plan.portfolio;
  result.capabilities = plan.recommendation.capabilities;
  result.preserved_operations = plan.preservation.project_owned_state;
}

function operationObservation(plan, entries) {
  const files = new Map(entries.map((entry) => [entry.path, entry]));
  return plan.operations.map((operation) => {
    const current = files.get(operation.path);
    const actual = current?.type === "file" ? current.sha256 : null;
    const afterMatches = operation.action === "remove" ? !current
      : actual !== null && actual === operation.after_sha256;
    const beforeMatches = operation.action === "create" ? !current
      : actual !== null && actual === operation.before_sha256;
    return { ...operation, outcome: afterMatches ? "applied" : beforeMatches ? "not_applied" : "unknown", actual_sha256: actual };
  });
}

// Orchestration only. The production caller supplies a plan already replayed
// against the authoritative installers. The injection seam is for deterministic
// failure tests; no CLI option/environment variable can replace an installer.
export async function executeValidatedSetupApply({ plan, target, sourceRoot, invocations, verifySource, authorized = false,
  invoke = invokeSetupInstaller, observe = captureApplyTarget }) {
  if (authorized !== true) return blockedApplyResult("authorization_required", { planDigest: plan?.plan_digest });
  const result = blockedApplyResult(null, { authorized: true, planDigest: plan.plan_digest });
  result.plan_validation = "valid_exact_plan";
  result.authorization.mutation_allowed = true;
  attachPlanFacts(result, plan);
  result.phases = invocations.map(({ phase, script }) => ({ phase, installer: script, status: "not_attempted", exit_status: null }));
  let observed = null;
  let failure = null;
  let completed = 0;
  let expected = plan.application.target_before;
  for (let index = 0; index < invocations.length; index += 1) {
    const invocation = invocations[index];
    const phase = result.phases[index];
    try {
      await verifySource();
      assertSetupWritePaths(target, plan.application.write_paths);
      assertNoSetupInProgress(target);
      observed = observe(target);
      applyAssert(equals(observed.binding, expected), "target_drift_before_installer");
      phase.status = "attempted";
      result.mutation_attempted = true;
      // A thrown spawn/timeout never implies that the target was left unchanged.
      const outcome = await invoke(sourceRoot, invocation);
      phase.exit_status = Number.isInteger(outcome?.status) ? outcome.status : null;
      observed = observe(target);
      applyAssert(outcome?.failed === false && outcome.status === 0, "installer_failed");
      const plannedPhase = plan.application.phases[index];
      applyAssert(plannedPhase.phase === invocation.phase && equals(observed.binding, plannedPhase.expected_target), "installer_result_mismatch");
      applyAssert(equals(managedSetupIdentities(target), plannedPhase.managed_identities), "managed_identity_mismatch");
      assertNoSetupInProgress(target);
      await verifySource();
      phase.status = "applied";
      completed += 1;
      expected = plannedPhase.expected_target;
    } catch (error) {
      failure = reasonCode(error, "installer_or_observation_failed");
      phase.status = phase.status === "attempted" ? "failed" : "blocked";
      break;
    }
  }
  // Every post-mutation observation/recovery read is bounded and caught. A
  // report-generation failure must not escape as a preflight "blocked/no write".
  try {
    observed = observe(target);
    result.observation = "complete";
    result.repository_changed = !equals(observed.binding, plan.application.target_before);
    result.resulting_target = observed.binding;
    const operations = operationObservation(plan, observed.entries);
    result.applied_operations = operations.filter((entry) => entry.outcome === "applied");
    result.not_applied_operations = operations.filter((entry) => entry.outcome === "not_applied");
    result.blocked_operations = operations.filter((entry) => entry.outcome === "unknown");
  } catch {
    result.observation = "unavailable";
    result.repository_changed = null;
    result.blocked_operations = plan.operations.map((entry) => ({ ...entry, outcome: "unknown", actual_sha256: null }));
    failure ??= "post_apply_observation_unavailable";
  }
  try {
    result.resulting_managed_identities = managedSetupIdentities(target);
  } catch {
    result.resulting_managed_identities = [];
    failure ??= "managed_identity_unavailable";
  }
  try {
    // Only attempted phases belong to this invocation's recovery path. Existing
    // state of an unattempted adapter is not an apply rollback instruction.
    const attempted = invocations.filter((_, index) => ["applied", "failed", "attempted"].includes(result.phases[index].status));
    result.recovery = setupRecovery(target, attempted);
  } catch {
    result.recovery = [];
    failure ??= "recovery_observation_unavailable";
  }
  if (!failure && completed === invocations.length) {
    result.status = "applied";
    result.readiness = readiness("installed");
  } else {
    result.status = result.mutation_attempted
      ? result.repository_changed === false ? "failed" : "partial"
      : "blocked";
    result.readiness = readiness();
  }
  result.reason = failure;
  result.recovery_required = Boolean(failure && result.mutation_attempted
    && (result.repository_changed !== false || result.recovery.some((item) => item.in_progress)));
  return seal(result);
}

export async function applyAdoptionPlan(input, { target, adapter = null, authorized = false, dryRun = false } = {}) {
  const authorization = { authorized, dryRun, planDigest: input?.plan_digest };
  if (authorized !== true && dryRun !== true) return blockedApplyResult("authorization_required", authorization);
  let plan;
  let root;
  let runtime;
  let invocations;
  let current;
  let currentManaged;
  let alreadyApplied = false;
  try {
    plan = structuredClone(input);
    root = realpathSync(target);
    runtime = await import("./ask-setup.mjs");
    applyAssert(!pathInside(root, runtime.REPO_ROOT) && !pathInside(runtime.REPO_ROOT, root), "source_target_overlap");
    const { validateJsonSchema } = await import("./json-schema-validation.mjs");
    const { resolve } = await import("node:path");
    applyAssert(validateJsonSchema(plan, { schemaPath: resolve(runtime.REPO_ROOT, "schemas/adoption-plan.schema.json") }).length === 0, "invalid_plan_schema");
    await runtime.verifyPlanIdentity(plan, { target: root, adapter });
    applyAssert(plan.application?.contract === "exact-installer-apply-v1", "unsupported_apply_plan");
    applyAssert(equals(plan.application.execution_environment,
      { node: process.version, platform: process.platform, arch: process.arch, umask: process.umask() }), "execution_environment_changed");
    // A Portfolio export is not lifecycle authority nor a supported projection
    // instruction. Never turn an unverified reference into active installation.
    applyAssert(plan.portfolio.status === "unselected" && plan.portfolio.identity === null, "portfolio_authority_unverified");
    applyAssert(plan.conflicts.length === 0 && plan.human_decisions.length === 0, "unresolved_plan_decisions");
    assertNoSetupInProgress(root);
    const source = await runtime.planningSource(plan.selection.adapter, plan.selection.profile);
    applyAssert(equals(source.selectedSkills, plan.application.selected_skills), "skill_selection_mismatch");
    invocations = setupInstallerInvocations(plan.selection.adapter, plan.selection.profile, source.selectedSkills, root);
    applyAssert(plan.application.phases.length === invocations.length, "invalid_apply_phases");
    assertSetupWritePaths(root, plan.application.write_paths);
    current = captureApplyTarget(root);
    const final = plan.application.phases.at(-1);
    currentManaged = managedSetupIdentities(root);
    alreadyApplied = equals(current.binding, final.expected_target)
      && equals(currentManaged, final.managed_identities);
    applyAssert(alreadyApplied || equals(current.binding, plan.application.target_before), "target_state_changed_after_plan");
    // Re-running the existing planner is verification, not permission to replace
    // the selected plan: any semantic difference below is a stop, not a replan.
    const replay = await runtime.createAdoptionPlan({
      target: root, adapter: plan.selection.adapter, profile: plan.selection.profile,
      purpose: plan.recommendation.purpose, risk: plan.recommendation.risk,
      requiredCapabilities: plan.recommendation.capabilities.map((entry) => entry.capability_id),
    });
    applyAssert(equals(replay.source, plan.source) && equals(replay.assets, plan.assets)
      && equals(replay.recommendation, plan.recommendation), "projection_or_capability_mismatch");
    if (alreadyApplied) {
      applyAssert(equals(repeatProjectionIdentity(replay.application.phases.at(-1).managed_identities), repeatProjectionIdentity(final.managed_identities)), "repeat_apply_identity_mismatch");
    } else {
      applyAssert(replay.plan_digest === plan.plan_digest, "exact_plan_replay_mismatch");
    }
    await runtime.verifyPlanIdentity(plan, { target: root, adapter });
    applyAssert(equals(captureApplyTarget(root).binding, current.binding), "target_changed_during_validation");
  } catch (error) {
    return blockedApplyResult(reasonCode(error, "plan_validation_failed"), authorization);
  }
  if (dryRun || alreadyApplied) {
    const result = blockedApplyResult(null, authorization);
    result.status = alreadyApplied ? "already_applied" : "validated";
    result.plan_validation = "valid_exact_plan";
    result.observation = "complete";
    result.resulting_target = current.binding;
    result.repository_changed = !equals(current.binding, plan.application.target_before);
    attachPlanFacts(result, plan);
    result.not_applied_operations = alreadyApplied ? [] : plan.operations;
    result.resulting_managed_identities = currentManaged;
    result.readiness = readiness(alreadyApplied ? "installed" : "planned_not_applied");
    return seal(result);
  }
  // From here onward failures are reported by the executor as observed partial
  // state. Do not wrap this in a catch returning a preflight no-mutation result.
  return executeValidatedSetupApply({
    plan, target: root, sourceRoot: runtime.REPO_ROOT, invocations, authorized,
    verifySource: async () => { await runtime.verifyPlanIdentity(plan, { target: root, adapter }); },
  });
}
