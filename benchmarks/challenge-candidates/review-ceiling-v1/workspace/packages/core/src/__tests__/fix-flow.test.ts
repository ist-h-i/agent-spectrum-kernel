import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileSystemArtifactStore,
  buildReviewFixChecklistArtifacts,
  buildReviewFixExplanationArtifacts,
  buildReviewFixPlanArtifacts,
  buildReviewFixVerificationArtifacts,
  createReviewFixPlan,
  type ReviewActionPlanItem,
  type ReviewTargetRef
} from '../index.js';

const target: ReviewTargetRef = {
  provider: 'github',
  repository: 'ist-h-i/ReviewOps',
  id: 'pull:7'
};

const actionPlan: ReviewActionPlanItem[] = [
  {
    id: 'comment-action-review-101',
    title: 'Add failure-path coverage in packages/core/src/reviews/fix-flow.ts',
    priority: 'P1',
    source: 'comment',
    relatedCommentIds: ['review:101'],
    steps: [
      'Inspect packages/core/src/reviews/fix-flow.ts.',
      'Add focused coverage for unresolved verification results.',
      'Run pnpm test -- packages/core/src/__tests__/fix-flow.test.ts'
    ],
    doneCriteria: ['The requested code or documentation change is applied manually.', 'A focused verification command has passed.']
  },
  {
    id: 'response-action-rule',
    title: 'Capture repeat review rule candidate',
    priority: 'P2',
    source: 'response',
    relatedCommentIds: [],
    steps: ['Record the repeated review pattern as a rule candidate.'],
    doneCriteria: ['Rule candidate has enough rationale for user approval.']
  }
];

