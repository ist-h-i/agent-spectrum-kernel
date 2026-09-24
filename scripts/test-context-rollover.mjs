import assert from "node:assert/strict";
import { test, after } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { generateKeyPairSync, createHash } from "node:crypto";
import { attestVerificationEvidence, putVerificationEvidence, evidenceObjectPath, verificationCommandIdentity } from "./verification-evidence.mjs";
import { buildEpicAdmissionPolicy, buildEpicAdmissionSubject, buildObservedSignals } from "./test-fixtures/epic-admission-work-package-plan-fixture.mjs";
import { sealEpicAdmissionPolicy } from "./epic-admission-work-package-plan.mjs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { canonicalDigest, readJsonFileStrict, readContentAddressedJson, putContentAddressedJson, contentAddressedObjectPath } from "./content-addressed-store.mjs";
import { deriveWorkPackagePlanContentDigest, evaluateEpicAdmission, sealWorkPackagePlan, sealWorkPackagePlanValidationContext, validateWorkPackagePlanExecutable } from "./epic-admission-work-package-plan.mjs";
import { runtimePreflight, prepareContextRollover, executeContextRollover, validateContextRolloverResume, buildRolloverMetricsEvent } from "./context-rollover.mjs";
import { assertRolloverArtifact, evaluateRolloverPolicy, emptyRuntimeObservation, observedCounter, runtimeIdentity, unavailableCounter, COUNTER_UNITS, TRIGGER_COUNTERS, combineRuntimeObservations } from "./context-runtime-observation.mjs";
import { createCodexAppServerAdapter, createCodexCounterObserver, createCodexCompactionObserver, detectCodexRuntime } from "./codex-context-rollover.mjs";
import { freezeRolloverEvaluation, claimRolloverEvaluationRun, recordRolloverEvaluationRun, evaluateRolloverRuns, evaluateStoredRolloverRuns, QUALITY_COUNTERS } from "./context-rollover-evaluation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.error ?? result.stderr}`);
  return result.stdout.trim();
}
function git(root, ...args) { return run("git", ["-C", root, ...args]); }
// Git keeps raw object IDs in the patch header even when textconv hides the
// changed bytes. Compare only the rendered patch, not those identity fields.
function textconvDisplay(diff) {
  return diff.replace(/^index [a-f0-9]+\.\.[a-f0-9]+(?: [0-7]{6})?\n/gmu, "");
}
function fixture(path) { return readJsonFileStrict(resolve(ROOT, path), path); }
const fixtureBundle = {
  policy: fixture("docs/fixtures/epic-admission-policy.json"),
  decision: fixture("docs/fixtures/issue-275-slice-1-epic-admission-decision.json"),
  context: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json"),
  plan: fixture("docs/fixtures/issue-275-slice-1-work-package-plan.json"),
  previousPlan: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-r2.json"),
  previousContext: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json"),
};

function closePlanContextBinding(bundle) {
  let plan = sealWorkPackagePlan(bundle.plan);
  bundle.context.current_plan_ref = {
    plan_id: plan.plan_id,
    plan_revision: plan.plan_revision,
    lifecycle_state: plan.lifecycle_state,
    plan_content_digest: deriveWorkPackagePlanContentDigest(plan),
  };
  const context = sealWorkPackagePlanValidationContext(bundle.context);
  plan.validation_context_ref = {
    context_id: context.context_id,
    context_revision: context.context_revision,
    context_digest: context.context_digest,
  };
  plan = sealWorkPackagePlan(plan);
  const result = { ...bundle, plan, context };
  assert.equal(deriveWorkPackagePlanContentDigest(plan), context.current_plan_ref.plan_content_digest);
  return result;
}

function bindPlan(repo) {
  const bundle = structuredClone(fixtureBundle);
  const target = {
    repository_id: "ist-h-i/agent-spectrum-kernel",
    branch: git(repo, "symbolic-ref", "--short", "HEAD"),
    base_commit: git(repo, "rev-parse", "HEAD"),
    base_tree: git(repo, "rev-parse", "HEAD^{tree}"),
  };
  bundle.decision = evaluateEpicAdmission({
    policy: bundle.policy,
    subject: { ...bundle.decision.subject, ...target },
    observed_signals: bundle.decision.observed_signals,
    decision_revision: bundle.decision.decision_revision,
  });
  const decisionRef = {
    decision_id: bundle.decision.decision_id,
    decision_revision: bundle.decision.decision_revision,
    decision_digest: bundle.decision.decision_digest,
  };
  bundle.plan.repository = target;
  bundle.context.repository = structuredClone(target);
  bundle.plan.admission_decision_ref = decisionRef;
  bundle.context.current_admission_decision_ref = structuredClone(decisionRef);
  for (const workPackage of bundle.plan.packages) workPackage.target_binding = structuredClone(target);
  for (const unit of bundle.plan.topology.publication_units) {
    unit.branch = target.branch;
    unit.base_commit = target.base_commit;
  }
  const result = closePlanContextBinding(bundle);
  assert.deepEqual(validateWorkPackagePlanExecutable(result.plan, result), [], "temporary Plan must pass the real authority validator");
  return result;
}

