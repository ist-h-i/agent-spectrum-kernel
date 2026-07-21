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
const PENDING_LEASE_MARKER = "<!-- ask-autonomous-development-lease-pending -->";
const AUTOMATION_MARKER = "<!-- ask-autonomous-development -->";
const LEASE_DURATION_MS = 15 * 60 * 1_000;
const LEASE_CLOCK_SKEW_MS = 60 * 1_000;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const NORMALIZED_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const AUTHOR_ASSOCIATIONS = new Set(["COLLABORATOR", "CONTRIBUTOR", "FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR", "MANNEQUIN", "MEMBER", "NONE", "OWNER"]);
const LEASE_FIELDS = [
  "schema_version", "comment_id", "issue_number", "repository", "run_id", "run_attempt", "target_sha",
  "control_sha", "workflow_sha", "lease_owner", "acquired_at", "expires_at", "lease_digest",
].sort();

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

export function leaseOwnedByRun(lease, runId, runAttempt) {
  return Boolean(lease && String(lease.run_id) === String(runId) && String(lease.run_attempt) === String(runAttempt));
}

function leaseAuthorityEvidence(activeLease) {
  return {
    active_lease_digest: activeLease?.lease_digest ?? null,
    active_lease_comment_id: activeLease?.comment_id ?? null,
    active_lease_author_login: activeLease?.comment_author_login ?? null,
    active_lease_author_association: activeLease?.comment_author_association ?? null,
    active_lease_comment_created_at: activeLease?.comment_created_at ?? null,
    active_lease_authority_class: activeLease?.authority_class ?? null,
    active_lease_expires_at: activeLease?.expires_at ?? null,
    active_lease_issue_number: activeLease?.issue_number ?? null,
    active_lease_target_sha: activeLease?.target_sha ?? null,
  };
}

function refreshPublicationDecision(decision) {
  const evidence = Object.fromEntries(Object.entries(decision).filter(([key]) => !["can_publish", "allowed_publication_actions", "revalidation_digest"].includes(key)));
  decision.revalidation_digest = digestObject(evidence);
  return decision;
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
  else if (activeLease && !leaseOwnedByRun(activeLease, runId, runAttempt)) reason = "active_lease_exists";
  const evidence = {
    issue_number: issueNumber,
    recorded_target_sha: context.target_commit_sha,
    current_issue_state: issue?.state ?? "missing",
    current_issue_state_reason: issue?.state_reason ?? null,
    existing_pr_number: linkedPull?.number ?? null,
    branch_exists: Boolean(branchExists),
    current_main_sha: mainSha ?? null,
    ...leaseAuthorityEvidence(activeLease),
    reason,
  };
  evidence.revalidation_digest = digestObject(evidence);
  return {
    can_publish: reason === null,
    allowed_publication_actions: reason === null ? ["push", "create_draft_pr", "trusted_status"] : ["trusted_status"],
    ...evidence,
  };
}

export function buildIssueLease({ commentId, issueNumber, repository, runId, runAttempt, targetSha, controlSha, workflowSha, owner, acquiredAt, expiresAt }) {
  const lease = {
    schema_version: "1.0.0",
    comment_id: commentId,
    issue_number: issueNumber,
    repository,
    run_id: String(runId),
    run_attempt: String(runAttempt),
    target_sha: targetSha,
    control_sha: controlSha,
    workflow_sha: workflowSha,
    lease_owner: owner,
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  };
  lease.lease_digest = digestObject(lease);
  return lease;
}

function validTimestamp(value) {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace(".000Z", "Z");
}

export function commentAuthority(comment, { repository, publicationLogin = null }) {
  const login = comment?.user?.login;
  const association = comment?.author_association;
  if (typeof login !== "string" || !AUTHOR_ASSOCIATIONS.has(association)) return null;
  const owner = repository.split("/")[0];
  if (login === owner && association === "OWNER") return "repository_owner";
  if (login === "github-actions[bot]") return "github_actions";
  if (publicationLogin && login === publicationLogin) return "authenticated_publication";
  return null;
}

