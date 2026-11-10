import type { ArtifactStore } from '../ports/artifact-store.js';
import type { FlowArtifactRef } from '../types.js';
import { normalizeReviewResponse, type NormalizeResult } from './normalize.js';

export interface ImportReviewResponseOptions {
  artifactStore: ArtifactStore;
  runId: string;
  rawResponse: string;
  flowId?: string;
  now?: () => Date;
}

export interface ImportReviewResponseResult {
  normalizeResult: NormalizeResult;
  artifacts: {
    rawResponse: FlowArtifactRef;
    resultMarkdown: FlowArtifactRef;
    resultJson: FlowArtifactRef;
    reviewFindings: FlowArtifactRef;
    actionPlan: FlowArtifactRef;
    replyDrafts: FlowArtifactRef;
    knowledgeCandidates: FlowArtifactRef;
    ruleCandidates: FlowArtifactRef;
  };
}

const defaultFlowId = 'response/import';

export async function importReviewResponseArtifacts(
  options: ImportReviewResponseOptions
): Promise<ImportReviewResponseResult> {
  const flowId = options.flowId ?? defaultFlowId;
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const normalizeResult = normalizeReviewResponse(options.rawResponse);
  const rawResponse = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'response.raw.md',
    kind: 'markdown',
    content: ensureTrailingNewline(options.rawResponse),
    createdAt
  });
  const resultMarkdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'result.md',
    kind: 'markdown',
    content: normalizeResult.resultMarkdown,
    createdAt
  });
  const resultJson = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'result.json',
    kind: 'json',
    content: toJson({
      success: normalizeResult.success,
      structured: normalizeResult.structured,
      requiresUserEdit: normalizeResult.requiresUserEdit,
      warnings: normalizeResult.warnings,
      resultJson: normalizeResult.resultJson
    }),
    createdAt
  });
  const reviewFindings = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'review-findings.json',
    kind: 'json',
    content: toJson(normalizeResult.reviewFindings),
    createdAt
  });
  const actionPlan = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'action-plan.seed.json',
    kind: 'json',
    content: toJson(normalizeResult.actionPlan),
    createdAt
  });
  const replyDrafts = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'reply-drafts.seed.json',
    kind: 'json',
    content: toJson(normalizeResult.replyDrafts),
    createdAt
  });
  const knowledgeCandidates = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'knowledge-candidates.json',
    kind: 'json',
    content: toJson(normalizeResult.knowledgeCandidates),
    createdAt
  });
  const ruleCandidates = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'rule-candidates.json',
    kind: 'json',
    content: toJson(normalizeResult.ruleCandidates),
    createdAt
  });

  return {
    normalizeResult,
    artifacts: {
      rawResponse,
      resultMarkdown,
      resultJson,
      reviewFindings,
      actionPlan,
      replyDrafts,
      knowledgeCandidates,
      ruleCandidates
    }
  };
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}
