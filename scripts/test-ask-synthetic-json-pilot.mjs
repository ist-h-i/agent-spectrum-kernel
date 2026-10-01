import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareFakePilot, runFakePilot, reopenFakePilot, assertPilotCommand, PILOT_LIMITS,
  prepareNativeSimulation, runNativeSimulation, runNativePilot, prepareNativePilot, nativePilotEnvironment,
  pilotPermissionRecord, bindNativePermission, parsePilotNativeSession, NATIVE_CANARY_CODE } from "./ask-synthetic-json-pilot.mjs";
import { canonicalDigest } from "./content-addressed-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => JSON.parse(readFileSync(path, "utf8"));
function prepared(t, scenarios = ["pass", "pass"], options = {}, prepare = prepareFakePilot) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "ask-pilot-test-"));
  const parent = join(base, "workspaces"); mkdirSync(parent);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return prepare({ privateRoot: join(base, "evidence"), workspaceParent: parent, scenarios, ...options });
}
test("two fresh ordered trials pass, reopen, and remain entirely synthetic", t => {
  const { privateRoot } = prepared(t), plan = read(join(privateRoot, "plan.json"));
  const report = runFakePilot(privateRoot);
  assert.equal(report.fake_exec_starts, 2); assert.equal(report.retry, 0); assert.equal(report.stop, null);
  assert.deepEqual(report.slots.map(slot => slot.condition), ["plain", "kernel_only"]);
  assert.deepEqual(report.slots.map(slot => slot.grade.status), ["pass", "pass"]);
  assert.deepEqual(report.slots.map(slot => slot.final_format), ["pass", "pass"]);
  assert.equal(new Set(report.slots.map(slot => slot.session_id)).size, 2);
  for (const slot of report.slots) {
    assert.equal(slot.process.actual_timeout_ms, 120000);
    assert.deepEqual(readdirSync(join(privateRoot, slot.condition, "codex-home")), ["session.json"]);
    assert.deepEqual(readdirSync(join(plan.workspace_root, slot.condition)).sort(), ["answer.json", "input.json", "task.md"]);
    const claim = read(join(privateRoot, slot.condition, "claim.json"));
    assert.equal(claim.state, "spent"); assert.equal(claim.planned_timeout_ms, 120000);
  }
  assert.equal(report.native_cli_starts + report.provider_model_calls + report.credential_operations + report.control_starts, 0);
  assert.deepEqual(reopenFakePilot(privateRoot), report);
  assert.throws(() => runFakePilot(privateRoot));
});
test("A/B stdin differs only by pinned kernel; both argv/profile identities match", t => {
  const { privateRoot } = prepared(t), plan = read(join(privateRoot, "plan.json")); runFakePilot(privateRoot);
  const plain = readFileSync(join(privateRoot, "plain", "stdin.txt"));
  const kernel = readFileSync(join(ROOT, "AGENTS.md"));
  const variant = readFileSync(join(privateRoot, "kernel_only", "stdin.txt"));
  assert.deepEqual(plain, readFileSync(join(ROOT, "benchmarks/fixtures/pilot-json-aggregate-001/task.md")));
  assert.match(plain.toString(), /Prefer one tool call to read input\.json, aggregate its rows, and write\nanswer\.json/);
  assert.match(plain.toString(), /unless necessary/);
  assert.match(plain.toString(), /only concise implementation JSON matching the supplied agent-output schema/);
  assert.deepEqual(variant, Buffer.concat([kernel, Buffer.from("\n"), plain, Buffer.from("\n")]));
  assert.equal(plan.command.argv.includes("--ephemeral"), false);
  assert.equal(plan.command.argv.includes("--sandbox"), false);
  for (const setting of ['model_reasoning_effort="medium"', 'approval_policy="never"', "project_doc_max_bytes=0",
    "permissions.ask_synthetic_pilot.network.enabled=false"]) assert.ok(plan.command.argv.includes(setting));
  assert.ok(plan.command.argv.some(value => value.startsWith("model_providers.ask_pilot_openai=") && value.includes("request_max_retries=0,stream_max_retries=0")));
  assertPilotCommand(plan.command, { privateRoot, controllerRoot: plan.controller_root, workspaceRoot: plan.workspace_root });
  const changed = structuredClone(plan.command); changed.argv.push("--sandbox", "danger-full-access");
  assert.throws(() => assertPilotCommand(changed, { privateRoot, controllerRoot: plan.controller_root, workspaceRoot: plan.workspace_root }));
  assert.equal(plan.auth_source, null); assert.equal(plan.live_authority, null);
});
for (const scenario of ["wrong", "missing", "invalid", "duplicate", "extra-key", "unsorted", "utf8", "oversize-answer", "seed-change", "extra-file"]) {
  test(`${scenario} grades fail but preserves the next healthy trial`, t => {
    const { privateRoot } = prepared(t, [scenario, "pass"]); const report = runFakePilot(privateRoot);
    assert.equal(report.slots[0].grade.status, "fail"); assert.equal(report.slots[1].grade.status, "pass");
    assert.equal(report.fake_exec_starts, 2); assert.equal(report.stop, null); assert.deepEqual(reopenFakePilot(privateRoot), report);
    const criterion = ["seed-change", "extra-file"].includes(scenario) ? "P3" : scenario === "wrong" ? "P2" : "P1";
    assert.equal(report.slots[0].grade[criterion], false);
  });
}
test("synthetic grader exception is unscored with a saved reason and does not block next trial", t => {
  const { privateRoot } = prepared(t, ["unscored", "pass"]); const report = runFakePilot(privateRoot);
  assert.equal(report.slots[0].grade.status, "unscored"); assert.equal(report.slots[0].grade.reason, "synthetic_grader_fault");
  assert.equal(report.slots[1].grade.status, "pass"); assert.equal(report.stop, null);
});
test("final response schema is separate from task score", t => {
  const { privateRoot } = prepared(t, ["bad-final", "pass"]); const report = runFakePilot(privateRoot);
  assert.equal(report.slots[0].final_format, "fail"); assert.equal(report.slots[0].grade.status, "pass"); assert.equal(report.fake_exec_starts, 2);
});
for (const [scenario, stop] of [["symlink", "workspace_boundary_fault"], ["hardlink", "workspace_boundary_fault"],
  ["exit", "process_failure"], ["output-limit", "process_failure"], ["unknown-usage", "usage_unknown"],
  ["threshold", "trial_token_threshold"], ["provider-stop", "provider_stop"], ["identity-drift", "session_identity_failure"]]) {
  test(`${scenario} consumes one slot, stops without retry, preserves not_started slot`, t => {
    const { privateRoot } = prepared(t, [scenario, "pass"]); const report = runFakePilot(privateRoot);
    assert.equal(report.fake_exec_starts, 1); assert.equal(report.stop, stop); assert.equal(report.slots[1].state, "not_started");
    assert.equal(read(join(privateRoot, "plain", "claim.json")).state, "spent");
    assert.equal(report.retry, 0); assert.deepEqual(reopenFakePilot(privateRoot), report); assert.throws(() => runFakePilot(privateRoot));
  });
}
test("timeout actually kills owned Node fake with SIGKILL and records fixed planned limit", t => {
  const { privateRoot } = prepared(t, ["timeout", "pass"], { fakeTimeoutMs: 150 }); const report = runFakePilot(privateRoot);
  assert.equal(report.stop, "process_failure"); assert.equal(report.fake_exec_starts, 1);
  assert.equal(report.slots[0].process.timeout, true); assert.equal(report.slots[0].process.signal, "SIGKILL");
  assert.equal(report.slots[0].process.actual_timeout_ms, 150); assert.equal(report.slots[1].state, "not_started");
});
test("two-trial 60k threshold remains post-completion with per-trial stop precedence", t => {
  const { privateRoot } = prepared(t, ["cumulative-threshold", "cumulative-threshold"]); const report = runFakePilot(privateRoot);
  assert.equal(report.fake_exec_starts, 2); assert.equal(report.total_known_tokens, 60000); assert.equal(report.stop, "trial_token_threshold");
});
test("all unhealthy trials retain failed stream/process evidence", t => {
  const { privateRoot } = prepared(t, ["exit", "exit"]); runFakePilot(privateRoot);
  assert.equal(read(join(privateRoot, "plain", "process.json")).exit, 7);
  assert.match(readFileSync(join(privateRoot, "plain", "stderr.bin"), "utf8"), /synthetic startup failure/);
  assert.equal(read(join(privateRoot, "report.json")).slots[1].state, "not_started");
});
test("source and evidence drift refuse re-execution and reopen", t => {
  const { privateRoot } = prepared(t); const path = join(privateRoot, "plan.json");
  const plan = read(path); plan.source.head = "wrong"; writeFileSync(path, JSON.stringify(plan));
  assert.throws(() => runFakePilot(privateRoot));
  const second = prepared(t); runFakePilot(second.privateRoot);
  writeFileSync(join(second.privateRoot, "plain", "stdout.bin"), "corrupt"); assert.throws(() => reopenFakePilot(second.privateRoot));
});
test("create-once run claim refuses another executor without launching", t => {
  const { privateRoot } = prepared(t); writeFileSync(join(privateRoot, "run-claim.json"), "{}");
  assert.throws(() => runFakePilot(privateRoot)); assert.deepEqual(readdirSync(privateRoot).sort(), ["plan-digest.json", "plan.json", "run-claim.json"]);
});
test("unsafe root, aliases, workspace overlap and arbitrary fake arguments are rejected", t => {
  const { privateRoot } = prepared(t), plan = read(join(privateRoot, "plan.json"));
  assert.throws(() => prepareFakePilot({ controllerRoot: "/" }));
  assert.throws(() => prepareFakePilot({ controllerRoot: realpathSync(ROOT) }));
  assert.throws(() => prepareFakePilot({ workspaceParent: realpathSync(ROOT) }));
  assert.throws(() => prepareFakePilot({ scenarios: ["/bin/sh", "pass"] }));
  const alias = join(plan.workspace_root, "alias"); symlinkSync(privateRoot, alias);
  assert.throws(() => reopenFakePilot(alias));
  assert.throws(() => assertPilotCommand(plan.command, { privateRoot, controllerRoot: plan.controller_root, authSource: "/not-read/auth.json" }));
});
test("live/native entrypoint and extra arguments fail before evidence or launch", () => {
  for (const args of [["live"], ["run"], ["run-fake", "/", "--executable=/bin/sh"]]) {
    assert.throws(() => execFileSync(process.execPath, [join(ROOT, "scripts/ask-synthetic-json-pilot.mjs"), ...args], { env: { LANG: "C" }, timeout: 10000, stdio: "pipe" }));
  }
});
test("fixed limits retain zero retry and separate future control budget", () => {
  assert.equal(PILOT_LIMITS.execs, 2); assert.equal(PILOT_LIMITS.retry, 0); assert.equal(PILOT_LIMITS.timeout_ms, 120000);
  assert.equal(PILOT_LIMITS.trial_tokens, 30000); assert.equal(PILOT_LIMITS.cumulative_tokens, 60000);
  assert.equal(PILOT_LIMITS.future_control, 1); assert.equal(PILOT_LIMITS.future_control_ms, 10000);
});
for (const timeout of [0, 120001, "120000"]) test(`rehashed malformed timeout ${timeout} is rejected before launch`, t => {
  const { privateRoot } = prepared(t), path = join(privateRoot, "plan.json"), plan = read(path);
  plan.synthetic_timeout_ms = timeout; writeFileSync(path, JSON.stringify(plan));
  writeFileSync(join(privateRoot, "plan-digest.json"), JSON.stringify({ digest: canonicalDigest(plan) }));
  assert.throws(() => runFakePilot(privateRoot)); assert.equal(readdirSync(privateRoot).includes("run-claim.json"), false);
});
test("cleanup of a residual fake child preserves original PID, exit and streams", t => {
  const { privateRoot } = prepared(t, ["descendant", "pass"]); const report = runFakePilot(privateRoot);
  assert.equal(report.stop, "process_failure"); assert.equal(report.fake_exec_starts, 1);
  assert.ok(report.slots[0].process.pid > 0); assert.equal(report.slots[0].process.exit, 0);
  assert.equal(report.slots[0].process.residual_detected, true);
  assert.ok(readFileSync(join(privateRoot, "plain", "stdout.bin")).length > 0);
  assert.deepEqual(reopenFakePilot(privateRoot), report);
});
test("artifact collision after launch preserves streams, conservatively counts attempt and stops", t => {
  const { privateRoot } = prepared(t, ["evidence-fault", "pass"]); const report = runFakePilot(privateRoot);
  assert.equal(report.fake_exec_starts, 1); assert.equal(report.stop, "evidence_or_source_fault");
  assert.equal(report.slots[0].state, "spent_incomplete"); assert.equal(report.slots[1].state, "not_started");
  assert.ok(read(join(privateRoot, "plain", "process.json")).pid > 0);
  assert.ok(readFileSync(join(privateRoot, "plain", "stdout.bin")).length > 0);
  assert.deepEqual(read(join(privateRoot, "plain", "grade.json")), {});
  assert.deepEqual(reopenFakePilot(privateRoot), report);
});
test("native adapter uses one model-free control then two execs, through owned fake only", t => {
  const { privateRoot } = prepared(t, ["pass", "pass"], {}, prepareNativeSimulation), plan = read(join(privateRoot, "plan.json"));
  const report = runNativeSimulation(privateRoot);
  assert.equal(report.control.status, "pass"); assert.equal(report.control_starts, 1); assert.equal(report.exec_starts, 2);
  assert.equal(report.fake_exec_starts, 3); assert.equal(report.native_cli_starts, 0); assert.equal(report.provider_model_calls, 0);
  assert.equal(report.credential_operations, 0); assert.equal(report.auth_links_created, 0); assert.equal(report.stop, null);
  assert.equal(new Set(report.slots.map(slot => slot.session_id)).size, 2);
  for (const slot of report.slots) {
    assert.equal(slot.grade.status, "pass");
    const launch = read(join(privateRoot, slot.condition, "launch.json")), received = read(join(privateRoot, slot.condition, "received-launch.json"));
    assert.deepEqual(launch.argv, received.argv);
    // Darwin's exec adds this nonsecret CoreFoundation encoding tag. It is not
    // an inherited credential/config value from the runner's input environment.
    if (Object.hasOwn(received.env, "__CF_USER_TEXT_ENCODING")) {
      assert.match(received.env.__CF_USER_TEXT_ENCODING, /^0x[0-9a-f]+:0x[0-9a-f]+:0x[0-9a-f]+$/iu);
      delete received.env.__CF_USER_TEXT_ENCODING;
    }
    assert.deepEqual(launch.env, received.env);
    assert.equal(launch.argv[0], "exec"); assert.equal(launch.argv.at(-1), "-"); assert.equal(launch.timeout, 120000);
    assert.equal(launch.killSignal, "SIGKILL"); assert.equal(launch.maxBuffer, 1048576);
    assert.ok(launch.argv.includes("-C")); assert.equal(launch.cwd, join(plan.workspace_root, slot.condition));
    assert.equal(launch.argv.includes("--ephemeral"), false); assert.equal(launch.argv.includes("resume"), false);
    assert.deepEqual(readdirSync(launch.env.CODEX_HOME), ["sessions"]);
  }
  const control = read(join(privateRoot, "control", "launch.json"));
  assert.ok(control.argv.includes("--include-managed-config")); assert.equal(control.timeout, 10000);
  assert.equal(control.argv[0], "sandbox"); assert.equal(control.argv.includes("exec"), false);
  assert.ok(plan.command.deny_roots.includes(plan.workspace_root)); assert.ok(plan.command.deny_roots.includes(plan.auth_source));
  assert.deepEqual(reopenFakePilot(privateRoot), report); assert.throws(() => runNativeSimulation(privateRoot));
});
for (const scenario of ["deny-mismatch", "positive-fail", "exit", "timeout"]) test(`native control ${scenario} leaves both exec slots untouched`, t => {
  const { privateRoot } = prepared(t, ["pass", "pass"], { controlScenario: scenario, fakeTimeoutMs: scenario === "timeout" ? 150 : null }, prepareNativeSimulation);
  const report = runNativeSimulation(privateRoot);
  assert.equal(report.control_starts, 1); assert.equal(report.exec_starts, 0); assert.equal(report.stop, "control_failure");
  assert.deepEqual(report.slots.map(slot => slot.state), ["not_started", "not_started"]);
  assert.deepEqual(reopenFakePilot(privateRoot), report); assert.throws(() => runNativeSimulation(privateRoot));
});
for (const [scenario, stop] of [["exit", "process_failure"], ["timeout", "process_failure"], ["unknown-usage", "usage_unknown"],
  ["identity-drift", "session_identity_failure"], ["provider-stop", "provider_stop"]]) test(`native-shaped ${scenario} saves first exec and stops`, t => {
  const { privateRoot } = prepared(t, [scenario, "pass"], { fakeTimeoutMs: scenario === "timeout" ? 150 : null }, prepareNativeSimulation);
  const report = runNativeSimulation(privateRoot);
  assert.equal(report.control.status, "pass"); assert.equal(report.exec_starts, 1); assert.equal(report.stop, stop);
  assert.equal(report.slots[1].state, "not_started"); assert.equal(report.retry, 0);
  assert.deepEqual(reopenFakePilot(privateRoot), report);
});
test("native-shaped incorrect task answer continues to next healthy exec", t => {
  const { privateRoot } = prepared(t, ["wrong", "pass"], {}, prepareNativeSimulation); const report = runNativeSimulation(privateRoot);
  assert.equal(report.exec_starts, 2); assert.deepEqual(report.slots.map(slot => slot.grade.status), ["fail", "pass"]); assert.equal(report.stop, null);
});
test("live/fake mode and old Stage B permissions cannot be transplanted", t => {
  const { privateRoot } = prepared(t, ["pass", "pass"], {}, prepareNativeSimulation), plan = read(join(privateRoot, "plan.json"));
  assert.throws(() => runNativePilot(privateRoot)); assert.throws(() => runFakePilot(privateRoot));
  assert.equal(readdirSync(privateRoot).includes("run-claim.json"), false);
  const permission = pilotPermissionRecord(plan, "synthetic-test-only");
  assert.equal(permission.mode, "fake_native"); assert.equal(permission.kind, "ask_synthetic_pilot_permission_v1");
  assert.equal(permission.plan_digest, canonicalDigest(plan)); assert.equal(permission.actions.ordinary_auth_refresh_write, true);
  assert.equal(permission.actions.new_login, false); assert.equal(permission.actions.auth_copy, false);
  assert.throws(() => pilotPermissionRecord(plan, "")); assert.throws(() => prepareNativePilot({ nativeExecutable: "/not-executed/codex", authSource: "/not-read/auth.json", fakeTimeoutMs: 150 }));
  assert.throws(() => prepareNativePilot({ nativeExecutable: "/not-executed/codex", authSource: "/not-read/auth.json", argv: ["--dangerously-bypass-approvals-and-sandbox"] }));
});
test("native environment does not inherit API keys, HOME, proxy, config or injected runtime options", t => {
  const { privateRoot } = prepared(t); const env = nativePilotEnvironment({ home: privateRoot, nodeExecutable: process.execPath });
  assert.deepEqual(Object.keys(env).sort(), ["CODEX_HOME", "HOME", "LANG", "LC_ALL", "PATH", "TZ"]);
  assert.equal(env.CODEX_HOME, privateRoot); assert.equal(env.HOME, privateRoot);
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "NODE_OPTIONS", "HTTP_PROXY", "HTTPS_PROXY", "CHATGPT_BASE_URL"]) assert.equal(Object.hasOwn(env, key), false);
});
test("native session verifier accepts task tool events but rejects model/network/profile drift", t => {
  const { privateRoot } = prepared(t, ["pass", "pass"], {}, prepareNativeSimulation), plan = read(join(privateRoot, "plan.json")); runNativeSimulation(privateRoot);
  const root = join(privateRoot, "plain"), stdout = readFileSync(join(root, "stdout.bin")), session = readFileSync(join(root, "codex-home", "sessions", "synthetic.jsonl"));
  const workspace = join(plan.workspace_root, "plain"); assert.ok(parsePilotNativeSession({ stdout, session, plan, workspace }).session_id);
  for (const mutate of [ctx => { ctx.effort = "high"; }, ctx => { ctx.sandbox_policy.network_access = true; },
    ctx => { ctx.permission_profile.file_system.entries.pop(); }, ctx => { ctx.permission_profile.file_system.entries[0].access = "read"; }]) {
    const rows = session.toString().trim().split("\n").map(JSON.parse); mutate(rows[1].payload);
    assert.throws(() => parsePilotNativeSession({ stdout, session: Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n"), plan, workspace }));
  }
});
for (const [fault, status] of [["EPERM", 0], ["EACCES", 0], ["ENOENT", 6], ["readable", 5], ["positive", 4]]) test(`exact canary program classifies ${fault} with fixed arguments`, t => {
  const { privateRoot } = prepared(t), ok = join(privateRoot, "public-canary"), denied = join(privateRoot, "private-canary");
  writeFileSync(ok, fault === "positive" ? "wrong" : "ASK_PUBLIC_CANARY\n"); writeFileSync(denied, "nonsecret");
  // This mock is confined to an owned Node test process; no OS permissions or
  // security settings are changed. The actual production canary source runs.
  const prelude = !["readable", "positive"].includes(fault)
    ? `const realOpen=require("fs").openSync;require("fs").openSync=(path,...rest)=>{if(path===process.argv[2]){const e=new Error("synthetic denial");e.code=${JSON.stringify(fault)};throw e}return realOpen(path,...rest)};` : "";
  const result = spawnSync(process.execPath, ["-e", prelude + NATIVE_CANARY_CODE, ok, denied], { encoding: "utf8", timeout: 1000, env: { LANG: "C" } });
  assert.equal(result.status, status); assert.equal(result.stdout, status === 0 ? "ASK_PILOT_CANARY_PASS\n" : "");
});

// Minimal nonsecret structure from the observed 0.157.1 rollout. All identities
// and paths are synthetic; no prompt, tool output or account metadata retained.
function runtimeSessionFixture() {
  return read(join(ROOT, "scripts/test-fixtures/synthetic-pilot-session-01571.json"));
}
function parseRuntimeFixture(fixture) {
  const encode = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  return parsePilotNativeSession({ ...fixture, stdout: encode(fixture.stdout), session: encode(fixture.session) });
}
test("0.157.1 active arg0 runtime read grant is accepted without widening private denies", () => {
  assert.equal(parseRuntimeFixture(runtimeSessionFixture()).model, "gpt-6.1-sol");
});
const runtimeFaults = {
  write: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).access = "write"; },
  sibling_trial: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path = "/synthetic/evidence/kernel_only/codex-home/tmp/arg0/codex-arg0Ab12Cd"; },
  other_private: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path = "/synthetic/evidence/plain/grade.json"; },
  auth: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path = "/synthetic/signin/auth.json"; },
  controller: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path = "/synthetic/controller/tmp/arg0/codex-arg0Ab12Cd"; },
  traversal: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path += "/../codex-arg0Ef34Gh"; },
  duplicate_slash: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path = "/synthetic/evidence/plain/codex-home/tmp//arg0/codex-arg0Ab12Cd"; },
  descendant: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path += "/file"; },
  parent: f => { f.session[1].payload.permission_profile.file_system.entries.at(-1).path.path = "/synthetic/evidence/plain/codex-home/tmp/arg0"; },
  duplicate: f => { const entries = f.session[1].payload.permission_profile.file_system.entries; entries.push(structuredClone(entries.at(-1))); },
  second_runtime: f => { const entries = f.session[1].payload.permission_profile.file_system.entries; const extra = structuredClone(entries.at(-1)); extra.path.path = extra.path.path.replace("Ab12Cd", "Ef34Gh"); entries.push(extra); },
  context_drift: f => { const extra = structuredClone(f.session[1]); extra.payload.permission_profile.file_system.entries.at(-1).path.path = extra.payload.permission_profile.file_system.entries.at(-1).path.path.replace("Ab12Cd", "Ef34Gh"); f.session.push(extra); },
  model: f => { f.session[1].payload.model = "other-model"; },
  reasoning: f => { f.session[1].payload.effort = "high"; },
  network: f => { f.session[1].payload.permission_profile.network = "enabled"; },
  deny_removed: f => { f.session[1].payload.permission_profile.file_system.entries.shift(); },
};
for (const [fault, mutate] of Object.entries(runtimeFaults)) test(`active runtime exception rejects ${fault}`, () => {
  const fixture = runtimeSessionFixture(); mutate(fixture);
  assert.throws(() => parseRuntimeFixture(fixture));
});

