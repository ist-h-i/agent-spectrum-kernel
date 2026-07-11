#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVAL_REQUIRED_SURFACE_IDS, OPERATING_MODES, TASK_CLASSES } from "./ask-shared.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_SKILL_SIGNALS = [
  { label: "frontmatter name", test: ({ frontmatter }) => frontmatter.has("name") },
  { label: "frontmatter description", test: ({ frontmatter }) => frontmatter.has("description") },
  { label: "h1", test: ({ text }) => /^#\s+\S/m.test(text) },
  { label: "purpose", test: ({ text }) => /^##\s+(Goal|Purpose|Role)\b/m.test(text) },
  { label: "process", test: ({ text }) => /^##\s+(Process|Workflow)\b/m.test(text) },
  { label: "output", test: ({ text }) => /^##\s+(Output|Output Modes|Review Output)\b/m.test(text) },
];

const STALE_PHRASES = [
  { phrase: "15 focused workflows", mode: "contains" },
  { phrase: "code-review-quality", mode: "contains" },
  { phrase: "pending specialized review", mode: "contains" },
  { phrase: "review-output-quality when available", mode: "contains" },
  { phrase: "review-adversarial-risk when available", mode: "contains" },
  { phrase: "review-router -> required gates -> review-final-merge-gate", mode: "contains" },
  { phrase: "controlled-implementation -> test-first-verification", mode: "contains" },
  { phrase: "angular-enterprise", mode: "contains" },
];

const SKILL_COUNT_REFERENCE_PATTERNS = [
  /\b(\d+)\s+skills\b/gi,
  /\bcurrent\s+(\d+)-skill(?:\s+system|\s+baseline)?\b/gi,
  /\b(\d+)\s+focused\s+skills\b/gi,
  /\bBaseline:\s*current\s+(\d+)-skill\b/gi,
  /\bSkills in manifest:\s*(\d+)\b/gi,
  /\bSkill directories:\s*(\d+)\b/gi,
];
const MAINTAINED_SCAN_ROOTS = ["AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "README.md", "docs", "examples", "skills"];
const GENERATED_REPORT_PATH = "docs/validation-report.md";
const REQUIRED_SCHEMA_PATHS = [
  "schemas/metrics-event.schema.json",
  "schemas/execution-envelope.schema.json",
  "schemas/adoption-report.schema.json",
  "schemas/improvement-ledger-entry.schema.json",
  "schemas/domain-rule-ledger-entry.schema.json",
  "schemas/architecture-decision-memory-entry.schema.json",
  "schemas/documentation-knowledge-ledger-entry.schema.json",
  "schemas/engineering-capability-ledger-entry.schema.json",
  "schemas/engineering-pattern-ledger-entry.schema.json",
  "schemas/review-rule-ledger-entry.schema.json",
  "schemas/verification-pattern-ledger-entry.schema.json",
];
const EXECUTION_ENVELOPE_DOC_PATH = "docs/execution-envelope-contract.md";
const EXECUTION_ENVELOPE_PLUGIN_PROJECTION = [
  { canonical: EXECUTION_ENVELOPE_DOC_PATH, packaged: "adapters/claude-code/plugin/contracts/execution-envelope-contract.md" },
  { canonical: "schemas/execution-envelope.schema.json", packaged: "adapters/claude-code/plugin/schemas/execution-envelope.schema.json" },
  { canonical: "schemas/metrics-event.schema.json", packaged: "adapters/claude-code/plugin/schemas/metrics-event.schema.json" },
];
const EXECUTION_ENVELOPE_SESSION_STATE_PATH = "docs/agent-session-state-contract.md";
const EXECUTION_ENVELOPE_SKILL_PATHS = [
  "skills/operating-mode-router/SKILL.md",
  "skills/skill-router/SKILL.md",
  "skills/requirement-grill/SKILL.md",
  "skills/spec-driven-development/SKILL.md",
  "skills/work-package-compiler/SKILL.md",
  "skills/controlled-implementation/SKILL.md",
  "skills/test-first-verification/SKILL.md",
  "skills/doubt-driven-development/SKILL.md",
  "skills/review-router/SKILL.md",
  "skills/review-domain-impact/SKILL.md",
  "skills/review-final-merge-gate/SKILL.md",
  "skills/handoff-generation/SKILL.md",
];
const ROUTING_DECISION_SKILL_PATHS = [
  "skills/operating-mode-router/SKILL.md",
  "skills/skill-router/SKILL.md",
];
const EXECUTION_ENVELOPE_ADAPTER_PATHS = [
  "adapters/codex/prompts/skill-implement.md",
  "adapters/codex/prompts/skill-investigate.md",
  "adapters/codex/prompts/skill-review.md",
  "adapters/codex/prompts/skill-verify.md",
  "adapters/codex/prompts/skill-handoff.md",
  "adapters/claude-code/project/.claude/commands/skill-implement.md",
  "adapters/claude-code/project/.claude/commands/skill-investigate.md",
  "adapters/claude-code/project/.claude/commands/skill-review.md",
  "adapters/claude-code/project/.claude/commands/skill-verify.md",
  "adapters/claude-code/project/.claude/commands/skill-handoff.md",
  "adapters/claude-code/github-actions/claude-review-on-mention.yml",
  "adapters/claude-code/plugin/skills/review-pr/SKILL.md",
];
const DUPLICATED_EXECUTION_ENVELOPE_FIELDS = ["Selected work mode:", "User-facing route:", "Internal route:", "Route confidence:", "Evidence checked:"];
const REQUIRED_CLAUDE_ADAPTER_PATHS = [
  "adapters/claude-code/README.md",
  "adapters/claude-code/project/.claude/skills/README.md",
  "adapters/claude-code/project/.claude/commands/skill-review.md",
  "adapters/claude-code/project/.claude/commands/skill-implement.md",
  "adapters/claude-code/project/.claude/commands/skill-investigate.md",
  "adapters/claude-code/project/.claude/commands/skill-verify.md",
  "adapters/claude-code/project/.claude/commands/skill-handoff.md",
  "adapters/claude-code/project/.claude/commands/skill-report.md",
  "adapters/claude-code/project/.claude/commands/skill-ledger-refresh.md",
  "adapters/claude-code/project/.claude/hooks/hooks.json",
  "adapters/claude-code/github-actions/claude-review-on-mention.yml",
  "adapters/claude-code/github-actions/README.md",
  "adapters/claude-code/plugin/.claude-plugin/plugin.json",
  "adapters/claude-code/plugin/README.md",
  "adapters/claude-code/plugin/contracts/execution-envelope-contract.md",
  "adapters/claude-code/plugin/schemas/execution-envelope.schema.json",
  "adapters/claude-code/plugin/schemas/metrics-event.schema.json",
  "adapters/claude-code/plugin/skills/review-pr/SKILL.md",
  "adapters/claude-code/plugin/skills/adoption-report/SKILL.md",
  "adapters/claude-code/plugin/skills/ledger-refresh/SKILL.md",
  "adapters/claude-code/plugin/skills/implementation-context-check/SKILL.md",
  "adapters/claude-code/plugin/hooks/hooks.json",
  "adapters/claude-code/plugin/bin/ai-skills-metrics-record",
];
const REQUIRED_CODEX_ADAPTER_PATHS = [
  "adapters/codex/README.md",
  "adapters/codex/commands/codex-exec.md",
  "adapters/codex/project/.agents/skills/README.md",
  "adapters/codex/prompts/skill-implement.md",
  "adapters/codex/prompts/skill-investigate.md",
  "adapters/codex/prompts/skill-review.md",
  "adapters/codex/prompts/skill-verify.md",
  "adapters/codex/prompts/skill-handoff.md",
];
const REQUIRED_ADAPTER_RUNTIME_PATHS = [
  "scripts/adapter-runtime-smoke.mjs",
  "scripts/codex-exec-runner.mjs",
  "scripts/execution-envelope.mjs",
];
const REQUIRED_OBSERVABILITY_DOCS = [
  "docs/adapter-deployment-governance.md",
  "docs/observability-runtime-contract.md",
  "docs/operation-automation-contract.md",
  "docs/debt-lifecycle-contract.md",
  "docs/metrics-event-contract.md",
  "docs/ai/skill-adoption-metrics.md",
  "docs/ai/adoption-report-template.md",
  "docs/ai/observability-config.yml",
];
const OBSERVABILITY_CONFIG_PATH = "docs/ai/observability-config.yml";
const ADAPTER_DEPLOYMENT_GOVERNANCE_PATH = "docs/adapter-deployment-governance.md";
const PATTERN_B_WORKFLOW_PATH = "adapters/claude-code/github-actions/claude-review-on-mention.yml";
const CORE_KERNEL_INSTALLER_PATH = "scripts/install-kernel.mjs";
const CODEX_ADAPTER_INSTALLER_PATH = "scripts/install-codex-adapter.mjs";
const CLAUDE_ADAPTER_INSTALLER_PATH = "scripts/install-claude-adapter.mjs";
const REQUIRED_DEFAULT_REVIEW_SKILLS = [
  "operating-mode-router",
  "skill-router",
  "next-best-change-finder",
  "requirement-grill",
  "work-package-compiler",
  "domain-rule-ledger",
  "engineering-pattern-ledger",
  "verification-pattern-ledger",
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
  "review-to-rule-compiler",
  "review-finding-compiler",
  "review-architecture-impact",
  "architecture-decision-memory",
  "review-output-quality",
  "review-adversarial-risk",
  "review-final-merge-gate",
  "documentation-knowledge-compiler",
  "evidence-ledger",
  "risk-gate",
  "adr-review",
  "improvement-ledger",
  "skill-adoption-metrics",
  "engineering-capability-evaluation",
];
const REQUIRED_COMMAND_TEMPLATES = [
  "skill-review.md",
  "skill-implement.md",
  "skill-investigate.md",
  "skill-verify.md",
  "skill-handoff.md",
  "skill-report.md",
  "skill-ledger-refresh.md",
];
const FORBIDDEN_OPERATION_AUTOMATION_SKILL = "skills/operation-automation/SKILL.md";
const FORBIDDEN_OPERATION_AUTOMATION_SKILL_UNDERSCORE = "skills/operation_automation/SKILL.md";
const ALLOWED_ROUTE_PHRASE_CONTEXTS = [
  "spec-driven-development -> test-first-verification for Verification Contract -> controlled-implementation -> test-first-verification for evidence",
  "doubt-driven-development -> test-first-verification for reproduction and Verification Contract -> controlled-implementation -> test-first-verification for regression proof",
];
const REQUIRED_SKILL_GROUPS = [
  "mode_routing",
  "delivery_quality",
  "adoption_bootstrap",
  "observability_metrics",
  "operation_automation",
];
const REQUIRED_SKILL_GROUP_SET = new Set(REQUIRED_SKILL_GROUPS);
const CONTEXT_METADATA_FILES = [
  "docs/ai/review-context.md",
  "docs/ai/implementation-context.md",
];
const REQUIRED_CONTEXT_METADATA_FIELDS = ["context_status", "last_updated", "evidence_owner", "source_scope"];
const ALLOWED_CONTEXT_STATUSES = new Set(["template", "initialized", "stale"]);
const IMPROVEMENT_LEDGER_PATH = "docs/ai/improvement-ledger.md";
const REQUIRED_LEDGER_METADATA_FIELDS = ["ledger_status", "last_updated", "evidence_owner", "source_scope"];
const ALLOWED_LEDGER_STATUSES = new Set(["template", "active", "archived"]);
const LEDGER_ENTRY_SECTIONS = new Set([
  "Open Improvement Items",
  "Converted-to-Rule Items",
  "Converted-to-Check Items",
  "Resolved Items",
  "Accepted / Wont-Fix Items",
]);
const REQUIRED_LEDGER_FIELDS = [
  "ID",
  "Source",
  "Finding",
  "Category",
  "Evidence",
  "Impact",
  "Severity",
  "Urgency",
  "Decision",
  "Recommended action",
  "Prevention target",
  "Owner",
  "Status",
  "Created date",
  "Refresh date",
  "Close condition",
];
const LEDGER_TABLE_FIELDS = [
  ...REQUIRED_LEDGER_FIELDS,
  "Repeat pattern",
  "Proposed rule or check",
  "Scope",
];
const ALLOWED_LEDGER_ROW_STATUSES = new Set([
  "open",
  "triaged",
  "accepted",
  "planned",
  "in_progress",
  "resolved",
  "converted_to_rule",
  "converted_to_check",
  "wont_fix",
  "stale",
]);
const ALLOWED_LEDGER_DECISIONS = new Set([
  "fix_now",
  "separate_pr",
  "backlog",
  "convert_to_rule",
  "convert_to_check",
  "accept",
  "wont_fix",
  "needs_more_evidence",
]);
const LEDGER_REFRESH_EXEMPT_STATUSES = new Set(["stale", "resolved", "wont_fix"]);
const EXECUTABLE_CHECK_TARGET_PATTERN = /\b(validation script|lint|test|check|ci)\b/i;
const WEAK_EVIDENCE_PATTERN = /\b(Hypothesis|Unknown)\b/i;
const DOMAIN_RULE_LEDGER_PATH = "docs/ai/domain-rule-ledger.md";
const REQUIRED_DOMAIN_RULE_METADATA_FIELDS = ["ledger_status", "last_updated", "evidence_owner", "source_scope"];
const ALLOWED_DOMAIN_RULE_LEDGER_STATUSES = new Set(["template", "active", "archived"]);
const DOMAIN_RULE_ENTRY_SECTIONS = new Set(["Domain Rule Entries"]);
const REQUIRED_DOMAIN_RULE_FIELDS = [
  "ID",
  "Rule",
  "Business object",
  "Business actor",
  "Workflow",
  "State / condition",
  "Source",
  "Evidence status",
  "Applies to",
  "Used by",
  "Last checked",
  "Staleness trigger",
  "Owner",
];
const ALLOWED_DOMAIN_RULE_EVIDENCE_STATUSES = new Set([
  "Verified",
  "Human-confirmed",
  "Supported",
  "Hypothesis",
  "Deprecated",
  "Contradicted",
]);

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    writeReport: false,
    skipReportCheck: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      args.root = resolve(argv[++i]);
    } else if (arg === "--write-report") {
      args.writeReport = true;
    } else if (arg === "--skip-report-check") {
      args.skipReportCheck = true;
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
  console.log(`Usage: node scripts/validate-repo.mjs [options]

Options:
  --root <path>            Repository root to validate. Defaults to this repository.
  --write-report           Regenerate docs/validation-report.md.
  --skip-report-check      Skip docs/validation-report.md freshness check. Intended for fixtures.
  -h, --help               Show this help.
`);
}

function fail(errors, section, message) {
  errors.push({ section, message });
}

function readJson(root, path, errors) {
  const absolutePath = resolve(root, path);
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(errors, "manifest", `${path} is not valid JSON: ${error.message}`);
    return null;
  }
}

function listSkillDirectories(root) {
  const skillsPath = resolve(root, "skills");
  if (!existsSync(skillsPath)) {
    return [];
  }

  return readdirSync(skillsPath)
    .filter((entry) => {
      const entryPath = resolve(skillsPath, entry);
      return statSync(entryPath).isDirectory();
    })
    .sort();
}

function parseFrontmatter(text) {
  const frontmatter = new Map();
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    return frontmatter;
  }

  for (const line of match[1].split("\n")) {
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValue) {
      frontmatter.set(keyValue[1], keyValue[2].replace(/^["']|["']$/g, ""));
    }
  }

  return frontmatter;
}

function countWords(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function validateManifest(root, manifest, skillDirectories, errors) {
  if (!manifest) {
    return;
  }

  for (const key of ["skills", "docs", "examples"]) {
    if (!Array.isArray(manifest[key])) {
      fail(errors, "manifest", `manifest.json.${key} must be an array`);
      continue;
    }

    const duplicates = manifest[key].filter((value, index) => manifest[key].indexOf(value) !== index);
    if (duplicates.length > 0) {
      fail(errors, "manifest", `manifest.json.${key} contains duplicate entries: ${[...new Set(duplicates)].join(", ")}`);
    }
  }

  if (!Array.isArray(manifest.skills)) {
    return;
  }

  const manifestSkills = [...manifest.skills].sort();
  const missingDirectories = manifestSkills.filter((skill) => !skillDirectories.includes(skill));
  const extraDirectories = skillDirectories.filter((skill) => !manifestSkills.includes(skill));

  for (const skill of missingDirectories) {
    fail(errors, "manifest", `manifest.json lists '${skill}', but skills/${skill}/SKILL.md is missing`);
  }
  for (const skill of extraDirectories) {
    fail(errors, "manifest", `skills/${skill}/SKILL.md exists, but '${skill}' is missing from manifest.json.skills`);
  }
}

function validateSkillGroups(manifest, errors) {
  const checks = [];
  if (!manifest) {
    return checks;
  }

  const manifestSkills = Array.isArray(manifest.skills) ? manifest.skills : [];
  const manifestSkillSet = new Set(manifestSkills);
  const skillGroups = manifest.skill_groups;
  const allowedMultiGroupSkills = Array.isArray(manifest.allowed_multi_group_skills)
    ? manifest.allowed_multi_group_skills
    : [];
  const allowedMultiGroupSet = new Set(allowedMultiGroupSkills);

  if (!skillGroups || Array.isArray(skillGroups) || typeof skillGroups !== "object") {
    fail(errors, "skill groups", "manifest.json.skill_groups must exist and be an object");
    return checks;
  }

  if (
    manifest.allowed_multi_group_skills !== undefined
    && !Array.isArray(manifest.allowed_multi_group_skills)
  ) {
    fail(errors, "skill groups", "manifest.json.allowed_multi_group_skills must be an array when present");
  }

  const allowedDuplicates = allowedMultiGroupSkills.filter((skill, index) => allowedMultiGroupSkills.indexOf(skill) !== index);
  if (allowedDuplicates.length > 0) {
    fail(errors, "skill groups", `manifest.json.allowed_multi_group_skills contains duplicate entries: ${[...new Set(allowedDuplicates)].join(", ")}`);
  }
  for (const skill of allowedMultiGroupSkills) {
    if (!manifestSkillSet.has(skill)) {
      fail(errors, "skill groups", `manifest.json.allowed_multi_group_skills lists '${skill}', but manifest.json.skills does not list it`);
    }
  }

  const groupNames = Object.keys(skillGroups).sort();
  for (const group of groupNames) {
    if (!REQUIRED_SKILL_GROUP_SET.has(group)) {
      fail(errors, "skill groups", `manifest.json.skill_groups contains invalid group '${group}'`);
    }
  }
  for (const group of REQUIRED_SKILL_GROUPS) {
    if (!Object.hasOwn(skillGroups, group)) {
      fail(errors, "skill groups", `manifest.json.skill_groups is missing required group '${group}'`);
    }
  }

  const memberships = new Map();
  for (const group of REQUIRED_SKILL_GROUPS) {
    const skills = skillGroups[group];
    if (!Array.isArray(skills)) {
      fail(errors, "skill groups", `manifest.json.skill_groups.${group} must be an array`);
      checks.push({ group, count: 0, skills: [] });
      continue;
    }

    const duplicates = skills.filter((skill, index) => skills.indexOf(skill) !== index);
    if (duplicates.length > 0) {
      fail(errors, "skill groups", `manifest.json.skill_groups.${group} contains duplicate entries: ${[...new Set(duplicates)].join(", ")}`);
    }

    for (const skill of skills) {
      if (typeof skill !== "string") {
        fail(errors, "skill groups", `manifest.json.skill_groups.${group} contains a non-string skill entry`);
        continue;
      }
      if (!manifestSkillSet.has(skill)) {
        fail(errors, "skill groups", `manifest.json.skill_groups.${group} contains '${skill}', but manifest.json.skills does not list it`);
      }
      if (!memberships.has(skill)) {
        memberships.set(skill, new Set());
      }
      memberships.get(skill).add(group);
    }

    checks.push({ group, count: skills.length, skills: [...skills] });
  }

  for (const skill of manifestSkills) {
    const groups = memberships.get(skill) ?? new Set();
    if (groups.size === 0) {
      fail(errors, "skill groups", `manifest.json.skills entry '${skill}' is not assigned to a skill group`);
    } else if (groups.size > 1 && !allowedMultiGroupSet.has(skill)) {
      fail(errors, "skill groups", `manifest.json.skills entry '${skill}' appears in multiple skill_groups (${[...groups].join(", ")}) but is not listed in allowed_multi_group_skills`);
    }
  }

  return checks;
}

function validateRoutingManifest(root, manifest, errors) {
  const checks = {
    present: false,
    taskClasses: [],
    operatingModes: [],
    defaultRoutes: [],
    routeOverridePreserved: false,
    riskGateHardStopLimited: false,
    unsupportedCapabilityDowngrade: false,
  };
  if (!manifest) {
    return checks;
  }

  const routing = manifest.routing;
  if (!routing || Array.isArray(routing) || typeof routing !== "object") {
    fail(errors, "routing manifest", "manifest.json.routing must exist and be an object");
    return checks;
  }
  checks.present = true;

  if (routing.schema_version !== 1) {
    fail(errors, "routing manifest", "manifest.json.routing.schema_version must be 1");
  }
  if (routing.enforcement_model !== "default_selection_and_validation") {
    fail(errors, "routing manifest", "manifest.json.routing.enforcement_model must be default_selection_and_validation");
  }

  validateRoutingTaskClasses(root, manifest, routing, checks, errors);
  validateRoutingOperatingModes(root, manifest, routing, checks, errors);
  validateRoutingDefaultRoutes(root, manifest, routing, checks, errors);
  validateRoutingRiskGate(root, manifest, routing, checks, errors);
  validateRoutingOverride(routing, checks, errors);
  validateRoutingAdapterDowngrade(root, routing, checks, errors);

  return checks;
}

function validateRoutingTaskClasses(root, manifest, routing, checks, errors) {
  const taskClasses = routing.task_classes;
  if (!taskClasses || Array.isArray(taskClasses) || typeof taskClasses !== "object") {
    fail(errors, "routing manifest", "manifest.json.routing.task_classes must be an object");
    return;
  }

  const keys = Object.keys(taskClasses).sort();
  for (const taskClass of keys) {
    if (!TASK_CLASSES.includes(taskClass)) {
      fail(errors, "routing manifest", `manifest.json.routing.task_classes contains unknown task class '${taskClass}'`);
      continue;
    }
    const entry = taskClasses[taskClass];
    checks.taskClasses.push(taskClass);
    validateRouteReference(root, manifest, entry?.default_route, `manifest.json.routing.task_classes.${taskClass}.default_route`, errors);
    if (taskClass === "risk-gated") {
      if (entry?.required_gate !== "risk-gate") {
        fail(errors, "routing manifest", "manifest.json.routing.task_classes.risk-gated.required_gate must be risk-gate");
      }
      if (entry?.override_allowed !== false) {
        fail(errors, "routing manifest", "manifest.json.routing.task_classes.risk-gated.override_allowed must be false");
      }
    }
  }
  for (const taskClass of TASK_CLASSES) {
    if (!Object.hasOwn(taskClasses, taskClass)) {
      fail(errors, "routing manifest", `manifest.json.routing.task_classes is missing '${taskClass}'`);
    }
  }
}

function validateRoutingOperatingModes(root, manifest, routing, checks, errors) {
  const modes = routing.operating_modes;
  if (!modes || Array.isArray(modes) || typeof modes !== "object") {
    fail(errors, "routing manifest", "manifest.json.routing.operating_modes must be an object");
    return;
  }

  for (const mode of Object.keys(modes).sort()) {
    if (!OPERATING_MODES.includes(mode)) {
      fail(errors, "routing manifest", `manifest.json.routing.operating_modes contains unknown mode '${mode}'`);
      continue;
    }
    const entry = modes[mode];
    checks.operatingModes.push(mode);
    if (!Object.hasOwn(manifest.skill_groups ?? {}, entry?.skill_group ?? "")) {
      fail(errors, "routing manifest", `manifest.json.routing.operating_modes.${mode}.skill_group references unknown skill group '${entry?.skill_group ?? "missing"}'`);
    }
    validateRouteReference(root, manifest, entry?.default_route, `manifest.json.routing.operating_modes.${mode}.default_route`, errors);
    if (entry?.secondary_routes !== undefined) {
      if (!Array.isArray(entry.secondary_routes)) {
        fail(errors, "routing manifest", `manifest.json.routing.operating_modes.${mode}.secondary_routes must be an array when present`);
      } else {
        validateRouteReference(root, manifest, entry.secondary_routes, `manifest.json.routing.operating_modes.${mode}.secondary_routes`, errors);
      }
    }
  }
  for (const mode of OPERATING_MODES) {
    if (!Object.hasOwn(modes, mode)) {
      fail(errors, "routing manifest", `manifest.json.routing.operating_modes is missing '${mode}'`);
    }
  }
}

function validateRoutingDefaultRoutes(root, manifest, routing, checks, errors) {
  if (!Array.isArray(routing.default_routes)) {
    fail(errors, "routing manifest", "manifest.json.routing.default_routes must be an array");
    return;
  }

  const ids = new Set();
  for (const [index, route] of routing.default_routes.entries()) {
    const label = `manifest.json.routing.default_routes[${index}]`;
    if (!route || Array.isArray(route) || typeof route !== "object") {
      fail(errors, "routing manifest", `${label} must be an object`);
      continue;
    }
    if (typeof route.id !== "string" || route.id.length === 0) {
      fail(errors, "routing manifest", `${label}.id must be a non-empty string`);
    } else if (ids.has(route.id)) {
      fail(errors, "routing manifest", `${label}.id duplicates '${route.id}'`);
    } else {
      ids.add(route.id);
    }
    if (route.task_class && !TASK_CLASSES.includes(route.task_class)) {
      fail(errors, "routing manifest", `${label}.task_class references unknown task class '${route.task_class}'`);
    }
    validateRouteReference(root, manifest, route.primary, `${label}.primary`, errors);
    validateRouteReference(root, manifest, route.secondary ?? [], `${label}.secondary`, errors);
    checks.defaultRoutes.push(route.id ?? `index:${index}`);
  }
}

function validateRoutingRiskGate(root, manifest, routing, checks, errors) {
  const riskGate = routing.risk_gate;
  if (!riskGate || Array.isArray(riskGate) || typeof riskGate !== "object") {
    fail(errors, "routing manifest", "manifest.json.routing.risk_gate must be an object");
    return;
  }
  validateRouteReference(root, manifest, riskGate.required_route, "manifest.json.routing.risk_gate.required_route", errors);
  if (!Array.isArray(riskGate.hard_stop_surfaces)) {
    fail(errors, "routing manifest", "manifest.json.routing.risk_gate.hard_stop_surfaces must be an array");
    return;
  }
  const invalid = riskGate.hard_stop_surfaces.filter((surface) => !APPROVAL_REQUIRED_SURFACE_IDS.has(surface));
  if (invalid.length > 0) {
    fail(errors, "routing manifest", `manifest.json.routing.risk_gate.hard_stop_surfaces contains non-AGENTS approval-required surfaces: ${invalid.join(", ")}`);
  } else {
    checks.riskGateHardStopLimited = true;
  }
  if (riskGate.read_only_investigation_allowed !== true || riskGate.local_verification_allowed !== true) {
    fail(errors, "routing manifest", "manifest.json.routing.risk_gate must allow read-only investigation and local verification");
  }
}

function validateRoutingOverride(routing, checks, errors) {
  const override = routing.route_override;
  if (!override || Array.isArray(override) || typeof override !== "object") {
    fail(errors, "routing manifest", "manifest.json.routing.route_override must be an object");
    return;
  }
  checks.routeOverridePreserved = override.allowed === true && override.requires_reason === true;
  if (!checks.routeOverridePreserved) {
    fail(errors, "routing manifest", "manifest.json.routing.route_override must keep overrides allowed and require a reason");
  }
  if (!Array.isArray(override.not_allowed_for_required_gates) || !override.not_allowed_for_required_gates.includes("risk-gate")) {
    fail(errors, "routing manifest", "manifest.json.routing.route_override.not_allowed_for_required_gates must include risk-gate");
  }
}

function validateRoutingAdapterDowngrade(root, routing, checks, errors) {
  const downgrade = routing.unsupported_adapter_capability;
  if (!downgrade || Array.isArray(downgrade) || typeof downgrade !== "object") {
    fail(errors, "routing manifest", "manifest.json.routing.unsupported_adapter_capability must be an object");
    return;
  }
  if (downgrade.source !== "docs/adapter-capability-matrix.md" || !existsSync(resolve(root, downgrade.source))) {
    fail(errors, "routing manifest", "manifest.json.routing.unsupported_adapter_capability.source must reference docs/adapter-capability-matrix.md");
  }
  checks.unsupportedCapabilityDowngrade =
    downgrade.unknown_status === "downgrade_to_unknown" &&
    downgrade.unsupported_status === "downgrade_to_unsupported" &&
    downgrade.projected_status === "claim_projection_only" &&
    downgrade.runtime_detected_status === "claim_runtime_detection_only" &&
    downgrade.executed_status === "claim_execution_only" &&
    downgrade.behavior_verified_status === "claim_behavior_verified";
  if (!checks.unsupportedCapabilityDowngrade) {
    fail(errors, "routing manifest", "manifest.json.routing.unsupported_adapter_capability must preserve adapter capability downgrades");
  }
}

function validateRouteReference(root, manifest, reference, label, errors) {
  if (Array.isArray(reference)) {
    for (const [index, item] of reference.entries()) {
      validateRouteReference(root, manifest, item, `${label}[${index}]`, errors);
    }
    return;
  }
  if (reference && typeof reference === "object") {
    for (const key of ["skill", "gate", "route", "path"]) {
      if (Object.hasOwn(reference, key)) {
        validateRouteReference(root, manifest, reference[key], `${label}.${key}`, errors);
      }
    }
    if (Array.isArray(reference.skills)) {
      validateRouteReference(root, manifest, reference.skills, `${label}.skills`, errors);
    }
    return;
  }
  if (typeof reference !== "string" || reference.length === 0) {
    fail(errors, "routing manifest", `${label} must be a non-empty route reference`);
    return;
  }
  if (["kernel", "external_operation", "manual_routine"].includes(reference)) {
    return;
  }
  const pathMatch = reference.match(/^skills\/([^/]+)\/SKILL\.md$/);
  const skill = pathMatch ? pathMatch[1] : reference;
  if (!Array.isArray(manifest.skills) || !manifest.skills.includes(skill)) {
    fail(errors, "routing manifest", `${label} references unknown skill '${reference}'`);
    return;
  }
  if (!existsSync(resolve(root, "skills", skill, "SKILL.md"))) {
    fail(errors, "routing manifest", `${label} references missing skill path: skills/${skill}/SKILL.md`);
  }
}

function validateManifestPaths(root, manifest, errors) {
  if (!manifest) {
    return;
  }

  for (const key of ["kernel", "copy_paste_kernel"]) {
    if (typeof manifest[key] !== "string") {
      fail(errors, "paths", `manifest.json.${key} must be a path string`);
      continue;
    }
    if (!existsSync(resolve(root, manifest[key]))) {
      fail(errors, "paths", `manifest.json.${key} path does not exist: ${manifest[key]}`);
    }
  }

  for (const key of ["docs", "examples", "schemas", "adapters"]) {
    if (!Array.isArray(manifest[key])) {
      continue;
    }
    for (const path of manifest[key]) {
      if (!existsSync(resolve(root, path))) {
        fail(errors, "paths", `manifest.json.${key} path does not exist: ${path}`);
      }
    }
  }
}

function validateExecutionEnvelope(root, manifest, errors) {
  const active = manifest?.name === "agent-spectrum-kernel";
  const checks = {
    active,
    contractPresent: existsSync(resolve(root, EXECUTION_ENVELOPE_DOC_PATH)),
    schemaListed: Array.isArray(manifest?.schemas) && manifest.schemas.includes("schemas/execution-envelope.schema.json"),
    docListed: Array.isArray(manifest?.docs) && manifest.docs.includes(EXECUTION_ENVELOPE_DOC_PATH),
    pluginProjection: [],
    sessionState: false,
    skills: [],
    adapters: [],
  };

  if (!active) {
    return checks;
  }

  if (!checks.contractPresent) {
    fail(errors, "execution envelope", `canonical contract is missing: ${EXECUTION_ENVELOPE_DOC_PATH}`);
  } else {
    const contract = readFileSync(resolve(root, EXECUTION_ENVELOPE_DOC_PATH), "utf8");
    for (const phrase of ["route", "evidence status", "stop reason", "next action", "Metrics event candidate"]) {
      if (!contract.toLowerCase().includes(phrase.toLowerCase())) {
        fail(errors, "execution envelope", `${EXECUTION_ENVELOPE_DOC_PATH} is missing canonical field guidance: ${phrase}`);
      }
    }
  }
  if (!checks.docListed) {
    fail(errors, "execution envelope", `manifest.json.docs must list ${EXECUTION_ENVELOPE_DOC_PATH}`);
  }
  if (!checks.schemaListed) {
    fail(errors, "execution envelope", "manifest.json.schemas must list schemas/execution-envelope.schema.json");
  }
  checks.pluginProjection = EXECUTION_ENVELOPE_PLUGIN_PROJECTION.map(({ canonical, packaged }) => {
    const canonicalPath = resolve(root, canonical);
    const packagedPath = resolve(root, packaged);
    const canonicalPresent = existsSync(canonicalPath);
    const packagedPresent = existsSync(packagedPath);
    const matches = canonicalPresent && packagedPresent && readFileSync(canonicalPath, "utf8") === readFileSync(packagedPath, "utf8");
    const check = { canonical, packaged, canonicalPresent, packagedPresent, matches, ok: matches };
    if (!canonicalPresent || !packagedPresent || !matches) {
      fail(errors, "execution envelope", `Claude plugin projection must match ${canonical}: ${packaged}`);
    }
    return check;
  });
  const sessionStatePath = resolve(root, EXECUTION_ENVELOPE_SESSION_STATE_PATH);
  if (!existsSync(sessionStatePath)) {
    fail(errors, "execution envelope", `session-state contract is missing: ${EXECUTION_ENVELOPE_SESSION_STATE_PATH}`);
  } else {
    const sessionState = readFileSync(sessionStatePath, "utf8");
    const legacyControlFields = ["selected_mode", "selected_skill", "last_verified_evidence", "not_verified", "blocked_reason", "required_human_approval", "resume_instruction", "stop_conditions"];
    const staleFields = legacyControlFields.filter((field) => new RegExp(`\\"${field}\\"\\s*:`).test(sessionState));
    checks.sessionState = sessionState.includes("execution_envelope") && staleFields.length === 0;
    if (!sessionState.includes("execution_envelope")) fail(errors, "execution envelope", `${EXECUTION_ENVELOPE_SESSION_STATE_PATH} must include execution_envelope`);
    if (staleFields.length > 0) fail(errors, "execution envelope", `${EXECUTION_ENVELOPE_SESSION_STATE_PATH} retains duplicate control fields: ${staleFields.join(", ")}`);
  }
  const schemaPath = resolve(root, "schemas/execution-envelope.schema.json");
  if (existsSync(schemaPath)) {
    try {
      const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
      const internalProperties = schema.properties?.route?.properties?.internal?.properties ?? {};
      if (Object.hasOwn(internalProperties, "stop_if")) {
        fail(errors, "execution envelope", "schemas/execution-envelope.schema.json must keep stop_if under stop_reason only");
      }
      if (schema.properties?.metrics_event_candidate?.$ref !== "metrics-event.schema.json") {
        fail(errors, "execution envelope", "schemas/execution-envelope.schema.json.metrics_event_candidate must $ref metrics-event.schema.json");
      }
    } catch {
      // The required-schema validation reports malformed JSON separately.
    }
  }

  for (const path of EXECUTION_ENVELOPE_SKILL_PATHS) {
    const absolutePath = resolve(root, path);
    const exists = existsSync(absolutePath);
    const text = exists ? readFileSync(absolutePath, "utf8") : "";
    const referencesContract = text.includes(EXECUTION_ENVELOPE_DOC_PATH);
    const duplicatedFields = DUPLICATED_EXECUTION_ENVELOPE_FIELDS.filter((field) => text.includes(field));
    const requiresRoutingDecision = ROUTING_DECISION_SKILL_PATHS.includes(path);
    const routingDecisionFields = ["Decisive signals:", "Reason for primary route:", "Reason for each secondary route:", "Intentionally skipped:", "Risk overlay:", "Uncertainty:"];
    const missingRoutingDecisionFields = requiresRoutingDecision ? routingDecisionFields.filter((field) => !text.includes(field)) : [];
    const ok = exists && referencesContract && duplicatedFields.length === 0 && missingRoutingDecisionFields.length === 0;
    checks.skills.push({ path, exists, referencesContract, duplicatedFields, missingRoutingDecisionFields, ok });
    if (!exists) {
      fail(errors, "execution envelope", `canonical skill is missing: ${path}`);
    } else if (!referencesContract) {
      fail(errors, "execution envelope", `${path} must reference ${EXECUTION_ENVELOPE_DOC_PATH}`);
    }
    if (duplicatedFields.length > 0) {
      fail(errors, "execution envelope", `${path} duplicates envelope fields: ${duplicatedFields.join(", ")}`);
    }
    if (missingRoutingDecisionFields.length > 0) {
      fail(errors, "execution envelope", `${path} is missing Routing Decision fields: ${missingRoutingDecisionFields.join(", ")}`);
    }
  }

  for (const path of EXECUTION_ENVELOPE_ADAPTER_PATHS) {
    const absolutePath = resolve(root, path);
    const exists = existsSync(absolutePath);
    const text = exists ? readFileSync(absolutePath, "utf8") : "";
    const expectedContractReference = path.startsWith("adapters/claude-code/plugin/")
      ? "${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md"
      : EXECUTION_ENVELOPE_DOC_PATH;
    const referencesContract = text.includes(expectedContractReference);
    const hasEnvelope = text.includes("Execution Envelope:") || text.includes("Execution Envelope");
    const hasStructuredEnvelope = text.includes("fenced JSON") || /Execution Envelope:\s*```json/.test(text);
    const ok = exists && referencesContract && hasEnvelope && hasStructuredEnvelope;
    checks.adapters.push({ path, expectedContractReference, exists, referencesContract, hasEnvelope, hasStructuredEnvelope, ok });
    if (!exists) {
      fail(errors, "execution envelope", `adapter prompt is missing: ${path}`);
    } else if (!referencesContract || !hasEnvelope || !hasStructuredEnvelope) {
      fail(errors, "execution envelope", `${path} must reference and require one fenced JSON shared Execution Envelope`);
    }
  }

  return checks;
}

function validateSkills(root, skillDirectories, errors) {
  const checks = [];

  for (const skill of skillDirectories) {
    const skillPath = `skills/${skill}/SKILL.md`;
    const absolutePath = resolve(root, skillPath);
    if (!existsSync(absolutePath)) {
      fail(errors, "skills", `Skill directory is missing SKILL.md: skills/${skill}`);
      continue;
    }

    const text = readFileSync(absolutePath, "utf8");
    const frontmatter = parseFrontmatter(text);
    const missing = REQUIRED_SKILL_SIGNALS
      .filter((signal) => !signal.test({ text, frontmatter }))
      .map((signal) => signal.label);

    const declaredName = frontmatter.get("name");
    const nameOk = declaredName === skill;
    if (!nameOk) {
      fail(errors, "skills", `${skillPath} frontmatter name '${declaredName ?? "missing"}' does not match directory '${skill}'`);
    }
    if (missing.length > 0) {
      fail(errors, "skills", `${skillPath} is missing required section signals: ${missing.join(", ")}`);
    }

    checks.push({
      path: skillPath,
      words: countWords(text),
      nameOk,
      missing,
    });
  }

  return checks;
}

function validateContextMetadata(root, errors) {
  const checks = [];

  for (const path of CONTEXT_METADATA_FILES) {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const frontmatter = parseFrontmatter(readFileSync(absolutePath, "utf8"));
    const missing = REQUIRED_CONTEXT_METADATA_FIELDS.filter((field) => !frontmatter.has(field));
    const status = frontmatter.get("context_status") ?? "missing";
    const statusOk = ALLOWED_CONTEXT_STATUSES.has(status);

    if (missing.length > 0) {
      fail(errors, "context metadata", `${path} is missing context metadata fields: ${missing.join(", ")}`);
    }
    if (!statusOk) {
      fail(errors, "context metadata", `${path} has invalid context_status '${status}'`);
    }

    checks.push({
      path,
      status,
      metadataOk: missing.length === 0 && statusOk,
    });
  }

  return checks;
}

function validateImprovementLedger(root, errors) {
  const checks = [];
  const absolutePath = resolve(root, IMPROVEMENT_LEDGER_PATH);
  if (!existsSync(absolutePath)) {
    return checks;
  }

  const errorCountBefore = errors.length;
  const text = readFileSync(absolutePath, "utf8");
  const frontmatter = parseFrontmatter(text);
  const missing = REQUIRED_LEDGER_METADATA_FIELDS.filter((field) => !frontmatter.has(field));
  const status = frontmatter.get("ledger_status") ?? "missing";
  const statusOk = ALLOWED_LEDGER_STATUSES.has(status);
  const rows = parseImprovementLedgerRows(text);

  if (missing.length > 0) {
    fail(errors, "improvement ledger", `${IMPROVEMENT_LEDGER_PATH} is missing ledger metadata fields: ${missing.join(", ")}`);
  }
  if (!statusOk) {
    fail(errors, "improvement ledger", `${IMPROVEMENT_LEDGER_PATH} has invalid ledger_status '${status}'`);
  }

  if (status === "template") {
    if (rows.length > 0) {
      fail(errors, "improvement ledger", `${IMPROVEMENT_LEDGER_PATH} has ledger_status 'template' but contains project ledger rows`);
    }
  } else if (status === "active" || status === "archived") {
    validateImprovementLedgerRows(rows, status, errors);
  }

  checks.push({
    path: IMPROVEMENT_LEDGER_PATH,
    status,
    rowCount: rows.length,
    metadataOk: missing.length === 0 && statusOk,
    validationOk: errors.length === errorCountBefore,
  });

  return checks;
}

function validateDomainRuleLedger(root, errors) {
  const checks = [];
  const absolutePath = resolve(root, DOMAIN_RULE_LEDGER_PATH);
  if (!existsSync(absolutePath)) {
    return checks;
  }

  const errorCountBefore = errors.length;
  const text = readFileSync(absolutePath, "utf8");
  const frontmatter = parseFrontmatter(text);
  const missing = REQUIRED_DOMAIN_RULE_METADATA_FIELDS.filter((field) => !frontmatter.has(field));
  const status = frontmatter.get("ledger_status") ?? "missing";
  const statusOk = ALLOWED_DOMAIN_RULE_LEDGER_STATUSES.has(status);
  const rows = parseDomainRuleLedgerRows(text, errors);

  if (missing.length > 0) {
    fail(errors, "domain rule ledger", `${DOMAIN_RULE_LEDGER_PATH} is missing ledger metadata fields: ${missing.join(", ")}`);
  }
  if (!statusOk) {
    fail(errors, "domain rule ledger", `${DOMAIN_RULE_LEDGER_PATH} has invalid ledger_status '${status}'`);
  }

  if (status === "template") {
    if (rows.length > 0) {
      fail(errors, "domain rule ledger", `${DOMAIN_RULE_LEDGER_PATH} has ledger_status 'template' but contains project domain rule rows`);
    }
  } else if (status === "active" || status === "archived") {
    validateDomainRuleLedgerRows(rows, status, errors);
  }

  checks.push({
    path: DOMAIN_RULE_LEDGER_PATH,
    status,
    rowCount: rows.length,
    metadataOk: missing.length === 0 && statusOk,
    validationOk: errors.length === errorCountBefore,
  });

  return checks;
}

function parseDomainRuleLedgerRows(text, errors) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  let currentSection = null;
  let inHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmedLine = lines[index].trim();
    if (trimmedLine.startsWith("<!--")) {
      inHtmlComment = !trimmedLine.includes("-->");
      continue;
    }
    if (inHtmlComment) {
      if (trimmedLine.includes("-->")) {
        inHtmlComment = false;
      }
      continue;
    }

    const heading = lines[index].match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1];
      continue;
    }

    if (!DOMAIN_RULE_ENTRY_SECTIONS.has(currentSection) || !lines[index].trim().startsWith("|")) {
      continue;
    }

    const headers = splitMarkdownTableRow(lines[index]);
    if (!isDomainRuleEntryHeader(headers)) {
      if (!isMarkdownSeparatorRow(headers)) {
        const missingFields = missingDomainRuleHeaderFields(headers);
        fail(
          errors,
          "domain rule ledger",
          `${DOMAIN_RULE_LEDGER_PATH}:${index + 1} has malformed domain rule table header; missing required fields: ${missingFields.join(", ")}`,
        );
        let rowIndex = index + 1;
        while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
          rowIndex += 1;
        }
        index = rowIndex - 1;
      }
      continue;
    }

    let rowIndex = index + 1;
    if (rowIndex < lines.length && isMarkdownSeparatorRow(splitMarkdownTableRow(lines[rowIndex]))) {
      rowIndex += 1;
    }

    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const cells = splitMarkdownTableRow(lines[rowIndex]);
      if (!isMarkdownSeparatorRow(cells)) {
        const values = new Map();
        headers.forEach((header, headerIndex) => {
          values.set(normalizeLedgerField(header), cells[headerIndex]?.trim() ?? "");
        });
        if ([...values.values()].some(Boolean)) {
          rows.push({
            line: rowIndex + 1,
            section: currentSection,
            values,
          });
        }
      }
      rowIndex += 1;
    }

    index = rowIndex - 1;
  }

  return rows;
}

function isDomainRuleEntryHeader(headers) {
  const normalizedHeaders = new Set(headers.map(normalizeLedgerField));
  return REQUIRED_DOMAIN_RULE_FIELDS.every((field) => normalizedHeaders.has(normalizeLedgerField(field)));
}

function missingDomainRuleHeaderFields(headers) {
  const normalizedHeaders = new Set(headers.map(normalizeLedgerField));
  return REQUIRED_DOMAIN_RULE_FIELDS.filter((field) => !normalizedHeaders.has(normalizeLedgerField(field)));
}

function domainRuleValue(row, field) {
  return row.values.get(normalizeLedgerField(field)) ?? "";
}

function validateDomainRuleLedgerRows(rows, ledgerStatus, errors) {
  const ids = new Map();

  for (const row of rows) {
    const rowLabel = `${DOMAIN_RULE_LEDGER_PATH}:${row.line}`;
    const missingRequiredFields = REQUIRED_DOMAIN_RULE_FIELDS.filter((field) => domainRuleValue(row, field) === "");
    if (missingRequiredFields.length > 0) {
      fail(errors, "domain rule ledger", `${rowLabel} is missing required fields: ${missingRequiredFields.join(", ")}`);
    }

    const id = domainRuleValue(row, "ID");
    if (id && !/^DR-\d{4}$/.test(id)) {
      fail(errors, "domain rule ledger", `${rowLabel} has invalid ID '${id}'; expected DR-0001 style`);
    }
    if (id) {
      if (ids.has(id)) {
        fail(errors, "domain rule ledger", `${rowLabel} duplicates domain rule ID '${id}' first used at ${DOMAIN_RULE_LEDGER_PATH}:${ids.get(id)}`);
      } else {
        ids.set(id, row.line);
      }
    }

    const evidenceStatus = domainRuleValue(row, "Evidence status");
    if (evidenceStatus && !ALLOWED_DOMAIN_RULE_EVIDENCE_STATUSES.has(evidenceStatus)) {
      fail(errors, "domain rule ledger", `${rowLabel} has invalid Evidence status '${evidenceStatus}'`);
    }

    const lastChecked = domainRuleValue(row, "Last checked");
    if (lastChecked && !isIsoDate(lastChecked)) {
      fail(errors, "domain rule ledger", `${rowLabel} has invalid Last checked '${lastChecked}'; expected YYYY-MM-DD`);
    }

    if (ledgerStatus === "active" && evidenceStatus === "Hypothesis" && /\bconstraint\b/i.test(domainRuleValue(row, "Used by"))) {
      fail(errors, "domain rule ledger", `${rowLabel} uses a Hypothesis rule as a constraint; hypotheses may only generate questions or warnings`);
    }
  }
}

function parseImprovementLedgerRows(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  let currentSection = null;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1];
      continue;
    }

    if (!LEDGER_ENTRY_SECTIONS.has(currentSection) || !lines[index].trim().startsWith("|")) {
      continue;
    }

    const headers = splitMarkdownTableRow(lines[index]);
    if (!isLedgerEntryHeader(headers)) {
      continue;
    }

    let rowIndex = index + 1;
    if (rowIndex < lines.length && isMarkdownSeparatorRow(splitMarkdownTableRow(lines[rowIndex]))) {
      rowIndex += 1;
    }

    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const cells = splitMarkdownTableRow(lines[rowIndex]);
      if (!isMarkdownSeparatorRow(cells)) {
        const values = new Map();
        headers.forEach((header, headerIndex) => {
          values.set(normalizeLedgerField(header), cells[headerIndex]?.trim() ?? "");
        });
        if ([...values.values()].some(Boolean)) {
          rows.push({
            line: rowIndex + 1,
            section: currentSection,
            values,
          });
        }
      }
      rowIndex += 1;
    }

    index = rowIndex - 1;
  }

  return rows;
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) {
    return [];
  }

  const withoutOuterPipes = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutOuterPipes.split("|").map((cell) => cell.trim());
}

function isMarkdownSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isLedgerEntryHeader(headers) {
  const normalizedHeaders = new Set(headers.map(normalizeLedgerField));
  return LEDGER_TABLE_FIELDS.every((field) => normalizedHeaders.has(normalizeLedgerField(field)));
}

function normalizeLedgerField(field) {
  return field.toLowerCase().replace(/\s+/g, " ").trim();
}

function ledgerValue(row, field) {
  return row.values.get(normalizeLedgerField(field)) ?? "";
}

function validateImprovementLedgerRows(rows, ledgerStatus, errors) {
  const ids = new Map();
  const today = currentIsoDate();

  for (const row of rows) {
    const rowLabel = `${IMPROVEMENT_LEDGER_PATH}:${row.line}`;
    const missingRequiredFields = REQUIRED_LEDGER_FIELDS.filter((field) => ledgerValue(row, field) === "");
    if (missingRequiredFields.length > 0) {
      fail(errors, "improvement ledger", `${rowLabel} is missing required fields: ${missingRequiredFields.join(", ")}`);
    }

    const id = ledgerValue(row, "ID");
    if (id && !/^IMP-\d{4}$/.test(id)) {
      fail(errors, "improvement ledger", `${rowLabel} has invalid ID '${id}'; expected IMP-0001 style`);
    }
    if (id) {
      if (ids.has(id)) {
        fail(errors, "improvement ledger", `${rowLabel} duplicates ledger ID '${id}' first used at ${IMPROVEMENT_LEDGER_PATH}:${ids.get(id)}`);
      } else {
        ids.set(id, row.line);
      }
    }

    const status = ledgerValue(row, "Status");
    if (status && !ALLOWED_LEDGER_ROW_STATUSES.has(status)) {
      fail(errors, "improvement ledger", `${rowLabel} has invalid Status '${status}'`);
    }

    const decision = ledgerValue(row, "Decision");
    if (decision && !ALLOWED_LEDGER_DECISIONS.has(decision)) {
      fail(errors, "improvement ledger", `${rowLabel} has invalid Decision '${decision}'`);
    }

    validateLedgerDates(row, rowLabel, ledgerStatus, today, errors);
    validateLedgerConversion(row, rowLabel, errors);
  }
}

function validateLedgerDates(row, rowLabel, ledgerStatus, today, errors) {
  const status = ledgerValue(row, "Status");
  const createdDate = ledgerValue(row, "Created date");
  const refreshDate = ledgerValue(row, "Refresh date");

  if (createdDate && !isIsoDate(createdDate)) {
    fail(errors, "improvement ledger", `${rowLabel} has invalid Created date '${createdDate}'; expected YYYY-MM-DD`);
  }
  if (refreshDate && !isIsoDate(refreshDate)) {
    fail(errors, "improvement ledger", `${rowLabel} has invalid Refresh date '${refreshDate}'; expected YYYY-MM-DD`);
  }
  if (
    ledgerStatus === "active"
    && refreshDate
    && isIsoDate(refreshDate)
    && refreshDate < today
    && !LEDGER_REFRESH_EXEMPT_STATUSES.has(status)
  ) {
    fail(errors, "improvement ledger", `${rowLabel} is past its Refresh date '${refreshDate}' and must be marked stale or reviewed`);
  }
}

function validateLedgerConversion(row, rowLabel, errors) {
  const status = ledgerValue(row, "Status");
  const decision = ledgerValue(row, "Decision");
  const evidence = ledgerValue(row, "Evidence");
  const preventionTarget = ledgerValue(row, "Prevention target");
  const proposedRuleOrCheck = ledgerValue(row, "Proposed rule or check");
  const closeCondition = ledgerValue(row, "Close condition");
  const isRuleConversion = status === "converted_to_rule" || decision === "convert_to_rule";
  const isCheckConversion = status === "converted_to_check" || decision === "convert_to_check";

  if (!isRuleConversion && !isCheckConversion) {
    return;
  }

  if (!preventionTarget) {
    fail(errors, "improvement ledger", `${rowLabel} conversion row is missing Prevention target`);
  }
  if (!proposedRuleOrCheck) {
    fail(errors, "improvement ledger", `${rowLabel} conversion row is missing Proposed rule or check evidence`);
  }
  if (WEAK_EVIDENCE_PATTERN.test(evidence)) {
    fail(errors, "improvement ledger", `${rowLabel} converts weak evidence; use needs_more_evidence until evidence is stronger`);
  }
  if (isCheckConversion && !EXECUTABLE_CHECK_TARGET_PATTERN.test(`${preventionTarget} ${proposedRuleOrCheck} ${closeCondition}`)) {
    fail(errors, "improvement ledger", `${rowLabel} converted_to_check row must name an executable check target such as validation script, lint, test, check, or CI`);
  }
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function currentIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function collectMarkdownFiles(root) {
  const files = [];

  function walk(path) {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) {
      return;
    }
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolutePath).sort()) {
        walk(`${path}/${entry}`);
      }
      return;
    }
    if (path.endsWith(".md")) {
      if (path === GENERATED_REPORT_PATH) {
        return;
      }
      files.push(path);
    }
  }

  for (const path of MAINTAINED_SCAN_ROOTS) {
    walk(path);
  }

  return files;
}

function collectFiles(root, paths) {
  const files = [];

  function walk(path) {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) {
      return;
    }
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolutePath).sort()) {
        walk(`${path}/${entry}`);
      }
      return;
    }
    files.push(path);
  }

  for (const path of paths) {
    walk(path);
  }

  return files;
}

function findStalePhrases(root, currentSkillCount, errors) {
  const findings = [];

  for (const path of collectMarkdownFiles(root)) {
    const text = readFileSync(resolve(root, path), "utf8");

    for (const stale of STALE_PHRASES) {
      if (stale.mode === "contains" && containsDisallowedStalePhrase(text, stale.phrase)) {
        findings.push({ path, phrase: stale.phrase, kind: "phrase" });
        fail(errors, "stale phrases", `${path} contains stale phrase: ${stale.phrase}`);
      }
    }

    if (Number.isInteger(currentSkillCount)) {
      for (const finding of findStaleSkillCountReferences(path, text, currentSkillCount)) {
        findings.push(finding);
        fail(
          errors,
          "stale phrases",
          `${path} contains stale skill-count reference: ${finding.phrase} (current: ${currentSkillCount} skills)`,
        );
      }
    }
  }

  return findings;
}

function findStaleSkillCountReferences(path, text, currentSkillCount) {
  const findings = [];
  const seen = new Set();

  for (const pattern of SKILL_COUNT_REFERENCE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const count = Number(match[1]);
      const key = `${match.index}:${match[0]}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (count !== currentSkillCount) {
        findings.push({ path, phrase: match[0], currentSkillCount, kind: "skill-count" });
      }
    }
  }

  return findings;
}

function containsDisallowedStalePhrase(text, phrase) {
  if (!text.includes(phrase)) {
    return false;
  }

  if (!phrase.includes(" -> ")) {
    return true;
  }

  // These are the current full route examples; the shorter substring is stale only when it appears outside them.
  const remainingText = ALLOWED_ROUTE_PHRASE_CONTEXTS.reduce((current, allowed) => current.replaceAll(allowed, ""), text);
  return remainingText.includes(phrase);
}

function buildPathChecks(root, manifest) {
  const paths = new Map();
  function addPath(path, role) {
    if (!path) {
      return;
    }
    if (!paths.has(path)) {
      paths.set(path, new Set());
    }
    paths.get(path).add(role);
  }

  if (manifest?.kernel) {
    addPath(manifest.kernel, "kernel");
  }
  if (manifest?.copy_paste_kernel) {
    addPath(manifest.copy_paste_kernel, "copy_paste_kernel");
  }
  for (const key of ["docs", "examples", "schemas", "adapters"]) {
    if (Array.isArray(manifest?.[key])) {
      for (const path of manifest[key]) {
        addPath(path, key);
      }
    }
  }

  return [...paths.entries()].map(([path, roles]) => ({
    path,
    roles: [...roles],
    ok: existsSync(resolve(root, path)),
  }));
}

function validateClaudeAdapterArchitecture(root, manifest, errors) {
  const checks = {
    requiredAdapterPaths: [],
    requiredCodexAdapterPaths: [],
    schemaPaths: [],
    observabilityDocs: [],
    operationAutomationSkillAbsent: true,
    operationAutomationGroupEmpty: false,
    localObservability: {
      configPresent: false,
      eventStoreLocal: false,
      reportDirLocal: false,
      sessionBoundaryFallbackEnabled: false,
      sessionBoundarySource: false,
      commandAttemptCaptureEnabled: false,
      externalPublicationDisabled: false,
      rawPromptStorageDisabled: false,
      sensitiveStorageDisabled: false,
      httpHooksDisabled: false,
      webhookHooksDisabled: false,
      commitEventsDisabled: false,
      retentionConfigured: false,
      rotationConfigured: false,
      schemaMismatchQuarantines: false,
      deduplicationKeyEventId: false,
      schemaMigrationManualReview: false,
      optOutDocumented: false,
      bashHooksUseCommandAttempt: false,
      metricsRecorderCommandAttemptSeparate: false,
      metricsRecorderRuntimeHealthSurface: false,
    },
    externalPublicationSafety: {
      noHttpHookHandlers: true,
      noWebhookHookHandlers: true,
      noExternalDestinationEnabled: true,
    },
    patternBGitHubAction: {
      present: false,
      hasIssueCommentTrigger: false,
      hasReviewCommentTrigger: false,
      hasMentionGuard: false,
      hasTrustedActorGuard: false,
      hasForkGuard: false,
      capturesPrDiff: false,
      checksOutPrHead: false,
      verifiesPrHeadSha: false,
      promptStatesPrHeadWorkspace: false,
      noAlwaysOnPullRequestTrigger: true,
      noSecretLiteral: true,
      noAutoMergeDeployRelease: true,
    },
    installerProjection: {
      installerPresent: false,
      defaultSkills: [],
      missingDefaultReviewSkills: [],
      commandTemplates: [],
      missingCommandTemplates: [],
      hasProfiles: false,
      validatesCoreState: false,
      validatesCommandClosure: false,
      validatesRoutingClosure: false,
      installsCommandAssets: false,
      skipRuntimeSkipsHooks: false,
      settingsSourceOfTruth: false,
      replacesManagedHooks: false,
    },
    coreInstaller: {
      installerPresent: false,
      readsManifestSkills: false,
      writesInstallState: false,
      hasDryRun: false,
      hasMergeAgents: false,
      hasStaleReporting: false,
      hasPrune: false,
      verifiesPruneHash: false,
      prunesManagedFileOnly: false,
      avoidsCodexProjectionDefault: true,
    },
    codexInstaller: {
      installerPresent: false,
      readsManifestSkills: false,
      writesCodexInstallState: false,
      hasWorkflowProfiles: false,
      validatesSkillClosure: false,
      validatesRouterReachabilityClosure: false,
      validatesInstalledReferences: false,
      managesPromptCommandStale: false,
      projectsAgentsSkills: false,
      installsPrompts: false,
      installsCommand: false,
      hasDryRun: false,
      hasMergeAgents: false,
      hasSkipAgents: false,
      hasStaleReporting: false,
      hasPrune: false,
      verifiesPruneHash: false,
      prunesManagedFileOnly: false,
      avoidsHooksTelemetryExternal: true,
    },
    documentationConsistency: {
      mentionsLocalHooksDefault: false,
      mentionsPatternBOptional: false,
      mentionsNoRawPromptDefault: false,
      mentionsNoExternalPublicationDefault: false,
    },
    adapterGovernance: {
      supportMatrixProfiles: false,
      deploymentStates: false,
      profileLifecycleGuidance: false,
      coexistencePrecedence: false,
      ownershipApprovals: false,
      observabilityLifecycle: false,
      runtimeHealthSurface: false,
      commandAttemptSemantics: false,
      metricsGuardrails: false,
      successWithdrawalSignals: false,
    },
  };

  for (const path of REQUIRED_CLAUDE_ADAPTER_PATHS) {
    const ok = existsSync(resolve(root, path));
    checks.requiredAdapterPaths.push({ path, ok });
    if (!ok) {
      fail(errors, "claude adapter", `required adapter path is missing: ${path}`);
    }
  }

  for (const path of REQUIRED_CODEX_ADAPTER_PATHS) {
    const ok = existsSync(resolve(root, path));
    checks.requiredCodexAdapterPaths.push({ path, ok });
    if (!ok) {
      fail(errors, "codex adapter", `required Codex adapter path is missing: ${path}`);
    }
  }

  for (const path of REQUIRED_ADAPTER_RUNTIME_PATHS) {
    const ok = existsSync(resolve(root, path));
    checks.requiredCodexAdapterPaths.push({ path, ok });
    if (!ok) {
      fail(errors, "adapter runtime", `required adapter runtime path is missing: ${path}`);
    }
  }

  for (const path of REQUIRED_SCHEMA_PATHS) {
    const absolutePath = resolve(root, path);
    const ok = existsSync(absolutePath);
    let validJson = false;
    let hasSchema = false;
    if (ok) {
      try {
        const json = JSON.parse(readFileSync(absolutePath, "utf8"));
        validJson = true;
        hasSchema = typeof json.$schema === "string";
      } catch (error) {
        fail(errors, "schema paths", `${path} is not valid JSON: ${error.message}`);
      }
    }
    checks.schemaPaths.push({ path, ok, validJson, hasSchema });
    if (!ok) {
      fail(errors, "schema paths", `required schema is missing: ${path}`);
    } else if (!hasSchema) {
      fail(errors, "schema paths", `${path} is missing $schema`);
    }
  }

  for (const path of REQUIRED_OBSERVABILITY_DOCS) {
    const ok = existsSync(resolve(root, path));
    checks.observabilityDocs.push({ path, ok });
    if (!ok) {
      fail(errors, "local observability", `required observability doc/config is missing: ${path}`);
    }
  }

  checks.operationAutomationSkillAbsent =
    !existsSync(resolve(root, FORBIDDEN_OPERATION_AUTOMATION_SKILL)) &&
    !existsSync(resolve(root, FORBIDDEN_OPERATION_AUTOMATION_SKILL_UNDERSCORE));
  if (!checks.operationAutomationSkillAbsent) {
    fail(errors, "operation automation", "operation automation must remain an external layer; do not add skills/operation-automation/SKILL.md");
  }
  checks.operationAutomationGroupEmpty = Array.isArray(manifest?.skill_groups?.operation_automation) && manifest.skill_groups.operation_automation.length === 0;
  if (!checks.operationAutomationGroupEmpty) {
    fail(errors, "operation automation", "manifest.json.skill_groups.operation_automation must remain an empty external layer");
  }

  validateObservabilityConfig(root, checks, errors);
  validateHookSafety(root, checks, errors);
  validateMetricsRuntime(root, checks, errors);
  validateCoreInstaller(root, checks, errors);
  validateCodexInstaller(root, checks, errors);
  validateInstallerProjection(root, checks, errors);
  validatePatternBWorkflow(root, checks, errors);
  validateAdapterDocumentation(root, checks, errors);
  validateAdapterGovernance(root, checks, errors);

  return checks;
}

function validateObservabilityConfig(root, checks, errors) {
  const absolutePath = resolve(root, OBSERVABILITY_CONFIG_PATH);
  if (!existsSync(absolutePath)) {
    return;
  }
  checks.localObservability.configPresent = true;
  const text = readFileSync(absolutePath, "utf8");
  const config = parseSimpleYaml(text);
  const eventStore = readObjectPath(config, "storage.event_store");
  const reportDir = readObjectPath(config, "storage.report_dir");
  checks.localObservability.eventStoreLocal = typeof eventStore === "string" && eventStore.startsWith("docs/ai/") && !/^https?:\/\//i.test(eventStore);
  checks.localObservability.reportDirLocal = typeof reportDir === "string" && reportDir.startsWith("docs/ai/") && !/^https?:\/\//i.test(reportDir);
  checks.localObservability.sessionBoundaryFallbackEnabled = readObjectPath(config, "capture.allow_session_id_task_boundary") === true;
  checks.localObservability.sessionBoundarySource = readObjectPath(config, "capture.task_boundary_source") === "session_id";
  checks.localObservability.commandAttemptCaptureEnabled = readObjectPath(config, "capture.record_command_attempts") === true;
  checks.localObservability.externalPublicationDisabled = readObjectPath(config, "external_publication.enabled") === false;
  checks.localObservability.rawPromptStorageDisabled = readObjectPath(config, "privacy.raw_prompt_storage") === false;
  checks.localObservability.sensitiveStorageDisabled =
    readObjectPath(config, "privacy.secrets_storage") === false &&
    readObjectPath(config, "privacy.customer_data_storage") === false &&
    readObjectPath(config, "privacy.personal_data_storage") === false;
  checks.localObservability.httpHooksDisabled = readObjectPath(config, "safety.http_hooks_enabled") === false;
  checks.localObservability.webhookHooksDisabled = readObjectPath(config, "safety.webhook_hooks_enabled") === false;
  checks.localObservability.commitEventsDisabled = readObjectPath(config, "lifecycle.commit_events_to_git") === false;
  checks.localObservability.lifecyclePolicyOnly = readObjectPath(config, "lifecycle.enforcement") === "policy_only";
  checks.localObservability.retentionConfigured = Number(readObjectPath(config, "lifecycle.retention_days")) > 0 && Number(readObjectPath(config, "lifecycle.report_retention_days")) > 0;
  checks.localObservability.rotationConfigured = Number(readObjectPath(config, "lifecycle.rotate_when_bytes")) > 0;
  checks.localObservability.schemaMismatchQuarantines = readObjectPath(config, "lifecycle.schema_mismatch_action") === "quarantine" && typeof readObjectPath(config, "lifecycle.quarantine_dir") === "string";
  checks.localObservability.deduplicationKeyEventId = readObjectPath(config, "lifecycle.deduplication_key") === "event_id";
  checks.localObservability.schemaMigrationManualReview = readObjectPath(config, "lifecycle.schema_migration") === "manual_review_required";
  checks.localObservability.optOutDocumented = typeof readObjectPath(config, "lifecycle.opt_out") === "string" && readObjectPath(config, "lifecycle.opt_out").includes("detach");

  for (const [field, ok] of Object.entries(checks.localObservability)) {
    if (field === "configPresent" || field === "bashHooksUseCommandAttempt" || field === "metricsRecorderCommandAttemptSeparate" || field === "metricsRecorderRuntimeHealthSurface") {
      continue;
    }
    if (!ok) {
      fail(errors, "local observability", `${OBSERVABILITY_CONFIG_PATH} failed local-first safety check: ${field}`);
    }
  }
}

function parseSimpleYaml(text) {
  const result = {};
  const stack = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const level = Math.floor(match[1].length / 2);
    const key = match[2];
    const value = match[3];
    stack.length = level;
    if (value === "") {
      stack[level] = key;
      assignObjectPath(result, [...stack.slice(0, level), key], {});
      continue;
    }
    assignObjectPath(result, [...stack.slice(0, level), key], parseYamlScalar(value));
  }
  return result;
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, "");
}

function assignObjectPath(object, pathParts, value) {
  let cursor = object;
  for (const part of pathParts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[pathParts.at(-1)] = value;
}

function readObjectPath(object, dottedPath) {
  return dottedPath.split(".").reduce((cursor, part) => (cursor && Object.hasOwn(cursor, part) ? cursor[part] : undefined), object);
}

function validateHookSafety(root, checks, errors) {
  const hookPaths = [
    "adapters/claude-code/project/.claude/hooks/hooks.json",
    "adapters/claude-code/plugin/hooks/hooks.json",
  ];
  for (const path of hookPaths) {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) {
      continue;
    }
    let hookConfig;
    try {
      hookConfig = JSON.parse(readFileSync(absolutePath, "utf8"));
    } catch (error) {
      fail(errors, "external publication safety", `${path} is not valid JSON: ${error.message}`);
      continue;
    }
    const serialized = JSON.stringify(hookConfig);
    if (/"type"\s*:\s*"http"/i.test(serialized)) {
      checks.externalPublicationSafety.noHttpHookHandlers = false;
      fail(errors, "external publication safety", `${path} enables an HTTP hook by default`);
    }
    if (/webhook/i.test(serialized)) {
      checks.externalPublicationSafety.noWebhookHookHandlers = false;
      fail(errors, "external publication safety", `${path} contains a webhook hook by default`);
    }
    if (/https?:\/\//i.test(serialized)) {
      checks.externalPublicationSafety.noExternalDestinationEnabled = false;
      fail(errors, "external publication safety", `${path} contains an enabled external destination`);
    }
    const bashHookCommands = hookCommandsForMatcher(hookConfig, "Bash");
    if (bashHookCommands.length > 0) {
      const ok = bashHookCommands.every((command) => command.includes("--event-kind command_attempt")) && bashHookCommands.every((command) => !command.includes("--event-kind verification_attempt"));
      checks.localObservability.bashHooksUseCommandAttempt = checks.localObservability.bashHooksUseCommandAttempt || ok;
      if (!ok) {
        fail(errors, "local observability", `${path} Bash hooks must use command_attempt instead of verification_attempt`);
      }
    }
  }
  if (!checks.localObservability.bashHooksUseCommandAttempt) {
    fail(errors, "local observability", "Claude Bash hooks must record command_attempt events by default");
  }
}

function hookCommandsForMatcher(hookConfig, matcher) {
  const commands = [];
  const groups = hookConfig?.hooks?.PostToolUse;
  if (!Array.isArray(groups)) {
    return commands;
  }
  for (const group of groups) {
    if (group?.matcher !== matcher || !Array.isArray(group.hooks)) {
      continue;
    }
    for (const hook of group.hooks) {
      if (hook?.type === "command" && typeof hook.command === "string") {
        commands.push(hook.command);
      }
    }
  }
  return commands;
}

function validateMetricsRuntime(root, checks, errors) {
  const recorderPath = resolve(root, "scripts/ai-metrics-record.mjs");
  const schemaPath = resolve(root, "schemas/metrics-event.schema.json");
  if (existsSync(recorderPath)) {
    const text = readFileSync(recorderPath, "utf8");
    checks.localObservability.metricsRecorderCommandAttemptSeparate =
      text.includes("command_attempt_metrics") &&
      text.includes("classified_as_verification") &&
      text.includes("verification_metrics.commands_run");
    checks.localObservability.metricsRecorderRuntimeHealthSurface =
      text.includes(".agent-spectrum-kernel/runtime-health.jsonl") &&
      text.includes("non_blocking_metrics_record_failure") &&
      text.includes("full_error_message_stored");
  }
  if (existsSync(schemaPath)) {
    const text = readFileSync(schemaPath, "utf8");
    checks.localObservability.metricsRecorderCommandAttemptSeparate =
      checks.localObservability.metricsRecorderCommandAttemptSeparate &&
      text.includes("\"command_attempt_metrics\"") &&
      text.includes("\"classified_as_verification\"");
  }
  if (!checks.localObservability.metricsRecorderCommandAttemptSeparate) {
    fail(errors, "local observability", "metrics recorder/schema must separate command_attempt from verification_attempt");
  }
  if (!checks.localObservability.metricsRecorderRuntimeHealthSurface) {
    fail(errors, "local observability", "metrics recorder must write sanitized runtime-health entries for non-blocking failures");
  }
}

function validateCoreInstaller(root, checks, errors) {
  const absolutePath = resolve(root, CORE_KERNEL_INSTALLER_PATH);
  checks.coreInstaller.installerPresent = existsSync(absolutePath);
  if (!checks.coreInstaller.installerPresent) {
    fail(errors, "core kernel installer", `required installer is missing: ${CORE_KERNEL_INSTALLER_PATH}`);
    return;
  }

  const text = readFileSync(absolutePath, "utf8");
  const lifecycleText = readFileSync(resolve(root, "scripts/installer-lifecycle.mjs"), "utf8");
  const combinedText = `${text}\n${lifecycleText}`;
  checks.coreInstaller.readsManifestSkills = /manifest\.skills/.test(text);
  checks.coreInstaller.writesInstallState = text.includes(".agent-spectrum-kernel/install-state.json") && text.includes("managed_files");
  checks.coreInstaller.hasDryRun = text.includes("--dry-run") && /dryRun/.test(text);
  checks.coreInstaller.hasMergeAgents = text.includes("--merge-agents") && text.includes("agent-spectrum-kernel:start") && text.includes("agent-spectrum-kernel:end");
  checks.coreInstaller.hasStaleReporting = text.includes("stale managed projection");
  checks.coreInstaller.hasPrune = text.includes("--prune") && /prune/.test(text);
  checks.coreInstaller.verifiesPruneHash = combinedText.includes("modified managed file; refusing to prune") && /currentHash\s*!==\s*record\.sha256/.test(combinedText);
  checks.coreInstaller.prunesManagedFileOnly = combinedText.includes("unlinkSync") && !combinedText.includes("rmSync(");
  checks.coreInstaller.avoidsCodexProjectionDefault = !/\.agents\/skills/.test(text);

  for (const [field, ok] of Object.entries(checks.coreInstaller)) {
    if (!ok) {
      fail(errors, "core kernel installer", `${CORE_KERNEL_INSTALLER_PATH} failed core installer check: ${field}`);
    }
  }
}

function validateCodexInstaller(root, checks, errors) {
  const absolutePath = resolve(root, CODEX_ADAPTER_INSTALLER_PATH);
  checks.codexInstaller.installerPresent = existsSync(absolutePath);
  if (!checks.codexInstaller.installerPresent) {
    fail(errors, "codex adapter installer", `required installer is missing: ${CODEX_ADAPTER_INSTALLER_PATH}`);
    return;
  }

  const text = readFileSync(absolutePath, "utf8");
  const lifecycleText = readFileSync(resolve(root, "scripts/installer-lifecycle.mjs"), "utf8");
  const combinedText = `${text}\n${lifecycleText}`;
  checks.codexInstaller.readsManifestSkills = /manifest\.skills/.test(text);
  checks.codexInstaller.writesCodexInstallState = text.includes(".agent-spectrum-kernel/codex-install-state.json") && text.includes("managed_files");
  checks.codexInstaller.hasWorkflowProfiles = text.includes("CODEX_PROFILES") && text.includes("DEFAULT_PROFILE") && text.includes("--profile");
  checks.codexInstaller.validatesSkillClosure = text.includes("SKILL_RELATIONSHIPS") && text.includes("validateSkillClosure") && text.includes("required_skills");
  checks.codexInstaller.validatesRouterReachabilityClosure =
    text.includes("PROFILE_ROUTING_FIXTURES") &&
    text.includes("routingFixturesForProfile") &&
    text.includes("router_reachable_skills") &&
    text.includes("routing_fixtures");
  checks.codexInstaller.validatesInstalledReferences = text.includes("validateManagedReferences") && text.includes("source-repository-only Codex prompt path");
  checks.codexInstaller.managesPromptCommandStale =
    text.includes("retained_stale_prompts") &&
    text.includes("retained_stale_commands") &&
    text.includes("stale_codex_prompt") &&
    text.includes("stale_codex_command");
  checks.codexInstaller.projectsAgentsSkills = text.includes(".agents/skills") && text.includes("codex_skill");
  checks.codexInstaller.installsPrompts = text.includes(".agents/prompts") && text.includes("PROMPT_TEMPLATES");
  checks.codexInstaller.installsCommand = text.includes(".agents/commands") && text.includes("COMMAND_TEMPLATES");
  checks.codexInstaller.installsRuntimeRunner = text.includes("CODEX_RUNTIME_SCRIPTS") && text.includes("codex_runtime") && text.includes("codex-exec-runner.mjs");
  checks.codexInstaller.hasDryRun = text.includes("--dry-run") && /dryRun/.test(text);
  checks.codexInstaller.hasMergeAgents = text.includes("--merge-agents") && text.includes("agent-spectrum-kernel:start") && text.includes("agent-spectrum-kernel:end");
  checks.codexInstaller.hasSkipAgents = text.includes("--skip-agents") && /skipAgents/.test(text);
  checks.codexInstaller.hasStaleReporting = text.includes("stale Codex managed projection");
  checks.codexInstaller.hasPrune = text.includes("--prune") && /prune/.test(text);
  checks.codexInstaller.verifiesPruneHash = combinedText.includes("modified managed file; refusing to prune") && /currentHash\s*!==\s*record\.sha256/.test(combinedText);
  checks.codexInstaller.prunesManagedFileOnly = combinedText.includes("unlinkSync") && !combinedText.includes("rmSync(");
  const codexInstallerExecutableText = text
    .replace(/release-readiness-gate/g, "")
    .replace(/- Do not chain this template to publish, deploy, release, send notifications, or mutate production state without .+? and explicit approval\./g, "")
    .replace(/no hooks, telemetry, secrets, deploys, external publication, or Git commands\./gi, "")
    .replace(/no hooks, telemetry, secrets, deploys, external publication/gi, "");
  checks.codexInstaller.avoidsHooksTelemetryExternal =
    !/\.claude|hooks\.json|webhook|https?:\/\/|telemetry|deploy|publish|release/i.test(codexInstallerExecutableText);

  for (const [field, ok] of Object.entries(checks.codexInstaller)) {
    if (!ok) {
      fail(errors, "codex adapter installer", `${CODEX_ADAPTER_INSTALLER_PATH} failed Codex installer check: ${field}`);
    }
  }
}

function validateInstallerProjection(root, checks, errors) {
  const absolutePath = resolve(root, CLAUDE_ADAPTER_INSTALLER_PATH);
  checks.installerProjection.installerPresent = existsSync(absolutePath);
  if (!checks.installerProjection.installerPresent) {
    fail(errors, "claude adapter installer", `required installer is missing: ${CLAUDE_ADAPTER_INSTALLER_PATH}`);
    return;
  }

  const text = readFileSync(absolutePath, "utf8");
  const defaultSkills = extractStringArrayConstant(text, "DEFAULT_SKILLS");
  const commandTemplates = extractStringArrayConstant(text, "COMMAND_TEMPLATES");
  checks.installerProjection.defaultSkills = defaultSkills;
  checks.installerProjection.commandTemplates = commandTemplates;
  checks.installerProjection.missingDefaultReviewSkills = REQUIRED_DEFAULT_REVIEW_SKILLS.filter((skill) => !defaultSkills.includes(skill));
  checks.installerProjection.missingCommandTemplates = REQUIRED_COMMAND_TEMPLATES.filter((command) => !commandTemplates.includes(command));
  checks.installerProjection.hasProfiles = text.includes("CLAUDE_PROFILES") && text.includes("DEFAULT_PROFILE") && text.includes("--profile");
  checks.installerProjection.validatesCoreState = text.includes(".agent-spectrum-kernel/install-state.json") && text.includes("validateCoreInstalled");
  checks.installerProjection.validatesCommandClosure = text.includes("COMMAND_METADATA") && text.includes("Selected Claude commands are not closed over installed skills");
  checks.installerProjection.validatesRoutingClosure =
    text.includes("PROFILE_ROUTING_FIXTURES") &&
    text.includes("routingFixturesForProfile") &&
    text.includes("computeRequiredClosure") &&
    ["unfamiliar_repository", "unclear_scope", "boundary_decision", "bug_investigation", "review"].every((fixtureId) => text.includes(fixtureId));
  checks.installerProjection.installsCommandAssets = text.includes("requiredAssets") && text.includes("installAssets");
  checks.installerProjection.skipRuntimeSkipsHooks = text.includes("args.skipHooks || args.skipRuntime") && text.includes("removeManagedHooks");
  checks.installerProjection.settingsSourceOfTruth =
    text.includes("\"settings.json\"") &&
    !text.includes("copyDirectoryFiles(\n    resolve(REPO_ROOT, \"adapters/claude-code/project/.claude/hooks\")");
  checks.installerProjection.replacesManagedHooks = text.includes("removeAdapterOwnedHooks") && text.includes("agent-spectrum-kernel:claude-adapter-hook");

  for (const skill of checks.installerProjection.missingDefaultReviewSkills) {
    fail(errors, "claude adapter installer", `${CLAUDE_ADAPTER_INSTALLER_PATH} DEFAULT_SKILLS is missing required review skill: ${skill}`);
  }
  for (const command of checks.installerProjection.missingCommandTemplates) {
    fail(errors, "claude adapter installer", `${CLAUDE_ADAPTER_INSTALLER_PATH} COMMAND_TEMPLATES is missing required command template: ${command}`);
  }
  for (const field of [
    "hasProfiles",
    "validatesCoreState",
    "validatesCommandClosure",
    "validatesRoutingClosure",
    "installsCommandAssets",
    "skipRuntimeSkipsHooks",
    "settingsSourceOfTruth",
    "replacesManagedHooks",
  ]) {
    if (!checks.installerProjection[field]) {
      fail(errors, "claude adapter installer", `${CLAUDE_ADAPTER_INSTALLER_PATH} failed Claude installer check: ${field}`);
    }
  }
}

function extractStringArrayConstant(text, constantName) {
  const match = text.match(new RegExp(`const\\s+${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function validatePatternBWorkflow(root, checks, errors) {
  const absolutePath = resolve(root, PATTERN_B_WORKFLOW_PATH);
  if (!existsSync(absolutePath)) {
    return;
  }
  checks.patternBGitHubAction.present = true;
  const text = readFileSync(absolutePath, "utf8");
  checks.patternBGitHubAction.hasIssueCommentTrigger = /^\s+issue_comment:/m.test(text);
  checks.patternBGitHubAction.hasReviewCommentTrigger = /^\s+pull_request_review_comment:/m.test(text);
  checks.patternBGitHubAction.hasMentionGuard = text.includes("@claude review") && /contains\([^)]*github\.event\.comment\.body[^)]*'@claude review'[^)]*\)/.test(text);
  checks.patternBGitHubAction.hasTrustedActorGuard =
    /author_association/.test(text) &&
    /\bOWNER\b/.test(text) &&
    /\bMEMBER\b/.test(text) &&
    /\bCOLLABORATOR\b/.test(text);
  checks.patternBGitHubAction.hasForkGuard =
    /allow_fork/i.test(text) &&
    /Fork PR review is blocked by default/.test(text) &&
    /workflow_dispatch/.test(text);
  checks.patternBGitHubAction.capturesPrDiff = /\bgh pr view\b/.test(text) && /\bgh pr diff\b/.test(text) && text.includes(".claude/pr.diff");
  checks.patternBGitHubAction.checksOutPrHead = /\bgh pr checkout\b[\s\S]{0,120}--detach/.test(text);
  checks.patternBGitHubAction.verifiesPrHeadSha = text.includes(".claude/pr-head-sha.txt") && /headRefOid/.test(text) && /git rev-parse HEAD/.test(text);
  checks.patternBGitHubAction.promptStatesPrHeadWorkspace = /PR head workspace/.test(text) && /insufficient evidence/.test(text);
  checks.patternBGitHubAction.noAlwaysOnPullRequestTrigger = !/^\s+pull_request:\s*$/m.test(text);
  checks.patternBGitHubAction.noSecretLiteral = !/(sk-ant-|ANTHROPIC_API_KEY\s*:\s*["'][^$])/i.test(text);
  checks.patternBGitHubAction.noAutoMergeDeployRelease = !/\b(auto-?merge|deploy|release|publish)\b/i.test(text.replace(/Do not deploy, merge, release, publish/gi, ""));

  for (const [field, ok] of Object.entries(checks.patternBGitHubAction)) {
    if (field === "present") continue;
    if (!ok) {
      fail(errors, "pattern b github action", `${PATTERN_B_WORKFLOW_PATH} failed Pattern B check: ${field}`);
    }
  }

  const claudeActionReferences = collectFiles(root, [".github", "adapters", "docs", "examples"])
    .filter((path) => existsSync(resolve(root, path)) && statSync(resolve(root, path)).isFile())
    .filter((path) => readFileSync(resolve(root, path), "utf8").includes("anthropics/claude-code-action"));
  for (const path of claudeActionReferences) {
    if (!path.startsWith("adapters/claude-code/github-actions/") && path !== "docs/claude-github-review-setup.md") {
      fail(errors, "pattern b github action", `Claude Code Action workflow reference must live under adapter docs/templates, found: ${path}`);
    }
  }
}

function validateAdapterDocumentation(root, checks, errors) {
  const docsText = REQUIRED_OBSERVABILITY_DOCS
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => readFileSync(resolve(root, path), "utf8"))
    .join("\n");
  const adoptionText = [
    "README.md",
    "docs/quickstart-ja.md",
    "docs/usage-ja.md",
    "docs/prompt-recipes-ja.md",
    "docs/skill-matrix.md",
    "docs/routing-model.md",
  ]
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => readFileSync(resolve(root, path), "utf8"))
    .join("\n");

  const combinedDocsText = `${docsText}\n${adoptionText}`;
  checks.documentationConsistency.mentionsLocalHooksDefault = /local hooks?.*(default|primary|推奨|既定)|default.*local hooks?/is.test(combinedDocsText);
  checks.documentationConsistency.mentionsPatternBOptional = /Pattern B[\s\S]{0,120}(optional|任意)|optional[\s\S]{0,120}Pattern B/is.test(combinedDocsText);
  checks.documentationConsistency.mentionsNoRawPromptDefault = /raw prompt[\s\S]{0,120}(default|off|既定|保存しません|omitted)/is.test(`${docsText}\n${adoptionText}`);
  checks.documentationConsistency.mentionsNoExternalPublicationDefault = /external publication[\s\S]{0,120}(default|off|disabled|既定|外部公開)|外部公開[\s\S]{0,120}(既定off|既定で.*しません)/is.test(`${docsText}\n${adoptionText}`);

  for (const [field, ok] of Object.entries(checks.documentationConsistency)) {
    if (!ok) {
      fail(errors, "documentation consistency", `Claude adapter docs failed consistency check: ${field}`);
    }
  }
}

function validateAdapterGovernance(root, checks, errors) {
  const absolutePath = resolve(root, ADAPTER_DEPLOYMENT_GOVERNANCE_PATH);
  if (!existsSync(absolutePath)) {
    return;
  }
  const text = readFileSync(absolutePath, "utf8");
  checks.adapterGovernance.supportMatrixProfiles =
    /Local minimal/.test(text) &&
    /Local observed/.test(text) &&
    /Shared PR review/.test(text) &&
    /Plugin distribution/.test(text) &&
    /Codex projection/.test(text);
  checks.adapterGovernance.deploymentStates =
    /\bInstalled\b/.test(text) &&
    /\bActivated\b/.test(text) &&
    /\bOperational\b/.test(text) &&
    /File copy alone/.test(text);
  checks.adapterGovernance.profileLifecycleGuidance =
    /Install/.test(text) &&
    /Validate/.test(text) &&
    /Update/.test(text) &&
    /Detach/.test(text) &&
    /Unsupported combinations/.test(text);
  checks.adapterGovernance.coexistencePrecedence =
    /Coexistence And Precedence/.test(text) &&
    /CLAUDE_PLUGIN_ROOT/.test(text) &&
    /\.claude\/settings\.json/.test(text);
  checks.adapterGovernance.ownershipApprovals =
    /Ownership And Approvals/.test(text) &&
    /GitHub Actions/.test(text) &&
    /approval/.test(text);
  checks.adapterGovernance.observabilityLifecycle =
    /commit_events_to_git/.test(text) &&
    /schema_mismatch_action/.test(text) &&
    /deduplication_key/.test(text) &&
    /schema_migration/.test(text) &&
    /retention_days/.test(text);
  checks.adapterGovernance.runtimeHealthSurface =
    /\.agent-spectrum-kernel\/runtime-health\.jsonl/.test(text) &&
    /ask-doctor/.test(text) &&
    /full error messages/.test(text);
  checks.adapterGovernance.commandAttemptSemantics =
    /command_attempt/.test(text) &&
    /verification_attempt/.test(text) &&
    /generic Bash hook must not classify every command as verification/.test(text);
  checks.adapterGovernance.metricsGuardrails =
    /HR/.test(text) &&
    /compensation/.test(text) &&
    /promotion/.test(text) &&
    /individual productivity rankings/.test(text) &&
    /personal identifiers/.test(text);
  checks.adapterGovernance.successWithdrawalSignals =
    /re-review count/.test(text) &&
    /missed blocker rate/.test(text) &&
    /false positive rate/.test(text) &&
    /senior correction effort/.test(text) &&
    /token\/time cost/.test(text) &&
    /unsupported-causality/.test(text) &&
    /Reduce, redesign, or remove/.test(text);

  for (const [field, ok] of Object.entries(checks.adapterGovernance)) {
    if (!ok) {
      fail(errors, "adapter deployment governance", `${ADAPTER_DEPLOYMENT_GOVERNANCE_PATH} failed governance check: ${field}`);
    }
  }
}

function buildReport({ manifest, skillDirectories, skillGroupChecks, routingChecks, skillChecks, contextMetadataChecks, improvementLedgerChecks, domainRuleLedgerChecks, claudeAdapterChecks, executionEnvelopeChecks, pathChecks, staleFindings }) {
  const manifestSkills = Array.isArray(manifest?.skills) ? [...manifest.skills].sort() : [];
  const missingDirectories = manifestSkills.filter((skill) => !skillDirectories.includes(skill));
  const extraDirectories = skillDirectories.filter((skill) => !manifestSkills.includes(skill));
  const skillCount = manifestSkills.length;
  const target = manifest?.design?.quality_target ?? "unknown";
  const staleSkillCountFindings = staleFindings.filter((finding) => finding.kind === "skill-count");

  const lines = [
    "# Validation Report",
    "",
    "Static packaging checks. This does not prove runtime behavior; it catches drift before use.",
    "",
    "Generated by `node scripts/validate-repo.mjs --write-report`.",
    "",
    "## Manifest / directory consistency",
    "",
    `- Skills in manifest: ${skillCount}`,
    `- Skill directories: ${skillDirectories.length}`,
    `- Missing directories: ${missingDirectories.length > 0 ? missingDirectories.join(", ") : "none"}`,
    `- Extra directories: ${extraDirectories.length > 0 ? extraDirectories.join(", ") : "none"}`,
    "",
    "## Skill group checks",
    "",
    ...(skillGroupChecks.length > 0
      ? [
          ...skillGroupChecks.map((check) => `- \`${check.group}\`: skills=${check.count}${check.count === 0 ? " (empty)" : ""}`),
          `- Allowed multi-group skills: ${Array.isArray(manifest?.allowed_multi_group_skills) && manifest.allowed_multi_group_skills.length > 0 ? manifest.allowed_multi_group_skills.join(", ") : "none"}`,
        ]
      : ["- `manifest.json.skill_groups`: missing or invalid"]),
    "",
    "## Routing manifest checks",
    "",
    `- routing section present: ${routingChecks.present ? "ok" : "missing"}`,
    `- task classes: ${routingChecks.taskClasses.length > 0 ? routingChecks.taskClasses.join(", ") : "none"}`,
    `- operating modes: ${routingChecks.operatingModes.length > 0 ? routingChecks.operatingModes.join(", ") : "none"}`,
    `- default route entries: ${routingChecks.defaultRoutes.length}`,
    `- route override preserved: ${routingChecks.routeOverridePreserved ? "ok" : "invalid"}`,
    `- hard_stop limited to AGENTS approval-required surfaces: ${routingChecks.riskGateHardStopLimited ? "ok" : "invalid"}`,
    `- unsupported adapter capability downgrade preserved: ${routingChecks.unsupportedCapabilityDowngrade ? "ok" : "invalid"}`,
    "",
    "## Skill section checks",
    "",
    ...skillChecks.map(
      (check) => `- \`${check.path}\`: words=${check.words}, name_ok=${check.nameOk ? "True" : "False"}, missing=${check.missing.length > 0 ? check.missing.join(", ") : "none"}`,
    ),
    "",
    "## Execution Envelope checks",
    "",
    `- canonical contract: ${executionEnvelopeChecks.contractPresent ? "ok" : "missing"}`,
    `- manifest doc/schema paths: ${executionEnvelopeChecks.docListed && executionEnvelopeChecks.schemaListed ? "ok" : "invalid"}`,
    `- Claude plugin contract/schema projection: ${executionEnvelopeChecks.pluginProjection.every((check) => check.ok) ? "ok" : "invalid"}`,
    `- session state uses envelope as control state: ${executionEnvelopeChecks.sessionState ? "ok" : "invalid"}`,
    `- canonical skills reference the contract: ${executionEnvelopeChecks.skills.every((check) => check.ok) ? "ok" : "invalid"}`,
    `- adapter prompts reference the contract: ${executionEnvelopeChecks.adapters.every((check) => check.ok) ? "ok" : "invalid"}`,
    "",
    "## Context template status checks",
    "",
    ...contextMetadataChecks.map((check) => `- \`${check.path}\`: context_status=${check.status}, metadata=${check.metadataOk ? "ok" : "invalid"}`),
    "",
    "## Improvement ledger checks",
    "",
    ...(improvementLedgerChecks.length > 0
      ? improvementLedgerChecks.map(
          (check) => `- \`${check.path}\`: ledger_status=${check.status}, metadata=${check.metadataOk ? "ok" : "invalid"}, rows=${check.rowCount}, validation=${check.validationOk ? "ok" : "invalid"}`,
        )
      : ["- `docs/ai/improvement-ledger.md`: not present"]),
    "",
    "## Domain rule ledger checks",
    "",
    ...(domainRuleLedgerChecks.length > 0
      ? domainRuleLedgerChecks.map(
          (check) => `- \`${check.path}\`: ledger_status=${check.status}, metadata=${check.metadataOk ? "ok" : "invalid"}, rows=${check.rowCount}, validation=${check.validationOk ? "ok" : "invalid"}`,
        )
      : ["- `docs/ai/domain-rule-ledger.md`: not present"]),
    "",
    "## Claude adapter checks",
    "",
    ...claudeAdapterChecks.requiredAdapterPaths.map((check) => `- \`${check.path}\`: ${check.ok ? "ok" : "missing"}`),
    "",
    "## Codex adapter checks",
    "",
    ...claudeAdapterChecks.requiredCodexAdapterPaths.map((check) => `- \`${check.path}\`: ${check.ok ? "ok" : "missing"}`),
    "",
    "## Core kernel installer checks",
    "",
    `- installer present: ${claudeAdapterChecks.coreInstaller.installerPresent ? "ok" : "missing"}`,
    `- reads manifest skills: ${claudeAdapterChecks.coreInstaller.readsManifestSkills ? "ok" : "invalid"}`,
    `- writes install state: ${claudeAdapterChecks.coreInstaller.writesInstallState ? "ok" : "invalid"}`,
    `- dry-run supported: ${claudeAdapterChecks.coreInstaller.hasDryRun ? "ok" : "invalid"}`,
    `- managed AGENTS.md merge supported: ${claudeAdapterChecks.coreInstaller.hasMergeAgents ? "ok" : "invalid"}`,
    `- stale managed projection reporting: ${claudeAdapterChecks.coreInstaller.hasStaleReporting ? "ok" : "invalid"}`,
    `- prune supported: ${claudeAdapterChecks.coreInstaller.hasPrune ? "ok" : "invalid"}`,
    `- prune hash verification: ${claudeAdapterChecks.coreInstaller.verifiesPruneHash ? "ok" : "invalid"}`,
    `- prune limited to managed files: ${claudeAdapterChecks.coreInstaller.prunesManagedFileOnly ? "ok" : "invalid"}`,
    `- no Codex-specific projection by default: ${claudeAdapterChecks.coreInstaller.avoidsCodexProjectionDefault ? "ok" : "invalid"}`,
    "",
    "## Codex adapter installer checks",
    "",
    `- installer present: ${claudeAdapterChecks.codexInstaller.installerPresent ? "ok" : "missing"}`,
    `- reads manifest skills: ${claudeAdapterChecks.codexInstaller.readsManifestSkills ? "ok" : "invalid"}`,
    `- writes Codex install state: ${claudeAdapterChecks.codexInstaller.writesCodexInstallState ? "ok" : "invalid"}`,
    `- workflow profiles: ${claudeAdapterChecks.codexInstaller.hasWorkflowProfiles ? "ok" : "invalid"}`,
    `- skill closure validation: ${claudeAdapterChecks.codexInstaller.validatesSkillClosure ? "ok" : "invalid"}`,
    `- router reachability closure: ${claudeAdapterChecks.codexInstaller.validatesRouterReachabilityClosure ? "ok" : "invalid"}`,
    `- installed-reference validation: ${claudeAdapterChecks.codexInstaller.validatesInstalledReferences ? "ok" : "invalid"}`,
    `- prompt/command stale lifecycle: ${claudeAdapterChecks.codexInstaller.managesPromptCommandStale ? "ok" : "invalid"}`,
    `- projects .agents/skills: ${claudeAdapterChecks.codexInstaller.projectsAgentsSkills ? "ok" : "invalid"}`,
    `- installs prompt templates: ${claudeAdapterChecks.codexInstaller.installsPrompts ? "ok" : "invalid"}`,
    `- installs command templates: ${claudeAdapterChecks.codexInstaller.installsCommand ? "ok" : "invalid"}`,
    `- dry-run supported: ${claudeAdapterChecks.codexInstaller.hasDryRun ? "ok" : "invalid"}`,
    `- managed AGENTS.md merge supported: ${claudeAdapterChecks.codexInstaller.hasMergeAgents ? "ok" : "invalid"}`,
    `- skip AGENTS.md supported: ${claudeAdapterChecks.codexInstaller.hasSkipAgents ? "ok" : "invalid"}`,
    `- stale Codex projection reporting: ${claudeAdapterChecks.codexInstaller.hasStaleReporting ? "ok" : "invalid"}`,
    `- prune supported: ${claudeAdapterChecks.codexInstaller.hasPrune ? "ok" : "invalid"}`,
    `- prune hash verification: ${claudeAdapterChecks.codexInstaller.verifiesPruneHash ? "ok" : "invalid"}`,
    `- prune limited to managed files: ${claudeAdapterChecks.codexInstaller.prunesManagedFileOnly ? "ok" : "invalid"}`,
    `- no hooks/telemetry/external effects: ${claudeAdapterChecks.codexInstaller.avoidsHooksTelemetryExternal ? "ok" : "invalid"}`,
    "",
    "## Local observability checks",
    "",
    `- config present: ${claudeAdapterChecks.localObservability.configPresent ? "ok" : "missing"}`,
    `- event store local: ${claudeAdapterChecks.localObservability.eventStoreLocal ? "ok" : "invalid"}`,
    `- report dir local: ${claudeAdapterChecks.localObservability.reportDirLocal ? "ok" : "invalid"}`,
    `- session boundary fallback enabled: ${claudeAdapterChecks.localObservability.sessionBoundaryFallbackEnabled ? "ok" : "invalid"}`,
    `- session boundary source is session_id: ${claudeAdapterChecks.localObservability.sessionBoundarySource ? "ok" : "invalid"}`,
    `- command attempt capture enabled: ${claudeAdapterChecks.localObservability.commandAttemptCaptureEnabled ? "ok" : "invalid"}`,
    `- external publication disabled: ${claudeAdapterChecks.localObservability.externalPublicationDisabled ? "ok" : "invalid"}`,
    `- raw prompt storage disabled: ${claudeAdapterChecks.localObservability.rawPromptStorageDisabled ? "ok" : "invalid"}`,
    `- sensitive storage disabled: ${claudeAdapterChecks.localObservability.sensitiveStorageDisabled ? "ok" : "invalid"}`,
    `- HTTP hooks disabled: ${claudeAdapterChecks.localObservability.httpHooksDisabled ? "ok" : "invalid"}`,
    `- webhook hooks disabled: ${claudeAdapterChecks.localObservability.webhookHooksDisabled ? "ok" : "invalid"}`,
    `- commit events disabled: ${claudeAdapterChecks.localObservability.commitEventsDisabled ? "ok" : "invalid"}`,
    `- lifecycle enforcement is policy-only: ${claudeAdapterChecks.localObservability.lifecyclePolicyOnly ? "declared" : "invalid"}`,
    `- retention policy declared: ${claudeAdapterChecks.localObservability.retentionConfigured ? "declared" : "invalid"}`,
    `- rotation policy declared: ${claudeAdapterChecks.localObservability.rotationConfigured ? "declared" : "invalid"}`,
    `- schema mismatch policy declared: ${claudeAdapterChecks.localObservability.schemaMismatchQuarantines ? "declared" : "invalid"}`,
    `- deduplication policy declared: ${claudeAdapterChecks.localObservability.deduplicationKeyEventId ? "declared" : "invalid"}`,
    `- schema migration policy declared: ${claudeAdapterChecks.localObservability.schemaMigrationManualReview ? "declared" : "invalid"}`,
    `- detach/purge policy documented: ${claudeAdapterChecks.localObservability.optOutDocumented ? "ok" : "invalid"}`,
    `- Bash hooks use command_attempt: ${claudeAdapterChecks.localObservability.bashHooksUseCommandAttempt ? "ok" : "invalid"}`,
    `- command_attempt separated from verification_attempt: ${claudeAdapterChecks.localObservability.metricsRecorderCommandAttemptSeparate ? "ok" : "invalid"}`,
    `- runtime-health surface present: ${claudeAdapterChecks.localObservability.metricsRecorderRuntimeHealthSurface ? "ok" : "invalid"}`,
    "",
    "## External publication safety checks",
    "",
    `- operation automation skill absent: ${claudeAdapterChecks.operationAutomationSkillAbsent ? "ok" : "invalid"}`,
    `- operation automation manifest group empty: ${claudeAdapterChecks.operationAutomationGroupEmpty ? "ok" : "invalid"}`,
    `- no HTTP hook handlers enabled: ${claudeAdapterChecks.externalPublicationSafety.noHttpHookHandlers ? "ok" : "invalid"}`,
    `- no webhook hook handlers enabled: ${claudeAdapterChecks.externalPublicationSafety.noWebhookHookHandlers ? "ok" : "invalid"}`,
    `- no external destination enabled: ${claudeAdapterChecks.externalPublicationSafety.noExternalDestinationEnabled ? "ok" : "invalid"}`,
    "",
    "## Schema path checks",
    "",
    ...claudeAdapterChecks.schemaPaths.map((check) => `- \`${check.path}\`: exists=${check.ok ? "yes" : "no"}, json=${check.validJson ? "ok" : "invalid"}, schema=${check.hasSchema ? "ok" : "missing"}`),
    "",
    "## Pattern B GitHub Actions adapter checks",
    "",
    `- template present: ${claudeAdapterChecks.patternBGitHubAction.present ? "ok" : "missing"}`,
    `- issue_comment trigger: ${claudeAdapterChecks.patternBGitHubAction.hasIssueCommentTrigger ? "ok" : "invalid"}`,
    `- pull_request_review_comment trigger: ${claudeAdapterChecks.patternBGitHubAction.hasReviewCommentTrigger ? "ok" : "invalid"}`,
    `- @claude review guard: ${claudeAdapterChecks.patternBGitHubAction.hasMentionGuard ? "ok" : "invalid"}`,
    `- trusted actor guard: ${claudeAdapterChecks.patternBGitHubAction.hasTrustedActorGuard ? "ok" : "invalid"}`,
    `- fork PR guard: ${claudeAdapterChecks.patternBGitHubAction.hasForkGuard ? "ok" : "invalid"}`,
    `- PR diff captured before Claude: ${claudeAdapterChecks.patternBGitHubAction.capturesPrDiff ? "ok" : "invalid"}`,
    `- PR head checkout before Claude: ${claudeAdapterChecks.patternBGitHubAction.checksOutPrHead ? "ok" : "invalid"}`,
    `- PR head SHA verified: ${claudeAdapterChecks.patternBGitHubAction.verifiesPrHeadSha ? "ok" : "invalid"}`,
    `- prompt states PR head evidence boundary: ${claudeAdapterChecks.patternBGitHubAction.promptStatesPrHeadWorkspace ? "ok" : "invalid"}`,
    `- no always-on pull_request trigger: ${claudeAdapterChecks.patternBGitHubAction.noAlwaysOnPullRequestTrigger ? "ok" : "invalid"}`,
    `- no literal secret: ${claudeAdapterChecks.patternBGitHubAction.noSecretLiteral ? "ok" : "invalid"}`,
    `- no auto-merge/deploy/release action: ${claudeAdapterChecks.patternBGitHubAction.noAutoMergeDeployRelease ? "ok" : "invalid"}`,
    "",
    "## Claude adapter installer projection checks",
    "",
    `- installer present: ${claudeAdapterChecks.installerProjection.installerPresent ? "ok" : "missing"}`,
    `- default review skills projected: ${claudeAdapterChecks.installerProjection.missingDefaultReviewSkills.length === 0 ? "ok" : `missing ${claudeAdapterChecks.installerProjection.missingDefaultReviewSkills.join(", ")}`}`,
    `- command templates projected: ${claudeAdapterChecks.installerProjection.missingCommandTemplates.length === 0 ? "ok" : `missing ${claudeAdapterChecks.installerProjection.missingCommandTemplates.join(", ")}`}`,
    `- profiles: ${claudeAdapterChecks.installerProjection.hasProfiles ? "ok" : "invalid"}`,
    `- core state validation: ${claudeAdapterChecks.installerProjection.validatesCoreState ? "ok" : "invalid"}`,
    `- command closure validation: ${claudeAdapterChecks.installerProjection.validatesCommandClosure ? "ok" : "invalid"}`,
    `- routing closure validation: ${claudeAdapterChecks.installerProjection.validatesRoutingClosure ? "ok" : "invalid"}`,
    `- command assets projection: ${claudeAdapterChecks.installerProjection.installsCommandAssets ? "ok" : "invalid"}`,
    `- skip-runtime skips hooks: ${claudeAdapterChecks.installerProjection.skipRuntimeSkipsHooks ? "ok" : "invalid"}`,
    `- settings.json hook source of truth: ${claudeAdapterChecks.installerProjection.settingsSourceOfTruth ? "ok" : "invalid"}`,
    `- managed hook replacement: ${claudeAdapterChecks.installerProjection.replacesManagedHooks ? "ok" : "invalid"}`,
    "",
    "## Documentation consistency checks",
    "",
    `- local hooks documented as default: ${claudeAdapterChecks.documentationConsistency.mentionsLocalHooksDefault ? "ok" : "missing"}`,
    `- Pattern B documented as optional: ${claudeAdapterChecks.documentationConsistency.mentionsPatternBOptional ? "ok" : "missing"}`,
    `- no raw prompt storage by default documented: ${claudeAdapterChecks.documentationConsistency.mentionsNoRawPromptDefault ? "ok" : "missing"}`,
    `- no external publication by default documented: ${claudeAdapterChecks.documentationConsistency.mentionsNoExternalPublicationDefault ? "ok" : "missing"}`,
    "",
    "## Adapter deployment governance checks",
    "",
    `- support matrix profiles: ${claudeAdapterChecks.adapterGovernance.supportMatrixProfiles ? "ok" : "missing"}`,
    `- deployment states: ${claudeAdapterChecks.adapterGovernance.deploymentStates ? "ok" : "missing"}`,
    `- profile lifecycle guidance: ${claudeAdapterChecks.adapterGovernance.profileLifecycleGuidance ? "ok" : "missing"}`,
    `- coexistence precedence: ${claudeAdapterChecks.adapterGovernance.coexistencePrecedence ? "ok" : "missing"}`,
    `- ownership approvals: ${claudeAdapterChecks.adapterGovernance.ownershipApprovals ? "ok" : "missing"}`,
    `- observability lifecycle: ${claudeAdapterChecks.adapterGovernance.observabilityLifecycle ? "ok" : "missing"}`,
    `- runtime health surface: ${claudeAdapterChecks.adapterGovernance.runtimeHealthSurface ? "ok" : "missing"}`,
    `- command attempt semantics: ${claudeAdapterChecks.adapterGovernance.commandAttemptSemantics ? "ok" : "missing"}`,
    `- metrics guardrails: ${claudeAdapterChecks.adapterGovernance.metricsGuardrails ? "ok" : "missing"}`,
    `- success and withdrawal signals: ${claudeAdapterChecks.adapterGovernance.successWithdrawalSignals ? "ok" : "missing"}`,
    "",
    "## Document path checks",
    "",
    ...pathChecks.map((check) => `- \`${check.path}\`: ${check.ok ? "ok" : "missing"} (${check.roles.join(", ")})`),
    "",
    "## Stale name scan",
    "",
    staleFindings.length > 0 ? staleFindings.map((finding) => `- \`${finding.path}\`: ${finding.phrase}`).join("\n") : "none",
    "",
    "## Auxiliary documentation audit",
    "",
    staleSkillCountFindings.length > 0
      ? `- Stale skill-count references found above: ${staleSkillCountFindings.length}.`
      : "- No stale skill-count references found.",
    "- No deleted legacy code-review adapter references found.",
    "- Review route references use the current signal-first route through `review-router`, observed change signals, required gates, and `review-final-merge-gate`.",
    "- Implementation route references use Verification Contract, Implementation Contract, `controlled-implementation`, and evidence-oriented verification wording.",
    "- Operating mode routing, skill group metadata, adoption workflows, observability metrics, and operation reporting are represented as separate layers.",
    "- Project overlay, stack overlay, review context, implementation context, and task progress terminology is explicitly separated in maintained auxiliary docs.",
    "- Review and implementation context metadata distinguishes uninitialized templates from initialized or stale durable context.",
    "",
    "## Quality target",
    "",
    `- Target: ${target}.`,
    `- Rubric present: ${pathChecks.some((check) => check.path === "docs/quality-rubric.md" && check.ok) ? "yes" : "no"}`,
    "",
  ];

  return `${lines.join("\n")}`;
}