const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-session-checkpoint-")));
function repository(name) {
  const repo = resolve(root, name);
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "ASK Test");
  git(repo, "remote", "add", "origin", "https://github.com/ist-h-i/agent-spectrum-kernel.git");
  writeFileSync(resolve(repo, "work.txt"), "bounded work\n");
  writeFileSync(resolve(repo, "contract.txt"), "contract v1\n");
  writeFileSync(resolve(repo, "private.txt"), "do-not-copy-this-body\n");
  writeFileSync(resolve(repo, "empty.txt"), "");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "fixture");
  git(repo, "checkout", "-b", "feature");
  const bundle = bindPlan(repo);
  const options = {
    repositoryRoot: repo,
    storeRoot: resolve(root, `${name}-store`),
    planBundle: bundle,
    activePackageId: bundle.plan.packages[1].package_id,
    completedPackageIds: [bundle.plan.packages[0].package_id],
  };
  mkdirSync(options.storeRoot);
  return { repo, bundle, options };
}
after(() => rmSync(root, { recursive: true, force: true }));
let serial = 0;
function policy() {
  return { artifact_kind: "ask_context_rollover_policy", schema_version: "1.0.0", policy_id: "synthetic-pilot", revision: 1, enabled: true,
    thresholds: Object.fromEntries(TRIGGER_COUNTERS.map((key) => [key, key === "runtime_steps" ? 4 : null])),
    operator_request_enabled: true, maximum_rollovers: 2, minimum_runtime_steps_between_rollovers: 2, runtime_timeout_ms: 1000, telemetry_enabled: true };
}
function setup() {
  const { options } = repository(`runtime-${++serial}`);
  const runtimePolicyDigest = canonicalDigest({ cwd: options.repositoryRoot, model: "fixture-model", approvalPolicy: "never", sandbox: "readOnly" });
  const observation = emptyRuntimeObservation({ adapterId: "codex", runtimePolicyDigest, processIdentity: runtimeIdentity("process-1"), sessionIdentity: runtimeIdentity("session-1") });
  observation.counters.runtime_steps = observedCounter(4, "count");
  return { ...options, policy: policy(), observation, runtimePolicyDigest };
}
function stored(options, digest) { return readContentAddressedJson({ storeRoot: options.storeRoot, digest }).value; }
function nativeAdapter(options, changes = {}) {
  const calls = [];
  const adapter = createCodexAppServerAdapter({ repositoryRoot: options.repositoryRoot, model: "fixture-model", sandbox: "readOnly",
    runtimePolicyDigest: options.runtimePolicyDigest, processIdentity: runtimeIdentity("process-2"),
    notify: async (method) => calls.push(method),
    rpc: async (method, params) => {
      calls.push(method);
      if (method === "initialize") return {};
      if (method === "thread/start") return { thread: { id: "thread-2", sessionId: "session-2" }, cwd: options.repositoryRoot, model: "fixture-model", approvalPolicy: "never", sandbox: { type: "readOnly" }, ...changes.start };
      if (method === "thread/read") { changes.beforeRead?.(); return { thread: { id: "thread-2", sessionId: "session-2", turns: [], ...changes.read } }; }
      if (method === "turn/start") { changes.beforeTurn?.(params); return { turn: { id: "turn-2", status: "inProgress", ...changes.turn } }; }
      throw new Error("unexpected RPC");
    },
  });
  return { adapter, calls };
}
test("threshold trigger, multiple signals and missing counters never become zero", () => {
  const o = setup(); o.policy.thresholds.model_steps = 1; o.policy.thresholds.wall_time_ms = 10;
  o.observation.counters.wall_time_ms = observedCounter(10, "ms", "runner");
  const d = evaluateRolloverPolicy(o.policy, o.observation, { operatorRequest: true });
  assert.deepEqual(d.trigger_reasons, ["runtime_steps", "wall_time_ms", "operator_request"]);
  assert.deepEqual(d.unavailable_signals, ["model_steps"]);
});
test("no trigger does not create checkpoint objects", () => {
  const o = setup(); o.observation.counters.runtime_steps.value = 1;
  assert.equal(prepareContextRollover(o).status, "continue_current_context");
  assert.deepEqual(readdirSync(o.storeRoot), []);
});
for (const mutate of [p => p.thresholds.runtime_steps = 0, p => p.runtime_timeout_ms = -1, p => p.extra = "raw source", p => p.maximum_rollovers = 100]) {
  test("invalid policy fails closed", () => { const o = setup(); mutate(o.policy); assert.throws(() => prepareContextRollover(o)); });
}
test("disabled policy and partial counters do not trigger", () => {
  const o = setup(); o.observation.counters.runtime_steps.coverage = "partial";
  assert.equal(evaluateRolloverPolicy(o.policy, o.observation).status, "continue_current_context");
  o.policy.enabled = false;
  assert.equal(evaluateRolloverPolicy(o.policy, o.observation, { operatorRequest: true }).status, "continue_current_context");
});
test("restart-only path publishes and restores exact bounded package", async () => {
  const o = setup(), result = await executeContextRollover(o);
  assert.equal(result.status, "context_rollover_required");
  assert.equal(result.source_context_may_be_discarded, false);
  assert.equal(result.restart_package.active_package_id, o.activePackageId);
  assert.equal(result.restart_package.completed_package_ids[0], o.completedPackageIds[0]);
  assert.deepEqual(validateContextRolloverResume({ ...o, bindingDigest: result.binding_digest }).restart_package, result.restart_package);
  assert.equal(JSON.stringify(result).includes("do-not-copy-this-body"), false);
});
test("publication failure never contacts runtime", async () => {
  const o = setup(); o.storeRoot = resolve(o.repositoryRoot, "forbidden-store");
  const fake = nativeAdapter(o);
  assert.equal((await executeContextRollover(o, fake.adapter)).status, "blocked"); assert.deepEqual(fake.calls, []);
});
test("checkpoint readback tampering prevents launch", async () => {
  const o = setup(); const r = prepareContextRollover(o);
  writeFileSync(contentAddressedObjectPath({ storeRoot: o.storeRoot, digest: r.binding.checkpoint_digest }), "{}\n");
  assert.throws(() => validateContextRolloverResume({ ...o, bindingDigest: r.binding_digest }));
  const fake = nativeAdapter(o); assert.equal((await executeContextRollover(o, fake.adapter)).status, "blocked"); assert.deepEqual(fake.calls, []);
});
for (const [name, mutate] of [
  ["wrong repo", o => git(o.repositoryRoot, "remote", "set-url", "origin", "https://github.com/other/repo.git")],
  ["wrong branch", o => git(o.repositoryRoot, "checkout", "-b", "wrong")],
  ["wrong HEAD", o => { writeFileSync(resolve(o.repositoryRoot, "work.txt"), "committed mutation"); git(o.repositoryRoot, "add", "."); git(o.repositoryRoot, "commit", "-m", "mutation"); }],
  ["dirty state", o => writeFileSync(resolve(o.repositoryRoot, "work.txt"), "dirty mutation")],
  ["wrong plan", o => o.planBundle.plan.plan_id = "WPP-wrong"],
  ["dependency violation", o => o.planBundle.plan.packages[1].dependencies = []],
  ["runtime policy", o => o.runtimePolicyDigest = canonicalDigest("different")],
  ["rollover policy", o => o.policy.revision++],
]) test(`${name} rejected after checkpoint`, () => { const o = setup(), r = prepareContextRollover(o); mutate(o); assert.throws(() => validateContextRolloverResume({ ...o, bindingDigest: r.binding_digest })); });
test("wrong package / completed dependencies rejected before save", () => {
  const o = setup(); o.activePackageId = "missing"; assert.throws(() => prepareContextRollover(o));
  const p = setup(); p.completedPackageIds = []; assert.throws(() => prepareContextRollover(p));
});
test("telemetry is opt-in; raw transcript and source fields rejected", () => {
  const o = setup(); o.policy.telemetry_enabled = false;
  const r = prepareContextRollover(o); assert.equal(r.binding.observation_digest, null);
  assert.equal(existsSync(contentAddressedObjectPath({ storeRoot: o.storeRoot, digest: canonicalDigest(o.observation) })), false);
  for (const field of ["transcript", "source", "prompt", "command_output"]) {
    const bad = structuredClone(o.observation); bad[field] = "private-sentinel";
    assert.throws(() => assertRolloverArtifact(bad, "ask_runtime_observation"), error => !error.message.includes("private-sentinel"));
  }
});
test("native-protocol fake starts only after durable state and records acknowledgement", async () => {
  const o = setup(); let payload;
  const fake = nativeAdapter(o, { beforeTurn: p => { payload = JSON.parse(p.input[0].text); assert.ok(stored(o, payload.authorization.binding_digest)); } });
  const r = await executeContextRollover(o, fake.adapter);
  assert.equal(r.status, "continuation_started"); assert.equal(r.source_context_may_be_discarded, true);
  assert.deepEqual(fake.calls, ["initialize", "initialized", "thread/start", "thread/read", "turn/start"]);
  assert.deepEqual(payload.restart_package, r.restart_package);
  assert.deepEqual(payload.continuation.next_task, o.planBundle.plan.packages[1].ordered_tasks[0]);
  assert.deepEqual(payload.continuation.forbidden_scope, o.planBundle.plan.packages[1].forbidden_scope);
  const receipt = stored(o, r.receipt_digest); assert.equal(receipt.binding_digest, r.binding_digest);
  assert.equal(receipt.target_session_identity.digest, runtimeIdentity("session-2").digest);
});
for (const [name, changes] of [
  ["non-fresh history", { read: { turns: [{ id: "old" }] } }],
  ["fork", { read: { forkedFromId: "old" } }],
  ["session not echoed", { read: { sessionId: null } }],
  ["unknown sandbox", { start: { sandbox: { type: "dangerFullAccess" } } }],
  ["continuation failed", { turn: { status: "failed" } }],
]) test(`native ${name} retains source`, async () => {
  const o = setup(), fake = nativeAdapter(o, changes), r = await executeContextRollover(o, fake.adapter);
  assert.equal(r.status, "blocked"); assert.equal(r.source_context_may_be_discarded, false); assert.equal(r.receipt_digest, undefined);
});
test("drift during fresh-context creation prevents continuation", async () => {
  const o = setup(), fake = nativeAdapter(o, { beforeRead: () => writeFileSync(resolve(o.repositoryRoot, "work.txt"), "concurrent writer") });
  assert.equal((await executeContextRollover(o, fake.adapter)).status, "blocked"); assert.equal(fake.calls.includes("turn/start"), false);
});
test("repeated launch is denied even by a new host object", async () => {
  const o = setup(); assert.equal((await executeContextRollover(o, nativeAdapter(o).adapter)).status, "continuation_started");
  const next = nativeAdapter(o); const second = await executeContextRollover(o, next.adapter);
  assert.equal(second.status, "blocked"); assert.deepEqual(next.calls, []);
});
test("receipt chain validates source identities and minimum work", async () => {
  const o = setup(), first = await executeContextRollover(o, nativeAdapter(o).adapter);
  o.previousReceiptDigest = first.receipt_digest;
  assert.equal((await executeContextRollover(o)).status, "blocked");
  o.observation.process_identity = runtimeIdentity("process-2"); o.observation.session_identity = runtimeIdentity("session-2");
  o.observation.counters.runtime_steps.value = 1; o.operatorRequest = true;
  assert.equal((await executeContextRollover(o)).status, "blocked");
  o.observation.counters.runtime_steps.value = 4;
  assert.equal(prepareContextRollover(o).binding.sequence, 2);
});
test("ambiguous runtime timeout retains claim and forbids retry", async () => {
  const o = setup(); o.policy.runtime_timeout_ms = 5;
  const adapter = { adapterId: "codex", runtimePolicyDigest: o.runtimePolicyDigest, createFreshContext: () => new Promise(() => {}) };
  assert.equal((await executeContextRollover(o, adapter)).status, "blocked");
  const fake = nativeAdapter(o); assert.equal((await executeContextRollover(o, fake.adapter)).status, "blocked"); assert.deepEqual(fake.calls, []);
});
test("missing executable is unavailable, not invented process/counters or Claude parity", () => {
  const r = detectCodexRuntime({ executable: resolve(root, "missing-codex") });
  assert.equal(r.executable, "unavailable"); assert.equal(r.fresh_context, "unavailable"); assert.equal(r.claude.status, "unavailable");
});
test("native exec token classes, runtime turns and privacy", () => {
  const observer = createCodexCounterObserver({ runtimePolicyDigest: canonicalDigest("policy"), processIdentity: runtimeIdentity("process"), fromStart: true });
  observer.ingest({ type: "thread.started", thread_id: "thread" }, 100);
  observer.ingest({ type: "turn.started" }, 101);
  observer.ingest({ type: "item.completed", item: { text: "PRIVATE SOURCE" } }, 102);
  observer.ingest({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 } }, 200);
  const r = observer.finish({ nowMs: 201, completeCapture: true });
  assert.equal(r.counters.uncached_input_tokens.value, 20); assert.equal(r.counters.cached_input_tokens.value, 80); assert.equal(r.counters.runtime_steps.value, 1);
  assert.equal(r.counters.model_steps.value, null); assert.equal(r.counters.context_compactions.value, null); assert.equal(r.counters.tool_wait_ms.value, null);
  assert.equal(JSON.stringify(r).includes("PRIVATE SOURCE"), false);
});
test("invalid usage, partial capture and compaction event capability remain explicit", () => {
  const parameters = { runtimePolicyDigest: canonicalDigest("policy"), processIdentity: runtimeIdentity("process"), fromStart: true };
  const observer = createCodexCounterObserver(parameters);
  observer.ingest({ type: "thread.started", thread_id: "thread" }, 0); observer.ingest({ type: "turn.started" }, 1);
  observer.ingest({ type: "turn.completed", usage: { input_tokens: 2, cached_input_tokens: 3, output_tokens: 0 } }, 2);
  assert.equal(observer.finish({ nowMs: 3, completeCapture: false }).counters.uncached_input_tokens.value, null);
  const c = createCodexCompactionObserver({ ...parameters, threadId: "thread", sessionId: "session", completeSubscriptionVerified: true });
  c.ingest({ method: "item/completed", params: { threadId: "thread", item: { id: "compact1", type: "contextCompaction" } } });
  assert.equal(c.finish().counters.context_compactions.value, 1);
});
function evaluationFixture() {
  const o = setup(), gate = canonicalDigest("gate"), pd = canonicalDigest(o.policy);
  const protocol = { artifact_kind: "ask_rollover_evaluation_protocol", schema_version: "1.0.0", protocol_id: `fixture-${serial}`, revision: 1,
    policy_digest: pd, rollover_scope_digest: canonicalDigest({ repository_id: "ist-h-i/agent-spectrum-kernel", plan_id: o.planBundle.plan.plan_id, package_id: o.activePackageId }), source_revision: git(o.repositoryRoot, "rev-parse", "HEAD"), task_digest: canonicalDigest("matched-task"), runtime_policy_digest: o.runtimePolicyDigest,
    repetitions: 1, primary_metric: "wall_time_ms", secondary_metrics: ["uncached_input_tokens"], minimum_relative_reduction: 0.1, maximum_secondary_regression: 0,
    maximum_run_wall_time_ms: 10000, maximum_run_uncached_tokens: 10000, maximum_run_human_decisions: 1, required_gate_refs: [gate] };
  const runs = ["baseline", "rollover"].map(condition => {
    const observation = structuredClone(o.observation);
    for (const [key, unit] of Object.entries(COUNTER_UNITS)) observation.counters[key] = observedCounter(key === "wall_time_ms" ? (condition === "baseline" ? 100 : 60) : 0, unit, "runner");
    return { artifact_kind: "ask_rollover_evaluation_run", schema_version: "1.0.0", protocol_digest: canonicalDigest(protocol), run_id: canonicalDigest(condition), condition, repetition: 1,
      source_revision: protocol.source_revision, task_digest: protocol.task_digest, evidence_scope: "deterministic_fixture", terminal_status: "completed", observation,
      quality: Object.fromEntries(QUALITY_COUNTERS.map(key => [key, observedCounter(0, "count", "runner")])),
      verification_coverage: { status: "observed", required_gate_refs: [gate], verified_gate_refs: [gate] }, rollover_receipt_digests: condition === "rollover" ? [canonicalDigest("fixture-receipt")] : [] };
  });
  return { o, protocol, runs };
}
test("paired baseline/rollover fixture retains bounded improvement without operational authority", () => {
  const { protocol, runs } = evaluationFixture(), r = evaluateRolloverRuns(protocol, runs);
  assert.equal(r.recommendation, "retain"); assert.equal(r.comparisons[0].metrics.wall_time_ms.delta, -40); assert.equal(r.operational_enablement_authority, false);
});
for (const key of QUALITY_COUNTERS) test(`quality ${key} regression dominates efficiency and missing inputs`, () => {
  const { protocol, runs } = evaluationFixture(); runs[1].quality[key].value = 1;
  runs[1].observation.counters.wall_time_ms = unavailableCounter("ms");
  assert.equal(evaluateRolloverRuns(protocol, runs).recommendation, "stop");
});
test("lost verification coverage and failed run stop favorable recommendation", () => {
  const { protocol, runs } = evaluationFixture(); runs[1].verification_coverage.verified_gate_refs = [];
  assert.equal(evaluateRolloverRuns(protocol, runs).recommendation, "stop");
  runs[1].terminal_status = "failed"; assert.equal(evaluateRolloverRuns(protocol, runs).recommendation, "stop");
});
test("unknown metrics/missing pairs -> insufficient; no gain -> revise", () => {
  const { protocol, runs } = evaluationFixture(); runs[1].observation.counters.wall_time_ms.value = 100;
  assert.equal(evaluateRolloverRuns(protocol, runs).recommendation, "revise");
  runs[1].observation.counters.wall_time_ms = unavailableCounter("ms");
  assert.equal(evaluateRolloverRuns(protocol, runs).recommendation, "insufficient_evidence");
  assert.equal(evaluateRolloverRuns(protocol, []).recommendation, "insufficient_evidence");
});
test("mismatched task/source/repetition and duplicate slot are rejected", () => {
  const { protocol, runs } = evaluationFixture(); assert.throws(() => evaluateRolloverRuns(protocol, [runs[0], runs[0]]));
  runs[1].task_digest = canonicalDigest("other task"); assert.throws(() => evaluateRolloverRuns(protocol, runs));
});
test("freeze precedes immutable recording; stored receipt-backed fixture evaluates", async () => {
  const { o, protocol, runs } = evaluationFixture(); const pd = canonicalDigest(protocol);
  assert.throws(() => recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run: runs[0] }));
  freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol, policy: o.policy });
  const rollover = await executeContextRollover(o, nativeAdapter(o).adapter); runs[1].rollover_receipt_digests = [rollover.receipt_digest];
  for (const run of runs) { claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, condition: run.condition, repetition: run.repetition }); recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run }); }
  assert.throws(() => recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run: runs[0] }));
  assert.equal(evaluateStoredRolloverRuns({ storeRoot: o.storeRoot, protocolDigest: pd }).recommendation, "retain");
  const changed = structuredClone(protocol); changed.minimum_relative_reduction = 0.01;
  assert.throws(() => freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol: changed, policy: o.policy }));
});

