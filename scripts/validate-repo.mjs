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
  "schemas/review-signal-gate-map.json",
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
const LIFECYCLE_ARTIFACT_CONTRACT_PATH = "docs/lifecycle-artifact-contract.md";
const LIFECYCLE_ARTIFACT_FIXTURE_PATH = "docs/fixtures/lifecycle-artifact-chains.json";
const LIFECYCLE_TRACEABILITY_CONTRACT_PATH = "docs/lifecycle-traceability-contract.md";
const LIFECYCLE_TRACEABILITY_FIXTURE_PATH = "docs/fixtures/lifecycle-traceability-chains.json";
const TRACEABILITY_ARTIFACT_ITEM_KINDS = {
  requirement: ["decision"],
  spec: ["behavior", "acceptance"],
  work_package: ["task"],
  verification: ["obligation"],
  implementation: ["change"],
  evidence: ["evidence"],
  review: ["decision", "blocker", "accepted_risk"],
  release_readiness: ["check", "approval", "rollback"],
};
const TRACEABILITY_CLAIM_GAP_TYPES = {
  completion: ["acceptance", "verification"],
  merge: ["implementation", "review"],
  release: ["acceptance", "verification", "review", "approval", "rollback"],
};
const TRACEABILITY_GAP_ITEM_KINDS = {
  acceptance: ["acceptance"],
  verification: ["obligation", "evidence"],
  implementation: ["change"],
  review: ["decision"],
  approval: ["approval"],
  rollback: ["rollback"],
};
const TRACEABILITY_EXEMPTION_FACTS = ["localized_scope", "no_claim", "no_required_gate"];
const TRACEABILITY_SKILL_PATHS = [
  "skills/requirement-grill/SKILL.md",
  "skills/spec-driven-development/SKILL.md",
  "skills/work-package-compiler/SKILL.md",
  "skills/test-first-verification/SKILL.md",
  "skills/controlled-implementation/SKILL.md",
  "skills/review-final-merge-gate/SKILL.md",
  "skills/release-readiness-gate/SKILL.md",
];
const LIFECYCLE_ARTIFACT_TYPES = ["requirement", "spec", "work_package", "verification", "implementation", "compact"];
const LIFECYCLE_ARTIFACT_SKILL_PATHS = [
  "skills/requirement-grill/SKILL.md",
  "skills/spec-driven-development/SKILL.md",
  "skills/work-package-compiler/SKILL.md",
  "skills/test-first-verification/SKILL.md",
  "skills/controlled-implementation/SKILL.md",
  "skills/skill-router/SKILL.md",
];
const LIFECYCLE_ARTIFACT_ADAPTER_PATHS = [
  "adapters/codex/prompts/skill-implement.md",
  "adapters/codex/prompts/skill-verify.md",
  "adapters/claude-code/project/.claude/commands/skill-implement.md",
  "adapters/claude-code/project/.claude/commands/skill-verify.md",
];
const LIFECYCLE_FIELD_OWNERS = {
  requirement: ["why", "actor", "object", "outcome", "responsibility_boundary", "policy_boundary", "success_condition", "failure_condition", "unresolved_human_decisions", "domain_rule_constraints", "non_goals", "evidence_status"],
  spec: ["behavior_delta", "inputs", "outputs", "state_changes", "error_cases", "edge_cases", "compatibility", "acceptance_criteria", "observable_constraints"],
  work_package: ["allowed_scope", "forbidden_scope", "ordered_tasks", "dependencies", "stop_conditions", "evidence_expectations", "likely_files", "required_gates", "memory_refs"],
  verification: ["behavior_obligations", "regression_obligations", "focused_checks", "broader_checks", "negative_cases", "manual_runtime_checks", "measurement_methods", "required_evidence", "insufficient_evidence_conditions", "completion_evidence", "merge_evidence", "release_evidence", "existing_coverage", "verification_pattern_refs"],
  implementation: ["change_class", "implementation_decisions", "actual_change_boundary", "deviations", "discovered_assumptions", "risks", "blockers", "verification_attempts", "evidence_references", "remaining_limitations", "handoff_state"],
  compact: ["decision", "behavior_delta", "allowed_scope", "forbidden_scope", "proof_obligation", "evidence", "implementation_decisions"],
};
const LIFECYCLE_REQUIRED_FIELDS = {
  requirement: ["why", "actor", "object", "outcome", "responsibility_boundary", "policy_boundary", "success_condition", "failure_condition"],
  spec: ["behavior_delta", "acceptance_criteria"],
  work_package: ["allowed_scope", "forbidden_scope", "ordered_tasks", "dependencies", "stop_conditions", "evidence_expectations"],
  verification: ["behavior_obligations", "focused_checks", "required_evidence", "insufficient_evidence_conditions", "completion_evidence"],
  implementation: ["actual_change_boundary", "verification_attempts", "evidence_references", "handoff_state"],
  compact: ["decision", "behavior_delta", "allowed_scope", "forbidden_scope", "proof_obligation", "evidence"],
};
const EXECUTION_ENVELOPE_PLUGIN_PROJECTION = [
  { canonical: EXECUTION_ENVELOPE_DOC_PATH, packaged: "adapters/claude-code/plugin/contracts/execution-envelope-contract.md" },
  { canonical: LIFECYCLE_TRACEABILITY_CONTRACT_PATH, packaged: "adapters/claude-code/plugin/contracts/lifecycle-traceability-contract.md" },
  { canonical: "schemas/execution-envelope.schema.json", packaged: "adapters/claude-code/plugin/schemas/execution-envelope.schema.json" },
  { canonical: "schemas/metrics-event.schema.json", packaged: "adapters/claude-code/plugin/schemas/metrics-event.schema.json" },
  { canonical: "schemas/review-signal-gate-map.json", packaged: "adapters/claude-code/plugin/contracts/review-signal-gate-map.json" },
];
const REVIEW_SIGNAL_GATE_REQUIREMENTS = {
  "review-domain-impact": ["business_rule_change", "workflow_responsibility_change", "permission_change", "notification_change", "reporting_meaning_change", "state_semantics_change", "generated_business_text_change"],
  "review-architecture-impact": ["public_api_change", "public_contract_change", "dependency_direction_change", "persistence_boundary_change", "state_ownership_change", "cross_module_responsibility_change", "infrastructure_change", "deployment_change", "lifecycle_boundary_change", "coupling_change", "boundary_weakness", "hard_to_reverse_boundary"],
  "review-output-quality": ["ui_change", "docs_output_change", "report_output_change", "notification_output_change", "cli_output_change", "api_response_change", "generated_text_change", "generated_output_change", "ai_output_change", "ai_facing_output_change", "structured_output_change", "consumer_facing_wording_change"],
  "review-adversarial-risk": ["untrusted_input", "security_impact", "privacy_impact", "prompt_failure_mode", "generated_output_failure_mode", "critical_workflow_blast_radius", "misuse_path", "release_readiness_risk", "safety_boundary_uncertainty"],
  "review-code-health": ["technical_debt", "code_smell", "duplication", "dead_code", "maintainability_risk", "testability_risk", "performance_risk", "dependency_tooling_risk", "boundary_weakness", "repeated_finding"],
  "risk-gate": ["destructive_action", "external_effect", "auth_change", "secret_change", "production_change", "dependency_change", "migration_change", "billing_change", "email_change", "infrastructure_change", "deployment_change"],
  "adr-review": ["architecture_decision", "hard_to_reverse_boundary"],
  "release-readiness-gate": ["release_readiness", "release_candidate"],
};
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
  "spec-driven-development -> work-package-compiler when packaging is needed -> test-first-verification for reusable Verification Contract -> controlled-implementation -> test-first-verification for evidence",
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
const SKILL_PLANES = ["execution", "knowledge", "control"];
const SKILL_PLANE_SET = new Set(SKILL_PLANES);
const REQUIRED_PROJECTION_PACKS = ["daily_delivery", "organizational_intelligence"];
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

