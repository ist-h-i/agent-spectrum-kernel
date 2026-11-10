import type { ArtifactStore } from '../ports/artifact-store.js';
import type { FlowArtifactRef, ReviewTargetRef } from '../types.js';
import { defaultDiffReviewPromptTemplate, type PromptTemplate } from './templates.js';

export interface ReviewPromptInput {
  diff: string;
  target?: ReviewTargetRef;
  projectContext?: string;
  localRules?: string[];
  portableRules?: string[];
  knownDebtPatterns?: string[];
  focus?: string[];
  notes?: string;
}

export interface PromptMetadata {
  flowId: string;
  runId?: string;
  templateId: string;
  templateVersion: number;
  generatedAt: string;
  aiExecution: 'manual-only';
  aiNetworkAccess: false;
  informationTypes: string[];
  target?: ReviewTargetRef;
  warnings: string[];
  userResponsibility: string;
}

export interface RenderReviewPromptOptions {
  input: ReviewPromptInput;
  generatedAt: string;
  flowId?: string;
  runId?: string;
  template?: PromptTemplate;
}

export interface RenderReviewPromptResult {
  promptMarkdown: string;
  inputSummaryMarkdown: string;
  metadata: PromptMetadata;
}

export interface BuildReviewPromptArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  input: ReviewPromptInput;
  flowId?: string;
  template?: PromptTemplate;
  now?: () => Date;
}

export interface BuildReviewPromptArtifactsResult extends RenderReviewPromptResult {
  artifacts: {
    prompt: FlowArtifactRef;
    inputSummary: FlowArtifactRef;
    metadata: FlowArtifactRef;
  };
}

const defaultFlowId = 'diff/review';
const redactionResponsibility =
  'ReviewOps does not automatically guarantee masking. Confirm site rules and remove secrets before sharing this prompt.';

export function renderReviewPrompt(options: RenderReviewPromptOptions): RenderReviewPromptResult {
  const template = options.template ?? defaultDiffReviewPromptTemplate;
  const flowId = options.flowId ?? template.flowId;
  const warnings = collectPromptWarnings(options.input);
  const informationTypes = collectInformationTypes(options.input);
  const metadata: PromptMetadata = {
    flowId,
    runId: options.runId,
    templateId: template.id,
    templateVersion: template.version,
    generatedAt: options.generatedAt,
    aiExecution: 'manual-only',
    aiNetworkAccess: false,
    informationTypes,
    target: options.input.target,
    warnings,
    userResponsibility: redactionResponsibility
  };
  const inputSummaryMarkdown = renderInputSummary(options.input, metadata);
  const sections = template.sections.map((section) =>
    renderSection(section.id, section.title, options.input, inputSummaryMarkdown, flowId)
  );

  return {
    promptMarkdown: ['# ReviewOps Prompt', '', ...sections].join('\n').trimEnd() + '\n',
    inputSummaryMarkdown,
    metadata
  };
}

export async function buildReviewPromptArtifacts(
  options: BuildReviewPromptArtifactsOptions
): Promise<BuildReviewPromptArtifactsResult> {
  const flowId = options.flowId ?? defaultFlowId;
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const rendered = renderReviewPrompt({
    input: options.input,
    generatedAt: createdAt,
    flowId,
    runId: options.runId,
    template: options.template
  });

  const inputSummary = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'input-summary.md',
    kind: 'markdown',
    content: rendered.inputSummaryMarkdown,
    createdAt
  });
  const prompt = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'prompt.md',
    kind: 'markdown',
    content: rendered.promptMarkdown,
    createdAt
  });
  const metadata = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'prompt-metadata.json',
    kind: 'json',
    content: `${JSON.stringify(rendered.metadata, null, 2)}\n`,
    createdAt
  });

  return {
    ...rendered,
    artifacts: {
      prompt,
      inputSummary,
      metadata
    }
  };
}

function renderSection(
  sectionId: string,
  title: string,
  input: ReviewPromptInput,
  inputSummaryMarkdown: string,
  flowId: string
): string {
  const content = renderSectionContent(sectionId, input, inputSummaryMarkdown, flowId);
  return [`## ${title}`, '', content].join('\n').trimEnd() + '\n';
}

