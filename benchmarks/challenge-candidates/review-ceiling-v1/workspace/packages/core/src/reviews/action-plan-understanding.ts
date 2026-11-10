import type { ReviewActionPlanItem, ReviewActionPlanUnderstandingMemo, ReviewReply } from '../types.js';

export function createActionPlanUnderstandingMemo(
  actionPlan: ReviewActionPlanItem[]
): ReviewActionPlanUnderstandingMemo {
  return actionPlan.map((item) => {
    const inspectionPoint = inferActionPlanInspectionPoint(item);

    return {
      id: `understanding-${item.id}`,
      title: item.title,
      priority: item.priority,
      source: item.source,
      background:
        item.source === 'comment'
          ? 'This action comes from reviewer feedback that should be understood before implementation.'
          : 'This action comes from an imported review response or cycle scope.',
      problem: item.steps[0] ?? item.title,
      impact:
        item.priority === 'P0'
          ? 'May block safe completion until the requested change is understood and verified.'
          : 'May leave review work unclear or hard to explain if skipped.',
      inspectionPoint,
      fixDirection: item.steps.join(' '),
      question:
        item.relatedCommentIds.length > 0
          ? `Confirm intent for ${item.relatedCommentIds.join(', ')} if the implementation path is ambiguous.`
          : 'No reviewer thread is attached; ask for scope clarification only if the plan is ambiguous.',
      testFocus: inferActionPlanTestFocus(item)
    };
  });
}

export function renderActionPlanUnderstandingMemoMarkdown(
  memo: ReviewActionPlanUnderstandingMemo,
  title: string
): string {
  const lines = [
    '# ReviewOps Understanding Memo',
    '',
    `Source: ${title}`,
    '',
    'ReviewOps keeps this local so the next action is based on understood intent, impact, and verification needs.',
    '',
    `Items: ${memo.length}`,
    '',
    '## Items'
  ];

  if (memo.length === 0) {
    lines.push('', '_No review actions were available. Use this memo as a placeholder for manual understanding notes._');
    return `${lines.join('\n')}\n`;
  }

  for (const item of memo) {
    lines.push(
      '',
      `### ${item.id}`,
      '',
      `- Priority: ${item.priority}`,
      `- Source: ${item.source}`,
      `- What was said: ${item.title}`,
      `- Background: ${item.background}`,
      `- Why it matters: ${item.impact}`,
      `- Where to inspect: ${item.inspectionPoint}`,
      `- Fix direction: ${item.fixDirection}`,
      `- Question to ask: ${item.question}`,
      `- Test focus: ${item.testFocus}`
    );
  }

  return `${lines.join('\n')}\n`;
}

export function renderReviewActionPlanMarkdown(
  actionPlan: ReviewActionPlanItem[],
  title = 'ReviewOps Action Plan'
): string {
  const lines = [`# ${title}`, '', 'ReviewOps records manual follow-up intent only; P0 does not edit code automatically.'];

  for (const item of actionPlan) {
    lines.push('', `## ${item.title}`, '', `Priority: ${item.priority}`, `Source: ${item.source}`, '', 'Steps:');
    lines.push(...item.steps.map((step) => `- ${step}`));
    lines.push('', 'Done criteria:', ...item.doneCriteria.map((criterion) => `- ${criterion}`));
    if (item.relatedCommentIds.length > 0) {
      lines.push('', `Related comments: ${item.relatedCommentIds.join(', ')}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function renderReviewReplyDraftMarkdown(replies: ReviewReply[]): string {
  const lines = ['# ReviewOps Reply Drafts', '', 'ReviewOps keeps replies as local drafts until a user previews and confirms publishing.'];

  for (const reply of replies) {
    lines.push('', `## ${reply.commentId}`, '', reply.body);
  }

  return `${lines.join('\n')}\n`;
}

export function formatActionPlanNextActionTitle(flowId: string): string {
  switch (flowId) {
    case 'knowledge/capture-candidates':
      return 'Capture Knowledge Candidates';
    case 'publish/summary-draft':
      return 'Preview Summary Comment Draft';
    case 'fix/plan':
    default:
      return 'Build Review Fix Plan';
  }
}

function inferActionPlanInspectionPoint(item: ReviewActionPlanItem): string {
  const fileLike = /(?:^|\s)([\w./-]+\.[\w.-]+)(?::\d+)?/u;
  for (const value of [item.title, ...item.steps]) {
    const match = fileLike.exec(value);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }

  return item.relatedCommentIds.length > 0 ? `review comments ${item.relatedCommentIds.join(', ')}` : 'manual review context';
}

function inferActionPlanTestFocus(item: ReviewActionPlanItem): string {
  const explicitTest = [...item.steps, ...item.doneCriteria].find((value) =>
    /\b(?:tests?|specs?|coverage|verification)\b/iu.test(value)
  );
  if (explicitTest !== undefined) {
    return explicitTest;
  }

  return 'Run the smallest relevant verification and record the evidence before replying.';
}