function validatePlaneModel(root, manifest, errors) {
  const checks = { assignments: {}, projectionPacks: [], crossPlaneTransitions: [], capabilityGate: false };
  if (!manifest) return checks;

  const manifestSkills = Array.isArray(manifest.skills) ? manifest.skills : [];
  const manifestSkillSet = new Set(manifestSkills);
  const assignments = manifest.skill_planes;
  if (!assignments || Array.isArray(assignments) || typeof assignments !== "object") {
    fail(errors, "skill planes", "manifest.json.skill_planes must exist and be an object");
  } else {
    for (const [skill, plane] of Object.entries(assignments)) {
      if (!manifestSkillSet.has(skill)) {
        fail(errors, "skill planes", `manifest.json.skill_planes contains unknown skill '${skill}'`);
      }
      if (!SKILL_PLANE_SET.has(plane)) {
        fail(errors, "skill planes", `manifest.json.skill_planes.${skill} has invalid plane '${plane}'`);
      } else {
        checks.assignments[plane] = (checks.assignments[plane] ?? 0) + 1;
      }
    }
    for (const skill of manifestSkills) {
      if (!Object.hasOwn(assignments, skill)) {
        fail(errors, "skill planes", `manifest.json.skills entry '${skill}' is not assigned to a plane`);
      }
    }
  }

  const packs = manifest.projection_packs;
  if (!packs || Array.isArray(packs) || typeof packs !== "object") {
    fail(errors, "projection packs", "manifest.json.projection_packs must exist and be an object");
    return checks;
  }
  for (const name of Object.keys(packs)) {
    if (!REQUIRED_PROJECTION_PACKS.includes(name)) {
      fail(errors, "projection packs", `manifest.json.projection_packs contains unsupported pack '${name}'`);
    }
  }
  for (const name of REQUIRED_PROJECTION_PACKS) {
    const pack = packs[name];
    const label = `manifest.json.projection_packs.${name}`;
    if (!pack || Array.isArray(pack) || typeof pack !== "object") {
      fail(errors, "projection packs", `${label} must exist and be an object`);
      continue;
    }
    const planes = Array.isArray(pack.planes) ? pack.planes : [];
    const skills = Array.isArray(pack.skills) ? pack.skills : [];
    if (typeof pack.description !== "string" || pack.description.length === 0) {
      fail(errors, "projection packs", `${label}.description must be a non-empty string`);
    }
    if (!Array.isArray(pack.planes) || planes.some((plane) => !SKILL_PLANE_SET.has(plane))) {
      fail(errors, "projection packs", `${label}.planes must contain only execution, knowledge, or control`);
    }
    if (!Array.isArray(pack.skills)) {
      fail(errors, "projection packs", `${label}.skills must be an array`);
    }
    if (pack.knowledge_write_policy !== "explicit_only") {
      fail(errors, "projection packs", `${label}.knowledge_write_policy must be explicit_only`);
    }
    const duplicateSkills = skills.filter((skill, index) => skills.indexOf(skill) !== index);
    if (duplicateSkills.length > 0) {
      fail(errors, "projection packs", `${label}.skills contains duplicate entries: ${[...new Set(duplicateSkills)].join(", ")}`);
    }
    for (const skill of skills) {
      if (!manifestSkillSet.has(skill)) {
        fail(errors, "projection packs", `${label}.skills references unknown skill '${skill}'`);
        continue;
      }
      const plane = assignments?.[skill];
      if (SKILL_PLANE_SET.has(plane) && !planes.includes(plane)) {
        fail(errors, "projection packs", `${label} includes '${skill}' but does not declare plane '${plane}'`);
      }
    }
    if (name === "daily_delivery" && planes.includes("knowledge")) {
      fail(errors, "projection packs", `${label} must omit the knowledge plane`);
    }
    if (name === "organizational_intelligence") {
      const missing = manifestSkills.filter((skill) => !skills.includes(skill));
      if (missing.length > 0) {
        fail(errors, "projection packs", `${label} must include every manifest skill; missing: ${missing.join(", ")}`);
      }
      for (const plane of SKILL_PLANES) {
        if (!planes.includes(plane)) fail(errors, "projection packs", `${label}.planes must include '${plane}'`);
      }
    }
    checks.projectionPacks.push({ name, planes, skillCount: skills.length });
  }

  const transitions = manifest.routing?.cross_plane_transitions;
  if (!Array.isArray(transitions)) {
    fail(errors, "skill planes", "manifest.json.routing.cross_plane_transitions must be an array");
    return checks;
  }
  const transitionIds = new Set();
  for (const [index, transition] of transitions.entries()) {
    const label = `manifest.json.routing.cross_plane_transitions[${index}]`;
    if (!transition || Array.isArray(transition) || typeof transition !== "object") {
      fail(errors, "skill planes", `${label} must be an object`);
      continue;
    }
    if (typeof transition.id !== "string" || transition.id.length === 0 || transitionIds.has(transition.id)) {
      fail(errors, "skill planes", `${label}.id must be a unique non-empty string`);
    } else transitionIds.add(transition.id);
    for (const field of ["from", "to"]) {
      if (!SKILL_PLANE_SET.has(transition[field])) fail(errors, "skill planes", `${label}.${field} must be a valid plane`);
    }
    if (transition.from === transition.to) {
      fail(errors, "skill planes", `${label} must cross between different planes`);
    }
    for (const field of ["trigger", "evidence_boundary", "owner", "stop_condition"]) {
      if (typeof transition[field] !== "string" || transition[field].length === 0) {
        fail(errors, "skill planes", `${label}.${field} must be a non-empty string`);
      }
    }
    validateRouteReference(root, manifest, transition.destination, `${label}.destination`, errors);
    if (manifestSkillSet.has(transition.destination) && assignments?.[transition.destination] !== transition.to) {
      fail(errors, "skill planes", `${label}.destination '${transition.destination}' belongs to '${assignments?.[transition.destination] ?? "unassigned"}', not '${transition.to}'`);
    }
    checks.crossPlaneTransitions.push(transition.id ?? `index:${index}`);
  }
  if (manifest.name === "agent-spectrum-kernel") {
    const routerPaths = ["skills/operating-mode-router/SKILL.md", "skills/skill-router/SKILL.md"];
    checks.capabilityGate = routerPaths.every((path) => {
      const text = existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), "utf8") : "";
      return text.includes("selected_skills") && text.includes("capability_missing") && text.includes("organizational") && (text.includes("Do not infer") || text.includes("Never infer"));
    });
    if (!checks.capabilityGate) {
      fail(errors, "skill planes", "entry routers must fail closed with capability_missing when selected_skills omits a route");
    }
    if (transitions.length === 0) fail(errors, "skill planes", "canonical routing must define cross-plane transitions");
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
    adapterCapabilityGate: false,
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
  validateRoutingCapabilityGate(routing, checks, errors);
  validateRoutingRiskGate(root, manifest, routing, checks, errors);
  validateRoutingOverride(routing, checks, errors);
  validateRoutingAdapterDowngrade(root, routing, checks, errors);

  return checks;
}

