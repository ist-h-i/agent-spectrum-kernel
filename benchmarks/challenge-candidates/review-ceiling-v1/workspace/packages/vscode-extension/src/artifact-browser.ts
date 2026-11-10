import * as vscode from 'vscode';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { localize } from './localization.js';

export type ReviewOpsArtifactViewId = 'review-work' | 'knowledge' | 'skill-evidence' | 'reports';

export interface ReviewOpsArtifactViewItem {
  label: string;
  description: string;
  tooltip: string;
  path: string;
  iconId: string;
}

export interface ReviewOpsArtifactQuickPickItem extends vscode.QuickPickItem {
  artifactPath: string;
  viewId: ReviewOpsArtifactViewId;
  showAll?: boolean;
}

type ReviewOpsArtifactSurface = 'primary' | 'supporting';
export type ReviewOpsArtifactSurfaceFilter = 'primary' | 'all';

interface ReviewOpsArtifactSpec {
  flowSlug: string;
  artifactName: string;
  label: string;
  iconId: string;
  surface: ReviewOpsArtifactSurface;
}

interface ReviewOpsStaticArtifactSpec {
  relativePath: string;
  label: string;
  iconId: string;
  surface: ReviewOpsArtifactSurface;
}

interface ReviewOpsArtifactViewSpec {
  emptyLabel: string;
  artifacts: ReviewOpsArtifactSpec[];
  staticArtifacts?: ReviewOpsStaticArtifactSpec[];
}

const reviewOpsArtifactViewIds: ReviewOpsArtifactViewId[] = ['review-work', 'knowledge', 'skill-evidence', 'reports'];
const artifactViewLabels = {
  'review-work': 'Review Work',
  knowledge: 'Knowledge',
  'skill-evidence': 'Skill Evidence',
  reports: 'Reports'
} satisfies Record<ReviewOpsArtifactViewId, string>;

