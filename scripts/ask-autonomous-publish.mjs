#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  assertContextIdentity,
  buildFinalGuard,
  validateAutomationRun,
  verifyRawArtifact,
  verifyValidationRecord,
} from "./ask-autonomous-guard.mjs";
import { assertNoAutomationSecrets } from "./ask-autonomous-secret-scan.mjs";

const STATUS_MARKER = "<!-- ask-autonomous-development-status -->";

function run(command, args, { cwd, allowFailure = false, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!allowFailure && result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result;
}

function sanitizeBranchFragment(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40) || "work";
}

export function branchNameForIssue(issueNumber, runId) {
  return `automation/ask-issue-${issueNumber}-${sanitizeBranchFragment(runId)}`;
}

async function githubRequest(repository, path, token, { method = "GET", body = null, allowFailure = false } = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ask-autonomous-development",
    },
    body: body === null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok && !allowFailure) throw new Error(`GitHub API ${response.status} for ${method} ${path}: ${text.slice(0, 800)}`);
  if (!response.ok) return { ok: false, status: response.status, body: text };
  return text.length === 0 ? { ok: true, status: response.status } : JSON.parse(text);
}

function statusCommentAuthorAllowed(repository, login) {
  const owner = repository.split("/")[0];
  return login === "github-actions[bot]" || login === owner || (typeof login === "string" && login.endsWith("[bot]"));
}

async function upsertStatusComment(repository, issueNumber, token, content) {
  if (!issueNumber) return;
  const comments = await githubRequest(repository, `/issues/${issueNumber}/comments?per_page=100`, token);
  const existing = comments.find((comment) => statusCommentAuthorAllowed(repository, comment.user?.login) && (comment.body ?? "").includes(STATUS_MARKER));
  const body = `${STATUS_MARKER}\n${content}`;
  if (existing) await githubRequest(repository, `/issues/comments/${existing.id}`, token, { method: "PATCH", body: { body } });
  else await githubRequest(repository, `/issues/${issueNumber}/comments`, token, { method: "POST", body: { body } });
}

function formatStatus({ context, result, guard, branch, commitSha, pullUrl, validationDispatch }) {
  const lines = [
    "## ASK autonomous development status",
    "",
    `- Run: \`${process.env.GITHUB_RUN_ID ?? "local"}\``,
    `- Mode: \`${context.mode}\``,
    `- Action: \`${result.action}\``,
    `- Target commit: \`${context.target_commit_sha}\``,
    `- Guard: \`${guard.guard_digest}\``,
    `- Summary: ${result.summary}`,
  ];
  if (branch) lines.push(`- Branch: \`${branch}\``);
  if (commitSha) lines.push(`- Commit: \`${commitSha}\``);
  if (pullUrl) lines.push(`- Pull request: ${pullUrl}`);
  if (guard.changed_files.length > 0) lines.push(`- Changed files: ${guard.changed_files.length}; changed lines: ${guard.changed_lines}`);
  if (result.review_verdict !== "not_applicable") lines.push(`- Review verdict: \`${result.review_verdict}\``);
  if (validationDispatch) lines.push(`- Validation follow-up: \`${validationDispatch}\``);
  if (result.tests_run.length > 0) lines.push("", "### Validation reported by Codex", ...result.tests_run.map((test) => `- ${test}`));
  if (result.risks.length > 0) lines.push("", "### Residual risks", ...result.risks.map((risk) => `- ${risk}`));
  if (result.review_comment) lines.push("", "### Review", result.review_comment);
  if (result.issue_comment) lines.push("", "### Issue update", result.issue_comment);
  lines.push("", "Automation never merges pull requests, closes issues, runs measured benchmarks, or performs release/deployment actions.");
  return lines.join("\n");
}

export function formatStaleReviewStatus(context, observedSha) {
  return [
    "## ASK autonomous development stale review",
    "",
    "The selected PR moved after context capture. No review verdict, patch, or branch update was published.",
    `- Reviewed HEAD: \`${context.target_commit_sha}\``,
    `- Current HEAD: \`${observedSha}\``,
    `- Run: \`${process.env.GITHUB_RUN_ID ?? "local"}\``,
  ].join("\n");
}

function configureGit(repositoryPath) {
  run("git", ["config", "user.name", "ask-automation[bot]"], { cwd: repositoryPath });
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { cwd: repositoryPath });
}

function currentSha(repositoryPath, ref) {
  return run("git", ["rev-parse", ref], { cwd: repositoryPath }).stdout.trim();
}

export function expectedTargetSha(context) {
  return context.mode === "advance_issue" ? context.base_main_sha : context.target_commit_sha;
}

export function targetDrift(context, observedSha) {
  const expectedSha = expectedTargetSha(context);
  if (observedSha === expectedSha) return null;
  return {
    kind: context.mode === "advance_issue" ? "stale_base" : (context.target_pr_number ? "stale_pr_head" : "stale_target"),
    expected_sha: expectedSha,
    observed_sha: observedSha,
  };
}

