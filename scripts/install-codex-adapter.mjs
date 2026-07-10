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
const DEFAULT_PROFILE = "implementation";
const PROMPT_TEMPLATES = [
  "skill-implement.md",
  "skill-investigate.md",
  "skill-review.md",
  "skill-verify.md",
  "skill-handoff.md",
];
const COMMAND_TEMPLATES = ["codex-exec.md"];

const PROMPT_METADATA = {
  "skill-implement.md": {
    label: "Implementation",
    sandbox: "workspace-write",
    requiredSkills: ["operating-mode-router", "skill-router", "controlled-implementation", "test-first-verification", "evidence-ledger", "risk-gate"],
    recommendedSkills: ["spec-driven-development", "requirement-grill", "work-package-compiler"],
  },
  "skill-investigate.md": {
    label: "Investigation",
    sandbox: "workspace-write",
    requiredSkills: ["operating-mode-router", "skill-router", "doubt-driven-development", "test-first-verification", "controlled-implementation", "evidence-ledger", "risk-gate"],
    recommendedSkills: [],
  },
  "skill-review.md": {
    label: "Review",
    sandbox: "read-only",
    requiredSkills: ["review-router", "review-final-merge-gate", "evidence-ledger", "risk-gate"],
    recommendedSkills: [
      "review-automated-gate",
      "review-ai-quality",
      "review-code-health",
      "review-domain-impact",
      "review-architecture-impact",
      "review-output-quality",
      "review-adversarial-risk",
      "review-finding-compiler",
      "improvement-ledger",
    ],
  },
  "skill-verify.md": {
    label: "Verification",
    sandbox: "workspace-write",
    requiredSkills: ["test-first-verification", "evidence-ledger"],
    recommendedSkills: [],
  },
  "skill-handoff.md": {
    label: "Handoff",
    sandbox: "read-only",
    requiredSkills: ["handoff-generation", "evidence-ledger"],
    recommendedSkills: [],
  },
};

const SKILL_RELATIONSHIPS = {
  "controlled-implementation": {
    requires: ["test-first-verification"],
    recommends: ["evidence-ledger"],
    incompatibleWith: [],
  },
  "doubt-driven-development": {
    requires: ["test-first-verification"],
    recommends: ["evidence-ledger"],
    incompatibleWith: [],
  },
  "spec-driven-development": {
    requires: ["test-first-verification"],
    recommends: ["controlled-implementation"],
    incompatibleWith: [],
  },
  "review-final-merge-gate": {
    requires: ["review-router"],
    recommends: ["evidence-ledger"],
    incompatibleWith: [],
  },
  "release-readiness-gate": {
    requires: ["risk-gate", "evidence-ledger"],
    recommends: ["review-final-merge-gate"],
    incompatibleWith: [],
  },
  "project-adoption-pack-generation": {
    requires: ["repository-orientation"],
    recommends: ["implementation-context-generation", "review-context-generation"],
    incompatibleWith: [],
  },
  "skill-adoption-metrics": {
    requires: ["evidence-ledger"],
    recommends: [],
    incompatibleWith: [],
  },
  "skill-effectiveness-evaluation": {
    requires: ["evidence-ledger"],
    recommends: [],
    incompatibleWith: [],
  },
  "engineering-capability-evaluation": {
    requires: ["evidence-ledger"],
    recommends: [],
    incompatibleWith: [],
  },
};

