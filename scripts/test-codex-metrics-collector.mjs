#!/usr/bin/env node
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { collectCodexRunnerMetrics as collect, createCodexMetricsBoundary, inspectCodexMetrics, aggregateCodexMetrics, codexMetricsDigest, CODEX_METRICS_STORE } from "./codex-metrics-collector.mjs";
import { recordCodexRunnerBoundary, createRunnerMetricsBoundary } from "./codex-exec-runner.mjs";
import { mapCodexRunnerResult, validateAdapterRuntimeEvent } from "./adapter-runtime-event.mjs";
import { validateMetricsEvent } from "./execution-envelope.mjs";
import { summarize } from "./ai-metrics-summarize.mjs";
import { resolveObservabilityPath } from "./observability-paths.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(resolve(tmpdir(), "codex-metrics-fixture-"));
after(() => rmSync(temporary, { recursive: true, force: true }));
const secret = "sk-artificial-secret-never-persist";
function project(name, optIn = true) {
  const root = resolve(temporary, name);
  mkdirSync(resolve(root, ".agent-spectrum-kernel"), { recursive: true });
  if (optIn !== null) writeFileSync(resolve(root, ".agent-spectrum-kernel/codex-metrics.json"), JSON.stringify({ schema_version: "1.0.0", enabled: optIn }));
  return root;
}
function report(status = "executed", stop = "completed") {
  const value = {
    status, evidence_level: "executed", mode: "implementation", sandbox: "read-only",
    command: secret, raw_prompt: secret, failures: [secret], output_path: secret,
    execution_envelope_record: { envelope: {
      schema_version: "1.0.0",
      route: { work_mode: "実装", operating_mode: "delivery_quality", user_facing: secret, internal: { primary: "controlled-implementation" } },
      evidence_status: { checked: [secret], missing: [] },
      stop_reason: { status: stop, details: ["none", "completed"].includes(stop) ? [] : [secret], human_decision_required: [],
        stop_if: ["none", "completed"].includes(stop) ? [] : [secret] }, next_action: secret,
    } },
    execution_evidence: {
      requested_contracts: { contracts: ["controlled-implementation", "test-first-verification", secret] },
      required_gates: { evidence_level: "runtime_detected", gates: ["review-ai-quality", secret] },
      workflow_contract_application: { evidence_level: "executed", missing_evidence: [] },
    },
  };
  value.normalized_adapter_event = mapCodexRunnerResult(value, { occurredAt: "2026-10-22T00:00:00.000Z" });
  return value;
}
const boundary = (task = "fixture-task", run = "fixture-run", occurred_at = "2026-10-22T00:00:00.000Z") => ({ task_id: task, run_id: run, occurred_at, source: `source:codex-exec-runner:${codexMetricsDigest("fixture source at execution start")}` });
function capture(root, value = report(), task = boundary()) { return collect({ projectRoot: root, report: value, boundary: task }); }
function node(args, cwd = repo, input) {
  return spawnSync(process.execPath, args, { cwd, input, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}
function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("explicit opt-in only; no execution boundary and disabled collection write nothing", async () => {
  for (const optIn of [false, null]) {
    const root = project(`disabled-${optIn}`, optIn);
    assert.deepEqual(capture(root), { status: "skip", reason: "disabled" });
    assert.equal(existsSync(resolveObservabilityPath(root, CODEX_METRICS_STORE)), false);
  }
  const root = project("no-boundary");
  assert.equal((await recordCodexRunnerBoundary(report(), { projectRoot: root })).reason, "no_execution_boundary");
  assert.equal(existsSync(resolveObservabilityPath(root, CODEX_METRICS_STORE)), false);
  assert.notEqual(createCodexMetricsBoundary().run_id, createCodexMetricsBoundary().run_id);
});

test("normal, stopped and failed reports pass both types, persist, aggregate and expose identity/digest", async () => {
  const root = project("roundtrip");
  for (const [status, stop, expected] of [["executed", "completed", "completed"], ["insufficient_evidence", "blocked", "blocked"], ["execution_failed", "none", "failed"]]) {
    const result = await recordCodexRunnerBoundary(report(status, stop), { projectRoot: root, boundary: boundary(status, status), attempted: true });
    assert.equal(result.status, "recorded");
    assert.deepEqual(validateMetricsEvent(result.event), []);
    assert.deepEqual(validateAdapterRuntimeEvent(result.normalized_adapter_event), []);
    assert.equal(result.normalized_adapter_event.stop.status, expected);
    assert.equal(result.event_digest, codexMetricsDigest(result.event));
    assert.ok(result.event.evidence_references.includes(`normalized_event:${codexMetricsDigest(result.normalized_adapter_event)}`));
  }
  const inspected = inspectCodexMetrics(root);
  assert.equal(inspected.events.length, 3);
  const summary = aggregateCodexMetrics(root);
  assert.equal(summary.adapter_id, "codex");
  assert.equal(summary.report.summary.event_count, 3);
  assert.equal(summary.report.summary.tasks_reviewed, 3);
  assert.deepEqual(summary.evidence.map(item => item.event_digest), inspected.events.map(item => item.event_digest));
  assert.equal(summary.report.instruction_maturity.average_goal_clarity, null);
  assert.ok(summary.unknown.includes("cost"));
  for (const { event } of inspected.events) {
    assert.deepEqual(event.skills_used, []);
    assert.deepEqual(event.outcome_metrics, {});
    assert.equal(event.verification_metrics.commands_run, undefined);
    assert.ok(event.evidence_references.some(item => item.startsWith("source:codex-exec-runner:sha256:")));
    assert.ok(event.evidence_references.some(item => item.startsWith("run:codex:sha256:")));
  }
  assert.equal(readFileSync(resolveObservabilityPath(root, CODEX_METRICS_STORE), "utf8").includes(secret), false);
  assert.equal(JSON.stringify(capture(root, report(), boundary("sanitized", "sanitized"))).includes(secret), false);
});

test("duplicate, same-content other task, another run, and delayed boundaries stay isolated", () => {
  const root = project("isolation");
  assert.equal(capture(root).status, "recorded");
  assert.equal(capture(root).status, "unchanged");
  capture(root, report(), boundary("other-task", "fixture-run"));
  capture(root, report(), boundary("fixture-task", "another-run"));
  capture(root, report(), boundary("old-task", "old-run", "2026-10-01T00:00:00.000Z"));
  const all = inspectCodexMetrics(root).events;
  assert.equal(all.length, 4);
  assert.equal(new Set(all.map(item => item.event.event_id)).size, 4);
  assert.equal(new Set(all.map(item => item.event.task_id)).size, 3);
  assert.equal(aggregateCodexMetrics(root, { periodStart: "2026-10-22", periodEnd: "2026-10-22" }).report.summary.event_count, 3);
});

test("parallel processes use common locked recorder without lost tasks or duplicate replay", async () => {
  const root = project("parallel");
  const run = index => new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve(repo, "scripts/codex-metrics-collector.mjs"), "capture", root], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolveResult(JSON.parse(stdout)) : reject(new Error(stderr)));
    child.stdin.end(JSON.stringify({ report: report(), boundary: boundary(`task-${index % 4}`, `run-${index % 4}`) }));
  });
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => run(index)));
  assert.equal(results.filter(item => item.status === "recorded").length, 4);
  assert.equal(results.filter(item => item.status === "unchanged").length, 4);
  assert.equal(inspectCodexMetrics(root).events.length, 4);
});

