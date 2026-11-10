import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  createReviewActionPlan,
  loadCurrentReviewOpsCycle,
  parseJsonDocument,
  toFlowSlug,
  type ActionPlanItemSeed,
  type FlowArtifactRef,
  type KnowledgeCandidateSeed,
  type ReviewActionPlanItem,
  type ReviewCommentTriage,
  type ReviewFindingSeed,
  type ReviewFixPlan,
  type ReviewFixVerification,
  type ReviewFixVerificationResult,
  type ReviewOpsCurrentCycle,
  type RuleApplicationPayload,
  type RuleCandidate,
} from '@reviewops/core';

const emptyReviewCommentTriage: ReviewCommentTriage = {
  totalComments: 0,
  needsFixCount: 0,
  needsReplyCount: 0,
  informationalCount: 0,
  items: []
};

export type { RuleApplicationPayload } from '@reviewops/core';

export async function loadLatestReviewActionPlan(workspaceRoot: string): Promise<ReviewActionPlanItem[] | undefined> {
  return loadLatestReviewOpsArtifact({
    workspaceRoot,
    flowSlug: 'review-action-plan',
    artifactName: 'action-plan.json',
    parse: parseReviewActionPlan
  });
}

export async function loadLatestImportedActionPlanSeed(
  workspaceRoot: string,
  flowId = 'response/import'
): Promise<ReviewActionPlanItem[] | undefined> {
  const flowSlug = toFlowSlug(flowId);
  const [actionPlanSeeds, findings] = await Promise.all([
    loadLatestReviewOpsArtifact({
      workspaceRoot,
      flowSlug,
      artifactName: 'action-plan.seed.json',
      parse: parseActionPlanItemSeeds
    }),
    loadLatestReviewOpsArtifact({
      workspaceRoot,
      flowSlug,
      artifactName: 'review-findings.json',
      parse: parseReviewFindingSeeds
    })
  ]);
  const actionPlan = createReviewActionPlan({
    triage: emptyReviewCommentTriage,
    actionPlanSeeds: actionPlanSeeds ?? [],
    findings: findings ?? []
  });

  return actionPlan.length > 0 ? actionPlan : undefined;
}

export async function loadLatestReviewFixPlan(workspaceRoot: string, flowId = 'fix/plan'): Promise<ReviewFixPlan | undefined> {
  return loadLatestReviewOpsArtifact({
    workspaceRoot,
    flowSlug: toFlowSlug(flowId),
    artifactName: workPlanArtifactNameForFlow(flowId),
    parse: parseReviewFixPlan
  });
}

export async function loadLatestReviewFixVerification(
  workspaceRoot: string,
  flowId = 'fix/verify'
): Promise<ReviewFixVerification | undefined> {
  return loadLatestReviewOpsArtifact({
    workspaceRoot,
    flowSlug: toFlowSlug(flowId),
    artifactName: workVerifyArtifactNameForFlow(flowId),
    parse: parseReviewFixVerification
  });
}

export async function loadLatestRuleCandidates(workspaceRoot: string): Promise<RuleCandidate[] | undefined> {
  return loadLatestReviewOpsArtifact({
    workspaceRoot,
    flowSlug: 'knowledge-capture-candidates',
    artifactName: 'rule-candidates.json',
    parse: parseRuleCandidates
  });
}

export async function loadLatestRuleApplication(workspaceRoot: string): Promise<RuleApplicationPayload | undefined> {
  return loadLatestReviewOpsArtifact({
    workspaceRoot,
    flowSlug: 'rules-apply',
    artifactName: 'rule-application.json',
    parse: parseRuleApplicationPayload
  });
}

export async function loadLatestKnowledgeCandidateSeeds(
  workspaceRoot: string,
  flowId = 'response/import'
): Promise<KnowledgeCandidateSeed[] | undefined> {
  return loadLatestReviewOpsArtifact({
    workspaceRoot,
    flowSlug: toFlowSlug(flowId),
    artifactName: 'knowledge-candidates.json',
    parse: parseKnowledgeCandidateSeeds
  });
}

export async function loadLatestReviewFindingSeeds(
  workspaceRoot: string,
  flowId = 'response/import'
): Promise<ReviewFindingSeed[] | undefined> {
  return loadLatestReviewOpsArtifact({
    workspaceRoot,
    flowSlug: toFlowSlug(flowId),
    artifactName: 'review-findings.json',
    parse: parseReviewFindingSeeds
  });
}