const CODEX_PROFILES = {
  minimal: {
    description: "Small verification and handoff profile for read-mostly Codex use.",
    skills: ["test-first-verification", "handoff-generation", "evidence-ledger", "risk-gate"],
    prompts: ["skill-verify.md", "skill-handoff.md"],
    commands: ["codex-exec.md"],
  },
  implementation: {
    description: "Default scoped implementation profile.",
    skills: [
      "operating-mode-router",
      "skill-router",
      "requirement-grill",
      "work-package-compiler",
      "spec-driven-development",
      "test-first-verification",
      "controlled-implementation",
      "evidence-ledger",
      "risk-gate",
      "handoff-generation",
    ],
    prompts: ["skill-implement.md", "skill-verify.md", "skill-handoff.md"],
    commands: ["codex-exec.md"],
  },
  investigation: {
    description: "Bug, regression, reliability, and unknown-root-cause profile.",
    skills: [
      "operating-mode-router",
      "skill-router",
      "doubt-driven-development",
      "test-first-verification",
      "controlled-implementation",
      "evidence-ledger",
      "risk-gate",
      "handoff-generation",
    ],
    prompts: ["skill-investigate.md", "skill-verify.md", "skill-handoff.md"],
    commands: ["codex-exec.md"],
  },
  review: {
    description: "PR, diff, generated-output, and readiness review profile.",
    skills: [
      "review-router",
      "review-automated-gate",
      "review-ai-quality",
      "review-code-health",
      "review-domain-impact",
      "review-to-rule-compiler",
      "review-finding-compiler",
      "review-architecture-impact",
      "architecture-decision-memory",
      "review-output-quality",
      "review-adversarial-risk",
      "review-final-merge-gate",
      "evidence-ledger",
      "risk-gate",
      "adr-review",
      "improvement-ledger",
      "test-first-verification",
      "handoff-generation",
    ],
    prompts: ["skill-review.md", "skill-verify.md", "skill-handoff.md"],
    commands: ["codex-exec.md"],
  },
  adoption: {
    description: "Project adoption and documentation-context setup profile.",
    skills: [
      "operating-mode-router",
      "repository-orientation",
      "project-adoption-pack-generation",
      "implementation-context-generation",
      "review-context-generation",
      "documentation-knowledge-compiler",
      "evidence-ledger",
      "risk-gate",
      "handoff-generation",
    ],
    prompts: ["skill-verify.md", "skill-handoff.md"],
    commands: ["codex-exec.md"],
  },
  observability: {
    description: "Metrics, skill effectiveness, and capability-evaluation profile.",
    skills: [
      "operating-mode-router",
      "skill-router",
      "skill-adoption-metrics",
      "skill-effectiveness-evaluation",
      "engineering-capability-evaluation",
      "evidence-ledger",
      "risk-gate",
      "handoff-generation",
    ],
    prompts: ["skill-verify.md", "skill-handoff.md"],
    commands: ["codex-exec.md"],
  },
  full: {
    description: "All manifest skills and all Codex prompt templates.",
    skills: null,
    prompts: PROMPT_TEMPLATES,
    commands: COMMAND_TEMPLATES,
  },
};

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    profile: DEFAULT_PROFILE,
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
    } else if (arg === "--profile") {
      args.profile = argv[++i];
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
  const profileLines = Object.entries(CODEX_PROFILES)
    .map(([name, profile]) => `  ${name.padEnd(15)} ${profile.description}`)
    .join("\n");

  console.log(`Usage: node scripts/install-codex-adapter.mjs [options]

Options:
  --target <path>       Adopting project root. Defaults to cwd.
  --profile <name>      Workflow profile. Defaults to ${DEFAULT_PROFILE}.
  --skills <csv>        Advanced override for projected skills. Must satisfy selected prompt, command, and skill dependency closure.
  --merge-agents        Add or update the managed block in an existing AGENTS.md.
  --skip-agents         Do not install or merge AGENTS.md.
  --skip-prompts        Do not copy Codex prompt templates into .agents/prompts.
  --skip-command        Do not copy the codex exec command template into .agents/commands.
  --no-overwrite-skills Fail when an existing Codex skill projection would be overwritten.
  --prune               Delete stale managed Codex skills, prompts, and commands from the previous install state.
  --dry-run             Print planned changes without changing files.
  -h, --help            Show this help.

Profiles:
${profileLines}

Default mode is update-safe: profile-selected .agents/skills, .agents/prompts,
and .agents/commands are updated from this checkout, AGENTS.md is only written
when missing or when a managed block exists, and existing project-local AGENTS.md
content is preserved.

Use --profile for normal installs. Use --skills only for advanced overrides; the
installer fails before writing files when the override is not closed over required
skills for selected prompts, commands, and dependencies of the specified skills.

Prune mode deletes only managed files whose hashes still match the previous
install state, and removes directories only if they become empty.
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

function validateTemplateNames(names, allowedNames, label) {
  const allowed = new Set(allowedNames);
  const unknown = names.filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown ${label}(s): ${unknown.join(", ")}`);
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

function buildState({
  manifest,
  profileName,
  profile,
  skills,
  selectedSkills,
  retainedStaleSkills,
  promptTemplates,
  selectedPrompts,
  retainedStalePrompts,
  commandTemplates,
  selectedCommands,
  retainedStaleCommands,
  requiredSkills,
  recommendedSkills,
  managedFiles,
}) {
  return {
    schema_version: 2,
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
    selected_profile: profileName,
    profile_description: profile.description,
    installed_skills: skills,
    selected_skills: selectedSkills,
    retained_stale_skills: retainedStaleSkills,
    installed_prompts: promptTemplates,
    selected_prompts: selectedPrompts,
    retained_stale_prompts: retainedStalePrompts,
    installed_commands: commandTemplates,
    selected_commands: selectedCommands,
    retained_stale_commands: retainedStaleCommands,
    prompt_templates: promptTemplates,
    command_templates: commandTemplates,
    skill_closure: {
      required_skills: requiredSkills,
      recommended_skills: recommendedSkills,
    },
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

function previousItems(previousState, field, kinds, propertyName) {
  const explicit = Array.isArray(previousState?.[field])
    ? previousState[field].filter((value) => typeof value === "string")
    : null;
  if (explicit) {
    return explicit;
  }

  return Object.values(previousState?.managed_files ?? {})
    .filter((record) => kinds.includes(record?.kind) && typeof record[propertyName] === "string")
    .map((record) => record[propertyName]);
}

function planPruneManagedFile({ operations, previousState, target, relativePath, reason }) {
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

  planDeleteFile(operations, destination, `stale Codex managed projection:${reason}`);
  planRemoveEmptyDirectory(operations, dirname(destination), `empty stale Codex managed projection directory:${reason}`);
}

function resolveProfile(name, manifestSkills) {
  const profile = CODEX_PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown profile: ${name}. Supported profiles: ${Object.keys(CODEX_PROFILES).join(", ")}`);
  }

  const prompts = [...(profile.prompts ?? [])];
  const commands = [...(profile.commands ?? [])];
  validateTemplateNames(prompts, PROMPT_TEMPLATES, "prompt template");
  validateTemplateNames(commands, COMMAND_TEMPLATES, "command template");

  const profileSkills = profile.skills === null ? manifestSkills : profile.skills;
  return {
    profile,
    skills: [...profileSkills].sort(),
    prompts,
    commands,
  };
}

function requiredSkillsForPrompts(prompts) {
  return prompts.flatMap((prompt) => PROMPT_METADATA[prompt]?.requiredSkills ?? []);
}

function recommendedSkillsForPrompts(prompts) {
  return prompts.flatMap((prompt) => PROMPT_METADATA[prompt]?.recommendedSkills ?? []);
}

function computeRequiredClosure(seedSkills, promptTemplates) {
  const required = new Set([...seedSkills, ...requiredSkillsForPrompts(promptTemplates)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const skill of [...required]) {
      for (const dependency of SKILL_RELATIONSHIPS[skill]?.requires ?? []) {
        if (!required.has(dependency)) {
          required.add(dependency);
          changed = true;
        }
      }
    }
  }
  return [...required].sort();
}

function computeRecommendedSkills(skills, promptTemplates) {
  const selected = new Set(skills);
  const recommended = new Set(recommendedSkillsForPrompts(promptTemplates));
  for (const skill of skills) {
    for (const recommendation of SKILL_RELATIONSHIPS[skill]?.recommends ?? []) {
      if (!selected.has(recommendation)) {
        recommended.add(recommendation);
      }
    }
  }
  return [...recommended].filter((skill) => !selected.has(skill)).sort();
}

function validateSkillClosure({ selectedSkills, requiredSkills, profileName }) {
  const selected = new Set(selectedSkills);
  const missing = requiredSkills.filter((skill) => !selected.has(skill));
  if (missing.length > 0) {
    throw new Error(`Skill override is not closed for profile '${profileName}'. Missing required skill(s): ${missing.join(", ")}`);
  }

  const incompatible = [];
  for (const skill of selectedSkills) {
    for (const other of SKILL_RELATIONSHIPS[skill]?.incompatibleWith ?? []) {
      if (selected.has(other)) {
        incompatible.push(`${skill} cannot be combined with ${other}`);
      }
    }
  }
  if (incompatible.length > 0) {
    throw new Error(`Incompatible skill combination(s): ${incompatible.join("; ")}`);
  }
}

function commandContent(command, promptTemplates) {
  if (command !== "codex-exec.md") {
    const source = resolve(REPO_ROOT, "adapters/codex/commands", command);
    ensureSource(source, `adapters/codex/commands/${command}`);
    return readText(source);
  }

  const sections = promptTemplates.map((prompt) => commandSectionForPrompt(prompt));
  const exampleText = sections.length > 0
    ? sections.join("\n\n")
    : "No prompt templates were installed for this profile. Provide a local prompt file or paste the prompt text directly into Codex.";

  return `# Codex Exec Command Templates

Use these examples from an adopting repository after projecting \`AGENTS.md\`, the selected skills, and the selected prompt templates.

${exampleText}

## Safety Notes

- Use \`read-only\` for review or handoff when edits are not required.
- Use \`workspace-write\` only when implementation or verification needs local edits.
- Do not use \`danger-full-access\` unless the environment is isolated and the task explicitly requires it.
- Do not pass secrets as broad job-level environment variables.
- Do not chain this template to publish, deploy, release, send notifications, or mutate production state without \`risk-gate\` and explicit approval.
`;
}

function commandSectionForPrompt(prompt) {
  const metadata = PROMPT_METADATA[prompt];
  const promptPath = `.agents/prompts/${prompt}`;
  if (prompt === "skill-review.md") {
    return `## ${metadata.label}

\`\`\`bash
git diff --patch origin/main...HEAD | codex exec --sandbox ${metadata.sandbox} "$(cat ${promptPath})"
\`\`\`

Treat this as diff-only review unless the command also provides the checked-out PR head, relevant docs, test results, and context required by the review gates.`;
  }
  if (prompt === "skill-implement.md") {
    return `## ${metadata.label}

\`\`\`bash
codex exec --sandbox ${metadata.sandbox} --output-last-message codex-implementation.md "$(cat ${promptPath})"
\`\`\``;
  }
  return `## ${metadata.label}

\`\`\`bash
codex exec --sandbox ${metadata.sandbox} "$(cat ${promptPath})"
\`\`\``;
}

function validateManagedReferences(managedFiles) {
  const managedPaths = new Set(Object.keys(managedFiles));
  const referencePattern = /\.agents\/(?:prompts|commands)\/[A-Za-z0-9._/-]+\.md/g;
  const sourceOnlyPattern = /adapters\/codex\/prompts\/[A-Za-z0-9._/-]+\.md/g;

  for (const [managedPath, record] of Object.entries(managedFiles)) {
    if (record.kind !== "codex_prompt" && record.kind !== "codex_command") {
      continue;
    }
    const content = record.content ?? "";
    const sourceOnly = [...content.matchAll(sourceOnlyPattern)].map((match) => match[0]);
    if (sourceOnly.length > 0) {
      throw new Error(`${managedPath} references source-repository-only Codex prompt path(s): ${[...new Set(sourceOnly)].join(", ")}`);
    }
    const missing = [...content.matchAll(referencePattern)]
      .map((match) => match[0])
      .filter((reference) => !managedPaths.has(reference));
    if (missing.length > 0) {
      throw new Error(`${managedPath} references prompt/command file(s) that are not selected for installation: ${[...new Set(missing)].join(", ")}`);
    }
  }

  for (const record of Object.values(managedFiles)) {
    delete record.content;
  }
}

function buildPlan(args) {
  const manifest = readManifest();
  const manifestSkills = [...manifest.skills].sort();
  const resolvedProfile = resolveProfile(args.profile, manifestSkills);
  const selectedPromptTemplates = args.skipPrompts ? [] : resolvedProfile.prompts;
  const selectedCommandTemplates = args.skipCommand ? [] : resolvedProfile.commands;
  const skillSeed = args.skills ?? resolvedProfile.skills;
  const requiredSkills = computeRequiredClosure(skillSeed, selectedPromptTemplates);
  const skills = [...(args.skills ?? requiredSkills)].sort();

  validateSkillNames(skills, manifestSkills);
  validateSkillClosure({ selectedSkills: skills, requiredSkills, profileName: args.profile });

  const previousState = readPreviousState(args.target);
  const previousSkillNames = previousItems(previousState, "installed_skills", ["codex_skill", "stale_codex_skill"], "skill").filter((skill) =>
    SKILL_NAME_PATTERN.test(skill),
  );
  const previousPromptNames = previousItems(previousState, "installed_prompts", ["codex_prompt", "stale_codex_prompt"], "prompt");
  const previousCommandNames = previousItems(previousState, "installed_commands", ["codex_command", "stale_codex_command"], "command");
  const previousSkills = new Set(previousSkillNames);
  const previousPrompts = new Set(previousPromptNames);
  const previousCommands = new Set(previousCommandNames);
  const selectedSkills = new Set(skills);
  const selectedPrompts = new Set(selectedPromptTemplates);
  const selectedCommands = new Set(selectedCommandTemplates);
  const staleSkills = [...previousSkills].filter((skill) => !selectedSkills.has(skill)).sort();
  const stalePrompts = [...previousPrompts].filter((prompt) => !selectedPrompts.has(prompt)).sort();
  const staleCommands = [...previousCommands].filter((command) => !selectedCommands.has(command)).sort();
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

  for (const prompt of selectedPromptTemplates) {
    const source = resolve(REPO_ROOT, "adapters/codex/prompts", prompt);
    ensureSource(source, `adapters/codex/prompts/${prompt}`);
    const content = readText(source);
    const relativePath = `.agents/prompts/${prompt}`;
    managedFiles[relativePath] = {
      kind: "codex_prompt",
      prompt,
      required_skills: [...(PROMPT_METADATA[prompt]?.requiredSkills ?? [])].sort(),
      recommended_skills: [...(PROMPT_METADATA[prompt]?.recommendedSkills ?? [])].sort(),
      sha256: hashText(content),
      content,
    };
    planWrite(operations, resolve(args.target, relativePath), content, `codex_prompt:${prompt}`);
  }

  for (const command of selectedCommandTemplates) {
    const source = resolve(REPO_ROOT, "adapters/codex/commands", command);
    ensureSource(source, `adapters/codex/commands/${command}`);
    const content = commandContent(command, selectedPromptTemplates);
    const relativePath = `.agents/commands/${command}`;
    managedFiles[relativePath] = { kind: "codex_command", command, generated: command === "codex-exec.md", sha256: hashText(content), content };
    planWrite(operations, resolve(args.target, relativePath), content, `codex_command:${command}`);
  }

  for (const skill of staleSkills) {
    const relativePath = `.agents/skills/${skill}/SKILL.md`;
    if (args.prune) {
      planPruneManagedFile({ operations, previousState, target: args.target, relativePath, reason: `skill:${skill}` });
    } else {
      const record = previousManagedRecord(previousState, relativePath);
      if (record) {
        managedFiles[relativePath] = { ...record, kind: "stale_codex_skill", skill };
      }
    }
  }

  for (const prompt of stalePrompts) {
    const relativePath = `.agents/prompts/${prompt}`;
    if (args.prune) {
      planPruneManagedFile({ operations, previousState, target: args.target, relativePath, reason: `prompt:${prompt}` });
    } else {
      const record = previousManagedRecord(previousState, relativePath);
      if (record) {
        managedFiles[relativePath] = { ...record, kind: "stale_codex_prompt", prompt };
      }
    }
  }

  for (const command of staleCommands) {
    const relativePath = `.agents/commands/${command}`;
    if (args.prune) {
      planPruneManagedFile({ operations, previousState, target: args.target, relativePath, reason: `command:${command}` });
    } else {
      const record = previousManagedRecord(previousState, relativePath);
      if (record) {
        managedFiles[relativePath] = { ...record, kind: "stale_codex_command", command };
      }
    }
  }

  validateManagedReferences(managedFiles);

  const stateSkills = args.prune ? skills : [...new Set([...skills, ...staleSkills])].sort();
  const retainedStaleSkills = args.prune ? [] : staleSkills;
  const statePrompts = args.prune ? selectedPromptTemplates : [...new Set([...selectedPromptTemplates, ...stalePrompts])].sort();
  const retainedStalePrompts = args.prune ? [] : stalePrompts;
  const stateCommands = args.prune ? selectedCommandTemplates : [...new Set([...selectedCommandTemplates, ...staleCommands])].sort();
  const retainedStaleCommands = args.prune ? [] : staleCommands;
  const recommendedSkills = computeRecommendedSkills(skills, selectedPromptTemplates);
  const state = buildState({
    manifest,
    profileName: args.profile,
    profile: resolvedProfile.profile,
    skills: stateSkills,
    selectedSkills: skills,
    retainedStaleSkills,
    promptTemplates: statePrompts,
    selectedPrompts: selectedPromptTemplates,
    retainedStalePrompts,
    commandTemplates: stateCommands,
    selectedCommands: selectedCommandTemplates,
    retainedStaleCommands,
    requiredSkills,
    recommendedSkills,
    managedFiles,
  });
  const stateContent = `${JSON.stringify(state, null, 2)}\n`;
  planWrite(operations, resolve(args.target, STATE_PATH), stateContent, "codex_install_state");

  return { operations, staleSkills, stalePrompts, staleCommands, state, recommendedSkills };
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
  console.log(`- profile: ${args.profile}`);
  for (const operation of plan.operations) {
    const marker = operation.kind === "delete_file" ? "delete" : operation.kind === "remove_empty_dir" ? "rmdir-if-empty" : operation.unchanged ? "unchanged" : "write";
    console.log(`- ${marker}: ${relative(args.target, operation.destination)} (${operation.reason})`);
  }
  for (const skill of plan.staleSkills) {
    const action = args.prune ? "pruned" : "stale Codex managed projection";
    console.log(`- ${action}: .agents/skills/${skill}`);
  }
  for (const prompt of plan.stalePrompts) {
    const action = args.prune ? "pruned" : "stale Codex managed projection";
    console.log(`- ${action}: .agents/prompts/${prompt}`);
  }
  for (const command of plan.staleCommands) {
    const action = args.prune ? "pruned" : "stale Codex managed projection";
    console.log(`- ${action}: .agents/commands/${command}`);
  }
  if (plan.recommendedSkills.length > 0) {
    console.log(`Recommended but not required skill(s): ${plan.recommendedSkills.join(", ")}`);
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
