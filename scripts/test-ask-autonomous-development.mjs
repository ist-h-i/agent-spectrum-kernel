#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildBlockedContext, CRITICAL_PATH_ISSUES, computeContextDigest, prepareContextArtifacts, selectTarget } from "./ask-autonomous-context.mjs";
import { buildFailureArtifacts } from "./ask-autonomous-failure.mjs";
import { buildFinalGuard, createRawArtifact, digestObject, isDisallowedPath, sha256Bytes, validateAutomationRun, validateChangedPaths, validateCodexResult, verifyRawArtifact } from "./ask-autonomous-guard.mjs";
import { buildValidationAttestation, verifyExecutionRecord, verifyValidationAttestation } from "./ask-autonomous-attest.mjs";
import { branchNameForIssue, buildIssueLease, evaluateIssuePublicationState, formatStaleReviewStatus, leaseOwnedByRun, linkedIssueNumbers, parseIssueLease, selectActiveLease, statusCommentAuthorAllowed, targetDrift, verifySealedLeaseComment } from "./ask-autonomous-publish.mjs";
import { assertNoAutomationSecrets, scanContextSources } from "./ask-autonomous-secret-scan.mjs";
import { commandDefinitionDigest, dockerArguments, executeValidationPlan, loadValidationPlan, VALIDATION_ENVIRONMENT, VALIDATION_IMAGE_DIGEST } from "./ask-autonomous-validate-execute.mjs";
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

  // F-214-01 TOCTOU / integrity: downloaded guard is never an input; all mutable raw fields are bound.
  const publisherSource = readFileSync(resolve(root, "scripts/ask-autonomous-publish.mjs"), "utf8");
  assert.doesNotMatch(publisherSource, /args\.guard|--guard/u);
  assert.match(publisherSource, /buildFinalGuard/);

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
  const attestation = {
    artifact_kind: "ask_autonomous_validation_attestation",
    run_id: "123456",
    run_attempt: "1",
    validation_job_result: "success",
    execution_digest: `sha256:${"d".repeat(64)}`,
    container_image_digest: VALIDATION_IMAGE_DIGEST,
    command_plan_sha256: `sha256:${"e".repeat(64)}`,
  };
  attestation.attestation_digest = digestObject(attestation);
  const finalGuard = buildFinalGuard({ raw: appliedRaw, attestation, change: appliedChange });
  assert.equal(finalGuard.validation_status, "success");
  assert.match(finalGuard.guard_digest, /^sha256:[a-f0-9]{64}$/u);
  for (const field of ["schema_version", "control_sha", "workflow_sha", "target_branch", "target_commit_sha", "base_main_sha", "context_sha256", "result_sha256", "patch_sha256", "changed_files", "additions", "deletions", "changed_lines", "validation_run_id", "validation_run_attempt", "validation_status", "validation_attestation_digest", "validation_execution_digest", "validation_container_image_digest", "validation_command_plan_sha256", "guard_digest"]) {
    assert.ok(field in finalGuard, `final guard must bind ${field}`);
  }
  const ownerRevalidation = { revalidation_digest: digestObject({ lease_digest: "lease", comment_id: 1, author: "ist-h-i", authority_class: "repository_owner" }) };
  const botRevalidation = { revalidation_digest: digestObject({ lease_digest: "lease", comment_id: 1, author: "ask-publication[bot]", authority_class: "authenticated_publication" }) };
  const ownerGuard = buildFinalGuard({ raw: appliedRaw, attestation, change: appliedChange, publicationRevalidation: ownerRevalidation });
  const botGuard = buildFinalGuard({ raw: appliedRaw, attestation, change: appliedChange, publicationRevalidation: botRevalidation });
  assert.notEqual(ownerGuard.publication_revalidation_digest, botGuard.publication_revalidation_digest);
  assert.notEqual(ownerGuard.guard_digest, botGuard.guard_digest, "lease authority evidence drift must change the final guard digest");

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