function fetchRemoteTargetSha(repositoryPath, context) {
  const branch = context.mode === "advance_issue" ? "main" : context.target_branch;
  run("git", ["fetch", "--no-tags", "origin", `refs/heads/${branch}`], { cwd: repositoryPath });
  return currentSha(repositoryPath, "FETCH_HEAD");
}

function assertNoTargetDrift(context, observedSha) {
  const drift = targetDrift(context, observedSha);
  if (drift) throw new Error(`${drift.kind}: target moved from ${drift.expected_sha} to ${drift.observed_sha}; refusing publication`);
}

function prepareBranch(repositoryPath, context, runId) {
  const branch = context.mode === "advance_issue"
    ? branchNameForIssue(context.target_issue_number, runId)
    : context.target_branch;
  run("git", ["checkout", "-B", branch, context.target_commit_sha], { cwd: repositoryPath });
  return branch;
}

function applyPatch(repositoryPath, patchPath) {
  if (readFileSync(patchPath).length === 0) return;
  run("git", ["apply", "--binary", patchPath], { cwd: repositoryPath });
}

function commitPatch(repositoryPath, result, guard) {
  run("git", ["add", "--all", "--", "."], { cwd: repositoryPath });
  const staged = run("git", ["diff", "--cached", "--name-only"], { cwd: repositoryPath }).stdout.split(/\r?\n/u).filter(Boolean).sort();
  const expected = [...guard.changed_files].sort();
  if (JSON.stringify(staged) !== JSON.stringify(expected)) throw new Error("published staged file set does not match the recomputed final guard");
  const commitTitle = (result.pr_title ?? result.summary).slice(0, 72);
  run("git", ["commit", "-m", commitTitle], { cwd: repositoryPath });
  return currentSha(repositoryPath, "HEAD");
}

async function createDraftPull(repository, branch, context, result, token) {
  const issueLine = context.target_issue_number ? `Progresses #${context.target_issue_number}\n\n` : "";
  const body = `${issueLine}<!-- ask-autonomous-development -->\n${result.pr_body}\n\n## Automation boundary\n\n- Draft only; no automatic merge.\n- No issue close, measured benchmark, release, deployment, or external action.\n- The GitHub token was not available to Codex or repository validation; publication occurred in this separate bounded job.\n`;
  return githubRequest(repository, "/pulls", token, {
    method: "POST",
    body: { title: result.pr_title, head: branch, base: "main", body, draft: true, maintainer_can_modify: true },
  });
}

async function dispatchValidation(repository, branch, token) {
  const response = await githubRequest(repository, "/actions/workflows/validate.yml/dispatches", token, {
    method: "POST",
    body: { ref: branch },
    allowFailure: true,
  });
  return response.ok === false ? `not dispatched (${response.status})` : "dispatched";
}

export async function publishAutomationRun({ repositoryPath, rawDirectory, validationPath, schemaPath, repository, token, runId, runAttempt, controlSha, workflowSha, validationStatus, dedicatedToken = false }) {
  if (validationStatus !== "success") throw new Error("GitHub validation job status is not success");
  const raw = verifyRawArtifact({
    directory: rawDirectory,
    schemaPath,
    expected: { runId, runAttempt, controlSha, workflowSha },
  });
  const validation = JSON.parse(readFileSync(validationPath, "utf8"));
  verifyValidationRecord({ record: validation, raw, runId, runAttempt });
  if (validation.validation_status !== validationStatus) throw new Error("validation record status does not match GitHub job status");

  const { context, result } = raw;
  const initialRemoteSha = fetchRemoteTargetSha(repositoryPath, context);
  const initialDrift = targetDrift(context, initialRemoteSha);
  if (initialDrift && result.action === "review_only" && context.target_pr_number) {
    await upsertStatusComment(repository, context.target_pr_number, token, formatStaleReviewStatus(context, initialRemoteSha));
    return { stale: true, branch: null, commitSha: null, pullNumber: context.target_pr_number, pullUrl: context.pull_request?.url ?? null, validationDispatch: null };
  }
  assertNoTargetDrift(context, initialRemoteSha);

  let branch = null;
  let commitSha = null;
  let pullNumber = context.target_pr_number;
  let pullUrl = context.pull_request?.url ?? null;
  let validationDispatch = null;
  const hasChanges = ["create_pr", "update_pr"].includes(result.action);

  if (hasChanges) branch = prepareBranch(repositoryPath, context, runId);
  applyPatch(repositoryPath, raw.paths.patch);
  const change = validateAutomationRun({ repository: repositoryPath, context, result, expectedPatch: raw.patch });
  const guard = buildFinalGuard({ raw, validation, change });
  const commitMessage = result.pr_title ?? result.summary;
  assertNoAutomationSecrets({ patch: raw.patch, result, branch, commitMessage });

  const finalRemoteSha = fetchRemoteTargetSha(repositoryPath, context);
  if (result.action === "review_only") {
    const finalDrift = targetDrift(context, finalRemoteSha);
    if (finalDrift) {
      await upsertStatusComment(repository, context.target_pr_number, token, formatStaleReviewStatus(context, finalRemoteSha));
      return { stale: true, branch: null, commitSha: null, pullNumber, pullUrl, validationDispatch: null };
    }
  } else {
    assertNoTargetDrift(context, finalRemoteSha);
  }

  if (hasChanges) {
    configureGit(repositoryPath);
    commitSha = commitPatch(repositoryPath, result, guard);
    assertNoTargetDrift(context, fetchRemoteTargetSha(repositoryPath, context));
    run("git", ["push", "--set-upstream", "origin", `HEAD:${branch}`], { cwd: repositoryPath });
    if (result.action === "create_pr") {
      const pull = await createDraftPull(repository, branch, context, result, token);
      pullNumber = pull.number;
      pullUrl = pull.html_url;
      validationDispatch = dedicatedToken ? "ordinary pull-request CI expected from dedicated publication token" : await dispatchValidation(repository, branch, token);
    } else {
      validationDispatch = dedicatedToken
        ? "ordinary pull-request CI expected from dedicated publication token"
        : "guarded validation completed; GITHUB_TOKEN updates may not trigger pull-request CI";
    }
  }

  const status = formatStatus({ context, result, guard, branch, commitSha, pullUrl, validationDispatch });
  if (pullNumber) await upsertStatusComment(repository, pullNumber, token, status);
  if (context.target_issue_number && context.target_issue_number !== pullNumber) await upsertStatusComment(repository, context.target_issue_number, token, status);
  return { stale: false, branch, commitSha, pullNumber, pullUrl, validationDispatch, guard };
}

