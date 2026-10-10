import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { comparisonHash, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import * as comparison from "./ask-user-comparison.mjs";
import { inspectComparisonExecution, observeComparisonProcess, probeComparisonOwner, readComparisonHistory } from "./ask-user-comparison-state.mjs";
import { executeCodexSession } from "./codex-exec-runner.mjs";

const IDS = ["plain", "kernel_only", "full_ask"];
function git(repo, argv) {
  const value = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...argv], { cwd: repo, encoding: "utf8",
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(value.status, 0, value.stderr); return value.stdout.trim();
}
function fixture(t, extras = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-unattended-test-"))), repo = join(root, "source");
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  mkdirSync(repo); mkdirSync(join(repo, "src")); mkdirSync(join(repo, "test"));
  writeFileSync(join(repo, "src/value.mjs"), "export const value = 0;\n");
  writeFileSync(join(repo, "test/value.test.mjs"), "import test from 'node:test'; import assert from 'node:assert/strict'; import {value} from '../src/value.mjs'; test('value is one',()=>assert.equal(value,1));\n");
  writeFileSync(join(repo, "AGENTS.md"), "Keep this user instruction and the public API.\n");
  git(repo, ["init", "-q"]); git(repo, ["add", "."]);
  git(repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  const taskFile = join(root, "task.md"), verificationFile = join(root, "verification.json");
  writeFileSync(taskFile, "Set value to one.\n");
  writeFileSync(verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
    requirements: [{ id: "value-one", description: "value is one", command: ["node", "--test", "test/value.test.mjs"] }] }));
  const options = { repo, commit: git(repo, ["rev-parse", "HEAD"]), taskFile, verificationFile,
    output: join(root, "comparison"), mutablePaths: ["src/"], taskClass: "trivial", evidenceKind: "synthetic",
    model: "fake-model", cliVersion: "declared-fake-version", ...extras };
  return { root, repo, options, prepare: () => prepareUserComparison(options) };
}
function fake(calls, { scenario = "pass", usage = { input_tokens: 12, output_tokens: 8, cached_input_tokens: 0 }, failOnly = null } = {}) {
  return async invocation => {
    const id = invocation.cwd.split("/").at(-1); calls.push({ ...invocation, condition: id });
    const mode = failOnly !== null && id !== failOnly ? "pass" : scenario;
    if (mode === "permission") return { spawnObserved: false, exitCode: null, error: { code: "EACCES", message: "permission denied" }, stdout: "", stderr: "", durationMs: 0 };
    if (mode === "missing-cli") return { spawnObserved: false, exitCode: null, error: { code: "ENOENT", message: "fake CLI unavailable" }, stdout: "", stderr: "", durationMs: 0 };
    if (mode !== "no-spawn") invocation.onSpawn?.(process.pid);
    if (mode !== "missing-final") writeFileSync(invocation.argv[invocation.argv.indexOf("--output-last-message") + 1], "Saved fake response; not a quality score.\n");
    writeFileSync(join(invocation.cwd, "src/value.mjs"), `export const value = ${mode === "test-fail" ? 2 : 1};\n`);
    if (mode === "scope") writeFileSync(join(invocation.cwd, "AGENTS.md"), "modified condition instruction\n");
    return { spawnObserved: mode !== "no-spawn", exitCode: mode === "runner-fail" ? 7 : ["timeout", "interrupt"].includes(mode) ? null : 0,
      signal: mode === "timeout" ? "SIGTERM" : mode === "interrupt" ? "SIGINT" : null,
      timedOut: mode === "timeout", interrupted: mode === "interrupt", error: null, durationMs: 1,
      stdout: `${JSON.stringify({ type: "thread.started", thread_id: id })}\n${JSON.stringify({ type: "turn.completed", model: "fake-model", ...(usage === null ? {} : { usage }) })}\n`,
      stderr: mode === "auth" ? "Authentication required. Please log in before continuing.\n" : "" };
  };
}
function history(p) { return readComparisonHistory(p.root, p.plan, p.plan_digest); }
function resume(p, options) {
  assert.equal(typeof comparison.resumeUserComparison, "function", "pending-only resume API must exist");
  return comparison.resumeUserComparison(p.root, p.plan_digest, options);
}
async function captureCommand(argv, options) {
  assert.equal(typeof comparison.runUserComparisonCommand, "function", "shared noninteractive CLI entry must exist");
  const stdout = [], stderr = [], log = console.log, error = console.error;
  console.log = (...args) => stdout.push(args.join(" ")); console.error = (...args) => stderr.push(args.join(" "));
  try { return { code: await comparison.runUserComparisonCommand(argv, options), stdout: stdout.join("\n"), stderr: stderr.join("\n") }; }
  finally { console.log = log; console.error = error; }
}
function invocationReceipts(root) {
  const parent = join(root, "control/invocations");
  assert.ok(existsSync(parent), "every processable invocation leaves durable receipts");
  const folders = readdirSync(parent).filter(name => !name.startsWith("pending-"));
  assert.ok(folders.length > 0);
  return folders.map(name => ({ name, path: join(parent, name), files: readdirSync(join(parent, name)) }));
}

