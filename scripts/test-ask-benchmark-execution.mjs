#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { effectiveCommand } from "./ask-benchmark-execution.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";

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

function terminalInventory(runDir, caseId, attempt) {
  return readdirSync(resolve(runDir, "cases", caseId, "attempts", attempt)).sort();
}

function assertCaseStatus(common, caseId, status, message) {
  const verified = run(["verify-execution", ...common]);
  assert.match(verified.stdout, new RegExp(`"case_id": "${caseId}"[\\s\\S]*?"status": "${status}"`, "u"), message);
}

function assertSchemaInvalid(value, schemaName, message) {
  assert.ok(validateJsonSchema(value, { schemaPath: resolve(root, "benchmarks/schemas", schemaName) }).length > 0, message);
}

function ephemeralInventory() {
  return readdirSync(tmpdir()).filter((name) => name.startsWith("ask-portfolio-workspaces-")).sort();
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
    permission_policy: adapter === "codex" ? "never" : "strict",
    executor: { id: `fixture-${adapter}`, version: "1.0.0" },
    environment_allowlist: ["PATH", "FAKE_EXEC_LOG", "FAKE_FAIL", "FAKE_FAIL_ONCE", "FAKE_DELAY", "FAKE_MUTATE_EXECUTABLE", "FAKE_OVERSIZED_FINAL", "FAKE_PUBLIC_MODE"],
    environment_value_allowlist: ["FAKE_PUBLIC_MODE"],
    thermal_state: "cold",
    claude_cli: adapter === "claude" && availability === "available"
      ? {
        help_marker: "ASK_PORTFOLIO_FAKE_CLAUDE_V1",
        sandbox_argument: "--sandbox",
        permission_argument: "--permission-policy",
        command: ["--benchmark-output", "{output}", "--benchmark-task", "{task}", "--sandbox", "{sandbox_policy}", "--permission-policy", "{permission_policy}"],
      }
      : null,
  };
}

function fakeExecutable(adapter) {
  const path = resolve(work, `fake-${adapter}`);
  writeFileSync(path, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "fake-${adapter} 1.0.0"; exit 0; fi
if [ "$1" = "--help" ]; then echo "ASK_PORTFOLIO_FAKE_CLAUDE_V1 --benchmark-output --benchmark-task --sandbox --permission-policy"; exit 0; fi
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then echo "--ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --model --config --sandbox --output-schema --output-last-message"; exit 0; fi
output=""
skip_git_repo_check="0"
while [ "$#" -gt 0 ]; do
  case "$1" in
    exec|--ephemeral|--ignore-user-config|--ignore-rules|-) shift ;;
    --skip-git-repo-check) skip_git_repo_check="1"; shift ;;
    --model|-c|--sandbox|--output-schema|--benchmark-task|--permission-policy) shift 2 ;;
    --output-last-message|--benchmark-output) output="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done
if [ -z "$output" ]; then echo "missing output argument" >&2; exit 64; fi
if [ "${adapter}" = "codex" ] && [ "$skip_git_repo_check" != "1" ] && [ ! -d .git ]; then echo "not inside a trusted git repository" >&2; exit 65; fi
if [ -n "\${FAKE_DELAY:-}" ]; then sleep "$FAKE_DELAY"; fi
printf '${adapter}\\n' >> "$FAKE_EXEC_LOG"
if [ "\${FAKE_FAIL:-}" = "1" ]; then exit 12; fi
if [ -n "\${FAKE_FAIL_ONCE:-}" ] && [ ! -e "$FAKE_FAIL_ONCE" ]; then : > "$FAKE_FAIL_ONCE"; exit 12; fi
if [ "\${FAKE_OVERSIZED_FINAL:-}" = "1" ]; then dd if=/dev/zero of="$output" bs=1048577 count=1 2>/dev/null; exit 0; fi
printf '%s\\n' '{"task_type":"implementation","decision":"not_applicable","findings":[],"requirement_status":[],"verification_commands":[],"completion_claim":"not_applicable","route":null,"summary":"fixture final"}' > "$output"
if [ "\${FAKE_MUTATE_EXECUTABLE:-}" = "1" ]; then
  printf '%s\\n' '#!/bin/sh' 'exit 99' > "$0.replacement"
  chmod 755 "$0.replacement"
  mv "$0.replacement" "$0"
