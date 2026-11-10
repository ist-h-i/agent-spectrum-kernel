import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

import { describe, expect, it } from 'vitest';

import {
  ProjectContextError,
  initializeReviewOpsProject,
  isReviewOpsProjectContextConfigured,
  saveApprovedRuleCandidates,
  setupReviewOpsProjectContext
} from '../index.js';

describe('project context setup', () => {
  it('writes local project context and rules without storing tokens', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-project-context-'));
    await initializeReviewOpsProject({ workspaceRoot });

    await expect(isReviewOpsProjectContextConfigured(workspaceRoot)).resolves.toBe(false);
    const result = await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        technicalStack: ['TypeScript', 'Node.js', 'TypeScript'],
        architecture: ['Core must not import VS Code APIs.'],
        codingConventions: ['Use pnpm workspace scripts.'],
        testPolicy: ['Run focused tests for touched packages.'],
        reviewPolicy: ['Preview comments before publishing.'],
        aiUsageRules: ['No direct external AI API calls.'],
        customerConstraints: ['Do not copy customer URLs into portable knowledge.']
      },
      now: () => new Date('2026-05-05T07:00:00.000Z')
    });

    expect(result.contextPath).toBe('.reviewops.local/project-context.local.yaml');
    expect(result.rulesPath).toBe('.reviewops.local/project-rules.local.yaml');
    expect(result.context.context.technicalStack).toEqual(['TypeScript', 'Node.js']);
    await expect(isReviewOpsProjectContextConfigured(workspaceRoot)).resolves.toBe(true);

    const contextYaml = await readFile(path.join(workspaceRoot, result.contextPath), 'utf8');
    const rulesYaml = await readFile(path.join(workspaceRoot, result.rulesPath), 'utf8');
    const parsedContext = parse(contextYaml) as { context: { aiUsageRules: string[] } };
    const parsedRules = parse(rulesYaml) as {
      rules: Array<{ id: string; source?: string; title: string }>;
      guidelines: Array<{ id: string; source?: string; title: string }>;
    };

    expect(parsedContext.context.aiUsageRules).toEqual(['No direct external AI API calls.']);
    expect(parsedRules.rules.map((rule) => rule.title)).toContain(
      'Customer constraint: Do not copy customer URLs into portable knowledge.'
    );
    expect(parsedRules.guidelines.map((rule) => rule.title)).toContain('Coding convention: Use pnpm workspace scripts.');
    expect(parsedRules.rules.every((rule) => rule.source === 'project/context')).toBe(true);
    expect(parsedRules.guidelines.every((rule) => rule.source === 'project/context')).toBe(true);
    expect(`${contextYaml}\n${rulesYaml}`).not.toMatch(/token|secret/i);
  });

  it('keeps local project rules appendable after context setup', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-project-rules-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        codingConventions: ['Use pnpm workspace scripts.'],
        reviewPolicy: ['Preview comments before publishing.']
      },
      now: () => new Date('2026-05-05T07:00:00.000Z')
    });

    await saveApprovedRuleCandidates({
      workspaceRoot,
      candidates: [
        {
          id: 'local-rule',
          kind: 'review-rule',
          title: 'Keep repository-specific notes local',
          rationale: 'Repository-specific notes should stay in project-local rules.',
          source: {
            flowRunId: 'run_project_context'
          },
          scope: 'project-local',
          status: 'new'
        }
      ],
      approvedCandidateIds: ['local-rule'],
      approvedBy: 'tester',
      now: () => new Date('2026-05-05T07:05:00.000Z')
    });

    const rulesYaml = await readFile(path.join(workspaceRoot, '.reviewops.local/project-rules.local.yaml'), 'utf8');
    const parsedRules = parse(rulesYaml) as {
      rules: Array<{ id: string; title: string }>;
      guidelines: Array<{ id: string; title: string }>;
    };

    expect(parsedRules.rules.map((rule) => rule.id)).toEqual(['project-context-review-policy-1', 'local-rule']);
    expect(parsedRules.guidelines.map((rule) => rule.id)).toEqual(['project-context-coding-conventions-1']);
    expect(parsedRules.rules.map((rule) => rule.title)).toEqual([
      'Review policy: Preview comments before publishing.',
      'Keep repository-specific notes local'
    ]);
  });

  it('preserves existing local rule collections when updating context', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-project-rule-collections-'));
    await initializeReviewOpsProject({ workspaceRoot });

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
      approvedBy: 'tester',
      now: () => new Date('2026-05-05T07:03:00.000Z')
    });

    await setupReviewOpsProjectContext({
      workspaceRoot,
      input: {
        reviewPolicy: ['Preview comments before publishing.']
      },
      now: () => new Date('2026-05-05T07:08:00.000Z')
    });

    const rulesYaml = await readFile(path.join(workspaceRoot, '.reviewops.local/project-rules.local.yaml'), 'utf8');
    const parsedRules = parse(rulesYaml) as {
      rules: Array<{ id: string }>;
      guidelines: Array<{ id: string }>;
      patterns: Array<{ id: string }>;
    };

    expect(parsedRules.rules.map((rule) => rule.id)).toEqual(['project-context-review-policy-1']);
    expect(parsedRules.guidelines.map((rule) => rule.id)).toEqual(['local-guideline']);
    expect(parsedRules.patterns.map((rule) => rule.id)).toEqual(['local-pattern']);
  });

  it('rejects empty context input', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-empty-context-'));

    await expect(
      setupReviewOpsProjectContext({
        workspaceRoot,
        input: {
          technicalStack: ['  ']
        }
      })
    ).rejects.toThrow(ProjectContextError);
  });
});
