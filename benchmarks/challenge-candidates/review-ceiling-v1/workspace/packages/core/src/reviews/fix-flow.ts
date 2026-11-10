import type { ArtifactStore } from '../ports/artifact-store.js';
import type {
  FlowArtifactRef,
  NextAction,
  ReviewActionPlanItem,
  ReviewFixChecklist,
  ReviewFixPlan,
  ReviewFixPlanItem,
  ReviewFixExplanation,
  ReviewFixVerification,
  ReviewFixVerificationResult,
  ReviewFixVerificationStatus,
  ReviewTestScenarios,
  ReviewTestScenarioItem,
  ReviewTargetRef
} from '../types.js';

export interface BuildReviewFixPlanArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  actionPlan: ReviewActionPlanItem[];
  target?: ReviewTargetRef;
  flowId?: string;
  now?: () => Date;
}

export interface BuildReviewFixPlanArtifactsResult {
  fixPlan: ReviewFixPlan;
  nextActions: NextAction[];
  artifacts: {
    fixPlanJson: FlowArtifactRef;
    fixPlanMarkdown: FlowArtifactRef;
    nextActions: FlowArtifactRef;
  };
}

export interface BuildReviewFixVerificationArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  fixPlan: ReviewFixPlan;
  results: Array<Omit<ReviewFixVerificationResult, 'id' | 'verifiedAt'> & Partial<Pick<ReviewFixVerificationResult, 'id' | 'verifiedAt'>>>;
  target?: ReviewTargetRef;
  flowId?: string;
  now?: () => Date;
}

export interface BuildReviewFixVerificationArtifactsResult {
  verification: ReviewFixVerification;
  nextActions: NextAction[];
  artifacts: {
    verificationJson: FlowArtifactRef;
    verificationMarkdown: FlowArtifactRef;
    nextActions: FlowArtifactRef;
  };
}

export interface BuildReviewFixChecklistArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  fixPlan: ReviewFixPlan;
  flowId?: string;
  now?: () => Date;
}

export interface BuildReviewFixChecklistArtifactsResult {
  checklist: ReviewFixChecklist;
  testScenarios: ReviewTestScenarios;
  nextActions: NextAction[];
  artifacts: {
    checklistJson: FlowArtifactRef;
    checklistMarkdown: FlowArtifactRef;
    testScenariosJson: FlowArtifactRef;
    testScenariosMarkdown: FlowArtifactRef;
    nextActions: FlowArtifactRef;
  };
}

export interface BuildReviewFixExplanationArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  fixPlan: ReviewFixPlan;
  verification: ReviewFixVerification;
  flowId?: string;
  now?: () => Date;
}

export interface BuildReviewFixExplanationArtifactsResult {
  explanation: ReviewFixExplanation;
  nextActions: NextAction[];
  artifacts: {
    explanationJson: FlowArtifactRef;
    explanationMarkdown: FlowArtifactRef;
    nextActions: FlowArtifactRef;
  };
}

const fixPlanFlowId = 'fix/plan';
const fixChecklistFlowId = 'fix/checklist';
const fixVerifyFlowId = 'fix/verify';
const fixExplainFlowId = 'fix/explain';
const refactorPlanFlowId = 'refactor/plan';
const refactorChecklistFlowId = 'refactor/checklist';
const refactorVerifyFlowId = 'refactor/verify';
const refactorExplainFlowId = 'refactor/explain';

export async function buildReviewFixPlanArtifacts(
  options: BuildReviewFixPlanArtifactsOptions
): Promise<BuildReviewFixPlanArtifactsResult> {
  const flowId = options.flowId ?? fixPlanFlowId;
  const artifactBaseName = isRefactorFlow(flowId) ? 'refactor-plan' : 'fix-plan';
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const fixPlan = createReviewFixPlan(options.actionPlan, options.target);
  const nextActions = createFixPlanNextActions(fixPlan, flowId);

  const fixPlanJson = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.json`,
    kind: 'json',
    content: toJson(fixPlan),
    createdAt
  });
  const fixPlanMarkdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.md`,
    kind: 'markdown',
    content: renderFixPlanMarkdown(fixPlan, flowId),
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
    fixPlan,
    nextActions,
    artifacts: {
      fixPlanJson,
      fixPlanMarkdown,
      nextActions: nextActionsArtifact
    }
  };
}

