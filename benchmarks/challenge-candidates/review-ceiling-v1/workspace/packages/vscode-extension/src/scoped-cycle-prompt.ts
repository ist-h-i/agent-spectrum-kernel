import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildReviewPromptArtifacts,
  FileSystemArtifactStore,
  type ReviewOpsCycleStartContext,
  type ReviewPromptInput
} from '@reviewops/core';

import { isSafeWorkspaceRelativePath } from './command-center-results.js';
import { createRunId } from './run-id.js';

export async function buildScopedCyclePromptArtifacts(
  workspaceRoot: string,
  startContext: ReviewOpsCycleStartContext,
  flowId?: string
): Promise<Awaited<ReturnType<typeof buildReviewPromptArtifacts>>> {
  const now = new Date();

  return buildReviewPromptArtifacts({
    artifactStore: new FileSystemArtifactStore(workspaceRoot),
    runId: createRunId(now),
    input: await createScopedCyclePromptInput(workspaceRoot, startContext),
    flowId,
    now: () => now
  });
}

export async function createScopedCyclePromptInput(
  workspaceRoot: string,
  startContext: ReviewOpsCycleStartContext
): Promise<ReviewPromptInput> {
  const snapshots =
    startContext.targetMode === 'selected-files'
      ? await readCycleTargetFileSnapshots(workspaceRoot, startContext.targetFiles ?? [])
      : [];

  return {
    diff: renderCyclePromptReviewInput(startContext, snapshots),
    focus: createCycleStartContextFocus(startContext),
    notes: renderCycleStartContextNotes(startContext)
  };
}

export function createCycleStartContextFocus(startContext: ReviewOpsCycleStartContext): string[] {
  return [
    `Scope: ${startContext.scopeLabel}`,
    `Intent: ${startContext.intent}`,
    `Target mode: ${startContext.targetMode}`,
    ...(startContext.targetFiles ?? []).map((file) => `Target file: ${file}`)
  ];
}

export function renderCycleStartContextNotes(startContext: ReviewOpsCycleStartContext): string {
  return [
    'ReviewOps cycle start context:',
    `- Scope: ${startContext.scopeLabel}`,
    `- Intent: ${startContext.intent}`,
    `- Target mode: ${startContext.targetMode}`,
    ...(startContext.targetFiles === undefined || startContext.targetFiles.length === 0
      ? []
      : [`- Target files: ${startContext.targetFiles.join(', ')}`])
  ].join('\n');
}

function renderCyclePromptReviewInput(startContext: ReviewOpsCycleStartContext, snapshots: string[]): string {
  return [
    'ReviewOps scoped cycle context:',
    '',
    `Scope: ${startContext.scopeLabel}`,
    `Intent: ${startContext.intent}`,
    `Target mode: ${startContext.targetMode}`,
    startContext.targetFiles === undefined || startContext.targetFiles.length === 0
      ? 'Target files: not specified'
      : `Target files: ${startContext.targetFiles.join(', ')}`,
    '',
    snapshots.length === 0
      ? 'No local diff or selected file snapshot was available. Use the scope and intent to identify risks, missing context, and concrete next actions.'
      : ['Selected file snapshots:', '', ...snapshots].join('\n\n')
  ].join('\n');
}

async function readCycleTargetFileSnapshots(workspaceRoot: string, targetFiles: string[]): Promise<string[]> {
  const snapshots: string[] = [];

  for (const targetFile of targetFiles.slice(0, 5)) {
    const relativePath = targetFile.trim().replaceAll('\\', '/');
    if (!isSafeWorkspaceRelativePath(relativePath)) {
      snapshots.push(`### ${targetFile}\nSkipped because the path is outside the workspace.`);
      continue;
    }

    try {
      const content = await readFile(path.join(workspaceRoot, relativePath), 'utf8');
      snapshots.push(`### ${relativePath}\n\n${truncateCyclePromptContext(content)}`);
    } catch (error) {
      snapshots.push(`### ${relativePath}\nCould not read this file: ${formatError(error)}`);
    }
  }

  if (targetFiles.length > 5) {
    snapshots.push(`### Additional files\nSkipped ${targetFiles.length - 5} file(s) to keep the prompt reviewable.`);
  }

  return snapshots;
}

function truncateCyclePromptContext(content: string, limit = 16_000): string {
  if (content.length <= limit) {
    return content;
  }

  return `${content.slice(0, limit)}\n\n[File snapshot truncated]`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
