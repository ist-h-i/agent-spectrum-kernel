#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const STATUS_MARKER = "<!-- ask-autonomous-development-status -->";

function run(command, args, { cwd, allowFailure = false, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
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
  return login === "github-actions[bot]" || login === owner;
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
    `- Summary: ${result.summary}`,
  ];
  if (branch) lines.push(`- Branch: \`${branch}\``);
  if (commitSha) lines.push(`- Commit: \`${commitSha}\``);
  if (pullUrl) lines.push(`- Pull request: ${pullUrl}`);
  if (guard?.changed_files?.length) lines.push(`- Changed files: ${guard.changed_files.length}; changed lines: ${guard.changed_lines}`);
  if (result.review_verdict !== "not_applicable") lines.push(`- Review verdict: \`${result.review_verdict}\``);
  if (validationDispatch) lines.push(`- Validation follow-up: \`${validationDispatch}\``);
  if (result.tests_run.length > 0) {
    lines.push("", "### Validation reported by Codex", ...result.tests_run.map((test) => `- ${test}`));
  }
  if (result.risks.length > 0) {
    lines.push("", "### Residual risks", ...result.risks.map((risk) => `- ${risk}`));
  }
  if (result.review_comment) lines.push("", "### Review", result.review_comment);
  if (result.issue_comment) lines.push("", "### Issue update", result.issue_comment);
  lines.push("", "Automation never merges pull requests, closes issues, runs measured benchmarks, or performs release/deployment actions.");
  return lines.join("\n");
}

function configureGit(repositoryPath) {
  run("git", ["config", "user.name", "ask-automation[bot]"], { cwd: repositoryPath });
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { cwd: repositoryPath });
}

function currentSha(repositoryPath, ref) {
  const result = run("git", ["rev-parse", ref], { cwd: repositoryPath });
  return result.stdout.trim();
}

function checkoutTarget(repositoryPath, context, runId) {
  run("git", ["fetch", "--no-tags", "origin", "+refs/heads/*:refs/remotes/origin/*"], { cwd: repositoryPath });
  if (context.mode === "maintain_pr") {
    const branch = context.pull_request.head.ref;
    const remoteRef = `origin/${branch}`;
    const remoteSha = currentSha(repositoryPath, remoteRef);
    if (remoteSha !== context.pull_request.head.sha) {
      throw new Error(`selected PR head moved from ${context.pull_request.head.sha} to ${remoteSha}; refusing stale patch publication`);
    }
    run("git", ["checkout", "-B", branch, remoteRef], { cwd: repositoryPath });
    return branch;
  }
  const branch = branchNameForIssue(context.target_issue_number, runId);
  run("git", ["checkout", "-B", branch, "origin/main"], { cwd: repositoryPath });
  return branch;
}

function applyAndCommit(repositoryPath, patchPath, result, guard) {
  run("git", ["apply", "--binary", "--index", patchPath], { cwd: repositoryPath });
  const staged = run("git", ["diff", "--cached", "--name-only"], { cwd: repositoryPath }).stdout.split(/\r?\n/u).filter(Boolean).sort();
  const expected = [...guard.changed_files].sort();
  if (JSON.stringify(staged) !== JSON.stringify(expected)) throw new Error("published staged file set does not match guarded changed files");
  const commitTitle = result.pr_title ?? result.summary;
  run("git", ["commit", "-m", commitTitle.slice(0, 72)], { cwd: repositoryPath });
  return currentSha(repositoryPath, "HEAD");
}

async function createDraftPull(repository, branch, context, result, token) {
  const issueLine = context.target_issue_number ? `Progresses #${context.target_issue_number}\n\n` : "";
  const body = `${issueLine}<!-- ask-autonomous-development -->\n${result.pr_body}\n\n## Automation boundary\n\n- Draft only; no automatic merge.\n- No issue close, measured benchmark, release, deployment, or external action.\n- The GitHub token was not available to Codex; publication occurred in a separate bounded job.\n`;
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

function parseArgs(argv) {
  const args = { repositoryPath: null, context: null, result: null, guard: null, patch: null };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--repository-path") args.repositoryPath = resolve(argv.shift());
    else if (flag === "--context") args.context = resolve(argv.shift());
    else if (flag === "--result") args.result = resolve(argv.shift());
    else if (flag === "--guard") args.guard = resolve(argv.shift());
    else if (flag === "--patch") args.patch = resolve(argv.shift());
    else throw new Error(`Unknown argument: ${flag}`);
  }
  for (const field of ["repositoryPath", "context", "result", "guard", "patch"]) if (!args[field]) throw new Error(`--${field.replace(/[A-Z]/gu, (value) => `-${value.toLowerCase()}`)} is required`);
  return args;
}

export async function publishAutomationRun({ repositoryPath, context, result, guard, patchPath, repository, token, runId }) {
  let branch = null;
  let commitSha = null;
  let pullNumber = context.target_pr_number;
  let pullUrl = context.pull_request?.url ?? null;
  let validationDispatch = null;

  if (["create_pr", "update_pr"].includes(result.action)) {
    configureGit(repositoryPath);
    branch = checkoutTarget(repositoryPath, context, runId);
    commitSha = applyAndCommit(repositoryPath, patchPath, result, guard);
    run("git", ["push", "--set-upstream", "origin", `HEAD:${branch}`], { cwd: repositoryPath });
    if (result.action === "create_pr") {
      const pull = await createDraftPull(repository, branch, context, result, token);
      pullNumber = pull.number;
      pullUrl = pull.html_url;
      validationDispatch = await dispatchValidation(repository, branch, token);
    } else {
      validationDispatch = "guarded validation completed; ordinary PR CI depends on the publication token";
    }
  }

  const status = formatStatus({ context, result, guard, branch, commitSha, pullUrl, validationDispatch });
  if (pullNumber) await upsertStatusComment(repository, pullNumber, token, status);
  if (context.target_issue_number && context.target_issue_number !== pullNumber) await upsertStatusComment(repository, context.target_issue_number, token, status);

  return { branch, commitSha, pullNumber, pullUrl, validationDispatch };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repository = process.env.GITHUB_REPOSITORY;
    const token = process.env.ASK_AUTOMATION_TOKEN ?? process.env.GITHUB_TOKEN;
    const runId = process.env.GITHUB_RUN_ID ?? "local";
    if (!repository) throw new Error("GITHUB_REPOSITORY is required");
    if (!token) throw new Error("ASK_AUTOMATION_TOKEN or GITHUB_TOKEN is required");
    const context = JSON.parse(readFileSync(args.context, "utf8"));
    const result = JSON.parse(readFileSync(args.result, "utf8"));
    const guard = JSON.parse(readFileSync(args.guard, "utf8"));
    const published = await publishAutomationRun({ repositoryPath: args.repositoryPath, context, result, guard, patchPath: args.patch, repository, token, runId });
    console.log(`ASK automation publication complete: action=${result.action}, pr=${published.pullNumber ?? "none"}, branch=${published.branch ?? "none"}`);
  } catch (error) {
    console.error(`ASK automation publication failed: ${error.message}`);
    process.exitCode = 1;
  }
}