// F-214-05: every immutable validation command gets a fresh, networkless container
// with no runner command files, host credentials, or inherited environment.
const planPath = resolve(root, ".github/ask-automation/validation-plan.json");
const loadedPlan = loadValidationPlan(planPath);
assert.equal(loadedPlan.plan.container.node_major, 24);
assert.equal(loadedPlan.plan.container.image_digest, VALIDATION_IMAGE_DIGEST);
assert.deepEqual(loadedPlan.plan.container.environment_allowlist, ["PATH", "HOME", "LANG", "LC_ALL", "NODE_ENV"]);
const requiredCommandIds = [
  "changed_mjs_syntax", "autonomous_development_control", "repository_validation_tests", "portfolio_catalog",
  "portfolio_policy", "design_admission", "design_independent_review", "general_benchmark", "execution",
  "normalized_results", "evaluator_boundary", "portfolio_score", "portfolio_result_set", "portfolio_repetition_report", "portfolio_paired_comparison_report", "portfolio_directional_outcome_report", "adapter_runtime_bundle", "repository_consistency", "whitespace",
];
assert.deepEqual(loadedPlan.plan.commands.map((command) => command.id), requiredCommandIds);
const sampleDockerArgs = dockerArguments({ image: loadedPlan.plan.container.image, repository: "/safe/workspace", control: "/safe/control", planPath: "/safe/plan.json", commandId: "general_benchmark" });
for (const required of ["--rm", "--init", "--network", "none", "--read-only", "--cap-drop", "ALL", "no-new-privileges", "/source,readonly", "/workspace:rw,nosuid,nodev", "/control,readonly", "/validation-plan.json,readonly", "/tmp:rw,nosuid,nodev"] ) assert.ok(sampleDockerArgs.join(" ").includes(required), `docker boundary must include ${required}`);
for (const forbidden of ["GITHUB_ENV", "GITHUB_PATH", "GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY", "RUNNER_TOOL_CACHE", "ACTIONS_RUNTIME_TOKEN", "SSH_AUTH_SOCK", "docker.sock", "BASH_ENV", "/home/runner"]) assert.doesNotMatch(sampleDockerArgs.join(" "), new RegExp(forbidden, "u"));
assert.deepEqual(Object.keys(VALIDATION_ENVIRONMENT), ["PATH", "HOME", "LANG", "LC_ALL", "NODE_ENV"]);
assert.ok(sampleDockerArgs.indexOf("-i") < sampleDockerArgs.indexOf("PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"));
assert.deepEqual(sampleDockerArgs.slice(-4), ["--plan", "/validation-plan.json", "--command-id", "general_benchmark"]);

