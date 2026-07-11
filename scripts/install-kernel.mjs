#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAgentsBlock,
  buildLifecycleState,
  createManagedBlockRecord,
  createManagedFileRecord,
  createRollbackSnapshot,
  detachLifecycleState,
  hashText,
  planDeleteManaged,
  planRemoveEmptyDirectory,
  planWriteManaged,
  planWriteManagedBlock,
  printOperations,
  readGitRevision,
  readJson,
  readText,
  replaceOrAppendManagedBlock,
  rollbackLifecycleState,
  applyLifecyclePlan,
} from "./installer-lifecycle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const MANAGED_START = "<!-- agent-spectrum-kernel:start -->";
const MANAGED_END = "<!-- agent-spectrum-kernel:end -->";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    skills: null,
    mergeAgents: false,
    skipCustomInstructions: false,
    noOverwriteSkills: false,
    prune: false,
    force: false,
    check: false,
    rollback: false,
    detach: false,
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
    } else if (arg === "--skip-custom-instructions") {
      args.skipCustomInstructions = true;
    } else if (arg === "--no-overwrite-skills") {
      args.noOverwriteSkills = true;
    } else if (arg === "--prune") {
      args.prune = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--rollback") {
      args.rollback = true;
    } else if (arg === "--detach" || arg === "--uninstall") {
      args.detach = true;
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
  console.log(`Usage: node scripts/install-kernel.mjs [options]

Options:
  --target <path>              Adopting project root. Defaults to cwd.
  --skills <csv>               Comma-separated core skills to project. Defaults to manifest.json.skills.
  --merge-agents               Add or update the managed block in an existing AGENTS.md.
  --skip-custom-instructions   Do not project CUSTOM_INSTRUCTIONS.md.
  --no-overwrite-skills        Fail when an existing projected skill would be overwritten.
  --prune                      Delete stale managed SKILL.md files from the previous install state.
  --force                      Overwrite locally modified managed files.
  --check                      Validate the update plan without changing files.
  --rollback                   Restore the previous successful managed snapshot.
  --detach, --uninstall        Remove ASK-managed execution surfaces and mark the install detached.
  --dry-run                    Print planned changes without changing files.
  -h, --help                   Show this help.

Default mode is three-way update safe: a managed file is updated only when the
target still matches the previous managed hash, unless --force is used.
AGENTS.md ownership is limited to the managed block, so project-local content is
preserved. Prune and detach delete only managed files whose hashes still match
the previous install state unless --force is used.
`);
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

function buildState({ manifest, skills, selectedSkills, retainedStaleSkills, managedFiles, managedBlocks, previousState, rollback, hasMutations }) {
  return buildLifecycleState({
    manifest,
    repoRoot: REPO_ROOT,
    adapterName: "agent-spectrum-kernel",
    adapterVersion: 3,
    selectedProfile: "core",
    target: {
      kernel: "AGENTS.md",
      copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
      skills_root: "skills",
    },
    installedSkills: skills,
    selectedSkills,
    managedFiles,
    managedBlocks,
    previousState,
    rollback,
    hasMutations,
    extra: {
      retained_stale_skills: retainedStaleSkills,
    },
  });
}

function previousManagedRecord(previousState, relativePath) {
  const record = previousState?.managed_files?.[relativePath];
  if (!record || typeof record.sha256 !== "string") {
    return null;
  }
  return record;
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
  const managedBlocks = {};
  const rollback = createRollbackSnapshot();

  const agentsSource = resolve(REPO_ROOT, "AGENTS.md");
  ensureSource(agentsSource, "AGENTS.md");
  const agentsDestination = resolve(args.target, "AGENTS.md");
  const agentsBlock = buildAgentsBlock(readText(agentsSource));
  let agentsContent;
  if (existsSync(agentsDestination)) {
    agentsContent = replaceOrAppendManagedBlock(readText(agentsDestination), agentsBlock, args.mergeAgents);
  } else {
    agentsContent = agentsBlock;
  }
  managedBlocks["AGENTS.md#agent-spectrum-kernel"] = createManagedBlockRecord({
    path: "AGENTS.md",
    marker: "agent-spectrum-kernel",
    content: agentsBlock.trimEnd(),
  });
  planWriteManagedBlock(operations, {
    target: args.target,
    relativePath: "AGENTS.md",
    blockKey: "AGENTS.md#agent-spectrum-kernel",
    content: agentsContent,
    reason: "kernel",
    previousState,
    force: args.force,
    rollback,
  });

  if (!args.skipCustomInstructions) {
    const customSource = resolve(REPO_ROOT, "CUSTOM_INSTRUCTIONS.md");
    ensureSource(customSource, "CUSTOM_INSTRUCTIONS.md");
    const customContent = readText(customSource);
    managedFiles["CUSTOM_INSTRUCTIONS.md"] = createManagedFileRecord({ kind: "copy_paste_kernel", content: customContent });
    planWriteManaged(operations, {
      target: args.target,
      relativePath: "CUSTOM_INSTRUCTIONS.md",
      content: customContent,
      reason: "copy_paste_kernel",
      previousState,
      force: args.force,
      rollback,
    });
  }

  const signalRegistrySource = resolve(REPO_ROOT, "schemas/review-signal-gate-map.json");
  ensureSource(signalRegistrySource, "schemas/review-signal-gate-map.json");
  const signalRegistryContent = readText(signalRegistrySource);
  managedFiles["schemas/review-signal-gate-map.json"] = createManagedFileRecord({ kind: "signal_registry", content: signalRegistryContent });
  planWriteManaged(operations, {
    target: args.target,
    relativePath: "schemas/review-signal-gate-map.json",
    content: signalRegistryContent,
    reason: "signal_registry",
    previousState,
    force: args.force,
    rollback,
  });

  for (const skill of skills) {
    const source = resolve(REPO_ROOT, "skills", skill, "SKILL.md");
    ensureSource(source, `skills/${skill}/SKILL.md`);
    const content = readText(source);
    const relativePath = `skills/${skill}/SKILL.md`;
    const destination = resolve(args.target, relativePath);
    if (args.noOverwriteSkills && existsSync(destination) && readText(destination) !== content) {
      throw new Error(`Projected skill already exists and would be overwritten: ${relativePath}`);
    }
    managedFiles[relativePath] = createManagedFileRecord({ kind: "skill", skill, content });
    planWriteManaged(operations, {
      target: args.target,
      relativePath,
      content,
      reason: `skill:${skill}`,
      previousState,
      force: args.force,
      rollback,
    });
  }

  for (const skill of staleSkills) {
    const relativePath = `skills/${skill}/SKILL.md`;
    if (args.prune) {
      planDeleteManaged(operations, { target: args.target, relativePath, previousState, force: args.force, rollback, reason: `stale managed projection:${skill}` });
      planRemoveEmptyDirectory(operations, args.target, dirname(relativePath), `empty stale managed projection directory:${skill}`);
    } else {
      const record = previousManagedRecord(previousState, relativePath);
      if (record) {
        managedFiles[relativePath] = { ...record, kind: "stale_skill", skill };
      }
    }
  }

  const stateSkills = args.prune ? skills : [...new Set([...skills, ...staleSkills])].sort();
  const retainedStaleSkills = args.prune ? [] : staleSkills;
  const state = buildState({ manifest, skills: stateSkills, selectedSkills: skills, retainedStaleSkills, managedFiles, managedBlocks, previousState, rollback, hasMutations: operations.some((operation) => !operation.unchanged) });

  return { operations, staleSkills, state };
}

function printPlan(args, plan) {
  const label = args.check ? "Kernel installer check" : args.dryRun ? "Kernel installer dry run" : "Kernel installed";
  console.log(`${label}: ${args.target}`);
  printOperations(args.target, plan.operations);
  console.log(`- write: ${STATE_PATH} (install_state)`);
  for (const skill of plan.staleSkills) {
    const action = args.prune ? "pruned" : "stale managed projection";
    console.log(`- ${action}: skills/${skill}`);
  }
  console.log("Safety defaults: local file projection only; no hooks, telemetry, secrets, deploys, external publication, or Git commands.");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.rollback) {
    const operations = rollbackLifecycleState({ target: args.target, statePath: STATE_PATH, dryRun: args.dryRun || args.check, force: args.force });
    console.log(`${args.dryRun || args.check ? "Kernel rollback dry run" : "Kernel rolled back"}: ${args.target}`);
    printOperations(args.target, operations);
    return;
  }
  if (args.detach) {
    const operations = detachLifecycleState({ target: args.target, statePath: STATE_PATH, dryRun: args.dryRun || args.check, force: args.force });
    console.log(`${args.dryRun || args.check ? "Kernel detach dry run" : "Kernel detached"}: ${args.target}`);
    printOperations(args.target, operations);
    return;
  }
  const plan = buildPlan(args);
  applyLifecyclePlan({ target: args.target, statePath: STATE_PATH, operations: plan.operations, state: plan.state, dryRun: args.dryRun || args.check });
  printPlan(args, plan);
}

try {
  main();
} catch (error) {
  console.error(`install-kernel failed: ${error.message}`);
  process.exit(1);
}
