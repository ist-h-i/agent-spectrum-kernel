import type { ArtifactStore } from '../ports/artifact-store.js';
import type { ActionPlanItemSeed, ReplyDraftSeed, ReviewFindingSeed } from '../responses/normalize.js';
import type {
  FlowArtifactRef,
  NextAction,
  ReviewActionPlanItem,
  ReviewComment,
  ReviewCommentDisposition,
  ReviewCommentPriority,
  ReviewCommentTriage,
  ReviewCommentTriageItem,
  ReviewUnderstandingMemo,
  ReviewUnderstandingMemoItem,
  ReviewReply,
  ReviewReplyDraft,
  ReviewTargetRef
} from '../types.js';

export interface BuildReviewResolutionArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  target: ReviewTargetRef;
  comments: ReviewComment[];
  findings?: ReviewFindingSeed[];
  actionPlanSeeds?: ActionPlanItemSeed[];
  replyDraftSeeds?: ReplyDraftSeed[];
  flowId?: string;
  now?: () => Date;
}

export interface BuildReviewResolutionArtifactsResult {
  triage: ReviewCommentTriage;
  understandingMemo: ReviewUnderstandingMemo;
  actionPlan: ReviewActionPlanItem[];
  replyDrafts: ReviewReplyDraft[];
  nextActions: NextAction[];
  artifacts: {
    commentTriage: FlowArtifactRef;
    understandingMemoJson: FlowArtifactRef;
    understandingMemoMarkdown: FlowArtifactRef;
    actionPlan: FlowArtifactRef;
    replyDrafts: FlowArtifactRef;
    publishDraft: FlowArtifactRef;
    nextActions: FlowArtifactRef;
  };
}

export interface CreateReplyPublishDraftsOptions {
  target: ReviewTargetRef;
  replies: ReviewReply[];
  createdAt: string;
}

const defaultFlowId = 'review/action-plan';

export async function buildReviewResolutionArtifacts(
  options: BuildReviewResolutionArtifactsOptions
): Promise<BuildReviewResolutionArtifactsResult> {
  const flowId = options.flowId ?? defaultFlowId;
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const triage = triageReviewComments(options.comments);
  const understandingMemo = createReviewUnderstandingMemo({
    target: options.target,
    triage
  });
  const actionPlan = createReviewActionPlan({
    triage,
    findings: options.findings ?? [],
    actionPlanSeeds: options.actionPlanSeeds ?? []
  });
  const replyDrafts = createReplyDraftsFromTriage({
    target: options.target,
    triage,
    replyDraftSeeds: options.replyDraftSeeds ?? [],
    createdAt
  });
  const nextActions = createNextActions(actionPlan, replyDrafts);

  const commentTriage = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'comment-triage.json',
    kind: 'json',
    content: toJson(triage),
    createdAt
  });
  const understandingMemoJson = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'understanding-memo.json',
    kind: 'json',
    content: toJson(understandingMemo),
    createdAt
  });
  const understandingMemoMarkdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'understanding-memo.md',
    kind: 'markdown',
    content: renderReviewUnderstandingMemoMarkdown(understandingMemo),
    createdAt
  });
  const actionPlanArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'action-plan.json',
    kind: 'json',
    content: toJson(actionPlan),
    createdAt
  });
  const replyDraftsArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'reply-drafts.json',
    kind: 'json',
    content: toJson(replyDrafts),
    createdAt
  });
  const publishDraft = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'publish.draft.md',
    kind: 'markdown',
    content: renderReplyDraftPreviewMarkdown(replyDrafts),
    createdAt
  });
  const nextActionsArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'next-actions.json',
    kind: 'json',
    content: toJson(nextActions),
    createdAt
  });

  return {
    triage,
    understandingMemo,
    actionPlan,
    replyDrafts,
    nextActions,
    artifacts: {
      commentTriage,
      understandingMemoJson,
      understandingMemoMarkdown,
      actionPlan: actionPlanArtifact,
      replyDrafts: replyDraftsArtifact,
      publishDraft,
      nextActions: nextActionsArtifact
    }
  };
}

