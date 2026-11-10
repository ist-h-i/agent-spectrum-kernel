import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { recordReviewOpsAction } from '../index.js';

describe('action log', () => {
  it('appends provider publish results to .reviewops/out/actions.jsonl', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-action-log-'));

    const relativePath = await recordReviewOpsAction({
      workspaceRoot,
      entry: {
        id: 'act_20260505_001',
        createdAt: '2026-05-05T06:30:00.000Z',
        provider: 'github',
        mode: 'summary-comment',
        targetId: 'pull:1',
        draftId: 'draft_20260505_pull-1',
        status: 'posted',
        url: 'https://github.com/ist-h-i/ReviewOps/pull/1#issuecomment-1'
      }
    });

    expect(relativePath).toBe('.reviewops/out/actions.jsonl');
    await expect(readFile(path.join(workspaceRoot, relativePath), 'utf8')).resolves.toContain(
      '"provider":"github"'
    );
  });
});
