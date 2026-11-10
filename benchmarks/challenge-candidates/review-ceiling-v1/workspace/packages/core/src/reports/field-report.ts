import type { ArtifactStore } from '../ports/artifact-store.js';
import { toFlowSlug } from '../domain/artifacts.js';
import type {
  FieldReport,
  FlowArtifactRef,
  KnowledgeCandidate,
  RuleCandidate,
  SkillEvidence
} from '../types.js';

export interface BuildFieldReportArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  period: {
    from: string;
    to: string;
  };
  targetScope: FieldReport['targetScope'];
  resolvedFindings?: number;
  unresolvedRisks?: number;
  addedTests?: number;
  ruleCandidates?: RuleCandidate[];
  knowledgeCandidates?: KnowledgeCandidate[];
  skillSignals?: SkillEvidence[];
  flowId?: string;
  now?: () => Date;
}

export interface BuildFieldReportArtifactsResult {
  report: FieldReport;
  artifacts: {
    markdown: FlowArtifactRef;
    json: FlowArtifactRef;
  };
}

export async function buildFieldReportArtifacts(
  options: BuildFieldReportArtifactsOptions
): Promise<BuildFieldReportArtifactsResult> {
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const flowId = options.flowId ?? 'field/report';
  const report = createFieldReportSkeleton({
    runId: options.runId,
    flowId,
    period: options.period,
    targetScope: options.targetScope,
    resolvedFindings: options.resolvedFindings ?? 0,
    unresolvedRisks: options.unresolvedRisks ?? 0,
    addedTests: options.addedTests ?? 0,
    ruleCandidates: options.ruleCandidates ?? [],
    knowledgeCandidates: options.knowledgeCandidates ?? [],
    skillSignals: options.skillSignals ?? []
  });
  const markdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'field-report.md',
    kind: 'markdown',
    content: renderFieldReportMarkdown(report, createdAt),
    createdAt
  });
  const jsonReport = {
    ...report,
    markdownPath: markdown.path
  };
  const json = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'field-report.json',
    kind: 'json',
    content: `${JSON.stringify({ ...jsonReport, jsonPath: report.jsonPath }, null, 2)}\n`,
    createdAt
  });
  const finalReport = {
    ...jsonReport,
    jsonPath: json.path
  };

  await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'field-report.json',
    kind: 'json',
    content: `${JSON.stringify(finalReport, null, 2)}\n`,
    createdAt
  });

  return {
    report: finalReport,
    artifacts: {
      markdown,
      json: {
        ...json,
        path: finalReport.jsonPath
      }
    }
  };
}

export function createFieldReportSkeleton(options: {
  runId: string;
  flowId?: string;
  period: FieldReport['period'];
  targetScope: FieldReport['targetScope'];
  resolvedFindings: number;
  unresolvedRisks: number;
  addedTests: number;
  ruleCandidates: RuleCandidate[];
  knowledgeCandidates: KnowledgeCandidate[];
  skillSignals: SkillEvidence[];
}): FieldReport {
  const portableKnowledgeCandidates = options.knowledgeCandidates.filter(
    (candidate) => candidate.scope === 'portable-candidate'
  );
  const recommendedMentorActions = createMentorActions({
    unresolvedRisks: options.unresolvedRisks,
    portableKnowledgeCandidates,
    skillSignals: options.skillSignals
  });

  return {
    id: `field_report_${safeId(options.runId)}`,
    period: options.period,
    targetScope: options.targetScope,
    summary: [
      `${options.resolvedFindings} resolved findings`,
      `${options.unresolvedRisks} unresolved risks`,
      `${options.addedTests} added tests`,
      `${options.skillSignals.length} skill evidence signals`
    ].join('; '),
    resolvedFindings: options.resolvedFindings,
    unresolvedRisks: options.unresolvedRisks,
    addedTests: options.addedTests,
    ruleCandidates: options.ruleCandidates.length,
    knowledgeCandidates: options.knowledgeCandidates.length,
    skillSignals: options.skillSignals,
    portableKnowledgeCandidates,
    recommendedMentorActions,
    markdownPath: artifactPath(options.flowId ?? 'field/report', options.runId, 'field-report.md'),
    jsonPath: artifactPath(options.flowId ?? 'field/report', options.runId, 'field-report.json')
  };
}

export function renderFieldReportMarkdown(report: FieldReport, createdAt: string): string {
  return [
    '# ReviewOps Field Report',
    '',
    `Created at: ${createdAt}`,
    `Period: ${report.period.from} to ${report.period.to}`,
    `Scope: ${report.targetScope}`,
    '',
    '## Summary',
    '',
    report.summary,
    '',
    '## Review Outcomes',
    '',
    `- Resolved findings: ${report.resolvedFindings}`,
    `- Unresolved risks: ${report.unresolvedRisks}`,
    `- Added tests: ${report.addedTests}`,
    `- Rule candidates: ${report.ruleCandidates}`,
    `- Knowledge candidates: ${report.knowledgeCandidates}`,
    '',
    '## Skill Evidence',
    '',
    ...renderSkillEvidenceLines(report.skillSignals),
    '',
    '## Portable Knowledge Candidates',
    '',
    ...renderPortableKnowledgeLines(report.portableKnowledgeCandidates),
    '',
    '## Recommended Mentor Actions',
    '',
    ...renderMentorActionLines(report.recommendedMentorActions),
    '',
    'No automatic score, ranking, approval, or HR decision is generated by this report.',
    ''
  ].join('\n');
}

function createMentorActions(options: {
  unresolvedRisks: number;
  portableKnowledgeCandidates: KnowledgeCandidate[];
  skillSignals: SkillEvidence[];
}): string[] {
  const actions: string[] = [];
  if (options.unresolvedRisks > 0) {
    actions.push('Review unresolved risks with the developer and decide follow-up ownership.');
  }
  if (options.portableKnowledgeCandidates.length > 0) {
    actions.push('Run the portable knowledge checklist before sharing candidates beyond the project.');
  }
  if (options.skillSignals.length === 0) {
    actions.push('Capture at least one review action or explanation artifact before using this report in 1on1s.');
  }
  if (actions.length === 0) {
    actions.push('Use this report as discussion material in a mentor review.');
  }

  return actions;
}

function renderSkillEvidenceLines(signals: SkillEvidence[]): string[] {
  if (signals.length === 0) {
    return ['_No skill evidence has been captured for this period._'];
  }

  return signals.map((signal) => `- [${signal.kind}] ${signal.title}: ${signal.summary}`);
}

function renderPortableKnowledgeLines(candidates: KnowledgeCandidate[]): string[] {
  if (candidates.length === 0) {
    return ['_No portable knowledge candidates were captured._'];
  }

  return candidates.map((candidate) => `- [${candidate.kind}] ${candidate.title}: ${candidate.summary}`);
}

function renderMentorActionLines(actions: string[]): string[] {
  return actions.map((action) => `- ${action}`);
}

function artifactPath(flowId: string, runId: string, name: string): string {
  return `.reviewops/out/${toFlowSlug(flowId)}/${runId}/${name}`;
}

function safeId(value: string): string {
  const normalized = value.replaceAll(/[^0-9a-z-]/giu, '-').replaceAll(/^-+|-+$/gu, '').toLowerCase();
  return normalized.length > 0 ? normalized : 'report';
}
