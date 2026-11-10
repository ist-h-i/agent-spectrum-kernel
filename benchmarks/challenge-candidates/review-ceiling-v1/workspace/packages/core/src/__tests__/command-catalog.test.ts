import { describe, expect, it } from 'vitest';

import {
  getReviewOpsCommandCatalogEntry,
  listReviewOpsCommandCatalog,
  p0CycleDefinitions,
  reviewOpsCommandCategories
} from '../index.js';

describe('ReviewOps command catalog', () => {
  it('lists all command center categories and direct cycle commands', () => {
    expect(reviewOpsCommandCategories.map((category) => category.title)).toEqual([
      'Start Cycle',
      'Prepare Work',
      'Continue / Import',
      'Publish Preview',
      'Rules / Knowledge',
      'Setup / Status'
    ]);

    expect(listReviewOpsCommandCatalog().map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'cycle/research',
        'cycle/refactoring',
        'research/select-scope',
        'research/action-plan',
        'refactor/plan',
        'refactor/explain',
        'review/select-target',
        'diff/review',
        'rules/apply',
        'project/init',
        'openPreview'
      ])
    );
  });

  it('marks preview and rule application commands as confirmation-gated', () => {
    expect(getReviewOpsCommandCatalogEntry('publish/summary-draft')).toMatchObject({
      vsCodeCommand: 'reviewops.previewGitHubSummaryComment',
      requiresConfirmation: true,
      requiresPreview: true,
      riskLevel: 'high',
      guideStep: 'confirm',
      batchable: false,
      estimatedDuration: 'Preview'
    });
    expect(getReviewOpsCommandCatalogEntry('rules/apply')).toMatchObject({
      vsCodeCommand: 'reviewops.applyRules',
      requiresConfirmation: true,
      persona: 'senior',
      requiresPreview: true,
      riskLevel: 'high'
    });
  });

  it('exposes persona and workflow metadata for guide and console experiences', () => {
    expect(getReviewOpsCommandCatalogEntry('fix/checklist')).toMatchObject({
      persona: 'junior',
      shortcut: 't',
      guideStep: 'implement',
      artifactKind: 'checklist',
      requiresPreview: false,
      riskLevel: 'low',
      batchable: true,
      estimatedDuration: '1-2 min'
    });
    expect(getReviewOpsCommandCatalogEntry('cycle/mr-review')).toMatchObject({
      persona: 'both',
      shortcut: 'r',
      guideStep: 'none',
      artifactKind: 'cycle-state'
    });
    expect(getReviewOpsCommandCatalogEntry('rules/propose')).toMatchObject({
      persona: 'senior',
      shortcut: 'shift+e',
      artifactKind: 'rule-candidate',
      guideStep: 'confirm',
      batchable: true
    });
  });

  it('has a command center entry for every guided cycle step', () => {
    const commandIds = new Set(listReviewOpsCommandCatalog().map((entry) => entry.id));
    const cycleStepIds = [...new Set(p0CycleDefinitions.flatMap((cycle) => cycle.steps))];

    expect(cycleStepIds.filter((stepId) => !commandIds.has(stepId))).toEqual([]);
  });
});
