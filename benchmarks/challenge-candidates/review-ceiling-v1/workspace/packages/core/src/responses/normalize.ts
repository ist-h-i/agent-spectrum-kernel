export type ReviewFindingCategory =
  | 'bug-risk'
  | 'architecture'
  | 'test'
  | 'docs'
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'other';

export type ReviewFindingSeverity = 'critical' | 'major' | 'minor' | 'suggestion' | 'unknown';
export type ActionPlanPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface ReviewFindingSeed {
  id: string;
  title: string;
  category: ReviewFindingCategory;
  severity: ReviewFindingSeverity;
  summary: string;
  evidence?: string;
  recommendation?: string;
}

export interface ActionPlanItemSeed {
  id: string;
  title: string;
  priority: ActionPlanPriority;
  steps: string[];
}

export interface ReplyDraftSeed {
  id: string;
  target: string;
  body: string;
}

export interface RuleCandidateSeed {
  id: string;
  title: string;
  rationale: string;
}

export interface KnowledgeCandidateSeed {
  id: string;
  title: string;
  summary: string;
}

export interface NormalizeResult {
  success: boolean;
  structured: boolean;
  resultJson?: unknown;
  resultMarkdown: string;
  reviewFindings: ReviewFindingSeed[];
  actionPlan: ActionPlanItemSeed[];
  replyDrafts: ReplyDraftSeed[];
  ruleCandidates: RuleCandidateSeed[];
  knowledgeCandidates: KnowledgeCandidateSeed[];
  warnings: string[];
  requiresUserEdit: boolean;
}

type JsonBlockParseResult =
  | { status: 'missing' }
  | { status: 'parsed'; value: unknown }
  | { status: 'invalid'; message: string };

export function normalizeReviewResponse(rawResponse: string): NormalizeResult {
  const warnings: string[] = [];
  const trimmed = rawResponse.trim();

  if (trimmed.length === 0) {
    warnings.push('Response is empty.');
    return buildNormalizeResult({
      structured: false,
      resultJson: undefined,
      warnings,
      reviewFindings: [],
      actionPlan: [],
      replyDrafts: [],
      ruleCandidates: [],
      knowledgeCandidates: []
    });
  }

  const jsonBlock = parseFirstJsonFence(trimmed);
  if (jsonBlock.status === 'invalid') {
    warnings.push(jsonBlock.message);
  }

  const structured = jsonBlock.status === 'parsed';
  const parsedObject = structured && isRecord(jsonBlock.value) ? jsonBlock.value : undefined;
  if (structured && parsedObject === undefined) {
    warnings.push('JSON fenced block must contain an object to generate structured ReviewOps artifacts.');
  }

  const reviewFindings =
    parsedObject !== undefined ? readFindingSeeds(parsedObject) : readFallbackFindingsFromMarkdown(trimmed);
  const actionPlan = parsedObject !== undefined ? readActionPlanSeeds(parsedObject) : [];
  const replyDrafts = parsedObject !== undefined ? readReplyDraftSeeds(parsedObject) : [];
  const ruleCandidates = parsedObject !== undefined ? readRuleCandidateSeeds(parsedObject) : [];
  const knowledgeCandidates = parsedObject !== undefined ? readKnowledgeCandidateSeeds(parsedObject) : [];

  if (!structured) {
    warnings.push('No valid JSON fenced block was found; fallback markdown parsing was used.');
  }
  if (reviewFindings.length === 0) {
    warnings.push('No review findings were detected.');
  }

  return buildNormalizeResult({
    structured,
    resultJson: parsedObject,
    warnings,
    reviewFindings,
    actionPlan,
    replyDrafts,
    ruleCandidates,
    knowledgeCandidates
  });
}

