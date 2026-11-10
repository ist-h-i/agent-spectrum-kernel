import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getReviewOpsMetaStatus, initializeReviewOpsProject, listReviewOpsFlows, setupReviewOpsProjectContext } from '../index.js';

describe('meta flows', () => {
  it('lists registered P0 flows', () => {
    expect(listReviewOpsFlows().map((flow) => flow.id)).toEqual([
      'project/init',
      'project/context',
      'meta/list',
      'meta/status',
      'review/select-target',
      'diff/review',
      'response/import',
      'response/normalize',
      'research/select-scope',
      'research/investigate',
      'research/import-findings',
      'research/normalize-findings',
      'research/action-plan',
      'review/comment-triage',
      'review/action-plan',
      'fix/plan',
      'fix/checklist',
      'fix/verify',
      'fix/explain',
      'refactor/plan',
      'refactor/checklist',
      'refactor/verify',
      'refactor/explain',
      'review/reply-drafts',
      'publish/reply-draft',
      'provider/connect',
      'provider/list-targets',
      'provider/fetch-review',
      'publish/summary-draft',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'field/report',
      'cycle/mr-review',
      'cycle/comment-response',
      'cycle/fix-review',
      'cycle/research',
      'cycle/refactoring',
      'cycle/field-report',
      'meta/next',
      'meta/resume',
      'meta/readiness'
    ]);
  });

  it('reports project initialization status and next action', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-status-'));
    const before = await getReviewOpsMetaStatus({ workspaceRoot });

    expect(before.initialized).toBe(false);
    expect(before.nextActions[0]?.flowId).toBe('project/init');

    await initializeReviewOpsProject({ workspaceRoot });
    const after = await getReviewOpsMetaStatus({ workspaceRoot });

    expect(after.initialized).toBe(true);
    expect(after.flowCount).toBe(45);
    expect(after.currentCycle).toBeNull();
    expect(after.nextActions.map((action) => action.flowId)).toEqual(['project/context']);

    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript'],
        reviewPolicy: ['Preview before publish.']
      }
    });
    const configured = await getReviewOpsMetaStatus({ workspaceRoot });

    expect(configured.initialized).toBe(true);
    expect(configured.currentCycle).toBeNull();
    expect(configured.nextActions.map((action) => action.flowId)).toEqual([
      'cycle/mr-review',
      'cycle/comment-response',
      'cycle/fix-review',
      'cycle/research',
      'cycle/refactoring',
      'cycle/field-report'
    ]);
  });

  it('does not treat ReviewOps marker files as initialized directories', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-status-files-'));
    await writeFile(path.join(workspaceRoot, '.reviewops'), 'not a directory', 'utf8');
    await writeFile(path.join(workspaceRoot, '.reviewops.local'), 'not a directory', 'utf8');

    const status = await getReviewOpsMetaStatus({ workspaceRoot });

    expect(status.sharedDirExists).toBe(false);
    expect(status.localDirExists).toBe(false);
    expect(status.initialized).toBe(false);
    expect(status.currentCycle).toBeNull();
    expect(status.nextActions[0]?.flowId).toBe('project/init');
  });
});