test("new plans deny the controller directory containing prior evidence copies", t => {
  const { privateRoot } = prepared(t), plan = read(join(privateRoot, "plan.json"));
  assert.equal(plan.controller_root, realpathSync(join(ROOT, "..", "..")));
  assert.ok(plan.command.deny_roots.includes(plan.controller_root));
  assert.ok(!privateRoot.startsWith(plan.controller_root + "/"));
  assert.ok(!plan.workspace_root.startsWith(plan.controller_root + "/"));
});
test("new native preparation rejects the legacy narrow controller before materialization", () => {
  assert.throws(() => prepareNativePilot({ controllerRoot: realpathSync(join(ROOT, "..")) }), /prior evidence copies/);
});

test("legacy 20k/30k plan can be reopened unchanged but cannot bind or execute", t => {
  const { privateRoot } = prepared(t), path = join(privateRoot, "plan.json"), plan = read(path);
  plan.schema_version = "1.1.0"; plan.limits.trial_tokens = 20000; plan.limits.cumulative_tokens = 30000;
  const digest = canonicalDigest(plan);
  writeFileSync(path, JSON.stringify(plan));
  writeFileSync(join(privateRoot, "plan-digest.json"), JSON.stringify({ digest }));
  const historical = { kind: plan.kind, mode: plan.mode, plan_digest: digest, stop: "trial_token_threshold", total_known_tokens: 22312 };
  writeFileSync(join(privateRoot, "report.json"), JSON.stringify(historical));
  const files = Object.fromEntries(readdirSync(privateRoot).map(name => [name, "sha256:" + createHash("sha256").update(readFileSync(join(privateRoot, name))).digest("hex")]));
  writeFileSync(join(privateRoot, "evidence-seal.json"), JSON.stringify({ plan_digest: digest, files }));
  assert.deepEqual(reopenFakePilot(privateRoot), historical);
  assert.throws(() => runFakePilot(privateRoot), /plan identity invalid/);
  assert.throws(() => runNativePilot(privateRoot), /plan identity invalid/);
  assert.throws(() => bindNativePermission(privateRoot, "unused-legacy-reference"), /plan identity invalid/);
  assert.equal(readdirSync(privateRoot).includes("run-claim.json"), false);
  assert.equal(readdirSync(privateRoot).includes("permission.json"), false);
});
test("rehashed 1.2 plan carrying legacy limits is rejected before launch", t => {
  const { privateRoot } = prepared(t), path = join(privateRoot, "plan.json"), plan = read(path);
  assert.equal(plan.schema_version, "1.2.0");
  plan.limits.trial_tokens = 20000; plan.limits.cumulative_tokens = 30000;
  writeFileSync(path, JSON.stringify(plan));
  writeFileSync(join(privateRoot, "plan-digest.json"), JSON.stringify({ digest: canonicalDigest(plan) }));
  assert.throws(() => runFakePilot(privateRoot), /plan identity invalid/);
  assert.equal(readdirSync(privateRoot).includes("run-claim.json"), false);
});
