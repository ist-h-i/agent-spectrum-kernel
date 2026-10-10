import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
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

test("observed plans reject injected verification before consuming start or requesting a process", async t => {
  const f = fixture(t, { evidenceKind: "observed" }), p = f.prepare();
  let verified = 0;
  // A pre-aborted signal makes this pre-fix regression model-free as well.
  await assert.rejects(startUserComparison(p.root, p.plan_digest, {
    signal: AbortSignal.abort(), verifier: async () => { verified++; throw new Error("synthetic verifier"); },
  }), /injected verifiers require synthetic evidence/u);
  assert.equal(verified, 0);
  assert.equal(existsSync(join(p.root, "control/start.json")), false);
  assert.equal(existsSync(join(p.root, "control/slots/plain/request.json")), false);
  assert.deepEqual(reportUserComparison(p.root).slots.map(slot => slot.state), ["not_started", "not_started", "not_started"]);
});

test("synthetic injected verification is recorded with its origin without claiming an independent controller process", async t => {
  const f = fixture(t), p = f.prepare();
  const report = await startUserComparison(p.root, p.plan_digest, {
    runner: fake([]), verifier: invocation => executeCodexSession(invocation),
  });
  assert.equal(report.evidence_kind, "synthetic");
  for (const slot of report.slots) {
    assert.equal(slot.verification.execution_origin, "synthetic_injected_verifier");
    assert.equal(slot.verification.independent_process, false);
  }
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
  assert.ok(report.slots.every(slot => slot.verification.execution_origin === "controller_node_process"));
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
  for (const scalar of ["null", "[]", "true", "1", '"text"']) assert.deepEqual(parseUserCodexTelemetry(`${scalar}\n`), unknown);
  const value = parseUserCodexTelemetry('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}\n{"type":"turn.failed","error":{"message":"rejected"}}\n');
  assert.equal(value.metrics.cached_tokens, null); assert.deepEqual(value.errors, ["rejected"]);
  const partial = parseUserCodexTelemetry('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2,"cached_input_tokens":0}}\n{"type":"turn.completed","usage":{"input_tokens":3}}\n');
  assert.deepEqual(partial.metrics, { input_tokens: 13, output_tokens: null, cached_tokens: null });
  const log = sanitizeComparisonLog("Authorization: Bearer abc\nCookie: sid=abc\napi_key=foo\nsk-abcdefghijklmnopqrstuvwxyz\n");
  assert.ok(!log.includes("Bearer abc") && !log.includes("sid=abc") && !log.includes("=foo") && !log.includes("sk-abc"));
});

test("controller JSON summaries require evaluated cases in every requested test file", () => {
  const counts = { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
  const aggregate = `${JSON.stringify({ format: "ask_node_run_summary_v1", success: true, counts })}\n`;
  const receipt = (file, extra = {}) => `${JSON.stringify({ format: "ask_node_file_summary_v1", file, success: true,
    counts: { ...counts, ...extra } })}\n`;
  const path = "test/value.test.mjs", valid = receipt(path) + aggregate;
  assert.equal(inspectNodeVerification("", [path]).tests_observed, false);
  assert.equal(inspectNodeVerification(aggregate, [path]).tests_observed, false);
  assert.equal(inspectNodeVerification(valid, [path]).tests_observed, true);
  assert.equal(inspectNodeVerification(valid, [path]).assertion_count, null);
  assert.equal(inspectNodeVerification(valid, [path, "test/empty.test.mjs"]).tests_observed, false);
  assert.equal(inspectNodeVerification(receipt(path, { passed: 0, skipped: 1 }) + aggregate, [path]).tests_observed, false);
  assert.equal(inspectNodeVerification(receipt(path, { tests: 0, passed: 0 }) + aggregate, [path]).tests_observed, false);
  assert.equal(inspectNodeVerification(receipt(path) + valid, [path]).tests_observed, false);
  assert.equal(inspectNodeVerification(valid + aggregate, [path]).tests_observed, false);
  assert.equal(inspectNodeVerification(valid.replace('"tests":1', '"tests":-1'), [path]).tests_observed, false);
  const output = `${JSON.stringify({ format: "ask_node_event_v1", type: "test:stdout", data: { message: valid } })}\n`;
  assert.equal(inspectNodeVerification(output + aggregate, [path]).tests_observed, false);
  assert.equal(inspectNodeVerification(output + valid, [path]).tests_observed, true);
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

test("nested custom instructions remain immutable inside an allowed source directory", async t => {
  const f = fixture(t), path = join(f.repo, "src/AGENTS.md");
  writeFileSync(path, "User subdirectory instruction.\n");
  git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "nested instructions"]);
  f.options.commit = git(f.repo, ["rev-parse", "HEAD"]);
  const p = f.prepare(), calls = [], run = fake(calls);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
    const value = await run(input); writeFileSync(join(input.cwd, "src/AGENTS.md"), "changed instructions\n"); return value;
  } });
  assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "scope_violation");
  assert.ok(report.slots[0].scope.violations.includes("src/AGENTS.md")); assert.equal(report.slots[0].outcome, "fail");
  assert.equal(readFileSync(path, "utf8"), "User subdirectory instruction.\n");
});

