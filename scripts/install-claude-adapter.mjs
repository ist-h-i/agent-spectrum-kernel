#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SKILLS = [
  "operating-mode-router",
  "skill-router",
  "spec-driven-development",
  "controlled-implementation",
  "test-first-verification",
  "doubt-driven-development",
  "handoff-generation",
  "review-router",
  "review-automated-gate",
  "review-ai-quality",
  "review-code-health",
  "review-domain-impact",
  "review-architecture-impact",
  "review-output-quality",
  "review-adversarial-risk",
  "review-final-merge-gate",
  "evidence-ledger",
  "risk-gate",
  "adr-review",
  "improvement-ledger",
  "skill-adoption-metrics",
];
const COMMAND_TEMPLATES = [
  "skill-review.md",
  "skill-implement.md",
  "skill-investigate.md",
  "skill-verify.md",
  "skill-handoff.md",
  "skill-report.md",
  "skill-ledger-refresh.md",
];
const RUNTIME_SCRIPTS = [
  "ai-metrics-record.mjs",
  "ai-metrics-summarize.mjs",
  "ai-ledger-refresh.mjs",
];

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    dryRun: false,
    skipHooks: false,
    skipRuntime: false,
    skills: DEFAULT_SKILLS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      args.target = resolve(argv[++i]);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip-hooks") {
      args.skipHooks = true;
    } else if (arg === "--skip-runtime") {
      args.skipRuntime = true;
    } else if (arg === "--skills") {
      args.skills = argv[++i].split(",").map((skill) => skill.trim()).filter(Boolean);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/install-claude-adapter.mjs [options]

Options:
  --target <path>      Adopting project root. Defaults to cwd.
  --skills <csv>       Comma-separated core skills to project.
  --skip-hooks         Do not copy hook config.
  --skip-runtime       Do not copy local runtime scripts or config.
  --dry-run            Print planned writes without changing files.
  -h, --help           Show this help.

Default mode is upgrade-safe: projected files are overwritten from this checkout,
existing unrelated settings are preserved, and adapter hooks are merged without
duplicating hook commands.
`);
}

function ensureSource(path) {
  if (!existsSync(path)) {
    throw new Error(`Required source is missing: ${relative(REPO_ROOT, path)}`);
  }
}

function copyFilePlanned(source, destination, args, writes) {
  ensureSource(source);
  writes.push(destination);
  if (args.dryRun) {
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function writeFilePlanned(destination, content, args, writes) {
  writes.push(destination);
  if (args.dryRun) {
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function copyDirectoryFiles(sourceDir, destinationDir, args, writes) {
  ensureSource(sourceDir);
  for (const entry of readdirSync(sourceDir).sort()) {
    const source = resolve(sourceDir, entry);
    const destination = resolve(destinationDir, entry);
    const stat = statSync(source);
    if (stat.isDirectory()) {
      copyDirectoryFiles(source, destination, args, writes);
    } else if (stat.isFile()) {
      copyFilePlanned(source, destination, args, writes);
    }
  }
}

function installSkills(args, writes) {
  for (const skill of args.skills) {
    const source = resolve(REPO_ROOT, "skills", skill, "SKILL.md");
    const destination = resolve(args.target, ".claude", "skills", skill, "SKILL.md");
    copyFilePlanned(source, destination, args, writes);
  }
}

function installCommands(args, writes) {
  for (const command of COMMAND_TEMPLATES) {
    const source = resolve(REPO_ROOT, "adapters/claude-code/project/.claude/commands", command);
    const destination = resolve(args.target, ".claude", "commands", command);
    copyFilePlanned(source, destination, args, writes);
  }
}

function installHooks(args, writes) {
  if (args.skipHooks) {
    return;
  }
  const hooksSource = resolve(REPO_ROOT, "adapters/claude-code/project/.claude/hooks/hooks.json");
  copyDirectoryFiles(
    resolve(REPO_ROOT, "adapters/claude-code/project/.claude/hooks"),
    resolve(args.target, ".claude", "hooks"),
    args,
    writes,
  );
  const settingsPath = resolve(args.target, ".claude", "settings.json");
  const hooksSettings = JSON.parse(readFileSync(hooksSource, "utf8"));
  let settings = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  }
  settings.hooks = mergeHooks(settings.hooks ?? {}, hooksSettings.hooks ?? {});
  writeFilePlanned(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, args, writes);
}

function mergeHooks(existingHooks, adapterHooks) {
  const merged = { ...existingHooks };
  const seen = new Set();

  for (const [eventName, groups] of Object.entries(merged)) {
    if (!Array.isArray(groups)) {
      continue;
    }
    for (const group of groups) {
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        seen.add(hookIdentity(eventName, group, hook));
      }
    }
  }

  for (const [eventName, groups] of Object.entries(adapterHooks)) {
    const currentGroups = Array.isArray(merged[eventName]) ? merged[eventName] : [];
    const newGroups = [];
    for (const group of groups) {
      const hooks = [];
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        const identity = hookIdentity(eventName, group, hook);
        if (seen.has(identity)) {
          continue;
        }
        seen.add(identity);
        hooks.push(hook);
      }
      if (hooks.length > 0) {
        newGroups.push({ ...group, hooks });
      }
    }
    merged[eventName] = [...currentGroups, ...newGroups];
  }
  return merged;
}

function hookIdentity(eventName, group, hook) {
  return JSON.stringify([
    eventName,
    group.matcher ?? "",
    hook.type ?? "",
    hook.command ?? "",
  ]);
}

function installRuntime(args, writes) {
  if (args.skipRuntime) {
    return;
  }
  for (const script of RUNTIME_SCRIPTS) {
    copyFilePlanned(resolve(REPO_ROOT, "scripts", script), resolve(args.target, "scripts", script), args, writes);
  }
  copyFilePlanned(
    resolve(REPO_ROOT, "docs/ai/observability-config.yml"),
    resolve(args.target, "docs/ai/observability-config.yml"),
    args,
    writes,
  );
  if (!args.dryRun) {
    mkdirSync(resolve(args.target, "docs/ai/metrics"), { recursive: true });
    mkdirSync(resolve(args.target, "docs/ai/reports"), { recursive: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const writes = [];

  installSkills(args, writes);
  installCommands(args, writes);
  installHooks(args, writes);
  installRuntime(args, writes);

  const label = args.dryRun ? "Claude adapter dry run" : "Claude adapter installed";
  console.log(`${label}: ${args.target}`);
  for (const destination of writes) {
    console.log(`- ${relative(args.target, destination)}`);
  }
  console.log("Privacy defaults: local project storage, no external publication, no raw prompt storage.");
}

try {
  main();
} catch (error) {
  console.error(`install-claude-adapter failed: ${error.message}`);
  process.exit(1);
}