const artifactViewSpecs: Record<ReviewOpsArtifactViewId, ReviewOpsArtifactViewSpec> = {
  'review-work': {
    emptyLabel: 'No main review files yet',
    artifacts: [
      artifactSpec('diff-review', 'prompt.md', 'Review prompt', 'symbol-method', 'primary'),
      artifactSpec('diff-review', 'input-summary.md', 'Input summary', 'list-selection', 'supporting'),
      artifactSpec('diff-review', 'prompt-metadata.json', 'Prompt metadata', 'json', 'supporting'),
      artifactSpec('research-investigate', 'prompt.md', 'Research prompt', 'symbol-method', 'primary'),
      artifactSpec('research-investigate', 'input-summary.md', 'Research input summary', 'list-selection', 'supporting'),
      artifactSpec('research-investigate', 'prompt-metadata.json', 'Research prompt metadata', 'json', 'supporting'),
      artifactSpec('response-import', 'result.md', 'Imported result', 'symbol-string', 'primary'),
      artifactSpec('response-import', 'result.json', 'Imported result data', 'json', 'supporting'),
      artifactSpec('response-import', 'review-findings.json', 'Imported findings', 'json', 'supporting'),
      artifactSpec('response-import', 'action-plan.seed.json', 'Imported action plan seed', 'json', 'supporting'),
      artifactSpec('research-import-findings', 'result.md', 'Research findings result', 'symbol-string', 'primary'),
      artifactSpec('research-import-findings', 'result.json', 'Research findings data', 'json', 'supporting'),
      artifactSpec('research-import-findings', 'review-findings.json', 'Research findings', 'json', 'supporting'),
      artifactSpec('research-import-findings', 'action-plan.seed.json', 'Research action plan seed', 'json', 'supporting'),
      artifactSpec('review-action-plan', 'comment-triage.json', 'Comment triage', 'comment-discussion', 'supporting'),
      artifactSpec('review-action-plan', 'understanding-memo.md', 'Understanding memo', 'notebook', 'primary'),
      artifactSpec('review-action-plan', 'understanding-memo.json', 'Understanding memo data', 'json', 'supporting'),
      artifactSpec('review-action-plan', 'action-plan.json', 'Triage action plan', 'json', 'supporting'),
      artifactSpec('review-action-plan', 'reply-drafts.json', 'Triage reply drafts', 'json', 'supporting'),
      artifactSpec('review-action-plan', 'publish.draft.md', 'Triage reply publish draft', 'preview', 'primary'),
      artifactSpec('review-action-plan', 'action-plan.md', 'Action plan', 'checklist', 'primary'),
      artifactSpec('review-action-plan', 'next-actions.json', 'Action plan next actions', 'debug-continue', 'supporting'),
      artifactSpec('research-action-plan', 'understanding-memo.md', 'Research understanding memo', 'notebook', 'primary'),
      artifactSpec('research-action-plan', 'understanding-memo.json', 'Research understanding memo data', 'json', 'supporting'),
      artifactSpec('research-action-plan', 'action-plan.md', 'Research action plan', 'checklist', 'primary'),
      artifactSpec('research-action-plan', 'action-plan.json', 'Research action plan data', 'json', 'supporting'),
      artifactSpec('research-action-plan', 'next-actions.json', 'Research action plan next actions', 'debug-continue', 'supporting'),
      artifactSpec('review-reply-drafts', 'reply-drafts.md', 'Reply drafts', 'reply', 'supporting'),
      artifactSpec('fix-plan', 'fix-plan.md', 'Fix plan', 'tools', 'primary'),
      artifactSpec('fix-plan', 'fix-plan.json', 'Fix plan data', 'json', 'supporting'),
      artifactSpec('fix-plan', 'next-actions.json', 'Fix plan next actions', 'debug-continue', 'supporting'),
      artifactSpec('fix-checklist', 'fix-checklist.md', 'Fix checklist', 'checklist', 'primary'),
      artifactSpec('fix-checklist', 'test-scenarios.md', 'Test scenarios', 'beaker', 'primary'),
      artifactSpec('fix-checklist', 'fix-checklist.json', 'Fix checklist data', 'json', 'supporting'),
      artifactSpec('fix-checklist', 'test-scenarios.json', 'Test scenarios data', 'json', 'supporting'),
      artifactSpec('fix-checklist', 'next-actions.json', 'Fix checklist next actions', 'debug-continue', 'supporting'),
      artifactSpec('fix-verify', 'fix-verify.md', 'Fix verification', 'verified', 'primary'),
      artifactSpec('fix-verify', 'fix-verify.json', 'Fix verification data', 'json', 'supporting'),
      artifactSpec('fix-verify', 'next-actions.json', 'Fix verification next actions', 'debug-continue', 'supporting'),
      artifactSpec('fix-explain', 'fix-explain.md', 'Fix explanation', 'comment-unresolved', 'primary'),
      artifactSpec('fix-explain', 'fix-explain.json', 'Fix explanation data', 'json', 'supporting'),
      artifactSpec('fix-explain', 'next-actions.json', 'Fix explanation next actions', 'debug-continue', 'supporting'),
      artifactSpec('refactor-plan', 'refactor-plan.md', 'Refactor plan', 'tools', 'primary'),
      artifactSpec('refactor-plan', 'refactor-plan.json', 'Refactor plan data', 'json', 'supporting'),
      artifactSpec('refactor-plan', 'next-actions.json', 'Refactor plan next actions', 'debug-continue', 'supporting'),
      artifactSpec('refactor-checklist', 'refactor-checklist.md', 'Refactor checklist', 'checklist', 'primary'),
      artifactSpec('refactor-checklist', 'test-scenarios.md', 'Refactor test scenarios', 'beaker', 'primary'),
      artifactSpec('refactor-checklist', 'refactor-checklist.json', 'Refactor checklist data', 'json', 'supporting'),
      artifactSpec('refactor-checklist', 'test-scenarios.json', 'Refactor test scenarios data', 'json', 'supporting'),
      artifactSpec('refactor-checklist', 'next-actions.json', 'Refactor checklist next actions', 'debug-continue', 'supporting'),
      artifactSpec('refactor-verify', 'refactor-verify.md', 'Refactor verification', 'verified', 'primary'),
      artifactSpec('refactor-verify', 'refactor-verify.json', 'Refactor verification data', 'json', 'supporting'),
      artifactSpec('refactor-verify', 'next-actions.json', 'Refactor verification next actions', 'debug-continue', 'supporting'),
      artifactSpec('refactor-explain', 'refactor-explain.md', 'Refactor explanation', 'comment-unresolved', 'primary'),
      artifactSpec('refactor-explain', 'refactor-explain.json', 'Refactor explanation data', 'json', 'supporting'),
      artifactSpec('refactor-explain', 'next-actions.json', 'Refactor explanation next actions', 'debug-continue', 'supporting'),
      artifactSpec('publish-summary-draft', 'publish.draft.md', 'Summary publish draft', 'preview', 'primary'),
      artifactSpec('publish-reply-draft', 'publish.draft.md', 'Reply publish draft', 'preview', 'primary'),
      artifactSpec('meta-next', 'next-actions.json', 'Next actions', 'debug-continue', 'supporting')
    ]
  },
  knowledge: {
    emptyLabel: 'No main knowledge files yet',
    artifacts: [
      artifactSpec('knowledge-capture-candidates', 'rule-candidates.json', 'Rule candidates', 'law', 'supporting'),
      artifactSpec('knowledge-capture-candidates', 'knowledge-candidates.json', 'Knowledge candidates', 'book', 'supporting'),
      artifactSpec('knowledge-capture-candidates', 'rules-reconciliation.json', 'Rules reconciliation', 'diff', 'supporting'),
      artifactSpec('knowledge-capture-candidates', 'portable-checklist.md', 'Portable checklist', 'shield', 'supporting'),
      artifactSpec('rules-apply', 'rule-application.json', 'Rule application', 'law', 'supporting'),
      artifactSpec('rules-update', 'rule-update.md', 'Rule update', 'edit', 'supporting')
    ]
  },
  'skill-evidence': {
    emptyLabel: 'No main skill files yet',
    artifacts: [artifactSpec('skill-evidence-capture', 'skill-evidence.json', 'Skill evidence', 'verified', 'supporting')]
  },
  reports: {
    emptyLabel: 'No main report files yet',
    staticArtifacts: [
      staticArtifactSpec('.reviewops/metrics/review-work.yaml', 'Review work metrics', 'graph', 'supporting'),
      staticArtifactSpec('.reviewops/knowledge/project-debt.yaml', 'Project debt register', 'warning', 'supporting')
    ],
    artifacts: [
      artifactSpec('meta-readiness', 'p0-readiness.md', 'P0 readiness', 'pass-filled', 'supporting'),
      artifactSpec('meta-readiness', 'p0-readiness.json', 'P0 readiness data', 'json', 'supporting'),
      artifactSpec('field-report', 'field-report.md', 'Field report', 'graph', 'primary'),
      artifactSpec('field-report', 'field-report.json', 'Field report data', 'json', 'supporting')
    ]
  }
};