test("one noninteractive fake command reaches all three verifications, aggregation, reports and exit", async t => {
  const f = fixture(t), p = f.prepare(), calls = [];
  const result = await captureCommand(["start", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.equal(result.code, 0); const report = JSON.parse(result.stdout);
  assert.deepEqual(calls.map(value => value.condition), IDS);
  assert.ok(calls.every(value => value.executable === "codex" && value.input === p.plan.prompt));
  assert.ok(report.slots.every(slot => slot.state === "completed" && slot.outcome === "pass"));
  assert.ok(report.slots.every(slot => slot.verification.independent_process));
  assert.equal(report.summary.blocks[0].trials.length, 3); assert.equal(report.overall.exit_code, 0);
  const receipts = invocationReceipts(p.root);
  assert.ok(receipts.at(-1).files.includes("result.json") && receipts.at(-1).files.includes("report.txt") && receipts.at(-1).files.includes("exit-code.txt"));
  assert.equal(git(f.repo, ["status", "--porcelain"]), "");
  assert.equal(readFileSync(join(f.repo, "src/value.mjs"), "utf8"), "export const value = 0;\n");
});

test("duplicate noninteractive start returns blocked code and a fresh invocation report without replacing prior results", async t => {
  const p = fixture(t).prepare(), calls = [];
  const first = await captureCommand(["start", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.equal(first.code, 0);
  const terminal = readFileSync(join(p.root, "control/slots/plain/result.json"));
  const before = invocationReceipts(p.root).map(item => item.name);
  const second = await captureCommand(["start", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.equal(second.code, 9); assert.equal(calls.length, 3);
  assert.deepEqual(readFileSync(join(p.root, "control/slots/plain/result.json")), terminal);
  assert.equal(JSON.parse(second.stdout).overall.state, "execution_blocked");
  const after = invocationReceipts(p.root).map(item => item.name);
  assert.equal(after.length, before.length + 1); assert.ok(before.every(name => after.includes(name)));
});

test("independent task-test failure continues other arms while retaining failed quality", async t => {
  const p = fixture(t).prepare(), calls = [];
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls, { scenario: "test-fail", failOnly: "plain" }) });
  assert.deepEqual(calls.map(value => value.condition), IDS);
  assert.deepEqual(report.slots.map(slot => slot.state), ["verification_failed", "completed", "completed"]);
  assert.deepEqual(report.slots.map(slot => slot.outcome), ["fail", "pass", "pass"]);
  assert.equal(report.overall.exit_code, 2); assert.equal(report.summary.blocks[0].trials.length, 3);
});

test("non-launched missing K routes continue F without supplementing K or consuming an attempt", async t => {
  const p = fixture(t, { taskClass: "implementation" }).prepare(), calls = [];
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls) });
  assert.deepEqual(calls.map(value => value.condition), ["plain", "full_ask"]);
  assert.equal(report.slots[1].state, "capability_missing"); assert.equal(report.slots[1].launch_requested, false);
  assert.equal(history(p).snapshot.slots.kernel_only.attempts, 0);
  assert.equal(report.overall.exit_code, 3);
});

for (const [scenario, expected, code] of [["permission", "permission_denied", 4], ["runner-fail", "runner_failed", 5], ["timeout", "timeout", 6], ["interrupt", "interrupted", 8], ["scope", "scope_violation", 5], ["missing-cli", "capability_missing", 3], ["missing-final", "result_missing", 5]]) {
  test(`${scenario} stops later arms and preserves three-slot partial output`, async t => {
    const p = fixture(t).prepare(), calls = [];
    const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls, { scenario }) });
    assert.deepEqual(calls.map(value => value.condition), ["plain"]);
    assert.deepEqual(report.slots.map(slot => slot.state), [expected, "not_started", "not_started"]);
    assert.equal(report.overall.exit_code, code); assert.ok(report.overall.reason);
    assert.equal(report.summary.blocks[0].trials.length, 3); assert.ok(invocationReceipts(p.root).length > 0);
  });
}

