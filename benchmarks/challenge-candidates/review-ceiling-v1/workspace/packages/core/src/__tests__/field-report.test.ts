import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileSystemArtifactStore,
  buildFieldReportArtifacts,
  createSkillEvidence,
  type KnowledgeCandidate,
  type RuleCandidate
} from '../index.js';

describe('field report flow', () => {
  it('writes markdown and json field report artifacts without HR scoring', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-report-'));
    const skillSignals = createSkillEvidence({
      runId: 'run_report',
      createdAt: '2026-05-05T08:30:00.000Z',
      actionPlan: [],
      ruleCandidates: [],
      evidenceRefs: [],
      manualEvidence: [
        {
          kind: 'technical-explanation',
          title: 'Explained a review decision',
          summary: 'Captured the reason for deferring a risky change.',
          strength: 'medium'
        }
      ]
    });
    const ruleCandidates: RuleCandidate[] = [
      {
        id: 'rule-1',
        kind: 'review-rule',
        title: 'Reply with verification result',
        rationale: 'Review replies should mention the focused command that passed.',
        source: { flowRunId: 'run_report' },
        scope: 'portable-candidate',
        status: 'new'
      }
    ];
    const knowledgeCandidates: KnowledgeCandidate[] = [
      {
        id: 'knowledge-1',
        kind: 'good-practice',
        title: 'Good practice: verification in replies',
        summary: 'Mention a focused check in the reply body.',
        sourceFlowRunId: 'run_report',
        scope: 'portable-candidate',
        status: 'candidate'
      },
      {
        id: 'knowledge-local',
        kind: 'project-debt',
        title: 'Local rollout note',
        summary: 'Project-specific note stays local.',
        sourceFlowRunId: 'run_report',
        scope: 'project-local',
        status: 'candidate'
      }
    ];

    const result = await buildFieldReportArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_report',
      period: {
        from: '2026-05-01',
        to: '2026-05-05'
      },
      targetScope: 'field',
      resolvedFindings: 3,
      unresolvedRisks: 1,
      addedTests: 2,
      ruleCandidates,
      knowledgeCandidates,
      skillSignals,
      now: () => new Date('2026-05-05T08:35:00.000Z')
    });

    expect(result.report).toMatchObject({
      resolvedFindings: 3,
      unresolvedRisks: 1,
      addedTests: 2,
      ruleCandidates: 1,
      knowledgeCandidates: 2
    });
    expect(result.report.portableKnowledgeCandidates).toHaveLength(1);
    expect(result.report.recommendedMentorActions).toContain(
      'Review unresolved risks with the developer and decide follow-up ownership.'
    );

    const markdown = await readFile(path.join(workspaceRoot, result.artifacts.markdown.path), 'utf8');
    const json = JSON.parse(await readFile(path.join(workspaceRoot, result.artifacts.json.path), 'utf8')) as {
      markdownPath: string;
      jsonPath: string;
      portableKnowledgeCandidates: unknown[];
    };

    expect(markdown).toContain('# ReviewOps Field Report');
    expect(markdown).toContain('No automatic score, ranking, approval, or HR decision');
    expect(json.markdownPath).toBe(result.artifacts.markdown.path);
    expect(json.jsonPath).toBe(result.artifacts.json.path);
    expect(json.portableKnowledgeCandidates).toHaveLength(1);
  });
});
