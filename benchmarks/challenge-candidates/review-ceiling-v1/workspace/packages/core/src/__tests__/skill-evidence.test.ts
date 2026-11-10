import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileSystemArtifactStore,
  buildReviewResolutionArtifacts,
  buildSkillEvidenceArtifacts,
  createSkillEvidence,
  proposeRuleCandidates,
  type ReviewComment,
  type ReviewTargetRef
} from '../index.js';

const target: ReviewTargetRef = {
  provider: 'github',
  repository: 'ist-h-i/ReviewOps',
  id: 'pull:7'
};

const comments: ReviewComment[] = [
  {
    id: 'review:1',
    body: 'Please add coverage for this regression risk before posting the reply.',
    file: 'src/example.ts'
  },
  {
    id: 'review:2',
    body: 'Could you explain why this belongs in core?'
  }
];

describe('skill evidence capture flow', () => {
  it('writes skill evidence artifacts and local field evidence jsonl without scoring', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-skill-'));
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);
    const resolution = await buildReviewResolutionArtifacts({
      artifactStore,
      runId: 'run_resolution',
      target,
      comments,
      now: () => new Date('2026-05-05T08:10:00.000Z')
    });
    const ruleCandidates = proposeRuleCandidates({
      runId: 'run_skill',
      ruleSeeds: [
        {
          id: 'rule-test',
          title: 'Require test evidence before resolving risky comments',
          rationale: 'A risky review reply should mention the focused verification command.'
        }
      ]
    });

    const result = await buildSkillEvidenceArtifacts({
      artifactStore,
      workspaceRoot,
      runId: 'run_skill',
      target,
      triage: resolution.triage,
      actionPlan: resolution.actionPlan,
      ruleCandidates,
      evidenceRefs: [resolution.artifacts.actionPlan, resolution.artifacts.commentTriage],
      now: () => new Date('2026-05-05T08:15:00.000Z')
    });

    expect(result.skillEvidence.map((evidence) => evidence.kind)).toEqual([
      'review-response-quality',
      'fix-planning',
      'test-design',
      'rule-extraction'
    ]);
    expect(result.skillEvidence.every((evidence) => !('score' in evidence))).toBe(true);

    const artifact = await readFile(path.join(workspaceRoot, result.artifacts.skillEvidence.path), 'utf8');
    const fieldEvidence = await readFile(path.join(workspaceRoot, result.fieldEvidenceLogPath), 'utf8');

    expect(artifact).toContain('Reusable rule candidates extracted');
    expect(fieldEvidence).toContain('"evaluationUse":"mentor-review"');
    expect(fieldEvidence).toContain('without automatic scoring or ranking');
  });

  it('creates a weak placeholder when there is no review evidence yet', () => {
    const [evidence] = createSkillEvidence({
      runId: 'run_empty',
      createdAt: '2026-05-05T08:20:00.000Z',
      actionPlan: [],
      ruleCandidates: [],
      evidenceRefs: [],
      manualEvidence: []
    });

    expect(evidence).toMatchObject({
      kind: 'technical-explanation',
      strength: 'weak',
      evaluationUse: 'self-review'
    });
  });
});