test("graceful interruption resumes only pending slots and never rewrites terminal receipt", async t => {
  const p = fixture(t).prepare(), calls = [], controller = new AbortController(), run = fake(calls);
  const first = await comparison.startUserComparison(p.root, p.plan_digest, { signal: controller.signal,
    runner: async invocation => { const value = await run(invocation); controller.abort(); return value; } });
  assert.equal(first.slots[0].state, "interrupted"); assert.equal(calls.length, 1);
  const prior = readFileSync(join(p.root, "control/slots/plain/result.json"));
  const started = history(p).snapshot.started_at_ms, deadline = history(p).snapshot.deadline_at_ms;
  const final = await resume(p, { runner: fake(calls) });
  assert.deepEqual(calls.map(value => value.condition), IDS);
  assert.deepEqual(final.slots.map(slot => slot.state), ["interrupted", "completed", "completed"]);
  assert.deepEqual(readFileSync(join(p.root, "control/slots/plain/result.json")), prior);
  assert.equal(history(p).snapshot.started_at_ms, started); assert.equal(history(p).snapshot.deadline_at_ms, deadline);
  assert.ok(Object.values(history(p).snapshot.slots).every(slot => slot.attempts === 1));
  const count = calls.length; await resume(p, { runner: fake(calls) }); assert.equal(calls.length, count);
  assert.equal(invocationReceipts(p.root).length, 3);
});

test("resume detects session identity reuse from prior terminal history and stops without repeating P", async t => {
  const p = fixture(t).prepare(), calls = [], controller = new AbortController(), run = fake(calls);
  const first = await comparison.startUserComparison(p.root, p.plan_digest, { signal: controller.signal,
    runner: async invocation => { const value = await run(invocation); controller.abort(); return value; } });
  assert.equal(first.slots[0].state, "interrupted"); assert.equal(first.slots[0].session_id, "plain");
  const terminal = readFileSync(join(p.root, "control/slots/plain/result.json"));
  const resumed = await resume(p, { runner: async invocation => {
    const value = await run(invocation);
    value.stdout = value.stdout.replace('"thread_id":"kernel_only"', '"thread_id":"plain"'); return value;
  } });
  assert.deepEqual(calls.map(value => value.condition), ["plain", "kernel_only"]);
  assert.equal(resumed.slots[1].state, "runner_failed"); assert.match(resumed.slots[1].reason, /session.*reused/iu);
  assert.equal(resumed.slots[2].state, "not_started"); assert.equal(resumed.overall.exit_code, 5);
  assert.deepEqual(readFileSync(join(p.root, "control/slots/plain/result.json")), terminal);
});

test("verification launch permission denial stops with a distinct permission state and code", async t => {
  const p = fixture(t).prepare(), calls = []; let verificationCalls = 0;
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls), verifier: async () => {
    verificationCalls++;
    return { spawnObserved: false, exitCode: null, error: { code: "EACCES", message: "verification launch denied" },
      stdout: "", stderr: "", durationMs: 0 };
  } });
  assert.equal(calls.length, 1); assert.equal(verificationCalls, 1);
  assert.equal(report.slots[0].state, "permission_denied"); assert.equal(report.overall.exit_code, 4);
  assert.equal(report.slots[0].verification.checks[0].runner_error.code, "EACCES");
  assert.equal(report.slots[0].outcome, "unknown"); assert.equal(report.slots[1].state, "not_started");
});

test("model launch without observed spawn cannot become completed from exit code and plausible output", async t => {
  const p = fixture(t).prepare(), calls = []; let verificationCalls = 0;
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls, { scenario: "no-spawn" }),
    verifier: async () => { verificationCalls++; throw new Error("unobserved process must not be graded"); } });
  assert.equal(calls.length, 1); assert.equal(verificationCalls, 0);
  assert.equal(report.slots[0].state, "runner_failed"); assert.equal(report.slots[0].spawn_observed, false);
  assert.equal(report.slots[0].outcome, "unknown"); assert.equal(report.overall.exit_code, 5);
  assert.equal(report.slots[1].state, "not_started");
});

