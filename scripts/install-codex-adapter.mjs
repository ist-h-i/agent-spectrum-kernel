#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const MANAGED_START = "<!-- agent-spectrum-kernel:start -->";
const MANAGED_END = "<!-- agent-spectrum-kernel:end -->";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PROMPT_TEMPLATES = [
  "skill-implement.md",
  "skill-investigate.md",
  "skill-review.md",
  "skill-verify.md",
  "skill-handoff.md",
];
const COMMAND_TEMPLATES = ["codex-exec.md"];

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    skills: null,
    mergeAgents: false,
    skipAgents: false,
    skipPrompts: false,
    skipCommand: false,
    noOverwriteSkills: false,
    prune: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      args.target = resolve(argv[++i]);
    } else if (arg === "--skills") {
      args.skills = argv[++i].split(",").map((skill) => skill.trim()).filter(Boolean);
    } else if (arg === "--merge-agents") {
      args.mergeAgents = true;
    } else if (arg === "--skip-agents") {
      args.skipAgents = true;
    } else if (arg === "--skip-prompts") {
      args.skipPrompts = true;
    } else if (arg === "--skip-command") {
      args.skipCommand = true;
    } else if (arg === "--no-overwrite-skills") {
      args.noOverwriteSkills = true;
    } else if (arg === "--prune") {
      args.prune = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
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
  console.log(`Usage: node scripts/install-codex-adapter.mjs [options]

Options:
  --target <path>       Adopting project root. Defaults to cwd.
  --skills <csv>        Comma-separated core skills to project. Defaults to manifest.json.skills.
  --merge-agents        Add or update the managed block in an existing AGENTS.md.
  --skip-agents         Do not install or merge AGENTS.md.
  --skip-prompts        Do not copy Codex prompt templates into .agents/prompts.
  --skip-command        Do not copy the codex exec command template into .agents/commands.
  --no-overwrite-skills Fail when an existing Codex skill projection would be overwritten.
  --prune               Delete stale managed Codex SKILL.md files from the previous install state.
  --dry-run             Print planned changes without changing files.
  -h, --help            Show this help.

Default mode is update-safe: .agents/skills, .agents/prompts, and .agents/commands
are updated from this checkout, AGENTS.md is only written when missing or when a
managed block exists, and existing project-local AGENTS.md content is preserved.
Prune mode deletes only managed files whose hashes still match the previous
install state, and removes skill directories only if they become empty.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readManifest() {
  const manifest = readJson(resolve(REPO_ROOT, "manifest.json"));
  if (!Array.isArray(manifest.skills)) {
    throw new Error("manifest.json.skills must be an array");
  }
  return manifest;
}

function readPreviousState(target) {
  const statePath = resolve(target, STATE_PATH);
  if (!existsSync(statePath)) {
    return null;
  }
  return readJson(statePath);
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function validateSkillNames(skills, manifestSkills) {
  const manifestSkillSet = new Set(manifestSkills);
  const unknown = [];
  for (const skill of skills) {
    if (!SKILL_NAME_PATTERN.test(skill) || !manifestSkillSet.has(skill)) {
      unknown.push(skill);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`Unknown skill(s): ${unknown.join(", ")}`);
  }
}

function ensureSource(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Required source is missing: ${label}`);
  }
}

function buildAgentsBlock(content) {
  return [
    MANAGED_START,
    "<!-- Source: Agent Spectrum Kernel. Managed by Agent Spectrum Kernel installers; edits inside this block will be overwritten. -->",
    content.trimEnd(),
    MANAGED_END,
    "",
  ].join("\n");
}

function replaceOrAppendManagedBlock(existing, block, allowAppend) {
  const start = existing.indexOf(MANAGED_START);
  const end = existing.indexOf(MANAGED_END);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    throw new Error("AGENTS.md contains an incomplete agent-spectrum-kernel managed block");
  }
  if (start !== -1) {
    const before = existing.slice(0, start).replace(/[ \t]*$/u, "");
    const after = existing.slice(end + MANAGED_END.length).replace(/^\s*\n?/u, "");
    return `${before}${before ? "\n\n" : ""}${block}${after ? `\n${after}` : ""}`;
  }
  if (!allowAppend) {
    throw new Error("AGENTS.md already exists. Re-run with --merge-agents to add/update the managed block, or --skip-agents to leave it untouched.");
  }
  return `${existing.trimEnd()}\n\n${block}`;
}

function planWrite(operations, destination, content, reason) {
  const existing = existsSync(destination) ? readText(destination) : null;
  const unchanged = existing === content;
  operations.push({ kind: "write", destination, content, reason, unchanged });
}

function planDeleteFile(operations, destination, reason) {
  operations.push({ kind: "delete_file", destination, reason, unchanged: !existsSync(destination) });
}

