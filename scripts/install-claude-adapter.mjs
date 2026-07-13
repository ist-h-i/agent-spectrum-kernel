#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as lifecycle from "./installer-lifecycle.mjs";
import { ADAPTER_RENDERER_METADATA, CLAUDE_RUNTIME_FILES } from "./adapter-runtime-inventory.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const STATE_PATH = ".agent-spectrum-kernel/claude-install-state.json";
const CANONICAL_REGISTRY_PATH = "schemas/review-signal-gate-map.json";
const CORE_OWNED_IMMUTABLE_ASSETS = lifecycle.CORE_IMMUTABLE_CONTRACT_ASSETS;
const CORE_PRESERVE_PATHS = [CANONICAL_REGISTRY_PATH, ...CORE_OWNED_IMMUTABLE_ASSETS];
const DEFAULT_PROFILE = "full";
const HOOK_MARKER = "agent-spectrum-kernel:claude-adapter-hook";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PLANE_ORDER = ["execution", "knowledge", "control"];
const DEFAULT_SKILLS = [
  "adr-review",
  "angular-implementation-architecture",
  "application-boundary-architecture",
  "architecture-decision-memory",
  "controlled-implementation",
  "documentation-knowledge-compiler",
  "domain-rule-ledger",
  "doubt-driven-development",
  "evidence-ledger",
  "engineering-capability-evaluation",
  "engineering-pattern-ledger",
  "grill-design",
  "grill-with-docs",
  "handoff-generation",
  "implementation-context-generation",
  "improvement-ledger",
  "mr-readme-generation",
  "next-best-change-finder",
  "operating-mode-router",
  "planning-with-files",
  "project-adoption-pack-generation",
  "refactor-implementation",
  "release-readiness-gate",
  "repository-orientation",
  "requirement-grill",
  "review-adversarial-risk",
  "review-ai-quality",
  "review-architecture-impact",
  "review-automated-gate",
  "review-code-health",
  "review-context-generation",
  "review-domain-impact",
  "review-finding-compiler",
  "review-final-merge-gate",
  "review-output-quality",
  "review-router",
  "review-to-rule-compiler",
  "risk-gate",
  "scope-control",
  "skill-adoption-metrics",
  "skill-effectiveness-evaluation",
  "skill-router",
  "spec-driven-development",
  "test-first-verification",
  "verification-pattern-ledger",
  "work-package-compiler",
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
const RUNTIME_DIRECTORIES = [
  "docs/ai/metrics",
  "docs/ai/reports",
];
const COMMAND_METADATA = {
  "skill-review.md": {
    requiredSkills: ["review-router", "review-final-merge-gate", "evidence-ledger", "risk-gate"],
    requiredAssets: ["docs/execution-envelope-contract.md", "docs/lifecycle-traceability-contract.md"],
  },
  "skill-implement.md": {
    requiredSkills: ["skill-router", "test-first-verification", "controlled-implementation", "evidence-ledger", "risk-gate"],
    requiredAssets: ["docs/execution-envelope-contract.md", "docs/lifecycle-artifact-contract.md", "docs/lifecycle-traceability-contract.md"],
  },
  "skill-investigate.md": {
    requiredSkills: ["skill-router", "doubt-driven-development", "test-first-verification", "evidence-ledger", "risk-gate"],
    requiredAssets: ["docs/execution-envelope-contract.md"],
  },
  "skill-verify.md": {
    requiredSkills: ["test-first-verification", "evidence-ledger"],
    requiredAssets: ["docs/execution-envelope-contract.md", "docs/lifecycle-artifact-contract.md", "docs/lifecycle-traceability-contract.md"],
  },
  "skill-handoff.md": {
    requiredSkills: ["handoff-generation", "evidence-ledger"],
    requiredAssets: ["docs/agent-session-state-contract.md", "docs/execution-envelope-contract.md"],
    initialProjectStateAssets: [],
    runtimeDirectories: [],
  },
  "skill-report.md": {
    requiredSkills: ["skill-adoption-metrics", "evidence-ledger"],
    requiredAssets: [
      "docs/ai/adoption-report-template.md",
      "docs/ai/metrics/README.md",
      "docs/ai/reports/README.md",
      "docs/metrics-event-contract.md",
      "docs/observability-runtime-contract.md",
    ],
    initialProjectStateAssets: [
      "docs/ai/improvement-ledger.md",
      "docs/ai/skill-adoption-metrics.md",
    ],
    runtimeDirectories: [
      "docs/ai/metrics",
      "docs/ai/reports",
    ],
  },
  "skill-ledger-refresh.md": {
    requiredSkills: ["improvement-ledger", "evidence-ledger"],
    requiredAssets: [
      "docs/debt-lifecycle-contract.md",
      "docs/metrics-event-contract.md",
    ],
    initialProjectStateAssets: [
      "docs/ai/improvement-ledger.md",
    ],
    runtimeDirectories: [
      "docs/ai/metrics",
    ],
  },
};
const SKILL_RELATIONSHIPS = {
  "controlled-implementation": {
    requires: ["test-first-verification"],
  },
  "doubt-driven-development": {
    requires: ["test-first-verification"],
  },
  "spec-driven-development": {
    requires: ["work-package-compiler", "test-first-verification", "controlled-implementation"],
  },
  "review-final-merge-gate": {
    requires: ["review-router"],
  },
  "release-readiness-gate": {
    requires: ["risk-gate", "evidence-ledger"],
  },
  "project-adoption-pack-generation": {
    requires: ["repository-orientation"],
  },
  "skill-adoption-metrics": {
    requires: ["evidence-ledger"],
  },
  "skill-effectiveness-evaluation": {
    requires: ["evidence-ledger"],
  },
  "engineering-capability-evaluation": {
    requires: ["evidence-ledger"],
  },
};
const CLAUDE_PROFILES = {
  daily: {
    projectionPack: "daily_delivery",
    commands: ["skill-review.md", "skill-implement.md", "skill-investigate.md", "skill-verify.md", "skill-handoff.md"],
  },
  organizational: {
    projectionPack: "organizational_intelligence",
    commands: COMMAND_TEMPLATES,
  },
  implementation: {
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
    commands: ["skill-implement.md", "skill-verify.md", "skill-handoff.md"],
  },
  investigation: {
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
    commands: ["skill-investigate.md", "skill-verify.md", "skill-handoff.md"],
  },
  review: {
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
    commands: ["skill-review.md", "skill-verify.md", "skill-handoff.md"],
  },
  observability: {
    skills: [
      "operating-mode-router",
      "skill-router",
      "skill-adoption-metrics",
      "skill-effectiveness-evaluation",
      "engineering-capability-evaluation",
      "improvement-ledger",
      "evidence-ledger",
      "risk-gate",
      "handoff-generation",
    ],
    commands: ["skill-report.md", "skill-ledger-refresh.md", "skill-verify.md", "skill-handoff.md"],
  },
  full: {
    skills: DEFAULT_SKILLS,
    commands: COMMAND_TEMPLATES,
  },
};
const PROFILE_ROUTING_FIXTURES = {
  daily: [
    { id: "daily_implementation_available", router: "skill-router", selectedRoute: "controlled-implementation", outcome: "available", requiredSkills: ["controlled-implementation"] },
    { id: "daily_review_available", router: "skill-router", selectedRoute: "review-router", outcome: "available", requiredSkills: ["review-router"] },
    { id: "daily_knowledge_capability_missing", router: "skill-router", selectedRoute: "review-finding-compiler", outcome: "capability_missing", recommendedProfile: "organizational", requiredSkills: [] },
    { id: "daily_adoption_capability_missing", router: "operating-mode-router", selectedRoute: "project-adoption-pack-generation", outcome: "capability_missing", recommendedProfile: "organizational", requiredSkills: [] },
    { id: "daily_observability_capability_missing", router: "operating-mode-router", selectedRoute: "skill-effectiveness-evaluation", outcome: "capability_missing", recommendedProfile: "organizational", requiredSkills: [] },
  ],
  implementation: [
    {
      id: "delivery_quality_mode",
      router: "operating-mode-router",
      selectedRoute: "skill-router",
      requiredSkills: ["skill-router"],
    },
    {
      id: "unfamiliar_repository",
      router: "skill-router",
      selectedRoute: "repository-orientation",
      requiredSkills: ["repository-orientation"],
    },
    {
      id: "unclear_scope",
      router: "skill-router",
      selectedRoute: "scope-control",
      requiredSkills: ["scope-control"],
    },
    {
      id: "boundary_decision",
      router: "skill-router",
      selectedRoute: "application-boundary-architecture",
      requiredSkills: ["application-boundary-architecture"],
    },
    {
      id: "design_grill",
      router: "skill-router",
      selectedRoute: "grill-design",
      requiredSkills: ["grill-design"],
    },
    {
      id: "docs_or_adr_constraints",
      router: "skill-router",
      selectedRoute: "grill-with-docs",
      requiredSkills: ["grill-with-docs"],
    },
    {
      id: "long_running_or_multi_agent",
      router: "skill-router",
      selectedRoute: "planning-with-files",
      requiredSkills: ["planning-with-files"],
    },
  ],
  investigation: [
    {
      id: "delivery_quality_mode",
      router: "operating-mode-router",
      selectedRoute: "skill-router",
      requiredSkills: ["skill-router"],
    },
    {
      id: "bug_investigation",
      router: "skill-router",
      selectedRoute: "doubt-driven-development",
      requiredSkills: ["doubt-driven-development", "test-first-verification", "controlled-implementation", "evidence-ledger"],
    },
    {
      id: "unfamiliar_repository",
      router: "skill-router",
      selectedRoute: "repository-orientation",
      requiredSkills: ["repository-orientation"],
    },
    {
      id: "unclear_scope",
      router: "skill-router",
      selectedRoute: "scope-control",
      requiredSkills: ["scope-control"],
    },
    {
      id: "boundary_decision",
      router: "skill-router",
      selectedRoute: "application-boundary-architecture",
      requiredSkills: ["application-boundary-architecture"],
    },
  ],
  review: [
    {
      id: "review",
      router: "review-router",
      selectedRoute: "review-router",
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
  observability: [
    {
      id: "skill_effectiveness",
      router: "operating-mode-router",
      selectedRoute: "skill-effectiveness-evaluation",
      requiredSkills: ["skill-effectiveness-evaluation", "evidence-ledger"],
    },
    {
      id: "adoption_metrics",
      router: "operating-mode-router",
      selectedRoute: "skill-adoption-metrics",
      requiredSkills: ["skill-adoption-metrics", "evidence-ledger"],
    },
    {
      id: "capability_evaluation",
      router: "operating-mode-router",
      selectedRoute: "engineering-capability-evaluation",
      requiredSkills: ["engineering-capability-evaluation", "evidence-ledger"],
    },
  ],
  full: [],
};

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    profile: DEFAULT_PROFILE,
    dryRun: false,
    skipHooks: false,
    skipRuntime: false,
    prune: false,
    force: false,
    check: false,
    rollback: false,
    detach: false,
    skills: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      args.target = resolve(argv[++i]);
    } else if (arg === "--profile") {
      args.profile = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip-hooks") {
      args.skipHooks = true;
    } else if (arg === "--skip-runtime") {
      args.skipRuntime = true;
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
  --profile <name>     Supported profile: daily, organizational, implementation, investigation, review, observability, full. Defaults to ${DEFAULT_PROFILE}.
  --skills <csv>       Advanced skill override. Installed commands must remain closed over required skills and assets.
  --skip-hooks         Do not copy hook config.
  --skip-runtime       Do not copy local runtime scripts or config.
  --prune              Delete stale managed Claude files from the previous install state.
  --force              Overwrite locally modified managed files.
  --check              Validate the update plan without changing files.
  --rollback           Restore the previous successful managed snapshot.
  --detach, --uninstall Remove Claude execution surfaces and mark the install detached.
  --dry-run            Print planned writes without changing files.
  -h, --help           Show this help.

Install the ASK core first with scripts/install-kernel.mjs. Default mode is
three-way update safe: managed files are updated only when the target still
matches the previous managed hash, unless --force is used. Unrelated existing
settings are preserved, and adapter-owned hooks in .claude/settings.json are
replaced without duplicating hook commands.
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

function ensureSource(path) {
  if (!existsSync(path)) {
    throw new Error(`Required source is missing: ${relative(REPO_ROOT, path)}`);
  }
}

function hasLifecyclePlan(args) {
  return args.managedFiles && args.operations && args.rollback;
}

function copyFilePlanned(source, destination, args, writes, record = { kind: "claude_file" }) {
  ensureSource(source);
  if (!hasLifecyclePlan(args)) {
    writes.push(destination);
    if (args.dryRun) {
      return;
    }
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    return;
  }
  const content = readFileSync(source, "utf8");
  const relativePath = relative(args.target, destination);
  args.managedFiles[relativePath] = lifecycle.createManagedFileRecord({ ...record, content });
  lifecycle.planWriteManaged(args.operations, {
    target: args.target,
    relativePath,
    content,
    reason: record.kind,
    previousState: args.previousState,
    force: args.force,
    rollback: args.rollback,
  });
  writes.push(destination);
}

function copyFileIfAbsentPlanned(source, destination, args, writes) {
  ensureSource(source);
  if (existsSync(destination)) {
    if (hasLifecyclePlan(args)) {
      args.operations.push({
        kind: "write",
        destination,
        relativePath: relative(args.target, destination),
        content: readFileSync(destination, "utf8"),
        reason: "preserve_project_state",
        unchanged: true,
      });
      writes.push(destination);
    }
    return;
  }
  const content = readFileSync(source, "utf8");
  if (hasLifecyclePlan(args)) {
    const relativePath = relative(args.target, destination);
    args.operations.push({
      kind: "write",
      destination,
      relativePath,
      content,
      reason: "initialize_project_state",
      unchanged: false,
    });
    writes.push(destination);
    return;
  }
  writeFilePlanned(destination, content, args, writes);
}

function ensureDirectoryPlanned(destination, args, writes) {
  if (existsSync(destination)) {
    if (!statSync(destination).isDirectory()) {
      throw new Error(`Required directory path exists but is not a directory: ${relative(args.target, destination)}`);
    }
    return;
  }
  const relativePath = relative(args.target, destination);
  writes.push(destination);
  if (!hasLifecyclePlan(args)) {
    if (!args.dryRun) {
      mkdirSync(destination, { recursive: true });
    }
    return;
  }
  args.operations.push({ kind: "mkdir", destination, relativePath, reason: "runtime_directory", unchanged: false });
}

function writeFilePlanned(destination, content, args, writes, record = null, { partialRecord = null } = {}) {
  if (!hasLifecyclePlan(args)) {
    writes.push(destination);
    if (args.dryRun) {
      return;
    }
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
    return;
  }
  const relativePath = relative(args.target, destination);
  if (record) {
    args.managedFiles[relativePath] = lifecycle.createManagedFileRecord({ ...record, content });
    lifecycle.planWriteManaged(args.operations, {
      target: args.target,
      relativePath,
      content,
      reason: record.kind,
      previousState: args.previousState,
      force: args.force,
      rollback: args.rollback,
    });
  } else {
    if (partialRecord) {
      args.managedPartialFiles[relativePath] = lifecycle.createManagedFileRecord({ ...partialRecord, content: partialRecord.content ?? content });
    }
    if (!partialRecord?.skipRollback) {
      lifecycle.captureRollbackFile(args.rollback, args.target, relativePath);
    }
    args.operations.push({
      kind: "write",
      destination,
      relativePath,
      content,
      reason: "partial_file",
      unchanged: existsSync(destination) && readFileSync(destination, "utf8") === content,
    });
  }
  writes.push(destination);
}

function deleteFilePlanned(destination, args, writes) {
  if (!hasLifecyclePlan(args)) {
    writes.push(destination);
    if (args.dryRun || !existsSync(destination)) {
      return;
    }
    unlinkSync(destination);
    const directory = dirname(destination);
    if (existsSync(directory) && statSync(directory).isDirectory() && readdirSync(directory).length === 0) {
      rmdirSync(directory);
    }
    return;
  }
  const relativePath = relative(args.target, destination);
  lifecycle.captureRollbackFile(args.rollback, args.target, relativePath);
  args.operations.push({
    kind: "delete_file",
    destination,
    relativePath,
    reason: "remove_legacy_adapter_file",
    unchanged: !existsSync(destination),
  });
  lifecycle.planRemoveEmptyDirectory(args.operations, args.target, relative(args.target, dirname(destination)), "empty managed directory");
  writes.push(destination);
}

function installSkills(args, writes) {
  for (const skill of args.selectedSkills) {
    const source = resolve(REPO_ROOT, "skills", skill, "SKILL.md");
    const destination = resolve(args.target, ".claude", "skills", skill, "SKILL.md");
    copyFilePlanned(source, destination, args, writes, { kind: "claude_skill", skill });
  }
}

function installCommands(args, writes) {
  for (const command of args.selectedCommands) {
    const source = resolve(REPO_ROOT, "adapters/claude-code/project/.claude/commands", command);
    const destination = resolve(args.target, ".claude", "commands", command);
    copyFilePlanned(source, destination, args, writes, { kind: "claude_command", command });
  }
}

function installHooks(args, writes) {
  if (args.skipHooks || args.skipRuntime) {
    removeManagedHooks(args, writes);
    args.managedHooks = [];
    return;
  }
  const hooksSource = resolve(REPO_ROOT, "adapters/claude-code/project/.claude/hooks/hooks.json");
  const settingsPath = resolve(args.target, ".claude", "settings.json");
  const hooksSettings = JSON.parse(readFileSync(hooksSource, "utf8"));
  let settings = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  }
  prepareManagedHookMutation(settings, args);
  settings.hooks = mergeHooks(settings.hooks ?? {}, hooksSettings.hooks ?? {});
  args.managedHooks = normalizeHooks(hooksSettings.hooks ?? {});
  writeFilePlanned(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, args, writes, null, { partialRecord: { kind: "claude_settings", content: JSON.stringify(args.managedHooks), skipRollback: true } });
  removeLegacyHooksFile(args, writes);
}

function mergeHooks(existingHooks, adapterHooks) {
  const merged = removeAdapterOwnedHooks(existingHooks);
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

function removeManagedHooks(args, writes) {
  const settingsPath = resolve(args.target, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    prepareManagedHookMutation(settings, args);
    const nextHooks = removeAdapterOwnedHooks(settings.hooks ?? {});
    const nextSettings = { ...settings, hooks: nextHooks };
    if (JSON.stringify(settings.hooks ?? {}) !== JSON.stringify(nextHooks)) {
      writeFilePlanned(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, args, writes, null, { partialRecord: { kind: "claude_settings", content: JSON.stringify(normalizeHooks(nextHooks)), skipRollback: true } });
    }
  }
  removeLegacyHooksFile(args, writes);
  if (args.prune) {
    delete args.managedPartialFiles[".claude/settings.json"];
  } else if (!args.managedPartialFiles[".claude/settings.json"] && args.previousState?.managed_partial_files?.[".claude/settings.json"]) {
    args.managedPartialFiles[".claude/settings.json"] = args.previousState.managed_partial_files[".claude/settings.json"];
  }
}

function prepareManagedHookMutation(settings, args) {
  const subset = normalizeHooks(settings.hooks ?? {});
  const currentHash = lifecycle.hashText(JSON.stringify(subset));
  const expectedHash = args.previousState?.managed_partial_files?.[".claude/settings.json"]?.sha256;
  if (expectedHash && currentHash !== expectedHash && !args.force) {
    throw new Error("managed hook subset conflict: .claude/settings.json ASK hooks were modified locally. Use --force to overwrite.");
  }
  if (args.force && !Object.hasOwn(args.rollback.hooks, ".claude/settings.json")) {
    args.rollback.hooks[".claude/settings.json"] = subset;
  }
}

function removeLegacyHooksFile(args, writes) {
  const hooksPath = resolve(args.target, ".claude", "hooks", "hooks.json");
  if (!existsSync(hooksPath)) {
    return;
  }
  let hookConfig;
  try {
    hookConfig = JSON.parse(readFileSync(hooksPath, "utf8"));
  } catch {
    return;
  }
  const hooks = hookConfig.hooks ?? {};
  const hasOnlyAdapterHooks = Object.values(hooks).every((groups) =>
    Array.isArray(groups) &&
    groups.every((group) =>
      (group.hooks ?? []).every((hook) => isAdapterOwnedHook(hook)),
    ),
  );
  if (hasOnlyAdapterHooks) {
    deleteFilePlanned(hooksPath, args, writes);
  }
}

function removeAdapterOwnedHooks(existingHooks) {
  const cleaned = {};
  for (const [eventName, groups] of Object.entries(existingHooks ?? {})) {
    if (!Array.isArray(groups)) {
      cleaned[eventName] = groups;
      continue;
    }
    const nextGroups = [];
    for (const group of groups) {
      const hooks = (Array.isArray(group.hooks) ? group.hooks : []).filter((hook) => !isAdapterOwnedHook(hook));
      if (hooks.length > 0) {
        nextGroups.push({ ...group, hooks });
      }
    }
    if (nextGroups.length > 0) {
      cleaned[eventName] = nextGroups;
    }
  }
  return cleaned;
}

function isAdapterOwnedHook(hook) {
  const command = typeof hook?.command === "string" ? hook.command : "";
  return command.includes(HOOK_MARKER) || command.includes("ai-metrics-record.mjs") || command.includes("ai-skills-metrics-record");
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
  for (const file of CLAUDE_RUNTIME_FILES) {
    copyFilePlanned(resolve(REPO_ROOT, file.source), resolve(args.target, file.target), args, writes, { kind: "claude_runtime", script: file.name });
  }
  copyFilePlanned(
    resolve(REPO_ROOT, "docs/ai/observability-config.yml"),
    resolve(args.target, "docs/ai/observability-config.yml"),
    args,
    writes,
    { kind: "claude_config", config: "docs/ai/observability-config.yml" },
  );
  ensureDirectoryPlanned(resolve(args.target, "docs/ai/metrics"), args, writes);
  ensureDirectoryPlanned(resolve(args.target, "docs/ai/reports"), args, writes);
}

function installAssets(args, writes) {
  for (const asset of args.requiredAssets) {
    if (CORE_OWNED_IMMUTABLE_ASSETS.includes(asset)) {
      continue;
    }
    copyFilePlanned(resolve(REPO_ROOT, asset), resolve(args.target, asset), args, writes, { kind: "claude_asset", asset });
  }
  for (const asset of args.initialProjectStateAssets) {
    copyFileIfAbsentPlanned(resolve(REPO_ROOT, asset), resolve(args.target, asset), args, writes);
  }
  for (const directory of args.runtimeDirectories) {
    ensureDirectoryPlanned(resolve(args.target, directory), args, writes);
  }
}

function requiredSkillsForCommands(commands) {
  return commands.flatMap((command) => COMMAND_METADATA[command]?.requiredSkills ?? []);
}

function requiredAssetsForSkills(skills) {
  const assets = new Set();
  for (const skill of skills) {
    const sourcePath = resolve(REPO_ROOT, "skills", skill, "SKILL.md");
    const content = readFileSync(sourcePath, "utf8");
    for (const asset of CORE_OWNED_IMMUTABLE_ASSETS) {
      if (content.includes(asset)) {
        assets.add(asset);
      }
    }
  }
  return [...assets].sort();
}

function routingFixturesForProfile(profileName, seedSkills, selectedCommands) {
  const selectedRouters = new Set([...seedSkills, ...requiredSkillsForCommands(selectedCommands)]);
  return (PROFILE_ROUTING_FIXTURES[profileName] ?? []).filter((fixture) => selectedRouters.has(fixture.router));
}

function skillsForRoutingFixtures(routingFixtures) {
  const skills = new Set();
  for (const fixture of routingFixtures) {
    if (fixture.outcome === "capability_missing") continue;
    if (fixture.selectedRoute && SKILL_NAME_PATTERN.test(fixture.selectedRoute)) {
      skills.add(fixture.selectedRoute);
    }
    for (const skill of fixture.requiredSkills ?? []) {
      skills.add(skill);
    }
  }
  return [...skills].sort();
}

function computeRequiredClosure(seedSkills, selectedCommands, routingFixtures) {
  const required = new Set([...seedSkills, ...requiredSkillsForCommands(selectedCommands), ...skillsForRoutingFixtures(routingFixtures)]);
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

function validateCoreInstalled(args) {
  const statePath = resolve(args.target, CORE_STATE_PATH);
  if (!existsSync(statePath)) {
    throw new Error(`ASK core install state is missing: ${CORE_STATE_PATH}. Run: node scripts/install-kernel.mjs --target ${args.target} --merge-agents`);
  }
  let state;
  try { state = readJson(statePath); } catch { throw new Error("ASK core install state is invalid JSON."); }
  const record = state?.managed_blocks?.["AGENTS.md#agent-spectrum-kernel"];
  const agentsPath = resolve(args.target, "AGENTS.md");
  const block = existsSync(agentsPath) ? lifecycle.extractManagedBlock(readFileSync(agentsPath, "utf8")) : null;
  if (state?.install_status !== "installed" || !record?.sha256 || !block || lifecycle.hashText(block.content) !== record.sha256) {
    throw new Error("ASK core installation is not active or its AGENTS.md managed block does not match install state.");
  }
  const registryPath = resolve(args.target, CANONICAL_REGISTRY_PATH);
  const registryRecord = state?.managed_files?.[CANONICAL_REGISTRY_PATH];
  if (!registryRecord?.sha256 || !existsSync(registryPath) || lifecycle.hashText(readFileSync(registryPath, "utf8")) !== registryRecord.sha256) {
    throw new Error(`ASK core canonical review signal registry is missing or does not match core install state: ${CANONICAL_REGISTRY_PATH}`);
  }
  for (const asset of args.requiredAssets.filter((path) => CORE_OWNED_IMMUTABLE_ASSETS.includes(path))) {
    const sourceContent = readFileSync(resolve(REPO_ROOT, asset), "utf8");
    const record = state?.managed_files?.[asset];
    const targetPath = resolve(args.target, asset);
    if (record?.kind !== "immutable_contract" || record.sha256 !== lifecycle.hashText(sourceContent) || !existsSync(targetPath) || lifecycle.hashText(readFileSync(targetPath, "utf8")) !== record.sha256) {
      throw new Error(`ASK core immutable contract is missing or stale: ${asset}. Re-run scripts/install-kernel.mjs before installing the Claude adapter.`);
    }
  }
}

function readPreviousState(target) {
  const statePath = resolve(target, STATE_PATH);
  if (!existsSync(statePath)) {
    return null;
  }
  return readJson(statePath);
}

function resolveSelection(args) {
  const manifest = readManifest();
  const profile = CLAUDE_PROFILES[args.profile];
  if (!profile) {
    throw new Error(`Unknown profile: ${args.profile}`);
  }
  const manifestSkillSet = new Set(manifest.skills);
  const profileSkills = profile.projectionPack
    ? manifest.projection_packs?.[profile.projectionPack]?.skills
    : profile.skills === null ? manifest.skills : profile.skills;
  if (!Array.isArray(profileSkills)) {
    throw new Error(`Profile '${args.profile}' references missing projection pack '${profile.projectionPack}'`);
  }
  const selectedCommands = [...profile.commands];
  const skillSeed = args.skills ?? profileSkills;
  const routingFixtures = routingFixturesForProfile(args.profile, skillSeed, selectedCommands);
  const requiredSkills = computeRequiredClosure(skillSeed, selectedCommands, routingFixtures);
  const selectedSkills = [...new Set(args.skills ?? requiredSkills)].sort();
  const unknownSkills = selectedSkills.filter((skill) => !manifestSkillSet.has(skill));
  if (unknownSkills.length > 0) {
    throw new Error(`Unknown skill(s): ${unknownSkills.join(", ")}`);
  }
  const selectedSkillSet = new Set(selectedSkills);
  for (const command of selectedCommands) {
    if (!COMMAND_METADATA[command]) {
      throw new Error(`Missing command metadata: ${command}`);
    }
  }
  const missingRequiredSkills = requiredSkills.filter((skill) => !selectedSkillSet.has(skill));
  if (missingRequiredSkills.length > 0) {
    throw new Error(`Selected Claude commands are not closed over installed skills: ${missingRequiredSkills.join(", ")}`);
  }
  const requiredAssets = [...new Set([
    ...selectedCommands.flatMap((command) => COMMAND_METADATA[command].requiredAssets),
    ...requiredAssetsForSkills(selectedSkills),
  ])].sort();
  const initialProjectStateAssets = [...new Set(selectedCommands.flatMap((command) => COMMAND_METADATA[command].initialProjectStateAssets ?? []))].sort();
  const runtimeDirectories = [...new Set(selectedCommands.flatMap((command) => COMMAND_METADATA[command].runtimeDirectories ?? []))].sort();
  args.selectedSkills = selectedSkills;
  args.selectedCommands = selectedCommands;
  args.requiredAssets = requiredAssets;
  args.initialProjectStateAssets = initialProjectStateAssets;
  args.runtimeDirectories = runtimeDirectories;
  args.routingFixtures = routingFixtures;
  args.requiredSkills = requiredSkills;
  args.routerReachableSkills = skillsForRoutingFixtures(routingFixtures);
}

function claudeRendererInputsForSelection(args, { skipHooks, skipRuntime }) {
  const canonical = [
    { path: "AGENTS.md", role: "kernel" },
    { path: "manifest.json", role: "manifest" },
    { path: "docs/adapter-runtime-boundary-contract.md", role: "contract" },
    { path: "schemas/adapter-runtime-profile.schema.json", role: "schema" },
    { path: "schemas/adapter-runtime-evidence.schema.json", role: "schema" },
    { path: "schemas/normalized-event-schema-registry.json", role: "schema" },
    { path: "schemas/metrics-event.schema.json", role: "schema" },
    ...args.selectedSkills.map((skill) => ({ path: `skills/${skill}/SKILL.md`, role: "skill" })),
    ...args.requiredAssets.filter((path) => path.startsWith("schemas/") || path.endsWith("-contract.md")).map((path) => ({ path, role: path.startsWith("schemas/") ? "schema" : "contract" })),
  ];
  const adapterOwned = [
    { path: "scripts/install-claude-adapter.mjs", role: "renderer" },
    { path: "scripts/installer-lifecycle.mjs", role: "runtime_source" },
    { path: "scripts/adapter-runtime-inventory.mjs", role: "inventory" },
    ...(!skipHooks && !skipRuntime ? [{ path: "adapters/claude-code/project/.claude/hooks/hooks.json", role: "hook_template" }] : []),
    ...args.selectedCommands.map((command) => ({ path: `adapters/claude-code/project/.claude/commands/${command}`, role: "command_template" })),
    ...(!skipRuntime ? CLAUDE_RUNTIME_FILES.map((file) => ({ path: file.source, role: file.assetKind === "schemas" ? "runtime_schema" : "runtime_source" })) : []),
    ...(!skipRuntime ? [{ path: "docs/ai/observability-config.yml", role: "config_source" }] : []),
    ...args.requiredAssets.filter((path) => !path.startsWith("schemas/") && !path.endsWith("-contract.md")).map((path) => ({ path, role: "config_source" })),
    ...args.initialProjectStateAssets.map((path) => ({ path, role: "config_source" })),
  ];
  const dedupe = (items) => [...new Map(items.map((item) => [item.path, item])).values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { canonical: dedupe(canonical), adapter_owned: dedupe(adapterOwned) };
}

function claudeProjectedManagedAssets(args, { skipHooks, skipRuntime }) {
  const inventorySourceRef = "scripts/install-claude-adapter.mjs";
  const assets = [
    ...args.selectedSkills.map((skill) => ({ path: `.claude/skills/${skill}/SKILL.md`, asset_kind: "skills", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
    ...args.selectedCommands.map((command) => ({ path: `.claude/commands/${command}`, asset_kind: "commands", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
    ...(!skipHooks && !skipRuntime ? [{ path: ".claude/settings.json", asset_kind: "hooks", ownership_mode: "partial_file", inventory_source_ref: inventorySourceRef }] : []),
    ...(!skipRuntime ? CLAUDE_RUNTIME_FILES.map((file) => ({ path: file.target, asset_kind: file.assetKind, ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })) : []),
    ...(!skipRuntime ? [{ path: "docs/ai/observability-config.yml", asset_kind: "configuration", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef }] : []),
    ...args.requiredAssets.filter((path) => !CORE_OWNED_IMMUTABLE_ASSETS.includes(path)).map((path) => ({ path, asset_kind: "configuration", ownership_mode: "full_file", inventory_source_ref: inventorySourceRef })),
    ...new Set([...(args.runtimeDirectories ?? []), ...(!skipRuntime ? RUNTIME_DIRECTORIES : [])].map((path) => path)),
  ];
  const normalized = assets.flatMap((asset) => typeof asset === "string" ? [{ path: asset, asset_kind: "runtime_data", ownership_mode: "runtime_directory", inventory_source_ref: inventorySourceRef }] : [asset]);
  return [...new Map(normalized.map((asset) => [asset.path, asset])).values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function claudeAssetKindForRecord(path, record) {
  if (path.startsWith(".claude/skills/")) return "skills";
  if (path.startsWith(".claude/commands/")) return "commands";
  if (path === ".claude/settings.json") return "hooks";
  if (String(record?.kind ?? "").includes("runtime")) return "runner";
  return "configuration";
}

export function buildClaudeProjectionPlan({ profileName, skills = null, skipHooks = false, skipRuntime = false, previousState = null, prune = false } = {}) {
  const args = { profile: profileName, skills };
  resolveSelection(args);
  const planShapingOptions = { skills: skills ? [...new Set(skills)].sort() : null, skip_hooks: skipHooks, skip_runtime: skipRuntime };
  const rendererInputs = claudeRendererInputsForSelection(args, { skipHooks, skipRuntime });
  const projectedManagedAssets = claudeProjectedManagedAssets(args, { skipHooks, skipRuntime });
  const actualByPath = new Map(projectedManagedAssets.map((asset) => [asset.path, { ...asset, retained_stale: false }]));
  if (!prune) {
    for (const [path, record] of Object.entries(previousState?.managed_files ?? {})) {
      if (!actualByPath.has(path) && (String(record?.kind ?? "").startsWith("claude_") || String(record?.kind ?? "").startsWith("stale_claude_"))) {
        actualByPath.set(path, { path, asset_kind: claudeAssetKindForRecord(path, record), ownership_mode: "full_file", inventory_source_ref: "scripts/install-claude-adapter.mjs", retained_stale: true });
      }
    }
  }
  if (!prune && !actualByPath.has(".claude/settings.json") && previousState?.managed_partial_files?.[".claude/settings.json"]) {
    actualByPath.set(".claude/settings.json", { path: ".claude/settings.json", asset_kind: "hooks", ownership_mode: "partial_file", inventory_source_ref: "scripts/install-claude-adapter.mjs", retained_stale: true });
  }
  const provenance = lifecycle.buildProjectionPlanProvenance({
    repoRoot: REPO_ROOT,
    rendererId: ADAPTER_RENDERER_METADATA.claude_code.rendererId,
    rendererVersion: ADAPTER_RENDERER_METADATA.claude_code.rendererVersion,
    rendererProfile: profileName,
    planShapingOptions,
    rendererInputs,
    projectedManagedAssets,
  });
  return { ...args, ...provenance, projectedManagedAssets, actualInstalledInventory: [...actualByPath.values()].sort((left, right) => left.path.localeCompare(right.path)), prune };
}

export function claudeRendererInputPathsForProfile(profileName) {
  return buildClaudeProjectionPlan({ profileName }).renderer_inputs;
}

export function claudeManagedAssetsForProfile(profileName) {
  return buildClaudeProjectionPlan({ profileName }).projectedManagedAssets;
}

function normalizeHooks(hooks) {
  const normalized = [];
  for (const [eventName, groups] of Object.entries(hooks ?? {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        if (isAdapterOwnedHook(hook)) {
          normalized.push({
            event: eventName,
            matcher: group.matcher ?? "",
            type: hook.type ?? "",
            command: hook.command ?? "",
            sha256: lifecycle.hashText(JSON.stringify([eventName, group.matcher ?? "", hook.type ?? "", hook.command ?? ""])),
          });
        }
      }
    }
  }
  return normalized.sort((a, b) => `${a.event}:${a.matcher}:${a.command}`.localeCompare(`${b.event}:${b.matcher}:${b.command}`));
}

function hooksFromManagedRecords(records) {
  const hooks = {};
  for (const record of records ?? []) {
    const groups = hooks[record.event] ?? [];
    let group = groups.find((item) => (item.matcher ?? "") === record.matcher);
    if (!group) {
      group = { ...(record.matcher ? { matcher: record.matcher } : {}), hooks: [] };
      groups.push(group);
      hooks[record.event] = groups;
    }
    group.hooks.push({ type: record.type, command: record.command });
  }
  return hooks;
}

function restoreManagedHookSubset(target, state, { force }) {
  const settingsPath = resolve(target, ".claude/settings.json");
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  const currentSubset = normalizeHooks(settings.hooks ?? {});
  const currentHash = lifecycle.hashText(JSON.stringify(currentSubset));
  const pendingHash = state.managed_partial_files?.[".claude/settings.json"]?.sha256;
  const rollbackRecords = state.rollback?.hooks?.[".claude/settings.json"] ?? state.previous_successful_state?.managed_hooks ?? [];
  const rollbackHash = lifecycle.hashText(JSON.stringify(rollbackRecords));
  if (currentHash === rollbackHash) {
    return null;
  }
  if (!force && currentHash !== pendingHash) {
    throw new Error("managed hook subset conflict: .claude/settings.json ASK hooks were modified locally. Use --force to overwrite.");
  }
  const restoredHooks = mergeHooks(settings.hooks ?? {}, hooksFromManagedRecords(rollbackRecords));
  const content = `${JSON.stringify({ ...settings, hooks: restoredHooks }, null, 2)}\n`;
  const existing = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : null;
  const operation = { kind: "write", destination: settingsPath, relativePath: ".claude/settings.json", content, reason: "rollback:restore-managed-hook-subset", unchanged: existing === content };
  return operation;
}

function manageStaleFiles(args, writes) {
  const currentPaths = new Set(Object.keys(args.managedFiles));
  args.retainedStaleFiles = [];
  for (const [relativePath, record] of Object.entries(args.previousState?.managed_files ?? {}).sort()) {
    if (relativePath === CANONICAL_REGISTRY_PATH) {
      continue;
    }
    if (CORE_OWNED_IMMUTABLE_ASSETS.includes(relativePath)) {
      continue;
    }
    if (currentPaths.has(relativePath)) {
      continue;
    }
    if (!String(record.kind ?? "").startsWith("claude_") && !String(record.kind ?? "").startsWith("stale_claude_")) {
      continue;
    }
    if (args.prune) {
      lifecycle.planDeleteManaged(args.operations, {
        target: args.target,
        relativePath,
        previousState: args.previousState,
        force: args.force,
        rollback: args.rollback,
        reason: `stale Claude managed projection:${relativePath}`,
      });
      lifecycle.planRemoveEmptyDirectory(args.operations, args.target, dirname(relativePath), `empty stale Claude managed projection directory:${relativePath}`);
    } else {
      args.managedFiles[relativePath] = { ...record, kind: `stale_${String(record.kind ?? "claude_file").replace(/^stale_/, "")}` };
      args.retainedStaleFiles.push(relativePath);
    }
    writes.push(resolve(args.target, relativePath));
  }
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

function enforceProjectionBoundary(args, manifest) {
  const profile = CLAUDE_PROFILES[args.profile];
  if (!profile?.projectionPack || args.skills !== null || !args.previousState) return;
  const selected = new Set(args.selectedSkills);
  const excluded = (args.previousState.installed_skills ?? []).filter((skill) => manifest.skills.includes(skill) && !selected.has(skill)).sort();
  if (excluded.length > 0 && !args.prune) {
    throw new Error(`Profile '${args.profile}' is a strict projection boundary and excludes managed skill(s): ${excluded.join(", ")}. Re-run with --profile ${args.profile} --prune.`);
  }
}

function buildState(args, manifest) {
  const plannedInventoryPaths = args.projectionPlan.actualInstalledInventory.map((asset) => asset.path).sort();
  const stateInventoryPaths = [
    ...Object.keys(args.managedFiles),
    ...Object.keys(args.managedPartialFiles),
    ...args.projectionPlan.actualInstalledInventory.filter((asset) => asset.ownership_mode === "runtime_directory").map((asset) => asset.path),
  ].sort();
  if (JSON.stringify(plannedInventoryPaths) !== JSON.stringify(stateInventoryPaths)) {
    throw new Error(`pure projection plan inventory does not match Claude lifecycle state: planned=${plannedInventoryPaths.join(",")} actual=${stateInventoryPaths.join(",")}`);
  }
  const selectedSkills = args.selectedSkills;
  const retainedStaleSkills = args.retainedStaleFiles
    .filter((path) => path.startsWith(".claude/skills/"))
    .map((path) => path.split("/")[2])
    .filter(Boolean)
    .sort();
  const installedSkills = [...new Set([...selectedSkills, ...retainedStaleSkills])].sort();
  const projectionPackName = matchingProjectionPack(selectedSkills, manifest);
  const targetPartialFileState = Object.fromEntries(Object.keys(args.managedPartialFiles).sort().map((path) => [path, existsSync(resolve(args.target, path)) ? readFileSync(resolve(args.target, path), "utf8") : null]));
  const appliedProvenance = lifecycle.buildAppliedProvenance({
    cliOptions: { profile: args.profile, custom_skills: args.skills, skip_hooks: args.skipHooks, skip_runtime: args.skipRuntime, prune: args.prune, force: args.force },
    sourceRevision: lifecycle.readGitRevision(REPO_ROOT),
    previousManagedState: args.previousState,
    managedPartialFiles: args.managedPartialFiles,
    targetPartialFileState,
  });
  const selectedRuntimeScripts = args.skipRuntime ? [] : CLAUDE_RUNTIME_FILES.map((file) => file.name).sort();
  const managedSubset = {
    projected_managed_assets: args.projectionPlan.projectedManagedAssets,
    actual_installed_inventory: args.projectionPlan.actualInstalledInventory,
    selected_skills: selectedSkills,
    selected_commands: args.selectedCommands,
    selected_runtime_scripts: selectedRuntimeScripts,
    managed_partial_paths: Object.keys(args.managedPartialFiles).sort(),
  };
  const previousManagedSubset = args.previousState ? {
    projected_managed_assets: args.previousState.projection_plan?.projected_managed_assets ?? [],
    actual_installed_inventory: args.previousState.actual_installed_inventory ?? [],
    selected_skills: args.previousState.selected_skills ?? [],
    selected_commands: args.previousState.selected_commands ?? [],
    selected_runtime_scripts: args.previousState.selected_runtime_scripts ?? [],
    managed_partial_paths: Object.keys(args.previousState.managed_partial_files ?? {}).sort(),
  } : null;
  const managedSubsetFingerprint = lifecycle.canonicalValueDigest(managedSubset);
  const managedSubsetChanged = !previousManagedSubset || managedSubsetFingerprint !== lifecycle.canonicalValueDigest(previousManagedSubset);
  const lastChangedProvenance = args.operations.some((operation) => !operation.unchanged) || managedSubsetChanged
    ? appliedProvenance
    : args.previousState?.last_changed_provenance ?? args.previousState?.applied_provenance ?? null;
  return lifecycle.buildLifecycleState({
    manifest,
    repoRoot: REPO_ROOT,
    adapterName: "agent-spectrum-claude-adapter",
    adapterVersion: Number(ADAPTER_RENDERER_METADATA.claude_code.rendererVersion),
    selectedProfile: args.profile,
    target: {
      skills_root: ".claude/skills",
      commands_root: ".claude/commands",
      settings: ".claude/settings.json",
      runtime_scripts_root: "scripts",
    },
    installedSkills,
    selectedSkills,
    managedFiles: args.managedFiles,
    managedPartialFiles: args.managedPartialFiles,
    managedHooks: args.managedHooks,
    previousState: args.previousState,
    rollback: args.rollback,
    hasMutations: args.operations.some((operation) => !operation.unchanged),
    extra: {
      selection_mode: args.skills !== null ? "custom" : CLAUDE_PROFILES[args.profile]?.projectionPack ? "projection_pack" : "profile",
      selected_projection_pack: projectionPackName,
      selected_planes: planesForSkills(selectedSkills, manifest),
      installed_planes: planesForSkills(installedSkills, manifest),
      knowledge_write_policy: "explicit_only",
      installed_commands: [...new Set([...args.selectedCommands, ...args.retainedStaleFiles.filter((path) => path.startsWith(".claude/commands/")).map((path) => path.split("/").at(-1))])].sort(),
      selected_commands: args.selectedCommands,
      retained_stale_files: args.retainedStaleFiles,
      retained_stale_skills: retainedStaleSkills,
      required_assets: args.requiredAssets,
      initial_project_state_assets: args.initialProjectStateAssets,
      runtime_directories: args.projectionPlan.actualInstalledInventory.filter((asset) => asset.ownership_mode === "runtime_directory").map((asset) => asset.path),
      selected_runtime_scripts: selectedRuntimeScripts,
      managed_subset_fingerprint: managedSubsetFingerprint,
      applied_provenance: appliedProvenance,
      last_applied_provenance: appliedProvenance,
      last_changed_provenance: lastChangedProvenance,
      projection_plan: {
        fingerprint: args.projectionPlan.fingerprint,
        renderer_id: args.projectionPlan.renderer_id,
        renderer_version: args.projectionPlan.renderer_version,
        renderer_profile: args.projectionPlan.renderer_profile,
        plan_shaping_options: args.projectionPlan.plan_shaping_options,
        canonical_source_digest: args.projectionPlan.canonical_source_digest,
        renderer_inputs: args.projectionPlan.renderer_inputs,
        projected_managed_assets: args.projectionPlan.projectedManagedAssets,
      },
      actual_installed_inventory: args.projectionPlan.actualInstalledInventory,
      skill_closure: {
        required_skills: args.requiredSkills,
        router_reachable_skills: args.routerReachableSkills,
        routing_fixtures: args.routingFixtures.map((fixture) => ({
          id: fixture.id,
          router: fixture.router,
          selected_route: fixture.selectedRoute,
          outcome: fixture.outcome ?? "available",
          recommended_profile: fixture.recommendedProfile ?? null,
          required_skills: [...(fixture.requiredSkills ?? [])].sort(),
        })),
      },
    },
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const writes = [];

  if (args.rollback) {
    const operations = lifecycle.rollbackLifecycleState({
      target: args.target,
      statePath: STATE_PATH,
      dryRun: args.dryRun || args.check,
      force: args.force,
      preserve: CORE_PRESERVE_PATHS,
      extendOperations: ({ state, operations: plan }) => {
        const hookOperation = restoreManagedHookSubset(args.target, state, { force: args.force });
        if (hookOperation) plan.push(hookOperation);
      },
    });
    console.log(`${args.dryRun || args.check ? "Claude adapter rollback dry run" : "Claude adapter rolled back"}: ${args.target}`);
    lifecycle.printOperations(args.target, operations);
    return;
  }
  if (args.detach) {
    const state = readJson(resolve(args.target, STATE_PATH));
    const hookArgs = {
      ...args,
      previousState: state,
      operations: [],
      managedFiles: {},
      managedPartialFiles: {},
      rollback: lifecycle.createRollbackSnapshot(),
    };
    const hookWrites = [];
    removeManagedHooks(hookArgs, hookWrites);
    const detachOperations = lifecycle.detachLifecycleState({ target: args.target, statePath: STATE_PATH, dryRun: true, force: args.force, preserve: CORE_PRESERVE_PATHS });
    const operations = [...hookArgs.operations, ...detachOperations];
    if (!args.dryRun && !args.check) {
      lifecycle.applyOperations(operations, false);
      writeFileSync(resolve(args.target, STATE_PATH), `${JSON.stringify({ ...lifecycle.stripRollbackState(state), install_status: "detached", detached_at: new Date().toISOString() }, null, 2)}\n`);
    }
    console.log(`${args.dryRun || args.check ? "Claude adapter detach dry run" : "Claude adapter detached"}: ${args.target}`);
    lifecycle.printOperations(args.target, operations);
    return;
  }

  const manifest = readManifest();
  args.previousState = readPreviousState(args.target);
  args.operations = [];
  args.managedFiles = {};
  args.managedPartialFiles = {};
  args.managedHooks = [];
  args.rollback = lifecycle.createRollbackSnapshot();
  args.projectionPlan = buildClaudeProjectionPlan({
    profileName: args.profile,
    skills: args.skills,
    skipHooks: args.skipHooks,
    skipRuntime: args.skipRuntime,
    previousState: args.previousState,
    prune: args.prune,
  });
  Object.assign(args, {
    selectedSkills: args.projectionPlan.selectedSkills,
    selectedCommands: args.projectionPlan.selectedCommands,
    requiredAssets: args.projectionPlan.requiredAssets,
    initialProjectStateAssets: args.projectionPlan.initialProjectStateAssets,
    runtimeDirectories: args.projectionPlan.runtimeDirectories,
    routingFixtures: args.projectionPlan.routingFixtures,
    requiredSkills: args.projectionPlan.requiredSkills,
    routerReachableSkills: args.projectionPlan.routerReachableSkills,
  });
  enforceProjectionBoundary(args, manifest);
  validateCoreInstalled(args);
  installSkills(args, writes);
  installCommands(args, writes);
  installAssets(args, writes);
  installHooks(args, writes);
  installRuntime(args, writes);
  manageStaleFiles(args, writes);
  const state = buildState(args, manifest);
  lifecycle.applyLifecyclePlan({ target: args.target, statePath: STATE_PATH, operations: args.operations, state, dryRun: args.dryRun || args.check });

  const label = args.check ? "Claude adapter check" : args.dryRun ? "Claude adapter dry run" : "Claude adapter installed";
  console.log(`${label}: ${args.target}`);
  console.log(`- profile: ${args.profile}`);
  if (args.skipRuntime) {
    console.log("- runtime hooks: skipped because --skip-runtime was used");
  } else if (args.skipHooks) {
    console.log("- runtime hooks: skipped because --skip-hooks was used");
  }
  lifecycle.printOperations(args.target, args.operations);
  console.log(`- ${STATE_PATH}`);
  console.log("Privacy defaults: local project storage, no external publication, no raw prompt storage.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`install-claude-adapter failed: ${error.message}`);
    process.exit(1);
  }
}