export function createReviewFixPlan(actionPlan: ReviewActionPlanItem[], target?: ReviewTargetRef): ReviewFixPlan {
  const items = actionPlan.map(toFixPlanItem);

  return {
    target,
    items,
    summary: {
      totalItems: items.length,
      p0Count: items.filter((item) => item.priority === 'P0').length,
      requiresReplyCount: items.filter((item) => item.replyRequired).length,
      docsUpdateCount: items.filter((item) => item.docsUpdateRequired).length,
      ruleCandidateCount: items.filter((item) => item.ruleCandidate).length
    }
  };
}

export async function buildReviewFixChecklistArtifacts(
  options: BuildReviewFixChecklistArtifactsOptions
): Promise<BuildReviewFixChecklistArtifactsResult> {
  const flowId = options.flowId ?? fixChecklistFlowId;
  const artifactBaseName = isRefactorFlow(flowId) ? 'refactor-checklist' : 'fix-checklist';
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const checklist = createReviewFixChecklist(options.fixPlan);
  const testScenarios = createReviewTestScenarios(options.fixPlan);
  const nextActions = createFixChecklistNextActions(checklist, flowId);

  const checklistJson = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.json`,
    kind: 'json',
    content: toJson(checklist),
    createdAt
  });
  const checklistMarkdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.md`,
    kind: 'markdown',
    content: renderFixChecklistMarkdown(checklist, flowId),
    createdAt
  });
  const testScenariosJson = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'test-scenarios.json',
    kind: 'json',
    content: toJson(testScenarios),
    createdAt
  });
  const testScenariosMarkdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'test-scenarios.md',
    kind: 'markdown',
    content: renderTestScenariosMarkdown(testScenarios, flowId),
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
    checklist,
    testScenarios,
    nextActions,
    artifacts: {
      checklistJson,
      checklistMarkdown,
      testScenariosJson,
      testScenariosMarkdown,
      nextActions: nextActionsArtifact
    }
  };
}

export function createReviewFixChecklist(fixPlan: ReviewFixPlan): ReviewFixChecklist {
  const items = fixPlan.items.map((item) => ({
    id: `checklist-${safeId(item.id)}`,
    fixPlanItemId: item.id,
    title: item.title,
    priority: item.priority,
    checks: [
      `Manual fix approach is still valid: ${item.approach}`,
      `Impact reviewed: ${item.impact}`,
      ...item.verification.map((step) => `Verification planned: ${step}`),
      item.replyRequired ? 'Reply draft is needed before publishing.' : 'No reviewer reply is required for this item.',
      item.ruleCandidate ? 'Rule candidate should be reviewed after verification.' : 'No reusable rule candidate was flagged.'
    ],
    status: 'open' as const
  }));

  return {
    target: fixPlan.target,
    items,
    summary: {
      totalItems: items.length,
      p0Count: items.filter((item) => item.priority === 'P0').length,
      replyRequiredCount: fixPlan.summary.requiresReplyCount
    }
  };
}

export function createReviewTestScenarios(fixPlan: ReviewFixPlan): ReviewTestScenarios {
  const items = fixPlan.items.map(toTestScenarioItem);

  return {
    target: fixPlan.target,
    items,
    summary: {
      totalItems: items.length,
      p0Count: items.filter((item) => item.priority === 'P0').length,
      commandCount: items.reduce((count, item) => count + item.commands.length, 0)
    }
  };
}

export async function buildReviewFixVerificationArtifacts(
  options: BuildReviewFixVerificationArtifactsOptions
): Promise<BuildReviewFixVerificationArtifactsResult> {
  const flowId = options.flowId ?? fixVerifyFlowId;
  const artifactBaseName = isRefactorFlow(flowId) ? 'refactor-verify' : 'fix-verify';
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const verification = createReviewFixVerification({
    fixPlan: options.fixPlan,
    results: options.results,
    target: options.target ?? options.fixPlan.target,
    verifiedAt: createdAt
  });
  const nextActions = createFixVerificationNextActions(verification, flowId);

  const verificationJson = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.json`,
    kind: 'json',
    content: toJson(verification),
    createdAt
  });
  const verificationMarkdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.md`,
    kind: 'markdown',
    content: renderFixVerificationMarkdown(verification, flowId),
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
    verification,
    nextActions,
    artifacts: {
      verificationJson,
      verificationMarkdown,
      nextActions: nextActionsArtifact
    }
  };
}