function validateRoutingCapabilityGate(routing, checks, errors) {
  const gate = routing.adapter_capability_gate;
  const expectedPaths = [".agent-spectrum-kernel/claude-install-state.json", ".agent-spectrum-kernel/codex-install-state.json"];
  checks.adapterCapabilityGate = Boolean(
    gate &&
    Array.isArray(gate.state_paths) && expectedPaths.every((path) => gate.state_paths.includes(path)) &&
    gate.availability_field === "selected_skills" &&
    gate.physical_discovery_field === "installed_skills" &&
    gate.missing_status === "capability_missing" &&
    gate.missing_route_policy === "stop_without_inference" &&
    gate.daily_upgrade_profile === "organizational"
  );
  if (!checks.adapterCapabilityGate) {
    fail(errors, "routing manifest", "manifest.json.routing.adapter_capability_gate must fail closed from adapter selected_skills and distinguish installed_skills");
  }
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
    const matches = canonicalPresent && packagedPresent && (canonical.endsWith(".json")
      ? JSON.stringify(JSON.parse(readFileSync(canonicalPath, "utf8"))) === JSON.stringify(JSON.parse(readFileSync(packagedPath, "utf8")))
      : readFileSync(canonicalPath, "utf8") === readFileSync(packagedPath, "utf8"));
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

function lifecycleValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function inspectLifecycleScenario(scenario) {
  const issues = [];
  const artifacts = Array.isArray(scenario.artifacts) ? scenario.artifacts : [];
  const seen = new Map();
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") {
      issues.push("artifact must be an object");
      continue;
    }
    if (typeof artifact.id !== "string" || artifact.id.length === 0) issues.push("artifact is missing id");
    if (!LIFECYCLE_ARTIFACT_TYPES.includes(artifact.type)) {
      issues.push(`${artifact.id ?? "artifact"} has unknown type ${artifact.type}`);
      continue;
    }
    if (seen.has(artifact.id)) issues.push(`duplicate artifact id ${artifact.id}`);
    const refs = Array.isArray(artifact.upstream_refs) ? artifact.upstream_refs : [];
    for (const ref of refs) {
      if (!seen.has(ref)) issues.push(`${artifact.id} references missing or downstream artifact ${ref}`);
    }

    const fieldSource = artifact.type === "compact" ? artifact.boundaries : artifact.fields;
    const fields = fieldSource && typeof fieldSource === "object" && !Array.isArray(fieldSource) ? fieldSource : {};
    if (artifact.type === "compact") {
      if (!Array.isArray(artifact.upstream_refs)) issues.push(`${artifact.id} compact artifact requires upstream_refs`);
      if (!Array.isArray(artifact.deltas)) issues.push(`${artifact.id} compact artifact requires deltas`);
    }
    const missing = LIFECYCLE_REQUIRED_FIELDS[artifact.type].filter((field) => !Object.hasOwn(fields, field));
    if (missing.length > 0) issues.push(`${artifact.id} is missing required ${artifact.type} fields: ${missing.join(", ")}`);

    const inheritedByField = new Map();
    for (const ref of refs) {
      const upstream = seen.get(ref);
      if (!upstream) continue;
      for (const [field, value] of Object.entries(upstream.effectiveFields)) {
        const values = inheritedByField.get(field) ?? [];
        values.push({ ref, value });
        inheritedByField.set(field, values);
      }
    }
    const effectiveFields = {};
    const conflictingFields = new Map();
    for (const [field, values] of inheritedByField) {
      const distinct = [];
      for (const entry of values) {
        if (!distinct.some((candidate) => lifecycleValuesEqual(candidate.value, entry.value))) distinct.push(entry);
      }
      if (distinct.length === 1) effectiveFields[field] = distinct[0].value;
      else conflictingFields.set(field, values);
    }

    const deltas = Array.isArray(artifact.deltas) ? artifact.deltas : [];
    for (const [field, values] of conflictingFields) {
      const conflictRefs = [...new Set(values.map(({ ref }) => ref))].sort();
      const resolvingDelta = deltas.find((delta) => {
        const supersedes = Array.isArray(delta.supersedes_refs) ? [...new Set(delta.supersedes_refs)].sort() : [];
        return delta.field === field && conflictRefs.every((ref) => supersedes.includes(ref));
      });
      if (!resolvingDelta) issues.push(`conflicting upstream field ${field} requires an explicit superseding delta for ${conflictRefs.join(", ")}`);
    }

    for (const [field, value] of Object.entries(fields)) {
      if (!LIFECYCLE_FIELD_OWNERS[artifact.type].includes(field)) {
        issues.push(`${artifact.type} cannot own ${field}`);
      }
      for (const ref of refs) {
        const upstream = seen.get(ref);
        if (upstream && Object.hasOwn(upstream.effectiveFields, field) && !lifecycleValuesEqual(upstream.effectiveFields[field], value)) {
          const hasDelta = deltas.some((delta) => delta.target_ref === ref && delta.field === field && lifecycleValuesEqual(delta.to, value));
          if (!hasDelta) issues.push(`changed upstream field ${field} requires an explicit delta`);
        }
      }
    }

    for (const delta of deltas) {
      const upstream = seen.get(delta.target_ref);
      if (!upstream || !refs.includes(delta.target_ref)) {
        issues.push(`${artifact.id} delta target ${delta.target_ref} is not an upstream ref`);
        continue;
      }
      if (!Object.hasOwn(upstream.effectiveFields, delta.field)) issues.push(`${artifact.id} delta field ${delta.field} is absent from effective ${delta.target_ref}`);
      if (!lifecycleValuesEqual(upstream.effectiveFields[delta.field], delta.from)) issues.push(`${artifact.id} delta from value does not match effective ${delta.target_ref}.${delta.field}`);
      for (const field of ["to", "reason", "decision_evidence"]) {
        if (!Object.hasOwn(delta, field) || delta[field] === "") issues.push(`${artifact.id} delta ${delta.field} is missing ${field}`);
      }
      if (Array.isArray(delta.supersedes_refs)) {
        for (const ref of delta.supersedes_refs) {
          if (!refs.includes(ref)) issues.push(`${artifact.id} delta supersedes non-upstream ref ${ref}`);
        }
      }
      if (LIFECYCLE_FIELD_OWNERS.requirement.includes(delta.field) && !/^Human-confirmed:|^Authoritative:/.test(delta.decision_evidence ?? "")) {
        issues.push(`${artifact.id} changes Requirement-owned ${delta.field} without authoritative decision evidence`);
      }
      effectiveFields[delta.field] = delta.to;
    }
    for (const [field, value] of Object.entries(fields)) effectiveFields[field] = value;
    seen.set(artifact.id, { ...artifact, fields, effectiveFields });
  }
  return issues;
}

