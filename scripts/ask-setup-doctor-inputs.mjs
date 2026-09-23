import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { readSetupJson } from "./ask-setup-diagnostics.mjs";
import { validateSetupGitMetadata } from "./ask-setup-git.mjs";
import { safeLstat, validateSetupPaths } from "./ask-setup-inputs.mjs";

// ask-doctor's non-probe mode scans these namespaces even without install state.
// Keep this read boundary separate from the narrower installation snapshot.
const DOCTOR_TARGET_ROOTS = [
  "README.md", "AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "docs", "adapters",
  ".claude", ".agents", ".agent-spectrum-kernel",
];
const STATE_SPECS = [
  [".agent-spectrum-kernel/install-state.json", "skills"],
  [".agent-spectrum-kernel/codex-install-state.json", ".agents/skills"],
  [".agent-spectrum-kernel/claude-install-state.json", ".claude/skills"],
];

function referencePath(value, prefix = "", suffix = "") {
  if (typeof value !== "string" || !value) throw new Error("Invalid doctor input reference.");
  return `${prefix}${value}${suffix}`;
}

// Mirror only sourcePathForManagedRecord's read destinations, not installation
// policy or ownership. Never let state-controlled components escape the source.
function managedSourcePath(path, record) {
  if (!record || typeof record !== "object") return null;
  if (record.kind === "copy_paste_kernel" && path === "CUSTOM_INSTRUCTIONS.md") return "CUSTOM_INSTRUCTIONS.md";
  if (["skill", "stale_skill", "codex_skill", "stale_codex_skill", "claude_skill", "stale_claude_skill"].includes(record.kind) && record.skill) {
    return referencePath(record.skill, "skills/", "/SKILL.md");
  }
  if (record.kind === "claude_command" && record.command) return referencePath(record.command, "adapters/claude-code/project/.claude/commands/");
  if (["claude_runtime", "codex_runtime", "stale_codex_runtime"].includes(record.kind) && record.script) return referencePath(record.script, "scripts/");
  if (record.kind === "claude_config" && record.config) return referencePath(record.config);
  if (record.kind === "claude_asset" && record.asset) return referencePath(record.asset);
  if (["codex_prompt", "stale_codex_prompt"].includes(record.kind) && record.prompt) return referencePath(record.prompt, "adapters/codex/prompts/");
  if (["codex_command", "stale_codex_command"].includes(record.kind) && record.generated !== true && record.command) {
    return referencePath(record.command, "adapters/codex/commands/");
  }
  return null;
}

export function validateSetupDoctorInputs(target, sourceRoot) {
  const root = realpathSync(target);
  const source = realpathSync(sourceRoot);
  // Do not read a settings file, state file, or log before checking its parents.
  validateSetupPaths(root, DOCTOR_TARGET_ROOTS);
  const gitDir = validateSetupGitMetadata(root);
  if (gitDir) validateSetupPaths(gitDir, ["agent-spectrum-kernel/runtime-health.jsonl"]);
  validateSetupGitMetadata(source);
  const targetPaths = [];
  const sourcePaths = ["docs/adapter-capability-matrix.md"];
  for (const [statePath, skillsRoot] of STATE_SPECS) {
    if (!safeLstat(resolve(root, statePath))) continue;
    let state;
    try {
      state = readSetupJson(resolve(root, statePath));
    } catch {
      // Malformed JSON remains a doctor health failure, with redacted diagnostics.
      continue;
    }
    if (!state || typeof state !== "object") continue;
    for (const [path, record] of Object.entries(state.managed_files ?? {})) {
      targetPaths.push(path);
      const sourcePath = managedSourcePath(path, record);
      if (sourcePath) sourcePaths.push(sourcePath);
    }
    for (const record of Object.values(state.managed_blocks ?? {})) {
      if (record?.path) targetPaths.push(referencePath(record.path));
    }
    for (const skill of Array.isArray(state.selected_skills) ? state.selected_skills : []) {
      targetPaths.push(referencePath(skill, `${skillsRoot}/`, "/SKILL.md"));
    }
  }
  // These checks inspect metadata only; project content is never added to output.
  validateSetupPaths(root, targetPaths);
  validateSetupPaths(source, sourcePaths);
}