function renderSectionContent(
  sectionId: string,
  input: ReviewPromptInput,
  inputSummaryMarkdown: string,
  flowId: string
): string {
  const isResearchFlow = flowId.startsWith('research/');
  switch (sectionId) {
    case 'purpose':
      if (isResearchFlow) {
        return [
          'Help with structured investigation by analyzing the supplied scope, files, or operational context.',
          'ReviewOps only prepares this prompt and stores imported findings; it does not call external AI APIs.'
        ].join('\n');
      }
      return [
        'Help with review work by analyzing the supplied diff or investigation context and preparing explainable review outputs.',
        'ReviewOps only prepares this prompt and stores imported responses; it does not call external AI APIs.'
      ].join('\n');
    case 'projectContext':
      return input.projectContext?.trim() ? input.projectContext.trim() : '_No project context was provided._';
    case 'target':
      return renderTarget(input.target);
    case 'diffSummary':
    case 'inputSummary':
      return inputSummaryMarkdown.replace(/^# Input Summary\s*/u, '').trim();
    case 'rules':
      return renderRules(input);
    case 'task':
      if (isResearchFlow) {
        return [
          'Investigate the supplied scope for correctness risks, design constraints, operational concerns, test impact, and documentation drift.',
          'Return concrete findings, a small follow-up action plan, and reusable knowledge candidates when relevant.',
          redactionResponsibility
        ].join('\n');
      }
      return [
        'Review the supplied diff or investigation context for correctness, maintainability, test impact, architecture boundaries, and documentation drift.',
        'Return concrete findings, a small action plan, reply draft material when relevant, and reusable rule or knowledge candidates.',
        redactionResponsibility
      ].join('\n');
    case 'expectedOutput':
      if (isResearchFlow) {
        return [
          '- Markdown summary with the highest-risk or highest-uncertainty findings first.',
          '- A fenced JSON block that matches the output schema.',
          '- Clear follow-up items that a developer can execute without automatic code changes.',
          '- Knowledge candidates only when the point is reusable beyond this exact investigation.'
        ].join('\n');
      }
      return [
        '- Markdown summary with the highest-risk findings first.',
        '- A fenced JSON block that matches the output schema.',
        '- Clear action-plan items that a developer can execute without automatic code changes.',
        '- Rule and knowledge candidates only when the point is reusable beyond this exact change.'
      ].join('\n');
    case 'outputSchema':
      return renderOutputSchema();
    default:
      return `_Template section "${sectionId}" has no renderer yet._`;
  }
}

function renderInputSummary(input: ReviewPromptInput, metadata: PromptMetadata): string {
  const reviewInput = input.diff.trim();
  const inputLanguage = looksLikeDiffInput(reviewInput) ? 'diff' : 'text';
  const lines = [
    '# Input Summary',
    '',
    '## Information Types Included',
    ...metadata.informationTypes.map((type) => `- ${type}`),
    '',
    '## Review Input',
    fenced(reviewInput || 'No review input was provided.', inputLanguage)
  ];

  if (input.focus !== undefined && input.focus.length > 0) {
    lines.push('', '## User-Selected Focus', ...input.focus.map((focus) => `- ${focus}`));
  }

  if (input.notes?.trim()) {
    lines.push('', '## Notes', input.notes.trim());
  }

  if (metadata.warnings.length > 0) {
    lines.push('', '## Warnings', ...metadata.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join('\n')}\n`;
}

function collectInformationTypes(input: ReviewPromptInput): string[] {
  const types = [looksLikeDiffInput(input.diff) ? 'diff' : 'review input'];

  if (input.target !== undefined) {
    types.push('target metadata');
  }
  if (input.projectContext?.trim()) {
    types.push('project context');
  }
  if (input.localRules !== undefined && input.localRules.length > 0) {
    types.push('local rules');
  }
  if (input.portableRules !== undefined && input.portableRules.length > 0) {
    types.push('portable rules');
  }
  if (input.knownDebtPatterns !== undefined && input.knownDebtPatterns.length > 0) {
    types.push('known debt patterns');
  }
  if (input.focus !== undefined && input.focus.length > 0) {
    types.push('user-selected focus');
  }

  return types;
}

function collectPromptWarnings(input: ReviewPromptInput): string[] {
  const warnings = [];
  if (input.diff.trim().length === 0) {
    warnings.push('Review input is empty; generated review output will need manual completion.');
  }

  return warnings;
}

function looksLikeDiffInput(value: string): boolean {
  return /^diff --git /mu.test(value) || /^@@ /mu.test(value);
}

function renderTarget(target: ReviewTargetRef | undefined): string {
  if (target === undefined) {
    return 'Local diff without PR/MR metadata.';
  }

  return [
    `- Provider: ${target.provider}`,
    `- Repository: ${target.repository}`,
    `- Target ID: ${target.id}`,
    target.url !== undefined ? `- URL: ${target.url}` : undefined
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

function renderRules(input: ReviewPromptInput): string {
  return [
    renderList('Local Rules', input.localRules),
    renderList('Portable Rules', input.portableRules),
    renderList('Known Debt Patterns', input.knownDebtPatterns)
  ].join('\n\n');
}

function renderList(title: string, values: string[] | undefined): string {
  if (values === undefined || values.length === 0) {
    return `### ${title}\n_No entries were provided._`;
  }

  return [`### ${title}`, ...values.map((value) => `- ${value}`)].join('\n');
}

function renderOutputSchema(): string {
  return fenced(
    JSON.stringify(
      {
        summary: 'Short review summary',
        findings: [
          {
            title: 'Finding title',
            category: 'bug-risk | architecture | test | docs | security | performance | maintainability | other',
            severity: 'critical | major | minor | suggestion',
            evidence: 'File, line, or diff hunk reference',
            recommendation: 'Concrete fix direction'
          }
        ],
        actionPlan: [
          {
            title: 'Action title',
            priority: 'P0 | P1 | P2 | P3',
            steps: ['Small implementation step']
          }
        ],
        replyDrafts: [
          {
            target: 'Comment or review thread',
            body: 'Preview-first reply draft'
          }
        ],
        ruleCandidates: [
          {
            title: 'Reusable review rule',
            rationale: 'Why this rule should exist'
          }
        ],
        knowledgeCandidates: [
          {
            title: 'Reusable knowledge item',
            summary: 'Portable lesson or local-only note'
          }
        ]
      },
      null,
      2
    ),
    'json'
  );
}

function fenced(content: string, language: string): string {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(content) + 1));

  return [`${fence}${language}`, content, fence].join('\n');
}

function longestBacktickRun(content: string): number {
  return Math.max(0, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
}