function validateLifecycleArtifactContract(root, manifest, errors) {
  const active = manifest?.name === "agent-spectrum-kernel";
  const checks = { active, contractPresent: false, fixturePresent: false, skills: [], adapters: [], scenarios: [] };
  if (!active) return checks;

  checks.contractPresent = existsSync(resolve(root, LIFECYCLE_ARTIFACT_CONTRACT_PATH));
  checks.fixturePresent = existsSync(resolve(root, LIFECYCLE_ARTIFACT_FIXTURE_PATH));
  if (!checks.contractPresent) fail(errors, "lifecycle artifact contract", `canonical contract is missing: ${LIFECYCLE_ARTIFACT_CONTRACT_PATH}`);
  if (!checks.fixturePresent) fail(errors, "lifecycle artifact contract", `fixture is missing: ${LIFECYCLE_ARTIFACT_FIXTURE_PATH}`);
  if (!manifest?.docs?.includes(LIFECYCLE_ARTIFACT_CONTRACT_PATH) || !manifest?.docs?.includes(LIFECYCLE_ARTIFACT_FIXTURE_PATH)) {
    fail(errors, "lifecycle artifact contract", "manifest.json.docs must list the canonical contract and lifecycle fixture");
  }
  if (!checks.contractPresent || !checks.fixturePresent) return checks;

  const contract = readFileSync(resolve(root, LIFECYCLE_ARTIFACT_CONTRACT_PATH), "utf8");
  for (const phrase of ["reference plus delta", "Requirement Contract", "Spec", "Work Package", "Verification Contract", "Implementation Contract", "Required fields", "Conditional fields", "Compact artifact", "effective field map", "supersedes_refs", "Contradictory"]) {
    if (!contract.toLowerCase().includes(phrase.toLowerCase())) fail(errors, "lifecycle artifact contract", `${LIFECYCLE_ARTIFACT_CONTRACT_PATH} is missing ${phrase}`);
  }
  for (const path of LIFECYCLE_ARTIFACT_SKILL_PATHS) {
    const text = existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), "utf8") : "";
    const referencesContract = text.includes(LIFECYCLE_ARTIFACT_CONTRACT_PATH);
    const forbiddenDuplicateSections = path === "skills/test-first-verification/SKILL.md" ? ["Not verified:", "Next verification:"] : [];
    const duplicates = forbiddenDuplicateSections.filter((section) => new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m").test(text));
    const ok = referencesContract && duplicates.length === 0;
    checks.skills.push({ path, referencesContract, duplicates, ok });
    if (!referencesContract) fail(errors, "lifecycle artifact contract", `${path} must reference ${LIFECYCLE_ARTIFACT_CONTRACT_PATH}`);
    if (duplicates.length > 0) fail(errors, "lifecycle artifact contract", `${path} duplicates verification evidence or next-action sections: ${duplicates.join(", ")}`);
  }
  for (const path of LIFECYCLE_ARTIFACT_ADAPTER_PATHS) {
    const text = existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), "utf8") : "";
    const referencesContract = text.includes(LIFECYCLE_ARTIFACT_CONTRACT_PATH);
    const forbiddenDuplicateSections = path === "adapters/codex/prompts/skill-implement.md"
      ? ["Changed:", "Verified:", "Not verified:", "Risks / assumptions:", "Next:"]
      : path === "adapters/codex/prompts/skill-verify.md"
        ? ["Not verified:", "Next verification:"]
        : [];
    const requiredHeaderPhrases = path.endsWith("skill-implement.md")
      ? ["Artifact ID", "Artifact type: implementation", "Upstream refs"]
      : path.endsWith("skill-verify.md")
        ? ["Artifact ID", "Artifact type: verification", "Upstream refs"]
        : [];
    const duplicates = forbiddenDuplicateSections.filter((section) => new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m").test(text));
    const missingHeaders = requiredHeaderPhrases.filter((phrase) => !text.includes(phrase));
    const ok = referencesContract && duplicates.length === 0 && missingHeaders.length === 0;
    checks.adapters.push({ path, referencesContract, duplicates, missingHeaders, ok });
    if (!referencesContract) fail(errors, "lifecycle artifact contract", `${path} must reference ${LIFECYCLE_ARTIFACT_CONTRACT_PATH}`);
    if (duplicates.length > 0) fail(errors, "lifecycle artifact contract", `${path} duplicates lifecycle or next-action output sections: ${duplicates.join(", ")}`);
    if (missingHeaders.length > 0) fail(errors, "lifecycle artifact contract", `${path} is missing canonical artifact header fields: ${missingHeaders.join(", ")}`);
  }

  let fixture;
  try {
    fixture = JSON.parse(readFileSync(resolve(root, LIFECYCLE_ARTIFACT_FIXTURE_PATH), "utf8"));
  } catch (error) {
    fail(errors, "lifecycle artifact contract", `${LIFECYCLE_ARTIFACT_FIXTURE_PATH} is not valid JSON: ${error.message}`);
    return checks;
  }
  const requiredScenarios = new Set(["complete", "partial", "compact", "changed-assumption", "contradictory", "conflicting-upstreams", "consecutive-deltas", "superseding-upstreams"]);
  for (const scenario of fixture.scenarios ?? []) {
    requiredScenarios.delete(scenario.id);
    const issues = inspectLifecycleScenario(scenario);
    const expectedErrors = Array.isArray(scenario.expected_errors) ? scenario.expected_errors : [];
    const ok = scenario.expected === "valid"
      ? issues.length === 0
      : scenario.expected === "invalid" && issues.length > 0 && expectedErrors.every((expected) => issues.includes(expected));
    checks.scenarios.push({ id: scenario.id, expected: scenario.expected, issues, ok });
    if (!ok) fail(errors, "lifecycle artifact contract", `scenario ${scenario.id} did not match expectation: ${issues.join("; ") || "no issues"}`);
  }
  if (requiredScenarios.size > 0) fail(errors, "lifecycle artifact contract", `missing scenarios: ${[...requiredScenarios].join(", ")}`);
  return checks;
}

function traceRefLabel(ref) {
  if (!ref || typeof ref !== "object") return "invalid-ref";
  const revision = Number.isInteger(ref.observed_revision) ? `@${ref.observed_revision}` : "";
  return `${ref.artifact_id ?? "missing-artifact"}${revision}${ref.item_id ? `#${ref.item_id}` : ""}`;
}

