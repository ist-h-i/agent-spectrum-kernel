#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const work = mkdtempSync(resolve(root, ".ask-benchmark-normalized-test-"));

function run(args, { expectedStatus = 0, env = {} } = {}) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fileDigest(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function snapshot(path) {
  const records = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else records.push({ path: absolute.slice(path.length + 1), bytes: readFileSync(absolute).toString("base64") });
    }
  }
  walk(path);
  return records;
}

function readGeneration(output, sourceSnapshotDigest = null) {
  const generations = resolve(output, "generations");
  const names = readdirSync(generations).sort();
  if (!sourceSnapshotDigest) assert.equal(names.length, 1, "a source snapshot digest is required when a collection contains multiple generations");
  const name = sourceSnapshotDigest ? `snapshot-${sourceSnapshotDigest.slice("sha256:".length)}` : names[0];
  assert.ok(name && names.includes(name), `normalized generation ${sourceSnapshotDigest ?? "latest"} must exist`);
  const path = resolve(generations, name);
  return { path, manifest: JSON.parse(readFileSync(resolve(path, "normalized-run.json"), "utf8")) };
}

function runtimeConfig(adapter, availability = "available") {
  return {
    schema_version: "1.1.0",
    adapter,
    availability,
    unavailable_reason: availability === "unavailable" ? "fixture_runtime_unavailable" : null,
    expected_executable_version: availability === "available" ? `fake-${adapter} 1.0.0` : null,
    model: `fixture-${adapter}-model`,
    reasoning_effort: "low",
    case_timeout_ms: 5_000,
    sandbox_policy: "workspace-write",
    permission_policy: adapter === "codex" ? "never" : "strict",
    executor: { id: `fixture-${adapter}`, version: "1.0.0" },
    environment_allowlist: ["PATH", "FAKE_MODE", "FAKE_FAIL_ONCE"],
    environment_value_allowlist: ["FAKE_MODE"],
    thermal_state: "cold",
    claude_cli: adapter === "claude" && availability === "available"
      ? {
        help_marker: "ASK_NORMALIZED_FAKE_CLAUDE_V1",
        sandbox_argument: "--sandbox",
        permission_argument: "--permission-policy",
        command: ["--benchmark-output", "{output}", "--benchmark-task", "{task}", "--sandbox", "{sandbox_policy}", "--permission-policy", "{permission_policy}"],
      }
      : null,
    command_evidence: adapter === "codex"
      ? { capture_required: true, support: "supported", event_transport: "codex_exec_jsonl", event_format_revision: "codex-exec-jsonl-v1", parser_revision: "1.0.0" }
      : { capture_required: true, support: "unsupported", event_transport: "none", event_format_revision: null, parser_revision: null },
  };
}

function fakeExecutable(adapter) {
  const path = resolve(work, `fake-${adapter}`);
  writeFileSync(path, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "fake-${adapter} 1.0.0"; exit 0; fi
if [ "$1" = "--help" ]; then echo "ASK_NORMALIZED_FAKE_CLAUDE_V1 --benchmark-output --benchmark-task --sandbox --permission-policy"; exit 0; fi
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then echo "--ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --json --model --config --sandbox --output-schema --output-last-message"; exit 0; fi
output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    exec|--ephemeral|--ignore-user-config|--ignore-rules|--skip-git-repo-check|--json|-) shift ;;
    --model|-c|--sandbox|--output-schema|--benchmark-task|--permission-policy) shift 2 ;;
    --output-last-message|--benchmark-output) output="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done