export async function buildReviewFixExplanationArtifacts(
  options: BuildReviewFixExplanationArtifactsOptions
): Promise<BuildReviewFixExplanationArtifactsResult> {
  const flowId = options.flowId ?? fixExplainFlowId;
  const artifactBaseName = isRefactorFlow(flowId) ? 'refactor-explain' : 'fix-explain';
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const explanation = createReviewFixExplanation(options.fixPlan, options.verification);
  const nextActions = createFixExplanationNextActions(explanation, flowId);

  const explanationJson = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.json`,
    kind: 'json',
    content: toJson(explanation),
    createdAt
  });
  const explanationMarkdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: `${artifactBaseName}.md`,
    kind: 'markdown',
    content: renderFixExplanationMarkdown(explanation, flowId),
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
    explanation,
    nextActions,
    artifacts: {
      explanationJson,
      explanationMarkdown,
      nextActions: nextActionsArtifact
    }
  };
}

export function createReviewFixExplanation(
  fixPlan: ReviewFixPlan,
  verification: ReviewFixVerification
): ReviewFixExplanation {
  const byId = new Map(fixPlan.items.map((item) => [item.id, item]));
  const resolvedItemIds = verification.results
    .filter((result) => result.status === 'resolved' || result.status === 'partially_resolved')
    .map((result) => result.fixPlanItemId);
  const unresolvedRisks = verification.results
    .map((result) => result.unresolvedRisk)
    .filter((risk): risk is string => risk !== undefined && risk.trim().length > 0);
  const followUpIssueTitles = verification.results
    .map((result) => result.followUpIssueTitle)
    .filter((title): title is string => title !== undefined && title.trim().length > 0);
  const resultLines = verification.results.map((result) => {
    const title = byId.get(result.fixPlanItemId)?.title ?? result.fixPlanItemId;
    const commands = result.commands.length === 0 ? 'manual verification recorded' : result.commands.join(', ');
    return `- ${title}: ${result.status}; evidence: ${result.evidence}; commands: ${commands}`;
  });

  return {
    target: verification.target ?? fixPlan.target,
    body: [
      'ReviewOps fix explanation draft.',
      'No code was changed automatically; this summarizes manually verified review work.',
      '',
      ...resultLines
    ].join('\n'),
    resolvedItemIds,
    unresolvedRisks,
    followUpIssueTitles,
    summary: {
      verifiedItems: verification.results.length,
      resolvedCount: verification.summary.resolvedCount + verification.summary.partiallyResolvedCount,
      unresolvedCount:
        verification.summary.unresolvedCount + verification.summary.partiallyResolvedCount + verification.summary.newRiskCount,
      followUpIssueCount: verification.summary.followUpIssueCount
    }
  };
}

export function createReviewFixVerification(options: {
  fixPlan: ReviewFixPlan;
  results: Array<Omit<ReviewFixVerificationResult, 'id' | 'verifiedAt'> & Partial<Pick<ReviewFixVerificationResult, 'id' | 'verifiedAt'>>>;
  target?: ReviewTargetRef;
  verifiedAt: string;
}): ReviewFixVerification {
  const validItemIds = new Set(options.fixPlan.items.map((item) => item.id));
  const seenItemIds = new Set<string>();
  const results = options.results.map((result, index): ReviewFixVerificationResult => {
    if (!validItemIds.has(result.fixPlanItemId)) {
      throw new Error(`ReviewOps fix verification references an unknown fix plan item: ${result.fixPlanItemId}.`);
    }
    if (seenItemIds.has(result.fixPlanItemId)) {
      throw new Error(`ReviewOps fix verification contains a duplicate fix plan item: ${result.fixPlanItemId}.`);
    }
    seenItemIds.add(result.fixPlanItemId);

    return {
      // Keep the persisted result shape stable across local and shared-portal writers.
      fixPlanItemId: result.fixPlanItemId,
      status: result.status,
      evidence: result.evidence.trim(),
      id: result.id ?? `fix-verify-${index + 1}`,
      commands: result.commands.map((command) => command.trim()).filter((command) => command.length > 0),
      verifiedAt: result.verifiedAt ?? options.verifiedAt
    };
  });

  return {
    target: options.target,
    results,
    summary: {
      resolvedCount: countStatus(results, 'resolved'),
      partiallyResolvedCount: countStatus(results, 'partially_resolved'),
      unresolvedCount: countStatus(results, 'not_resolved'),
      newRiskCount: countStatus(results, 'new_risk_found'),
      followUpIssueCount: countStatus(results, 'needs_followup_issue')
    }
  };
}

/** Convert imported portal outcomes to the existing local verification vocabulary. */
export function normalizeReviewFixVerificationStatus(value: string): ReviewFixVerificationStatus {
  const normalized = value.trim().toLowerCase().replaceAll('-', '_');
  switch (normalized) {
    case 'resolved':
    case 'pass':
    case 'passed':
      return 'resolved';
    case 'partial':
    case 'partially_resolved':
      return 'partially_resolved';
    case 'fail':
    case 'failed':
    case 'not_resolved':
      return 'not_resolved';
    case 'new_risk_found':
      return 'new_risk_found';
    case 'needs_followup_issue':
      return 'needs_followup_issue';
    default:
      return 'resolved';
  }
}

function toFixPlanItem(action: ReviewActionPlanItem): ReviewFixPlanItem {
  const targetFiles = inferTargetFiles(action);
  const docsUpdateRequired = action.source === 'comment' && textMatches([action.title, ...action.steps], /(docs?|readme|documentation|drift)/iu);
  const ruleCandidate = textMatches(action, /(rule|guideline|standard|repeat|pattern)/iu);

  return {
    id: `fix-${safeId(action.id)}`,
    sourceActionId: action.id,
    title: action.title,
    priority: action.priority,
    targetFiles,
    approach: action.steps.join(' '),
    impact: targetFiles.length === 0 ? 'Review the affected context before editing.' : `Potentially affects ${targetFiles.join(', ')}.`,
    verification: action.doneCriteria.length > 0 ? action.doneCriteria : ['Run the smallest relevant verification command.'],
    docsUpdateRequired,
    replyRequired: action.relatedCommentIds.length > 0,
    ruleCandidate,
    status: 'planned'
  };
}

function inferTargetFiles(action: ReviewActionPlanItem): string[] {
  const fileLike = /(?:^|\s)([\w./-]+\.[\w.-]+)(?::\d+)?/gu;
  const values = new Set<string>();
  for (const value of [action.title, ...action.steps.filter((step) => !/^\s*run\s+/iu.test(step))]) {
    for (const match of value.matchAll(fileLike)) {
      values.add(match[1].replace(/[),.;:]+$/u, ''));
    }
  }

  return [...values];
}

function textMatches(source: ReviewActionPlanItem | string[], pattern: RegExp): boolean {
  const values = Array.isArray(source) ? source : [source.title, ...source.steps, ...source.doneCriteria];
  return values.some((value) => pattern.test(value));
}

function renderFixPlanMarkdown(fixPlan: ReviewFixPlan, flowId = fixPlanFlowId): string {
  const refactor = isRefactorFlow(flowId);
  const lines = [
    refactor ? '# ReviewOps Refactor Plan' : '# ReviewOps Fix Plan',
    '',
    refactor
      ? 'ReviewOps records refactor intent only; P0 does not perform automatic code changes.'
      : 'ReviewOps records fix intent only; P0 does not perform automatic code changes.',
    '',
    `Target: ${fixPlan.target === undefined ? (refactor ? 'manual refactor scope' : 'manual review target') : `${fixPlan.target.repository} ${fixPlan.target.id}`}`,
    `Items: ${fixPlan.summary.totalItems}`,
    ...(refactor ? [] : [`Requires reply: ${fixPlan.summary.requiresReplyCount}`]),
    '',
    refactor ? '## Planned Refactoring Work' : '## Planned Fixes'
  ];

  if (fixPlan.items.length === 0) {
    lines.push('', refactor ? '_No refactor items were planned._' : '_No fix items were planned._');
    return `${lines.join('\n')}\n`;
  }

  for (const item of fixPlan.items) {
    lines.push(
      '',
      `### ${item.id}`,
      '',
      `- Priority: ${item.priority}`,
      `- Source action: ${item.sourceActionId}`,
      `- Target files: ${item.targetFiles.length === 0 ? 'manual inspection required' : item.targetFiles.join(', ')}`,
      `- Approach: ${item.approach}`,
      `- Impact: ${item.impact}`,
      `- Docs update required: ${item.docsUpdateRequired}`,
      ...(refactor ? [] : [`- Reply required: ${item.replyRequired}`]),
      `- Rule candidate: ${item.ruleCandidate}`,
      '- Verification:',
      ...item.verification.map((step) => `  - ${step}`)
    );
  }

  return `${lines.join('\n')}\n`;
}

