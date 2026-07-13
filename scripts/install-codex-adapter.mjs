#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as lifecycle from "./installer-lifecycle.mjs";
import { CODEX_PROMPT_CONTRACTS } from "./ask-shared.mjs";
import { ADAPTER_RENDERER_METADATA, CODEX_RUNTIME_FILES } from "./adapter-runtime-inventory.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const MANAGED_START = "<!-- agent-spectrum-kernel:start -->";
const MANAGED_END = "<!-- agent-spectrum-kernel:end -->";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PLANE_ORDER = ["execution", "knowledge", "control"];
const DEFAULT_PROFILE = "implementation";
const CANONICAL_REGISTRY_PATH = "schemas/review-signal-gate-map.json";
const CORE_OWNED_IMMUTABLE_ASSETS = lifecycle.CORE_IMMUTABLE_CONTRACT_ASSETS;
const CORE_PRESERVE_PATHS = [CANONICAL_REGISTRY_PATH, ...CORE_OWNED_IMMUTABLE_ASSETS];
const PROMPT_TEMPLATES = [
  "skill-implement.md",
  "skill-investigate.md",
  "skill-review.md",
  "skill-verify.md",
  "skill-handoff.md",
];
const COMMAND_TEMPLATES = ["codex-exec.md"];
const CODEX_RUNTIME_SCRIPTS = CODEX_RUNTIME_FILES.map((file) => file.name);

