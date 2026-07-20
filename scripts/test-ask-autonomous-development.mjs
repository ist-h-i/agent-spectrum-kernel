#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CRITICAL_PATH_ISSUES, selectTarget } from "./ask-autonomous-context.mjs";
import { isDisallowedPath, validateChangedPaths, validateCodexResult } from "./ask-autonomous-guard.mjs";
import { branchNameForIssue } from "./ask-autonomous-publish.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function pull(number, issueNumber, { draft = true, head = `feat/issue-${issueNumber}`, user = "ist-h-i", bodyPrefix = "Progresses" } = {}) {
  return {
    number,
    draft,
    updated_at: `2026-07-${String(number % 28 + 1).padStart(2, "0")}T00:00:00Z`,
    user: { login: user },
    body: `${bodyPrefix} #${issueNumber}`,
    base: { ref: "main", repo: { full_name: "ist-h-i/agent-spectrum-kernel" } },
    head: { ref: head, repo: { full_name: "ist-h-i/agent-spectrum-kernel" } },
  };
}

function issue(number, state = "open") {
  return { number, state, title: `Issue ${number}` };
}

const selectedPull = selectTarget({
  owner: "ist-h-i",
  pulls: [pull(900, 197), pull(213, 205)],
  issues: CRITICAL_PATH_ISSUES.map((number) => issue(number)),
  runKind: "auto",
});
assert.equal(selectedPull.mode, "maintain_pr");
assert.equal(selectedPull.pull.number, 213);
assert.equal(selectedPull.issueNumber, 205);

const selectedIssue = selectTarget({
  owner: "ist-h-i",
  pulls: [pull(213, 205)],
  issues: CRITICAL_PATH_ISSUES.map((number) => issue(number)),
  runKind: "advance",
});
assert.equal(selectedIssue.mode, "advance_issue");
assert.equal(selectedIssue.issueNumber, 205);

const advancedAfterClose = selectTarget({
  owner: "ist-h-i",
  pulls: [],
  issues: CRITICAL_PATH_ISSUES.map((number) => issue(number, number === 205 ? "closed" : "open")),
  runKind: "auto",
});
assert.equal(advancedAfterClose.issueNumber, 197);

const foreignPullIgnored = selectTarget({
  owner: "ist-h-i",
  pulls: [pull(214, 205, { user: "untrusted-user" })],
  issues: [issue(205)],
  runKind: "auto",
});
assert.equal(foreignPullIgnored.mode, "advance_issue");

assert.equal(isDisallowedPath(".github/workflows/validate.yml"), true);
assert.equal(isDisallowedPath("benchmarks/results/measured.json"), true);
assert.equal(isDisallowedPath("private-evaluator/oracle.json"), true);
assert.equal(isDisallowedPath("src/feature.mjs"), false);
assert.match(validateChangedPaths([".github/workflows/validate.yml"])[0], /protected path/);
assert.deepEqual(validateChangedPaths(["src/feature.mjs", "scripts/test-feature.mjs"]), []);

const issueContext = {
  mode: "advance_issue",
  target_issue_number: 205,
  target_pr_number: null,
};
const validCreateResult = {
  action: "create_pr",
  target_issue_number: 205,
  target_pr_number: null,
  summary: "Implement one bounded contract slice.",
  rationale: "The selected issue authorizes this slice.",
  pr_title: "Implement bounded contract slice",
  pr_body: "Changed and verified one bounded contract slice.",
  issue_comment: "Draft PR created for review.",
  review_verdict: "not_applicable",
  review_comment: null,
  tests_run: ["node scripts/test-example.mjs: passed"],
  risks: [],
  changed_files_expected: ["scripts/example.mjs"],
};
assert.deepEqual(validateCodexResult(validCreateResult, issueContext, ["scripts/example.mjs"]), []);
assert.match(validateCodexResult({ ...validCreateResult, action: "no_change" }, issueContext, ["scripts/example.mjs"])[0], /may not accompany repository changes/);
assert.match(validateCodexResult({ ...validCreateResult, target_issue_number: 197 }, issueContext, ["scripts/example.mjs"])[0], /does not match selected context/);

const prContext = {
  mode: "maintain_pr",
  target_issue_number: 205,
  target_pr_number: 213,
};
const reviewResult = {
  action: "review_only",
  target_issue_number: 205,
  target_pr_number: 213,
  summary: "Independent review completed.",
  rationale: "No blocking defect remains.",
  pr_title: null,
  pr_body: null,
  issue_comment: "Review completed without merge.",
  review_verdict: "approve",
  review_comment: "No blocker found; human merge remains required.",
  tests_run: [],
  risks: ["External runtime behavior remains unverified."],
  changed_files_expected: [],
};
assert.deepEqual(validateCodexResult(reviewResult, prContext, []), []);
assert.match(validateCodexResult({ ...reviewResult, review_comment: null }, prContext, [])[0], /review_comment/);

assert.equal(branchNameForIssue(205, "123456"), "automation/ask-issue-205-123456");

const schema = JSON.parse(readFileSync(resolve(root, ".github/ask-automation/result.schema.json"), "utf8"));
assert.equal(schema.additionalProperties, false);
assert.ok(schema.properties.action.enum.includes("blocked"));
assert.equal(schema.properties.changed_files_expected.maxItems, 60);

const workflow = readFileSync(resolve(root, ".github/workflows/ask-autonomous-development.yml"), "utf8");
assert.match(workflow, /20 0 \* \* 1-5/);
assert.match(workflow, /20 8 \* \* 1-5/);
assert.match(workflow, /openai\/codex-action@v1/);
assert.match(workflow, /ASK_AUTOMATION_ENABLED/);
assert.doesNotMatch(workflow, /gh pr merge|merge_pull_request|auto-merge/iu);

const prompt = readFileSync(resolve(root, ".github/ask-automation/codex-prompt.md"), "utf8");
for (const required of ["Never perform", "merge a pull request", "close an Issue", "measured benchmark", "GitHub write token is deliberately unavailable"]) {
  assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
}

console.log("ASK autonomous development control tests passed");