test("an active owner blocks concurrent start and resume without starting another fake process", async t => {
  const p = fixture(t).prepare(), calls = []; let unblock, observed;
  const gate = new Promise(resolve => { unblock = resolve; }); const entered = new Promise(resolve => { observed = resolve; });
  const run = fake(calls);
  const active = comparison.startUserComparison(p.root, p.plan_digest, { runner: async invocation => { observed(); await gate; return run(invocation); } });
  await entered;
  try {
    assert.equal(inspectComparisonExecution(p.root, p.plan, p.plan_digest).state, "running");
    await assert.rejects(comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls) }), /consumed|active|owner|controller/iu);
    await assert.rejects(resume(p, { runner: fake(calls) }), /active|owner|controller/iu);
    assert.equal(calls.length, 0);
  } finally { unblock(); await active; }
  assert.equal(calls.length, 3);
});

test("a completed failed slot is never retried by resume, and later unrequested slots may continue", async t => {
  const p = fixture(t).prepare(), calls = [];
  await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls, { scenario: "runner-fail" }) });
  const report = await resume(p, { runner: fake(calls) });
  assert.deepEqual(calls.map(value => value.condition), IDS);
  assert.equal(report.slots[0].state, "runner_failed"); assert.equal(history(p).snapshot.slots.plain.attempts, 1);
  assert.equal(report.overall.exit_code === 0, false);
});

for (const corrupt of ["event-digest", "history-gap", "pending-write", "owner-torn", "terminal-missing"]) {
  test(`${corrupt} is detected by readonly inspection and resume performs no request`, async t => {
    const p = fixture(t).prepare(), calls = [], controller = new AbortController(), run = fake(calls);
    await comparison.startUserComparison(p.root, p.plan_digest, { signal: controller.signal,
      runner: async invocation => { const value = await run(invocation); controller.abort(); return value; } });
    if (corrupt === "event-digest") writeFileSync(join(p.root, "control/history/00000001/record.digest"), "sha256:wrong");
    if (corrupt === "history-gap") rmSync(join(p.root, "control/history/00000001"), { recursive: true });
    if (corrupt === "pending-write") mkdirSync(join(p.root, "control/history/pending-crash"));
    if (corrupt === "owner-torn") rmSync(join(p.root, "control/leases/00000001/release/record.digest"));
    if (corrupt === "terminal-missing") rmSync(join(p.root, "control/slots/plain/result.json"));
    const before = calls.length, report = comparison.reportUserComparison(p.root);
    assert.notEqual(report.overall.exit_code, 0); assert.ok(report.overall.reason);
    assert.equal(report.slots.length, 3);
    await assert.rejects(resume(p, { runner: fake(calls) }), error => error.comparisonCode === 10);
    assert.equal(calls.length, before);
  });
}

for (const change of ["plan", "prompt", "recipe", "pending-arm"]) {
  test(`changed approved ${change} rejects same-run resume before launch`, async t => {
    const p = fixture(t).prepare(), calls = [], controller = new AbortController(), run = fake(calls);
    await comparison.startUserComparison(p.root, p.plan_digest, { signal: controller.signal,
      runner: async invocation => { const value = await run(invocation); controller.abort(); return value; } });
    if (change === "plan") {
      const path = join(p.root, "control/plan.json"), plan = JSON.parse(readFileSync(path, "utf8"));
      plan.config.model = "different-model"; writeFileSync(path, JSON.stringify(plan));
    }
    if (change === "prompt") writeFileSync(join(p.root, p.plan.input.path), "different task");
    if (change === "recipe") writeFileSync(join(p.root, p.plan.verification.path), "{}");
    if (change === "pending-arm") writeFileSync(join(p.root, "arms/kernel_only/src/value.mjs"), "changed pending tree");
    await assert.rejects(resume(p, { runner: fake(calls) }), /changed|differs|digest|confirm|plan|prepared/iu);
    assert.equal(calls.length, 1);
  });
}

test("overall admission rejects insufficient reservation and resume never resets elapsed deadline", async t => {
  const p = fixture(t, { timeoutMs: 1000, verificationTimeoutMs: 1000, overallTimeoutMs: 100 }).prepare(), calls = [];
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls) });
  assert.equal(calls.length, 0); assert.ok(report.slots.every(slot => slot.state === "not_started"));
  assert.match(report.overall.reason, /time|deadline|remaining|reserv/iu);
  const originalDeadline = history(p).snapshot.deadline_at_ms;
  await resume(p, { runner: fake(calls) });
  assert.equal(calls.length, 0); assert.equal(history(p).snapshot.deadline_at_ms, originalDeadline);
});

