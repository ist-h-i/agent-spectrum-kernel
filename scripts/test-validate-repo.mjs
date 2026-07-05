#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validateScript = resolve(repoRoot, "scripts/validate-repo.mjs");
const fixtureRoot = mkdtempSync(resolve(tmpdir(), "validate-repo-"));

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

function writeFixture(root, skills = ["alpha"]) {
  for (const skill of skills) {
    mkdirSync(resolve(root, `skills/${skill}`), { recursive: true });
    writeFileSync(resolve(root, `skills/${skill}/SKILL.md`), validSkill(skill));
  }

  mkdirSync(resolve(root, "docs/ai"), { recursive: true });
  mkdirSync(resolve(root, "examples"), { recursive: true });
  writeAdapterFixture(root);

  writeFileSync(resolve(root, "AGENTS.md"), "# Kernel\n");
  writeFileSync(resolve(root, "CUSTOM_INSTRUCTIONS.md"), "# Custom instructions\n");
  writeFileSync(resolve(root, "docs/ok.md"), "# OK\n");
  writeFileSync(resolve(root, "docs/ai/improvement-ledger.md"), validLedger);
  writeFileSync(resolve(root, "examples/ok.md"), "# OK\n");
  writeFileSync(
    resolve(root, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills,
        skill_groups: skillGroupsFor(skills),
        allowed_multi_group_skills: [],
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
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
    "schemas/adoption-report.schema.json",
    "schemas/improvement-ledger-entry.schema.json",
  ];
  for (const path of schemaPaths) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), '{ "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object" }\n');
  }

  const docs = [
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
      "# Fixture\n\nLocal hooks are the default local observability path. Pattern B is optional. No raw prompt storage by default. No external publication by default.\n",
    );
  }

  mkdirSync(resolve(root, "docs/ai"), { recursive: true });
  writeFileSync(
    resolve(root, "docs/ai/observability-config.yml"),
    `enabled: true
capture:
  allow_session_id_task_boundary: true
  task_boundary_source: session_id
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
    "adapters/claude-code/plugin/skills/review-pr/SKILL.md",
    "adapters/claude-code/plugin/skills/adoption-report/SKILL.md",
    "adapters/claude-code/plugin/skills/ledger-refresh/SKILL.md",
    "adapters/claude-code/plugin/skills/implementation-context-check/SKILL.md",
    "adapters/claude-code/plugin/bin/ai-skills-metrics-record",
  ];
  for (const path of adapterFiles) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), "# Fixture\n");
  }

  mkdirSync(resolve(root, "adapters/claude-code/project/.claude/hooks"), { recursive: true });
  writeFileSync(resolve(root, "adapters/claude-code/project/.claude/hooks/hooks.json"), '{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "node scripts/ai-metrics-record.mjs" }] }] } }\n');
  mkdirSync(resolve(root, "adapters/claude-code/plugin/hooks"), { recursive: true });
  writeFileSync(resolve(root, "adapters/claude-code/plugin/hooks/hooks.json"), '{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "ai-skills-metrics-record" }] }] } }\n');

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
    resolve(root, "scripts/install-claude-adapter.mjs"),
    `const DEFAULT_SKILLS = [
  "operating-mode-router",
  "skill-router",
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
  "review-architecture-impact",
  "review-output-quality",
  "review-adversarial-risk",
  "review-final-merge-gate",
  "evidence-ledger",
  "risk-gate",
  "adr-review",
  "improvement-ledger",
  "skill-adoption-metrics",
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

function runRepoScript(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? repoRoot,
    input: options.input,
    encoding: "utf8",
  });
}

function assertRuntimePass(name, result) {
  if (result.status !== 0) {
    throw new Error(`${name} should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function assertSchemaPass(name, schema, value) {
  const errors = validateJsonSchemaSubset(schema, value);
  if (errors.length > 0) {
    throw new Error(`${name} should match schema\n${errors.join("\n")}\n${JSON.stringify(value, null, 2)}`);
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
  if (recordedEvent.task_id !== "session:S1") {
    throw new Error(`metrics recorder should fall back to session boundary\n${JSON.stringify(recordedEvent, null, 2)}`);
  }
  const commandRecord = recordedEvent.verification_metrics.commands_run[0];
  if (commandRecord.command_kind !== "test" || JSON.stringify(commandRecord).includes("sk-test-secret") || commandRecord.redacted_command_preview) {
    throw new Error(`metrics recorder should store command kind only by default\n${JSON.stringify(commandRecord, null, 2)}`);
  }

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
  if (report.summary.event_count !== 8 || report.summary.tasks_reviewed !== 1 || report.summary.completed_tasks !== 1) {
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
  const target = resolve(fixtureRoot, "install-target");
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

  const installer = resolve(repoRoot, "scripts/install-claude-adapter.mjs");
  assertRuntimePass("installer first run", runRepoScript([installer, "--target", target]));
  assertRuntimePass("installer second run", runRepoScript([installer, "--target", target]));

  const settings = JSON.parse(readFileSync(resolve(target, ".claude/settings.json"), "utf8"));
  const identities = hookIdentities(settings.hooks);
  if (identities.length !== new Set(identities).size) {
    throw new Error(`installer should not duplicate hook commands\n${JSON.stringify(settings.hooks, null, 2)}`);
  }
  if (!identities.some((identity) => identity.includes("echo unrelated"))) {
    throw new Error(`installer should preserve unrelated hooks\n${JSON.stringify(settings.hooks, null, 2)}`);
  }

  const dryRunTarget = resolve(fixtureRoot, "install-dry-run-target");
  const dryRun = runRepoScript([installer, "--target", dryRunTarget, "--dry-run"]);
  assertRuntimePass("installer dry run", dryRun);
  if (!dryRun.stdout.includes(".claude/settings.json") || !dryRun.stdout.includes("skill-handoff.md")) {
    throw new Error(`installer dry run should list planned writes\n${dryRun.stdout}`);
  }
  if (existsSync(resolve(dryRunTarget, ".claude/settings.json"))) {
    throw new Error("installer dry run should not write settings");
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

try {
  const validRoot = cloneFixture("valid");
  assertPass("valid fixture", validRoot);
  assertRuntimeScripts();
  assertInstallerScripts();
  assertStakeholderReadinessSamples();

  const missingSchemaRoot = cloneFixture("missing-schema");
  rmSync(resolve(missingSchemaRoot, "schemas/metrics-event.schema.json"));
  assertFail("missing required schema", missingSchemaRoot, "required schema is missing");

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
        skill_groups: skillGroupsFor(["alpha"], { adoption_bootstrap: ["alpha"] }),
        allowed_multi_group_skills: ["alpha"],
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertPass("allowed multi-group skill", allowedMultiGroupRoot);

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

  const dedupedPathReportRoot = cloneFixture("deduped-path-report");
  writeFileSync(
    resolve(dedupedPathReportRoot, "manifest.json"),
    JSON.stringify(
      {
        kernel: "AGENTS.md",
        copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md",
        skills: ["alpha"],
        skill_groups: skillGroupsFor(["alpha"]),
        allowed_multi_group_skills: [],
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