test("small task preflight uses existing ordinary admission; epic without plan stops", () => {
  const policy = buildEpicAdmissionPolicy(); policy.rules.configured_epic_goal_ids = [];
  const admission = { policy: sealEpicAdmissionPolicy(policy), subject: buildEpicAdmissionSubject({ goal_id: "github:ist-h-i/agent-spectrum-kernel#small-fixture", task_id: "SMALL-FIXTURE" }), observed_signals: buildObservedSignals("small") };
  assert.equal(runtimePreflight({ admission }).status, "ordinary_execution_allowed");
  const o = setup(), b = o.planBundle;
  assert.equal(runtimePreflight({ admission: { policy: b.policy, subject: b.decision.subject, observed_signals: b.decision.observed_signals, decision_revision: b.decision.decision_revision } }).status, "work_package_plan_required");
});
for (const kind of ["blocker", "approval"]) test(`saved ${kind} remains blocked; resealed removal rejected`, async () => {
  const o = setup(); let b = structuredClone(o.planBundle); b.plan.lifecycle_state = "proposed";
  const field = kind === "blocker" ? "open_blocker_ids" : "required_approval_ids";
  if (kind === "blocker") {
    const item = { blocker_id: "BLOCKER-RESUME", status: "open", description: "Requires resolution." };
    b.context.known_blockers.push(item); b.plan.blockers.push(structuredClone(item));
  } else {
    const item = { approval_id: "APPROVAL-RESUME", description: "Requires approval.", authority_kind: "human_program_owner", status: "required", authority_ref: null, approval_evidence_ref: null, approval_evidence_digest: null };
    b.context.required_human_approvals.push(item); b.plan.human_approvals.push(structuredClone(item));
  }
  o.planBundle = closePlanContextBinding(b); o.currentPhase = "waiting_for_approval";
  const fake = nativeAdapter(o), r = await executeContextRollover(o, fake.adapter);
  assert.equal(r.status, "blocked"); assert.equal(r.state_valid, true); assert.equal(r.restart_package[field].length, 1); assert.deepEqual(fake.calls, []);
  const checkpoint = structuredClone(stored(o, r.binding.checkpoint_digest)); checkpoint[field] = [];
  const checkpointDigest = putContentAddressedJson({ storeRoot: o.storeRoot, artifact: checkpoint }).digest;
  const binding = { ...r.binding, checkpoint_digest: checkpointDigest, restart_package_digest: canonicalDigest({ ...r.restart_package, checkpoint_digest: checkpointDigest, [field]: [] }) };
  const bindingDigest = putContentAddressedJson({ storeRoot: o.storeRoot, artifact: binding }).digest;
  assert.throws(() => validateContextRolloverResume({ ...o, bindingDigest }));
});
test("fresh-process CLI reopens exact runtime binding and rejects stale repository", () => {
  const o = setup(), r = prepareContextRollover(o), paths = {};
  for (const [key, value] of Object.entries(o.planBundle)) { paths[key] = resolve(root, `fresh-${serial}-${key}.json`); writeFileSync(paths[key], JSON.stringify(value)); }
  const policyPath = resolve(root, `fresh-policy-${serial}.json`), observationPath = resolve(root, `fresh-observation-${serial}.json`), requestPath = resolve(root, `fresh-request-${serial}.json`);
  writeFileSync(policyPath, JSON.stringify(o.policy)); writeFileSync(observationPath, JSON.stringify(o.observation));
  writeFileSync(requestPath, JSON.stringify({ repository_root: o.repositoryRoot, store_root: o.storeRoot, plan_bundle_paths: paths, policy_path: policyPath, observation_path: observationPath, runtime_policy_digest: o.runtimePolicyDigest, active_package_id: o.activePackageId, completed_package_ids: o.completedPackageIds }));
  const args = [resolve(ROOT, "scripts/codex-context-rollover.mjs"), "resume", "--request", requestPath, "--binding", r.binding_digest];
  const accepted = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(accepted.status, 3, accepted.stderr); assert.deepEqual(JSON.parse(accepted.stdout).restart_package, r.restart_package);
  const next = JSON.parse(accepted.stdout).next_executable_action.argv;
  assert.equal(spawnSync(next[0], next.slice(1), { encoding: "utf8" }).status, 3);
  writeFileSync(resolve(o.repositoryRoot, "work.txt"), "stale");
  assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 2);
});
test("Metrics Event uses verified CAS references, empty unknown outcomes and opt-in", () => {
  const o = setup(), r = prepareContextRollover(o);
  const event = buildRolloverMetricsEvent({ ...o, bindingDigest: r.binding_digest }, "2026-09-25T00:00:00Z");
  assert.deepEqual(event.evidence_references, [r.binding_digest, r.binding.observation_digest]); assert.deepEqual(event.outcome_metrics, {});
  const p = setup(); p.policy.telemetry_enabled = false; const s = prepareContextRollover(p);
  assert.equal(buildRolloverMetricsEvent({ ...p, bindingDigest: s.binding_digest }, "2026-09-25T00:00:00Z"), null);
});
test("frozen run claim rejects replay, out-of-order and continuation after quality stop", () => {
  const { o, protocol, runs } = evaluationFixture(), d = canonicalDigest(protocol);
  freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol, policy: o.policy });
  const claim = condition => claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, condition, repetition: 1 });
  assert.throws(() => claim("rollover")); claim("baseline"); assert.throws(() => claim("baseline"));
  runs[0].quality.unsafe_attempts.value = 1;
  recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, run: runs[0] });
  assert.throws(() => claim("rollover"));
});
test("empty frozen evaluation is insufficient and missing telemetry does not enable next launch", () => {
  const { o, protocol, runs } = evaluationFixture(), d = canonicalDigest(protocol);
  freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol, policy: o.policy });
  assert.equal(evaluateStoredRolloverRuns({ storeRoot: o.storeRoot, protocolDigest: d }).recommendation, "insufficient_evidence");
  claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, condition: "baseline", repetition: 1 });
  runs[0].observation.counters.uncached_input_tokens = unavailableCounter("tokens");
  recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, run: runs[0] });
  assert.throws(() => claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, condition: "rollover", repetition: 1 }));
});
test("receipt cannot be transplanted across an evaluation scope", async () => {
  const { o, protocol, runs } = evaluationFixture();
  const receipt = await executeContextRollover(o, nativeAdapter(o).adapter); runs[1].rollover_receipt_digests = [receipt.receipt_digest];
  protocol.rollover_scope_digest = canonicalDigest("unrelated scope");
  const d = canonicalDigest(protocol); for (const run of runs) run.protocol_digest = d;
  freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol, policy: o.policy });
  claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, condition: "baseline", repetition: 1 });
  recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, run: runs[0] });
  claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, condition: "rollover", repetition: 1 });
  assert.throws(() => recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: d, run: runs[1] }));
});