test("overall deadline and token limits are validated before preparing a run", t => {
  for (const extras of [{ overallTimeoutMs: 0 }, { overallTimeoutMs: 86400001 }, { overallTimeoutMs: 1.5 },
    { tokenBudget: 0 }, { tokenBudget: -1 }, { tokenBudget: Number.MAX_SAFE_INTEGER + 1 }]) {
    const f = fixture(t, extras);
    assert.throws(() => f.prepare(), /invalid|timeout|budget/iu);
    assert.equal(existsSync(f.options.output), false);
  }
});

for (const stage of ["model", "verification"]) for (const cause of ["deadline", "interrupt"]) {
  test(`${stage} dispatch rechecks ${cause} after synchronous request persistence`, async t => {
    const p = fixture(t, { timeoutMs: 100, verificationTimeoutMs: 100, overallTimeoutMs: 10000 }).prepare();
    const calls = [], controller = new AbortController(), now = Date.now;
    const request = join(p.root, "control/slots/plain", stage === "model" ? "request.json" : "verification-0.request.json");
    let verificationCalls = 0;
    Date.now = () => {
      const persisted = existsSync(request);
      if (persisted && cause === "interrupt") controller.abort();
      return now() + (persisted && cause === "deadline" ? 11000 : 0);
    };
    try {
      const report = await comparison.startUserComparison(p.root, p.plan_digest, {
        signal: controller.signal, runner: fake(calls),
        verifier: async () => { verificationCalls++; throw new Error("must not dispatch after deadline or interruption"); },
      });
      assert.equal(calls.length, stage === "model" ? 0 : 1);
      assert.equal(verificationCalls, 0); assert.equal(existsSync(request), true);
      assert.equal(report.slots[0].spawn_observed, stage !== "model");
      assert.equal(report.slots[0].state, cause === "deadline" ? "timeout" : "interrupted");
      assert.equal(report.overall.exit_code, cause === "deadline" ? 6 : 8);
      assert.ok(report.slots.slice(1).every(slot => slot.state === "not_started"));
      assert.equal(history(p).snapshot.slots.plain.attempts, 1);
      assert.ok(invocationReceipts(p.root).length > 0);
    } finally { Date.now = now; }
  });
}

test("elapsed wall time after a saved interruption prevents pending admission without changing deadline", async t => {
  const p = fixture(t, { timeoutMs: 1000, verificationTimeoutMs: 1000, overallTimeoutMs: 10000 }).prepare(), calls = [];
  const controller = new AbortController(), run = fake(calls);
  await comparison.startUserComparison(p.root, p.plan_digest, { signal: controller.signal,
    runner: async invocation => { const value = await run(invocation); controller.abort(); return value; } });
  const deadline = history(p).snapshot.deadline_at_ms, now = Date.now;
  Date.now = () => deadline + 1;
  try {
    const final = await resume(p, { runner: fake(calls) });
    assert.equal(calls.length, 1); assert.match(final.overall.reason, /time|deadline|remaining/iu);
    assert.equal(history(p).snapshot.deadline_at_ms, deadline);
  } finally { Date.now = now; }
});

test("known token consumption stops next admission while absent usage stays unknown and continues", async t => {
  const known = fixture(t, { tokenBudget: 20 }).prepare(), calls = [];
  const stopped = await comparison.startUserComparison(known.root, known.plan_digest, { runner: fake(calls) });
  assert.deepEqual(calls.map(value => value.condition), ["plain"]);
  assert.equal(stopped.slots[0].metrics.input_tokens + stopped.slots[0].metrics.output_tokens, 20);
  assert.match(stopped.overall.reason, /token|usage|budget/iu); assert.equal(stopped.overall.exit_code, 11);
  const partial = fixture(t, { tokenBudget: 20 }).prepare(), partialCalls = [];
  const partialReport = await comparison.startUserComparison(partial.root, partial.plan_digest, {
    runner: fake(partialCalls, { usage: { input_tokens: 20 } }),
  });
  assert.equal(partialCalls.length, 1); assert.equal(partialReport.overall.exit_code, 11);
  assert.equal(partialReport.slots[0].metrics.output_tokens, null);
  const unknown = fixture(t, { tokenBudget: 1 }).prepare(), otherCalls = [];
  const completed = await comparison.startUserComparison(unknown.root, unknown.plan_digest, { runner: fake(otherCalls, { usage: null }) });
  assert.equal(otherCalls.length, 3);
  assert.ok(completed.slots.every(slot => slot.metrics.input_tokens === null && slot.metrics.output_tokens === null));
  assert.ok(completed.summary.summaries.every(row => row.metrics.input_tokens.unknown_count === 1));
  assert.match(JSON.stringify(completed), /unknown/iu);
});

