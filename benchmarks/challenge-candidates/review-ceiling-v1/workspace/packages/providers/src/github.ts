import type { PublishDraft, ReviewDiff, ReviewDiffFile, ReviewTarget, ReviewTargetRef } from '@reviewops/core';
import { classifyReviewDiffPaths } from '@reviewops/core';
import type { ListReviewTargetsInput, PostResult, ReviewComment, ReviewProvider, ReviewReply } from './index.js';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText?: string;
  text(): Promise<string>;
}

export interface FetchRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type FetchLike = (url: string, init?: FetchRequestInit) => Promise<FetchResponseLike>;

export interface GitHubReviewProviderOptions {
  repository: string;
  token?: string;
  apiBaseUrl?: string;
  webBaseUrl?: string;
  userAgent?: string;
  fetch?: FetchLike;
  allowWrites?: boolean;
}

export interface CreateGitHubPullRequestTargetRefOptions {
  repository: string;
  pullRequestNumber: number | string;
  url?: string;
}

export interface ReviewPromptInputFromGitHubPullRequest {
  diff: string;
  target: ReviewTargetRef;
  notes: string;
}

export interface CreateSummaryCommentDraftOptions {
  target: ReviewTargetRef;
  body: string;
  createdAt: string;
  title?: string;
}

interface GitHubRepositoryParts {
  owner: string;
  repo: string;
}

interface GitHubPullResponse {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft?: boolean;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  user?: {
    login?: string;
  };
  head?: {
    ref?: string;
  };
  base?: {
    ref?: string;
  };
  merged_at?: string | null;
}

interface GitHubPullFileResponse {
  filename: string;
  previous_filename?: string;
  status: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}

interface GitHubCommentResponse {
  id: number | string;
  body?: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  user?: {
    login?: string;
  };
}

interface GitHubPullReviewResponse {
  id: number | string;
  body?: string | null;
  state?: string;
  html_url?: string;
  submitted_at?: string;
  user?: {
    login?: string;
  };
}

interface GitHubPostCommentResponse {
  id: number | string;
  html_url?: string;
}

const defaultApiBaseUrl = 'https://api.github.com';
const defaultWebBaseUrl = 'https://github.com';
const defaultUserAgent = 'ReviewOps Guard';
const defaultPageSize = 30;
const maxPages = 10;

export class GitHubProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'GitHubProviderError';
  }
}

export function createGitHubReviewProvider(options: GitHubReviewProviderOptions): ReviewProvider {
  return new GitHubReviewProvider(options);
}

export function createGitHubPullRequestTargetRef(options: CreateGitHubPullRequestTargetRefOptions): ReviewTargetRef {
  const pullRequestNumber = Number(options.pullRequestNumber);
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new GitHubProviderError('INVALID_TARGET', `Invalid GitHub pull request number: ${options.pullRequestNumber}`);
  }

  return {
    provider: 'github',
    repository: normalizeRepository(options.repository),
    id: createPullRequestTargetId(pullRequestNumber),
    url: options.url
  };
}

export function createReviewPromptInputFromGitHubPullRequest(
  diff: ReviewDiff,
  comments: ReviewComment[] = []
): ReviewPromptInputFromGitHubPullRequest {
  assertGitHubTarget(diff.target);

  return {
    diff: formatGitHubDiffPatch(diff),
    target: diff.target,
    notes: formatGitHubReviewSummary(diff, comments)
  };
}

export function createSummaryCommentDraft(options: CreateSummaryCommentDraftOptions): PublishDraft {
  assertGitHubTarget(options.target);
  const body = options.body.trim();
  if (body.length === 0) {
    throw new GitHubProviderError('INVALID_DRAFT', 'A summary comment draft body is required.');
  }

  return {
    id: `draft_${options.createdAt.replaceAll(/[^0-9a-z]/giu, '')}_${safeDraftIdPart(options.target.id)}`,
    provider: 'github',
    target: options.target,
    title: options.title ?? `GitHub summary comment for ${options.target.repository}#${parsePullRequestNumber(options.target.id)}`,
    body,
    mode: 'summary-comment',
    requiresConfirmation: true,
    status: 'draft',
    createdAt: options.createdAt
  };
}

class GitHubReviewProvider implements ReviewProvider {
  readonly kind = 'github' as const;

  private readonly repository: string;
  private readonly repositoryParts: GitHubRepositoryParts;
  private readonly token: string | undefined;
  private readonly apiBaseUrl: string;
  private readonly webBaseUrl: string;
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;
  private readonly allowWrites: boolean;

