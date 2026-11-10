import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildP0ReadinessArtifacts,
  createP0ManualSmokeStatus,
  createReviewOpsCycle,
  FileSystemArtifactStore,
  getReviewOpsP0Readiness,
  initializeReviewOpsProject,
  saveCurrentReviewOpsCycle,
  setupReviewOpsProjectContext
} from '../index.js';

describe('P0 readiness', () => {
  it('flags repository bootstrap before P0 flows can run', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-p0-readiness-empty-'));

    const report = await getReviewOpsP0Readiness({
      workspaceRoot,
      now: () => new Date('2026-05-05T10:00:00.000Z')
    });

    expect(report.status).toBe('needs-setup');
    expect(report.checks.find((check) => check.areaId === 'repository-bootstrap')).toEqual(
      expect.objectContaining({
        status: 'needs-setup',
        nextActionFlowId: 'project/init'
      })
    );
    expect(report.nextActions[0]?.flowId).toBe('project/init');
  });

  it('keeps project context setup as blocking before P0 cycles can run', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-p0-readiness-context-'));
    await initializeReviewOpsProject({ workspaceRoot });

    const report = await getReviewOpsP0Readiness({
      workspaceRoot,
      now: () => new Date('2026-05-05T10:02:00.000Z')
    });

    expect(report.status).toBe('needs-setup');
    expect(report.checks.find((check) => check.areaId === 'core-foundation')).toEqual(
      expect.objectContaining({
        status: 'needs-setup',
        missing: ['project/context has not been configured.'],
        nextActionFlowId: 'project/context'
      })
    );
    expect(report.nextActions[0]?.flowId).toBe('project/context');
  });

  it('reads project context from files even when a cycle has next actions', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-p0-readiness-cycle-context-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript']
      }
    });
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: createReviewOpsCycle({
        cycleId: 'cycle/mr-review',
        runId: 'run-cycle',
        startedAt: '2026-05-05T10:03:00.000Z'
      })
    });
    await rm(path.join(workspaceRoot, '.reviewops.local', 'project-context.local.yaml'));

    const report = await getReviewOpsP0Readiness({
      workspaceRoot,
      now: () => new Date('2026-05-05T10:04:00.000Z')
    });

    expect(report.status).toBe('needs-setup');
    expect(report.checks.find((check) => check.areaId === 'core-foundation')).toEqual(
      expect.objectContaining({
        status: 'needs-setup',
        nextActionFlowId: 'project/context'
      })
    );
    expect(report.nextActions[0]?.flowId).toBe('project/context');
  });

  it('writes P0 readiness artifacts with the manual VS Code smoke still visible', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-p0-readiness-artifacts-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript'],
        reviewPolicy: ['Preview before publish.']
      }
    });

    const result = await buildP0ReadinessArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      workspaceRoot,
      runId: 'run-readiness',
      now: () => new Date('2026-05-05T10:05:00.000Z')
    });

    expect(result.report.status).toBe('manual-check-required');
    expect(result.report.summary.ready).toBe(8);
    expect(result.report.checks.find((check) => check.areaId === 'vscode-ui')).toEqual(
      expect.objectContaining({
        status: 'manual-check-required'
      })
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.markdown.path), 'utf8')).resolves.toContain(
      'VS Code Extension Host'
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.json.path), 'utf8')).resolves.toContain(
      '"status": "manual-check-required"'
    );
  });

  it('tracks partial manual VS Code smoke progress in readiness artifacts', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-p0-readiness-smoke-progress-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript'],
        reviewPolicy: ['Preview before publish.']
      }
    });

    const result = await buildP0ReadinessArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      workspaceRoot,
      runId: 'run-smoke-progress',
      manualSmokeStepIds: ['initialize-project', 'status-command'],
      now: () => new Date('2026-05-05T10:08:00.000Z')
    });
    const vscodeCheck = result.report.checks.find((check) => check.areaId === 'vscode-ui');

    expect(vscodeCheck).toEqual(
      expect.objectContaining({
        status: 'manual-check-required',
        manualSmoke: expect.objectContaining({
          verified: false
        })
      })
    );
    expect(vscodeCheck?.manualSmoke?.steps.map((step) => [step.id, step.status])).toEqual([
      ['initialize-project', 'verified'],
      ['project-context', 'pending'],
      ['status-command', 'verified'],
      ['next-action', 'pending'],
      ['local-diff-review', 'pending'],
      ['artifact-views', 'pending']
    ]);
    await expect(readFile(path.join(workspaceRoot, result.artifacts.markdown.path), 'utf8')).resolves.toContain(
      '- [ ] Run Next Action and confirm guided flow handoff'
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.markdown.path), 'utf8')).resolves.toContain(
      '- [ ] Run Prepare Local Diff Review and confirm a prompt artifact opens'
    );
  });

  it('can be marked ready once the manual VS Code smoke is verified', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-p0-readiness-ready-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript'],
        reviewPolicy: ['Preview before publish.']
      }
    });

    const report = await getReviewOpsP0Readiness({
      workspaceRoot,
      manualSmokeVerified: true,
      now: () => new Date('2026-05-05T10:10:00.000Z')
    });

    expect(report.status).toBe('ready');
    expect(report.summary.ready).toBe(report.summary.total);
    expect(report.checks.find((check) => check.areaId === 'vscode-ui')?.manualSmoke).toEqual(
      createP0ManualSmokeStatus({ manualSmokeVerified: true })
    );
    expect(report.nextActions[0]?.flowId).toBe('cycle/mr-review');
  });
});
