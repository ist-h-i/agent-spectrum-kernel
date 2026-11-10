import { describe, expect, it } from 'vitest';

import {
  FlowManifestValidationError,
  coreFoundationFlowManifest,
  createFlowRegistry,
  validateFlowManifest
} from '../index.js';

describe('flow manifest foundation', () => {
  it('registers P0 foundation and prompt response flows as manual-only with no AI network access', () => {
    const registry = createFlowRegistry();

    expect(registry.get('project/init')?.priority).toBe('P0');
    expect(registry.get('project/init')?.nextActions).toEqual(['project/context']);
    expect(registry.get('project/context')?.sideEffects).toEqual(['write-local-state']);
    expect(registry.get('meta/list')?.type).toBe('meta');
    expect(registry.get('review/select-target')?.outputs.map((output) => output.kind)).toContain('target');
    expect(registry.get('diff/review')?.nextActions).toEqual(['response/import']);
    expect(registry.get('response/import')?.network.ai).toBe(false);
    expect(registry.get('response/normalize')?.outputs.map((output) => output.kind)).toContain('action-plan');
    expect(registry.get('response/normalize')?.nextActions).toEqual(['review/action-plan']);
    expect(registry.get('research/select-scope')?.nextActions).toEqual(['research/investigate']);
    expect(registry.get('research/investigate')?.nextActions).toEqual(['research/import-findings']);
    expect(registry.get('research/action-plan')?.nextActions).toEqual(['knowledge/capture-candidates']);
    expect(registry.get('review/comment-triage')?.outputs.map((output) => output.kind)).toContain('comment-triage');
    expect(registry.get('review/action-plan')?.nextActions).toEqual(['fix/plan', 'review/reply-drafts']);
    expect(registry.get('fix/plan')?.nextActions).toEqual(['fix/checklist']);
    expect(registry.get('fix/checklist')?.outputs.map((output) => output.kind)).toContain('fix-checklist');
    expect(registry.get('fix/verify')?.outputs.map((output) => output.kind)).toContain('fix-verification');
    expect(registry.get('fix/explain')?.nextActions).toEqual(['publish/reply-draft', 'review/action-plan']);
    expect(registry.get('refactor/plan')?.nextActions).toEqual(['refactor/checklist']);
    expect(registry.get('refactor/checklist')?.outputs.map((output) => output.kind)).toContain('refactor-checklist');
    expect(registry.get('refactor/verify')?.nextActions).toEqual(['refactor/explain', 'refactor/plan']);
    expect(registry.get('refactor/explain')?.nextActions).toEqual(['rules/propose', 'refactor/plan']);
    expect(registry.get('publish/reply-draft')?.outputs.map((output) => output.kind)).toContain('publish-draft');
    expect(registry.get('publish/reply-draft')?.nextActions).toEqual(['rules/propose']);
    expect(registry.get('provider/list-targets')?.network).toEqual({
      ai: false,
      devServices: true
    });
    expect(registry.get('provider/fetch-review')?.outputs.map((output) => output.id)).toEqual(['diff', 'comments']);
    expect(registry.get('publish/summary-draft')?.outputs.map((output) => output.kind)).toContain('publish-draft');
    expect(registry.get('rules/propose')?.outputs.map((output) => output.kind)).toContain('rule-candidate');
    expect(registry.get('rules/reconcile')?.nextActions).toEqual(['rules/apply']);
    expect(registry.get('rules/apply')?.sideEffects).toContain('write-knowledge');
    expect(registry.get('knowledge/capture-candidates')?.outputs.map((output) => output.kind)).toContain(
      'knowledge-candidate'
    );
    expect(registry.get('skill/evidence-capture')?.outputs.map((output) => output.kind)).toContain('skill-evidence');
    expect(registry.get('field/report')?.outputs.map((output) => output.kind)).toContain('field-report');
    expect(registry.get('cycle/comment-response')?.nextActions).toEqual(['provider/fetch-review']);
    expect(registry.get('cycle/fix-review')?.type).toBe('cycle');
    expect(registry.get('cycle/research')?.nextActions).toEqual(['research/select-scope']);
    expect(registry.get('cycle/refactoring')?.nextActions).toEqual(['refactor/plan']);
    expect(registry.get('meta/next')?.outputs.map((output) => output.kind)).toContain('status');
    expect(registry.get('meta/resume')?.sideEffects).toEqual(['read-workspace']);
    expect(registry.get('meta/readiness')?.outputs.map((output) => output.kind)).toContain('status');
    expect(registry.list().map((entry) => entry.id)).toEqual([
      'project/init',
      'project/context',
      'meta/list',
      'meta/status',
      'review/select-target',
      'diff/review',
      'response/import',
      'response/normalize',
      'research/select-scope',
      'research/investigate',
      'research/import-findings',
      'research/normalize-findings',
      'research/action-plan',
      'review/comment-triage',
      'review/action-plan',
      'fix/plan',
      'fix/checklist',
      'fix/verify',
      'fix/explain',
      'refactor/plan',
      'refactor/checklist',
      'refactor/verify',
      'refactor/explain',
      'review/reply-drafts',
      'publish/reply-draft',
      'provider/connect',
      'provider/list-targets',
      'provider/fetch-review',
      'publish/summary-draft',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'field/report',
      'cycle/mr-review',
      'cycle/comment-response',
      'cycle/fix-review',
      'cycle/research',
      'cycle/refactoring',
      'cycle/field-report',
      'meta/next',
      'meta/resume',
      'meta/readiness'
    ]);
    expect(registry.list().every((entry) => entry.aiExecution === 'manual-only' && entry.network.ai === false)).toBe(true);
  });

  it('rejects duplicate flow ids and AI network access', () => {
    expect(() => validateFlowManifest([...coreFoundationFlowManifest, coreFoundationFlowManifest[0]])).toThrow(
      FlowManifestValidationError
    );

    expect(() =>
      validateFlowManifest([
        {
          ...coreFoundationFlowManifest[0],
          network: {
            ai: true as false,
            devServices: false
          }
        }
      ])
    ).toThrow(FlowManifestValidationError);
  });
});
