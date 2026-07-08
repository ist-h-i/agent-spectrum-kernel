#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  REPO_ROOT,
  findPrivacyStorageConcerns,
  findUnsupportedCapabilityClaims,
  hashFile,
  readJsonIfExists,
} from "./ask-shared.mjs";

const CORE_STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const CODEX_STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = resolve(argv[++index]);
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
  console.log(`Usage: node scripts/ask-doctor.mjs --target /path/to/adopting-repo

Checks Agent Spectrum Kernel installation health without mutating files.
Doctor is an adoption/update health check, not a per-task execution gate.
Exit code 1 means installation health failed; it does not prohibit normal
read-only investigation or local verification.
`);
}

function buildDoctorReport(target) {
  const report = {
    installed: [],
    warnings: [],
    failures: [],
    unsupportedClaims: [],
  };

  checkManagedInstallState({
    target,
    statePath: CORE_STATE_PATH,
    label: "core kernel",
    targetSkillsRoot: "skills",
    report,
  });

  checkManagedInstallState({
    target,
    statePath: CODEX_STATE_PATH,
    label: "Codex adapter",
    targetSkillsRoot: ".agents/skills",
    report,
    optional: true,
  });

  checkClaudeAdapter(target, report);
  checkUnsupportedClaims(target, report);
  checkPrivacyDefaults(target, report);

  const status = report.failures.length > 0 ? "fail" : report.warnings.length > 0 || report.unsupportedClaims.length > 0 ? "warn" : "pass";
  return { ...report, status };
}

function checkManagedInstallState({ target, statePath, label, targetSkillsRoot, report, optional = false }) {
  const absoluteStatePath = resolve(target, statePath);
  const stateResult = readJsonIfExists(absoluteStatePath);
  if (!stateResult.ok) {
    const message = `${label} install state is ${stateResult.error === "missing" ? "missing" : `invalid: ${stateResult.error}`}: ${statePath}`;
    if (optional) {
      report.installed.push(`${label}: not installed`);
    } else {
      report.failures.push(message);
    }
    return;
  }

  const state = stateResult.value;
  report.installed.push(`${label}: install state present (${statePath})`);
  if (!state || typeof state !== "object" || !Array.isArray(state.installed_skills) || !state.managed_files || typeof state.managed_files !== "object") {
    report.failures.push(`${label} install state has invalid shape: ${statePath}`);
    return;
  }

  for (const skill of state.selected_skills ?? []) {
    const skillPath = resolve(target, targetSkillsRoot, skill, "SKILL.md");
    if (!existsSync(skillPath)) {
      report.failures.push(`${label} selected skill is missing: ${relative(target, skillPath)}`);
    }
  }

  for (const skill of state.retained_stale_skills ?? []) {
    report.warnings.push(`${label} retained stale managed skill projection: ${skill}`);
  }

  for (const [managedPath, record] of Object.entries(state.managed_files)) {
    const destination = resolve(target, managedPath);
    if (!existsSync(destination)) {
      report.failures.push(`${label} managed file is missing: ${managedPath}`);
      continue;
    }
    if (!record || typeof record.sha256 !== "string") {
      report.failures.push(`${label} managed file record is missing sha256: ${managedPath}`);
      continue;
    }
    const currentHash = hashFile(destination);
    if (currentHash !== record.sha256) {
      report.failures.push(`${label} managed file hash mismatch: ${managedPath}`);
      continue;
    }
    const sourcePath = sourcePathForManagedRecord(managedPath, record);
    if (sourcePath && existsSync(sourcePath) && currentHash !== hashFile(sourcePath)) {
      report.warnings.push(`${label} managed file is stale relative to this ASK checkout: ${managedPath}`);
    }
  }
}