export function parseIssueLease(comment, { repository, issueNumber, targetSha, controlSha, workflowSha, publicationLogin = null, now = new Date() }) {
  const body = comment?.body ?? "";
  if (!body.startsWith(`${LEASE_MARKER}\n`)) return null;
  try {
    const lease = JSON.parse(body.slice(LEASE_MARKER.length));
    if (!lease || Array.isArray(lease) || typeof lease !== "object") return null;
    if (JSON.stringify(Object.keys(lease).sort()) !== JSON.stringify(LEASE_FIELDS)) return null;
    const authorityClass = commentAuthority(comment, { repository, publicationLogin });
    if (!authorityClass) return null;
    if (lease.schema_version !== "1.0.0") return null;
    if (!Number.isSafeInteger(lease.comment_id) || lease.comment_id <= 0 || lease.comment_id !== comment.id) return null;
    if (!Number.isSafeInteger(lease.issue_number) || lease.issue_number <= 0 || lease.issue_number !== issueNumber) return null;
    if (typeof lease.repository !== "string" || !REPOSITORY_PATTERN.test(lease.repository) || lease.repository !== repository) return null;
    if (!NORMALIZED_ID_PATTERN.test(lease.run_id) || !NORMALIZED_ID_PATTERN.test(lease.run_attempt)) return null;
    if (!SHA_PATTERN.test(lease.target_sha) || lease.target_sha !== targetSha) return null;
    if (!SHA_PATTERN.test(lease.control_sha) || lease.control_sha !== controlSha) return null;
    if (!SHA_PATTERN.test(lease.workflow_sha) || lease.workflow_sha !== workflowSha || lease.control_sha !== lease.workflow_sha) return null;
    if (lease.lease_owner !== comment.user.login) return null;
    if (!validTimestamp(lease.acquired_at) || !validTimestamp(lease.expires_at) || !validTimestamp(comment.created_at)) return null;
    const acquiredAt = Date.parse(lease.acquired_at);
    const expiresAt = Date.parse(lease.expires_at);
    const commentCreatedAt = Date.parse(comment.created_at);
    const duration = expiresAt - acquiredAt;
    if (duration <= 0 || duration > LEASE_DURATION_MS) return null;
    if (Math.abs(commentCreatedAt - acquiredAt) > LEASE_CLOCK_SKEW_MS) return null;
    if (acquiredAt > now.getTime() + LEASE_CLOCK_SKEW_MS) return null;
    if (expiresAt > commentCreatedAt + LEASE_DURATION_MS) return null;
    if (!DIGEST_PATTERN.test(lease.lease_digest)) return null;
    if (lease.lease_digest !== digestObject(lease, "lease_digest")) return null;
    return {
      ...lease,
      comment_author_login: comment.user.login,
      comment_author_association: comment.author_association,
      comment_created_at: comment.created_at,
      authority_class: authorityClass,
    };
  } catch {
    return null;
  }
}

export function selectActiveLease(comments, bindings, now = new Date()) {
  return comments
    .map((comment) => parseIssueLease(comment, { ...bindings, now }))
    .filter((lease) => lease && Date.parse(lease.expires_at) > now.getTime())
    .sort((left, right) => left.acquired_at.localeCompare(right.acquired_at) || Number(left.comment_id) - Number(right.comment_id))[0] ?? null;
}