export function inspectTraceabilityScenarioResult(scenario) {
  const issues = [];
  const gaps = [];
  const artifacts = Array.isArray(scenario.artifacts) ? scenario.artifacts : [];
  const claims = Array.isArray(scenario.claims) ? scenario.claims : [];
  const exemption = scenario.exemption;
  if (exemption !== undefined) {
    if (exemption?.kind !== "trivial_localized" || typeof exemption.reason !== "string" || !exemption.reason || typeof exemption.source_ref !== "string" || !exemption.source_ref) {
      issues.push("traceability exemption requires kind trivial_localized, reason, and source_ref");
    }
    const observedFacts = Array.isArray(exemption?.observed_facts) ? exemption.observed_facts : [];
    const observedSignals = new Set(observedFacts.filter((fact) => fact && typeof fact.evidence === "string" && fact.evidence).map((fact) => fact.signal));
    const missingFacts = TRACEABILITY_EXEMPTION_FACTS.filter((signal) => !observedSignals.has(signal));
    if (missingFacts.length > 0) issues.push(`traceability exemption requires observed facts: ${missingFacts.join(", ")}`);
    if (artifacts.length > 0) issues.push("traceability exemption cannot be combined with lifecycle trace artifacts");
    if (claims.length > 0) issues.push("traceability exemption cannot be combined with completion, merge, or release claims");
    const requiredGates = Array.isArray(scenario.required_gates) ? scenario.required_gates : [];
    if (requiredGates.length > 0) issues.push(`traceability exemption cannot bypass required gates: ${requiredGates.join(", ")}`);
  }

  const artifactById = new Map();
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") {
      issues.push("traceability artifact must be an object");
      continue;
    }
    if (typeof artifact.id !== "string" || !artifact.id) {
      issues.push("traceability artifact is missing id");
      continue;
    }
    if (artifactById.has(artifact.id)) issues.push(`duplicate traceability artifact id ${artifact.id}`);
    if (!Object.hasOwn(TRACEABILITY_ARTIFACT_ITEM_KINDS, artifact.type)) issues.push(`${artifact.id} has unknown traceability type ${artifact.type}`);
    if (!Number.isInteger(artifact.revision) || artifact.revision < 1) issues.push(`${artifact.id} requires a positive integer revision`);
    const itemById = new Map();
    for (const item of Array.isArray(artifact.items) ? artifact.items : []) {
      if (!item || typeof item.id !== "string" || !item.id) {
        issues.push(`${artifact.id} has an item without id`);
        continue;
      }
      if (itemById.has(item.id)) issues.push(`${artifact.id} has duplicate item id ${item.id}`);
      if (!(TRACEABILITY_ARTIFACT_ITEM_KINDS[artifact.type] ?? []).includes(item.kind)) issues.push(`${artifact.id}#${item.id} has invalid kind ${item.kind}`);
      if (item.kind === "accepted_risk" && (!item.accepted_by || !item.accepted_stage)) issues.push(`${artifact.id}#${item.id} accepted risk requires accepted_by and accepted_stage`);
      itemById.set(item.id, item);
    }
    artifactById.set(artifact.id, { ...artifact, itemById });
  }

  function resolveTraceRef(owner, field, ref, { requireItem = false, reportResolutionIssues = true } = {}) {
    const result = { ref, label: traceRefLabel(ref), structureValid: false, artifact: null, item: null, current: false };
    if (typeof ref === "string") {
      issues.push(`${owner} ${field} contains unversioned reference ${ref}`);
      return result;
    }
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
      issues.push(`${owner} ${field} contains malformed reference`);
      return result;
    }
    if (typeof ref.artifact_id !== "string" || !ref.artifact_id.trim()) {
      issues.push(`${owner} ${field} contains malformed artifact_id`);
      return result;
    }
    if (!Object.hasOwn(ref, "observed_revision")) {
      issues.push(`${owner} ${field} contains reference without observed_revision`);
      return result;
    }
    if (!Number.isInteger(ref.observed_revision) || ref.observed_revision < 1) {
      issues.push(`${owner} ${field} requires positive observed_revision`);
      return result;
    }
    if (requireItem && (typeof ref.item_id !== "string" || !ref.item_id.trim())) {
      issues.push(`${owner} ${field} requires non-empty item_id`);
      return result;
    }
    if (ref.item_id !== undefined && (typeof ref.item_id !== "string" || !ref.item_id.trim())) {
      issues.push(`${owner} ${field} contains malformed item_id`);
      return result;
    }
    result.structureValid = true;
    result.artifact = artifactById.get(ref.artifact_id) ?? null;
    if (!result.artifact) {
      if (reportResolutionIssues) issues.push(`${owner} ${field} references missing artifact ${ref.artifact_id}`);
      return result;
    }
    result.current = ref.observed_revision === result.artifact.revision;
    if (!result.current && reportResolutionIssues) {
      issues.push(`${owner} ${field} references stale ${ref.artifact_id}@${ref.observed_revision}; current revision is ${result.artifact.revision}`);
    }
    result.item = ref.item_id ? result.artifact.itemById.get(ref.item_id) ?? null : null;
    if (ref.item_id && !result.item && reportResolutionIssues) issues.push(`${owner} ${field} references missing item ${result.label}`);
    return result;
  }

  function inspectRefs(owner, field, refs, { requireItem = false } = {}) {
    if (!Array.isArray(refs)) {
      issues.push(`${owner} ${field} must be an array`);
      return [];
    }
    const hasStructured = refs.some((ref) => ref && typeof ref === "object" && !Array.isArray(ref));
    const hasUnversioned = refs.some((ref) => typeof ref === "string");
    if (hasStructured && hasUnversioned) issues.push(`${owner} ${field} cannot mix structured and unversioned refs`);
    return refs.map((ref) => resolveTraceRef(owner, field, ref, { requireItem }));
  }

  function itemRefKey(ref) {
    return JSON.stringify([ref.artifact_id, ref.observed_revision, ref.item_id]);
  }

  function itemRefReaches(startRef, requiredRef) {
    if (!startRef?.item_id || !requiredRef?.item_id) return false;
    if (itemRefKey(startRef) === itemRefKey(requiredRef)) return true;
    const visited = new Set();
    const queue = [startRef];
    while (queue.length > 0) {
      const currentRef = queue.shift();
      const currentKey = itemRefKey(currentRef);
      if (visited.has(currentKey)) continue;
      visited.add(currentKey);
      const artifact = artifactById.get(currentRef.artifact_id);
      if (!artifact || currentRef.observed_revision !== artifact.revision) continue;
      const item = artifact.itemById.get(currentRef.item_id);
      const upstreamRefs = item?.upstream_refs
        ?? (artifact.type === "evidence" && artifact.itemById.size === 1 ? artifact.upstream_refs : []);
      for (const upstreamRef of upstreamRefs) {
        if (!upstreamRef || typeof upstreamRef !== "object" || Array.isArray(upstreamRef)) continue;
        const upstreamArtifact = artifactById.get(upstreamRef.artifact_id);
        if (!upstreamArtifact || upstreamRef.observed_revision !== upstreamArtifact.revision || !upstreamRef.item_id || !upstreamArtifact.itemById.has(upstreamRef.item_id)) continue;
        if (itemRefKey(upstreamRef) === itemRefKey(requiredRef)) return true;
        queue.push(upstreamRef);
      }
    }
    return false;
  }

  function evidenceReachesRequired(evidenceResolution, requiredRef) {
    return evidenceResolution?.structureValid && evidenceResolution.current && evidenceResolution.item
      ? itemRefReaches(evidenceResolution.ref, requiredRef)
      : false;
  }

  function subjectConnectsRequired(subjectResolution, requiredResolution, claimType) {
    if (!subjectResolution?.item || !requiredResolution?.item || !subjectResolution.current || !requiredResolution.current) return false;
    if (itemRefKey(subjectResolution.ref) === itemRefKey(requiredResolution.ref)) return true;
    if (
      claimType === "release"
      && subjectResolution.artifact.type === "release_readiness"
      && requiredResolution.artifact.id === subjectResolution.artifact.id
      && ["approval", "rollback"].includes(requiredResolution.item.kind)
    ) return true;
    return itemRefReaches(subjectResolution.ref, requiredResolution.ref) || itemRefReaches(requiredResolution.ref, subjectResolution.ref);
  }

  function subjectKindAllowed(claimType, resolution) {
    if (!resolution?.artifact || !resolution.item) return false;
    if (claimType === "completion") {
      return (resolution.artifact.type === "spec" && ["behavior", "acceptance"].includes(resolution.item.kind))
        || (resolution.artifact.type === "work_package" && resolution.item.kind === "task");
    }
    if (claimType === "merge") return resolution.artifact.type === "implementation" && resolution.item.kind === "change";
    if (claimType === "release") return resolution.artifact.type === "release_readiness" && resolution.item.kind === "check";
    return false;
  }

  for (const artifact of artifactById.values()) {
    inspectRefs(artifact.id, "upstream_refs", artifact.upstream_refs);
    for (const item of artifact.itemById.values()) {
      if (item.upstream_refs !== undefined) inspectRefs(`${artifact.id}#${item.id}`, "upstream_refs", item.upstream_refs, { requireItem: true });
    }
  }

  const claimById = new Map();
  const claimsBySubject = new Map();
  for (const claim of claims) {
    if (!claim || typeof claim.id !== "string" || !claim.id) {
      issues.push("traceability claim is missing id");
      continue;
    }
    if (claimById.has(claim.id)) issues.push(`duplicate traceability claim id ${claim.id}`);
    if (!["completion", "merge", "release"].includes(claim.type)) issues.push(`${claim.id} has invalid claim type ${claim.type}`);
    if (!["supported", "blocked", "insufficient_evidence"].includes(claim.status)) issues.push(`${claim.id} has invalid claim status ${claim.status}`);
    const subjectResolutions = inspectRefs(claim.id, "subject_refs", claim.subject_refs, { requireItem: true });
    const evidenceResolutions = inspectRefs(claim.id, "evidence_refs", claim.evidence_refs, { requireItem: true });
    const blockerResolutions = inspectRefs(claim.id, "blocker_refs", claim.blocker_refs, { requireItem: true });
    const acceptedRiskResolutions = inspectRefs(claim.id, "accepted_risk_refs", claim.accepted_risk_refs, { requireItem: true });
    if (!Array.isArray(claim.subject_refs) || claim.subject_refs.length === 0) issues.push(`${claim.id} requires subject_refs`);
    if (claim.status === "supported" && (!Array.isArray(claim.evidence_refs) || claim.evidence_refs.length === 0)) issues.push(`${claim.id} supported claim requires evidence_refs`);
    if (claim.status === "supported" && Array.isArray(claim.blocker_refs) && claim.blocker_refs.length > 0) issues.push(`${claim.id} supported claim cannot retain blocker_refs`);
    if (claim.status === "blocked" && (!Array.isArray(claim.blocker_refs) || claim.blocker_refs.length === 0)) issues.push(`${claim.id} blocked claim requires blocker_refs`);
    for (const resolution of evidenceResolutions) {
      if (resolution.structureValid && resolution.artifact && resolution.current && (!resolution.item || resolution.artifact.type !== "evidence" || resolution.item.kind !== "evidence")) {
        issues.push(`${claim.id} evidence_refs must point to evidence items: ${resolution.label}`);
      }
    }
    for (const resolution of blockerResolutions) {
      if (resolution.structureValid && resolution.artifact && resolution.current && (!resolution.item || resolution.artifact.type !== "review" || resolution.item.kind !== "blocker")) {
        issues.push(`${claim.id} blocker_refs must point to review blocker items: ${resolution.label}`);
      }
    }
    for (const resolution of acceptedRiskResolutions) {
      if (resolution.structureValid && resolution.artifact && resolution.current && (!resolution.item || resolution.artifact.type !== "review" || resolution.item.kind !== "accepted_risk")) {
        issues.push(`${claim.id} accepted_risk_refs must point to accepted_risk items: ${resolution.label}`);
      }
    }

    const allowedGapTypes = TRACEABILITY_CLAIM_GAP_TYPES[claim.type] ?? [];
    const applicableGapTypes = Array.isArray(claim.applicable_gap_types) ? claim.applicable_gap_types : [];
    const notApplicableGapTypes = Array.isArray(claim.not_applicable_gap_types) ? claim.not_applicable_gap_types : [];
    const notApplicableReasons = Array.isArray(claim.not_applicable_reasons) ? claim.not_applicable_reasons : [];
    const declaredGapTypes = [...applicableGapTypes, ...notApplicableGapTypes];
    const invalidGapTypes = declaredGapTypes.filter((gapType) => !allowedGapTypes.includes(gapType));
    const missingGapTypes = allowedGapTypes.filter((gapType) => !declaredGapTypes.includes(gapType));
    const overlappingGapTypes = applicableGapTypes.filter((gapType) => notApplicableGapTypes.includes(gapType));
    if (invalidGapTypes.length > 0) issues.push(`${claim.id} declares invalid gap types: ${[...new Set(invalidGapTypes)].join(", ")}`);
    if (missingGapTypes.length > 0) issues.push(`${claim.id} must classify claim gap types: ${missingGapTypes.join(", ")}`);
    if (overlappingGapTypes.length > 0) issues.push(`${claim.id} gap types cannot be both applicable and not applicable: ${[...new Set(overlappingGapTypes)].join(", ")}`);
    for (const gapType of notApplicableGapTypes) {
      const reason = notApplicableReasons.find((entry) => entry?.gap_type === gapType);
      if (!reason || typeof reason.reason !== "string" || !reason.reason || typeof reason.evidence !== "string" || !reason.evidence) {
        issues.push(`${claim.id} not-applicable ${gapType} requires reason and evidence`);
      }
    }

    const requiredRefs = Array.isArray(claim.required_refs) ? claim.required_refs : [];
    const claimGaps = [];
    const supportGapLabels = new Set();
    const resolvedRequiredRefs = [];
    for (const gapType of applicableGapTypes) {
      const entries = requiredRefs.filter((entry) => entry?.gap_type === gapType);
      if (entries.length === 0) {
        issues.push(`${claim.id} applicable ${gapType} requires exact required_refs item_ref`);
      }
    }
    for (const entry of requiredRefs) {
      if (!entry || !applicableGapTypes.includes(entry.gap_type)) {
        issues.push(`${claim.id} required_refs contains non-applicable gap type ${entry?.gap_type ?? "missing"}`);
        continue;
      }
      const ref = entry.item_ref;
      const field = `required_refs[${entry.gap_type}].item_ref`;
      const resolution = resolveTraceRef(claim.id, field, ref, { requireItem: true, reportResolutionIssues: false });
      if (!resolution.structureValid) continue;
      const kindAllowed = resolution.item && (TRACEABILITY_GAP_ITEM_KINDS[entry.gap_type] ?? []).includes(resolution.item.kind);
      if (!resolution.artifact || !resolution.item || !resolution.current || !kindAllowed) {
        claimGaps.push({ gap_type: entry.gap_type, required_by_claim: claim.id, missing_item_ref: resolution.label, stage: claim.type === "merge" ? "review" : claim.type });
        continue;
      }
      resolvedRequiredRefs.push({ entry, resolution });
      if (["acceptance", "verification"].includes(entry.gap_type) && !evidenceResolutions.some((evidenceResolution) => evidenceReachesRequired(evidenceResolution, ref))) {
        claimGaps.push({ gap_type: entry.gap_type, required_by_claim: claim.id, missing_item_ref: resolution.label, stage: claim.type === "merge" ? "review" : claim.type });
        supportGapLabels.add(`${entry.gap_type}:${resolution.label}`);
        if (claim.status === "supported") issues.push(`${claim.id} evidence_refs cannot reach required ${entry.gap_type} ${resolution.label}`);
      }
    }
    for (const subjectResolution of subjectResolutions) {
      if (!subjectResolution.structureValid || !subjectResolution.artifact || !subjectResolution.item || !subjectResolution.current) continue;
      if (!subjectKindAllowed(claim.type, subjectResolution)) {
        issues.push(`${claim.id} subject_refs has invalid ${claim.type} subject: ${subjectResolution.label}`);
        continue;
      }
      if (resolvedRequiredRefs.length > 0 && !resolvedRequiredRefs.some(({ resolution }) => subjectConnectsRequired(subjectResolution, resolution, claim.type))) {
        issues.push(`${claim.id} subject_refs are disconnected from required_refs: ${subjectResolution.label}`);
      }
    }
    const validSubjects = subjectResolutions.filter((resolution) => resolution.structureValid && resolution.artifact && resolution.item && resolution.current && subjectKindAllowed(claim.type, resolution));
    for (const { entry, resolution } of resolvedRequiredRefs) {
      if (validSubjects.length > 0 && !validSubjects.some((subjectResolution) => subjectConnectsRequired(subjectResolution, resolution, claim.type))) {
        issues.push(`${claim.id} required_refs[${entry.gap_type}] are disconnected from subject_refs: ${resolution.label}`);
      }
    }
    for (const blockerResolution of blockerResolutions) {
      if (
        blockerResolution.structureValid
        && blockerResolution.artifact?.type === "review"
        && blockerResolution.item?.kind === "blocker"
        && blockerResolution.current
        && validSubjects.length > 0
        && !validSubjects.some((subjectResolution) => subjectConnectsRequired(subjectResolution, blockerResolution, claim.type))
      ) {
        issues.push(`${claim.id} blocker_refs are disconnected from subject_refs: ${blockerResolution.label}`);
      }
    }
    for (const riskResolution of acceptedRiskResolutions) {
      if (
        riskResolution.structureValid
        && riskResolution.artifact?.type === "review"
        && riskResolution.item?.kind === "accepted_risk"
        && riskResolution.current
        && validSubjects.length > 0
        && !validSubjects.some((subjectResolution) => subjectConnectsRequired(subjectResolution, riskResolution, claim.type))
      ) {
        issues.push(`${claim.id} accepted_risk_refs are disconnected from subject_refs: ${riskResolution.label}`);
      }
    }
    for (const gap of claimGaps) {
      gaps.push(gap);
      if (claim.status === "supported" && !supportGapLabels.has(`${gap.gap_type}:${gap.missing_item_ref}`)) issues.push(`${claim.id} supported claim has ${gap.gap_type} gap at ${gap.missing_item_ref}`);
    }
    if (claim.status === "insufficient_evidence" && claimGaps.length === 0) issues.push(`${claim.id} insufficient_evidence claim requires at least one structured gap`);

    const subjectKey = `${claim.type}:${(claim.subject_refs ?? []).map(traceRefLabel).sort().join(",")}`;
    const priorClaims = claimsBySubject.get(subjectKey) ?? [];
    for (const prior of priorClaims) {
      if (prior.status === claim.status) continue;
      const supersedes = new Set(claim.supersedes_claim_refs ?? []);
      if (!supersedes.has(prior.id)) {
        issues.push(`contradictory ${claim.type} claims for ${(claim.subject_refs ?? []).map(traceRefLabel).sort().join(", ")} require supersedes_claim_refs`);
        break;
      }
    }
    priorClaims.push(claim);
    claimsBySubject.set(subjectKey, priorClaims);
    claimById.set(claim.id, claim);
  }
  for (const claim of claims) {
    for (const ref of claim.supersedes_claim_refs ?? []) {
      if (!claimById.has(ref)) issues.push(`${claim.id} supersedes missing claim ${ref}`);
    }
  }
  return { issues, gaps };
}