function buildNormalizeResult(options: {
  structured: boolean;
  resultJson: unknown;
  warnings: string[];
  reviewFindings: ReviewFindingSeed[];
  actionPlan: ActionPlanItemSeed[];
  replyDrafts: ReplyDraftSeed[];
  ruleCandidates: RuleCandidateSeed[];
  knowledgeCandidates: KnowledgeCandidateSeed[];
}): NormalizeResult {
  return {
    success: options.warnings.length === 0 || options.reviewFindings.length > 0,
    structured: options.structured,
    resultJson: options.resultJson,
    resultMarkdown: renderResultMarkdown(options),
    reviewFindings: options.reviewFindings,
    actionPlan: options.actionPlan,
    replyDrafts: options.replyDrafts,
    ruleCandidates: options.ruleCandidates,
    knowledgeCandidates: options.knowledgeCandidates,
    warnings: options.warnings,
    requiresUserEdit: !options.structured || options.warnings.length > 0
  };
}

function parseFirstJsonFence(markdown: string): JsonBlockParseResult {
  const match = /```json\s*([\s\S]*?)```/iu.exec(markdown);
  if (match === null) {
    return { status: 'missing' };
  }

  try {
    return { status: 'parsed', value: JSON.parse(match[1]) as unknown };
  } catch (error) {
    return {
      status: 'invalid',
      message: `JSON fenced block could not be parsed: ${error instanceof Error ? error.message : 'unknown error'}`
    };
  }
}

function readFindingSeeds(source: Record<string, unknown>): ReviewFindingSeed[] {
  return readArray(source.findings ?? source.reviewFindings ?? source.review_findings).map((value, index) =>
    toFindingSeed(value, index)
  );
}

function toFindingSeed(value: unknown, index: number): ReviewFindingSeed {
  const source = isRecord(value) ? value : {};
  const title = readString(source.title, `Finding ${index + 1}`);
  const summary = readString(source.summary ?? source.description ?? source.evidence, title);
  const evidence = readOptionalString(source.evidence);
  const recommendation = readOptionalString(source.recommendation ?? source.suggestion);

  return {
    id: readString(source.id, `finding-${index + 1}`),
    title,
    category: normalizeFindingCategory(readString(source.category, title)),
    severity: normalizeSeverity(readString(source.severity, title)),
    summary,
    evidence,
    recommendation
  };
}

function readFallbackFindingsFromMarkdown(markdown: string): ReviewFindingSeed[] {
  const bulletLines = markdown
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+\S/u.test(line))
    .slice(0, 20);

  return bulletLines.map((line, index) => {
    const title = line.replace(/^[-*]\s+/u, '').trim();
    return {
      id: `finding-${index + 1}`,
      title,
      category: normalizeFindingCategory(title),
      severity: normalizeSeverity(title),
      summary: title
    };
  });
}

function readActionPlanSeeds(source: Record<string, unknown>): ActionPlanItemSeed[] {
  return readArray(source.actionPlan ?? source.action_plan ?? source.actions).map((value, index) => {
    const record = isRecord(value) ? value : {};
    const title = readString(record.title, `Action ${index + 1}`);
    const steps = readArray(record.steps).map((step) => readString(step, String(step)));

    return {
      id: readString(record.id, `action-${index + 1}`),
      title,
      priority: normalizeActionPriority(readString(record.priority, 'P2')),
      steps: steps.length > 0 ? steps : [title]
    };
  });
}

function readReplyDraftSeeds(source: Record<string, unknown>): ReplyDraftSeed[] {
  return readArray(source.replyDrafts ?? source.reply_drafts).map((value, index) => {
    const record = isRecord(value) ? value : {};

    return {
      id: readString(record.id, `reply-${index + 1}`),
      target: readString(record.target, 'review thread'),
      body: readString(record.body, '')
    };
  });
}

function readRuleCandidateSeeds(source: Record<string, unknown>): RuleCandidateSeed[] {
  return readArray(source.ruleCandidates ?? source.rule_candidates).map((value, index) => {
    const record = isRecord(value) ? value : {};
    const title = readString(record.title, `Rule candidate ${index + 1}`);

    return {
      id: readString(record.id, `rule-${index + 1}`),
      title,
      rationale: readString(record.rationale ?? record.summary, title)
    };
  });
}

