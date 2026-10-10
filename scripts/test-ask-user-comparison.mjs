import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { aggregateUserComparisons, inspectNodeVerification, inspectUserComparison, parseUserCodexTelemetry, readUserComparisonPlan,
  reportUserComparison, sanitizeComparisonLog, startUserComparison, userCodexInvocation } from "./ask-user-comparison.mjs";
import { executeCodexSession } from "./codex-exec-runner.mjs";

const git = (repo, args) => {
  const value = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8",
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  assert.equal(value.status, 0, value.stderr); return value.stdout.trim();
};
function fixture(t, extras = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-user-entry-test-"))), repo = join(root, "source");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(repo); mkdirSync(join(repo, "src")); mkdirSync(join(repo, "test"));
  writeFileSync(join(repo, "src/value.mjs"), "export const value = 0;\n");
  writeFileSync(join(repo, "test/value.test.mjs"), "import test from 'node:test'; import assert from 'node:assert/strict'; import {value} from '../src/value.mjs'; test('value is one',()=>assert.equal(value,1));\n");
  writeFileSync(join(repo, "AGENTS.md"), "Project instruction: keep the public API.\n");
  git(repo, ["init", "-q"]); git(repo, ["add", "."]);
  git(repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "test seed"]);
  const taskFile = join(root, "task.md"), verificationFile = join(root, "verification.json");
  writeFileSync(taskFile, "Set the exported value to 1. Keep the API and existing tests.\n");
  writeFileSync(verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
    requirements: [{ id: "value-one", description: "The exported value is one", command: ["node", "--test", "test/value.test.mjs"] }] }));
  const global = join(root, "global-setting-sentinel"); writeFileSync(global, "do not change\n");
  const options = { repo, commit: git(repo, ["rev-parse", "HEAD"]), taskFile, verificationFile, output: join(root, "comparison"),
    mutablePaths: ["src/"], taskClass: "trivial", evidenceKind: "synthetic", model: "declared-model", reasoning: "medium", cliVersion: "declared-test-version", ...extras };
  return { root, repo, global, options, prepare: () => prepareUserComparison(options) };
}
function fake(calls, scenario = "pass") {
  return async invocation => {
    const id = invocation.cwd.split("/").at(-1); calls.push({ ...invocation, condition: id });
    if (scenario === "denied") return { spawnObserved: false, exitCode: null, error: { code: "EACCES", message: "launch denied" }, stdout: "", stderr: "", durationMs: 0 };
    invocation.onSpawn?.(12345);
    const output = invocation.argv[invocation.argv.indexOf("--output-last-message") + 1];
    if (scenario !== "missing") writeFileSync(output, "Changed value. This self-report is not a score.\n");
    writeFileSync(join(invocation.cwd, "src/value.mjs"), "export const value = 1;\n");
    if (scenario === "scope") writeFileSync(join(invocation.cwd, "AGENTS.md"), "changed project instructions\n");
    return { spawnObserved: true, exitCode: scenario === "failed" ? 9 : scenario === "timeout" || scenario === "interrupt" ? null : 0,
      timedOut: scenario === "timeout", interrupted: scenario === "interrupt", signal: scenario === "timeout" ? "SIGTERM" : null,
      error: null, durationMs: 20, stdout: scenario === "unknown-usage" ? "" : JSON.stringify({ type: "thread.started", thread_id: id }) + "\n"
        + JSON.stringify({ type: "turn.completed", model: id === "full_ask" ? "observed-other-model" : "declared-model", usage: { input_tokens: 12, output_tokens: 8, cached_input_tokens: 0 } }) + "\n",
      stderr: "" };
  };
}

