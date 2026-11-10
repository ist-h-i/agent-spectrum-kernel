import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  readReviewOpsMetricsSnapshot,
  recordReviewOpsMetricsEvent,
  updateReviewOpsMetricsSnapshot,
  type ReviewOpsMetricsEventInput,
  type ReviewOpsMetricsSnapshotFile
} from '../index.js';

describe('review work metrics', () => {
  it('records non-sensitive review workflow counters in shared metrics and local events', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-metrics-'));
    const events: ReviewOpsMetricsEventInput[] = [
      {
        kind: 'comment-triage',
        createdAt: '2026-05-05T08:00:00.000Z',
        flowId: 'review/comment-triage',
        runId: 'run_triage',
        counts: {
          triageComments: 4,
          fixPlanItems: 2,
          replyDrafts: 1,
          unresolvedRisks: 1
        }
      },
      {
        kind: 'action-plan',
        createdAt: '2026-05-05T08:05:00.000Z',
        flowId: 'review/action-plan',
        runId: 'run_plan',
        counts: {
          fixPlanItems: 2
        }
      },
      {
        kind: 'reply-draft',
        createdAt: '2026-05-05T08:10:00.000Z',
        flowId: 'review/reply-drafts',
        runId: 'run_replies',
        counts: {
          replyDrafts: 2
        }
      },
      {
        kind: 'rules-apply',
        createdAt: '2026-05-05T08:15:00.000Z',
        flowId: 'rules/apply',
        runId: 'run_rules',
        counts: {
          ruleCandidates: 3
        }
      },
      {
        kind: 'skill-evidence',
        createdAt: '2026-05-05T08:20:00.000Z',
        flowId: 'skill/evidence-capture',
        runId: 'run_skill',
        counts: {
          addedTests: 1,
          skillEvidenceSignals: 4
        }
      }
    ];

    for (const event of events) {
      await recordReviewOpsMetricsEvent({ workspaceRoot, event });
    }

    const snapshot = await readReviewOpsMetricsSnapshot(workspaceRoot);
    const eventLog = await readFile(path.join(workspaceRoot, '.reviewops.local', 'metrics-events.local.jsonl'), 'utf8');

    expect(snapshot.auto).toMatchObject({
      triageComments: 4,
      fixPlanItems: 4,
      replyDrafts: 3,
      ruleCandidates: 3,
      unresolvedRisks: 1,
      addedTests: 1,
      skillEvidenceSignals: 4
    });
    expect(eventLog.trim().split('\n')).toHaveLength(5);
    expect(eventLog).toContain('"kind":"comment-triage"');
    expect(eventLog).toContain('"kind":"skill-evidence"');
  });

  it('preserves manual and unknown snapshot fields while updating auto counters', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-metrics-manual-'));
    const snapshotPath = path.join(workspaceRoot, '.reviewops', 'metrics', 'review-work.yaml');
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(
      snapshotPath,
      [
        'version: 1',
        'updatedAt: null',
        'auto:',
        '  reviewCycles: 1',
        '  triageComments: 0',
        '  fixPlanItems: 0',
        '  replyDrafts: 0',
        '  previewPosts: 0',
        '  ruleCandidates: 0',
        '  knowledgeCandidates: 0',
        '  unresolvedRisks: 0',
        '  addedTests: 0',
        '  skillEvidenceSignals: 0',
        'manual:',
        '  notes:',
        '    - Keep this visible in 1on1.',
        '  exclusions:',
        '    - Ignore generated fixture churn.',
        '  fieldDecisions:',
        '    - Treat this as mentor material only.',
        '  supplements:',
        '    - Project-specific context was removed.',
        '  owner: tech-lead',
        'customSection:',
        '  keep: true',
        ''
      ].join('\n'),
      'utf8'
    );

    await updateReviewOpsMetricsSnapshot({
      workspaceRoot,
      event: {
        kind: 'publish-preview',
        createdAt: '2026-05-05T09:00:00.000Z',
        counts: {
          previewPosts: 2
        }
      }
    });

    const snapshot = parse(await readFile(snapshotPath, 'utf8')) as ReviewOpsMetricsSnapshotFile;

    expect(snapshot.auto.reviewCycles).toBe(1);
    expect(snapshot.auto.previewPosts).toBe(2);
    expect(snapshot.manual.notes).toEqual(['Keep this visible in 1on1.']);
    expect(snapshot.manual.owner).toBe('tech-lead');
    expect(snapshot.customSection).toEqual({ keep: true });
  });

  it('keeps shared metrics free of review body, URL, author, and token details', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-metrics-sensitive-'));
    const event = {
      kind: 'comment-triage',
      createdAt: '2026-05-05T10:00:00.000Z',
      counts: {
        triageComments: 1
      },
      body: 'Please fix the customer-specific secret handling.',
      url: 'https://example.invalid/private-review',
      author: 'reviewer@example.invalid',
      token: 'ghp_sensitive'
    } satisfies ReviewOpsMetricsEventInput & Record<string, unknown>;

    await recordReviewOpsMetricsEvent({ workspaceRoot, event });

    const shared = await readFile(path.join(workspaceRoot, '.reviewops', 'metrics', 'review-work.yaml'), 'utf8');

    expect(shared).toContain('triageComments: 1');
    expect(shared).not.toContain('Please fix');
    expect(shared).not.toContain('https://example.invalid');
    expect(shared).not.toContain('reviewer@example.invalid');
    expect(shared).not.toContain('ghp_sensitive');
  });
});
