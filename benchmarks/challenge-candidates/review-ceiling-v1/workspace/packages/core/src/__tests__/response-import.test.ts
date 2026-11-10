import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileSystemArtifactStore, importReviewResponseArtifacts } from '../index.js';

describe('response import artifacts', () => {
  it('stores raw response and normalized skeleton artifacts', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-response-'));
    const store = new FileSystemArtifactStore(workspaceRoot);

    const result = await importReviewResponseArtifacts({
      artifactStore: store,
      runId: 'run-1',
      rawResponse: `\`\`\`json
{"findings":[{"title":"Major bug risk","category":"bug-risk","severity":"major"}],"actionPlan":[{"title":"Fix guard","priority":"P1"}],"replyDrafts":[{"target":"review:101","body":"I will fix the guard."}]}
\`\`\``,
      now: () => new Date('2026-05-05T00:00:00.000Z')
    });

    expect(result.normalizeResult.structured).toBe(true);
    expect(result.artifacts.rawResponse.path).toBe(
      path.join('.reviewops', 'out', 'response-import', 'run-1', 'response.raw.md')
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.resultMarkdown.path), 'utf8')).resolves.toContain(
      '# ReviewOps Result'
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.reviewFindings.path), 'utf8')).resolves.toContain(
      'Major bug risk'
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.actionPlan.path), 'utf8')).resolves.toContain(
      'Fix guard'
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.replyDrafts.path), 'utf8')).resolves.toContain(
      'review:101'
    );
  });
});
