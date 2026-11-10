import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileSystemArtifactStore,
  buildReviewResolutionArtifacts,
  createActionPlanUnderstandingMemo,
  createReplyPublishDrafts,
  renderActionPlanUnderstandingMemoMarkdown,
  renderReviewActionPlanMarkdown,
  renderReviewReplyDraftMarkdown,
  triageReviewComments,
  type ReviewActionPlanItem,
  type ReviewComment,
  type ReviewTargetRef
} from '../index.js';

const target: ReviewTargetRef = {
  provider: 'github',
  repository: 'ist-h-i/ReviewOps',
  id: 'pull:1',
  url: 'https://github.com/ist-h-i/ReviewOps/pull/1'
};

const comments: ReviewComment[] = [
  {
    id: 'review:101',
    author: 'senior',
    body: 'Please add coverage for the failure path before merge.',
    file: 'packages/core/src/reviews/comment-resolution.ts',
    line: 42
  },
  {
    id: 'issue:201',
    author: 'reviewer',
    body: 'Could you clarify why this belongs in core?'
  },
  {
    id: 'review-body:301',
    body: 'Looks good overall.'
  }
];

describe('review comment resolution flows', () => {
  it('triages review comments into manual fix and reply work', () => {
    const triage = triageReviewComments(comments);

    expect(triage.totalComments).toBe(3);
    expect(triage.needsFixCount).toBe(1);
    expect(triage.needsReplyCount).toBe(2);
    expect(triage.items.map((item) => item.disposition)).toEqual(['needs-fix', 'needs-reply', 'informational']);
    expect(triage.items[0]).toMatchObject({
      commentId: 'review:101',
      priority: 'P1',
      requiresCodeChange: true,
      requiresReply: true
    });
  });

  it('keeps actionable requests from being hidden by thanks wording', () => {
    const triage = triageReviewComments([
      {
        id: 'review:thanks-but-fix',
        body: 'Thanks for the quick change, but please add failure-path coverage before merge.'
      }
    ]);

    expect(triage.needsFixCount).toBe(1);
    expect(triage.needsReplyCount).toBe(1);
    expect(triage.items[0]).toMatchObject({
      disposition: 'needs-fix',
      priority: 'P1',
      requiresCodeChange: true
    });
  });

  it('normalizes multiline comment excerpts for titles and action items', () => {
    const triage = triageReviewComments([
      {
        id: 'review:multiline',
        body: 'Could you\n\tclarify why this belongs in core?'
      }
    ]);

    expect(triage.items[0]?.bodyExcerpt).toBe('Could you clarify why this belongs in core?');
    expect(triage.items[0]?.title).toBe('general comment: Could you clarify why this belongs in core?');
  });

  it('derives action-plan understanding memos in core policy', () => {
    const actionPlan: ReviewActionPlanItem[] = [
      {
        id: 'action-1',
        title: 'Update packages/core/src/reviews/comment-resolution.ts',
        priority: 'P1',
        source: 'comment',
        relatedCommentIds: ['review:101'],
        steps: ['Inspect packages/core/src/reviews/comment-resolution.ts:42.', 'Run focused coverage.'],
        doneCriteria: ['A focused verification command has passed.']
      }
    ];

    const memo = createActionPlanUnderstandingMemo(actionPlan);
    const markdown = renderActionPlanUnderstandingMemoMarkdown(memo, 'ReviewOps Action Plan');
    const actionPlanMarkdown = renderReviewActionPlanMarkdown(actionPlan);
    const replyDraftMarkdown = renderReviewReplyDraftMarkdown([
      {
        commentId: 'review:101',
        body: 'I updated the core policy and ran focused coverage.'
      }
    ]);

    expect(memo[0]).toMatchObject({
      inspectionPoint: 'packages/core/src/reviews/comment-resolution.ts',
      question: 'Confirm intent for review:101 if the implementation path is ambiguous.',
      testFocus: 'Run focused coverage.'
    });
    expect(markdown).toContain('# ReviewOps Understanding Memo');
    expect(markdown).toContain('Where to inspect: packages/core/src/reviews/comment-resolution.ts');
    expect(actionPlanMarkdown).toContain('ReviewOps records manual follow-up intent only');
    expect(replyDraftMarkdown).toContain('ReviewOps keeps replies as local drafts');
  });

  it('writes action plan and preview-first reply draft artifacts', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-resolution-'));
    const result = await buildReviewResolutionArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_resolution',
      target,
      comments,
      actionPlanSeeds: [
        {
          id: 'seed-action',
          title: 'Apply imported response guidance',
          priority: 'P2',
          steps: ['Update implementation', 'Run tests']
        }
      ],
      now: () => new Date('2026-05-05T07:00:00.000Z')
    });

    expect(result.actionPlan.map((item) => item.id)).toContain('seed-action');
    expect(result.understandingMemo.summary).toMatchObject({
      totalItems: 3,
      needsFixCount: 1,
      needsReplyCount: 2,
      questionCount: 2
    });
    expect(result.actionPlan.some((item) => item.relatedCommentIds.includes('review:101'))).toBe(true);
    expect(result.replyDrafts).toHaveLength(2);
    expect(result.replyDrafts.every((draft) => draft.publishDraft.requiresConfirmation)).toBe(true);
    expect(result.nextActions.map((action) => action.flowId)).toContain('publish/reply-draft');

    const actionPlan = JSON.parse(await readFile(path.join(workspaceRoot, result.artifacts.actionPlan.path), 'utf8')) as unknown[];
    const understandingMemo = await readFile(path.join(workspaceRoot, result.artifacts.understandingMemoMarkdown.path), 'utf8');
    const publishDraft = await readFile(path.join(workspaceRoot, result.artifacts.publishDraft.path), 'utf8');

    expect(actionPlan).toHaveLength(2);
    expect(understandingMemo).toContain('# ReviewOps Understanding Memo');
    expect(understandingMemo).toContain('Where to inspect: packages/core/src/reviews/comment-resolution.ts:42');
    expect(understandingMemo).toContain('Test focus: Add or update the focused test or coverage path named by the reviewer.');
    expect(publishDraft).toContain('# ReviewOps Reply Drafts');
    expect(publishDraft).toContain('review:101');
  });

  it('creates confirmation-required single reply publish drafts', () => {
    const [draft] = createReplyPublishDrafts({
      target,
      replies: [{ commentId: 'review:101', body: 'I added the missing coverage and ran pnpm test.' }],
      createdAt: '2026-05-05T07:05:00.000Z'
    });

    expect(draft).toMatchObject({
      commentId: 'review:101',
      publishDraft: {
        provider: 'github',
        mode: 'reply',
        requiresConfirmation: true,
        status: 'draft',
        body: 'I added the missing coverage and ran pnpm test.'
      }
    });
  });
});