function checkReport(root, report, writeReport, skipReportCheck, errors) {
  if (skipReportCheck) {
    return;
  }

  const reportPath = resolve(root, "docs/validation-report.md");
  if (writeReport) {
    mkdirSync(resolve(root, "docs"), { recursive: true });
    writeFileSync(reportPath, report);
    return;
  }

  if (!existsSync(reportPath)) {
    fail(errors, "report", "docs/validation-report.md is missing");
    return;
  }

  const actual = readFileSync(reportPath, "utf8");
  if (actual !== report) {
    fail(errors, "report", "docs/validation-report.md is stale. Run: node scripts/validate-repo.mjs --write-report");
  }
}

function printResult(root, errors) {
  if (errors.length === 0) {
    console.log(`Repository validation passed: ${relative(process.cwd(), root) || "."}`);
    return;
  }

  console.error("Repository validation failed:");
  for (const error of errors) {
    console.error(`- [${error.section}] ${error.message}`);
  }
}

export function validateRepository(options) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  const manifest = readJson(root, "manifest.json", errors);
  const skillDirectories = listSkillDirectories(root);

  validateManifest(root, manifest, skillDirectories, errors);
  const skillGroupChecks = validateSkillGroups(manifest, errors);
  const routingChecks = validateRoutingManifest(root, manifest, errors);
  validateManifestPaths(root, manifest, errors);
  const skillChecks = validateSkills(root, skillDirectories, errors);
  const contextMetadataChecks = validateContextMetadata(root, errors);
  const improvementLedgerChecks = validateImprovementLedger(root, errors);
  const domainRuleLedgerChecks = validateDomainRuleLedger(root, errors);
  const claudeAdapterChecks = validateClaudeAdapterArchitecture(root, manifest, errors);
  const executionEnvelopeChecks = validateExecutionEnvelope(root, manifest, errors);
  const currentSkillCount = Array.isArray(manifest?.skills) ? manifest.skills.length : null;
  const staleFindings = findStalePhrases(root, currentSkillCount, errors);
  const pathChecks = buildPathChecks(root, manifest);
  const report = buildReport({ manifest, skillDirectories, skillGroupChecks, routingChecks, skillChecks, contextMetadataChecks, improvementLedgerChecks, domainRuleLedgerChecks, claudeAdapterChecks, executionEnvelopeChecks, pathChecks, staleFindings });

  checkReport(root, report, options.writeReport, options.skipReportCheck, errors);

  return { errors, report };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = validateRepository(options);
    printResult(resolve(options.root), result.errors);
    process.exit(result.errors.length === 0 ? 0 : 1);
  } catch (error) {
    console.error(`Repository validation failed: ${error.message}`);
    process.exit(1);
  }
}