const digest = value => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
function evidenceDraft(overrides = {}) {
  const draft = {
    schema_version: "1.0.0",
    schema_path: "schemas/verification-evidence.schema.json",
    program: "ask_verification_evidence",
    gate: {
      gate_id: "focused-verification-evidence-test",
      contract_digest: digest("focused-contract-v1"),
      category: "test",
    },
    target: {
      repository_id: "github.com/ist-h-i/agent-spectrum-kernel",
      target_revision: "71282ea971ec5ceda016e10c9c9259f1ff471aa7",
      tree_digest: digest("tree-71282ea"),
    },
    consumed_inputs: [
      {
        kind: "file",
        path: "scripts/test-verification-evidence.mjs",
        digest: digest("focused-test-input"),
      },
      {
        kind: "contract",
        path: "schemas/verification-evidence.schema.json",
        digest: digest("verification-evidence-schema-v1"),
      },
    ],
    execution: {
      command: {
        ...verificationCommandIdentity({
          executable: "node",
          argument_identities: [{
            kind: "public",
            identity_digest: digest("public-argument:scripts/test-verification-evidence.mjs"),
          }],
          working_directory: ".",
        }),
      },
      runner: {
        runner_id: "ask-local-node",
        runner_version: "1.0.0",
        adapter_id: "codex",
        adapter_version: "1.0.0",
        evidence_level: "executed",
      },
      toolchain: [
        {
          name: "node",
          version: "v24.19.0",
          identity_digest: digest("node-v24.19.0-darwin-arm64"),
        },
      ],
      environment: {
        os: "darwin",
        architecture: "arm64",
        identity_digest: digest("darwin-arm64-bounded-environment"),
      },
      terminal: {
        status: "succeeded",
        exit_code: 0,
        duration_ms: 123,
        output_bytes: 17,
        output_digest: digest("focused test pass"),
      },
    },
    coverage: {
      obligation_refs: ["VER-274-S1@2#O-CAS", "VER-274-S1@2#O-EXACT"],
      explicit_non_coverage: ["independent-semantic-review"],
    },
    invalidation: {
      mode: "exact_identity_only",
      unknown_dependencies_require_rerun: true,
    },
    producer: {
      kind: "developer",
    },
    authority: {
      independent_review_status: "not_independent",
    },
    privacy: {
      classification: "internal",
      exportability: "exportable",
      raw_prompts_stored: false,
      transcripts_stored: false,
      raw_output_stored: false,
      secrets_stored: false,
      absolute_private_paths_stored: false,
      private_evaluators_stored: false,
      review_archives_stored: false,
    },
  };
  return { ...draft, ...structuredClone(overrides) };
}

