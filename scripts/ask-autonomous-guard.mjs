#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const MAX_CHANGED_FILES = 60;
export const MAX_CHANGED_LINES = 8_000;

const DISALLOWED_EXACT_PATHS = new Set([
  ".github/CODEOWNERS",
  ".github/workflows/ask-autonomous-development.yml",
]);

const DISALLOWED_PREFIXES = [
  ".github/ask-automation/",
  ".github/workflows/",
  "benchmarks/results/",
  "benchmarks/private/",
  "benchmarks/evaluators/",
  "scripts/ask-autonomous-",
  "secrets/",
];

const SENSITIVE_PATH_PATTERN = /(?:^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx|jks|keystore|crt|cer))$/iu;
const PRIVATE_EVALUATOR_PATTERN = /(?:^|\/)(?:private[-_]?evaluator|evaluator[-_]?private)(?:\/|$)/iu;
const UNEXECUTED_TEST_PATTERN = /^\s*(?:not run|not executed|planned|pending|skipped)\b/iu;

function runGit(repository, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function splitLines(value) {
  return value.split(/\r?\n/u).filter(Boolean);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isDisallowedPath(path) {
  if (DISALLOWED_EXACT_PATHS.has(path)) return true;
  if (DISALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (SENSITIVE_PATH_PATTERN.test(path)) return true;
  if (PRIVATE_EVALUATOR_PATTERN.test(path)) return true;
  return false;
}

export function validateChangedPaths(paths, { maximumFiles = MAX_CHANGED_FILES } = {}) {
  const errors = [];
  const uniquePaths = [...new Set(paths)].sort(compareAscii);
  if (uniquePaths.length > maximumFiles) errors.push(`changed file count ${uniquePaths.length} exceeds limit ${maximumFiles}`);
  for (const path of uniquePaths) {
    if (path.startsWith("/") || path.split("/").includes("..") || path.includes("\\")) errors.push(`changed path is not a normalized repository-relative path: ${path}`);
    if (isDisallowedPath(path)) errors.push(`automation may not modify protected path: ${path}`);
  }
  return errors;
}

function requireString(value, field, errors, { nullable = false, minimum = 1 } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.trim().length < minimum) errors.push(`${field} must be ${nullable ? "null or " : ""}a non-empty string`);
}

export function validateCodexResult(result, context, changedPaths) {
  const errors = [];
  const allowedActions = new Set(["create_pr", "update_pr", "review_only", "no_change", "blocked"]);
  const allowedVerdicts = new Set(["not_applicable", "approve", "request_changes", "comment"]);
  if (!result || typeof result !== "object" || Array.isArray(result)) return ["Codex result must be an object"];
  if (!allowedActions.has(result.action)) errors.push(`unsupported Codex action: ${result.action}`);
  if (!allowedVerdicts.has(result.review_verdict)) errors.push(`unsupported review verdict: ${result.review_verdict}`);
  requireString(result.summary, "summary", errors);
  requireString(result.rationale, "rationale", errors);
  if (!Array.isArray(result.tests_run) || result.tests_run.some((value) => typeof value !== "string")) errors.push("tests_run must be a string array");
  if (!Array.isArray(result.risks) || result.risks.some((value) => typeof value !== "string")) errors.push("risks must be a string array");
  if (!Array.isArray(result.changed_files_expected) || result.changed_files_expected.some((value) => typeof value !== "string")) errors.push("changed_files_expected must be a string array");

  if ((result.target_issue_number ?? null) !== (context.target_issue_number ?? null)) errors.push("target_issue_number does not match selected context");
  if ((result.target_pr_number ?? null) !== (context.target_pr_number ?? null)) errors.push("target_pr_number does not match selected context");

  const hasChanges = changedPaths.length > 0;
  if (hasChanges && context.mode === "advance_issue" && result.action !== "create_pr") errors.push("issue advancement with repository changes must create a draft PR");
  if (hasChanges && context.mode === "maintain_pr" && result.action !== "update_pr") errors.push("PR maintenance with repository changes must update the selected PR");
  if (!hasChanges && ["create_pr", "update_pr"].includes(result.action)) errors.push("create_pr/update_pr requires repository changes");
  if (hasChanges && ["review_only", "no_change", "blocked"].includes(result.action)) errors.push(`${result.action} may not accompany repository changes`);

  if (hasChanges && Array.isArray(result.tests_run)) {
    if (result.tests_run.length === 0) errors.push("repository changes require at least one validation command actually run by Codex");
    for (const test of result.tests_run) {
      if (UNEXECUTED_TEST_PATTERN.test(test)) errors.push(`tests_run may not represent an unexecuted or deferred check: ${test}`);
    }
  }

  if (result.action === "create_pr") {
    requireString(result.pr_title, "pr_title", errors);
    requireString(result.pr_body, "pr_body", errors);
  }
  if (result.action === "review_only") requireString(result.review_comment, "review_comment", errors);
  if (result.review_verdict !== "not_applicable") requireString(result.review_comment, "review_comment", errors);
  if (result.issue_comment !== null) requireString(result.issue_comment, "issue_comment", errors, { nullable: true });

  const expectedInput = Array.isArray(result.changed_files_expected) ? result.changed_files_expected : [];
  const expected = [...new Set(expectedInput)].sort(compareAscii);
  const actual = [...new Set(changedPaths)].sort(compareAscii);
  if (JSON.stringify(expectedInput) !== JSON.stringify(expected)) errors.push("changed_files_expected must be unique and ordered by ASCII code point");
  if (hasChanges && JSON.stringify(expected) !== JSON.stringify(actual)) errors.push("changed_files_expected must exactly match the actual changed path set");

  return errors;
}

function collectChange(repository) {
  runGit(repository, ["add", "-N", "--", "."]);
  const nameStatus = runGit(repository, ["diff", "--name-status", "--", "."]).stdout;
  const paths = splitLines(nameStatus).flatMap((line) => {
    const fields = line.split("\t");
    const status = fields.shift() ?? "";
    if (status.startsWith("R") || status.startsWith("C")) return fields.slice(-2);
    return fields.slice(-1);
  });
  const numstat = runGit(repository, ["diff", "--numstat", "--", "."]).stdout;
  let changedLines = 0;
  const binaryPaths = [];
  for (const line of splitLines(numstat)) {
    const [additions, deletions, path] = line.split("\t");
    if (additions === "-" || deletions === "-") binaryPaths.push(path);
    else changedLines += Number(additions) + Number(deletions);
  }
  const summary = runGit(repository, ["diff", "--summary", "--", "."]).stdout;
  const symlinkPaths = splitLines(summary)
    .filter((line) => /mode 120000/u.test(line))
    .map((line) => line.trim());
  return { paths: [...new Set(paths)].sort(compareAscii), changedLines, binaryPaths, symlinkPaths };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function validateAutomationRun({ repository, context, result }) {
  const change = collectChange(repository);
  const errors = [
    ...validateChangedPaths(change.paths),
    ...validateCodexResult(result, context, change.paths),
  ];
  if (change.changedLines > MAX_CHANGED_LINES) errors.push(`changed line count ${change.changedLines} exceeds limit ${MAX_CHANGED_LINES}`);
  if (change.binaryPaths.length > 0) errors.push(`binary changes are prohibited: ${change.binaryPaths.join(", ")}`);
  if (change.symlinkPaths.length > 0) errors.push(`symlink changes are prohibited: ${change.symlinkPaths.join(", ")}`);
  const whitespace = runGit(repository, ["diff", "--check"], { allowFailure: true });
  if (whitespace.status !== 0) errors.push(`git diff --check failed: ${(whitespace.stderr || whitespace.stdout).trim()}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    schema_version: "1.0.0",
    mode: context.mode,
    action: result.action,
    target_issue_number: context.target_issue_number,
    target_pr_number: context.target_pr_number,
    changed_files: change.paths,
    changed_lines: change.changedLines,
  };
}

function parseArgs(argv) {
  const args = { repository: null, context: null, result: null, output: null };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--repository") args.repository = resolve(argv.shift());
    else if (flag === "--context") args.context = resolve(argv.shift());
    else if (flag === "--result") args.result = resolve(argv.shift());
    else if (flag === "--output") args.output = resolve(argv.shift());
    else throw new Error(`Unknown argument: ${flag}`);
  }
  for (const field of ["repository", "context", "result", "output"]) if (!args[field]) throw new Error(`--${field} is required`);
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const context = JSON.parse(readFileSync(args.context, "utf8"));
    const result = JSON.parse(readFileSync(args.result, "utf8"));
    const summary = validateAutomationRun({ repository: args.repository, context, result });
    summary.context_sha256 = `sha256:${sha256File(args.context)}`;
    summary.result_sha256 = `sha256:${sha256File(args.result)}`;
    writeFileSync(args.output, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`ASK automation guard passed: action=${summary.action}, changed_files=${summary.changed_files.length}, changed_lines=${summary.changed_lines}`);
  } catch (error) {
    console.error(`ASK automation guard failed: ${error.message}`);
    process.exitCode = 1;
  }
}