const validationEvidenceRoot = mkdtempSync(resolve(tmpdir(), "ask-validation-evidence-"));
try {
  const calls = [];
  const validationRaw = {
    context: boundContext,
    manifest: { artifact_digest: `sha256:${"f".repeat(64)}` },
  };
  const record = executeValidationPlan({
    repository: "/safe/workspace",
    control: "/safe/control",
    raw: validationRaw,
    plan: loadedPlan.plan,
    planDigest: loadedPlan.digest,
    planPath,
    outputDirectory: validationEvidenceRoot,
    runId: "123456",
    runAttempt: "1",
    now: () => "2026-07-21T00:00:00.000Z",
    spawn: (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: Buffer.from(openAiSecret), stderr: Buffer.from("private evaluator output") };
    },
  });
  assert.equal(calls.length, loadedPlan.plan.commands.length, "background process, PATH, and BASH_ENV state must not share a container between commands");
  assert.ok(calls.every((call) => call.command === "docker" && call.args.includes("--rm") && call.args.includes("none")));
  assert.equal(record.status, "success");
  assert.equal(record.commands.length, requiredCommandIds.length);
  for (const evidence of record.commands) {
    assert.equal(evidence.definition_sha256, commandDefinitionDigest(loadedPlan.plan.commands.find((command) => command.id === evidence.id)));
    const safeLog = readFileSync(resolve(validationEvidenceRoot, evidence.safe_log_path), "utf8");
    assert.match(safeLog, /output_withheld=true/u);
    assert.doesNotMatch(safeLog, new RegExp(openAiSecret, "u"));
    assert.doesNotMatch(safeLog, /private evaluator output/u);
  }
  verifyExecutionRecord({ record, raw: validationRaw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, executionDirectory: validationEvidenceRoot, runId: "123456", runAttempt: "1", validationJobResult: "success" });
  assert.throws(() => verifyExecutionRecord({ record, raw: validationRaw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, executionDirectory: validationEvidenceRoot, runId: "other-run", runAttempt: "1", validationJobResult: "success" }), /run_id binding mismatch/u);
  assert.throws(() => verifyExecutionRecord({ record, raw: validationRaw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, executionDirectory: validationEvidenceRoot, runId: "123456", runAttempt: "2", validationJobResult: "success" }), /run_attempt binding mismatch/u);
  assert.throws(() => verifyExecutionRecord({ record: { ...record, status: "success" }, raw: validationRaw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, executionDirectory: validationEvidenceRoot, runId: "123456", runAttempt: "1", validationJobResult: "failure" }), /conclusion is not success/u);
  const firstLog = resolve(validationEvidenceRoot, record.commands[0].safe_log_path);
  const originalLog = readFileSync(firstLog);
  writeFileSync(firstLog, "rewritten after validation\n");
  assert.throws(() => verifyExecutionRecord({ record, raw: validationRaw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, executionDirectory: validationEvidenceRoot, runId: "123456", runAttempt: "1", validationJobResult: "success" }), /safe_log_sha256 binding mismatch/u);
  writeFileSync(firstLog, originalLog);
  const attestation = buildValidationAttestation({ raw: validationRaw, record, plan: loadedPlan.plan, planDigest: loadedPlan.digest, runId: "123456", runAttempt: "1", validationJobResult: "success" });
  verifyValidationAttestation({ attestation, raw: validationRaw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, runId: "123456", runAttempt: "1", validationJobResult: "success" });
  assert.throws(() => verifyValidationAttestation({ attestation, raw: validationRaw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, runId: "different", runAttempt: "1", validationJobResult: "success" }), /run_id binding mismatch/u);
} finally {
  rmSync(validationEvidenceRoot, { recursive: true, force: true });
}