test("prepare/inspect/report start no runner, keep source/custom/global state and expose exact launch", t => {
  const f = fixture(t), sourceBefore = git(f.repo, ["status", "--porcelain"]), prepared = f.prepare();
  const inspection = inspectUserComparison(prepared.root), report = reportUserComparison(prepared.root);
  assert.equal(inspection.plan_digest, prepared.plan_digest);
  assert.deepEqual(report.slots.map(slot => slot.state), ["not_started", "not_started", "not_started"]);
  assert.equal(report.evidence_kind, "plan");
  assert.equal(git(f.repo, ["status", "--porcelain"]), sourceBefore);
  assert.equal(readFileSync(f.global, "utf8"), "do not change\n");
  assert.ok(inspection.invocations.every(item => item.input === prepared.plan.prompt));
  assert.deepEqual(inspection.invocations.map(item => item.cwd), ["plain", "kernel_only", "full_ask"].map(id => join(prepared.root, "arms", id)));
  for (const item of inspection.invocations) {
    assert.deepEqual(item.argv.slice(0, 5), ["exec", "--sandbox", "workspace-write", "--json", "--output-last-message"]);
    assert.ok(item.argv.includes("--model")); assert.ok(item.argv.includes('model_reasoning_effort="medium"')); assert.equal(item.argv.at(-1), "-");
    assert.ok(!item.argv.includes("resume") && !item.argv.includes("--dangerously-bypass-approvals-and-sandbox"));
  }
  assert.deepEqual(prepared.plan.policy, { attempts: 1, retries: 0, concurrency: 1 });
});

test("three fake sessions finish sequentially with patches, actual independent Node tests and unknown costs", async t => {
  const f = fixture(t), p = f.prepare(), calls = [];
  let active = 0, maxActive = 0;
  const run = fake(calls);
  const runner = async input => { active++; maxActive = Math.max(maxActive, active); const result = await run(input); active--; return result; };
  const report = await startUserComparison(p.root, p.plan_digest, { runner });
  assert.equal(maxActive, 1); assert.deepEqual(calls.map(call => call.condition), ["plain", "kernel_only", "full_ask"]);
  assert.equal(report.evidence_kind, "synthetic");
  assert.ok(report.slots.every(slot => slot.state === "completed" && slot.outcome === "pass"));
  assert.ok(report.slots.every(slot => slot.launch_requested && slot.spawn_observed && slot.process_completed && slot.exit_code === 0));
  assert.ok(report.slots.every(slot => slot.cost === null && slot.request_count === null && slot.verification.independent_process));
  assert.ok(report.slots.every(slot => slot.verification.checks.every(check => check.status === "pass")));
  assert.match(readFileSync(join(p.root, "control/slots/plain/patch.diff"), "utf8"), /export const value = 1/u);
  assert.ok(report.summary.blocks[0].contrasts[1].differences.some(diff => diff.field === "model"));
  assert.equal(readFileSync(join(f.repo, "src/value.mjs"), "utf8"), "export const value = 0;\n");
  const before = readFileSync(join(p.root, "control/slots/plain/result.json"));
  await assert.rejects(startUserComparison(p.root, p.plan_digest, { runner }), /already consumed/u);
  assert.equal(calls.length, 3); assert.deepEqual(readFileSync(join(p.root, "control/slots/plain/result.json")), before);
});

test("Kernel missing routes remain capability_missing with no injected skills; F still gets its slot", async t => {
  const f = fixture(t, { taskClass: "implementation" }), p = f.prepare(), calls = [];
  assert.equal(p.plan.arms.kernel_only.capability.status, "capability_missing");
  const report = await startUserComparison(p.root, p.plan_digest, { runner: fake(calls) });
  assert.deepEqual(calls.map(call => call.condition), ["plain", "full_ask"]);
  const k = report.slots[1]; assert.equal(k.state, "capability_missing"); assert.equal(k.launch_requested, false); assert.equal(k.spawn_observed, false);
  assert.equal(k.outcome, "unknown"); assert.equal(k.metrics.duration_ms, null);
  assert.equal(report.summary.blocks[0].trials[1].execution_state, "not_started");
});

test("denied, runner failure, timeout, interruption and missing final result preserve partial runs", async t => {
  for (const [scenario, state, spawn] of [["denied", "permission_denied", false], ["failed", "runner_failed", true],
    ["timeout", "timeout", true], ["interrupt", "interrupted", true], ["missing", "result_missing", true], ["scope", "scope_violation", true]]) {
    const f = fixture(t), p = f.prepare(), calls = [];
    const report = await startUserComparison(p.root, p.plan_digest, { runner: fake(calls, scenario) });
    assert.equal(calls.length, 1, scenario);
    assert.deepEqual(report.slots.map(slot => slot.state), [state, "not_started", "not_started"], scenario);
    assert.equal(report.slots[0].launch_requested, true); assert.equal(report.slots[0].spawn_observed, spawn);
    assert.ok(report.slots[0].reason.length > 0); assert.equal(report.summary.blocks[0].trials.length, 3);
    assert.ok(report.slots[0].outcome !== "pass");
  }
});

