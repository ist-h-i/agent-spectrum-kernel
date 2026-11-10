import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { initializeReviewOpsProject } from '../index.js';

describe('project init', () => {
  it('creates ReviewOps shared and local workspace files idempotently', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-init-'));

    const first = await initializeReviewOpsProject({ workspaceRoot });
    const second = await initializeReviewOpsProject({ workspaceRoot });

    await expect(stat(path.join(workspaceRoot, '.reviewops', 'config.yaml'))).resolves.toBeDefined();
    await expect(stat(path.join(workspaceRoot, '.reviewops.local', 'current-cycle.local.json'))).resolves.toBeDefined();
    await expect(stat(path.join(workspaceRoot, '.reviewops', 'out'))).resolves.toBeDefined();
    await expect(stat(path.join(workspaceRoot, '.reviewops', 'metrics', 'review-work.yaml'))).resolves.toBeDefined();
    await expect(stat(path.join(workspaceRoot, '.reviewops', 'knowledge', 'project-debt.yaml'))).resolves.toBeDefined();
    await expect(stat(path.join(workspaceRoot, '.reviewops.local', 'metrics-events.local.jsonl'))).resolves.toBeDefined();
    await expect(readFile(path.join(workspaceRoot, '.gitignore'), 'utf8')).resolves.toContain('.reviewops.local/');
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'config.yaml'), 'utf8')).resolves.toContain(
      'aiExecution: manual-only'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'metrics', 'review-work.yaml'), 'utf8')).resolves.toContain(
      'manual:'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'project/context'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'response/import'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'field/report'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'fix/checklist'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'fix/explain'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'meta/resume'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'meta/readiness'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'cycle/comment-response'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'cycle/research'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'research/action-plan'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'cycle/refactoring'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops', 'commands.json'), 'utf8')).resolves.toContain(
      'refactor/plan'
    );
    await expect(
      readFile(path.join(workspaceRoot, '.reviewops', 'templates', 'prompt-templates.yaml'), 'utf8')
    ).resolves.toContain('diff-review-default');

    expect(first.created).toContain('.reviewops/config.yaml');
    expect(first.created).toContain('.reviewops/metrics');
    expect(first.created).toContain('.reviewops/metrics/review-work.yaml');
    expect(first.created).toContain('.reviewops/knowledge/project-debt.yaml');
    expect(first.created).toContain('.reviewops.local/metrics-events.local.jsonl');
    expect(first.created).toContain('.reviewops');
    expect(second.existing).toContain('.reviewops/config.yaml');
    expect(second.existing).toContain('.reviewops');
    expect(second.existing).toContain('.reviewops.local');
    expect(second.created).not.toContain('.reviewops');
    expect(second.created).not.toContain('.reviewops.local');
    expect(second.updated).not.toContain('.gitignore');
  });
});
