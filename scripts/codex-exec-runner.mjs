#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CODEX_PROMPT_CONTRACTS } from "./ask-shared.mjs";

const CODEX_STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const DEFAULT_OUTPUT = ".agents/runs/codex-last-output.md";
const SENSOR_STATUS_PATTERN = /^ASK sensors:\s+(\w+)/m;
const RUNNING_RUNNER_PATH = realpathSync(fileURLToPath(import.meta.url));

function hashText(value) { return createHash("sha256").update(value).digest("hex"); }

function resolveWithinTarget(target, value, label) {
  if (!value || value.includes("\0") || value.startsWith("/") || value.split(/[\\/]/).includes("..")) throw new Error(`${label} must be a relative path inside target`);
  const resolved = resolve(target, value);
  if (resolved !== target && !resolved.startsWith(`${target}/`)) throw new Error(`${label} escapes target`);
  return resolved;
}

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    prompt: "skill-implement.md",
    mode: null,
    sandbox: null,
    output: DEFAULT_OUTPUT,
    codexBin: "codex",
    diffBase: "",
    dryRun: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = resolve(argv[++index]);
    } else if (arg === "--prompt") {
      args.prompt = argv[++index];
    } else if (arg === "--mode") {
      args.mode = argv[++index];
    } else if (arg === "--sandbox") {
      args.sandbox = argv[++index];
    } else if (arg === "--output") {
      args.output = argv[++index];
    } else if (arg === "--codex-bin") {
      args.codexBin = argv[++index];
    } else if (arg === "--diff-base") {
      args.diffBase = argv[++index];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const profile = CODEX_PROMPT_CONTRACTS[args.prompt];
  if (!profile) throw new Error(`prompt has no validated execution profile: ${args.prompt}`);
  if (args.mode && args.mode !== profile.mode) throw new Error(`prompt/mode mismatch: ${args.prompt} requires ${profile.mode}`);
  if (args.sandbox && args.sandbox !== profile.sandbox) throw new Error(`prompt/sandbox mismatch: ${args.prompt} requires ${profile.sandbox}`);
  args.mode = profile.mode;
  args.sandbox = profile.sandbox;
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/codex-exec-runner.mjs [options]

Options:
  --target <path>       Repository root containing .agent-spectrum-kernel/codex-install-state.json.
  --prompt <file>       Installed .agents/prompts file name. Defaults to skill-implement.md.
  --mode <mode>         Must match the selected prompt's managed contract.
  --sandbox <mode>      read-only | workspace-write. Defaults to workspace-write.
  --output <path>       Output file inside target. Defaults to .agents/runs/codex-last-output.md.
  --codex-bin <path>    Codex executable. Defaults to codex.
  --diff-base <rev>     Optional git diff range for review context, for example origin/main...HEAD.
  --dry-run             Run preflight and print the codex command without invoking Codex.
  --json                Print machine-readable result JSON.

The runner is bounded: it runs preflight, assembles an installed prompt with
local repository context, invokes codex exec, captures final output, runs
ask-sensors, and reports an evidence level. ask-sensors is report-only and does
not prove business correctness.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function preflight(args) {
  const failures = [];
  const warnings = [];
  if (!existsSync(args.target)) {
    failures.push(`target is missing: ${args.target}`);
    return { failures, warnings, state: null, promptPath: null };
  }
  const statePath = resolve(args.target, CODEX_STATE_PATH);
  let state = null;
  if (!existsSync(statePath)) {
    failures.push(`Codex install state is missing: ${CODEX_STATE_PATH}`);
  } else {
    try {
      state = readJson(statePath);
    } catch (error) {
      failures.push(`Codex install state is invalid: ${error.message}`);
    }
  }
  if (state?.install_status !== "installed") {
    failures.push(`Codex install status must be installed, received ${state?.install_status ?? "missing"}`);
  }
  if (args.prompt !== args.prompt.split(/[\\/]/).at(-1)) failures.push("prompt must be an installed prompt basename");
  let promptPath = null;
  try { promptPath = resolveWithinTarget(args.target, `.agents/prompts/${args.prompt}`, "prompt"); } catch (error) { failures.push(error.message); }
  if (!existsSync(promptPath)) {
    failures.push(`installed prompt is missing: .agents/prompts/${args.prompt}`);
  }
  if (state && Array.isArray(state.selected_prompts) && !state.selected_prompts.includes(args.prompt)) {
    failures.push(`prompt is not selected in Codex install state: ${args.prompt}`);
  }
  const promptRecord = state?.managed_files?.[`.agents/prompts/${args.prompt}`];
  if (!promptRecord || promptRecord.kind !== "codex_prompt" || !promptRecord.sha256) {
    failures.push(`selected prompt has no managed Codex prompt record: ${args.prompt}`);
  } else if (promptPath && existsSync(promptPath) && hashText(readFileSync(promptPath, "utf8")) !== promptRecord.sha256) {
    failures.push(`prompt hash does not match Codex install state: ${args.prompt}`);
  }
  try { args.outputPath = resolveWithinTarget(args.target, args.output, "output"); } catch (error) { failures.push(error.message); }
  const managedRunnerCandidate = resolve(args.target, "scripts/codex-exec-runner.mjs");
  const managedRunnerPath = existsSync(managedRunnerCandidate) ? realpathSync(managedRunnerCandidate) : managedRunnerCandidate;
  if (RUNNING_RUNNER_PATH !== managedRunnerPath) {
    failures.push(`running runner is not the target managed runner: expected ${managedRunnerPath}, received ${RUNNING_RUNNER_PATH}`);
  }
  for (const runtime of ["codex-exec-runner.mjs", "ask-sensors.mjs", "ask-shared.mjs"]) {
    const relativePath = `scripts/${runtime}`;
    const record = state?.managed_files?.[relativePath];
    const runtimePath = resolve(args.target, relativePath);
    if (!state?.selected_runtime_scripts?.includes(runtime) || record?.kind !== "codex_runtime" || !existsSync(runtimePath)) {
      failures.push(`managed Codex runtime is missing or unselected: ${relativePath}`);
    } else if (hashText(readFileSync(runtimePath, "utf8")) !== record.sha256) {
      failures.push(`managed Codex runtime hash mismatch: ${relativePath}`);
    }
  }
  if (args.diffBase) {
    try {
      args.diffRange = resolveDiffRange(args.target, args.diffBase);
    } catch (error) {
      failures.push(`invalid --diff-base: ${error.message}`);
    }
  }
  return { failures, warnings, state, promptPath };
}

function resolveDiffRange(target, value) {
  if (!value || value.startsWith("-") || /[\0\r\n\s]/.test(value)) throw new Error("must be a revision or A..B / A...B range without options or whitespace");
  const separator = value.includes("...") ? "..." : value.includes("..") ? ".." : null;
  const endpoints = separator ? value.split(separator) : [value];
  if (endpoints.length > 2 || endpoints.some((endpoint) => !endpoint)) throw new Error("range endpoints must be non-empty");
  const revisions = endpoints.map((endpoint) => {
    const result = spawnSync("git", ["rev-parse", "--verify", `${endpoint}^{commit}`], { cwd: target, encoding: "utf8" });
    if (result.error || result.status !== 0) throw new Error(`revision is not a commit: ${endpoint}`);
    return result.stdout.trim();
  });
  return separator ? revisions.join(separator) : revisions[0];
}

function gitDiffContext(args) {
  if (!args.diffBase) {
    return "";
  }
  const result = spawnSync("git", ["diff", "--patch", args.diffRange, "--"], {
    cwd: args.target,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return `Git diff context unavailable for ${args.diffBase}:\n${result.stderr || result.stdout || "unknown git diff failure"}`;
  }
  return result.stdout.trim() ? `Git diff context (${args.diffBase}):\n${result.stdout}` : `Git diff context (${args.diffBase}): empty diff.`;
}

function buildPrompt(args, state, promptPath) {
  const prompt = readFileSync(promptPath, "utf8");
  const context = [
    "Repository context:",
    `- Codex profile: ${state?.selected_profile ?? "unknown"}`,
    `- Selected skills: ${(state?.selected_skills ?? []).join(", ") || "unknown"}`,
    `- Runner mode: ${args.mode}`,
    `- Sandbox: ${args.sandbox}`,
    "Evidence boundary: file projection and sensors do not prove business correctness.",
  ];
  const diff = gitDiffContext(args);
  return [prompt.trimEnd(), "", context.join("\n"), diff ? `\n${diff}` : ""].join("\n");
}

function runCodex(args, prompt) {
  const outputPath = args.outputPath;
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryOutput = `.agents/runs/codex-run-${process.pid}-${Date.now()}.md`;
  const temporaryOutputPath = resolveWithinTarget(args.target, temporaryOutput, "temporary output");
  mkdirSync(dirname(temporaryOutputPath), { recursive: true });
  const commandArgs = ["exec", "--sandbox", args.sandbox, "--output-last-message", temporaryOutput];
  const result = spawnSync(args.codexBin, commandArgs, {
    cwd: args.target,
    encoding: "utf8",
    input: prompt,
    maxBuffer: 10 * 1024 * 1024,
  });
  const outputExists = existsSync(temporaryOutputPath);
  const finalOutput = outputExists ? readFileSync(temporaryOutputPath, "utf8") : "";
  const acceptedOutput = !result.error && result.status === 0 && outputExists && finalOutput.trim().length > 0;
  if (acceptedOutput) renameSync(temporaryOutputPath, outputPath);
  else if (outputExists) unlinkSync(temporaryOutputPath);
  return {
    command: [args.codexBin, ...commandArgs, "<stdin-prompt>"].join(" "),
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
    outputPath: args.output,
    finalOutput: acceptedOutput ? finalOutput : "",
  };
}

function runSensors(args, outputPath) {
  const result = spawnSync(process.execPath, ["scripts/ask-sensors.mjs", "--target", args.target, "--mode", args.mode, "--input", outputPath], {
    cwd: args.target,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  const status = result.stdout.match(SENSOR_STATUS_PATTERN)?.[1] ?? "unknown";
  return {
    status,
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function resultStatus({ preflightResult, codexResult, sensorResult, dryRun }) {
  if (preflightResult.failures.length > 0) {
    return { status: "insufficient_evidence", evidenceLevel: "unknown" };
  }
  if (dryRun) {
    return { status: "ready_to_execute", evidenceLevel: "projected" };
  }
  if (!codexResult || codexResult.error) {
    return { status: "execution_failed", evidenceLevel: "projected" };
  }
  if (codexResult.exitCode !== 0) {
    return { status: "execution_failed", evidenceLevel: "runtime_detected" };
  }
  if (!codexResult.finalOutput.trim()) {
    return { status: "insufficient_evidence", evidenceLevel: "executed" };
  }
  if (sensorResult?.exitCode === 0 && sensorResult?.status === "pass") {
    return { status: "executed", evidenceLevel: "executed" };
  }
  return { status: "insufficient_evidence", evidenceLevel: "executed" };
}

function printResult(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Codex runner: ${report.status}`);
  console.log(`Evidence level: ${report.evidence_level}`);
  console.log(`Output: ${report.output_path ?? "not written"}`);
  console.log(`Sensor status: ${report.sensor_status ?? "not run"}`);
  console.log("Boundary: ask-sensors is report-only and does not prove business correctness.");
  if (report.failures.length > 0) {
    console.log("Failures:");
    for (const failure of report.failures) {
      console.log(`- ${failure}`);
    }
  }
  if (report.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const preflightResult = preflight(args);
  let codexResult = null;
  let sensorResult = null;
  let command = null;
  if (preflightResult.failures.length === 0) {
    const prompt = buildPrompt(args, preflightResult.state, preflightResult.promptPath);
    command = `${args.codexBin} exec --sandbox ${args.sandbox} --output-last-message ${args.output} <stdin-prompt>`;
    if (!args.dryRun) {
      codexResult = runCodex(args, prompt);
      if (codexResult.exitCode === 0 && codexResult.finalOutput.trim()) {
        sensorResult = runSensors(args, args.outputPath);
      }
    }
  }
  const normalized = resultStatus({ preflightResult, codexResult, sensorResult, dryRun: args.dryRun });
  const report = {
    status: normalized.status,
    evidence_level: normalized.evidenceLevel,
    mode: args.mode,
    sandbox: args.sandbox,
    command,
    output_path: codexResult?.outputPath ?? args.output,
    sensor_status: sensorResult?.status ?? null,
    failures: [...preflightResult.failures, ...(codexResult?.error ? [`codex exec could not start: ${codexResult.error}`] : []), ...(codexResult && codexResult.exitCode !== null && codexResult.exitCode !== 0 ? [`codex exec exited ${codexResult.exitCode}`] : []), ...(sensorResult && (sensorResult.exitCode !== 0 || sensorResult.status !== "pass") ? [`ask-sensors rejected output: status=${sensorResult.status}, exit=${sensorResult.exitCode}`] : [])],
    warnings: preflightResult.warnings,
    boundary: "File projection and ask-sensors output checks do not prove business correctness, product readiness, or no regression.",
  };
  printResult(report, args.json);
  process.exit(normalized.status === "executed" ? 0 : normalized.status === "execution_failed" ? 1 : 2);
} catch (error) {
  console.error(`codex-exec-runner failed: ${error.message}`);
  process.exit(1);
}