async function githubApiRequest(path, token, { method = "GET", body = null, allowFailure = false } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
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

async function githubRequest(repository, path, token, options = {}) {
  return githubApiRequest(`/repos/${repository}${path}`, token, options);
}

export async function resolvePublicationIdentity(token) {
  const user = await githubApiRequest("/user", token, { allowFailure: true });
  if (user.ok !== false && typeof user.login === "string" && user.login.length > 0) return { login: user.login, source: "authenticated_user_api" };
  const installation = await githubApiRequest("/installation", token, { allowFailure: true });
  if (installation.ok !== false && typeof installation.app_slug === "string" && installation.app_slug.length > 0) {
    return { login: `${installation.app_slug}[bot]`, source: "authenticated_installation_api" };
  }
  return null;
}

export function statusCommentAuthorAllowed(repository, comment, publicationLogin = null) {
  return commentAuthority(comment, { repository, publicationLogin }) !== null;
}

async function upsertStatusComment(repository, issueNumber, token, content, publicationLogin = null) {
  if (!issueNumber) return;
  const comments = await githubRequest(repository, `/issues/${issueNumber}/comments?per_page=100`, token);
  const existing = comments.find((comment) => statusCommentAuthorAllowed(repository, comment, publicationLogin) && (comment.body ?? "").includes(STATUS_MARKER));
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

function leaseBindings(context, repository, publicationLogin) {
  return {
    repository,
    issueNumber: context.target_issue_number,
    targetSha: context.target_commit_sha,
    controlSha: context.control_sha,
    workflowSha: context.workflow_sha,
    publicationLogin,
  };
}

function sameVerifiedLease(left, right) {
  const fields = [
    "lease_digest", "comment_id", "comment_author_login", "comment_author_association", "comment_created_at",
    "authority_class", "expires_at", "issue_number", "target_sha",
  ];
  return Boolean(left && right && fields.every((field) => left[field] === right[field]));
}

export function verifySealedLeaseComment({ createdComment, patchedComment, refetchedComment, bindings, now = new Date() }) {
  if (patchedComment?.ok === false) return null;
  if (!Number.isSafeInteger(createdComment?.id) || createdComment.id <= 0 || refetchedComment?.id !== createdComment.id) return null;
  for (const field of ["author_association", "created_at"]) {
    if (createdComment?.[field] !== refetchedComment?.[field]) return null;
  }
  if (createdComment?.user?.login !== refetchedComment?.user?.login) return null;
  return parseIssueLease(refetchedComment, { ...bindings, publicationLogin: bindings.publicationLogin ?? createdComment.user.login, now });
}

async function fetchIssuePublicationSnapshot(repository, context, token, runId, runAttempt, publicationLogin, now = new Date()) {
  const branch = branchNameForIssue(context.target_issue_number, runId);
  const [repositoryMetadata, issue, pulls, mainRef, branchRef, comments] = await Promise.all([
    githubRequest(repository, "", token),
    githubRequest(repository, `/issues/${context.target_issue_number}`, token),
    githubRequest(repository, "/pulls?state=open&per_page=100", token),
    githubRequest(repository, "/git/ref/heads/main", token),
    githubRequest(repository, `/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`, token, { allowFailure: true }),
    githubRequest(repository, `/issues/${context.target_issue_number}/comments?per_page=100`, token),
  ]);
  const activeLease = selectActiveLease(comments, leaseBindings(context, repository, publicationLogin), now);
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

async function acquireIssueLease({ repository, context, token, runId, runAttempt, publicationLogin }) {
  const now = new Date();
  const snapshot = await fetchIssuePublicationSnapshot(repository, context, token, runId, runAttempt, publicationLogin, now);
  if (!snapshot.decision.can_publish) return { ...snapshot, lease: null };
  if (leaseOwnedByRun(snapshot.activeLease, runId, runAttempt)) {
    return { ...snapshot, lease: snapshot.activeLease, publicationLogin };
  }
  const createdComment = await githubRequest(repository, `/issues/${context.target_issue_number}/comments`, token, {
    method: "POST",
    body: { body: `${PENDING_LEASE_MARKER}\nLease authority pending authenticated comment metadata.` },
  });
  if (!Number.isSafeInteger(createdComment?.id) || !validTimestamp(createdComment?.created_at) || typeof createdComment?.user?.login !== "string") {
    throw new Error("lease comment creation did not return authenticated comment metadata");
  }
  const authenticatedPublicationLogin = publicationLogin ?? createdComment.user.login;
  const acquiredAt = createdComment.created_at;
  const lease = buildIssueLease({
    commentId: createdComment.id,
    issueNumber: context.target_issue_number,
    repository,
    runId,
    runAttempt,
    targetSha: context.target_commit_sha,
    controlSha: context.control_sha,
    workflowSha: context.workflow_sha,
    owner: createdComment.user.login,
    acquiredAt,
    expiresAt: new Date(Date.parse(acquiredAt) + LEASE_DURATION_MS).toISOString(),
  });
  const patchedComment = await githubRequest(repository, `/issues/comments/${createdComment.id}`, token, {
    method: "PATCH",
    body: { body: `${LEASE_MARKER}\n${JSON.stringify(lease)}` },
    allowFailure: true,
  });
  const refetchedComment = patchedComment.ok === false
    ? null
    : await githubRequest(repository, `/issues/comments/${createdComment.id}`, token);
  const verificationNow = new Date();
  const verifiedCreatedLease = verifySealedLeaseComment({
    createdComment,
    patchedComment,
    refetchedComment,
    bindings: leaseBindings(context, repository, authenticatedPublicationLogin),
    now: verificationNow,
  });
  if (!verifiedCreatedLease || verifiedCreatedLease.lease_digest !== lease.lease_digest) {
    const patchStatus = patchedComment.ok === false ? ` (PATCH status ${patchedComment.status})` : "";
    throw new Error(`sealed lease comment identity verification failed${patchStatus}`);
  }
  const sealedSnapshot = await fetchIssuePublicationSnapshot(repository, context, token, runId, runAttempt, authenticatedPublicationLogin, verificationNow);
  const winner = sealedSnapshot.activeLease;
  if (!sealedSnapshot.decision.can_publish) {
    return { ...sealedSnapshot, lease: null, publicationLogin: authenticatedPublicationLogin };
  }
  if (leaseOwnedByRun(winner, runId, runAttempt)) {
    return { ...sealedSnapshot, lease: winner, publicationLogin: authenticatedPublicationLogin };
  }
  sealedSnapshot.decision.reason = "publication_lease_not_selected";
  sealedSnapshot.decision.can_publish = false;
  sealedSnapshot.decision.allowed_publication_actions = ["trusted_status"];
  refreshPublicationDecision(sealedSnapshot.decision);
  return { ...sealedSnapshot, lease: null, publicationLogin: authenticatedPublicationLogin };
}

async function finalIssueRevalidation({ repository, context, token, runId, runAttempt, lease, publicationLogin }) {
  const snapshot = await fetchIssuePublicationSnapshot(repository, context, token, runId, runAttempt, publicationLogin);
  if (snapshot.decision.can_publish && !sameVerifiedLease(snapshot.activeLease, lease)) {
    snapshot.decision.reason = "publication_lease_lost";
    snapshot.decision.can_publish = false;
    snapshot.decision.allowed_publication_actions = ["trusted_status"];
  }
  refreshPublicationDecision(snapshot.decision);
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
  const publicationIdentity = await resolvePublicationIdentity(token);
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
  if (context.target_pr_number) await upsertStatusComment(repository, context.target_pr_number, token, content, publicationIdentity?.login);
  if (context.target_issue_number && context.target_issue_number !== context.target_pr_number) await upsertStatusComment(repository, context.target_issue_number, token, content, publicationIdentity?.login);
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
  const publicationIdentity = await resolvePublicationIdentity(token);
  let publicationLogin = publicationIdentity?.login ?? null;
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
    await upsertStatusComment(repository, context.target_pr_number, token, formatStaleReviewStatus(context, initialRemoteSha), publicationLogin);
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
    const acquired = await acquireIssueLease({ repository, context, token, runId, runAttempt, publicationLogin });
    publicationLogin = acquired.publicationLogin ?? publicationLogin;
    if (!acquired.decision.can_publish) {
      await upsertStatusComment(repository, context.target_issue_number, token, formatStaleIssueStatus(acquired.decision, runId), publicationLogin);
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
      await upsertStatusComment(repository, context.target_pr_number, token, formatStaleReviewStatus(context, finalRemoteSha), publicationLogin);
      return { stale: true, branch: null, commitSha: null, pullNumber, pullUrl, validationDispatch: null };
    }
  } else if (context.mode !== "advance_issue") {
    assertNoTargetDrift(context, finalRemoteSha);
  }

  if (hasChanges) {
    configureGit(repositoryPath);
    commitSha = commitPatch(repositoryPath, result, { changed_files: change.changed_files });
    if (context.mode === "advance_issue") {
      const revalidated = await finalIssueRevalidation({ repository, context, token, runId, runAttempt, lease: issueLease, publicationLogin });
      if (!revalidated.decision.can_publish) {
        await upsertStatusComment(repository, context.target_issue_number, token, formatStaleIssueStatus(revalidated.decision, runId), publicationLogin);
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
    if (pullNumber) await upsertStatusComment(repository, pullNumber, token, status, publicationLogin);
    if (context.target_issue_number && context.target_issue_number !== pullNumber) await upsertStatusComment(repository, context.target_issue_number, token, status, publicationLogin);
    return { stale: false, branch, commitSha, pullNumber, pullUrl, validationDispatch, guard };
  }

  const guard = buildFinalGuard({ raw, attestation, change, publicationRevalidation });
  const status = formatStatus({ context, result, guard, branch, commitSha, pullUrl, validationDispatch });
  if (pullNumber) await upsertStatusComment(repository, pullNumber, token, status, publicationLogin);
  if (context.target_issue_number && context.target_issue_number !== pullNumber) await upsertStatusComment(repository, context.target_issue_number, token, status, publicationLogin);
  return { stale: false, branch, commitSha, pullNumber, pullUrl, validationDispatch, guard };
}

export async function publishFailureStatus({ context, result, repository, token, runId, controlSha, workflowSha }) {
  assertContextIdentity(context, { generated_for_run: runId, control_sha: controlSha, workflow_sha: workflowSha });
  assertNoAutomationSecrets({ patch: Buffer.alloc(0), result });
  const publicationIdentity = await resolvePublicationIdentity(token);
  const content = [
    "## ASK autonomous development stopped",
    "",
    `- Run: \`${runId}\``,
    `- Target commit: \`${context.target_commit_sha}\``,
    `- Summary: ${result.summary}`,
    `- Rationale: ${result.rationale}`,
    "- No patch, branch update, PR creation, merge, or Issue close occurred.",
  ].join("\n");
  if (context.target_pr_number) await upsertStatusComment(repository, context.target_pr_number, token, content, publicationIdentity?.login);
  if (context.target_issue_number && context.target_issue_number !== context.target_pr_number) await upsertStatusComment(repository, context.target_issue_number, token, content, publicationIdentity?.login);
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