test("auth input prompt is bounded by owned Node fake timeout and yields operator action", async t => {
  const p = fixture(t, { timeoutMs: 500, verificationTimeoutMs: 1000 }).prepare(), calls = [];
  const started = Date.now();
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: invocation => {
    calls.push(invocation);
    return executeCodexSession({ ...invocation, executable: process.execPath,
      argv: ["-e", "process.stderr.write('Authentication required. Please log in before continuing.\\n'); setInterval(()=>{},1000)"] });
  } });
  assert.equal(calls.length, 1); assert.ok(Date.now() - started < 10000);
  assert.equal(report.slots[0].state, "authentication_required"); assert.ok(report.overall.required_action);
  assert.equal(report.overall.exit_code, 4); assert.equal(report.slots[1].state, "not_started");
});

test("approval input event from an owned Node fake stops without answering or using another launcher", async t => {
  const p = fixture(t, { timeoutMs: 500, verificationTimeoutMs: 1000 }).prepare(), calls = [];
  const started = Date.now();
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: invocation => {
    calls.push(invocation);
    return executeCodexSession({ ...invocation, executable: process.execPath,
      argv: ["-e", "process.stdout.write(JSON.stringify({type:'approval.required',error:{message:'Approval required to proceed'}})+'\\n'); setInterval(()=>{},1000)"] });
  } });
  assert.equal(calls.length, 1); assert.ok(Date.now() - started < 10000);
  assert.equal(report.slots[0].state, "permission_denied"); assert.equal(report.overall.exit_code, 4);
  assert.ok(report.overall.required_action); assert.equal(report.slots[1].launch_requested, false);
});

test("unassessed quality remains indeterminate despite all process and test successes", async t => {
  const f = fixture(t);
  writeFileSync(f.options.verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
    requirements: [{ id: "human", description: "human semantic assessment" }] }));
  const p = f.prepare(), calls = [];
  const report = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls) });
  assert.equal(calls.length, 3); assert.ok(report.slots.every(slot => slot.state === "completed" && slot.outcome === "unknown"));
  assert.equal(report.overall.exit_code, 7); assert.equal(report.overall.state, "indeterminate");
});

test("synthetic unattended plans reject the default native launcher before recording a start", async t => {
  const p = fixture(t).prepare();
  await assert.rejects(comparison.startUserComparison(p.root, p.plan_digest, { signal: AbortSignal.abort() }), /synthetic|fake|launcher/iu);
  assert.equal(existsSync(join(p.root, "control/start.json")), false);
  assert.equal(existsSync(join(p.root, "control/slots/plain/request.json")), false);
});