test("invalid report, mismatched normalized event, boundary and config degrade without raw diagnostics", () => {
  const root = project("invalid");
  for (const invalid of [null, {}, { ...report(), status: "success" }, { ...report(), execution_evidence: {} },
    { ...report(), normalized_adapter_event: { ...report().normalized_adapter_event, stop: { status: "failed" } } }]) {
    const result = capture(root, invalid);
    assert.equal(result.status, "degraded");
    assert.equal(result.reason, "invalid_runner_report");
  }
  assert.equal(capture(root, report(), {}).reason, "missing_task_boundary");
  assert.equal(capture(root, report(), boundary("task", "run", "invalid-date")).reason, "missing_task_boundary");
  writeFileSync(resolve(root, ".agent-spectrum-kernel/codex-metrics.json"), `{${secret}`);
  assert.equal(capture(root).reason, "invalid_config");
  assert.equal(existsSync(resolveObservabilityPath(root, CODEX_METRICS_STORE)), false);
  assert.equal(readFileSync(resolveObservabilityPath(root, "ask-runtime/metrics/codex-health.json"), "utf8").includes(secret), false);
});

test("write failure cannot change runner report, exit decision or approval", async () => {
  const root = project("failure");
  const path = resolveObservabilityPath(root, CODEX_METRICS_STORE);
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(path); // Deterministic filesystem failure, also under privileged test users.
  const value = report("insufficient_evidence", "risk_gate");
  const before = structuredClone(value);
  const result = await recordCodexRunnerBoundary(value, { projectRoot: root, boundary: boundary(), attempted: true });
  assert.deepEqual(result, { status: "degraded", reason: "persistence_failed" });
  assert.deepEqual(value, before);
  const health = JSON.parse(readFileSync(resolveObservabilityPath(root, "ask-runtime/metrics/codex-health.json"), "utf8"));
  assert.equal(health.reason, "persistence_failed");
});

