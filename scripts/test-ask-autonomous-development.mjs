#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CRITICAL_PATH_ISSUES, computeContextDigest, selectTarget } from "./ask-autonomous-context.mjs";
import { buildFailureArtifacts } from "./ask-autonomous-failure.mjs";
import { buildFinalGuard, buildValidationRecord, createRawArtifact, digestObject, isDisallowedPath, sha256Bytes, validateAutomationRun, validateChangedPaths, validateCodexResult, verifyRawArtifact, verifyValidationRecord } from "./ask-autonomous-guard.mjs";
import { branchNameForIssue, formatStaleReviewStatus, targetDrift } from "./ask-autonomous-publish.mjs";
import { assertNoAutomationSecrets } from "./ask-autonomous-secret-scan.mjs";
import { APPROVED_ASK_AUTOMATION_ACTION_PINS, validateAskAutomationActionPinsText } from "./validate-repo.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const exactSha = "a".repeat(40);

function assertRejectsSecrets(input, category) {
  assert.throws(() => assertNoAutomationSecrets(input), new RegExp(category, "u"));
}

function jobBlock(workflow, job, nextJob) {
  const start = workflow.indexOf(`  ${job}:`);
  const end = nextJob ? workflow.indexOf(`  ${nextJob}:`, start + 1) : workflow.length;
  assert.ok(start >= 0 && end > start, `workflow job ${job} must exist`);
  return workflow.slice(start, end);
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

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
assert.equal(advancedAfterClose.mode, "advance_issue");
assert.equal(advancedAfterClose.issueNumber, 197);
assert.equal(advancedAfterClose.issue.state, "open");

const foreignPullIgnored = selectTarget({
  owner: "ist-h-i",
  pulls: [pull(214, 205, { user: "untrusted-user" })],
  issues: [issue(205)],
  runKind: "auto",
});
assert.equal(foreignPullIgnored.mode, "advance_issue");

assert.equal(isDisallowedPath(".github/workflows/validate.yml"), true);
assert.equal(isDisallowedPath("scripts/test-validate-repo.mjs"), true);
assert.equal(isDisallowedPath("scripts/validate-repo.mjs"), true);
assert.equal(isDisallowedPath("scripts/test-ask-benchmark.mjs"), true);
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
assert.ok(
  validateCodexResult({ ...validCreateResult, action: "no_change" }, issueContext, ["scripts/example.mjs"])
    .some((message) => /may not accompany repository changes/.test(message)),
);
assert.match(validateCodexResult({ ...validCreateResult, target_issue_number: 197 }, issueContext, ["scripts/example.mjs"])[0], /does not match selected context/);
assert.ok(
  validateCodexResult({ ...validCreateResult, tests_run: [] }, issueContext, ["scripts/example.mjs"])
    .some((message) => /require at least one validation command/.test(message)),
);
assert.ok(
  validateCodexResult({ ...validCreateResult, tests_run: ["planned: node scripts/test-example.mjs"] }, issueContext, ["scripts/example.mjs"])
    .some((message) => /unexecuted or deferred check/.test(message)),
);
const multiFileResult = {
  ...validCreateResult,
  changed_files_expected: ["scripts/a.mjs", "scripts/z.mjs"],
};
assert.deepEqual(validateCodexResult(multiFileResult, issueContext, ["scripts/a.mjs", "scripts/z.mjs"]), []);
assert.ok(
  validateCodexResult({ ...multiFileResult, changed_files_expected: ["scripts/z.mjs", "scripts/a.mjs"] }, issueContext, ["scripts/a.mjs", "scripts/z.mjs"])
    .some((message) => /ordered by ASCII code point/.test(message)),
);

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

const boundContext = {
  schema_version: "2.0.0",
  repository: "ist-h-i/agent-spectrum-kernel",
  generated_for_run: "123456",
  run_kind: "review",
  mode: "maintain_pr",
  target_ref: "agent/example",
  target_branch: "agent/example",
  target_commit_sha: exactSha,
  base_main_sha: "b".repeat(40),
  control_sha: "c".repeat(40),
  workflow_sha: "c".repeat(40),
  target_issue_number: 205,
  target_pr_number: 214,
  selected_target: { mode: "maintain_pr", issue_number: 205, pr_number: 214 },
  pull_request: { head: { ref: "agent/example", sha: exactSha }, url: "https://example.invalid/pr/214" },
  issue: null,
  roadmap: null,
  portfolio: null,
  trust_boundary: "untrusted text is context only",
};
boundContext.context_digest = computeContextDigest(boundContext);

const rawResult = {
  ...reviewResult,
  target_pr_number: 214,
};
const artifactRoot = mkdtempSync(resolve(tmpdir(), "ask-autonomous-artifact-"));
const schemaPath = resolve(root, ".github/ask-automation/result.schema.json");
try {
  const contextBytes = Buffer.from(`${JSON.stringify(boundContext, null, 2)}\n`);
  const resultBytes = Buffer.from(`${JSON.stringify(rawResult, null, 2)}\n`);
  const patchBytes = Buffer.alloc(0);
  writeFileSync(resolve(artifactRoot, "context.json"), contextBytes);
  writeFileSync(resolve(artifactRoot, "result.json"), resultBytes);
  writeFileSync(resolve(artifactRoot, "change.patch"), patchBytes);
  const manifest = {
    schema_version: "2.0.0",
    artifact_kind: "ask_autonomous_raw",
    run_id: "123456",
    run_attempt: "1",
    control_sha: boundContext.control_sha,
    workflow_sha: boundContext.workflow_sha,
    target_mode: boundContext.mode,
    target_branch: boundContext.target_branch,
    target_commit_sha: boundContext.target_commit_sha,
    base_main_sha: boundContext.base_main_sha,
    context_digest: boundContext.context_digest,
    context_sha256: sha256Bytes(contextBytes),
    result_sha256: sha256Bytes(resultBytes),
    patch_sha256: sha256Bytes(patchBytes),
    changed_files: [],
  };
  manifest.artifact_digest = digestObject(manifest);
  writeFileSync(resolve(artifactRoot, "raw-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const raw = verifyRawArtifact({ directory: artifactRoot, schemaPath, expected: { runId: "123456", runAttempt: "1", controlSha: boundContext.control_sha, workflowSha: boundContext.workflow_sha } });
  const emptyChange = { changed_files: [], additions: 0, deletions: 0, changed_lines: 0 };
  const validation = buildValidationRecord({ raw, change: emptyChange, runId: "123456", runAttempt: "1" });
  verifyValidationRecord({ record: validation, raw, runId: "123456", runAttempt: "1" });

  // F-214-01 TOCTOU / integrity: downloaded guard is never an input; all mutable raw fields are bound.
  const publisherSource = readFileSync(resolve(root, "scripts/ask-autonomous-publish.mjs"), "utf8");
  assert.doesNotMatch(publisherSource, /args\.guard|--guard/u);
  assert.match(publisherSource, /buildFinalGuard/);
  assert.throws(() => verifyValidationRecord({ record: { ...validation, changed_lines: 1 }, raw, runId: "123456", runAttempt: "1" }), /validation record digest drift/);

  writeFileSync(resolve(artifactRoot, "result.json"), `${JSON.stringify({ ...rawResult, summary: "changed" }, null, 2)}\n`);
  assert.throws(() => verifyRawArtifact({ directory: artifactRoot, schemaPath, expected: { runId: "123456", runAttempt: "1" } }), /result digest drift/);
  writeFileSync(resolve(artifactRoot, "result.json"), resultBytes);

  writeFileSync(resolve(artifactRoot, "change.patch"), "replacement");
  assert.throws(() => verifyRawArtifact({ directory: artifactRoot, schemaPath, expected: { runId: "123456", runAttempt: "1" } }), /patch digest drift/);
  writeFileSync(resolve(artifactRoot, "change.patch"), patchBytes);

  const contextWithDrift = { ...boundContext, target_branch: "moved" };
  const driftBytes = Buffer.from(`${JSON.stringify(contextWithDrift, null, 2)}\n`);
  const driftManifest = { ...manifest, context_sha256: sha256Bytes(driftBytes) };
  driftManifest.artifact_digest = digestObject(driftManifest, "artifact_digest");
  writeFileSync(resolve(artifactRoot, "context.json"), driftBytes);
  writeFileSync(resolve(artifactRoot, "raw-manifest.json"), `${JSON.stringify(driftManifest, null, 2)}\n`);
  assert.throws(() => verifyRawArtifact({ directory: artifactRoot, schemaPath, expected: { runId: "123456", runAttempt: "1" } }), /context digest drift/);
  writeFileSync(resolve(artifactRoot, "context.json"), contextBytes);
  writeFileSync(resolve(artifactRoot, "raw-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  assert.throws(() => verifyRawArtifact({ directory: artifactRoot, schemaPath, expected: { runId: "123456", runAttempt: "1", controlSha: "d".repeat(40) } }), /control_sha does not match expected immutable identity/);
  assert.throws(() => buildValidationRecord({ raw, change: emptyChange, runId: "123456", runAttempt: "1", status: "failure" }), /validation status must be success/);
  assert.throws(() => verifyValidationRecord({ record: validation, raw, runId: "different-run", runAttempt: "1" }), /validation_run_id binding mismatch/);
} finally {
  rmSync(artifactRoot, { recursive: true, force: true });
}

// Exercise raw creation, fresh application, validation binding, final guard, and post-validation protected-path rejection together.
const integrationRoot = mkdtempSync(resolve(tmpdir(), "ask-autonomous-guard-integration-"));
try {
  const source = resolve(integrationRoot, "source");
  const rawDirectory = resolve(integrationRoot, "raw");
  mkdirSync(source);
  git(source, ["init", "--initial-branch=main"]);
  git(source, ["config", "user.name", "ASK test"]);
  git(source, ["config", "user.email", "ask-test@example.invalid"]);
  writeFileSync(resolve(source, "README.md"), "base\n");
  git(source, ["add", "README.md"]);
  git(source, ["commit", "-m", "base"]);
  const targetSha = git(source, ["rev-parse", "HEAD"]);
  const integrationContext = {
    ...boundContext,
    mode: "advance_issue",
    run_kind: "advance",
    target_ref: "main",
    target_branch: "main",
    target_commit_sha: targetSha,
    base_main_sha: targetSha,
    target_issue_number: 197,
    target_pr_number: null,
    selected_target: { mode: "advance_issue", issue_number: 197, pr_number: null },
    pull_request: null,
  };
  integrationContext.context_digest = computeContextDigest(integrationContext);
  const integrationResult = {
    ...validCreateResult,
    target_issue_number: 197,
    changed_files_expected: ["feature.txt"],
  };
  const contextPath = resolve(integrationRoot, "context.json");
  const resultPath = resolve(integrationRoot, "result.json");
  writeFileSync(contextPath, `${JSON.stringify(integrationContext, null, 2)}\n`);
  writeFileSync(resultPath, `${JSON.stringify(integrationResult, null, 2)}\n`);
  writeFileSync(resolve(source, "feature.txt"), "bounded change\n");
  const created = createRawArtifact({ repository: source, contextPath, resultPath, schemaPath, outputDirectory: rawDirectory, runId: "123456", runAttempt: "1" });
  assert.deepEqual(created.change.changed_files, ["feature.txt"]);

  const validationWorkspace = resolve(integrationRoot, "validation");
  git(integrationRoot, ["clone", source, validationWorkspace]);
  git(validationWorkspace, ["apply", "--binary", resolve(rawDirectory, "change.patch")]);
  const appliedRaw = verifyRawArtifact({ directory: rawDirectory, schemaPath, expected: { runId: "123456", runAttempt: "1", controlSha: integrationContext.control_sha } });
  const appliedChange = validateAutomationRun({ repository: validationWorkspace, context: appliedRaw.context, result: appliedRaw.result, expectedPatch: appliedRaw.patch });
  const record = buildValidationRecord({ raw: appliedRaw, change: appliedChange, runId: "123456", runAttempt: "1" });
  const finalGuard = buildFinalGuard({ raw: appliedRaw, validation: record, change: appliedChange });
  assert.equal(finalGuard.validation_status, "success");
  assert.match(finalGuard.guard_digest, /^sha256:[a-f0-9]{64}$/u);
  for (const field of ["schema_version", "control_sha", "workflow_sha", "target_branch", "target_commit_sha", "base_main_sha", "context_sha256", "result_sha256", "patch_sha256", "changed_files", "additions", "deletions", "changed_lines", "validation_run_id", "validation_run_attempt", "validation_status", "guard_digest"]) {
    assert.ok(field in finalGuard, `final guard must bind ${field}`);
  }

  mkdirSync(resolve(validationWorkspace, "scripts"));
  writeFileSync(resolve(validationWorkspace, "scripts/validate-repo.mjs"), "// tampered after validation\n");
  assert.throws(() => validateAutomationRun({ repository: validationWorkspace, context: appliedRaw.context, result: appliedRaw.result, expectedPatch: appliedRaw.patch }), /protected path: scripts\/validate-repo\.mjs/);
} finally {
  rmSync(integrationRoot, { recursive: true, force: true });
}

// F-214-02 target drift: both early and final checks use the recorded exact SHA.
assert.equal(targetDrift(boundContext, exactSha), null);
assert.deepEqual(targetDrift(boundContext, "d".repeat(40)), { kind: "stale_pr_head", expected_sha: exactSha, observed_sha: "d".repeat(40) });
assert.ok(formatStaleReviewStatus(boundContext, "d".repeat(40)).includes(`Reviewed HEAD: \`${exactSha}\``));
const issueBoundContext = { ...boundContext, mode: "advance_issue", target_branch: "main", target_commit_sha: boundContext.base_main_sha, target_pr_number: null };
assert.equal(targetDrift(issueBoundContext, boundContext.base_main_sha), null);
assert.equal(targetDrift(issueBoundContext, "e".repeat(40)).kind, "stale_base");

// F-214-03 scans source patches and every model-controlled outbound field without echoing values.
const cleanResult = { ...rawResult, summary: "clean", rationale: "clean", pr_title: null, pr_body: null, issue_comment: null, review_comment: "clean", tests_run: [], risks: [] };
const openAiSecret = `sk-proj-${"A".repeat(32)}`;
const githubSecret = `github_pat_${"B".repeat(32)}`;
assertRejectsSecrets({ patch: Buffer.from(`diff --git a/docs/key.md b/docs/key.md\n+++ b/docs/key.md\n@@ -0,0 +1 @@\n+${openAiSecret}\n`), result: cleanResult }, "openai_api_key");
assertRejectsSecrets({ patch: Buffer.from(`diff --git a/src/key.mjs b/src/key.mjs\n+++ b/src/key.mjs\n@@ -0,0 +1 @@\n+const key = \"${githubSecret}\";\n`), result: cleanResult }, "github_token");
assertRejectsSecrets({ patch: Buffer.from("-----BEGIN PRIVATE KEY-----\n"), result: cleanResult }, "pem_private_key");
for (const field of ["pr_body", "issue_comment", "review_comment"]) {
  assertRejectsSecrets({ patch: Buffer.alloc(0), result: { ...cleanResult, [field]: `token=${"x".repeat(20)}` } }, "explicit_credential_assignment");
}
assertRejectsSecrets({ patch: Buffer.alloc(0), result: { ...cleanResult, tests_run: [`Authorization: Bearer ${"x".repeat(20)}`] } }, "authorization_credential");
assertRejectsSecrets({ patch: Buffer.alloc(0), result: { ...cleanResult, risks: [`password=${"x".repeat(20)}`] } }, "explicit_credential_assignment");
assertRejectsSecrets({ patch: Buffer.from([0]), result: cleanResult }, "nul_byte");
try {
  assertNoAutomationSecrets({ patch: Buffer.from(openAiSecret), result: cleanResult });
  assert.fail("secret scan should reject an OpenAI key");
} catch (error) {
  assert.doesNotMatch(error.message, new RegExp(openAiSecret, "u"));
}

const schema = JSON.parse(readFileSync(resolve(root, ".github/ask-automation/result.schema.json"), "utf8"));
assert.equal(schema.additionalProperties, false);
assert.ok(schema.properties.action.enum.includes("blocked"));
assert.equal(schema.properties.changed_files_expected.maxItems, 60);

const workflow = readFileSync(resolve(root, ".github/workflows/ask-autonomous-development.yml"), "utf8");
assert.match(workflow, /20 0 \* \* 1-5/);
assert.match(workflow, /20 8 \* \* 1-5/);
assert.deepEqual(validateAskAutomationActionPinsText(workflow), []);
for (const [action, pin] of Object.entries(APPROVED_ASK_AUTOMATION_ACTION_PINS)) assert.match(workflow, new RegExp(`${action.replace("/", "\\/")}@${pin.sha} # ${pin.version}`, "u"));
assert.match(workflow, /node-version: "24"/);
assert.match(workflow, /ASK_AUTOMATION_ENABLED/);
assert.match(workflow, /report_failure:/);
assert.match(workflow, /ASK_AUTOMATION_USES_DEDICATED_TOKEN/);
assert.doesNotMatch(workflow, /gh pr merge|merge_pull_request|auto-merge/iu);

const codexJob = jobBlock(workflow, "codex_generate", "validate_patch");
const validationJob = jobBlock(workflow, "validate_patch", "publish");
const publishJob = jobBlock(workflow, "publish", "report_failure");
assert.match(codexJob, /permissions:\n\s+contents: read/u);
assert.doesNotMatch(codexJob.slice(codexJob.indexOf("Run Codex in repository-only workspace")), /workspace\/scripts\//u);
assert.match(validationJob, /permissions:\n\s+contents: read/u);
assert.doesNotMatch(validationJob, /secrets\.|issues: write|pull-requests: write|contents: write/u);
assert.match(validationJob, /Re-download original raw artifact after repository execution/u);
assert.match(validationJob, /Re-check out immutable control plane after repository execution/u);
for (const match of validationJob.matchAll(/run: node scripts\/([^\s]+)/gu)) assert.equal(isDisallowedPath(`scripts/${match[1]}`), true, `direct validation entrypoint scripts/${match[1]} must be protected`);
assert.match(publishJob, /Recompute final guard and publish bounded updates/u);
assert.match(publishJob, /ASK_VALIDATION_STATUS: \$\{\{ needs\.validate_patch\.result \}\}/u);
assert.doesNotMatch(publishJob, /working-directory: workspace[\s\S]*run: node scripts\//u);
assert.doesNotMatch(workflow, /\n\s+ref: main\s*$/mu);
assert.ok((workflow.match(/ref: \$\{\{ needs\.context\.outputs\.target_commit_sha \}\}/gu) ?? []).length >= 3);
assert.match(workflow, /needs\.validate_patch\.result == 'success'/u);

const checkoutPin = APPROVED_ASK_AUTOMATION_ACTION_PINS["actions/checkout"];
const validPinLine = `steps:\n  - uses: actions/checkout@${checkoutPin.sha} # ${checkoutPin.version}\n`;
assert.deepEqual(validateAskAutomationActionPinsText(validPinLine), []);
assert.ok(validateAskAutomationActionPinsText("steps:\n  - uses: actions/checkout@v7\n").some((error) => /full 40-character/.test(error)));
assert.ok(validateAskAutomationActionPinsText("steps:\n  - uses: actions/checkout@v7.0.1 # v7.0.1\n").some((error) => /full 40-character/.test(error)));
assert.ok(validateAskAutomationActionPinsText("steps:\n  - uses: actions/checkout@3d3c42e5 # v7.0.1\n").some((error) => /full 40-character/.test(error)));
assert.ok(validateAskAutomationActionPinsText(`steps:\n  - uses: unknown/action@${exactSha} # v1.0.0\n`).some((error) => /not in the automation allowlist/.test(error)));
assert.ok(validateAskAutomationActionPinsText(`steps:\n  - uses: actions/checkout@${checkoutPin.sha}\n`).some((error) => /requires a version comment/.test(error)));

const prompt = readFileSync(resolve(root, ".github/ask-automation/codex-prompt.md"), "utf8");
for (const required of ["Never perform", "merge a pull request", "close an Issue", "measured benchmark", "GitHub write token is deliberately unavailable", "separate explicit human-authorized workflow"]) {
  assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
}
assert.doesNotMatch(prompt, /unless the selected Issue is #198/iu);

const publisher = readFileSync(resolve(root, "scripts/ask-autonomous-publish.mjs"), "utf8");
assert.match(publisher, /login\.endsWith\("\[bot\]"\)/);
assert.match(publisher, /ordinary pull-request CI expected from dedicated publication token/);
assert.doesNotMatch(publisher, /merge_pull_request|gh pr merge/iu);

const failureRunUrl = "https://github.com/ist-h-i/agent-spectrum-kernel/actions/runs/123";
const failureArtifacts = buildFailureArtifacts(prContext, { jobResult: "failure", runUrl: failureRunUrl });
assert.equal(failureArtifacts.result.action, "blocked");
assert.equal(failureArtifacts.result.target_issue_number, 205);
assert.equal(failureArtifacts.result.target_pr_number, 213);
assert.match(failureArtifacts.result.rationale, /No patch was published/);
assert.match(failureArtifacts.result.review_comment, /No branch update or merge occurred/);
assert.deepEqual(failureArtifacts.guard.changed_files, []);
assert.equal(failureArtifacts.guard.changed_lines, 0);
assert.equal(failureArtifacts.patch, "");

const validateWorkflow = readFileSync(resolve(root, ".github/workflows/validate.yml"), "utf8");
assert.match(validateWorkflow, /actions\/checkout@v5/);
assert.match(validateWorkflow, /actions\/setup-node@v5/);
assert.match(validateWorkflow, /node-version: "24"/);
assert.match(validateWorkflow, /Run autonomous development control tests/);
for (const required of ["portfolio catalog", "portfolio policy", "portfolio design pre-admission", "portfolio independent design review", "general benchmark", "adaptive portfolio execution", "adaptive portfolio normalized result", "evaluator isolation boundary", "repository consistency", "whitespace"]) {
  assert.match(validateWorkflow.toLowerCase(), new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
}

console.log("ASK autonomous development control tests passed");
