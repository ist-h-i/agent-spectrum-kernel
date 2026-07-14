#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const baseConfig = resolve(root, "benchmarks/adaptive-portfolio.config.json");
const work = mkdtempSync(resolve(root, ".ask-benchmark-execution-test-"));

function run(args, { expectedStatus = 0, env = {} } = {}) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function recursivePaths(path) {
  const paths = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const absolute = resolve(path, entry.name);
    if (entry.isDirectory()) paths.push(...recursivePaths(absolute));
    else paths.push(absolute);
  }
  return paths;
}

function selectionInput(caseRecord, plan, bypass = false) {
  const planCase = plan.cases.find((entry) => entry.case_id === caseRecord.case_id);
  return {
    task_class: planCase.task_class,
    observed_signals: ["cross-file contract"],
    selected_mechanisms: bypass ? [] : ["repository-orientation"],
    skipped_mechanisms: bypass ? ["repository-orientation"] : ["agent-orchestration"],
    required_gates: bypass ? [] : ["test-first-verification"],
    agents: { requested: ["subagent"], omitted: ["runtime_capability_unproven"] },
    expected_evidence: ["materialization manifest revalidation"],
    capability_downgrades: [],
    lightweight_bypass: bypass ? { used: true, reason: "The observed task is a lightweight local change." } : { used: false, reason: "Observed signals require repository and verification evidence." },
    projection: {
      adapter_track: caseRecord.adapter,
      profile: caseRecord.projection_evidence.selected_profile,
      renderer_id: caseRecord.projection_evidence.renderer_id,
      renderer_version: caseRecord.projection_evidence.renderer_version,
      projection_fingerprint: caseRecord.projection_evidence.projection_fingerprint,
    },
  };
}

function runtimeConfig(adapter, availability = "available") {
  return {
    schema_version: "1.0.0",
    adapter,
    availability,
    unavailable_reason: availability === "unavailable" ? "Fixture runtime intentionally unavailable." : null,
    expected_executable_version: availability === "available" ? `fake-${adapter} 1.0.0` : null,
    model: "fixture-model",
    reasoning_effort: "low",
    case_timeout_ms: 5_000,
    sandbox_policy: "workspace-write",
    permission_policy: "fixture-isolated",
    executor: { id: `fixture-${adapter}`, version: "1.0.0" },
    environment_allowlist: ["PATH", "FAKE_EXEC_LOG", "FAKE_FAIL", "FAKE_DELAY"],
    thermal_state: "cold",
    claude_cli: adapter === "claude" && availability === "available"
      ? { help_marker: "ASK_PORTFOLIO_FAKE_CLAUDE_V1", command: ["--benchmark-output", "{output}", "--benchmark-task", "{task}"] }
      : null,
  };
}

