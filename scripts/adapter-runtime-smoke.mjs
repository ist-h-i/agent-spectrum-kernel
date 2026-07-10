#!/usr/bin/env node
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CORE_STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const CLAUDE_STATE_PATH = ".agent-spectrum-kernel/claude-install-state.json";
const CODEX_STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const DEFAULT_EVENT_STORE = "docs/ai/metrics/events.jsonl";

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    adapter: "all",
    dryRun: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = resolve(argv[++index]);
    } else if (arg === "--adapter") {
      args.adapter = argv[++index];
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
  if (!["all", "claude", "codex"].includes(args.adapter)) {
    throw new Error("--adapter must be all, claude, or codex");
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/adapter-runtime-smoke.mjs [options]

Options:
  --target <path>       Adopting repository to inspect. Defaults to cwd.
  --adapter <name>      all | claude | codex. Defaults to all.
  --dry-run             Check runtime surfaces without appending a smoke event.
  --json                Print machine-readable result JSON.

This smoke check is local-only. For Claude it verifies installed commands,
selected skills, hook executable resolution, and report input availability. A
probe event is written only to an isolated runtime-smoke store. It does not
invoke Claude or prove product/business correctness.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return readJson(path);
}

function statusFrom(checks) {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function check(status, id, message) {
  return { status, id, message };
}

function pathIsFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function pathIsDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

function resolveWithinTarget(target, value, label) {
  if (!value || value.includes("\0") || value.startsWith("/") || value.split(/[\\/]/).includes("..")) {
    throw new Error(`${label} must be a relative path inside target`);
  }
  const path = resolve(target, value);
  if (path !== target && !path.startsWith(`${target}/`)) throw new Error(`${label} escapes target`);
  return path;
}

function readConfigValue(target, pathParts, fallback) {
  const configPath = resolve(target, "docs/ai/observability-config.yml");
  if (!existsSync(configPath)) {
    return fallback;
  }
  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  const stack = [];
  for (const rawLine of lines) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const match = withoutComment.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2];
    const value = match[3].trim();
    const level = Math.floor(indent / 2);
    stack.length = level;
    if (!value) {
      stack[level] = key;
      continue;
    }
    const currentPath = [...stack.slice(0, level), key];
    if (currentPath.join(".") === pathParts.join(".")) {
      return value.replace(/^["']|["']$/g, "");
    }
  }
  return fallback;
}

function installedState(target, statePath, label, checks) {
  const state = readJsonIfExists(resolve(target, statePath));
  if (!state) {
    checks.push(check("fail", `${label}_state`, `${label} install state is missing: ${statePath}`));
    return null;
  }
  if (state.install_status !== "installed") {
    checks.push(check("warn", `${label}_state`, `${label} install status is ${state.install_status ?? "unknown"}`));
  } else {
    checks.push(check("pass", `${label}_state`, `${label} install state is installed`));
  }
  return state;
}

function runClaudeSmoke(target, { dryRun }) {
  const checks = [];
  const coreState = installedState(target, CORE_STATE_PATH, "core", checks);
  const claudeState = installedState(target, CLAUDE_STATE_PATH, "claude", checks);
  if (coreState && claudeState) {
    const sameVersion = coreState.source?.version === claudeState.source?.version;
    checks.push(check(sameVersion ? "pass" : "warn", "version_consistency", `core/Claude source versions ${sameVersion ? "match" : "differ"}`));
  }

  for (const skill of claudeState?.selected_skills ?? []) {
    const path = resolve(target, ".claude/skills", skill, "SKILL.md");
    checks.push(check(pathIsFile(path) ? "pass" : "fail", "skill_activation", `.claude skill ${skill} ${pathIsFile(path) ? "is readable" : "is missing"}`));
  }
  for (const command of claudeState?.selected_commands ?? claudeState?.installed_commands ?? []) {
    const path = resolve(target, ".claude/commands", command);
    checks.push(check(pathIsFile(path) ? "pass" : "fail", "command_activation", `.claude command ${command} ${pathIsFile(path) ? "is readable" : "is missing"}`));
  }

  const settingsPath = resolve(target, ".claude/settings.json");
  if (!pathIsFile(settingsPath)) {
    checks.push(check("warn", "hook_settings", ".claude/settings.json is missing"));
  } else {
    const settings = readJson(settingsPath);
    const hookCommands = collectHookCommands(settings.hooks ?? {});
    if (hookCommands.length === 0) {
      checks.push(check("warn", "hook_activation", "no Claude hook commands detected"));
    }
    for (const command of hookCommands) {
      if (command.includes("${CLAUDE_PLUGIN_ROOT}")) {
        const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
        const match = pluginRoot ? command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot).match(/([^\s"']*ai-skills-metrics-record)/) : null;
        const executable = match?.[1] && pathIsFile(match[1]) && (statSync(match[1]).mode & 0o111) !== 0;
        checks.push(check(executable ? "pass" : "fail", "plugin_hook_resolution", "Claude plugin hook executable must resolve through CLAUDE_PLUGIN_ROOT"));
      }
      if (command.includes("scripts/ai-metrics-record.mjs")) {
        const scriptPath = resolve(target, "scripts/ai-metrics-record.mjs");
        checks.push(check(pathIsFile(scriptPath) ? "pass" : "fail", "hook_executable", `hook executable ${pathIsFile(scriptPath) ? "resolves" : "is missing"}: scripts/ai-metrics-record.mjs`));
      }
    }
  }

  const configuredEventStore = readConfigValue(target, ["storage", "event_store"], DEFAULT_EVENT_STORE);
  let configuredEventStorePath = null;
  try {
    configuredEventStorePath = resolveWithinTarget(target, configuredEventStore, "configured event store");
  } catch (error) {
    checks.push(check("fail", "configured_event_store", error.message));
  }
  if (configuredEventStorePath) {
    const configuredEventDir = dirname(configuredEventStorePath);
    if (!pathIsDirectory(configuredEventDir)) {
      checks.push(check("fail", "configured_event_store", `configured event-store directory is missing or invalid: ${configuredEventStore}`));
    } else if (existsSync(configuredEventStorePath) && !pathIsFile(configuredEventStorePath)) {
      checks.push(check("fail", "configured_event_store", `configured event-store must be a regular file: ${configuredEventStore}`));
    } else if (dryRun) {
      checks.push(check("pass", "configured_event_store", `configured event-store location planned: ${configuredEventStore}`));
    } else if (existsSync(configuredEventStorePath)) {
      try {
        const descriptor = openSync(configuredEventStorePath, "a");
        closeSync(descriptor);
        checks.push(check("pass", "configured_event_store", `configured event-store is append-openable: ${configuredEventStore}`));
      } catch (error) {
        checks.push(check("fail", "configured_event_store", `configured event-store is not append-openable: ${configuredEventStore}: ${error.message}`));
      }
    } else {
      const probePath = resolve(configuredEventDir, `.ask-runtime-smoke-probe-${process.pid}-${Date.now()}`);
      try {
        writeFileSync(probePath, "probe\n", { flag: "wx" });
        unlinkSync(probePath);
        checks.push(check("pass", "configured_event_store", `configured event-store directory is writable: ${configuredEventStore}`));
      } catch (error) {
        if (existsSync(probePath)) unlinkSync(probePath);
        checks.push(check("fail", "configured_event_store", `configured event-store directory is not writable: ${configuredEventStore}: ${error.message}`));
      }
    }
  }

  const eventStore = ".agent-spectrum-kernel/runtime-smoke/events.jsonl";
  const eventStorePath = resolve(target, eventStore);
  const eventDir = dirname(eventStorePath);
  if (!pathIsDirectory(eventDir) && dryRun) {
    checks.push(check("pass", "event_store_directory", `event-store location planned: ${eventStore}`));
  } else if (!dryRun) {
    try {
      const event = {
        schema_version: "1.0.0",
        event_id: `smoke:${new Date().toISOString()}`,
        task_id: "adapter-runtime-smoke",
        task_type: "validation",
        occurred_at: new Date().toISOString(),
        skills_used: [],
        routing_result: {},
        outcome_metrics: { task_completed: false },
        verification_metrics: {},
        debt_movement_metrics: {},
        evidence_references: ["adapter-runtime-smoke"],
        privacy_note: {
          raw_prompts_stored: false,
          secrets_stored: false,
          customer_data_stored: false,
          personal_data_stored: false,
          external_publication: false,
          note: "Non-sensitive local smoke event.",
        },
      };
      mkdirSync(eventDir, { recursive: true });
      appendFileSync(eventStorePath, `${JSON.stringify(event)}\n`);
      checks.push(check("pass", "smoke_event", `isolated non-sensitive smoke event appended: ${eventStore}`));
    } catch (error) {
      checks.push(check("fail", "smoke_event", `event-store is not writable: ${eventStore}: ${error.message}`));
    }
  } else {
    checks.push(check("pass", "event_store_directory", `event-store directory is present: ${eventStore}`));
  }

  const reportDir = readConfigValue(target, ["storage", "report_dir"], "docs/ai/reports");
  checks.push(check(pathIsDirectory(resolve(target, reportDir)) ? "pass" : "warn", "report_input", `report directory ${pathIsDirectory(resolve(target, reportDir)) ? "is present" : "is missing"}: ${reportDir}`));
  checks.push(check(pathIsFile(resolve(target, "docs/ai/adoption-report-template.md")) ? "pass" : "warn", "report_template", "adoption report template availability checked"));

  return {
    adapter: "claude",
    status: statusFrom(checks),
    evidence_level: "runtime_detected",
    checks,
    boundary: "Local smoke detects runtime files and writability only; it does not invoke Claude or prove task correctness.",
  };
}

function runCodexSmoke(target) {
  const checks = [];
  const codexState = installedState(target, CODEX_STATE_PATH, "codex", checks);
  for (const skill of codexState?.selected_skills ?? []) {
    const path = resolve(target, ".agents/skills", skill, "SKILL.md");
    checks.push(check(pathIsFile(path) ? "pass" : "fail", "codex_skill_projection", `.agents skill ${skill} ${pathIsFile(path) ? "is readable" : "is missing"}`));
  }
  for (const prompt of codexState?.selected_prompts ?? []) {
    const path = resolve(target, ".agents/prompts", prompt);
    checks.push(check(pathIsFile(path) ? "pass" : "fail", "codex_prompt_projection", `.agents prompt ${prompt} ${pathIsFile(path) ? "is readable" : "is missing"}`));
  }
  checks.push(check(pathIsFile(resolve(target, "scripts/codex-exec-runner.mjs")) ? "pass" : "warn", "codex_runner", "Codex runner availability checked"));
  return {
    adapter: "codex",
    status: statusFrom(checks),
    evidence_level: "projected",
    checks,
    boundary: "Codex smoke checks projection only; use codex-exec-runner for executed evidence.",
  };
}

function collectHookCommands(hooks) {
  const commands = [];
  for (const groups of Object.values(hooks)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        if (hook?.type === "command" && typeof hook.command === "string") {
          commands.push(hook.command);
        }
      }
    }
  }
  return commands;
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`ASK adapter runtime smoke: ${report.status}`);
  for (const adapterReport of report.adapters) {
    console.log(`Adapter: ${adapterReport.adapter}`);
    console.log(`Evidence level: ${adapterReport.evidence_level}`);
    console.log(`Boundary: ${adapterReport.boundary}`);
    for (const entry of adapterReport.checks) {
      console.log(`- ${entry.id}: ${entry.status} - ${entry.message}`);
    }
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const adapters = [];
  if (args.adapter === "all" || args.adapter === "claude") {
    adapters.push(runClaudeSmoke(args.target, { dryRun: args.dryRun }));
  }
  if (args.adapter === "all" || args.adapter === "codex") {
    adapters.push(runCodexSmoke(args.target));
  }
  const report = {
    status: statusFrom(adapters.flatMap((adapter) => adapter.checks)),
    adapters,
  };
  printReport(report, args.json);
  process.exit(report.status === "fail" ? 1 : 0);
} catch (error) {
  console.error(`adapter-runtime-smoke failed: ${error.message}`);
  process.exit(1);
}
