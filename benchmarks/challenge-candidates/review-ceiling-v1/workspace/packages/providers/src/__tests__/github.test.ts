import { describe, expect, it } from 'vitest';

import {
  type FetchLike,
  createGitHubPullRequestTargetRef,
  createGitHubReviewProvider,
  createReviewPromptInputFromGitHubPullRequest,
  createSummaryCommentDraft
} from '../index.js';

describe('GitHub review provider', () => {
  it('lists pull request targets and sends tokens only as request headers', async () => {
    const calls: FetchCall[] = [];
    const provider = createGitHubReviewProvider({
      repository: 'ist-h-i/ReviewOps',
      token: 'secret-token',
      fetch: createFakeGitHubFetch(calls)
    });

    const targets = await provider.listReviewTargets({ state: 'open', limit: 10 });

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      title: 'Build ReviewOps P0 foundation',
      author: 'reviewer',
      sourceBranch: 'automation/reviewops-p0-bootstrap',
      targetBranch: 'main',
      status: 'open'
    });
    expect(targets[0]?.ref).toEqual({
      provider: 'github',
      repository: 'ist-h-i/ReviewOps',
      id: 'pull:1',
      url: 'https://github.com/ist-h-i/ReviewOps/pull/1'
    });
    expect(calls[0]?.init?.headers?.authorization).toBe('Bearer secret-token');
    expect(calls[0]?.url).not.toContain('secret-token');
  });

  it('fetches pull request diff and comments for prompt input', async () => {
    const calls: FetchCall[] = [];
    const provider = createGitHubReviewProvider({
      repository: 'ist-h-i/ReviewOps',
      fetch: createFakeGitHubFetch(calls)
    });
    const target = createGitHubPullRequestTargetRef({
      repository: 'ist-h-i/ReviewOps',
      pullRequestNumber: 1
    });

    const [reviewTarget, diff, comments] = await Promise.all([
      provider.getReviewTarget(target),
      provider.getDiff(target),
      provider.getComments(target)
    ]);
    const promptInput = createReviewPromptInputFromGitHubPullRequest(diff, comments);

    expect(reviewTarget.ref.id).toBe('pull:1');
    expect(diff.summary).toMatchObject({
      changedFiles: 2,
      additions: 15,
      deletions: 3,
      backendTouched: true,
      testTouched: true
    });
    expect(diff.files.map((file) => file.path)).toEqual(['packages/providers/src/github.ts', 'packages/providers/src/__tests__/github.test.ts']);
    expect(comments.map((comment) => comment.id)).toEqual(['review:101', 'issue:201', 'review-body:401']);
    expect(promptInput.diff).toContain('diff --git a/packages/providers/src/github.ts b/packages/providers/src/github.ts');
    expect(promptInput.notes).toContain('Review comments: 3');
    expect(promptInput.notes).toContain('GitHub review state: CHANGES_REQUESTED.');
    expect(promptInput.notes).toContain('Please address the provider boundary before merge.');
    expect(calls.map((call) => new URL(call.url).pathname)).toContain('/repos/ist-h-i/ReviewOps/pulls/1/comments');
    expect(calls.map((call) => new URL(call.url).pathname)).toContain('/repos/ist-h-i/ReviewOps/issues/1/comments');
    expect(calls.map((call) => new URL(call.url).pathname)).toContain('/repos/ist-h-i/ReviewOps/pulls/1/reviews');
  });

  it('keeps summary posting preview-first unless writes are explicitly enabled', async () => {
    const previewCalls: FetchCall[] = [];
    const target = createGitHubPullRequestTargetRef({
      repository: 'ist-h-i/ReviewOps',
      pullRequestNumber: 1
    });
    const previewProvider = createGitHubReviewProvider({
      repository: 'ist-h-i/ReviewOps',
      token: 'secret-token',
      fetch: createFakeGitHubFetch(previewCalls)
    });

    const preview = await previewProvider.postSummaryComment(target, 'Review summary draft');
    const draft = createSummaryCommentDraft({
      target,
      body: 'Review summary draft',
      createdAt: '2026-05-05T05:30:00.000Z'
    });

    expect(preview.status).toBe('preview-required');
    expect(previewCalls).toEqual([]);
    expect(draft).toMatchObject({
      provider: 'github',
      mode: 'summary-comment',
      requiresConfirmation: true,
      status: 'draft',
      body: 'Review summary draft'
    });

    const postCalls: FetchCall[] = [];
    const writableProvider = createGitHubReviewProvider({
      repository: 'ist-h-i/ReviewOps',
      token: 'secret-token',
      fetch: createFakeGitHubFetch(postCalls),
      allowWrites: true
    });
    const posted = await writableProvider.postSummaryComment(target, 'Review summary draft');

    expect(posted).toEqual({
      id: '301',
      status: 'posted',
      url: 'https://github.com/ist-h-i/ReviewOps/pull/1#issuecomment-301'
    });
    expect(new URL(postCalls[0]?.url ?? '').pathname).toBe('/repos/ist-h-i/ReviewOps/issues/1/comments');
    expect(postCalls[0]?.init?.method).toBe('POST');
    expect(postCalls[0]?.init?.body).toBe(JSON.stringify({ body: 'Review summary draft' }));
  });

  it('keeps comment replies preview-first and posts only with explicit writes', async () => {
    const target = createGitHubPullRequestTargetRef({
      repository: 'ist-h-i/ReviewOps',
      pullRequestNumber: 1
    });
    const previewCalls: FetchCall[] = [];
    const previewProvider = createGitHubReviewProvider({
      repository: 'ist-h-i/ReviewOps',
      token: 'secret-token',
      fetch: createFakeGitHubFetch(previewCalls)
    });

    await expect(
      previewProvider.postReplies!(target, [{ commentId: 'review:101', body: 'I will add coverage.' }])
    ).resolves.toEqual([
      {
        id: 'preview-pull:1-review:101',
        status: 'preview-required',
        message: 'ReviewOps requires an explicit preview confirmation before posting GitHub replies.'
      }
    ]);
    expect(previewCalls).toEqual([]);

    const postCalls: FetchCall[] = [];
    const writableProvider = createGitHubReviewProvider({
      repository: 'ist-h-i/ReviewOps',
      token: 'secret-token',
      fetch: createFakeGitHubFetch(postCalls),
      allowWrites: true
    });

    await expect(
      writableProvider.postReplies!(target, [
        { commentId: 'review:101', body: 'I added coverage and ran pnpm test.' },
        { commentId: 'issue:201', body: 'I confirmed the summary context.' },
        { commentId: 'review-body:401', body: 'Thanks for the review summary.' }
      ])
    ).resolves.toEqual([
      {
        id: '302',
        status: 'posted',
        url: 'https://github.com/ist-h-i/ReviewOps/pull/1#discussion_r302'
      },
      {
        id: '301',
        status: 'posted',
        url: 'https://github.com/ist-h-i/ReviewOps/pull/1#issuecomment-301'
      },
      {
        id: 'unsupported-pull:1-review-body-401',
        status: 'unsupported',
        message: 'ReviewOps cannot post a threaded GitHub reply for review-body:401.'
      }
    ]);
    expect(new URL(postCalls[0]?.url ?? '').pathname).toBe('/repos/ist-h-i/ReviewOps/pulls/1/comments/101/replies');
    expect(postCalls[0]?.init?.body).toBe(JSON.stringify({ body: 'I added coverage and ran pnpm test.' }));
    expect(new URL(postCalls[1]?.url ?? '').pathname).toBe('/repos/ist-h-i/ReviewOps/issues/1/comments');
    expect(postCalls[1]?.init?.body).toBe(
      JSON.stringify({ body: 'Reply to issue:201:\n\nI confirmed the summary context.' })
    );
    expect(postCalls).toHaveLength(2);
  });
});