test("abort between slots never starts later arms, and terminal receipt loss is not treated as unstarted", async t => {
  const f = fixture(t), p = f.prepare(), calls = [], controller = new AbortController();
  const run = fake(calls);
  const report = await startUserComparison(p.root, p.plan_digest, { signal: controller.signal,
    runner: async input => { const value = await run(input); controller.abort(); return value; } });
  assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "interrupted");
  rmSync(join(p.root, "control/slots/plain/result.json"));
  const partial = reportUserComparison(p.root);
  assert.equal(partial.slots[0].state, "incomplete"); assert.equal(partial.slots[0].spawn_observed, true);
  assert.equal(partial.slots[0].outcome, "unknown"); assert.equal(partial.slots[1].state, "not_started");
  writeFileSync(join(p.root, "control/slots/plain/result.json"), "not-json");
  assert.equal(reportUserComparison(p.root).slots[0].state, "result_missing");
});

test("unassessed requirements and unknown usage remain unknown despite tests and self-report", async t => {
  const f = fixture(t);
  writeFileSync(f.options.verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
    requirements: [{ id: "human", description: "human review of the solution" }] }));
  const p = f.prepare(), calls = [], report = await startUserComparison(p.root, p.plan_digest, { runner: fake(calls, "unknown-usage") });
  assert.ok(report.slots.every(slot => slot.state === "completed" && slot.outcome === "unknown"));
  assert.ok(report.slots.every(slot => slot.metrics.input_tokens === null && slot.metrics.cached_tokens === null));
  assert.ok(report.slots.every(slot => slot.verification.requirements[0].status === "unknown"));
  assert.ok(report.summary.summaries.every(row => row.metrics.input_tokens.unknown_count === 1 && row.metrics.input_tokens.distribution.mean === null));
});

test("independent failing test yields fail and stops subsequent conditions", async t => {
  const f = fixture(t), p = f.prepare(), calls = [], run = fake(calls);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
    const value = await run(input); writeFileSync(join(input.cwd, "src/value.mjs"), "export const value = 2;\n"); return value;
  } });
  assert.equal(report.slots[0].state, "verification_failed"); assert.equal(report.slots[0].outcome, "fail");
  assert.equal(report.slots[1].state, "not_started");
});

test("plan digest, input, arm drift and second output guards act before launch", async t => {
  const f = fixture(t), p = f.prepare(), calls = [], runner = fake(calls);
  await assert.rejects(startUserComparison(p.root, "sha256:wrong", { runner }), /confirm/u);
  writeFileSync(join(p.root, "arms/plain/src/value.mjs"), "tampered");
  await assert.rejects(startUserComparison(p.root, p.plan_digest, { runner }), /prepared plain changed/u);
  assert.equal(calls.length, 0);
  assert.throws(() => f.prepare(), /exist/iu);
  const newer = prepareUserComparison({ ...f.options, output: join(f.root, "new-run"), rerunOf: p.plan.run_id });
  assert.notEqual(newer.plan.run_id, p.plan.run_id); assert.equal(newer.plan.rerun_of, p.plan.run_id);
});

test("fake and observed/plan reports stay in separate aggregate groups and duplicate runs are refused", async t => {
  const f = fixture(t), p = f.prepare(); await startUserComparison(p.root, p.plan_digest, { runner: fake([]) });
  const next = prepareUserComparison({ ...f.options, output: join(f.root, "unstarted-observed"), evidenceKind: "observed" });
  const value = aggregateUserComparisons([p.root, next.root]);
  assert.equal(value.mixed_evidence_pooled, false); assert.deepEqual(value.groups.map(group => group.evidence_kind), ["synthetic", "plan"]);
  // Simulate future saved observed receipts in this test only; no real model ran.
  writeFileSync(join(next.root, "control/start.json"), JSON.stringify({ run_id: next.plan.run_id, plan_digest: next.plan_digest, evidence_kind: "observed" }));
  const mixed = aggregateUserComparisons([p.root, next.root]);
  assert.deepEqual(mixed.groups.map(group => group.evidence_kind), ["synthetic", "observed"]);
  assert.throws(() => aggregateUserComparisons([p.root, p.root]), /duplicate run/u);
});

