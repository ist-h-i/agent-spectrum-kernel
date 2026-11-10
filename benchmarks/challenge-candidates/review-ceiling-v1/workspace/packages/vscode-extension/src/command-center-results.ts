import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ReviewOpsCommandCatalogEntry, ReviewOpsMetaStatus } from '@reviewops/core';

import { type ReviewOpsWebviewRunResult } from './command-center.js';
import { localize } from './localization.js';

export interface ReviewOpsWebviewRunCapture {
  openedFiles: Array<{
    workspaceRoot: string;
    relativePath: string;
  }>;
  errorMessage?: string;
}

export function createCommandCenterRunningResult(
  entry: ReviewOpsCommandCatalogEntry | undefined,
  status: ReviewOpsMetaStatus
): ReviewOpsWebviewRunResult {
  return {
    status: 'running',
    title: entry === undefined ? localize('Running ReviewOps command') : localize(entry.label),
    message: localize('ReviewOps is running this flow. Results will appear here.'),
    artifactPaths: [],
    nextActions: status.nextActions.map((action) => ({
      title: action.title,
      flowId: action.flowId,
      reason: action.reason
    }))
  };
}

export async function createCommandCenterRunResult(options: {
  entry: ReviewOpsCommandCatalogEntry | undefined;
  executed: boolean;
  capture: ReviewOpsWebviewRunCapture;
  status: ReviewOpsMetaStatus;
}): Promise<ReviewOpsWebviewRunResult> {
  const { entry, executed, capture, status } = options;
  const artifactPaths = capture.openedFiles.map((file) => file.relativePath);
  const title = entry === undefined ? localize('ReviewOps command') : localize(entry.label);
  const preview = await readCommandCenterArtifactPreview(capture.openedFiles);
  const nextActions = status.nextActions.map((action) => ({
    title: action.title,
    flowId: action.flowId,
    reason: action.reason
  }));

  if (capture.errorMessage !== undefined) {
    return {
      status: 'error',
      title,
      message: capture.errorMessage,
      artifactPaths,
      preview,
      nextActions
    };
  }

  if (!executed) {
    return {
      status: 'warning',
      title,
      message: localize('ReviewOps could not run this Command Center action.'),
      artifactPaths,
      preview,
      nextActions
    };
  }

  const promptReady = artifactPaths.some(isPromptArtifactPath);
  if (promptReady) {
    return {
      status: 'success',
      title,
      message: localize(
        'Prompt is ready. Use it only when you want outside review; otherwise continue with the next step.'
      ),
      artifactPaths,
      preview,
      nextActions
    };
  }

  if (artifactPaths.length > 0) {
    return {
      status: 'success',
      title,
      message: localize('ReviewOps finished and opened {0} result file.', artifactPaths.length),
      artifactPaths,
      preview,
      nextActions
    };
  }

  return {
    status: entry?.kind === 'cycle' ? 'success' : artifactPaths.length === 0 ? 'warning' : 'success',
    title,
    message:
      entry?.kind === 'cycle'
        ? localize('ReviewOps started the cycle and updated the next step.')
        : localize('ReviewOps finished, but this flow did not open a main file.'),
    artifactPaths,
    preview,
    nextActions
  };
}

export function isCommandCenterOpenableFile(relativePath: string): boolean {
  if (!isSafeWorkspaceRelativePath(relativePath)) {
    return false;
  }

  return relativePath.startsWith('.reviewops/out/');
}

export function isSafeWorkspaceRelativePath(relativePath: string): boolean {
  if (path.isAbsolute(relativePath)) {
    return false;
  }

  const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'));
  return normalized === relativePath && !normalized.startsWith('../') && normalized !== '..';
}

function isPromptArtifactPath(relativePath: string): boolean {
  return /(^|[/\\])prompt\.md$/u.test(relativePath);
}

async function readCommandCenterArtifactPreview(
  openedFiles: ReviewOpsWebviewRunCapture['openedFiles']
): Promise<ReviewOpsWebviewRunResult['preview']> {
  const previewFile = openedFiles.find((file) => isPreviewableArtifactPath(file.relativePath));
  if (previewFile === undefined) {
    return undefined;
  }

  try {
    const content = await readFile(path.join(previewFile.workspaceRoot, previewFile.relativePath), 'utf8');
    return {
      path: previewFile.relativePath,
      language: languageForArtifactPath(previewFile.relativePath),
      content: truncatePreviewContent(content)
    };
  } catch (error) {
    return {
      path: previewFile.relativePath,
      language: 'text',
      content: localize('ReviewOps could not read this file preview: {0}', formatError(error))
    };
  }
}

function isPreviewableArtifactPath(relativePath: string): boolean {
  return ['.md', '.txt', '.json', '.jsonl', '.yaml', '.yml'].includes(path.extname(relativePath).toLowerCase());
}

function languageForArtifactPath(relativePath: string): string {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === '.md') {
    return 'markdown';
  }
  if (extension === '.json' || extension === '.jsonl') {
    return 'json';
  }
  if (extension === '.yaml' || extension === '.yml') {
    return 'yaml';
  }
  return 'text';
}

function truncatePreviewContent(content: string, limit = 12_000): string {
  if (content.length <= limit) {
    return content;
  }

  return `${content.slice(0, limit)}\n\n${localize('[Preview truncated]')}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
