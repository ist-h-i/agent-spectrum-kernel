import * as vscode from 'vscode';
import path from 'node:path';

import {
  loadCurrentReviewOpsCycle,
  saveCurrentReviewOpsCycle,
  type ReviewOpsMetaStatus,
  type ReviewTargetRef
} from '@reviewops/core';
import {
  createGitHubPullRequestTargetRef,
  createLocalGitTargetRef
} from '@reviewops/providers';

import type { ReviewOpsCommandExecutionOptions } from './command-center.js';
import { localize } from './localization.js';

export interface LocalGitReviewTargetProvider {
  listReviewTargets(): Promise<Array<{ ref: ReviewTargetRef }>>;
}

export function isReviewTargetRef(value: unknown): value is ReviewTargetRef {
  return (
    isRecord(value) &&
    typeof value.provider === 'string' &&
    typeof value.repository === 'string' &&
    typeof value.id === 'string'
  );
}

export function resolveCurrentCycleTargetOrLocalWorkspace(
  status: ReviewOpsMetaStatus,
  fallbackRepository = path.basename(status.workspaceRoot) || 'current-workspace'
): ReviewTargetRef {
  if (isReviewTargetRef(status.currentCycle?.target)) {
    return status.currentCycle.target;
  }

  return createLocalGitTargetRef({
    repository: fallbackRepository,
    mode: 'working-tree'
  });
}

export function resolvePublishPreviewTarget(
  status: ReviewOpsMetaStatus,
  optionTarget?: ReviewOpsCommandExecutionOptions['githubTarget']
): ReviewTargetRef {
  if (optionTarget?.repository !== undefined && optionTarget.pullRequestNumber !== undefined) {
    try {
      return createGitHubPullRequestTargetRef({
        repository: optionTarget.repository,
        pullRequestNumber: optionTarget.pullRequestNumber
      });
    } catch {
      // Fall back to a local preview target; Webview primary actions should not stop on optional provider details.
    }
  }

  return resolveCurrentCycleTargetOrLocalWorkspace(status);
}

export async function resolveGitHubPullRequestTarget(
  status: ReviewOpsMetaStatus,
  optionTarget?: ReviewOpsCommandExecutionOptions['githubTarget']
): Promise<ReviewTargetRef | undefined> {
  if (optionTarget !== undefined && optionTarget.repository !== undefined && optionTarget.pullRequestNumber !== undefined) {
    return createGitHubPullRequestTargetRef({
      repository: optionTarget.repository,
      pullRequestNumber: optionTarget.pullRequestNumber
    });
  }

  const currentTarget = status.currentCycle?.target;
  if (
    currentTarget !== undefined &&
    'provider' in currentTarget &&
    currentTarget.provider === 'github' &&
    'repository' in currentTarget &&
    'id' in currentTarget
  ) {
    return {
      provider: 'github',
      repository: currentTarget.repository,
      id: currentTarget.id,
      url: currentTarget.url
    };
  }

  return promptGitHubPullRequestTarget();
}

export async function rememberCurrentCycleTarget(workspaceRoot: string, target: ReviewTargetRef): Promise<void> {
  const currentCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
  if (currentCycle === null) {
    return;
  }

  await saveCurrentReviewOpsCycle({
    workspaceRoot,
    currentCycle: {
      ...currentCycle,
      target,
      updatedAt: new Date().toISOString()
    }
  });
}

export async function resolveLocalGitReviewTarget(
  workspaceRoot: string,
  provider: LocalGitReviewTargetProvider,
  options?: ReviewOpsCommandExecutionOptions['localDiff']
): Promise<ReviewTargetRef | undefined> {
  const [defaultTarget] = await provider.listReviewTargets();
  if (defaultTarget === undefined) {
    return undefined;
  }

  const mode = options?.mode ?? 'working-tree';
  if (mode === 'working-tree') {
    return defaultTarget.ref;
  }

  if (mode === 'staged') {
    return createLocalGitTargetRef({
      repository: defaultTarget.ref.repository,
      mode: 'staged'
    });
  }

  const baseRef = options?.baseRef?.trim();
  if (baseRef === undefined || baseRef.length === 0) {
    await vscode.window.showWarningMessage(localize('ReviewOps needs a base ref before preparing a range diff review.'));
    return undefined;
  }

  return createLocalGitTargetRef({
    repository: defaultTarget.ref.repository || path.basename(workspaceRoot),
    mode: 'range',
    baseRef,
    headRef: options?.headRef?.trim() || 'HEAD'
  });
}

async function promptGitHubPullRequestTarget(): Promise<ReviewTargetRef | undefined> {
  const repository = await vscode.window.showInputBox({
    prompt: localize('GitHub repository in owner/repo form.'),
    placeHolder: 'ist-h-i/ReviewOps',
    ignoreFocusOut: true
  });
  if (repository === undefined || repository.trim().length === 0) {
    return undefined;
  }

  const pullRequestNumberText = await vscode.window.showInputBox({
    prompt: localize('GitHub pull request number.'),
    placeHolder: '1',
    ignoreFocusOut: true
  });
  if (pullRequestNumberText === undefined || pullRequestNumberText.trim().length === 0) {
    return undefined;
  }

  const pullRequestNumber = Number(pullRequestNumberText);
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    await vscode.window.showWarningMessage(localize('ReviewOps needs a positive GitHub pull request number.'));
    return undefined;
  }

  return createGitHubPullRequestTargetRef({
    repository,
    pullRequestNumber
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