test("telemetry keeps missing values, actual difference and reported failure; sanitizes secrets", () => {
  const unknown = parseUserCodexTelemetry("not JSON\n"); assert.equal(unknown.metrics.input_tokens, null); assert.equal(unknown.cost, null);
  const value = parseUserCodexTelemetry('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}\n{"type":"turn.failed","error":{"message":"rejected"}}\n');
  assert.equal(value.metrics.cached_tokens, null); assert.deepEqual(value.errors, ["rejected"]);
  const partial = parseUserCodexTelemetry('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2,"cached_input_tokens":0}}\n{"type":"turn.completed","usage":{"input_tokens":3}}\n');
  assert.deepEqual(partial.metrics, { input_tokens: 13, output_tokens: null, cached_tokens: null });
  const log = sanitizeComparisonLog("Authorization: Bearer abc\nCookie: sid=abc\napi_key=foo\nsk-abcdefghijklmnopqrstuvwxyz\n");
  assert.ok(!log.includes("Bearer abc") && !log.includes("sid=abc") && !log.includes("=foo") && !log.includes("sk-abc"));
});

test("successful exit without executed assertions or with skipped tests cannot certify verification", () => {
  assert.equal(inspectNodeVerification("").assertions_observed, false);
  assert.equal(inspectNodeVerification("# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n").assertions_observed, false);
  assert.equal(inspectNodeVerification("# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n").assertions_observed, true);
});

test("existing runner exported seam passes exact arguments/cwd/stdin and never invokes Codex in tests", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-user-process-test-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = join(root, "fake-runner.mjs");
  writeFileSync(script, "import fs from 'node:fs'; process.stdout.write(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),input:fs.readFileSync(0,'utf8')}));\n");
  let started = 0;
  const result = await executeCodexSession({ executable: process.execPath, argv: [script, "arg one", "-"], cwd: root, input: "same task\n", timeoutMs: 2000, onSpawn: () => started++ });
  assert.equal(started, 1); assert.equal(result.spawnObserved, true); assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { argv: ["arg one", "-"], cwd: root, input: "same task\n" });
  const denied = await executeCodexSession({ executable: join(root, "absent"), argv: [], cwd: root, input: "", timeoutMs: 2000 });
  assert.equal(denied.spawnObserved, false); assert.equal(denied.error.code, "ENOENT");
  const timeout = await executeCodexSession({ executable: process.execPath, argv: ["-e", "setInterval(()=>{},1000)"], cwd: root, input: "", timeoutMs: 60 });
  assert.equal(timeout.timedOut, true); assert.equal(timeout.spawnObserved, true);
  const controller = new AbortController();
  const pending = executeCodexSession({ executable: process.execPath, argv: ["-e", "setInterval(()=>{},1000)"], cwd: root, input: "", timeoutMs: 2000, signal: controller.signal, onSpawn: () => controller.abort() });
  assert.equal((await pending).interrupted, true);
  const beforeSpawn = new AbortController(); beforeSpawn.abort(); let called = false;
  const aborted = await executeCodexSession({ executable: process.execPath, argv: [], cwd: root, input: "", timeoutMs: 2000, signal: beforeSpawn.signal },
    () => { called = true; throw new Error("must not spawn"); });
  assert.equal(called, false); assert.equal(aborted.spawnObserved, false); assert.equal(aborted.exitCode, null);
  const isolated = await executeCodexSession({ executable: process.execPath,
    argv: ["-e", "process.stdout.write(JSON.stringify({keys:Object.keys(process.env)}))"], cwd: root, input: "", timeoutMs: 2000, env: { ASK_TEST_SAFE: "1" } });
  assert.equal(isolated.exitCode, 0);
  const keys = JSON.parse(isolated.stdout).keys;
  assert.ok(keys.includes("ASK_TEST_SAFE") && !keys.includes("HOME") && !keys.includes("PATH") && !keys.includes("CODEX_HOME"));
  const outputLimit = await executeCodexSession({ executable: process.execPath,
    argv: ["-e", "process.stdout.write(Buffer.alloc(11*1024*1024,65));setInterval(()=>{},1000)"], cwd: root, input: "", timeoutMs: 2000 });
  assert.equal(outputLimit.outputLimited, true); assert.equal(outputLimit.stdout.length, 10 * 1024 * 1024); assert.equal(outputLimit.cleanupError, null);
  const failedReceipt = await executeCodexSession({ executable: process.execPath, argv: ["-e", "setInterval(()=>{},1000)"],
    cwd: root, input: "", timeoutMs: 2000, onSpawn: () => { throw new Error("receipt write failed"); } });
  assert.match(failedReceipt.error.message, /receipt write failed/u); assert.equal(failedReceipt.cleanupError, null);
});