function planRemoveEmptyDirectory(operations, destination, reason) {
  operations.push({ kind: "remove_empty_dir", destination, reason, unchanged: false });
}

function buildGitDir() {
  const gitPath = resolve(REPO_ROOT, ".git");
  if (!existsSync(gitPath)) {
    return null;
  }
  const stat = statSync(gitPath);
  if (stat.isDirectory()) {
    return gitPath;
  }
  if (stat.isFile()) {
    const text = readText(gitPath).trim();
    const match = text.match(/^gitdir:\s*(.+)$/);
    if (match) {
      return resolve(REPO_ROOT, match[1]);
    }
  }
  return null;
}

function readGitRevision() {
  const gitDir = buildGitDir();
  if (!gitDir) {
    return null;
  }
  const headPath = resolve(gitDir, "HEAD");
  if (!existsSync(headPath)) {
    return null;
  }
  const head = readText(headPath).trim();
  if (/^[a-f0-9]{40}$/i.test(head)) {
    return head;
  }
  const refMatch = head.match(/^ref:\s*(.+)$/);
  if (!refMatch) {
    return null;
  }
  const ref = refMatch[1];
  const refPath = resolve(gitDir, ref);
  if (existsSync(refPath)) {
    return readText(refPath).trim() || null;
  }
  const packedRefsPath = resolve(gitDir, "packed-refs");
  if (!existsSync(packedRefsPath)) {
    return null;
  }
  for (const line of readText(packedRefsPath).split(/\r?\n/)) {
    if (line.startsWith("#") || line.startsWith("^")) {
      continue;
    }
    const [hash, packedRef] = line.split(" ");
    if (packedRef === ref) {
      return hash;
    }
  }
  return null;
}

function buildState({ manifest, skills, selectedSkills, retainedStaleSkills, promptTemplates, commandTemplates, managedFiles }) {
  return {
    schema_version: 1,
    installer: "agent-spectrum-codex-adapter",
    source: {
      name: manifest.name ?? "agent-spectrum-kernel",
      version: manifest.version ?? null,
      git_revision: readGitRevision(),
    },
    target: {
      kernel: "AGENTS.md",
      skills_root: ".agents/skills",
      prompts_root: ".agents/prompts",
      commands_root: ".agents/commands",
    },
    installed_skills: skills,
    selected_skills: selectedSkills,
    retained_stale_skills: retainedStaleSkills,
    prompt_templates: promptTemplates,
    command_templates: commandTemplates,
    managed_files: managedFiles,
  };
}

function previousManagedRecord(previousState, relativePath) {
  const record = previousState?.managed_files?.[relativePath];
  if (!record || typeof record.sha256 !== "string") {
    return null;
  }
  return record;
}

function planPruneManagedFile({ operations, previousState, target, relativePath, skill }) {
  const record = previousManagedRecord(previousState, relativePath);
  if (!record) {
    throw new Error(`missing managed file record; refusing to prune: ${relativePath}`);
  }

  const destination = resolve(target, relativePath);
  if (!existsSync(destination)) {
    return;
  }
  const currentHash = hashText(readText(destination));
  if (currentHash !== record.sha256) {
    throw new Error(`modified managed file; refusing to prune: ${relativePath}`);
  }

  planDeleteFile(operations, destination, `stale Codex managed projection:${skill}`);
  planRemoveEmptyDirectory(operations, dirname(destination), `empty stale Codex managed projection directory:${skill}`);
}

