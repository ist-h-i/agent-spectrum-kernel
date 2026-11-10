import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  FileSystemArtifactStore,
  buildKnowledgeCaptureArtifacts,
  classifyKnowledgeCandidateSeeds,
  createRuleApplicationPayload,
  proposeRuleCandidates,
  reconcileRuleCandidates,
  renderRuleUpdateMarkdown,
  saveApprovedRuleCandidates
} from '../index.js';

describe('knowledge and rule capture flows', () => {
  it('classifies rule and knowledge candidates without external AI calls', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-knowledge-'));
    const result = await buildKnowledgeCaptureArtifacts({
      artifactStore: new FileSystemArtifactStore(workspaceRoot),
      runId: 'run_knowledge',
      repository: 'ist-h-i/ReviewOps',
      ruleSeeds: [
        {
          id: 'test-rule',
          title: 'Add failure-path coverage before posting review replies',
          rationale: 'Review comments that mention missing coverage should become explicit test work.'
        },
        {
          id: 'repo-local',
          title: 'Document ist-h-i/ReviewOps release checklist',
          rationale: 'This depends on repository-specific release steps.'
        }
      ],
      knowledgeSeeds: [
        {
          id: 'good-practice',
          title: 'Good practice: explain verification results in replies',
          summary: 'A reply should mention the focused command that passed.'
        },
        {
          id: 'local-incident',
          title: 'Project local incident note',
          summary: 'Contains https://example.invalid/internal and should stay local.'
        }
      ],
      existingRules: [
        {
          id: 'existing-test-rule',
          title: 'Add failure-path coverage before posting review replies'
        }
      ],
      now: () => new Date('2026-05-05T08:00:00.000Z')
    });

    expect(result.ruleCandidates.map((candidate) => candidate.kind)).toEqual(['test-rule', 'docs-drift-rule']);
    expect(result.ruleCandidates.map((candidate) => candidate.status)).toEqual(['duplicate', 'new']);
    expect(result.ruleCandidates[0]?.scope).toBe('portable-candidate');
    expect(result.ruleCandidates[1]?.scope).toBe('project-local');
    expect(result.knowledgeCandidates.map((candidate) => candidate.scope)).toEqual([
      'portable-candidate',
      'project-local'
    ]);
    expect(result.reconciliation.duplicateCount).toBe(1);

    await expect(stat(path.join(workspaceRoot, result.artifacts.ruleCandidates.path))).resolves.toBeDefined();
    await expect(readFile(path.join(workspaceRoot, result.artifacts.portableChecklist.path), 'utf8')).resolves.toContain(
      'Portable candidates: 2'
    );
  });

  it('saves only user-approved applicable rule candidates to shared or local knowledge files', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-rule-apply-'));
    const candidates = proposeRuleCandidates({
      runId: 'run_apply',
      repository: 'ist-h-i/ReviewOps',
      ruleSeeds: [
        {
          id: 'portable-test',
          title: 'Require test evidence for risky review fixes',
          rationale: 'Risky fixes should include the smallest focused verification command.'
        },
        {
          id: 'local-rule',
          title: 'Keep ist-h-i/ReviewOps bootstrap note local',
          rationale: 'Repository-specific notes should not become portable knowledge.'
        },
        {
          id: 'secret-rule',
          title: 'Never save token examples',
          rationale: 'This token-shaped rule should be rejected by scope classification.'
        }
      ]
    });

    const result = await saveApprovedRuleCandidates({
      workspaceRoot,
      candidates,
      approvedCandidateIds: candidates.map((candidate) => candidate.id),
      approvedBy: 'tester',
      now: () => new Date('2026-05-05T08:05:00.000Z')
    });

    expect(result.saved.map((item) => item.path).sort()).toEqual([
      '.reviewops.local/project-rules.local.yaml',
      '.reviewops/knowledge/test-rules.yaml'
    ]);
    expect(result.skipped).toEqual([
      {
        candidateId: 'secret-rule',
        reason: 'Candidate status is rejected.'
      }
    ]);
    const application = createRuleApplicationPayload(result, candidates);
    const updateMarkdown = renderRuleUpdateMarkdown(application);
    expect(application.approvedCandidateIds).toEqual(candidates.map((candidate) => candidate.id));
    expect(updateMarkdown).toContain('Saved rules: 2');
    expect(updateMarkdown).toContain('Skipped candidates: 1');
    await expect(readFile(path.join(workspaceRoot, '.reviewops/knowledge/test-rules.yaml'), 'utf8')).resolves.toContain(
      'Require test evidence for risky review fixes'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops.local/project-rules.local.yaml'), 'utf8')).resolves.toContain(
      'Keep ist-h-i/ReviewOps bootstrap note local'
    );
    await expect(readFile(path.join(workspaceRoot, '.reviewops/out/rule-applications.jsonl'), 'utf8')).resolves.toContain(
      '"approvedBy":"tester"'
    );
  });

  it('appends project-local rules into the matching local collection', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-rule-collections-'));

    await saveApprovedRuleCandidates({
      workspaceRoot,
      candidates: [
        {
          id: 'local-guideline',
          kind: 'coding-guideline',
          title: 'Keep local formatting convention',
          rationale: 'Project-specific formatting conventions should stay local.',
          source: {
            flowRunId: 'run_guideline'
          },
          scope: 'project-local',
          status: 'new'
        },
        {
          id: 'local-pattern',
          kind: 'generic-debt-pattern',
          title: 'Keep local debt pattern',
          rationale: 'Project-specific debt patterns should stay local.',
          source: {
            flowRunId: 'run_pattern'
          },
          scope: 'project-local',
          status: 'new'
        }
      ],
      approvedCandidateIds: ['local-guideline', 'local-pattern'],
      now: () => new Date('2026-05-05T07:10:00.000Z')
    });
    await saveApprovedRuleCandidates({
      workspaceRoot,
      candidates: [
        {
          id: 'local-review-rule',
          kind: 'review-rule',
          title: 'Keep local review rule',
          rationale: 'Project-specific review rules should stay local.',
          source: {
            flowRunId: 'run_rule'
          },
          scope: 'project-local',
          status: 'new'
        }
      ],
      approvedCandidateIds: ['local-review-rule'],
      now: () => new Date('2026-05-05T07:12:00.000Z')
    });

    const rulesYaml = await readFile(path.join(workspaceRoot, '.reviewops.local/project-rules.local.yaml'), 'utf8');
    const parsedRules = parse(rulesYaml) as {
      rules: Array<{ id: string }>;
      guidelines: Array<{ id: string }>;
      patterns: Array<{ id: string }>;
    };

    expect(parsedRules.rules.map((rule) => rule.id)).toEqual(['local-review-rule']);
    expect(parsedRules.guidelines.map((rule) => rule.id)).toEqual(['local-guideline']);
    expect(parsedRules.patterns.map((rule) => rule.id)).toEqual(['local-pattern']);
  });

  it('does not apply merge-needed candidates before human reconciliation', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-rule-merge-'));
    const proposed = proposeRuleCandidates({
      runId: 'run_merge',
      ruleSeeds: [
        {
          id: 'merge-needed-rule',
          title: 'Require focused verification for risky review fix replies',
          rationale: 'Risky fixes should include focused verification before reply comments are posted.'
        }
      ]
    });
    const { candidates } = reconcileRuleCandidates(proposed, [
      {
        id: 'existing-risky-review-rule',
        title: 'Require focused verification for risky review fixes'
      }
    ]);

    expect(candidates[0]?.status).toBe('merge_needed');

    const result = await saveApprovedRuleCandidates({
      workspaceRoot,
      candidates,
      approvedCandidateIds: candidates.map((candidate) => candidate.id),
      approvedBy: 'tester',
      now: () => new Date('2026-05-05T08:07:00.000Z')
    });

    expect(result.saved).toEqual([]);
    expect(result.skipped).toEqual([
      {
        candidateId: 'merge-needed-rule',
        reason: 'Candidate status is merge_needed.'
      }
    ]);
    await expect(readFile(path.join(workspaceRoot, '.reviewops/knowledge/review-rules.yaml'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('keeps Japanese rule titles distinct during normalization', () => {
    const proposed = proposeRuleCandidates({
      runId: 'run_japanese',
      ruleSeeds: [
        {
          id: 'jp-verification',
          title: '危険な修正では検証結果を返信に含める',
          rationale: 'レビュー返信では実行した検証コマンドを明示する。'
        },
        {
          id: 'jp-docs',
          title: '仕様変更ではREADMEを更新する',
          rationale: '利用者向けの仕様差分はドキュメントにも反映する。'
        },
        {
          id: 'jp-verification-duplicate',
          title: '危険な修正では検証結果を返信に含める',
          rationale: '同じルール候補は重複として扱う。'
        }
      ]
    });

    expect(proposed.map((candidate) => candidate.id)).toEqual(['jp-verification', 'jp-docs']);

    const { candidates } = reconcileRuleCandidates(proposed, [
      {
        id: 'existing-jp-docs',
        title: '仕様変更ではREADMEを更新する'
      }
    ]);

    expect(candidates.map((candidate) => candidate.status)).toEqual(['new', 'duplicate']);
  });

  it('marks secret-looking knowledge as rejected instead of portable', () => {
    const [candidate] = classifyKnowledgeCandidateSeeds({
      runId: 'run_secret',
      seeds: [
        {
          id: 'secret',
          title: 'Token handling example',
          summary: 'Do not store secret or credential values in knowledge.'
        }
      ]
    });

    expect(candidate).toMatchObject({
      scope: 'prohibited',
      status: 'rejected'
    });
  });
});
