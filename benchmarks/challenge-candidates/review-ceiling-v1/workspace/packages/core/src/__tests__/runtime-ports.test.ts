import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileSystemWorkspaceStore,
  advanceCurrentReviewOpsCycleWithRuntime,
  createInMemoryReviewOpsRuntime,
  createReviewOpsCycle,
  initializeReviewOpsProjectWithRuntime,
  isReviewOpsProjectContextConfiguredWithRuntime,
  loadCurrentReviewOpsCycleWithRuntime,
  readReviewOpsMetricsSnapshotWithRuntime,
  recordReviewOpsMetricsEventWithRuntime,
  saveApprovedRuleCandidatesWithRuntime,
  saveCurrentReviewOpsCycleWithRuntime,
  setupReviewOpsProjectContextWithRuntime,
  type RuleCandidate
} from '../index.js';

describe('ReviewOps core runtime ports', () => {
  it('runs project, context, cycle, metrics, and rule usecases without filesystem access', async () => {
    const runtime = createInMemoryReviewOpsRuntime({
      now: new Date('2026-05-05T00:00:00.000Z')
    });

    const init = await initializeReviewOpsProjectWithRuntime({ runtime });
    expect(init.created).toContain('.reviewops/config.yaml');
    await expect(runtime.workspace.readText('.gitignore')).resolves.toContain('.reviewops.local/');

    const context = await setupReviewOpsProjectContextWithRuntime({
      runtime,
      input: {
        technicalStack: ['TypeScript'],
        architecture: ['Core usecases depend on ports, not filesystem adapters.'],
        testPolicy: ['Use in-memory ports for application tests.']
      }
    });
    expect(context.context.context.technicalStack).toEqual(['TypeScript']);
    await expect(isReviewOpsProjectContextConfiguredWithRuntime(runtime)).resolves.toBe(true);

    const cycle = createReviewOpsCycle({
      cycleId: 'cycle/refactoring',
      runId: 'runtime-cycle',
      startedAt: '2026-05-05T00:00:00.000Z'
    });
    await saveCurrentReviewOpsCycleWithRuntime({ runtime, currentCycle: cycle });
    await advanceCurrentReviewOpsCycleWithRuntime({
      runtime,
      completedFlowIds: ['refactor/plan'],
      now: () => new Date('2026-05-05T00:01:00.000Z')
    });
    const advanced = await loadCurrentReviewOpsCycleWithRuntime(runtime);
    expect(advanced?.steps.find((step) => step.flowId === 'refactor/plan')?.status).toBe('completed');

    await recordReviewOpsMetricsEventWithRuntime({
      runtime,
      event: {
        kind: 'review-cycle',
        counts: {
          reviewCycles: 1,
          fixPlanItems: 2
        }
      },
      now: () => new Date('2026-05-05T00:02:00.000Z')
    });
    await expect(readReviewOpsMetricsSnapshotWithRuntime(runtime)).resolves.toMatchObject({
      auto: {
        reviewCycles: 1,
        fixPlanItems: 2
      }
    });

    const rule = createRuleCandidate('runtime-architecture-rule');
    const applied = await saveApprovedRuleCandidatesWithRuntime({
      runtime,
      candidates: [rule],
      approvedCandidateIds: [rule.id],
      now: () => new Date('2026-05-05T00:03:00.000Z')
    });
    expect(applied.saved).toEqual([
      {
        candidateId: rule.id,
        path: '.reviewops/knowledge/architecture-rules.yaml'
      }
    ]);
    await expect(runtime.workspace.readText('.reviewops/knowledge/architecture-rules.yaml')).resolves.toContain(rule.title);
    await expect(runtime.workspace.readText('.reviewops/out/rule-applications.jsonl')).resolves.toContain(rule.id);
  });

  it('keeps filesystem workspace adapter paths inside the workspace', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-fs-runtime-'));
    const store = new FileSystemWorkspaceStore(workspaceRoot);

    await expect(store.writeText('../escape.txt', 'nope')).rejects.toThrow('Workspace path');
    await store.writeText('.reviewops/out/example.txt', 'ok');
    await expect(store.readText('.reviewops/out/example.txt')).resolves.toBe('ok');
  });
});

function createRuleCandidate(id: string): RuleCandidate {
  return {
    id,
    kind: 'architecture-rule',
    title: 'Core usecases depend on ports',
    rationale: 'Application logic should not import filesystem adapters directly.',
    source: {
      flowRunId: 'runtime-cycle'
    },
    scope: 'portable-candidate',
    suggestedRule: {
      title: 'Core usecases depend on ports'
    },
    status: 'new'
  };
}