export async function publishFailureStatus({ context, result, repository, token, runId, controlSha, workflowSha }) {
  assertContextIdentity(context, { generated_for_run: runId, control_sha: controlSha, workflow_sha: workflowSha });
  assertNoAutomationSecrets({ patch: Buffer.alloc(0), result });
  const content = [
    "## ASK autonomous development stopped",
    "",
    `- Run: \`${runId}\``,
    `- Target commit: \`${context.target_commit_sha}\``,
    `- Summary: ${result.summary}`,
    `- Rationale: ${result.rationale}`,
    "- No patch, branch update, PR creation, merge, or Issue close occurred.",
  ].join("\n");
  if (context.target_pr_number) await upsertStatusComment(repository, context.target_pr_number, token, content);
  if (context.target_issue_number && context.target_issue_number !== context.target_pr_number) await upsertStatusComment(repository, context.target_issue_number, token, content);
}

function parseArgs(argv) {
  const args = { mode: argv.shift(), repositoryPath: null, rawDirectory: null, validation: null, schema: null, context: null, result: null };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--repository-path") args.repositoryPath = resolve(argv.shift());
    else if (flag === "--raw-directory") args.rawDirectory = resolve(argv.shift());
    else if (flag === "--validation") args.validation = resolve(argv.shift());
    else if (flag === "--schema") args.schema = resolve(argv.shift());
    else if (flag === "--context") args.context = resolve(argv.shift());
    else if (flag === "--result") args.result = resolve(argv.shift());
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repository = process.env.GITHUB_REPOSITORY;
    const token = process.env.ASK_AUTOMATION_TOKEN ?? process.env.GITHUB_TOKEN;
    const runId = process.env.GITHUB_RUN_ID;
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
    const controlSha = process.env.ASK_CONTROL_SHA;
    const workflowSha = process.env.ASK_WORKFLOW_SHA;
    const validationStatus = process.env.ASK_VALIDATION_STATUS;
    const dedicatedToken = process.env.ASK_AUTOMATION_USES_DEDICATED_TOKEN === "true";
    if (!repository || !token || !runId || !controlSha || !workflowSha) throw new Error("repository, token, run, control SHA, and workflow SHA are required");
    if (args.mode === "publish") {
      if (!args.repositoryPath || !args.rawDirectory || !args.validation || !args.schema || !runAttempt) throw new Error("publish arguments are incomplete");
      const published = await publishAutomationRun({ repositoryPath: args.repositoryPath, rawDirectory: args.rawDirectory, validationPath: args.validation, schemaPath: args.schema, repository, token, runId, runAttempt, controlSha, workflowSha, validationStatus, dedicatedToken });
      console.log(`ASK automation publication complete: pr=${published.pullNumber ?? "none"}, branch=${published.branch ?? "none"}, stale=${published.stale}`);
    } else if (args.mode === "failure") {
      if (!args.context || !args.result) throw new Error("failure arguments are incomplete");
      await publishFailureStatus({ context: JSON.parse(readFileSync(args.context, "utf8")), result: JSON.parse(readFileSync(args.result, "utf8")), repository, token, runId, controlSha, workflowSha });
      console.log("ASK automation failure status published");
    } else {
      throw new Error("mode must be publish or failure");
    }
  } catch (error) {
    console.error(`ASK automation publication failed: ${error.message}`);
    process.exitCode = 1;
  }
}