function renderFixChecklistMarkdown(checklist: ReviewFixChecklist, flowId = fixChecklistFlowId): string {
  const refactor = isRefactorFlow(flowId);
  const lines = [
    refactor ? '# ReviewOps Refactor Checklist' : '# ReviewOps Fix Checklist',
    '',
    'ReviewOps keeps this checklist local; P0 does not perform automatic code changes.',
    '',
    `Target: ${checklist.target === undefined ? (refactor ? 'manual refactor scope' : 'manual review target') : `${checklist.target.repository} ${checklist.target.id}`}`,
    `Items: ${checklist.summary.totalItems}`,
    ...(refactor ? [] : [`Requires reply: ${checklist.summary.replyRequiredCount}`]),
    '',
    '## Checklist'
  ];

  if (checklist.items.length === 0) {
    lines.push('', '_No checklist items were generated._');
    return `${lines.join('\n')}\n`;
  }

  for (const item of checklist.items) {
    lines.push('', `### ${item.fixPlanItemId}`, '', `Priority: ${item.priority}`);
    lines.push(...item.checks.map((check) => `- [ ] ${check}`));
  }

  return `${lines.join('\n')}\n`;
}

function toTestScenarioItem(item: ReviewFixPlanItem): ReviewTestScenarioItem {
  const commands = item.verification.filter((step) => /^\s*(?:pnpm|npm|yarn|bun|vitest|jest|pytest|go test|cargo test|mvn|gradle)\b/iu.test(step));
  const scenarioSteps = item.verification.length > 0 ? item.verification : ['Run the smallest relevant verification command.'];

  return {
    id: `scenario-${safeId(item.id)}`,
    fixPlanItemId: item.id,
    title: item.title,
    priority: item.priority,
    targetFiles: item.targetFiles,
    scenario: `Verify ${item.title}`,
    setup: item.targetFiles.length === 0 ? 'Inspect the affected review context before testing.' : `Open ${item.targetFiles.join(', ')} and prepare focused inputs.`,
    steps: scenarioSteps,
    expectedOutcome: item.replyRequired
      ? 'The reviewer concern is addressed and the result can be explained in a previewed reply.'
      : 'The intended behavior is verified and any reusable rule candidate remains reviewable before applying.',
    commands,
    riskCovered: item.impact
  };
}