const PROMPT_METADATA = {
  "skill-implement.md": {
    label: "Implementation",
    execution: CODEX_PROMPT_CONTRACTS["skill-implement.md"],
    requiredSkills: ["operating-mode-router", "skill-router", "controlled-implementation", "test-first-verification", "evidence-ledger", "risk-gate"],
    recommendedSkills: ["spec-driven-development", "requirement-grill", "work-package-compiler"],
    requiredAssets: ["docs/execution-envelope-contract.md", "docs/lifecycle-artifact-contract.md", "docs/lifecycle-traceability-contract.md"],
  },
  "skill-investigate.md": {
    label: "Investigation",
    execution: CODEX_PROMPT_CONTRACTS["skill-investigate.md"],
    requiredSkills: ["operating-mode-router", "skill-router", "doubt-driven-development", "test-first-verification", "controlled-implementation", "evidence-ledger", "risk-gate"],
    recommendedSkills: [],
  },
  "skill-review.md": {
    label: "Review",
    execution: CODEX_PROMPT_CONTRACTS["skill-review.md"],
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
    requiredAssets: ["docs/execution-envelope-contract.md", "docs/lifecycle-traceability-contract.md"],
  },
  "skill-verify.md": {
    label: "Verification",
    execution: CODEX_PROMPT_CONTRACTS["skill-verify.md"],
    requiredSkills: ["test-first-verification", "evidence-ledger"],
    recommendedSkills: [],
    requiredAssets: ["docs/execution-envelope-contract.md", "docs/lifecycle-artifact-contract.md", "docs/lifecycle-traceability-contract.md"],
  },
  "skill-handoff.md": {
    label: "Handoff",
    execution: CODEX_PROMPT_CONTRACTS["skill-handoff.md"],
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
    requires: ["work-package-compiler", "test-first-verification"],
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
  daily: {
    description: "Daily delivery projection with execution and control skills only.",
    projectionPack: "daily_delivery",
    prompts: PROMPT_TEMPLATES,
    commands: COMMAND_TEMPLATES,
  },
  organizational: {
    description: "Daily delivery plus explicitly invoked organizational knowledge lifecycle skills.",
    projectionPack: "organizational_intelligence",
    prompts: PROMPT_TEMPLATES,
    commands: COMMAND_TEMPLATES,
  },
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

const PROFILE_ROUTING_FIXTURES = {
  daily: [
    { id: "daily_implementation_available", signal: "Ordinary implementation", router: "skill-router", selected_route: "controlled-implementation", outcome: "available", requiredSkills: ["controlled-implementation"] },
    { id: "daily_review_available", signal: "Ordinary review", router: "skill-router", selected_route: "review-router", outcome: "available", requiredSkills: ["review-router"] },
    { id: "daily_knowledge_capability_missing", signal: "Explicit knowledge promotion", router: "skill-router", selected_route: "review-finding-compiler", outcome: "capability_missing", recommendedProfile: "organizational", requiredSkills: [] },
    { id: "daily_adoption_capability_missing", signal: "Adoption request", router: "operating-mode-router", selected_route: "project-adoption-pack-generation", outcome: "capability_missing", recommendedProfile: "organizational", requiredSkills: [] },
    { id: "daily_observability_capability_missing", signal: "Observability request", router: "operating-mode-router", selected_route: "skill-effectiveness-evaluation", outcome: "capability_missing", recommendedProfile: "organizational", requiredSkills: [] },
  ],
  minimal: [],
  implementation: [
    {
      id: "delivery_quality_mode",
      signal: "Implementation request is classified as delivery_quality",
      router: "operating-mode-router",
      selected_route: "skill-router",
      requiredSkills: ["skill-router"],
    },
    {
      id: "unfamiliar_repository",
      signal: "Unfamiliar repository before implementation",
      router: "skill-router",
      selected_route: "repository-orientation",
      requiredSkills: ["repository-orientation"],
    },
    {
      id: "unclear_scope",
      signal: "Scope or refactor boundary is unclear",
      router: "skill-router",
      selected_route: "scope-control",
      requiredSkills: ["scope-control"],
    },
    {
      id: "boundary_decision",
      signal: "Application boundary decision is needed before implementation",
      router: "skill-router",
      selected_route: "application-boundary-architecture",
      requiredSkills: ["application-boundary-architecture"],
    },
    {
      id: "design_grill",
      signal: "Ambiguous implementation design needs stress testing",
      router: "skill-router",
      selected_route: "grill-design",
      requiredSkills: ["grill-design"],
    },
    {
      id: "docs_or_adr_constraints",
      signal: "Existing docs, domain rules, or ADR terms constrain the implementation",
      router: "skill-router",
      selected_route: "grill-with-docs",
      requiredSkills: ["grill-with-docs"],
    },
    {
      id: "long_running_or_multi_agent",
      signal: "Implementation spans sessions or agents",
      router: "skill-router",
      selected_route: "planning-with-files",
      requiredSkills: ["planning-with-files"],
    },
  ],
  investigation: [
    {
      id: "delivery_quality_mode",
      signal: "Investigation request is classified as delivery_quality",
      router: "operating-mode-router",
      selected_route: "skill-router",
      requiredSkills: ["skill-router"],
    },
    {
      id: "bug_investigation",
      signal: "Bug, regression, or unknown root cause",
      router: "skill-router",
      selected_route: "doubt-driven-development",
      requiredSkills: ["doubt-driven-development", "test-first-verification", "controlled-implementation", "evidence-ledger"],
    },
    {
      id: "unfamiliar_repository",
      signal: "Unfamiliar repository before investigation",
      router: "skill-router",
      selected_route: "repository-orientation",
      requiredSkills: ["repository-orientation"],
    },
    {
      id: "unclear_scope",
      signal: "Investigation scope or blast radius is unclear",
      router: "skill-router",
      selected_route: "scope-control",
      requiredSkills: ["scope-control"],
    },
    {
      id: "boundary_decision",
      signal: "Root cause or fix path needs an application boundary decision",
      router: "skill-router",
      selected_route: "application-boundary-architecture",
      requiredSkills: ["application-boundary-architecture"],
    },
  ],
  review: [
    {
      id: "review",
      signal: "PR, diff, commit, patch, or generated-output review",
      router: "review-router",
      selected_route: "review-router",
      requiredSkills: [
        "review-router",
        "review-automated-gate",
        "review-ai-quality",
        "review-code-health",
        "review-domain-impact",
        "review-to-rule-compiler",
        "review-finding-compiler",
        "review-architecture-impact",
        "review-output-quality",
        "review-adversarial-risk",
        "review-final-merge-gate",
        "evidence-ledger",
        "risk-gate",
        "adr-review",
        "improvement-ledger",
      ],
    },
  ],
  adoption: [
    {
      id: "unfamiliar_repository",
      signal: "Repository adoption starts from unknown project context",
      router: "operating-mode-router",
      selected_route: "repository-orientation",
      requiredSkills: ["repository-orientation"],
    },
    {
      id: "adoption_bootstrap",
      signal: "First-time project rollout or adoption pack request",
      router: "operating-mode-router",
      selected_route: "project-adoption-pack-generation",
      requiredSkills: ["project-adoption-pack-generation", "implementation-context-generation", "review-context-generation"],
    },
  ],
  observability: [
    {
      id: "skill_effectiveness",
      signal: "One-task skill or routing effectiveness evaluation",
      router: "operating-mode-router",
      selected_route: "skill-effectiveness-evaluation",
      requiredSkills: ["skill-effectiveness-evaluation", "evidence-ledger"],
    },
    {
      id: "adoption_metrics",
      signal: "Adoption maturity, usage metrics, or multi-task adoption impact",
      router: "operating-mode-router",
      selected_route: "skill-adoption-metrics",
      requiredSkills: ["skill-adoption-metrics", "evidence-ledger"],
    },
    {
      id: "capability_evaluation",
      signal: "Evidence-backed full-layer engineering capability evaluation",
      router: "operating-mode-router",
      selected_route: "engineering-capability-evaluation",
      requiredSkills: ["engineering-capability-evaluation", "evidence-ledger"],
    },
  ],
  full: [],
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
    } else if (arg === "--profile") {
      args.profile = argv[++i];
    } else if (arg === "--skills") {
      args.skills = argv[++i].split(",").map((skill) => skill.trim()).filter(Boolean);
    } else if (arg === "--merge-agents" || arg === "--skip-agents") {
      throw new Error(`${arg} is no longer supported; install the core first with scripts/install-kernel.mjs --merge-agents.`);
    } else if (arg === "--skip-prompts") {
      args.skipPrompts = true;
    } else if (arg === "--skip-command") {
      args.skipCommand = true;
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
  const profileLines = Object.entries(CODEX_PROFILES)
    .map(([name, profile]) => `  ${name.padEnd(15)} ${profile.description}`)
    .join("\n");

  console.log(`Usage: node scripts/install-codex-adapter.mjs [options]

Options:
  --target <path>       Adopting project root. Defaults to cwd.
  --profile <name>      Workflow profile. Defaults to ${DEFAULT_PROFILE}.
  --skills <csv>        Advanced override for projected skills. Must satisfy selected prompt, command, router reachability, and skill dependency closure.
  --skip-prompts        Do not copy Codex prompt templates into .agents/prompts.
  --skip-command        Do not copy the codex exec command template into .agents/commands.
  --no-overwrite-skills Fail when an existing Codex skill projection would be overwritten.
  --prune               Delete stale managed Codex skills, prompts, and commands from the previous install state.
  --force               Overwrite locally modified managed files.
  --check               Validate the update plan without changing files.
  --rollback            Restore the previous successful managed snapshot.
  --detach, --uninstall Remove Codex execution surfaces and mark the install detached.
  --dry-run             Print planned changes without changing files.
  -h, --help            Show this help.

Profiles:
${profileLines}

Default mode is three-way update safe: managed files are updated only when the
target still matches the previous managed hash, unless --force is used.
AGENTS.md is owned by the core installer. Install or update core before this adapter.

Use --profile for normal installs. Use --skills only for advanced overrides; the
installer fails before writing files when the override is not closed over required
skills for selected prompts, commands, router-reachable routes, and dependencies
of the specified skills.

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

function validateCoreInstalled(target, statePath, requiredAssets) {
  if (!existsSync(statePath)) throw new Error("ASK core install state is missing: .agent-spectrum-kernel/install-state.json. Run scripts/install-kernel.mjs before installing the Codex adapter.");
  let state;
  try { state = readJson(statePath); } catch { throw new Error("ASK core install state is invalid JSON."); }
  const record = state?.managed_blocks?.["AGENTS.md#agent-spectrum-kernel"];
  const agentsPath = resolve(target, "AGENTS.md");
  const block = existsSync(agentsPath) ? lifecycle.extractManagedBlock(readText(agentsPath)) : null;
  if (state?.install_status !== "installed" || !record?.sha256 || !block || lifecycle.hashText(block.content) !== record.sha256) {
    throw new Error("ASK core installation is not active or its AGENTS.md managed block does not match install state.");
  }
  const registryPath = resolve(target, CANONICAL_REGISTRY_PATH);
  const registryRecord = state?.managed_files?.[CANONICAL_REGISTRY_PATH];
  if (!registryRecord?.sha256 || !existsSync(registryPath) || hashText(readText(registryPath)) !== registryRecord.sha256) {
    throw new Error(`ASK core canonical review signal registry is missing or does not match core install state: ${CANONICAL_REGISTRY_PATH}`);
  }
  for (const asset of requiredAssets.filter((path) => CORE_OWNED_IMMUTABLE_ASSETS.includes(path))) {
    const sourceContent = readText(resolve(REPO_ROOT, asset));
    const record = state?.managed_files?.[asset];
    const targetPath = resolve(target, asset);
    if (record?.kind !== "immutable_contract" || record.sha256 !== hashText(sourceContent) || !existsSync(targetPath) || hashText(readText(targetPath)) !== record.sha256) {
      throw new Error(`ASK core immutable contract is missing or stale: ${asset}. Re-run scripts/install-kernel.mjs before installing the Codex adapter.`);
    }
  }
  return state;
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
  runtimeScripts,
  selectedRuntimeScripts,
  retainedStaleRuntimeScripts,
  requiredSkills,
  recommendedSkills,
  routerReachableSkills,
  routingFixtures,
  requiredAssets,
  managedFiles,
  managedBlocks,
  previousState,
  rollback,
  hasMutations,
  customSelection,
  appliedProvenance,
}) {
  const selectedProjectionPack = matchingProjectionPack(selectedSkills, manifest);
  return lifecycle.buildLifecycleState({
    manifest,
    repoRoot: REPO_ROOT,
    adapterName: "agent-spectrum-codex-adapter",
    adapterVersion: Number(ADAPTER_RENDERER_METADATA.codex.rendererVersion),
    selectedProfile: profileName,
    target: {
      kernel: "AGENTS.md",
      skills_root: ".agents/skills",
      prompts_root: ".agents/prompts",
      commands_root: ".agents/commands",
    },
    installedSkills: skills,
    selectedSkills,
    managedFiles,
    managedBlocks,
    previousState,
    rollback,
    hasMutations,
    extra: {
      profile_description: profile.description,
      selection_mode: customSelection ? "custom" : profile.projectionPack ? "projection_pack" : "profile",
      selected_projection_pack: selectedProjectionPack,
      selected_planes: planesForSkills(selectedSkills, manifest),
      installed_planes: planesForSkills(skills, manifest),
      knowledge_write_policy: "explicit_only",
      retained_stale_skills: retainedStaleSkills,
      installed_prompts: promptTemplates,
      selected_prompts: selectedPrompts,
      retained_stale_prompts: retainedStalePrompts,
      installed_commands: commandTemplates,
      selected_commands: selectedCommands,
      retained_stale_commands: retainedStaleCommands,
      installed_runtime_scripts: runtimeScripts,
      selected_runtime_scripts: selectedRuntimeScripts,
      retained_stale_runtime_scripts: retainedStaleRuntimeScripts,
      prompt_templates: promptTemplates,
      command_templates: commandTemplates,
      runtime_scripts: runtimeScripts,
      required_assets: requiredAssets,
      applied_provenance: appliedProvenance,
      skill_closure: {
        required_skills: requiredSkills,
        recommended_skills: recommendedSkills,
        router_reachable_skills: routerReachableSkills,
        routing_fixtures: routingFixtures,
      },
    },
  });
}

function planesForSkills(skills, manifest) {
  const present = new Set(skills.map((skill) => manifest.skill_planes?.[skill]).filter(Boolean));
  return PLANE_ORDER.filter((plane) => present.has(plane));
}

function matchingProjectionPack(skills, manifest) {
  const selected = [...new Set(skills)].sort();
  for (const [name, pack] of Object.entries(manifest.projection_packs ?? {})) {
    const packed = [...new Set(pack.skills ?? [])].sort();
    if (selected.length === packed.length && selected.every((skill, index) => skill === packed[index])) return name;
  }
  return null;
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

function resolveProfile(name, manifest) {
  const profile = CODEX_PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown profile: ${name}. Supported profiles: ${Object.keys(CODEX_PROFILES).join(", ")}`);
  }

  const prompts = [...(profile.prompts ?? [])];
  const commands = [...(profile.commands ?? [])];
  validateTemplateNames(prompts, PROMPT_TEMPLATES, "prompt template");
  validateTemplateNames(commands, COMMAND_TEMPLATES, "command template");

  const profileSkills = profile.projectionPack
    ? manifest.projection_packs?.[profile.projectionPack]?.skills
    : profile.skills === null ? manifest.skills : profile.skills;
  if (!Array.isArray(profileSkills)) {
    throw new Error(`Profile '${name}' references missing projection pack '${profile.projectionPack}'`);
  }
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

function requiredAssetsForPrompts(prompts) {
  return [...new Set(prompts.flatMap((prompt) => PROMPT_METADATA[prompt]?.requiredAssets ?? []))].sort();
}

function requiredAssetsForSkills(skills) {
  const assets = new Set();
  for (const skill of skills) {
    const source = resolve(REPO_ROOT, "skills", skill, "SKILL.md");
    ensureSource(source, `skills/${skill}/SKILL.md`);
    const text = readText(source);
    for (const asset of CORE_OWNED_IMMUTABLE_ASSETS) {
      if (text.includes(asset)) assets.add(asset);
    }
  }
  return [...assets].sort();
}

export function codexRendererInputPathsForProfile(profileName) {
  const manifest = readManifest();
  const resolvedProfile = resolveProfile(profileName, manifest);
  const prompts = [...resolvedProfile.prompts];
  const commands = [...resolvedProfile.commands];
  const routingFixtures = routingFixturesForProfile(profileName, resolvedProfile.skills, prompts);
  const skills = computeRequiredClosure(resolvedProfile.skills, prompts, routingFixtures).sort();
  const requiredAssets = [...new Set([...requiredAssetsForPrompts(prompts), ...requiredAssetsForSkills(skills)])].sort();
  const canonical = [
    { path: "AGENTS.md", role: "kernel" },
    { path: "manifest.json", role: "manifest" },
    { path: "docs/adapter-runtime-boundary-contract.md", role: "contract" },
    { path: "schemas/adapter-runtime-profile.schema.json", role: "schema" },
    { path: "schemas/adapter-runtime-evidence.schema.json", role: "schema" },
    { path: "schemas/normalized-event-schema-registry.json", role: "schema" },
    ...skills.map((skill) => ({ path: `skills/${skill}/SKILL.md`, role: "skill" })),
    ...requiredAssets.map((path) => ({ path, role: path.startsWith("schemas/") ? "schema" : "contract" })),
    ...CODEX_RUNTIME_FILES.filter((file) => file.assetKind === "schemas").map((file) => ({ path: file.source, role: "schema" })),
  ];
  const adapterOwned = [
    { path: "scripts/install-codex-adapter.mjs", role: "renderer" },
    { path: "scripts/installer-lifecycle.mjs", role: "runtime_source" },
    { path: "scripts/adapter-runtime-inventory.mjs", role: "inventory" },
    ...prompts.map((prompt) => ({ path: `adapters/codex/prompts/${prompt}`, role: "prompt_template" })),
    ...commands.map((command) => ({ path: `adapters/codex/commands/${command}`, role: "command_template" })),
    ...CODEX_RUNTIME_FILES.filter((file) => file.assetKind !== "schemas").map((file) => ({ path: file.source, role: "runtime_source" })),
  ];
  const dedupe = (items) => [...new Map(items.map((item) => [item.path, item])).values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { canonical: dedupe(canonical), adapter_owned: dedupe(adapterOwned) };
}

export function codexManagedAssetsForProfile(profileName) {
  const manifest = readManifest();
  const resolvedProfile = resolveProfile(profileName, manifest);
  const prompts = [...resolvedProfile.prompts];
  const commands = [...resolvedProfile.commands];
  const routingFixtures = routingFixturesForProfile(profileName, resolvedProfile.skills, prompts);
  const skills = computeRequiredClosure(resolvedProfile.skills, prompts, routingFixtures).sort();
  const requiredAssets = [...new Set([...requiredAssetsForPrompts(prompts), ...requiredAssetsForSkills(skills)])].filter((path) => !CORE_OWNED_IMMUTABLE_ASSETS.includes(path)).sort();
  const runtimeFiles = commands.includes("codex-exec.md") ? CODEX_RUNTIME_FILES : [];
  const inventorySourceRef = "scripts/install-codex-adapter.mjs";
  const assets = [
    ...skills.map((skill) => ({ path: `.agents/skills/${skill}/SKILL.md`, asset_kind: "skills", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
    ...prompts.map((prompt) => ({ path: `.agents/prompts/${prompt}`, asset_kind: "prompts", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
    ...commands.map((command) => ({ path: `.agents/commands/${command}`, asset_kind: "commands", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
    ...runtimeFiles.map((file) => ({ path: file.target, asset_kind: file.assetKind, ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
    ...requiredAssets.map((path) => ({ path, asset_kind: "configuration", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
  ];
  return [...new Map(assets.map((asset) => [asset.path, asset])).values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function recommendedSkillsForPrompts(prompts) {
  return prompts.flatMap((prompt) => PROMPT_METADATA[prompt]?.recommendedSkills ?? []);
}

function routingFixturesForProfile(profileName, seedSkills, promptTemplates) {
  const selectedRouters = new Set([...seedSkills, ...requiredSkillsForPrompts(promptTemplates)]);
  return (PROFILE_ROUTING_FIXTURES[profileName] ?? [])
    .filter((fixture) => selectedRouters.has(fixture.router))
    .map((fixture) => ({
      id: fixture.id,
      signal: fixture.signal,
      router: fixture.router,
      selected_route: fixture.selected_route,
      outcome: fixture.outcome ?? "available",
      recommended_profile: fixture.recommendedProfile ?? null,
      required_skills: [...(fixture.requiredSkills ?? [])].sort(),
    }));
}

function skillsForRoutingFixtures(routingFixtures) {
  const skills = new Set();
  for (const fixture of routingFixtures) {
    if (fixture.outcome === "capability_missing") continue;
    if (fixture.selected_route && SKILL_NAME_PATTERN.test(fixture.selected_route)) {
      skills.add(fixture.selected_route);
    }
    for (const skill of fixture.required_skills ?? []) {
      skills.add(skill);
    }
  }
  return [...skills].sort();
}

function computeRequiredClosure(seedSkills, promptTemplates, routingFixtures) {
  const required = new Set([...seedSkills, ...requiredSkillsForPrompts(promptTemplates), ...skillsForRoutingFixtures(routingFixtures)]);
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
node scripts/codex-exec-runner.mjs --prompt ${prompt} --mode ${metadata.execution.mode} --sandbox ${metadata.execution.sandbox} --diff-base origin/main...HEAD --output codex-review.md
\`\`\`

Treat this as diff-only review unless the runner output also provides the checked-out PR head, relevant docs, test results, and context required by the review gates.`;
  }
  if (prompt === "skill-implement.md") {
    return `## ${metadata.label}

\`\`\`bash
node scripts/codex-exec-runner.mjs --prompt ${prompt} --mode ${metadata.execution.mode} --sandbox ${metadata.execution.sandbox} --output codex-implementation.md
\`\`\``;
  }
  return `## ${metadata.label}

\`\`\`bash
node scripts/codex-exec-runner.mjs --prompt ${prompt} --mode ${metadata.execution.mode} --sandbox ${metadata.execution.sandbox}
\`\`\``;
}

function validateManagedReferences(managedFiles) {
  const managedPaths = new Set(Object.keys(managedFiles));
  const referencePattern = /\.agents\/(?:prompts|commands)\/[A-Za-z0-9._/-]+\.md/g;
  const runtimeReferencePattern = /scripts\/[A-Za-z0-9._/-]+\.mjs/g;
  const sourceOnlyPattern = /adapters\/codex\/prompts\/[A-Za-z0-9._/-]+\.md/g;

  for (const [managedPath, record] of Object.entries(managedFiles)) {
    if (record.kind !== "codex_prompt" && record.kind !== "codex_command" && record.kind !== "codex_runtime") {
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
    const missingRuntime = [...content.matchAll(runtimeReferencePattern)]
      .map((match) => match[0])
      .filter((reference) => !managedPaths.has(reference));
    if (missingRuntime.length > 0) {
      throw new Error(`${managedPath} references runtime script(s) that are not selected for installation: ${[...new Set(missingRuntime)].join(", ")}`);
    }
  }

  for (const record of Object.values(managedFiles)) {
    delete record.content;
  }
}

function buildPlan(args) {
  const manifest = readManifest();
  const manifestSkills = [...manifest.skills].sort();
  const resolvedProfile = resolveProfile(args.profile, manifest);
  const selectedPromptTemplates = args.skipPrompts ? [] : resolvedProfile.prompts;
  const selectedCommandTemplates = args.skipCommand ? [] : resolvedProfile.commands;
  const skillSeed = args.skills ?? resolvedProfile.skills;
  const routingFixtures = routingFixturesForProfile(args.profile, skillSeed, selectedPromptTemplates);
  const routerReachableSkills = skillsForRoutingFixtures(routingFixtures);
  const requiredSkills = computeRequiredClosure(skillSeed, selectedPromptTemplates, routingFixtures);
  const skills = [...(args.skills ?? requiredSkills)].sort();

  validateSkillNames(skills, manifestSkills);
  validateSkillClosure({ selectedSkills: skills, requiredSkills, profileName: args.profile });
  const requiredAssets = [...new Set([...requiredAssetsForPrompts(selectedPromptTemplates), ...requiredAssetsForSkills(skills)])].sort();
  const coreStatePath = resolve(args.target, ".agent-spectrum-kernel/install-state.json");
  validateCoreInstalled(args.target, coreStatePath, requiredAssets);

  const previousState = readPreviousState(args.target);
  const previousSkillNames = previousItems(previousState, "installed_skills", ["codex_skill", "stale_codex_skill"], "skill").filter((skill) =>
    SKILL_NAME_PATTERN.test(skill),
  );
  const previousPromptNames = previousItems(previousState, "installed_prompts", ["codex_prompt", "stale_codex_prompt"], "prompt");
  const previousCommandNames = previousItems(previousState, "installed_commands", ["codex_command", "stale_codex_command"], "command");
  const previousRuntimeNames = previousItems(previousState, "installed_runtime_scripts", ["codex_runtime", "stale_codex_runtime"], "script");
  const previousAssetNames = Object.entries(previousState?.managed_files ?? {})
    .filter(([, record]) => record?.kind === "codex_asset" || record?.kind === "stale_codex_asset")
    .map(([path]) => path);
  const previousSkills = new Set(previousSkillNames);
  const previousPrompts = new Set(previousPromptNames);
  const previousCommands = new Set(previousCommandNames);
  const selectedRuntimeScripts = selectedCommandTemplates.includes("codex-exec.md") ? CODEX_RUNTIME_SCRIPTS : [];
  const previousRuntimeScripts = new Set(previousRuntimeNames.filter((script) => script !== "review-signal-gate-map.json"));
  const selectedSkills = new Set(skills);
  const selectedPrompts = new Set(selectedPromptTemplates);
  const selectedCommands = new Set(selectedCommandTemplates);
  const selectedRuntime = new Set(selectedRuntimeScripts);
  const selectedAssets = new Set(requiredAssets);
  const staleSkills = [...previousSkills].filter((skill) => !selectedSkills.has(skill)).sort();
  const stalePrompts = [...previousPrompts].filter((prompt) => !selectedPrompts.has(prompt)).sort();
  const staleCommands = [...previousCommands].filter((command) => !selectedCommands.has(command)).sort();
  const staleRuntimeScripts = [...previousRuntimeScripts].filter((script) => !selectedRuntime.has(script)).sort();
  const staleAssets = previousAssetNames.filter((asset) => !selectedAssets.has(asset)).sort();
  if (resolvedProfile.profile.projectionPack && args.skills === null && staleSkills.length > 0 && !args.prune) {
    throw new Error(`Profile '${args.profile}' is a strict projection boundary and excludes managed skill(s): ${staleSkills.join(", ")}. Re-run with --profile ${args.profile} --prune.`);
  }
  const operations = [];
  const managedFiles = {};
  const managedBlocks = {};
  const rollback = lifecycle.createRollbackSnapshot();

  for (const asset of requiredAssets) {
    const source = resolve(REPO_ROOT, asset);
    ensureSource(source, asset);
    const content = readText(source);
    if (CORE_OWNED_IMMUTABLE_ASSETS.includes(asset)) {
      continue;
    }
    managedFiles[asset] = {
      ...lifecycle.createManagedFileRecord({ kind: "codex_asset", asset, content }),
      asset,
    };
    lifecycle.planWriteManaged(operations, {
      target: args.target,
      relativePath: asset,
      content,
      reason: `codex_asset:${asset}`,
      previousState,
      force: args.force,
      rollback,
    });
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
    managedFiles[relativePath] = lifecycle.createManagedFileRecord({ kind: "codex_skill", skill, content });
    lifecycle.planWriteManaged(operations, {
      target: args.target,
      relativePath,
      content,
      reason: `codex_skill:${skill}`,
      previousState,
      force: args.force,
      rollback,
    });
  }

  for (const prompt of selectedPromptTemplates) {
    const source = resolve(REPO_ROOT, "adapters/codex/prompts", prompt);
    ensureSource(source, `adapters/codex/prompts/${prompt}`);
    const content = readText(source);
    const relativePath = `.agents/prompts/${prompt}`;
    managedFiles[relativePath] = {
      ...lifecycle.createManagedFileRecord({ kind: "codex_prompt", prompt, content }),
      prompt,
      required_skills: [...(PROMPT_METADATA[prompt]?.requiredSkills ?? [])].sort(),
      recommended_skills: [...(PROMPT_METADATA[prompt]?.recommendedSkills ?? [])].sort(),
      content,
    };
    lifecycle.planWriteManaged(operations, {
      target: args.target,
      relativePath,
      content,
      reason: `codex_prompt:${prompt}`,
      previousState,
      force: args.force,
      rollback,
    });
  }

  for (const command of selectedCommandTemplates) {
    const source = resolve(REPO_ROOT, "adapters/codex/commands", command);
    ensureSource(source, `adapters/codex/commands/${command}`);
    const content = commandContent(command, selectedPromptTemplates);
    const relativePath = `.agents/commands/${command}`;
    managedFiles[relativePath] = {
      ...lifecycle.createManagedFileRecord({ kind: "codex_command", command, content }),
      generated: command === "codex-exec.md",
      content,
    };
    lifecycle.planWriteManaged(operations, {
      target: args.target,
      relativePath,
      content,
      reason: `codex_command:${command}`,
      previousState,
      force: args.force,
      rollback,
    });
  }

  for (const script of selectedRuntimeScripts) {
    const runtimeFile = CODEX_RUNTIME_FILES.find((file) => file.name === script);
    const source = resolve(REPO_ROOT, runtimeFile?.source ?? "");
    ensureSource(source, runtimeFile?.source ?? script);
    const content = readText(source);
    const relativePath = runtimeFile?.target ?? `scripts/${script}`;
    managedFiles[relativePath] = {
      ...lifecycle.createManagedFileRecord({ kind: "codex_runtime", script, content }),
      script,
      content,
    };
    lifecycle.planWriteManaged(operations, {
      target: args.target,
      relativePath,
      content,
      reason: `codex_runtime:${script}`,
      previousState,
      force: args.force,
      rollback,
    });
  }

  for (const skill of staleSkills) {
    const relativePath = `.agents/skills/${skill}/SKILL.md`;
    if (args.prune) {
      lifecycle.planDeleteManaged(operations, {
        target: args.target,
        relativePath,
        previousState,
        force: args.force,
        rollback,
        reason: `stale Codex managed projection:skill:${skill}`,
      });
      lifecycle.planRemoveEmptyDirectory(operations, args.target, dirname(relativePath), `empty stale Codex managed projection directory:skill:${skill}`);
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
      lifecycle.planDeleteManaged(operations, {
        target: args.target,
        relativePath,
        previousState,
        force: args.force,
        rollback,
        reason: `stale Codex managed projection:prompt:${prompt}`,
      });
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
      lifecycle.planDeleteManaged(operations, {
        target: args.target,
        relativePath,
        previousState,
        force: args.force,
        rollback,
        reason: `stale Codex managed projection:command:${command}`,
      });
    } else {
      const record = previousManagedRecord(previousState, relativePath);
      if (record) {
        managedFiles[relativePath] = { ...record, kind: "stale_codex_command", command };
      }
    }
  }

  for (const script of staleRuntimeScripts) {
    const relativePath = `scripts/${script}`;
    if (args.prune) {
      lifecycle.planDeleteManaged(operations, {
        target: args.target,
        relativePath,
        previousState,
        force: args.force,
        rollback,
        reason: `stale Codex managed projection:runtime:${script}`,
      });
    } else {
      const record = previousManagedRecord(previousState, relativePath);
      if (record) {
        managedFiles[relativePath] = { ...record, kind: "stale_codex_runtime", script };
      }
    }
  }

  for (const asset of staleAssets) {
    if (args.prune) {
      lifecycle.planDeleteManaged(operations, {
        target: args.target,
        relativePath: asset,
        previousState,
        force: args.force,
        rollback,
        reason: `stale Codex managed projection:asset:${asset}`,
      });
      lifecycle.planRemoveEmptyDirectory(operations, args.target, dirname(asset), `empty stale Codex managed projection directory:asset:${asset}`);
    } else {
      const record = previousManagedRecord(previousState, asset);
      if (record) managedFiles[asset] = { ...record, kind: "stale_codex_asset", asset };
    }
  }

  validateManagedReferences(managedFiles);

  const stateSkills = args.prune ? skills : [...new Set([...skills, ...staleSkills])].sort();
  const retainedStaleSkills = args.prune ? [] : staleSkills;
  const statePrompts = args.prune ? selectedPromptTemplates : [...new Set([...selectedPromptTemplates, ...stalePrompts])].sort();
  const retainedStalePrompts = args.prune ? [] : stalePrompts;
  const stateCommands = args.prune ? selectedCommandTemplates : [...new Set([...selectedCommandTemplates, ...staleCommands])].sort();
  const retainedStaleCommands = args.prune ? [] : staleCommands;
  const stateRuntimeScripts = args.prune ? selectedRuntimeScripts : [...new Set([...selectedRuntimeScripts, ...staleRuntimeScripts])].sort();
  const retainedStaleRuntimeScripts = args.prune ? [] : staleRuntimeScripts;
  const recommendedSkills = computeRecommendedSkills(skills, selectedPromptTemplates);
  const targetPartialFileState = Object.fromEntries(Object.keys(managedBlocks).sort().map((path) => [path, existsSync(resolve(args.target, path)) ? readFileSync(resolve(args.target, path), "utf8") : null]));
  const appliedProvenance = lifecycle.buildAppliedProvenance({
    cliOptions: { profile: args.profile, custom_skills: args.skills, skip_prompts: args.skipPrompts, skip_command: args.skipCommand, no_overwrite_skills: args.noOverwriteSkills, prune: args.prune, force: args.force },
    sourceRevision: lifecycle.readGitRevision(REPO_ROOT),
    previousManagedState: previousState,
    managedPartialFiles: managedBlocks,
    targetPartialFileState,
  });
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
    runtimeScripts: stateRuntimeScripts,
    selectedRuntimeScripts,
    retainedStaleRuntimeScripts,
    requiredSkills,
    recommendedSkills,
    routerReachableSkills,
    routingFixtures,
    requiredAssets,
    managedFiles,
    managedBlocks,
    previousState,
    rollback,
    hasMutations: operations.some((operation) => !operation.unchanged),
    customSelection: args.skills !== null,
    appliedProvenance,
  });

  return { operations, staleSkills, stalePrompts, staleCommands, staleAssets, state, recommendedSkills };
}

function printPlan(args, plan) {
  const label = args.check ? "Codex adapter installer check" : args.dryRun ? "Codex adapter installer dry run" : "Codex adapter installed";
  console.log(`${label}: ${args.target}`);
  console.log(`- profile: ${args.profile}`);
  lifecycle.printOperations(args.target, plan.operations);
  console.log(`- write: ${STATE_PATH} (codex_install_state)`);
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
  for (const asset of plan.staleAssets) {
    const action = args.prune ? "pruned" : "stale Codex managed projection";
    console.log(`- ${action}: ${asset}`);
  }
  if (plan.recommendedSkills.length > 0) {
    console.log(`Recommended but not required skill(s): ${plan.recommendedSkills.join(", ")}`);
  }
  console.log("Safety defaults: local Codex file projection only; no hooks, telemetry, secrets, deploys, external publication, or Git commands.");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.rollback) {
    const operations = lifecycle.rollbackLifecycleState({ target: args.target, statePath: STATE_PATH, dryRun: args.dryRun || args.check, force: args.force, preserve: CORE_PRESERVE_PATHS });
    console.log(`${args.dryRun || args.check ? "Codex adapter rollback dry run" : "Codex adapter rolled back"}: ${args.target}`);
    lifecycle.printOperations(args.target, operations);
    return;
  }
  if (args.detach) {
    const operations = lifecycle.detachLifecycleState({ target: args.target, statePath: STATE_PATH, dryRun: args.dryRun || args.check, force: args.force, preserve: CORE_PRESERVE_PATHS });
    console.log(`${args.dryRun || args.check ? "Codex adapter detach dry run" : "Codex adapter detached"}: ${args.target}`);
    lifecycle.printOperations(args.target, operations);
    return;
  }
  const plan = buildPlan(args);
  lifecycle.applyLifecyclePlan({ target: args.target, statePath: STATE_PATH, operations: plan.operations, state: plan.state, dryRun: args.dryRun || args.check });
  printPlan(args, plan);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`install-codex-adapter failed: ${error.message}`);
    process.exit(1);
  }
}