function fakeExecutable(adapter) {
  const path = resolve(work, `fake-${adapter}`);
  writeFileSync(path, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "fake-${adapter} 1.0.0"; exit 0; fi
if [ "$1" = "--help" ]; then echo "ASK_PORTFOLIO_FAKE_CLAUDE_V1"; exit 0; fi
output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-last-message|--benchmark-output) output="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ -n "\${FAKE_DELAY:-}" ]; then sleep "$FAKE_DELAY"; fi
case_id=$(basename "$(dirname "$(dirname "$(dirname "$PWD")")")")
printf '${adapter}:%s\\n' "$case_id" >> "$FAKE_EXEC_LOG"
if [ "\${FAKE_FAIL:-}" = "1" ]; then exit 12; fi
printf '%s\\n' '{"task_type":"implementation","decision":"not_applicable","findings":[],"requirement_status":[],"verification_commands":[],"completion_claim":"not_applicable","route":null,"summary":"fixture final"}' > "$output"
`);
  chmodSync(path, 0o755);
  return path;
}

try {
  const config = JSON.parse(readFileSync(baseConfig, "utf8"));
  config.fixtures = [config.fixtures[0]];
  const configPath = resolve(work, "config.json");
  writeJson(configPath, config);
  const planPath = resolve(work, "plan.json");
  const materialized = resolve(work, "materialized");
  const selectionState = resolve(work, "selection-state");
  const logPath = resolve(work, "executions.log");
  const codexBin = fakeExecutable("codex");
  const claudeBin = fakeExecutable("claude");
  const codexRuntime = resolve(work, "codex-runtime.json");
  const claudeRuntime = resolve(work, "claude-runtime.json");
  const unavailableRuntime = resolve(work, "unavailable-runtime.json");
  writeJson(codexRuntime, runtimeConfig("codex"));
  writeJson(claudeRuntime, runtimeConfig("claude"));
  writeJson(unavailableRuntime, runtimeConfig("claude", "unavailable"));

  run(["plan", "--config", configPath, "--output", planPath, "--seed", "execution-focused-regression"]);
  run(["materialize", "--config", configPath, "--plan", planPath, "--output", materialized]);
  const materializedManifestBefore = readFileSync(resolve(materialized, "materialization-manifest.json"));
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const manifest = JSON.parse(materializedManifestBefore);
  const adaptiveCases = manifest.cases.filter((entry) => entry.condition === "adaptive_ask");
  for (const [index, entry] of adaptiveCases.entries()) {
    const input = resolve(work, `${entry.case_id}-selection.json`);
    writeJson(input, selectionInput(entry, plan, index === 0));
    run(["seal-selection", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--state-dir", selectionState, "--case-id", entry.case_id, "--input", input]);
  }

  const runDir = resolve(work, "run");
  const common = ["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", runDir];
  const env = { FAKE_EXEC_LOG: logPath };
  run(["execute-portfolio", ...common, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--max-cases", "1"], { env });
  const codexCases = plan.cases.filter((entry) => entry.adapter_track === "codex");
  assert.equal(readFileSync(logPath, "utf8").trim(), `codex:${codexCases[0].case_id}`, "plan order and max-cases must choose the first pending Codex case");
  const verifyBefore = run(["verify-execution", ...common]);
  const verifyAfter = run(["verify-execution", ...common]);
  assert.equal(verifyBefore.stdout, verifyAfter.stdout, "verification must be deterministic and read-only");
  run(["execute-portfolio", ...common, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin], { env });
  assert.equal(readFileSync(logPath, "utf8").trim().split("\n").filter((line) => line.startsWith("codex:")).length, codexCases.length, "resume must execute only pending Codex cases");
  assert.deepEqual(readFileSync(resolve(materialized, "materialization-manifest.json")), materializedManifestBefore, "execution must not mutate the materialized root");
  assert.equal(recursivePaths(runDir).some((path) => /(?:stdout|stderr|events)\.(?:txt|jsonl)$/u.test(path)), false, "raw stdout, stderr, and event streams must not be durable artifacts");

  const claudeCase = plan.cases.find((entry) => entry.adapter_track === "claude");
  run(["execute-portfolio", ...common, "--adapter", "claude", "--runtime-config", claudeRuntime, "--agent-bin", claudeBin, "--case-id", claudeCase.case_id], { env });
  assert.ok(readFileSync(logPath, "utf8").includes(`claude:${claudeCase.case_id}`), "Claude must use its separate executor track");

  const retryRun = resolve(work, "retry-run");
  const retryCase = codexCases[1];
  const retryCommon = ["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", retryRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", retryCase.case_id];
  run(["execute-portfolio", ...retryCommon], { env: { ...env, FAKE_FAIL: "1" } });
  const failedLogCount = readFileSync(logPath, "utf8").trim().split("\n").length;
  run(["execute-portfolio", ...retryCommon], { env });
  assert.equal(readFileSync(logPath, "utf8").trim().split("\n").length, failedLogCount, "failed cases must not retry implicitly");
  run(["execute-portfolio", ...retryCommon, "--retry-failed"], { env });
  assert.ok(existsSync(resolve(retryRun, "cases", retryCase.case_id, "attempts", "0002", "result.json")), "explicit retry must append a new attempt");

  const completedState = JSON.parse(readFileSync(resolve(runDir, "cases", codexCases[0].case_id, "state.json"), "utf8"));
  const completedFinal = resolve(runDir, "cases", codexCases[0].case_id, "attempts", completedState.terminal_attempt, "final.json");
  const completedBytes = readFileSync(completedFinal);
  writeFileSync(completedFinal, "{\"tampered\":true}\n");
  const corruptedVerification = run(["verify-execution", ...common]);
  assert.match(corruptedVerification.stdout, new RegExp(`"case_id": "${codexCases[0].case_id}"[\\s\\S]*?"status": "invalid"`, "u"), "corrupt completed output must not verify as completed");
  writeFileSync(completedFinal, completedBytes);

  const unavailableRun = resolve(work, "unavailable-run");
  const unavailableCase = plan.cases.find((entry) => entry.adapter_track === "claude" && entry.case_id !== claudeCase.case_id);
  const beforeUnavailable = readFileSync(logPath, "utf8");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", unavailableRun, "--adapter", "claude", "--runtime-config", unavailableRuntime, "--agent-bin", resolve(work, "missing-claude"), "--case-id", unavailableCase.case_id], { env });
  assert.equal(readFileSync(logPath, "utf8"), beforeUnavailable, "unavailable runtimes must not spawn an executable");
  assert.equal(JSON.parse(readFileSync(resolve(unavailableRun, "cases", unavailableCase.case_id, "state.json"), "utf8")).status, "unavailable");

  const claimRun = resolve(work, "claim-run");
  const claimCase = codexCases[2];
  const claimArgs = [runner, "execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", claimRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", claimCase.case_id];
  const child = spawn(process.execPath, claimArgs, { cwd: root, env: { ...process.env, ...env, FAKE_DELAY: "10" } });
  const claimFile = resolve(claimRun, "cases", claimCase.case_id, "claim", "claim.json");
  for (let index = 0; index < 100 && !existsSync(claimFile); index += 1) await wait(20);
  assert.ok(existsSync(claimFile), "first process must acquire a case claim");
  const duplicate = run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", claimRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", claimCase.case_id], { env });
  assert.match(duplicate.stdout, /active/u, "second process must observe the active claim instead of spawning");
  assert.equal(await new Promise((resolveExit) => child.on("exit", resolveExit)), 0, "claim owner must complete");

  const recoveryRun = resolve(work, "recovery-run");
  const recoveryCase = codexCases[4];
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", recoveryRun, "--adapter", "claude", "--runtime-config", unavailableRuntime, "--agent-bin", resolve(work, "missing-claude"), "--case-id", unavailableCase.case_id], { env });
  const recoveryClaim = {
    schema_version: "1.0.0",
    claim_id: "fixture-stale-claim",
    case_id: recoveryCase.case_id,
    worker_id: "fixture-worker",
    pid: 1,
    acquired_at: "2026-07-01T00:00:00.000Z",
    lease_expires_at: "2026-07-01T00:00:01.000Z",
    attempt: "0001",
    selection_digest: null,
  };
  const recoveryClaimDir = resolve(recoveryRun, "cases", recoveryCase.case_id, "claim");
  mkdirSync(recoveryClaimDir);
  writeJson(resolve(recoveryClaimDir, "claim.json"), recoveryClaim);
  run(["recover-case", "--run-dir", recoveryRun, "--case-id", recoveryCase.case_id, "--claim-id", "wrong-claim", "--reason", "fixture"], { expectedStatus: 1 });
  run(["recover-case", "--run-dir", recoveryRun, "--case-id", recoveryCase.case_id, "--claim-id", recoveryClaim.claim_id, "--reason", "fixture worker exited"]);
  assert.equal(JSON.parse(readFileSync(resolve(recoveryRun, "cases", recoveryCase.case_id, "state.json"), "utf8")).status, "interrupted", "only explicit matching stale-claim recovery may release a case");

  const sealPath = resolve(selectionState, "selections", `${adaptiveCases[0].case_id}.json`);
  const sealedBytes = readFileSync(sealPath);
  chmodSync(sealPath, 0o644);
  const tampered = JSON.parse(sealedBytes);
  tampered.task_class = "tampered";
  writeJson(sealPath, tampered);
  const beforeTamper = readFileSync(logPath, "utf8");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", resolve(work, "tampered-run"), "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", codexCases[3].case_id], { expectedStatus: 1, env });
  assert.equal(readFileSync(logPath, "utf8"), beforeTamper, "tampered Adaptive seal must fail before any spawn");
  writeFileSync(sealPath, sealedBytes);
  chmodSync(sealPath, 0o444);

  console.log("ASK benchmark execution tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