function buildPlan(args) {
  const manifest = readManifest();
  const manifestSkills = [...manifest.skills].sort();
  const skills = [...(args.skills ?? manifestSkills)].sort();
  validateSkillNames(skills, manifestSkills);

  const previousState = readPreviousState(args.target);
  const previousSkillNames = (Array.isArray(previousState?.installed_skills) ? previousState.installed_skills : []).filter((skill) =>
    typeof skill === "string" && SKILL_NAME_PATTERN.test(skill),
  );
  const previousSkills = new Set(previousSkillNames);
  const selectedSkills = new Set(skills);
  const staleSkills = [...previousSkills].filter((skill) => !selectedSkills.has(skill)).sort();
  const operations = [];
  const managedFiles = {};

  if (!args.skipAgents) {
    const agentsSource = resolve(REPO_ROOT, "AGENTS.md");
    ensureSource(agentsSource, "AGENTS.md");
    const agentsDestination = resolve(args.target, "AGENTS.md");
    const agentsBlock = buildAgentsBlock(readText(agentsSource));
    const agentsContent = existsSync(agentsDestination)
      ? replaceOrAppendManagedBlock(readText(agentsDestination), agentsBlock, args.mergeAgents)
      : agentsBlock;
    managedFiles["AGENTS.md"] = { kind: "kernel", sha256: hashText(agentsContent) };
    planWrite(operations, agentsDestination, agentsContent, "kernel");
  }

  for (const skill of skills) {
    const source = resolve(REPO_ROOT, "skills", skill, "SKILL.md");
    ensureSource(source, `skills/${skill}/SKILL.md`);
    const content = readText(source);
    const relativePath = `.agents/skills/${skill}/SKILL.md`;
    const destination = resolve(args.target, relativePath);
    if (args.noOverwriteSkills && existsSync(destination) && readText(destination) !== content) {
      throw new Error(`Projected Codex skill already exists and would be overwritten: ${relativePath}`);
    }
    managedFiles[relativePath] = { kind: "codex_skill", skill, sha256: hashText(content) };
    planWrite(operations, destination, content, `codex_skill:${skill}`);
  }

  const promptTemplates = args.skipPrompts ? [] : PROMPT_TEMPLATES;
  const commandTemplates = args.skipCommand ? [] : COMMAND_TEMPLATES;

  if (!args.skipPrompts) {
    for (const prompt of promptTemplates) {
      const source = resolve(REPO_ROOT, "adapters/codex/prompts", prompt);
      ensureSource(source, `adapters/codex/prompts/${prompt}`);
      const content = readText(source);
      const relativePath = `.agents/prompts/${prompt}`;
      managedFiles[relativePath] = { kind: "codex_prompt", prompt, sha256: hashText(content) };
      planWrite(operations, resolve(args.target, relativePath), content, `codex_prompt:${prompt}`);
    }
  }

  if (!args.skipCommand) {
    for (const command of commandTemplates) {
      const source = resolve(REPO_ROOT, "adapters/codex/commands", command);
      ensureSource(source, `adapters/codex/commands/${command}`);
      const content = readText(source);
      const relativePath = `.agents/commands/${command}`;
      managedFiles[relativePath] = { kind: "codex_command", command, sha256: hashText(content) };
      planWrite(operations, resolve(args.target, relativePath), content, `codex_command:${command}`);
    }
  }

  for (const skill of staleSkills) {
    const relativePath = `.agents/skills/${skill}/SKILL.md`;
    if (args.prune) {
      planPruneManagedFile({ operations, previousState, target: args.target, relativePath, skill });
    } else {
      const record = previousManagedRecord(previousState, relativePath);
      if (record) {
        managedFiles[relativePath] = { ...record, kind: "stale_codex_skill", skill };
      }
    }
  }

  const stateSkills = args.prune ? skills : [...new Set([...skills, ...staleSkills])].sort();
  const retainedStaleSkills = args.prune ? [] : staleSkills;
  const state = buildState({ manifest, skills: stateSkills, selectedSkills: skills, retainedStaleSkills, promptTemplates, commandTemplates, managedFiles });
  const stateContent = `${JSON.stringify(state, null, 2)}\n`;
  planWrite(operations, resolve(args.target, STATE_PATH), stateContent, "codex_install_state");

  return { operations, staleSkills, state };
}

function applyOperations(operations, dryRun) {
  if (dryRun) {
    return;
  }
  for (const operation of operations) {
    if (operation.kind === "write") {
      mkdirSync(dirname(operation.destination), { recursive: true });
      writeFileSync(operation.destination, operation.content);
    } else if (operation.kind === "delete_file") {
      if (existsSync(operation.destination)) {
        unlinkSync(operation.destination);
      }
    } else if (operation.kind === "remove_empty_dir") {
      if (existsSync(operation.destination) && statSync(operation.destination).isDirectory() && readdirSync(operation.destination).length === 0) {
        rmdirSync(operation.destination);
      }
    }
  }
}

function printPlan(args, plan) {
  const label = args.dryRun ? "Codex adapter installer dry run" : "Codex adapter installed";
  console.log(`${label}: ${args.target}`);
  for (const operation of plan.operations) {
    const marker = operation.kind === "delete_file" ? "delete" : operation.kind === "remove_empty_dir" ? "rmdir-if-empty" : operation.unchanged ? "unchanged" : "write";
    console.log(`- ${marker}: ${relative(args.target, operation.destination)} (${operation.reason})`);
  }
  for (const skill of plan.staleSkills) {
    const action = args.prune ? "pruned" : "stale Codex managed projection";
    console.log(`- ${action}: .agents/skills/${skill}`);
  }
  console.log("Safety defaults: local Codex file projection only; no hooks, telemetry, secrets, deploys, external publication, or Git commands.");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildPlan(args);
  applyOperations(plan.operations, args.dryRun);
  printPlan(args, plan);
}

try {
  main();
} catch (error) {
  console.error(`install-codex-adapter failed: ${error.message}`);
  process.exit(1);
}