interface FetchCall {
  url: string;
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

function createFakeGitHubFetch(calls: FetchCall[]): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;

    if (path === '/repos/ist-h-i/ReviewOps/pulls') {
      return jsonResponse([
        {
          number: 1,
          title: 'Build ReviewOps P0 foundation',
          state: 'open',
          draft: false,
          html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1',
          created_at: '2026-05-04T19:00:00Z',
          updated_at: '2026-05-04T20:00:00Z',
          user: { login: 'reviewer' },
          head: { ref: 'automation/reviewops-p0-bootstrap' },
          base: { ref: 'main' },
          merged_at: null
        }
      ]);
    }

    if (path === '/repos/ist-h-i/ReviewOps/pulls/1') {
      return jsonResponse({
        number: 1,
        title: 'Build ReviewOps P0 foundation',
        state: 'open',
        draft: false,
        html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1',
        user: { login: 'reviewer' },
        head: { ref: 'automation/reviewops-p0-bootstrap' },
        base: { ref: 'main' },
        merged_at: null
      });
    }

    if (path === '/repos/ist-h-i/ReviewOps/pulls/1/files') {
      return jsonResponse([
        {
          filename: 'packages/providers/src/github.ts',
          status: 'added',
          additions: 10,
          deletions: 0,
          patch: '@@ -0,0 +1,10 @@\n+export const provider = "github";'
        },
        {
          filename: 'packages/providers/src/__tests__/github.test.ts',
          status: 'modified',
          additions: 5,
          deletions: 3,
          patch: '@@ -1,3 +1,5 @@\n+describe("github", () => undefined);'
        }
      ]);
    }

    if (path === '/repos/ist-h-i/ReviewOps/pulls/1/comments') {
      return jsonResponse([
        {
          id: 101,
          body: 'Please cover pagination.',
          path: 'packages/providers/src/github.ts',
          line: 42,
          html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1#discussion_r101',
          user: { login: 'senior' }
        }
      ]);
    }

    if (path === '/repos/ist-h-i/ReviewOps/issues/1/comments' && init?.method === undefined) {
      return jsonResponse([
        {
          id: 201,
          body: 'Summary looks useful.',
          html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1#issuecomment-201',
          user: { login: 'reviewer' }
        }
      ]);
    }

    if (path === '/repos/ist-h-i/ReviewOps/pulls/1/reviews') {
      return jsonResponse([
        {
          id: 401,
          body: 'Please address the provider boundary before merge.',
          state: 'CHANGES_REQUESTED',
          html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1#pullrequestreview-401',
          submitted_at: '2026-05-05T05:35:00Z',
          user: { login: 'senior' }
        },
        {
          id: 402,
          body: '',
          state: 'APPROVED',
          html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1#pullrequestreview-402',
          submitted_at: '2026-05-05T05:40:00Z',
          user: { login: 'senior' }
        }
      ]);
    }

    if (path === '/repos/ist-h-i/ReviewOps/issues/1/comments' && init?.method === 'POST') {
      return jsonResponse({
        id: 301,
        html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1#issuecomment-301'
      });
    }

    if (path === '/repos/ist-h-i/ReviewOps/pulls/1/comments/101/replies' && init?.method === 'POST') {
      return jsonResponse({
        id: 302,
        html_url: 'https://github.com/ist-h-i/ReviewOps/pull/1#discussion_r302'
      });
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => JSON.stringify({ message: `No fake response for ${path}` })
    };
  };
}

function jsonResponse(value: unknown): {
  ok: true;
  status: 200;
  statusText: 'OK';
  text(): Promise<string>;
} {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(value)
  };
}