test("read-only task capture and stdout inspect/aggregate leave tracked tree unchanged", () => {
  const root = project("tracked");
  writeFileSync(resolve(root, "user-file.txt"), "user owned\n");
  git(root, ["init", "--quiet"]);
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  assert.equal(capture(root).status, "recorded");
  assert.ok(resolveObservabilityPath(root, CODEX_METRICS_STORE).includes("/.git/agent-spectrum-kernel/"));
  for (const command of ["inspect", "aggregate"]) {
    const result = node(["scripts/codex-metrics-collector.mjs", command, root]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).adapter_id, "codex");
  }
  assert.equal(git(root, ["status", "--porcelain"]), "");
  assert.equal(readFileSync(resolve(root, "user-file.txt"), "utf8"), "user owned\n");
  writeFileSync(resolve(root, ".agent-spectrum-kernel/codex-metrics.json"), JSON.stringify({ schema_version: "1.0.0", enabled: false }));
  assert.equal(capture(root).status, "skip");
  assert.equal(inspectCodexMetrics(root).events.length, 1, "disable retains records");
});

test("installer projects collector and common dependencies without enabling collection", async () => {
  const root = project("installed", null);
  for (const script of ["install-kernel.mjs", "install-codex-adapter.mjs"]) {
    const result = node([resolve(repo, "scripts", script), "--target", root]);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(existsSync(resolve(root, ".agent-spectrum-kernel/codex-metrics.json")), false);
  const installed = await import(pathToFileURL(resolve(root, "scripts/codex-metrics-collector.mjs")).href);
  assert.equal(installed.collectCodexRunnerMetrics({ projectRoot: root }).reason, "disabled");
  writeFileSync(resolve(root, ".agent-spectrum-kernel/codex-metrics.json"), JSON.stringify({ schema_version: "1.0.0", enabled: true }));
  assert.equal(installed.collectCodexRunnerMetrics({ projectRoot: root, report: report(), boundary: boundary() }).status, "recorded");
  assert.equal(installed.aggregateCodexMetrics(root).report.summary.event_count, 1);
  const checked = node([resolve(repo, "scripts/install-codex-adapter.mjs"), "--target", root, "--check"]);
  assert.equal(checked.status, 0, checked.stderr);
});


test("privacy projection cannot leave a completed claim without controlled contracts", () => {
  const root = project("projection-semantics");
  const value = report();
  value.execution_evidence.requested_contracts.contracts = [secret];
  value.normalized_adapter_event = mapCodexRunnerResult(value);
  const result = capture(root, value);
  assert.equal(result.status, "recorded");
  assert.deepEqual(validateAdapterRuntimeEvent(result.normalized_adapter_event), []);
  assert.equal(result.normalized_adapter_event.stop.status, "insufficient_evidence");
  assert.equal(result.normalized_adapter_event.outcome.claim_effect, "downgrade");
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("missing observations remain null in shared aggregate, including mixed adapter input", () => {
  const root = project("unknown-observations");
  const { event } = capture(root);
  const args = { periodStart: "2026-10-22", periodEnd: "2026-10-22", reportType: "custom", eventStore: CODEX_METRICS_STORE };
  for (const events of [[event], [event, { ...event, task_id: "claude-task", evidence_references: ["adapter:claude_code"], outcome_metrics: { task_completed: true } }]]) {
    const result = summarize(events, 0, args);
    for (const key of ["completed_tasks", "validation_passed", "validation_failed", "command_attempts", "verification_commands"]) assert.equal(result.summary[key], null, key);
    assert.equal(result.skill_usage.required_gate_coverage, null);
    assert.equal(result.review_quality.required_fixes_count, null);
    assert.ok(Object.values(result.debt_movement).every(value => value === null));
    assert.ok(result.observation_gaps.includes("skill_usage"));
  }
});

test("delayed capture uses frozen execution source and never rereads collector-time runner", async () => {
  const root = project("frozen-source", null);
  for (const script of ["install-kernel.mjs", "install-codex-adapter.mjs"]) assert.equal(node([resolve(repo, "scripts", script), "--target", root]).status, 0);
  const installed = await import(pathToFileURL(resolve(root, "scripts/codex-metrics-collector.mjs")).href);
  const started = installed.createCodexMetricsBoundary();
  writeFileSync(resolve(root, ".agent-spectrum-kernel/codex-metrics.json"), JSON.stringify({ schema_version: "1.0.0", enabled: true }));
  const first = installed.collectCodexRunnerMetrics({ projectRoot: root, report: report(), boundary: started });
  assert.equal(first.status, "recorded");
  writeFileSync(resolve(root, "scripts/codex-exec-runner.mjs"), "fixture source changed after execution");
  const replay = installed.collectCodexRunnerMetrics({ projectRoot: root, report: report(), boundary: started });
  assert.equal(replay.status, "unchanged");
  assert.equal(replay.event.event_id, first.event.event_id);
  assert.ok(replay.event.evidence_references.includes(started.source));
  const missing = { ...started }; delete missing.source;
  assert.equal(installed.collectCodexRunnerMetrics({ projectRoot: root, report: report(), boundary: missing }).reason, "source_unavailable");
  assert.equal(installed.inspectCodexMetrics(root).events.length, 1);
});


test("source fingerprint failure is isolated before task execution", async () => {
  const started = createRunnerMetricsBoundary({ sourcePath: resolve(temporary, "absent-source.mjs") });
  assert.equal(started.source, null);
  const value = report();
  const before = structuredClone(value);
  assert.equal((await recordCodexRunnerBoundary(value, { projectRoot: project("source-failed"), boundary: { ...started, occurred_at: boundary().occurred_at }, attempted: true })).reason, "source_unavailable");
  assert.deepEqual(value, before);
});

test("unknown Codex gate execution never becomes under-processing or adoption warning", () => {
  const { event } = capture(project("unknown-gate-warnings"));
  const args = { periodStart: "2026-10-22", periodEnd: "2026-10-22", reportType: "custom", eventStore: CODEX_METRICS_STORE };
  const unknown = summarize([event], 0, args);
  assert.deepEqual(unknown.gate_decision_summary.under_processing_warnings, []);
  assert.deepEqual(unknown.gate_decision_summary.top_gate_deviation_patterns, []);
  assert.equal(unknown.adoption_effect.weak_signal.some(value => /executed_gates|under.processing/.test(value)), false);
  const claude = { ...event, task_id: "observed-claude-task", evidence_references: ["adapter:claude_code"], routing_result: { required_gates: ["review-ai-quality"], executed_gates: [] } };
  const mixed = summarize([event, claude], 0, args);
  assert.deepEqual(mixed.gate_decision_summary.under_processing_warnings, [{ gate: "review-ai-quality", count: 1 }]);
});

test("installed runner main automatically captures opted-in fake-child terminal results", () => {
  const root = project("automatic-main");
  for (const script of ["install-kernel.mjs", "install-codex-adapter.mjs"]) assert.equal(node([resolve(repo, "scripts", script), "--target", root, ...(script === "install-codex-adapter.mjs" ? ["--profile", "full"] : [])]).status, 0);
  const resultPath = resolve(root, "fake-result.json");
  const fake = resolve(root, "fixture-child");
  writeFileSync(fake, `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi
  shift
done
cat > /dev/null
cp '${resultPath}' "$output"
`, { mode: 0o700 });
  const response = `Implementation Contract:
- Artifact ID: IMPL-METRICS-FIXTURE
- Upstream refs: Issue-386
- Actual change boundary: artificial fixture
- Verification attempted: node scripts/test-codex-metrics-collector.mjs
- Evidence references: artificial fixture
- Handoff state: review pending

Evidence:
- Implementation Contract ref: IMPL-METRICS-FIXTURE
- command: node scripts/test-codex-metrics-collector.mjs
  result: pass
`;
  writeFileSync(resultPath, JSON.stringify({ schema_version: "1.0.0", response_markdown: response, control: {
    evidence_status: { checked: ["artificial fixture"], missing: [] },
    stop_reason: { status: "completed", details: [], human_decision_required: [], stop_if: [] }, next_action: "inspect fixture",
  } }));
  const runnerArgs = [resolve(root, "scripts/codex-exec-runner.mjs"), "--target", root, "--prompt", "skill-implement.md", "--mode", "implementation", "--codex-bin", fake, "--output", ".agents/runs/metrics-fixture.md", "--json"];
  const child = node(runnerArgs, root);
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const value = JSON.parse(child.stdout);
  assert.equal(value.status, "executed");
  assert.equal(value.metrics_collection.status, "recorded");
  assert.equal(inspectCodexMetrics(root).events.length, 1);
  assert.ok(value.metrics_collection.event.evidence_references.some(item => item.startsWith("source:codex-exec-runner:sha256:")));
  const dry = node([...runnerArgs, "--dry-run"], root);
  assert.equal(JSON.parse(dry.stdout).metrics_collection.reason, "no_execution_boundary");
  assert.equal(inspectCodexMetrics(root).events.length, 1);
});