  constructor(options: GitHubReviewProviderOptions) {
    this.repository = normalizeRepository(options.repository);
    this.repositoryParts = parseRepository(this.repository);
    this.token = normalizeOptionalToken(options.token);
    this.apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? defaultApiBaseUrl);
    this.webBaseUrl = trimTrailingSlash(options.webBaseUrl ?? defaultWebBaseUrl);
    this.userAgent = options.userAgent ?? defaultUserAgent;
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.allowWrites = options.allowWrites ?? false;
  }

  async listReviewTargets(input: ListReviewTargetsInput = {}): Promise<ReviewTarget[]> {
    const pulls = await this.requestJson<GitHubPullResponse[]>('/pulls', {
      state: input.state ?? 'open',
      base: input.baseRef,
      head: input.headRef,
      per_page: String(input.limit ?? defaultPageSize)
    });

    return pulls.map((pull) => this.mapPullResponse(pull));
  }

  async getReviewTarget(target: ReviewTargetRef): Promise<ReviewTarget> {
    this.assertTargetRepository(target);
    const pull = await this.requestJson<GitHubPullResponse>(`/pulls/${parsePullRequestNumber(target.id)}`);
    return this.mapPullResponse(pull);
  }

  async getDiff(target: ReviewTargetRef): Promise<ReviewDiff> {
    this.assertTargetRepository(target);
    const files = await this.requestPaginated<GitHubPullFileResponse>(`/pulls/${parsePullRequestNumber(target.id)}/files`);
    const reviewFiles = files.map(mapPullFile);

    return {
      target,
      files: reviewFiles,
      summary: {
        changedFiles: reviewFiles.length,
        additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
        deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
        ...classifyReviewDiffPaths(reviewFiles.map((file) => file.path), 'github-provider')
      },
      rawPatch: formatRawPatch(reviewFiles)
    };
  }

  async getComments(target: ReviewTargetRef): Promise<ReviewComment[]> {
    this.assertTargetRepository(target);
    const pullNumber = parsePullRequestNumber(target.id);
    const [reviewComments, issueComments, pullReviews] = await Promise.all([
      this.requestPaginated<GitHubCommentResponse>(`/pulls/${pullNumber}/comments`),
      this.requestPaginated<GitHubCommentResponse>(`/issues/${pullNumber}/comments`),
      this.requestPaginated<GitHubPullReviewResponse>(`/pulls/${pullNumber}/reviews`)
    ]);

    return [
      ...reviewComments.map((comment) => mapComment(comment, 'review')),
      ...issueComments.map((comment) => mapComment(comment, 'issue')),
      ...pullReviews.map(mapPullReview).filter((comment): comment is ReviewComment => comment !== undefined)
    ];
  }

  async postSummaryComment(target: ReviewTargetRef, body: string): Promise<PostResult> {
    this.assertTargetRepository(target);
    const trimmedBody = body.trim();
    if (trimmedBody.length === 0) {
      throw new GitHubProviderError('INVALID_COMMENT', 'A summary comment body is required.');
    }

    if (!this.allowWrites) {
      return {
        id: `preview-${target.id}`,
        status: 'preview-required',
        message: 'ReviewOps requires an explicit preview confirmation before posting a GitHub summary comment.'
      };
    }

    this.assertWritableToken();
    const result = await this.requestJson<GitHubPostCommentResponse>(
      `/issues/${parsePullRequestNumber(target.id)}/comments`,
      {},
      {
        method: 'POST',
        body: JSON.stringify({ body: trimmedBody })
      }
    );

    return {
      id: String(result.id),
      status: 'posted',
      url: result.html_url
    };
  }

  async postReplies(target: ReviewTargetRef, replies: ReviewReply[]): Promise<PostResult[]> {
    this.assertTargetRepository(target);
    const normalizedReplies = replies.map((reply) => ({
      ...reply,
      body: reply.body.trim()
    }));
    for (const reply of normalizedReplies) {
      if (reply.body.length === 0) {
        throw new GitHubProviderError('INVALID_COMMENT', `A reply body is required for ${reply.commentId}.`);
      }
    }

    if (!this.allowWrites) {
      return normalizedReplies.map((reply) => ({
        id: `preview-${target.id}-${reply.commentId}`,
        status: 'preview-required',
        message: 'ReviewOps requires an explicit preview confirmation before posting GitHub replies.'
      }));
    }

    this.assertWritableToken();
    const results: PostResult[] = [];
    for (const reply of normalizedReplies) {
      const reviewCommentId = parseGitHubReviewCommentId(reply.commentId);
      if (reviewCommentId !== undefined) {
        const result = await this.requestJson<GitHubPostCommentResponse>(
          `/pulls/${parsePullRequestNumber(target.id)}/comments/${reviewCommentId}/replies`,
          {},
          {
            method: 'POST',
            body: JSON.stringify({ body: reply.body })
          }
        );
        results.push({
          id: String(result.id),
          status: 'posted',
          url: result.html_url
        });
        continue;
      }

      if (parseGitHubIssueCommentId(reply.commentId) !== undefined) {
        results.push(await this.postSummaryComment(target, [`Reply to ${reply.commentId}:`, '', reply.body].join('\n')));
        continue;
      }

      results.push({
        id: `unsupported-${target.id}-${safeDraftIdPart(reply.commentId)}`,
        status: 'unsupported',
        message: `ReviewOps cannot post a threaded GitHub reply for ${reply.commentId}.`
      });
    }
    return results;
  }

  private mapPullResponse(pull: GitHubPullResponse): ReviewTarget {
    const ref = createGitHubPullRequestTargetRef({
      repository: this.repository,
      pullRequestNumber: pull.number,
      url: pull.html_url ?? `${this.webBaseUrl}/${this.repository}/pull/${pull.number}`
    });

    return {
      ref,
      title: pull.title,
      author: pull.user?.login,
      sourceBranch: pull.head?.ref,
      targetBranch: pull.base?.ref,
      status: mapPullStatus(pull),
      createdAt: pull.created_at,
      updatedAt: pull.updated_at
    };
  }

  private assertTargetRepository(target: ReviewTargetRef): void {
    assertGitHubTarget(target);
    if (normalizeRepository(target.repository) !== this.repository) {
      throw new GitHubProviderError(
        'TARGET_REPOSITORY_MISMATCH',
        `GitHub target repository ${target.repository} does not match provider repository ${this.repository}.`
      );
    }
  }

  private assertWritableToken(): void {
    if (this.token === undefined) {
      throw new GitHubProviderError('MISSING_TOKEN', 'A GitHub token is required before posting comments.');
    }
  }

  private async requestPaginated<T>(endpoint: string): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const pageItems = await this.requestJson<T[]>(endpoint, {
        per_page: '100',
        page: String(page)
      });
      items.push(...pageItems);

      if (pageItems.length < 100) {
        break;
      }
    }

    return items;
  }

  private async requestJson<T>(
    endpoint: string,
    query: Record<string, string | undefined> = {},
    init: FetchRequestInit = {}
  ): Promise<T> {
    const url = this.createApiUrl(endpoint, query);
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...this.createHeaders(init.body !== undefined),
        ...init.headers
      }
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new GitHubProviderError(
        'GITHUB_REQUEST_FAILED',
        `GitHub request failed for ${endpoint}: ${response.status} ${response.statusText ?? ''}`.trim()
      );
    }

    return (responseText.length === 0 ? undefined : JSON.parse(responseText)) as T;
  }

  private createApiUrl(endpoint: string, query: Record<string, string | undefined>): string {
    const url = new URL(
      `${this.apiBaseUrl}/repos/${encodeURIComponent(this.repositoryParts.owner)}/${encodeURIComponent(this.repositoryParts.repo)}${endpoint}`
    );

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value.trim().length > 0) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  private createHeaders(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': this.userAgent,
      'x-github-api-version': '2022-11-28'
    };

    if (hasBody) {
      headers['content-type'] = 'application/json';
    }

    if (this.token !== undefined) {
      headers.authorization = `Bearer ${this.token}`;
    }

    return headers;
  }
}