export function inspectTraceabilityScenario(scenario) {
  return inspectTraceabilityScenarioResult(scenario).issues;
}

function validateLifecycleTraceabilityContract(root, manifest, errors) {
  const active = manifest?.name === "agent-spectrum-kernel";
  const checks = { active, contractPresent: false, fixturePresent: false, skills: [], scenarios: [] };
  if (!active) return checks;
  checks.contractPresent = existsSync(resolve(root, LIFECYCLE_TRACEABILITY_CONTRACT_PATH));
  checks.fixturePresent = existsSync(resolve(root, LIFECYCLE_TRACEABILITY_FIXTURE_PATH));
  if (!checks.contractPresent) fail(errors, "lifecycle traceability", `canonical contract is missing: ${LIFECYCLE_TRACEABILITY_CONTRACT_PATH}`);
  if (!checks.fixturePresent) fail(errors, "lifecycle traceability", `fixture is missing: ${LIFECYCLE_TRACEABILITY_FIXTURE_PATH}`);
  if (!manifest?.docs?.includes(LIFECYCLE_TRACEABILITY_CONTRACT_PATH) || !manifest?.docs?.includes(LIFECYCLE_TRACEABILITY_FIXTURE_PATH)) {
    fail(errors, "lifecycle traceability", "manifest.json.docs must list the traceability contract and fixture");
  }
  if (!checks.contractPresent || !checks.fixturePresent) return checks;
  const contract = readFileSync(resolve(root, LIFECYCLE_TRACEABILITY_CONTRACT_PATH), "utf8");
  for (const phrase of ["Stable reference model", "observed_revision", "Claim record", "insufficient evidence", "Trivial or localized", "observed facts", "never waives", "upstream_refs` remains the canonical", "must not be mixed", "same resolver rules", "collision-free tuple", "multiple items must define", "Completion subjects", "Every resolved required ref", "Every blocker ref", "sibling exception", "must reach the exact required item", "kind is `blocker`", "missing_item_ref: undeclared", "Structured gaps", "accepted_by", "acceptance`, `verification`, `review`, `approval`, and `rollback", "Release Readiness", "No central server"]) {
    if (!contract.toLowerCase().includes(phrase.toLowerCase())) fail(errors, "lifecycle traceability", `${LIFECYCLE_TRACEABILITY_CONTRACT_PATH} is missing ${phrase}`);
  }
  for (const path of TRACEABILITY_SKILL_PATHS) {
    const text = existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), "utf8") : "";
    const referencesContract = text.includes(LIFECYCLE_TRACEABILITY_CONTRACT_PATH);
    checks.skills.push({ path, referencesContract, ok: referencesContract });
    if (!referencesContract) fail(errors, "lifecycle traceability", `${path} must reference ${LIFECYCLE_TRACEABILITY_CONTRACT_PATH}`);
  }
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(resolve(root, LIFECYCLE_TRACEABILITY_FIXTURE_PATH), "utf8"));
  } catch (error) {
    fail(errors, "lifecycle traceability", `${LIFECYCLE_TRACEABILITY_FIXTURE_PATH} is not valid JSON: ${error.message}`);
    return checks;
  }
  const requiredScenarios = new Set([
    "complete-implementation-to-review",
    "complete-review-to-release",
    "partial-no-claim",
    "partial-completion-claim-missing-verification",
    "partial-merge-claim-missing-review",
    "intentionally-skipped-trivial",
    "trivial-exemption-with-release-claim",
    "trivial-exemption-with-required-gate",
    "trivial-exemption-without-observed-facts",
    "release-exact-gaps",
    "release-gap-acceptance-negative",
    "release-gap-verification-negative",
    "release-gap-review-negative",
    "release-gap-approval-negative",
    "release-gap-rollback-negative",
    "mixed-reference-formats",
    "revision-omitted-ref",
    "disconnected-evidence",
    "required-ref-revision-omitted",
    "required-ref-string",
    "subject-ref-revision-omitted",
    "blocker-ref-revision-omitted",
    "release-required-ref-omitted",
    "wrong-kind-blocker-ref",
    "evidence-item-cross-contamination",
    "subject-required-disconnected",
    "merge-unrelated-review-required",
    "typed-blocker-unrelated-subject",
    "release-unrelated-review-required",
    "item-key-collision",
    "stale-reference",
    "contradictory-claims",
  ]);
  for (const scenario of fixture.scenarios ?? []) {
    requiredScenarios.delete(scenario.id);
    const { issues, gaps } = inspectTraceabilityScenarioResult(scenario);
    const expectedErrors = Array.isArray(scenario.expected_errors) ? scenario.expected_errors : [];
    const issueExpectationOk = scenario.expected === "valid"
      ? issues.length === 0
      : scenario.expected === "invalid" && issues.length > 0 && expectedErrors.every((expected) => issues.includes(expected));
    const gapsOk = lifecycleValuesEqual(gaps, scenario.expected_gaps ?? []);
    const ok = issueExpectationOk && gapsOk;
    checks.scenarios.push({ id: scenario.id, expected: scenario.expected, issues, gaps, ok });
    if (!ok) fail(errors, "lifecycle traceability", `scenario ${scenario.id} did not match expectation: issues=${issues.join("; ") || "none"}; gaps=${JSON.stringify(gaps)}`);
  }
  if (requiredScenarios.size > 0) fail(errors, "lifecycle traceability", `missing scenarios: ${[...requiredScenarios].join(", ")}`);
  return checks;
}

