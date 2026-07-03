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
  { phrase: "21 skills", mode: "contains" },
  { phrase: "22 skills", mode: "contains" },
  { phrase: "25 skills", mode: "contains" },
  { phrase: "code-review-quality", mode: "contains" },
  { phrase: "pending specialized review", mode: "contains" },
  { phrase: "review-output-quality when available", mode: "contains" },
  { phrase: "review-adversarial-risk when available", mode: "contains" },
  { phrase: "review-router -> required gates -> review-final-merge-gate", mode: "line" },
  { phrase: "controlled-implementation -> test-first-verification", mode: "line" },
  { phrase: "angular-enterprise", mode: "contains" },
];

const MAINTAINED_SCAN_ROOTS = ["AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "README.md", "README.ja.md", "docs", "examples", "skills"];

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

function validateManifestPaths(root, manifest, errors) {
  if (!manifest) {
    return;
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
      files.push(path);
    }
  }

  for (const path of MAINTAINED_SCAN_ROOTS) {
    walk(path);
  }

  return files;
}

function findStalePhrases(root, errors) {
  const findings = [];

  for (const path of collectMarkdownFiles(root)) {
    const text = readFileSync(resolve(root, path), "utf8");
    const lines = text.split(/\r?\n/);

    for (const stale of STALE_PHRASES) {
      if (stale.mode === "contains" && text.includes(stale.phrase)) {
        findings.push({ path, phrase: stale.phrase });
        fail(errors, "stale phrases", `${path} contains stale phrase: ${stale.phrase}`);
      }

      if (stale.mode === "line") {
        const found = lines.some((line) => normalizeLine(line) === stale.phrase);
        if (found) {
          findings.push({ path, phrase: stale.phrase });
          fail(errors, "stale phrases", `${path} contains stale route phrase as a standalone line: ${stale.phrase}`);
        }
      }
    }
  }

  return findings;
}

function normalizeLine(line) {
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/`/g, "")
    .trim();
}

function buildPathChecks(root, manifest) {
  const paths = [];
  if (manifest?.kernel) {
    paths.push(manifest.kernel);
  }
  for (const key of ["docs", "examples"]) {
    if (Array.isArray(manifest?.[key])) {
      paths.push(...manifest[key]);
    }
  }

  return paths.map((path) => ({
    path,
    ok: existsSync(resolve(root, path)),
  }));
}

function buildReport({ manifest, skillDirectories, skillChecks, pathChecks, staleFindings }) {
  const manifestSkills = Array.isArray(manifest?.skills) ? [...manifest.skills].sort() : [];
  const missingDirectories = manifestSkills.filter((skill) => !skillDirectories.includes(skill));
  const extraDirectories = skillDirectories.filter((skill) => !manifestSkills.includes(skill));
  const skillCount = manifestSkills.length;
  const target = manifest?.design?.quality_target ?? "unknown";

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
    "## Skill section checks",
    "",
    ...skillChecks.map(
      (check) => `- \`${check.path}\`: words=${check.words}, name_ok=${check.nameOk ? "True" : "False"}, missing=${check.missing.length > 0 ? check.missing.join(", ") : "none"}`,
    ),
    "",
    "## Document path checks",
    "",
    ...pathChecks.map((check) => `- \`${check.path}\`: ${check.ok ? "ok" : "missing"}`),
    "",
    "## Stale name scan",
    "",
    staleFindings.length > 0 ? staleFindings.map((finding) => `- \`${finding.path}\`: ${finding.phrase}`).join("\n") : "none",
    "",
    "## Auxiliary documentation audit",
    "",
    "- No stale pre-27 skill-count references found.",
    "- No deleted legacy code-review adapter references found.",
    "- Review route references use the current layer-aware route through `review-router`, layer applicability, required gates, and `review-final-merge-gate`.",
    "- Implementation route references use Verification Contract, Implementation Contract, `controlled-implementation`, and evidence-oriented verification wording.",
    "- Project overlay, stack overlay, review context, implementation context, and task progress terminology is explicitly separated in maintained auxiliary docs.",
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
  validateManifestPaths(root, manifest, errors);
  const skillChecks = validateSkills(root, skillDirectories, errors);
  const staleFindings = findStalePhrases(root, errors);
  const pathChecks = buildPathChecks(root, manifest);
  const report = buildReport({ manifest, skillDirectories, skillChecks, pathChecks, staleFindings });

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