function renderTestScenariosMarkdown(testScenarios: ReviewTestScenarios, flowId = fixChecklistFlowId): string {
  const refactor = isRefactorFlow(flowId);
  const lines = [
    refactor ? '# ReviewOps Refactor Test Scenarios' : '# ReviewOps Test Scenarios',
    '',
    'ReviewOps records test intent only; execution remains manual and local.',
    '',
    `Target: ${testScenarios.target === undefined ? (refactor ? 'manual refactor scope' : 'manual review target') : `${testScenarios.target.repository} ${testScenarios.target.id}`}`,
    `Items: ${testScenarios.summary.totalItems}`,
    `Explicit commands: ${testScenarios.summary.commandCount}`,
    '',
    '## Scenarios'
  ];

  if (testScenarios.items.length === 0) {
    lines.push('', '_No test scenarios were generated._');
    return `${lines.join('\n')}\n`;
  }

  for (const item of testScenarios.items) {
    lines.push(
      '',
      `### ${item.fixPlanItemId}`,
      '',
      `- Priority: ${item.priority}`,
      `- Scenario: ${item.scenario}`,
      `- Target files: ${item.targetFiles.length === 0 ? 'manual inspection required' : item.targetFiles.join(', ')}`,
      `- Setup: ${item.setup}`,
      `- Risk covered: ${item.riskCovered}`,
      `- Expected outcome: ${item.expectedOutcome}`,
      '- Steps:',
      ...item.steps.map((step) => `  - ${step}`),
      '- Commands:',
      ...(item.commands.length === 0 ? ['  - Record a focused manual verification command or evidence.'] : item.commands.map((command) => `  - ${command}`))
    );
  }

  return `${lines.join('\n')}\n`;
}