function normalizeRepository(repository: string): string {
  const normalized = repository.trim().replace(/^https:\/\/github\.com\//u, '').replace(/\.git$/u, '');
  parseRepository(normalized);
  return normalized;
}

function parseRepository(repository: string): GitHubRepositoryParts {
  const parts = repository.split('/');
  if (parts.length !== 2 || parts.some((part) => part.trim().length === 0)) {
    throw new GitHubProviderError('INVALID_REPOSITORY', `GitHub repository must be in owner/repo form: ${repository}`);
  }

  return {
    owner: parts[0],
    repo: parts[1]
  };
}

function createPullRequestTargetId(pullRequestNumber: number): string {
  return `pull:${pullRequestNumber}`;
}

function parsePullRequestNumber(targetId: string): number {
  const match = /^pull:(\d+)$/u.exec(targetId);
  if (match === null) {
    throw new GitHubProviderError('INVALID_TARGET', `Unsupported GitHub target id: ${targetId}`);
  }

  return Number(match[1]);
}

function parseGitHubReviewCommentId(commentId: string): number | undefined {
  // Portal adapters may supply a provider-qualified key or a bare numeric id.
  const match = /^(?:(?:review|issue):)?(\d+)$/u.exec(commentId);
  return match === null ? undefined : Number(match[1]);
}

function parseGitHubIssueCommentId(commentId: string): number | undefined {
  const match = /^issue:(\d+)$/u.exec(commentId);
  return match === null ? undefined : Number(match[1]);
}

function assertGitHubTarget(target: ReviewTargetRef): void {
  if (target.provider !== 'github') {
    throw new GitHubProviderError('INVALID_TARGET', `Expected a GitHub target, received ${target.provider}.`);
  }
}

function normalizeOptionalToken(token: string | undefined): string | undefined {
  const trimmed = token?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function mapPullStatus(pull: GitHubPullResponse): ReviewTarget['status'] {
  if (pull.draft === true) {
    return 'draft';
  }

  if (pull.state === 'closed' && pull.merged_at !== undefined && pull.merged_at !== null) {
    return 'merged';
  }

  return pull.state;
}

function mapPullFile(file: GitHubPullFileResponse): ReviewDiffFile {
  const status = mapFileStatus(file.status);
  const reviewFile: ReviewDiffFile = {
    path: file.filename,
    status,
    patch: file.patch === undefined ? undefined : formatFilePatch(file.filename, file.previous_filename, status, file.patch)
  };

  if (file.previous_filename !== undefined) {
    reviewFile.oldPath = file.previous_filename;
  }

  return reviewFile;
}

function mapFileStatus(status: string): ReviewDiffFile['status'] {
  if (status === 'added') {
    return 'added';
  }

  if (status === 'removed') {
    return 'deleted';
  }

  if (status === 'renamed') {
    return 'renamed';
  }

  return 'modified';
}

function formatFilePatch(path: string, oldPath: string | undefined, status: ReviewDiffFile['status'], patch: string): string {
  const sourcePath = oldPath ?? path;
  return [`diff --git a/${sourcePath} b/${path}`, `# ${status}: ${oldPath === undefined ? path : `${oldPath} -> ${path}`}`, patch].join(
    '\n'
  );
}

function formatRawPatch(files: ReviewDiffFile[]): string {
  if (files.length === 0) {
    return '';
  }

  return `${files.map((file) => file.patch?.trim() || `${file.status}: ${file.path}`).join('\n\n')}\n`;
}

function formatGitHubDiffPatch(diff: ReviewDiff): string {
  const patch = diff.rawPatch?.trim();
  if (patch !== undefined && patch.length > 0) {
    return `${patch}\n`;
  }

  return formatRawPatch(diff.files);
}

function formatGitHubReviewSummary(diff: ReviewDiff, comments: ReviewComment[]): string {
  const summary = diff.summary;
  const fileLines =
    diff.files.length === 0
      ? ['- No changed files were reported by GitHub.']
      : diff.files.map((file) => `- ${file.status}: ${file.oldPath === undefined ? file.path : `${file.oldPath} -> ${file.path}`}`);
  const commentLines =
    comments.length === 0
      ? ['- No review comments were reported by GitHub.']
      : comments.map((comment) => {
          const location = comment.file === undefined ? 'general' : `${comment.file}${comment.line === undefined ? '' : `:${comment.line}`}`;
          return `- ${comment.id} ${comment.author ?? 'unknown'} ${location}: ${comment.body.replaceAll(/\s+/gu, ' ').trim()}`;
        });

  return [
    'GitHub pull request summary:',
    `- Target: ${diff.target.id}`,
    `- Repository: ${diff.target.repository}`,
    `- Changed files: ${summary.changedFiles}`,
    `- Additions: ${summary.additions ?? 0}`,
    `- Deletions: ${summary.deletions ?? 0}`,
    `- Review comments: ${comments.length}`,
    `- Backend touched: ${summary.backendTouched}`,
    `- Frontend touched: ${summary.frontendTouched}`,
    `- Tests touched: ${summary.testTouched}`,
    `- Docs touched: ${summary.docsTouched}`,
    `- Config touched: ${summary.configTouched}`,
    '',
    'Changed files:',
    ...fileLines,
    '',
    'Review comments:',
    ...commentLines
  ].join('\n');
}

function mapComment(comment: GitHubCommentResponse, kind: 'issue' | 'review'): ReviewComment {
  return {
    id: `${kind}:${comment.id}`,
    author: comment.user?.login,
    body: comment.body ?? '',
    file: comment.path,
    line: comment.line ?? comment.original_line ?? undefined,
    url: comment.html_url,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at
  };
}

function mapPullReview(review: GitHubPullReviewResponse): ReviewComment | undefined {
  const state = review.state?.trim();
  const body = review.body?.trim() ?? '';
  if (body.length === 0 && state !== 'CHANGES_REQUESTED') {
    return undefined;
  }

  return {
    id: `review-body:${review.id}`,
    author: review.user?.login,
    body: [`GitHub review state: ${state ?? 'UNKNOWN'}.`, body].filter((line) => line.length > 0).join('\n\n'),
    url: review.html_url,
    createdAt: review.submitted_at,
    updatedAt: review.submitted_at
  };
}

function safeDraftIdPart(value: string): string {
  return value.replaceAll(/[^0-9a-z-]/giu, '-').replaceAll(/^-+|-+$/gu, '') || 'summary';
}