export function getReviewOpsArtifactEmptyLabel(viewId: ReviewOpsArtifactViewId): string {
  return artifactViewSpecs[viewId].emptyLabel;
}

export async function listReviewOpsArtifactViewItems(
  workspaceRoot: string,
  viewId: ReviewOpsArtifactViewId,
  options: number | { limit?: number; surface?: ReviewOpsArtifactSurfaceFilter } = {}
): Promise<ReviewOpsArtifactViewItem[]> {
  const spec = artifactViewSpecs[viewId];
  const surface = typeof options === 'number' ? 'primary' : options.surface ?? 'primary';
  const limit = typeof options === 'number' ? options : options.limit ?? (surface === 'primary' ? 8 : 20);
  const resolvedRoot = path.resolve(workspaceRoot);
  const candidates: Array<ReviewOpsArtifactViewItem & { artifactKey: string; mtimeMs: number }> = [];

  for (const artifact of spec.staticArtifacts ?? []) {
    if (!shouldIncludeArtifactSurface(artifact.surface, surface)) {
      continue;
    }

    const artifactPath = path.join(resolvedRoot, artifact.relativePath);
    try {
      const artifactStat = await stat(artifactPath);
      if (!artifactStat.isFile()) {
        continue;
      }

      candidates.push({
        label: localize(artifact.label),
        description: localize('workspace file'),
        tooltip: artifact.relativePath,
        path: artifact.relativePath,
        iconId: artifact.iconId,
        artifactKey: `static:${artifact.relativePath}`,
        mtimeMs: artifactStat.mtimeMs
      });
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  for (const artifact of spec.artifacts) {
    if (!shouldIncludeArtifactSurface(artifact.surface, surface)) {
      continue;
    }

    const flowDirectory = path.join(resolvedRoot, '.reviewops', 'out', artifact.flowSlug);
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await readdir(flowDirectory, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const artifactPath = path.join(flowDirectory, entry.name, artifact.artifactName);
      try {
        const artifactStat = await stat(artifactPath);
        if (!artifactStat.isFile()) {
          continue;
        }

        const relativePath = path.relative(resolvedRoot, artifactPath);
        candidates.push({
          label: localize(artifact.label),
          description: surface === 'primary' ? localize('Main file') : formatRunIdForTreeDescription(entry.name),
          tooltip: surface === 'primary' ? localize('Open this first') : relativePath,
          path: relativePath,
          iconId: artifact.iconId,
          artifactKey: `${artifact.flowSlug}/${artifact.artifactName}`,
          mtimeMs: artifactStat.mtimeMs
        });
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  const sortedCandidates = candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || left.label.localeCompare(right.label));
  const visibleCandidates = surface === 'primary' ? latestArtifactCandidatesByKey(sortedCandidates) : sortedCandidates;

  return visibleCandidates
    .slice(0, limit)
    .map((item) => ({
      label: item.label,
      description: item.description,
      tooltip: item.tooltip,
      path: item.path,
      iconId: item.iconId
    }));
}

export async function listReviewOpsArtifactQuickPickItems(
  workspaceRoot: string,
  options: { surface?: ReviewOpsArtifactSurfaceFilter } = {}
): Promise<ReviewOpsArtifactQuickPickItem[]> {
  const items: ReviewOpsArtifactQuickPickItem[] = [];
  const surface = options.surface ?? 'primary';

  for (const viewId of reviewOpsArtifactViewIds) {
    const artifacts = await listReviewOpsArtifactViewItems(workspaceRoot, viewId, {
      limit: surface === 'primary' ? 1 : 20,
      surface
    });
    items.push(
      ...artifacts.map((artifact) => ({
        label: artifact.label,
        description: localize(artifactViewLabels[viewId]),
        detail: surface === 'primary' ? localize('Open this first') : artifact.path,
        artifactPath: artifact.path,
        viewId
      }))
    );
  }

  return items;
}

export function formatRunIdForTreeDescription(runId: string): string {
  const match = /^run_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})z$/u.exec(runId);
  if (match === null) {
    return runId;
  }

  const [, year, month, day, hour, minute, second, millisecond] = match;
  const utcTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond)
  );
  const jstTime = new Date(utcTime + 9 * 60 * 60 * 1000);
  const jstYear = jstTime.getUTCFullYear();
  const jstMonth = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
  const jstDay = String(jstTime.getUTCDate()).padStart(2, '0');
  const jstHour = String(jstTime.getUTCHours()).padStart(2, '0');
  const jstMinute = String(jstTime.getUTCMinutes()).padStart(2, '0');

  return `${jstYear}-${jstMonth}-${jstDay} ${jstHour}:${jstMinute} JST`;
}

