import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileSystemArtifactStore, buildReviewPromptArtifacts, renderReviewPrompt } from '../index.js';

const sampleDiff = `diff --git a/src/example.ts b/src/example.ts
+export const value = 1;
`;

describe('review prompt renderer', () => {
  it('renders a manual-only ReviewOps prompt that declares included information types', () => {
    const result = renderReviewPrompt({
      input: {
        diff: sampleDiff,
        projectContext: 'Node TypeScript package.',
        localRules: ['Keep core independent from VS Code APIs.'],
        portableRules: ['Prefer preview-first publishing.'],
        focus: ['architecture boundary']
      },
      generatedAt: '2026-05-05T00:00:00.000Z',
      runId: 'run-1'
    });

    expect(result.promptMarkdown).toContain('# ReviewOps Prompt');
    expect(result.promptMarkdown).toContain('ReviewOps only prepares this prompt and stores imported responses');
    expect(result.inputSummaryMarkdown).toContain('## Information Types Included');
    expect(result.inputSummaryMarkdown).toContain('- diff');
    expect(result.inputSummaryMarkdown).toContain('- local rules');
    expect(result.metadata.aiNetworkAccess).toBe(false);
    expect(result.metadata.informationTypes).toContain('user-selected focus');
  });

  it('writes prompt, input summary, and metadata artifacts', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-prompt-'));
    const store = new FileSystemArtifactStore(workspaceRoot);

    const result = await buildReviewPromptArtifacts({
      artifactStore: store,
      runId: 'run-1',
      input: { diff: sampleDiff },
      now: () => new Date('2026-05-05T00:00:00.000Z')
    });

    expect(result.artifacts.prompt.path).toBe(path.join('.reviewops', 'out', 'diff-review', 'run-1', 'prompt.md'));
    await expect(readFile(path.join(workspaceRoot, result.artifacts.prompt.path), 'utf8')).resolves.toContain(
      '# ReviewOps Prompt'
    );
    await expect(readFile(path.join(workspaceRoot, result.artifacts.metadata.path), 'utf8')).resolves.toContain(
      '"aiNetworkAccess": false'
    );
  });

  it('renders scoped investigation context without pretending it is a git diff', () => {
    const result = renderReviewPrompt({
      input: {
        diff: 'ReviewOps scoped cycle context:\n\nScope: auth flow\nIntent: identify login risks',
        focus: ['Scope: auth flow', 'Intent: identify login risks']
      },
      generatedAt: '2026-05-05T00:00:00.000Z'
    });

    expect(result.inputSummaryMarkdown).toContain('- review input');
    expect(result.inputSummaryMarkdown).toContain('```text\n');
    expect(result.promptMarkdown).toContain('supplied diff or investigation context');
  });

  it('keeps markdown code fences inside diff input from closing the prompt fence', () => {
    const result = renderReviewPrompt({
      input: {
        diff: [
          'diff --git a/README.md b/README.md',
          '+```ts',
          '+export const value = 1;',
          '+```'
        ].join('\n')
      },
      generatedAt: '2026-05-05T00:00:00.000Z'
    });

    expect(result.inputSummaryMarkdown).toContain('````diff\n');
    expect(result.inputSummaryMarkdown).toContain('+```ts');
    expect(result.inputSummaryMarkdown).toContain('\n````\n');
  });
});
