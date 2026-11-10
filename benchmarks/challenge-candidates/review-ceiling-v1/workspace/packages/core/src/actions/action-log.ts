import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';
import type { ReviewOpsCoreRuntime } from '../ports/runtime.js';
import type { IssueRef, PublishDraft, ReviewProviderKind } from '../types.js';

export interface ReviewOpsActionLogEntry {
  id: string;
  createdAt: string;
  provider: ReviewProviderKind | IssueRef['provider'];
  mode: PublishDraft['mode'];
  targetId: string;
  draftId: string;
  status: 'posted' | 'failed' | 'preview-required' | 'unsupported';
  url?: string;
}

export interface RecordReviewOpsActionOptions {
  workspaceRoot: string;
  entry: ReviewOpsActionLogEntry;
}

export interface RecordReviewOpsActionWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  entry: ReviewOpsActionLogEntry;
}

const actionLogPath = '.reviewops/out/actions.jsonl';

export async function recordReviewOpsAction(options: RecordReviewOpsActionOptions): Promise<string> {
  return recordReviewOpsActionWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    entry: options.entry
  });
}

export async function recordReviewOpsActionWithRuntime(options: RecordReviewOpsActionWithRuntimeOptions): Promise<string> {
  assertSafeActionId(options.entry.id, 'action id');
  assertSafeActionId(options.entry.draftId, 'draft id');

  await options.runtime.actionLogStore.appendText(actionLogPath, `${JSON.stringify(options.entry)}\n`);

  return actionLogPath;
}

function assertSafeActionId(value: string, label: string): void {
  if (value.trim().length === 0 || value.includes('\n') || value.includes('\r')) {
    throw new Error(`Invalid ReviewOps ${label}: ${value}`);
  }
}