export function labelForReviewOpsArtifactPath(relativePath: string): string {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  for (const spec of Object.values(artifactViewSpecs)) {
    for (const artifact of spec.staticArtifacts ?? []) {
      if (normalizedPath === artifact.relativePath) {
        return localize(artifact.label);
      }
    }

    for (const artifact of spec.artifacts) {
      if (
        normalizedPath.startsWith(`.reviewops/out/${artifact.flowSlug}/`) &&
        normalizedPath.endsWith(`/${artifact.artifactName}`)
      ) {
        return localize(artifact.label);
      }
    }
  }

  const baseName = path.basename(normalizedPath);
  return baseName.length === 0 ? localize('Result') : baseName;
}

function latestArtifactCandidatesByKey<T extends { artifactKey: string }>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const latest: T[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.artifactKey)) {
      continue;
    }
    seen.add(candidate.artifactKey);
    latest.push(candidate);
  }
  return latest;
}

function shouldIncludeArtifactSurface(
  artifactSurface: ReviewOpsArtifactSurface,
  requestedSurface: ReviewOpsArtifactSurfaceFilter
): boolean {
  return requestedSurface === 'all' || artifactSurface === 'primary';
}

function artifactSpec(
  flowSlug: string,
  artifactName: string,
  label: string,
  iconId: string,
  surface: ReviewOpsArtifactSurface
): ReviewOpsArtifactSpec {
  return {
    flowSlug,
    artifactName,
    label,
    iconId,
    surface
  };
}

function staticArtifactSpec(
  relativePath: string,
  label: string,
  iconId: string,
  surface: ReviewOpsArtifactSurface
): ReviewOpsStaticArtifactSpec {
  return {
    relativePath,
    label,
    iconId,
    surface
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