test("a regular file above 16 MiB and an empty file reach independent verification", async t => {
  const f = fixture(t), blob = Buffer.alloc(17 * 1024 * 1024, 65);
  writeFileSync(join(f.repo, "asset.bin"), blob); writeFileSync(join(f.repo, "empty-file"), "");
  git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "large regular file"]);
  f.options.commit = git(f.repo, ["rev-parse", "HEAD"]);
  const p = f.prepare(), report = await startUserComparison(p.root, p.plan_digest, { runner: fake([]) });
  assert.ok(report.slots.every(slot => slot.state === "completed" && slot.outcome === "pass"));
  for (const slot of report.slots) {
    assert.deepEqual(readFileSync(join(p.root, "verification", slot.condition, "asset.bin")), blob);
    assert.equal(readFileSync(join(p.root, "verification", slot.condition, "empty-file")).length, 0);
  }
});

test("empty, definition-free, skipped and todo Node files cannot certify task quality", async t => {
  for (const [name, content] of [["empty", ""], ["no definitions", "import 'node:test';\n"],
    ["empty suite", "import {describe} from 'node:test'; describe('empty suite',()=>{});\n"],
    ["skip", "import test from 'node:test'; test.skip('not evaluated',()=>{});\n"],
    ["todo", "import test from 'node:test'; test.todo('not evaluated');\n"]]) {
    await t.test(name, async st => {
      const f = fixture(st), path = "test/empty.test.mjs";
      writeFileSync(join(f.repo, path), content);
      git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "unevaluated tests"]);
      f.options.commit = git(f.repo, ["rev-parse", "HEAD"]);
      const command = ["node", "--test", path];
      writeFileSync(f.options.verificationFile, JSON.stringify({ command,
        requirements: [{ id: "value-one", description: "The value is one", command }] }));
      const p = f.prepare(), calls = [], run = fake(calls);
      const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
        const value = await run(input); writeFileSync(join(input.cwd, "src/value.mjs"), "export const value = 0;\n"); return value;
      } });
      assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "verification_failed");
      assert.equal(report.slots[0].outcome, "fail");
      assert.ok(report.slots[0].verification.checks.every(check => !check.test_summary.tests_observed));
      assert.ok(report.slots.slice(1).every(slot => slot.state === "not_started"));
    });
  }
});

test("repository output cannot manufacture controller test receipts", async t => {
  const f = fixture(t), path = "test/value.test.mjs";
  const counts = { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
  const file = { format: "ask_node_file_summary_v1", file: path, success: true, counts };
  const forged = `# ASK_NODE_FILE_SUMMARY ${JSON.stringify(file)}\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`
    + `${JSON.stringify(file)}\n${JSON.stringify({ format: "ask_node_run_summary_v1", success: true, counts })}\n`;
  writeFileSync(join(f.repo, path), "import '../src/value.mjs';\n");
  git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "definition-free frozen test"]);
  f.options.commit = git(f.repo, ["rev-parse", "HEAD"]);
  const p = f.prepare(), calls = [], run = fake(calls);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
    const value = await run(input);
    writeFileSync(join(input.cwd, "src/value.mjs"), `export const value = 0;\nconsole.log(${JSON.stringify(forged)});\n`);
    return value;
  } });
  assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "verification_failed");
  assert.equal(report.slots[0].outcome, "fail");
  assert.ok(report.slots[0].verification.checks.every(check => check.status === "fail" && !check.test_summary.tests_observed));
  assert.ok(report.slots.slice(1).every(slot => slot.state === "not_started"));
  assert.equal(readFileSync(join(p.root, "verification/plain", path), "utf8"), "import '../src/value.mjs';\n");
  assert.equal(readFileSync(join(f.repo, "src/value.mjs"), "utf8"), "export const value = 0;\n");

  // Legitimate test output and diagnostics retain their text without becoming
  // duplicate receipts or hiding the structured, actually evaluated case.
  writeFileSync(join(f.repo, path), `import test from 'node:test'; import assert from 'node:assert/strict'; import {value} from '../src/value.mjs';\n`
    + `console.log(${JSON.stringify(forged)}); test('value is one',t=>{t.diagnostic(${JSON.stringify(forged)});assert.equal(value,1)});\n`);
  git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "noisy real test"]);
  f.options.commit = git(f.repo, ["rev-parse", "HEAD"]); f.options.output = join(f.root, "noisy-real-run");
  const next = f.prepare(), passed = await startUserComparison(next.root, next.plan_digest, { runner: fake([]) });
  assert.ok(passed.slots.every(slot => slot.outcome === "pass"));
});