async function ownedNode(t) {
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore", detached: true });
  await once(child, "spawn");
  const end = async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; } };
  t.after(end); return { child, end };
}
test("terminal runner exception with unconfirmed process exit blocks resume until its owned child is absent", async t => {
  const p = fixture(t).prepare(), calls = [], { child, end } = await ownedNode(t);
  const first = await comparison.startUserComparison(p.root, p.plan_digest, { runner: async invocation => {
    calls.push({ ...invocation, condition: invocation.cwd.split("/").at(-1) });
    invocation.onSpawn?.(child.pid); throw new Error("fake runner lost its process completion receipt");
  } });
  assert.equal(first.slots[0].state, "runner_failed"); assert.equal(first.slots[0].process_completed, false);
  assert.equal(first.slots[0].exit_code, null);
  const terminal = readFileSync(join(p.root, "control/slots/plain/result.json"));
  const blocked = await captureCommand(["resume", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.equal(blocked.code, 9); assert.equal(calls.length, 1); process.kill(child.pid, 0);
  await end();
  const final = await resume(p, { runner: fake(calls) });
  assert.deepEqual(calls.map(value => value.condition), IDS);
  assert.equal(final.slots[0].state, "runner_failed"); assert.notEqual(final.overall.exit_code, 0);
  assert.deepEqual(readFileSync(join(p.root, "control/slots/plain/result.json")), terminal);
});
test("terminal verifier cleanup failure blocks resume while its owned child remains alive", async t => {
  const p = fixture(t).prepare(), calls = [], { child, end } = await ownedNode(t); let verificationCalls = 0;
  const first = await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls), verifier: async invocation => {
    verificationCalls++; invocation.onSpawn?.(child.pid);
    return { spawnObserved: true, exitCode: null, stdout: "", stderr: "", durationMs: 1,
      cleanupError: { code: "FAKE_UNREAPED", message: "owned fake verifier child not reaped" } };
  } });
  assert.equal(calls.length, 1); assert.equal(verificationCalls, 1);
  assert.equal(first.slots[0].state, "runner_failed"); assert.equal(first.slots[0].process_completed, true);
  assert.ok(first.slots[0].verification.checks[0].cleanup_error);
  const terminal = readFileSync(join(p.root, "control/slots/plain/result.json"));
  const blocked = await captureCommand(["resume", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.equal(blocked.code, 9); assert.equal(calls.length, 1); process.kill(child.pid, 0);
  await end();
  const final = await resume(p, { runner: fake(calls) });
  assert.deepEqual(calls.map(value => value.condition), IDS); assert.equal(final.slots[0].state, "runner_failed");
  assert.deepEqual(readFileSync(join(p.root, "control/slots/plain/result.json")), terminal);
});
function retainRunningCheckpoint(p) {
  const parent = join(p.root, "control/history"), names = readdirSync(parent).filter(name => /^\d{8}$/u.test(name)).sort();
  const selected = names.filter(name => {
    const event = JSON.parse(readFileSync(join(parent, name, "record.json"), "utf8"));
    return event.slots.plain.phase === "model_running" && event.slots.kernel_only.phase === "pending";
  }).at(-1);
  assert.ok(selected, "a durable model-running checkpoint precedes terminal publication");
  for (const name of names.filter(name => name > selected)) rmSync(join(parent, name), { recursive: true });
  for (const name of ["result.json", "result.digest"]) rmSync(join(p.root, "control/slots/plain", name), { force: true });
  assert.equal(history(p).snapshot.slots.plain.phase, "model_running");
}
for (const ownerState of ["ended", "alive", "unknown"]) {
  test(`receipt-missing attempted slot with ${ownerState} child identity never runs twice`, async t => {
    const p = fixture(t).prepare(), calls = [], { child, end } = await ownedNode(t), run = fake(calls, { scenario: "interrupt" });
    await comparison.startUserComparison(p.root, p.plan_digest, { runner: async invocation => {
      // This owned Node child stands in for a model process; all work remains fake.
      return run({ ...invocation, onSpawn: () => invocation.onSpawn?.(child.pid) });
    } });
    retainRunningCheckpoint(p);
    if (ownerState === "ended") await end();
    if (ownerState === "unknown") {
      const path = join(p.root, "control/slots/plain/spawn.json"), value = JSON.parse(readFileSync(path, "utf8"));
      value.owner = { ...value.owner, birth: null };
      const raw = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
      writeFileSync(path, raw); writeFileSync(join(p.root, "control/slots/plain/spawn.digest"), comparisonHash(raw));
    }
    if (ownerState === "ended") {
      const report = await resume(p, { runner: fake(calls) });
      assert.deepEqual(calls.map(value => value.condition), IDS);
      assert.equal(report.slots[0].state, "execution_unknown"); assert.equal(report.slots[0].outcome, "unknown");
      assert.equal(report.slots[0].exit_code, null); assert.equal(history(p).snapshot.slots.plain.attempts, 1);
      assert.deepEqual(report.slots.slice(1).map(slot => slot.state), ["completed", "completed"]);
      assert.notEqual(report.overall.exit_code, 0);
    } else {
      await assert.rejects(resume(p, { runner: fake(calls) }), /active|alive|owner|unknown|process|group|verif/iu);
      assert.equal(calls.length, 1); process.kill(child.pid, 0); assert.equal(child.exitCode, null);
      const report = comparison.reportUserComparison(p.root);
      assert.notEqual(report.overall.exit_code, 0); assert.ok(report.overall.required_action);
    }
  });
}

test("deadline exhausted during a model result prevents verification and preserves timeout evidence", async t => {
  const p = fixture(t, { timeoutMs: 1000, verificationTimeoutMs: 1000, overallTimeoutMs: 10000 }).prepare(), calls = [];
  const now = Date.now, run = fake(calls); let verificationCalls = 0;
  try {
    const report = await comparison.startUserComparison(p.root, p.plan_digest, {
      runner: async invocation => { const value = await run(invocation); const deadline = history(p).snapshot.deadline_at_ms; Date.now = () => deadline + 1; return value; },
      verifier: async () => { verificationCalls++; throw new Error("verification must not be admitted after deadline"); },
    });
    assert.equal(calls.length, 1); assert.equal(verificationCalls, 0);
    assert.equal(report.overall.exit_code, 6); assert.match(report.overall.reason, /time|deadline/iu);
    assert.equal(report.slots.length, 3); assert.equal(report.slots[1].state, "not_started");
  } finally { Date.now = now; }
});

test("process identity probes never terminate a live unrelated owned test child", async t => {
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore", detached: true });
  await once(child, "spawn");
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } });
  const owner = observeComparisonProcess(child.pid);
  assert.equal(owner.status, "alive"); assert.equal(probeComparisonOwner(owner, true).status, "alive");
  assert.equal(probeComparisonOwner({ ...owner, birth: null }, true).status, "unknown");
  process.kill(child.pid, 0); assert.equal(child.exitCode, null);
});

