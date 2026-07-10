#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CODEX_STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const DEFAULT_OUTPUT = ".agents/runs/codex-last-output.md";
const SENSOR_STATUS_PATTERN = /^ASK sensors:\s+(\w+)/m;
const PROMPT_PROFILES = {
  "skill-implement.md": { mode: "implementation", sandbox: "workspace-write" },
  "skill-investigate.md": { mode: "investigation", sandbox: "workspace-write" },
  "skill-review.md": { mode: "review", sandbox: "read-only" },
  "skill-verify.md": { mode: "implementation", sandbox: "workspace-write" },
  "skill-handoff.md": { mode: "review", sandbox: "read-only" },
};

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
  const profile = PROMPT_PROFILES[args.prompt];
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
  --mode <mode>         implementation | review. Defaults to implementation.
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
  if (state?.install_status && state.install_status !== "installed") {
    warnings.push(`Codex install status is ${state.install_status}`);
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
  if (promptPath && promptRecord?.sha256 && existsSync(promptPath) && hashText(readFileSync(promptPath, "utf8")) !== promptRecord.sha256) failures.push(`prompt hash does not match Codex install state: ${args.prompt}`);
  try { args.outputPath = resolveWithinTarget(args.target, args.output, "output"); } catch (error) { failures.push(error.message); }
  const sensorsPath = resolve(args.target, "scripts/ask-sensors.mjs");
  if (!existsSync(sensorsPath)) {
    failures.push("ask-sensors runtime is missing: scripts/ask-sensors.mjs");
  }
  return { failures, warnings, state, promptPath };
}

function gitDiffContext(args) {
  if (!args.diffBase) {
    return "";
  }
  const result = spawnSync("git", ["diff", "--patch", args.diffBase], {
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
  if (existsSync(outputPath)) unlinkSync(outputPath);
  const commandArgs = ["exec", "--sandbox", args.sandbox, "--output-last-message", args.output];
  const result = spawnSync(args.codexBin, commandArgs, {
    cwd: args.target,
    encoding: "utf8",
    input: prompt,
    maxBuffer: 10 * 1024 * 1024,
  });
  const outputExists = existsSync(outputPath);
  const finalOutput = outputExists ? readFileSync(outputPath, "utf8") : result.stdout ?? "";
  if (!outputExists && finalOutput.trim()) {
    writeFileSync(outputPath, finalOutput);
  }
  return {
    command: [args.codexBin, ...commandArgs, "<stdin-prompt>"].join(" "),
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    outputPath: args.output,
    finalOutput,
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
  if (!codexResult || codexResult.exitCode !== 0) {
    return { status: "execution_failed", evidenceLevel: "runtime_detected" };
  }
  if (!codexResult.finalOutput.trim()) {
    return { status: "insufficient_evidence", evidenceLevel: "executed" };
  }
  if (sensorResult?.status === "pass") {
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
    failures: [...preflightResult.failures, ...(codexResult?.exitCode && codexResult.exitCode !== 0 ? [`codex exec exited ${codexResult.exitCode}`] : [])],
    warnings: preflightResult.warnings,
    boundary: "File projection and ask-sensors output checks do not prove business correctness, product readiness, or no regression.",
  };
  printResult(report, args.json);
  process.exit(normalized.status === "executed" ? 0 : normalized.status === "execution_failed" ? 1 : 2);
} catch (error) {
  console.error(`codex-exec-runner failed: ${error.message}`);
  process.exit(1);
}
