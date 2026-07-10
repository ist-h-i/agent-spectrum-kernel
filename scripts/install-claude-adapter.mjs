#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as lifecycle from "./installer-lifecycle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const STATE_PATH = ".agent-spectrum-kernel/claude-install-state.json";
const DEFAULT_PROFILE = "full";
const HOOK_MARKER = "agent-spectrum-kernel:claude-adapter-hook";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
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
const RUNTIME_SCRIPTS = [
  "ai-metrics-record.mjs",
  "ai-metrics-summarize.mjs",
  "ai-ledger-refresh.mjs",
];
const COMMAND_METADATA = {
  "skill-review.md": {
    requiredSkills: ["review-router", "review-final-merge-gate", "evidence-ledger", "risk-gate"],
    requiredAssets: [],
  },
  "skill-implement.md": {
    requiredSkills: ["skill-router", "test-first-verification", "controlled-implementation", "evidence-ledger", "risk-gate"],
    requiredAssets: [],
  },
  "skill-investigate.md": {
    requiredSkills: ["skill-router", "doubt-driven-development", "test-first-verification", "evidence-ledger", "risk-gate"],
    requiredAssets: [],
  },
  "skill-verify.md": {
    requiredSkills: ["test-first-verification", "evidence-ledger"],
    requiredAssets: [],
  },
  "skill-handoff.md": {
    requiredSkills: ["handoff-generation", "evidence-ledger"],
    requiredAssets: ["docs/agent-session-state-contract.md"],
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
    requires: ["test-first-verification", "controlled-implementation"],
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
      id: "domain_rule_impact",
      router: "skill-router",
      selectedRoute: "domain-rule-ledger",
      requiredSkills: ["domain-rule-ledger"],
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
  --profile <name>     Supported profile: implementation, investigation, review, observability, full. Defaults to ${DEFAULT_PROFILE}.
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
    return;
  }
  const content = readFileSync(source, "utf8");
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
      args.managedPartialFiles[relativePath] = lifecycle.createManagedFileRecord({ ...partialRecord, content });
    }
    lifecycle.captureRollbackFile(args.rollback, args.target, relativePath);
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
  settings.hooks = mergeHooks(settings.hooks ?? {}, hooksSettings.hooks ?? {});
  args.managedHooks = normalizeHooks(hooksSettings.hooks ?? {});
  writeFilePlanned(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, args, writes, null, { partialRecord: { kind: "claude_settings" } });
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
    const nextHooks = removeAdapterOwnedHooks(settings.hooks ?? {});
    const nextSettings = { ...settings, hooks: nextHooks };
    if (JSON.stringify(settings.hooks ?? {}) !== JSON.stringify(nextHooks)) {
      writeFilePlanned(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, args, writes, null, { partialRecord: { kind: "claude_settings" } });
    }
  }
  removeLegacyHooksFile(args, writes);
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
  for (const script of RUNTIME_SCRIPTS) {
    copyFilePlanned(resolve(REPO_ROOT, "scripts", script), resolve(args.target, "scripts", script), args, writes, { kind: "claude_runtime", script });
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

function routingFixturesForProfile(profileName, seedSkills, selectedCommands) {
  const selectedRouters = new Set([...seedSkills, ...requiredSkillsForCommands(selectedCommands)]);
  return (PROFILE_ROUTING_FIXTURES[profileName] ?? []).filter((fixture) => selectedRouters.has(fixture.router));
}

function skillsForRoutingFixtures(routingFixtures) {
  const skills = new Set();
  for (const fixture of routingFixtures) {
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
  const profileSkills = profile.skills === null ? manifest.skills : profile.skills;
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
  const requiredAssets = [...new Set(selectedCommands.flatMap((command) => COMMAND_METADATA[command].requiredAssets))].sort();
  const initialProjectStateAssets = [...new Set(selectedCommands.flatMap((command) => COMMAND_METADATA[command].initialProjectStateAssets ?? []))].sort();
  const runtimeDirectories = [...new Set(selectedCommands.flatMap((command) => COMMAND_METADATA[command].runtimeDirectories ?? []))].sort();
  args.selectedSkills = selectedSkills;
  args.selectedCommands = selectedCommands;
  args.requiredAssets = requiredAssets;
  args.initialProjectStateAssets = initialProjectStateAssets;
  args.runtimeDirectories = runtimeDirectories;
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

function manageStaleFiles(args, writes) {
  const currentPaths = new Set(Object.keys(args.managedFiles));
  args.retainedStaleFiles = [];
  for (const [relativePath, record] of Object.entries(args.previousState?.managed_files ?? {}).sort()) {
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

function buildState(args, manifest) {
  const selectedSkills = args.selectedSkills;
  const retainedStaleSkills = args.retainedStaleFiles
    .filter((path) => path.startsWith(".claude/skills/"))
    .map((path) => path.split("/")[2])
    .filter(Boolean)
    .sort();
  const installedSkills = [...new Set([...selectedSkills, ...retainedStaleSkills])].sort();
  return lifecycle.buildLifecycleState({
    manifest,
    repoRoot: REPO_ROOT,
    adapterName: "agent-spectrum-claude-adapter",
    adapterVersion: 3,
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
    extra: {
      installed_commands: [...new Set([...args.selectedCommands, ...args.retainedStaleFiles.filter((path) => path.startsWith(".claude/commands/")).map((path) => path.split("/").at(-1))])].sort(),
      selected_commands: args.selectedCommands,
      retained_stale_files: args.retainedStaleFiles,
      retained_stale_skills: retainedStaleSkills,
      required_assets: args.requiredAssets,
      initial_project_state_assets: args.initialProjectStateAssets,
      runtime_directories: args.runtimeDirectories,
    },
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const writes = [];

  if (args.rollback) {
    const operations = lifecycle.rollbackLifecycleState({ target: args.target, statePath: STATE_PATH, dryRun: args.dryRun || args.check, force: args.force });
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
    const detachOperations = lifecycle.detachLifecycleState({ target: args.target, statePath: STATE_PATH, dryRun: true, force: args.force });
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
  resolveSelection(args);
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
  for (const destination of writes) {
    console.log(`- ${relative(args.target, destination)}`);
  }
  console.log(`- ${STATE_PATH}`);
  console.log("Privacy defaults: local project storage, no external publication, no raw prompt storage.");
}

try {
  main();
} catch (error) {
  console.error(`install-claude-adapter failed: ${error.message}`);
  process.exit(1);
}