export async function loadLatestReviewOpsArtifact<T>(options: {
  workspaceRoot: string;
  flowSlug: string;
  artifactName: string;
  parse: (content: string, artifactPath: string) => T;
}): Promise<T | undefined> {
  const currentCycle = await loadCurrentReviewOpsCycle(options.workspaceRoot);
  const cycleArtifact = await loadLatestReviewOpsArtifactFromCycle(options, currentCycle);
  if (cycleArtifact !== undefined) {
    return cycleArtifact;
  }

  const flowDirectory = path.join(options.workspaceRoot, '.reviewops', 'out', options.flowSlug);
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(flowDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  const minimumMtime = currentCycle === null ? undefined : Date.parse(currentCycle.startedAt);
  const candidates: Array<{ value: T; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const artifactPath = path.join(flowDirectory, entry.name, options.artifactName);
    try {
      const [artifactStat, content] = await Promise.all([stat(artifactPath), readFile(artifactPath, 'utf8')]);
      if (minimumMtime !== undefined && !Number.isNaN(minimumMtime) && artifactStat.mtimeMs < minimumMtime) {
        continue;
      }
      candidates.push({
        value: options.parse(content, artifactPath),
        mtimeMs: artifactStat.mtimeMs
      });
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.value;
}

export function parseReviewActionPlan(content: string, artifactPath: string): ReviewActionPlanItem[] {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!Array.isArray(parsed) || !parsed.every(isReviewActionPlanItem)) {
    throw new Error(`ReviewOps action plan artifact is invalid: ${artifactPath}`);
  }

  return parsed;
}

function workPlanArtifactNameForFlow(flowId: string): string {
  return flowId === 'refactor/plan' ? 'refactor-plan.json' : 'fix-plan.json';
}

function workVerifyArtifactNameForFlow(flowId: string): string {
  return flowId === 'refactor/verify' ? 'refactor-verify.json' : 'fix-verify.json';
}

async function loadLatestReviewOpsArtifactFromCycle<T>(
  options: {
    workspaceRoot: string;
    flowSlug: string;
    artifactName: string;
    parse: (content: string, artifactPath: string) => T;
  },
  currentCycle: ReviewOpsCurrentCycle | null
): Promise<T | undefined> {
  if (currentCycle === null) {
    return undefined;
  }

  const candidates: Array<{ value: T; mtimeMs: number }> = [];
  for (const artifactRef of findCycleArtifactRefs(currentCycle, options.flowSlug, options.artifactName)) {
    const artifactPath = resolveWorkspaceArtifactPath(options.workspaceRoot, artifactRef);
    if (artifactPath === undefined) {
      continue;
    }

    try {
      const [artifactStat, content] = await Promise.all([stat(artifactPath), readFile(artifactPath, 'utf8')]);
      candidates.push({
        value: options.parse(content, artifactPath),
        mtimeMs: artifactStat.mtimeMs
      });
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.value;
}

function findCycleArtifactRefs(
  currentCycle: ReviewOpsCurrentCycle,
  flowSlug: string,
  artifactName: string
): FlowArtifactRef[] {
  return currentCycle.steps
    .flatMap((step) => step.artifacts)
    .filter((artifact) => artifact.name === artifactName && artifactMatchesFlowSlug(artifact, flowSlug));
}

function resolveWorkspaceArtifactPath(workspaceRoot: string, artifactRef: FlowArtifactRef): string | undefined {
  const resolvedRoot = path.resolve(workspaceRoot);
  const artifactPath = path.resolve(resolvedRoot, artifactRef.path);
  if (artifactPath !== resolvedRoot && !artifactPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return undefined;
  }

  return artifactPath;
}

function artifactMatchesFlowSlug(artifactRef: FlowArtifactRef, flowSlug: string): boolean {
  if (toFlowSlug(artifactRef.flowId) === flowSlug) {
    return true;
  }

  return artifactRef.path.split(/[\\/]/u).includes(flowSlug);
}

function parseActionPlanItemSeeds(content: string, artifactPath: string): ActionPlanItemSeed[] {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!Array.isArray(parsed) || !parsed.every(isActionPlanItemSeed)) {
    throw new Error(`ReviewOps action plan seed artifact is invalid: ${artifactPath}`);
  }

  return parsed;
}

function parseReviewFindingSeeds(content: string, artifactPath: string): ReviewFindingSeed[] {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!Array.isArray(parsed) || !parsed.every(isReviewFindingSeed)) {
    throw new Error(`ReviewOps review finding artifact is invalid: ${artifactPath}`);
  }

  return parsed;
}

function parseReviewFixPlan(content: string, artifactPath: string): ReviewFixPlan {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!isReviewFixPlan(parsed)) {
    throw new Error(`ReviewOps fix plan artifact is invalid: ${artifactPath}`);
  }

  return parsed;
}

function parseReviewFixVerification(content: string, artifactPath: string): ReviewFixVerification {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!isReviewFixVerification(parsed)) {
    throw new Error(`ReviewOps fix verification artifact is invalid: ${artifactPath}`);
  }

  return parsed;
}