test("legacy start without ownership/history is blocked rather than promoted into resumable execution", async t => {
  const p = fixture(t).prepare(), calls = [];
  writeFileSync(join(p.root, "control/start.json"), JSON.stringify({ run_id: p.plan.run_id, plan_digest: p.plan_digest,
    evidence_kind: "synthetic", requested_at: new Date().toISOString(), controller_pid: process.pid, policy: p.plan.policy }));
  await assert.rejects(resume(p, { runner: fake(calls) }), /legacy|checkpoint|recovery|incomplete/iu);
  assert.equal(calls.length, 0);
});

test("partial request persistence failure is not a successful start and cannot silently repeat consumed intent", async t => {
  const p = fixture(t).prepare(), calls = [];
  mkdirSync(join(p.root, "control/slots/plain/request.json"), { recursive: true });
  const result = await captureCommand(["start", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.equal(calls.length, 0); assert.equal(result.code, 10);
  const report = JSON.parse(result.stdout);
  assert.equal(report.slots.length, 3); assert.notEqual(report.overall.state, "completed");
  const resumed = await captureCommand(["resume", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.notEqual(resumed.code, 0); assert.equal(calls.length, 0);
  assert.ok(JSON.parse(resumed.stdout).overall.required_action);
});

for (const corruption of ["missing", "malformed"]) {
  test(`${corruption} start header is reported as corrupt and blocks resume without losing slot evidence`, async t => {
    const p = fixture(t).prepare(), calls = [];
    await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls) });
    const path = join(p.root, "control/start.json");
    if (corruption === "missing") rmSync(path); else writeFileSync(path, "not-json");
    const report = await captureCommand(["report", p.root, "--json"], {});
    assert.equal(report.code, 10); const saved = JSON.parse(report.stdout);
    assert.equal(saved.overall.state, "state_corrupt"); assert.equal(saved.slots.length, 3);
    assert.equal(saved.evidence_kind, "synthetic");
    assert.ok(saved.slots.every(slot => slot.state === "completed"));
    const resumed = await captureCommand(["resume", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
    assert.equal(resumed.code, 10); assert.equal(calls.length, 3);
    assert.ok(JSON.parse(resumed.stdout).overall.required_action);
  });
}

test("incomplete invocation report publication is detectable and blocks normal resume", async t => {
  const p = fixture(t).prepare(), calls = [];
  await comparison.startUserComparison(p.root, p.plan_digest, { runner: fake(calls) });
  const pending = join(p.root, "control/invocations/pending-crashed-report");
  mkdirSync(pending); writeFileSync(join(pending, "result.json"), "{\"unfinished\":");
  const reported = await captureCommand(["report", p.root, "--json"], {});
  assert.equal(reported.code, 10); assert.equal(JSON.parse(reported.stdout).overall.state, "state_corrupt");
  const resumed = await captureCommand(["resume", p.root, "--confirm", p.plan_digest, "--json"], { runner: fake(calls) });
  assert.equal(resumed.code, 10); assert.equal(calls.length, 3);
  assert.equal(existsSync(pending), true);
});
