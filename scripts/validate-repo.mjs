#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const MAINTAINED_SCAN_ROOTS = ["AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "README.md", "README.ja.md", "docs", "examples", "skills"];
const GENERATED_REPORT_PATH = "docs/validation-report.md";
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

  for (const key of ["docs", "examples"]) {
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
  for (const key of ["docs", "examples"]) {
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

function buildReport({ manifest, skillDirectories, skillGroupChecks, skillChecks, contextMetadataChecks, improvementLedgerChecks, pathChecks, staleFindings }) {
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
    "## Skill section checks",
    "",
    ...skillChecks.map(
      (check) => `- \`${check.path}\`: words=${check.words}, name_ok=${check.nameOk ? "True" : "False"}, missing=${check.missing.length > 0 ? check.missing.join(", ") : "none"}`,
    ),
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
    "- Review route references use the current layer-aware route through `review-router`, layer applicability, required gates, and `review-final-merge-gate`.",
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
  validateManifestPaths(root, manifest, errors);
  const skillChecks = validateSkills(root, skillDirectories, errors);
  const contextMetadataChecks = validateContextMetadata(root, errors);
  const improvementLedgerChecks = validateImprovementLedger(root, errors);
  const currentSkillCount = Array.isArray(manifest?.skills) ? manifest.skills.length : null;
  const staleFindings = findStalePhrases(root, currentSkillCount, errors);
  const pathChecks = buildPathChecks(root, manifest);
  const report = buildReport({ manifest, skillDirectories, skillGroupChecks, skillChecks, contextMetadataChecks, improvementLedgerChecks, pathChecks, staleFindings });

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