export function triageReviewComments(comments: ReviewComment[]): ReviewCommentTriage {
  const items = comments.map((comment, index) => toTriageItem(comment, index));
  const needsFixCount = items.filter((item) => item.requiresCodeChange).length;
  const needsReplyCount = items.filter((item) => item.requiresReply).length;

  return {
    totalComments: comments.length,
    needsFixCount,
    needsReplyCount,
    informationalCount: items.length - needsReplyCount,
    items
  };
}

export function createReviewUnderstandingMemo(options: {
  target?: ReviewTargetRef;
  triage: ReviewCommentTriage;
}): ReviewUnderstandingMemo {
  const items = options.triage.items.map(toUnderstandingMemoItem);
  const nextQuestions = items
    .filter((item) => item.question.length > 0 && item.question !== 'No clarification needed before the next safe action.')
    .map((item) => `${item.commentId}: ${item.question}`);

  return {
    target: options.target,
    items,
    nextQuestions,
    summary: {
      totalItems: items.length,
      needsFixCount: options.triage.needsFixCount,
      needsReplyCount: options.triage.needsReplyCount,
      questionCount: nextQuestions.length
    }
  };
}

export function createReviewActionPlan(options: {
  triage: ReviewCommentTriage;
  findings?: ReviewFindingSeed[];
  actionPlanSeeds?: ActionPlanItemSeed[];
}): ReviewActionPlanItem[] {
  const seededItems = (options.actionPlanSeeds ?? []).map((item, index): ReviewActionPlanItem => ({
    id: safeId(item.id, `response-action-${index + 1}`),
    title: item.title,
    priority: normalizePriority(item.priority),
    source: 'response',
    relatedCommentIds: [],
    steps: item.steps,
    doneCriteria: ['Implementation matches the imported review response.', 'Relevant verification has passed.']
  }));

  const findingItems = (options.findings ?? []).map((finding, index): ReviewActionPlanItem => ({
    id: safeId(`finding-${finding.id}`, `finding-action-${index + 1}`),
    title: finding.title,
    priority: priorityFromSeverity(finding.severity),
    source: 'response',
    relatedCommentIds: [],
    steps: [finding.recommendation ?? finding.summary, 'Verify the affected behavior with a focused check.'],
    doneCriteria: [finding.evidence ?? 'Finding evidence has been addressed.', 'A reviewer-readable explanation is ready.']
  }));

  const commentItems = options.triage.items
    .filter((item) => item.requiresCodeChange)
    .map((item): ReviewActionPlanItem => ({
      id: `comment-action-${safeId(item.commentId, item.id)}`,
      title: item.title,
      priority: item.priority,
      source: 'comment',
      relatedCommentIds: [item.commentId],
      steps: createCommentFixSteps(item),
      doneCriteria: [
        'The requested code or documentation change is applied manually.',
        'A focused verification command has passed.',
        'A previewed reply draft explains the resolution.'
      ]
    }));

  return dedupePlanItems([...seededItems, ...findingItems, ...commentItems]);
}

export function createReplyPublishDrafts(options: CreateReplyPublishDraftsOptions): ReviewReplyDraft[] {
  assertReviewTarget(options.target);
  const createdAtId = safeId(options.createdAt, 'reply-draft');

  return options.replies.map((reply, index) => {
    const commentId = safeId(reply.commentId, `comment-${index + 1}`);
    const body = reply.body.trim();
    if (body.length === 0) {
      throw new Error(`ReviewOps reply draft body is required for ${reply.commentId}.`);
    }

    return {
      commentId: reply.commentId,
      publishDraft: {
        id: `draft_${createdAtId}_${safeId(options.target.id, 'target')}_${commentId}`,
        provider: options.target.provider,
        target: options.target,
        title: `Reply draft for ${options.target.repository} ${options.target.id} ${reply.commentId}`,
        body,
        mode: 'reply',
        requiresConfirmation: true,
        status: 'draft',
        createdAt: options.createdAt
      }
    };
  });
}

