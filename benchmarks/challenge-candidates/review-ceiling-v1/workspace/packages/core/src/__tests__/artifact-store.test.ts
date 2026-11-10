import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArtifactPathError, FileSystemArtifactStore, openFlowArtifactContent, toFlowSlug } from '../index.js';

describe('artifact store', () => {
  it('writes flow artifacts under .reviewops/out/<flow-slug>/<run-id>', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-artifacts-'));
    const store = new FileSystemArtifactStore(workspaceRoot);

    const ref = await store.write({
      flowId: 'meta/status',
      runId: 'run-1',
      name: 'status.json',
      kind: 'json',
      content: '{"ok":true}\n',
      createdAt: '2026-05-05T00:00:00.000Z'
    });

    expect(ref.path).toBe(path.join('.reviewops', 'out', 'meta-status', 'run-1', 'status.json'));
    await expect(readFile(path.join(workspaceRoot, ref.path), 'utf8')).resolves.toBe('{"ok":true}\n');
    await expect(store.read(ref)).resolves.toBe('{"ok":true}\n');
  });


  it('opens stored artifact content for UI callers without VS Code APIs', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-artifacts-'));
    const store = new FileSystemArtifactStore(workspaceRoot);
    const ref = await store.write({
      flowId: 'diff/review',
      runId: 'run-1',
      name: 'prompt.md',
      kind: 'markdown',
      content: '# ReviewOps Prompt\n',
      createdAt: '2026-05-05T00:00:00.000Z'
    });

    await expect(openFlowArtifactContent(store, ref)).resolves.toMatchObject({
      displayName: 'prompt.md',
      kind: 'markdown',
      content: '# ReviewOps Prompt\n'
    });
  });

  it('normalizes flow ids and rejects artifact path traversal', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-artifacts-'));
    const store = new FileSystemArtifactStore(workspaceRoot);

    expect(toFlowSlug('review/action-plan')).toBe('review-action-plan');
    await expect(
      store.write({
        flowId: 'meta/status',
        runId: 'run-1',
        name: '../status.json',
        kind: 'json',
        content: '{}',
        createdAt: '2026-05-05T00:00:00.000Z'
      })
    ).rejects.toThrow(ArtifactPathError);
  });
});