function sourcePathForManagedRecord(managedPath, record) {
  if (record.kind === "kernel" && managedPath === "AGENTS.md") {
    return null;
  }
  if (record.kind === "copy_paste_kernel" && managedPath === "CUSTOM_INSTRUCTIONS.md") {
    return resolve(REPO_ROOT, "CUSTOM_INSTRUCTIONS.md");
  }
  if ((record.kind === "skill" || record.kind === "stale_skill") && record.skill) {
    return resolve(REPO_ROOT, "skills", record.skill, "SKILL.md");
  }
  if ((record.kind === "codex_skill" || record.kind === "stale_codex_skill") && record.skill) {
    return resolve(REPO_ROOT, "skills", record.skill, "SKILL.md");
  }
  if (record.kind === "codex_prompt" && record.prompt) {
    return resolve(REPO_ROOT, "adapters/codex/prompts", record.prompt);
  }
  if (record.kind === "codex_command" && record.command) {
    return resolve(REPO_ROOT, "adapters/codex/commands", record.command);
  }
  return null;
}

function checkClaudeAdapter(target, report) {
  const claudeRoot = resolve(target, ".claude");
  if (!existsSync(claudeRoot)) {
    report.installed.push("Claude adapter: not installed");
    return;
  }
  report.installed.push("Claude adapter: .claude directory present");

  const requiredCommandDir = resolve(REPO_ROOT, "adapters/claude-code/project/.claude/commands");
  if (existsSync(requiredCommandDir)) {
    for (const entry of readdirSync(requiredCommandDir).sort()) {
      if (!entry.endsWith(".md")) {
        continue;
      }
      const targetPath = resolve(target, ".claude/commands", entry);
      if (!existsSync(targetPath)) {
        report.failures.push(`Claude adapter command is missing: .claude/commands/${entry}`);
      }
    }
  }

  const hooksPath = resolve(target, ".claude/hooks/hooks.json");
  if (existsSync(hooksPath)) {
    try {
      const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
      const serialized = JSON.stringify(hooks);
      if (/https?:\/\//i.test(serialized) || /webhook/i.test(serialized)) {
        report.failures.push("Claude adapter hooks contain an enabled external destination or webhook reference");
      }
    } catch (error) {
      report.failures.push(`Claude adapter hooks are invalid JSON: ${error.message}`);
    }
  }
}

function checkUnsupportedClaims(target, report) {
  const claims = findUnsupportedCapabilityClaims(target);
  for (const claim of claims) {
    report.unsupportedClaims.push(`${claim.file}: ${claim.adapter} ${claim.capability} is ${claim.status}, but text claims full support`);
  }
}

function checkPrivacyDefaults(target, report) {
  const concerns = findPrivacyStorageConcerns(target);
  for (const concern of concerns) {
    report.failures.push(`privacy default concern: ${concern.file} contains ${concern.id}`);
  }
}

function printReport(target, report) {
  console.log(`ASK doctor: ${report.status}`);
  console.log("");
  console.log("Installed:");
  printList(report.installed);
  console.log("");
  console.log("Warnings:");
  printList(report.warnings);
  console.log("");
  console.log("Failures:");
  printList(report.failures);
  console.log("");
  console.log("Unsupported claims:");
  printList(report.unsupportedClaims);
  console.log("");
  console.log("Next:");
  if (report.failures.length > 0) {
    console.log("- Downgrade installation/readiness claims until failures are fixed.");
    console.log("- Re-run the relevant ASK installer or restore the missing/modified managed files.");
  } else if (report.warnings.length > 0 || report.unsupportedClaims.length > 0) {
    console.log("- Treat setup as usable with warnings; refresh projections or downgrade claims before reporting readiness.");
  } else {
    console.log("- Installation health check passed for the inspected files.");
  }
  console.log("- Doctor is not a per-task gate; safe read-only investigation and local verification may continue.");
  console.log("- Exit code 1 means installation health failed; it does not prohibit normal read-only investigation or local verification.");
  console.log(`- Target inspected: ${target}`);
}

function printList(items) {
  if (items.length === 0) {
    console.log("- none");
    return;
  }
  for (const item of items) {
    console.log(`- ${item}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.target) || !statSync(args.target).isDirectory()) {
    throw new Error(`Target is not a directory: ${args.target}`);
  }
  const report = buildDoctorReport(args.target);
  printReport(args.target, report);
  process.exit(report.status === "fail" ? 1 : 0);
} catch (error) {
  console.error(`ASK doctor failed: ${error.message}`);
  process.exit(1);
}