printf '%s\n' 'PRIVATE_STDOUT_MARKER'
printf '%s\n' 'PRIVATE_STDERR_MARKER' >&2
if [ "\${FAKE_MODE:-complete}" = "fail" ]; then exit 12; fi
if [ "\${FAKE_MODE:-complete}" = "fail-once" ] && [ ! -e "$FAKE_FAIL_ONCE" ]; then : > "$FAKE_FAIL_ONCE"; exit 12; fi
printf '%s\n' '{"task_type":"implementation","decision":"not_applicable","findings":[],"requirement_status":[],"verification_commands":[],"completion_claim":"not_applicable","route":null,"summary":"PRIVATE_FINAL_MARKER"}' > "$output"
`);
  chmodSync(path, 0o755);
  return path;
}

function selectionInput(entry, plan) {
  const planned = plan.cases.find((candidate) => candidate.case_id === entry.case_id);
  return {
    task_class: planned.task_class,
    observed_signals: ["normalized evidence fixture"],
    selected_mechanisms: ["repository-orientation"],
    skipped_mechanisms: ["agent-orchestration"],
    required_gates: ["test-first-verification"],
    agents: { requested: [], omitted: ["subagent_not_required"] },
    expected_evidence: ["committed execution artifacts"],
    capability_downgrades: [{ capability: "private-capability-marker", reason: "PRIVATE_DOWNGRADE_REASON" }],
    lightweight_bypass: { used: false, reason: "Observed evidence requires the selected mechanism." },
    projection: {
      adapter_track: entry.adapter,
      profile: entry.projection_evidence.selected_profile,
      renderer_id: entry.projection_evidence.renderer_id,
      renderer_version: entry.projection_evidence.renderer_version,
      projection_fingerprint: entry.projection_evidence.projection_fingerprint,
    },
  };
}

try {
  const baseConfig = JSON.parse(readFileSync(resolve(root, "benchmarks/adaptive-portfolio.config.json"), "utf8"));
  baseConfig.fixtures = [baseConfig.fixtures[0]];
  const configPath = resolve(work, "config.json");
  const planPath = resolve(work, "plan.json");
  const materialized = resolve(work, "materialized");
  const selectionState = resolve(work, "selection-state");
  writeJson(configPath, baseConfig);
  run(["plan", "--config", configPath, "--output", planPath, "--seed", "normalized-results-focused-regression"]);
  run(["materialize", "--config", configPath, "--plan", planPath, "--output", materialized]);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(materialized, "materialization-manifest.json"), "utf8"));
  for (const entry of manifest.cases.filter((candidate) => candidate.condition === "adaptive_ask")) {
    const input = resolve(work, `${entry.case_id}-selection.json`);
    writeJson(input, selectionInput(entry, plan));
    run(["seal-selection", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--case-id", entry.case_id, "--input", input]);
  }

  const codexBin = fakeExecutable("codex");
  const claudeBin = fakeExecutable("claude");
  const codexRuntime = resolve(work, "codex-runtime.json");
  const claudeRuntime = resolve(work, "claude-runtime.json");
  const unavailableRuntime = resolve(work, "claude-unavailable-runtime.json");
  writeJson(codexRuntime, runtimeConfig("codex"));
  writeJson(claudeRuntime, runtimeConfig("claude"));
  writeJson(unavailableRuntime, runtimeConfig("claude", "unavailable"));
  const caseFor = (adapter, condition, occurrence = 0) => plan.cases.filter((entry) => entry.adapter_track === adapter && entry.condition === condition)[occurrence];
  const common = (runDir, selections = selectionState) => ["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selections, "--run-dir", runDir];
  const execute = (runDir, entry, runtime, bin, env = {}, extra = [], expectedStatus = 0) => run(["execute-portfolio", ...common(runDir), "--adapter", entry.adapter_track, "--runtime-config", runtime, "--agent-bin", bin, "--case-id", entry.case_id, ...extra], { expectedStatus, env });
  const normalize = (runDir, output, selections = selectionState, options = {}) => run(["normalize-execution", ...common(runDir, selections), "--output", output], options);

  const progressionRun = resolve(work, "snapshot-progression-run");
  const progressionCase = caseFor("codex", "full_ask");
  execute(progressionRun, progressionCase, codexRuntime, codexBin, { ASK_BENCHMARK_FAULT: "after_run_initialized" }, [], 86);
  const progressionOutput = resolve(work, "normalized-snapshot-progression");
  normalize(progressionRun, progressionOutput);
  const pendingGeneration = readGeneration(progressionOutput);
  const pendingGenerationBytes = snapshot(pendingGeneration.path);
  execute(progressionRun, progressionCase, codexRuntime, codexBin, { FAKE_MODE: "complete", ASK_BENCHMARK_FAULT: "after_request_published" }, [], 86);
  normalize(progressionRun, progressionOutput);
  assert.equal(readdirSync(resolve(progressionOutput, "generations")).length, 2, "run progression must publish a distinct immutable generation");
  const activeGeneration = [...readdirSync(resolve(progressionOutput, "generations"))]
    .map((name) => ({ name, manifest: JSON.parse(readFileSync(resolve(progressionOutput, "generations", name, "normalized-run.json"), "utf8")) }))
    .find((entry) => entry.manifest.source_snapshot_digest !== pendingGeneration.manifest.source_snapshot_digest);
  assert.ok(activeGeneration, "active source snapshot generation must be addressable");
  assert.equal(pendingGeneration.manifest.inventory.length, 0, "the pending snapshot must not fabricate attempt evidence");
  assert.equal(activeGeneration.manifest.inventory.length, 0, "the request-only active snapshot must not publish an uncommitted attempt");
  assert.equal(activeGeneration.manifest.completeness.active_cases, 1, "the progressed snapshot must record the active case state");
  assert.notEqual(activeGeneration.manifest.output_root_identity, pendingGeneration.manifest.output_root_identity, "output identity must bind the source snapshot");
  assert.notEqual(activeGeneration.manifest.publication_digest, pendingGeneration.manifest.publication_digest, "publication identity must distinguish state-only progression");
  assert.notEqual(activeGeneration.manifest.normalized_run_digest, pendingGeneration.manifest.normalized_run_digest, "the manifest digest must distinguish state-only progression");
  assert.deepEqual(snapshot(pendingGeneration.path), pendingGenerationBytes, "publishing a later snapshot must not mutate the earlier generation");
  run(["verify-normalized-results", "--output", progressionOutput, "--snapshot-digest", pendingGeneration.manifest.source_snapshot_digest]);
  run(["verify-normalized-results", ...common(progressionRun), "--output", progressionOutput]);

  const completedRun = resolve(work, "completed-partial-run");
  const completedPlain = caseFor("codex", "plain");
  const completedAdaptive = caseFor("codex", "adaptive_ask");
  const completedClaude = caseFor("claude", "kernel_only");
  execute(completedRun, completedPlain, codexRuntime, codexBin, { FAKE_MODE: "complete" });
  execute(completedRun, completedAdaptive, codexRuntime, codexBin, { FAKE_MODE: "complete" });
  execute(completedRun, completedClaude, claudeRuntime, claudeBin, { FAKE_MODE: "complete" });
  const normalized = resolve(work, "normalized-completed");
  const runBefore = snapshot(completedRun);
  normalize(completedRun, normalized);
  assert.deepEqual(snapshot(completedRun), runBefore, "normalization must treat the execution run as read-only input");
  run(["verify-normalized-results", ...common(completedRun), "--output", normalized]);
  const firstPublication = snapshot(normalized);
  normalize(completedRun, normalized);
  assert.deepEqual(snapshot(normalized), firstPublication, "repeated normalization must be byte-identical and idempotent");
  const normalizedGeneration = readGeneration(normalized);
  const normalizedManifest = normalizedGeneration.manifest;
  assert.equal(normalizedManifest.completeness.partial, true, "a partially executed plan must be explicit");
  assert.equal(normalizedManifest.completeness.normalized_cases, 3, "all three terminal cases must be normalized");
  assert.equal(normalizedManifest.completeness.missing_case_ids.length, plan.cases.length - 3, "pending cases must remain visible as missing normalized cases");
  assert.deepEqual(normalizedManifest.completeness.by_adapter.map((entry) => entry.adapter), ["codex", "claude"], "adapter coverage must stay separate and deterministic");
  const normalizedText = snapshot(normalized).map((entry) => Buffer.from(entry.bytes, "base64").toString("utf8")).join("\n");
  for (const marker of ["PRIVATE_STDOUT_MARKER", "PRIVATE_STDERR_MARKER", "PRIVATE_FINAL_MARKER", "PRIVATE_DOWNGRADE_REASON"]) assert.equal(normalizedText.includes(marker), false, `${marker} must not enter normalized output`);
  const adaptiveRef = normalizedManifest.cases.find((entry) => entry.case_id === completedAdaptive.case_id).normalized_attempts[0];
  const plainRef = normalizedManifest.cases.find((entry) => entry.case_id === completedPlain.case_id).normalized_attempts[0];
  const adaptiveRecord = JSON.parse(readFileSync(resolve(normalizedGeneration.path, adaptiveRef.path), "utf8"));
  const plainRecord = JSON.parse(readFileSync(resolve(normalizedGeneration.path, plainRef.path), "utf8"));
  assert.ok(adaptiveRecord.lineage.adaptive_selection_digest, "Adaptive attempts must retain the sealed selection digest");
  assert.equal(plainRecord.lineage.adaptive_selection_digest, null, "non-Adaptive attempts must not invent a selection digest");
  assert.equal(plainRecord.telemetry.input_tokens.status, "unknown", "unreported token telemetry must be typed unknown");
  assert.equal(plainRecord.telemetry.evaluator_quality_metrics.status, "not_applicable", "pre-evaluation quality telemetry must be typed not_applicable");
  assert.equal(plainRecord.telemetry.stdout_bytes.status, "known", "committed stream evidence must be typed known");
  assert.equal(plainRecord.telemetry.harness_spawned_secondary_agent_count.value, 0, "the harness-owned secondary-agent count must retain the observed zero");
  assert.equal(plainRecord.telemetry.runtime_agent_count.status, "unknown", "unobserved runtime agent activity must not be normalized as known zero");
  assert.equal(plainRecord.telemetry.subagent_activity.status, "unknown", "unobserved subagent activity must remain unknown");
  assert.equal(plainRecord.lineage.suite, "calibration", "normalized lineage must retain the plan-owned suite without evaluator data");

  const failedRun = resolve(work, "failed-run");
  const failedCase = caseFor("codex", "kernel_only", 1);
  execute(failedRun, failedCase, codexRuntime, codexBin, { FAKE_MODE: "fail" });
  const failedOutput = resolve(work, "normalized-failed");
  normalize(failedRun, failedOutput);
  const failedGeneration = readGeneration(failedOutput);
  const failedManifest = failedGeneration.manifest;
  const failedRecord = JSON.parse(readFileSync(resolve(failedGeneration.path, failedManifest.cases.find((entry) => entry.case_id === failedCase.case_id).normalized_attempts[0].path), "utf8"));
  assert.equal(failedRecord.outcome, "failed");
  assert.equal(failedRecord.telemetry.final_output_bytes.status, "not_applicable");

  const unavailableRun = resolve(work, "unavailable-run");
  const unavailableCase = caseFor("claude", "plain", 1);
  execute(unavailableRun, unavailableCase, unavailableRuntime, resolve(work, "missing-claude"), { FAKE_MODE: "complete" });
  const unavailableOutput = resolve(work, "normalized-unavailable");
  normalize(unavailableRun, unavailableOutput);
  const unavailableGeneration = readGeneration(unavailableOutput);
  const unavailableManifest = unavailableGeneration.manifest;
  const unavailableRecord = JSON.parse(readFileSync(resolve(unavailableGeneration.path, unavailableManifest.cases.find((entry) => entry.case_id === unavailableCase.case_id).normalized_attempts[0].path), "utf8"));
  assert.equal(unavailableRecord.outcome, "unavailable");
  assert.equal(unavailableRecord.telemetry.input_tokens.status, "unavailable", "runtime absence must differ from unknown telemetry");
  assert.equal(unavailableRecord.telemetry.runtime_agent_count.status, "unavailable", "runtime agent telemetry must be unavailable when the runtime was unavailable");
  assert.equal(unavailableRecord.telemetry.subagent_activity.status, "unavailable", "subagent telemetry must be unavailable when the runtime was unavailable");
  assert.equal(unavailableRecord.telemetry.runtime_unavailable_reason_digest.status, "known", "unavailable reason evidence must retain digest/bytes without raw text");

  const interruptedRun = resolve(work, "interrupted-run");
  const interruptedCase = caseFor("codex", "full_ask", 1);
  execute(interruptedRun, interruptedCase, codexRuntime, codexBin, { FAKE_MODE: "complete", ASK_BENCHMARK_FAULT: "after_request_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" }, [], 86);
  const interruptedClaim = JSON.parse(readFileSync(resolve(interruptedRun, "cases", interruptedCase.case_id, "claim", "claim.json"), "utf8"));
  run(["recover-case", "--run-dir", interruptedRun, "--case-id", interruptedCase.case_id, "--claim-id", interruptedClaim.claim_id, "--reason", "fixture interruption recovery"]);
  const interruptedOutput = resolve(work, "normalized-interrupted");
  normalize(interruptedRun, interruptedOutput);
  const interruptedGeneration = readGeneration(interruptedOutput);
  const interruptedManifest = interruptedGeneration.manifest;
  const interruptedRecord = JSON.parse(readFileSync(resolve(interruptedGeneration.path, interruptedManifest.cases.find((entry) => entry.case_id === interruptedCase.case_id).normalized_attempts[0].path), "utf8"));
  assert.equal(interruptedRecord.outcome, "interrupted");

  const retryRun = resolve(work, "retry-run");
  const retryCase = caseFor("codex", "plain", 2);
  const failOnce = resolve(work, "failed-once-marker");
  const retryEnv = { FAKE_MODE: "fail-once", FAKE_FAIL_ONCE: failOnce };
  execute(retryRun, retryCase, codexRuntime, codexBin, retryEnv);
  execute(retryRun, retryCase, codexRuntime, codexBin, retryEnv, ["--retry-failed"]);
  const retryOutput = resolve(work, "normalized-retry");
  normalize(retryRun, retryOutput);
  const retryManifest = readGeneration(retryOutput).manifest;
  assert.deepEqual(retryManifest.cases.find((entry) => entry.case_id === retryCase.case_id).normalized_attempts.map((entry) => entry.attempt), ["0001", "0002"], "all retry attempts must retain lineage");

  const activeRetryRun = resolve(work, "active-retry-run");
  const activeRetryCase = caseFor("codex", "plain", 2);
  execute(activeRetryRun, activeRetryCase, codexRuntime, codexBin, { FAKE_MODE: "fail" });
  execute(activeRetryRun, activeRetryCase, codexRuntime, codexBin, { FAKE_MODE: "fail", ASK_BENCHMARK_FAULT: "after_request_published" }, ["--retry-failed"], 86);
  const activeRetryOutput = resolve(work, "normalized-active-retry");
  normalize(activeRetryRun, activeRetryOutput);
  const activeRetryManifest = readGeneration(activeRetryOutput).manifest;
  assert.deepEqual(activeRetryManifest.cases.find((entry) => entry.case_id === activeRetryCase.case_id).normalized_attempts.map((entry) => entry.attempt), ["0001"], "an active retry must retain every previously committed attempt without publishing the active attempt");
  assert.equal(activeRetryManifest.telemetry_coverage.find((entry) => entry.field === "duration_ms").total, 1, "active retry history must contribute to telemetry coverage");

  const invalidRun = resolve(work, "invalid-run");
  cpSync(failedRun, invalidRun, { recursive: true });
  const invalidStatePath = resolve(invalidRun, "cases", failedCase.case_id, "state.json");
  const invalidState = JSON.parse(readFileSync(invalidStatePath, "utf8"));
  const invalidAttemptRoot = resolve(invalidRun, "cases", failedCase.case_id, "attempts", invalidState.terminal_attempt);
  const invalidResultPath = resolve(invalidAttemptRoot, "result.json");
  const invalidCommitPath = resolve(invalidAttemptRoot, "commit.json");
  const invalidResult = JSON.parse(readFileSync(invalidResultPath, "utf8"));
  const copiedCommandEvidenceStat = statSync(resolve(invalidAttemptRoot, "command-evidence.json"));
  invalidResult.command_evidence.file_identity = { device: String(copiedCommandEvidenceStat.dev), inode: String(copiedCommandEvidenceStat.ino) };
  invalidResult.status = "invalid";
  invalidResult.failure_kind = "invalid_input_or_selection";
  writeJson(invalidResultPath, invalidResult);
  const invalidCommit = JSON.parse(readFileSync(invalidCommitPath, "utf8"));
  invalidCommit.status = "invalid";
  invalidCommit.result_sha256 = fileDigest(invalidResultPath);
  writeJson(invalidCommitPath, invalidCommit);
  writeJson(invalidStatePath, { ...invalidState, status: "invalid" });
  const invalidOutput = resolve(work, "normalized-invalid");
  normalize(invalidRun, invalidOutput);
  const invalidManifest = readGeneration(invalidOutput).manifest;
  assert.deepEqual(invalidManifest.completeness.invalid_case_ids, [failedCase.case_id], "valid terminal invalid evidence must be normalized without treating corruption as a score");

  const privatePathRuntime = resolve(work, "private-path-runtime.json");
  const privatePathConfig = runtimeConfig("codex");
  privatePathConfig.model = resolve(work, "private-model-path");
  writeJson(privatePathRuntime, privatePathConfig);
  const privatePathRun = resolve(work, "private-path-run");
  const privatePathCase = caseFor("codex", "kernel_only", 2);
  execute(privatePathRun, privatePathCase, privatePathRuntime, codexBin, { FAKE_MODE: "complete" });
  assert.match(normalize(privatePathRun, resolve(work, "private-path-output"), selectionState, { expectedStatus: 1 }).stderr, /absolute private path/u, "absolute private telemetry paths must fail closed before publication");
  for (const [name, privateModel] of [["unc", "\\\\server\\share\\private-model"], ["device", "\\\\?\\C:\\Users\\name\\secret"]]) {
    const runtime = resolve(work, `${name}-private-path-runtime.json`);
    const config = runtimeConfig("codex");
    config.model = privateModel;
    writeJson(runtime, config);
    const runDir = resolve(work, `${name}-private-path-run`);
    execute(runDir, privatePathCase, runtime, codexBin, { FAKE_MODE: "complete" });
    assert.match(normalize(runDir, resolve(work, `${name}-private-path-output`), selectionState, { expectedStatus: 1 }).stderr, /absolute private path/u, `${name} private telemetry paths must fail closed before publication`);
  }

  function clonedRun(source, name) {
    const target = resolve(work, name);
    cpSync(source, target, { recursive: true });
    for (const caseName of readdirSync(resolve(target, "cases"))) {
      const attemptsRoot = resolve(target, "cases", caseName, "attempts");
      for (const attempt of readdirSync(attemptsRoot)) {
        const attemptRoot = resolve(attemptsRoot, attempt);
        const commandPath = resolve(attemptRoot, "command-evidence.json");
        const resultPath = resolve(attemptRoot, "result.json");
        const commitPath = resolve(attemptRoot, "commit.json");
        if (!existsSync(commandPath) || !existsSync(resultPath) || !existsSync(commitPath)) continue;
        const commandStat = statSync(commandPath);
        const result = JSON.parse(readFileSync(resultPath, "utf8"));
        result.command_evidence.file_identity = { device: String(commandStat.dev), inode: String(commandStat.ino) };
        writeJson(resultPath, result);
        const commit = JSON.parse(readFileSync(commitPath, "utf8"));
        commit.result_sha256 = fileDigest(resultPath);
        writeJson(commitPath, commit);
      }
    }
    return target;
  }

  function expectNormalizationFailure(source, name, mutate, pattern, selections = selectionState) {
    const target = clonedRun(source, `${name}-run`);
    mutate(target);
    const result = normalize(target, resolve(work, `${name}-output`), selections, { expectedStatus: 1 });
    assert.match(result.stderr, pattern, `${name} must fail closed`);
  }

  const completedState = JSON.parse(readFileSync(resolve(completedRun, "cases", completedPlain.case_id, "state.json"), "utf8"));
  const completedAttemptRoot = (runDir, caseId = completedPlain.case_id, attempt = completedState.terminal_attempt) => resolve(runDir, "cases", caseId, "attempts", attempt);
  expectNormalizationFailure(completedRun, "request-tamper", (target) => {
    const path = resolve(completedAttemptRoot(target), "request.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.claim.worker_id = `${value.claim.worker_id}-tampered`;
    writeJson(path, value);
  }, /request.*(?:evidence|mismatch)|result evidence mismatch|terminal commit evidence/u);
  expectNormalizationFailure(completedRun, "result-tamper", (target) => {
    const path = resolve(completedAttemptRoot(target), "result.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.duration_ms += 1;
    writeJson(path, value);
  }, /terminal commit evidence mismatch/u);
  expectNormalizationFailure(completedRun, "commit-tamper", (target) => {
    const path = resolve(completedAttemptRoot(target), "commit.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.result_sha256 = `sha256:${"0".repeat(64)}`;
    writeJson(path, value);
  }, /terminal commit evidence mismatch/u);
  expectNormalizationFailure(completedRun, "final-tamper", (target) => {
    writeFileSync(resolve(completedAttemptRoot(target), "final.json"), "{\"tampered\":true}\n");
  }, /final output digest mismatch/u);
  expectNormalizationFailure(completedRun, "runtime-identity-tamper", (target) => {
    const path = resolve(target, "adapters", "codex.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.model = "tampered-model";
    writeJson(path, value);
  }, /request runtime identity mismatch/u);
  expectNormalizationFailure(completedRun, "environment-evidence-tamper", (target) => {
    const path = resolve(target, "adapters", "codex.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.environment_snapshot.digest = `sha256:${"0".repeat(64)}`;
    writeJson(path, value);
  }, /environment snapshot digest is invalid/u);
  expectNormalizationFailure(completedRun, "unexpected-file", (target) => {
    writeFileSync(resolve(completedAttemptRoot(target), "unexpected.txt"), "unmanaged\n");
  }, /terminal attempt inventory mismatch/u);
  expectNormalizationFailure(completedRun, "incomplete-staging", (target) => {
    const pending = plan.cases.find((entry) => entry.case_id !== completedPlain.case_id && entry.case_id !== completedAdaptive.case_id && entry.case_id !== completedClaude.case_id);
    mkdirSync(resolve(target, "cases", pending.case_id, ".claim-00000000-0000-4000-8000-000000000001.staging"));
  }, /case root inventory mismatch/u);

  const selectionCopy = resolve(work, "tampered-selection-state");
  cpSync(selectionState, selectionCopy, { recursive: true });
  const adaptiveSeal = resolve(selectionCopy, "selections", `${completedAdaptive.case_id}.json`);
  chmodSync(adaptiveSeal, 0o644);
  const seal = JSON.parse(readFileSync(adaptiveSeal, "utf8"));
  seal.task_class = "tampered";
  writeJson(adaptiveSeal, seal);
  const selectionFailure = normalize(completedRun, resolve(work, "selection-tamper-output"), selectionCopy, { expectedStatus: 1 });
  assert.match(selectionFailure.stderr, /selection digest is invalid|selection.*mismatch/u, "selection tamper must fail closed");

  const rollbackRun = clonedRun(retryRun, "terminal-rollback-run");
  const rollbackStatePath = resolve(rollbackRun, "cases", retryCase.case_id, "state.json");
  const rollbackState = JSON.parse(readFileSync(rollbackStatePath, "utf8"));
  writeJson(rollbackStatePath, { ...rollbackState, status: "failed", terminal_attempt: "0001" });
  assert.match(normalize(rollbackRun, resolve(work, "terminal-rollback-output"), selectionState, { expectedStatus: 1 }).stderr, /latest attempt/u);
  const missingAttemptRun = clonedRun(retryRun, "missing-attempt-run");
  rmSync(resolve(missingAttemptRun, "cases", retryCase.case_id, "attempts", "0001"), { recursive: true });
  assert.match(normalize(missingAttemptRun, resolve(work, "missing-attempt-output"), selectionState, { expectedStatus: 1 }).stderr, /attempts mismatch|attempt.*missing|request is missing/u);

  const crossRunTarget = resolve(work, "cross-run-target");
  execute(crossRunTarget, caseFor("codex", "plain", 1), codexRuntime, codexBin, { FAKE_MODE: "complete" });
  rmSync(resolve(crossRunTarget, "cases", completedPlain.case_id), { recursive: true });
  cpSync(resolve(completedRun, "cases", completedPlain.case_id), resolve(crossRunTarget, "cases", completedPlain.case_id), { recursive: true });
  assert.match(normalize(crossRunTarget, resolve(work, "cross-run-output"), selectionState, { expectedStatus: 1 }).stderr, /run instance|identity mismatch/u, "cross-run transplant must fail closed");

  const crossCaseRun = clonedRun(completedRun, "cross-case-run");
  const crossCaseTarget = caseFor("codex", "plain", 1);
  rmSync(resolve(crossCaseRun, "cases", crossCaseTarget.case_id), { recursive: true });
  cpSync(resolve(completedRun, "cases", completedPlain.case_id), resolve(crossCaseRun, "cases", crossCaseTarget.case_id), { recursive: true });
  assert.match(normalize(crossCaseRun, resolve(work, "cross-case-output"), selectionState, { expectedStatus: 1 }).stderr, /state identity mismatch|request identity mismatch/u, "cross-case transplant must fail closed");

  const crossAdapterRun = clonedRun(completedRun, "cross-adapter-run");
  const crossAdapterTarget = caseFor("claude", "plain", 2);
  rmSync(resolve(crossAdapterRun, "cases", crossAdapterTarget.case_id), { recursive: true });
  cpSync(resolve(completedRun, "cases", completedPlain.case_id), resolve(crossAdapterRun, "cases", crossAdapterTarget.case_id), { recursive: true });
  assert.match(normalize(crossAdapterRun, resolve(work, "cross-adapter-output"), selectionState, { expectedStatus: 1 }).stderr, /state identity mismatch|request identity mismatch/u, "cross-adapter transplant must fail closed");

  const unmanagedOutput = resolve(work, "unmanaged-output");
  mkdirSync(unmanagedOutput);
  writeFileSync(resolve(unmanagedOutput, "foreign.txt"), "foreign\n");
  assert.match(normalize(completedRun, unmanagedOutput, selectionState, { expectedStatus: 1 }).stderr, /non-empty unmanaged/u);
  const externalOutput = resolve(work, "external-output");
  mkdirSync(externalOutput);
  const symlinkOutput = resolve(work, "symlink-output");
  symlinkSync(externalOutput, symlinkOutput);
  assert.match(normalize(completedRun, symlinkOutput, selectionState, { expectedStatus: 1 }).stderr, /must not be a symlink/u);
  assert.match(normalize(completedRun, resolve(completedRun, "normalized-results"), selectionState, { expectedStatus: 1 }).stderr, /must not overlap/u, "output path escape into an input root must fail closed");

  const rootManifestSymlinkOutput = resolve(work, "root-manifest-symlink-output");
  cpSync(normalized, rootManifestSymlinkOutput, { recursive: true });
  const rootManifestPath = resolve(rootManifestSymlinkOutput, "normalized-results-root.json");
  const externalRootManifest = resolve(work, "external-normalized-results-root.json");
  cpSync(rootManifestPath, externalRootManifest);
  rmSync(rootManifestPath);
  symlinkSync(externalRootManifest, rootManifestPath);
  const rootManifestSymlinkPattern = /normalized result collection manifest.*symlink/u;
  assert.match(run(["verify-normalized-results", ...common(completedRun), "--output", rootManifestSymlinkOutput], { expectedStatus: 1 }).stderr, rootManifestSymlinkPattern, "current-source verification must reject a symlinked collection manifest");
  assert.match(run(["verify-normalized-results", "--output", rootManifestSymlinkOutput, "--snapshot-digest", normalizedManifest.source_snapshot_digest], { expectedStatus: 1 }).stderr, rootManifestSymlinkPattern, "snapshot verification must reject a symlinked collection manifest");
  assert.match(normalize(completedRun, rootManifestSymlinkOutput, selectionState, { expectedStatus: 1 }).stderr, rootManifestSymlinkPattern, "re-normalization must reject a symlinked collection manifest");

  const interruptedPublication = resolve(work, "interrupted-publication");
  normalize(completedRun, interruptedPublication, selectionState, { expectedStatus: 86, env: { ASK_BENCHMARK_NORMALIZE_FAULT: "after_normalized_staging_complete" } });
  assert.match(normalize(completedRun, interruptedPublication, selectionState, { expectedStatus: 1 }).stderr, /interrupted normalized publication staging/u, "abandoned staging must be detected and explicitly rejected");
  for (const name of readdirSync(work).filter((entry) => entry.startsWith(".interrupted-publication.normalized-staging-"))) rmSync(resolve(work, name), { recursive: true, force: true });

  const concurrentOutput = resolve(work, "concurrent-output");
  const concurrentArgs = (runDir) => [runner, "normalize-execution", ...common(runDir), "--output", concurrentOutput];
  const writers = [completedRun, failedRun].map((runDir) => spawn(process.execPath, concurrentArgs(runDir), { cwd: root, stdio: "ignore" }));
  const writerStatuses = await Promise.all(writers.map((child) => new Promise((resolveExit) => child.on("exit", resolveExit))));
  assert.deepEqual(writerStatuses.sort(), [0, 1], "conflicting concurrent first writers must publish exactly one source identity");

  const historical = run(["normalize-execution", "--run-dir", resolve(root, "benchmarks/results/checkpoint-b-2026-07-12.json"), "--output", resolve(work, "historical-output")], { expectedStatus: 1 });
  assert.match(historical.stderr, /historical checkpoint B result schema 1\.0\.0 is unsupported/u, "B/B2/C compatibility boundary must be explicit and deterministic");

  console.log("ASK benchmark normalized result tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
