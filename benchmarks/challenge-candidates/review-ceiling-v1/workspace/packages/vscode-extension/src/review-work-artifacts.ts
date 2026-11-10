import {
  createActionPlanUnderstandingMemo,
  createRuleApplicationPayload,
  FileSystemArtifactStore,
  formatActionPlanNextActionTitle,
  renderActionPlanUnderstandingMemoMarkdown,
  renderReviewActionPlanMarkdown,
  renderReviewReplyDraftMarkdown,
  renderRuleUpdateMarkdown,
  stringifyJsonDocument,
  type ReviewActionPlanItem,
  type ReviewReply,
  type RuleApplicationPayload,
  type RuleCandidate,
  type SaveApprovedRuleCandidatesResult
} from '@reviewops/core';

type WrittenArtifact = Awaited<ReturnType<FileSystemArtifactStore['write']>>;

export { formatActionPlanNextActionTitle } from '@reviewops/core';

export async function writeReviewActionPlanArtifacts(
  workspaceRoot: string,
  runId: string,
  actionPlan: ReviewActionPlanItem[],
  now: Date,
  options: {
    flowId?: string;
    title?: string;
    nextFlowId?: string;
  } = {}
): Promise<{
  actionPlanJson: WrittenArtifact;
  actionPlanMarkdown: WrittenArtifact;
  understandingMemoJson: WrittenArtifact;
  understandingMemoMarkdown: WrittenArtifact;
  nextActions: WrittenArtifact;
}> {
  const artifactStore = new FileSystemArtifactStore(workspaceRoot);
  const createdAt = now.toISOString();
  const flowId = options.flowId ?? 'review/action-plan';
  const nextFlowId = options.nextFlowId ?? 'fix/plan';
  const understandingMemo = createActionPlanUnderstandingMemo(actionPlan);
  const actionPlanJson = await artifactStore.write({
    flowId,
    runId,
    name: 'action-plan.json',
    kind: 'json',
    content: stringifyJsonDocument(actionPlan),
    createdAt
  });
  const actionPlanMarkdown = await artifactStore.write({
    flowId,
    runId,
    name: 'action-plan.md',
    kind: 'markdown',
    content: renderReviewActionPlanMarkdown(actionPlan, options.title ?? 'ReviewOps Action Plan'),
    createdAt
  });
  const understandingMemoJson = await artifactStore.write({
    flowId,
    runId,
    name: 'understanding-memo.json',
    kind: 'json',
    content: stringifyJsonDocument(understandingMemo),
    createdAt
  });
  const understandingMemoMarkdown = await artifactStore.write({
    flowId,
    runId,
    name: 'understanding-memo.md',
    kind: 'markdown',
    content: renderActionPlanUnderstandingMemoMarkdown(understandingMemo, options.title ?? 'ReviewOps Action Plan'),
    createdAt
  });
  const nextActions = await artifactStore.write({
    flowId,
    runId,
    name: 'next-actions.json',
    kind: 'json',
    content: stringifyJsonDocument([{ flowId: nextFlowId, title: formatActionPlanNextActionTitle(nextFlowId) }]),
    createdAt
  });

  return {
    actionPlanJson,
    actionPlanMarkdown,
    understandingMemoJson,
    understandingMemoMarkdown,
    nextActions
  };
}

export async function writeReviewReplyDraftArtifacts(
  workspaceRoot: string,
  runId: string,
  replies: ReviewReply[],
  now: Date
): Promise<{
  replyDraftsJson: WrittenArtifact;
  replyDraftsMarkdown: WrittenArtifact;
  nextActions: WrittenArtifact;
}> {
  const artifactStore = new FileSystemArtifactStore(workspaceRoot);
  const createdAt = now.toISOString();
  const replyDraftsJson = await artifactStore.write({
    flowId: 'review/reply-drafts',
    runId,
    name: 'reply-drafts.json',
    kind: 'json',
    content: stringifyJsonDocument(replies),
    createdAt
  });
  const replyDraftsMarkdown = await artifactStore.write({
    flowId: 'review/reply-drafts',
    runId,
    name: 'reply-drafts.md',
    kind: 'markdown',
    content: renderReviewReplyDraftMarkdown(replies),
    createdAt
  });
  const nextActions = await artifactStore.write({
    flowId: 'review/reply-drafts',
    runId,
    name: 'next-actions.json',
    kind: 'json',
    content: stringifyJsonDocument([{ flowId: 'publish/reply-draft', title: 'Preview Comment Reply Draft' }]),
    createdAt
  });

  return {
    replyDraftsJson,
    replyDraftsMarkdown,
    nextActions
  };
}

export async function writeRuleApplicationArtifacts(
  workspaceRoot: string,
  runId: string,
  result: SaveApprovedRuleCandidatesResult,
  approvedCandidates: RuleCandidate[],
  now: Date
): Promise<{
  ruleApplicationJson: WrittenArtifact;
  ruleUpdateMarkdown: WrittenArtifact;
  ruleUpdateJson: WrittenArtifact;
}> {
  const artifactStore = new FileSystemArtifactStore(workspaceRoot);
  const createdAt = now.toISOString();
  const payload = createRuleApplicationPayload(result, approvedCandidates);
  const ruleApplicationJson = await artifactStore.write({
    flowId: 'rules/apply',
    runId,
    name: 'rule-application.json',
    kind: 'json',
    content: stringifyJsonDocument(payload),
    createdAt
  });
  const updateArtifacts = await writeRuleUpdateArtifacts(workspaceRoot, runId, payload, now);

  return {
    ruleApplicationJson,
    ...updateArtifacts
  };
}

export async function writeRuleUpdateArtifacts(
  workspaceRoot: string,
  runId: string,
  application: RuleApplicationPayload,
  now: Date
): Promise<{
  ruleUpdateMarkdown: WrittenArtifact;
  ruleUpdateJson: WrittenArtifact;
}> {
  const artifactStore = new FileSystemArtifactStore(workspaceRoot);
  const createdAt = now.toISOString();
  const ruleUpdateMarkdown = await artifactStore.write({
    flowId: 'rules/update',
    runId,
    name: 'rule-update.md',
    kind: 'markdown',
    content: renderRuleUpdateMarkdown(application),
    createdAt
  });
  const ruleUpdateJson = await artifactStore.write({
    flowId: 'rules/update',
    runId,
    name: 'rule-update.json',
    kind: 'json',
    content: stringifyJsonDocument(application),
    createdAt
  });

  return {
    ruleUpdateMarkdown,
    ruleUpdateJson
  };
}