function parseKnowledgeCandidateSeeds(content: string, artifactPath: string): KnowledgeCandidateSeed[] {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!Array.isArray(parsed) || !parsed.every(isKnowledgeCandidateSeed)) {
    throw new Error(`ReviewOps knowledge candidate artifact is invalid: ${artifactPath}`);
  }

  return parsed;
}

function parseRuleCandidates(content: string, artifactPath: string): RuleCandidate[] {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!Array.isArray(parsed) || !parsed.every(isRuleCandidate)) {
    throw new Error(`ReviewOps rule candidate artifact is invalid: ${artifactPath}`);
  }

  return parsed;
}

function parseRuleApplicationPayload(content: string, artifactPath: string): RuleApplicationPayload {
  const parsed = parseArtifactJson(content, artifactPath);
  if (!isRecord(parsed) || !Array.isArray(parsed.saved) || !Array.isArray(parsed.skipped)) {
    throw new Error(`ReviewOps rule application artifact is invalid: ${artifactPath}`);
  }

  const approvedCandidateIds = Array.isArray(parsed.approvedCandidateIds)
    ? parsed.approvedCandidateIds.filter((candidateId): candidateId is string => typeof candidateId === 'string')
    : [];
  const saved = parsed.saved.filter(isSavedRuleApplication);
  const skipped = parsed.skipped.filter(isSkippedRuleApplication);
  if (saved.length !== parsed.saved.length || skipped.length !== parsed.skipped.length) {
    throw new Error(`ReviewOps rule application artifact is invalid: ${artifactPath}`);
  }

  return {
    approvedCandidateIds,
    saved,
    skipped,
    actionLogPath:
      typeof parsed.actionLogPath === 'string'
        ? parsed.actionLogPath
        : path.join('.reviewops', 'out', 'rule-applications.jsonl')
  };
}

function parseArtifactJson(content: string, artifactPath: string): unknown {
  return parseJsonDocument(content, `ReviewOps artifact ${artifactPath}`);
}

function isActionPlanItemSeed(value: unknown): value is ActionPlanItemSeed {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.priority === 'string' &&
    Array.isArray(value.steps) &&
    value.steps.every((step) => typeof step === 'string')
  );
}

function isReviewFindingSeed(value: unknown): value is ReviewFindingSeed {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.category === 'string' &&
    typeof value.severity === 'string' &&
    typeof value.summary === 'string'
  );
}

function isReviewActionPlanItem(value: unknown): value is ReviewActionPlanItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.priority === 'string' &&
    typeof value.source === 'string' &&
    Array.isArray(value.relatedCommentIds) &&
    value.relatedCommentIds.every((commentId) => typeof commentId === 'string') &&
    Array.isArray(value.steps) &&
    value.steps.every((step) => typeof step === 'string') &&
    Array.isArray(value.doneCriteria) &&
    value.doneCriteria.every((criterion) => typeof criterion === 'string')
  );
}

function isReviewFixPlan(value: unknown): value is ReviewFixPlan {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isReviewFixPlanItem);
}

function isReviewFixVerification(value: unknown): value is ReviewFixVerification {
  return (
    isRecord(value) &&
    Array.isArray(value.results) &&
    value.results.every(isReviewFixVerificationResult) &&
    isRecord(value.summary)
  );
}

function isReviewFixVerificationResult(value: unknown): value is ReviewFixVerificationResult {
  return (
    isRecord(value) &&
    typeof value.fixPlanItemId === 'string' &&
    typeof value.status === 'string' &&
    typeof value.evidence === 'string' &&
    Array.isArray(value.commands) &&
    value.commands.every((command) => typeof command === 'string')
  );
}

function isReviewFixPlanItem(value: unknown): value is ReviewFixPlan['items'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.priority === 'string' &&
    Array.isArray(value.verification) &&
    value.verification.every((step) => typeof step === 'string')
  );
}

function isKnowledgeCandidateSeed(value: unknown): value is KnowledgeCandidateSeed {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string'
  );
}

function isRuleCandidate(value: unknown): value is RuleCandidate {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.title === 'string' &&
    typeof value.rationale === 'string' &&
    isRecord(value.source) &&
    typeof value.source.flowRunId === 'string' &&
    typeof value.scope === 'string' &&
    typeof value.status === 'string'
  );
}

function isSavedRuleApplication(value: unknown): value is RuleApplicationPayload['saved'][number] {
  return isRecord(value) && typeof value.candidateId === 'string' && typeof value.path === 'string';
}

function isSkippedRuleApplication(value: unknown): value is RuleApplicationPayload['skipped'][number] {
  return isRecord(value) && typeof value.candidateId === 'string' && typeof value.reason === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
