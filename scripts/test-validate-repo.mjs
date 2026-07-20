#!/usr/bin/env node
import { chmodSync, existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { APPROVAL_REQUIRED_SURFACES, CODEX_PROMPT_CONTRACTS, OPERATING_MODES, TASK_CLASSES, parseCodexCompactProfileHeader } from "./ask-shared.mjs";
import { CODEX_RUNTIME_FILES } from "./adapter-runtime-inventory.mjs";
import { inspectExecutionEnvelope } from "./execution-envelope.mjs";
import { CORE_IMMUTABLE_CONTRACT_ASSETS, hashText } from "./installer-lifecycle.mjs";
import { REQUIRED_TRACEABILITY_SCENARIOS, computeAdapterAppliedProvenanceFingerprint, computeAdapterProfileFingerprint, inspectAdapterRuntimeEvidenceArtifact, inspectAdapterRuntimeProfile, inspectLifecycleScenario, inspectTraceabilityScenarioResult, traceabilityRequiredOutcomeIssue, traceabilityScenarioMatchesExpectation } from "./validate-repo.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validateScript = resolve(repoRoot, "scripts/validate-repo.mjs");
const doctorScript = resolve(repoRoot, "scripts/ask-doctor.mjs");
const sensorsScript = resolve(repoRoot, "scripts/ask-sensors.mjs");
const runtimeSmokeScript = resolve(repoRoot, "scripts/adapter-runtime-smoke.mjs");
const codexRunnerScript = resolve(repoRoot, "scripts/codex-exec-runner.mjs");
const codexCompactProfileTestScript = resolve(repoRoot, "scripts/test-codex-runtime-profile.mjs");
const crossAdapterConformanceTestScript = resolve(repoRoot, "scripts/test-adapter-cross-conformance.mjs");
const adapterMigrationTestScript = resolve(repoRoot, "scripts/test-adapter-runtime-migration.mjs");
const adapterRuntimeEventTestScript = resolve(repoRoot, "scripts/test-adapter-runtime-event.mjs");
const fixtureRoot = mkdtempSync(resolve(tmpdir(), "validate-repo-"));

const compactProfileResult = spawnSync(process.execPath, [codexCompactProfileTestScript], { cwd: repoRoot, encoding: "utf8" });
if (compactProfileResult.status !== 0) {
  throw new Error(`Codex compact profile tests failed\n${compactProfileResult.stdout}\n${compactProfileResult.stderr}`);
}

for (const [label, script] of [
  ["Normalized adapter runtime event", adapterRuntimeEventTestScript],
  ["Cross-adapter conformance", crossAdapterConformanceTestScript],
  ["Dual-runtime migration", adapterMigrationTestScript],
]) {
  const result = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label} tests failed\n${result.stdout}\n${result.stderr}`);
}

function envelopeBlock(overrides = {}) {
  const envelope = {
    schema_version: "1.0.0",
    route: {
      work_mode: "実装",
      operating_mode: "delivery_quality",
      user_facing: "実装して検証する",
      internal: { primary: "controlled-implementation", secondary: ["test-first-verification"], next_if_resolved: "review-router" },
    },
    evidence_status: { checked: ["node scripts/test-validate-repo.mjs"], missing: [] },
    stop_reason: { status: "none", details: [], human_decision_required: [], stop_if: ["required verification is unavailable"] },
    next_action: "continue fixture verification",
    ...overrides,
  };
  return `Execution Envelope:\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;
}

const validEnvelopeBlock = envelopeBlock();
const validMetricsCandidate = {
  schema_version: "1.0.0",
  event_id: "fixture:execution-envelope",
  task_id: "fixture-task",
  task_type: "implementation",
  occurred_at: "2026-07-11T12:00:00Z",
  skills_used: ["controlled-implementation"],
  instruction_quality_metrics: { goal_clarity: 3 },
  outcome_metrics: { rework_count: 0 },
  verification_metrics: {},
  debt_movement_metrics: {},
  evidence_references: ["scripts/test-validate-repo.mjs"],
  privacy_note: {
    raw_prompts_stored: false,
    secrets_stored: false,
    customer_data_stored: false,
    personal_data_stored: false,
    external_publication: false,
  },
};
const insufficientEvidenceEnvelopeBlock = envelopeBlock({
  evidence_status: { checked: [], missing: ["external runtime"] },
  stop_reason: {
    status: "insufficient_evidence",
    details: ["external runtime was not checked"],
    human_decision_required: [],
    stop_if: ["external runtime evidence is required"],
  },
  next_action: "collect missing evidence",
});
const capabilityMissingEnvelopeBlock = envelopeBlock({
  stop_reason: {
    status: "capability_missing",
    details: ["review-finding-compiler is absent from active adapter selected_skills; use the organizational profile or an explicit closed --skills override"],
    human_decision_required: [],
    stop_if: ["the selected route is absent from active adapter selected_skills"],
  },
  next_action: "install the required capability before continuing",
});

function validSkill(name) {
  const title = `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
  return `---
name: ${name}
description: ${title} skill fixture.
---

# ${title}

## Goal

Validate fixture behavior.

## Use when

Fixture validation is needed.

## Do not use when

The fixture is irrelevant.

## Process

Run the validation script.

## Output

A validation result.
`;
}

const validLedger = `---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific improvement items recorded"
---

# Improvement Ledger Template
`;

const validDomainRuleLedger = `---
ledger_status: template
last_updated: null
evidence_owner: null
source_scope: "generic empty template; no project-specific domain rules recorded"
---

# Domain Rule Ledger Template

## Domain Rule Entries

| ID | Rule | Business object | Business actor | Workflow | State / condition | Source | Evidence status | Applies to | Used by | Last checked | Staleness trigger | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
`;

function skillGroupsFor(skills, overrides = {}) {
  return {
    mode_routing: [],
    delivery_quality: skills,
    adoption_bootstrap: [],
    observability_metrics: [],
    operation_automation: [],
    ...overrides,
  };
}

function planeModelFor(skills) {
  return {
    skill_planes: Object.fromEntries(skills.map((skill) => [skill, "execution"])),
    projection_packs: {
      daily_delivery: {
        description: "Daily execution and control without durable knowledge lifecycle skills.",
        planes: ["execution", "control"],
        skills,
        knowledge_write_policy: "explicit_only",
      },
      organizational_intelligence: {
        description: "Daily delivery plus explicitly invoked organizational knowledge lifecycle skills.",
        planes: ["execution", "knowledge", "control"],
        skills,
        knowledge_write_policy: "explicit_only",
      },
    },
  };
}

function routingFixture() {
  const task_classes = {};
  for (const taskClass of TASK_CLASSES) {
    task_classes[taskClass] = {
      default_route: "kernel",
      risk_gate_required: taskClass === "risk-gated",
      override_allowed: taskClass !== "risk-gated",
      ...(taskClass === "risk-gated" ? { required_gate: "risk-gate" } : { override_requires_reason: taskClass !== "trivial" }),
    };
  }

  const operating_modes = {};
  for (const mode of OPERATING_MODES) {
    operating_modes[mode] = {
      skill_group: mode,
      default_route: mode === "operation_automation" ? "external_operation" : "kernel",
    };
  }

  return {
    schema_version: 1,
    enforcement_model: "default_selection_and_validation",
    task_classes,
    operating_modes,
    default_routes: [],
    cross_plane_transitions: [],
    adapter_capability_gate: {
      state_paths: [".agent-spectrum-kernel/claude-install-state.json", ".agent-spectrum-kernel/codex-install-state.json"],
      availability_field: "selected_skills",
      physical_discovery_field: "installed_skills",
      missing_status: "capability_missing",
      missing_route_policy: "stop_without_inference",
      daily_upgrade_profile: "organizational",
    },
    risk_gate: {
      required_route: "kernel",
      hard_stop_surfaces: APPROVAL_REQUIRED_SURFACES.map((surface) => surface.id),
      read_only_investigation_allowed: true,
      local_verification_allowed: true,
    },
    route_override: {
      allowed: true,
      requires_reason: true,
      not_allowed_for_required_gates: ["risk-gate"],
    },
    unsupported_adapter_capability: {
      source: "docs/adapter-capability-matrix.md",
      unknown_status: "downgrade_to_unknown",
      unsupported_status: "downgrade_to_unsupported",
      projected_status: "claim_projection_only",
      runtime_detected_status: "claim_runtime_detection_only",
      executed_status: "claim_execution_only",
      behavior_verified_status: "claim_behavior_verified",
    },
  };
}

function writeFixture(root, skills = ["alpha"]) {
  for (const skill of skills) {
    mkdirSync(resolve(root, `skills/${skill}`), { recursive: true });
    writeFileSync(resolve(root, `skills/${skill}/SKILL.md`), validSkill(skill));
  }

  mkdirSync(resolve(root, "docs/ai"), { recursive: true });
  mkdirSync(resolve(root, "examples"), { recursive: true });
  writeAdapterFixture(root);

  for (const path of [
    "benchmarks/portfolio-catalog.json",
    "benchmarks/portfolio-similarity.json",
    "benchmarks/portfolio-policy-manifest.json",
    "benchmarks/portfolio-admission-policy.json",
    "benchmarks/portfolio-scoring-policy.json",
    "benchmarks/portfolio-lineage-policy.json",
    "benchmarks/schemas/portfolio-catalog.schema.json",
    "benchmarks/schemas/portfolio-similarity.schema.json",
    "benchmarks/schemas/portfolio-policy-manifest.schema.json",
    "benchmarks/schemas/portfolio-admission-policy.schema.json",
    "benchmarks/schemas/portfolio-scoring-policy.schema.json",
    "benchmarks/schemas/portfolio-lineage-policy.schema.json",
  ]) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), readFileSync(resolve(repoRoot, path)));
  }

  writeFileSync(resolve(root, "AGENTS.md"), "# Kernel\n");
  writeFileSync(resolve(root, "CUSTOM_INSTRUCTIONS.md"), "# Custom instructions\n");
  writeFileSync(resolve(root, "docs/ok.md"), "# OK\n");
  writeFileSync(resolve(root, "docs/ai/improvement-ledger.md"), validLedger);
  writeFileSync(resolve(root, "docs/ai/domain-rule-ledger.md"), validDomainRuleLedger);
  writeFileSync(resolve(root, "examples/ok.md"), "# OK\n");
  writeFileSync(
    resolve(root, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills,
        ...planeModelFor(skills),
        skill_groups: skillGroupsFor(skills),
        allowed_multi_group_skills: [],
        routing: routingFixture(),
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md", "docs/ai/domain-rule-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
}

function writeAdapterFixture(root) {
  const schemaPaths = [
    "schemas/metrics-event.schema.json",
    "schemas/execution-envelope.schema.json",
    "schemas/adapter-runtime-profile.schema.json",
    "schemas/adapter-runtime-evidence.schema.json",
    "schemas/adapter-runtime-event.schema.json",
    "schemas/normalized-event-schema-registry.json",
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
  for (const path of schemaPaths) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    const content = path === "schemas/review-signal-gate-map.json"
      ? readFileSync(resolve(repoRoot, path), "utf8")
      : path === "schemas/metrics-event.schema.json"
      ? '{ "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object", "properties": { "command_attempt_metrics": { "properties": { "classified_as_verification": { "type": "boolean" } } } } }\n'
      : '{ "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object" }\n';
    writeFileSync(resolve(root, path), content);
  }

  const docs = [
    "docs/adapter-deployment-governance.md",
    "docs/observability-runtime-contract.md",
    "docs/operation-automation-contract.md",
    "docs/debt-lifecycle-contract.md",
    "docs/metrics-event-contract.md",
    "docs/ai/skill-adoption-metrics.md",
    "docs/ai/adoption-report-template.md",
  ];
  for (const path of docs) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(
      resolve(root, path),
      "# Fixture\n\nLocal hooks are the default local observability path. Pattern B is optional. No raw prompt storage by default. No external publication by default.\n\nLocal minimal, Local observed, Shared PR review, Plugin distribution, and Codex projection are documented. Installed, Activated, and Operational states are separate; File copy alone is insufficient. Validate, Update, Detach, and Unsupported combinations are covered. Coexistence And Precedence mentions CLAUDE_PLUGIN_ROOT and .claude/settings.json. Ownership And Approvals covers GitHub Actions approval. Observability lifecycle includes commit_events_to_git, retention_days, schema_mismatch_action, deduplication_key, and schema_migration. Runtime health uses .agent-spectrum-kernel/runtime-health.jsonl and ask-doctor without full error messages. command_attempt and verification_attempt semantics state that a generic Bash hook must not classify every command as verification. Metrics guardrails prohibit HR, compensation, promotion, individual productivity rankings, and personal identifiers. Success criteria include re-review count, missed blocker rate, false positive rate, senior correction effort, token/time cost, unsupported-causality, and Reduce, redesign, or remove conditions.\n",
    );
  }
  writeFileSync(
    resolve(root, "docs/adapter-capability-matrix.md"),
    `# Adapter Capability Matrix

| Capability | Claude Code | Codex | Cursor |
|---|---|---|---|
| Local metrics event recording | runtime_detected | unsupported | unknown |
| Project-local skill projection | behavior_verified | behavior_verified | unknown |
`,
  );

  mkdirSync(resolve(root, "docs/ai"), { recursive: true });
  writeFileSync(
    resolve(root, "docs/ai/observability-config.yml"),
    `enabled: true
capture:
  allow_session_id_task_boundary: true
  task_boundary_source: session_id
  record_command_attempts: true
  record_command_hash: false
  record_command_preview: false
storage:
  event_store: docs/ai/metrics/events.jsonl
  report_dir: docs/ai/reports
privacy:
  raw_prompt_storage: false
  secrets_storage: false
  customer_data_storage: false
  personal_data_storage: false
external_publication:
  enabled: false
safety:
  http_hooks_enabled: false
  webhook_hooks_enabled: false
lifecycle:
  enforcement: policy_only
  commit_events_to_git: false
  retention_days: 90
  rotate_when_bytes: 5242880
  schema_mismatch_action: quarantine
  quarantine_dir: docs/ai/metrics/quarantine
  deduplication_key: event_id
  schema_migration: manual_review_required
  report_retention_days: 180
  opt_out: detach_preserves_project_data; purge_runtime_data_is_a_separate_approved_manual_action
`,
  );

  mkdirSync(resolve(root, "scripts"), { recursive: true });
  writeFileSync(
    resolve(root, "scripts/ai-metrics-record.mjs"),
    `const event = { verification_metrics: {} };
event.command_attempt_metrics = { command_kind: "unknown", classified_as_verification: false };
event.verification_metrics.commands_run = [{ command_kind: "test" }];
const path = "ask-runtime/runtime-health.jsonl";
const code = "non_blocking_metrics_record_failure";
const privacy = { full_error_message_stored: false };
console.log(path, code, privacy);
`,
  );

  const adapterFiles = [
    "adapters/claude-code/README.md",
    "adapters/claude-code/project/.claude/skills/README.md",
    "adapters/claude-code/project/.claude/commands/skill-review.md",
    "adapters/claude-code/project/.claude/commands/skill-implement.md",
    "adapters/claude-code/project/.claude/commands/skill-investigate.md",
    "adapters/claude-code/project/.claude/commands/skill-verify.md",
    "adapters/claude-code/project/.claude/commands/skill-handoff.md",
    "adapters/claude-code/project/.claude/commands/skill-report.md",
    "adapters/claude-code/project/.claude/commands/skill-ledger-refresh.md",
    "adapters/claude-code/github-actions/README.md",
    "adapters/claude-code/plugin/README.md",
    "adapters/claude-code/plugin/contracts/execution-envelope-contract.md",
    "adapters/claude-code/plugin/contracts/review-signal-gate-map.json",
    "adapters/claude-code/plugin/schemas/execution-envelope.schema.json",
    "adapters/claude-code/plugin/schemas/metrics-event.schema.json",
    "adapters/claude-code/plugin/skills/review-pr/SKILL.md",
    "adapters/claude-code/plugin/skills/adoption-report/SKILL.md",
    "adapters/claude-code/plugin/skills/ledger-refresh/SKILL.md",
    "adapters/claude-code/plugin/skills/implementation-context-check/SKILL.md",
    "adapters/claude-code/plugin/bin/ai-skills-metrics-record",
    "adapters/codex/README.md",
    "adapters/codex/commands/codex-exec.md",
    "adapters/codex/project/.agents/skills/README.md",
    "adapters/codex/prompts/skill-implement.md",
    "adapters/codex/prompts/skill-investigate.md",
    "adapters/codex/prompts/skill-review.md",
    "adapters/codex/prompts/skill-verify.md",
    "adapters/codex/prompts/skill-handoff.md",
  ];
  for (const path of adapterFiles) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(
      resolve(root, path),
      path === "adapters/claude-code/plugin/contracts/review-signal-gate-map.json"
        ? readFileSync(resolve(repoRoot, path), "utf8")
        : "# Fixture\n",
    );
  }

  mkdirSync(resolve(root, "adapters/claude-code/project/.claude/hooks"), { recursive: true });
  writeFileSync(resolve(root, "adapters/claude-code/project/.claude/hooks/hooks.json"), '{ "hooks": { "PostToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node scripts/ai-metrics-record.mjs --event-kind command_attempt --non-blocking >/dev/null 2>&1 || true" }] }], "Stop": [{ "hooks": [{ "type": "command", "command": "node scripts/ai-metrics-record.mjs --event-kind task_stop --non-blocking >/dev/null 2>&1 || true" }] }] } }\n');
  mkdirSync(resolve(root, "adapters/claude-code/plugin/hooks"), { recursive: true });
  writeFileSync(resolve(root, "adapters/claude-code/plugin/hooks/hooks.json"), '{ "hooks": { "PostToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "test -x \\"${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record\\" && \\"${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record\\" --event-kind command_attempt --non-blocking >/dev/null 2>&1 || true" }] }], "Stop": [{ "hooks": [{ "type": "command", "command": "test -x \\"${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record\\" && \\"${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record\\" --event-kind task_stop --non-blocking >/dev/null 2>&1 || true" }] }] } }\n');

  mkdirSync(resolve(root, "adapters/claude-code/plugin/.claude-plugin"), { recursive: true });
  writeFileSync(resolve(root, "adapters/claude-code/plugin/.claude-plugin/plugin.json"), '{ "name": "ai-skills" }\n');

  mkdirSync(resolve(root, "adapters/claude-code/github-actions"), { recursive: true });
  writeFileSync(
    resolve(root, "adapters/claude-code/github-actions/claude-review-on-mention.yml"),
    `name: Claude Skill Review On Mention
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  workflow_dispatch:
    inputs:
      allow_fork:
        type: boolean
        default: false
jobs:
  review:
    if: contains(github.event.comment.body, '@claude review') && contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)
    steps:
      - run: |
          if [ "$ALLOW_FORK" != "true" ]; then
            echo "Fork PR review is blocked by default."
          fi
          gh pr checkout "$PR_NUMBER" --detach
          gh pr view "$PR_NUMBER" --json number > .claude/pr-context.json
          gh pr diff "$PR_NUMBER" --patch > .claude/pr.diff
          git rev-parse HEAD > .claude/pr-head-sha.txt
          echo headRefOid
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Treat the checked-out workspace as the PR head workspace.
            Return insufficient evidence if the PR head workspace is unavailable.
`,
  );

  mkdirSync(resolve(root, "scripts"), { recursive: true });
  writeFileSync(
    resolve(root, "scripts/installer-lifecycle.mjs"),
    `export const LIFECYCLE_SCHEMA_VERSION = 3;
function assertManagedDeleteSafe() {
  const currentHash = "current";
  const record = { sha256: "expected" };
  if (currentHash !== record.sha256) throw new Error("modified managed file; refusing to prune/delete");
  unlinkSync("managed-file");
}
function applyLifecyclePlan() {
  return "install_status" + "previous_successful_state" + "managed_blocks" + "managed_hooks" + "--rollback" + "--detach" + "--force" + "--check";
}
`,
  );
  writeFileSync(
    resolve(root, "scripts/install-kernel.mjs"),
    `const STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const MANAGED_START = "<!-- agent-spectrum-kernel:start -->";
const MANAGED_END = "<!-- agent-spectrum-kernel:end -->";
const CORE_IMMUTABLE_CONTRACT_ASSETS = ["docs/execution-envelope-contract.md", "docs/lifecycle-artifact-contract.md"];
function install(manifest, options) {
  const skills = manifest.skills;
  const immutableContract = "immutable_contract";
  const managed_files = {};
  const dryRun = options["--dry-run"];
  const currentHash = "current";
  const record = { sha256: "expected" };
  if (currentHash !== record.sha256) throw new Error("modified managed file; refusing to prune");
  unlinkSync("skills/example/SKILL.md");
  if (dryRun) return { skills, managed_files, CORE_IMMUTABLE_CONTRACT_ASSETS, immutableContract };
  if (options["--merge-agents"]) return MANAGED_START + MANAGED_END;
  if (options["--prune"]) return "stale managed projection";
  return STATE_PATH;
}
`,
  );
  writeFileSync(
    resolve(root, "scripts/install-codex-adapter.mjs"),
    `const STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const MANAGED_START = "<!-- agent-spectrum-kernel:start -->";
const MANAGED_END = "<!-- agent-spectrum-kernel:end -->";
const DEFAULT_PROFILE = "implementation";
const PROMPT_TEMPLATES = ["skill-implement.md"];
const COMMAND_TEMPLATES = ["codex-exec.md"];
const CODEX_RUNTIME_SCRIPTS = ["codex-exec-runner.mjs", "ask-sensors.mjs", "ask-shared.mjs", "execution-envelope.mjs", "adapter-runtime-event.mjs", "execution-envelope.schema.json", "metrics-event.schema.json", "adapter-runtime-event.schema.json"];
const CODEX_PROFILES = { implementation: { skills: ["operating-mode-router"], prompts: PROMPT_TEMPLATES, commands: COMMAND_TEMPLATES } };
const PROFILE_ROUTING_FIXTURES = { implementation: [{ id: "unfamiliar_repository", selected_route: "repository-orientation", required_skills: ["repository-orientation"] }] };
const SKILL_RELATIONSHIPS = { "controlled-implementation": { requires: ["test-first-verification"], recommends: ["evidence-ledger"], incompatibleWith: [] } };
const LIFECYCLE_ASSET = "docs/lifecycle-artifact-contract.md";
function requiredAssetsForPrompts() { return [LIFECYCLE_ASSET]; }
const CORE_OWNED_IMMUTABLE_ASSETS = [LIFECYCLE_ASSET];
const CORE_PRESERVE_PATHS = [LIFECYCLE_ASSET];
function requiredAssetsForSkills() { return CORE_OWNED_IMMUTABLE_ASSETS; }
function routingFixturesForProfile() {
  return { router_reachable_skills: ["repository-orientation"], routing_fixtures: PROFILE_ROUTING_FIXTURES.implementation };
}
function validateSkillClosure() {
  return { required_skills: ["operating-mode-router"] };
}
function validateManagedReferences() {
  return "source-repository-only Codex prompt path";
}
function install(manifest, options) {
  const skills = manifest.skills;
  const managed_files = {};
  const retained_stale_prompts = [];
  const retained_stale_commands = [];
  const stale_codex_prompt = "stale_codex_prompt";
  const stale_codex_command = "stale_codex_command";
  const dryRun = options["--dry-run"];
  const profile = options["--profile"] || DEFAULT_PROFILE;
  const skipAgents = options["--skip-agents"];
  const currentHash = "current";
  const record = { sha256: "expected" };
  if (currentHash !== record.sha256) throw new Error("modified managed file; refusing to prune");
  unlinkSync(".agents/skills/example/SKILL.md");
  if (dryRun) return { skills, managed_files };
  if (options["--merge-agents"]) return MANAGED_START + MANAGED_END;
  if (skipAgents) return ".agents/skills";
  if (options["--prune"]) return "stale Codex managed projection";
  return STATE_PATH + ".agents/prompts" + ".agents/commands" + "codex_skill" + "codex_runtime" + "codex-exec-runner.mjs" + CODEX_RUNTIME_SCRIPTS + profile + retained_stale_prompts + retained_stale_commands + stale_codex_prompt + stale_codex_command + validateSkillClosure().required_skills + routingFixturesForProfile().router_reachable_skills + routingFixturesForProfile().routing_fixtures + validateManagedReferences() + requiredAssetsForPrompts() + requiredAssetsForSkills() + CORE_PRESERVE_PATHS + "ASK core immutable contract is missing or stale" + '"spec-driven-development": { requires: ["work-package-compiler"] }';
}
`,
  );
  writeFileSync(resolve(root, "scripts/adapter-runtime-smoke.mjs"), "console.log('adapter runtime smoke');\n");
  writeFileSync(resolve(root, "scripts/adapter-runtime-bundle.mjs"), "console.log('adapter runtime bundle');\n");
  writeFileSync(resolve(root, "scripts/adapter-runtime-event.mjs"), "console.log('adapter runtime event mapper');\n");
  writeFileSync(resolve(root, "scripts/adapter-cross-conformance.mjs"), "console.log('adapter cross conformance');\n");
  writeFileSync(resolve(root, "scripts/test-adapter-cross-conformance.mjs"), "console.log('adapter cross conformance tests');\n");
  writeFileSync(resolve(root, "scripts/test-adapter-runtime-migration.mjs"), "console.log('adapter runtime migration tests');\n");
  writeFileSync(resolve(root, "scripts/test-adapter-runtime-event.mjs"), "console.log('adapter runtime event tests');\n");
  writeFileSync(resolve(root, "scripts/adapter-runtime-inventory.mjs"), "export const CODEX_RUNTIME_FILES = [{ name: 'codex-exec-runner.mjs' }];\n");
  writeFileSync(resolve(root, "scripts/codex-runtime-profile.mjs"), "console.log('codex compact profile');\n");
  writeFileSync(resolve(root, "scripts/codex-exec-runner.mjs"), "console.log('codex runner');\n");
  writeFileSync(resolve(root, "scripts/execution-envelope.mjs"), "console.log('execution envelope');\n");
  writeFileSync(
    resolve(root, "scripts/install-claude-adapter.mjs"),
    `const CORE_STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const DEFAULT_PROFILE = "full";
const DEFAULT_SKILLS = [
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
const COMMAND_METADATA = {
  "skill-review.md": { requiredSkills: ["review-router"], requiredAssets: ["docs/lifecycle-artifact-contract.md"] },
};
const SKILL_RELATIONSHIPS = { "spec-driven-development": { requires: ["work-package-compiler"] } };
const CORE_OWNED_IMMUTABLE_ASSETS = ["docs/lifecycle-artifact-contract.md"];
const CORE_PRESERVE_PATHS = ["docs/lifecycle-artifact-contract.md"];
const CLAUDE_PROFILES = { full: { skills: DEFAULT_SKILLS, commands: COMMAND_TEMPLATES } };
const PROFILE_ROUTING_FIXTURES = {
  implementation: [
    { id: "unfamiliar_repository" },
    { id: "unclear_scope" },
    { id: "boundary_decision" },
  ],
  investigation: [{ id: "bug_investigation" }],
  review: [{ id: "review" }],
};
const HELP = "--profile";
const COMMAND_TEMPLATES = [
  "skill-review.md",
  "skill-implement.md",
  "skill-investigate.md",
  "skill-verify.md",
  "skill-handoff.md",
  "skill-report.md",
  "skill-ledger-refresh.md",
];
function validateCoreInstalled() {
  return CORE_STATE_PATH;
}
function installAssets(command) {
  return command.requiredAssets;
}
function requiredAssetsForSkills() {
  return CORE_OWNED_IMMUTABLE_ASSETS;
}
function routingFixturesForProfile() {
  return PROFILE_ROUTING_FIXTURES;
}
function computeRequiredClosure() {
  return routingFixturesForProfile();
}
function removeManagedHooks() {
  return "remove managed hooks";
}
function removeAdapterOwnedHooks() {
  return "agent-spectrum-kernel:claude-adapter-hook";
}
function install(args) {
  if (args.skipHooks || args.skipRuntime) removeManagedHooks();
  if (args.profile || DEFAULT_PROFILE) return HELP + "Selected Claude commands are not closed over installed skills" + "settings.json" + installAssets(COMMAND_METADATA["skill-review.md"]) + requiredAssetsForSkills() + validateCoreInstalled() + CORE_PRESERVE_PATHS + "ASK core immutable contract is missing or stale" + SKILL_RELATIONSHIPS;
}
`,
  );
}

function runValidation(root) {
  return spawnSync(process.execPath, [validateScript, "--root", root, "--skip-report-check"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function runValidationAndWriteReport(root) {
  return spawnSync(process.execPath, [validateScript, "--root", root, "--write-report"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function assertPass(name, root) {
  const result = runValidation(root);
  if (result.status !== 0) {
    throw new Error(`${name} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function assertFail(name, root, expected) {
  const result = runValidation(root);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0) {
    throw new Error(`${name} should fail`);
  }
  if (!output.includes(expected)) {
    throw new Error(`${name} should mention '${expected}'\n${output}`);
  }
}

function assertPassWithReport(name, root) {
  const result = runValidationAndWriteReport(root);
  if (result.status !== 0) {
    throw new Error(`${name} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function cloneFixture(name, skills) {
  const root = resolve(fixtureRoot, name);
  writeFixture(root, skills);
  return root;
}

const ledgerHeader = "| ID | Source | Finding | Category | Evidence | Impact | Severity | Urgency | Decision | Recommended action | Prevention target | Repeat pattern | Proposed rule or check | Scope | Owner | Status | Created date | Refresh date | Close condition |";
const ledgerSeparator = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";

function ledgerRow(overrides = {}) {
  const row = {
    ID: "IMP-0001",
    Source: "PR #1",
    Finding: "Repeated stale count docs",
    Category: "rule_gap",
    Evidence: "Verified: docs/ok.md contained a stale count",
    Impact: "Validation could miss adoption-doc drift",
    Severity: "medium",
    Urgency: "soon",
    Decision: "backlog",
    "Recommended action": "Add a validation fixture",
    "Prevention target": "validation script",
    "Repeat pattern": "",
    "Proposed rule or check": "",
    Scope: "",
    Owner: "unassigned",
    Status: "triaged",
    "Created date": "2999-01-01",
    "Refresh date": "2999-02-01",
    "Close condition": "Fixture fails before the validation change and passes after it",
    ...overrides,
  };

  return `| ${[
    row.ID,
    row.Source,
    row.Finding,
    row.Category,
    row.Evidence,
    row.Impact,
    row.Severity,
    row.Urgency,
    row.Decision,
    row["Recommended action"],
    row["Prevention target"],
    row["Repeat pattern"],
    row["Proposed rule or check"],
    row.Scope,
    row.Owner,
    row.Status,
    row["Created date"],
    row["Refresh date"],
    row["Close condition"],
  ].join(" | ")} |`;
}

function improvementLedgerFixture({ status = "active", openRows = [], ruleRows = [], checkRows = [] } = {}) {
  return `---
ledger_status: ${status}
last_updated: 2026-01-01
evidence_owner: fixture
source_scope: validation fixture
---

# Improvement Ledger

## Open Improvement Items

${ledgerHeader}
${ledgerSeparator}
${openRows.join("\n")}

## Converted-to-Rule Items

${ledgerHeader}
${ledgerSeparator}
${ruleRows.join("\n")}

## Converted-to-Check Items

${ledgerHeader}
${ledgerSeparator}
${checkRows.join("\n")}

## Resolved Items

${ledgerHeader}
${ledgerSeparator}

## Accepted / Wont-Fix Items

${ledgerHeader}
${ledgerSeparator}
`;
}

function writeImprovementLedger(root, content) {
  mkdirSync(resolve(root, "docs/ai"), { recursive: true });
  writeFileSync(resolve(root, "docs/ai/improvement-ledger.md"), content);
}

const domainRuleHeader = "| ID | Rule | Business object | Business actor | Workflow | State / condition | Source | Evidence status | Applies to | Used by | Last checked | Staleness trigger | Owner |";
const domainRuleSeparator = "|---|---|---|---|---|---|---|---|---|---|---|---|---|";

function domainRuleRow(overrides = {}) {
  const row = {
    ID: "DR-0001",
    Rule: "Refunds over the configured threshold require manager approval before payout",
    "Business object": "Refund",
    "Business actor": "Support agent; manager",
    Workflow: "Refund approval",
    "State / condition": "Refund amount exceeds configured threshold",
    Source: "Human-confirmed: fixture domain owner note",
    "Evidence status": "Human-confirmed",
    "Applies to": "Refund workflow",
    "Used by": "requirement-grill; review-domain-impact",
    "Last checked": "2999-01-01",
    "Staleness trigger": "Approval policy, threshold, or payout workflow changes",
    Owner: "support-ops",
    ...overrides,
  };

  return `| ${[
    row.ID,
    row.Rule,
    row["Business object"],
    row["Business actor"],
    row.Workflow,
    row["State / condition"],
    row.Source,
    row["Evidence status"],
    row["Applies to"],
    row["Used by"],
    row["Last checked"],
    row["Staleness trigger"],
    row.Owner,
  ].join(" | ")} |`;
}

function domainRuleLedgerFixture({ status = "active", rows = [], header = domainRuleHeader } = {}) {
  return `---
ledger_status: ${status}
last_updated: 2026-01-01
evidence_owner: fixture
source_scope: validation fixture
---

# Domain Rule Ledger

## Domain Rule Entries

${header}
${domainRuleSeparator}
${rows.join("\n")}
`;
}

function writeDomainRuleLedger(root, content) {
  mkdirSync(resolve(root, "docs/ai"), { recursive: true });
  writeFileSync(resolve(root, "docs/ai/domain-rule-ledger.md"), content);
}

function runRepoScript(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? repoRoot,
    input: options.input,
    encoding: "utf8",
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
}

function assertRuntimePass(name, result) {
  if (result.status !== 0) {
    throw new Error(`${name} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function assertRuntimeFail(name, result, expected) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0) {
    throw new Error(`${name} should fail`);
  }
  if (expected && !output.includes(expected)) {
    throw new Error(`${name} should mention '${expected}'\n${output}`);
  }
}

function readCodexInstallState(target) {
  return JSON.parse(readFileSync(resolve(target, ".agent-spectrum-kernel/codex-install-state.json"), "utf8"));
}

function assertActualInventoryMatchesState(name, state) {
  const expectedPaths = [
    ...Object.keys(state.managed_files ?? {}),
    ...Object.keys(state.managed_partial_files ?? {}),
    ...(state.runtime_directories ?? []),
  ].sort();
  const actualPaths = (state.actual_installed_inventory ?? []).map((asset) => asset.path).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`${name} actual inventory must exactly match lifecycle state\nexpected: ${JSON.stringify(expectedPaths)}\nactual: ${JSON.stringify(actualPaths)}`);
  }
}

function installedSkillDirectories(target, relativeRoot) {
  const root = resolve(target, relativeRoot);
  return existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(resolve(root, entry.name, "SKILL.md"))).map((entry) => entry.name).sort()
    : [];
}

function assertNoKnowledgeSkills(name, target, relativeRoot, manifest) {
  const knowledgeSkills = installedSkillDirectories(target, relativeRoot).filter((skill) => manifest.skill_planes[skill] === "knowledge");
  if (knowledgeSkills.length > 0) {
    throw new Error(`${name} leaves knowledge skills discoverable: ${knowledgeSkills.join(", ")}`);
  }
}

function assertCodexInstallClosed(name, target) {
  const state = readCodexInstallState(target);
  const selectedSkills = new Set(state.selected_skills ?? []);
  for (const skill of state.skill_closure?.required_skills ?? []) {
    if (!selectedSkills.has(skill)) {
      throw new Error(`${name} is missing required skill '${skill}'\n${JSON.stringify(state, null, 2)}`);
    }
  }

  const selectedPrompts = new Set(state.selected_prompts ?? state.prompt_templates ?? []);
  for (const [managedPath, record] of Object.entries(state.managed_files ?? {})) {
    if (record.kind !== "codex_prompt" || !selectedPrompts.has(record.prompt)) {
      continue;
    }
    for (const skill of record.required_skills ?? []) {
      if (!selectedSkills.has(skill)) {
        throw new Error(`${name} prompt ${record.prompt} requires missing skill '${skill}'\n${JSON.stringify(state, null, 2)}`);
      }
    }
    if (!existsSync(resolve(target, managedPath))) {
      throw new Error(`${name} selected prompt is missing: ${managedPath}`);
    }
  }

  for (const fixture of state.skill_closure?.routing_fixtures ?? []) {
    if (fixture.outcome === "capability_missing") {
      if (selectedSkills.has(fixture.selected_route) || fixture.recommended_profile !== "organizational") {
        throw new Error(`${name} capability-missing fixture '${fixture.id}' is not fail-closed\n${JSON.stringify(state, null, 2)}`);
      }
      continue;
    }
    if (fixture.selected_route && !selectedSkills.has(fixture.selected_route)) {
      throw new Error(`${name} routing fixture '${fixture.id}' selected missing route '${fixture.selected_route}'\n${JSON.stringify(state, null, 2)}`);
    }
    for (const skill of fixture.required_skills ?? []) {
      if (!selectedSkills.has(skill)) {
        throw new Error(`${name} routing fixture '${fixture.id}' requires missing skill '${skill}'\n${JSON.stringify(state, null, 2)}`);
      }
    }
  }

  assertCodexReferenceIntegrity(name, target, state);
}

function assertCodexRoutingFixtures(name, target, expectedFixtureIds) {
  const state = readCodexInstallState(target);
  const fixtureIds = new Set((state.skill_closure?.routing_fixtures ?? []).map((fixture) => fixture.id));
  const missing = expectedFixtureIds.filter((id) => !fixtureIds.has(id));
  if (missing.length > 0) {
    throw new Error(`${name} is missing routing fixture(s): ${missing.join(", ")}\n${JSON.stringify(state, null, 2)}`);
  }
  assertCodexInstallClosed(name, target);
}

function assertCodexCompactProfiles(name, target) {
  const state = readCodexInstallState(target);
  const selectedProfiles = state.compact_runtime_profiles ?? [];
  if (selectedProfiles.length !== (state.selected_prompts ?? []).length) {
    throw new Error(`${name} must record one compact profile per selected prompt\n${JSON.stringify(state, null, 2)}`);
  }
  for (const prompt of state.selected_prompts ?? []) {
    const path = `.agents/prompts/${prompt}`;
    const record = state.managed_files?.[path];
    const content = readFileSync(resolve(target, path), "utf8");
    const header = parseCodexCompactProfileHeader(content);
    if (!record?.compact_profile || !header || header.id !== record.compact_profile.profile_id || header.source_digest !== record.compact_profile.canonical_source_digest) {
      throw new Error(`${name} has invalid compact profile provenance for ${prompt}`);
    }
    if (record.compact_profile.schema_version !== "1.1.0" || record.compact_profile.profile_fingerprint !== state.projection_plan?.fingerprint) {
      throw new Error(`${name} compact metadata must derive from shared adapter profile revision 1.1.0 for ${prompt}`);
    }
  }
}

function assertCodexReferenceIntegrity(name, target, state = readCodexInstallState(target)) {
  const managedPaths = new Set(Object.keys(state.managed_files ?? {}));
  const referencePattern = /\.agents\/(?:prompts|commands)\/[A-Za-z0-9._/-]+\.md/g;
  const sourceOnlyPattern = /adapters\/codex\/prompts\/[A-Za-z0-9._/-]+\.md/g;
  const paths = Object.entries(state.managed_files ?? {})
    .filter(([, record]) => record.kind === "codex_prompt" || record.kind === "codex_command")
    .map(([path]) => path);

  for (const path of paths) {
    const text = readFileSync(resolve(target, path), "utf8");
    const sourceOnlyReferences = [...text.matchAll(sourceOnlyPattern)].map((match) => match[0]);
    if (sourceOnlyReferences.length > 0) {
      throw new Error(`${name} has source-only Codex prompt references in ${path}: ${sourceOnlyReferences.join(", ")}`);
    }
    const missing = [...text.matchAll(referencePattern)]
      .map((match) => match[0])
      .filter((reference) => !managedPaths.has(reference) || !existsSync(resolve(target, reference)));
    if (missing.length > 0) {
      throw new Error(`${name} has missing installed prompt/command references in ${path}: ${[...new Set(missing)].join(", ")}`);
    }
  }
}

function assertInstalledDocReferences(name, target, relativeRoots) {
  const files = [];
  const visit = (path) => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(child);
    }
  };
  for (const root of relativeRoots) visit(resolve(target, root));
  for (const file of files) {
    const references = [...readFileSync(file, "utf8").matchAll(/\bdocs\/[A-Za-z0-9._/-]+/g)].map((match) => match[0]);
    for (const reference of new Set(references)) {
      const isManagedContract = reference.endsWith("-contract.md") && !reference.startsWith("docs/ai/");
      if (isManagedContract && existsSync(resolve(repoRoot, reference)) && !existsSync(resolve(target, reference))) {
        throw new Error(`${name} leaves unresolved managed doc reference ${reference} from ${file}`);
      }
    }
  }
}

function assertSchemaPass(name, schema, value) {
  const errors = validateJsonSchemaSubset(schema, value);
  if (errors.length > 0) {
    throw new Error(`${name} should match schema\n${errors.join("\n")}\n${JSON.stringify(value, null, 2)}`);
  }
}

function assertSchemaFail(name, schema, value) {
  const errors = validateJsonSchemaSubset(schema, value);
  if (errors.length === 0) {
    throw new Error(`${name} should fail schema validation\n${JSON.stringify(value, null, 2)}`);
  }
}

function validateJsonSchemaSubset(schema, value, path = "$") {
  const errors = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];

  if (types.length > 0 && !types.some((type) => valueMatchesJsonType(value, type))) {
    errors.push(`${path} expected type ${types.join("|")}, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
    return errors;
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    errors.push(`${path} expected const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path} expected one of ${schema.enum.join(", ")}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path} expected minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path} expected maximum ${schema.maximum}`);
    }
  }
  if (typeof value === "string" && typeof schema.minLength === "number" && value.length < schema.minLength) {
    errors.push(`${path} expected minLength ${schema.minLength}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} expected minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${path} expected uniqueItems`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateJsonSchemaSubset(schema.items, item, `${path}[${index}]`));
      });
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(`${path} missing required property ${required}`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(`${path} has additional property ${key}`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        errors.push(...validateJsonSchemaSubset(propertySchema, value[key], `${path}.${key}`));
      }
    }
  }
  return errors;
}

function valueMatchesJsonType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function assertRuntimeScripts() {
  const root = resolve(fixtureRoot, "runtime");
  mkdirSync(root, { recursive: true });

  const recordResult = runRepoScript(
    [
      resolve(repoRoot, "scripts/ai-metrics-record.mjs"),
      "--event-kind",
      "verification_attempt",
      "--event-store",
      resolve(root, "docs/ai/metrics/events.jsonl"),
    ],
    {
      cwd: root,
      input: JSON.stringify({
        session_id: "S1",
        tool_name: "Bash",
        tool_input: {
          command: 'curl -H "Authorization: Bearer sk-test-secret" https://example.invalid && npm test',
        },
      }),
    },
  );
  assertRuntimePass("metrics recorder session-boundary smoke", recordResult);
  const recordedEvent = JSON.parse(readFileSync(resolve(root, "docs/ai/metrics/events.jsonl"), "utf8"));
  if (!/^task:sha256:[a-f0-9]{64}$/.test(recordedEvent.task_id)) {
    throw new Error(`metrics recorder should fall back to session boundary\n${JSON.stringify(recordedEvent, null, 2)}`);
  }
  const commandRecord = recordedEvent.verification_metrics.commands_run[0];
  if (commandRecord.command_kind !== "test" || JSON.stringify(commandRecord).includes("sk-test-secret") || commandRecord.redacted_command_preview) {
    throw new Error(`metrics recorder should store command kind only by default\n${JSON.stringify(commandRecord, null, 2)}`);
  }

  const metricsSchema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/metrics-event.schema.json"), "utf8"));
  const commandAttemptStore = resolve(root, "docs/ai/metrics/command-attempt-events.jsonl");
  const commandAttemptResult = runRepoScript(
    [
      resolve(repoRoot, "scripts/ai-metrics-record.mjs"),
      "--event-kind",
      "command_attempt",
      "--event-store",
      commandAttemptStore,
    ],
    {
      cwd: root,
      input: JSON.stringify({
        session_id: "S1A",
        tool_name: "Bash",
        tool_input: {
          command: "npm test",
        },
      }),
    },
  );
  assertRuntimePass("metrics recorder command attempt smoke", commandAttemptResult);
  const commandAttemptEvent = JSON.parse(readFileSync(commandAttemptStore, "utf8"));
  assertSchemaPass("recorded command attempt event", metricsSchema, commandAttemptEvent);
  if (
    commandAttemptEvent.command_attempt_metrics?.command_kind !== "test" ||
    commandAttemptEvent.command_attempt_metrics?.classified_as_verification !== false ||
    commandAttemptEvent.verification_metrics.commands_run ||
    !commandAttemptEvent.command_attempt_summary?.includes("not counted as verified work")
  ) {
    throw new Error(`command_attempt should not be recorded as verification evidence\n${JSON.stringify(commandAttemptEvent, null, 2)}`);
  }

  const gateDecisionStore = resolve(root, "docs/ai/metrics/gate-decision-record-events.jsonl");
  const gateDecisionRecordResult = runRepoScript(
    [
      resolve(repoRoot, "scripts/ai-metrics-record.mjs"),
      "--event-kind",
      "task_stop",
      "--task-id",
      "GATE-RECORDER-1",
      "--task-type",
      "review",
      "--skills",
      "review-router",
      "--event-store",
      gateDecisionStore,
      "--gate-decisions-json",
      JSON.stringify([
        {
          gate: "review-architecture-impact",
          layer: "Architecture",
          status: "executed",
          judgment: "Architecture gate checked public API surface.",
          evidence_checked: ["changed files", "public API surface"],
          triggering_signals: ["public_api_change"],
          missing_inputs: [],
          confidence: "high",
          reason_category: "other",
          raw_prompt: "must not be stored",
        },
      ]),
    ],
    { cwd: root, input: JSON.stringify({ session_id: "S-GATE", last_assistant_message: validEnvelopeBlock }) },
  );
  assertRuntimePass("metrics recorder gate decisions smoke", gateDecisionRecordResult);
  const gateDecisionRecordedEvent = JSON.parse(readFileSync(gateDecisionStore, "utf8"));
  assertSchemaPass("recorded gate decision event", metricsSchema, gateDecisionRecordedEvent);
  if (
    gateDecisionRecordedEvent.gate_decisions.length !== 1 ||
    gateDecisionRecordedEvent.gate_decisions[0].gate !== "review-architecture-impact" ||
    Object.hasOwn(gateDecisionRecordedEvent.gate_decisions[0], "judgment") ||
    gateDecisionRecordedEvent.gate_decisions[0].evidence_checked.some((reference) => !/^ref:sha256:[a-f0-9]{64}$/.test(reference)) ||
    Object.hasOwn(gateDecisionRecordedEvent.gate_decisions[0], "raw_prompt") ||
    JSON.stringify(gateDecisionRecordedEvent.gate_decisions).includes("must not be stored")
  ) {
    throw new Error(`metrics recorder should store sanitized structured gate decisions\n${JSON.stringify(gateDecisionRecordedEvent, null, 2)}`);
  }

  assertRuntimePass(
    "Claude canonical metrics collector fixture",
    runRepoScript([resolve(repoRoot, "scripts/test-claude-metrics-collector.mjs")]),
  );

  const nonBlockingFailure = runRepoScript(
    [
      resolve(repoRoot, "scripts/ai-metrics-record.mjs"),
      "--event-kind",
      "task_stop",
      "--event-store",
      resolve(root, "docs/ai/metrics"),
      "--non-blocking",
    ],
    {
      cwd: root,
      input: JSON.stringify({ session_id: "S5", last_assistant_message: validEnvelopeBlock }),
    },
  );
  assertRuntimePass("metrics recorder non-blocking failure", nonBlockingFailure);
  if (nonBlockingFailure.stdout || nonBlockingFailure.stderr) {
    throw new Error(`non-blocking metrics failures should stay silent\nstdout:\n${nonBlockingFailure.stdout}\nstderr:\n${nonBlockingFailure.stderr}`);
  }
  const runtimeHealthPath = resolve(root, ".agent-spectrum-kernel/runtime/runtime-health.jsonl");
  if (!existsSync(runtimeHealthPath)) {
    throw new Error("non-blocking metrics failures should write a local runtime-health entry");
  }
  const runtimeHealthEntry = JSON.parse(readFileSync(runtimeHealthPath, "utf8").trim().split(/\r?\n/).at(-1));
  if (
    runtimeHealthEntry.error_code !== "non_blocking_metrics_record_failure" ||
    runtimeHealthEntry.privacy_note?.full_error_message_stored !== false ||
    JSON.stringify(runtimeHealthEntry).includes("EISDIR")
  ) {
    throw new Error(`runtime-health entry should be sanitized\n${JSON.stringify(runtimeHealthEntry, null, 2)}`);
  }
  const repeatedFailure = runRepoScript(
    [
      resolve(repoRoot, "scripts/ai-metrics-record.mjs"),
      "--event-kind",
      "task_stop",
      "--event-store",
      resolve(root, "docs/ai/metrics"),
      "--non-blocking",
    ],
    { cwd: root, input: JSON.stringify({ session_id: "S5-repeat", last_assistant_message: validEnvelopeBlock }) },
  );
  assertRuntimePass("metrics recorder repeated non-blocking failure", repeatedFailure);
  const repeatedHealthEntry = JSON.parse(readFileSync(runtimeHealthPath, "utf8").trim().split(/\r?\n/).at(-1));
  if (
    readFileSync(runtimeHealthPath, "utf8").trim().split(/\r?\n/).length !== 1 ||
    repeatedHealthEntry.occurrence_count !== 2 ||
    Date.parse(repeatedHealthEntry.last_seen_at) <= Date.parse(repeatedHealthEntry.first_seen_at) ||
    Date.now() - Date.parse(repeatedHealthEntry.last_seen_at) > 60_000
  ) {
    throw new Error("repeated identical runtime-health failures should be deduplicated");
  }

  writeFileSync(resolve(root, "docs/ai/observability-config.yml"), "runtime_health:\n  max_entries: 3\n");
  const healthEntry = (component, code) => ({
    schema_version: "1.0.0",
    occurred_at: "2000-01-01T00:00:00.000Z",
    first_seen_at: "2000-01-01T00:00:00.000Z",
    last_seen_at: "2000-01-01T00:00:00.000Z",
    occurrence_count: 1,
    component,
    status: "error",
    error_code: code,
  });
  writeFileSync(runtimeHealthPath, `${JSON.stringify(healthEntry("ai-metrics-record", "non_blocking_metrics_record_failure"))}\n${JSON.stringify(healthEntry("component-b", "failure-b"))}\n${JSON.stringify(healthEntry("component-c", "failure-c"))}\n`);
  assertRuntimePass("metrics recorder moves recurring health entry to the tail", runRepoScript([resolve(repoRoot, "scripts/ai-metrics-record.mjs"), "--event-kind", "task_stop", "--event-store", resolve(root, "docs/ai/metrics"), "--non-blocking"], { cwd: root, input: JSON.stringify({ session_id: "S5-multi-key", last_assistant_message: validEnvelopeBlock }) }));
  const multiKeyHealth = readFileSync(runtimeHealthPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  if (multiKeyHealth.length !== 3 || multiKeyHealth.at(-1)?.component !== "ai-metrics-record" || Date.parse(multiKeyHealth.at(-1)?.last_seen_at) <= Date.parse(multiKeyHealth.at(-1)?.first_seen_at)) {
    throw new Error(`recurring health entries must be retained by latest observation time\n${JSON.stringify(multiKeyHealth, null, 2)}`);
  }

  const nestedRuntimeCwd = resolve(root, "nested/hook-cwd");
  mkdirSync(nestedRuntimeCwd, { recursive: true });
  const recoveredResult = runRepoScript(
    [
      resolve(repoRoot, "scripts/ai-metrics-record.mjs"),
      "--event-kind",
      "task_stop",
      "--event-store",
      resolve(root, "docs/ai/metrics/recovered-events.jsonl"),
      "--non-blocking",
    ],
    {
      cwd: nestedRuntimeCwd,
      env: { CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({ session_id: "S5-recovered", last_assistant_message: validEnvelopeBlock }),
    },
  );
  assertRuntimePass("metrics recorder writes recovery at Claude project root", recoveredResult);
  const recoveredEntries = readFileSync(runtimeHealthPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  if (recoveredEntries.at(-1)?.status !== "recovered" || existsSync(resolve(nestedRuntimeCwd, ".agent-spectrum-kernel/runtime/runtime-health.jsonl"))) {
    throw new Error("successful nested hook execution should recover health at CLAUDE_PROJECT_DIR, not CWD");
  }

  writeFileSync(resolve(root, "docs/ai/observability-config.yml"), "runtime_health:\n  max_entries: 2\n");
  assertRuntimePass("metrics recorder bounded health failure", runRepoScript([resolve(repoRoot, "scripts/ai-metrics-record.mjs"), "--event-kind", "task_stop", "--event-store", resolve(root, "docs/ai/metrics"), "--non-blocking"], { cwd: root, input: JSON.stringify({ session_id: "S5-bounded-error", last_assistant_message: validEnvelopeBlock }) }));
  assertRuntimePass("metrics recorder bounded health recovery", runRepoScript([resolve(repoRoot, "scripts/ai-metrics-record.mjs"), "--event-kind", "task_stop", "--event-store", resolve(root, "docs/ai/metrics/bounded-events.jsonl"), "--non-blocking"], { cwd: root, input: JSON.stringify({ session_id: "S5-bounded-recovery", last_assistant_message: validEnvelopeBlock }) }));
  if (readFileSync(runtimeHealthPath, "utf8").trim().split(/\r?\n/).length > 2) {
    throw new Error("runtime-health history must stay within configured max_entries");
  }

  const routingRecordStore = resolve(root, "docs/ai/metrics/routing-record-events.jsonl");
  const routingRecordResult = runRepoScript(
    [
      resolve(repoRoot, "scripts/ai-metrics-record.mjs"),
      "--event-kind",
      "task_stop",
      "--task-id",
      "ROUTING-RECORDER-1",
      "--task-type",
      "review",
      "--skills",
      "review-router",
      "--event-store",
      routingRecordStore,
      "--routing-result-json",
      JSON.stringify({
      change_signals: [
        { signal: "public_api_change", evidence: "schema file changed" },
        { signal: "generated_output_change", evidence: "docs output path changed" },
      ],
      required_gates: ["review-router"],
      executed_gates: ["review-router"],
      required_gate_routes: [
        { gate: "review-router", reason: "Observed review target requires routing.", trigger_signals: ["public_api_change"] },
      ],
      skipped_heavy_gates: [
        { gate: "review-adversarial-risk", layer: "Adversarial risk overlay", reason: "No security or misuse signal.", observed_evidence: "schema-only fixture" },
      ],
      missing_evidence: [
        { input: "verification", reason: "Focused command output was not provided." },
      ],
      gate_applicability: [
        {
          layer: "Architecture",
          status: "required",
          gate: "review-architecture-impact",
          reason: "Public API changed.",
          evidence: "schema file changed",
          trigger_signals: ["public_api_change", "public_api_change", 42],
          inputs_still_needed: ["diff"],
          raw_prompt: "must not be stored",
        },
        {
          layer: "Output quality",
          status: "required",
          reason: "Rendered output changed but the gate id was omitted.",
          evidence: "docs output path changed",
        },
      ],
      }),
    ],
    { cwd: root, input: JSON.stringify({ session_id: "S-ROUTING", last_assistant_message: validEnvelopeBlock }) },
  );
  assertRuntimePass("metrics recorder routing applicability smoke", routingRecordResult);
  const routingRecordedEvent = JSON.parse(readFileSync(routingRecordStore, "utf8"));
  assertSchemaPass("recorded routing applicability event", metricsSchema, routingRecordedEvent);
  const recordedApplicability = routingRecordedEvent.routing_result.gate_applicability;
  if (
    recordedApplicability.length !== 2 ||
    recordedApplicability[0].gate !== "review-architecture-impact" ||
    recordedApplicability[0].trigger_signals.length !== 1 ||
    !/^ref:sha256:[a-f0-9]{64}$/.test(recordedApplicability[1].layer) ||
    Object.hasOwn(recordedApplicability[1], "gate") ||
    JSON.stringify(routingRecordedEvent).includes("must not be stored")
  ) {
    throw new Error(`metrics recorder should preserve sanitized gate_applicability from routing_result\n${JSON.stringify(routingRecordedEvent, null, 2)}`);
  }
  const recordedRouting = routingRecordedEvent.routing_result;
  if (
    recordedRouting.change_signals?.length !== 2 ||
    recordedRouting.required_gate_routes?.[0]?.trigger_signals?.[0] !== "public_api_change" ||
    recordedRouting.skipped_heavy_gates?.[0]?.gate !== "review-adversarial-risk" ||
    !/^ref:sha256:[a-f0-9]{64}$/.test(recordedRouting.missing_evidence?.[0]?.input) ||
    JSON.stringify(routingRecordedEvent).includes("schema file changed") ||
    JSON.stringify(routingRecordedEvent).includes("docs output path changed")
  ) {
    throw new Error(`metrics recorder should preserve the compact signal-first routing summary\n${JSON.stringify(routingRecordedEvent, null, 2)}`);
  }
  const sparseSignalRoutingEvent = {
    schema_version: "1.0.0",
    event_id: "evt:sparse-signal-routing",
    task_id: "SPARSE-SIGNAL-ROUTING-1",
    task_type: "review",
    occurred_at: "2999-01-01T00:00:00.000Z",
    skills_used: ["review-router"],
    routing_result: {
      change_signals: [{ signal: "docs_output_change", evidence: "docs/output.md changed" }],
      required_gates: ["review-output-quality"],
      executed_gates: ["review-output-quality"],
    },
    outcome_metrics: {},
    verification_metrics: {},
    debt_movement_metrics: {},
    evidence_references: ["fixture"],
    privacy_note: {
      raw_prompts_stored: false,
      secrets_stored: false,
      customer_data_stored: false,
      personal_data_stored: false,
      external_publication: false,
    },
  };
  assertSchemaPass("sparse signal-first routing event", metricsSchema, sparseSignalRoutingEvent);
  const invalidTraceEvent = JSON.parse(JSON.stringify(sparseSignalRoutingEvent));
  invalidTraceEvent.routing_result.required_gate_routes = [
    { gate: "review-output-quality", reason: "missing trigger", trigger_signals: [] },
  ];
  invalidTraceEvent.routing_result.skipped_heavy_gates = [
    { gate: "review-adversarial-risk", reason: "missing evidence", observed_evidence: "" },
  ];
  assertSchemaFail("empty signal trace/evidence event", metricsSchema, invalidTraceEvent);
  const pluginMetricsSchema = JSON.parse(readFileSync(resolve(repoRoot, "adapters/claude-code/plugin/schemas/metrics-event.schema.json"), "utf8"));
  assertSchemaFail("empty signal trace/evidence plugin event", pluginMetricsSchema, invalidTraceEvent);

  const taskEvents = [];
  for (let index = 0; index < 5; index += 1) {
    taskEvents.push({
      schema_version: "1.0.0",
      event_id: `evt-file-${index}`,
      task_id: "TASK-1",
      task_type: "implementation",
      occurred_at: "2999-01-01T00:00:00.000Z",
      skills_used: ["controlled-implementation"],
      outcome_metrics: {},
      verification_metrics: {},
      debt_movement_metrics: {},
      evidence_references: ["fixture"],
      privacy_note: {
        raw_prompts_stored: false,
        secrets_stored: false,
        customer_data_stored: false,
        personal_data_stored: false,
        external_publication: false,
      },
    });
  }
  taskEvents.push({
    ...taskEvents[0],
    event_id: "evt-verification-1",
    verification_metrics: { commands_run: [{ command_kind: "test" }] },
  });
  taskEvents.push(
    { ...taskEvents[0], event_id: "evt-command-attempt-1", command_attempt_metrics: { command_kind: "test", classified_as_verification: false } },
    { ...taskEvents[0], event_id: "evt-command-attempt-2", command_attempt_metrics: { command_kind: "test", classified_as_verification: false } },
  );
  taskEvents.push({
    ...taskEvents[0],
    event_id: "evt-verification-2",
    verification_metrics: { commands_run: [{ command_kind: "lint" }] },
  });
  taskEvents.push({
    ...taskEvents[0],
    event_id: "evt-stop",
    outcome_metrics: { task_completed: true },
  });
  const aggregateStore = resolve(root, "docs/ai/metrics/aggregate-events.jsonl");
  writeFileSync(aggregateStore, `${taskEvents.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const summarizeResult = runRepoScript([
    resolve(repoRoot, "scripts/ai-metrics-summarize.mjs"),
    "--event-store",
    aggregateStore,
    "--out",
    resolve(root, "docs/ai/reports/report.json"),
    "--period-start",
    "2999-01-01",
    "--period-end",
    "2999-01-02",
    "--format",
    "json",
  ]);
  assertRuntimePass("metrics summarizer task aggregation smoke", summarizeResult);
  const report = JSON.parse(readFileSync(resolve(root, "docs/ai/reports/report.json"), "utf8"));
  if (
    report.summary.event_count !== 10 ||
    report.summary.tasks_reviewed !== 1 ||
    report.summary.completed_tasks !== 1 ||
    report.summary.command_attempts !== 2 ||
    report.summary.verification_commands !== 2
  ) {
    throw new Error(`summarizer should separate event count from task count\n${JSON.stringify(report.summary, null, 2)}`);
  }

  const reviewEvents = [
    {
      schema_version: "1.0.0",
      event_id: "evt-review-1",
      task_id: "REVIEW-1",
      task_type: "review",
      occurred_at: "2999-01-01T00:00:00.000Z",
      skills_used: ["review-router", "review-final-merge-gate"],
      routing_result: {
        operating_mode: "delivery_quality",
        primary_skill: "review-router",
        correct_routing: true,
        required_gates: ["review-router", "review-final-merge-gate"],
        executed_gates: ["review-router", "review-final-merge-gate"],
      },
      review_result: {
        decision: "request_changes",
        required_fixes_count: 2,
        insufficient_evidence_layers: [],
      },
      outcome_metrics: {},
      verification_metrics: {},
      debt_movement_metrics: {},
      evidence_references: ["fixture"],
      privacy_note: {
        raw_prompts_stored: false,
        secrets_stored: false,
        customer_data_stored: false,
        personal_data_stored: false,
        external_publication: false,
      },
    },
    {
      schema_version: "1.0.0",
      event_id: "evt-review-2",
      task_id: "REVIEW-2",
      task_type: "review",
      occurred_at: "2999-01-01T00:00:00.000Z",
      skills_used: ["review-router"],
      routing_result: {
        operating_mode: "delivery_quality",
        primary_skill: "review-router",
        correct_routing: false,
        required_gates: ["review-router", "review-final-merge-gate"],
        executed_gates: ["review-router"],
        skipped_gates: [{ gate: "review-final-merge-gate", reason: "fixture missing evidence" }],
      },
      review_result: {
        decision: "insufficient_evidence",
        required_fixes_count: 0,
        insufficient_evidence_layers: ["Architecture"],
      },
      outcome_metrics: {},
      verification_metrics: {},
      debt_movement_metrics: {},
      evidence_references: ["fixture"],
      privacy_note: {
        raw_prompts_stored: false,
        secrets_stored: false,
        customer_data_stored: false,
        personal_data_stored: false,
        external_publication: false,
      },
    },
  ];
  const reviewStore = resolve(root, "docs/ai/metrics/review-events.jsonl");
  writeFileSync(reviewStore, `${reviewEvents.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const reviewSummarizeResult = runRepoScript([
    resolve(repoRoot, "scripts/ai-metrics-summarize.mjs"),
    "--event-store",
    reviewStore,
    "--out",
    resolve(root, "docs/ai/reports/review-report.json"),
    "--period-start",
    "2999-01-01",
    "--period-end",
    "2999-01-02",
    "--format",
    "json",
  ]);
  assertRuntimePass("metrics summarizer review coverage smoke", reviewSummarizeResult);
  const reviewReport = JSON.parse(readFileSync(resolve(root, "docs/ai/reports/review-report.json"), "utf8"));
  if (reviewReport.skill_usage.correct_routing_rate !== 0.5 || reviewReport.skill_usage.required_gate_coverage !== 0.75) {
    throw new Error(`summarizer should compute routing and gate coverage when evidence exists\n${JSON.stringify(reviewReport.skill_usage, null, 2)}`);
  }
  if (reviewReport.review_quality.review_tasks !== 2 || reviewReport.review_quality.insufficient_evidence_tasks !== 1 || reviewReport.review_quality.required_fixes_count !== 2) {
    throw new Error(`summarizer should aggregate review decisions without raw review text\n${JSON.stringify(reviewReport.review_quality, null, 2)}`);
  }

  const sparseStore = resolve(root, "docs/ai/metrics/sparse-events.jsonl");
  writeFileSync(sparseStore, `${JSON.stringify({ ...taskEvents[0], event_id: "evt-sparse", task_id: "SPARSE-1" })}\n`);
  const sparseResult = runRepoScript([
    resolve(repoRoot, "scripts/ai-metrics-summarize.mjs"),
    "--event-store",
    sparseStore,
    "--out",
    resolve(root, "docs/ai/reports/sparse-report.json"),
    "--period-start",
    "2999-01-01",
    "--period-end",
    "2999-01-02",
    "--format",
    "json",
  ]);
  assertRuntimePass("metrics summarizer sparse null smoke", sparseResult);
  const sparseReport = JSON.parse(readFileSync(resolve(root, "docs/ai/reports/sparse-report.json"), "utf8"));
  if (sparseReport.instruction_maturity.average_goal_clarity !== null || sparseReport.skill_usage.correct_routing_rate !== null) {
    throw new Error(`sparse metrics should remain unknown/null, not zero\n${JSON.stringify(sparseReport, null, 2)}`);
  }
  const adoptionSchema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/adoption-report.schema.json"), "utf8"));
  assertSchemaPass("generated review adoption report", adoptionSchema, reviewReport);
  assertSchemaPass("generated sparse adoption report", adoptionSchema, sparseReport);
  const goalType = adoptionSchema.properties.instruction_maturity.properties.average_goal_clarity.type;
  const routingType = adoptionSchema.properties.skill_usage.properties.correct_routing_rate.type;
  if (!Array.isArray(goalType) || !goalType.includes("null") || !Array.isArray(routingType) || !routingType.includes("null")) {
    throw new Error("adoption report schema should allow null for unavailable numeric metrics");
  }

  const gateDecisionEvents = [
    {
      schema_version: "1.0.0",
      event_id: "evt-gate-decision-valid",
      task_id: "GATE-1",
      task_type: "review",
      occurred_at: "2999-01-01T00:00:00.000Z",
      skills_used: ["review-router", "review-architecture-impact"],
      routing_result: {
        change_signals: [
          { signal: "public_api_change", evidence: "public API fixture changed" },
          { signal: "docs_output_change", evidence: "output fixture changed" },
        ],
        required_gates: ["review-router", "review-architecture-impact"],
        executed_gates: ["review-router", "review-architecture-impact"],
      },
      gate_decisions: [
        {
          gate: "review-architecture-impact",
          layer: "Architecture",
          status: "executed",
          judgment: "Detailed architecture judgment should stay in JSON only.",
          evidence_checked: ["changed files", "public API surface"],
          triggering_signals: ["public_api_change"],
          missing_inputs: [],
          confidence: "high",
        },
        {
          gate: "review-domain-impact",
          layer: "Domain",
          status: "skipped",
          judgment: "No domain behavior signal detected.",
          evidence_checked: ["changed files"],
          triggering_signals: [],
          missing_inputs: [],
          confidence: "high",
          reason_category: "no_trigger_signal",
        },
        {
          gate: "review-output-quality",
          layer: "Output quality",
          status: "insufficient_evidence",
          judgment: "Output sample was unavailable.",
          evidence_checked: ["changed files"],
          triggering_signals: ["docs_output_change"],
          missing_inputs: ["rendered output sample"],
          confidence: "low",
        },
        {
          gate: "review-code-health",
          layer: "Style / maintainability",
          status: "skipped",
          evidence_checked: ["changed files"],
          triggering_signals: [],
          missing_inputs: [],
          confidence: "medium",
        },
      ],
      outcome_metrics: {},
      verification_metrics: {},
      debt_movement_metrics: {},
      evidence_references: ["fixture"],
      privacy_note: {
        raw_prompts_stored: false,
        secrets_stored: false,
        customer_data_stored: false,
        personal_data_stored: false,
        external_publication: false,
      },
    },
    {
      schema_version: "1.0.0",
      event_id: "evt-gate-decision-under",
      task_id: "GATE-2",
      task_type: "review",
      occurred_at: "2999-01-01T00:00:00.000Z",
      skills_used: ["review-router"],
      routing_result: {
        change_signals: [{ signal: "public_api_change", evidence: "public API fixture changed" }],
      },
      gate_decisions: [
        {
          gate: "review-architecture-impact",
          layer: "Architecture",
          status: "required",
          judgment: "Public API trigger requires architecture review.",
          evidence_checked: ["changed files"],
          triggering_signals: ["public_api_change"],
          missing_inputs: [],
          confidence: "high",
        },
      ],
      outcome_metrics: {},
      verification_metrics: {},
      debt_movement_metrics: {},
      evidence_references: ["fixture"],
      privacy_note: {
        raw_prompts_stored: false,
        secrets_stored: false,
        customer_data_stored: false,
        personal_data_stored: false,
        external_publication: false,
      },
    },
    {
      schema_version: "1.0.0",
      event_id: "evt-gate-decision-over",
      task_id: "GATE-3",
      task_type: "review",
      occurred_at: "2999-01-01T00:00:00.000Z",
      skills_used: ["review-router", "review-adversarial-risk"],
      gate_decisions: [
        {
          gate: "review-adversarial-risk",
          layer: "Adversarial risk overlay",
          status: "executed",
          judgment: "No triggering signal was recorded for this heavy gate.",
          evidence_checked: ["changed files"],
          triggering_signals: [],
          missing_inputs: [],
          confidence: "low",
        },
      ],
      outcome_metrics: {},
      verification_metrics: {},
      debt_movement_metrics: {},
      evidence_references: ["fixture"],
      privacy_note: {
        raw_prompts_stored: false,
        secrets_stored: false,
        customer_data_stored: false,
        personal_data_stored: false,
        external_publication: false,
      },
    },
    {
      schema_version: "1.0.0",
      event_id: "evt-gate-decision-repeat-over-and-justified-skip",
      task_id: "GATE-4",
      task_type: "review",
      occurred_at: "2999-01-01T00:00:00.000Z",
      skills_used: ["review-router", "review-adversarial-risk"],
      gate_decisions: [
        {
          gate: "review-adversarial-risk",
          layer: "Adversarial risk overlay",
          status: "executed",
          judgment: "No triggering signal was recorded for this heavy gate.",
          evidence_checked: ["changed files"],
          triggering_signals: [],
          missing_inputs: [],
          confidence: "low",
        },
        {
          gate: "review-domain-impact",
          layer: "Domain",
          status: "skipped",
          evidence_checked: ["changed files"],
          triggering_signals: [],
          missing_inputs: [],
          confidence: "high",
          reason_category: "no_trigger_signal",
        },
      ],
      outcome_metrics: {},
      verification_metrics: {},
      debt_movement_metrics: {},
      evidence_references: ["fixture"],
      privacy_note: {
        raw_prompts_stored: false,
        secrets_stored: false,
        customer_data_stored: false,
        personal_data_stored: false,
        external_publication: false,
      },
    },
  ];
  for (const event of gateDecisionEvents) {
    assertSchemaPass(`gate decision event ${event.event_id}`, metricsSchema, event);
  }
  const gateDecisionStoreForSummary = resolve(root, "docs/ai/metrics/gate-decision-events.jsonl");
  writeFileSync(gateDecisionStoreForSummary, `${gateDecisionEvents.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const gateDecisionSummaryResult = runRepoScript([
    resolve(repoRoot, "scripts/ai-metrics-summarize.mjs"),
    "--event-store",
    gateDecisionStoreForSummary,
    "--out",
    resolve(root, "docs/ai/reports/gate-decision-report.json"),
    "--period-start",
    "2999-01-01",
    "--period-end",
    "2999-01-02",
    "--format",
    "json",
  ]);
  assertRuntimePass("metrics summarizer gate decision summary", gateDecisionSummaryResult);
  const gateDecisionReport = JSON.parse(readFileSync(resolve(root, "docs/ai/reports/gate-decision-report.json"), "utf8"));
  assertSchemaPass("generated gate decision adoption report", adoptionSchema, gateDecisionReport);
  if (
    gateDecisionReport.gate_decision_summary.total_decisions !== 8 ||
    gateDecisionReport.skill_usage.over_processing_count !== 2 ||
    gateDecisionReport.skill_usage.under_processing_count !== 1 ||
    gateDecisionReport.gate_decision_summary.missing_skip_reason_count !== 1 ||
    !gateDecisionReport.gate_decision_summary.skipped_by_reason_category.some((entry) => entry.category === "no_trigger_signal" && entry.count === 2) ||
    !gateDecisionReport.gate_decision_summary.insufficient_evidence.some((entry) => entry.gate === "review-output-quality" && entry.layer === "Output quality") ||
    !gateDecisionReport.gate_decision_summary.under_processing_warnings.some((entry) => entry.gate === "review-architecture-impact" && entry.count === 1) ||
    !gateDecisionReport.gate_decision_summary.over_processing_warnings.some((entry) => entry.gate === "review-adversarial-risk" && entry.count === 2) ||
    !gateDecisionReport.gate_decision_summary.top_gate_deviation_patterns.some((entry) => entry.deviation_type === "over_processing" && entry.gate === "review-adversarial-risk" && entry.count === 2) ||
    gateDecisionReport.gate_decision_summary.top_gate_deviation_patterns.some((entry) => entry.deviation_type === "missing_skip_reason" && entry.gate === "review-domain-impact") ||
    !gateDecisionReport.gate_decision_summary.top_gate_deviation_patterns.some((entry) => entry.deviation_type === "missing_skip_reason" && entry.gate === "review-code-health" && entry.count === 1) ||
    !gateDecisionReport.gate_decision_drilldown.some((entry) => entry.judgment === "Detailed architecture judgment should stay in JSON only.")
  ) {
    throw new Error(`gate decision report should summarize deviations and preserve JSON drill-down\n${JSON.stringify(gateDecisionReport, null, 2)}`);
  }
  const gateDecisionMarkdownResult = runRepoScript([
    resolve(repoRoot, "scripts/ai-metrics-summarize.mjs"),
    "--event-store",
    gateDecisionStoreForSummary,
    "--out",
    resolve(root, "docs/ai/reports/gate-decision-report.md"),
    "--period-start",
    "2999-01-01",
    "--period-end",
    "2999-01-02",
  ]);
  assertRuntimePass("metrics summarizer concise gate decision markdown", gateDecisionMarkdownResult);
  const gateDecisionMarkdown = readFileSync(resolve(root, "docs/ai/reports/gate-decision-report.md"), "utf8");
  if (
    !gateDecisionMarkdown.includes("Skipped gate categories") ||
    !gateDecisionMarkdown.includes("Under-processing warnings") ||
    !gateDecisionMarkdown.includes("Top gate deviations") ||
    !gateDecisionMarkdown.includes("over_processing:review-adversarial-risk=2") ||
    gateDecisionMarkdown.includes("Detailed architecture judgment should stay in JSON only.")
  ) {
    throw new Error(`markdown adoption report should show concise gate summaries only\n${gateDecisionMarkdown}`);
  }

  const routingEvent = ({ event_id, task_id, routing_result, review_result = {}, changed_file_summary }) => ({
    schema_version: "1.0.0",
    event_id,
    task_id,
    task_type: "review",
    occurred_at: "2999-01-01T00:00:00.000Z",
    skills_used: ["review-router"],
    routing_result,
    review_result,
    changed_file_summary,
    outcome_metrics: {},
    verification_metrics: {},
    debt_movement_metrics: {},
    evidence_references: ["fixture"],
    privacy_note: {
      raw_prompts_stored: false,
      secrets_stored: false,
      customer_data_stored: false,
      personal_data_stored: false,
      external_publication: false,
    },
  });

  const summarizeEvents = (name, events) => {
    const store = resolve(root, `docs/ai/metrics/${name}.jsonl`);
    const out = resolve(root, `docs/ai/reports/${name}.json`);
    writeFileSync(store, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
    const result = runRepoScript([
      resolve(repoRoot, "scripts/ai-metrics-summarize.mjs"),
      "--event-store",
      store,
      "--out",
      out,
      "--period-start",
      "2999-01-01",
      "--period-end",
      "2999-01-02",
      "--format",
      "json",
    ]);
    assertRuntimePass(`metrics summarizer ${name}`, result);
    const report = JSON.parse(readFileSync(out, "utf8"));
    assertSchemaPass(`generated ${name} adoption report`, adoptionSchema, report);
    return report;
  };

  const lightReport = summarizeEvents("light-routing-report", [
    routingEvent({
      event_id: "evt-light-routing",
      task_id: "LIGHT-ROUTE-1",
      changed_file_summary: { count: 1, paths: ["docs/ok.md"] },
      routing_result: {
        required_gates: ["review-router", "review-final-merge-gate"],
        executed_gates: ["review-router", "review-final-merge-gate"],
        gate_applicability: [
          {
            layer: "Domain",
            status: "skipped",
            gate: "review-domain-impact",
            reason: "Docs typo change has no business-rule, workflow, reporting, permission, or state-semantics signal.",
            evidence: "changed_file_summary paths only docs/ok.md",
            trigger_signals: [],
          },
          {
            layer: "Architecture",
            status: "skipped",
            gate: "review-architecture-impact",
            reason: "Docs typo change has no public API, dependency direction, persistence, ownership, or lifecycle signal.",
            evidence: "changed_file_summary paths only docs/ok.md",
            trigger_signals: [],
          },
          {
            layer: "Adversarial risk overlay",
            status: "skipped",
            gate: "review-adversarial-risk",
            reason: "Docs typo change has no untrusted input, security/privacy, prompt, misuse, or critical workflow signal.",
            evidence: "changed_file_summary paths only docs/ok.md",
            trigger_signals: [],
          },
        ],
      },
    }),
  ]);
  if (
    lightReport.skill_usage.required_gate_coverage !== 1 ||
    lightReport.skill_usage.over_processing_count !== 0 ||
    lightReport.skill_usage.missing_evidence_count !== 0 ||
    lightReport.adoption_effect.weak_signal.some((signal) => /Under-processing|Over-processing|Missing evidence/.test(signal))
  ) {
    throw new Error(`light routing should not require heavy gates without triggers\n${JSON.stringify(lightReport.skill_usage, null, 2)}`);
  }

  const boundaryReport = summarizeEvents("boundary-routing-report", [
    routingEvent({
      event_id: "evt-boundary-routing",
      task_id: "BOUNDARY-ROUTE-1",
      changed_file_summary: { count: 1, paths: ["schemas/public-api.schema.json"] },
      routing_result: {
        change_signals: [{ signal: "public_api_change", evidence: "schema changed" }],
        required_gates: ["review-router", "review-architecture-impact", "review-final-merge-gate"],
        executed_gates: ["review-router", "review-architecture-impact", "review-final-merge-gate"],
        gate_applicability: [
          {
            layer: "Architecture",
            status: "required",
            gate: "review-architecture-impact",
            reason: "Public schema contract changed.",
            evidence: "changed_file_summary includes schemas/public-api.schema.json",
            trigger_signals: ["public_api_change"],
          },
        ],
      },
    }),
  ]);
  if (
    boundaryReport.skill_usage.required_gate_coverage !== 1 ||
    boundaryReport.adoption_effect.weak_signal.some((signal) => /Under-processing|Over-processing|Missing evidence/.test(signal))
  ) {
    throw new Error(`boundary/API change should require and execute architecture gate without deviation warnings\n${JSON.stringify(boundaryReport.skill_usage, null, 2)}`);
  }

  const signalFirstReport = summarizeEvents("signal-first-routing-report", [
    routingEvent({
      event_id: "evt-signal-first-routing",
      task_id: "SIGNAL-FIRST-1",
      changed_file_summary: { count: 1, paths: ["schemas/public-api.schema.json"] },
      routing_result: {
        change_signals: [{ signal: "public_api_change", evidence: "schema file changed" }],
        required_gates: ["review-router", "review-architecture-impact"],
        executed_gates: ["review-router", "review-architecture-impact"],
      },
    }),
  ]);
  if (signalFirstReport.skill_usage.over_processing_count !== 0) {
    throw new Error(`signal-first routing should preserve trigger evidence without requiring a diagnostic layer matrix\n${JSON.stringify(signalFirstReport, null, 2)}`);
  }

  const signalMappingReport = summarizeEvents("signal-mapping-routing-report", [
    routingEvent({
      event_id: "evt-mismatched-generated-output",
      task_id: "MISMATCHED-GENERATED-OUTPUT-1",
      routing_result: {
        change_signals: [{ signal: "generated_output_change", evidence: "generated response changed" }],
        required_gates: ["review-adversarial-risk"],
        required_gate_routes: [
          { gate: "review-adversarial-risk", reason: "incorrectly mapped output change", trigger_signals: ["generated_output_change"] },
        ],
        executed_gates: ["review-adversarial-risk"],
      },
    }),
    routingEvent({
      event_id: "evt-negated-security-signal",
      task_id: "NEGATED-SECURITY-SIGNAL-1",
      routing_result: {
        change_signals: [{ signal: "no security impact", evidence: "docs-only change" }],
        required_gates: ["review-adversarial-risk"],
        executed_gates: ["review-adversarial-risk"],
      },
    }),
    routingEvent({
      event_id: "evt-invented-route-signal",
      task_id: "INVENTED-ROUTE-SIGNAL-1",
      routing_result: {
        change_signals: [{ signal: "public_api_change", evidence: "schema changed" }],
        required_gates: ["review-architecture-impact"],
        required_gate_routes: [
          { gate: "review-architecture-impact", reason: "invented signal", trigger_signals: ["invented_signal"] },
        ],
        executed_gates: ["review-architecture-impact"],
      },
    }),
    routingEvent({
      event_id: "evt-japanese-signal",
      task_id: "JAPANESE-SIGNAL-1",
      routing_result: {
        change_signals: [{ signal: "公開API変更", evidence: "公開スキーマが変更された" }],
        required_gates: ["review-architecture-impact"],
        executed_gates: ["review-architecture-impact"],
      },
    }),
  ]);
  if (
    signalMappingReport.skill_usage.over_processing_count !== 3 ||
    signalMappingReport.adoption_effect.weak_signal.filter((signal) => signal.includes("Over-processing")).length !== 3
  ) {
    throw new Error(`gate triggers must match observed signal ids and deterministic gate mapping\n${JSON.stringify(signalMappingReport, null, 2)}`);
  }

  const compactMissingEvidenceReport = summarizeEvents("compact-missing-evidence-routing-report", [
    routingEvent({
      event_id: "evt-compact-missing-evidence",
      task_id: "COMPACT-MISSING-EVIDENCE-1",
      routing_result: {
        change_signals: [{ signal: "verification", evidence: "behavior changed" }],
        required_gates: ["review-automated-gate"],
        required_gate_routes: [
          { gate: "review-automated-gate", reason: "Verification evidence is required.", trigger_signals: ["verification"] },
        ],
        executed_gates: ["review-router"],
        missing_evidence: [{ input: "verification command output", reason: "Focused command output is unavailable." }],
      },
    }),
  ]);
  if (
    compactMissingEvidenceReport.summary.insufficient_evidence !== 1 ||
    compactMissingEvidenceReport.skill_usage.missing_evidence_count !== 1 ||
    compactMissingEvidenceReport.skill_usage.under_processing_count !== 1
  ) {
    throw new Error(`compact missing evidence should remain insufficient evidence\n${JSON.stringify(compactMissingEvidenceReport, null, 2)}`);
  }

  const unexecutedHeavyGateReport = summarizeEvents("unexecuted-heavy-gate-routing-report", [
    routingEvent({
      event_id: "evt-unexecuted-heavy-gate",
      task_id: "UNEXECUTED-HEAVY-GATE-1",
      routing_result: {
        required_gates: ["review-architecture-impact"],
        executed_gates: [],
      },
    }),
  ]);
  if (
    unexecutedHeavyGateReport.skill_usage.under_processing_count !== 1 ||
    unexecutedHeavyGateReport.skill_usage.over_processing_count !== 0
  ) {
    throw new Error(`unexecuted heavy gate should be under-processing only\n${JSON.stringify(unexecutedHeavyGateReport, null, 2)}`);
  }

  const missingHeavyApplicabilityReport = summarizeEvents("missing-heavy-applicability-routing-report", [
    routingEvent({
      event_id: "evt-missing-heavy-applicability",
      task_id: "MISSING-HEAVY-APP-1",
      changed_file_summary: { count: 1, paths: ["schemas/public-api.schema.json"] },
      routing_result: {
        required_gates: ["review-router", "review-architecture-impact"],
        executed_gates: ["review-router", "review-architecture-impact"],
      },
    }),
  ]);
  if (
    missingHeavyApplicabilityReport.skill_usage.over_processing_count !== 1 ||
    !missingHeavyApplicabilityReport.adoption_effect.weak_signal.some((signal) => signal.includes("Over-processing") && signal.includes("review-architecture-impact"))
  ) {
    throw new Error(`heavy gate required/executed without applicability evidence should be flagged\n${JSON.stringify(missingHeavyApplicabilityReport, null, 2)}`);
  }

  const missingHeavyTriggerReport = summarizeEvents("missing-heavy-trigger-routing-report", [
    routingEvent({
      event_id: "evt-missing-heavy-trigger",
      task_id: "MISSING-HEAVY-TRIGGER-1",
      changed_file_summary: { count: 1, paths: ["schemas/public-api.schema.json"] },
      routing_result: {
        required_gates: ["review-router", "review-architecture-impact"],
        executed_gates: ["review-router", "review-architecture-impact"],
        gate_applicability: [
          {
            layer: "Architecture",
            status: "required",
            gate: "review-architecture-impact",
            reason: "Architecture gate was selected but no trigger signal was recorded.",
            evidence: "changed_file_summary includes schemas/public-api.schema.json",
            trigger_signals: [],
          },
        ],
      },
    }),
  ]);
  if (
    missingHeavyTriggerReport.skill_usage.over_processing_count !== 1 ||
    !missingHeavyTriggerReport.adoption_effect.weak_signal.some((signal) => signal.includes("Over-processing") && signal.includes("review-architecture-impact"))
  ) {
    throw new Error(`heavy gate required/executed without trigger signals should be flagged\n${JSON.stringify(missingHeavyTriggerReport, null, 2)}`);
  }

  const missingEvidenceReport = summarizeEvents("missing-evidence-routing-report", [
    routingEvent({
      event_id: "evt-missing-routing-evidence",
      task_id: "MISSING-ROUTE-1",
      routing_result: {
        required_gates: ["review-router"],
        executed_gates: ["review-router"],
        gate_applicability: [
          {
            layer: "Architecture",
            status: "insufficient_evidence",
            gate: "review-architecture-impact",
            reason: "Changed files and diff were unavailable, so architecture impact cannot be skipped.",
            evidence: "routing input omitted changed_file_summary and diff reference",
            trigger_signals: [],
            inputs_still_needed: ["changed files", "diff"],
          },
        ],
      },
    }),
  ]);
  if (
    missingEvidenceReport.summary.insufficient_evidence !== 1 ||
    !missingEvidenceReport.adoption_effect.weak_signal.some((signal) => signal.includes("Missing evidence") && signal.includes("review-architecture-impact"))
  ) {
    throw new Error(`missing changed-file/context evidence should become insufficient evidence\n${JSON.stringify(missingEvidenceReport, null, 2)}`);
  }

  const missingRequiredGateReport = summarizeEvents("missing-required-gate-routing-report", [
    routingEvent({
      event_id: "evt-missing-required-gate",
      task_id: "MISSING-GATE-ROUTE-1",
      changed_file_summary: { count: 1, paths: ["docs/output.md"] },
      routing_result: {
        required_gates: ["review-router"],
        executed_gates: ["review-router"],
        gate_applicability: [
          {
            layer: "Output quality",
            status: "required",
            reason: "Rendered output changed but the gate id was omitted.",
            evidence: "changed_file_summary includes docs/output.md",
            trigger_signals: ["docs_output_change"],
          },
        ],
      },
    }),
  ]);
  if (
    missingRequiredGateReport.summary.insufficient_evidence !== 1 ||
    missingRequiredGateReport.skill_usage.missing_evidence_count !== 1 ||
    !missingRequiredGateReport.adoption_effect.weak_signal.some((signal) => signal.includes("Missing evidence") && signal.includes("Output quality") && signal.includes("missing a gate id"))
  ) {
    throw new Error(`required gate applicability without gate id should be flagged as missing evidence\n${JSON.stringify(missingRequiredGateReport, null, 2)}`);
  }

  const underProcessingReport = summarizeEvents("under-processing-routing-report", [
    routingEvent({
      event_id: "evt-under-processing",
      task_id: "UNDER-ROUTE-1",
      changed_file_summary: { count: 1, paths: ["schemas/public-api.schema.json"] },
      routing_result: {
        required_gates: ["review-router", "review-architecture-impact"],
        executed_gates: ["review-router"],
        gate_applicability: [
          {
            layer: "Architecture",
            status: "required",
            gate: "review-architecture-impact",
            reason: "Public schema contract changed.",
            evidence: "changed_file_summary includes schemas/public-api.schema.json",
            trigger_signals: ["public_api_change"],
          },
        ],
      },
    }),
  ]);
  if (
    underProcessingReport.skill_usage.required_gate_coverage !== 0.5 ||
    !underProcessingReport.adoption_effect.weak_signal.some((signal) => signal.includes("Under-processing") && signal.includes("review-architecture-impact"))
  ) {
    throw new Error(`required gate not executed should be flagged\n${JSON.stringify(underProcessingReport.skill_usage, null, 2)}`);
  }

  const overProcessingReport = summarizeEvents("over-processing-routing-report", [
    routingEvent({
      event_id: "evt-over-processing",
      task_id: "OVER-ROUTE-1",
      changed_file_summary: { count: 1, paths: ["docs/ok.md"] },
      routing_result: {
        required_gates: ["review-router"],
        executed_gates: ["review-router", "review-adversarial-risk"],
        gate_applicability: [
          {
            layer: "Adversarial risk overlay",
            status: "skipped",
            gate: "review-adversarial-risk",
            reason: "Docs typo change has no untrusted input, security/privacy, prompt, misuse, or critical workflow signal.",
            evidence: "changed_file_summary paths only docs/ok.md",
            trigger_signals: [],
          },
        ],
      },
    }),
  ]);
  if (
    overProcessingReport.skill_usage.over_processing_count !== 1 ||
    !overProcessingReport.adoption_effect.weak_signal.some((signal) => signal.includes("Over-processing") && signal.includes("review-adversarial-risk"))
  ) {
    throw new Error(`heavy gate selected without triggering signals should be flagged\n${JSON.stringify(overProcessingReport.skill_usage, null, 2)}`);
  }

  const ledgerRoot = resolve(root, "ledger");
  writeImprovementLedger(
    ledgerRoot,
    improvementLedgerFixture({
      openRows: [ledgerRow({ ID: "IMP-0001", Status: "planned", "Refresh date": "2999-12-31" })],
    }),
  );
  const candidatesPath = resolve(ledgerRoot, "candidates.json");
  writeFileSync(
    candidatesPath,
    JSON.stringify([
      {
        source: "PR #1",
        finding: "Non-blocking debt",
        evidence: "Verified: review output",
        impact: "Can recur",
        recommended_action: "Track separately",
        close_condition: "Follow-up issue is created",
        refresh_date: "2999-12-31",
      },
    ]),
  );
  const ledgerEvents = resolve(ledgerRoot, "docs/ai/metrics/events.jsonl");
  const ledgerResult = runRepoScript([
    resolve(repoRoot, "scripts/ai-ledger-refresh.mjs"),
    "--ledger",
    resolve(ledgerRoot, "docs/ai/improvement-ledger.md"),
    "--candidates",
    candidatesPath,
    "--write",
    "--task-id",
    "LEDGER-1",
    "--event-store",
    ledgerEvents,
    "--json",
  ]);
  assertRuntimePass("ledger refresh delta smoke", ledgerResult);
  const ledgerEvent = JSON.parse(readFileSync(ledgerEvents, "utf8"));
  if (ledgerEvent.debt_movement_metrics.debt_items_recorded !== 1 || ledgerEvent.debt_movement_metrics.debt_items_planned) {
    throw new Error(`ledger refresh should write movement delta, not full inventory\n${JSON.stringify(ledgerEvent, null, 2)}`);
  }
  if (ledgerEvent.debt_inventory_snapshot.planned !== 1 || ledgerEvent.debt_inventory_snapshot.triaged !== 1) {
    throw new Error(`ledger refresh should include full inventory as snapshot\n${JSON.stringify(ledgerEvent.debt_inventory_snapshot, null, 2)}`);
  }
}

function assertInstallerScripts() {
  const coreInstaller = resolve(repoRoot, "scripts/install-kernel.mjs");
  const installer = resolve(repoRoot, "scripts/install-claude-adapter.mjs");
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8"));
  const target = resolve(fixtureRoot, "install-target");
  assertRuntimePass("installer core setup", runRepoScript([coreInstaller, "--target", target]));
  mkdirSync(resolve(target, ".claude"), { recursive: true });
  writeFileSync(
    resolve(target, ".claude/settings.json"),
    JSON.stringify(
      {
        hooks: {
          Stop: [
            {
              matcher: "Custom",
              hooks: [{ type: "command", command: "echo unrelated" }],
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  mkdirSync(resolve(target, ".claude/hooks"), { recursive: true });
  writeFileSync(resolve(target, ".claude/hooks/hooks.json"), readFileSync(resolve(repoRoot, "adapters/claude-code/project/.claude/hooks/hooks.json"), "utf8"));

  const firstInstall = runRepoScript([installer, "--target", target]);
  assertRuntimePass("installer first run", firstInstall);
  assertInstalledDocReferences("Claude adapter install smoke", target, [".claude/skills", ".claude/commands"]);
  if (!existsSync(resolve(target, "docs/lifecycle-artifact-contract.md")) || !existsSync(resolve(target, "docs/lifecycle-traceability-contract.md"))) {
    throw new Error("Claude adapter install must provide the canonical lifecycle and traceability contracts");
  }
  const installedSignalRegistry = resolve(target, "schemas/review-signal-gate-map.json");
  if (!existsSync(installedSignalRegistry) || readFileSync(installedSignalRegistry, "utf8") !== readFileSync(resolve(repoRoot, "schemas/review-signal-gate-map.json"), "utf8")) {
    throw new Error("Claude project installer should project the canonical signal registry");
  }
  const firstClaudeState = JSON.parse(readFileSync(resolve(target, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  if (!/^sha256:[a-f0-9]{64}$/.test(firstClaudeState.applied_provenance?.fingerprint ?? "") || !firstClaudeState.applied_provenance?.source_revision || !firstClaudeState.applied_provenance?.target_partial_file_state_digest) {
    throw new Error(`Claude adapter state must record applied provenance\n${JSON.stringify(firstClaudeState.applied_provenance, null, 2)}`);
  }
  if (!firstClaudeState.required_assets?.includes("docs/lifecycle-artifact-contract.md") || !firstClaudeState.required_assets?.includes("docs/lifecycle-traceability-contract.md")) {
    throw new Error("Claude adapter state must record lifecycle and traceability contracts as required managed dependencies");
  }
  if (Object.hasOwn(firstClaudeState.managed_files ?? {}, "docs/lifecycle-artifact-contract.md") || Object.hasOwn(firstClaudeState.managed_files ?? {}, "docs/lifecycle-traceability-contract.md")) {
    throw new Error("Claude adapter must not claim ownership of core lifecycle contracts");
  }
  if (Object.hasOwn(firstClaudeState.managed_files ?? {}, "schemas/review-signal-gate-map.json")) {
    throw new Error("Claude project installer must not claim ownership of the core canonical signal registry");
  }
  if (
    !firstInstall.stdout.includes("- initialize: docs/ai/improvement-ledger.md") ||
    !firstInstall.stdout.includes("- initialize: docs/ai/skill-adoption-metrics.md")
  ) {
    throw new Error(`installer first run should initialize project-owned ledger assets\n${firstInstall.stdout}`);
  }

  const projectLedger = "# Project improvement ledger\n\nProject-owned evidence must survive adapter updates.\n";
  const projectMetrics = "# Project adoption metrics\n\nProject-owned metric definitions must survive adapter updates.\n";
  const projectEvents = '{"event_id":"project-owned-event"}\n';
  const projectReport = "# Project-owned report\n";
  writeFileSync(resolve(target, "docs/ai/improvement-ledger.md"), projectLedger);
  writeFileSync(resolve(target, "docs/ai/skill-adoption-metrics.md"), projectMetrics);
  writeFileSync(resolve(target, "docs/ai/metrics/events.jsonl"), projectEvents);
  writeFileSync(resolve(target, "docs/ai/reports/project-report.md"), projectReport);

  const fullDryRun = runRepoScript([installer, "--target", target, "--profile", "full", "--dry-run"]);
  assertRuntimePass("installer full dry run with project state", fullDryRun);
  if (
    !fullDryRun.stdout.includes("- preserve: docs/ai/improvement-ledger.md") ||
    !fullDryRun.stdout.includes("- preserve: docs/ai/skill-adoption-metrics.md") ||
    !fullDryRun.stdout.includes("- refresh: docs/ai/adoption-report-template.md")
  ) {
    throw new Error(`installer dry run should distinguish preserved state from refreshed references\n${fullDryRun.stdout}`);
  }

  assertRuntimePass("installer full rerun", runRepoScript([installer, "--target", target, "--profile", "full"]));
  assertRuntimePass("installer observability rerun", runRepoScript([installer, "--target", target, "--profile", "observability"]));
  for (const [path, expected] of [
    ["docs/ai/improvement-ledger.md", projectLedger],
    ["docs/ai/skill-adoption-metrics.md", projectMetrics],
    ["docs/ai/metrics/events.jsonl", projectEvents],
    ["docs/ai/reports/project-report.md", projectReport],
  ]) {
    const actual = readFileSync(resolve(target, path), "utf8");
    if (actual !== expected) {
      throw new Error(`installer should preserve project-owned state on full and observability reruns: ${path}`);
    }
  }

  const settings = JSON.parse(readFileSync(resolve(target, ".claude/settings.json"), "utf8"));
  const identities = hookIdentities(settings.hooks);
  if (identities.length !== new Set(identities).size) {
    throw new Error(`installer should not duplicate hook commands\n${JSON.stringify(settings.hooks, null, 2)}`);
  }
  if (!identities.some((identity) => identity.includes("echo unrelated"))) {
    throw new Error(`installer should preserve unrelated hooks\n${JSON.stringify(settings.hooks, null, 2)}`);
  }
  if (existsSync(resolve(target, ".claude/hooks/hooks.json"))) {
    throw new Error("installer should remove legacy adapter-owned .claude/hooks/hooks.json and use settings.json as hook source of truth");
  }
  const claudeState = JSON.parse(readFileSync(resolve(target, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  if (
    claudeState.schema_version !== 3 ||
    claudeState.install_status !== "installed" ||
    claudeState.selected_profile !== "observability" ||
    !Array.isArray(claudeState.managed_hooks) ||
    claudeState.managed_hooks.length === 0 ||
    !claudeState.managed_partial_files?.[".claude/settings.json"]?.sha256
  ) {
    throw new Error(`installer should write shared Claude lifecycle state\n${JSON.stringify(claudeState, null, 2)}`);
  }
  writeFileSync(resolve(target, ".claude/commands/skill-handoff.md"), "# local command change\n");
  assertRuntimeFail(
    "installer local managed command conflict",
    runRepoScript([installer, "--target", target]),
    "managed file conflict",
  );
  assertRuntimePass("installer force updates managed command", runRepoScript([installer, "--target", target, "--force"]));
  if (readFileSync(resolve(target, ".claude/commands/skill-handoff.md"), "utf8") !== readFileSync(resolve(repoRoot, "adapters/claude-code/project/.claude/commands/skill-handoff.md"), "utf8")) {
    throw new Error("installer --force should refresh locally modified managed commands");
  }
  if (!existsSync(resolve(target, "docs/ai/improvement-ledger.md")) || !existsSync(resolve(target, "docs/ai/skill-adoption-metrics.md")) || !existsSync(resolve(target, "docs/debt-lifecycle-contract.md"))) {
    throw new Error("installer should project command-required docs and ledger assets");
  }
  const projectLedgerContent = "# Project Improvement Ledger\n\nproject-specific ledger entry must survive reinstall\n";
  const projectMetricsContent = "# Project Skill Adoption Metrics\n\nproject-specific adoption metrics must survive reinstall\n";
  writeFileSync(resolve(target, "docs/ai/improvement-ledger.md"), projectLedgerContent);
  writeFileSync(resolve(target, "docs/ai/skill-adoption-metrics.md"), projectMetricsContent);
  assertRuntimePass("installer full preserves project state assets", runRepoScript([installer, "--target", target]));
  if (
    readFileSync(resolve(target, "docs/ai/improvement-ledger.md"), "utf8") !== projectLedgerContent ||
    readFileSync(resolve(target, "docs/ai/skill-adoption-metrics.md"), "utf8") !== projectMetricsContent
  ) {
    throw new Error("installer full profile rerun should preserve existing project state assets");
  }
  assertRuntimePass("installer observability preserves project state assets", runRepoScript([installer, "--target", target, "--profile", "observability"]));
  if (
    readFileSync(resolve(target, "docs/ai/improvement-ledger.md"), "utf8") !== projectLedgerContent ||
    readFileSync(resolve(target, "docs/ai/skill-adoption-metrics.md"), "utf8") !== projectMetricsContent
  ) {
    throw new Error("installer observability profile rerun should preserve existing project state assets");
  }

  const implementationTarget = resolve(fixtureRoot, "install-implementation-profile-target");
  assertRuntimePass("installer implementation profile core setup", runRepoScript([coreInstaller, "--target", implementationTarget]));
  assertRuntimePass("installer implementation profile", runRepoScript([installer, "--target", implementationTarget, "--profile", "implementation"]));
  for (const skill of ["repository-orientation", "scope-control", "application-boundary-architecture"]) {
    if (!existsSync(resolve(implementationTarget, ".claude/skills", skill, "SKILL.md"))) {
      throw new Error(`implementation profile should include router-reachable skill: ${skill}`);
    }
  }
  if (existsSync(resolve(implementationTarget, ".claude/commands/skill-review.md"))) {
    throw new Error("implementation profile should not install review command");
  }

  for (const [profile, packName] of [["daily", "daily_delivery"], ["organizational", "organizational_intelligence"]]) {
    const profileTarget = resolve(fixtureRoot, `install-${profile}-profile-target`);
    assertRuntimePass(`installer ${profile} profile core setup`, runRepoScript([coreInstaller, "--target", profileTarget]));
    assertRuntimePass(`installer ${profile} profile`, runRepoScript([installer, "--target", profileTarget, "--profile", profile]));
    const profileState = JSON.parse(readFileSync(resolve(profileTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
    const expectedSkills = [...manifest.projection_packs[packName].skills].sort();
    const expectedPlanes = packName === "daily_delivery" ? ["execution", "control"] : ["execution", "knowledge", "control"];
    if (
      JSON.stringify(profileState.selected_skills) !== JSON.stringify(expectedSkills) ||
      profileState.selected_projection_pack !== packName ||
      profileState.selection_mode !== "projection_pack" ||
      JSON.stringify(profileState.selected_planes) !== JSON.stringify(expectedPlanes) ||
      JSON.stringify(profileState.installed_planes) !== JSON.stringify(expectedPlanes) ||
      profileState.knowledge_write_policy !== "explicit_only"
    ) {
      throw new Error(`Claude ${profile} profile must match manifest projection pack ${packName}\n${JSON.stringify(profileState, null, 2)}`);
    }
    if (profile === "daily") {
      const fixtures = new Map((profileState.skill_closure?.routing_fixtures ?? []).map((fixture) => [fixture.id, fixture]));
      for (const id of ["daily_implementation_available", "daily_review_available"]) {
        if (fixtures.get(id)?.outcome !== "available" || !profileState.selected_skills.includes(fixtures.get(id)?.selected_route)) {
          throw new Error(`Claude daily available fixture '${id}' is invalid\n${JSON.stringify(profileState, null, 2)}`);
        }
      }
      for (const id of ["daily_knowledge_capability_missing", "daily_adoption_capability_missing", "daily_observability_capability_missing"]) {
        if (fixtures.get(id)?.outcome !== "capability_missing" || profileState.selected_skills.includes(fixtures.get(id)?.selected_route) || fixtures.get(id)?.recommended_profile !== "organizational") {
          throw new Error(`Claude daily capability fixture '${id}' is not fail-closed\n${JSON.stringify(profileState, null, 2)}`);
        }
      }
    }
  }

  const claudeStalePlaneTarget = resolve(fixtureRoot, "install-claude-stale-installed-planes");
  assertRuntimePass("Claude stale plane core setup", runRepoScript([coreInstaller, "--target", claudeStalePlaneTarget]));
  assertRuntimePass("Claude stale plane organizational setup", runRepoScript([installer, "--target", claudeStalePlaneTarget, "--profile", "organizational"]));
  assertRuntimePass("Claude stale plane implementation transition", runRepoScript([installer, "--target", claudeStalePlaneTarget, "--profile", "implementation"]));
  const claudeStalePlaneState = JSON.parse(readFileSync(resolve(claudeStalePlaneTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  if (JSON.stringify(claudeStalePlaneState.selected_planes) !== JSON.stringify(["execution", "control"]) || JSON.stringify(claudeStalePlaneState.installed_planes) !== JSON.stringify(["execution", "knowledge", "control"])) {
    throw new Error(`Claude selected/installed planes must distinguish retained stale skills\n${JSON.stringify(claudeStalePlaneState, null, 2)}`);
  }

  for (const sourceProfile of ["organizational", "full"]) {
    const transitionTarget = resolve(fixtureRoot, `install-claude-${sourceProfile}-to-daily`);
    assertRuntimePass(`Claude ${sourceProfile} to daily core setup`, runRepoScript([coreInstaller, "--target", transitionTarget]));
    assertRuntimePass(`Claude ${sourceProfile} setup`, runRepoScript([installer, "--target", transitionTarget, "--profile", sourceProfile]));
    assertRuntimeFail(
      `Claude ${sourceProfile} to daily requires prune`,
      runRepoScript([installer, "--target", transitionTarget, "--profile", "daily"]),
      "--prune",
    );
    assertRuntimePass(`Claude ${sourceProfile} to daily prune`, runRepoScript([installer, "--target", transitionTarget, "--profile", "daily", "--prune"]));
    assertNoKnowledgeSkills(`Claude ${sourceProfile} to daily`, transitionTarget, ".claude/skills", manifest);
  }

  const modifiedKnowledgeTarget = resolve(fixtureRoot, "install-claude-modified-knowledge-to-daily");
  assertRuntimePass("Claude modified knowledge core setup", runRepoScript([coreInstaller, "--target", modifiedKnowledgeTarget]));
  assertRuntimePass("Claude modified knowledge organizational setup", runRepoScript([installer, "--target", modifiedKnowledgeTarget, "--profile", "organizational"]));
  const modifiedClaudeKnowledgePath = resolve(modifiedKnowledgeTarget, ".claude/skills/domain-rule-ledger/SKILL.md");
  writeFileSync(modifiedClaudeKnowledgePath, `${readFileSync(modifiedClaudeKnowledgePath, "utf8")}\nLocal modification.\n`);
  assertRuntimeFail(
    "Claude modified knowledge shrink is protected",
    runRepoScript([installer, "--target", modifiedKnowledgeTarget, "--profile", "daily", "--prune"]),
    "modified managed file",
  );
  if (!existsSync(modifiedClaudeKnowledgePath)) throw new Error("Claude modified knowledge skill must be preserved on failed shrink");

  const claudeOverrideTarget = resolve(fixtureRoot, "install-claude-daily-custom-override");
  const claudeOverrideSkills = [...manifest.projection_packs.daily_delivery.skills, "domain-rule-ledger"].join(",");
  assertRuntimePass("Claude custom override core setup", runRepoScript([coreInstaller, "--target", claudeOverrideTarget]));
  assertRuntimePass("Claude custom override", runRepoScript([installer, "--target", claudeOverrideTarget, "--profile", "daily", "--skills", claudeOverrideSkills]));
  const claudeOverrideState = JSON.parse(readFileSync(resolve(claudeOverrideTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  if (
    claudeOverrideState.selection_mode !== "custom" ||
    claudeOverrideState.selected_projection_pack !== null ||
    JSON.stringify(claudeOverrideState.selected_planes) !== JSON.stringify(["execution", "knowledge", "control"]) ||
    JSON.stringify(claudeOverrideState.installed_planes) !== JSON.stringify(["execution", "knowledge", "control"])
  ) {
    throw new Error(`Claude custom override state is not honest\n${JSON.stringify(claudeOverrideState, null, 2)}`);
  }

  const corePruneOwnershipTarget = resolve(fixtureRoot, "install-claude-core-prune-ownership");
  assertRuntimePass("Claude ownership full core setup", runRepoScript([coreInstaller, "--target", corePruneOwnershipTarget]));
  assertRuntimePass("Claude ownership adapter setup", runRepoScript([installer, "--target", corePruneOwnershipTarget, "--profile", "implementation"]));
  assertRuntimePass("Claude ownership core shrink prune", runRepoScript([coreInstaller, "--target", corePruneOwnershipTarget, "--skills", "evidence-ledger,risk-gate", "--prune"]));
  if (CORE_IMMUTABLE_CONTRACT_ASSETS.some((asset) => !existsSync(resolve(corePruneOwnershipTarget, asset)))) {
    throw new Error("core shrink prune must preserve all immutable contracts required by an active Claude adapter");
  }
  assertInstalledDocReferences("Claude active adapter after core prune", corePruneOwnershipTarget, [".claude/skills", ".claude/commands"]);

  const adapterDetachOwnershipTarget = resolve(fixtureRoot, "install-claude-adapter-detach-ownership");
  assertRuntimePass("Claude ownership minimal core setup", runRepoScript([coreInstaller, "--target", adapterDetachOwnershipTarget, "--skills", "evidence-ledger,risk-gate"]));
  assertRuntimePass("Claude ownership adapter install", runRepoScript([installer, "--target", adapterDetachOwnershipTarget, "--profile", "implementation"]));
  assertRuntimePass("Claude ownership core expand", runRepoScript([coreInstaller, "--target", adapterDetachOwnershipTarget]));
  assertRuntimePass("Claude ownership adapter detach", runRepoScript([installer, "--target", adapterDetachOwnershipTarget, "--detach"]));
  if (CORE_IMMUTABLE_CONTRACT_ASSETS.some((asset) => !existsSync(resolve(adapterDetachOwnershipTarget, asset)))) {
    throw new Error("Claude detach must preserve all core-owned immutable contracts");
  }
  assertRuntimePass("core check after Claude ownership transition", runRepoScript([coreInstaller, "--target", adapterDetachOwnershipTarget, "--check"]));

  const legacyOwnershipTarget = resolve(fixtureRoot, "install-claude-legacy-ownership-migration");
  assertRuntimePass("legacy Claude ownership core setup", runRepoScript([coreInstaller, "--target", legacyOwnershipTarget]));
  assertRuntimePass("legacy Claude ownership adapter setup", runRepoScript([installer, "--target", legacyOwnershipTarget, "--profile", "full"]));
  const legacyClaudeStatePath = resolve(legacyOwnershipTarget, ".agent-spectrum-kernel/claude-install-state.json");
  const legacyClaudeState = JSON.parse(readFileSync(legacyClaudeStatePath, "utf8"));
  for (const asset of CORE_IMMUTABLE_CONTRACT_ASSETS) {
    const content = readFileSync(resolve(legacyOwnershipTarget, asset), "utf8");
    legacyClaudeState.managed_files[asset] = { kind: "claude_asset", asset, sha256: hashText(content) };
  }
  writeFileSync(legacyClaudeStatePath, `${JSON.stringify(legacyClaudeState, null, 2)}\n`);
  assertRuntimePass("legacy Claude ownership new core install", runRepoScript([coreInstaller, "--target", legacyOwnershipTarget]));
  assertRuntimePass("legacy Claude ownership implementation prune", runRepoScript([installer, "--target", legacyOwnershipTarget, "--profile", "implementation", "--prune"]));
  const migratedCoreState = JSON.parse(readFileSync(resolve(legacyOwnershipTarget, ".agent-spectrum-kernel/install-state.json"), "utf8"));
  const migratedClaudeState = JSON.parse(readFileSync(legacyClaudeStatePath, "utf8"));
  for (const asset of CORE_IMMUTABLE_CONTRACT_ASSETS) {
    const targetPath = resolve(legacyOwnershipTarget, asset);
    const coreRecord = migratedCoreState.managed_files?.[asset];
    if (!existsSync(targetPath) || coreRecord?.kind !== "immutable_contract" || hashText(readFileSync(targetPath, "utf8")) !== coreRecord.sha256) {
      throw new Error(`legacy Claude ownership migration must preserve the core-owned immutable contract: ${asset}`);
    }
    if (Object.hasOwn(migratedClaudeState.managed_files ?? {}, asset)) {
      throw new Error(`legacy Claude ownership migration must drop the adapter ownership record: ${asset}`);
    }
  }

  const rollbackTarget = resolve(fixtureRoot, "install-claude-rollback-target");
  assertRuntimePass("installer rollback core setup", runRepoScript([coreInstaller, "--target", rollbackTarget]));
  assertRuntimePass("installer rollback first profile", runRepoScript([installer, "--target", rollbackTarget, "--profile", "implementation"]));
  assertRuntimePass("installer rollback second profile", runRepoScript([installer, "--target", rollbackTarget, "--profile", "review"]));
  assertRuntimePass("installer rollback", runRepoScript([installer, "--target", rollbackTarget, "--rollback"]));
  if (existsSync(resolve(rollbackTarget, ".claude/commands/skill-review.md")) || !existsSync(resolve(rollbackTarget, ".claude/commands/skill-implement.md"))) {
    throw new Error("installer rollback should restore the previous successful Claude projection");
  }

  const rollbackConflictTarget = resolve(fixtureRoot, "install-claude-rollback-conflict-target");
  assertRuntimePass("installer rollback conflict core setup", runRepoScript([coreInstaller, "--target", rollbackConflictTarget]));
  assertRuntimePass("installer rollback conflict first profile", runRepoScript([installer, "--target", rollbackConflictTarget, "--profile", "implementation"]));
  assertRuntimePass("installer rollback conflict second profile", runRepoScript([installer, "--target", rollbackConflictTarget, "--profile", "review"]));
  const rollbackConflictSettingsPath = resolve(rollbackConflictTarget, ".claude/settings.json");
  const rollbackConflictSettings = JSON.parse(readFileSync(rollbackConflictSettingsPath, "utf8"));
  rollbackConflictSettings.localPreference = true;
  writeFileSync(rollbackConflictSettingsPath, `${JSON.stringify(rollbackConflictSettings, null, 2)}\n`);
  assertRuntimePass("installer rollback preserves unrelated settings", runRepoScript([installer, "--target", rollbackConflictTarget, "--rollback"]));
  const restoredSettings = JSON.parse(readFileSync(rollbackConflictSettingsPath, "utf8"));
  if (restoredSettings.localPreference !== true) {
    throw new Error("installer rollback should preserve unrelated .claude/settings.json fields");
  }

  const interruptedHooksTarget = resolve(fixtureRoot, "install-claude-interrupted-hooks-target");
  assertRuntimePass("installer interrupted hooks core setup", runRepoScript([coreInstaller, "--target", interruptedHooksTarget]));
  assertRuntimePass("installer interrupted hooks first install", runRepoScript([installer, "--target", interruptedHooksTarget, "--profile", "implementation"]));
  const interruptedSettingsPath = resolve(interruptedHooksTarget, ".claude/settings.json");
  const hooksBeforeRemoval = readFileSync(interruptedSettingsPath, "utf8");
  assertRuntimePass("installer interrupted hooks removal", runRepoScript([installer, "--target", interruptedHooksTarget, "--profile", "implementation", "--skip-hooks"]));
  const pendingHookState = JSON.parse(readFileSync(resolve(interruptedHooksTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  writeFileSync(resolve(interruptedHooksTarget, ".agent-spectrum-kernel/claude-install-state.json.in-progress.json"), `${JSON.stringify({ pending_state: pendingHookState }, null, 2)}\n`);
  writeFileSync(interruptedSettingsPath, hooksBeforeRemoval);
  assertRuntimePass("installer interrupted hooks before-write rollback", runRepoScript([installer, "--target", interruptedHooksTarget, "--rollback"]));
  if (readFileSync(interruptedSettingsPath, "utf8") !== hooksBeforeRemoval) {
    throw new Error("rollback should accept an unapplied hook removal as already restored");
  }

  assertRuntimePass("installer interrupted hooks second removal", runRepoScript([installer, "--target", interruptedHooksTarget, "--profile", "implementation", "--skip-hooks"]));
  const pendingHookWriteState = JSON.parse(readFileSync(resolve(interruptedHooksTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  writeFileSync(resolve(interruptedHooksTarget, ".agent-spectrum-kernel/claude-install-state.json.in-progress.json"), `${JSON.stringify({ pending_state: pendingHookWriteState }, null, 2)}\n`);
  assertRuntimePass("installer interrupted hooks after-write rollback", runRepoScript([installer, "--target", interruptedHooksTarget, "--rollback"]));
  if (!readFileSync(interruptedSettingsPath, "utf8").includes("ai-metrics-record")) {
    throw new Error("rollback should restore hooks after an applied hook removal");
  }

  const missingSettingsRollbackTarget = resolve(fixtureRoot, "install-claude-missing-settings-rollback-target");
  assertRuntimePass("installer missing settings rollback core setup", runRepoScript([coreInstaller, "--target", missingSettingsRollbackTarget]));
  assertRuntimePass("installer missing settings rollback first install", runRepoScript([installer, "--target", missingSettingsRollbackTarget, "--profile", "implementation"]));
  assertRuntimePass("installer missing settings rollback second install", runRepoScript([installer, "--target", missingSettingsRollbackTarget, "--profile", "review"]));
  rmSync(resolve(missingSettingsRollbackTarget, ".claude/settings.json"));
  assertRuntimePass("installer missing settings force rollback", runRepoScript([installer, "--target", missingSettingsRollbackTarget, "--rollback", "--force"]));
  if (!existsSync(resolve(missingSettingsRollbackTarget, ".claude/settings.json"))) {
    throw new Error("force rollback should create settings.json when restoring managed hooks");
  }

  const detachTarget = resolve(fixtureRoot, "install-claude-detach-target");
  assertRuntimePass("installer detach core setup", runRepoScript([coreInstaller, "--target", detachTarget]));
  assertRuntimePass("installer detach setup", runRepoScript([installer, "--target", detachTarget, "--profile", "implementation"]));
  mkdirSync(resolve(detachTarget, "docs/ai/metrics"), { recursive: true });
  writeFileSync(resolve(detachTarget, "docs/ai/metrics/events.jsonl"), "{\"keep\":true}\n");
  assertRuntimePass("installer detach", runRepoScript([installer, "--target", detachTarget, "--detach"]));
  const detachedClaudeState = JSON.parse(readFileSync(resolve(detachTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  const detachedSettings = existsSync(resolve(detachTarget, ".claude/settings.json"))
    ? readFileSync(resolve(detachTarget, ".claude/settings.json"), "utf8")
    : "";
  if (
    existsSync(resolve(detachTarget, ".claude/commands/skill-implement.md")) ||
    detachedSettings.includes("ai-metrics-record") ||
    !existsSync(resolve(detachTarget, "docs/ai/metrics/events.jsonl")) ||
    !existsSync(resolve(detachTarget, "schemas/review-signal-gate-map.json")) ||
    detachedClaudeState.install_status !== "detached"
  ) {
    throw new Error("installer detach should remove Claude execution surfaces while preserving local metrics evidence");
  }
  assertRuntimePass("core check after Claude detach", runRepoScript([coreInstaller, "--target", detachTarget, "--check"]));
  const doctorAfterClaudeDetach = runRepoScript([doctorScript, "--target", detachTarget, "--json"]);
  assertRuntimePass("doctor after Claude detach", doctorAfterClaudeDetach);

  const noRuntimeTarget = resolve(fixtureRoot, "install-no-runtime-target");
  assertRuntimePass("installer no-runtime core setup", runRepoScript([coreInstaller, "--target", noRuntimeTarget]));
  assertRuntimePass("installer no-runtime", runRepoScript([installer, "--target", noRuntimeTarget, "--skip-runtime"]));
  if (existsSync(resolve(noRuntimeTarget, "scripts/ai-metrics-record.mjs"))) {
    throw new Error("installer --skip-runtime should not install metrics runtime scripts");
  }
  if (existsSync(resolve(noRuntimeTarget, ".claude/settings.json"))) {
    const noRuntimeSettings = JSON.parse(readFileSync(resolve(noRuntimeTarget, ".claude/settings.json"), "utf8"));
    if (JSON.stringify(noRuntimeSettings).includes("ai-metrics-record")) {
      throw new Error(`installer --skip-runtime should not install metrics hooks\n${JSON.stringify(noRuntimeSettings, null, 2)}`);
    }
  }

  const noHooksTarget = resolve(fixtureRoot, "install-no-hooks-target");
  assertRuntimePass("installer no-hooks core setup", runRepoScript([coreInstaller, "--target", noHooksTarget]));
  assertRuntimePass("installer no-hooks", runRepoScript([installer, "--target", noHooksTarget, "--skip-hooks"]));
  if (!existsSync(resolve(noHooksTarget, "scripts/ai-metrics-record.mjs"))) {
    throw new Error("installer --skip-hooks should still install runtime scripts when runtime is not skipped");
  }
  if (existsSync(resolve(noHooksTarget, ".claude/settings.json"))) {
    const noHooksSettings = JSON.parse(readFileSync(resolve(noHooksTarget, ".claude/settings.json"), "utf8"));
    if (JSON.stringify(noHooksSettings).includes("ai-metrics-record")) {
      throw new Error(`installer --skip-hooks should not install metrics hooks\n${JSON.stringify(noHooksSettings, null, 2)}`);
    }
  }

  for (const option of ["--skip-hooks", "--skip-runtime"]) {
    const label = option.slice(2);
    const pruneTarget = resolve(fixtureRoot, `install-claude-${label}-prune-idempotent`);
    assertRuntimePass(`Claude ${label} prune core setup`, runRepoScript([coreInstaller, "--target", pruneTarget]));
    assertRuntimePass(`Claude ${label} prune initial install`, runRepoScript([installer, "--target", pruneTarget, "--profile", "implementation"]));
    assertRuntimePass(`Claude ${label} prune removal`, runRepoScript([installer, "--target", pruneTarget, "--profile", "implementation", option, "--prune"]));
    assertRuntimePass(`Claude ${label} prune rerun`, runRepoScript([installer, "--target", pruneTarget, "--profile", "implementation", option, "--prune"]));
    const pruneState = JSON.parse(readFileSync(resolve(pruneTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
    if (pruneState.managed_partial_files?.[".claude/settings.json"] || (pruneState.actual_installed_inventory ?? []).some((asset) => asset.path === ".claude/settings.json")) {
      throw new Error(`Claude ${label} prune must remove continuing partial ownership\n${JSON.stringify(pruneState, null, 2)}`);
    }
    const retainedTarget = resolve(fixtureRoot, `install-claude-${label}-retained-partial-idempotent`);
    assertRuntimePass(`Claude ${label} retained core setup`, runRepoScript([coreInstaller, "--target", retainedTarget]));
    assertRuntimePass(`Claude ${label} retained initial install`, runRepoScript([installer, "--target", retainedTarget, "--profile", "implementation"]));
    assertRuntimePass(`Claude ${label} retained removal`, runRepoScript([installer, "--target", retainedTarget, "--profile", "implementation", option]));
    assertRuntimePass(`Claude ${label} retained rerun`, runRepoScript([installer, "--target", retainedTarget, "--profile", "implementation", option]));
    const retainedState = JSON.parse(readFileSync(resolve(retainedTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
    if (!retainedState.managed_partial_files?.[".claude/settings.json"] || !(retainedState.actual_installed_inventory ?? []).some((asset) => asset.path === ".claude/settings.json" && asset.retained_stale === true)) {
      throw new Error(`Claude ${label} no-prune must retain partial ownership idempotently\n${JSON.stringify(retainedState, null, 2)}`);
    }
  }

  const claudeInventoryTransitionTarget = resolve(fixtureRoot, "install-claude-full-to-review-no-prune");
  assertRuntimePass("Claude inventory transition core setup", runRepoScript([coreInstaller, "--target", claudeInventoryTransitionTarget]));
  assertRuntimePass("Claude inventory transition full setup", runRepoScript([installer, "--target", claudeInventoryTransitionTarget, "--profile", "full"]));
  const claudeFullState = JSON.parse(readFileSync(resolve(claudeInventoryTransitionTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  assertRuntimePass("Claude inventory transition review", runRepoScript([installer, "--target", claudeInventoryTransitionTarget, "--profile", "review"]));
  const claudeReviewState = JSON.parse(readFileSync(resolve(claudeInventoryTransitionTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  assertActualInventoryMatchesState("Claude full to review no-prune", claudeReviewState);
  if (!(claudeReviewState.retained_stale_files ?? []).length || !(claudeReviewState.actual_installed_inventory ?? []).some((asset) => asset.retained_stale === true)) {
    throw new Error(`Claude full to review must expose retained stale ownership\n${JSON.stringify(claudeReviewState, null, 2)}`);
  }
  if (claudeReviewState.projection_plan?.fingerprint === claudeFullState.projection_plan?.fingerprint) {
    throw new Error("Claude profile transition must change pure projection fingerprint");
  }
  if (
    claudeReviewState.last_changed_provenance?.fingerprint === claudeFullState.last_changed_provenance?.fingerprint ||
    claudeReviewState.last_changed_provenance?.fingerprint !== claudeReviewState.last_applied_provenance?.fingerprint
  ) {
    throw new Error("Claude full to review subset transition must advance last-changed provenance");
  }

  const claudeDefaultProjectionTarget = resolve(fixtureRoot, "install-claude-default-projection");
  assertRuntimePass("Claude default projection core setup", runRepoScript([coreInstaller, "--target", claudeDefaultProjectionTarget]));
  assertRuntimePass("Claude default projection install", runRepoScript([installer, "--target", claudeDefaultProjectionTarget, "--profile", "observability"]));
  const claudeDefaultProjectionState = JSON.parse(readFileSync(resolve(claudeDefaultProjectionTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  const claudeSkipRuntimeState = JSON.parse(readFileSync(resolve(noRuntimeTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  if (
    claudeDefaultProjectionState.projection_plan?.fingerprint === claudeSkipRuntimeState.projection_plan?.fingerprint ||
    (claudeSkipRuntimeState.projection_plan?.renderer_inputs?.adapter_owned ?? []).some((input) => input.path === "scripts/ai-metrics-record.mjs") ||
    (claudeSkipRuntimeState.projection_plan?.projected_managed_assets ?? []).some((asset) => asset.path === "scripts/ai-metrics-record.mjs")
  ) {
    throw new Error("Claude --skip-runtime must change projection identity, input closure, and projected inventory");
  }

  const staleRevisionState = { ...claudeDefaultProjectionState, source: { ...claudeDefaultProjectionState.source, git_revision: "0".repeat(40) }, last_applied_provenance: { ...claudeDefaultProjectionState.last_applied_provenance, source_revision: "0".repeat(40), fingerprint: `sha256:${"0".repeat(64)}` } };
  writeFileSync(resolve(claudeDefaultProjectionTarget, ".agent-spectrum-kernel/claude-install-state.json"), `${JSON.stringify(staleRevisionState, null, 2)}\n`);
  assertRuntimePass("Claude provenance revision refresh", runRepoScript([installer, "--target", claudeDefaultProjectionTarget, "--profile", "observability"]));
  const revisionRefreshedState = JSON.parse(readFileSync(resolve(claudeDefaultProjectionTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  if (revisionRefreshedState.last_applied_provenance?.fingerprint === `sha256:${"0".repeat(64)}` || revisionRefreshedState.last_applied_provenance?.source_revision === "0".repeat(40)) {
    throw new Error(`Claude rerun must persist refreshed source provenance\n${JSON.stringify(revisionRefreshedState.last_applied_provenance, null, 2)}`);
  }
  const settingsPathForProvenance = resolve(claudeDefaultProjectionTarget, ".claude/settings.json");
  const settingsForProvenance = JSON.parse(readFileSync(settingsPathForProvenance, "utf8"));
  settingsForProvenance.hooks.Stop.push({ matcher: "TargetOwned", hooks: [{ type: "command", command: "echo target-owned" }] });
  writeFileSync(settingsPathForProvenance, `${JSON.stringify(settingsForProvenance, null, 2)}\n`);
  assertRuntimePass("Claude provenance target hook refresh", runRepoScript([installer, "--target", claudeDefaultProjectionTarget, "--profile", "observability"]));
  const hookRefreshedState = JSON.parse(readFileSync(resolve(claudeDefaultProjectionTarget, ".agent-spectrum-kernel/claude-install-state.json"), "utf8"));
  if (hookRefreshedState.last_applied_provenance?.target_partial_file_state_digest === revisionRefreshedState.last_applied_provenance?.target_partial_file_state_digest) {
    throw new Error("Claude rerun must persist target-owned hook provenance changes");
  }

  const missingCoreTarget = resolve(fixtureRoot, "install-missing-core-target");
  assertRuntimeFail(
    "installer missing core",
    runRepoScript([installer, "--target", missingCoreTarget]),
    "--merge-agents",
  );
  if (existsSync(resolve(missingCoreTarget, ".claude"))) {
    throw new Error("installer missing core failure should not write adapter files");
  }

  const missingCoreContractTarget = resolve(fixtureRoot, "install-claude-missing-core-contract");
  assertRuntimePass("Claude missing contract core setup", runRepoScript([coreInstaller, "--target", missingCoreContractTarget]));
  rmSync(resolve(missingCoreContractTarget, "docs/lifecycle-artifact-contract.md"));
  assertRuntimeFail(
    "Claude missing core contract",
    runRepoScript([installer, "--target", missingCoreContractTarget, "--profile", "implementation"]),
    "ASK core immutable contract is missing or stale",
  );
  if (existsSync(resolve(missingCoreContractTarget, ".claude"))) {
    throw new Error("Claude adapter must not self-own or repair a missing core contract");
  }

  const missingSkillContractTarget = resolve(fixtureRoot, "install-claude-missing-skill-contract");
  assertRuntimePass("Claude missing skill contract core setup", runRepoScript([coreInstaller, "--target", missingSkillContractTarget]));
  rmSync(resolve(missingSkillContractTarget, "docs/stack-implementation-overlay-contract.md"));
  assertRuntimeFail(
    "Claude missing selected skill contract",
    runRepoScript([installer, "--target", missingSkillContractTarget, "--profile", "full"]),
    "ASK core immutable contract is missing or stale: docs/stack-implementation-overlay-contract.md",
  );
  if (existsSync(resolve(missingSkillContractTarget, ".claude"))) {
    throw new Error("Claude selected-skill contract preflight must fail before writing adapter files");
  }

  const invalidPartialTarget = resolve(fixtureRoot, "install-invalid-partial-target");
  assertRuntimePass("installer invalid partial core setup", runRepoScript([coreInstaller, "--target", invalidPartialTarget]));
  assertRuntimeFail(
    "installer invalid partial skills",
    runRepoScript([installer, "--target", invalidPartialTarget, "--skills", "operating-mode-router"]),
    "Selected Claude commands are not closed over installed skills",
  );
  if (existsSync(resolve(invalidPartialTarget, ".claude/commands/skill-review.md"))) {
    throw new Error("installer invalid partial skills should not install commands");
  }

  const invalidRoutingTarget = resolve(fixtureRoot, "install-invalid-routing-profile-target");
  assertRuntimePass("installer invalid routing core setup", runRepoScript([coreInstaller, "--target", invalidRoutingTarget]));
  assertRuntimeFail(
    "installer invalid routing closure",
    runRepoScript([
      installer,
      "--target",
      invalidRoutingTarget,
      "--profile",
      "implementation",
      "--skills",
      "operating-mode-router,skill-router,test-first-verification,controlled-implementation,evidence-ledger,risk-gate,handoff-generation",
    ]),
    "repository-orientation",
  );
  if (existsSync(resolve(invalidRoutingTarget, ".claude/commands/skill-implement.md"))) {
    throw new Error("installer invalid routing closure should not install commands");
  }

  const missingWorkPackageTarget = resolve(fixtureRoot, "install-missing-work-package-target");
  assertRuntimePass("installer missing work package core setup", runRepoScript([coreInstaller, "--target", missingWorkPackageTarget]));
  assertRuntimeFail(
    "installer spec override requires work package compiler",
    runRepoScript([
      installer,
      "--target",
      missingWorkPackageTarget,
      "--profile",
      "implementation",
      "--skills",
      "operating-mode-router,skill-router,requirement-grill,spec-driven-development,test-first-verification,controlled-implementation,evidence-ledger,risk-gate,handoff-generation,repository-orientation,scope-control,application-boundary-architecture,domain-rule-ledger,grill-design,grill-with-docs,planning-with-files",
    ]),
    "work-package-compiler",
  );
  if (existsSync(resolve(missingWorkPackageTarget, ".claude/commands/skill-implement.md"))) {
    throw new Error("Claude missing work package closure must fail before installation");
  }

  const pluginHooks = JSON.parse(readFileSync(resolve(repoRoot, "adapters/claude-code/plugin/hooks/hooks.json"), "utf8"));
  const pluginHookCommands = Object.values(pluginHooks.hooks ?? {}).flatMap((groups) =>
    groups.flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? "")),
  );
  if (!pluginHookCommands.every((command) => command.includes("${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record")) || pluginHookCommands.some((command) => /^ai-skills-metrics-record\b/.test(command))) {
    throw new Error(`plugin hooks should resolve through CLAUDE_PLUGIN_ROOT instead of relying on PATH\n${pluginHookCommands.join("\n")}`);
  }
  if (!pluginHookCommands.every((command) => command.includes("--non-blocking") && isFailOpenHookCommand(command))) {
    throw new Error(`plugin hooks should be non-blocking and shell-level fail-open\n${pluginHookCommands.join("\n")}`);
  }
  const pluginBashCommands = (pluginHooks.hooks?.PostToolUse ?? [])
    .filter((group) => group.matcher === "Bash")
    .flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? ""));
  if (
    pluginBashCommands.length === 0 ||
    pluginBashCommands.some((command) => !command.includes("--event-kind command_attempt") || command.includes("--event-kind verification_attempt"))
  ) {
    throw new Error(`plugin Bash hooks should record command_attempt, not verification_attempt\n${pluginBashCommands.join("\n")}`);
  }
  const pluginBinSmokeRoot = resolve(fixtureRoot, "plugin-bin-no-runtime");
  mkdirSync(pluginBinSmokeRoot, { recursive: true });
  const pluginBinSmoke = runRepoScript([resolve(repoRoot, "adapters/claude-code/plugin/bin/ai-skills-metrics-record"), "--event-kind", "task_stop"], {
    cwd: pluginBinSmokeRoot,
  });
  assertRuntimePass("plugin metrics wrapper skips missing project runtime", pluginBinSmoke);

  const dryRunTarget = resolve(fixtureRoot, "install-dry-run-target");
  assertRuntimePass("installer dry-run core setup", runRepoScript([coreInstaller, "--target", dryRunTarget]));
  const dryRun = runRepoScript([installer, "--target", dryRunTarget, "--dry-run"]);
  assertRuntimePass("installer dry run", dryRun);
  if (!dryRun.stdout.includes(".claude/settings.json") || !dryRun.stdout.includes("skill-handoff.md")) {
    throw new Error(`installer dry run should list planned writes\n${dryRun.stdout}`);
  }
  if (existsSync(resolve(dryRunTarget, ".claude/settings.json"))) {
    throw new Error("installer dry run should not write settings");
  }
}

function assertCoreInstallerScripts() {
  const installer = resolve(repoRoot, "scripts/install-kernel.mjs");
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8"));
  const markerPattern = /<!-- agent-spectrum-kernel:start -->/g;

  const freshTarget = resolve(fixtureRoot, "kernel-install-fresh");
  const freshRun = runRepoScript([installer, "--target", freshTarget]);
  assertRuntimePass("kernel installer fresh run", freshRun);
  const freshState = JSON.parse(readFileSync(resolve(freshTarget, ".agent-spectrum-kernel/install-state.json"), "utf8"));
  if (freshState.installed_skills.length !== manifest.skills.length) {
    throw new Error(`kernel installer should install manifest skills by default\n${JSON.stringify(freshState, null, 2)}`);
  }
  if (!existsSync(resolve(freshTarget, "AGENTS.md")) || !existsSync(resolve(freshTarget, "CUSTOM_INSTRUCTIONS.md"))) {
    throw new Error("kernel installer should write core instruction files");
  }
  if (!existsSync(resolve(freshTarget, "skills/operating-mode-router/SKILL.md"))) {
    throw new Error("kernel installer should project manifest skills");
  }
  for (const asset of CORE_IMMUTABLE_CONTRACT_ASSETS) {
    if (freshState.managed_files?.[asset]?.kind !== "immutable_contract" || !existsSync(resolve(freshTarget, asset))) {
      throw new Error(`core installer state must own and project immutable contract: ${asset}`);
    }
  }
  assertInstalledDocReferences("core installer dependency closure", freshTarget, ["skills"]);
  if (readFileSync(resolve(freshTarget, "schemas/review-signal-gate-map.json"), "utf8") !== readFileSync(resolve(repoRoot, "schemas/review-signal-gate-map.json"), "utf8")) {
    throw new Error("kernel installer should project the canonical signal registry");
  }

  const beforeRerunAgents = readFileSync(resolve(freshTarget, "AGENTS.md"), "utf8");
  const beforeRerunState = readFileSync(resolve(freshTarget, ".agent-spectrum-kernel/install-state.json"), "utf8");
  assertRuntimePass("kernel installer rerun", runRepoScript([installer, "--target", freshTarget]));
  const afterRerunAgents = readFileSync(resolve(freshTarget, "AGENTS.md"), "utf8");
  const afterRerunState = readFileSync(resolve(freshTarget, ".agent-spectrum-kernel/install-state.json"), "utf8");
  if (afterRerunAgents !== beforeRerunAgents || afterRerunState !== beforeRerunState) {
    throw new Error("kernel installer rerun should be idempotent when source did not change");
  }
  if ((afterRerunAgents.match(markerPattern) ?? []).length !== 1) {
    throw new Error(`kernel installer should not duplicate managed AGENTS blocks\n${afterRerunAgents}`);
  }

  writeFileSync(resolve(freshTarget, "skills/operating-mode-router/SKILL.md"), "# local stale copy\n");
  assertRuntimeFail(
    "kernel installer local managed skill conflict",
    runRepoScript([installer, "--target", freshTarget]),
    "managed file conflict",
  );
  if (readFileSync(resolve(freshTarget, "skills/operating-mode-router/SKILL.md"), "utf8") !== "# local stale copy\n") {
    throw new Error("kernel installer should preserve locally modified managed skills without --force");
  }
  assertRuntimePass("kernel installer force updates managed skills", runRepoScript([installer, "--target", freshTarget, "--force"]));
  if (readFileSync(resolve(freshTarget, "skills/operating-mode-router/SKILL.md"), "utf8") !== readFileSync(resolve(repoRoot, "skills/operating-mode-router/SKILL.md"), "utf8")) {
    throw new Error("kernel installer --force should refresh managed skills from the current checkout");
  }
  assertRuntimePass("kernel installer force rollback", runRepoScript([installer, "--target", freshTarget, "--rollback"]));
  if (readFileSync(resolve(freshTarget, "skills/operating-mode-router/SKILL.md"), "utf8") !== "# local stale copy\n") {
    throw new Error("kernel installer rollback should restore the immediate pre-force local content");
  }

  const mergeTarget = resolve(fixtureRoot, "kernel-install-merge");
  mkdirSync(mergeTarget, { recursive: true });
  writeFileSync(resolve(mergeTarget, "AGENTS.md"), "# Project Rules\n\nKeep this project overlay.\n");
  assertRuntimePass("kernel installer merge agents", runRepoScript([installer, "--target", mergeTarget, "--skills", "operating-mode-router", "--merge-agents"]));
  assertRuntimePass("kernel installer merge agents rerun", runRepoScript([installer, "--target", mergeTarget, "--skills", "operating-mode-router", "--merge-agents"]));
  const mergedAgents = readFileSync(resolve(mergeTarget, "AGENTS.md"), "utf8");
  if (!mergedAgents.includes("Keep this project overlay.") || (mergedAgents.match(markerPattern) ?? []).length !== 1) {
    throw new Error(`kernel installer should preserve existing AGENTS.md content and keep one managed block\n${mergedAgents}`);
  }

  const conflictTarget = resolve(fixtureRoot, "kernel-install-conflict");
  mkdirSync(conflictTarget, { recursive: true });
  writeFileSync(resolve(conflictTarget, "AGENTS.md"), "# Existing AGENTS\n");
  assertRuntimeFail(
    "kernel installer existing AGENTS without merge",
    runRepoScript([installer, "--target", conflictTarget, "--skills", "operating-mode-router"]),
    "--merge-agents",
  );
  if (existsSync(resolve(conflictTarget, ".agent-spectrum-kernel/install-state.json")) || existsSync(resolve(conflictTarget, "skills/operating-mode-router/SKILL.md"))) {
    throw new Error("kernel installer preflight failure should not partially write files");
  }

  const dryRunTarget = resolve(fixtureRoot, "kernel-install-dry-run");
  const dryRun = runRepoScript([installer, "--target", dryRunTarget, "--skills", "operating-mode-router", "--dry-run"]);
  assertRuntimePass("kernel installer dry run", dryRun);
  if (!dryRun.stdout.includes(".agent-spectrum-kernel/install-state.json") || !dryRun.stdout.includes("skills/operating-mode-router/SKILL.md")) {
    throw new Error(`kernel installer dry run should list planned writes\n${dryRun.stdout}`);
  }
  if (existsSync(resolve(dryRunTarget, ".agent-spectrum-kernel/install-state.json"))) {
    throw new Error("kernel installer dry run should not write state");
  }

  const staleTarget = resolve(fixtureRoot, "kernel-install-stale");
  assertRuntimePass(
    "kernel installer stale setup",
    runRepoScript([installer, "--target", staleTarget, "--skills", "operating-mode-router,test-first-verification"]),
  );
  const staleRun = runRepoScript([installer, "--target", staleTarget, "--skills", "operating-mode-router"]);
  assertRuntimePass("kernel installer stale report", staleRun);
  if (!staleRun.stdout.includes("stale managed projection: skills/test-first-verification")) {
    throw new Error(`kernel installer should report stale managed projections\n${staleRun.stdout}`);
  }
  if (!existsSync(resolve(staleTarget, "skills/test-first-verification/SKILL.md"))) {
    throw new Error("kernel installer should not delete stale skills without --prune");
  }
  const staleState = JSON.parse(readFileSync(resolve(staleTarget, ".agent-spectrum-kernel/install-state.json"), "utf8"));
  if (!staleState.installed_skills.includes("test-first-verification")) {
    throw new Error(`kernel installer should keep stale skills in state until pruned\n${JSON.stringify(staleState, null, 2)}`);
  }
  writeFileSync(resolve(staleTarget, "skills/test-first-verification/local-notes.md"), "# keep local notes\n");
  const pruneRun = runRepoScript([installer, "--target", staleTarget, "--skills", "operating-mode-router", "--prune"]);
  assertRuntimePass("kernel installer prune", pruneRun);
  if (existsSync(resolve(staleTarget, "skills/test-first-verification/SKILL.md"))) {
    throw new Error("kernel installer --prune should delete stale managed SKILL.md");
  }
  if (!existsSync(resolve(staleTarget, "skills/test-first-verification/local-notes.md"))) {
    throw new Error("kernel installer --prune should preserve local files in stale skill directories");
  }
  const prunedState = JSON.parse(readFileSync(resolve(staleTarget, ".agent-spectrum-kernel/install-state.json"), "utf8"));
  if (prunedState.installed_skills.includes("test-first-verification")) {
    throw new Error(`kernel installer should remove pruned skills from state\n${JSON.stringify(prunedState, null, 2)}`);
  }

  const rollbackTarget = resolve(fixtureRoot, "kernel-install-rollback");
  assertRuntimePass("kernel installer rollback first install", runRepoScript([installer, "--target", rollbackTarget, "--skills", "operating-mode-router"]));
  assertRuntimePass("kernel installer rollback second install", runRepoScript([installer, "--target", rollbackTarget, "--skills", "operating-mode-router,test-first-verification"]));
  assertRuntimePass("kernel installer rollback", runRepoScript([installer, "--target", rollbackTarget, "--rollback"]));
  if (existsSync(resolve(rollbackTarget, "skills/test-first-verification/SKILL.md")) || !existsSync(resolve(rollbackTarget, "skills/operating-mode-router/SKILL.md"))) {
    throw new Error("kernel installer rollback should restore the previous successful managed file set");
  }

  const blockConflictTarget = resolve(fixtureRoot, "kernel-install-rollback-block-conflict");
  assertRuntimePass("kernel installer rollback block conflict first install", runRepoScript([installer, "--target", blockConflictTarget, "--skills", "operating-mode-router"]));
  assertRuntimePass("kernel installer rollback block conflict second install", runRepoScript([installer, "--target", blockConflictTarget, "--skills", "operating-mode-router,test-first-verification"]));
  const blockConflictAgentsPath = resolve(blockConflictTarget, "AGENTS.md");
  writeFileSync(blockConflictAgentsPath, readFileSync(blockConflictAgentsPath, "utf8").replace("Agent Spectrum Kernel", "Locally Modified Kernel"));
  assertRuntimeFail(
    "kernel installer rollback managed block conflict",
    runRepoScript([installer, "--target", blockConflictTarget, "--rollback"]),
    "rollback block conflict",
  );

  const detachTarget = resolve(fixtureRoot, "kernel-install-detach");
  mkdirSync(detachTarget, { recursive: true });
  writeFileSync(resolve(detachTarget, "AGENTS.md"), "# Project Rules\n\nKeep me.\n");
  assertRuntimePass("kernel installer detach setup", runRepoScript([installer, "--target", detachTarget, "--skills", "operating-mode-router", "--merge-agents"]));
  assertRuntimePass("kernel installer detach", runRepoScript([installer, "--target", detachTarget, "--detach"]));
  const detachedAgents = readFileSync(resolve(detachTarget, "AGENTS.md"), "utf8");
  const detachedState = JSON.parse(readFileSync(resolve(detachTarget, ".agent-spectrum-kernel/install-state.json"), "utf8"));
  if (!detachedAgents.includes("Keep me.") || detachedAgents.includes("agent-spectrum-kernel:start") || existsSync(resolve(detachTarget, "skills/operating-mode-router/SKILL.md")) || detachedState.install_status !== "detached") {
    throw new Error("kernel installer detach should remove execution surfaces while preserving project AGENTS.md content");
  }

  const modifiedPruneTarget = resolve(fixtureRoot, "kernel-install-modified-prune");
  assertRuntimePass(
    "kernel installer modified prune setup",
    runRepoScript([installer, "--target", modifiedPruneTarget, "--skills", "operating-mode-router,test-first-verification"]),
  );
  writeFileSync(resolve(modifiedPruneTarget, "skills/test-first-verification/SKILL.md"), "# locally modified managed file\n");
  assertRuntimeFail(
    "kernel installer modified managed file prune",
    runRepoScript([installer, "--target", modifiedPruneTarget, "--skills", "operating-mode-router", "--prune"]),
    "modified managed file; refusing to prune",
  );
  if (!existsSync(resolve(modifiedPruneTarget, "skills/test-first-verification/SKILL.md"))) {
    throw new Error("kernel installer should preserve modified managed file when prune is refused");
  }

  assertRuntimeFail(
    "kernel installer unknown skill",
    runRepoScript([installer, "--target", resolve(fixtureRoot, "kernel-install-unknown"), "--skills", "missing-skill"]),
    "Unknown skill",
  );

  const overwriteTarget = resolve(fixtureRoot, "kernel-install-no-overwrite");
  mkdirSync(resolve(overwriteTarget, "skills/operating-mode-router"), { recursive: true });
  writeFileSync(resolve(overwriteTarget, "skills/operating-mode-router/SKILL.md"), "# local skill\n");
  assertRuntimeFail(
    "kernel installer no-overwrite skill conflict",
    runRepoScript([installer, "--target", overwriteTarget, "--skills", "operating-mode-router", "--no-overwrite-skills"]),
    "would be overwritten",
  );
  if (existsSync(resolve(overwriteTarget, ".agent-spectrum-kernel/install-state.json"))) {
    throw new Error("kernel installer no-overwrite failure should not write state");
  }
}

function assertCodexInstallerScripts() {
  const installer = resolve(repoRoot, "scripts/install-codex-adapter.mjs");
  const coreInstaller = resolve(repoRoot, "scripts/install-kernel.mjs");
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8"));
  const markerPattern = /<!-- agent-spectrum-kernel:start -->/g;
  const profiles = ["daily", "organizational", "minimal", "implementation", "investigation", "review", "adoption", "observability", "full"];
  const sourceCommand = readFileSync(resolve(repoRoot, "adapters/codex/commands/codex-exec.md"), "utf8");
  for (const [prompt, contract] of Object.entries(CODEX_PROMPT_CONTRACTS)) {
    const expectedInvocation = `--prompt ${prompt} --mode ${contract.mode} --sandbox ${contract.sandbox}`;
    if (!sourceCommand.includes(expectedInvocation)) {
      throw new Error(`source Codex command template must use the managed contract for ${prompt}: ${expectedInvocation}`);
    }
  }

  const freshTarget = resolve(fixtureRoot, "codex-install-fresh");
  assertRuntimePass("codex installer core setup", runRepoScript([coreInstaller, "--target", freshTarget]));
  const freshRun = runRepoScript([installer, "--target", freshTarget]);
  assertRuntimePass("codex installer fresh run", freshRun);
  assertInstalledDocReferences("Codex adapter install smoke", freshTarget, [".agents/skills", ".agents/prompts", ".agents/commands"]);
  if (!existsSync(resolve(freshTarget, "docs/lifecycle-artifact-contract.md")) || !existsSync(resolve(freshTarget, "docs/lifecycle-traceability-contract.md"))) {
    throw new Error("Codex adapter install must provide the canonical lifecycle and traceability contracts");
  }
  const freshState = readCodexInstallState(freshTarget);
  if (!/^sha256:[a-f0-9]{64}$/.test(freshState.applied_provenance?.fingerprint ?? "") || !freshState.applied_provenance?.source_revision || !freshState.applied_provenance?.previous_managed_state_digest) {
    throw new Error(`Codex adapter state must record applied provenance\n${JSON.stringify(freshState.applied_provenance, null, 2)}`);
  }
  if (!freshState.required_assets?.includes("docs/lifecycle-artifact-contract.md") || !freshState.required_assets?.includes("docs/lifecycle-traceability-contract.md")) {
    throw new Error("Codex adapter state must record lifecycle and traceability contracts as required managed dependencies");
  }
  if (Object.hasOwn(freshState.managed_files ?? {}, "docs/lifecycle-artifact-contract.md") || Object.hasOwn(freshState.managed_files ?? {}, "docs/lifecycle-traceability-contract.md")) {
    throw new Error("Codex adapter must not claim ownership of core lifecycle contracts");
  }
  if (
    freshState.selected_profile !== "implementation" ||
    freshState.installed_skills.length >= manifest.skills.length ||
    freshState.target.skills_root !== ".agents/skills" ||
    freshState.selected_skills.includes("review-router")
  ) {
    throw new Error(`codex installer should default to the narrow implementation profile\n${JSON.stringify(freshState, null, 2)}`);
  }
  if (
    !existsSync(resolve(freshTarget, "AGENTS.md")) ||
    !existsSync(resolve(freshTarget, ".agents/skills/controlled-implementation/SKILL.md")) ||
    !existsSync(resolve(freshTarget, ".agents/prompts/skill-implement.md")) ||
    existsSync(resolve(freshTarget, ".agents/prompts/skill-review.md")) ||
    !existsSync(resolve(freshTarget, ".agents/commands/codex-exec.md")) ||
    !existsSync(resolve(freshTarget, "scripts/codex-exec-runner.mjs")) ||
    !existsSync(resolve(freshTarget, "schemas/review-signal-gate-map.json"))
  ) {
    throw new Error("codex installer should write profile-selected Codex AGENTS, skills, prompts, command templates, and runner runtime");
  }
  if (!freshState.selected_runtime_scripts?.includes("codex-exec-runner.mjs")) {
    throw new Error(`codex installer should record selected runner runtime\n${JSON.stringify(freshState, null, 2)}`);
  }
  if (Object.hasOwn(freshState.managed_files ?? {}, "schemas/review-signal-gate-map.json")) {
    throw new Error("Codex adapter installer must not claim ownership of the core canonical signal registry");
  }
  if (readFileSync(resolve(freshTarget, "schemas/review-signal-gate-map.json"), "utf8") !== readFileSync(resolve(repoRoot, "schemas/review-signal-gate-map.json"), "utf8")) {
    throw new Error("Codex installer should project the canonical signal registry");
  }
  assertCodexInstallClosed("codex installer fresh profile", freshTarget);
  if (freshState.selected_skills.includes("operating-mode-router") || freshState.selected_skills.includes("skill-router")) throw new Error("codex explicit implementation profile must skip upper-router closure");
  assertCodexRoutingFixtures("codex installer fresh direct trigger equivalence", freshTarget, ["unfamiliar_repository", "unclear_scope", "boundary_decision", "design_grill", "docs_or_adr_constraints", "long_running_or_multi_agent"]);
  assertCodexCompactProfiles("codex installer fresh implementation profiles", freshTarget);

  const skillOnlyTarget = resolve(fixtureRoot, "codex-install-skill-only-contract");
  assertRuntimePass("codex skill-only minimal core setup", runRepoScript([coreInstaller, "--target", skillOnlyTarget, "--skills", "evidence-ledger,risk-gate"]));
  assertRuntimePass(
    "codex skill-only lifecycle install",
    runRepoScript([installer, "--target", skillOnlyTarget, "--skills", "test-first-verification,evidence-ledger", "--skip-prompts", "--skip-command"]),
  );
  const skillOnlyState = readCodexInstallState(skillOnlyTarget);
  if (!skillOnlyState.required_assets?.includes("docs/lifecycle-artifact-contract.md") || !skillOnlyState.required_assets?.includes("docs/lifecycle-traceability-contract.md") || !existsSync(resolve(skillOnlyTarget, ".agents/skills/test-first-verification/SKILL.md"))) {
    throw new Error(`Codex skill-only install must close over lifecycle contract assets\n${JSON.stringify(skillOnlyState, null, 2)}`);
  }
  if (Object.hasOwn(skillOnlyState.managed_files ?? {}, "docs/lifecycle-artifact-contract.md") || Object.hasOwn(skillOnlyState.managed_files ?? {}, "docs/lifecycle-traceability-contract.md")) {
    throw new Error("Codex skill-only install must depend on, not own, core lifecycle contracts");
  }
  assertInstalledDocReferences("Codex skill-only install smoke", skillOnlyTarget, [".agents/skills"]);

  const corePruneOwnershipTarget = resolve(fixtureRoot, "codex-install-core-prune-ownership");
  assertRuntimePass("Codex ownership full core setup", runRepoScript([coreInstaller, "--target", corePruneOwnershipTarget]));
  assertRuntimePass("Codex ownership adapter setup", runRepoScript([installer, "--target", corePruneOwnershipTarget]));
  assertRuntimePass("Codex ownership core shrink prune", runRepoScript([coreInstaller, "--target", corePruneOwnershipTarget, "--skills", "evidence-ledger,risk-gate", "--prune"]));
  if (CORE_IMMUTABLE_CONTRACT_ASSETS.some((asset) => !existsSync(resolve(corePruneOwnershipTarget, asset)))) {
    throw new Error("core shrink prune must preserve all immutable contracts required by an active Codex adapter");
  }
  assertInstalledDocReferences("Codex active adapter after core prune", corePruneOwnershipTarget, [".agents/skills", ".agents/prompts", ".agents/commands"]);

  const adapterDetachOwnershipTarget = resolve(fixtureRoot, "codex-install-adapter-detach-ownership");
  assertRuntimePass("Codex ownership minimal core setup", runRepoScript([coreInstaller, "--target", adapterDetachOwnershipTarget, "--skills", "evidence-ledger,risk-gate"]));
  assertRuntimePass("Codex ownership adapter install", runRepoScript([installer, "--target", adapterDetachOwnershipTarget]));
  assertRuntimePass("Codex ownership core expand", runRepoScript([coreInstaller, "--target", adapterDetachOwnershipTarget]));
  assertRuntimePass("Codex ownership adapter detach", runRepoScript([installer, "--target", adapterDetachOwnershipTarget, "--detach"]));
  if (CORE_IMMUTABLE_CONTRACT_ASSETS.some((asset) => !existsSync(resolve(adapterDetachOwnershipTarget, asset)))) {
    throw new Error("Codex detach must preserve all core-owned immutable contracts");
  }
  assertRuntimePass("core check after Codex ownership transition", runRepoScript([coreInstaller, "--target", adapterDetachOwnershipTarget, "--check"]));

  const beforeRerunAgents = readFileSync(resolve(freshTarget, "AGENTS.md"), "utf8");
  const beforeRerunState = readCodexInstallState(freshTarget);
  assertRuntimePass("codex installer rerun", runRepoScript([installer, "--target", freshTarget]));
  const afterRerunAgents = readFileSync(resolve(freshTarget, "AGENTS.md"), "utf8");
  const afterRerunState = readCodexInstallState(freshTarget);
  if (
    afterRerunAgents !== beforeRerunAgents ||
    JSON.stringify(afterRerunState.managed_files) !== JSON.stringify(beforeRerunState.managed_files) ||
    afterRerunState.last_changed_provenance?.fingerprint !== beforeRerunState.last_changed_provenance?.fingerprint
  ) {
    throw new Error("codex installer rerun should preserve managed bytes and last-changed provenance when source did not change");
  }
  if ((afterRerunAgents.match(markerPattern) ?? []).length !== 1) {
    throw new Error(`codex installer should not duplicate managed AGENTS blocks\n${afterRerunAgents}`);
  }

  const compactMigrationTarget = resolve(fixtureRoot, "codex-install-legacy-compact-migration");
  assertRuntimePass("Codex compact migration core setup", runRepoScript([coreInstaller, "--target", compactMigrationTarget]));
  assertRuntimePass("Codex compact migration legacy setup", runRepoScript([installer, "--target", compactMigrationTarget, "--profile", "implementation"]));
  const compactMigrationStatePath = resolve(compactMigrationTarget, ".agent-spectrum-kernel/codex-install-state.json");
  const compactMigrationPromptPath = resolve(compactMigrationTarget, ".agents/prompts/skill-implement.md");
  const legacyPrompt = "# Legacy managed Codex implementation prompt\n\n$ARGUMENTS\n";
  const legacyState = readCodexInstallState(compactMigrationTarget);
  writeFileSync(compactMigrationPromptPath, legacyPrompt);
  legacyState.managed_files[".agents/prompts/skill-implement.md"] = {
    ...legacyState.managed_files[".agents/prompts/skill-implement.md"],
    sha256: hashText(legacyPrompt),
    canonical_sha256: hashText(legacyPrompt),
  };
  delete legacyState.managed_files[".agents/prompts/skill-implement.md"].compact_profile;
  legacyState.compact_runtime_profiles = (legacyState.compact_runtime_profiles ?? []).filter((profile) => profile.profile_id !== "codex-implementation-compact-v1");
  writeFileSync(compactMigrationStatePath, `${JSON.stringify(legacyState, null, 2)}\n`);

  assertRuntimePass("Codex compact migration updates legacy managed prompt", runRepoScript([installer, "--target", compactMigrationTarget, "--profile", "implementation"]));
  const migratedState = readCodexInstallState(compactMigrationTarget);
  const migratedPrompt = readFileSync(compactMigrationPromptPath, "utf8");
  if (!parseCodexCompactProfileHeader(migratedPrompt) || !migratedState.managed_files[".agents/prompts/skill-implement.md"]?.compact_profile) {
    throw new Error("Codex compact migration must replace legacy managed prompt with generated compact provenance");
  }

  assertRuntimePass("Codex compact migration rollback", runRepoScript([installer, "--target", compactMigrationTarget, "--rollback"]));
  const rolledBackMigrationState = readCodexInstallState(compactMigrationTarget);
  if (readFileSync(compactMigrationPromptPath, "utf8") !== legacyPrompt || rolledBackMigrationState.managed_files[".agents/prompts/skill-implement.md"]?.compact_profile) {
    throw new Error("Codex compact migration rollback must restore the legacy managed prompt and state");
  }

  assertRuntimePass("Codex compact migration reapplies update", runRepoScript([installer, "--target", compactMigrationTarget, "--profile", "implementation"]));
  assertRuntimePass("Codex compact migration retains stale ownership", runRepoScript([installer, "--target", compactMigrationTarget, "--profile", "minimal"]));
  const staleMigrationState = readCodexInstallState(compactMigrationTarget);
  if (
    !existsSync(compactMigrationPromptPath) ||
    staleMigrationState.managed_files[".agents/prompts/skill-implement.md"]?.kind !== "stale_codex_prompt" ||
    !staleMigrationState.managed_files[".agents/prompts/skill-implement.md"]?.compact_profile
  ) {
    throw new Error("Codex compact migration must preserve compact provenance while ownership is retained as stale");
  }

  assertRuntimePass("Codex compact migration detach", runRepoScript([installer, "--target", compactMigrationTarget, "--detach"]));
  const detachedMigrationState = readCodexInstallState(compactMigrationTarget);
  if (existsSync(compactMigrationPromptPath) || detachedMigrationState.install_status !== "detached" || !existsSync(resolve(compactMigrationTarget, "AGENTS.md"))) {
    throw new Error("Codex compact migration detach must remove adapter-owned stale prompts and preserve the core install");
  }
  assertRuntimePass("core check after Codex compact migration detach", runRepoScript([coreInstaller, "--target", compactMigrationTarget, "--check"]));

  for (const profile of profiles) {
    const profileTarget = resolve(fixtureRoot, `codex-install-profile-${profile}`);
    assertRuntimePass(`codex installer ${profile} core setup`, runRepoScript([coreInstaller, "--target", profileTarget]));
    assertRuntimePass(`codex installer ${profile} profile`, runRepoScript([installer, "--target", profileTarget, "--profile", profile]));
    const profileState = readCodexInstallState(profileTarget);
    if (profileState.selected_profile !== profile) {
      throw new Error(`codex installer should record selected profile ${profile}\n${JSON.stringify(profileState, null, 2)}`);
    }
    if (profile === "full" && profileState.selected_skills.length !== manifest.skills.length) {
      throw new Error(`codex full profile should install every manifest skill\n${JSON.stringify(profileState, null, 2)}`);
    }
    const projectionPack = profile === "daily" ? "daily_delivery" : profile === "organizational" ? "organizational_intelligence" : null;
    if (projectionPack) {
      const expectedSkills = [...manifest.projection_packs[projectionPack].skills].sort();
      const expectedPlanes = projectionPack === "daily_delivery" ? ["execution", "control"] : ["execution", "knowledge", "control"];
      if (
        JSON.stringify(profileState.selected_skills) !== JSON.stringify(expectedSkills) ||
        profileState.selected_projection_pack !== projectionPack ||
        profileState.selection_mode !== "projection_pack" ||
        JSON.stringify(profileState.selected_planes) !== JSON.stringify(expectedPlanes) ||
        JSON.stringify(profileState.installed_planes) !== JSON.stringify(expectedPlanes) ||
        profileState.knowledge_write_policy !== "explicit_only"
      ) {
        throw new Error(`codex ${profile} profile must match manifest projection pack ${projectionPack}\n${JSON.stringify(profileState, null, 2)}`);
      }
    }
    const generatedCommand = readFileSync(resolve(profileTarget, ".agents/commands/codex-exec.md"), "utf8");
    for (const prompt of profileState.selected_prompts) {
      const contract = CODEX_PROMPT_CONTRACTS[prompt];
      const expectedInvocation = `--prompt ${prompt} --mode ${contract.mode} --sandbox ${contract.sandbox}`;
      if (!generatedCommand.includes(expectedInvocation)) {
        throw new Error(`codex command template must use the managed contract for ${prompt}: ${expectedInvocation}`);
      }
    }
    assertCodexInstallClosed(`codex installer ${profile} profile`, profileTarget);
    assertCodexCompactProfiles(`codex installer ${profile} compact profiles`, profileTarget);
    if (profile === "implementation") {
      assertCodexRoutingFixtures(`codex installer ${profile} direct trigger equivalence`, profileTarget, ["unfamiliar_repository", "unclear_scope", "boundary_decision", "design_grill", "docs_or_adr_constraints", "long_running_or_multi_agent"]);
    } else if (profile === "investigation") {
      assertCodexRoutingFixtures(`codex installer ${profile} direct trigger equivalence`, profileTarget, ["unfamiliar_repository", "unclear_scope", "boundary_decision"]);
    } else if (profile === "review") {
      assertCodexRoutingFixtures(`codex installer ${profile} routing fixtures`, profileTarget, ["review"]);
    } else if (profile === "daily") {
      assertCodexRoutingFixtures(`codex installer ${profile} routing fixtures`, profileTarget, [
        "daily_implementation_available",
        "daily_review_available",
        "daily_knowledge_capability_missing",
        "daily_adoption_capability_missing",
        "daily_observability_capability_missing",
      ]);
    }
  }

  const codexStalePlaneTarget = resolve(fixtureRoot, "codex-install-stale-installed-planes");
  assertRuntimePass("Codex stale plane core setup", runRepoScript([coreInstaller, "--target", codexStalePlaneTarget]));
  assertRuntimePass("Codex stale plane organizational setup", runRepoScript([installer, "--target", codexStalePlaneTarget, "--profile", "organizational"]));
  assertRuntimePass("Codex stale plane implementation transition", runRepoScript([installer, "--target", codexStalePlaneTarget, "--profile", "implementation"]));
  const codexStalePlaneState = readCodexInstallState(codexStalePlaneTarget);
  if (JSON.stringify(codexStalePlaneState.selected_planes) !== JSON.stringify(["execution", "control"]) || JSON.stringify(codexStalePlaneState.installed_planes) !== JSON.stringify(["execution", "knowledge", "control"])) {
    throw new Error(`Codex selected/installed planes must distinguish retained stale skills\n${JSON.stringify(codexStalePlaneState, null, 2)}`);
  }

  const codexInventoryTransitionTarget = resolve(fixtureRoot, "codex-install-review-to-implementation-no-prune");
  assertRuntimePass("Codex inventory transition core setup", runRepoScript([coreInstaller, "--target", codexInventoryTransitionTarget]));
  assertRuntimePass("Codex inventory transition review setup", runRepoScript([installer, "--target", codexInventoryTransitionTarget, "--profile", "review"]));
  const codexReviewProjectionState = readCodexInstallState(codexInventoryTransitionTarget);
  assertRuntimePass("Codex inventory transition implementation", runRepoScript([installer, "--target", codexInventoryTransitionTarget, "--profile", "implementation"]));
  const codexImplementationTransitionState = readCodexInstallState(codexInventoryTransitionTarget);
  assertActualInventoryMatchesState("Codex review to implementation no-prune", codexImplementationTransitionState);
  if (!(codexImplementationTransitionState.actual_installed_inventory ?? []).some((asset) => asset.retained_stale === true)) {
    throw new Error(`Codex review to implementation must expose retained stale ownership\n${JSON.stringify(codexImplementationTransitionState, null, 2)}`);
  }
  if (codexReviewProjectionState.projection_plan?.fingerprint === codexImplementationTransitionState.projection_plan?.fingerprint) {
    throw new Error("Codex profile transition must change pure projection fingerprint");
  }

  const codexSubsetTransitionTarget = resolve(fixtureRoot, "codex-install-full-to-review-subset");
  assertRuntimePass("Codex subset transition core setup", runRepoScript([coreInstaller, "--target", codexSubsetTransitionTarget]));
  assertRuntimePass("Codex subset transition full setup", runRepoScript([installer, "--target", codexSubsetTransitionTarget, "--profile", "full"]));
  const codexFullProjectionState = readCodexInstallState(codexSubsetTransitionTarget);
  assertRuntimePass("Codex subset transition review", runRepoScript([installer, "--target", codexSubsetTransitionTarget, "--profile", "review"]));
  const codexReviewSubsetState = readCodexInstallState(codexSubsetTransitionTarget);
  if (
    codexReviewSubsetState.last_changed_provenance?.fingerprint === codexFullProjectionState.last_changed_provenance?.fingerprint ||
    codexReviewSubsetState.last_changed_provenance?.fingerprint !== codexReviewSubsetState.last_applied_provenance?.fingerprint
  ) {
    throw new Error("Codex full to review subset transition must advance last-changed provenance");
  }

  const codexOptionTarget = resolve(fixtureRoot, "codex-install-option-provenance");
  assertRuntimePass("Codex option provenance core setup", runRepoScript([coreInstaller, "--target", codexOptionTarget]));
  assertRuntimePass("Codex option provenance default", runRepoScript([installer, "--target", codexOptionTarget, "--profile", "implementation"]));
  const codexDefaultOptionState = readCodexInstallState(codexOptionTarget);
  assertRuntimePass("Codex option provenance skip prompts", runRepoScript([installer, "--target", codexOptionTarget, "--profile", "implementation", "--skip-prompts"]));
  const codexSkipPromptState = readCodexInstallState(codexOptionTarget);
  if (
    codexDefaultOptionState.projection_plan?.fingerprint === codexSkipPromptState.projection_plan?.fingerprint ||
    (codexSkipPromptState.projection_plan?.renderer_inputs?.adapter_owned ?? []).some((input) => input.role === "prompt_template") ||
    (codexSkipPromptState.projection_plan?.projected_managed_assets ?? []).some((asset) => asset.asset_kind === "prompts")
  ) {
    throw new Error("Codex --skip-prompts must change projection identity, input closure, and projected inventory");
  }
  assertRuntimePass("Codex option provenance skip command", runRepoScript([installer, "--target", codexOptionTarget, "--profile", "implementation", "--skip-command"]));
  const codexSkipCommandState = readCodexInstallState(codexOptionTarget);
  const skipCommandInputs = [...(codexSkipCommandState.projection_plan?.renderer_inputs?.canonical ?? []), ...(codexSkipCommandState.projection_plan?.renderer_inputs?.adapter_owned ?? [])];
  const runtimeSourcePaths = new Set(CODEX_RUNTIME_FILES.filter((file) => file.assetKind !== "schemas").map((file) => file.source));
  if (
    skipCommandInputs.some((input) => input.role === "command_template") ||
    skipCommandInputs.some((input) => runtimeSourcePaths.has(input.path)) ||
    (codexSkipCommandState.projection_plan?.projected_managed_assets ?? []).some((asset) => asset.asset_kind === "commands" || asset.asset_kind === "runner" || asset.asset_kind === "schemas")
  ) {
    throw new Error("Codex --skip-command must exclude command and runtime input/output closure");
  }

  for (const sourceProfile of ["organizational", "full"]) {
    const transitionTarget = resolve(fixtureRoot, `codex-install-${sourceProfile}-to-daily`);
    assertRuntimePass(`Codex ${sourceProfile} to daily core setup`, runRepoScript([coreInstaller, "--target", transitionTarget]));
    assertRuntimePass(`Codex ${sourceProfile} setup`, runRepoScript([installer, "--target", transitionTarget, "--profile", sourceProfile]));
    assertRuntimeFail(
      `Codex ${sourceProfile} to daily requires prune`,
      runRepoScript([installer, "--target", transitionTarget, "--profile", "daily"]),
      "--prune",
    );
    assertRuntimePass(`Codex ${sourceProfile} to daily prune`, runRepoScript([installer, "--target", transitionTarget, "--profile", "daily", "--prune"]));
    assertNoKnowledgeSkills(`Codex ${sourceProfile} to daily`, transitionTarget, ".agents/skills", manifest);
  }

  const modifiedKnowledgeTarget = resolve(fixtureRoot, "codex-install-modified-knowledge-to-daily");
  assertRuntimePass("Codex modified knowledge core setup", runRepoScript([coreInstaller, "--target", modifiedKnowledgeTarget]));
  assertRuntimePass("Codex modified knowledge organizational setup", runRepoScript([installer, "--target", modifiedKnowledgeTarget, "--profile", "organizational"]));
  const modifiedCodexKnowledgePath = resolve(modifiedKnowledgeTarget, ".agents/skills/domain-rule-ledger/SKILL.md");
  writeFileSync(modifiedCodexKnowledgePath, `${readFileSync(modifiedCodexKnowledgePath, "utf8")}\nLocal modification.\n`);
  assertRuntimeFail(
    "Codex modified knowledge shrink is protected",
    runRepoScript([installer, "--target", modifiedKnowledgeTarget, "--profile", "daily", "--prune"]),
    "modified managed file",
  );
  if (!existsSync(modifiedCodexKnowledgePath)) throw new Error("Codex modified knowledge skill must be preserved on failed shrink");

  const codexOverrideTarget = resolve(fixtureRoot, "codex-install-daily-custom-override");
  const codexOverrideSkills = [...manifest.projection_packs.daily_delivery.skills, "domain-rule-ledger"].join(",");
  assertRuntimePass("Codex custom override core setup", runRepoScript([coreInstaller, "--target", codexOverrideTarget]));
  assertRuntimePass("Codex custom override", runRepoScript([installer, "--target", codexOverrideTarget, "--profile", "daily", "--skills", codexOverrideSkills]));
  const codexOverrideState = readCodexInstallState(codexOverrideTarget);
  if (
    codexOverrideState.selection_mode !== "custom" ||
    codexOverrideState.selected_projection_pack !== null ||
    JSON.stringify(codexOverrideState.selected_planes) !== JSON.stringify(["execution", "knowledge", "control"]) ||
    JSON.stringify(codexOverrideState.installed_planes) !== JSON.stringify(["execution", "knowledge", "control"])
  ) {
    throw new Error(`Codex custom override state is not honest\n${JSON.stringify(codexOverrideState, null, 2)}`);
  }

  writeFileSync(resolve(freshTarget, ".agents/skills/controlled-implementation/SKILL.md"), "# local stale copy\n");
  assertRuntimeFail(
    "codex installer local managed skill conflict",
    runRepoScript([installer, "--target", freshTarget]),
    "managed file conflict",
  );
  if (readFileSync(resolve(freshTarget, ".agents/skills/controlled-implementation/SKILL.md"), "utf8") !== "# local stale copy\n") {
    throw new Error("codex installer should preserve locally modified managed skills without --force");
  }
  assertRuntimePass("codex installer force updates managed skills", runRepoScript([installer, "--target", freshTarget, "--force"]));
  if (readFileSync(resolve(freshTarget, ".agents/skills/controlled-implementation/SKILL.md"), "utf8") !== readFileSync(resolve(repoRoot, "skills/controlled-implementation/SKILL.md"), "utf8")) {
    throw new Error("codex installer --force should refresh managed Codex skills from the current checkout");
  }
  assertRuntimePass("codex installer force rollback", runRepoScript([installer, "--target", freshTarget, "--rollback"]));
  if (readFileSync(resolve(freshTarget, ".agents/skills/controlled-implementation/SKILL.md"), "utf8") !== "# local stale copy\n") {
    throw new Error("codex installer rollback should restore the immediate pre-force local content");
  }

  const detachTarget = resolve(fixtureRoot, "codex-install-detach-target");
  assertRuntimePass("codex installer detach core setup", runRepoScript([coreInstaller, "--target", detachTarget]));
  assertRuntimePass("codex installer detach setup", runRepoScript([installer, "--target", detachTarget, "--profile", "review"]));
  assertRuntimePass("codex installer detach", runRepoScript([installer, "--target", detachTarget, "--detach"]));
  if (!existsSync(resolve(detachTarget, "schemas/review-signal-gate-map.json"))) {
    throw new Error("Codex adapter detach must preserve the core canonical signal registry");
  }
  assertRuntimePass("core check after Codex detach", runRepoScript([coreInstaller, "--target", detachTarget, "--check"]));
  const doctorAfterCodexDetach = runRepoScript([doctorScript, "--target", detachTarget, "--json"]);
  assertRuntimePass("doctor after Codex detach", doctorAfterCodexDetach);

  const mergeTarget = resolve(fixtureRoot, "codex-install-merge");
  mkdirSync(mergeTarget, { recursive: true });
  writeFileSync(resolve(mergeTarget, "AGENTS.md"), "# Project Rules\n\nKeep this Codex project overlay.\n");
  assertRuntimePass("codex installer merge core setup", runRepoScript([coreInstaller, "--target", mergeTarget, "--merge-agents"]));
  assertRuntimePass("codex installer core-owned agents", runRepoScript([installer, "--target", mergeTarget, "--skills", "test-first-verification", "--skip-prompts", "--skip-command"]));
  assertRuntimePass("codex installer core-owned agents rerun", runRepoScript([installer, "--target", mergeTarget, "--skills", "test-first-verification", "--skip-prompts", "--skip-command"]));
  const mergedAgents = readFileSync(resolve(mergeTarget, "AGENTS.md"), "utf8");
  if (!mergedAgents.includes("Keep this Codex project overlay.") || (mergedAgents.match(markerPattern) ?? []).length !== 1) {
    throw new Error(`codex installer should preserve existing AGENTS.md content and keep one managed block\n${mergedAgents}`);
  }

  const skipAgentsTarget = resolve(fixtureRoot, "codex-install-skip-agents");
  mkdirSync(skipAgentsTarget, { recursive: true });
  writeFileSync(resolve(skipAgentsTarget, "AGENTS.md"), "# Existing AGENTS\n");
  assertRuntimePass("codex installer skip agents core setup", runRepoScript([coreInstaller, "--target", skipAgentsTarget, "--merge-agents"]));
  const agentsBeforeCodex = readFileSync(resolve(skipAgentsTarget, "AGENTS.md"), "utf8");
  assertRuntimePass("codex installer leaves core-owned agents", runRepoScript([installer, "--target", skipAgentsTarget, "--skills", "test-first-verification", "--skip-prompts", "--skip-command"]));
  if (readFileSync(resolve(skipAgentsTarget, "AGENTS.md"), "utf8") !== agentsBeforeCodex) {
    throw new Error("codex installer --skip-agents should leave AGENTS.md untouched");
  }

  const conflictTarget = resolve(fixtureRoot, "codex-install-conflict");
  mkdirSync(conflictTarget, { recursive: true });
  writeFileSync(resolve(conflictTarget, "AGENTS.md"), "# Existing AGENTS\n");
  assertRuntimeFail(
    "codex installer existing AGENTS without merge",
    runRepoScript([installer, "--target", conflictTarget, "--skills", "test-first-verification", "--skip-prompts", "--skip-command"]),
    "ASK core install state is missing",
  );
  if (existsSync(resolve(conflictTarget, ".agent-spectrum-kernel/codex-install-state.json")) || existsSync(resolve(conflictTarget, ".agents/skills/test-first-verification/SKILL.md"))) {
    throw new Error("codex installer preflight failure should not partially write files");
  }

  const dryRunTarget = resolve(fixtureRoot, "codex-install-dry-run");
  assertRuntimePass("codex installer dry-run core setup", runRepoScript([coreInstaller, "--target", dryRunTarget]));
  const dryRun = runRepoScript([installer, "--target", dryRunTarget, "--dry-run"]);
  assertRuntimePass("codex installer dry run", dryRun);
  if (
    !dryRun.stdout.includes(".agent-spectrum-kernel/codex-install-state.json") ||
    !dryRun.stdout.includes(".agents/skills/controlled-implementation/SKILL.md") ||
    !dryRun.stdout.includes(".agents/prompts/skill-implement.md") ||
    !dryRun.stdout.includes(".agents/commands/codex-exec.md") ||
    !dryRun.stdout.includes("scripts/codex-exec-runner.mjs")
  ) {
    throw new Error(`codex installer dry run should list planned writes\n${dryRun.stdout}`);
  }
  if (existsSync(resolve(dryRunTarget, ".agent-spectrum-kernel/codex-install-state.json"))) {
    throw new Error("codex installer dry run should not write state");
  }

  const staleTarget = resolve(fixtureRoot, "codex-install-stale");
  assertRuntimePass("codex installer stale core setup", runRepoScript([coreInstaller, "--target", staleTarget]));
  assertRuntimePass("codex installer stale setup", runRepoScript([installer, "--target", staleTarget, "--profile", "full"]));
  const staleRun = runRepoScript([installer, "--target", staleTarget, "--profile", "review"]);
  assertRuntimePass("codex installer stale report", staleRun);
  if (
    !staleRun.stdout.includes("stale Codex managed projection: .agents/skills/controlled-implementation") ||
    !staleRun.stdout.includes("stale Codex managed projection: .agents/prompts/skill-implement.md")
  ) {
    throw new Error(`codex installer should report stale managed Codex skill and prompt projections\n${staleRun.stdout}`);
  }
  if (!existsSync(resolve(staleTarget, ".agents/skills/controlled-implementation/SKILL.md")) || !existsSync(resolve(staleTarget, ".agents/prompts/skill-implement.md"))) {
    throw new Error("codex installer should not delete stale skills without --prune");
  }
  const staleState = readCodexInstallState(staleTarget);
  if (!staleState.installed_skills.includes("controlled-implementation") || !staleState.installed_prompts.includes("skill-implement.md")) {
    throw new Error(`codex installer should keep stale skills and prompts in state until pruned\n${JSON.stringify(staleState, null, 2)}`);
  }
  writeFileSync(resolve(staleTarget, ".agents/skills/controlled-implementation/local-notes.md"), "# keep local Codex notes\n");
  const pruneRun = runRepoScript([installer, "--target", staleTarget, "--profile", "review", "--prune"]);
  assertRuntimePass("codex installer prune", pruneRun);
  if (existsSync(resolve(staleTarget, ".agents/skills/controlled-implementation/SKILL.md")) || existsSync(resolve(staleTarget, ".agents/prompts/skill-implement.md"))) {
    throw new Error("codex installer --prune should delete stale managed Codex SKILL.md");
  }
  if (!existsSync(resolve(staleTarget, ".agents/skills/controlled-implementation/local-notes.md"))) {
    throw new Error("codex installer --prune should preserve local files in stale Codex skill directories");
  }
  const prunedState = readCodexInstallState(staleTarget);
  if (prunedState.installed_skills.includes("controlled-implementation") || prunedState.installed_prompts.includes("skill-implement.md")) {
    throw new Error(`codex installer should remove pruned skills and prompts from state\n${JSON.stringify(prunedState, null, 2)}`);
  }
  assertCodexInstallClosed("codex installer pruned review profile", staleTarget);

  const modifiedPruneTarget = resolve(fixtureRoot, "codex-install-modified-prune");
  assertRuntimePass("codex installer modified prune core setup", runRepoScript([coreInstaller, "--target", modifiedPruneTarget]));
  assertRuntimePass("codex installer modified prune setup", runRepoScript([installer, "--target", modifiedPruneTarget, "--profile", "full"]));
  assertRuntimePass("codex installer modified prune stale setup", runRepoScript([installer, "--target", modifiedPruneTarget, "--profile", "review"]));
  writeFileSync(resolve(modifiedPruneTarget, ".agents/prompts/skill-implement.md"), "# locally modified Codex managed file\n");
  assertRuntimeFail(
    "codex installer modified managed file prune",
    runRepoScript([installer, "--target", modifiedPruneTarget, "--profile", "review", "--prune"]),
    "modified managed file; refusing to prune",
  );
  if (!existsSync(resolve(modifiedPruneTarget, ".agents/prompts/skill-implement.md"))) {
    throw new Error("codex installer should preserve modified managed file when prune is refused");
  }

  assertRuntimeFail(
    "codex installer unknown skill",
    runRepoScript([installer, "--target", resolve(fixtureRoot, "codex-install-unknown"), "--skills", "missing-skill", "--skip-prompts", "--skip-command"]),
    "Unknown skill",
  );

  const missingCoreContractTarget = resolve(fixtureRoot, "codex-install-missing-core-contract");
  assertRuntimePass("Codex missing contract core setup", runRepoScript([coreInstaller, "--target", missingCoreContractTarget]));
  rmSync(resolve(missingCoreContractTarget, "docs/lifecycle-artifact-contract.md"));
  assertRuntimeFail(
    "Codex missing core contract",
    runRepoScript([installer, "--target", missingCoreContractTarget]),
    "ASK core immutable contract is missing or stale",
  );
  if (existsSync(resolve(missingCoreContractTarget, ".agents"))) {
    throw new Error("Codex adapter must not self-own or repair a missing core contract");
  }

  const invalidClosureTarget = resolve(fixtureRoot, "codex-install-invalid-closure");
  assertRuntimeFail(
    "codex installer invalid skill closure",
    runRepoScript([installer, "--target", invalidClosureTarget, "--skills", "controlled-implementation", "--skip-prompts", "--skip-command"]),
    "Missing required skill(s): test-first-verification",
  );
  if (existsSync(resolve(invalidClosureTarget, ".agent-spectrum-kernel/codex-install-state.json")) || existsSync(resolve(invalidClosureTarget, ".agents"))) {
    throw new Error("codex installer invalid skill closure should not write files");
  }

  const missingWorkPackageTarget = resolve(fixtureRoot, "codex-install-missing-work-package");
  assertRuntimeFail(
    "codex spec override requires work package compiler",
    runRepoScript([installer, "--target", missingWorkPackageTarget, "--skills", "spec-driven-development,test-first-verification,controlled-implementation", "--skip-prompts", "--skip-command"]),
    "Missing required skill(s): work-package-compiler",
  );
  if (existsSync(resolve(missingWorkPackageTarget, ".agent-spectrum-kernel/codex-install-state.json")) || existsSync(resolve(missingWorkPackageTarget, ".agents"))) {
    throw new Error("Codex missing work package closure must fail before installation");
  }

  const invalidRouterClosureTarget = resolve(fixtureRoot, "codex-install-invalid-router-closure");
  assertRuntimeFail(
    "codex installer invalid router closure",
    runRepoScript([installer, "--target", invalidRouterClosureTarget, "--skills", "skill-router", "--skip-prompts", "--skip-command"]),
    "Missing required skill(s): application-boundary-architecture",
  );
  if (existsSync(resolve(invalidRouterClosureTarget, ".agent-spectrum-kernel/codex-install-state.json")) || existsSync(resolve(invalidRouterClosureTarget, ".agents"))) {
    throw new Error("codex installer invalid router closure should not write files");
  }

  const invalidOperatingRouterClosureTarget = resolve(fixtureRoot, "codex-install-invalid-operating-router-closure");
  assertRuntimeFail(
    "codex installer invalid operating router closure",
    runRepoScript([installer, "--target", invalidOperatingRouterClosureTarget, "--skills", "operating-mode-router", "--skip-prompts", "--skip-command"]),
    "Missing required skill(s): skill-router",
  );
  if (existsSync(resolve(invalidOperatingRouterClosureTarget, ".agent-spectrum-kernel/codex-install-state.json")) || existsSync(resolve(invalidOperatingRouterClosureTarget, ".agents"))) {
    throw new Error("codex installer invalid operating router closure should not write files");
  }

  const invalidPromptClosureTarget = resolve(fixtureRoot, "codex-install-invalid-prompt-closure");
  assertRuntimeFail(
    "codex installer invalid prompt closure",
    runRepoScript([installer, "--target", invalidPromptClosureTarget, "--skills", "test-first-verification"]),
    "Skill override is not closed",
  );
  if (existsSync(resolve(invalidPromptClosureTarget, ".agent-spectrum-kernel/codex-install-state.json")) || existsSync(resolve(invalidPromptClosureTarget, ".agents"))) {
    throw new Error("codex installer invalid prompt closure should not write files");
  }

  const overwriteTarget = resolve(fixtureRoot, "codex-install-no-overwrite");
  assertRuntimePass("codex installer no-overwrite core setup", runRepoScript([coreInstaller, "--target", overwriteTarget]));
  mkdirSync(resolve(overwriteTarget, ".agents/skills/test-first-verification"), { recursive: true });
  writeFileSync(resolve(overwriteTarget, ".agents/skills/test-first-verification/SKILL.md"), "# local codex skill\n");
  assertRuntimeFail(
    "codex installer no-overwrite skill conflict",
    runRepoScript([installer, "--target", overwriteTarget, "--skills", "test-first-verification", "--skip-prompts", "--skip-command", "--no-overwrite-skills"]),
    "would be overwritten",
  );
  if (existsSync(resolve(overwriteTarget, ".agent-spectrum-kernel/codex-install-state.json"))) {
    throw new Error("codex installer no-overwrite failure should not write state");
  }
}

function assertDoctorScript() {
  const installer = resolve(repoRoot, "scripts/install-kernel.mjs");
  const claudeInstaller = resolve(repoRoot, "scripts/install-claude-adapter.mjs");

  const healthyTarget = resolve(fixtureRoot, "doctor-healthy");
  assertRuntimePass("doctor setup healthy install", runRepoScript([installer, "--target", healthyTarget, "--skills", "operating-mode-router"]));
  const healthyResult = runRepoScript([doctorScript, "--target", healthyTarget]);
  assertRuntimePass("doctor healthy install", healthyResult);
  if (!healthyResult.stdout.includes("Exit code 1 means installation health failed")) {
    throw new Error(`doctor should document exit code semantics\n${healthyResult.stdout}\n${healthyResult.stderr}`);
  }
  if (!healthyResult.stdout.includes("Layer statuses:") || !healthyResult.stdout.includes("behavioral_evidence: insufficient_evidence")) {
    throw new Error(`doctor should report separated layer statuses\n${healthyResult.stdout}\n${healthyResult.stderr}`);
  }
  const healthyJsonResult = runRepoScript([doctorScript, "--target", healthyTarget, "--json"]);
  assertRuntimePass("doctor machine-readable deployment status", healthyJsonResult);
  const healthyJson = JSON.parse(healthyJsonResult.stdout);
  if (healthyJson.deploymentStatus?.Installed?.status !== "pass" || healthyJson.deploymentStatus?.Operational?.status !== "insufficient_evidence") {
    throw new Error(`doctor must distinguish Installed from unsupported Operational evidence\n${healthyJsonResult.stdout}`);
  }

  const doctorStateFixture = (name) => {
    const target = resolve(fixtureRoot, `doctor-state-${name}`);
    assertRuntimePass(`doctor ${name} setup`, runRepoScript([installer, "--target", target, "--skills", "operating-mode-router"]));
    return target;
  };
  const missingBlockTarget = doctorStateFixture("missing-block");
  writeFileSync(resolve(missingBlockTarget, "AGENTS.md"), "# local project rules\n");
  assertRuntimeFail("doctor missing AGENTS managed block", runRepoScript([doctorScript, "--target", missingBlockTarget]), "managed block is missing from AGENTS.md");

  const modifiedBlockTarget = doctorStateFixture("modified-block");
  const modifiedAgentsPath = resolve(modifiedBlockTarget, "AGENTS.md");
  writeFileSync(modifiedAgentsPath, readFileSync(modifiedAgentsPath, "utf8").replace("<!-- Source: Agent Spectrum Kernel.", "<!-- Source: Modified Agent Spectrum Kernel."));
  assertRuntimeFail("doctor modified AGENTS managed block", runRepoScript([doctorScript, "--target", modifiedBlockTarget]), "managed block hash mismatch: AGENTS.md#agent-spectrum-kernel");

  const missingStatusTarget = doctorStateFixture("missing-status");
  const missingStatusPath = resolve(missingStatusTarget, ".agent-spectrum-kernel/install-state.json");
  const missingStatusState = JSON.parse(readFileSync(missingStatusPath, "utf8"));
  delete missingStatusState.install_status;
  writeFileSync(missingStatusPath, `${JSON.stringify(missingStatusState)}\n`);
  assertRuntimeFail("doctor missing install status", runRepoScript([doctorScript, "--target", missingStatusTarget]), "install_status must be installed");

  const detachedStateTarget = doctorStateFixture("detached-state");
  const detachedStatePath = resolve(detachedStateTarget, ".agent-spectrum-kernel/install-state.json");
  const detachedState = JSON.parse(readFileSync(detachedStatePath, "utf8"));
  detachedState.install_status = "detached";
  writeFileSync(detachedStatePath, `${JSON.stringify(detachedState)}\n`);
  const detachedDoctorResult = runRepoScript([doctorScript, "--target", detachedStateTarget, "--json"]);
  assertRuntimeFail("doctor detached state", detachedDoctorResult, "install_status must be installed");
  const detachedDoctorJson = JSON.parse(detachedDoctorResult.stdout);
  if (detachedDoctorJson.deploymentStatus?.Installed?.status !== "fail") {
    throw new Error(`detached state must make Installed fail\n${detachedDoctorResult.stdout}`);
  }

  const detachedAdapterTarget = resolve(fixtureRoot, "doctor-detached-claude-adapter");
  assertRuntimePass("doctor detached Claude core setup", runRepoScript([installer, "--target", detachedAdapterTarget, "--skills", "operating-mode-router"]));
  assertRuntimePass("doctor detached Claude adapter setup", runRepoScript([claudeInstaller, "--target", detachedAdapterTarget, "--profile", "implementation"]));
  assertRuntimePass("doctor detached Claude adapter detach", runRepoScript([claudeInstaller, "--target", detachedAdapterTarget, "--detach"]));
  const detachedAdapterStatePath = resolve(detachedAdapterTarget, ".agent-spectrum-kernel/claude-install-state.json");
  const validDetachedAdapterState = JSON.parse(readFileSync(detachedAdapterStatePath, "utf8"));
  const malformedDetachedStates = [
    ["missing schema_version", (state) => { delete state.schema_version; }, "install state has invalid shape"],
    ["wrong installer identity", (state) => { state.installer = "wrong-installer"; }, "install state has invalid shape"],
    ["invalid managed_files", (state) => { state.managed_files = []; }, "install state has invalid shape"],
  ];
  for (const [label, mutate, expected] of malformedDetachedStates) {
    const malformedState = JSON.parse(JSON.stringify(validDetachedAdapterState));
    mutate(malformedState);
    writeFileSync(detachedAdapterStatePath, `${JSON.stringify(malformedState)}\n`);
    assertRuntimeFail(`doctor ${label}`, runRepoScript([doctorScript, "--target", detachedAdapterTarget, "--json"]), expected);
  }
  writeFileSync(detachedAdapterStatePath, `${JSON.stringify(validDetachedAdapterState)}\n`);
  assertRuntimePass("doctor valid detached Claude adapter", runRepoScript([doctorScript, "--target", detachedAdapterTarget, "--json"]));

  const missingManagedFileTarget = doctorStateFixture("missing-managed-file");
  rmSync(resolve(missingManagedFileTarget, "CUSTOM_INSTRUCTIONS.md"));
  assertRuntimeFail("doctor missing managed file", runRepoScript([doctorScript, "--target", missingManagedFileTarget]), "managed file is missing: CUSTOM_INSTRUCTIONS.md");

  const missingCodexStateTarget = doctorStateFixture("missing-codex-state");
  mkdirSync(resolve(missingCodexStateTarget, ".agents"), { recursive: true });
  const missingCodexStateResult = runRepoScript([doctorScript, "--target", missingCodexStateTarget, "--json"]);
  assertRuntimeFail("doctor detects projected Codex without state", missingCodexStateResult, "codex-install-state.json: missing");
  if (JSON.parse(missingCodexStateResult.stdout).deploymentStatus?.Installed?.status !== "fail") {
    throw new Error(`projected adapter without install state must make Installed fail\n${missingCodexStateResult.stdout}`);
  }

  const inProgressTarget = resolve(fixtureRoot, "doctor-in-progress");
  assertRuntimePass("doctor setup in-progress install", runRepoScript([installer, "--target", inProgressTarget, "--skills", "operating-mode-router"]));
  writeFileSync(resolve(inProgressTarget, ".agent-spectrum-kernel/install-state.json.in-progress.json"), "{}\n");
  assertRuntimeFail(
    "doctor interrupted install marker",
    runRepoScript([doctorScript, "--target", inProgressTarget]),
    "install is in progress or was interrupted",
  );

  const missingSkillTarget = resolve(fixtureRoot, "doctor-missing-skill");
  assertRuntimePass("doctor setup missing skill install", runRepoScript([installer, "--target", missingSkillTarget, "--skills", "operating-mode-router"]));
  rmSync(resolve(missingSkillTarget, "skills/operating-mode-router/SKILL.md"));
  assertRuntimeFail(
    "doctor missing skill",
    runRepoScript([doctorScript, "--target", missingSkillTarget]),
    "managed file is missing: skills/operating-mode-router/SKILL.md",
  );

  const staleSkillTarget = resolve(fixtureRoot, "doctor-stale-skill");
  assertRuntimePass(
    "doctor setup stale skills",
    runRepoScript([installer, "--target", staleSkillTarget, "--skills", "operating-mode-router,test-first-verification"]),
  );
  assertRuntimePass("doctor retain stale skill setup", runRepoScript([installer, "--target", staleSkillTarget, "--skills", "operating-mode-router"]));
  const staleResult = runRepoScript([doctorScript, "--target", staleSkillTarget]);
  assertRuntimePass("doctor stale skill warning", staleResult);
  if (!staleResult.stdout.includes("ASK doctor: warn") || !staleResult.stdout.includes("retained stale managed skill projection: test-first-verification")) {
    throw new Error(`doctor should warn on retained stale skills\n${staleResult.stdout}\n${staleResult.stderr}`);
  }

  const unsupportedClaimTarget = resolve(fixtureRoot, "doctor-unsupported-claim");
  assertRuntimePass("doctor setup unsupported claim install", runRepoScript([installer, "--target", unsupportedClaimTarget, "--skills", "operating-mode-router"]));
  writeFileSync(resolve(unsupportedClaimTarget, "README.md"), "# Claim\n\nCodex local metrics event recording is supported.\n");
  const unsupportedClaimResult = runRepoScript([doctorScript, "--target", unsupportedClaimTarget]);
  assertRuntimePass("doctor unsupported capability warning", unsupportedClaimResult);
  if (!unsupportedClaimResult.stdout.includes("ASK doctor: warn") || !unsupportedClaimResult.stdout.includes("Local metrics event recording evidence level is unsupported")) {
    throw new Error(`doctor should warn on unsupported adapter capability claims\n${unsupportedClaimResult.stdout}\n${unsupportedClaimResult.stderr}`);
  }

  const runtimeHealthTarget = resolve(fixtureRoot, "doctor-runtime-health");
  assertRuntimePass("doctor setup runtime health install", runRepoScript([installer, "--target", runtimeHealthTarget, "--skills", "operating-mode-router"]));
  mkdirSync(resolve(runtimeHealthTarget, ".agent-spectrum-kernel"), { recursive: true });
  writeFileSync(
    resolve(runtimeHealthTarget, ".agent-spectrum-kernel/runtime-health.jsonl"),
    '{"schema_version":"1.0.0","occurred_at":"2999-01-01T00:00:00.000Z","component":"ai-metrics-record","status":"error","error_code":"non_blocking_metrics_record_failure","message":"details omitted","privacy_note":{"raw_prompts_stored":false,"full_error_message_stored":false}}\n',
  );
  const runtimeHealthResult = runRepoScript([doctorScript, "--target", runtimeHealthTarget]);
  assertRuntimePass("doctor runtime-health warning", runtimeHealthResult);
  if (!runtimeHealthResult.stdout.includes("ASK doctor: warn") || !runtimeHealthResult.stdout.includes("adapter runtime health issue: ai-metrics-record non_blocking_metrics_record_failure")) {
    throw new Error(`doctor should surface sanitized runtime-health issues\n${runtimeHealthResult.stdout}\n${runtimeHealthResult.stderr}`);
  }
  const blockedHealthJson = JSON.parse(runRepoScript([doctorScript, "--target", runtimeHealthTarget, "--json"]).stdout);
  if (blockedHealthJson.deploymentStatus?.Installed?.status !== "pass" || blockedHealthJson.deploymentStatus?.Operational?.status !== "blocked") {
    throw new Error(`current runtime-health issues should block Operational without changing Installed\n${JSON.stringify(blockedHealthJson, null, 2)}`);
  }
  writeFileSync(
    resolve(runtimeHealthTarget, ".agent-spectrum-kernel/runtime-health.jsonl"),
    `${readFileSync(resolve(runtimeHealthTarget, ".agent-spectrum-kernel/runtime-health.jsonl"), "utf8")}{"schema_version":"1.0.0","occurred_at":"2999-01-01T00:01:00.000Z","component":"ai-metrics-record","status":"recovered","error_code":"non_blocking_metrics_record_failure"}\n`,
  );
  const recoveredHealthResult = runRepoScript([doctorScript, "--target", runtimeHealthTarget]);
  assertRuntimePass("doctor runtime-health recovery", recoveredHealthResult);
  if (recoveredHealthResult.stdout.includes("adapter runtime health issue: ai-metrics-record non_blocking_metrics_record_failure")) {
    throw new Error(`doctor should close a runtime-health issue after recovery\n${recoveredHealthResult.stdout}`);
  }

  const legacyHealthPath = resolve(runtimeHealthTarget, ".agent-spectrum-kernel/runtime-health.jsonl");
  const runtimeOwnedHealthPath = resolve(runtimeHealthTarget, ".agent-spectrum-kernel/runtime/runtime-health.jsonl");
  mkdirSync(dirname(runtimeOwnedHealthPath), { recursive: true });
  writeFileSync(
    legacyHealthPath,
    `${readFileSync(legacyHealthPath, "utf8")}{"schema_version":"1.0.0","occurred_at":"2999-01-01T00:02:00.000Z","component":"legacy-component","status":"error","error_code":"legacy-unresolved"}\n{"schema_version":"1.0.0","occurred_at":"2999-01-01T00:05:00.000Z","component":"ai-metrics-record","status":"recovered","error_code":"cross-path-recovery"}\n`,
  );
  writeFileSync(
    runtimeOwnedHealthPath,
    '{"schema_version":"1.0.0","occurred_at":"2999-01-01T00:03:00.000Z","component":"new-component","status":"error","error_code":"new-unresolved"}\n{"schema_version":"1.0.0","occurred_at":"2999-01-01T00:04:00.000Z","component":"ai-metrics-record","status":"error","error_code":"cross-path-recovery"}\n',
  );
  const mergedHealthResult = runRepoScript([doctorScript, "--target", runtimeHealthTarget]);
  assertRuntimePass("doctor merges legacy and runtime-owned health", mergedHealthResult);
  if (
    !mergedHealthResult.stdout.includes("legacy-component legacy-unresolved") ||
    !mergedHealthResult.stdout.includes("new-component new-unresolved") ||
    mergedHealthResult.stdout.includes("ai-metrics-record cross-path-recovery")
  ) {
    throw new Error(`doctor should merge both health logs in event-time order\n${mergedHealthResult.stdout}`);
  }

  const staleHealthTarget = resolve(fixtureRoot, "doctor-stale-runtime-health");
  assertRuntimePass("doctor setup stale runtime health install", runRepoScript([installer, "--target", staleHealthTarget, "--skills", "operating-mode-router"]));
  mkdirSync(resolve(staleHealthTarget, ".agent-spectrum-kernel"), { recursive: true });
  writeFileSync(resolve(staleHealthTarget, ".agent-spectrum-kernel/runtime-health.jsonl"), '{"schema_version":"1.0.0","occurred_at":"2000-01-01T00:00:00.000Z","component":"ai-metrics-record","status":"error","error_code":"non_blocking_metrics_record_failure"}\n');
  const staleHealthResult = runRepoScript([doctorScript, "--target", staleHealthTarget]);
  assertRuntimePass("doctor stale runtime health is historical", staleHealthResult);
  if (staleHealthResult.stdout.includes("ASK doctor: warn") || !staleHealthResult.stdout.includes("historical adapter runtime health issue")) {
    throw new Error(`doctor should report stale unresolved health as historical\n${staleHealthResult.stdout}`);
  }

  const malformedHealthTarget = resolve(fixtureRoot, "doctor-malformed-runtime-health");
  assertRuntimePass("doctor setup malformed runtime health install", runRepoScript([installer, "--target", malformedHealthTarget, "--skills", "operating-mode-router"]));
  mkdirSync(resolve(malformedHealthTarget, ".agent-spectrum-kernel"), { recursive: true });
  writeFileSync(resolve(malformedHealthTarget, ".agent-spectrum-kernel/runtime-health.jsonl"), 'not json\n{"schema_version":"1.0.0","occurred_at":"2999-01-01T00:00:00.000Z","component":"ai-metrics-record","status":"error","error_code":"non_blocking_metrics_record_failure"}\n');
  const malformedHealthResult = runRepoScript([doctorScript, "--target", malformedHealthTarget]);
  assertRuntimePass("doctor malformed runtime health continues", malformedHealthResult);
  if (!malformedHealthResult.stdout.includes("malformed entry") || !malformedHealthResult.stdout.includes("adapter runtime health issue: ai-metrics-record non_blocking_metrics_record_failure")) {
    throw new Error(`doctor should retain valid runtime-health entries after malformed lines\n${malformedHealthResult.stdout}`);
  }

  const runtimeProbeTarget = resolve(fixtureRoot, "doctor-runtime-probe");
  assertRuntimePass("doctor runtime probe core setup", runRepoScript([installer, "--target", runtimeProbeTarget, "--skills", "operating-mode-router"]));
  assertRuntimePass("doctor runtime probe Claude adapter setup", runRepoScript([claudeInstaller, "--target", runtimeProbeTarget, "--profile", "implementation", "--skip-runtime"]));
  writeFileSync(resolve(runtimeProbeTarget, ".claude/settings.json"), '{ "hooks": { "Stop": { "hooks": [] } } }\n');
  writeFileSync(resolve(runtimeProbeTarget, "README.md"), "# Runtime probe\n\nUse `.claude/commands/missing-runtime.md` during local review.\n");
  const runtimeProbeResult = runRepoScript([doctorScript, "--target", runtimeProbeTarget, "--runtime-probe"]);
  assertRuntimePass("doctor runtime probe remains report-only", runtimeProbeResult);
  if (
    !runtimeProbeResult.stdout.includes("ASK doctor: warn") ||
    !runtimeProbeResult.stdout.includes("Runtime conformance probe: enabled") ||
    !runtimeProbeResult.stdout.includes("runtime_readiness:") ||
    !runtimeProbeResult.stdout.includes("Claude adapter hooks shape is invalid") ||
    !runtimeProbeResult.stdout.includes("runtime command/template reference is missing: .claude/commands/missing-runtime.md") ||
    !runtimeProbeResult.stdout.includes("local/static/dry-run only")
  ) {
    throw new Error(`runtime probe should report local conformance issues without failing installation health\n${runtimeProbeResult.stdout}\n${runtimeProbeResult.stderr}`);
  }

  const safeOverlayTarget = resolve(fixtureRoot, "doctor-runtime-probe-safe-overlay");
  assertRuntimePass("doctor runtime safe overlay setup", runRepoScript([installer, "--target", safeOverlayTarget, "--skills", "operating-mode-router"]));
  mkdirSync(resolve(safeOverlayTarget, "docs"), { recursive: true });
  writeFileSync(
    resolve(safeOverlayTarget, "docs/project-overlay.md"),
    `# Project Overlay

Do not skip risk-gate.
Never bypass verification.
No need for evidence is unacceptable.
Do not ignore evidence requirements.
Bypassing verification is prohibited.
`,
  );
  const safeOverlayResult = runRepoScript([doctorScript, "--target", safeOverlayTarget, "--runtime-probe"]);
  assertRuntimePass("doctor runtime probe prohibitive overlay statements", safeOverlayResult);
  if (safeOverlayResult.stdout.includes("possible project-overlay contradiction")) {
    throw new Error(`runtime probe should not warn on prohibitive statements that reinforce ASK rules\n${safeOverlayResult.stdout}\n${safeOverlayResult.stderr}`);
  }

  const unsafeOverlayTarget = resolve(fixtureRoot, "doctor-runtime-probe-unsafe-overlay");
  assertRuntimePass("doctor runtime unsafe overlay setup", runRepoScript([installer, "--target", unsafeOverlayTarget, "--skills", "operating-mode-router"]));
  mkdirSync(resolve(unsafeOverlayTarget, "docs"), { recursive: true });
  writeFileSync(resolve(unsafeOverlayTarget, "docs/project-overlay.md"), "# Project Overlay\n\nDocs-only work may skip risk-gate and bypass verification.\n");
  const unsafeOverlayResult = runRepoScript([doctorScript, "--target", unsafeOverlayTarget, "--runtime-probe"]);
  assertRuntimePass("doctor runtime probe unsafe overlay warning", unsafeOverlayResult);
  if (!unsafeOverlayResult.stdout.includes("ASK doctor: warn") || !unsafeOverlayResult.stdout.includes("possible project-overlay contradiction")) {
    throw new Error(`runtime probe should still warn on overlay statements that permit bypassing ASK rules\n${unsafeOverlayResult.stdout}\n${unsafeOverlayResult.stderr}`);
  }
}

function assertAdapterRuntimeSmokeScript() {
  const coreInstaller = resolve(repoRoot, "scripts/install-kernel.mjs");
  const claudeInstaller = resolve(repoRoot, "scripts/install-claude-adapter.mjs");
  const target = resolve(fixtureRoot, "adapter-runtime-smoke-claude");
  assertRuntimePass("adapter smoke core setup", runRepoScript([coreInstaller, "--target", target]));
  assertRuntimePass("adapter smoke Claude setup", runRepoScript([claudeInstaller, "--target", target, "--profile", "full"]));

  const installedCollectorResult = runRepoScript(
    [resolve(target, "scripts/ai-metrics-record.mjs"), "--event-kind", "task_stop", "--print-result"],
    { cwd: target, input: JSON.stringify({ session_id: "S-INSTALLED-COLLECTOR", last_assistant_message: validEnvelopeBlock }) },
  );
  assertRuntimePass("installed Claude canonical collector", installedCollectorResult);
  const installedEventStore = resolve(target, ".agent-spectrum-kernel/runtime/metrics/events.jsonl");
  const installedEvent = existsSync(installedEventStore) ? JSON.parse(readFileSync(installedEventStore, "utf8")) : null;
  if (!installedEvent || !/^task:sha256:[a-f0-9]{64}$/.test(installedEvent.task_id)) {
    throw new Error("installed Claude runtime should collect a canonical task result through its copied runtime dependencies");
  }

  const smokeResult = runRepoScript([runtimeSmokeScript, "--target", target, "--adapter", "claude"]);
  assertRuntimePass("adapter runtime smoke Claude pass", smokeResult);
  if (!smokeResult.stdout.includes("ASK adapter runtime smoke: pass") || !readFileSync(resolve(target, ".agent-spectrum-kernel/runtime-smoke/events.jsonl"), "utf8").includes("adapter-runtime-smoke")) {
    throw new Error(`adapter runtime smoke should append an isolated non-sensitive event\n${smokeResult.stdout}\n${smokeResult.stderr}`);
  }

  const installedMetricsSchemaPath = resolve(target, "scripts/metrics-event.schema.json");
  const restrictiveMetricsSchema = JSON.parse(readFileSync(installedMetricsSchemaPath, "utf8"));
  restrictiveMetricsSchema.properties.task_id.const = "fixture-impossible-task-id";
  writeFileSync(installedMetricsSchemaPath, `${JSON.stringify(restrictiveMetricsSchema, null, 2)}\n`);
  const eventStoreBeforeSchemaRejection = readFileSync(installedEventStore, "utf8");
  const schemaRejectionResult = runRepoScript(
    [resolve(target, "scripts/ai-metrics-record.mjs"), "--event-kind", "task_stop", "--non-blocking"],
    { cwd: target, input: JSON.stringify({ session_id: "S-SCHEMA-REJECTION", last_assistant_message: validEnvelopeBlock }) },
  );
  assertRuntimePass("installed Claude collector final schema rejection is fail-open", schemaRejectionResult);
  if (
    readFileSync(installedEventStore, "utf8") !== eventStoreBeforeSchemaRejection ||
    !readFileSync(resolve(target, ".agent-spectrum-kernel/runtime/runtime-health.jsonl"), "utf8").includes("non_blocking_metrics_record_failure")
  ) {
    throw new Error("installed Claude collector must schema-validate the privacy-projected event before persistence");
  }

  const missingRuntimeTarget = resolve(fixtureRoot, "adapter-runtime-smoke-missing-runtime");
  assertRuntimePass("adapter smoke missing runtime core setup", runRepoScript([coreInstaller, "--target", missingRuntimeTarget]));
  assertRuntimePass("adapter smoke missing runtime Claude setup", runRepoScript([claudeInstaller, "--target", missingRuntimeTarget, "--profile", "full"]));
  rmSync(resolve(missingRuntimeTarget, "scripts/ai-metrics-record.mjs"));
  const missingRuntimeResult = runRepoScript([runtimeSmokeScript, "--target", missingRuntimeTarget, "--adapter", "claude"]);
  assertRuntimeFail("adapter runtime smoke missing hook executable", missingRuntimeResult, "hook executable is missing");

  const missingEventStoreTarget = resolve(fixtureRoot, "adapter-runtime-smoke-missing-event-store");
  assertRuntimePass("adapter smoke missing event store core setup", runRepoScript([coreInstaller, "--target", missingEventStoreTarget]));
  assertRuntimePass("adapter smoke missing event store Claude setup", runRepoScript([claudeInstaller, "--target", missingEventStoreTarget, "--profile", "full"]));
  mkdirSync(resolve(missingEventStoreTarget, ".agent-spectrum-kernel/runtime"), { recursive: true });
  writeFileSync(resolve(missingEventStoreTarget, ".agent-spectrum-kernel/runtime/metrics"), "not a directory\n");
  const missingEventStoreResult = runRepoScript([runtimeSmokeScript, "--target", missingEventStoreTarget, "--adapter", "claude"]);
  assertRuntimeFail("adapter runtime smoke detects configured event store failure", missingEventStoreResult, "configured event-store parent is not writable");

  const directoryEventStoreTarget = resolve(fixtureRoot, "adapter-runtime-smoke-directory-event-store");
  assertRuntimePass("adapter smoke directory event store core setup", runRepoScript([coreInstaller, "--target", directoryEventStoreTarget]));
  assertRuntimePass("adapter smoke directory event store Claude setup", runRepoScript([claudeInstaller, "--target", directoryEventStoreTarget, "--profile", "full"]));
  mkdirSync(resolve(directoryEventStoreTarget, ".agent-spectrum-kernel/runtime/metrics/events.jsonl"), { recursive: true });
  const directoryEventStoreResult = runRepoScript([runtimeSmokeScript, "--target", directoryEventStoreTarget, "--adapter", "claude"]);
  assertRuntimeFail("adapter runtime smoke rejects directory event store", directoryEventStoreResult, "configured event-store must be a regular file");

  const readOnlyEventStoreTarget = resolve(fixtureRoot, "adapter-runtime-smoke-read-only-event-store");
  assertRuntimePass("adapter smoke read-only event store core setup", runRepoScript([coreInstaller, "--target", readOnlyEventStoreTarget]));
  assertRuntimePass("adapter smoke read-only event store Claude setup", runRepoScript([claudeInstaller, "--target", readOnlyEventStoreTarget, "--profile", "full"]));
  const readOnlyEventStorePath = resolve(readOnlyEventStoreTarget, ".agent-spectrum-kernel/runtime/metrics/events.jsonl");
  mkdirSync(dirname(readOnlyEventStorePath), { recursive: true });
  const readOnlyEventStoreContent = "existing event content\n";
  writeFileSync(readOnlyEventStorePath, readOnlyEventStoreContent);
  chmodSync(readOnlyEventStorePath, 0o444);
  const readOnlyEventStoreResult = runRepoScript([runtimeSmokeScript, "--target", readOnlyEventStoreTarget, "--adapter", "claude"]);
  chmodSync(readOnlyEventStorePath, 0o644);
  assertRuntimeFail("adapter runtime smoke rejects non-appendable event store", readOnlyEventStoreResult, "configured event-store is not append-openable");
  if (readFileSync(readOnlyEventStorePath, "utf8") !== readOnlyEventStoreContent) {
    throw new Error("configured event-store append probe must not modify existing event content");
  }

  const symlinkEventStoreTarget = resolve(fixtureRoot, "adapter-runtime-smoke-symlink-event-store");
  assertRuntimePass("adapter smoke symlink event store core setup", runRepoScript([coreInstaller, "--target", symlinkEventStoreTarget]));
  assertRuntimePass("adapter smoke symlink event store Claude setup", runRepoScript([claudeInstaller, "--target", symlinkEventStoreTarget, "--profile", "full"]));
  const outsideEventStore = resolve(fixtureRoot, "outside-event-store.jsonl");
  writeFileSync(outsideEventStore, "outside event store\n");
  const symlinkEventStorePath = resolve(symlinkEventStoreTarget, ".agent-spectrum-kernel/runtime/metrics/events.jsonl");
  mkdirSync(dirname(symlinkEventStorePath), { recursive: true });
  symlinkSync(outsideEventStore, symlinkEventStorePath);
  const symlinkEventStoreResult = runRepoScript([runtimeSmokeScript, "--target", symlinkEventStoreTarget, "--adapter", "claude"]);
  assertRuntimeFail("adapter runtime smoke rejects symlink event store escape", symlinkEventStoreResult, "configured event store escapes target through a symbolic link");
}

function assertCodexRunnerScript() {
  const installer = resolve(repoRoot, "scripts/install-codex-adapter.mjs");
  const coreInstaller = resolve(repoRoot, "scripts/install-kernel.mjs");
  const target = resolve(fixtureRoot, "codex-runner-target");
  assertRuntimePass("codex runner core setup", runRepoScript([coreInstaller, "--target", target]));
  assertRuntimePass("codex runner install setup", runRepoScript([installer, "--target", target, "--profile", "implementation"]));
  const targetRunnerScript = resolve(target, "scripts/codex-exec-runner.mjs");

  const fakeCodex = resolve(target, "fake-codex");
  writeFileSync(
    fakeCodex,
    `#!/bin/sh
printf 'invoked\n' >> "$0.invocations"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi
  shift
done
cat <<'EOF' > "$output"
Implementation Contract:
- Artifact ID: IMPL-FAKE
- Upstream refs: WP-FAKE, VER-FAKE
- Actual change boundary: local fixture
- Verification attempted: node scripts/test-validate-repo.mjs
- Evidence references: evidence below
- Handoff state: review pending

Evidence:
- Implementation Contract ref: IMPL-FAKE
- command: node scripts/test-validate-repo.mjs
  result: pass
${validEnvelopeBlock}
EOF
`,
  );
  chmodSync(fakeCodex, 0o755);
  const passResult = runRepoScript([
    targetRunnerScript,
    "--target",
    target,
    "--prompt",
    "skill-implement.md",
    "--mode",
    "implementation",
    "--codex-bin",
    fakeCodex,
    "--output",
    "codex-output.md",
  ]);
  assertRuntimePass("codex runner captures and sensors output", passResult);
  if (!passResult.stdout.includes("Codex runner: executed") || !passResult.stdout.includes("Evidence level: executed") || !existsSync(resolve(target, "codex-output.md"))) {
    throw new Error(`codex runner should capture output and report executed evidence\n${passResult.stdout}\n${passResult.stderr}`);
  }
  for (const expected of [
    "Requested contracts: 4",
    "Projected contracts evidence: projected",
    "Runtime-detected compact output profile evidence: runtime_detected",
    "Runtime-loaded contracts evidence: none",
    "Applied output contracts evidence: executed",
    "Workflow contract application evidence: none",
    "Risk/approval contract application evidence: none",
    "Verification contract application evidence: none",
  ]) {
    if (!passResult.stdout.includes(expected)) throw new Error(`codex runner must distinguish execution evidence stage: ${expected}\n${passResult.stdout}`);
  }

  const jsonResult = runRepoScript([
    targetRunnerScript,
    "--target",
    target,
    "--prompt",
    "skill-implement.md",
    "--codex-bin",
    fakeCodex,
    "--output",
    "codex-output-json.md",
    "--json",
  ]);
  assertRuntimePass("codex runner emits structured execution evidence", jsonResult);
  const jsonReport = JSON.parse(jsonResult.stdout);
  if (
    jsonReport.execution_evidence?.requested_contracts?.contracts?.length !== 4 ||
    jsonReport.execution_evidence?.projected_contracts?.evidence_level !== "projected" ||
    jsonReport.execution_evidence?.runtime_detected_profile?.evidence_level !== "runtime_detected" ||
    jsonReport.execution_evidence?.runtime_loaded_contracts?.evidence_level !== "none" ||
    jsonReport.execution_evidence?.runtime_loaded_contracts?.contracts?.length !== 0 ||
    jsonReport.execution_evidence?.applied_output_contracts?.evidence_level !== "executed" ||
    jsonReport.execution_evidence?.workflow_contract_application?.evidence_level !== "none" ||
    jsonReport.execution_evidence?.risk_approval_contract_application?.evidence_level !== "none" ||
    jsonReport.execution_evidence?.verification_contract_application?.evidence_level !== "none" ||
    jsonReport.execution_evidence?.required_gates?.evidence_level !== "none" ||
    jsonReport.execution_evidence?.required_gates?.gates?.length !== 0 ||
    !jsonReport.execution_evidence?.required_gates?.missing_evidence?.includes("required_gate_observation") ||
    jsonReport.normalized_adapter_event?.adapter_id !== "codex" ||
    !jsonReport.normalized_adapter_event?.evidence?.missing?.includes("required_gate_observation") ||
    jsonReport.normalized_adapter_event?.stop?.status !== "insufficient_evidence" ||
    jsonReport.normalized_adapter_event?.outcome?.claim_effect !== "downgrade" ||
    jsonReport.normalized_adapter_event?.contracts?.applied?.length !== 0 ||
    jsonReport.normalized_adapter_event?.verification?.passed !== 1 ||
    Object.hasOwn(jsonReport.execution_evidence ?? {}, "applied")
  ) {
    throw new Error(`codex runner structured evidence stages are invalid\n${jsonResult.stdout}`);
  }

  const reviewTarget = resolve(fixtureRoot, "codex-runner-review-target");
  assertRuntimePass("codex review runner core setup", runRepoScript([coreInstaller, "--target", reviewTarget]));
  assertRuntimePass("codex review runner install setup", runRepoScript([installer, "--target", reviewTarget, "--profile", "review"]));
  const reviewRunnerScript = resolve(reviewTarget, "scripts/codex-exec-runner.mjs");
  const fakeReviewCodex = resolve(reviewTarget, "fake-review-codex");
  writeFileSync(
    fakeReviewCodex,
    `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi
  shift
done
cat <<'EOF' > "$output"
Change signals:
- signal: fixture
Required gates:
- review-final-merge-gate: fixture
Skipped heavy gates:
- none
Missing evidence:
- none
Decision:
- approve
Blocking evidence:
- none
Passed required gates:
- review-final-merge-gate: fixture
Insufficient evidence:
- none
Non-blocking follow-ups:
- none
Residual risk:
- none
${validEnvelopeBlock}
EOF
`,
  );
  chmodSync(fakeReviewCodex, 0o755);
  const reviewResult = runRepoScript([
    reviewRunnerScript,
    "--target",
    reviewTarget,
    "--prompt",
    "skill-review.md",
    "--mode",
    "review",
    "--codex-bin",
    fakeReviewCodex,
    "--output",
    "codex-review-output.md",
    "--json",
  ]);
  assertRuntimePass("codex review runner emits required gate evidence", reviewResult);
  const reviewReport = JSON.parse(reviewResult.stdout);
  if (
    JSON.stringify(reviewReport.execution_evidence?.required_gates?.gates) !== JSON.stringify(["review-final-merge-gate"]) ||
    JSON.stringify(reviewReport.normalized_adapter_event?.gates?.required) !== JSON.stringify(["review-final-merge-gate"]) ||
    reviewReport.normalized_adapter_event?.review?.final_gate_required !== true
  ) {
    throw new Error(`codex review runner must connect review-final-merge-gate to the normalized event\n${reviewResult.stdout}`);
  }

  const riskInvocationMarker = `${fakeCodex}.invocations`;
  const invocationsBeforeRisk = existsSync(riskInvocationMarker) ? readFileSync(riskInvocationMarker, "utf8") : "";
  const riskResult = runRepoScript([
    targetRunnerScript,
    "--target",
    target,
    "--prompt",
    "skill-implement.md",
    "--required-gate",
    "risk-gate",
    "--codex-bin",
    fakeCodex,
    "--output",
    "codex-risk-output.md",
    "--json",
  ]);
  if (riskResult.status === 0) throw new Error(`codex risk runner must stop without specific-action approval\n${riskResult.stdout}`);
  const riskReport = JSON.parse(riskResult.stdout);
  const invocationsAfterRisk = existsSync(riskInvocationMarker) ? readFileSync(riskInvocationMarker, "utf8") : "";
  if (
    JSON.stringify(riskReport.execution_evidence?.required_gates?.gates) !== JSON.stringify(["risk-gate"]) ||
    JSON.stringify(riskReport.normalized_adapter_event?.gates?.required) !== JSON.stringify(["risk-gate"]) ||
    riskReport.normalized_adapter_event?.approval?.required !== true ||
    riskReport.normalized_adapter_event?.approval?.status !== "missing" ||
    riskReport.normalized_adapter_event?.stop?.status !== "risk_gate" ||
    invocationsAfterRisk !== invocationsBeforeRisk
  ) {
    throw new Error(`codex risk runner must emit approval-required state and stop before execution\n${riskResult.stdout}`);
  }

  const doctorResult = runRepoScript([doctorScript, "--target", target, "--runtime-probe", "--json"]);
  assertRuntimePass("Codex doctor reports static compact-profile evidence", doctorResult);
  const doctorReport = JSON.parse(doctorResult.stdout);
  if (
    doctorReport.runtimeProbe?.codex_evidence?.requested_contracts?.length !== 3 ||
    doctorReport.runtimeProbe?.codex_evidence?.projected_contracts?.length !== 3 ||
    doctorReport.runtimeProbe?.codex_evidence?.runtime_detected_profile?.evidence_level !== "none" ||
    doctorReport.runtimeProbe?.codex_evidence?.runtime_loaded_contracts?.evidence_level !== "none" ||
    doctorReport.runtimeProbe?.codex_evidence?.applied_output_contracts?.evidence_level !== "none" ||
    doctorReport.runtimeProbe?.codex_evidence?.workflow_contract_application?.evidence_level !== "none" ||
    doctorReport.runtimeProbe?.codex_evidence?.risk_approval_contract_application?.evidence_level !== "none" ||
    doctorReport.runtimeProbe?.codex_evidence?.verification_contract_application?.evidence_level !== "none" ||
    doctorReport.layerStatuses?.runtime_readiness?.status !== "insufficient_evidence"
  ) {
    throw new Error(`Codex doctor must not upgrade static projection to runtime/applied evidence\n${doctorResult.stdout}`);
  }

  const canonicalSkillPath = resolve(target, "skills/controlled-implementation/SKILL.md");
  const canonicalSkillContent = readFileSync(canonicalSkillPath, "utf8");
  writeFileSync(canonicalSkillPath, `${canonicalSkillContent}\nCanonical drift fixture.\n`);
  const canonicalDriftResult = runRepoScript([targetRunnerScript, "--target", target, "--dry-run"]);
  assertRuntimeFail("codex runner rejects canonical-only compact profile drift", canonicalDriftResult, "compact-profile canonical source drift: skills/controlled-implementation/SKILL.md");
  const canonicalDriftDoctorResult = runRepoScript([doctorScript, "--target", target, "--runtime-probe", "--json"]);
  assertRuntimeFail("Codex doctor rejects canonical-only compact profile drift", canonicalDriftDoctorResult, "Codex compact-profile canonical source drift: skills/controlled-implementation/SKILL.md");
  writeFileSync(canonicalSkillPath, canonicalSkillContent);

  const invocationMarker = `${fakeCodex}.invocations`;
  function assertSkillProjectionPreflightFailure(name, skill, mutate, restore, expectedFailure, { checkDoctor = false } = {}) {
    rmSync(invocationMarker, { force: true });
    const projectedSkillPath = resolve(target, ".agents/skills", skill, "SKILL.md");
    try {
      mutate(projectedSkillPath);
      const result = runRepoScript([
        targetRunnerScript,
        "--target",
        target,
        "--prompt",
        "skill-implement.md",
        "--mode",
        "implementation",
        "--codex-bin",
        fakeCodex,
        "--output",
        `.agents/runs/${skill}-projection-failure.md`,
        "--json",
      ]);
      assertRuntimeFail(name, result, expectedFailure);
      const report = JSON.parse(result.stdout);
      if (
        report.command !== null ||
        report.execution_evidence?.projected_contracts?.evidence_level !== "none" ||
        report.execution_evidence?.runtime_detected_profile?.evidence_level !== "none"
      ) {
        throw new Error(`${name} must downgrade projection and runtime detection evidence\n${result.stdout}`);
      }
      if (existsSync(invocationMarker)) throw new Error(`${name} must fail before invoking Codex`);
      if (checkDoctor) {
        const doctorResult = runRepoScript([doctorScript, "--target", target, "--runtime-probe", "--json"]);
        assertRuntimeFail(`${name} doctor`, doctorResult, expectedFailure);
        const doctorReport = JSON.parse(doctorResult.stdout);
        if (
          !doctorReport.runtimeProbe?.failures?.includes(expectedFailure) ||
          doctorReport.runtimeProbe?.codex_evidence?.projected_contracts?.length !== 0 ||
          doctorReport.runtimeProbe?.codex_evidence?.runtime_detected_profile?.evidence_level !== "none"
        ) {
          throw new Error(`${name} doctor must record the projection failure and retain no projected or runtime-detected evidence\n${doctorResult.stdout}`);
        }
      }
    } finally {
      restore(projectedSkillPath);
      rmSync(invocationMarker, { force: true });
    }
  }

  const selectedSkill = "controlled-implementation";
  const selectedSkillPath = resolve(target, ".agents/skills", selectedSkill, "SKILL.md");
  const selectedSkillContent = readFileSync(selectedSkillPath, "utf8");
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a deleted selected Skill projection",
    selectedSkill,
    (path) => rmSync(path),
    (path) => writeFileSync(path, selectedSkillContent),
    `Codex discovery skill missing: .agents/skills/${selectedSkill}/SKILL.md`,
  );

  const modifiedSkill = "evidence-ledger";
  const modifiedSkillPath = resolve(target, ".agents/skills", modifiedSkill, "SKILL.md");
  const modifiedSkillContent = readFileSync(modifiedSkillPath, "utf8");
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a modified selected Skill projection",
    modifiedSkill,
    (path) => writeFileSync(path, `${modifiedSkillContent}\nProjected drift fixture.\n`),
    (path) => writeFileSync(path, modifiedSkillContent),
    `Codex discovery skill hash_mismatch: .agents/skills/${modifiedSkill}/SKILL.md`,
  );

  const directTriggerSkill = "repository-orientation";
  const directTriggerSkillPath = resolve(target, ".agents/skills", directTriggerSkill, "SKILL.md");
  const directTriggerSkillContent = readFileSync(directTriggerSkillPath, "utf8");
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a deleted direct-trigger Skill projection",
    directTriggerSkill,
    (path) => rmSync(path),
    (path) => writeFileSync(path, directTriggerSkillContent),
    `Codex discovery skill missing: .agents/skills/${directTriggerSkill}/SKILL.md`,
  );

  const rootOnlyMaskSkill = "scope-control";
  const rootOnlyCanonicalPath = resolve(target, "skills", rootOnlyMaskSkill, "SKILL.md");
  const rootOnlyCanonicalContent = readFileSync(rootOnlyCanonicalPath, "utf8");
  const rootOnlyProjectedPath = resolve(target, ".agents/skills", rootOnlyMaskSkill, "SKILL.md");
  const rootOnlyProjectedContent = readFileSync(rootOnlyProjectedPath, "utf8");
  assertSkillProjectionPreflightFailure(
    "codex runner does not let a correct root canonical Skill mask projected Skill drift",
    rootOnlyMaskSkill,
    (path) => writeFileSync(path, `${rootOnlyProjectedContent}\nOnly the Codex discovery asset drifted.\n`),
    (path) => writeFileSync(path, rootOnlyProjectedContent),
    `Codex discovery skill hash_mismatch: .agents/skills/${rootOnlyMaskSkill}/SKILL.md`,
  );
  if (readFileSync(rootOnlyCanonicalPath, "utf8") !== rootOnlyCanonicalContent) throw new Error("root canonical Skill must remain unchanged in the projected-only drift fixture");

  const symlinkSkill = "test-first-verification";
  const symlinkSkillPath = resolve(target, ".agents/skills", symlinkSkill, "SKILL.md");
  const symlinkSkillContent = readFileSync(symlinkSkillPath, "utf8");
  const symlinkCanonicalPath = resolve(target, "skills", symlinkSkill, "SKILL.md");
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a symlink selected Skill projection",
    symlinkSkill,
    (path) => {
      rmSync(path);
      symlinkSync(symlinkCanonicalPath, path);
    },
    (path) => {
      rmSync(path);
      writeFileSync(path, symlinkSkillContent);
    },
    `Codex discovery skill symbolic_link: .agents/skills/${symlinkSkill}/SKILL.md`,
  );

  const symlinkDirectorySkill = "repository-orientation";
  const symlinkDirectorySkillPath = resolve(target, ".agents/skills", symlinkDirectorySkill, "SKILL.md");
  const symlinkDirectorySkillContent = readFileSync(symlinkDirectorySkillPath, "utf8");
  const symlinkDirectoryPath = dirname(symlinkDirectorySkillPath);
  const symlinkDirectoryCanonicalPath = resolve(target, "skills", symlinkDirectorySkill);
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a selected Skill under a symlink directory",
    symlinkDirectorySkill,
    () => {
      rmSync(symlinkDirectoryPath, { recursive: true });
      symlinkSync(symlinkDirectoryCanonicalPath, symlinkDirectoryPath);
    },
    () => {
      rmSync(symlinkDirectoryPath);
      mkdirSync(symlinkDirectoryPath);
      writeFileSync(symlinkDirectorySkillPath, symlinkDirectorySkillContent);
    },
    `Codex discovery skill symbolic_link: .agents/skills/${symlinkDirectorySkill}/SKILL.md`,
    { checkDoctor: true },
  );

  const symlinkSkillsRootSkill = "controlled-implementation";
  const projectedSkillsRoot = resolve(target, ".agents/skills");
  const projectedSkillsRootBackup = resolve(target, ".agents/skills-parent-symlink-fixture");
  const canonicalSkillsRoot = resolve(target, "skills");
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a selected Skill under a symlink skills root",
    symlinkSkillsRootSkill,
    () => {
      renameSync(projectedSkillsRoot, projectedSkillsRootBackup);
      symlinkSync(canonicalSkillsRoot, projectedSkillsRoot);
    },
    () => {
      rmSync(projectedSkillsRoot);
      renameSync(projectedSkillsRootBackup, projectedSkillsRoot);
    },
    `Codex discovery skill symbolic_link: .agents/skills/${symlinkSkillsRootSkill}/SKILL.md`,
    { checkDoctor: true },
  );

  const directorySkill = "risk-gate";
  const directorySkillPath = resolve(target, ".agents/skills", directorySkill, "SKILL.md");
  const directorySkillContent = readFileSync(directorySkillPath, "utf8");
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a non-regular selected Skill projection",
    directorySkill,
    (path) => {
      rmSync(path);
      mkdirSync(path);
    },
    (path) => {
      rmSync(path, { recursive: true });
      writeFileSync(path, directorySkillContent);
    },
    `Codex discovery skill not_regular_file: .agents/skills/${directorySkill}/SKILL.md`,
  );

  const invalidRecordSkill = "controlled-implementation";
  const invalidRecordStatePath = resolve(target, ".agent-spectrum-kernel/codex-install-state.json");
  const validRecordState = readFileSync(invalidRecordStatePath, "utf8");
  assertSkillProjectionPreflightFailure(
    "codex runner rejects a selected Skill without a codex_skill managed record",
    invalidRecordSkill,
    () => {
      const invalidRecordState = JSON.parse(validRecordState);
      invalidRecordState.managed_files[`.agents/skills/${invalidRecordSkill}/SKILL.md`].kind = "codex_asset";
      writeFileSync(invalidRecordStatePath, `${JSON.stringify(invalidRecordState, null, 2)}\n`);
    },
    () => writeFileSync(invalidRecordStatePath, validRecordState),
    `Codex discovery skill invalid_managed_record: .agents/skills/${invalidRecordSkill}/SKILL.md`,
  );

  const sourceRunnerResult = runRepoScript([codexRunnerScript, "--target", target, "--dry-run"]);
  assertRuntimeFail("codex runner rejects a runner from another checkout", sourceRunnerResult, "running runner is not the target managed runner");

  const originalRunnerRuntime = readFileSync(targetRunnerScript, "utf8");
  const originalSharedRuntime = readFileSync(resolve(target, "scripts/ask-shared.mjs"), "utf8");
  const originalAdapterEventRuntime = readFileSync(resolve(target, "scripts/adapter-runtime-event.mjs"), "utf8");
  const originalEnvelopeRuntime = readFileSync(resolve(target, "scripts/execution-envelope.mjs"), "utf8");
  const outsideRuntimeDir = resolve(fixtureRoot, "outside-codex-runtime", "scripts");
  mkdirSync(outsideRuntimeDir, { recursive: true });
  const outsideRunnerPath = resolve(outsideRuntimeDir, "codex-exec-runner.mjs");
  writeFileSync(outsideRunnerPath, originalRunnerRuntime);
  writeFileSync(resolve(outsideRuntimeDir, "ask-shared.mjs"), originalSharedRuntime);
  writeFileSync(resolve(outsideRuntimeDir, "adapter-runtime-event.mjs"), originalAdapterEventRuntime);
  writeFileSync(resolve(outsideRuntimeDir, "execution-envelope.mjs"), originalEnvelopeRuntime);
  rmSync(targetRunnerScript);
  symlinkSync(outsideRunnerPath, targetRunnerScript);
  const symlinkRunnerResult = runRepoScript([targetRunnerScript, "--target", target, "--dry-run"]);
  assertRuntimeFail("codex runner rejects symlink runner escape", symlinkRunnerResult, "managed runner escapes target through a symbolic link");
  rmSync(targetRunnerScript);
  writeFileSync(targetRunnerScript, originalRunnerRuntime);

  const sharedRuntimePath = resolve(target, "scripts/ask-shared.mjs");
  const outsideSharedPath = resolve(outsideRuntimeDir, "outside-ask-shared.mjs");
  writeFileSync(outsideSharedPath, originalSharedRuntime);
  rmSync(sharedRuntimePath);
  symlinkSync(outsideSharedPath, sharedRuntimePath);
  const symlinkSharedResult = runRepoScript([targetRunnerScript, "--target", target, "--dry-run"]);
  assertRuntimeFail("codex runner rejects imported ask-shared symlink escape", symlinkSharedResult, "managed Codex runtime escapes target through a symbolic link");
  rmSync(sharedRuntimePath);
  writeFileSync(sharedRuntimePath, originalSharedRuntime);

  const runsPath = resolve(target, ".agents/runs");
  const outsideRunsPath = resolve(fixtureRoot, "outside-codex-runs");
  rmSync(runsPath, { recursive: true, force: true });
  mkdirSync(outsideRunsPath, { recursive: true });
  symlinkSync(outsideRunsPath, runsPath);
  const symlinkOutputResult = runRepoScript([targetRunnerScript, "--target", target, "--output", ".agents/runs/escape.md", "--dry-run"]);
  assertRuntimeFail("codex runner rejects symlink output parent escape", symlinkOutputResult, "output escapes target through a symbolic link");
  if (existsSync(resolve(outsideRunsPath, "escape.md"))) {
    throw new Error("codex runner must not write output through a symbolic link outside target");
  }
  rmSync(runsPath);
  mkdirSync(runsPath, { recursive: true });

  const failedOutputPath = resolve(target, "codex-preserved-output.md");
  writeFileSync(failedOutputPath, "previous successful output\n");
  const fakeFailingCodex = resolve(target, "fake-failing-codex");
  writeFileSync(
    fakeFailingCodex,
    `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi
  shift
done
echo 'partial failed output' > "$output"
exit 9
`,
  );
  chmodSync(fakeFailingCodex, 0o755);
  const failedOutputResult = runRepoScript([
    targetRunnerScript,
    "--target",
    target,
    "--prompt",
    "skill-implement.md",
    "--codex-bin",
    fakeFailingCodex,
    "--output",
    "codex-preserved-output.md",
  ]);
  assertRuntimeFail("codex runner preserves prior output on process failure", failedOutputResult, "codex exec exited 9");
  if (readFileSync(failedOutputPath, "utf8") !== "previous successful output\n") {
    throw new Error("codex runner must preserve the previous official output when Codex exits non-zero");
  }

  const mismatchResult = runRepoScript([targetRunnerScript, "--target", target, "--prompt", "skill-investigate.md", "--mode", "implementation", "--codex-bin", fakeCodex]);
  assertRuntimeFail("codex runner rejects prompt mode mismatch", mismatchResult, "prompt/mode mismatch");
  const escapeResult = runRepoScript([targetRunnerScript, "--target", target, "--output", "../escape.md", "--codex-bin", fakeCodex]);
  assertRuntimeFail("codex runner rejects output escape", escapeResult, "output must be a relative path inside target");
  const diffOptionResult = runRepoScript([targetRunnerScript, "--target", target, "--diff-base", "--output=/tmp/ask-injected.diff", "--dry-run"]);
  assertRuntimeFail("codex runner rejects git option diff base", diffOptionResult, "invalid --diff-base");
  if (existsSync("/tmp/ask-injected.diff")) {
    throw new Error("codex runner must not permit --diff-base to create an external file");
  }

  const statePath = resolve(target, ".agent-spectrum-kernel/codex-install-state.json");
  const originalState = readFileSync(statePath, "utf8");
  const stateWithoutCompactProfile = JSON.parse(originalState);
  delete stateWithoutCompactProfile.managed_files[".agents/prompts/skill-implement.md"].compact_profile;
  writeFileSync(statePath, `${JSON.stringify(stateWithoutCompactProfile, null, 2)}\n`);
  const missingCompactProfileResult = runRepoScript([targetRunnerScript, "--target", target, "--codex-bin", fakeCodex]);
  assertRuntimeFail("codex runner rejects legacy prompt without compact provenance", missingCompactProfileResult, "selected prompt has no generated Codex compact-profile evidence");
  writeFileSync(statePath, originalState);

  const stateWithoutPromptRecord = JSON.parse(originalState);
  delete stateWithoutPromptRecord.managed_files[".agents/prompts/skill-implement.md"];
  writeFileSync(statePath, `${JSON.stringify(stateWithoutPromptRecord, null, 2)}\n`);
  const missingPromptRecordResult = runRepoScript([targetRunnerScript, "--target", target, "--codex-bin", fakeCodex]);
  assertRuntimeFail("codex runner requires selected prompt managed record", missingPromptRecordResult, "selected prompt has no managed Codex prompt record");
  writeFileSync(statePath, originalState);

  const detachedState = JSON.parse(originalState);
  detachedState.install_status = "detached";
  writeFileSync(statePath, `${JSON.stringify(detachedState, null, 2)}\n`);
  const detachedDryRunResult = runRepoScript([targetRunnerScript, "--target", target, "--dry-run"]);
  assertRuntimeFail("codex runner rejects detached install state", detachedDryRunResult, "Codex install status must be installed");
  if (detachedDryRunResult.stdout.includes("codex exec exited undefined")) {
    throw new Error("preflight failures must not report an undefined Codex exit code");
  }
  writeFileSync(statePath, originalState);

  const sensorRuntimePath = resolve(target, "scripts/ask-sensors.mjs");
  const originalSensorRuntime = readFileSync(sensorRuntimePath, "utf8");
  writeFileSync(sensorRuntimePath, `${originalSensorRuntime}\n// local modification\n`);
  const runtimeHashResult = runRepoScript([targetRunnerScript, "--target", target, "--codex-bin", fakeCodex]);
  assertRuntimeFail("codex runner rejects modified sensor runtime", runtimeHashResult, "managed Codex runtime hash mismatch: scripts/ask-sensors.mjs");
  writeFileSync(sensorRuntimePath, originalSensorRuntime);

  const missingBinaryResult = runRepoScript([targetRunnerScript, "--target", target, "--codex-bin", "missing-codex-binary-for-fixture"]);
  assertRuntimeFail("codex runner reports unavailable executable as projected failure", missingBinaryResult, "codex exec could not start");
  if (!missingBinaryResult.stdout.includes("Evidence level: projected")) {
    throw new Error(`unavailable Codex executable must remain projected\n${missingBinaryResult.stdout}`);
  }

  const fakeWeakCodex = resolve(target, "fake-weak-codex");
  writeFileSync(fakeWeakCodex, "#!/bin/sh\necho 'Looks good.'\n");
  chmodSync(fakeWeakCodex, 0o755);
  const weakResult = runRepoScript([
    targetRunnerScript,
    "--target",
    target,
    "--prompt",
    "skill-implement.md",
    "--mode",
    "implementation",
    "--codex-bin",
    fakeWeakCodex,
    "--output",
    "codex-weak-output.md",
  ]);
  assertRuntimeFail("codex runner insufficient evidence is normalized", weakResult, "Codex runner: insufficient_evidence");
  if (!weakResult.stdout.includes("Codex runner: insufficient_evidence") || !weakResult.stdout.includes("Sensor status: not run") || !weakResult.stdout.includes("Evidence level: runtime_detected")) {
    throw new Error(`codex runner should normalize weak output as insufficient evidence\n${weakResult.stdout}\n${weakResult.stderr}`);
  }

  const missingPromptResult = runRepoScript([targetRunnerScript, "--target", target, "--prompt", "missing.md", "--codex-bin", fakeCodex]);
  assertRuntimeFail("codex runner missing prompt preflight", missingPromptResult, "prompt has no validated execution profile");
}

function assertSensorsScript() {
  const target = cloneFixture("sensors-target");
  const implementationPass = resolve(target, "implementation-pass.txt");
  writeFileSync(
    implementationPass,
    `Implementation Contract:
- Artifact ID: IMPL-PASS
- Upstream refs: WP-PASS, VER-PASS
- Actual change boundary: local validation wiring
- Verification attempted: node scripts/test-validate-repo.mjs
- Evidence references: evidence below
- Handoff state: review pending

Evidence:
- Implementation Contract ref: IMPL-PASS
- command: node scripts/test-validate-repo.mjs
  result: pass
${validEnvelopeBlock}
`,
  );
  const implementationPassResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", implementationPass]);
  assertRuntimePass("sensors implementation pass", implementationPassResult);
  if (!implementationPassResult.stdout.includes("ASK sensors: pass")) {
    throw new Error(`implementation contract fixture should pass sensors\n${implementationPassResult.stdout}`);
  }

  const missingEnvelope = resolve(target, "implementation-missing-envelope.txt");
  writeFileSync(
    missingEnvelope,
    `Implementation Contract:\n- Artifact ID: IMPL-MISSING-ENVELOPE\n- Upstream refs: WP-X\n- Actual change boundary: local validation wiring\n- Verification attempted: node scripts/test-validate-repo.mjs\n- Evidence references: evidence below\n- Handoff state: review pending\n\nEvidence:\n- command: node scripts/test-validate-repo.mjs\n  result: pass\n`,
  );
  const missingEnvelopeResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", missingEnvelope]);
  assertRuntimePass("sensors missing execution envelope is report-only", missingEnvelopeResult);
  if (!missingEnvelopeResult.stdout.includes("ASK sensors: fail") || !missingEnvelopeResult.stdout.includes("Execution Envelope:")) {
    throw new Error(`missing execution envelope should be reported by the completion contract sensor\n${missingEnvelopeResult.stdout}`);
  }

  const capabilityMissingEnvelope = inspectExecutionEnvelope(capabilityMissingEnvelopeBlock);
  if (capabilityMissingEnvelope.status !== "parsed") {
    throw new Error(`capability_missing must be a valid fail-closed envelope status\n${JSON.stringify(capabilityMissingEnvelope, null, 2)}`);
  }

  const envelopeNegativeFixtures = [
    ["malformed envelope", "Execution Envelope:\n- route: flat\n- next action: continue\n", "fenced JSON object"],
    ["unknown envelope status", envelopeBlock({ stop_reason: { status: "mystery", details: [], human_decision_required: [], stop_if: [] } }), "must be one of"],
    ["empty envelope next action", envelopeBlock({ next_action: "" }), "must not be empty"],
    ["inconsistent envelope stop reason", envelopeBlock({ stop_reason: { status: "none", details: ["blocked"], human_decision_required: [], stop_if: [] } }), "status none cannot include blocking details"],
    ["invalid metrics candidate", envelopeBlock({ metrics_event_candidate: {} }), "event_id: is required"],
    ["negative rework count", envelopeBlock({ metrics_event_candidate: { ...validMetricsCandidate, outcome_metrics: { rework_count: -1 } } }), "rework_count: must be >= 0"],
    ["score below minimum", envelopeBlock({ metrics_event_candidate: { ...validMetricsCandidate, instruction_quality_metrics: { goal_clarity: 0 } } }), "goal_clarity: must be >= 1"],
    ["score above maximum", envelopeBlock({ metrics_event_candidate: { ...validMetricsCandidate, instruction_quality_metrics: { goal_clarity: 6 } } }), "goal_clarity: must be <= 5"],
    ["timezone-less occurred_at", envelopeBlock({ metrics_event_candidate: { ...validMetricsCandidate, occurred_at: "2026-07-11T12:00:00" } }), "occurred_at: invalid date-time"],
    ["impossible occurred_at date", envelopeBlock({ metrics_event_candidate: { ...validMetricsCandidate, occurred_at: "2026-02-30T12:00:00Z" } }), "occurred_at: invalid date-time"],
  ];
  for (const [name, content, expected] of envelopeNegativeFixtures) {
    const input = resolve(target, `${name.replaceAll(" ", "-")}.txt`);
    writeFileSync(input, content);
    const result = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", input]);
    assertRuntimePass(`sensors ${name} is report-only`, result);
    if (!result.stdout.includes("ASK sensors: fail") || !result.stdout.includes(expected)) {
      throw new Error(`${name} should fail envelope validation\n${result.stdout}`);
    }
  }

  const implementationFail = resolve(target, "implementation-fail.txt");
  writeFileSync(implementationFail, "Implementation Contract:\n- Artifact ID: IMPL-INCOMPLETE\n");
  const implementationFailResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", implementationFail]);
  assertRuntimePass("sensors implementation fail is report-only", implementationFailResult);
  if (!implementationFailResult.stdout.includes("ASK sensors: fail") || !implementationFailResult.stdout.includes("missing required sections")) {
    throw new Error(`implementation missing sections should be report-only fail\n${implementationFailResult.stdout}`);
  }

  const weakEvidence = resolve(target, "weak-evidence.txt");
  writeFileSync(
    weakEvidence,
    `Implementation Contract:
- Artifact ID: IMPL-WEAK
- Upstream refs: WP-WEAK
- Actual change boundary: local validation wiring
- Verification attempted: inspection
- Evidence references: evidence below
- Handoff state: review pending

Evidence:
- Looks good.
${validEnvelopeBlock}
`,
  );
  const weakEvidenceResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", weakEvidence]);
  assertRuntimePass("sensors weak evidence is report-only", weakEvidenceResult);
  if (
    !weakEvidenceResult.stdout.includes("ASK sensors: fail") ||
    !weakEvidenceResult.stdout.includes("evidence_quality: fail") ||
    !weakEvidenceResult.stdout.includes("Weak evidence downgrades readiness/safety/correctness/no-regression claims")
  ) {
    throw new Error(`weak verification evidence should downgrade readiness claims\n${weakEvidenceResult.stdout}`);
  }

  const testsPassWithoutCommand = resolve(target, "tests-pass-without-command.txt");
  writeFileSync(
    testsPassWithoutCommand,
    `Implementation Contract:
- Artifact ID: IMPL-NO-COMMAND
- Upstream refs: WP-NO-COMMAND
- Actual change boundary: local validation wiring
- Verification attempted: tests
- Evidence references: evidence below
- Handoff state: review pending

Evidence:
- tests pass
${validEnvelopeBlock}
`,
  );
  const testsPassWithoutCommandResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", testsPassWithoutCommand]);
  assertRuntimePass("sensors tests pass without command is report-only", testsPassWithoutCommandResult);
  if (!testsPassWithoutCommandResult.stdout.includes("ASK sensors: fail") || !testsPassWithoutCommandResult.stdout.includes("tests pass without an explicit command or test target")) {
    throw new Error(`tests pass without command should be weak evidence\n${testsPassWithoutCommandResult.stdout}`);
  }

  const concreteEvidence = resolve(target, "concrete-evidence.txt");
  writeFileSync(
    concreteEvidence,
    `Implementation Contract:
- Artifact ID: IMPL-CONCRETE
- Upstream refs: WP-CONCRETE
- Actual change boundary: local validation wiring
- Verification attempted: node scripts/test-validate-repo.mjs
- Evidence references: evidence below
- Handoff state: review pending

Evidence:
- command: node scripts/test-validate-repo.mjs
  result: pass
${validEnvelopeBlock}
`,
  );
  const concreteEvidenceResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", concreteEvidence]);
  assertRuntimePass("sensors concrete evidence passes", concreteEvidenceResult);
  if (!concreteEvidenceResult.stdout.includes("ASK sensors: pass") || !concreteEvidenceResult.stdout.includes("evidence_quality: pass")) {
    throw new Error(`concrete command evidence should pass evidence quality sensor\n${concreteEvidenceResult.stdout}`);
  }

  const reviewPass = resolve(target, "review-pass.txt");
  writeFileSync(
    reviewPass,
    `Change signals:
- docs_output_change: docs output fixture changed

Required gates:
- review-output-quality: output contract review; triggered by docs_output_change

Skipped heavy gates:
- review-adversarial-risk: no security or misuse signal; changed file is docs-only

Missing evidence:
- none

Decision:
- approve with comments

Blocking evidence:
- none

Passed required gates:
- review-automated-gate - focused validation

Insufficient evidence:
- none

Non-blocking follow-ups:
- none

Residual risk:
- none
${validEnvelopeBlock}
`,
  );
  const reviewPassResult = runRepoScript([sensorsScript, "--target", target, "--mode", "review", "--input", reviewPass]);
  assertRuntimePass("sensors review pass", reviewPassResult);
  if (!reviewPassResult.stdout.includes("ASK sensors: pass")) {
    throw new Error(`review contract fixture should pass sensors\n${reviewPassResult.stdout}`);
  }

  const quotedLegacyReviewOutput = resolve(target, "quoted-legacy-review-output.txt");
  writeFileSync(
    quotedLegacyReviewOutput,
    `Change signals:\n- docs_output_change: docs output fixture changed\n\nRequired gates:\n- review-output-quality: output contract review; triggered by docs_output_change\n\nSkipped heavy gates:\n- review-adversarial-risk: no security or misuse signal\n\nMissing evidence:\n- none\n\nDecision:\n- approve\n\nBlocking evidence:\n- none\n- The quoted legacy label is \"Layer summary:\" and must not be interpreted as a heading.\n\nPassed required gates:\n- review-output-quality - output contract checked\n\nInsufficient evidence:\n- none\n\nNon-blocking follow-ups:\n- none\n\nResidual risk:\n- none\n\n\`\`\`text\nLayer summary:\n- legacy example inside a code fence\n\`\`\`\n\n${validEnvelopeBlock}`,
  );
  const quotedLegacyReviewResult = runRepoScript([sensorsScript, "--target", target, "--mode", "review", "--input", quotedLegacyReviewOutput]);
  assertRuntimePass("quoted and fenced legacy heading is ignored", quotedLegacyReviewResult);
  if (!quotedLegacyReviewResult.stdout.includes("ASK sensors: pass")) {
    throw new Error(`quoted/fenced legacy heading should not fail signal-first sensor\n${quotedLegacyReviewResult.stdout}`);
  }

  const separatedReviewOutput = resolve(target, "separated-review-output.txt");
  writeFileSync(
    separatedReviewOutput,
    `Change signals:\n- docs_output_change: output contract changed\n\nRequired gates:\n- review-output-quality: output contract review; triggered by docs_output_change\n\nSkipped heavy gates:\n- review-adversarial-risk: no security or misuse signal\n\nMissing evidence:\n- none\n\nDecision:\n- request changes\n\nBlocking evidence:\n- [major] review-output-quality - output contract is incomplete\n\nPassed required gates:\n- review-automated-gate - focused validation\n\nInsufficient evidence:\n- none\n\nNon-blocking follow-ups:\n- IMP candidate: improve documentation example\n\nResidual risk:\n- none\n\n${validEnvelopeBlock}`,
  );
  const separatedReviewResult = runRepoScript([sensorsScript, "--target", target, "--mode", "review", "--input", separatedReviewOutput]);
  assertRuntimePass("review blocker and follow-up sections stay separate", separatedReviewResult);
  if (!separatedReviewResult.stdout.includes("ASK sensors: pass")) {
    throw new Error(`review blocker/follow-up separation fixture should pass sensors\n${separatedReviewResult.stdout}`);
  }

  const legacyReviewOutput = resolve(target, "legacy-review-output.txt");
  writeFileSync(
    legacyReviewOutput,
    `Decision:\n- approve\n\nLayer summary:\n- Domain: skipped\n\n${validEnvelopeBlock}`,
  );
  const legacyReviewResult = runRepoScript([sensorsScript, "--target", target, "--mode", "review", "--input", legacyReviewOutput]);
  assertRuntimePass("legacy fixed layer summary is rejected", legacyReviewResult);
  if (!legacyReviewResult.stdout.includes("fixed layer summary contract")) {
    throw new Error(`legacy review output should be rejected by the signal-first sensor\n${legacyReviewResult.stdout}`);
  }

  const claudeReviewCommand = readFileSync(resolve(repoRoot, "adapters/claude-code/project/.claude/commands/skill-review.md"), "utf8");
  if (!claudeReviewCommand.includes("fenced JSON `Execution Envelope`") || !claudeReviewCommand.includes("docs/execution-envelope-contract.md")) {
    throw new Error("Claude review adapter must require the shared fenced JSON Execution Envelope");
  }
  const distributedReviewAdapters = [
    "adapters/codex/prompts/skill-review.md",
    "adapters/claude-code/project/.claude/commands/skill-review.md",
    "adapters/claude-code/plugin/skills/review-pr/SKILL.md",
    "adapters/claude-code/github-actions/claude-review-on-mention.yml",
  ];
  for (const adapterPath of distributedReviewAdapters) {
    const adapterText = readFileSync(resolve(repoRoot, adapterPath), "utf8");
    for (const section of ["Change signals:", "Required gates:", "Skipped heavy gates:", "Missing evidence:"]) {
      if (!adapterText.includes(section)) {
        throw new Error(`${adapterPath} must project the signal-first review route section: ${section}`);
      }
    }
    const registryReference = adapterPath.startsWith("adapters/claude-code/plugin/")
      ? "${CLAUDE_PLUGIN_ROOT}/contracts/review-signal-gate-map.json"
      : "schemas/review-signal-gate-map.json";
    if (!adapterText.includes(registryReference)) {
      throw new Error(`${adapterPath} must reference the controlled signal registry: ${registryReference}`);
    }
  }
  const claudeOutput = resolve(target, "claude-review-output.txt");
  writeFileSync(claudeOutput, `Change signals:\n- verification: focused validation is available\n\nRequired gates:\n- review-automated-gate: regression evidence; triggered by verification\n\nSkipped heavy gates:\n- review-adversarial-risk: no security or misuse signal\n\nMissing evidence:\n- none\n\nDecision:\n- approve with comments\n\nBlocking evidence:\n- none\n\nPassed required gates:\n- review-automated-gate - focused validation\n\nInsufficient evidence:\n- none\n\nNon-blocking follow-ups:\n- none\n\nResidual risk:\n- none\n\n${validEnvelopeBlock}`);
  const claudeOutputResult = runRepoScript([sensorsScript, "--target", target, "--mode", "review", "--input", claudeOutput]);
  assertRuntimePass("Claude adapter output smoke", claudeOutputResult);
  if (!claudeOutputResult.stdout.includes("ASK sensors: pass")) {
    throw new Error(`Claude adapter output smoke should pass shared envelope validation\n${claudeOutputResult.stdout}`);
  }

  const claudeGithubAction = readFileSync(resolve(repoRoot, "adapters/claude-code/github-actions/claude-review-on-mention.yml"), "utf8");
  const claudePromptMatch = claudeGithubAction.match(/\n {10}prompt: \|\n([\s\S]*?)\n {10}claude_args:/);
  if (!claudePromptMatch) throw new Error("Claude GitHub Actions prompt block is missing");
  const claudePrompt = claudePromptMatch[1].split("\n").map((line) => line.startsWith("            ") ? line.slice(12) : line).join("\n");
  for (const section of ["Change signals:", "Required gates:", "Skipped heavy gates:", "Missing evidence:"]) {
    if (!claudePrompt.includes(section)) {
      throw new Error(`Claude GitHub Actions prompt must require the signal-first review route section: ${section}`);
    }
  }
  const claudeActionEnvelope = inspectExecutionEnvelope(claudePrompt);
  if (claudeActionEnvelope.status !== "parsed" || claudeActionEnvelope.value.route.work_mode !== "レビュー") {
    throw new Error(`Claude GitHub Actions example must be a canonical schema-valid Japanese review envelope\n${JSON.stringify(claudeActionEnvelope, null, 2)}`);
  }
  if (!claudeGithubAction.includes("Emit exactly one fenced JSON Execution Envelope") || !claudeGithubAction.includes("Execution Envelope:\n")) {
    throw new Error("Claude GitHub Actions adapter must require a fenced JSON Execution Envelope");
  }
  const claudeGithubOutput = resolve(target, "claude-github-action-output.txt");
  writeFileSync(claudeGithubOutput, `Change signals:\n- verification: focused validation is available\n\nRequired gates:\n- review-automated-gate: regression evidence; triggered by verification\n\nSkipped heavy gates:\n- review-adversarial-risk: no security or misuse signal\n\nMissing evidence:\n- none\n\nDecision:\n- approve with comments\n\nBlocking evidence:\n- none\n\nPassed required gates:\n- review-automated-gate - focused validation\n\nInsufficient evidence:\n- none\n\nNon-blocking follow-ups:\n- none\n\nResidual risk:\n- none\n\n${validEnvelopeBlock}`);
  const claudeGithubOutputResult = runRepoScript([sensorsScript, "--target", target, "--mode", "review", "--input", claudeGithubOutput]);
  assertRuntimePass("Claude GitHub Actions adapter output smoke", claudeGithubOutputResult);
  if (!claudeGithubOutputResult.stdout.includes("ASK sensors: pass")) {
    throw new Error(`Claude GitHub Actions adapter output smoke should pass shared envelope validation\n${claudeGithubOutputResult.stdout}`);
  }

  const claudePluginReviewSkill = readFileSync(resolve(repoRoot, "adapters/claude-code/plugin/skills/review-pr/SKILL.md"), "utf8");
  if (!claudePluginReviewSkill.includes("fenced JSON `Execution Envelope`") || !claudePluginReviewSkill.includes("${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md")) {
    throw new Error("Claude plugin review skill must require the shared fenced JSON Execution Envelope");
  }
  const claudePluginOutput = resolve(target, "claude-plugin-review-output.txt");
  writeFileSync(claudePluginOutput, `Change signals:\n- verification: focused validation is available\n\nRequired gates:\n- review-automated-gate: regression evidence; triggered by verification\n\nSkipped heavy gates:\n- review-adversarial-risk: no security or misuse signal\n\nMissing evidence:\n- none\n\nDecision:\n- approve with comments\n\nBlocking evidence:\n- none\n\nPassed required gates:\n- review-automated-gate - focused validation\n\nInsufficient evidence:\n- none\n\nNon-blocking follow-ups:\n- none\n\nResidual risk:\n- none\n\n${validEnvelopeBlock}`);
  const claudePluginOutputResult = runRepoScript([sensorsScript, "--target", target, "--mode", "review", "--input", claudePluginOutput]);
  assertRuntimePass("Claude plugin adapter output smoke", claudePluginOutputResult);
  if (!claudePluginOutputResult.stdout.includes("ASK sensors: pass")) {
    throw new Error(`Claude plugin adapter output smoke should pass shared envelope validation\n${claudePluginOutputResult.stdout}`);
  }

  const pluginOnlyRoot = resolve(fixtureRoot, "claude-plugin-only-package");
  for (const relativePath of [
    "skills/review-pr/SKILL.md",
    "contracts/execution-envelope-contract.md",
    "contracts/review-signal-gate-map.json",
    "schemas/execution-envelope.schema.json",
    "schemas/metrics-event.schema.json",
  ]) {
    const sourcePath = resolve(repoRoot, "adapters/claude-code/plugin", relativePath);
    const targetPath = resolve(pluginOnlyRoot, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, readFileSync(sourcePath));
  }
  const pluginSkill = readFileSync(resolve(pluginOnlyRoot, "skills/review-pr/SKILL.md"), "utf8");
  const pluginContract = resolve(pluginOnlyRoot, "contracts/execution-envelope-contract.md");
  const pluginSignalRegistry = resolve(pluginOnlyRoot, "contracts/review-signal-gate-map.json");
  const pluginSchema = resolve(pluginOnlyRoot, "schemas/execution-envelope.schema.json");
  if (!pluginSkill.includes("${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md") || !pluginSkill.includes("${CLAUDE_PLUGIN_ROOT}/contracts/review-signal-gate-map.json") || !existsSync(pluginContract) || !existsSync(pluginSignalRegistry) || !existsSync(pluginSchema)) {
    throw new Error("Claude plugin-only package must contain resolvable contract, signal registry, and schema assets");
  }
  const pluginRegistry = JSON.parse(readFileSync(pluginSignalRegistry, "utf8"));
  if (!pluginRegistry.signal_to_gates?.public_api_change?.includes("review-architecture-impact") || !pluginRegistry.signal_to_gates?.generated_output_failure_mode?.includes("review-adversarial-risk")) {
    throw new Error("Claude plugin-only package must expose the controlled signal registry mapping");
  }
  const pluginOnlyEnvelope = inspectExecutionEnvelope(validEnvelopeBlock, { schemaPath: pluginSchema });
  if (pluginOnlyEnvelope.status !== "parsed") {
    throw new Error(`Claude plugin-only package schema must validate the shared envelope\n${JSON.stringify(pluginOnlyEnvelope, null, 2)}`);
  }

  const promptContracts = [
    ["investigation", "Findings:\n- Reproduced fixture.\n\nCause:\n- Fixture cause.\n\nChanged:\n- None.\n\nVerified:\n- node scripts/test-validate-repo.mjs\n\nUnknown / not verified:\n- External runtime.\n\nNext:\n- Continue investigation.\n\n" + validEnvelopeBlock],
    ["verification", "Verification Contract:\n- Artifact ID: VER-FIXTURE\n- Behavior to prove: fixture.\n\nEvidence:\n- Verification Contract ref: VER-FIXTURE\n- command: node scripts/test-validate-repo.mjs\n  result: pass\n\n" + validEnvelopeBlock],
    ["handoff", "Task:\n- Continue fixture work.\n\nContext:\n- Local test only.\n\nAllowed scope:\n- Tests.\n\nForbidden scope:\n- External operations.\n\nExpected output:\n- Verification result.\n\nVerification:\n- node scripts/test-validate-repo.mjs\n\nStop condition:\n- Missing evidence.\n\n" + insufficientEvidenceEnvelopeBlock],
  ];
  for (const [mode, content] of promptContracts) {
    const input = resolve(target, `${mode}-contract.txt`);
    writeFileSync(input, content);
    const contractResult = runRepoScript([sensorsScript, "--target", target, "--mode", mode, "--input", input]);
    assertRuntimePass(`sensors ${mode} contract pass`, contractResult);
    if (!contractResult.stdout.includes("ASK sensors: pass")) {
      throw new Error(`${mode} prompt contract should pass sensors\n${contractResult.stdout}`);
    }
  }

  const riskInput = resolve(target, "risk.txt");
  writeFileSync(riskInput, "Next action: deploy production config.\n");
  const riskResult = runRepoScript([
    sensorsScript,
    "--target",
    target,
    "--mode",
    "implementation",
    "--input",
    riskInput,
    "--changed-files",
    ".github/workflows/deploy.yml",
  ]);
  assertRuntimePass("sensors hard stop is report-only", riskResult);
  if (!riskResult.stdout.includes("ASK sensors: hard_stop") || !riskResult.stdout.includes("approval-required action")) {
    throw new Error(`risk surface should be report-only hard_stop\n${riskResult.stdout}`);
  }

  const negatedRisk = resolve(target, "negated-risk.txt");
  writeFileSync(
    negatedRisk,
    `Implementation Contract:
- Artifact ID: IMPL-NEGATED-RISK
- Upstream refs: WP-NEGATED-RISK
- Actual change boundary: documentation only; no deployment or release action was performed
- Verification attempted: node scripts/test-validate-repo.mjs
- Evidence references: evidence below
- Handoff state: reviewed auth docs only
- Discovered scope: email behavior was not touched; auth code was not modified; telemetry is out of scope

Evidence:
- command: node scripts/test-validate-repo.mjs
  result: pass
${validEnvelopeBlock}
`,
  );
  const negatedRiskResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", negatedRisk]);
  assertRuntimePass("sensors negated risk references pass", negatedRiskResult);
  if (!negatedRiskResult.stdout.includes("ASK sensors: pass") || negatedRiskResult.stdout.includes("risk_surface: hard_stop")) {
    throw new Error(`negated or non-action risk references should not hard-stop\n${negatedRiskResult.stdout}`);
  }

  const scopedEvidencePhrases = resolve(target, "scoped-evidence-phrases.txt");
  writeFileSync(
    scopedEvidencePhrases,
    `Implementation Contract:
- Artifact ID: IMPL-SCOPED-EVIDENCE
- Upstream refs: WP-SCOPED-EVIDENCE
- Actual change boundary: quoted issue title "Fixed flaky sensor wording"
- Verification attempted: node scripts/test-validate-repo.mjs
- Evidence references: evidence below
- Handoff state: review pending
- Discovered scope: correctness of unrelated adapters is not confirmed; read-only investigation remains allowed without a safety claim

Evidence:
- command: node scripts/test-validate-repo.mjs
  result: pass
${validEnvelopeBlock}
`,
  );
  const scopedEvidencePhraseResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", scopedEvidencePhrases]);
  assertRuntimePass("sensors scoped evidence phrase references pass", scopedEvidencePhraseResult);
  if (!scopedEvidencePhraseResult.stdout.includes("ASK sensors: pass") || scopedEvidencePhraseResult.stdout.includes("evidence_phrase: warn")) {
    throw new Error(`quoted, negated, or risk-scoped evidence phrases should not warn as unsupported claims\n${scopedEvidencePhraseResult.stdout}`);
  }

  const trueRisk = resolve(target, "true-risk.txt");
  writeFileSync(trueRisk, "Changed:\n- Changed auth behavior.\n");
  const trueRiskResult = runRepoScript([sensorsScript, "--target", target, "--mode", "implementation", "--input", trueRisk]);
  assertRuntimePass("sensors true auth risk is report-only", trueRiskResult);
  if (!trueRiskResult.stdout.includes("ASK sensors: hard_stop") || !trueRiskResult.stdout.includes("auth_permission_billing_payment_email_or_telemetry")) {
    throw new Error(`true auth behavior change should remain hard_stop\n${trueRiskResult.stdout}`);
  }

  const unsupportedTarget = cloneFixture("sensors-unsupported-target");
  writeFileSync(resolve(unsupportedTarget, "README.md"), "# Claim\n\nCodex local metrics event recording is supported.\n");
  const unsupportedResult = runRepoScript([sensorsScript, "--target", unsupportedTarget, "--mode", "implementation", "--input", implementationPass]);
  assertRuntimePass("sensors unsupported capability is report-only", unsupportedResult);
  if (!unsupportedResult.stdout.includes("ASK sensors: fail") || !unsupportedResult.stdout.includes("Adapter capability overclaims")) {
    throw new Error(`unsupported adapter claim should be report-only fail\n${unsupportedResult.stdout}`);
  }
}

function hookIdentities(hooks) {
  const identities = [];
  for (const [eventName, groups] of Object.entries(hooks ?? {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        identities.push(JSON.stringify([eventName, group.matcher ?? "", hook.type ?? "", hook.command ?? ""]));
      }
    }
  }
  return identities;
}

function assertKnownStakeholderGateReference(event, field, value, knownSkillOrGateNames) {
  if (typeof value === "string" && value.length > 0 && !knownSkillOrGateNames.has(value)) {
    throw new Error(`stakeholder fixture ${event.event_id} references unknown ${field}: ${value}`);
  }
}

function assertStakeholderGateConsistency(event, knownSkillOrGateNames) {
  for (const skill of event.skills_used ?? []) {
    assertKnownStakeholderGateReference(event, "skills_used", skill, knownSkillOrGateNames);
  }

  const routing = event.routing_result ?? {};
  assertKnownStakeholderGateReference(event, "primary_skill", routing.primary_skill, knownSkillOrGateNames);

  const required = new Set(routing.required_gates ?? []);
  const executed = new Set(routing.executed_gates ?? []);
  for (const gate of required) {
    assertKnownStakeholderGateReference(event, "required_gates", gate, knownSkillOrGateNames);
  }
  for (const gate of executed) {
    assertKnownStakeholderGateReference(event, "executed_gates", gate, knownSkillOrGateNames);
  }
  for (const skipped of routing.skipped_gates ?? []) {
    const gate = skipped.gate;
    assertKnownStakeholderGateReference(event, "skipped_gates", gate, knownSkillOrGateNames);
    if (required.has(gate) && !executed.has(gate)) {
      throw new Error(`stakeholder fixture ${event.event_id} has gate ${gate} in required_gates and skipped_gates without executed_gates`);
    }
  }
}

function assertStakeholderReadinessSamples() {
  const samplePaths = [
    "docs/ai/reports/examples/senior-engineer-readiness-sample.md",
    "docs/ai/reports/examples/development-manager-readiness-sample.md",
    "docs/ai/reports/examples/business-unit-client-value-readiness-sample.md",
    "docs/ai/reports/examples/ai-promotion-readiness-sample.md",
  ];
  const fixturePath = "docs/ai/metrics/fixtures/stakeholder-readiness-events.jsonl";
  const allPaths = [fixturePath, ...samplePaths];
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8"));
  const allowedFixtureGateVocabulary = new Set();
  const knownSkillOrGateNames = new Set([...(manifest.skills ?? []), ...allowedFixtureGateVocabulary]);
  for (const skill of manifest.skills ?? []) {
    if (!existsSync(resolve(repoRoot, "skills", skill, "SKILL.md"))) {
      throw new Error(`stakeholder fixture gate vocabulary references missing skill: ${skill}`);
    }
  }
  for (const path of allPaths) {
    if (!existsSync(resolve(repoRoot, path))) {
      throw new Error(`stakeholder readiness sample path should exist: ${path}`);
    }
    if (!manifest.docs.includes(path)) {
      throw new Error(`stakeholder readiness sample path should be referenced from manifest.json.docs: ${path}`);
    }
  }

  const template = readFileSync(resolve(repoRoot, "docs/ai/stakeholder-readiness-report-template.md"), "utf8");
  if (!template.includes("docs/ai/reports/examples/") || !template.includes(fixturePath)) {
    throw new Error("stakeholder readiness template should reference sample reports and fixture events");
  }
  const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
  if (!readme.includes("docs/ai/reports/examples/")) {
    throw new Error("README should reference stakeholder readiness sample reports");
  }

  const metricsSchema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/metrics-event.schema.json"), "utf8"));
  const fixtureLines = readFileSync(resolve(repoRoot, fixturePath), "utf8").trim().split(/\r?\n/);
  if (fixtureLines.length < 3) {
    throw new Error("stakeholder readiness fixture should include multiple sample events");
  }
  for (const [index, line] of fixtureLines.entries()) {
    const event = JSON.parse(line);
    assertSchemaPass(`stakeholder fixture event ${index + 1}`, metricsSchema, event);
    assertStakeholderGateConsistency(event, knownSkillOrGateNames);
    if (
      event.privacy_note.raw_prompts_stored !== false ||
      event.privacy_note.secrets_stored !== false ||
      event.privacy_note.customer_data_stored !== false ||
      event.privacy_note.personal_data_stored !== false ||
      event.privacy_note.external_publication !== false
    ) {
      throw new Error(`stakeholder fixture should keep privacy flags false\n${JSON.stringify(event, null, 2)}`);
    }
  }

  for (const path of samplePaths) {
    const content = readFileSync(resolve(repoRoot, path), "utf8");
    for (const required of ["Sample status: fixture data only", "Evidence reviewed:", "Evidence status:", "Decision / readiness status:", "Internal workflow quality:", "Release readiness:", "Client-value readiness:", "Residual risk:"]) {
      if (!content.includes(required)) {
        throw new Error(`${path} is missing required stakeholder sample section: ${required}`);
      }
    }
    for (const forbidden of [/\bsk-[A-Za-z0-9_-]{20,}/, /BEGIN PROMPT/i, /customer data:/i, /person-level ranking:/i, /HR scoring:/i]) {
      if (forbidden.test(content)) {
        throw new Error(`${path} appears to include forbidden raw or personnel data pattern: ${forbidden}`);
      }
    }
  }

  const businessUnitSample = readFileSync(resolve(repoRoot, "docs/ai/reports/examples/business-unit-client-value-readiness-sample.md"), "utf8");
  if (
    !businessUnitSample.includes("Client-facing value claim: insufficient evidence") ||
    !businessUnitSample.includes("Unknown. Internal workflow quality is not the same as client value.") ||
    !businessUnitSample.includes("Required before a client-value claim")
  ) {
    throw new Error("business unit sample should avoid client-value overclaiming without outcome evidence");
  }

  const aiPromotionSample = readFileSync(resolve(repoRoot, "docs/ai/reports/examples/ai-promotion-readiness-sample.md"), "utf8");
  for (const state of ["Supported:", "Partial:", "Unknown:"]) {
    if (!aiPromotionSample.includes(state)) {
      throw new Error(`AI promotion sample should list capability state: ${state}`);
    }
  }
  if (!aiPromotionSample.includes("not a personnel evaluation") || !aiPromotionSample.includes("Personnel evaluation readiness: not applicable")) {
    throw new Error("AI promotion sample should preserve the personnel-evaluation boundary");
  }
}

function isFailOpenHookCommand(command) {
  return />\/dev\/null\s+2>&1\s+\|\|\s+true(?:\s+#\s+agent-spectrum-kernel:[\w-]+)?\s*$/.test(command);
}

function assertCanonicalCollectorInstructions() {
  const commandNames = ["skill-review.md", "skill-implement.md", "skill-investigate.md", "skill-verify.md", "skill-handoff.md"];
  for (const commandName of commandNames) {
    const commandPath = resolve(repoRoot, "adapters/claude-code/project/.claude/commands", commandName);
    const content = readFileSync(commandPath, "utf8");
    if (content.includes("current-task.json") || content.includes("Silent metrics sidecar") || content.includes(".claude/metrics")) {
      throw new Error(`${commandName} must not instruct the model to write metrics directly`);
    }
  }

  for (const skillPath of [
    "adapters/claude-code/plugin/skills/review-pr/SKILL.md",
    "adapters/claude-code/plugin/skills/implementation-context-check/SKILL.md",
  ]) {
    const content = readFileSync(resolve(repoRoot, skillPath), "utf8");
    if (content.includes("current-task.json") || content.includes(".claude/metrics")) {
      throw new Error(`${skillPath} must not instruct the model to write metrics directly`);
    }
  }

  const hooks = JSON.parse(readFileSync(resolve(repoRoot, "adapters/claude-code/project/.claude/hooks/hooks.json"), "utf8"));
  const projectHookCommands = Object.values(hooks.hooks ?? {}).flatMap((groups) =>
    (Array.isArray(groups) ? groups : []).flatMap((group) =>
      (Array.isArray(group.hooks) ? group.hooks : []).map((hook) => hook.command ?? ""),
    ),
  );
  const metricsHookCommands = projectHookCommands.filter((command) => command.includes("ai-metrics-record.mjs"));
  if (metricsHookCommands.length === 0) {
    throw new Error("project hooks should include metrics recorder commands");
  }
  for (const command of metricsHookCommands) {
    if (!command.includes("--non-blocking") || !isFailOpenHookCommand(command)) {
      throw new Error(`project metrics hook should be shell-level fail-open and silent\n${command}`);
    }
  }
  const projectBashCommands = (hooks.hooks?.PostToolUse ?? [])
    .filter((group) => group.matcher === "Bash")
    .flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? ""));
  if (
    projectBashCommands.length === 0 ||
    projectBashCommands.some((command) => !command.includes("--event-kind command_attempt") || command.includes("--event-kind verification_attempt"))
  ) {
    throw new Error(`project Bash hooks should record command_attempt, not verification_attempt\n${projectBashCommands.join("\n")}`);
  }

  const stopCommands = (hooks.hooks?.Stop ?? []).flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? ""));
  const collectorStopCommand = stopCommands.find((command) => command.includes("--event-kind task_stop") && command.includes("--non-blocking"));
  if (!collectorStopCommand || collectorStopCommand.includes("--sidecar") || collectorStopCommand.includes("current-task.json")) {
    throw new Error("project Stop hook should invoke the runtime-owned canonical result collector without a sidecar");
  }

  const missingRuntimeRoot = resolve(fixtureRoot, "hook-missing-runtime");
  mkdirSync(missingRuntimeRoot, { recursive: true });
  const missingRuntimeResult = spawnSync("/bin/sh", ["-c", collectorStopCommand], {
    cwd: missingRuntimeRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: missingRuntimeRoot },
    input: JSON.stringify({ session_id: "S-MISSING-RUNTIME" }),
    encoding: "utf8",
  });
  assertRuntimePass("project Stop hook missing runtime script", missingRuntimeResult);
  if (missingRuntimeResult.stdout || missingRuntimeResult.stderr) {
    throw new Error(`project Stop hook missing runtime should stay silent\nstdout:\n${missingRuntimeResult.stdout}\nstderr:\n${missingRuntimeResult.stderr}`);
  }
}

try {
  const adapterProfileSchema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/adapter-runtime-profile.schema.json"), "utf8"));
  const adapterEvidenceSchema = JSON.parse(readFileSync(resolve(repoRoot, "schemas/adapter-runtime-evidence.schema.json"), "utf8"));
  const adapterEvidenceFixture = JSON.parse(readFileSync(resolve(repoRoot, "docs/fixtures/adapter-runtime-evidence.json"), "utf8"));
  assertSchemaPass("adapter evidence schema", adapterEvidenceSchema, adapterEvidenceFixture);
  const adapterEvidenceIssues = inspectAdapterRuntimeEvidenceArtifact(adapterEvidenceFixture, { root: repoRoot });
  if (adapterEvidenceIssues.length > 0) throw new Error(`adapter evidence fixture should pass\n${adapterEvidenceIssues.join("\n")}`);
  const duplicateEvidenceArtifact = JSON.parse(JSON.stringify(adapterEvidenceFixture));
  duplicateEvidenceArtifact.records.push(JSON.parse(JSON.stringify(duplicateEvidenceArtifact.records[0])));
  const duplicateEvidenceIssues = inspectAdapterRuntimeEvidenceArtifact(duplicateEvidenceArtifact, { root: repoRoot });
  if (!duplicateEvidenceIssues.some((issue) => issue.includes("evidence record_id must be unique"))) throw new Error(`duplicate evidence record should fail closed\n${duplicateEvidenceIssues.join("\n")}`);
  const unregisteredBehaviorArtifact = JSON.parse(JSON.stringify(adapterEvidenceFixture));
  const unregisteredBehaviorRecord = unregisteredBehaviorArtifact.records[0];
  unregisteredBehaviorRecord.evidence_kind = "capability_fixture_result";
  unregisteredBehaviorRecord.evidence_level = "behavior_verified";
  unregisteredBehaviorRecord.verification = {
    verifier_path: "scripts/test-validate-repo.mjs",
    fixture_id: "forged-behavior-pass",
    target_paths: ["scripts/install-claude-adapter.mjs"],
    expected_result: "pass",
    actual_result: "pass",
    exit_status: 0,
  };
  const unregisteredBehaviorIssues = inspectAdapterRuntimeEvidenceArtifact(unregisteredBehaviorArtifact, { root: repoRoot });
  if (!unregisteredBehaviorIssues.includes("claude-projection-manifest fixture_id is not registered: forged-behavior-pass")) throw new Error(`unregistered behavioral evidence should fail closed\n${unregisteredBehaviorIssues.join("\n")}`);
  const incompleteBehaviorArtifact = JSON.parse(JSON.stringify(unregisteredBehaviorArtifact));
  delete incompleteBehaviorArtifact.records[0].verification.fixture_id;
  assertSchemaFail("behavior evidence missing fixture ID", adapterEvidenceSchema, incompleteBehaviorArtifact);
  const adapterProfileFixture = JSON.parse(readFileSync(resolve(repoRoot, "docs/fixtures/adapter-runtime-profiles.json"), "utf8"));
  for (const profile of adapterProfileFixture.profiles) {
    assertSchemaPass(`adapter profile schema ${profile.profile_id}`, adapterProfileSchema, profile);
    const issues = inspectAdapterRuntimeProfile(profile, { root: repoRoot });
    if (issues.length > 0) throw new Error(`${profile.profile_id} should pass semantic profile validation\n${issues.join("\n")}`);
  }
  const codexCompactProfile = adapterProfileFixture.profiles.find((profile) => profile.adapter_id === "codex");
  if (!codexCompactProfile || codexCompactProfile.schema_version !== "1.1.0" || !Array.isArray(codexCompactProfile.rendering.compact_profiles)) {
    throw new Error("Codex compact metadata must be represented by shared adapter runtime profile schema revision 1.1.0");
  }
  const legacySchemaWithCompactMetadata = JSON.parse(JSON.stringify(codexCompactProfile));
  legacySchemaWithCompactMetadata.schema_version = "1.0.0";
  const legacySchemaWithCompactMetadataIssues = inspectAdapterRuntimeProfile(legacySchemaWithCompactMetadata, { root: repoRoot });
  if (!legacySchemaWithCompactMetadataIssues.includes("schema_version 1.0.0 must not contain rendering.compact_profiles")) {
    throw new Error(`legacy schema must reject compact metadata\n${legacySchemaWithCompactMetadataIssues.join("\n")}`);
  }
  const revisedSchemaWithoutCompactMetadata = JSON.parse(JSON.stringify(codexCompactProfile));
  delete revisedSchemaWithoutCompactMetadata.rendering.compact_profiles;
  const revisedSchemaWithoutCompactMetadataIssues = inspectAdapterRuntimeProfile(revisedSchemaWithoutCompactMetadata, { root: repoRoot });
  if (!revisedSchemaWithoutCompactMetadataIssues.includes("schema_version 1.1.0 requires rendering.compact_profiles")) {
    throw new Error(`schema revision 1.1.0 must require compact metadata\n${revisedSchemaWithoutCompactMetadataIssues.join("\n")}`);
  }
  const driftedCompactMetadata = JSON.parse(JSON.stringify(codexCompactProfile));
  driftedCompactMetadata.rendering.compact_profiles[0].requested_contracts.push("unsupported-child-contract");
  const driftedCompactMetadataIssues = inspectAdapterRuntimeProfile(driftedCompactMetadata, { root: repoRoot });
  if (!driftedCompactMetadataIssues.includes("rendering.compact_profiles must exactly match the shared Codex projection plan")) {
    throw new Error(`compact metadata must remain derived from the shared Codex projection plan\n${driftedCompactMetadataIssues.join("\n")}`);
  }
  const invalidDowngradeProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  invalidDowngradeProfile.capabilities.find((capability) => capability.capability_id === "lifecycle_hooks").downgrade_behavior = "none";
  const invalidDowngradeIssues = inspectAdapterRuntimeProfile(invalidDowngradeProfile, { root: repoRoot });
  if (!invalidDowngradeIssues.some((issue) => issue.includes("inconsistent with partial/projected"))) {
    throw new Error(`invalid adapter downgrade should fail closed\n${invalidDowngradeIssues.join("\n")}`);
  }
  const missingCapabilityProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  missingCapabilityProfile.capabilities = missingCapabilityProfile.capabilities.filter((capability) => capability.capability_id !== "shared_pr_execution");
  const missingCapabilityIssues = inspectAdapterRuntimeProfile(missingCapabilityProfile, { root: repoRoot });
  if (!missingCapabilityIssues.includes("capabilities must include shared_pr_execution")) {
    throw new Error(`missing required adapter capability should fail closed\n${missingCapabilityIssues.join("\n")}`);
  }
  const modelDependentProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  modelDependentProfile.rendering.model_name = "current-model";
  const modelDependentIssues = inspectAdapterRuntimeProfile(modelDependentProfile, { root: repoRoot });
  if (!modelDependentIssues.includes("profile must not contain model-dependent fields")) {
    throw new Error(`model-dependent adapter profile should fail closed\n${modelDependentIssues.join("\n")}`);
  }
  const digestMismatchProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  digestMismatchProfile.canonical_contract.source_digest = `sha256:${"0".repeat(64)}`;
  const digestMismatchIssues = inspectAdapterRuntimeProfile(digestMismatchProfile, { root: repoRoot });
  if (!digestMismatchIssues.includes("canonical_contract.source_digest does not match canonical source_paths")) {
    throw new Error(`canonical digest mismatch should fail closed\n${digestMismatchIssues.join("\n")}`);
  }
  const missingCanonicalPathProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  missingCanonicalPathProfile.canonical_contract.source_paths[1] = "docs/missing-contract.md";
  const missingCanonicalPathIssues = inspectAdapterRuntimeProfile(missingCanonicalPathProfile, { root: repoRoot });
  if (!missingCanonicalPathIssues.some((issue) => issue.includes("file is missing: docs/missing-contract.md"))) {
    throw new Error(`missing canonical source should fail closed\n${missingCanonicalPathIssues.join("\n")}`);
  }
  const adapterCanonicalPathProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  adapterCanonicalPathProfile.canonical_contract.source_paths[1] = "adapters/codex/README.md";
  const adapterCanonicalPathIssues = inspectAdapterRuntimeProfile(adapterCanonicalPathProfile, { root: repoRoot });
  if (!adapterCanonicalPathIssues.some((issue) => issue.includes("outside canonical ASK sources"))) {
    throw new Error(`adapter source as canonical provenance should fail closed\n${adapterCanonicalPathIssues.join("\n")}`);
  }
  const fakeEvidenceProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  fakeEvidenceProfile.capabilities[0].evidence_refs[0].artifact_ref = "docs/fixtures/missing-evidence.json";
  const fakeEvidenceIssues = inspectAdapterRuntimeProfile(fakeEvidenceProfile, { root: repoRoot });
  if (!fakeEvidenceIssues.some((issue) => issue.includes("evidence artifact is missing"))) {
    throw new Error(`missing evidence artifact should fail closed\n${fakeEvidenceIssues.join("\n")}`);
  }
  const wrongEvidenceKindProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  wrongEvidenceKindProfile.capabilities[0].evidence_refs[0].evidence_kind = "bounded_run_result";
  const wrongEvidenceKindIssues = inspectAdapterRuntimeProfile(wrongEvidenceKindProfile, { root: repoRoot });
  if (!wrongEvidenceKindIssues.some((issue) => issue.includes("projected requires projection_manifest"))) {
    throw new Error(`wrong evidence kind should fail closed\n${wrongEvidenceKindIssues.join("\n")}`);
  }
  const reusedProjectionEvidenceProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  reusedProjectionEvidenceProfile.profile_id = "codex-review-projection-v1";
  reusedProjectionEvidenceProfile.rendering.renderer_profile = "review";
  reusedProjectionEvidenceProfile.profile_fingerprint = computeAdapterProfileFingerprint(reusedProjectionEvidenceProfile);
  const reusedProjectionEvidenceIssues = inspectAdapterRuntimeProfile(reusedProjectionEvidenceProfile, { root: repoRoot });
  if (!reusedProjectionEvidenceIssues.some((issue) => issue.includes("does not match profile identity/fingerprint"))) throw new Error(`projection evidence reuse across profiles should fail closed\n${reusedProjectionEvidenceIssues.join("\n")}`);
  for (const [field, value] of [["renderer_id", "unrelated-renderer"], ["renderer_version", "999"]]) {
    const wrongRendererProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
    wrongRendererProfile.rendering[field] = value;
    wrongRendererProfile.profile_fingerprint = computeAdapterProfileFingerprint(wrongRendererProfile);
    const wrongRendererIssues = inspectAdapterRuntimeProfile(wrongRendererProfile, { root: repoRoot });
    if (!wrongRendererIssues.some((issue) => issue.includes(`${field} must match adapter registry`))) throw new Error(`${field} mismatch should fail closed\n${wrongRendererIssues.join("\n")}`);
  }
  const nonDefaultStaticEvidenceProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  nonDefaultStaticEvidenceProfile.rendering.plan_shaping_options.skip_runtime = true;
  nonDefaultStaticEvidenceProfile.profile_fingerprint = computeAdapterProfileFingerprint(nonDefaultStaticEvidenceProfile);
  const nonDefaultStaticEvidenceIssues = inspectAdapterRuntimeProfile(nonDefaultStaticEvidenceProfile, { root: repoRoot });
  if (!nonDefaultStaticEvidenceIssues.includes("plan_shaping_options must match the static profile evidence projection")) {
    throw new Error(`static projection evidence must reject non-default plan options\n${nonDefaultStaticEvidenceIssues.join("\n")}`);
  }
  const appliedProvenance = {
    cli_options: { profile: "observability", skip_hooks: false, skip_runtime: false },
    source_revision: "a".repeat(40),
    previous_managed_state_digest: `sha256:${"1".repeat(64)}`,
    partial_file_managed_subset_digest: `sha256:${"2".repeat(64)}`,
    target_partial_file_state_digest: `sha256:${"3".repeat(64)}`,
  };
  const appliedFingerprint = computeAdapterAppliedProvenanceFingerprint(appliedProvenance);
  if (appliedFingerprint === computeAdapterAppliedProvenanceFingerprint({ ...appliedProvenance, source_revision: "b".repeat(40) })) throw new Error("Git revision changes must alter applied provenance fingerprint");
  if (appliedFingerprint === computeAdapterAppliedProvenanceFingerprint({ ...appliedProvenance, target_partial_file_state_digest: `sha256:${"4".repeat(64)}` })) throw new Error("target hook state changes must alter applied provenance fingerprint");
  for (const [role, label] of [["skill", "selected skill"], ["prompt_template", "adapter template"], ["inventory", "runtime inventory"]]) {
    const staleRendererProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
    const input = [...staleRendererProfile.rendering.renderer_inputs.canonical, ...staleRendererProfile.rendering.renderer_inputs.adapter_owned].find((candidate) => candidate.role === role);
    const driftRoot = resolve(fixtureRoot, `adapter-renderer-drift-${role}`);
    const validationPaths = new Set([
      ...staleRendererProfile.rendering.renderer_inputs.canonical.map((candidate) => candidate.path),
      ...staleRendererProfile.rendering.renderer_inputs.adapter_owned.map((candidate) => candidate.path),
      ...staleRendererProfile.generated_assets.managed_assets.map((asset) => asset.inventory_source_ref),
      ...staleRendererProfile.normalized_event_schema_refs,
      "schemas/normalized-event-schema-registry.json",
      "docs/fixtures/adapter-runtime-evidence.json",
      ...adapterEvidenceFixture.records.flatMap((record) => record.observed_paths),
    ]);
    for (const path of validationPaths) {
      mkdirSync(dirname(resolve(driftRoot, path)), { recursive: true });
      writeFileSync(resolve(driftRoot, path), readFileSync(resolve(repoRoot, path)));
    }
    writeFileSync(resolve(driftRoot, input.path), `${readFileSync(resolve(driftRoot, input.path), "utf8")}\nfixture drift\n`);
    const staleRendererIssues = inspectAdapterRuntimeProfile(staleRendererProfile, { root: driftRoot });
    if (!staleRendererIssues.includes(`renderer input digest does not match: ${input.path}`)) throw new Error(`${label} drift should fail closed\n${staleRendererIssues.join("\n")}`);
  }
  const missingRuntimeAssetProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  missingRuntimeAssetProfile.generated_assets.managed_assets = missingRuntimeAssetProfile.generated_assets.managed_assets.filter((asset) => asset.path !== "scripts/codex-exec-runner.mjs");
  const missingRuntimeAssetIssues = inspectAdapterRuntimeProfile(missingRuntimeAssetProfile, { root: repoRoot });
  if (!missingRuntimeAssetIssues.some((issue) => issue.includes("managed asset inventory is missing scripts/codex-exec-runner.mjs"))) {
    throw new Error(`missing runtime inventory should fail closed\n${missingRuntimeAssetIssues.join("\n")}`);
  }
  const missingRequiredAssetProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  missingRequiredAssetProfile.generated_assets.managed_assets = missingRequiredAssetProfile.generated_assets.managed_assets.filter((asset) => asset.path !== "docs/ai/adoption-report-template.md");
  missingRequiredAssetProfile.profile_fingerprint = computeAdapterProfileFingerprint(missingRequiredAssetProfile);
  const missingRequiredAssetIssues = inspectAdapterRuntimeProfile(missingRequiredAssetProfile, { root: repoRoot });
  if (!missingRequiredAssetIssues.includes("managed asset inventory is missing docs/ai/adoption-report-template.md")) throw new Error(`missing resolved required asset should fail closed\n${missingRequiredAssetIssues.join("\n")}`);
  const extraManagedAssetProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  extraManagedAssetProfile.generated_assets.managed_assets.push({ path: "docs/ai/unowned.json", asset_kind: "configuration", ownership_mode: "full_file", inventory_source_ref: "scripts/install-codex-adapter.mjs" });
  extraManagedAssetProfile.profile_fingerprint = computeAdapterProfileFingerprint(extraManagedAssetProfile);
  const extraManagedAssetIssues = inspectAdapterRuntimeProfile(extraManagedAssetProfile, { root: repoRoot });
  if (!extraManagedAssetIssues.includes("managed asset inventory has unexpected asset docs/ai/unowned.json")) throw new Error(`unexpected managed asset should fail closed\n${extraManagedAssetIssues.join("\n")}`);
  const canonicalOwnershipProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  canonicalOwnershipProfile.generated_assets.managed_assets[0].path = "AGENTS.md";
  const canonicalOwnershipIssues = inspectAdapterRuntimeProfile(canonicalOwnershipProfile, { root: repoRoot });
  if (!canonicalOwnershipIssues.includes("managed asset path intersects canonical/core ownership: AGENTS.md")) {
    throw new Error(`canonical ownership overlap should fail closed\n${canonicalOwnershipIssues.join("\n")}`);
  }
  const pathEscapeProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  pathEscapeProfile.generated_assets.managed_assets[0].path = "../outside";
  const pathEscapeIssues = inspectAdapterRuntimeProfile(pathEscapeProfile, { root: repoRoot });
  if (!pathEscapeIssues.some((issue) => issue.includes("managed asset path is unsafe or non-normalized"))) {
    throw new Error(`managed path escape should fail closed\n${pathEscapeIssues.join("\n")}`);
  }
  const symlinkRoot = resolve(fixtureRoot, "adapter-profile-symlink");
  mkdirSync(symlinkRoot, { recursive: true });
  symlinkSync(repoRoot, resolve(symlinkRoot, "escape-link"), "dir");
  const symlinkEscapeProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  symlinkEscapeProfile.generated_assets.managed_assets[0].path = "escape-link/AGENTS.md";
  const symlinkEscapeIssues = inspectAdapterRuntimeProfile(symlinkEscapeProfile, { root: symlinkRoot });
  if (!symlinkEscapeIssues.some((issue) => issue.includes("managed asset path traverses a symlink"))) {
    throw new Error(`managed symlink escape should fail closed\n${symlinkEscapeIssues.join("\n")}`);
  }
  const inventorySourceSymlinkProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[1]));
  inventorySourceSymlinkProfile.generated_assets.managed_assets[0].inventory_source_ref = "escape-link/scripts/install-codex-adapter.mjs";
  inventorySourceSymlinkProfile.profile_fingerprint = computeAdapterProfileFingerprint(inventorySourceSymlinkProfile);
  const inventorySourceSymlinkIssues = inspectAdapterRuntimeProfile(inventorySourceSymlinkProfile, { root: symlinkRoot });
  if (!inventorySourceSymlinkIssues.some((issue) => issue.includes("inventory_source_ref is missing, unsafe, or not a regular file"))) throw new Error(`inventory source symlink should fail closed\n${inventorySourceSymlinkIssues.join("\n")}`);
  const missingEventSchemaProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  missingEventSchemaProfile.normalized_event_schema_refs = [];
  const missingEventSchemaIssues = inspectAdapterRuntimeProfile(missingEventSchemaProfile, { root: repoRoot });
  if (!missingEventSchemaIssues.includes("enabled event_collection requires a normalized event schema ref")) {
    throw new Error(`enabled event collection without schema should fail closed\n${missingEventSchemaIssues.join("\n")}`);
  }
  const wrongEventSchemaProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  wrongEventSchemaProfile.normalized_event_schema_refs = ["schemas/adapter-runtime-profile.schema.json"];
  const wrongEventSchemaIssues = inspectAdapterRuntimeProfile(wrongEventSchemaProfile, { root: repoRoot });
  if (!wrongEventSchemaIssues.includes("normalized event schema ref is not registered: schemas/adapter-runtime-profile.schema.json")) throw new Error(`non-event schema should fail registry validation\n${wrongEventSchemaIssues.join("\n")}`);
  const eventSymlinkProfile = JSON.parse(JSON.stringify(adapterProfileFixture.profiles[0]));
  eventSymlinkProfile.normalized_event_schema_refs = ["escape-link/schemas/metrics-event.schema.json"];
  const eventSymlinkIssues = inspectAdapterRuntimeProfile(eventSymlinkProfile, { root: symlinkRoot });
  if (!eventSymlinkIssues.some((issue) => issue.includes("normalized event schema ref is unsafe or traverses a symlink"))) throw new Error(`event schema symlink should fail closed\n${eventSymlinkIssues.join("\n")}`);

  const lifecycleFixture = JSON.parse(readFileSync(resolve(repoRoot, "docs/fixtures/lifecycle-artifact-chains.json"), "utf8"));
  for (const scenario of lifecycleFixture.scenarios) {
    const issues = inspectLifecycleScenario(scenario);
    if (scenario.expected === "valid" && issues.length > 0) {
      throw new Error(`lifecycle scenario ${scenario.id} should pass\n${issues.join("\n")}`);
    }
    if (scenario.expected === "invalid" && !(scenario.expected_errors ?? []).every((expected) => issues.includes(expected))) {
      throw new Error(`lifecycle scenario ${scenario.id} should expose expected contradictions\n${issues.join("\n")}`);
    }
  }

  const traceabilityFixture = JSON.parse(readFileSync(resolve(repoRoot, "docs/fixtures/lifecycle-traceability-chains.json"), "utf8"));
  if (traceabilityScenarioMatchesExpectation({ expected: "invalid", expected_errors: [] }, [])) {
    throw new Error("traceability invalid scenario must not pass with an empty error oracle");
  }
  for (const [scenarioId, expectedOutcome] of REQUIRED_TRACEABILITY_SCENARIOS) {
    const scenario = traceabilityFixture.scenarios.find((entry) => entry.id === scenarioId);
    if (!scenario || scenario.expected !== expectedOutcome) {
      throw new Error(`required traceability scenario ${scenarioId} must remain ${expectedOutcome}`);
    }
  }
  const requiredNegative = traceabilityFixture.scenarios.find((entry) => entry.id === "related-blocker-omitted");
  if (!traceabilityRequiredOutcomeIssue({ ...requiredNegative, expected: "valid" })) {
    throw new Error("required negative traceability scenario must not be relabeled valid");
  }
  for (const scenario of traceabilityFixture.scenarios) {
    const { issues, gaps } = inspectTraceabilityScenarioResult(scenario);
    if (scenario.expected === "valid" && issues.length > 0) {
      throw new Error(`traceability scenario ${scenario.id} should pass\n${issues.join("\n")}`);
    }
    if (!traceabilityScenarioMatchesExpectation(scenario, issues)) {
      throw new Error(`traceability scenario ${scenario.id} should expose exactly the expected errors\nexpected=${JSON.stringify(scenario.expected_errors ?? [])}\nactual=${JSON.stringify(issues)}`);
    }
    if (JSON.stringify(gaps) !== JSON.stringify(scenario.expected_gaps ?? [])) {
      throw new Error(`traceability scenario ${scenario.id} should expose structured gaps\nexpected=${JSON.stringify(scenario.expected_gaps ?? [])}\nactual=${JSON.stringify(gaps)}`);
    }
  }

  const validRoot = cloneFixture("valid");
  assertPass("valid fixture", validRoot);
  assertCanonicalCollectorInstructions();
  assertRuntimeScripts();
  assertInstallerScripts();
  assertCoreInstallerScripts();
  assertCodexInstallerScripts();
  assertDoctorScript();
  assertAdapterRuntimeSmokeScript();
  assertCodexRunnerScript();
  assertSensorsScript();
  assertStakeholderReadinessSamples();

  const missingSchemaRoot = cloneFixture("missing-schema");
  rmSync(resolve(missingSchemaRoot, "schemas/metrics-event.schema.json"));
  assertFail("missing required schema", missingSchemaRoot, "required schema is missing");

  const missingAdapterEventSchemaRoot = cloneFixture("missing-adapter-event-schema");
  rmSync(resolve(missingAdapterEventSchemaRoot, "schemas/adapter-runtime-event.schema.json"));
  assertFail("missing normalized adapter event schema", missingAdapterEventSchemaRoot, "required schema is missing");

  const missingAdapterEventMapperRoot = cloneFixture("missing-adapter-event-mapper");
  rmSync(resolve(missingAdapterEventMapperRoot, "scripts/adapter-runtime-event.mjs"));
  assertFail("missing normalized adapter event mapper", missingAdapterEventMapperRoot, "required adapter runtime path is missing");

  const operationSkillRoot = cloneFixture("operation-skill");
  mkdirSync(resolve(operationSkillRoot, "skills/operation-automation"), { recursive: true });
  writeFileSync(resolve(operationSkillRoot, "skills/operation-automation/SKILL.md"), validSkill("operation-automation"));
  assertFail("operation automation skill forbidden", operationSkillRoot, "operation automation must remain an external layer");

  const unsafeObservabilityRoot = cloneFixture("unsafe-observability");
  writeFileSync(
    resolve(unsafeObservabilityRoot, "docs/ai/observability-config.yml"),
    `enabled: true
storage:
  event_store: https://metrics.example.invalid/events
  report_dir: docs/ai/reports
privacy:
  raw_prompt_storage: true
  secrets_storage: false
  customer_data_storage: false
  personal_data_storage: false
external_publication:
  enabled: true
safety:
  http_hooks_enabled: false
  webhook_hooks_enabled: false
`,
  );
  assertFail("unsafe observability config", unsafeObservabilityRoot, "externalPublicationDisabled");

  const httpHookRoot = cloneFixture("http-hook");
  writeFileSync(resolve(httpHookRoot, "adapters/claude-code/project/.claude/hooks/hooks.json"), '{ "hooks": { "Stop": [{ "hooks": [{ "type": "http", "url": "https://example.invalid" }] }] } }\n');
  assertFail("http hook forbidden", httpHookRoot, "enables an HTTP hook");

  const alwaysOnWorkflowRoot = cloneFixture("always-on-workflow");
  writeFileSync(
    resolve(alwaysOnWorkflowRoot, "adapters/claude-code/github-actions/claude-review-on-mention.yml"),
    `name: Always On
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
`,
  );
  assertFail("always-on workflow forbidden", alwaysOnWorkflowRoot, "noAlwaysOnPullRequestTrigger");

  const untrustedActorWorkflowRoot = cloneFixture("untrusted-actor-workflow");
  writeFileSync(
    resolve(untrustedActorWorkflowRoot, "adapters/claude-code/github-actions/claude-review-on-mention.yml"),
    readFileSync(resolve(untrustedActorWorkflowRoot, "adapters/claude-code/github-actions/claude-review-on-mention.yml"), "utf8").replace(
      " && contains(fromJSON('[\"OWNER\",\"MEMBER\",\"COLLABORATOR\"]'), github.event.comment.author_association)",
      "",
    ),
  );
  assertFail("pattern b actor guard required", untrustedActorWorkflowRoot, "hasTrustedActorGuard");

  const missingHeadCheckoutRoot = cloneFixture("missing-head-checkout");
  writeFileSync(
    resolve(missingHeadCheckoutRoot, "adapters/claude-code/github-actions/claude-review-on-mention.yml"),
    readFileSync(resolve(missingHeadCheckoutRoot, "adapters/claude-code/github-actions/claude-review-on-mention.yml"), "utf8").replace(
      '          gh pr checkout "$PR_NUMBER" --detach\n',
      "",
    ),
  );
  assertFail("pattern b head checkout required", missingHeadCheckoutRoot, "checksOutPrHead");

  const missingDefaultReviewSkillRoot = cloneFixture("missing-default-review-skill");
  writeFileSync(
    resolve(missingDefaultReviewSkillRoot, "scripts/install-claude-adapter.mjs"),
    readFileSync(resolve(missingDefaultReviewSkillRoot, "scripts/install-claude-adapter.mjs"), "utf8").replace('  "review-domain-impact",\n', ""),
  );
  assertFail("adapter installer default review skills", missingDefaultReviewSkillRoot, "DEFAULT_SKILLS is missing required review skill: review-domain-impact");

  const missingCommandTemplateRoot = cloneFixture("missing-command-template");
  writeFileSync(
    resolve(missingCommandTemplateRoot, "scripts/install-claude-adapter.mjs"),
    readFileSync(resolve(missingCommandTemplateRoot, "scripts/install-claude-adapter.mjs"), "utf8").replace('  "skill-handoff.md",\n', ""),
  );
  assertFail("adapter installer command templates", missingCommandTemplateRoot, "COMMAND_TEMPLATES is missing required command template: skill-handoff.md");

  const missingCoreInstallerRoot = cloneFixture("missing-core-installer");
  rmSync(resolve(missingCoreInstallerRoot, "scripts/install-kernel.mjs"));
  assertFail("missing core kernel installer", missingCoreInstallerRoot, "required installer is missing: scripts/install-kernel.mjs");

  const missingCodexInstallerRoot = cloneFixture("missing-codex-installer");
  rmSync(resolve(missingCodexInstallerRoot, "scripts/install-codex-adapter.mjs"));
  assertFail("missing codex adapter installer", missingCodexInstallerRoot, "required installer is missing: scripts/install-codex-adapter.mjs");

  const missingCodexAdapterPathRoot = cloneFixture("missing-codex-adapter-path");
  rmSync(resolve(missingCodexAdapterPathRoot, "adapters/codex/prompts/skill-handoff.md"));
  assertFail("missing Codex adapter path", missingCodexAdapterPathRoot, "required Codex adapter path is missing");

  const validLedgerMetadataRoot = cloneFixture("valid-ledger-metadata");
  assertPass("valid ledger metadata", validLedgerMetadataRoot);

  const invalidLedgerMetadataRoot = cloneFixture("invalid-ledger-metadata");
  writeFileSync(resolve(invalidLedgerMetadataRoot, "docs/ai/improvement-ledger.md"), "# Improvement Ledger\n");
  assertFail("invalid ledger metadata", invalidLedgerMetadataRoot, "missing ledger metadata fields");

  const invalidLedgerStatusRoot = cloneFixture("invalid-ledger-status");
  writeFileSync(
    resolve(invalidLedgerStatusRoot, "docs/ai/improvement-ledger.md"),
    "---\nledger_status: current\nlast_updated: null\nevidence_owner: null\nsource_scope: fixture\n---\n\n# Improvement Ledger\n",
  );
  assertFail("invalid ledger status", invalidLedgerStatusRoot, "invalid ledger_status");

  const invalidContextMetadataRoot = cloneFixture("invalid-context-metadata");
  writeFileSync(resolve(invalidContextMetadataRoot, "docs/ai/review-context.md"), "# Review Context\n");
  assertFail("invalid context metadata", invalidContextMetadataRoot, "missing context metadata fields");

  const invalidContextStatusRoot = cloneFixture("invalid-context-status");
  writeFileSync(resolve(invalidContextStatusRoot, "docs/ai/review-context.md"), "---\ncontext_status: ready\nlast_updated: null\nevidence_owner: null\nsource_scope: fixture\n---\n\n# Review Context\n");
  assertFail("invalid context status", invalidContextStatusRoot, "invalid context_status");

  const missingPathRoot = cloneFixture("missing-path");
  writeFileSync(
    resolve(missingPathRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        ...planeModelFor(["alpha"]),
        skill_groups: skillGroupsFor(["alpha"]),
        allowed_multi_group_skills: [],
        docs: ["docs/missing.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("missing manifest path", missingPathRoot, "manifest.json.docs path does not exist");

  const missingCopyPasteKernelRoot = cloneFixture("missing-copy-paste-kernel");
  writeFileSync(
    resolve(missingCopyPasteKernelRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "missing-custom.md",
        skills: ["alpha"],
        skill_groups: skillGroupsFor(["alpha"]),
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("missing copy_paste_kernel path", missingCopyPasteKernelRoot, "manifest.json.copy_paste_kernel path does not exist");

  const extraSkillRoot = cloneFixture("extra-skill");
  mkdirSync(resolve(extraSkillRoot, "skills/beta"), { recursive: true });
  writeFileSync(resolve(extraSkillRoot, "skills/beta/SKILL.md"), validSkill("beta"));
  assertFail("extra skill directory", extraSkillRoot, "missing from manifest.json.skills");

  const missingSkillRoot = cloneFixture("missing-skill");
  writeFileSync(
    resolve(missingSkillRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha", "beta"],
        skill_groups: skillGroupsFor(["alpha", "beta"]),
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("manifest skill without directory", missingSkillRoot, "but skills/beta/SKILL.md is missing");

  const missingSkillGroupsRoot = cloneFixture("missing-skill-groups");
  writeFileSync(
    resolve(missingSkillGroupsRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        docs: ["docs/ok.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("missing skill groups", missingSkillGroupsRoot, "manifest.json.skill_groups must exist");

  const ungroupedSkillRoot = cloneFixture("ungrouped-skill", ["alpha", "beta"]);
  writeFileSync(
    resolve(ungroupedSkillRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha", "beta"],
        skill_groups: skillGroupsFor(["alpha"]),
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("ungrouped skill", ungroupedSkillRoot, "is not assigned to a skill group");

  const invalidGroupRoot = cloneFixture("invalid-group");
  writeFileSync(
    resolve(invalidGroupRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        skill_groups: {
          ...skillGroupsFor(["alpha"]),
          delivery: [],
        },
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("invalid group", invalidGroupRoot, "invalid group 'delivery'");

  const unknownGroupedSkillRoot = cloneFixture("unknown-grouped-skill");
  writeFileSync(
    resolve(unknownGroupedSkillRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        skill_groups: skillGroupsFor(["alpha", "beta"]),
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("unknown grouped skill", unknownGroupedSkillRoot, "contains 'beta', but manifest.json.skills does not list it");

  const duplicateGroupedSkillRoot = cloneFixture("duplicate-grouped-skill");
  writeFileSync(
    resolve(duplicateGroupedSkillRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        skill_groups: skillGroupsFor(["alpha", "alpha"]),
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("duplicate grouped skill", duplicateGroupedSkillRoot, "contains duplicate entries");

  const unallowedMultiGroupRoot = cloneFixture("unallowed-multi-group");
  writeFileSync(
    resolve(unallowedMultiGroupRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        skill_groups: skillGroupsFor(["alpha"], { adoption_bootstrap: ["alpha"] }),
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("unallowed multi-group skill", unallowedMultiGroupRoot, "appears in multiple skill_groups");

  const allowedMultiGroupRoot = cloneFixture("allowed-multi-group");
  writeFileSync(
    resolve(allowedMultiGroupRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        ...planeModelFor(["alpha"]),
        skill_groups: skillGroupsFor(["alpha"], { adoption_bootstrap: ["alpha"] }),
        allowed_multi_group_skills: ["alpha"],
        routing: routingFixture(),
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertPass("allowed multi-group skill", allowedMultiGroupRoot);

  const missingSkillPlaneRoot = cloneFixture("missing-skill-plane");
  {
    const manifest = JSON.parse(readFileSync(resolve(missingSkillPlaneRoot, "manifest.json"), "utf8"));
    delete manifest.skill_planes.alpha;
    writeFileSync(resolve(missingSkillPlaneRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("missing skill plane", missingSkillPlaneRoot, "is not assigned to a plane");

  const invalidSkillPlaneRoot = cloneFixture("invalid-skill-plane");
  {
    const manifest = JSON.parse(readFileSync(resolve(invalidSkillPlaneRoot, "manifest.json"), "utf8"));
    manifest.skill_planes.alpha = "operations";
    writeFileSync(resolve(invalidSkillPlaneRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("invalid skill plane", invalidSkillPlaneRoot, "invalid plane 'operations'");

  const dishonestProjectionPackRoot = cloneFixture("dishonest-projection-pack");
  {
    const manifest = JSON.parse(readFileSync(resolve(dishonestProjectionPackRoot, "manifest.json"), "utf8"));
    manifest.skill_planes.alpha = "knowledge";
    manifest.projection_packs.daily_delivery.planes = ["execution", "control"];
    writeFileSync(resolve(dishonestProjectionPackRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("dishonest projection pack", dishonestProjectionPackRoot, "does not declare plane 'knowledge'");

  const incompleteOrganizationalPackRoot = cloneFixture("incomplete-organizational-pack");
  {
    const manifest = JSON.parse(readFileSync(resolve(incompleteOrganizationalPackRoot, "manifest.json"), "utf8"));
    manifest.skill_planes.alpha = "knowledge";
    manifest.projection_packs.organizational_intelligence.skills = [];
    writeFileSync(resolve(incompleteOrganizationalPackRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("incomplete organizational projection", incompleteOrganizationalPackRoot, "must include every manifest skill");

  const invalidCrossPlaneRouteRoot = cloneFixture("invalid-cross-plane-route");
  {
    const manifest = JSON.parse(readFileSync(resolve(invalidCrossPlaneRouteRoot, "manifest.json"), "utf8"));
    manifest.routing.cross_plane_transitions = [{
      id: "execution-to-knowledge",
      from: "execution",
      to: "knowledge",
      trigger: "explicit reusable-knowledge request",
      destination: "missing-skill",
      evidence_boundary: "current task evidence",
      owner: "requesting workflow",
      stop_condition: "destination and evidence boundary are unresolved",
    }];
    writeFileSync(resolve(invalidCrossPlaneRouteRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("invalid cross-plane route", invalidCrossPlaneRouteRoot, "references unknown skill 'missing-skill'");

  const invalidCapabilityGateRoot = cloneFixture("invalid-capability-gate");
  {
    const manifest = JSON.parse(readFileSync(resolve(invalidCapabilityGateRoot, "manifest.json"), "utf8"));
    manifest.routing.adapter_capability_gate.availability_field = "installed_skills";
    writeFileSync(resolve(invalidCapabilityGateRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("invalid adapter capability gate", invalidCapabilityGateRoot, "must fail closed from adapter selected_skills");

  const missingRoutingRoot = cloneFixture("missing-routing");
  {
    const manifest = JSON.parse(readFileSync(resolve(missingRoutingRoot, "manifest.json"), "utf8"));
    delete manifest.routing;
    writeFileSync(resolve(missingRoutingRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("missing routing manifest", missingRoutingRoot, "manifest.json.routing must exist");

  const unknownRoutingTaskRoot = cloneFixture("unknown-routing-task");
  {
    const manifest = JSON.parse(readFileSync(resolve(unknownRoutingTaskRoot, "manifest.json"), "utf8"));
    manifest.routing.task_classes.documentation = { default_route: "kernel" };
    writeFileSync(resolve(unknownRoutingTaskRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("unknown routing task class", unknownRoutingTaskRoot, "unknown task class 'documentation'");

  const missingRoutingSkillRoot = cloneFixture("missing-routing-skill");
  {
    const manifest = JSON.parse(readFileSync(resolve(missingRoutingSkillRoot, "manifest.json"), "utf8"));
    manifest.routing.default_routes.push({
      id: "bad-route",
      task_class: "implementation",
      primary: "missing-skill",
      secondary: [],
    });
    writeFileSync(resolve(missingRoutingSkillRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("missing routing skill", missingRoutingSkillRoot, "references unknown skill 'missing-skill'");

  const missingSecondaryRouteRoot = cloneFixture("missing-secondary-route");
  {
    const manifest = JSON.parse(readFileSync(resolve(missingSecondaryRouteRoot, "manifest.json"), "utf8"));
    manifest.routing.operating_modes.delivery_quality.secondary_routes = ["missing-skill"];
    writeFileSync(resolve(missingSecondaryRouteRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("missing secondary route skill", missingSecondaryRouteRoot, "references unknown skill 'missing-skill'");

  const routeOverrideRemovedRoot = cloneFixture("route-override-removed");
  {
    const manifest = JSON.parse(readFileSync(resolve(routeOverrideRemovedRoot, "manifest.json"), "utf8"));
    manifest.routing.route_override.allowed = false;
    writeFileSync(resolve(routeOverrideRemovedRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("route override preserved", routeOverrideRemovedRoot, "must keep overrides allowed");

  const invalidHardStopRoot = cloneFixture("invalid-hard-stop-surface");
  {
    const manifest = JSON.parse(readFileSync(resolve(invalidHardStopRoot, "manifest.json"), "utf8"));
    manifest.routing.risk_gate.hard_stop_surfaces.push("route_mismatch");
    writeFileSync(resolve(invalidHardStopRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assertFail("hard stop limited to approval-required surfaces", invalidHardStopRoot, "non-AGENTS approval-required surfaces");

  const invalidPortfolioCatalogRoot = cloneFixture("invalid-portfolio-catalog");
  const invalidPortfolioCatalogPath = resolve(invalidPortfolioCatalogRoot, "benchmarks/portfolio-catalog.json");
  const invalidPortfolioCatalog = JSON.parse(readFileSync(invalidPortfolioCatalogPath, "utf8"));
  invalidPortfolioCatalog.catalog_digest = `sha256:${"f".repeat(64)}`;
  writeFileSync(invalidPortfolioCatalogPath, `${JSON.stringify(invalidPortfolioCatalog, null, 2)}\n`);
  assertFail("invalid portfolio catalog", invalidPortfolioCatalogRoot, "catalog digest does not match");

  const invalidPortfolioPolicyRoot = cloneFixture("invalid-portfolio-policy");
  const invalidPortfolioPolicyPath = resolve(invalidPortfolioPolicyRoot, "benchmarks/portfolio-policy-manifest.json");
  const invalidPortfolioPolicy = JSON.parse(readFileSync(invalidPortfolioPolicyPath, "utf8"));
  invalidPortfolioPolicy.manifest_digest = `sha256:${"f".repeat(64)}`;
  writeFileSync(invalidPortfolioPolicyPath, `${JSON.stringify(invalidPortfolioPolicy, null, 2)}\n`);
  assertFail("invalid portfolio policy", invalidPortfolioPolicyRoot, "policy manifest digest does not match");

  const stalePhraseRoot = cloneFixture("stale-phrase");
  writeFileSync(resolve(stalePhraseRoot, "docs/ok.md"), "# OK\n\nThis repository has 25 skills.\n");
  assertFail("stale phrase", stalePhraseRoot, "25 skills");

  const staleSkillCountRoot = cloneFixture("stale-skill-count", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(staleSkillCountRoot, "docs/ok.md"), "# OK\n\nThis repository has 2 skills.\n");
  assertFail("stale skill count", staleSkillCountRoot, "2 skills");

  const staleCurrentSkillSystemRoot = cloneFixture("stale-current-skill-system", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(staleCurrentSkillSystemRoot, "docs/ok.md"), "# OK\n\nBaseline: current 2-skill system.\n");
  assertFail("stale current skill system", staleCurrentSkillSystemRoot, "current 2-skill system");

  const staleFocusedSkillsRoot = cloneFixture("stale-focused-skills", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(staleFocusedSkillsRoot, "docs/ok.md"), "# OK\n\nThis package includes 2 focused skills.\n");
  assertFail("stale focused skills", staleFocusedSkillsRoot, "2 focused skills");

  const staleReportSkillCountRoot = cloneFixture("stale-report-skill-count", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(staleReportSkillCountRoot, "docs/ok.md"), "# OK\n\n- Skills in manifest: 2\n- Skill directories: 2\n");
  assertFail("stale report skill count", staleReportSkillCountRoot, "Skills in manifest: 2");

  const currentSkillCountRoot = cloneFixture("current-skill-count", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(currentSkillCountRoot, "docs/ok.md"), "# OK\n\nThis repository has 3 skills.\n");
  assertPass("current skill count", currentSkillCountRoot);

  const currentReportSkillCountRoot = cloneFixture("current-report-skill-count", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(currentReportSkillCountRoot, "docs/ok.md"), "# OK\n\n- Skills in manifest: 3\n- Skill directories: 3\n");
  assertPass("current report skill count", currentReportSkillCountRoot);

  const noSkillCountRoot = cloneFixture("no-skill-count", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(noSkillCountRoot, "docs/ok.md"), "# OK\n\nThis repository lists workflows without a numeric skill count.\n");
  assertPass("no skill count", noSkillCountRoot);

  const unrelatedNumericTextRoot = cloneFixture("unrelated-numeric-text", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(unrelatedNumericTextRoot, "docs/ok.md"), "# OK\n\nThe quality target is 95+ and example 07 remains documented.\n");
  assertPass("unrelated numeric text", unrelatedNumericTextRoot);

  const staleRouteRoot = cloneFixture("stale-route");
  writeFileSync(
    resolve(staleRouteRoot, "docs/ok.md"),
    "# OK\n\nFor reviews, use review-router -> required gates -> review-final-merge-gate before final review.\n",
  );
  assertFail("inline stale route phrase", staleRouteRoot, "review-router -> required gates -> review-final-merge-gate");

  const activeLedgerRoot = cloneFixture("active-ledger");
  writeImprovementLedger(activeLedgerRoot, improvementLedgerFixture({ openRows: [ledgerRow()] }));
  assertPass("active ledger", activeLedgerRoot);

  const templateLedgerRoot = cloneFixture("template-ledger");
  writeImprovementLedger(templateLedgerRoot, improvementLedgerFixture({ status: "template" }));
  assertPass("template ledger", templateLedgerRoot);

  const missingLedgerFieldRoot = cloneFixture("missing-ledger-field");
  writeImprovementLedger(missingLedgerFieldRoot, improvementLedgerFixture({ openRows: [ledgerRow({ Impact: "" })] }));
  assertFail("missing ledger field", missingLedgerFieldRoot, "missing required fields: Impact");

  const staleLedgerRowRoot = cloneFixture("stale-ledger-row");
  writeImprovementLedger(staleLedgerRowRoot, improvementLedgerFixture({ openRows: [ledgerRow({ "Refresh date": "2000-01-01" })] }));
  assertFail("stale ledger row", staleLedgerRowRoot, "past its Refresh date");

  const weakRuleConversionRoot = cloneFixture("weak-rule-conversion");
  writeImprovementLedger(
    weakRuleConversionRoot,
    improvementLedgerFixture({
      ruleRows: [
        ledgerRow({
          Decision: "convert_to_rule",
          Status: "converted_to_rule",
          Evidence: "Hypothesis: this may recur",
          "Repeat pattern": "likely_repeated",
          "Proposed rule or check": "Add a reusable rule after evidence is confirmed",
          Scope: "generic",
        }),
      ],
    }),
  );
  assertFail("weak rule conversion", weakRuleConversionRoot, "converts weak evidence");

  const weakEvidenceNeedsMoreRoot = cloneFixture("weak-evidence-needs-more");
  writeImprovementLedger(
    weakEvidenceNeedsMoreRoot,
    improvementLedgerFixture({
      openRows: [
        ledgerRow({
          Decision: "needs_more_evidence",
          Evidence: "Unknown: review comments were unavailable",
          "Repeat pattern": "likely_repeated",
          "Proposed rule or check": "Confirm whether this pattern recurs before converting it",
          Scope: "generic",
        }),
      ],
    }),
  );
  assertPass("weak evidence needs more", weakEvidenceNeedsMoreRoot);

  const invalidCheckConversionRoot = cloneFixture("invalid-check-conversion");
  writeImprovementLedger(
    invalidCheckConversionRoot,
    improvementLedgerFixture({
      checkRows: [
        ledgerRow({
          Decision: "convert_to_check",
          Status: "converted_to_check",
          "Prevention target": "SKILL.md",
          "Repeat pattern": "repeated",
          "Proposed rule or check": "Document the review behavior",
          Scope: "generic",
        }),
      ],
    }),
  );
  assertFail("invalid check conversion", invalidCheckConversionRoot, "executable check target");

  const activeDomainRuleLedgerRoot = cloneFixture("active-domain-rule-ledger");
  writeDomainRuleLedger(activeDomainRuleLedgerRoot, domainRuleLedgerFixture({ rows: [domainRuleRow()] }));
  assertPass("active domain rule ledger", activeDomainRuleLedgerRoot);

  const templateDomainRuleLedgerRoot = cloneFixture("template-domain-rule-ledger");
  writeDomainRuleLedger(templateDomainRuleLedgerRoot, domainRuleLedgerFixture({ status: "template" }));
  assertPass("template domain rule ledger", templateDomainRuleLedgerRoot);

  const templateWithDomainRuleRowsRoot = cloneFixture("template-with-domain-rule-rows");
  writeDomainRuleLedger(templateWithDomainRuleRowsRoot, domainRuleLedgerFixture({ status: "template", rows: [domainRuleRow()] }));
  assertFail("template with domain rule rows", templateWithDomainRuleRowsRoot, "contains project domain rule rows");

  const invalidDomainRuleStatusRoot = cloneFixture("invalid-domain-rule-status");
  writeDomainRuleLedger(invalidDomainRuleStatusRoot, domainRuleLedgerFixture({ rows: [domainRuleRow({ "Evidence status": "Confirmed" })] }));
  assertFail("invalid domain rule status", invalidDomainRuleStatusRoot, "invalid Evidence status");

  const duplicateDomainRuleRoot = cloneFixture("duplicate-domain-rule");
  writeDomainRuleLedger(duplicateDomainRuleRoot, domainRuleLedgerFixture({ rows: [domainRuleRow(), domainRuleRow()] }));
  assertFail("duplicate domain rule", duplicateDomainRuleRoot, "duplicates domain rule ID");

  const invalidDomainRuleDateRoot = cloneFixture("invalid-domain-rule-date");
  writeDomainRuleLedger(invalidDomainRuleDateRoot, domainRuleLedgerFixture({ rows: [domainRuleRow({ "Last checked": "next week" })] }));
  assertFail("invalid domain rule date", invalidDomainRuleDateRoot, "invalid Last checked");

  const malformedDomainRuleHeaderRoot = cloneFixture("malformed-domain-rule-header");
  writeDomainRuleLedger(
    malformedDomainRuleHeaderRoot,
    domainRuleLedgerFixture({
      header: "| ID | Rule | Business object | Business actor | Workflow | State / condition | Source | Evidence status | Applies to | Used by | Last checked | Staleness trigger |",
      rows: [domainRuleRow()],
    }),
  );
  assertFail("malformed domain rule header", malformedDomainRuleHeaderRoot, "malformed domain rule table header");

  const dedupedPathReportRoot = cloneFixture("deduped-path-report");
  writeFileSync(
    resolve(dedupedPathReportRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        ...planeModelFor(["alpha"]),
        skill_groups: skillGroupsFor(["alpha"]),
        allowed_multi_group_skills: [],
        routing: routingFixture(),
        docs: ["CUSTOM_INSTRUCTIONS.md", "docs/ok.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertPassWithReport("deduped path report", dedupedPathReportRoot);
  const dedupedReport = readFileSync(resolve(dedupedPathReportRoot, "docs/validation-report.md"), "utf8");
  const customInstructionsEntries = dedupedReport.match(/`CUSTOM_INSTRUCTIONS\.md`/g) ?? [];
  if (customInstructionsEntries.length !== 1 || !dedupedReport.includes("`CUSTOM_INSTRUCTIONS.md`: ok (copy_paste_kernel, docs)")) {
    throw new Error(`deduped path report should list CUSTOM_INSTRUCTIONS.md once with both roles\n${dedupedReport}`);
  }

  console.log("validate-repo fixture tests passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