export function renderReplyDraftPreviewMarkdown(replyDrafts: ReviewReplyDraft[]): string {
  const lines = ['# ReviewOps Reply Drafts', '', 'Requires confirmation: true', ''];

  if (replyDrafts.length === 0) {
    lines.push('_No reply drafts were generated._', '');
    return lines.join('\n');
  }

  for (const replyDraft of replyDrafts) {
    lines.push(`## ${replyDraft.commentId}`, '', replyDraft.publishDraft.body, '');
  }

  return lines.join('\n');
}

function toUnderstandingMemoItem(item: ReviewCommentTriageItem): ReviewUnderstandingMemoItem {
  const inspectionPoint = item.file === undefined ? 'Review thread and related diff context.' : `${item.file}${item.line === undefined ? '' : `:${item.line}`}`;

  return {
    id: `understanding-${safeId(item.commentId, item.id)}`,
    commentId: item.commentId,
    title: item.title,
    disposition: item.disposition,
    priority: item.priority,
    background: createUnderstandingBackground(item),
    problem: item.bodyExcerpt,
    impact: createUnderstandingImpact(item),
    inspectionPoint,
    fixDirection: item.suggestedAction,
    question: createUnderstandingQuestion(item),
    testFocus: createUnderstandingTestFocus(item)
  };
}

function createUnderstandingBackground(item: ReviewCommentTriageItem): string {
  if (item.disposition === 'informational') {
    return 'Reviewer left context that should be kept visible but does not require a response.';
  }
  if (item.disposition === 'acknowledge') {
    return 'Reviewer suggested a low-risk adjustment that should not distract from higher-priority work.';
  }
  if (item.disposition === 'needs-reply') {
    return 'Reviewer is asking for intent, rationale, or missing context before a change is made.';
  }

  return 'Reviewer identified a change that should be understood, fixed manually, verified, and explained.';
}

function createUnderstandingImpact(item: ReviewCommentTriageItem): string {
  if (item.requiresCodeChange) {
    return item.priority === 'P0'
      ? 'May block safe merge until the requested change and focused verification are complete.'
      : 'May leave review feedback unresolved or regress the touched behavior if skipped.';
  }
  if (item.requiresReply) {
    return 'May create reviewer uncertainty if the intent is not answered before continuing.';
  }

  return 'No immediate implementation impact; retain as review context.';
}

function createUnderstandingQuestion(item: ReviewCommentTriageItem): string {
  if (item.disposition === 'needs-reply') {
    return `Ask what decision or constraint the reviewer expects before changing ${item.file ?? 'the implementation'}.`;
  }
  if (item.disposition === 'acknowledge') {
    return 'Ask whether this nit should be applied now or left out of the current change.';
  }
  if (item.requiresCodeChange) {
    return 'Confirm the intended behavior if the requested change has more than one valid implementation.';
  }

  return 'No clarification needed before the next safe action.';
}

function createUnderstandingTestFocus(item: ReviewCommentTriageItem): string {
  if (!item.requiresCodeChange) {
    return 'No new test scenario unless the reply changes implementation behavior.';
  }
  if (/test|spec|coverage/iu.test(item.bodyExcerpt)) {
    return 'Add or update the focused test or coverage path named by the reviewer.';
  }
  if (/bug|risk|fail|regression|security/iu.test(item.bodyExcerpt)) {
    return 'Cover the risky path with the smallest unit, integration, or manual regression scenario.';
  }

  return 'Run the smallest relevant verification command and record what behavior it proves.';
}

