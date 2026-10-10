#!/usr/bin/env node
// Exploratory user lane. Fixed experiment drivers and their authority stay separate.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCodexSession } from "./codex-exec-runner.mjs";
import { boundedVerificationLogs } from "./ask-user-comparison-logs.mjs";
import { acquireComparisonOwner, checkpointComparison, inspectComparisonExecution, observeComparisonProcess, probeComparisonOwner, releaseComparisonOwner } from "./ask-user-comparison-state.mjs";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { buildPragmaticEvaluationReport } from "./ask-pragmatic-evaluation-report.mjs";
import { COMPARISON_RECORD_BYTE_LIMIT, comparisonHash, inventoryComparisonGitMetadata, inventoryUserTree, isComparisonInstructionPath, prepareGitBaseline, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";

export const USER_CONDITIONS = Object.freeze(["plain", "kernel_only", "full_ask"]);
export const USER_COMPARISON_EXIT_CODES = Object.freeze({ completed: 0, task_failed: 2, capability_missing: 3,
  authentication_required: 4, permission_denied: 4, runner_failed: 5, result_missing: 5, scope_violation: 5,
  timeout: 6, indeterminate: 7, not_started: 7, interrupted: 8, running: 9, execution_blocked: 9,
  ownership_unverified: 9, state_corrupt: 10, persistence_failed: 10, usage_budget_exhausted: 11 });
const LIMIT = COMPARISON_RECORD_BYTE_LIMIT;
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
const readJson = path => parseJsonRejectDuplicateKeys(readStableFile(path, "comparison record", LIMIT).bytes.toString("utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const relativeSafe = path => typeof path === "string" && !isAbsolute(path) && !path.includes("\\") && !path.includes("\0")
  && path.split("/").every(part => part && part !== "." && part !== "..");
const evidencePath = (root, arm, file) => join(root, "control", "slots", arm, file);
const verificationArgv = (root, plan, command) => ["--test", `--test-reporter=${join(root, plan.verification.reporter.path)}`, ...command.slice(2)];

function saveNew(path, value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value) ? value : serialize(value);
  assert.ok(Buffer.byteLength(bytes) <= LIMIT, "comparison artifact exceeds its read/write byte limit");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  assert.equal(realpathSync(dirname(path)), dirname(path), "unsafe comparison evidence directory");
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  const parent = openSync(dirname(path), "r");
  try { fsyncSync(parent); } finally { closeSync(parent); }
}

function saveLaunchReceipt(root, id, name, value) {
  const bytes = serialize(value);
  saveNew(evidencePath(root, id, `${name}.json`), bytes);
  saveNew(evidencePath(root, id, `${name}.digest`), comparisonHash(bytes));
}

function saveTerminal(root, plan, id, value) {
  const artifacts = {}, artifactErrors = [];
  const folder = dirname(evidencePath(root, id, "result.json"));
  for (const name of ["request.json", "request.digest", "spawn.json", "spawn.digest", "stdout.jsonl", "stderr.log", "last-message.txt", "response.txt", "patch.diff", "changes.json",
    ...(existsSync(folder)?readdirSync(folder):[]).filter(name=>/^verification-\d+\.(?:request|spawn)\.(?:json|digest)$/u.test(name)),
    ...(value.verification?.checks ?? []).flatMap((check,index) => [...(check.logs ?? [check.log]), ...["request","spawn"].flatMap(kind=>[`verification-${index}.${kind}.json`,`verification-${index}.${kind}.digest`])])]) {
    const path = join(folder, name);
    if (existsSync(path)) {
      try { artifacts[name] = comparisonHash(readStableFile(path, "comparison artifact", LIMIT).bytes); }
      catch (error) { artifactErrors.push({ name, reason: sanitizeComparisonLog(error.message) }); }
    }
  }
  const receipt = { ...value, run_id: plan.run_id, evidence_kind: plan.config.evidence_kind, artifacts, artifact_errors: artifactErrors };
  if (artifactErrors.length) {
    if (["completed","verification_failed","indeterminate"].includes(receipt.state)) receipt.state = "runner_failed";
    receipt.outcome = "unknown";
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

export function readUserComparisonPlan(output, { ignoreStart = false } = {}) {
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
    assert.equal(plan.arms[id].baseline_path, `control/baselines/${id}`);
    assert.ok(["available", "capability_missing"].includes(plan.arms[id].capability.status));
  }
  assert.equal(plan.input.path, "inputs/prompt.md");
  assert.equal(plan.verification.path, "control/verification.json");
  assert.equal(plan.verification.reporter.path, "control/node-test-reporter.mjs");
  assert.equal(plan.verification.reporter.format, "ask_node_summary_jsonl_v1");
  if (!ignoreStart && !existsSync(join(root,"control/start.json")) && (existsSync(join(root,"control/start.digest")) || existsSync(join(root,"control/leases")) || existsSync(join(root,"control/history")))) throw fault(10,"start record missing from an existing execution; state corrupt");
  if (!ignoreStart && existsSync(join(root, "control/start.json"))) {
    const started = readJson(join(root, "control/start.json"));
    assert.equal(started.run_id, plan.run_id, "start identity changed");
    assert.equal(started.plan_digest, planDigest, "started plan differs from saved history");
    assert.equal(started.evidence_kind, plan.config.evidence_kind, "start evidence kind changed");
    if (started.execution_version === 2) {
      assert.equal(comparisonHash(readStableFile(join(root, "control/start.json"), "start", LIMIT).bytes),
        readStableFile(join(root, "control/start.digest"), "start digest", 256).bytes.toString("utf8"), "start publication incomplete or changed");
    }
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
    argv: verificationArgv(root, plan, plan.verification.recipe.command), reporter: plan.verification.reporter,
    cwd: "a fresh verification copy for each launched condition",
    timeout_ms: plan.config.verification_timeout_ms }, execution: inspectComparisonExecution(root, plan, loaded.plan_digest),
  limits: comparisonLimits(plan),
  transmission: { input: "same task prompt, committed repository files, condition instructions, ordinary Codex conversation/tool context",
    provider_and_authentication: "inherited ordinary Codex configuration; not inspected by ASK; operator must confirm permission and destination before start",
    unknown: ["future tool-selected context", "resolved provider/model when not reported", "global instructions and configuration"] },
  start_boundary: "only start/resume with the human-confirmed digest requests Codex; resume never repeats an attempted condition; prepare/inspect/report never start a model",
  timeout_boundary: "local deadline and process-group limits; synchronous evidence/cleanup/report I/O can finish later; not provider cancellation or a hard token/cost budget" };
}

function comparisonLimits(plan) {
  const checks = 1 + plan.verification.recipe.requirements.filter(item => item.command).length;
  return { overall_timeout_ms: plan.config.overall_timeout_ms ?? 3600000,
    condition_admission_reserve_ms: plan.config.timeout_ms + checks * plan.config.verification_timeout_ms,
    deadline_origin: "first_start_including_downtime", token_budget: plan.config.token_budget ?? null,
    usage_basis: "known_input_plus_output_tokens_lower_bound", unknown_usage_policy: "continue_with_unknown",
    retries: 0, concurrency: 1, limitations: ["synchronous evidence I/O and process cleanup can overshoot the local deadline",
      "provider cancellation, exact token/cost caps and monthly balance are not guaranteed or inspected"] };
}

function reportedInteraction(value) {
  const code = String(value?.code ?? value?.error?.code ?? "").toUpperCase();
  const message = String(value?.message ?? value?.error?.message ?? "");
  if (["401", "UNAUTHENTICATED", "UNAUTHORIZED", "LOGIN_REQUIRED", "AUTHENTICATION_REQUIRED", "AUTH_REQUIRED"].includes(code)
    || /(?:authentication required|not (?:logged|signed) in|please (?:log|sign) in|invalid api key|unauthorized)/iu.test(message)) {
    return { state: "authentication_required", reason: "CLI reports authentication required; no interactive input or repair is attempted" };
  }
  if (["403", "FORBIDDEN", "PERMISSION_DENIED", "APPROVAL_REQUIRED", "USER_INPUT_REQUIRED", "EACCES", "EPERM"].includes(code)
    || /(?:permission denied|approval (?:is )?required|requires approval)/iu.test(message)) {
    return { state: "permission_denied", reason: "CLI reports permission/approval required; obtain legitimate authorization outside this run" };
  }
  return null;
}

function interactionObserver(stop) {
  const pending = { stdout: "", stderr: "" };
  return ({ stream, chunk }) => {
    if (!(stream in pending)) return;
    pending[stream] = (pending[stream] + Buffer.from(chunk).toString("utf8")).slice(-65536);
    const lines = pending[stream].split(/\r?\n/u); pending[stream] = lines.pop();
    for (const line of [...lines, pending[stream], ...(stream === "stderr" && /^\s*(?:error|fatal)\s*:/iu.test(pending[stream]) ? [pending[stream]] : [])]) {
      let value;
      try { value = JSON.parse(line); } catch {
        if (stream === "stderr" && /^\s*(?:error|fatal)\s*:/iu.test(line)) {
          const action = reportedInteraction({ message: line }); if (action) stop(action);
        }
        continue;
      }
      if (value && ["error", "turn.failed", "authentication.required", "approval.required"].includes(value.type)) {
        const action = reportedInteraction(value.type === "authentication.required" ? { code: "AUTHENTICATION_REQUIRED" }
          : value.type === "approval.required" ? { code: "APPROVAL_REQUIRED" } : value);
        if (action) stop(action);
      }
    }
  };
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

function copyInventoryFiles(source, destination, inventory, paths) {
  for (const path of paths.filter(path => inventory[path])) {
    assert.ok(relativeSafe(path));
    const entry = inventory[path], target = join(destination, path);
    const bytes = readStableFile(join(source, path), "diff source", entry.bytes).bytes;
    assert.equal(comparisonHash(bytes), entry.digest, "diff source changed after inventory");
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, bytes, { flag: "wx", mode: entry.mode === "100755" ? 0o700 : 0o600 });
  }
}

function capturePatch(root, arm, condition, changes, actual) {
  const baselineRoot = join(root, arm.baseline_path), cwd = join(root, "control/patch-workspaces", condition);
  assert.deepEqual(inventoryUserTree(baselineRoot), arm.baseline_inventory, "private diff baseline changed");
  assert.equal(realpathSync(dirname(cwd)), dirname(cwd), "unsafe controller patch directory");
  mkdirSync(cwd, { mode: 0o700 });
  copyInventoryFiles(baselineRoot, cwd, arm.baseline_inventory, changes);
  const baseline = prepareGitBaseline(cwd);
  // The model's mutable index/object store is never a controller Git input.
  // Re-materialize actual changed bytes after committing a trusted subset,
  // including additions, deletions, modes and file/directory transitions.
  for (const name of readdirSync(cwd)) if (name !== ".git") rmSync(join(cwd, name), { recursive: true });
  copyInventoryFiles(join(root, arm.path), cwd, actual, changes);
  git(cwd, ["add", "--force", "--all"]);
  const options = ["--cached", "--no-ext-diff", "--no-textconv", "--no-renames", baseline, "--"];
  const recorded = git(cwd, ["diff", "--name-only", "-z", ...options]).split("\0").filter(Boolean).sort();
  assert.deepEqual(recorded, [...changes].sort(), "patch must cover every inventory change");
  const patch = git(cwd, ["diff", "--binary", ...options]);
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
  let session_id = null, model = null, interaction = null, knownLowerBound = 0, turns = 0;
  for (const line of String(stdout).split(/\r?\n/u)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event === null || typeof event !== "object" || Array.isArray(event)) continue;
    if (event.type === "thread.started" && typeof event.thread_id === "string") session_id = event.thread_id;
    if (typeof event.model === "string" && /^[a-zA-Z0-9._:/-]{1,160}$/u.test(event.model)) model = event.model;
    if (["error", "turn.failed", "authentication.required", "approval.required"].includes(event.type)) {
      errors.push(sanitizeComparisonLog(event.message ?? event.error?.message ?? "Codex reported failure").slice(0, 4096));
      interaction ??= reportedInteraction(event.type === "authentication.required" ? { code: "AUTHENTICATION_REQUIRED" }
        : event.type === "approval.required" ? { code: "APPROVAL_REQUIRED" } : event);
    }
    if (event.type !== "turn.completed") continue;
    turns++;
    for (const [target, key] of [["input_tokens", "input_tokens"], ["output_tokens", "output_tokens"], ["cached_tokens", "cached_input_tokens"]]) {
      const value = event.usage?.[key];
      if (Number.isSafeInteger(value) && value >= 0) {
        const total = (metrics[target] ?? 0) + value;
        if (Number.isSafeInteger(total)) metrics[target] = total; else missing.add(target);
        if (target !== "cached_tokens") knownLowerBound = Math.min(Number.MAX_SAFE_INTEGER, knownLowerBound + value);
      } else missing.add(target);
    }
  }
  for (const field of missing) metrics[field] = null;
  return { metrics, session_id, model, errors, interaction, cost: null, request_count: null,
    usage_lower_bound: { known_tokens: knownLowerBound, complete: turns > 0 && !missing.has("input_tokens") && !missing.has("output_tokens") } };
}

export function inspectNodeVerification(stdout, expectedFiles = []) {
  let reported = { tests: null, passed: null, failed: null, cancelled: null, skipped: null, todo: null }, runSuccess = false, runSeen = false;
  const files = [], errors = [], seen = new Set();
  for (const line of String(stdout).split(/\r?\n/u)) {
    if (!line) continue;
    try {
      const value = parseJsonRejectDuplicateKeys(line);
      if (value.format === "ask_node_event_v1") continue;
      assert.ok(["ask_node_file_summary_v1", "ask_node_run_summary_v1"].includes(value.format));
      assert.equal(typeof value.success, "boolean");
      assert.deepEqual(Object.keys(value.counts).sort(), ["cancelled", "failed", "passed", "skipped", "tests", "todo"]);
      assert.ok(Object.values(value.counts).every(count => Number.isSafeInteger(count) && count >= 0));
      if (value.format === "ask_node_file_summary_v1") {
        assert.deepEqual(Object.keys(value).sort(), ["counts", "file", "format", "success"]);
        assert.ok(relativeSafe(value.file) && expectedFiles.includes(value.file) && !seen.has(value.file));
        files.push(value); seen.add(value.file);
      } else {
        assert.deepEqual(Object.keys(value).sort(), ["counts", "format", "success"]);
        assert.ok(!runSeen);
        reported = value.counts; runSuccess = value.success; runSeen = true;
      }
    } catch { errors.push("invalid or duplicate controller Node summary record"); }
  }
  const allPassed = counts => counts.tests > 0 && counts.passed === counts.tests && counts.failed === 0
    && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0;
  const missing = expectedFiles.filter(file => !seen.has(file));
  return { reported_counts: reported, file_summaries: files, missing_files: missing, errors, assertion_count: null,
    tests_observed: expectedFiles.length > 0 && missing.length === 0 && errors.length === 0
      && runSeen && runSuccess && allPassed(reported) && files.every(file => file.success && allPassed(file.counts)) };
}

async function verifyCondition(root, plan, condition, signal, execute, remaining = () => Infinity, context) {
  const cwd = join(root, "verification", condition);
  mkdirSync(dirname(cwd), { recursive: true, mode: 0o700 });
  copyRegularTree(join(root, plan.arms[condition].path), cwd);
  const checks = [{ id: "task-tests", command: plan.verification.recipe.command },
    ...plan.verification.recipe.requirements.filter(item => item.command).map(item => ({ id: item.id, command: item.command }))];
  const results = [];
  for (const [index, check] of checks.entries()) {
    if (signal?.aborted || remaining() < 1) break;
    assert.equal(comparisonHash(readStableFile(join(root, plan.verification.reporter.path), "Node test reporter", LIMIT).bytes),
      plan.verification.reporter.digest, "Node test reporter changed");
    const argv = verificationArgv(root, plan, check.command);
    const request={condition,run_id:plan.run_id,plan_digest:context?.plan_digest,executable:process.execPath,argv,cwd,evidence_kind:plan.config.evidence_kind,requested_at:new Date().toISOString()};
    if(context) { checkpointComparison(context,"verification_intent",{condition,slot:{phase:"verifying",verification_index:index}});saveLaunchReceipt(root,condition,`verification-${index}.request`,request); }
    // Synchronous receipt persistence may consume the remaining deadline while
    // its timer cannot run. Recheck immediately before dispatch, without turning
    // an exhausted deadline into a one-millisecond new process.
    const dispatchRemaining = remaining();
    if (signal?.aborted || dispatchRemaining < 1) break;
    const value = await execute({ executable: process.execPath, argv, cwd, input: "",
      onSpawn:context ? observed=>{const pid=typeof observed==="number"?observed:observed.pid; context.active_child=`verification-${index}.spawn`;
        saveLaunchReceipt(root,condition,`verification-${index}.spawn`,{...request,pid,observed_at:new Date().toISOString(),owner:observeComparisonProcess(pid),process_group:true});
        context.active_child=`verification-${index}.spawn`;
        checkpointComparison(context,"verification_running",{condition,slot:{phase:"verifying",verification_index:index}}); } : undefined,
      timeoutMs: Math.floor(Math.min(plan.config.verification_timeout_ms, dispatchRemaining)), signal,
      env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", GIT_CONFIG_GLOBAL: devNull,
        GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" } });
    if (context && value.spawnObserved === true && (value.exitCode != null || value.signal != null) && !value.cleanupError) context.active_child=null;
    const log = `verification-${index}.log`;
    const stdoutLog = `verification-${index}.stdout.jsonl`, stderrLog = `verification-${index}.stderr.log`;
    const bounded = boundedVerificationLogs(value.stdout, value.stderr,
      { sanitize: sanitizeComparisonLog, captureTruncated: Boolean(value.outputLimited) });
    saveNew(evidencePath(root, condition, stdoutLog), bounded.stdout);
    saveNew(evidencePath(root, condition, stderrLog), bounded.stderr);
    saveNew(evidencePath(root, condition, log), bounded.view);
    const testSummary = inspectNodeVerification(value.stdout ?? "", check.command.slice(2));
    const testStatus = value.spawnObserved !== true || value.exitCode == null ? "unknown"
      : value.exitCode !== 0 ? "fail" : testSummary.tests_observed ? "pass" : "unknown";
    const evidenceIncomplete = !bounded.metadata.full_evidence_available || value.error || value.cleanupError || value.outputLimited;
    results.push({ id: check.id, command: [process.execPath, ...argv], cwd, log, logs: [stdoutLog, stderrLog, log], log_metadata: bounded.metadata, test_summary: testSummary,
      test_result: testStatus, spawn_observed:value.spawnObserved??null,process_completed:value.spawnObserved === true && (value.exitCode != null || value.signal != null),
      status: value.interrupted ? "interrupted" : value.timedOut ? "timeout" : evidenceIncomplete ? "unknown" : testStatus,
      exit_code: value.exitCode ?? null, duration_ms: value.durationMs ?? null,
      runner_error: value.error ? { code: value.error.code ?? "unknown", message: sanitizeComparisonLog(value.error.message ?? "unknown").slice(0, 4096) } : null,
      cleanup_error: value.cleanupError ? { code: value.cleanupError.code ?? "unknown", message: sanitizeComparisonLog(value.cleanupError.message ?? "unknown").slice(0, 4096) } : null });
    if (value.interrupted || value.timedOut || value.error || value.cleanupError || value.outputLimited) break;
  }
  return { independent_process: execute === executeCodexSession,
    execution_origin: execute === executeCodexSession ? "controller_node_process" : "synthetic_injected_verifier",
    common_frozen_recipe: true,
    runtime: { executable: process.execPath, node_version: process.version, reporter_digest: plan.verification.reporter.digest }, checks: results,
    requirements: plan.verification.recipe.requirements.map(item => ({ id: item.id, description: item.description,
      status: item.command ? results.find(result => result.id === item.id)?.status ?? "unknown" : "unknown" })),
    limitations: ["Node test-case receipts do not measure assertion count or prove that tests cover the requirement; the operator must check coverage", "human/semantic criteria without a command remain unknown", "verification executes repository test code in a fresh copy; this is not a security sandbox"] };
}

const fault = (code, reason) => Object.assign(new Error(reason), { comparisonCode: code });
const ACTION = "Inspect saved evidence and obtain any required legitimate authorization; do not reset attempted slots. Use a new prepared run for retries or changed settings.";
const stopsComparison = state => !["completed", "verification_failed", "indeterminate", "execution_unknown"].includes(state);

function validateInputs(root, plan) {
  assert.equal(comparisonHash(readStableFile(join(root, plan.input.path), "prompt", LIMIT).bytes), plan.input.digest, "prompt changed");
  assert.equal(readFileSync(join(root, plan.input.path), "utf8"), plan.prompt);
  assert.equal(comparisonHash(readStableFile(join(root, plan.verification.path), "recipe", LIMIT).bytes), plan.verification.digest, "verification changed");
  assert.deepEqual(readJson(join(root, plan.verification.path)), plan.verification.recipe, "verification plan and recipe differ");
  assert.equal(comparisonHash(readStableFile(join(root, plan.verification.reporter.path), "Node reporter", LIMIT).bytes), plan.verification.reporter.digest, "Node test reporter changed");
}
function validateArm(root, plan, id, pending) {
  assert.deepEqual(inventoryUserTree(join(root, plan.arms[id].baseline_path)), plan.arms[id].baseline_inventory, `private ${id} baseline changed`);
  if (pending) {
    assert.deepEqual(inventoryUserTree(join(root, plan.arms[id].path)), plan.arms[id].baseline_inventory, `prepared ${id} changed`);
    assert.deepEqual(inventoryComparisonGitMetadata(join(root, plan.arms[id].path)), plan.arms[id].git_metadata, `prepared ${id} Git metadata changed`);
  }
}
function pendingEvidence(root, id) {
  const folder=dirname(evidencePath(root,id,"result.json")); return existsSync(folder) && readdirSync(folder).length > 0;
}
function recoveryChecks(root, plan, digest, audit) {
  const report = reportUserComparison(root);
  for (const id of USER_CONDITIONS) {
    const saved = audit.history.snapshot.slots[id], slot = report.slots.find(item => item.condition === id);
    validateArm(root, plan, id, saved.phase === "pending");
    if (saved.phase === "pending") {
      if (pendingEvidence(root, id)) throw fault(10, `pending ${id} has unexpected receipt; state publication is incomplete`);
      continue;
    }
    if (saved.phase === "terminal" || existsSync(evidencePath(root, id, "result.json"))) {
      if (slot.receipt_integrity !== "valid") throw fault(10, `terminal ${id} receipt missing or corrupt`);
      if (saved.phase === "terminal" && readFileSync(evidencePath(root, id, "result.digest"), "utf8") !== saved.terminal_digest) throw fault(10, "terminal checkpoint digest changed");
      const uncertain=slot.unresolved_child || slot.cleanup_error || (slot.spawn_observed === true && slot.process_completed !== true)
        || slot.verification?.checks.some(check=>check.cleanup_error || (check.spawn_observed === true && check.process_completed !== true));
      if (!uncertain) continue;
    }
    const observation = readLaunchObservations(root, plan, digest, id, true);
    if (observation.launch_requested !== true || observation.spawn_observed !== true || observation.receipt_errors.length) throw fault(10, `attempted ${id} request/spawn receipt incomplete or corrupt; ownership cannot be verified`);
    let spawn = readJson(evidencePath(root, id, "spawn.json"));
    const names = readdirSync(dirname(evidencePath(root, id, "result.json")));
    const requested = names.filter(name => /^verification-\d+\.request\.json$/u.test(name)).sort((x,y) => Number(x.split("-")[1].split(".")[0])-Number(y.split("-")[1].split(".")[0]));
    if (requested.length) {
      const name = requested.at(-1).replace(".request.json", ".spawn");
      spawn = readVerifiedLaunch(root, plan, digest, id, name);
    }
    if (!spawn?.owner || spawn.process_group !== true) throw fault(9, `attempted ${id} process ownership unknown; no request will be repeated`);
    const probe = probeComparisonOwner(spawn.owner, true);
    if (probe.status !== "gone") throw fault(9, `attempted ${id}: ${probe.reason}; process ownership must be verified before pending work resumes`);
  }
  return report;
}
function readVerifiedLaunch(root, plan, digest, id, name) {
  const raw = readStableFile(evidencePath(root,id,`${name}.json`), "owned process receipt", LIMIT).bytes;
  assert.equal(comparisonHash(raw), readFileSync(evidencePath(root,id,`${name}.digest`),"utf8"), "owned process digest changed");
  const value = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
  assert.equal(value.run_id,plan.run_id); assert.equal(value.plan_digest,digest); assert.equal(value.condition,id);
  return value;
}

export async function startUserComparison(output, confirmedDigest, options = {}) {
  return executeUserComparison(output, confirmedDigest, options, false);
}
export async function resumeUserComparison(output, confirmedDigest, options = {}) {
  return executeUserComparison(output, confirmedDigest, options, true);
}
async function executeUserComparison(output, confirmedDigest, { signal: externalSignal, runner = executeCodexSession, verifier = executeCodexSession } = {}, resume) {
  const { root, plan, plan_digest } = readUserComparisonPlan(output);
  assert.ok(plan.config.evidence_kind === "synthetic" ? runner !== executeCodexSession : runner === executeCodexSession,
    "injected fake runners require synthetic evidence; synthetic plans cannot use the real launcher");
  assert.ok(plan.config.evidence_kind === "synthetic" || verifier === executeCodexSession, "injected verifiers require synthetic evidence");
  assert.equal(confirmedDigest, plan_digest, "inspect and confirm the exact plan digest before start/resume");
  validateInputs(root, plan);
  const audit = inspectComparisonExecution(root, plan, plan_digest);
  if (audit.state === "state_corrupt") throw fault(10, audit.reason);
  if (["running", "ownership_unverified"].includes(audit.state)) throw fault(9, audit.reason);
  if (resume) {
    if (!audit.history?.snapshot) throw fault(10, "legacy or incomplete start has no recovery checkpoint");
    if (Date.now() < audit.history.snapshot.at_ms) throw fault(10, "execution clock moved backwards; deadline ownership unknown");
    recoveryChecks(root, plan, plan_digest, audit);
  } else {
    if (existsSync(join(root,"control/start.json"))) throw fault(9,"this run already consumed its start; use resume or a new run ID");
    for (const id of USER_CONDITIONS) validateArm(root,plan,id,true);
  }
  const context = acquireComparisonOwner(root, plan, plan_digest, resume);
  context.active_child=null;
  const controller = new AbortController(), signal = controller.signal;
  const relay = () => controller.abort();
  externalSignal?.addEventListener("abort", relay, { once: true });
  if (externalSignal?.aborted) relay();
  let timer, deadlineExpired = false, interaction = null;
  const finishTerminal = (id, value) => {
    const receipt = saveTerminal(root,plan,id,value);
    checkpointComparison(context,"terminal",{condition:id,slot:{phase:"terminal",terminal_digest:readFileSync(evidencePath(root,id,"result.digest"),"utf8")}});
    return receipt;
  };
  let stopped = false;
  try {
    if (!resume) {
      const header = serialize({ run_id:plan.run_id, plan_digest, requested_at:new Date().toISOString(),controller_pid:process.pid,
        evidence_kind:plan.config.evidence_kind,policy:plan.policy,execution_version:2 });
      saveNew(join(root,"control/start.json"),header); saveNew(join(root,"control/start.digest"),comparisonHash(header));
    }
    checkpointComparison(context,resume?"resumed":"initialized",{stop:null});
    if (resume) {
      const previous = reportUserComparison(root);
      for (const id of USER_CONDITIONS) {
        const saved=context.history.snapshot.slots[id];
        if (["pending","terminal"].includes(saved.phase)) continue;
        if (existsSync(evidencePath(root,id,"result.json"))) {
          checkpointComparison(context,"recovered_terminal",{condition:id,slot:{phase:"terminal",terminal_digest:readFileSync(evidencePath(root,id,"result.digest"),"utf8")}});
        } else {
          finishTerminal(id,{condition:id,plan_digest,state:"execution_unknown",outcome:"unknown",...readLaunchObservations(root,plan,plan_digest,id,true),
            reason:"previous attempted process is confirmed absent; its result is unknown and this condition is never repeated",
            process_completed:null,exit_code:null,metrics:{duration_ms:null,input_tokens:null,output_tokens:null,cached_tokens:null}});
        }
      }
    }
    const clockOrigin=performance.now(), wallOrigin=Date.now(), deadline=context.history.snapshot.deadline_at_ms;
    const remaining=()=>Math.max(0,Math.min(deadline-Date.now(),deadline-wallOrigin-(performance.now()-clockOrigin)));
    timer=setTimeout(()=>{deadlineExpired=true;controller.abort();},Math.max(1,Math.min(2147483647,remaining())));
    const stop=(state,reason)=>{ stopped=true;checkpointComparison(context,"stopped",{stop:{state,reason}}); };
  const sessions = new Set(reportUserComparison(root).slots.map(slot=>slot.session_id).filter(id=>typeof id === "string"));
  for (const id of USER_CONDITIONS) {
    if (context.history.snapshot.slots[id].phase !== "pending") continue;
    if (stopped) break;
    if (signal.aborted) { stop(deadlineExpired || remaining()<1 ? "timeout" : "interrupted", "comparison interrupted or overall deadline exhausted"); break; }
    if (remaining() < comparisonLimits(plan).condition_admission_reserve_ms) { stop("timeout","insufficient remaining overall time reservation for the next condition"); break; }
    const priorSlots=reportUserComparison(root).slots;
    const known=priorSlots.reduce((total,slot)=>Math.min(Number.MAX_SAFE_INTEGER,total+(slot.usage_lower_bound?.known_tokens??0)),0);
    if (plan.config.token_budget !== null && plan.config.token_budget !== undefined && known >= plan.config.token_budget) {
      stop("usage_budget_exhausted","known input/output token lower bound has reached the configured start budget"); break;
    }
    const arm = plan.arms[id];
    if (arm.capability.status === "capability_missing") {
      finishTerminal(id, { condition: id, plan_digest, state: "capability_missing", launch_requested: false, spawn_observed: false,
        process_completed: false, exit_code: null, reason: `required routes unavailable: ${arm.capability.missing.join(", ")}`,
        outcome: "unknown", metrics: { duration_ms: null, input_tokens: null, output_tokens: null, cached_tokens: null } });
      continue;
    }
    const invocation = { ...userCodexInvocation(root, plan, id), timeoutMs: Math.max(1,Math.floor(Math.min(plan.config.timeout_ms,remaining()))) };
    checkpointComparison(context,"launch_intent",{condition:id,slot:{phase:"launch_intent",attempts:1}});
    const conditionStarted = Date.now();
    saveLaunchReceipt(root, id, "request", { condition: id, run_id: plan.run_id, plan_digest, requested_at: new Date().toISOString(),
      executable: invocation.executable, argv: invocation.argv, cwd: invocation.cwd, prompt_digest: plan.input.digest,
      timeout_ms: invocation.timeoutMs, timeout_semantics:"pre-persistence ceiling; dispatch clips to the remaining overall deadline", evidence_kind: plan.config.evidence_kind });
    let value, modelDispatched=false;
    try {
      const dispatchRemaining=remaining();
      if (signal.aborted || dispatchRemaining<1) {
        value={spawnObserved:false,exitCode:null,stdout:"",stderr:"",durationMs:0,
          timedOut:dispatchRemaining<1,interrupted:signal.aborted && dispatchRemaining>=1,error:null};
      } else {
        invocation.timeoutMs=Math.floor(Math.min(plan.config.timeout_ms,dispatchRemaining));
        modelDispatched=true;
        value = await runner({ ...invocation, signal, onOutput: interactionObserver(action=>{interaction??=action;controller.abort();}), onSpawn: observed => {
          const pid = typeof observed === "number" ? observed : observed.pid;
          assert.ok(Number.isInteger(pid) && pid > 0, "spawn PID observation required");
          context.active_child="spawn";
          saveLaunchReceipt(root, id, "spawn", { condition: id, run_id: plan.run_id, plan_digest,
            evidence_kind: plan.config.evidence_kind, pid, timeout_ms:invocation.timeoutMs, observed_at: new Date().toISOString(), owner:observeComparisonProcess(pid),process_group:true });
          context.active_child="spawn";
          checkpointComparison(context,"model_running",{condition:id,slot:{phase:"model_running"}});
        } });
      }
    } catch (error) {
      value = { spawnObserved: existsSync(evidencePath(root, id, "spawn.json")) ? true : null, exitCode: null,
        error: { code: error.code ?? "RUNNER_ERROR", message: sanitizeComparisonLog(error.message) }, stdout: "", stderr: "" };
    }
    if (value.spawnObserved === true && (value.exitCode != null || value.signal != null) && !value.cleanupError) context.active_child=null;
    saveNew(evidencePath(root, id, "stdout.jsonl"), sanitizeComparisonLog(value.stdout ?? ""));
    saveNew(evidencePath(root, id, "stderr.log"), sanitizeComparisonLog(value.stderr ?? ""));
    const telemetry = parseUserCodexTelemetry(value.stdout ?? "");
    interaction ??= telemetry.interaction ?? reportedInteraction({message:value.stderr??""}) ?? reportedInteraction(value.error);
    let state = interaction ? interaction.state : deadlineExpired || remaining()<1 ? "timeout" : value.interrupted ? "interrupted" : value.timedOut ? "timeout"
      : !value.spawnObserved && ["EACCES", "EPERM"].includes(value.error?.code) ? "permission_denied"
      : !value.spawnObserved && value.error?.code === "ENOENT" ? "capability_missing"
      : value.error || value.spawnObserved !== true || value.exitCode !== 0 || value.cleanupError || value.outputLimited || telemetry.errors.length ? "runner_failed" : "completed";
    let reason = interaction?.reason ?? sanitizeComparisonLog(value.error?.message ?? value.cleanupError?.message ?? telemetry.errors[0]
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
        saveNew(evidencePath(root, id, "patch.diff"), capturePatch(root, arm, id, changed, actual));
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
          checkpointComparison(context,"verifying",{condition:id,slot:{phase:"verifying"}});
          verification = await verifyCondition(root, plan, id, signal, verifier, remaining, context);
          if (deadlineExpired || remaining()<1 || verification.checks.some(check=>check.status === "timeout")) { state="timeout";reason="overall time deadline or verification timeout exhausted"; }
          else if (verification.checks.some(check=>["EACCES","EPERM"].includes(check.runner_error?.code))) { state="permission_denied";reason="independent verification requires legitimate execution permission"; }
          else if (verification.checks.some(check=>check.runner_error || check.cleanup_error)) { state="runner_failed";reason="independent verification runner failed"; }
          else if (signal?.aborted || verification.checks.some(check => check.status === "interrupted")) { state = "interrupted"; reason = "interrupted during independent verification"; }
          else if (!verification.checks.length || verification.checks.some(check=>check.status === "unknown")) { state="indeterminate";reason="verification evidence is incomplete"; }
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
    const terminal = finishTerminal(id, { condition: id, plan_digest, state, outcome, reason,
      launch_requested: true, spawn_observed: value.spawnObserved ?? null,
      unresolved_child:context.active_child !== null, active_child_receipt:context.active_child,
      process_completed: value.spawnObserved === true && (value.exitCode != null || value.signal != null),
      exit_code: value.exitCode ?? null, signal: value.signal ?? null, completed_at: new Date().toISOString(),
      runner_error: value.error ? { code: value.error.code ?? "unknown", message: sanitizeComparisonLog(value.error.message ?? "unknown") } : null,
      cleanup_error: value.cleanupError ? { code: value.cleanupError.code ?? "unknown", message: sanitizeComparisonLog(value.cleanupError.message ?? "unknown") } : null,
      output_limited: value.outputLimited ?? false,
      session_id: telemetry.session_id, actual_model: telemetry.model, configured_model: plan.config.model,
      metrics: { duration_ms: Date.now() - conditionStarted, ...telemetry.metrics }, process_duration_ms: value.durationMs ?? null,
      process_timeout_ms:modelDispatched?invocation.timeoutMs:null,
      verification_duration_ms: verification && verification.checks.length && verification.checks.every(check => check.duration_ms !== null)
        ? verification.checks.reduce((total, check) => total + check.duration_ms, 0) : null,
      cost: null, request_count: null, usage_lower_bound:telemetry.usage_lower_bound,
      patch_ref, scope, verification, logs: ["stdout.jsonl", "stderr.log", ...(existsSync(evidencePath(root, id, "response.txt")) ? ["response.txt"] : [])] });
    if (stopsComparison(terminal.state)) stop(terminal.state,terminal.reason);
  }
    checkpointComparison(context,"invocation_ended");
    releaseComparisonOwner(context);
  } catch (error) {
    // Failed writes are left in place; inspection detects consumed intent/torn records.
    try { checkpointComparison(context,"persistence_failed",{stop:{state:"persistence_failed",reason:sanitizeComparisonLog(error.message)}}); } catch { /* preserve torn history */ }
    try { releaseComparisonOwner(context); } catch { /* torn lease stays detectable */ }
    throw Object.assign(error,{comparisonCode:error.comparisonCode??10});
  } finally {
    clearTimeout(timer); externalSignal?.removeEventListener("abort",relay);
  }
  return persistInvocationReport(reportUserComparison(root),resume?"resume":"start");
}

function readLaunchObservations(root, plan, planDigest, id, terminalExpected = false) {
  const errors = [];
  function read(name) {
    const path = evidencePath(root, id, `${name}.json`), digestPath = evidencePath(root, id, `${name}.digest`);
    if (!existsSync(path) && !existsSync(digestPath)) return undefined;
    try {
      const raw = readStableFile(path, "launch receipt", LIMIT).bytes;
      assert.equal(comparisonHash(raw), readStableFile(digestPath, "launch digest", 256).bytes.toString("utf8"));
      const value = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
      assert.equal(value.run_id, plan.run_id); assert.equal(value.plan_digest, planDigest);
      assert.equal(value.condition, id); assert.equal(value.evidence_kind, plan.config.evidence_kind);
      return value;
    } catch (error) { errors.push(`${name}: ${sanitizeComparisonLog(error.message)}`); return null; }
  }
  const request = read("request"), spawn = read("spawn");
  let requested = request === undefined ? terminalExpected ? null : false : null, spawned = null;
  if (request) {
    const invocation = userCodexInvocation(root, plan, id);
    if (request.executable === invocation.executable && same(request.argv, invocation.argv) && request.cwd === invocation.cwd
      && request.prompt_digest === plan.input.digest && Number.isSafeInteger(request.timeout_ms) && request.timeout_ms > 0 && request.timeout_ms <= invocation.timeoutMs && Number.isFinite(Date.parse(request.requested_at))) requested = true;
    else errors.push("request: invocation identity invalid");
  }
  if (spawn && Number.isInteger(spawn.pid) && spawn.pid > 0 && Number.isFinite(Date.parse(spawn.observed_at))) spawned = true;
  else if (spawn) errors.push("spawn: observation invalid");
  else if (spawn === undefined && requested === false) spawned = false;
  return { launch_requested: requested, spawn_observed: spawned,
    process_completed: requested === false && spawned === false ? false : null, exit_code: null, receipt_errors: errors };
}

export function reportUserComparison(output) {
  let loaded, headerError=null;
  try { loaded=readUserComparisonPlan(output); } catch(error) {
    loaded=readUserComparisonPlan(output,{ignoreStart:true}); headerError=sanitizeComparisonLog(error.message);
  }
  const {root,plan,plan_digest}=loaded;
  const execution=inspectComparisonExecution(root,plan,plan_digest);
  const slots = USER_CONDITIONS.map(id => {
    const result = evidencePath(root, id, "result.json");
    if (existsSync(result)) {
      try {
        const raw = readStableFile(result, "terminal receipt", LIMIT).bytes;
        assert.equal(comparisonHash(raw), readStableFile(evidencePath(root, id, "result.digest"), "terminal digest", 256).bytes.toString("utf8"));
        const value = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
        assert.equal(value.condition, id); assert.equal(value.run_id, plan.run_id); assert.equal(value.evidence_kind, plan.config.evidence_kind);
        assert.equal(value.plan_digest, plan_digest, "terminal receipt belongs to a different plan");
        assert.ok(["completed", "capability_missing", "permission_denied", "runner_failed", "timeout", "interrupted", "result_missing", "scope_violation", "verification_failed", "authentication_required", "execution_unknown", "indeterminate"].includes(value.state));
        assert.ok(["pass", "fail", "unknown"].includes(value.outcome));
        for (const [name, digest] of Object.entries(value.artifacts)) {
          assert.ok(relativeSafe(name) && !name.includes("/"));
          assert.equal(comparisonHash(readStableFile(evidencePath(root, id, name), "saved artifact", LIMIT).bytes), digest, `artifact ${name} changed or missing`);
        }
        return { ...value, receipt_integrity:"valid" };
      }
      catch (error) { return { condition: id, state: "result_missing", outcome: "unknown", receipt_integrity:"invalid",
        ...readLaunchObservations(root, plan, plan_digest, id, true),
        reason: `terminal receipt unreadable: ${sanitizeComparisonLog(error.message)}` }; }
    }
    const observations = readLaunchObservations(root, plan, plan_digest, id);
    const requested = execution.history?.snapshot?.slots[id]?.attempts === 1 || observations.launch_requested !== false || observations.spawn_observed !== false;
    return { condition: id, state: requested ? "incomplete" : "not_started", outcome: "unknown", ...observations,
      reason: requested ? "no terminal receipt; still running or interrupted, completion and usage unknown" : "no launch request saved" };
  });
  let issue=headerError ? {state:"state_corrupt",reason:headerError} : ["state_corrupt","ownership_unverified","running"].includes(execution.state) ? {state:execution.state,reason:execution.reason} : null;
  if (!issue && existsSync(join(root,"control/start.json")) && !execution.history?.snapshot) issue={state:"execution_blocked",reason:"legacy/incomplete start has no recovery checkpoint; automatic resume is unsupported"};
  if (!issue && execution.history?.snapshot) {
    for (const slot of slots) {
      const state=execution.history.snapshot.slots[slot.condition];
      if (state.phase === "terminal" && (slot.receipt_integrity !== "valid" || !existsSync(evidencePath(root,slot.condition,"result.digest"))
        || readFileSync(evidencePath(root,slot.condition,"result.digest"),"utf8") !== state.terminal_digest)) {
        issue={state:"state_corrupt",reason:`terminal ${slot.condition} checkpoint/receipt missing or changed`};break;
      }
      if (state.phase === "pending" && pendingEvidence(root,slot.condition)) {issue={state:"state_corrupt",reason:`pending ${slot.condition} contains unpublished execution evidence`};break;}
      if (!["pending","terminal"].includes(state.phase) && !existsSync(evidencePath(root,slot.condition,"result.json"))) {
        const folder=dirname(evidencePath(root,slot.condition,"spawn.json"));
        const checks=existsSync(folder)?readdirSync(folder).filter(name=>/^verification-\d+\.request\.json$/u.test(name)).sort((a,b)=>Number(a.split("-")[1].split(".")[0])-Number(b.split("-")[1].split(".")[0])):[];
        const name=checks.length?checks.at(-1).replace(".request.json",".spawn"):"spawn";
        let probe;try {const spawn=readVerifiedLaunch(root,plan,plan_digest,slot.condition,name);probe=probeComparisonOwner(spawn.owner,spawn.process_group===true);}catch {probe={status:"unknown",reason:"attempted process identity unavailable"};}
        issue={state:probe.status === "alive" ? "running" : probe.status === "gone" ? "indeterminate" : "ownership_unverified",
          reason:`attempted condition has no terminal result; ${probe.reason??"ownership unknown"}`};break;
      }
    }
  }
  const stop=execution.history?.snapshot?.stop;
  if (!issue && stop) issue=stop;
  if (!issue) {
    const failed=slots.find(slot=>slot.state!=="completed" || slot.outcome!=="pass");
    issue=failed ? {state:failed.state === "verification_failed" ? "task_failed" : ["incomplete","execution_unknown"].includes(failed.state) || failed.state === "completed" ? "indeterminate" : failed.state,reason:failed.reason}
      : {state:"completed",reason:"all three task tests and declared executable requirements passed"};
  }
  const usageSlots=slots.filter(slot=>slot.launch_requested === true);
  const usageBudget={token_budget:plan.config.token_budget??null,known_tokens_lower_bound:usageSlots.reduce((total,slot)=>Math.min(Number.MAX_SAFE_INTEGER,total+(slot.usage_lower_bound?.known_tokens??0)),0),
    complete:usageSlots.length>0&&usageSlots.every(slot=>slot.usage_lower_bound?.complete===true),unknown_count:usageSlots.filter(slot=>slot.usage_lower_bound?.complete!==true).length,policy:"unknown does not alone prevent admission; reported values are a lower bound, not a hard cap"};
  const overall={...issue,elapsed_ms:execution.history?.snapshot?Math.max(0,Date.now()-execution.history.snapshot.started_at_ms):null,exit_code:USER_COMPARISON_EXIT_CODES[issue.state]??7,required_action:issue.state === "completed" ? null : ACTION};
  const notes = { kind: "ask_pragmatic_evaluation_notes_v1", evidence_kind: existsSync(join(root, "control/start.json")) || execution.history?.snapshot || slots.some(slot=>slot.receipt_integrity) ? plan.config.evidence_kind : "plan",
    planned_blocks: [plan.run_id], global_context: { ask_presence: plan.config.global_ask_presence, change_status: "unknown" },
    next_improvement: "review this task's saved tests, requirements, changes and unknowns before choosing a new run",
    trials: slots.map(slot => ({ block_id: plan.run_id, condition: slot.condition,
      execution_state: slot.state === "not_started" || (slot.state === "capability_missing" && !slot.launch_requested) ? "not_started"
        : slot.state === "completed" ? "completed" : ["incomplete", "execution_unknown", "interrupted", "timeout"].includes(slot.state) ? "stopped" : "failed",
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
    source: plan.source, slots, execution, overall, limits:comparisonLimits(plan), usage_budget:usageBudget, configuration: plan.config, condition_differences: plan.condition_differences, unknowns: plan.unknowns,
    summary: { ...buildPragmaticEvaluationReport(notes), plain_scope: plan.arms.plain.configuration },
    limitations: ["one task is not general ASK effectiveness, operational success, or v1 completion", "global settings and read isolation are not proven",
      "configured CLI/model labels are declarations unless independently observed; missing usage/cost remain unknown", "synthetic results are development evidence only",
      "patch.diff is a credential-redacted review view and may not apply; an unchanged retained control/patch-workspaces/<condition> copy provides the full local diff"] };
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
    return { evidence_kind, summary: { ...buildPragmaticEvaluationReport(notes), plain_scope: members[0].summary.plain_scope } };
  }), mixed_evidence_pooled: false };
}

function parseOptions(argv) {
  const options = {}, flags = new Map([["--repo", "repo"], ["--commit", "commit"], ["--task", "taskFile"], ["--verification", "verificationFile"],
    ["--output", "output"], ["--cli", "cliBin"], ["--cli-version", "cliVersion"], ["--model", "model"], ["--reasoning", "reasoning"],
    ["--timeout-ms", "timeoutMs"], ["--verification-timeout-ms", "verificationTimeoutMs"], ["--overall-timeout-ms", "overallTimeoutMs"], ["--token-budget", "tokenBudget"], ["--task-class", "taskClass"],
    ["--global-ask", "globalAskPresence"], ["--rerun-of", "rerunOf"]]);
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index], value = argv[++index];
    assert.ok(value && !value.startsWith("--"), `value required for ${flag}`);
    if (flag === "--allow") (options.mutablePaths ??= []).push(value);
    else if (flag === "--global-capability") (options.globalCapabilities ??= []).push(value);
    else {
      assert.ok(flags.has(flag) && options[flags.get(flag)] === undefined, `unknown or duplicate option ${flag}`);
      options[flags.get(flag)] = (flag.includes("timeout-ms") || flag === "--token-budget") ? Number(value) : value;
    }
  }
  return options;
}

function formatReport(report) {
  const lines=[`Run: ${report.run_id}\nEvidence: ${report.evidence_kind}\nSource: ${report.source?.repo??"unknown"}@${report.source?.commit??"unknown"}\nSaved: ${report.root}`,
    `Overall: ${report.overall.state}; exit=${report.overall.exit_code}; ${report.overall.reason}`];
  for (const slot of report.slots) {
    lines.push(`${slot.condition}: ${slot.state}; quality=${slot.outcome}; request=${slot.launch_requested??"unknown"}; start=${slot.spawn_observed??"unknown"}; exit=${slot.exit_code??"unknown"}; time=${slot.metrics?.duration_ms??"unknown"}; tokens=${slot.metrics?.input_tokens??"unknown"}/${slot.metrics?.output_tokens??"unknown"}\n  ${slot.reason}`);
    for(const check of slot.verification?.checks??[]) lines.push(`  ${check.id}: test=${check.test_result}; evidence=${check.status}; exit=${check.exit_code??"unknown"}; logs=${(check.logs??[check.log]).join(",")}; view_truncated=${check.log_metadata?.view?.truncated??"unknown"}; full_log_evidence=${check.log_metadata?.full_evidence_available??"unknown"}`);
  }
  lines.push(`Condition differences:\n${(report.condition_differences??[]).map(value=>`  ${value}`).join("\n")}\nUnknowns:\n${(report.unknowns??[]).map(value=>`  ${value}`).join("\n")}`);
  if(report.limits) lines.push(`Local overall limit: ${report.limits.overall_timeout_ms} ms; elapsed=${report.overall.elapsed_ms??"unknown"}; next-condition reserve=${report.limits.condition_admission_reserve_ms} ms; includes downtime. Provider cancellation/cost caps are not guaranteed.`);
  if(report.usage_budget) lines.push(`Token admission budget: ${report.usage_budget.token_budget??"not configured"}; known lower bound=${report.usage_budget.known_tokens_lower_bound}; complete=${report.usage_budget.complete}; unknown conditions=${report.usage_budget.unknown_count}. Unknown usage is not zero.`);
  for(const block of report.summary?.blocks??[]) for(const contrast of block.contrasts) for(const difference of contrast.differences) lines.push(`  ${contrast.contrast}: ${difference.field} ${JSON.stringify(difference)}`);
  lines.push("patch.diff is a redacted review view and may not apply; retained control/patch-workspaces/<condition> contains the full local diff when captured.");
  if(report.overall.required_action) lines.push(`Required action: ${report.overall.required_action}`);
  lines.push("Unknown usage/cost are not zero. Synthetic results are development evidence only. One task does not establish general effectiveness or operational success.");
  return lines.join("\n")+"\n";
}
function persistInvocationReport(report, command) {
  const parent=join(report.root,"control/invocations");mkdirSync(parent,{recursive:true,mode:0o700});
  assert.equal(realpathSync(parent),parent,"unsafe invocation report directory");
  const id=randomUUID(),pending=join(parent,`pending-${id}`),target=join(parent,id);mkdirSync(pending,{mode:0o700});
  const value={...report,invocation:{id,command,at:new Date().toISOString(),artifacts:{result:`control/invocations/${id}/result.json`,report:`control/invocations/${id}/report.txt`,exit_code:`control/invocations/${id}/exit-code.txt`}}};
  saveNew(join(pending,"result.json"),value);saveNew(join(pending,"report.txt"),formatReport(value));saveNew(join(pending,"exit-code.txt"),`${value.overall.exit_code}\n`);
  renameSync(pending,target);const fd=openSync(parent,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
  return value;
}
function failureReport(output,error, { persist = true } = {}) {
  let report, trusted=false;
  try {report=reportUserComparison(output);trusted=true;}catch {report={kind:"ask_user_comparison_report_v1",root:resolve(output),run_id:"unknown",evidence_kind:"unknown",source:null,
    slots:USER_CONDITIONS.map(condition=>({condition,state:"incomplete",outcome:"unknown",launch_requested:null,spawn_observed:null,reason:"trusted records unavailable"})),unknowns:["plan and execution records cannot be validated"],condition_differences:[]};}
  const code=error.comparisonCode??10,state=code===9?"execution_blocked":code===10?"state_corrupt":"runner_failed";
  report={...report,overall:{state,exit_code:code,reason:sanitizeComparisonLog(error.message).slice(0,4096),required_action:ACTION}};
  if(!persist) return report;
  if(!trusted) return {...report,report_persistence:"unavailable; output has no validated comparison plan; no files written"};
  try {return persistInvocationReport(report,"refused");}catch {return {...report,report_persistence:"unavailable; inspect retained state after storage/permission repair"};}
}

/** Shared CLI dispatcher; fake injection is programmatic and synthetic-only. */
export async function runUserComparisonCommand(argv, options = {}) {
  const json=argv.includes("--json");argv=argv.filter(arg=>arg!=="--json");const [command,...args]=argv;
  try {
    if(command === "prepare") {
      const result=prepareUserComparison(parseOptions(args));console.log(json?serialize(result):`Prepared: ${result.root}\nRun: ${result.plan.run_id}\nPlan digest: ${result.plan_digest}\nNo Codex/model process started. Next: inspect this output directory.`);return 0;
    }
    if(command === "inspect") {assert.equal(args.length,1,"inspect OUTPUT");console.log(serialize(inspectUserComparison(args[0])));return 0;}
    if(["start","resume"].includes(command)) {
      assert.ok(args.length===3&&args[1]==="--confirm",`${command} OUTPUT --confirm sha256:PLAN_DIGEST`);
      const controller=new AbortController(),stop=()=>controller.abort();process.once("SIGINT",stop);process.once("SIGTERM",stop);
      const relay=()=>controller.abort();options.signal?.addEventListener("abort",relay,{once:true});if(options.signal?.aborted)relay();
      try {const report=await (command === "start"?startUserComparison:resumeUserComparison)(args[0],args[2],{...options,signal:controller.signal});
        console.log(json?serialize(report):formatReport(report));return report.overall.exit_code;
      }finally{process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);options.signal?.removeEventListener("abort",relay);}
    }
    if(command === "report") {
      assert.ok(args.length>0,"report OUTPUT [OUTPUT...]");const value=args.length===1?reportUserComparison(args[0]):aggregateUserComparisons(args);
      console.log(json||args.length>1?serialize(value):formatReport(value));return args.length===1?value.overall.exit_code:0;
    }
    throw new Error("usage: node scripts/ask-user-comparison.mjs prepare OPTIONS | inspect OUTPUT | start OUTPUT --confirm DIGEST | resume OUTPUT --confirm DIGEST | report OUTPUT [OUTPUT...] [--json]");
  }catch(error){
    if(args[0]&&["start","resume","report"].includes(command)){const report=failureReport(args[0],error,{persist:command!=="report"});console.log(json?serialize(report):formatReport(report));return report.overall.exit_code;}
    console.error(`User comparison refused: ${sanitizeComparisonLog(error.message)}`);return 10;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runUserComparisonCommand(process.argv.slice(2)).then(code=>{process.exitCode=code;},error=>{console.error(sanitizeComparisonLog(error.message));process.exitCode=10;});
}