test("existing signed #274 evidence is preserved; missing/tampered/transplanted refs fail", async () => {
  const o = setup(); o.verificationStoreRoot = resolve(root, `evidence-${serial}`);
  const keys = generateKeyPairSync("ed25519");
  const evidence = attestVerificationEvidence(evidenceDraft(), { privateKey: keys.privateKey });
  putVerificationEvidence({ storeRoot: o.verificationStoreRoot, evidence }); o.evidenceIds = [evidence.evidence_id];
  const r = prepareContextRollover(o);
  assert.equal(r.restart_package.evidence_refs[0].evidence_digest, evidence.evidence_digest);
  const cp = structuredClone(stored(o, r.binding.checkpoint_digest)); cp.evidence_refs = [];
  const cd = putContentAddressedJson({ storeRoot: o.storeRoot, artifact: cp }).digest;
  const binding = { ...r.binding, checkpoint_digest: cd, restart_package_digest: canonicalDigest({ ...r.restart_package, checkpoint_digest: cd, evidence_refs: [] }) };
  const bd = putContentAddressedJson({ storeRoot: o.storeRoot, artifact: binding }).digest;
  assert.throws(() => validateContextRolloverResume({ ...o, bindingDigest: bd }));
  const path = evidenceObjectPath({ storeRoot: o.verificationStoreRoot, evidenceId: evidence.evidence_id });
  writeFileSync(path, "{}\n");
  assert.throws(() => validateContextRolloverResume({ ...o, bindingDigest: r.binding_digest }));
  rmSync(path); assert.throws(() => validateContextRolloverResume({ ...o, bindingDigest: r.binding_digest }));
});