function validateReviewSignalRegistry(root, manifest, errors) {
  const path = "schemas/review-signal-gate-map.json";
  const absolutePath = resolve(root, path);
  const active = manifest?.name === "agent-spectrum-kernel";
  const checks = { active, present: existsSync(absolutePath), schemaListed: manifest?.schemas?.includes(path) === true, gates: false, signals: false, coverage: false, pluginProjection: false };
  if (!active) {
    return checks;
  }
  if (!checks.present) {
    fail(errors, "review signal registry", `canonical registry is missing: ${path}`);
    return checks;
  }
  if (!checks.schemaListed) {
    fail(errors, "review signal registry", `manifest.json.schemas must list ${path}`);
  }
  let registry;
  try {
    registry = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(errors, "review signal registry", `${path} is not valid JSON: ${error.message}`);
    return checks;
  }
  const heavyGates = Array.isArray(registry.heavy_gates) ? registry.heavy_gates : [];
  const signalToGates = registry.signal_to_gates && typeof registry.signal_to_gates === "object" ? registry.signal_to_gates : {};
  checks.gates = heavyGates.length === Object.keys(REVIEW_SIGNAL_GATE_REQUIREMENTS).length
    && heavyGates.every((gate) => Object.hasOwn(REVIEW_SIGNAL_GATE_REQUIREMENTS, gate));
  if (!checks.gates) {
    fail(errors, "review signal registry", `${path}.heavy_gates must contain the canonical heavy gate set`);
  }
  checks.signals = Object.entries(signalToGates).every(([signal, gates]) => typeof signal === "string" && signal.length > 0 && Array.isArray(gates) && gates.length > 0 && gates.every((gate) => heavyGates.includes(gate)));
  if (!checks.signals) {
    fail(errors, "review signal registry", `${path}.signal_to_gates contains an empty, unknown, or invalid mapping`);
  }
  const missingCoverage = Object.entries(REVIEW_SIGNAL_GATE_REQUIREMENTS).flatMap(([gate, signals]) => signals.filter((signal) => !Array.isArray(signalToGates[signal]) || !signalToGates[signal].includes(gate)));
  checks.coverage = missingCoverage.length === 0;
  if (!checks.coverage) {
    fail(errors, "review signal registry", `${path} is missing router trigger coverage: ${missingCoverage.join(", ")}`);
  }
  const pluginPath = "adapters/claude-code/plugin/contracts/review-signal-gate-map.json";
  const pluginAbsolutePath = resolve(root, pluginPath);
  if (!existsSync(pluginAbsolutePath)) {
    fail(errors, "review signal registry", `Claude plugin registry projection is missing: ${pluginPath}`);
  } else {
    try {
      const pluginRegistry = JSON.parse(readFileSync(pluginAbsolutePath, "utf8"));
      checks.pluginProjection = JSON.stringify(pluginRegistry) === JSON.stringify(registry);
    } catch {
      checks.pluginProjection = false;
    }
    if (!checks.pluginProjection) {
      fail(errors, "review signal registry", `Claude plugin registry projection must match ${path}: ${pluginPath}`);
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
      resolvesSkillAssets: false,
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
  checks.coreInstaller.alwaysOwnsImmutableContracts = text.includes("CORE_IMMUTABLE_CONTRACT_ASSETS") && text.includes("immutable_contract");

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
  checks.codexInstaller.projectsLifecycleContract = text.includes("docs/lifecycle-artifact-contract.md") && text.includes("requiredAssetsForPrompts");
  checks.codexInstaller.resolvesSkillOnlyAssets = text.includes("requiredAssetsForSkills") && text.includes("CORE_OWNED_IMMUTABLE_ASSETS");
  checks.codexInstaller.preservesCoreContracts = text.includes("CORE_PRESERVE_PATHS") && text.includes("ASK core immutable contract is missing or stale");
  checks.codexInstaller.requiresWorkPackageCompiler = /"spec-driven-development"\s*:\s*\{[\s\S]{0,200}requires:\s*\[[^\]]*"work-package-compiler"/.test(text);
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
  checks.installerProjection.projectsLifecycleContract = text.includes("docs/lifecycle-artifact-contract.md") && text.includes("CORE_OWNED_IMMUTABLE_ASSETS");
  checks.installerProjection.resolvesSkillAssets = text.includes("requiredAssetsForSkills") && text.includes("CORE_OWNED_IMMUTABLE_ASSETS");
  checks.installerProjection.preservesCoreContracts = text.includes("CORE_PRESERVE_PATHS") && text.includes("ASK core immutable contract is missing or stale");
  checks.installerProjection.requiresWorkPackageCompiler = /"spec-driven-development"\s*:\s*\{[\s\S]{0,200}requires:\s*\[[^\]]*"work-package-compiler"/.test(text);
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
    "resolvesSkillAssets",
    "projectsLifecycleContract",
    "preservesCoreContracts",
    "requiresWorkPackageCompiler",
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

function buildReport({ manifest, skillDirectories, skillGroupChecks, planeChecks, routingChecks, skillChecks, contextMetadataChecks, improvementLedgerChecks, domainRuleLedgerChecks, claudeAdapterChecks, executionEnvelopeChecks, lifecycleArtifactChecks, lifecycleTraceabilityChecks, reviewSignalRegistryChecks, pathChecks, staleFindings }) {
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
    `- plane assignments: ${SKILL_PLANES.map((plane) => `${plane}=${planeChecks.assignments[plane] ?? 0}`).join(", ")}`,
    `- projection packs: ${planeChecks.projectionPacks.map((pack) => `${pack.name}=${pack.skillCount}`).join(", ") || "none"}`,
    `- cross-plane transitions: ${planeChecks.crossPlaneTransitions.length}`,
    `- adapter capability gate: ${planeChecks.capabilityGate ? "ok" : "not applicable"}`,
    `- machine-readable capability gate: ${routingChecks.adapterCapabilityGate ? "ok" : "invalid"}`,
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
    "## Lifecycle artifact contract checks",
    "",
    `- canonical contract: ${lifecycleArtifactChecks.contractPresent ? "ok" : "missing"}`,
    `- chain fixtures: ${lifecycleArtifactChecks.fixturePresent ? "ok" : "missing"}`,
    `- canonical skills reference the contract: ${lifecycleArtifactChecks.skills.every((check) => check.ok) ? "ok" : "invalid"}`,
    `- Claude/Codex prompts reference the contract: ${lifecycleArtifactChecks.adapters.every((check) => check.ok) ? "ok" : "invalid"}`,
    `- scenarios: ${lifecycleArtifactChecks.scenarios.length > 0 && lifecycleArtifactChecks.scenarios.every((scenario) => scenario.ok) ? lifecycleArtifactChecks.scenarios.map((scenario) => scenario.id).join(", ") : "invalid"}`,
    "",
    "## Lifecycle traceability checks",
    "",
    `- canonical contract: ${lifecycleTraceabilityChecks.contractPresent ? "ok" : "missing"}`,
    `- chain fixtures: ${lifecycleTraceabilityChecks.fixturePresent ? "ok" : "missing"}`,
    `- relevant skills reference the contract: ${lifecycleTraceabilityChecks.skills.every((check) => check.ok) ? "ok" : "invalid"}`,
    `- scenarios: ${lifecycleTraceabilityChecks.scenarios.length > 0 && lifecycleTraceabilityChecks.scenarios.every((scenario) => scenario.ok) ? lifecycleTraceabilityChecks.scenarios.map((scenario) => scenario.id).join(", ") : "invalid"}`,
    "",
    "## Review signal registry checks",
    "",
    `- canonical registry: ${reviewSignalRegistryChecks.present ? "ok" : "missing"}`,
    `- heavy gate set: ${reviewSignalRegistryChecks.gates ? "ok" : "invalid"}`,
    `- signal mappings: ${reviewSignalRegistryChecks.signals ? "ok" : "invalid"}`,
    `- router trigger coverage: ${reviewSignalRegistryChecks.coverage ? "ok" : "invalid"}`,
    `- Claude plugin projection: ${reviewSignalRegistryChecks.pluginProjection ? "ok" : "invalid"}`,
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
    `- immutable contracts always core-owned: ${claudeAdapterChecks.coreInstaller.alwaysOwnsImmutableContracts ? "ok" : "invalid"}`,
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
    `- lifecycle contract asset projected: ${claudeAdapterChecks.codexInstaller.projectsLifecycleContract ? "ok" : "invalid"}`,
    `- skill-only contract dependencies resolved: ${claudeAdapterChecks.codexInstaller.resolvesSkillOnlyAssets ? "ok" : "invalid"}`,
    `- core contract ownership preserved: ${claudeAdapterChecks.codexInstaller.preservesCoreContracts ? "ok" : "invalid"}`,
    `- spec route requires Work Package Compiler: ${claudeAdapterChecks.codexInstaller.requiresWorkPackageCompiler ? "ok" : "invalid"}`,
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
    `- selected skill assets resolved: ${claudeAdapterChecks.installerProjection.resolvesSkillAssets ? "ok" : "invalid"}`,
    `- lifecycle contract asset projection: ${claudeAdapterChecks.installerProjection.projectsLifecycleContract ? "ok" : "invalid"}`,
    `- core contract ownership preserved: ${claudeAdapterChecks.installerProjection.preservesCoreContracts ? "ok" : "invalid"}`,
    `- spec route requires Work Package Compiler: ${claudeAdapterChecks.installerProjection.requiresWorkPackageCompiler ? "ok" : "invalid"}`,
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
  const planeChecks = validatePlaneModel(root, manifest, errors);
  const routingChecks = validateRoutingManifest(root, manifest, errors);
  validateManifestPaths(root, manifest, errors);
  const skillChecks = validateSkills(root, skillDirectories, errors);
  const contextMetadataChecks = validateContextMetadata(root, errors);
  const improvementLedgerChecks = validateImprovementLedger(root, errors);
  const domainRuleLedgerChecks = validateDomainRuleLedger(root, errors);
  const claudeAdapterChecks = validateClaudeAdapterArchitecture(root, manifest, errors);
  const executionEnvelopeChecks = validateExecutionEnvelope(root, manifest, errors);
  const lifecycleArtifactChecks = validateLifecycleArtifactContract(root, manifest, errors);
  const lifecycleTraceabilityChecks = validateLifecycleTraceabilityContract(root, manifest, errors);
  const reviewSignalRegistryChecks = validateReviewSignalRegistry(root, manifest, errors);
  const currentSkillCount = Array.isArray(manifest?.skills) ? manifest.skills.length : null;
  const staleFindings = findStalePhrases(root, currentSkillCount, errors);
  const pathChecks = buildPathChecks(root, manifest);
  const report = buildReport({ manifest, skillDirectories, skillGroupChecks, planeChecks, routingChecks, skillChecks, contextMetadataChecks, improvementLedgerChecks, domainRuleLedgerChecks, claudeAdapterChecks, executionEnvelopeChecks, lifecycleArtifactChecks, lifecycleTraceabilityChecks, reviewSignalRegistryChecks, pathChecks, staleFindings });

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