// F-214-06: raw GitHub input and final bytes are scanned before any model artifact is written.
const safePromptTemplate = "Implement only the selected bounded task.";
const safeAdvanceContext = {
  ...boundContext,
  mode: "advance_issue",
  target_ref: "main",
  target_branch: "main",
  target_commit_sha: boundContext.base_main_sha,
  target_issue_number: 197,
  target_pr_number: null,
  pull_request: null,
};
safeAdvanceContext.context_digest = computeContextDigest(safeAdvanceContext);
const sensitiveCases = [
  ["issue.body", 197, openAiSecret, "openai_api_key"],
  ["pull_request.body", 214, githubSecret, "github_token"],
  ["issue.comments.body", 1, `AKIA${"C".repeat(16)}`, "aws_access_key"],
  ["pull_request.inline_review_comments.body", 2, "-----BEGIN PRIVATE KEY-----", "pem_private_key"],
  ["pull_request.checks.output.summary", 3, `Authorization: Bearer ${"d".repeat(24)}`, "authorization_credential"],
  ["roadmap.body", 170, `password=${"e".repeat(20)}`, "explicit_credential_assignment"],
  ["issue.body", 197, `${"x".repeat(7_995)} ${openAiSecret}`, "openai_api_key"],
  ["portfolio.comments.body", 4, `認証 token =\n${"f".repeat(20)}`, "explicit_credential_assignment"],
];
for (const [field, id, value, category] of sensitiveCases) {
  const artifacts = prepareContextArtifacts({ context: safeAdvanceContext, sources: [{ field, id, value }], promptTemplate: safePromptTemplate, runId: "123456" });
  assert.equal(artifacts.shouldGenerate, false);
  assert.equal(artifacts.shouldReportSensitiveContext, true);
  assert.equal(artifacts.promptBytes, null);
  assert.equal(artifacts.context.blocked_reason, "sensitive_context");
  assert.ok(artifacts.context.finding_categories.includes(category));
  assert.doesNotMatch(artifacts.contextBytes.toString("utf8"), new RegExp(value.slice(-20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
}
const falsePositiveBlocked = prepareContextArtifacts({ context: safeAdvanceContext, sources: [{ field: "issue.body", id: 197, value: `token=${"g".repeat(20)}` }], promptTemplate: safePromptTemplate, runId: "123456" });
assert.equal(falsePositiveBlocked.shouldGenerate, false, "a possible false positive must block instead of silently redacting and continuing");
assert.equal(falsePositiveBlocked.promptBytes, null);
const blockedOne = buildBlockedContext(safeAdvanceContext, scanContextSources([{ field: "issue.body", id: 197, value: openAiSecret }]), "123456");
const blockedTwo = buildBlockedContext(safeAdvanceContext, scanContextSources([{ field: "issue.body", id: 197, value: openAiSecret }]), "123456");
assert.deepEqual(blockedOne, blockedTwo, "minimal blocked context identity must be deterministic");
assert.deepEqual(Object.keys(blockedOne).sort(), ["base_main_sha", "blocked_reason", "context_digest", "control_sha", "finding_categories", "finding_locations", "repository", "run_id", "schema_version", "target_branch", "target_commit_sha", "target_issue_number", "target_mode", "target_pr_number", "workflow_sha"].sort());
const safeArtifacts = prepareContextArtifacts({ context: safeAdvanceContext, sources: [{ field: "issue.body", id: 197, value: "safe task" }], promptTemplate: safePromptTemplate, runId: "123456" });
assert.equal(safeArtifacts.shouldGenerate, true);
assert.ok(safeArtifacts.promptBytes.includes(Buffer.from("safe task")) === false, "prompt is built from the final context, not a separately mutable source list");

// F-214-07: Issue advancement is revalidated against live Issue/PR/main/branch state and a run lease.
const publicationBase = {
  context: safeAdvanceContext,
  repository: safeAdvanceContext.repository,
  issue: { number: 197, state: "open", state_reason: null },
  pulls: [],
  branchExists: false,
  mainSha: safeAdvanceContext.base_main_sha,
  activeLease: null,
  runId: "123456",
  runAttempt: "1",
};
assert.equal(evaluateIssuePublicationState(publicationBase).can_publish, true);
assert.equal(evaluateIssuePublicationState({ ...publicationBase, issue: { state: "closed", state_reason: "completed" } }).reason, "issue_completed");
assert.equal(evaluateIssuePublicationState({ ...publicationBase, issue: { state: "closed", state_reason: "not_planned" } }).reason, "issue_not_planned");
for (const verb of ["Progresses", "Closes", "Fixes", "Addresses"]) assert.deepEqual(linkedIssueNumbers(`${verb} #197`), [197]);
const humanPull = { number: 301, state: "open", body: "Fixes #197", head: { ref: "human/issue-197" } };
const automationPull = { number: 302, state: "open", body: "Progresses #197\n<!-- ask-autonomous-development -->", head: { ref: "automation/ask-issue-197-other" } };
assert.equal(evaluateIssuePublicationState({ ...publicationBase, pulls: [humanPull] }).reason, "linked_open_pr_exists");
assert.equal(evaluateIssuePublicationState({ ...publicationBase, pulls: [automationPull] }).reason, "automation_pr_exists");
assert.equal(evaluateIssuePublicationState({ ...publicationBase, branchExists: true }).reason, "same_run_branch_exists");
assert.equal(evaluateIssuePublicationState({ ...publicationBase, mainSha: "0".repeat(40) }).reason, "main_sha_changed");
assert.equal(evaluateIssuePublicationState({ ...publicationBase, currentRepository: "renamed/repository" }).reason, "repository_or_base_changed");
assert.equal(evaluateIssuePublicationState({ ...publicationBase, baseBranch: "trunk" }).reason, "repository_or_base_changed");
for (const stale of [
  evaluateIssuePublicationState({ ...publicationBase, issue: { state: "closed", state_reason: "completed" } }),
  evaluateIssuePublicationState({ ...publicationBase, pulls: [humanPull] }),
  evaluateIssuePublicationState({ ...publicationBase, branchExists: true }),
]) assert.deepEqual(stale.allowed_publication_actions, ["trusted_status"], "stale publication must not allow patch, branch, or PR actions");
// F-214-08: a body digest is integrity evidence, not authority. Only authenticated
// GitHub comment identity and tightly bound metadata can produce a verified lease.
const leaseNow = new Date("2026-07-21T00:00:00.000Z");
const dedicatedPublicationLogin = "ask-publication[bot]";
const leaseBindings = {
  repository: safeAdvanceContext.repository,
  issueNumber: 197,
  targetSha: safeAdvanceContext.target_commit_sha,
  controlSha: safeAdvanceContext.control_sha,
  workflowSha: safeAdvanceContext.workflow_sha,
  publicationLogin: dedicatedPublicationLogin,
};
function leaseComment({
  id = 101,
  login = "ist-h-i",
  association = "OWNER",
  createdAt = "2026-07-20T23:59:00.000Z",
  leaseOverrides = {},
  recomputeDigest = true,
} = {}) {
  const lease = buildIssueLease({
    commentId: id,
    issueNumber: 197,
    repository: safeAdvanceContext.repository,
    runId: "other",
    runAttempt: "1",
    targetSha: safeAdvanceContext.target_commit_sha,
    controlSha: safeAdvanceContext.control_sha,
    workflowSha: safeAdvanceContext.workflow_sha,
    owner: login,
    acquiredAt: "2026-07-20T23:59:00.000Z",
    expiresAt: "2026-07-21T00:10:00.000Z",
  });
  Object.assign(lease, leaseOverrides);
  if (recomputeDigest) lease.lease_digest = digestObject(lease, "lease_digest");
  return {
    id,
    user: login === null ? {} : { login },
    author_association: association,
    created_at: createdAt,
    body: `<!-- ask-autonomous-development-lease -->\n${JSON.stringify(lease)}`,
  };
}

const externalLeaseComment = leaseComment({ id: 102, login: "external-user", association: "NONE" });
const arbitraryBotLeaseComment = leaseComment({ id: 103, login: "arbitrary[bot]", association: "NONE" });
const unallowlistedAppLeaseComment = leaseComment({ id: 104, login: "other-app[bot]", association: "NONE" });
assert.equal(parseIssueLease(externalLeaseComment, { ...leaseBindings, now: leaseNow }), null);
assert.equal(parseIssueLease(arbitraryBotLeaseComment, { ...leaseBindings, now: leaseNow }), null);
assert.equal(parseIssueLease(unallowlistedAppLeaseComment, { ...leaseBindings, now: leaseNow }), null);
assert.equal(parseIssueLease(leaseComment({ id: 105, login: null, association: "NONE" }), { ...leaseBindings, now: leaseNow }), null);
assert.equal(parseIssueLease(leaseComment({ id: 106, association: "INVALID" }), { ...leaseBindings, now: leaseNow }), null);

const ownerLease = parseIssueLease(leaseComment({ id: 107 }), { ...leaseBindings, now: leaseNow });
const actionsLease = parseIssueLease(leaseComment({ id: 108, login: "github-actions[bot]", association: "NONE" }), { ...leaseBindings, now: leaseNow });
const dedicatedLease = parseIssueLease(leaseComment({ id: 109, login: dedicatedPublicationLogin, association: "NONE" }), { ...leaseBindings, now: leaseNow });
assert.equal(ownerLease.authority_class, "repository_owner");
assert.equal(actionsLease.authority_class, "github_actions");
assert.equal(dedicatedLease.authority_class, "authenticated_publication");
const sealedOwnerBody = JSON.parse(leaseComment({ id: 107 }).body.split("\n").slice(1).join("\n"));
assert.deepEqual(Object.keys(sealedOwnerBody).sort(), ["schema_version", "comment_id", "issue_number", "repository", "run_id", "run_attempt", "target_sha", "control_sha", "workflow_sha", "lease_owner", "acquired_at", "expires_at", "lease_digest"].sort());
for (const lease of [ownerLease, actionsLease, dedicatedLease]) {
  for (const field of ["comment_id", "comment_author_login", "comment_author_association", "comment_created_at", "authority_class"]) assert.ok(field in lease);
}

const longLivedLease = leaseComment({ id: 110, leaseOverrides: { expires_at: "2100-01-01T00:00:00.000Z" } });
const overLimitLease = leaseComment({ id: 111, leaseOverrides: { expires_at: "2026-07-21T00:14:01.000Z" } });
const zeroDurationLease = leaseComment({ id: 112, leaseOverrides: { expires_at: "2026-07-20T23:59:00.000Z" } });
const negativeDurationLease = leaseComment({ id: 113, leaseOverrides: { expires_at: "2026-07-20T23:58:59.000Z" } });
const invalidTimestampLease = leaseComment({ id: 114, leaseOverrides: { acquired_at: "not-a-time" } });
const invalidCalendarLease = leaseComment({ id: 132, leaseOverrides: { acquired_at: "2026-02-30T23:59:00.000Z" } });
const createdAtDriftLease = leaseComment({ id: 115, createdAt: "2026-07-20T23:57:00.000Z" });
const futureAcquiredLease = leaseComment({ id: 127, createdAt: "2026-07-21T00:02:00.000Z", leaseOverrides: { acquired_at: "2026-07-21T00:02:00.000Z", expires_at: "2026-07-21T00:10:00.000Z" } });
const commentBoundLimitLease = leaseComment({ id: 128, createdAt: "2026-07-20T23:59:00.000Z", leaseOverrides: { acquired_at: "2026-07-21T00:00:00.000Z", expires_at: "2026-07-21T00:15:00.000Z" } });
for (const comment of [longLivedLease, overLimitLease, zeroDurationLease, negativeDurationLease, invalidTimestampLease, invalidCalendarLease, createdAtDriftLease, futureAcquiredLease, commentBoundLimitLease]) {
  assert.equal(parseIssueLease(comment, { ...leaseBindings, now: leaseNow }), null);
}

const wrongIssueLease = leaseComment({ id: 116, leaseOverrides: { issue_number: 205 } });
const wrongRepositoryLease = leaseComment({ id: 117, leaseOverrides: { repository: "other/repository" } });
const wrongTargetLease = leaseComment({ id: 118, leaseOverrides: { target_sha: "0".repeat(40) } });
const wrongControlLease = leaseComment({ id: 119, leaseOverrides: { control_sha: "d".repeat(40), workflow_sha: "d".repeat(40) } });
const mismatchedWorkflowLease = leaseComment({ id: 120, leaseOverrides: { workflow_sha: "d".repeat(40) } });
const unknownPropertyLease = leaseComment({ id: 121, leaseOverrides: { injected_authority: true } });
const digestDriftLease = leaseComment({ id: 122, leaseOverrides: { run_id: "changed-after-digest" }, recomputeDigest: false });
const nonPositiveIssueLease = leaseComment({ id: 129, leaseOverrides: { issue_number: 0 } });
const unnormalizedRunLease = leaseComment({ id: 130, leaseOverrides: { run_id: "contains space" } });
const malformedJsonLease = { ...leaseComment({ id: 131 }), body: "<!-- ask-autonomous-development-lease -->\n{" };
for (const comment of [wrongIssueLease, wrongRepositoryLease, wrongTargetLease, wrongControlLease, mismatchedWorkflowLease, unknownPropertyLease, digestDriftLease, nonPositiveIssueLease, unnormalizedRunLease, malformedJsonLease]) {
  assert.equal(parseIssueLease(comment, { ...leaseBindings, now: leaseNow }), null);
}

assert.equal(selectActiveLease([externalLeaseComment, arbitraryBotLeaseComment], leaseBindings, leaseNow), null);
assert.equal(evaluateIssuePublicationState({ ...publicationBase, activeLease: selectActiveLease([externalLeaseComment], leaseBindings, leaseNow) }).can_publish, true);
assert.equal(evaluateIssuePublicationState({ ...publicationBase, activeLease: ownerLease }).reason, "active_lease_exists");
const ownerLeaseDecision = evaluateIssuePublicationState({ ...publicationBase, activeLease: ownerLease });
const transplantedAuthorityDecision = evaluateIssuePublicationState({ ...publicationBase, activeLease: { ...ownerLease, comment_author_login: dedicatedPublicationLogin, authority_class: "authenticated_publication" } });
assert.notEqual(ownerLeaseDecision.revalidation_digest, transplantedAuthorityDecision.revalidation_digest, "publication revalidation must bind lease authority evidence");
const sameRunLease = parseIssueLease(leaseComment({ id: 123, leaseOverrides: { run_id: "123456" } }), { ...leaseBindings, now: leaseNow });
assert.equal(leaseOwnedByRun(sameRunLease, "123456", "1"), true);
assert.equal(leaseOwnedByRun(sameRunLease, "123456", "2"), false);
assert.equal(evaluateIssuePublicationState({ ...publicationBase, activeLease: sameRunLease }).can_publish, true);
const expiredLeaseComment = leaseComment({
  id: 124,
  createdAt: "2026-07-20T23:40:00.000Z",
  leaseOverrides: { acquired_at: "2026-07-20T23:40:00.000Z", expires_at: "2026-07-20T23:55:00.000Z" },
});
assert.equal(selectActiveLease([expiredLeaseComment], leaseBindings, leaseNow), null);
assert.equal(evaluateIssuePublicationState({ ...publicationBase, activeLease: selectActiveLease([expiredLeaseComment], leaseBindings, leaseNow) }).can_publish, true);

const originalComment = leaseComment({ id: 125 });
const transplantedId = { ...originalComment, id: 126 };
const transplantedAuthor = { ...originalComment, user: { login: "github-actions[bot]" }, author_association: "NONE" };
assert.equal(parseIssueLease(transplantedId, { ...leaseBindings, now: leaseNow }), null);
assert.equal(parseIssueLease(transplantedAuthor, { ...leaseBindings, now: leaseNow }), null);
assert.equal(verifySealedLeaseComment({
  createdComment: { id: 125, user: { login: "ist-h-i" }, author_association: "OWNER", created_at: "2026-07-20T23:59:00.000Z" },
  patchedComment: { ok: false, status: 500 },
  refetchedComment: originalComment,
  bindings: leaseBindings,
  now: leaseNow,
}), null);

const statusMarkerComment = (login, association) => ({ user: login === null ? {} : { login }, author_association: association });
assert.equal(statusCommentAuthorAllowed(safeAdvanceContext.repository, statusMarkerComment("ist-h-i", "OWNER"), dedicatedPublicationLogin), true);
assert.equal(statusCommentAuthorAllowed(safeAdvanceContext.repository, statusMarkerComment("github-actions[bot]", "NONE"), dedicatedPublicationLogin), true);
assert.equal(statusCommentAuthorAllowed(safeAdvanceContext.repository, statusMarkerComment(dedicatedPublicationLogin, "NONE"), dedicatedPublicationLogin), true);
assert.equal(statusCommentAuthorAllowed(safeAdvanceContext.repository, statusMarkerComment("other-app[bot]", "NONE"), dedicatedPublicationLogin), false);
assert.equal(statusCommentAuthorAllowed(safeAdvanceContext.repository, statusMarkerComment("arbitrary[bot]", "NONE"), dedicatedPublicationLogin), false);

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

const contextJob = jobBlock(workflow, "context", "report_sensitive_context");
const sensitiveJob = jobBlock(workflow, "report_sensitive_context", "codex_generate");
const codexJob = jobBlock(workflow, "codex_generate", "validate_execute");
const validationJob = jobBlock(workflow, "validate_execute", "attest_validation");
const attestJob = jobBlock(workflow, "attest_validation", "publish");
const publishJob = jobBlock(workflow, "publish", "report_failure");
assert.match(contextJob, /should_generate/u);
assert.match(contextJob, /should_report_sensitive_context/u);
assert.match(contextJob, /Build and scan bounded GitHub context before generation/u);
assert.match(sensitiveJob, /needs\.context\.outputs\.should_report_sensitive_context == 'true'/u);
assert.doesNotMatch(sensitiveJob, /openai\/codex-action|workspace|change\.patch/u);
assert.match(codexJob, /permissions:\n\s+contents: read/u);
assert.match(codexJob, /needs\.context\.outputs\.should_generate == 'true'/u);
assert.match(codexJob, /prompt-file: control\/\.ask-automation\/input\/prompt\.md/u);
assert.doesNotMatch(codexJob, /Build Codex prompt/u);
assert.doesNotMatch(codexJob.slice(codexJob.indexOf("Run Codex in repository-only workspace")), /workspace\/scripts\//u);
assert.match(validationJob, /permissions:\n\s+contents: read/u);
assert.doesNotMatch(validationJob, /secrets\.|issues: write|pull-requests: write|contents: write/u);
assert.match(validationJob, /ask-autonomous-validate-execute\.mjs execute/u);
assert.match(validationJob, /ask-automation-raw/u);
assert.match(validationJob, /ask-validation-execution/u);
assert.doesNotMatch(validationJob, /control-after/u);
assert.doesNotMatch(validationJob, /working-directory: workspace|run: node workspace\/|docker\.sock|ACTIONS_RUNTIME_TOKEN/u);
assert.match(attestJob, /needs\.validate_execute\.result/u);
assert.match(attestJob, /ask-autonomous-attest\.mjs/u);
assert.doesNotMatch(attestJob, /Check out exact development target|path: workspace|working-directory: workspace|docker run/u);
assert.match(publishJob, /Recompute final guard, revalidate concurrency, and publish bounded updates/u);
assert.match(publishJob, /ASK_VALIDATION_STATUS: \$\{\{ needs\.validate_execute\.result \}\}/u);
assert.match(publishJob, /--attestation/u);
assert.doesNotMatch(publishJob, /--validation/u);
assert.doesNotMatch(publishJob, /working-directory: workspace[\s\S]*run: node scripts\//u);
assert.doesNotMatch(workflow, /\n\s+ref: main\s*$/mu);
assert.ok((workflow.match(/ref: \$\{\{ needs\.context\.outputs\.target_commit_sha \}\}/gu) ?? []).length >= 3);
assert.match(workflow, /needs\.validate_execute\.result == 'success'/u);
assert.match(workflow, /needs\.attest_validation\.result == 'success'/u);

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
assert.doesNotMatch(publisher, /login\.endsWith\("\[bot\]"\)/);
assert.match(publisher, /authenticated_publication/);
assert.match(publisher, /ask-autonomous-development-lease-pending/);
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
for (const required of ["portfolio catalog", "portfolio policy", "portfolio design pre-admission", "portfolio independent design review", "general benchmark", "adaptive portfolio execution", "adaptive portfolio normalized result", "evaluator isolation boundary", "portfolio raw engineering result score", "repository consistency", "whitespace"]) {
  assert.match(validateWorkflow.toLowerCase(), new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
}

console.log("ASK autonomous development control tests passed");
