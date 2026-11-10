import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';
import type { ReviewOpsCoreRuntime } from '../ports/runtime.js';
import { runtimeNow } from '../ports/runtime.js';
import { parseYamlDocument, stringifyYamlDocument } from '../serialization/yaml.js';

export type ReviewOpsMetricsEventKind =
  | 'review-cycle'
  | 'response-import'
  | 'comment-triage'
  | 'action-plan'
  | 'fix-plan'
  | 'fix-verification'
  | 'reply-draft'
  | 'publish-preview'
  | 'rules-apply'
  | 'knowledge-capture'
  | 'skill-evidence'
  | 'field-report';

export interface ReviewOpsMetricsEventCounts {
  reviewCycles?: number;
  triageComments?: number;
  fixPlanItems?: number;
  replyDrafts?: number;
  previewPosts?: number;
  ruleCandidates?: number;
  knowledgeCandidates?: number;
  unresolvedRisks?: number;
  addedTests?: number;
  skillEvidenceSignals?: number;
}

export interface ReviewOpsMetricsAutoSummary {
  reviewCycles: number;
  triageComments: number;
  fixPlanItems: number;
  replyDrafts: number;
  previewPosts: number;
  ruleCandidates: number;
  knowledgeCandidates: number;
  unresolvedRisks: number;
  addedTests: number;
  skillEvidenceSignals: number;
  [key: string]: unknown;
}

export interface ReviewOpsMetricsManualSection {
  notes: string[];
  exclusions: string[];
  fieldDecisions: string[];
  supplements: string[];
  [key: string]: unknown;
}

export interface ReviewOpsMetricsSnapshotFile {
  version: 1;
  updatedAt: string | null;
  auto: ReviewOpsMetricsAutoSummary;
  manual: ReviewOpsMetricsManualSection;
  [key: string]: unknown;
}

export interface ReviewOpsMetricsEvent {
  version: 1;
  kind: ReviewOpsMetricsEventKind;
  createdAt: string;
  flowId?: string;
  runId?: string;
  counts?: ReviewOpsMetricsEventCounts;
  artifactPaths?: string[];
}

export type ReviewOpsMetricsEventInput = Omit<ReviewOpsMetricsEvent, 'version' | 'createdAt'> &
  Partial<Pick<ReviewOpsMetricsEvent, 'version' | 'createdAt'>>;

export interface UpdateReviewOpsMetricsSnapshotOptions {
  workspaceRoot: string;
  event: ReviewOpsMetricsEventInput;
  now?: () => Date;
}

export interface UpdateReviewOpsMetricsSnapshotWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  event: ReviewOpsMetricsEventInput;
  now?: () => Date;
}

export type RecordReviewOpsMetricsEventOptions = UpdateReviewOpsMetricsSnapshotOptions;
export type RecordReviewOpsMetricsEventWithRuntimeOptions = UpdateReviewOpsMetricsSnapshotWithRuntimeOptions;

export interface RecordReviewOpsMetricsEventResult {
  snapshotPath: string;
  eventLogPath: string;
  snapshot: ReviewOpsMetricsSnapshotFile;
  event: ReviewOpsMetricsEvent;
}

export const reviewOpsMetricsSnapshotPath = '.reviewops/metrics/review-work.yaml';

const localMetricsEventsPath = 'metrics-events.local.jsonl';
export const reviewOpsMetricsEventLogPath = `.reviewops.local/${localMetricsEventsPath}`;
const countKeys = [
  'reviewCycles',
  'triageComments',
  'fixPlanItems',
  'replyDrafts',
  'previewPosts',
  'ruleCandidates',
  'knowledgeCandidates',
  'unresolvedRisks',
  'addedTests',
  'skillEvidenceSignals'
] as const satisfies ReadonlyArray<keyof ReviewOpsMetricsAutoSummary>;

export function createDefaultReviewOpsMetricsSnapshot(): ReviewOpsMetricsSnapshotFile {
  return {
    version: 1,
    updatedAt: null,
    auto: createEmptyAutoSummary(),
    manual: {
      notes: [],
      exclusions: [],
      fieldDecisions: [],
      supplements: []
    }
  };
}

export function renderDefaultReviewOpsMetricsSnapshot(): string {
  return stringifyYamlDocument(createDefaultReviewOpsMetricsSnapshot());
}

export async function readReviewOpsMetricsSnapshot(workspaceRoot: string): Promise<ReviewOpsMetricsSnapshotFile> {
  return readReviewOpsMetricsSnapshotWithRuntime(createFileSystemReviewOpsRuntime(workspaceRoot));
}

export async function readReviewOpsMetricsSnapshotWithRuntime(runtime: ReviewOpsCoreRuntime): Promise<ReviewOpsMetricsSnapshotFile> {
  const content = await runtime.metricsStore.readText(reviewOpsMetricsSnapshotPath);
  return content === undefined ? createDefaultReviewOpsMetricsSnapshot() : normalizeSnapshot(parseYamlDocument(content, reviewOpsMetricsSnapshotPath));
}