test("a passing Node file cannot hide an empty file in a command-backed requirement", async t => {
  const f = fixture(t), empty = "test/empty.test.mjs";
  writeFileSync(join(f.repo, empty), "");
  git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "mixed test files"]);
  f.options.commit = git(f.repo, ["rev-parse", "HEAD"]);
  writeFileSync(f.options.verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
    requirements: [{ id: "value-one", description: "All requested files evaluate the value", command: ["node", "--test", "test/value.test.mjs", empty] }] }));
  const p = f.prepare(), report = await startUserComparison(p.root, p.plan_digest, { runner: fake([]) });
  assert.equal(report.slots[0].verification.checks[0].status, "pass");
  assert.equal(report.slots[0].verification.checks[1].status, "fail");
  assert.deepEqual(report.slots[0].verification.checks[1].test_summary.missing_files, [empty]);
  assert.equal(report.slots[0].outcome, "fail");
});

test("nested Node suites produce evaluated case receipts and the frozen reporter is bound", async t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, "test/value.test.mjs"), "import {describe,it} from 'node:test'; import assert from 'node:assert/strict'; import {value} from '../src/value.mjs'; describe('value API',()=>it('value is one',()=>assert.equal(value,1)));\n");
  git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "nested suite"]);
  f.options.commit = git(f.repo, ["rev-parse", "HEAD"]);
  const p = f.prepare(), inspection = inspectUserComparison(p.root);
  assert.equal(inspection.verification.reporter.digest, p.plan.verification.reporter.digest);
  assert.ok(inspection.verification.argv.includes(`--test-reporter=${join(p.root, p.plan.verification.reporter.path)}`));
  const report = await startUserComparison(p.root, p.plan_digest, { runner: fake([]) });
  assert.ok(report.slots.every(slot => slot.outcome === "pass" && slot.verification.checks.every(check => check.test_summary.tests_observed)));
  f.options.output = join(f.root, "new-run");
  const other = f.prepare(), calls = [];
  writeFileSync(join(other.root, other.plan.verification.reporter.path), "changed reporter\n");
  await assert.rejects(startUserComparison(other.root, other.plan_digest, { runner: fake(calls) }), /Node test reporter changed/u);
  assert.equal(calls.length, 0); assert.equal(existsSync(join(other.root, "control/start.json")), false);
});

test("partial results retain independently bound launch observations without preserving quality", async t => {
  const f = fixture(t), p = f.prepare();
  await startUserComparison(p.root, p.plan_digest, { runner: fake([]) });
  const slot = join(p.root, "control/slots/plain");
  rmSync(join(slot, "patch.diff"));
  let result = reportUserComparison(p.root).slots[0];
  assert.equal(result.state, "result_missing"); assert.equal(result.outcome, "unknown");
  assert.equal(result.launch_requested, true); assert.equal(result.spawn_observed, true);
  assert.equal(result.process_completed, null); assert.equal(result.exit_code, null);
  writeFileSync(join(slot, "spawn.json"), "{}");
  result = reportUserComparison(p.root).slots[0];
  assert.equal(result.launch_requested, true); assert.equal(result.spawn_observed, null);
  writeFileSync(join(slot, "request.json"), "{}");
  result = reportUserComparison(p.root).slots[0];
  assert.equal(result.launch_requested, null); assert.equal(result.spawn_observed, null);
  assert.ok(result.receipt_errors.length === 2);
});