describe('review fix flows', () => {
  it('creates manual fix plan items from review action plan items', () => {
    const fixPlan = createReviewFixPlan(actionPlan, target);

    expect(fixPlan.target).toEqual(target);
    expect(fixPlan.summary).toMatchObject({
      totalItems: 2,
      p0Count: 0,
      requiresReplyCount: 1,
      ruleCandidateCount: 1
    });
    expect(fixPlan.items[0]).toMatchObject({
      id: 'fix-comment-action-review-101',
      sourceActionId: 'comment-action-review-101',
      priority: 'P1',
      targetFiles: ['packages/core/src/reviews/fix-flow.ts'],
      replyRequired: true,
      status: 'planned'
    });
  });

  it('writes fix plan artifacts and next actions without changing code automatically', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fix-plan-'));
    const result = await buildReviewFixPlanArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_fix_plan',
      target,
      actionPlan,
      now: () => new Date('2026-05-05T08:00:00.000Z')
    });

    expect(result.nextActions.map((action) => action.flowId)).toEqual(['fix/checklist']);
    const fixPlanJson = JSON.parse(await readFile(path.join(workspaceRoot, result.artifacts.fixPlanJson.path), 'utf8')) as {
      items: unknown[];
    };
    const fixPlanMarkdown = await readFile(path.join(workspaceRoot, result.artifacts.fixPlanMarkdown.path), 'utf8');

    expect(fixPlanJson.items).toHaveLength(2);
    expect(fixPlanMarkdown).toContain('# ReviewOps Fix Plan');
    expect(fixPlanMarkdown).toContain('ReviewOps records fix intent');
  });

  it('writes manual fix checklist artifacts before verification', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fix-checklist-'));
    const fixPlan = createReviewFixPlan(actionPlan, target);
    const result = await buildReviewFixChecklistArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_fix_checklist',
      fixPlan,
      now: () => new Date('2026-05-05T08:05:00.000Z')
    });

    expect(result.checklist.summary).toMatchObject({
      totalItems: 2,
      replyRequiredCount: 1
    });
    expect(result.testScenarios.summary).toMatchObject({
      totalItems: 2,
      p0Count: 0
    });
    expect(result.nextActions.map((action) => action.flowId)).toEqual(['fix/verify']);

    const checklistMarkdown = await readFile(path.join(workspaceRoot, result.artifacts.checklistMarkdown.path), 'utf8');
    const testScenariosMarkdown = await readFile(path.join(workspaceRoot, result.artifacts.testScenariosMarkdown.path), 'utf8');
    expect(checklistMarkdown).toContain('# ReviewOps Fix Checklist');
    expect(checklistMarkdown).toContain('- [ ] Manual fix approach is still valid');
    expect(testScenariosMarkdown).toContain('# ReviewOps Test Scenarios');
    expect(testScenariosMarkdown).toContain('Verify Add failure-path coverage');
    expect(testScenariosMarkdown).toContain('Risk covered: Potentially affects packages/core/src/reviews/fix-flow.ts.');
  });

  it('records fix verification outcomes and follow-up next actions', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fix-verify-'));
    const fixPlan = createReviewFixPlan(actionPlan, target);
    const result = await buildReviewFixVerificationArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_fix_verify',
      fixPlan,
      results: [
        {
          fixPlanItemId: 'fix-comment-action-review-101',
          status: 'resolved',
          evidence: 'Failure-path test added and passed.',
          commands: ['pnpm test -- packages/core/src/__tests__/fix-flow.test.ts']
        },
        {
          fixPlanItemId: 'fix-response-action-rule',
          status: 'needs_followup_issue',
          evidence: 'Rule candidate needs user approval before applying.',
          commands: [],
          followUpIssueTitle: 'Approve repeated review rule candidate'
        }
      ],
      now: () => new Date('2026-05-05T08:10:00.000Z')
    });

    expect(result.verification.summary).toMatchObject({
      resolvedCount: 1,
      followUpIssueCount: 1
    });
    expect(result.nextActions.map((action) => action.flowId)).toEqual(['review/action-plan', 'fix/explain']);

    const verificationMarkdown = await readFile(path.join(workspaceRoot, result.artifacts.verificationMarkdown.path), 'utf8');
    expect(verificationMarkdown).toContain('# ReviewOps Fix Verification');
    expect(verificationMarkdown).toContain('needs_followup_issue');
  });

  it('writes fix explanation artifacts for preview-first replies', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fix-explain-'));
    const fixPlan = createReviewFixPlan(actionPlan, target);
    const verificationResult = await buildReviewFixVerificationArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_fix_explain_verify',
      fixPlan,
      results: [
        {
          fixPlanItemId: 'fix-comment-action-review-101',
          status: 'resolved',
          evidence: 'Failure-path test passed.',
          commands: ['pnpm test -- packages/core/src/__tests__/fix-flow.test.ts']
        },
        {
          fixPlanItemId: 'fix-response-action-rule',
          status: 'needs_followup_issue',
          evidence: 'Rule candidate still needs approval.',
          commands: [],
          followUpIssueTitle: 'Approve rule candidate'
        }
      ],
      now: () => new Date('2026-05-05T08:25:00.000Z')
    });
    const result = await buildReviewFixExplanationArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_fix_explain',
      fixPlan,
      verification: verificationResult.verification,
      now: () => new Date('2026-05-05T08:26:00.000Z')
    });

    expect(result.explanation.summary).toMatchObject({
      verifiedItems: 2,
      resolvedCount: 1,
      followUpIssueCount: 1
    });
    expect(result.nextActions.map((action) => action.flowId)).toEqual(['review/action-plan', 'publish/reply-draft']);

    const explanationMarkdown = await readFile(path.join(workspaceRoot, result.artifacts.explanationMarkdown.path), 'utf8');
    expect(explanationMarkdown).toContain('# ReviewOps Fix Explanation');
    expect(explanationMarkdown).toContain('No code was changed automatically');
    expect(explanationMarkdown).toContain('Rule candidate still needs approval.');
  });

  it('keeps partially resolved fix explanations on follow-up planning', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fix-explain-partial-'));
    const fixPlan = createReviewFixPlan(actionPlan, target);
    const verificationResult = await buildReviewFixVerificationArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_fix_explain_partial_verify',
      fixPlan,
      results: [
        {
          fixPlanItemId: 'fix-comment-action-review-101',
          status: 'partially_resolved',
          evidence: 'Primary failure path passed, but one edge case still needs a follow-up.',
          commands: ['pnpm test -- packages/core/src/__tests__/fix-flow.test.ts'],
          unresolvedRisk: 'Follow-up edge case remains.'
        }
      ],
      now: () => new Date('2026-05-05T08:35:00.000Z')
    });
    const result = await buildReviewFixExplanationArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_fix_explain_partial',
      fixPlan,
      verification: verificationResult.verification,
      now: () => new Date('2026-05-05T08:36:00.000Z')
    });

    expect(result.explanation.summary).toMatchObject({
      verifiedItems: 1,
      resolvedCount: 1,
      unresolvedCount: 1,
      followUpIssueCount: 0
    });
    expect(result.nextActions.map((action) => action.flowId)).toEqual(['review/action-plan', 'publish/reply-draft']);

    const explanationMarkdown = await readFile(path.join(workspaceRoot, result.artifacts.explanationMarkdown.path), 'utf8');
    expect(explanationMarkdown).toContain('Unresolved or new risk: 1');
    expect(explanationMarkdown).toContain('Follow-up edge case remains.');
  });

  it('rejects verification for unknown fix plan item ids', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fix-verify-invalid-'));
    const fixPlan = createReviewFixPlan(actionPlan, target);

    await expect(
      buildReviewFixVerificationArtifacts({
        artifactStore: new FileSystemArtifactStore(workspaceRoot),
        runId: 'run_fix_verify_invalid',
        fixPlan,
        results: [
          {
            fixPlanItemId: 'missing',
            status: 'not_resolved',
            evidence: 'No matching item.',
            commands: []
          }
        ],
        now: () => new Date('2026-05-05T08:15:00.000Z')
      })
    ).rejects.toThrow('unknown fix plan item');
  });

  it('rejects duplicate verification rows for the same fix plan item', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fix-verify-duplicate-'));
    const fixPlan = createReviewFixPlan(actionPlan, target);

    await expect(
      buildReviewFixVerificationArtifacts({
        artifactStore: new FileSystemArtifactStore(workspaceRoot),
        runId: 'run_fix_verify_duplicate',
        fixPlan,
        results: [
          {
            fixPlanItemId: 'fix-comment-action-review-101',
            status: 'resolved',
            evidence: 'The fix passed focused verification.',
            commands: ['pnpm test -- packages/core/src/__tests__/fix-flow.test.ts']
          },
          {
            fixPlanItemId: 'fix-comment-action-review-101',
            status: 'not_resolved',
            evidence: 'Conflicting duplicate row.',
            commands: []
          }
        ],
        now: () => new Date('2026-05-05T08:20:00.000Z')
      })
    ).rejects.toThrow('duplicate fix plan item');
  });
});