test("whole-run measurement includes original context and rollover overhead; missing stays unknown", () => {
  const o = setup(), a = structuredClone(o.observation), b = structuredClone(a);
  a.counters.uncached_input_tokens = observedCounter(10, "tokens"); b.counters.uncached_input_tokens = observedCounter(20, "tokens");
  a.counters.wall_time_ms = observedCounter(100, "ms"); b.counters.wall_time_ms = observedCounter(100, "ms");
  const combined = combineRuntimeObservations([a, b], { startedAtMs: 0, finishedAtMs: 230 });
  assert.equal(combined.counters.uncached_input_tokens.value, 30); assert.equal(combined.counters.wall_time_ms.value, 230);
  assert.equal(combined.counters.model_steps.value, null); assert.equal(combined.session_identity.status, "unavailable");
  b.counters.uncached_input_tokens = unavailableCounter("tokens");
  assert.equal(combineRuntimeObservations([a, b]).counters.uncached_input_tokens.value, null);
});
test("native observer without launch timestamp cannot claim whole-process wall time", () => {
  const observer = createCodexCounterObserver({ runtimePolicyDigest: canonicalDigest("policy"), processIdentity: runtimeIdentity("process"), fromStart: true });
  observer.ingest({ type: "thread.started", thread_id: "thread" }, 100);
  observer.ingest({ type: "turn.started" }, 101); observer.ingest({ type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }, 200);
  assert.equal(observer.finish({ nowMs: 201, completeCapture: true }).counters.wall_time_ms.value, null);
});

