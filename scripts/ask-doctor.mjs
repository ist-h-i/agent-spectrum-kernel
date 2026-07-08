#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  REPO_ROOT,
  collectTextFiles,
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
    runtimeProbe: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = resolve(argv[++index]);
    } else if (arg === "--runtime-probe") {
      args.runtimeProbe = true;
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
  console.log(`Usage: node scripts/ask-doctor.mjs --target /path/to/adopting-repo [--runtime-probe]

Checks Agent Spectrum Kernel installation health without mutating files.
Doctor is an adoption/update health check, not a per-task execution gate.
Exit code 1 means installation health failed; it does not prohibit normal
read-only investigation or local verification.

Optional --runtime-probe adds local/static/dry-run adapter conformance checks.
Runtime probe findings downgrade runtime conformance/readiness claims only; they
do not prove external Claude/Codex execution or product readiness.
`);
}

function buildDoctorReport(target, { runtimeProbe = false } = {}) {
  const report = {
    installed: [],
    warnings: [],
    failures: [],
    unsupportedClaims: [],
    runtimeProbe: {
      enabled: runtimeProbe,
      checked: [],
      warnings: [],
      failures: [],
    },
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
  if (runtimeProbe) {
    checkRuntimeConformanceProbe(target, report);
  }

  const runtimeFindings = report.runtimeProbe.warnings.length > 0 || report.runtimeProbe.failures.length > 0;
  const status = report.failures.length > 0 ? "fail" : report.warnings.length > 0 || report.unsupportedClaims.length > 0 || runtimeFindings ? "warn" : "pass";
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

function checkRuntimeConformanceProbe(target, report) {
  const probe = report.runtimeProbe;
  probe.checked.push("runtime probe is local/static/dry-run only; it does not invoke external adapter runtimes");

  const claudeRoot = resolve(target, ".claude");
  if (existsSync(claudeRoot)) {
    probe.checked.push("Claude adapter runtime surface detected");
    checkReadableDirectory(resolve(target, ".claude/commands"), ".claude/commands", probe);
    checkReadableDirectory(resolve(target, ".claude/skills"), ".claude/skills", probe, { optional: true });
    checkProjectedSkills(resolve(target, ".claude/skills"), ".claude/skills", probe);
    checkClaudeHooksShape(resolve(target, ".claude/hooks/hooks.json"), probe);
  }

  const agentsRoot = resolve(target, ".agents");
  const codexState = readJsonIfExists(resolve(target, CODEX_STATE_PATH));
  if (existsSync(agentsRoot) || codexState.ok) {
    probe.checked.push("Codex adapter runtime surface detected");
    checkReadableDirectory(resolve(target, ".agents/skills"), ".agents/skills", probe);
    checkReadableDirectory(resolve(target, ".agents/prompts"), ".agents/prompts", probe, { optional: true });
    checkReadableDirectory(resolve(target, ".agents/commands"), ".agents/commands", probe, { optional: true });
    checkProjectedSkills(resolve(target, ".agents/skills"), ".agents/skills", probe);
    if (codexState.ok) {
      checkCodexRuntimeState(target, codexState.value, probe);
    }
  }

  checkRuntimeCommandReferences(target, probe);
  checkProjectOverlayContradictions(target, probe);

  if (probe.checked.length === 1) {
    probe.checked.push("No projected adapter runtime surfaces detected");
  }
}

function checkReadableDirectory(path, label, probe, { optional = false } = {}) {
  if (!existsSync(path)) {
    const message = `runtime directory is missing: ${label}`;
    if (optional) {
      probe.warnings.push(message);
    } else {
      probe.failures.push(message);
    }
    return false;
  }
  try {
    if (!statSync(path).isDirectory()) {
      probe.failures.push(`runtime path is not a directory: ${label}`);
      return false;
    }
    readdirSync(path);
    return true;
  } catch (error) {
    probe.failures.push(`runtime directory is not readable: ${label}: ${error.message}`);
    return false;
  }
}

function checkProjectedSkills(skillsRoot, label, probe) {
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) {
    return;
  }
  for (const entry of readdirSync(skillsRoot).sort()) {
    const skillDir = resolve(skillsRoot, entry);
    if (!statSync(skillDir).isDirectory()) {
      continue;
    }
    const skillPath = resolve(skillDir, "SKILL.md");
    const relativeSkillPath = `${label}/${entry}/SKILL.md`;
    if (!existsSync(skillPath)) {
      probe.failures.push(`projected skill is missing readable SKILL.md: ${relativeSkillPath}`);
      continue;
    }
    try {
      const content = readFileSync(skillPath, "utf8");
      if (!content.trim()) {
        probe.failures.push(`projected skill SKILL.md is empty: ${relativeSkillPath}`);
      }
    } catch (error) {
      probe.failures.push(`projected skill SKILL.md is not readable: ${relativeSkillPath}: ${error.message}`);
    }
  }
}

function checkClaudeHooksShape(hooksPath, probe) {
  if (!existsSync(hooksPath)) {
    return;
  }
  let hooksConfig;
  try {
    hooksConfig = JSON.parse(readFileSync(hooksPath, "utf8"));
  } catch (error) {
    probe.failures.push(`Claude adapter hooks shape is invalid: .claude/hooks/hooks.json: ${error.message}`);
    return;
  }

  const hooks = hooksConfig?.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
    probe.failures.push("Claude adapter hooks shape is invalid: .claude/hooks/hooks.json");
    return;
  }
  for (const [eventName, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      probe.failures.push(`Claude adapter hooks shape is invalid: .claude/hooks/hooks.json (${eventName} must be an array)`);
      continue;
    }
    for (const [groupIndex, group] of groups.entries()) {
      if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) {
        probe.failures.push(`Claude adapter hooks shape is invalid: .claude/hooks/hooks.json (${eventName}[${groupIndex}].hooks must be an array)`);
        continue;
      }
      for (const [hookIndex, hook] of group.hooks.entries()) {
        if (!hook || typeof hook !== "object" || typeof hook.type !== "string") {
          probe.failures.push(`Claude adapter hooks shape is invalid: .claude/hooks/hooks.json (${eventName}[${groupIndex}].hooks[${hookIndex}] must include a string type)`);
          continue;
        }
        if (hook.type === "command" && typeof hook.command !== "string") {
          probe.failures.push(`Claude adapter hooks shape is invalid: .claude/hooks/hooks.json (${eventName}[${groupIndex}].hooks[${hookIndex}] command must be a string)`);
        }
      }
    }
  }
}

