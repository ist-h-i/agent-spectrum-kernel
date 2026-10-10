#!/usr/bin/env node
// Exploratory user lane. Fixed experiment drivers and their authority stay separate.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCodexSession } from "./codex-exec-runner.mjs";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { buildPragmaticEvaluationReport } from "./ask-pragmatic-evaluation-report.mjs";
import { comparisonHash, inventoryComparisonGitMetadata, inventoryUserTree, isComparisonInstructionPath, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";

export const USER_CONDITIONS = Object.freeze(["plain", "kernel_only", "full_ask"]);
const LIMIT = 16 * 1024 * 1024;
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
const readJson = path => parseJsonRejectDuplicateKeys(readStableFile(path, "comparison record", LIMIT).bytes.toString("utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const relativeSafe = path => typeof path === "string" && !isAbsolute(path) && !path.includes("\\") && !path.includes("\0")
  && path.split("/").every(part => part && part !== "." && part !== "..");
const evidencePath = (root, arm, file) => join(root, "control", "slots", arm, file);
const verificationArgv = command => ["--test", "--test-reporter=tap", ...command.slice(2)];

function saveNew(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, typeof value === "string" || Buffer.isBuffer(value) ? value : serialize(value), { flag: "wx", mode: 0o600 });
}

function saveTerminal(root, plan, id, value) {
  const artifacts = {}, artifactErrors = [];
  const folder = dirname(evidencePath(root, id, "result.json"));
  for (const name of ["request.json", "spawn.json", "stdout.jsonl", "stderr.log", "last-message.txt", "response.txt", "patch.diff", "changes.json",
    ...(value.verification?.checks ?? []).map(check => check.log)]) {
    const path = join(folder, name);
    if (existsSync(path)) {
      try { artifacts[name] = comparisonHash(readStableFile(path, "comparison artifact", LIMIT).bytes); }
      catch (error) { artifactErrors.push({ name, reason: sanitizeComparisonLog(error.message) }); }
    }
  }
  const receipt = { ...value, run_id: plan.run_id, evidence_kind: plan.config.evidence_kind, artifacts, artifact_errors: artifactErrors };
  if (artifactErrors.length) {
    if (receipt.state === "completed") receipt.state = "runner_failed";
    if (receipt.outcome === "pass") receipt.outcome = "unknown";
    receipt.reason += "; one or more artifacts could not be safely recorded";
  }
  const bytes = serialize(receipt);
  saveNew(evidencePath(root, id, "result.json"), bytes);
  saveNew(evidencePath(root, id, "result.digest"), comparisonHash(bytes));
  return receipt;
}

// No credential/config reads. Redact common credential-bearing log formats;
// task and repository content must already be approved for the selected provider.
export function sanitizeComparisonLog(value) {
  return String(value).replace(/((?:authorization|proxy-authorization)\s*[:=]\s*)(?:[^\r\n]+)/giu, "$1[REDACTED]")
    .replace(/((?:cookie|set-cookie)\s*[:=]\s*)(?:[^\r\n]+)/giu, "$1[REDACTED]")
    .replace(/((?:access_token|refresh_token|api_key|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/giu, "$1[REDACTED]")
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/gu, "[REDACTED]");
}

export function readUserComparisonPlan(output) {
  const root = resolve(output);
  assert.equal(realpathSync(root), root, "output must be a canonical directory");
  const path = join(root, "control/plan.json");
  const raw = readStableFile(path, "comparison plan", LIMIT).bytes;
  const planDigest = comparisonHash(raw);
  assert.equal(readStableFile(join(root, "control/plan.digest"), "prepared plan digest", 256).bytes.toString("utf8").trim(), planDigest,
    "saved plan changed; prepare a new run instead of editing history");
  const plan = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
  assert.equal(plan.kind, "ask_user_comparison_plan_v1");
  assert.equal(plan.root, root, "moving a prepared workspace is unsupported");
  assert.ok(["synthetic", "observed"].includes(plan.config.evidence_kind));
  assert.deepEqual(plan.policy, { attempts: 1, retries: 0, concurrency: 1 });
  for (const id of USER_CONDITIONS) {
    assert.equal(plan.arms[id].path, `arms/${id}`);
    assert.ok(["available", "capability_missing"].includes(plan.arms[id].capability.status));
  }
  assert.equal(plan.input.path, "inputs/prompt.md");
  assert.equal(plan.verification.path, "control/verification.json");
  if (existsSync(join(root, "control/start.json"))) {
    const started = readJson(join(root, "control/start.json"));
    assert.equal(started.run_id, plan.run_id, "start identity changed");
    assert.equal(started.plan_digest, planDigest, "started plan differs from saved history");
    assert.equal(started.evidence_kind, plan.config.evidence_kind, "start evidence kind changed");
  }
  return { root, plan, plan_digest: planDigest };
}

export function userCodexInvocation(root, plan, condition) {
  assert.ok(USER_CONDITIONS.includes(condition));
  const argv = ["exec", "--sandbox", "workspace-write", "--json", "--output-last-message", evidencePath(root, condition, "last-message.txt")];
  if (plan.config.model !== null) argv.push("--model", plan.config.model);
  if (plan.config.reasoning !== null) argv.push("--config", `model_reasoning_effort=${JSON.stringify(plan.config.reasoning)}`);
  argv.push("-");
  return { executable: plan.config.cli_bin, argv, cwd: join(root, plan.arms[condition].path),
    input: plan.prompt, timeoutMs: plan.config.timeout_ms };
}

export function inspectUserComparison(output) {
  const loaded = readUserComparisonPlan(output), { root, plan } = loaded;
  return { ...loaded, invocations: USER_CONDITIONS.map(id => ({ condition: id, ...userCodexInvocation(root, plan, id),
    capability: plan.arms[id].capability })), verification: { executable: process.execPath,
    argv: verificationArgv(plan.verification.recipe.command), cwd: "a fresh verification copy for each launched condition",
    timeout_ms: plan.config.verification_timeout_ms },
  transmission: { input: "same task prompt, committed repository files, condition instructions, ordinary Codex conversation/tool context",
    provider_and_authentication: "inherited ordinary Codex configuration; not inspected by ASK; operator must confirm permission and destination before start",
    unknown: ["future tool-selected context", "resolved provider/model when not reported", "global instructions and configuration"] },
  start_boundary: "only start with this plan digest requests Codex; prepare/inspect/report never start a model",
  timeout_boundary: "local process-group time limit; not a server cancellation or hard token/cost budget" };
}

function inventoryChanges(baseline, actual) {
  return [...new Set([...Object.keys(baseline), ...Object.keys(actual)])].sort()
    .filter(path => !same(baseline[path] ?? null, actual[path] ?? null));
}
function mutable(path, prefixes) { return prefixes.some(prefix => prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix); }
function git(cwd, argv) {
  const result = spawnSync("git", ["-c", `core.hooksPath=${devNull}`, "-c", "core.fsmonitor=false", ...argv], {
    cwd, encoding: "utf8", shell: false, timeout: 30000, maxBuffer: LIMIT,
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
  });
  assert.ok(!result.error && result.status === 0, "local Git evidence unavailable");
  return result.stdout;
}

function capturePatch(cwd, baseline, changes, inventory) {
  let patch = git(cwd, ["diff", "--no-ext-diff", "--no-textconv", "--binary", baseline, "--"]);
  for (const path of changes.filter(path => !inventory[path] && existsSync(join(cwd, path)))) {
    const result = spawnSync("git", ["-c", `core.hooksPath=${devNull}`, "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--binary", "--", devNull, path],
      { cwd, encoding: "utf8", timeout: 30000, maxBuffer: LIMIT, shell: false,
        env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" } });
    assert.ok(!result.error && [0, 1].includes(result.status), "new-file diff unavailable");
    patch += result.stdout;
  }
  assert.ok(Buffer.byteLength(patch) <= LIMIT, "patch output limit");
  return sanitizeComparisonLog(patch);
}

function copyRegularTree(source, destination) {
  mkdirSync(destination, { mode: 0o700 });
  for (const [path, entry] of Object.entries(inventoryUserTree(source))) {
    assert.ok(relativeSafe(path));
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    const bytes = readStableFile(join(source, path), "verification source", entry.bytes).bytes;
    assert.equal(comparisonHash(bytes), entry.digest, "verification source changed after inventory");
    writeFileSync(target, bytes,
      { flag: "wx", mode: entry.mode === "100755" ? 0o700 : 0o600 });
  }
}

export function parseUserCodexTelemetry(stdout) {
  const metrics = { input_tokens: null, output_tokens: null, cached_tokens: null }, errors = [], missing = new Set();
  let session_id = null, model = null;
  for (const line of String(stdout).split(/\r?\n/u)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === "thread.started" && typeof event.thread_id === "string") session_id = event.thread_id;
    if (typeof event.model === "string" && /^[a-zA-Z0-9._:/-]{1,160}$/u.test(event.model)) model = event.model;
    if (["error", "turn.failed"].includes(event.type)) errors.push(sanitizeComparisonLog(event.message ?? event.error?.message ?? "Codex reported failure"));
    if (event.type !== "turn.completed") continue;
    for (const [target, key] of [["input_tokens", "input_tokens"], ["output_tokens", "output_tokens"], ["cached_tokens", "cached_input_tokens"]]) {
      const value = event.usage?.[key];
      if (Number.isFinite(value) && value >= 0) metrics[target] = (metrics[target] ?? 0) + value;
      else missing.add(target);
    }
  }
  for (const field of missing) metrics[field] = null;
  return { metrics, session_id, model, errors, cost: null, request_count: null };
}

export function inspectNodeVerification(stdout) {
  const field = name => {
    const match = new RegExp(`^# ${name} (\\d+)\\s*$`, "mu").exec(String(stdout));
    return match ? Number(match[1]) : null;
  };
  const counts = { tests: field("tests"), passed: field("pass"), failed: field("fail"), cancelled: field("cancelled"), skipped: field("skipped"), todo: field("todo") };
  return { ...counts, assertions_observed: counts.tests > 0 && counts.passed === counts.tests && counts.failed === 0
    && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0 };
}

async function verifyCondition(root, plan, condition, signal, execute) {
  const cwd = join(root, "verification", condition);
  mkdirSync(dirname(cwd), { recursive: true, mode: 0o700 });
  copyRegularTree(join(root, plan.arms[condition].path), cwd);
  const checks = [{ id: "task-tests", command: plan.verification.recipe.command },
    ...plan.verification.recipe.requirements.filter(item => item.command).map(item => ({ id: item.id, command: item.command }))];
  const results = [];
  for (const [index, check] of checks.entries()) {
    if (signal?.aborted) break;
    const argv = verificationArgv(check.command);
    const value = await execute({ executable: process.execPath, argv, cwd, input: "",
      timeoutMs: plan.config.verification_timeout_ms, signal,
      env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", GIT_CONFIG_GLOBAL: devNull,
        GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" } });
    const log = `verification-${index}.log`;
    saveNew(evidencePath(root, condition, log), sanitizeComparisonLog(`${value.stdout ?? ""}\n${value.stderr ?? ""}`));
    const assertions = inspectNodeVerification(value.stdout ?? "");
    results.push({ id: check.id, command: [process.execPath, ...argv], cwd, log, assertions,
      status: value.interrupted ? "interrupted" : value.timedOut ? "timeout" : value.spawnObserved && value.exitCode === 0 && !value.error && !value.cleanupError && !value.outputLimited && assertions.assertions_observed ? "pass" : "fail",
      exit_code: value.exitCode ?? null, duration_ms: value.durationMs ?? null });
    if (value.interrupted || value.timedOut || value.cleanupError) break;
  }
  return { independent_process: true, common_frozen_recipe: true, checks: results,
    requirements: plan.verification.recipe.requirements.map(item => ({ id: item.id, description: item.description,
      status: item.command ? results.find(result => result.id === item.id)?.status ?? "unknown" : "unknown" })),
    limitations: ["tests cover their assertions; human/semantic criteria without a command remain unknown", "verification executes repository test code in a fresh copy; this is not a security sandbox"] };
}

/** Explicit one-shot start. No resume/retry/alternate launch path exists. */
export async function startUserComparison(output, confirmedDigest, { signal, runner = executeCodexSession, verifier = executeCodexSession } = {}) {
  const { root, plan, plan_digest } = readUserComparisonPlan(output);
  assert.ok(plan.config.evidence_kind === "synthetic" ? runner !== executeCodexSession : runner === executeCodexSession,
    "injected fake runners require synthetic evidence; synthetic plans cannot use the real launcher");
  assert.equal(confirmedDigest, plan_digest, "inspect and confirm the exact plan digest before start");
  assert.ok(!existsSync(join(root, "control/start.json")), "this run already consumed its start; use a new output/run ID for another execution");
  assert.equal(comparisonHash(readStableFile(join(root, plan.input.path), "prompt", LIMIT).bytes), plan.input.digest, "prompt changed");
  assert.equal(readFileSync(join(root, plan.input.path), "utf8"), plan.prompt);
  assert.equal(comparisonHash(readStableFile(join(root, plan.verification.path), "recipe", LIMIT).bytes), plan.verification.digest, "verification changed");
  assert.deepEqual(readJson(join(root, plan.verification.path)), plan.verification.recipe, "verification plan and recipe differ");
  for (const id of USER_CONDITIONS) {
    assert.deepEqual(inventoryUserTree(join(root, plan.arms[id].path)), plan.arms[id].baseline_inventory, `prepared ${id} changed`);
    assert.deepEqual(inventoryComparisonGitMetadata(join(root, plan.arms[id].path)), plan.arms[id].git_metadata, `prepared ${id} Git metadata changed`);
  }
  saveNew(join(root, "control/start.json"), { run_id: plan.run_id, plan_digest, requested_at: new Date().toISOString(), controller_pid: process.pid,
    evidence_kind: plan.config.evidence_kind, policy: plan.policy });
  let stopped = false;
  const sessions = new Set();
  for (const id of USER_CONDITIONS) {
    if (stopped || signal?.aborted) break;
    const arm = plan.arms[id];
    if (arm.capability.status === "capability_missing") {
      saveTerminal(root, plan, id, { condition: id, plan_digest, state: "capability_missing", launch_requested: false, spawn_observed: false,
        process_completed: false, exit_code: null, reason: `required routes unavailable: ${arm.capability.missing.join(", ")}`,
        outcome: "unknown", metrics: { duration_ms: null, input_tokens: null, output_tokens: null, cached_tokens: null } });
      continue;
    }
    const invocation = userCodexInvocation(root, plan, id);
    const conditionStarted = Date.now();
    saveNew(evidencePath(root, id, "request.json"), { condition: id, requested_at: new Date().toISOString(),
      executable: invocation.executable, argv: invocation.argv, cwd: invocation.cwd, prompt_digest: plan.input.digest,
      timeout_ms: invocation.timeoutMs, evidence_kind: plan.config.evidence_kind });
    let value;
    try {
      value = await runner({ ...invocation, signal, onSpawn: observed => {
        const pid = typeof observed === "number" ? observed : observed.pid;
        assert.ok(Number.isInteger(pid) && pid > 0, "spawn PID observation required");
        saveNew(evidencePath(root, id, "spawn.json"), { pid, observed_at: new Date().toISOString() });
      } });
    } catch (error) {
      value = { spawnObserved: existsSync(evidencePath(root, id, "spawn.json")) ? true : null, exitCode: null,
        error: { code: error.code ?? "RUNNER_ERROR", message: sanitizeComparisonLog(error.message) }, stdout: "", stderr: "" };
    }
    saveNew(evidencePath(root, id, "stdout.jsonl"), sanitizeComparisonLog(value.stdout ?? ""));
    saveNew(evidencePath(root, id, "stderr.log"), sanitizeComparisonLog(value.stderr ?? ""));
    const telemetry = parseUserCodexTelemetry(value.stdout ?? "");
    let state = value.interrupted ? "interrupted" : value.timedOut ? "timeout"
      : !value.spawnObserved && ["EACCES", "EPERM"].includes(value.error?.code) ? "permission_denied"
      : !value.spawnObserved && value.error?.code === "ENOENT" ? "capability_missing"
      : value.error || value.exitCode !== 0 || value.cleanupError || value.outputLimited || telemetry.errors.length ? "runner_failed" : "completed";
    let reason = sanitizeComparisonLog(value.error?.message ?? value.cleanupError?.message ?? telemetry.errors[0]
      ?? (state === "completed" ? "process exited successfully; task quality is separately verified" : state));
    if (telemetry.session_id !== null) {
      if (sessions.has(telemetry.session_id)) { state = "runner_failed"; reason = "session identity reused across conditions"; }
      sessions.add(telemetry.session_id);
    }
    let patch_ref = null, scope = { status: "unknown", changed_paths: [], violations: [] }, verification = null;
    try {
      const lastMessage = evidencePath(root, id, "last-message.txt");
      if (existsSync(lastMessage)) {
        const stat = lstatSync(lastMessage);
        assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "unsafe last-message receipt");
        const sanitized = sanitizeComparisonLog(readStableFile(lastMessage, "last message", LIMIT).bytes.toString("utf8"));
        writeFileSync(lastMessage, sanitized); chmodSync(lastMessage, 0o600);
      }
      const actual = inventoryUserTree(invocation.cwd), changed = inventoryChanges(arm.baseline_inventory, actual);
      const gitChanges = inventoryChanges(arm.git_metadata, inventoryComparisonGitMetadata(invocation.cwd));
      const protectedPaths = new Set(arm.assets.map(asset => asset.path));
      scope = { status: "pass", changed_paths: [...changed, ...gitChanges], violations: [...gitChanges,
        ...changed.filter(path => !mutable(path, plan.mutable_paths) || isComparisonInstructionPath(path) || protectedPaths.has(path))] };
      if (scope.violations.length) scope.status = "fail";
      saveNew(evidencePath(root, id, "changes.json"), { before: arm.baseline_inventory, after: actual, scope });
      if (gitChanges.length === 0) {
        saveNew(evidencePath(root, id, "patch.diff"), capturePatch(invocation.cwd, arm.baseline_commit, changed, arm.baseline_inventory));
        patch_ref = "patch.diff";
      }
      if (state === "completed" && scope.status !== "pass") { state = "scope_violation"; reason = "changes outside the approved task scope or to condition assets"; }
      if (state === "completed") {
        const last = evidencePath(root, id, "last-message.txt");
        if (!existsSync(last) || !lstatSync(last).isFile() || lstatSync(last).isSymbolicLink() || !readStableFile(last, "last message", LIMIT).bytes.toString("utf8").trim()) {
          state = "result_missing"; reason = "successful process had no saved final message";
        } else {
          const message = sanitizeComparisonLog(readStableFile(last, "last message", LIMIT).bytes.toString("utf8"));
          // The CLI output is a private raw receipt; store a sanitized view for reports.
          saveNew(evidencePath(root, id, "response.txt"), message);
          verification = await verifyCondition(root, plan, id, signal, verifier);
          if (signal?.aborted || verification.checks.some(check => check.status === "interrupted")) { state = "interrupted"; reason = "interrupted during independent verification"; }
          else if (verification.checks.some(check => check.status !== "pass")) { state = "verification_failed"; reason = "independent verification did not pass"; }
        }
      }
    } catch (error) {
      if (state === "completed") state = "runner_failed";
      reason = `${reason}; evidence collection unavailable: ${sanitizeComparisonLog(error.message)}`;
    }
    const outcome = scope.status === "fail" || state === "verification_failed" ? "fail"
      : state === "completed" && verification?.checks.length > 0 && verification.checks.every(check => check.status === "pass")
        && verification.requirements.length > 0 && verification.requirements.every(check => check.status === "pass") ? "pass" : "unknown";
    const terminal = saveTerminal(root, plan, id, { condition: id, plan_digest, state, outcome, reason,
      launch_requested: true, spawn_observed: value.spawnObserved ?? null,
      process_completed: value.spawnObserved === true && (value.exitCode != null || value.signal != null),
      exit_code: value.exitCode ?? null, signal: value.signal ?? null, completed_at: new Date().toISOString(),
      runner_error: value.error ? { code: value.error.code ?? "unknown", message: sanitizeComparisonLog(value.error.message ?? "unknown") } : null,
      cleanup_error: value.cleanupError ? { code: value.cleanupError.code ?? "unknown", message: sanitizeComparisonLog(value.cleanupError.message ?? "unknown") } : null,
      output_limited: value.outputLimited ?? false,
      session_id: telemetry.session_id, actual_model: telemetry.model, configured_model: plan.config.model,
      metrics: { duration_ms: Date.now() - conditionStarted, ...telemetry.metrics }, process_duration_ms: value.durationMs ?? null,
      verification_duration_ms: verification && verification.checks.length && verification.checks.every(check => check.duration_ms !== null)
        ? verification.checks.reduce((total, check) => total + check.duration_ms, 0) : null,
      cost: null, request_count: null,
      patch_ref, scope, verification, logs: ["stdout.jsonl", "stderr.log", ...(existsSync(evidencePath(root, id, "response.txt")) ? ["response.txt"] : [])] });
    stopped = terminal.state !== "completed";
  }
  saveNew(join(root, "control/end.json"), { ended_at: new Date().toISOString(), interrupted: signal?.aborted ?? false });
  return reportUserComparison(root);
}

export function reportUserComparison(output) {
  const { root, plan, plan_digest } = readUserComparisonPlan(output);
  const slots = USER_CONDITIONS.map(id => {
    const result = evidencePath(root, id, "result.json");
    if (existsSync(result)) {
      try {
        const raw = readStableFile(result, "terminal receipt", LIMIT).bytes;
        assert.equal(comparisonHash(raw), readStableFile(evidencePath(root, id, "result.digest"), "terminal digest", 256).bytes.toString("utf8"));
        const value = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
        assert.equal(value.condition, id); assert.equal(value.run_id, plan.run_id); assert.equal(value.evidence_kind, plan.config.evidence_kind);
        assert.equal(value.plan_digest, plan_digest, "terminal receipt belongs to a different plan");
        assert.ok(["completed", "capability_missing", "permission_denied", "runner_failed", "timeout", "interrupted", "result_missing", "scope_violation", "verification_failed"].includes(value.state));
        assert.ok(["pass", "fail", "unknown"].includes(value.outcome));
        for (const [name, digest] of Object.entries(value.artifacts)) {
          assert.ok(relativeSafe(name) && !name.includes("/"));
          assert.equal(comparisonHash(readStableFile(evidencePath(root, id, name), "saved artifact", LIMIT).bytes), digest, `artifact ${name} changed or missing`);
        }
        return value;
      }
      catch (error) { return { condition: id, state: "result_missing", outcome: "unknown", reason: `terminal receipt unreadable: ${sanitizeComparisonLog(error.message)}` }; }
    }
    const requested = existsSync(evidencePath(root, id, "request.json")), spawned = existsSync(evidencePath(root, id, "spawn.json"));
    return { condition: id, state: requested ? "incomplete" : "not_started", outcome: "unknown", launch_requested: requested,
      spawn_observed: spawned ? true : requested ? null : false, process_completed: false, exit_code: null,
      reason: requested ? "no terminal receipt; still running or interrupted, completion and usage unknown" : "no launch request saved" };
  });
  const notes = { kind: "ask_pragmatic_evaluation_notes_v1", evidence_kind: existsSync(join(root, "control/start.json")) ? plan.config.evidence_kind : "plan",
    planned_blocks: [plan.run_id], global_context: { ask_presence: plan.config.global_ask_presence, change_status: "unknown" },
    next_improvement: "review this task's saved tests, requirements, changes and unknowns before choosing a new run",
    trials: slots.map(slot => ({ block_id: plan.run_id, condition: slot.condition,
      execution_state: slot.state === "not_started" || (slot.state === "capability_missing" && !slot.launch_requested) ? "not_started"
        : slot.state === "completed" ? "completed" : ["incomplete", "interrupted", "timeout"].includes(slot.state) ? "stopped" : "failed",
      outcome: slot.outcome ?? "unknown", stop_reason: slot.reason,
      evidence_refs: existsSync(evidencePath(root, slot.condition, "result.json")) ? [`control/slots/${slot.condition}/result.json`] : [],
      local_assets_ref: `plan.json#arms/${slot.condition}/assets`, task_ref: plan.task.digest,
      input_ref: `${plan.source.commit}:${plan.source.digest}`, success_criteria_ref: plan.verification.digest,
      cli_version: plan.config.cli_version, model: slot.actual_model ?? plan.config.model, reasoning: plan.config.reasoning,
      platform: plan.config.platform ?? `${process.platform}/${process.arch}`, global_context_ref: null,
      metrics: { duration_ms: slot.metrics?.duration_ms ?? null, input_tokens: slot.metrics?.input_tokens ?? null,
        output_tokens: slot.metrics?.output_tokens ?? null, cached_tokens: slot.metrics?.cached_tokens ?? null,
        human_review_minutes: null, rework_minutes: null } })) };
  return { kind: "ask_user_comparison_report_v1", root, run_id: plan.run_id, plan_digest, evidence_kind: notes.evidence_kind,
    source: plan.source, slots, configuration: plan.config, condition_differences: plan.condition_differences, unknowns: plan.unknowns,
    summary: buildPragmaticEvaluationReport(notes),
    limitations: ["one task is not general ASK effectiveness, operational success, or v1 completion", "global settings and read isolation are not proven",
      "configured CLI/model labels are declarations unless independently observed; missing usage/cost remain unknown", "synthetic results are development evidence only"] };
}

/** Separate distributions by evidence kind; never pool fake and model observations. */
export function aggregateUserComparisons(outputs) {
  const reports = outputs.map(reportUserComparison);
  assert.equal(new Set(reports.map(report => report.run_id)).size, reports.length, "duplicate run IDs cannot be counted twice");
  const kinds = [...new Set(reports.map(report => report.evidence_kind))];
  return { kind: "ask_user_comparison_collection_v1", reports, groups: kinds.map(evidence_kind => {
    const members = reports.filter(report => report.evidence_kind === evidence_kind);
    const notes = { ...members[0].summary.supplied_notes, planned_blocks: members.map(report => report.run_id),
      trials: members.flatMap(report => report.summary.supplied_notes.trials) };
    return { evidence_kind, summary: buildPragmaticEvaluationReport(notes) };
  }), mixed_evidence_pooled: false };
}

function parseOptions(argv) {
  const options = {}, flags = new Map([["--repo", "repo"], ["--commit", "commit"], ["--task", "taskFile"], ["--verification", "verificationFile"],
    ["--output", "output"], ["--cli", "cliBin"], ["--cli-version", "cliVersion"], ["--model", "model"], ["--reasoning", "reasoning"],
    ["--timeout-ms", "timeoutMs"], ["--verification-timeout-ms", "verificationTimeoutMs"], ["--task-class", "taskClass"],
    ["--global-ask", "globalAskPresence"], ["--rerun-of", "rerunOf"]]);
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index], value = argv[++index];
    assert.ok(value && !value.startsWith("--"), `value required for ${flag}`);
    if (flag === "--allow") (options.mutablePaths ??= []).push(value);
    else if (flag === "--global-capability") (options.globalCapabilities ??= []).push(value);
    else {
      assert.ok(flags.has(flag) && options[flags.get(flag)] === undefined, `unknown or duplicate option ${flag}`);
      options[flags.get(flag)] = flag.includes("timeout-ms") ? Number(value) : value;
    }
  }
  return options;
}

function printReport(report) {
  console.log(`Run: ${report.run_id}\nEvidence: ${report.evidence_kind}\nSource: ${report.source.repo}@${report.source.commit}\nSaved: ${report.root}`);
  for (const slot of report.slots) console.log(`${slot.condition}: ${slot.state}; quality=${slot.outcome}; request=${slot.launch_requested ?? "unknown"}; start=${slot.spawn_observed ?? "unknown"}; exit=${slot.exit_code ?? "unknown"}; time=${slot.metrics?.duration_ms ?? "unknown"}; tokens=${slot.metrics?.input_tokens ?? "unknown"}/${slot.metrics?.output_tokens ?? "unknown"}\n  ${slot.reason}`);
  console.log(`Condition differences:\n${report.condition_differences.map(value => `  ${value}`).join("\n")}\nUnknowns:\n${report.unknowns.map(value => `  ${value}`).join("\n")}`);
  for (const block of report.summary.blocks) for (const contrast of block.contrasts) for (const difference of contrast.differences) {
    console.log(`  ${contrast.contrast}: ${difference.field} ${JSON.stringify(difference)}`);
  }
  console.log("Unknown usage/cost are not zero. Test pass alone does not verify unassessed requirements. Scope: this task and environment only.");
}

async function main(argv) {
  const json = argv.includes("--json"); argv = argv.filter(arg => arg !== "--json");
  const [command, ...args] = argv;
  if (command === "prepare") {
    const result = prepareUserComparison(parseOptions(args));
    console.log(json ? serialize(result) : `Prepared: ${result.root}\nRun: ${result.plan.run_id}\nPlan digest: ${result.plan_digest}\nNo Codex/model process started. Next: inspect this output directory.`);
  } else if (command === "inspect") {
    assert.equal(args.length, 1, "inspect OUTPUT");
    console.log(serialize(inspectUserComparison(args[0])));
  } else if (command === "start") {
    assert.ok(args.length === 3 && args[1] === "--confirm", "start OUTPUT --confirm sha256:PLAN_DIGEST");
    const controller = new AbortController(), stop = () => controller.abort();
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    try {
      const report = await startUserComparison(args[0], args[2], { signal: controller.signal });
      if (json) console.log(serialize(report)); else printReport(report);
      process.exitCode = report.slots.every(slot => slot.state === "completed") ? 0 : 2;
    } finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
  } else if (command === "report") {
    assert.ok(args.length > 0, "report OUTPUT [OUTPUT...]");
    const value = args.length === 1 ? reportUserComparison(args[0]) : aggregateUserComparisons(args);
    if (json || args.length > 1) console.log(serialize(value)); else printReport(value);
  } else {
    throw new Error("usage: node scripts/ask-user-comparison.mjs prepare OPTIONS | inspect OUTPUT | start OUTPUT --confirm DIGEST | report OUTPUT [OUTPUT...] [--json]");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`User comparison refused: ${sanitizeComparisonLog(error.message)}`); process.exitCode = 1; });
}