for (const operatorEnabled of [false, true]) test(`checkpoint reason uses the accepted operator trigger (${operatorEnabled})`, () => {
  const o = setup(); o.operatorRequest = true; o.policy.operator_request_enabled = operatorEnabled;
  const result = prepareContextRollover(o);
  assert.equal(result.status, "context_rollover_required");
  assert.deepEqual(result.binding.trigger_reasons, operatorEnabled ? ["runtime_steps", "operator_request"] : ["runtime_steps"]);
  assert.equal(stored(o, result.binding.checkpoint_digest).rollover_reason, operatorEnabled ? "operator_request" : "context_pressure");
});

test("evaluation accepts the exact snapshot HEAD after the plan integration base", async () => {
  const { o, protocol, runs } = evaluationFixture();
  const planBase = protocol.source_revision;
  // Keep the tree identical to prove that commit identity, not just bytes, binds.
  git(o.repositoryRoot, "commit", "--allow-empty", "-m", "descendant execution revision");
  protocol.source_revision = git(o.repositoryRoot, "rev-parse", "HEAD");
  assert.notEqual(protocol.source_revision, planBase);
  const pd = canonicalDigest(protocol);
  for (const run of runs) { run.source_revision = protocol.source_revision; run.protocol_digest = pd; }
  freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol, policy: o.policy });
  claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, condition: "baseline", repetition: 1 });
  recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run: runs[0] });
  claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, condition: "rollover", repetition: 1 });
  const rollover = await executeContextRollover(o, nativeAdapter(o).adapter);
  assert.equal(rollover.status, "continuation_started");
  const snapshot = stored(o, rollover.binding.snapshot_digest);
  assert.equal(snapshot.integration_base.commit, planBase);
  assert.equal(snapshot.repository.head, protocol.source_revision);
  runs[1].rollover_receipt_digests = [rollover.receipt_digest];
  recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run: runs[1] });
  assert.equal(evaluateStoredRolloverRuns({ storeRoot: o.storeRoot, protocolDigest: pd }).recommendation, "retain");
});