function checkCodexRuntimeState(target, state, probe) {
  if (!state || typeof state !== "object") {
    probe.failures.push(`Codex adapter runtime state shape is invalid: ${CODEX_STATE_PATH}`);
    return;
  }
  for (const skill of state.selected_skills ?? []) {
    const skillPath = resolve(target, ".agents/skills", skill, "SKILL.md");
    if (!existsSync(skillPath)) {
      probe.failures.push(`Codex runtime selected skill is not readable: .agents/skills/${skill}/SKILL.md`);
    }
  }
  for (const prompt of state.prompt_templates ?? []) {
    const promptPath = resolve(target, ".agents/prompts", prompt);
    if (!existsSync(promptPath)) {
      probe.failures.push(`Codex runtime prompt template is missing: .agents/prompts/${prompt}`);
    }
  }
  for (const command of state.command_templates ?? []) {
    const commandPath = resolve(target, ".agents/commands", command);
    if (!existsSync(commandPath)) {
      probe.failures.push(`Codex runtime command template is missing: .agents/commands/${command}`);
    }
  }
}

function checkRuntimeCommandReferences(target, probe) {
  const files = collectTextFiles(target, ["README.md", "AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "docs", ".claude", ".agents"]);
  const references = new Set();
  for (const file of files) {
    const text = readFileSync(resolve(target, file), "utf8");
    for (const match of text.matchAll(/(?:\.claude|\.agents)\/(?:commands|prompts)\/[A-Za-z0-9._/-]+\.md/g)) {
      references.add(match[0]);
    }
  }
  for (const reference of [...references].sort()) {
    if (!existsSync(resolve(target, reference))) {
      probe.failures.push(`runtime command/template reference is missing: ${reference}`);
    }
  }
}

function checkProjectOverlayContradictions(target, probe) {
  const files = collectTextFiles(target, ["AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "docs"], [".md", ".txt"]);
  for (const file of files) {
    const text = readFileSync(resolve(target, file), "utf8");
    const units = text.split(/\r?\n|(?<=[.!?])\s+/u).map((unit) => unit.trim()).filter(Boolean);
    for (const unit of units) {
      if (/\b(?:skip|bypass|disable|ignore|not require|no need for)\b.{0,80}\b(?:risk-gate|verification|evidence-ledger|evidence)\b/i.test(unit)) {
        probe.warnings.push(`possible project-overlay contradiction: ${file}: ${unit}`);
      }
    }
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
  console.log(`Runtime conformance probe: ${report.runtimeProbe.enabled ? "enabled" : "disabled"}`);
  if (report.runtimeProbe.enabled) {
    console.log("Runtime checked:");
    printList(report.runtimeProbe.checked);
    console.log("Runtime warnings:");
    printList(report.runtimeProbe.warnings);
    console.log("Runtime failures:");
    printList(report.runtimeProbe.failures);
    console.log("Runtime boundary:");
    console.log("- Runtime probe is local/static/dry-run only and does not prove external adapter execution or product readiness.");
    console.log("- Runtime probe findings downgrade runtime conformance/readiness claims only.");
    console.log("");
  }
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
  const report = buildDoctorReport(args.target, { runtimeProbe: args.runtimeProbe });
  printReport(args.target, report);
  process.exit(report.status === "fail" ? 1 : 0);
} catch (error) {
  console.error(`ASK doctor failed: ${error.message}`);
  process.exit(1);
}