fi
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
  const claimRuntime = resolve(work, "claim-runtime.json");
  writeJson(codexRuntime, runtimeConfig("codex"));
  writeJson(claudeRuntime, runtimeConfig("claude"));
  writeJson(unavailableRuntime, runtimeConfig("claude", "unavailable"));
  const claimRuntimeConfig = runtimeConfig("codex");
  claimRuntimeConfig.case_timeout_ms = 60_000;
  writeJson(claimRuntime, claimRuntimeConfig);

  const checkoutLink = resolve(work, "checkout-link");
  symlinkSync(root, checkoutLink);
  const portableAtRoot = effectiveCommand(root, runtimeConfig("codex"));
  const portableAtLink = effectiveCommand(checkoutLink, runtimeConfig("codex"));
  assert.deepEqual(portableAtLink, portableAtRoot, "effective command identity must be independent of checkout location");
  assert.equal(JSON.stringify(portableAtRoot).includes(root), false, "effective command identity must not contain an absolute checkout path");
  assert.ok(portableAtRoot.argv.includes("--skip-git-repo-check"), "Codex synthetic workspaces must explicitly bypass the repository check");

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
  const env = { FAKE_EXEC_LOG: logPath, FAKE_PUBLIC_MODE: "fixture" };
  run(["execute-portfolio", ...common, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--max-cases", "1"], { env });
  const codexCases = plan.cases.filter((entry) => entry.adapter_track === "codex");
  assert.equal(readFileSync(logPath, "utf8").trim(), "codex", "max-cases must execute exactly one Codex case");
  assert.equal(JSON.parse(readFileSync(resolve(runDir, "cases", codexCases[0].case_id, "state.json"), "utf8")).status, "completed", "plan order must choose the first pending Codex case");
  const verifyBefore = run(["verify-execution", ...common]);
  const verifyAfter = run(["verify-execution", ...common]);
  assert.equal(verifyBefore.stdout, verifyAfter.stdout, "verification must be deterministic and read-only");
  run(["execute-portfolio", ...common, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin], { env });
  assert.equal(readFileSync(logPath, "utf8").trim().split("\n").filter((line) => line === "codex").length, codexCases.length, "resume must execute only pending Codex cases");
  assert.deepEqual(readFileSync(resolve(materialized, "materialization-manifest.json")), materializedManifestBefore, "execution must not mutate the materialized root");
  assert.equal(recursivePaths(runDir).some((path) => /(?:stdout|stderr|events)\.(?:txt|jsonl)$/u.test(path)), false, "raw stdout, stderr, and event streams must not be durable artifacts");
  for (const entry of codexCases) {
    const state = JSON.parse(readFileSync(resolve(runDir, "cases", entry.case_id, "state.json"), "utf8"));
    assert.deepEqual(terminalInventory(runDir, entry.case_id, state.terminal_attempt), ["commit.json", "final.json", "request.json", "result.json"], "completed attempts must contain only approved durable artifacts");
  }

  const claudeCase = plan.cases.find((entry) => entry.adapter_track === "claude");
  run(["execute-portfolio", ...common, "--adapter", "claude", "--runtime-config", claudeRuntime, "--agent-bin", claudeBin, "--case-id", claudeCase.case_id], { env });
  assert.ok(readFileSync(logPath, "utf8").includes("claude"), "Claude must use its separate executor track");

  const retryRun = resolve(work, "retry-run");
  const retryCase = codexCases[1];
  const retryCommon = ["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", retryRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", retryCase.case_id];
  const retryEnvironment = { ...env, FAKE_FAIL_ONCE: resolve(work, "retry-failed-once") };
  run(["execute-portfolio", ...retryCommon], { env: retryEnvironment });
  const failedLogCount = readFileSync(logPath, "utf8").trim().split("\n").length;
  run(["execute-portfolio", ...retryCommon], { env: retryEnvironment });
  assert.equal(readFileSync(logPath, "utf8").trim().split("\n").length, failedLogCount, "failed cases must not retry implicitly");
  run(["execute-portfolio", ...retryCommon, "--retry-failed"], { env: retryEnvironment });
  assert.ok(existsSync(resolve(retryRun, "cases", retryCase.case_id, "attempts", "0002", "result.json")), "explicit retry must append a new attempt");
  const retryStatePath = resolve(retryRun, "cases", retryCase.case_id, "state.json");
  const retryState = JSON.parse(readFileSync(retryStatePath, "utf8"));
  writeJson(retryStatePath, { ...retryState, status: "failed", terminal_attempt: "0001" });
  assertCaseStatus(["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", retryRun], retryCase.case_id, "invalid", "terminal state must not roll back behind the latest attempt");
  const beforeRolledBackRetry = readFileSync(logPath, "utf8");
  run(["execute-portfolio", ...retryCommon, "--retry-failed"], { expectedStatus: 1, env: retryEnvironment });
  assert.equal(readFileSync(logPath, "utf8"), beforeRolledBackRetry, "rolled-back terminal state must fail before spawning attempt 3");
  assert.deepEqual(readdirSync(resolve(retryRun, "cases", retryCase.case_id, "attempts")).sort(), ["0001", "0002"], "rolled-back terminal state must not allocate attempt 3");
  writeJson(retryStatePath, retryState);

  const environmentRun = resolve(work, "environment-snapshot-run");
  const environmentCommon = ["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", environmentRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin];
  run(["execute-portfolio", ...environmentCommon, "--max-cases", "1"], { env: { ...env, FAKE_DELAY: "0" } });
  const beforeEnvironmentDrift = readFileSync(logPath, "utf8");
  run(["execute-portfolio", ...environmentCommon], { expectedStatus: 1, env });
  assert.equal(readFileSync(logPath, "utf8"), beforeEnvironmentDrift, "environment changes must be rejected before another attempt spawns");
  const environmentIdentity = JSON.parse(readFileSync(resolve(environmentRun, "adapters", "codex.json"), "utf8"));
  const publicEnvironmentEntry = environmentIdentity.environment_snapshot.entries.find((entry) => entry.name === "FAKE_PUBLIC_MODE");
  const privateEnvironmentEntry = environmentIdentity.environment_snapshot.entries.find((entry) => entry.name === "FAKE_EXEC_LOG");
  assert.equal(publicEnvironmentEntry.value, "fixture", "explicitly non-secret environment values may retain a bounded value");
  assert.equal(privateEnvironmentEntry.value, null, "environment values must be secret by default");
  assert.ok(privateEnvironmentEntry.present && privateEnvironmentEntry.digest && privateEnvironmentEntry.bytes > 0, "secret environment evidence must retain presence, digest, and bytes");
  assert.equal(JSON.stringify(environmentIdentity).includes(logPath), false, "runtime identity must not retain secret environment values");
  const environmentState = JSON.parse(readFileSync(resolve(environmentRun, "cases", codexCases[0].case_id, "state.json"), "utf8"));
  const environmentRequest = JSON.parse(readFileSync(resolve(environmentRun, "cases", codexCases[0].case_id, "attempts", environmentState.terminal_attempt, "request.json"), "utf8"));
  assert.equal(environmentRequest.agent.environment_snapshot_digest, environmentIdentity.environment_snapshot.digest, "attempt request must bind the fixed environment snapshot");

  const transplantedRun = resolve(work, "cross-run-transplant-run");
  const transplantedCase = codexCases[2];
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", transplantedRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", transplantedCase.case_id], { env });
  const sourceRunIdentity = JSON.parse(readFileSync(resolve(runDir, "run-identity.json"), "utf8"));
  const targetRunIdentity = JSON.parse(readFileSync(resolve(transplantedRun, "run-identity.json"), "utf8"));
  assert.notEqual(sourceRunIdentity.run_instance_id, targetRunIdentity.run_instance_id, "independent runs must retain distinct run instance IDs");
  const transplantedCaseRoot = resolve(transplantedRun, "cases", transplantedCase.case_id);
  rmSync(transplantedCaseRoot, { recursive: true, force: true });
  cpSync(resolve(runDir, "cases", transplantedCase.case_id), transplantedCaseRoot, { recursive: true });
  assertCaseStatus(["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", transplantedRun], transplantedCase.case_id, "invalid", "a case chain transplanted from another run must be rejected");

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
  const unavailableState = JSON.parse(readFileSync(resolve(unavailableRun, "cases", unavailableCase.case_id, "state.json"), "utf8"));
  const unavailableRequest = JSON.parse(readFileSync(resolve(unavailableRun, "cases", unavailableCase.case_id, "attempts", unavailableState.terminal_attempt, "request.json"), "utf8"));
  const unavailablePlanCase = plan.cases.find((entry) => entry.case_id === unavailableCase.case_id);
  assert.notEqual(unavailableRequest.input_identity.frozen_input_digest, null, "unavailable requests must retain frozen input identity");
  assert.equal(unavailableRequest.selection === null, unavailablePlanCase.condition !== "adaptive_ask", "unavailable Adaptive requests must retain selection identity");
  assert.deepEqual(terminalInventory(unavailableRun, unavailableCase.case_id, unavailableState.terminal_attempt), ["commit.json", "request.json", "result.json"], "unavailable attempts must contain only approved durable artifacts");

  const unconfirmedCodexBin = resolve(work, "unconfirmed-codex");
  writeFileSync(unconfirmedCodexBin, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "fake-codex 1.0.0"; exit 0; fi
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then echo "--ephemeral --model --sandbox"; exit 0; fi
printf 'unexpected-spawn\\n' >> "$FAKE_EXEC_LOG"
exit 64
`);
  chmodSync(unconfirmedCodexBin, 0o755);
  const probeRun = resolve(work, "probe-unavailable-run");
  const probeCase = codexCases[3];
  const beforeProbe = readFileSync(logPath, "utf8");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", probeRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", unconfirmedCodexBin, "--case-id", probeCase.case_id], { env });
  assert.equal(readFileSync(logPath, "utf8"), beforeProbe, "failed command-contract probes must not spawn an agent attempt");
  const probeState = JSON.parse(readFileSync(resolve(probeRun, "cases", probeCase.case_id, "state.json"), "utf8"));
  assert.equal(probeState.status, "unavailable", "failed command-contract probes must record unavailable");
  const probeIdentity = JSON.parse(readFileSync(resolve(probeRun, "adapters", "codex.json"), "utf8"));
  assert.equal(probeIdentity.availability_evidence, "contract_probe_failed");

  const versionMismatchBin = resolve(work, "version-mismatch-codex");
  const versionMismatchOutput = "wrong-version\nPRIVATE_MISMATCH_DETAIL\n";
  writeFileSync(versionMismatchBin, readFileSync(codexBin, "utf8").replace('echo "fake-codex 1.0.0"', `printf '${versionMismatchOutput.replaceAll("\n", "\\n")}'`));
  chmodSync(versionMismatchBin, 0o755);
  const versionMismatchRun = resolve(work, "version-mismatch-run");
  const beforeVersionMismatch = readFileSync(logPath, "utf8");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", versionMismatchRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", versionMismatchBin, "--case-id", codexCases[3].case_id], { env });
  assert.equal(readFileSync(logPath, "utf8"), beforeVersionMismatch, "version mismatch must not spawn an agent attempt");
  const versionMismatchIdentity = JSON.parse(readFileSync(resolve(versionMismatchRun, "adapters", "codex.json"), "utf8"));
  assert.equal(versionMismatchIdentity.unavailable_reason, "runtime_contract_unconfirmed:version_mismatch", "version mismatch reason must be a stable bounded code");
  assert.equal(versionMismatchIdentity.executable.observed_version, "unconfirmed", "version mismatch must not retain raw version text");
  assert.equal(versionMismatchIdentity.executable.observed_version_bytes, Buffer.byteLength(versionMismatchOutput), "version mismatch must retain raw byte count");
  assert.equal(versionMismatchIdentity.executable.observed_version_digest, `sha256:${createHash("sha256").update(versionMismatchOutput).digest("hex")}`, "version mismatch must retain raw output digest");
  assert.equal(JSON.stringify(versionMismatchIdentity).includes("PRIVATE_MISMATCH_DETAIL"), false, "version mismatch identity must not retain private raw output");

  const noisyVersionBin = resolve(work, "noisy-version-codex");
  const noisyVersionOutput = "fake-codex 1.0.0\nPRIVATE_VERSION_DETAIL\tWITH_CONTROL\n";
  writeFileSync(noisyVersionBin, readFileSync(codexBin, "utf8").replace('echo "fake-codex 1.0.0"', `printf '${noisyVersionOutput.replaceAll("\n", "\\n").replaceAll("\t", "\\t")}'`));
  chmodSync(noisyVersionBin, 0o755);
  const noisyVersionRun = resolve(work, "noisy-version-run");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", noisyVersionRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", noisyVersionBin, "--case-id", codexCases[3].case_id], { env });
  const noisyIdentity = JSON.parse(readFileSync(resolve(noisyVersionRun, "adapters", "codex.json"), "utf8"));
  assert.equal(noisyIdentity.executable.observed_version, "fake-codex 1.0.0", "durable version metadata must retain only the confirmed normalized version");
  assert.equal(noisyIdentity.executable.observed_version_bytes, Buffer.byteLength(noisyVersionOutput), "version evidence must retain raw byte count without raw text");
  assert.equal(noisyIdentity.executable.observed_version_digest, `sha256:${createHash("sha256").update(noisyVersionOutput).digest("hex")}`, "version evidence must retain the raw output digest");
  assert.equal(JSON.stringify(noisyIdentity).includes("PRIVATE_VERSION_DETAIL"), false, "runtime identity must not retain raw version output");

  const executableSymlink = resolve(work, "codex-symlink");
  symlinkSync(codexBin, executableSymlink);
  const executableSymlinkRun = resolve(work, "executable-symlink-run");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", executableSymlinkRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", executableSymlink, "--case-id", codexCases[3].case_id], { expectedStatus: 1, env });
  assert.equal(existsSync(executableSymlinkRun), false, "agent executable symlink violations must hard fail before run artifacts are created");
  const nonRegularExecutableRun = resolve(work, "nonregular-executable-run");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", nonRegularExecutableRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", work, "--case-id", codexCases[3].case_id], { expectedStatus: 1, env });
  assert.equal(existsSync(nonRegularExecutableRun), false, "non-regular agent executables must hard fail before run artifacts are created");

  const mutatingExecutable = resolve(work, "mutating-codex");
  writeFileSync(mutatingExecutable, readFileSync(codexBin));
  chmodSync(mutatingExecutable, 0o755);
  const mutatingExecutableRun = resolve(work, "mutating-executable-run");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", mutatingExecutableRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", mutatingExecutable, "--case-id", codexCases[4].case_id], { expectedStatus: 1, env: { ...env, FAKE_MUTATE_EXECUTABLE: "1" } });
  const mutatingState = JSON.parse(readFileSync(resolve(mutatingExecutableRun, "cases", codexCases[4].case_id, "state.json"), "utf8"));
  assert.equal(mutatingState.status, "active", "post-spawn executable drift must hard fail instead of recording agent_failure");
  assert.deepEqual(readdirSync(resolve(mutatingExecutableRun, "cases", codexCases[4].case_id, "attempts", "0001")).sort(), ["request.json"], "post-spawn executable drift must not publish terminal result evidence");

  const adapterFirstWriteRun = resolve(work, "adapter-first-write-run");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", adapterFirstWriteRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", codexCases[3].case_id], { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_run_initialized" } });
  const externalAdapters = mkdtempSync(resolve(work, "external-adapters-"));
  rmSync(resolve(adapterFirstWriteRun, "adapters"), { recursive: true, force: true });
  symlinkSync(externalAdapters, resolve(adapterFirstWriteRun, "adapters"));
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", adapterFirstWriteRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", codexCases[3].case_id], { expectedStatus: 1, env });
  assert.equal(existsSync(resolve(externalAdapters, "codex.json")), false, "adapter identity first-write must not traverse a replaced adapter directory");

  const unavailableClaimRun = resolve(work, "unavailable-claim-run");
  const unavailableClaimExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", unavailableClaimRun, "--adapter", "claude", "--runtime-config", unavailableRuntime, "--agent-bin", resolve(work, "missing-claude"), "--case-id", unavailableCase.case_id];
  run(unavailableClaimExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_request_staged", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const unavailableClaimPath = resolve(unavailableClaimRun, "cases", unavailableCase.case_id, "claim", "claim.json");
  const unavailableClaim = JSON.parse(readFileSync(unavailableClaimPath, "utf8"));

  const unavailableDeletedClaimRun = resolve(work, "unavailable-deleted-claim-run");
  cpSync(unavailableClaimRun, unavailableDeletedClaimRun, { recursive: true });
  rmSync(resolve(unavailableDeletedClaimRun, "cases", unavailableCase.case_id, "claim"), { recursive: true, force: true });
  const unavailableAttemptRoot = resolve(unavailableDeletedClaimRun, "cases", unavailableCase.case_id, "attempts");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", unavailableDeletedClaimRun, "--adapter", "claude", "--runtime-config", unavailableRuntime, "--agent-bin", resolve(work, "missing-claude"), "--case-id", unavailableCase.case_id], { expectedStatus: 1, env });
  assert.deepEqual(readdirSync(unavailableAttemptRoot), ["0001"], "unavailable resume must not append an attempt after claim deletion");

  const unavailableReplacedClaimRun = resolve(work, "unavailable-replaced-claim-run");
  cpSync(unavailableClaimRun, unavailableReplacedClaimRun, { recursive: true });
  const unavailableReplacedClaimPath = resolve(unavailableReplacedClaimRun, "cases", unavailableCase.case_id, "claim", "claim.json");
  const unavailableReplacedClaim = JSON.parse(readFileSync(unavailableReplacedClaimPath, "utf8"));
  unavailableReplacedClaim.claim_id = "00000000-0000-4000-8000-000000000002";
  writeJson(unavailableReplacedClaimPath, unavailableReplacedClaim);
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", unavailableReplacedClaimRun, "--adapter", "claude", "--runtime-config", unavailableRuntime, "--agent-bin", resolve(work, "missing-claude"), "--case-id", unavailableCase.case_id], { expectedStatus: 1, env });
  assert.deepEqual(readdirSync(resolve(unavailableReplacedClaimRun, "cases", unavailableCase.case_id, "attempts")), ["0001"], "unavailable resume must not append an attempt after claim replacement");
  run(["recover-case", "--run-dir", unavailableClaimRun, "--case-id", unavailableCase.case_id, "--claim-id", unavailableClaim.claim_id, "--reason", "unavailable request staging fault"]);
  assert.deepEqual(terminalInventory(unavailableClaimRun, unavailableCase.case_id, "0001"), ["commit.json", "request.json", "result.json"], "unavailable recovery must remove request staging residue");
  const unavailablePreviousCommitPath = resolve(unavailableClaimRun, "cases", unavailableCase.case_id, "attempts", "0001", "commit.json");
  const unavailablePreviousCommit = readFileSync(unavailablePreviousCommitPath);
  run(unavailableClaimExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_claim_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const unavailableRetryClaim = JSON.parse(readFileSync(unavailableClaimPath, "utf8"));
  assert.equal(unavailableRetryClaim.attempt, "0002", "unavailable resume must publish the next attempt claim");
  run(["recover-case", "--run-dir", unavailableClaimRun, "--case-id", unavailableCase.case_id, "--claim-id", unavailableRetryClaim.claim_id, "--reason", "unavailable attempt 2 claim gap"]);
  assert.deepEqual(readFileSync(unavailablePreviousCommitPath), unavailablePreviousCommit, "unavailable attempt 2 recovery must preserve attempt 1 evidence");
  assert.deepEqual(terminalInventory(unavailableClaimRun, unavailableCase.case_id, "0002"), ["commit.json", "request.json", "result.json"], "unavailable attempt 2 recovery must close only the new attempt");

  const claimRun = resolve(work, "claim-run");
  const claimCase = codexCases[2];
  const claimArgs = [runner, "execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", claimRun, "--adapter", "codex", "--runtime-config", claimRuntime, "--agent-bin", codexBin, "--case-id", claimCase.case_id];
  const child = spawn(process.execPath, claimArgs, { cwd: root, env: { ...process.env, ...env, FAKE_DELAY: "20" } });
  const claimFile = resolve(claimRun, "cases", claimCase.case_id, "claim", "claim.json");
  for (let index = 0; index < 500 && !existsSync(claimFile); index += 1) await wait(20);
  assert.ok(existsSync(claimFile), "first process must acquire a case claim");
  const duplicate = run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", claimRun, "--adapter", "codex", "--runtime-config", claimRuntime, "--agent-bin", codexBin, "--case-id", claimCase.case_id], { env: { ...env, FAKE_DELAY: "20" } });
  assert.match(duplicate.stdout, /active/u, "second process must observe the active claim instead of spawning");
  assert.equal(await new Promise((resolveExit) => child.on("exit", resolveExit)), 0, "claim owner must complete");

  const stagingRun = resolve(work, "staging-run");
  const stagingCase = codexCases[4];
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", stagingRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", stagingCase.case_id], { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_claim_record_written", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const stagingCaseRoot = resolve(stagingRun, "cases", stagingCase.case_id);
  const stagingName = readdirSync(stagingCaseRoot).find((name) => /^\.claim-.+\.staging$/u.test(name));
  assert.ok(stagingName, "claim staging must be retained for bounded recovery after a hard stop");
  assert.equal(existsSync(resolve(stagingCaseRoot, "claim")), false, "incomplete claim staging must never be published as the active claim");
  const stagedClaimPath = resolve(stagingCaseRoot, stagingName, "claim.json");
  assert.deepEqual(readdirSync(resolve(stagingCaseRoot, stagingName)), ["claim.json"], "unpublished claim staging must contain a direct exclusive claim record without inner staging");
  const stagedClaim = JSON.parse(readFileSync(stagedClaimPath, "utf8"));
  run(["recover-case", "--run-dir", stagingRun, "--case-id", stagingCase.case_id, "--claim-id", stagedClaim.claim_id, "--reason", "staging fault"]);
  assert.equal(existsSync(resolve(stagingCaseRoot, stagingName)), false, "expired claim staging must be removable by exact claim ID");
  assert.equal(existsSync(resolve(tmpdir(), stagedClaim.workspace_parent)), false, "staged claim recovery must remove its private temporary root");
  assert.equal(readdirSync(resolve(stagingCaseRoot, "attempts")).length, 0, "staging recovery must not allocate an attempt");

  const publishedClaimRun = resolve(work, "published-claim-run");
  const publishedClaimCase = codexCases[4];
  const publishedClaimExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", publishedClaimRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", publishedClaimCase.case_id];
  run(publishedClaimExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_claim_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const publishedClaim = JSON.parse(readFileSync(resolve(publishedClaimRun, "cases", publishedClaimCase.case_id, "claim", "claim.json"), "utf8"));
  const publishedClaimState = JSON.parse(readFileSync(resolve(publishedClaimRun, "cases", publishedClaimCase.case_id, "state.json"), "utf8"));
  assert.equal(publishedClaimState.status, "pending", "claim publication fault must precede active state publication");
  run(publishedClaimExecute, { expectedStatus: 1, env });
  run(["recover-case", "--run-dir", publishedClaimRun, "--case-id", publishedClaimCase.case_id, "--claim-id", publishedClaim.claim_id, "--reason", "claim published before state"]);
  const reconciledPublishedState = JSON.parse(readFileSync(resolve(publishedClaimRun, "cases", publishedClaimCase.case_id, "state.json"), "utf8"));
  assert.equal(reconciledPublishedState.status, "interrupted", "published claim plus pending state must be explicitly recoverable");
  assert.deepEqual(terminalInventory(publishedClaimRun, publishedClaimCase.case_id, "0001"), ["commit.json", "request.json", "result.json"], "published-claim recovery must close the first attempt without staging residue");

  const failedGapRun = resolve(work, "failed-attempt-gap-run");
  const failedGapCase = codexCases[4];
  const failedGapExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", failedGapRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", failedGapCase.case_id];
  run(failedGapExecute, { env: { ...env, FAKE_FAIL: "1" } });
  const failedPreviousCommitPath = resolve(failedGapRun, "cases", failedGapCase.case_id, "attempts", "0001", "commit.json");
  const failedPreviousCommit = readFileSync(failedPreviousCommitPath);
  run([...failedGapExecute, "--retry-failed"], { expectedStatus: 86, env: { ...env, FAKE_FAIL: "1", ASK_BENCHMARK_FAULT: "after_claim_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const failedRetryClaim = JSON.parse(readFileSync(resolve(failedGapRun, "cases", failedGapCase.case_id, "claim", "claim.json"), "utf8"));
  assert.equal(failedRetryClaim.attempt, "0002", "failed retry must publish an attempt 2 claim");
  run(["recover-case", "--run-dir", failedGapRun, "--case-id", failedGapCase.case_id, "--claim-id", failedRetryClaim.claim_id, "--reason", "failed retry claim gap"]);
  assert.deepEqual(readFileSync(failedPreviousCommitPath), failedPreviousCommit, "failed retry recovery must preserve attempt 1 evidence");
  assert.deepEqual(terminalInventory(failedGapRun, failedGapCase.case_id, "0002"), ["commit.json", "request.json", "result.json"], "failed retry recovery must close only attempt 2");

  const interruptedGapRun = resolve(work, "interrupted-attempt-gap-run");
  const interruptedGapCase = codexCases[5];
  const interruptedGapExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", interruptedGapRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", interruptedGapCase.case_id];
  run(interruptedGapExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_workspace_created", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const interruptedInitialClaim = JSON.parse(readFileSync(resolve(interruptedGapRun, "cases", interruptedGapCase.case_id, "claim", "claim.json"), "utf8"));
  run(["recover-case", "--run-dir", interruptedGapRun, "--case-id", interruptedGapCase.case_id, "--claim-id", interruptedInitialClaim.claim_id, "--reason", "initial interruption"]);
  const interruptedPreviousCommitPath = resolve(interruptedGapRun, "cases", interruptedGapCase.case_id, "attempts", "0001", "commit.json");
  const interruptedPreviousCommit = readFileSync(interruptedPreviousCommitPath);
  run(interruptedGapExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_claim_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const interruptedRetryClaim = JSON.parse(readFileSync(resolve(interruptedGapRun, "cases", interruptedGapCase.case_id, "claim", "claim.json"), "utf8"));
  assert.equal(interruptedRetryClaim.attempt, "0002", "interrupted resume must publish an attempt 2 claim");
  run(["recover-case", "--run-dir", interruptedGapRun, "--case-id", interruptedGapCase.case_id, "--claim-id", interruptedRetryClaim.claim_id, "--reason", "interrupted resume claim gap"]);
  assert.deepEqual(readFileSync(interruptedPreviousCommitPath), interruptedPreviousCommit, "interrupted resume recovery must preserve attempt 1 evidence");
  assert.deepEqual(terminalInventory(interruptedGapRun, interruptedGapCase.case_id, "0002"), ["commit.json", "request.json", "result.json"], "interrupted resume recovery must close only attempt 2");

  const recoveryRun = resolve(work, "recovery-run");
  const recoveryCase = codexCases[5];
  const recoveryExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", recoveryRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", recoveryCase.case_id];
  run(recoveryExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_workspace_created", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const recoveryClaimPath = resolve(recoveryRun, "cases", recoveryCase.case_id, "claim", "claim.json");
  const recoveryClaim = JSON.parse(readFileSync(recoveryClaimPath, "utf8"));
  const abandonedWorkspace = resolve(tmpdir(), recoveryClaim.workspace_parent, recoveryClaim.workspace_token);
  assert.ok(existsSync(abandonedWorkspace), "hard interruption fixture must leave an ephemeral workspace for recovery");
  const deletedClaimRun = resolve(work, "active-claim-deleted-run");
  cpSync(recoveryRun, deletedClaimRun, { recursive: true });
  rmSync(resolve(deletedClaimRun, "cases", recoveryCase.case_id, "claim"), { recursive: true, force: true });
  const beforeDeletedClaim = readFileSync(logPath, "utf8");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", deletedClaimRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", recoveryCase.case_id], { expectedStatus: 1, env });
  assert.equal(readFileSync(logPath, "utf8"), beforeDeletedClaim, "an active state with a deleted claim must fail closed before spawn");
  assert.deepEqual(readdirSync(resolve(deletedClaimRun, "cases", recoveryCase.case_id, "attempts")), ["0001"], "deleted active claims must not allocate a new attempt");

  const replacedClaimRun = resolve(work, "active-claim-replaced-run");
  cpSync(recoveryRun, replacedClaimRun, { recursive: true });
  const replacedClaimPath = resolve(replacedClaimRun, "cases", recoveryCase.case_id, "claim", "claim.json");
  const replacedClaim = JSON.parse(readFileSync(replacedClaimPath, "utf8"));
  replacedClaim.claim_id = "00000000-0000-4000-8000-000000000001";
  writeJson(replacedClaimPath, replacedClaim);
  const beforeReplacedClaim = readFileSync(logPath, "utf8");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", replacedClaimRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", recoveryCase.case_id], { expectedStatus: 1, env });
  assert.equal(readFileSync(logPath, "utf8"), beforeReplacedClaim, "a replaced active claim must fail closed before spawn");
  assert.deepEqual(readdirSync(resolve(replacedClaimRun, "cases", recoveryCase.case_id, "attempts")), ["0001"], "replaced active claims must not allocate a new attempt");

  run(["recover-case", "--run-dir", recoveryRun, "--case-id", recoveryCase.case_id, "--claim-id", "wrong-claim", "--reason", "fixture"], { expectedStatus: 1 });
  const rawRecoveryReason = `fixture\nworker\texited ${"x".repeat(240)}`;
  run(["recover-case", "--run-dir", recoveryRun, "--case-id", recoveryCase.case_id, "--claim-id", recoveryClaim.claim_id, "--reason", rawRecoveryReason]);
  run(["recover-case", "--run-dir", recoveryRun, "--case-id", recoveryCase.case_id, "--claim-id", recoveryClaim.claim_id, "--reason", "idempotency check"]);
  const recoveryState = JSON.parse(readFileSync(resolve(recoveryRun, "cases", recoveryCase.case_id, "state.json"), "utf8"));
  const recoveryResult = JSON.parse(readFileSync(resolve(recoveryRun, "cases", recoveryCase.case_id, "attempts", "0001", "result.json"), "utf8"));
  assert.equal(recoveryResult.failure_kind, "stale_claim_recovered", "recovery failure kind must not embed operator text");
  assert.ok(recoveryResult.recovery_reason.value.length <= 160 && !/[\u0000-\u001f\u007f-\u009f]/u.test(recoveryResult.recovery_reason.value), "durable recovery reason must be bounded and control-free");
  assert.equal(recoveryResult.recovery_reason.bytes, Buffer.byteLength(rawRecoveryReason), "recovery reason evidence must retain raw byte count");
  assert.equal(recoveryResult.recovery_reason.digest, `sha256:${createHash("sha256").update(rawRecoveryReason).digest("hex")}`, "recovery reason evidence must retain the raw digest");
  assert.equal(JSON.stringify(recoveryResult).includes(rawRecoveryReason), false, "recovery result must not retain the raw operator reason");
  assert.equal(recoveryState.status, "interrupted", "only explicit matching stale-claim recovery may release a case");
  assert.equal(recoveryState.attempt_count, 1, "recovery replay must not append attempts");
  assert.equal(existsSync(abandonedWorkspace), false, "stale recovery must delete the abandoned ephemeral workspace");
  assert.deepEqual(terminalInventory(recoveryRun, recoveryCase.case_id, recoveryState.terminal_attempt), ["commit.json", "request.json", "result.json"], "interrupted recovery must retain only approved durable artifacts");
  run(recoveryExecute, { env });
  const resumedState = JSON.parse(readFileSync(resolve(recoveryRun, "cases", recoveryCase.case_id, "state.json"), "utf8"));
  assert.equal(resumedState.status, "completed", "interrupted recovery must resume with a new attempt");
  assert.equal(resumedState.attempt_count, 2, "interrupted recovery resume must append exactly one attempt");
  run(["recover-case", "--run-dir", recoveryRun, "--case-id", "../outside", "--claim-id", recoveryClaim.claim_id, "--reason", "traversal"], { expectedStatus: 1 });
  run(["recover-case", "--run-dir", recoveryRun, "--case-id", recoveryCase.case_id, "--claim-id", "../outside", "--reason", "traversal"], { expectedStatus: 1 });

  const symlinkWorkspaceRun = resolve(work, "symlink-workspace-run");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", symlinkWorkspaceRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", recoveryCase.case_id], { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_workspace_created", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const symlinkClaim = JSON.parse(readFileSync(resolve(symlinkWorkspaceRun, "cases", recoveryCase.case_id, "claim", "claim.json"), "utf8"));
  const symlinkWorkspace = resolve(tmpdir(), symlinkClaim.workspace_parent, symlinkClaim.workspace_token);
  rmSync(symlinkWorkspace, { recursive: true, force: true });
  const symlinkSentinel = mkdtempSync(resolve(work, "ephemeral-sentinel-"));
  const sentinelFile = resolve(symlinkSentinel, "keep.txt");
  writeFileSync(sentinelFile, "keep\n");
  symlinkSync(symlinkSentinel, symlinkWorkspace);
  run(["recover-case", "--run-dir", symlinkWorkspaceRun, "--case-id", recoveryCase.case_id, "--claim-id", symlinkClaim.claim_id, "--reason", "symlink boundary"], { expectedStatus: 1 });
  assert.equal(readFileSync(sentinelFile, "utf8"), "keep\n", "ephemeral symlink recovery must not delete the symlink target");
  rmSync(symlinkWorkspace, { force: true });
  run(["recover-case", "--run-dir", symlinkWorkspaceRun, "--case-id", recoveryCase.case_id, "--claim-id", symlinkClaim.claim_id, "--reason", "symlink removed"]);

  const ownershipCase = codexCases[6];
  const ownershipRunA = resolve(work, "workspace-ownership-a-run");
  const ownershipRunB = resolve(work, "workspace-ownership-b-run");
  const ownershipExecute = (runPath) => ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", runPath, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", ownershipCase.case_id];
  run(ownershipExecute(ownershipRunA), { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_workspace_created", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  run(ownershipExecute(ownershipRunB), { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_workspace_created", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const ownershipClaimPathA = resolve(ownershipRunA, "cases", ownershipCase.case_id, "claim", "claim.json");
  const ownershipClaimA = JSON.parse(readFileSync(ownershipClaimPathA, "utf8"));
  const ownershipClaimB = JSON.parse(readFileSync(resolve(ownershipRunB, "cases", ownershipCase.case_id, "claim", "claim.json"), "utf8"));
  const ownershipIdentityA = JSON.parse(readFileSync(resolve(ownershipRunA, "run-identity.json"), "utf8"));
  const ownershipIdentityB = JSON.parse(readFileSync(resolve(ownershipRunB, "run-identity.json"), "utf8"));
  assert.notEqual(ownershipIdentityA.run_instance_id, ownershipIdentityB.run_instance_id, "independent runs must have distinct workspace ownership identities");
  assert.ok(existsSync(resolve(tmpdir(), ownershipClaimA.workspace_parent, "ownership.json")), "claim acquisition must publish a private workspace ownership marker");
  assert.ok(existsSync(resolve(tmpdir(), ownershipClaimB.workspace_parent, "ownership.json")), "each private workspace must have its own ownership marker");
  const ownershipSentinelB = resolve(tmpdir(), ownershipClaimB.workspace_parent, ownershipClaimB.workspace_token, "keep.txt");
  writeFileSync(ownershipSentinelB, "keep\n");
  writeJson(ownershipClaimPathA, { ...ownershipClaimA, workspace_parent: ownershipClaimB.workspace_parent, workspace_token: ownershipClaimB.workspace_token });
  run(["recover-case", "--run-dir", ownershipRunA, "--case-id", ownershipCase.case_id, "--claim-id", ownershipClaimA.claim_id, "--reason", "cross run tamper"], { expectedStatus: 1 });
  assert.equal(readFileSync(ownershipSentinelB, "utf8"), "keep\n", "tampered claim cleanup must not delete another run's workspace");
  assert.equal(JSON.parse(readFileSync(resolve(ownershipRunA, "cases", ownershipCase.case_id, "state.json"), "utf8")).status, "active", "workspace ownership mismatch must fail before recovery state changes");
  writeJson(ownershipClaimPathA, ownershipClaimA);
  run(["recover-case", "--run-dir", ownershipRunA, "--case-id", ownershipCase.case_id, "--claim-id", ownershipClaimA.claim_id, "--reason", "restore owner a"]);
  run(["recover-case", "--run-dir", ownershipRunB, "--case-id", ownershipCase.case_id, "--claim-id", ownershipClaimB.claim_id, "--reason", "restore owner b"]);

  const resultFaultRun = resolve(work, "result-fault-run");
  const resultFaultCase = codexCases[6];
  const resultFaultExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", resultFaultRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", resultFaultCase.case_id];
  run(resultFaultExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_result_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const resultFaultClaim = JSON.parse(readFileSync(resolve(resultFaultRun, "cases", resultFaultCase.case_id, "claim", "claim.json"), "utf8"));
  const resultFaultPath = resolve(resultFaultRun, "cases", resultFaultCase.case_id, "attempts", resultFaultClaim.attempt, "result.json");
  const resultFaultBytes = readFileSync(resultFaultPath);
  rmSync(resolve(tmpdir(), resultFaultClaim.workspace_parent), { recursive: true, force: true });
  run(["recover-case", "--run-dir", resultFaultRun, "--case-id", resultFaultCase.case_id, "--claim-id", resultFaultClaim.claim_id, "--reason", "result boundary fault"]);
  run(["recover-case", "--run-dir", resultFaultRun, "--case-id", resultFaultCase.case_id, "--claim-id", resultFaultClaim.claim_id, "--reason", "idempotency check"]);
  assert.deepEqual(readFileSync(resultFaultPath), resultFaultBytes, "recovery must not overwrite a valid terminal result");
  assertCaseStatus(["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", resultFaultRun], resultFaultCase.case_id, "completed", "result-before-state recovery must reconcile to completed");

  const finalFaultRun = resolve(work, "final-fault-run");
  const finalFaultCase = codexCases[11];
  const finalFaultExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", finalFaultRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", finalFaultCase.case_id];
  run(finalFaultExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_final_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const finalFaultClaim = JSON.parse(readFileSync(resolve(finalFaultRun, "cases", finalFaultCase.case_id, "claim", "claim.json"), "utf8"));
  assert.ok(existsSync(resolve(finalFaultRun, "cases", finalFaultCase.case_id, "attempts", finalFaultClaim.attempt, "final.json")), "final boundary fixture must publish approved final before stopping");
  rmSync(resolve(tmpdir(), finalFaultClaim.workspace_parent), { recursive: true, force: true });
  rmSync(resolve(finalFaultRun, "cases", finalFaultCase.case_id, "claim"), { recursive: true, force: true });
  run(["recover-case", "--run-dir", finalFaultRun, "--case-id", finalFaultCase.case_id, "--claim-id", finalFaultClaim.claim_id, "--reason", "final boundary fault"]);
  assertCaseStatus(["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", finalFaultRun], finalFaultCase.case_id, "completed", "final-before-commit recovery must reconcile to completed");

  const atomicFaults = [
    { faultName: "after_request_staged", expectedStatus: "interrupted", removeTemp: true, suffix: "lost-temp" },
    { faultName: "after_pending_result_staged", expectedStatus: "interrupted", removeTemp: true, suffix: "lost-temp" },
    { faultName: "after_final_staged", expectedStatus: "interrupted", removeTemp: false, suffix: "retained-temp" },
    { faultName: "after_final_staged", expectedStatus: "interrupted", removeTemp: true, suffix: "lost-temp" },
    { faultName: "after_commit_staged", expectedStatus: "completed", removeTemp: true, suffix: "lost-temp" },
  ];
  for (const { faultName, expectedStatus, removeTemp, suffix } of atomicFaults) {
    const atomicRun = resolve(work, `${faultName}-${suffix}-run`);
    const atomicCase = codexCases[10];
    const atomicExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", atomicRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", atomicCase.case_id];
    run(atomicExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: faultName, ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
    const atomicClaim = JSON.parse(readFileSync(resolve(atomicRun, "cases", atomicCase.case_id, "claim", "claim.json"), "utf8"));
    const atomicAttemptRoot = resolve(atomicRun, "cases", atomicCase.case_id, "attempts", atomicClaim.attempt);
    assert.ok(readdirSync(atomicAttemptRoot).some((name) => name.endsWith(".staging")), `${faultName} must reproduce an orphan atomic staging artifact`);
    if (removeTemp) rmSync(resolve(tmpdir(), atomicClaim.workspace_parent), { recursive: true, force: true });
    run(["recover-case", "--run-dir", atomicRun, "--case-id", atomicCase.case_id, "--claim-id", atomicClaim.claim_id, "--reason", `${faultName} recovery`]);
    assert.equal(existsSync(resolve(tmpdir(), atomicClaim.workspace_parent)), false, `${faultName} recovery must remove its private temporary root`);
    const atomicState = JSON.parse(readFileSync(resolve(atomicRun, "cases", atomicCase.case_id, "state.json"), "utf8"));
    assert.equal(atomicState.status, expectedStatus, `${faultName} recovery must publish the expected terminal state`);
    const expectedInventory = expectedStatus === "completed" ? ["commit.json", "final.json", "request.json", "result.json"] : ["commit.json", "request.json", "result.json"];
    assert.deepEqual(terminalInventory(atomicRun, atomicCase.case_id, atomicClaim.attempt), expectedInventory, `${faultName} recovery must remove all atomic staging residue`);
  }

  const stateFaultRun = resolve(work, "state-fault-run");
  const stateFaultCase = codexCases[7];
  const stateFaultExecute = ["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", stateFaultRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", stateFaultCase.case_id];
  run(stateFaultExecute, { expectedStatus: 86, env: { ...env, ASK_BENCHMARK_FAULT: "after_state_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" } });
  const stateFaultClaim = JSON.parse(readFileSync(resolve(stateFaultRun, "cases", stateFaultCase.case_id, "claim", "claim.json"), "utf8"));
  assert.equal(JSON.parse(readFileSync(resolve(stateFaultRun, "cases", stateFaultCase.case_id, "state.json"), "utf8")).status, "completed", "state boundary fixture must publish state before stopping");
  run(["recover-case", "--run-dir", stateFaultRun, "--case-id", stateFaultCase.case_id, "--claim-id", stateFaultClaim.claim_id, "--reason", "state boundary fault"]);
  assert.equal(existsSync(resolve(stateFaultRun, "cases", stateFaultCase.case_id, "claim")), false, "state-before-release recovery must remove the exact stale claim");

  const cleanupBaseline = ephemeralInventory();
  const failureRun = resolve(work, "failure-cleanup-run");
  const failureCase = codexCases[8];
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", failureRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", failureCase.case_id], { env: { ...env, FAKE_FAIL: "1" } });
  assert.deepEqual(ephemeralInventory(), cleanupBaseline, "agent failure must clean its ephemeral workspace");
  const failureState = JSON.parse(readFileSync(resolve(failureRun, "cases", failureCase.case_id, "state.json"), "utf8"));
  assert.deepEqual(terminalInventory(failureRun, failureCase.case_id, failureState.terminal_attempt), ["commit.json", "request.json", "result.json"], "failed attempts must retain only approved durable artifacts");

  const oversizedRun = resolve(work, "oversized-final-run");
  const oversizedCase = codexCases[9];
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", oversizedRun, "--adapter", "codex", "--runtime-config", codexRuntime, "--agent-bin", codexBin, "--case-id", oversizedCase.case_id], { env: { ...env, FAKE_OVERSIZED_FINAL: "1" } });
  assert.deepEqual(ephemeralInventory(), cleanupBaseline, "oversized final failure must clean its private temporary workspace");
  const oversizedState = JSON.parse(readFileSync(resolve(oversizedRun, "cases", oversizedCase.case_id, "state.json"), "utf8"));
  const oversizedAttemptRoot = resolve(oversizedRun, "cases", oversizedCase.case_id, "attempts", oversizedState.terminal_attempt);
  const oversizedResult = JSON.parse(readFileSync(resolve(oversizedAttemptRoot, "result.json"), "utf8"));
  assert.equal(oversizedState.status, "failed", "oversized final output must not be completed");
  assert.equal(oversizedResult.failure_kind, "agent_failure", "oversized final output must close as an agent failure");
  assert.deepEqual(readdirSync(oversizedAttemptRoot).sort(), ["commit.json", "request.json", "result.json"], "oversized final failure must leave no final or staging artifact");

  const timeoutRuntime = resolve(work, "timeout-runtime.json");
  const timeoutConfig = runtimeConfig("codex");
  timeoutConfig.case_timeout_ms = 20;
  writeJson(timeoutRuntime, timeoutConfig);
  const timeoutRun = resolve(work, "timeout-cleanup-run");
  const timeoutCase = codexCases[9];
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", timeoutRun, "--adapter", "codex", "--runtime-config", timeoutRuntime, "--agent-bin", codexBin, "--case-id", timeoutCase.case_id], { env: { ...env, FAKE_DELAY: "1" } });
  assert.deepEqual(ephemeralInventory(), cleanupBaseline, "timeout must clean its ephemeral workspace");
  const timeoutState = JSON.parse(readFileSync(resolve(timeoutRun, "cases", timeoutCase.case_id, "state.json"), "utf8"));
  assert.equal(JSON.parse(readFileSync(resolve(timeoutRun, "cases", timeoutCase.case_id, "attempts", timeoutState.terminal_attempt, "result.json"), "utf8")).failure_kind, "timeout", "timeout must be a closed failed terminal result");

  function cloneRun(source, name) {
    const target = resolve(work, name);
    cpSync(source, target, { recursive: true });
    return { target, common: ["--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", target] };
  }

  const runIdentityChanged = cloneRun(runDir, "run-identity-changed-run");
  const changedRunIdentityPath = resolve(runIdentityChanged.target, "run-identity.json");
  const changedRunIdentity = JSON.parse(readFileSync(changedRunIdentityPath, "utf8"));
  changedRunIdentity.run_instance_id = "00000000-0000-4000-8000-000000000001";
  writeJson(changedRunIdentityPath, changedRunIdentity);
  assertCaseStatus(runIdentityChanged.common, codexCases[0].case_id, "invalid", "changing a valid run instance UUID must invalidate existing attempt evidence");

  const requestDeleted = cloneRun(runDir, "request-deleted-run");
  rmSync(resolve(requestDeleted.target, "cases", codexCases[0].case_id, "attempts", "0001", "request.json"));
  assertCaseStatus(requestDeleted.common, codexCases[0].case_id, "invalid", "deleted request must invalidate terminal evidence");

  const requestReplaced = cloneRun(runDir, "request-replaced-run");
  cpSync(resolve(requestReplaced.target, "cases", codexCases[1].case_id, "attempts", "0001", "request.json"), resolve(requestReplaced.target, "cases", codexCases[0].case_id, "attempts", "0001", "request.json"));
  assertCaseStatus(requestReplaced.common, codexCases[0].case_id, "invalid", "cross-case request replacement must invalidate terminal evidence");

  const resultDeleted = cloneRun(runDir, "result-deleted-run");
  rmSync(resolve(resultDeleted.target, "cases", codexCases[0].case_id, "attempts", "0001", "result.json"));
  assertCaseStatus(resultDeleted.common, codexCases[0].case_id, "invalid", "deleted completed result must invalidate terminal evidence");

  const resultReplaced = cloneRun(runDir, "result-replaced-run");
  cpSync(resolve(resultReplaced.target, "cases", codexCases[1].case_id, "attempts", "0001", "result.json"), resolve(resultReplaced.target, "cases", codexCases[0].case_id, "attempts", "0001", "result.json"));
  assertCaseStatus(resultReplaced.common, codexCases[0].case_id, "invalid", "cross-case result replacement must invalidate terminal evidence");

  const crossAdapter = cloneRun(runDir, "cross-adapter-result-run");
  cpSync(resolve(crossAdapter.target, "cases", claudeCase.case_id, "attempts", "0001", "result.json"), resolve(crossAdapter.target, "cases", codexCases[0].case_id, "attempts", "0001", "result.json"));
  assertCaseStatus(crossAdapter.common, codexCases[0].case_id, "invalid", "cross-adapter result replacement must invalidate terminal evidence");

  const adaptiveCodexCase = codexCases.find((entry) => entry.condition === "adaptive_ask");
  const stateSelectionChanged = cloneRun(runDir, "state-selection-changed-run");
  const changedStatePath = resolve(stateSelectionChanged.target, "cases", adaptiveCodexCase.case_id, "state.json");
  const changedState = JSON.parse(readFileSync(changedStatePath, "utf8"));
  changedState.selection_digest = "0".repeat(64);
  writeJson(changedStatePath, changedState);
  assertCaseStatus(stateSelectionChanged.common, adaptiveCodexCase.case_id, "invalid", "state selection digest changes must invalidate terminal evidence");

  const requestSelectionChanged = cloneRun(runDir, "request-selection-changed-run");
  const changedRequestPath = resolve(requestSelectionChanged.target, "cases", adaptiveCodexCase.case_id, "attempts", "0001", "request.json");
  const changedRequest = JSON.parse(readFileSync(changedRequestPath, "utf8"));
  changedRequest.selection.digest = "0".repeat(64);
  writeJson(changedRequestPath, changedRequest);
  assertCaseStatus(requestSelectionChanged.common, adaptiveCodexCase.case_id, "invalid", "request selection digest changes must invalidate terminal evidence");

  const terminalAttemptChanged = cloneRun(runDir, "terminal-attempt-changed-run");
  const terminalStatePath = resolve(terminalAttemptChanged.target, "cases", codexCases[0].case_id, "state.json");
  const terminalState = JSON.parse(readFileSync(terminalStatePath, "utf8"));
  terminalState.terminal_attempt = "0002";
  writeJson(terminalStatePath, terminalState);
  assertCaseStatus(terminalAttemptChanged.common, codexCases[0].case_id, "invalid", "terminal attempt substitution must invalidate terminal evidence");

  const failedResultDeleted = cloneRun(failureRun, "failed-result-deleted-run");
  rmSync(resolve(failedResultDeleted.target, "cases", failureCase.case_id, "attempts", "0001", "result.json"));
  assertCaseStatus(failedResultDeleted.common, failureCase.case_id, "invalid", "missing failed result must invalidate terminal evidence");

  const unavailableResultDeleted = cloneRun(unavailableRun, "unavailable-result-deleted-run");
  rmSync(resolve(unavailableResultDeleted.target, "cases", unavailableCase.case_id, "attempts", "0001", "result.json"));
  assertCaseStatus(unavailableResultDeleted.common, unavailableCase.case_id, "invalid", "missing unavailable result must invalidate terminal evidence");

  const identityDeleted = cloneRun(runDir, "identity-deleted-run");
  rmSync(resolve(identityDeleted.target, "adapters", "codex.json"));
  assertCaseStatus(identityDeleted.common, codexCases[0].case_id, "invalid", "missing adapter identity must invalidate terminal evidence");

  const identityReplaced = cloneRun(runDir, "identity-replaced-run");
  const identityPath = resolve(identityReplaced.target, "adapters", "codex.json");
  const replacedIdentity = JSON.parse(readFileSync(identityPath, "utf8"));
  replacedIdentity.model = "replacement-model";
  writeJson(identityPath, replacedIdentity);
  assertCaseStatus(identityReplaced.common, codexCases[0].case_id, "invalid", "replaced adapter identity must invalidate terminal evidence");

  const identitySymlink = cloneRun(runDir, "identity-symlink-run");
  const identitySymlinkPath = resolve(identitySymlink.target, "adapters", "codex.json");
  const externalIdentityPath = resolve(work, "external-codex-identity.json");
  cpSync(identitySymlinkPath, externalIdentityPath);
  rmSync(identitySymlinkPath);
  symlinkSync(externalIdentityPath, identitySymlinkPath);
  assertCaseStatus(identitySymlink.common, codexCases[0].case_id, "invalid", "adapter identity symlinks must be rejected");

  const attemptSymlink = cloneRun(runDir, "attempt-symlink-run");
  const attemptSymlinkPath = resolve(attemptSymlink.target, "cases", codexCases[0].case_id, "attempts", "0001");
  const externalAttemptPath = resolve(work, "external-attempt");
  renameSync(attemptSymlinkPath, externalAttemptPath);
  symlinkSync(externalAttemptPath, attemptSymlinkPath);
  assertCaseStatus(attemptSymlink.common, codexCases[0].case_id, "invalid", "attempt directory symlinks must be rejected");

  const alternateCodexRuntime = resolve(work, "alternate-codex-runtime.json");
  const alternateCodexConfig = runtimeConfig("codex");
  alternateCodexConfig.model = "alternate-model";
  writeJson(alternateCodexRuntime, alternateCodexConfig);
  const identityRecreate = cloneRun(failureRun, "identity-recreate-run");
  rmSync(resolve(identityRecreate.target, "adapters", "codex.json"));
  const beforeIdentityRecreate = readFileSync(logPath, "utf8");
  run(["execute-portfolio", ...identityRecreate.common, "--adapter", "codex", "--runtime-config", alternateCodexRuntime, "--agent-bin", codexBin, "--case-id", failureCase.case_id, "--retry-failed"], { expectedStatus: 1, env });
  assert.equal(existsSync(resolve(identityRecreate.target, "adapters", "codex.json")), false, "deleted adapter identity must not be replaced after attempts exist");
  assert.equal(readFileSync(logPath, "utf8"), beforeIdentityRecreate, "identity replacement refusal must happen before spawn");

  const conflictRun = resolve(work, "identity-conflict-run");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", conflictRun, "--adapter", "claude", "--runtime-config", unavailableRuntime, "--agent-bin", resolve(work, "missing-claude"), "--case-id", unavailableCase.case_id], { env });
  const conflictRuntimeA = resolve(work, "conflict-runtime-a.json");
  const conflictRuntimeB = resolve(work, "conflict-runtime-b.json");
  const conflictConfigA = runtimeConfig("codex");
  const conflictConfigB = runtimeConfig("codex");
  conflictConfigA.model = "conflict-model-a";
  conflictConfigB.model = "conflict-model-b";
  writeJson(conflictRuntimeA, conflictConfigA);
  writeJson(conflictRuntimeB, conflictConfigB);
  const conflictCase = codexCases[10];
  const conflictBase = [runner, "execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", conflictRun, "--adapter", "codex", "--agent-bin", codexBin, "--case-id", conflictCase.case_id];
  const beforeConflictCount = readFileSync(logPath, "utf8").trim().split("\n").filter((line) => line === "codex").length;
  const conflictA = spawn(process.execPath, [...conflictBase, "--runtime-config", conflictRuntimeA], { cwd: root, env: { ...process.env, ...env, FAKE_DELAY: "1" } });
  const conflictB = spawn(process.execPath, [...conflictBase, "--runtime-config", conflictRuntimeB], { cwd: root, env: { ...process.env, ...env, FAKE_DELAY: "1" } });
  const conflictStatuses = await Promise.all([conflictA, conflictB].map((childProcess) => new Promise((resolveExit) => childProcess.on("exit", resolveExit))));
  assert.deepEqual(conflictStatuses.sort(), [0, 1], "conflicting adapter identities must have exactly one atomic first writer");
  const afterConflictCount = readFileSync(logPath, "utf8").trim().split("\n").filter((line) => line === "codex").length;
  assert.equal(afterConflictCount - beforeConflictCount, 1, "conflicting identity loser must be rejected before spawn");

  const badPolicyRuntime = resolve(work, "bad-policy-runtime.json");
  const badPolicyConfig = runtimeConfig("claude");
  badPolicyConfig.claude_cli.command = [...badPolicyConfig.claude_cli.command, "--arbitrary-command"];
  writeJson(badPolicyRuntime, badPolicyConfig);
  const beforeBadPolicy = readFileSync(logPath, "utf8");
  run(["execute-portfolio", "--config", configPath, "--plan", planPath, "--materialized", materialized, "--selection-state", selectionState, "--run-dir", resolve(work, "bad-policy-run"), "--adapter", "claude", "--runtime-config", badPolicyRuntime, "--agent-bin", claudeBin, "--case-id", claudeCase.case_id], { expectedStatus: 1, env });
  assert.equal(readFileSync(logPath, "utf8"), beforeBadPolicy, "unconfirmed effective command flags must be rejected before spawn");

  const codexIdentity = JSON.parse(readFileSync(resolve(runDir, "adapters", "codex.json"), "utf8"));
  assert.ok(codexIdentity.effective_command.argv.includes('approval_policy="never"'), "Codex permission policy must be part of the effective command identity");
  assert.ok(codexIdentity.effective_command.argv.includes("--skip-git-repo-check"), "Codex runtime identity must record the synthetic-workspace repository bypass");
  assert.equal(codexIdentity.effective_command.argv[codexIdentity.effective_command.argv.indexOf("--output-schema") + 1], "{output_schema}", "Codex identity must retain a portable output schema reference");
  assert.equal(JSON.stringify(codexIdentity).includes(root), false, "runtime identity must not disclose the checkout path");
  assertSchemaInvalid({ ...codexIdentity, executable: { ...codexIdentity.executable, observed_version: "fake-codex 1.0.0\nprivate" } }, "portfolio-adapter-identity.schema.json", "adapter identity must reject control characters in durable version metadata");
  assertSchemaInvalid({ ...codexIdentity, unavailable_reason: "x".repeat(161) }, "portfolio-adapter-identity.schema.json", "adapter identity must bound unavailable reasons");

  const invalidRuntimeScalar = runtimeConfig("codex");
  invalidRuntimeScalar.expected_executable_version = "x".repeat(161);
  assertSchemaInvalid(invalidRuntimeScalar, "portfolio-runtime-config.schema.json", "runtime config must bound expected executable versions");

  const validTerminalState = JSON.parse(readFileSync(resolve(runDir, "cases", codexCases[0].case_id, "state.json"), "utf8"));
  assertSchemaInvalid({ ...validTerminalState, status: "pending", attempt_count: 1, active_claim_id: null, terminal_attempt: null }, "portfolio-case-state.schema.json", "pending state conditionals must reject nonzero attempts");
  assertSchemaInvalid({ ...validTerminalState, status: "active", active_claim_id: null, terminal_attempt: null }, "portfolio-case-state.schema.json", "active state conditionals must require a bound claim");
  assertSchemaInvalid({ ...validTerminalState, terminal_attempt: null }, "portfolio-case-state.schema.json", "terminal state conditionals must require a terminal attempt");
  assertSchemaInvalid({ ...sourceRunIdentity, run_instance_id: "not-a-uuid" }, "portfolio-run-identity.schema.json", "run identity schema must enforce UUID format");
  assertSchemaInvalid({ ...recoveryClaim, claim_id: "not-a-uuid" }, "portfolio-claim.schema.json", "claim schema must enforce UUID format");

  const adaptiveRequest = JSON.parse(readFileSync(resolve(runDir, "cases", adaptiveCodexCase.case_id, "attempts", "0001", "request.json"), "utf8"));
  assertSchemaInvalid({ ...adaptiveRequest, selection: null }, "portfolio-attempt-request.schema.json", "adaptive requests must require selection evidence");
  const nonAdaptiveCase = codexCases.find((entry) => entry.condition !== "adaptive_ask");
  const nonAdaptiveRequest = JSON.parse(readFileSync(resolve(runDir, "cases", nonAdaptiveCase.case_id, "attempts", "0001", "request.json"), "utf8"));
  assertSchemaInvalid({ ...nonAdaptiveRequest, selection: adaptiveRequest.selection }, "portfolio-attempt-request.schema.json", "non-adaptive requests must reject selection evidence");
  const completedAttemptRoot = resolve(runDir, "cases", codexCases[0].case_id, "attempts", "0001");
  const completedRequest = JSON.parse(readFileSync(resolve(completedAttemptRoot, "request.json"), "utf8"));
  const completedResult = JSON.parse(readFileSync(resolve(completedAttemptRoot, "result.json"), "utf8"));
  const completedCommit = JSON.parse(readFileSync(resolve(completedAttemptRoot, "commit.json"), "utf8"));
  assert.equal(completedRequest.run_instance_id, sourceRunIdentity.run_instance_id, "request must bind the run instance ID");
  assert.equal(completedResult.run_instance_id, sourceRunIdentity.run_instance_id, "result must bind the run instance ID");
  assert.equal(completedCommit.run_instance_id, sourceRunIdentity.run_instance_id, "commit must bind the run instance ID");
  assertSchemaInvalid({ ...completedResult, final_output: null }, "portfolio-attempt-result.schema.json", "completed results must require final output evidence");
  assertSchemaInvalid({ ...completedResult, status: "failed", failure_kind: "fixture", final_output: completedResult.final_output }, "portfolio-attempt-result.schema.json", "non-completed results must reject final output evidence");
  assertSchemaInvalid({ ...completedResult, status: "failed", failure_kind: "agent_failure\nprivate", final_output: null }, "portfolio-attempt-result.schema.json", "attempt results must reject control characters in failure metadata");
  assertSchemaInvalid({ ...recoveryResult, recovery_reason: { ...recoveryResult.recovery_reason, value: "x".repeat(161) } }, "portfolio-attempt-result.schema.json", "attempt results must bound normalized recovery reasons");
  const completedAgentOutput = JSON.parse(readFileSync(resolve(completedAttemptRoot, "final.json"), "utf8"));
  assertSchemaInvalid({ ...completedAgentOutput, summary: "x".repeat(4097) }, "agent-output.schema.json", "agent output schema must bound string metadata");
  assertSchemaInvalid({ ...completedAgentOutput, findings: Array.from({ length: 101 }, () => ({ severity: "note", file: "fixture", line: 1, summary: "fixture", evidence: "fixture" })) }, "agent-output.schema.json", "agent output schema must bound collection sizes");
  assert.match(readFileSync(resolve(root, ".github/workflows/validate.yml"), "utf8"), /node scripts\/test-ask-benchmark-execution\.mjs/u, "GitHub Actions must execute the focused state-machine test");

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