test("evaluation rejects a different snapshot HEAD even when its plan base matches", async () => {
  const { o, protocol, runs } = evaluationFixture(), pd = canonicalDigest(protocol);
  freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol, policy: o.policy });
  claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, condition: "baseline", repetition: 1 });
  recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run: runs[0] });
  claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, condition: "rollover", repetition: 1 });
  git(o.repositoryRoot, "commit", "--allow-empty", "-m", "different execution revision");
  const rollover = await executeContextRollover(o, nativeAdapter(o).adapter);
  assert.equal(rollover.status, "continuation_started");
  const snapshot = stored(o, rollover.binding.snapshot_digest);
  assert.equal(snapshot.integration_base.commit, protocol.source_revision);
  assert.notEqual(snapshot.repository.head, protocol.source_revision);
  runs[1].rollover_receipt_digests = [rollover.receipt_digest];
  assert.throws(() => recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run: runs[1] }), /EVALUATION_RECEIPT_TRANSPLANT/);
  // Also exercise reopening an externally supplied slot; recording is not the
  // only boundary that must reject this otherwise schema-valid transplant.
  const runDigest = putContentAddressedJson({ storeRoot: o.storeRoot, artifact: runs[1] }).digest;
  writeFileSync(resolve(o.storeRoot, "rollover-evaluation", protocol.protocol_id, "rollover-1.json"), JSON.stringify({ run_digest: runDigest }));
  assert.throws(() => evaluateStoredRolloverRuns({ storeRoot: o.storeRoot, protocolDigest: pd }), /EVALUATION_RECEIPT_TRANSPLANT/);
});

for (const key of ["rework", "resume_failures", "integration_conflicts"]) {
  test(`partial ${key} excess stops evaluation instead of hiding known harm as unknown`, () => {
    const { protocol, runs } = evaluationFixture();
    runs[1].observation.counters[key] = observedCounter(1, "count", "runner", "partial");
    const report = evaluateRolloverRuns(protocol, runs);
    assert.equal(report.recommendation, "stop");
    assert.ok(report.reasons.includes(`GUARDRAIL_REGRESSION:${key}`));
    assert.ok(report.reasons.includes(`GUARDRAIL_COUNTER_UNAVAILABLE:${key}`));
    assert.equal(report.comparisons[0].metrics[key].delta, null);
    runs[0].observation.counters[key].coverage = "partial";
    assert.equal(evaluateRolloverRuns(protocol, runs).recommendation, "insufficient_evidence", "an incomplete baseline must not invent a regression");
  });
  for (const coverage of ["unavailable", "partial"]) test(`${coverage} ${key} blocks the next run before a pair is complete`, () => {
    const { o, protocol, runs } = evaluationFixture(), pd = canonicalDigest(protocol);
    runs[0].observation.counters[key] = coverage === "unavailable" ? unavailableCounter("count") : observedCounter(0, "count", "runner", "partial");
    freezeRolloverEvaluation({ storeRoot: o.storeRoot, protocol, policy: o.policy });
    claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, condition: "baseline", repetition: 1 });
    recordRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, run: runs[0] });
    const report = evaluateStoredRolloverRuns({ storeRoot: o.storeRoot, protocolDigest: pd });
    assert.equal(report.recommendation, "insufficient_evidence");
    assert.ok(report.reasons.includes(`GUARDRAIL_COUNTER_UNAVAILABLE:${key}`));
    assert.throws(() => claimRolloverEvaluationRun({ storeRoot: o.storeRoot, protocolDigest: pd, condition: "rollover", repetition: 1 }), /EVALUATION_STOP_BEFORE_NEXT_RUN/);
    assert.equal(existsSync(resolve(o.storeRoot, "rollover-evaluation", protocol.protocol_id, "claim-rollover-1.json")), false);
  });
}