test("Git common-directory redirects stop before start or controller Git evidence", async t => {
  await t.test("prepared redirect cannot request a model", async st => {
    const f = fixture(st), p = f.prepare(), calls = [];
    writeFileSync(join(p.root, "arms/plain/.git/commondir"), "/unused/local/path\n");
    await assert.rejects(startUserComparison(p.root, p.plan_digest, { runner: fake(calls) }), /unsupported_git_metadata/u);
    assert.equal(calls.length, 0); assert.equal(existsSync(join(p.root, "control/start.json")), false);
  });
  await t.test("post-model redirect never executes a shadow clean filter", async st => {
    const f = fixture(st), p = f.prepare(), calls = [], run = fake(calls), sentinel = join(f.root, "filter-called");
    const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
      const value = await run(input), shadow = join(f.root, "shadow-common");
      cpSync(join(input.cwd, ".git"), shadow, { recursive: true });
      writeFileSync(join(input.cwd, "src/filter.mjs"), `import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(sentinel)},'called\\n'); process.stdout.write(fs.readFileSync(0));\n`);
      git(input.cwd, ["--git-dir", shadow, "config", "filter.asktest.clean", "node src/filter.mjs"]);
      writeFileSync(join(shadow, "info/attributes"), "*.mjs filter=asktest\n");
      writeFileSync(join(input.cwd, ".git/commondir"), `${shadow}\n`);
      return value;
    } });
    assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "runner_failed");
    assert.notEqual(report.slots[0].outcome, "pass"); assert.match(report.slots[0].reason, /unsupported_git_metadata/u);
    assert.equal(report.slots[0].patch_ref, null); assert.equal(existsSync(sentinel), false);
    assert.equal(existsSync(join(p.root, "control/slots/plain/patch.diff")), false);
    assert.equal(readFileSync(join(f.repo, "src/value.mjs"), "utf8"), "export const value = 0;\n");
  });
});

test("linked Git object leaves stop before controller diff or verification", async t => {
  for (const kind of ["loose object", "pack file"]) await t.test(kind, async st => {
    const f = fixture(st), p = f.prepare(), arm = join(p.root, "arms/plain"), calls = [], run = fake(calls);
    let target;
    if (kind === "pack file") {
      git(arm, ["repack", "-ad"]);
      target = join(arm, ".git/objects/pack", readdirSync(join(arm, ".git/objects/pack")).find(name => name.endsWith(".pack")));
    } else {
      const hash = git(arm, ["rev-parse", `${p.plan.arms.plain.baseline_commit}:src/value.mjs`]);
      target = join(arm, ".git/objects", hash.slice(0, 2), hash.slice(2));
    }
    const outside = join(f.root, "external-object");
    cpSync(target, outside); const before = readFileSync(outside); let verified = 0;
    const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
      const value = await run(input); rmSync(target); symlinkSync(outside, target); return value;
    }, verifier: async () => { verified++; throw new Error("must not verify unsafe Git storage"); } });
    assert.equal(calls.length, 1); assert.equal(verified, 0);
    assert.equal(report.slots[0].state, "runner_failed"); assert.notEqual(report.slots[0].outcome, "pass");
    assert.match(report.slots[0].reason, /unsafe_git_storage_entry/u);
    assert.equal(report.slots[0].patch_ref, null); assert.equal(report.slots[0].verification, null);
    assert.equal(existsSync(join(p.root, "control/slots/plain/patch.diff")), false);
    assert.ok(report.slots.slice(1).every(slot => slot.state === "not_started"));
    assert.deepEqual(readFileSync(outside), before);
    assert.equal(readFileSync(join(f.repo, "src/value.mjs"), "utf8"), "export const value = 0;\n");
  });
});

test("ordinary staging and repacking retain safe Git evidence and independent quality", async t => {
  const f = fixture(t), p = f.prepare(), calls = [], run = fake(calls);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
    const value = await run(input); git(input.cwd, ["add", "src/value.mjs"]); git(input.cwd, ["repack", "-ad"]); return value;
  } });
  assert.equal(calls.length, 3); assert.ok(report.slots.every(slot => slot.outcome === "pass" && slot.patch_ref === "patch.diff"));
});

