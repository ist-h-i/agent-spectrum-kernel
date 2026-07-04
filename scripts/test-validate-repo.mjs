#!/usr/bin/env node
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
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

function cloneFixture(name, skills) {
  const root = resolve(fixtureRoot, name);
  writeFixture(root, skills);
  return root;
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

  const currentSkillCountRoot = cloneFixture("current-skill-count", ["alpha", "beta", "gamma"]);
  writeFileSync(resolve(currentSkillCountRoot, "docs/ok.md"), "# OK\n\nThis repository has 3 skills.\n");
  assertPass("current skill count", currentSkillCountRoot);

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

  console.log("validate-repo fixture tests passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
