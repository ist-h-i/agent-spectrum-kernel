#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  assertContextIdentity,
  buildFinalGuard,
  computeContextDigest,
  digestObject,
  validateAutomationRun,
  verifyRawArtifact,
} from "./ask-autonomous-guard.mjs";
import { verifyValidationAttestation } from "./ask-autonomous-attest.mjs";
import { loadValidationPlan } from "./ask-autonomous-validate-execute.mjs";
import { assertNoAutomationSecrets } from "./ask-autonomous-secret-scan.mjs";

const STATUS_MARKER = "<!-- ask-autonomous-development-status -->";
const LEASE_MARKER = "<!-- ask-autonomous-development-lease -->";
const AUTOMATION_MARKER = "<!-- ask-autonomous-development -->";
const LEASE_DURATION_MS = 15 * 60 * 1_000;

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

export function linkedIssueNumbers(body) {
  return [...String(body ?? "").matchAll(/\b(?:progresses|closes|fixes|addresses)\s+#(\d+)\b/giu)].map((match) => Number(match[1]));
}

export function evaluateIssuePublicationState({ context, repository, currentRepository = repository, baseBranch = "main", issue, pulls = [], branchExists = false, mainSha, activeLease = null, runId, runAttempt }) {
  const issueNumber = context.target_issue_number;
  const linkedPull = pulls.find((pull) => (
    pull?.state === "open"
    && (linkedIssueNumbers(pull.body).includes(issueNumber)
      || ((pull.body ?? "").includes(AUTOMATION_MARKER) && (pull.head?.ref ?? "").startsWith(`automation/ask-issue-${issueNumber}-`)))
  ));
  let reason = null;
  if (context.mode !== "advance_issue") reason = "not_issue_advancement";
  else if (context.repository !== repository || currentRepository !== repository || context.target_branch !== "main" || baseBranch !== "main") reason = "repository_or_base_changed";
  else if (["completed", "not_planned"].includes(issue?.state_reason)) reason = `issue_${issue.state_reason}`;
  else if (issue?.state !== "open") reason = "issue_not_open";
  else if (linkedPull) reason = (linkedPull.body ?? "").includes(AUTOMATION_MARKER) ? "automation_pr_exists" : "linked_open_pr_exists";
  else if (branchExists) reason = "same_run_branch_exists";
  else if (mainSha !== context.base_main_sha) reason = "main_sha_changed";
  else if (activeLease && (Number(activeLease.issue_number) !== Number(issueNumber) || activeLease.target_sha !== context.target_commit_sha)) reason = "active_lease_binding_mismatch";
  else if (activeLease && !(String(activeLease.run_id) === String(runId) && String(activeLease.run_attempt) === String(runAttempt))) reason = "active_lease_exists";
  const evidence = {
    issue_number: issueNumber,
    recorded_target_sha: context.target_commit_sha,
    current_issue_state: issue?.state ?? "missing",
    current_issue_state_reason: issue?.state_reason ?? null,
    existing_pr_number: linkedPull?.number ?? null,
    branch_exists: Boolean(branchExists),
    current_main_sha: mainSha ?? null,
    reason,
  };
  evidence.revalidation_digest = digestObject(evidence);
  return {
    can_publish: reason === null,
    allowed_publication_actions: reason === null ? ["push", "create_draft_pr", "trusted_status"] : ["trusted_status"],
    ...evidence,
  };
}

export function buildIssueLease({ issueNumber, runId, runAttempt, targetSha, owner, acquiredAt, expiresAt }) {
  const lease = {
    schema_version: "1.0.0",
    issue_number: issueNumber,
    run_id: String(runId),
    run_attempt: String(runAttempt),
    target_sha: targetSha,
    lease_owner: owner,
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  };
  lease.lease_digest = digestObject(lease);
  return lease;
}

export function parseIssueLease(comment) {
  const body = comment?.body ?? "";
  if (!body.startsWith(`${LEASE_MARKER}\n`)) return null;
  try {
    const lease = JSON.parse(body.slice(LEASE_MARKER.length));
    if (lease.lease_digest !== digestObject(lease, "lease_digest")) return null;
    return { ...lease, comment_id: comment.id };
  } catch {
    return null;
  }
}

export function selectActiveLease(comments, now = new Date()) {
  return comments
    .map(parseIssueLease)
    .filter((lease) => lease && Date.parse(lease.expires_at) > now.getTime())
    .sort((left, right) => left.acquired_at.localeCompare(right.acquired_at) || Number(left.comment_id) - Number(right.comment_id))[0] ?? null;
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

function formatStaleIssueStatus(decision, runId) {
  return [
    "## ASK autonomous development stale target",
    "",
    "Publication stopped after a trusted GitHub state revalidation. No patch push, branch creation, Draft PR creation, generated update, merge, or Issue close occurred.",
    `- Run: \`${runId}\``,
    `- Selected Issue: \`#${decision.issue_number}\``,
    `- Recorded target: \`${decision.recorded_target_sha}\``,
    `- Current Issue state: \`${decision.current_issue_state}${decision.current_issue_state_reason ? `/${decision.current_issue_state_reason}` : ""}\``,
    `- Existing pull request: ${decision.existing_pr_number ? `#${decision.existing_pr_number}` : "none"}`,
    `- Stop reason: \`${decision.reason}\``,
  ].join("\n");
}

async function fetchIssuePublicationSnapshot(repository, context, token, runId, runAttempt, now = new Date()) {
  const branch = branchNameForIssue(context.target_issue_number, runId);
  const [repositoryMetadata, issue, pulls, mainRef, branchRef, comments] = await Promise.all([
    githubRequest(repository, "", token),
    githubRequest(repository, `/issues/${context.target_issue_number}`, token),
    githubRequest(repository, "/pulls?state=open&per_page=100", token),
    githubRequest(repository, "/git/ref/heads/main", token),
    githubRequest(repository, `/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`, token, { allowFailure: true }),
    githubRequest(repository, `/issues/${context.target_issue_number}/comments?per_page=100`, token),
  ]);
  const activeLease = selectActiveLease(comments, now);
  const decision = evaluateIssuePublicationState({
    context,
    repository,
    currentRepository: repositoryMetadata.full_name,
    baseBranch: repositoryMetadata.default_branch,
    issue,
    pulls,
    branchExists: branchRef.ok !== false,
    mainSha: mainRef.object?.sha,
    activeLease,
    runId,
    runAttempt,
  });
  return { decision, comments, activeLease, branch };
}

async function acquireIssueLease({ repository, context, token, runId, runAttempt }) {
  const now = new Date();
  const snapshot = await fetchIssuePublicationSnapshot(repository, context, token, runId, runAttempt, now);
  if (!snapshot.decision.can_publish) return { ...snapshot, lease: null };
  const acquiredAt = now.toISOString();
  const lease = buildIssueLease({
    issueNumber: context.target_issue_number,
    runId,
    runAttempt,
    targetSha: context.target_commit_sha,
    owner: `${repository}:${context.workflow_sha}`,
    acquiredAt,
    expiresAt: new Date(now.getTime() + LEASE_DURATION_MS).toISOString(),
  });
  await githubRequest(repository, `/issues/${context.target_issue_number}/comments`, token, {
    method: "POST",
    body: { body: `${LEASE_MARKER}\n${JSON.stringify(lease)}` },
  });
  const comments = await githubRequest(repository, `/issues/${context.target_issue_number}/comments?per_page=100`, token);
  const winner = selectActiveLease(comments, now);
  if (!winner || winner.lease_digest !== lease.lease_digest) {
    const decision = evaluateIssuePublicationState({
      context,
      repository,
      issue: { state: "open", state_reason: null },
      pulls: [],
      branchExists: false,
      mainSha: context.base_main_sha,
      activeLease: winner ?? { run_id: "unknown", run_attempt: "unknown" },
      runId,
      runAttempt,
    });
    decision.reason = "active_lease_exists";
    decision.can_publish = false;
    decision.allowed_publication_actions = ["trusted_status"];
    decision.revalidation_digest = digestObject(Object.fromEntries(Object.entries(decision).filter(([key]) => !["can_publish", "allowed_publication_actions", "revalidation_digest"].includes(key))));
    return { decision, comments, activeLease: winner, branch: snapshot.branch, lease: null };
  }
  return { ...snapshot, comments, activeLease: winner, lease };
}

async function finalIssueRevalidation({ repository, context, token, runId, runAttempt, lease }) {
  const snapshot = await fetchIssuePublicationSnapshot(repository, context, token, runId, runAttempt);
  if (snapshot.decision.can_publish && snapshot.activeLease?.lease_digest !== lease?.lease_digest) {
    snapshot.decision.reason = "publication_lease_lost";
    snapshot.decision.can_publish = false;
    snapshot.decision.allowed_publication_actions = ["trusted_status"];
  }
  snapshot.decision.revalidation_digest = digestObject({
    issue_number: snapshot.decision.issue_number,
    recorded_target_sha: snapshot.decision.recorded_target_sha,
    current_issue_state: snapshot.decision.current_issue_state,
    current_issue_state_reason: snapshot.decision.current_issue_state_reason,
    existing_pr_number: snapshot.decision.existing_pr_number,
    branch_exists: snapshot.decision.branch_exists,
    current_main_sha: snapshot.decision.current_main_sha,
    reason: snapshot.decision.reason,
    lease_digest: snapshot.activeLease?.lease_digest ?? null,
  });
  return snapshot;
}

function assertBlockedContext(context, { repository, runId, controlSha, workflowSha }) {
  const allowed = new Set(["schema_version", "repository", "run_id", "control_sha", "workflow_sha", "target_mode", "target_issue_number", "target_pr_number", "target_branch", "target_commit_sha", "base_main_sha", "blocked_reason", "finding_categories", "finding_locations", "context_digest"]);
  if (Object.keys(context).some((key) => !allowed.has(key))) throw new Error("blocked context contains an untrusted field");
  if (context.blocked_reason !== "sensitive_context") throw new Error("blocked context reason mismatch");
  if (context.repository !== repository || String(context.run_id) !== String(runId) || context.control_sha !== controlSha || context.workflow_sha !== workflowSha) throw new Error("blocked context identity mismatch");
  if (context.context_digest !== computeContextDigest(context)) throw new Error("blocked context digest drift detected");
  if (!Array.isArray(context.finding_categories) || !Array.isArray(context.finding_locations)) throw new Error("blocked context findings are invalid");
  for (const location of context.finding_locations) {
    const keys = Object.keys(location).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["byte_range", "category", "field", "id", "line"])) throw new Error("blocked context location contains untrusted detail");
  }
}

export async function publishSensitiveContextStatus({ context, repository, token, runId, controlSha, workflowSha }) {
  assertBlockedContext(context, { repository, runId, controlSha, workflowSha });
  const content = [
    "## ASK autonomous development blocked before generation",
    "",
    `- Run: \`${runId}\``,
    `- Target commit: \`${context.target_commit_sha}\``,
    "- Reason: `sensitive_context`",
    `- Finding categories: ${context.finding_categories.map((category) => `\`${category}\``).join(", ")}`,
    `- Finding locations: ${context.finding_locations.length}`,
    "- Codex was not started. No full context or prompt artifact, patch, branch, or pull request was created.",
  ].join("\n");
  if (context.target_pr_number) await upsertStatusComment(repository, context.target_pr_number, token, content);
  if (context.target_issue_number && context.target_issue_number !== context.target_pr_number) await upsertStatusComment(repository, context.target_issue_number, token, content);
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

export async function publishAutomationRun({ repositoryPath, rawDirectory, attestationPath, planPath, schemaPath, repository, token, runId, runAttempt, controlSha, workflowSha, validationStatus, dedicatedToken = false }) {
  if (validationStatus !== "success") throw new Error("GitHub validate_execute job status is not success");
  const raw = verifyRawArtifact({
    directory: rawDirectory,
    schemaPath,
    expected: { runId, runAttempt, controlSha, workflowSha },
  });
  const loadedPlan = loadValidationPlan(planPath);
  const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
  verifyValidationAttestation({ attestation, raw, plan: loadedPlan.plan, planDigest: loadedPlan.digest, runId, runAttempt, validationJobResult: validationStatus });

  const { context, result } = raw;
  const initialRemoteSha = fetchRemoteTargetSha(repositoryPath, context);
  const initialDrift = targetDrift(context, initialRemoteSha);
  if (initialDrift && result.action === "review_only" && context.target_pr_number) {
    await upsertStatusComment(repository, context.target_pr_number, token, formatStaleReviewStatus(context, initialRemoteSha));
    return { stale: true, branch: null, commitSha: null, pullNumber: context.target_pr_number, pullUrl: context.pull_request?.url ?? null, validationDispatch: null };
  }
  if (!(context.mode === "advance_issue" && result.action === "create_pr")) assertNoTargetDrift(context, initialRemoteSha);

  let branch = null;
  let commitSha = null;
  let pullNumber = context.target_pr_number;
  let pullUrl = context.pull_request?.url ?? null;
  let validationDispatch = null;
  const hasChanges = ["create_pr", "update_pr"].includes(result.action);
  let issueLease = null;
  let publicationRevalidation = null;

  if (context.mode === "advance_issue" && result.action === "create_pr") {
    const acquired = await acquireIssueLease({ repository, context, token, runId, runAttempt });
    if (!acquired.decision.can_publish) {
      await upsertStatusComment(repository, context.target_issue_number, token, formatStaleIssueStatus(acquired.decision, runId));
      return { stale: true, branch: null, commitSha: null, pullNumber: acquired.decision.existing_pr_number, pullUrl: null, validationDispatch: null };
    }
    issueLease = acquired.lease;
    publicationRevalidation = acquired.decision;
  }

  if (hasChanges) branch = prepareBranch(repositoryPath, context, runId);
  applyPatch(repositoryPath, raw.paths.patch);
  const change = validateAutomationRun({ repository: repositoryPath, context, result, expectedPatch: raw.patch });
  const commitMessage = result.pr_title ?? result.summary;
  assertNoAutomationSecrets({ patch: raw.patch, result, branch, commitMessage });

  const finalRemoteSha = fetchRemoteTargetSha(repositoryPath, context);
  if (result.action === "review_only") {
    const finalDrift = targetDrift(context, finalRemoteSha);
    if (finalDrift) {
      await upsertStatusComment(repository, context.target_pr_number, token, formatStaleReviewStatus(context, finalRemoteSha));
      return { stale: true, branch: null, commitSha: null, pullNumber, pullUrl, validationDispatch: null };
    }
  } else if (context.mode !== "advance_issue") {
    assertNoTargetDrift(context, finalRemoteSha);
  }

  if (hasChanges) {
    configureGit(repositoryPath);
    commitSha = commitPatch(repositoryPath, result, { changed_files: change.changed_files });
    if (context.mode === "advance_issue") {
      const revalidated = await finalIssueRevalidation({ repository, context, token, runId, runAttempt, lease: issueLease });
      if (!revalidated.decision.can_publish) {
        await upsertStatusComment(repository, context.target_issue_number, token, formatStaleIssueStatus(revalidated.decision, runId));
        return { stale: true, branch: null, commitSha: null, pullNumber: revalidated.decision.existing_pr_number, pullUrl: null, validationDispatch: null };
      }
      publicationRevalidation = revalidated.decision;
    } else {
      assertNoTargetDrift(context, fetchRemoteTargetSha(repositoryPath, context));
    }
    const guard = buildFinalGuard({ raw, attestation, change, publicationRevalidation });
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
    const status = formatStatus({ context, result, guard, branch, commitSha, pullUrl, validationDispatch });
    if (pullNumber) await upsertStatusComment(repository, pullNumber, token, status);
    if (context.target_issue_number && context.target_issue_number !== pullNumber) await upsertStatusComment(repository, context.target_issue_number, token, status);
    return { stale: false, branch, commitSha, pullNumber, pullUrl, validationDispatch, guard };
  }

  const guard = buildFinalGuard({ raw, attestation, change, publicationRevalidation });
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
  const args = { mode: argv.shift(), repositoryPath: null, rawDirectory: null, attestation: null, plan: null, schema: null, context: null, result: null };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--repository-path") args.repositoryPath = resolve(argv.shift());
    else if (flag === "--raw-directory") args.rawDirectory = resolve(argv.shift());
    else if (flag === "--attestation") args.attestation = resolve(argv.shift());
    else if (flag === "--plan") args.plan = resolve(argv.shift());
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
      if (!args.repositoryPath || !args.rawDirectory || !args.attestation || !args.plan || !args.schema || !runAttempt) throw new Error("publish arguments are incomplete");
      const published = await publishAutomationRun({ repositoryPath: args.repositoryPath, rawDirectory: args.rawDirectory, attestationPath: args.attestation, planPath: args.plan, schemaPath: args.schema, repository, token, runId, runAttempt, controlSha, workflowSha, validationStatus, dedicatedToken });
      console.log(`ASK automation publication complete: pr=${published.pullNumber ?? "none"}, branch=${published.branch ?? "none"}, stale=${published.stale}`);
    } else if (args.mode === "failure") {
      if (!args.context || !args.result) throw new Error("failure arguments are incomplete");
      await publishFailureStatus({ context: JSON.parse(readFileSync(args.context, "utf8")), result: JSON.parse(readFileSync(args.result, "utf8")), repository, token, runId, controlSha, workflowSha });
      console.log("ASK automation failure status published");
    } else if (args.mode === "sensitive") {
      if (!args.context) throw new Error("sensitive status context is required");
      await publishSensitiveContextStatus({ context: JSON.parse(readFileSync(args.context, "utf8")), repository, token, runId, controlSha, workflowSha });
      console.log("ASK automation sensitive-context status published");
    } else {
      throw new Error("mode must be publish, failure, or sensitive");
    }
  } catch (error) {
    console.error(`ASK automation publication failed: ${error.message}`);
    process.exitCode = 1;
  }
}