test("ordinary index flags cannot hide changed bytes from the saved controller patch", async t => {
  for (const flag of ["--assume-unchanged", "--skip-worktree"]) await t.test(flag, async st => {
    const f = fixture(st), p = f.prepare(), run = fake([]);
    const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
      git(input.cwd, ["update-index", flag, "src/value.mjs"]); return run(input);
    } });
    assert.ok(report.slots.every(slot => slot.outcome === "pass"));
    for (const slot of report.slots) {
      const path = join(p.root, "control/slots", slot.condition, "patch.diff"), patch = readFileSync(path, "utf8");
      assert.match(patch, /^-export const value = 0;$/mu); assert.match(patch, /^\+export const value = 1;$/mu);
      git(f.repo, ["apply", "--check", path]);
      assert.equal(readFileSync(join(p.root, p.plan.arms[slot.condition].baseline_path, "src/value.mjs"), "utf8"), "export const value = 0;\n");
    }
    assert.equal(readFileSync(join(f.repo, "src/value.mjs"), "utf8"), "export const value = 0;\n");
  });
});

test("controller patches preserve additions, deletions, modes and file-directory transitions", async t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, "src/deleted.txt"), "delete this file\n");
  writeFileSync(join(f.repo, "src/becomes-directory"), "formerly a file\n");
  mkdirSync(join(f.repo, "src/becomes-file")); writeFileSync(join(f.repo, "src/becomes-file/old.txt"), "formerly a directory\n");
  writeFileSync(join(f.repo, "src/mode.mjs"), "export const mode = 1;\n");
  git(f.repo, ["add", "."]); git(f.repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "patch shapes"]);
  f.options.commit = git(f.repo, ["rev-parse", "HEAD"]);
  const p = f.prepare(), run = fake([]);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
    const value = await run(input);
    rmSync(join(input.cwd, "src/deleted.txt")); rmSync(join(input.cwd, "src/becomes-directory"));
    mkdirSync(join(input.cwd, "src/becomes-directory")); writeFileSync(join(input.cwd, "src/becomes-directory/new.txt"), "now a directory\n");
    rmSync(join(input.cwd, "src/becomes-file"), { recursive: true }); writeFileSync(join(input.cwd, "src/becomes-file"), "now a file\n");
    writeFileSync(join(input.cwd, "src/new.bin"), Buffer.from([0, 255, 1, 2]));
    chmodSync(join(input.cwd, "src/mode.mjs"), 0o700); return value;
  } });
  assert.ok(report.slots.every(slot => slot.outcome === "pass"));
  for (const slot of report.slots) {
    const path = join(p.root, "control/slots", slot.condition, "patch.diff"), patch = readFileSync(path, "utf8");
    assert.match(patch, /deleted file mode/u); assert.match(patch, /new file mode/u); assert.match(patch, /GIT binary patch/u);
    assert.match(patch, /old mode 100644\nnew mode 100755/u); git(f.repo, ["apply", "--check", path]);
  }
});

test("private baseline drift stops before start or records a failed evidence collection", async t => {
  await t.test("before start", async st => {
    const f = fixture(st), p = f.prepare(), calls = [];
    writeFileSync(join(p.root, p.plan.arms.plain.baseline_path, "src/value.mjs"), "changed baseline\n");
    await assert.rejects(startUserComparison(p.root, p.plan_digest, { runner: fake(calls) }), /private plain baseline changed/u);
    assert.equal(calls.length, 0); assert.equal(existsSync(join(p.root, "control/start.json")), false);
  });
  await t.test("after request", async st => {
    const f = fixture(st), p = f.prepare(), calls = [], run = fake(calls);
    const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => {
      const value = await run(input);
      writeFileSync(join(p.root, p.plan.arms.plain.baseline_path, "src/value.mjs"), "changed baseline\n"); return value;
    } });
    assert.equal(calls.length, 1); assert.equal(report.slots[0].state, "runner_failed"); assert.equal(report.slots[0].outcome, "unknown");
    assert.match(report.slots[0].reason, /private diff baseline changed/u); assert.equal(report.slots[0].patch_ref, null);
    assert.ok(report.slots.slice(1).every(slot => slot.state === "not_started"));
  });
});

test("non-event JSON telemetry retains terminal results and unknown usage", async t => {
  const f = fixture(t), p = f.prepare(), run = fake([]);
  const report = await startUserComparison(p.root, p.plan_digest, { runner: async input => ({ ...await run(input), stdout: "null\n[]\ntrue\n" }) });
  assert.ok(report.slots.every(slot => slot.state === "completed" && slot.process_completed && slot.outcome === "pass"));
  assert.ok(report.slots.every(slot => slot.metrics.input_tokens === null && slot.actual_model === null && slot.session_id === null));
  assert.equal(reportUserComparison(p.root).slots[0].state, "completed");
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
