import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { FileSystemArtifactStore, buildReviewPromptArtifacts } from '@reviewops/core';
import { describe, expect, it } from 'vitest';

import {
  createLocalGitReviewProvider,
  createLocalGitTargetRef,
  createReviewPromptInputFromLocalGitDiff
} from '../index.js';

const execFileAsync = promisify(execFile);

describe('local git review provider', () => {
  it('collects working tree branch info, changed files, diff, and prompt input', async () => {
    const workspaceRoot = await createGitFixture();
    await mkdir(path.join(workspaceRoot, 'tests'), { recursive: true });
    await writeFile(path.join(workspaceRoot, 'src/app.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(path.join(workspaceRoot, 'src/new-feature.ts'), 'export const added = true;\n', 'utf8');
    await writeFile(path.join(workspaceRoot, 'tests/app.test.ts'), 'import "../src/app";\n', 'utf8');
    await runGit(workspaceRoot, ['add', 'tests/app.test.ts']);

    const provider = createLocalGitReviewProvider({ workspaceRoot });
    const [target] = await provider.listReviewTargets();
    const diff = await provider.getDiff(target.ref);
    const promptInput = createReviewPromptInputFromLocalGitDiff(diff);
    const store = new FileSystemArtifactStore(workspaceRoot);
    const promptArtifacts = await buildReviewPromptArtifacts({
      artifactStore: store,
      runId: 'local-git-run',
      input: promptInput,
      now: () => new Date('2026-05-05T00:00:00.000Z')
    });

    expect(target.ref.provider).toBe('local-git');
    expect(target.ref.id).toBe('working-tree');
    expect(target.sourceBranch).toBe('main');
    expect(diff.summary.changedFiles).toBe(3);
    expect(diff.summary.additions).toBeGreaterThanOrEqual(3);
    expect(diff.summary.backendTouched).toBe(true);
    expect(diff.summary.testTouched).toBe(true);
    expect(diff.files.map((file) => file.path)).toEqual(['src/app.ts', 'tests/app.test.ts', 'src/new-feature.ts']);
    expect(promptInput.diff).toContain('diff --git a/src/app.ts b/src/app.ts');
    expect(promptInput.diff).toContain('diff --git a/src/new-feature.ts b/src/new-feature.ts');
    expect(promptInput.notes).toContain('Local git diff summary');
    await expect(readFile(path.join(workspaceRoot, promptArtifacts.artifacts.prompt.path), 'utf8')).resolves.toContain(
      'ReviewOps Prompt'
    );
  });

  it('supports explicit commit range targets', async () => {
    const workspaceRoot = await createGitFixture();
    await writeFile(path.join(workspaceRoot, 'README.md'), '# ReviewOps\n\nLocal provider test.\n', 'utf8');
    await runGit(workspaceRoot, ['add', 'README.md']);
    await runGit(workspaceRoot, ['commit', '-m', 'docs: update readme']);

    const provider = createLocalGitReviewProvider({ workspaceRoot });
    const rangeTarget = createLocalGitTargetRef({
      repository: 'reviewops-local-fixture',
      baseRef: 'HEAD~1',
      headRef: 'HEAD'
    });
    const target = await provider.getReviewTarget(rangeTarget);
    const diff = await provider.getDiff(rangeTarget);

    expect(target.title).toBe('Local git range HEAD~1...HEAD');
    expect(target.sourceBranch).toBe('HEAD');
    expect(target.targetBranch).toBe('HEAD~1');
    expect(diff.target.id).toBe('range:HEAD~1...HEAD');
    expect(diff.summary.docsTouched).toBe(true);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]?.path).toBe('README.md');
  });
});

async function createGitFixture(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-local-git-'));
  await mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
  await runGit(workspaceRoot, ['init', '--initial-branch=main']);
  await runGit(workspaceRoot, ['config', 'user.email', 'reviewops@example.test']);
  await runGit(workspaceRoot, ['config', 'user.name', 'ReviewOps Test']);
  await writeFile(path.join(workspaceRoot, 'src/app.ts'), 'export const value = 1;\n', 'utf8');
  await runGit(workspaceRoot, ['add', 'src/app.ts']);
  await runGit(workspaceRoot, ['commit', '-m', 'feat: initial']);
  return workspaceRoot;
}

async function runGit(workspaceRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: workspaceRoot,
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout.toString();
}
