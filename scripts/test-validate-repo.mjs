#!/usr/bin/env node
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function writeFixture(root, skills = ["alpha"]) {
  for (const skill of skills) {
    mkdirSync(resolve(root, `skills/${skill}`), { recursive: true });
    writeFileSync(resolve(root, `skills/${skill}/SKILL.md`), validSkill(skill));
  }

  mkdirSync(resolve(root, "docs/ai"), { recursive: true });
  mkdirSync(resolve(root, "examples"), { recursive: true });

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
        docs: ["docs/ok.md", "docs/ai/improvement-ledger.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
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

try {
  const validRoot = cloneFixture("valid");
  assertPass("valid fixture", validRoot);

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
        docs: ["docs/ok.md"],
        examples: ["examples/ok.md"],
        design: { quality_target: "95+" },
      },
      null,
      2,
    ),
  );
  assertFail("manifest skill without directory", missingSkillRoot, "but skills/beta/SKILL.md is missing");

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