function renderReviewUnderstandingMemoMarkdown(memo: ReviewUnderstandingMemo): string {
  const lines = [
    '# ReviewOps Understanding Memo',
    '',
    'ReviewOps keeps this local so the next action is based on understood reviewer intent, not command recall.',
    '',
    `Target: ${memo.target === undefined ? 'manual review target' : `${memo.target.repository} ${memo.target.id}`}`,
    `Items: ${memo.summary.totalItems}`,
    `Needs fix: ${memo.summary.needsFixCount}`,
    `Needs reply: ${memo.summary.needsReplyCount}`,
    `Questions: ${memo.summary.questionCount}`,
    '',
    '## Findings'
  ];

  if (memo.items.length === 0) {
    lines.push('', '_No review comments were available. Use this memo as a placeholder for manual understanding notes._');
  }

  for (const item of memo.items) {
    lines.push(
      '',
      `### ${item.commentId}`,
      '',
      `- Priority: ${item.priority}`,
      `- Disposition: ${item.disposition}`,
      `- What was said: ${item.title}`,
      `- Background: ${item.background}`,
      `- Why it matters: ${item.impact}`,
      `- Where to inspect: ${item.inspectionPoint}`,
      `- Fix direction: ${item.fixDirection}`,
      `- Question to ask: ${item.question}`,
      `- Test focus: ${item.testFocus}`
    );
  }

  if (memo.nextQuestions.length > 0) {
    lines.push('', '## Next Questions', ...memo.nextQuestions.map((question) => `- ${question}`));
  }

  return `${lines.join('\n')}\n`;
}

function createReplyDraftsFromTriage(options: {
  target: ReviewTargetRef;
  triage: ReviewCommentTriage;
  replyDraftSeeds: ReplyDraftSeed[];
  createdAt: string;
}): ReviewReplyDraft[] {
  const seededReplies = options.replyDraftSeeds.map((seed, index): ReviewReply => ({
    commentId: seed.target.trim().length > 0 ? seed.target : `review-thread-${index + 1}`,
    body: seed.body
  }));
  const triageReplies = options.triage.items
    .filter((item) => item.requiresReply)
    .map((item): ReviewReply => ({
      commentId: item.commentId,
      body: createSuggestedReplyBody(item)
    }));

  return createReplyPublishDrafts({
    target: options.target,
    replies: dedupeReplies([...seededReplies, ...triageReplies]),
    createdAt: options.createdAt
  });
}

function toTriageItem(comment: ReviewComment, index: number): ReviewCommentTriageItem {
  const bodyExcerpt = summarizeBody(comment.body);
  // Use the same display text in the portal queue and the local triage view.
  const disposition = classifyDisposition(bodyExcerpt);
  const requiresCodeChange = disposition === 'needs-fix';
  const requiresReply = disposition !== 'informational';
  const location = comment.file === undefined ? 'general comment' : `${comment.file}${comment.line === undefined ? '' : `:${comment.line}`}`;

  return {
    id: `triage-${index + 1}`,
    commentId: comment.id,
    title: `${location}: ${bodyExcerpt}`,
    disposition,
    priority: classifyPriority(bodyExcerpt, disposition),
    requiresCodeChange,
    requiresReply,
    file: comment.file,
    line: comment.line,
    author: comment.author,
    bodyExcerpt,
    suggestedAction: createSuggestedAction(comment, disposition)
  };
}

function classifyDisposition(body: string): ReviewCommentDisposition {
  const normalized = body.toLowerCase();

  if (/(nit|typo|optional|consider)/u.test(normalized)) {
    return 'acknowledge';
  }
  if (/(\?|why|could you|can you|please explain|clarify)/u.test(normalized)) {
    return 'needs-reply';
  }
  if (/(must|should|please|missing|bug|risk|fail|regression|security|test|fix|change|coverage)/u.test(normalized)) {
    return 'needs-fix';
  }
  if (/(looks good|approved|thank you|thanks|resolved|lgtm)/u.test(normalized)) {
    return 'informational';
  }

  return 'needs-reply';
}

function classifyPriority(body: string, disposition: ReviewCommentDisposition): ReviewCommentPriority {
  const normalized = body.toLowerCase();
  if (/(security|data loss|blocker|critical|must)/u.test(normalized)) {
    return 'P0';
  }
  if (/(bug|risk|fail|regression|missing test|coverage)/u.test(normalized)) {
    return 'P1';
  }
  if (disposition === 'informational' || disposition === 'acknowledge') {
    return 'P3';
  }

  return 'P2';
}