function readKnowledgeCandidateSeeds(source: Record<string, unknown>): KnowledgeCandidateSeed[] {
  return readArray(source.knowledgeCandidates ?? source.knowledge_candidates).map((value, index) => {
    const record = isRecord(value) ? value : {};
    const title = readString(record.title, `Knowledge candidate ${index + 1}`);

    return {
      id: readString(record.id, `knowledge-${index + 1}`),
      title,
      summary: readString(record.summary ?? record.rationale, title)
    };
  });
}

function renderResultMarkdown(options: {
  structured: boolean;
  warnings: string[];
  reviewFindings: ReviewFindingSeed[];
  actionPlan: ActionPlanItemSeed[];
  replyDrafts: ReplyDraftSeed[];
  ruleCandidates: RuleCandidateSeed[];
  knowledgeCandidates: KnowledgeCandidateSeed[];
}): string {
  const lines = [
    '# ReviewOps Result',
    '',
    `Structured: ${options.structured ? 'yes' : 'no'}`,
    `Requires user edit: ${!options.structured || options.warnings.length > 0 ? 'yes' : 'no'}`,
    '',
    '## Review Findings',
    ...renderFindingLines(options.reviewFindings),
    '',
    '## Action Plan',
    ...renderActionPlanLines(options.actionPlan),
    '',
    '## Reply Drafts',
    ...renderSimpleLines(options.replyDrafts.map((reply) => `${reply.target}: ${reply.body}`)),
    '',
    '## Rule Candidates',
    ...renderSimpleLines(options.ruleCandidates.map((rule) => `${rule.title}: ${rule.rationale}`)),
    '',
    '## Knowledge Candidates',
    ...renderSimpleLines(options.knowledgeCandidates.map((knowledge) => `${knowledge.title}: ${knowledge.summary}`))
  ];

  if (options.warnings.length > 0) {
    lines.push('', '## Warnings', ...options.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join('\n')}\n`;
}

function renderFindingLines(findings: ReviewFindingSeed[]): string[] {
  if (findings.length === 0) {
    return ['_No findings were normalized._'];
  }

  return findings.map((finding) => `- [${finding.severity}] [${finding.category}] ${finding.title}`);
}

function renderActionPlanLines(actionPlan: ActionPlanItemSeed[]): string[] {
  if (actionPlan.length === 0) {
    return ['_No action plan items were normalized._'];
  }

  return actionPlan.map((item) => `- [${item.priority}] ${item.title}`);
}

function renderSimpleLines(values: string[]): string[] {
  if (values.length === 0) {
    return ['_No entries were normalized._'];
  }

  return values.map((value) => `- ${value}`);
}

function normalizeFindingCategory(value: string): ReviewFindingCategory {
  const normalized = value.toLowerCase();
  if (/(security|secret|token|credential|auth|xss|sql)/u.test(normalized)) {
    return 'security';
  }
  if (/(test|spec|coverage)/u.test(normalized)) {
    return 'test';
  }
  if (/(doc|readme|comment|drift)/u.test(normalized)) {
    return 'docs';
  }
  if (/(architecture|boundary|layer|coupling|dependency)/u.test(normalized)) {
    return 'architecture';
  }
  if (/(performance|cache|query|latency|memory)/u.test(normalized)) {
    return 'performance';
  }
  if (/(maintainability|refactor|duplicate|naming|complexity)/u.test(normalized)) {
    return 'maintainability';
  }
  if (/(bug|risk|null|undefined|exception|race|regression|fail)/u.test(normalized)) {
    return 'bug-risk';
  }

  return 'other';
}

function normalizeSeverity(value: string): ReviewFindingSeverity {
  const normalized = value.toLowerCase();
  if (/(critical|blocker|security|leak)/u.test(normalized)) {
    return 'critical';
  }
  if (/(major|bug|risk|fail|regression)/u.test(normalized)) {
    return 'major';
  }
  if (/(minor|nit|small)/u.test(normalized)) {
    return 'minor';
  }
  if (/(suggestion|consider|optional)/u.test(normalized)) {
    return 'suggestion';
  }

  return 'unknown';
}

function normalizeActionPriority(value: string): ActionPlanPriority {
  if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') {
    return value;
  }

  return 'P2';
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