test("saved plan and start identity cannot be changed beneath completed receipts", async t => {
  const f = fixture(t), p = f.prepare(); await startUserComparison(p.root, p.plan_digest, { runner: fake([]) });
  const path = join(p.root, "control/plan.json"), original = readFileSync(path);
  const plan = JSON.parse(original); plan.source.commit = "a".repeat(40); plan.config.model = "changed-history";
  writeFileSync(path, JSON.stringify(plan));
  assert.throws(() => reportUserComparison(p.root), /saved plan changed/u);
  writeFileSync(path, original);
  const start = join(p.root, "control/start.json"), record = JSON.parse(readFileSync(start)); record.plan_digest = `sha256:${"b".repeat(64)}`;
  writeFileSync(start, JSON.stringify(record));
  assert.throws(() => reportUserComparison(p.root), /started plan differs/u);
});

test("unsafe final artifact still saves a failed terminal receipt and does not start later conditions", async t => {
  const f = fixture(t), p = f.prepare(), calls = [], run = fake(calls);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
    const value = await run(input), output = input.argv[input.argv.indexOf("--output-last-message") + 1];
    rmSync(output); symlinkSync(join(input.cwd, "src/value.mjs"), output); return value;
  } });
  assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "runner_failed");
  assert.equal(report.slots[0].artifact_errors[0].name, "last-message.txt");
  assert.equal(report.slots[0].outcome, "unknown"); assert.equal(report.slots[1].state, "not_started");
  assert.equal(report.slots[0].spawn_observed, true); assert.equal(report.slots[0].exit_code, 0);
});

test("changed Git control metadata stops evidence Git calls, while artifact loss invalidates a receipt", async t => {
  const f = fixture(t), p = f.prepare(), calls = [], run = fake(calls);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
    const value = await run(input); const config = join(input.cwd, ".git/config");
    writeFileSync(config, `${readFileSync(config, "utf8")}\n`); return value;
  } });
  assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "scope_violation");
  assert.ok(report.slots[0].scope.violations.includes(".git/config")); assert.equal(report.slots[0].patch_ref, null);
  const g = fixture(t), q = g.prepare(); await startUserComparison(q.root, q.plan_digest, { runner: fake([]) });
  rmSync(join(q.root, "control/slots/plain/patch.diff"));
  const missing = reportUserComparison(q.root); assert.equal(missing.slots[0].state, "result_missing"); assert.equal(missing.slots[0].outcome, "unknown");
});

test("CLI inspection/report can reopen from caller output without a known temporary path", t => {
  const f = fixture(t), p = f.prepare(), script = new URL("./ask-user-comparison.mjs", import.meta.url).pathname;
  const before = readdirSync(join(p.root, "control"));
  for (const command of ["inspect", "report"]) {
    const value = spawnSync(process.execPath, [script, command, p.root, "--json"], { cwd: f.repo, encoding: "utf8", timeout: 10000 });
    assert.equal(value.status, 0, value.stderr); assert.equal(JSON.parse(value.stdout).plan_digest, p.plan_digest);
  }
  assert.deepEqual(readdirSync(join(p.root, "control")), before);
  assert.equal(readUserComparisonPlan(p.root).plan.run_id, p.plan.run_id);
  assert.equal(userCodexInvocation(p.root, p.plan, "plain").input, p.plan.prompt);
});
