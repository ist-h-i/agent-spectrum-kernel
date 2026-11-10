import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileSystemArtifactStore,
  advanceCurrentReviewOpsCycle,
  advanceReviewOpsCycle,
  buildMetaNextArtifacts,
  createReviewOpsCycle,
  getReviewOpsMetaNext,
  initializeReviewOpsProject,
  importReviewResponseArtifacts,
  loadCurrentReviewOpsCycle,
  resumeCurrentReviewOpsCycle,
  saveCurrentReviewOpsCycle,
  setupReviewOpsProjectContext
} from '../index.js';

describe('cycle and meta next flows', () => {
  it('creates, persists, resumes, and advances a current cycle', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-cycle-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript'],
        reviewPolicy: ['Preview before publish.']
      }
    });

    const cycle = createReviewOpsCycle({
      cycleId: 'cycle/mr-review',
      runId: 'run-cycle',
      startedAt: '2026-05-05T09:00:00.000Z'
    });
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: cycle
    });

    const loaded = await loadCurrentReviewOpsCycle(workspaceRoot);
    const resumed = await resumeCurrentReviewOpsCycle({ workspaceRoot });

    expect(loaded?.cycleId).toBe('cycle/mr-review');
    expect(resumed.currentCycle?.nextActions[0]?.flowId).toBe('review/select-target');
    expect(cycle.steps.map((step) => step.flowId)).toEqual([
      'review/select-target',
      'diff/review',
      'response/import',
      'response/normalize',
      'review/action-plan',
      'publish/summary-draft',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]);

    const advanced = await advanceCurrentReviewOpsCycle({
      workspaceRoot,
      completedFlowIds: ['review/select-target', 'diff/review'],
      now: () => new Date('2026-05-05T09:05:00.000Z')
    });

    expect(advanced?.steps.find((step) => step.flowId === 'diff/review')?.status).toBe('completed');
    expect(advanced?.nextActions[0]?.flowId).toBe('response/import');

    const stateFile = JSON.parse(
      await readFile(path.join(workspaceRoot, '.reviewops.local', 'current-cycle.local.json'), 'utf8')
    ) as {
      currentCycle: {
        updatedAt: string;
      };
    };
    expect(stateFile.currentCycle.updatedAt).toBe('2026-05-05T09:05:00.000Z');
  });

  it('keeps optional cycle start context while preserving cycles without it', () => {
    const researchCycle = createReviewOpsCycle({
      cycleId: 'cycle/research',
      runId: 'run-research-cycle',
      startedAt: '2026-05-05T09:06:00.000Z',
      startContext: {
        scopeLabel: 'auth <module>',
        intent: 'Find review risks before changing login flow.',
        targetMode: 'selected-files',
        targetFiles: ['packages/auth/src/login.ts']
      }
    });
    const mrCycle = createReviewOpsCycle({
      cycleId: 'cycle/mr-review',
      runId: 'run-mr-cycle',
      startedAt: '2026-05-05T09:07:00.000Z'
    });

    expect(researchCycle.startContext).toEqual({
      scopeLabel: 'auth <module>',
      intent: 'Find review risks before changing login flow.',
      targetMode: 'selected-files',
      targetFiles: ['packages/auth/src/login.ts']
    });
    expect(researchCycle.nextActions[0]?.flowId).toBe('research/select-scope');
    expect(mrCycle.startContext).toBeUndefined();
    expect(mrCycle.nextActions[0]?.flowId).toBe('review/select-target');
  });

  it('keeps non-review cycles free of review-response flows', () => {
    const researchCycle = createReviewOpsCycle({
      cycleId: 'cycle/research',
      runId: 'run-research-cycle',
      startedAt: '2026-05-05T09:08:00.000Z',
      startContext: {
        scopeLabel: 'auth module',
        intent: 'Investigate login risk.',
        targetMode: 'manual'
      }
    });
    const refactoringCycle = createReviewOpsCycle({
      cycleId: 'cycle/refactoring',
      runId: 'run-refactor-cycle',
      startedAt: '2026-05-05T09:09:00.000Z',
      startContext: {
        scopeLabel: 'command center',
        intent: 'Reduce branching.',
        targetMode: 'manual'
      }
    });
    const reviewResponseFlowIds = new Set([
      'review/select-target',
      'diff/review',
      'response/import',
      'response/normalize',
      'review/action-plan',
      'publish/summary-draft',
      'publish/reply-draft',
      'review/reply-drafts'
    ]);

    expect(researchCycle.steps.map((step) => step.flowId)).toEqual([
      'research/select-scope',
      'research/investigate',
      'research/import-findings',
      'research/normalize-findings',
      'research/action-plan',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]);
    expect(refactoringCycle.steps.map((step) => step.flowId)).toEqual([
      'refactor/plan',
      'refactor/checklist',
      'refactor/verify',
      'refactor/explain',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]);
    expect(researchCycle.steps.some((step) => reviewResponseFlowIds.has(step.flowId))).toBe(false);
    expect(refactoringCycle.steps.some((step) => reviewResponseFlowIds.has(step.flowId))).toBe(false);
  });

  it('keeps every P0 cycle aligned to its user intent without extra flow families', () => {
    const expectedCycles = [
      {
        cycleId: 'cycle/mr-review' as const,
        steps: [
          'review/select-target',
          'diff/review',
          'response/import',
          'response/normalize',
          'review/action-plan',
          'publish/summary-draft',
          'rules/propose',
          'rules/reconcile',
          'rules/apply',
          'rules/update',
          'knowledge/capture-candidates',
          'skill/evidence-capture',
          'meta/next'
        ],
        forbiddenPrefixes: ['fix/', 'refactor/', 'research/', 'provider/'],
        forbiddenExact: ['review/reply-drafts', 'publish/reply-draft']
      },
      {
        cycleId: 'cycle/comment-response' as const,
        steps: [
          'provider/fetch-review',
          'review/comment-triage',
          'review/action-plan',
          'fix/plan',
          'fix/checklist',
          'fix/verify',
          'fix/explain',
          'review/reply-drafts',
          'publish/reply-draft',
          'rules/propose',
          'rules/reconcile',
          'rules/apply',
          'rules/update',
          'knowledge/capture-candidates',
          'skill/evidence-capture',
          'meta/next'
        ],
        forbiddenPrefixes: ['diff/', 'response/', 'research/', 'refactor/'],
        forbiddenExact: ['publish/summary-draft']
      },
      {
        cycleId: 'cycle/fix-review' as const,
        steps: [
          'review/select-target',
          'diff/review',
          'response/import',
          'response/normalize',
          'review/action-plan',
          'fix/plan',
          'fix/checklist',
          'fix/verify',
          'fix/explain',
          'rules/propose',
          'rules/reconcile',
          'rules/apply',
          'rules/update',
          'knowledge/capture-candidates',
          'skill/evidence-capture',
          'meta/next'
        ],
        forbiddenPrefixes: ['provider/', 'research/', 'refactor/', 'publish/'],
        forbiddenExact: ['review/reply-drafts']
      },
      {
        cycleId: 'cycle/research' as const,
        steps: [
          'research/select-scope',
          'research/investigate',
          'research/import-findings',
          'research/normalize-findings',
          'research/action-plan',
          'knowledge/capture-candidates',
          'skill/evidence-capture',
          'meta/next'
        ],
        forbiddenPrefixes: ['review/', 'response/', 'fix/', 'refactor/', 'publish/', 'provider/'],
        forbiddenExact: []
      },
      {
        cycleId: 'cycle/refactoring' as const,
        steps: [
          'refactor/plan',
          'refactor/checklist',
          'refactor/verify',
          'refactor/explain',
          'rules/propose',
          'rules/reconcile',
          'rules/apply',
          'rules/update',
          'knowledge/capture-candidates',
          'skill/evidence-capture',
          'meta/next'
        ],
        forbiddenPrefixes: ['review/', 'response/', 'fix/', 'research/', 'publish/', 'provider/'],
        forbiddenExact: []
      },
      {
        cycleId: 'cycle/field-report' as const,
        steps: ['knowledge/capture-candidates', 'skill/evidence-capture', 'field/report', 'meta/next'],
        forbiddenPrefixes: ['review/', 'response/', 'fix/', 'refactor/', 'research/', 'publish/', 'provider/', 'rules/'],
        forbiddenExact: []
      }
    ];

    for (const expected of expectedCycles) {
      const cycle = createReviewOpsCycle({
        cycleId: expected.cycleId,
        runId: `run-${expected.cycleId.replace('/', '-')}`,
        startedAt: '2026-05-05T09:00:00.000Z',
        startContext:
          expected.cycleId === 'cycle/research' || expected.cycleId === 'cycle/refactoring'
            ? {
                scopeLabel: 'Scoped workflow',
                intent: 'Keep the cycle aligned to the selected intent.',
                targetMode: 'manual'
              }
            : undefined
      });
      const flowIds = cycle.steps.map((step) => step.flowId);

      expect(flowIds, expected.cycleId).toEqual(expected.steps);
      expect(
        flowIds.filter(
          (flowId) =>
            expected.forbiddenExact.includes(flowId) ||
            expected.forbiddenPrefixes.some((prefix) => flowId.startsWith(prefix))
        ),
        expected.cycleId
      ).toEqual([]);
    }
  });

  it('recommends cycle starts when initialized and current cycle steps when active', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-meta-next-'));
    const before = await getReviewOpsMetaNext({
      workspaceRoot,
      initialized: false
    });

    expect(before.nextActions[0]?.flowId).toBe('project/init');

    await initializeReviewOpsProject({ workspaceRoot });
    const initialized = await getReviewOpsMetaNext({
      workspaceRoot,
      initialized: true
    });

    expect(initialized.nextActions.map((action) => action.flowId)).toEqual(['project/context']);

    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript'],
        reviewPolicy: ['Preview before publish.']
      }
    });
    const configured = await getReviewOpsMetaNext({
      workspaceRoot,
      initialized: true
    });

    expect(configured.nextActions.map((action) => action.flowId)).toEqual([
      'cycle/mr-review',
      'cycle/comment-response',
      'cycle/fix-review',
      'cycle/research',
      'cycle/refactoring',
      'cycle/field-report'
    ]);

    const cycle = createReviewOpsCycle({
      cycleId: 'cycle/comment-response',
      runId: 'run-comment-cycle',
      startedAt: '2026-05-05T09:10:00.000Z'
    });
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: cycle
    });

    const active = await getReviewOpsMetaNext({
      workspaceRoot,
      initialized: true
    });

    expect(active.currentCycle?.cycleId).toBe('cycle/comment-response');
    expect(active.nextActions[0]?.flowId).toBe('provider/fetch-review');
  });

  it('writes meta next artifacts and completes cycle state without external services', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-meta-artifacts-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript'],
        reviewPolicy: ['Preview before publish.']
      }
    });
    const fieldReportCycle = createReviewOpsCycle({
      cycleId: 'cycle/field-report',
      runId: 'run-field-cycle',
      startedAt: '2026-05-05T09:20:00.000Z'
    });

    expect(fieldReportCycle.nextActions[0]?.flowId).toBe('knowledge/capture-candidates');

    const completed = advanceReviewOpsCycle(
      fieldReportCycle,
      {
        completedFlowIds: ['knowledge/capture-candidates', 'skill/evidence-capture', 'field/report', 'meta/next'],
        advancedAt: '2026-05-05T09:30:00.000Z'
      }
    );
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: completed
    });

    const result = await buildMetaNextArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      workspaceRoot,
      runId: 'run-meta-next',
      initialized: true,
      now: () => new Date('2026-05-05T09:31:00.000Z')
    });

    expect(result.metaNext.currentCycle?.status).toBe('completed');
    expect(result.metaNext.nextActions[0]?.flowId).toBe('cycle/mr-review');
    await expect(readFile(path.join(workspaceRoot, result.artifacts.nextActions.path), 'utf8')).resolves.toContain(
      'Start MR review cycle'
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.currentCycle.path), 'utf8')).resolves.toContain(
      'cycle/field-report'
    );
  });

  it('recovers imported response completion from existing artifacts', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-meta-response-recover-'));
    await initializeReviewOpsProject({ workspaceRoot });
    const cycle = advanceReviewOpsCycle(
      createReviewOpsCycle({
        cycleId: 'cycle/mr-review',
        runId: 'run-mr-cycle',
        startedAt: '2026-01-01T00:00:00.000Z'
      }),
      {
        completedFlowIds: ['review/select-target', 'diff/review'],
        advancedAt: '2026-01-01T00:05:00.000Z'
      }
    );
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: cycle
    });
    await importReviewResponseArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run-response',
      rawResponse: `\`\`\`json
{
  "findings": [{ "title": "Missing regression test", "category": "test", "severity": "major" }],
  "actionPlan": [{ "title": "Add regression test", "priority": "P1" }]
}
\`\`\``
    });

    const metaNext = await getReviewOpsMetaNext({
      workspaceRoot,
      initialized: true
    });
    const recovered = await loadCurrentReviewOpsCycle(workspaceRoot);

    expect(metaNext.nextActions[0]?.flowId).toBe('review/action-plan');
    expect(recovered?.steps.find((step) => step.flowId === 'response/import')?.status).toBe('completed');
    expect(recovered?.steps.find((step) => step.flowId === 'response/normalize')?.status).toBe('completed');
    expect(recovered?.steps.find((step) => step.flowId === 'response/normalize')?.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'result.json' })])
    );
  });

  it('does not recover stale response artifacts created before the current cycle', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-meta-response-stale-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await importReviewResponseArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'old-response',
      rawResponse: '- Existing older feedback'
    });
    const cycle = advanceReviewOpsCycle(
      createReviewOpsCycle({
        cycleId: 'cycle/mr-review',
        runId: 'future-cycle',
        startedAt: '2999-01-01T00:00:00.000Z'
      }),
      {
        completedFlowIds: ['review/select-target', 'diff/review'],
        advancedAt: '2999-01-01T00:05:00.000Z'
      }
    );
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: cycle
    });

    const metaNext = await getReviewOpsMetaNext({
      workspaceRoot,
      initialized: true
    });
    const currentCycle = await loadCurrentReviewOpsCycle(workspaceRoot);

    expect(metaNext.nextActions[0]?.flowId).toBe('response/import');
    expect(currentCycle?.steps.find((step) => step.flowId === 'response/import')?.status).toBe('ready');
    expect(currentCycle?.steps.find((step) => step.flowId === 'response/normalize')?.status).toBe('pending');
  });
});