export async function updateReviewOpsMetricsSnapshot(
  options: UpdateReviewOpsMetricsSnapshotOptions
): Promise<ReviewOpsMetricsSnapshotFile> {
  return updateReviewOpsMetricsSnapshotWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    event: options.event,
    now: options.now
  });
}

export async function updateReviewOpsMetricsSnapshotWithRuntime(
  options: UpdateReviewOpsMetricsSnapshotWithRuntimeOptions
): Promise<ReviewOpsMetricsSnapshotFile> {
  const event = normalizeMetricsEvent(options.event, runtimeNow(options.runtime, options.now).toISOString());
  const current = await readReviewOpsMetricsSnapshotWithRuntime(options.runtime);
  const snapshot: ReviewOpsMetricsSnapshotFile = {
    ...current,
    version: 1,
    updatedAt: event.createdAt,
    auto: incrementAutoSummary(current.auto, event.counts ?? {}),
    manual: current.manual
  };

  await options.runtime.metricsStore.writeText(reviewOpsMetricsSnapshotPath, stringifyYamlDocument(snapshot));

  return snapshot;
}

export async function recordReviewOpsMetricsEvent(
  options: RecordReviewOpsMetricsEventOptions
): Promise<RecordReviewOpsMetricsEventResult> {
  return recordReviewOpsMetricsEventWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    event: options.event,
    now: options.now
  });
}

export async function recordReviewOpsMetricsEventWithRuntime(
  options: RecordReviewOpsMetricsEventWithRuntimeOptions
): Promise<RecordReviewOpsMetricsEventResult> {
  const event = normalizeMetricsEvent(options.event, runtimeNow(options.runtime, options.now).toISOString());
  const eventLogPath = await appendLocalMetricsEvent(options.runtime, event);
  const snapshot = await updateReviewOpsMetricsSnapshotWithRuntime({
    runtime: options.runtime,
    event,
    now: () => new Date(event.createdAt)
  });

  return {
    snapshotPath: reviewOpsMetricsSnapshotPath,
    eventLogPath,
    snapshot,
    event
  };
}

function createEmptyAutoSummary(): ReviewOpsMetricsAutoSummary {
  return {
    reviewCycles: 0,
    triageComments: 0,
    fixPlanItems: 0,
    replyDrafts: 0,
    previewPosts: 0,
    ruleCandidates: 0,
    knowledgeCandidates: 0,
    unresolvedRisks: 0,
    addedTests: 0,
    skillEvidenceSignals: 0
  };
}

function normalizeSnapshot(value: unknown): ReviewOpsMetricsSnapshotFile {
  const source = isRecord(value) ? value : {};

  return {
    ...source,
    version: 1,
    updatedAt: isString(source.updatedAt) || source.updatedAt === null ? source.updatedAt : null,
    auto: normalizeAutoSummary(source.auto),
    manual: normalizeManualSection(source.manual)
  };
}

function normalizeAutoSummary(value: unknown): ReviewOpsMetricsAutoSummary {
  const source = isRecord(value) ? value : {};
  const summary = {
    ...source,
    ...createEmptyAutoSummary()
  };

  for (const key of countKeys) {
    summary[key] = readCount(source[key]);
  }

  return summary;
}

function normalizeManualSection(value: unknown): ReviewOpsMetricsManualSection {
  const source = isRecord(value) ? value : {};

  return {
    ...source,
    notes: normalizeStringList(source.notes),
    exclusions: normalizeStringList(source.exclusions),
    fieldDecisions: normalizeStringList(source.fieldDecisions),
    supplements: normalizeStringList(source.supplements)
  };
}

function normalizeMetricsEvent(event: ReviewOpsMetricsEventInput, fallbackCreatedAt: string): ReviewOpsMetricsEvent {
  return {
    version: 1,
    kind: event.kind,
    createdAt: event.createdAt ?? fallbackCreatedAt,
    ...(isString(event.flowId) ? { flowId: event.flowId } : {}),
    ...(isString(event.runId) ? { runId: event.runId } : {}),
    counts: normalizeEventCounts(event.counts),
    artifactPaths: normalizeStringList(event.artifactPaths)
  };
}

function normalizeEventCounts(counts: ReviewOpsMetricsEventCounts | undefined): ReviewOpsMetricsEventCounts {
  const source = counts ?? {};
  const normalized: ReviewOpsMetricsEventCounts = {};

  for (const key of countKeys) {
    const count = readCount(source[key]);
    if (count > 0) {
      normalized[key] = count;
    }
  }

  return normalized;
}

function incrementAutoSummary(
  summary: ReviewOpsMetricsAutoSummary,
  counts: ReviewOpsMetricsEventCounts
): ReviewOpsMetricsAutoSummary {
  const next = {
    ...summary
  };

  for (const key of countKeys) {
    next[key] = readCount(summary[key]) + readCount(counts[key]);
  }

  return next;
}

async function appendLocalMetricsEvent(runtime: ReviewOpsCoreRuntime, event: ReviewOpsMetricsEvent): Promise<string> {
  await runtime.metricsStore.appendText(reviewOpsMetricsEventLogPath, `${JSON.stringify(event)}\n`);

  return reviewOpsMetricsEventLogPath;
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isString).map((item) => item.trim()).filter((item) => item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