function renderFixVerificationMarkdown(verification: ReviewFixVerification, flowId = fixVerifyFlowId): string {
  const refactor = isRefactorFlow(flowId);
  const lines = [
    refactor ? '# ReviewOps Refactor Verification' : '# ReviewOps Fix Verification',
    '',
    `Target: ${verification.target === undefined ? (refactor ? 'manual refactor scope' : 'manual review target') : `${verification.target.repository} ${verification.target.id}`}`,
    `Resolved: ${verification.summary.resolvedCount}`,
    `Partially resolved: ${verification.summary.partiallyResolvedCount}`,
    `Unresolved: ${verification.summary.unresolvedCount}`,
    `New risks: ${verification.summary.newRiskCount}`,
    `Follow-up issues: ${verification.summary.followUpIssueCount}`,
    '',
    '## Results'
  ];

  if (verification.results.length === 0) {
    lines.push('', '_No verification results were recorded._');
    return `${lines.join('\n')}\n`;
  }

  for (const result of verification.results) {
    lines.push(
      '',
      `### ${result.fixPlanItemId}`,
      '',
      `- Status: ${result.status}`,
      `- Evidence: ${result.evidence}`,
      `- Commands: ${result.commands.length === 0 ? 'not recorded' : result.commands.join(', ')}`,
      `- Verified at: ${result.verifiedAt}`
    );

    if (result.unresolvedRisk !== undefined) {
      lines.push(`- Unresolved risk: ${result.unresolvedRisk}`);
    }
    if (result.followUpIssueTitle !== undefined) {
      lines.push(`- Follow-up issue: ${result.followUpIssueTitle}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderFixExplanationMarkdown(explanation: ReviewFixExplanation, flowId = fixExplainFlowId): string {
  const refactor = isRefactorFlow(flowId);
  const lines = [
    refactor ? '# ReviewOps Refactor Explanation' : '# ReviewOps Fix Explanation',
    '',
    `Target: ${explanation.target === undefined ? (refactor ? 'manual refactor scope' : 'manual review target') : `${explanation.target.repository} ${explanation.target.id}`}`,
    `Verified items: ${explanation.summary.verifiedItems}`,
    `Resolved or partial: ${explanation.summary.resolvedCount}`,
    `Unresolved or new risk: ${explanation.summary.unresolvedCount}`,
    `Follow-up issues: ${explanation.summary.followUpIssueCount}`,
    '',
    '## Draft',
    '',
    explanation.body
  ];

  if (explanation.unresolvedRisks.length > 0) {
    lines.push('', '## Unresolved Risks', ...explanation.unresolvedRisks.map((risk) => `- ${risk}`));
  }
  if (explanation.followUpIssueTitles.length > 0) {
    lines.push('', '## Follow-up Issues', ...explanation.followUpIssueTitles.map((title) => `- ${title}`));
  }

  return `${lines.join('\n')}\n`;
}

function createFixPlanNextActions(fixPlan: ReviewFixPlan, flowId = fixPlanFlowId): NextAction[] {
  const refactor = isRefactorFlow(flowId);
  if (fixPlan.items.length === 0) {
    return [
      {
        id: refactor ? 'continue-refactor-flow' : 'continue-review-flow',
        title: refactor ? 'Continue refactor flow' : 'Continue review flow',
        flowId: 'meta/status',
        reason: refactor
          ? 'No refactor plan items were generated from the current scope.'
          : 'No fix plan items were generated from the current action plan.'
      }
    ];
  }

  return [
    {
      id: refactor ? 'build-refactor-checklist' : 'build-fix-checklist',
      title: refactor ? 'Build refactor checklist' : 'Build fix checklist',
      flowId: refactor ? refactorChecklistFlowId : fixChecklistFlowId,
      reason: refactor
        ? 'Turn the manual refactor plan into a concrete checklist before editing outside ReviewOps.'
        : 'Turn the manual fix plan into a concrete checklist before editing outside ReviewOps.'
    }
  ];
}

function createFixChecklistNextActions(checklist: ReviewFixChecklist, flowId = fixChecklistFlowId): NextAction[] {
  const refactor = isRefactorFlow(flowId);
  if (checklist.items.length === 0) {
    return [
      {
        id: refactor ? 'continue-refactor-flow' : 'continue-review-flow',
        title: refactor ? 'Continue refactor flow' : 'Continue review flow',
        flowId: 'meta/status',
        reason: refactor
          ? 'No checklist items were generated from the current refactor plan.'
          : 'No checklist items were generated from the current fix plan.'
      }
    ];
  }

  return [
    {
      id: refactor ? 'verify-refactor-checklist' : 'verify-fix-checklist',
      title: 'Verify checklist results',
      flowId: refactor ? refactorVerifyFlowId : fixVerifyFlowId,
      reason: refactor
        ? 'After manual refactoring is applied, record resolved, partial, unresolved, new risk, or follow-up outcomes.'
        : 'After manual fixes are applied, record resolved, partial, unresolved, new risk, or follow-up outcomes.'
    }
  ];
}

function createFixVerificationNextActions(verification: ReviewFixVerification, flowId = fixVerifyFlowId): NextAction[] {
  const refactor = isRefactorFlow(flowId);
  const actions: NextAction[] = [];
  if (
    verification.summary.unresolvedCount > 0 ||
    verification.summary.newRiskCount > 0 ||
    verification.summary.followUpIssueCount > 0
  ) {
    actions.push({
      id: 'prepare-follow-up-work',
      title: 'Prepare follow-up work',
      flowId: refactor ? refactorPlanFlowId : 'review/action-plan',
      reason: refactor
        ? 'Verification found unresolved refactoring work, a new risk, or follow-up issue needs.'
        : 'Verification found unresolved work, a new risk, or follow-up issue needs.'
    });
  }

  if (verification.summary.resolvedCount > 0 || verification.summary.partiallyResolvedCount > 0) {
    actions.push({
      id: refactor ? 'explain-refactor-results' : 'explain-fix-results',
      title: refactor ? 'Explain refactor results' : 'Explain fix results',
      flowId: refactor ? refactorExplainFlowId : fixExplainFlowId,
      reason: refactor
        ? 'Resolved or partially resolved refactoring work should be summarized before evidence capture.'
        : 'Resolved or partially resolved review work should be summarized before any preview-first reply.'
    });
  }

  return actions.length > 0
    ? actions
    : [
        {
          id: refactor ? 'continue-refactor-flow' : 'continue-review-flow',
          title: refactor ? 'Continue refactor flow' : 'Continue review flow',
          flowId: 'meta/status',
          reason: 'No verification results were recorded.'
        }
      ];
}

function createFixExplanationNextActions(explanation: ReviewFixExplanation, flowId = fixExplainFlowId): NextAction[] {
  const refactor = isRefactorFlow(flowId);
  const actions: NextAction[] = [];
  if (explanation.summary.unresolvedCount > 0 || explanation.summary.followUpIssueCount > 0) {
    actions.push({
      id: 'prepare-follow-up-work',
      title: 'Prepare follow-up work',
      flowId: refactor ? refactorPlanFlowId : 'review/action-plan',
      reason: refactor
        ? 'The explanation still contains unresolved refactoring work or follow-up issue needs.'
        : 'The explanation still contains unresolved work or follow-up issue needs.'
    });
  }

  if (explanation.summary.resolvedCount > 0 && !refactor) {
    actions.push({
      id: 'preview-resolution-reply',
      title: 'Preview resolution reply',
      flowId: 'publish/reply-draft',
      reason: 'Use the fix explanation to prepare a preview-first reviewer reply.'
    });
  }

  if (explanation.summary.resolvedCount > 0 && refactor) {
    actions.push({
      id: 'propose-refactor-rules',
      title: 'Propose reusable refactor rules',
      flowId: 'rules/propose',
      reason: 'Use the refactor explanation to capture reusable rules or knowledge.'
    });
  }

  return actions.length > 0
    ? actions
    : [
        {
          id: refactor ? 'continue-refactor-flow' : 'continue-review-flow',
          title: refactor ? 'Continue refactor flow' : 'Continue review flow',
          flowId: 'meta/status',
          reason: refactor ? 'No resolved refactor explanation was recorded.' : 'No resolved fix explanation was recorded.'
        }
      ];
}

function isRefactorFlow(flowId: string): boolean {
  return flowId.startsWith('refactor/');
}

function countStatus(results: ReviewFixVerificationResult[], status: ReviewFixVerificationStatus): number {
  return results.filter((result) => result.status === status).length;
}

function safeId(value: string): string {
  return value.replaceAll(/[^0-9a-z-]/giu, '-').replaceAll(/^-+|-+$/gu, '').toLowerCase() || 'item';
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