function createSuggestedAction(comment: ReviewComment, disposition: ReviewCommentDisposition): string {
  if (disposition === 'informational') {
    return 'No code change required; keep the comment as context.';
  }
  if (disposition === 'acknowledge') {
    return 'Preview a short acknowledgement and apply only if the team agrees the nit is worth changing.';
  }
  if (disposition === 'needs-reply') {
    return 'Preview a clarifying reply before changing code.';
  }

  const location = comment.file === undefined ? 'the referenced area' : comment.file;
  return `Manually update ${location}, run a focused verification, then preview a reply with the result.`;
}

function createCommentFixSteps(item: ReviewCommentTriageItem): string[] {
  return [
    item.file === undefined ? 'Inspect the referenced review context.' : `Inspect ${item.file}${item.line === undefined ? '' : `:${item.line}`}.`,
    item.suggestedAction,
    'Run the smallest relevant test, build, or lint command.',
    `Preview a reply for ${item.commentId} before posting.`
  ];
}

function createSuggestedReplyBody(item: ReviewCommentTriageItem): string {
  if (item.requiresCodeChange) {
    return 'Thanks for the review. I will address this by updating the referenced change manually, running a focused verification, and then I will report the result here.';
  }
  if (item.disposition === 'acknowledge') {
    return 'Thanks, acknowledged. I will apply this if it still fits the final change after the main fixes.';
  }

  return 'Thanks for the review. I will confirm the intent here before changing the implementation.';
}

function createNextActions(actionPlan: ReviewActionPlanItem[], replyDrafts: ReviewReplyDraft[]): NextAction[] {
  const actions: NextAction[] = [];
  if (actionPlan.length > 0) {
    actions.push({
      id: 'apply-review-action-plan',
      title: 'Apply review action plan manually',
      flowId: 'review/action-plan',
      reason: 'ReviewOps prepared fix steps, but P0 does not perform automatic code changes.'
    });
  }
  if (replyDrafts.length > 0) {
    actions.push({
      id: 'preview-comment-replies',
      title: 'Preview comment reply drafts',
      flowId: 'publish/reply-draft',
      reason: 'ReviewOps reply publishing is preview-first and requires explicit confirmation.'
    });
  }

  return actions.length > 0
    ? actions
    : [
        {
          id: 'continue-review-flow',
          title: 'Continue review flow',
          flowId: 'meta/status',
          reason: 'No blocking comments were found in this triage pass.'
        }
      ];
}

function dedupePlanItems(items: ReviewActionPlanItem[]): ReviewActionPlanItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function dedupeReplies(replies: ReviewReply[]): ReviewReply[] {
  const seen = new Set<string>();
  return replies.filter((reply) => {
    const key = [reply.commentId, reply.body].join('\n');
    if (seen.has(key) || reply.body.trim().length === 0) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function priorityFromSeverity(severity: ReviewFindingSeed['severity']): ReviewCommentPriority {
  if (severity === 'critical') {
    return 'P0';
  }
  if (severity === 'major') {
    return 'P1';
  }
  if (severity === 'minor') {
    return 'P2';
  }

  return 'P3';
}

function normalizePriority(priority: string): ReviewCommentPriority {
  return priority === 'P0' || priority === 'P1' || priority === 'P2' || priority === 'P3' ? priority : 'P2';
}

function assertReviewTarget(target: ReviewTargetRef): void {
  if (target.repository.trim().length === 0 || target.id.trim().length === 0) {
    throw new Error('ReviewOps reply drafts require a review target repository and id.');
  }
}

function summarizeBody(body: string): string {
  const normalized = body.replaceAll(/\s+/gu, ' ').trim();
  if (normalized.length <= 96) {
    return normalized || 'Empty review comment';
  }

  return `${normalized.slice(0, 93)}...`;
}

function safeId(value: string, fallback: string): string {
  const normalized = value.replaceAll(/[^0-9a-z-]/giu, '-').replaceAll(/^-+|-+$/gu, '').toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
