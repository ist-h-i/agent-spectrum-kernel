import type { PublishDraft, ReviewOpsMetaStatus } from '@reviewops/core';

import {
  formatCycleStatus,
  formatCycleTitle,
  formatNextActionReason,
  formatNextActionTitle
} from './command-center.js';
import { localize } from './localization.js';
import type { PublishDraftArtifactPaths } from './publish-draft-artifacts.js';

export type { PublishDraftArtifactPaths } from './publish-draft-artifacts.js';

export function renderPublishDraftPreviewHtml(draft: PublishDraft, artifacts: PublishDraftArtifactPaths): string {
  const targetUrl =
    draft.target.url === undefined
      ? ''
      : [
          `<dt>${escapeHtml(localize('Target URL'))}</dt>`,
          `<dd><span>${escapeHtml(draft.target.url)}</span></dd>`
        ].join('');
  const confirmation = draft.requiresConfirmation ? localize('Required') : localize('Not required');

  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeHtml(localize('en'))}">`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeHtml(localize('ReviewOps Publish Draft Preview'))}</title>`,
    '<style>',
    'body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; }',
    'main { padding: 24px; max-width: 1180px; }',
    'h1 { font-size: 22px; margin: 0 0 8px; }',
    'h2 { font-size: 15px; margin: 0; }',
    'h3 { font-size: 14px; margin: 0; }',
    'p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.45; }',
    '.layout { display: grid; grid-template-columns: minmax(0, 0.72fr) minmax(300px, 0.28fr); gap: 18px; align-items: start; }',
    '.section-panel { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; overflow: hidden; }',
    '.draft-body { display: grid; gap: 12px; padding: 14px; }',
    '.result-panel { display: grid; gap: 14px; padding: 14px; border-color: var(--vscode-focusBorder); }',
    '.badge { border-radius: 4px; padding: 3px 8px; font-size: 11px; font-weight: 600; white-space: nowrap; width: fit-content; }',
    '.badge.ok { color: var(--vscode-testing-iconPassed); background: color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent); }',
    '.badge.warn { color: var(--vscode-testing-iconQueued); background: color-mix(in srgb, var(--vscode-testing-iconQueued) 14%, transparent); }',
    '.result-section { display: grid; gap: 7px; }',
    'dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }',
    'dt { color: var(--vscode-descriptionForeground); }',
    'dd { margin: 0; min-width: 0; }',
    'dd span { overflow-wrap: anywhere; }',
    'pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--vscode-textCodeBlock-background); padding: 14px; border-radius: 4px; line-height: 1.45; }',
    '.guard { color: var(--vscode-testing-iconPassed); font-weight: 600; }',
    '@media (max-width: 860px) { main { padding: 16px; } .layout { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } }',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<div class="layout">',
    '<section class="section-panel draft-body">',
    '<div>',
    `<h1>${escapeHtml(localize('ReviewOps Publish Draft'))}</h1>`,
    `<p class="guard">${escapeHtml(localize('Preview-only draft. Posting still requires explicit confirmation in VS Code.'))}</p>`,
    '</div>',
    `<h2>${escapeHtml(localize('Body'))}</h2>`,
    `<pre>${escapeHtml(draft.body)}</pre>`,
    '</section>',
    '<aside class="section-panel result-panel" aria-live="polite">',
    `<span class="badge ${draft.requiresConfirmation ? 'warn' : 'ok'}">${escapeHtml(draft.requiresConfirmation ? localize('Preview first') : localize('Ready'))}</span>`,
    `<h2>${escapeHtml(localize('Run Result'))}</h2>`,
    `<p>${escapeHtml(localize('Review this draft here before confirming any provider write.'))}</p>`,
    '<section class="result-section">',
    `<h3>${escapeHtml(localize('Target'))}</h3>`,
    '<dl>',
    `<dt>${escapeHtml(localize('Title'))}</dt><dd><span>${escapeHtml(draft.title)}</span></dd>`,
    `<dt>${escapeHtml(localize('Provider'))}</dt><dd>${escapeHtml(draft.provider)}</dd>`,
    `<dt>${escapeHtml(localize('Repository'))}</dt><dd><span>${escapeHtml(draft.target.repository)}</span></dd>`,
    `<dt>${escapeHtml(localize('Target'))}</dt><dd>${escapeHtml(draft.target.id)}</dd>`,
    targetUrl,
    `<dt>${escapeHtml(localize('Mode'))}</dt><dd>${escapeHtml(formatPublishDraftMode(draft.mode))}</dd>`,
    `<dt>${escapeHtml(localize('Status'))}</dt><dd>${escapeHtml(formatPublishDraftStatus(draft.status))}</dd>`,
    `<dt>${escapeHtml(localize('Confirmation'))}</dt><dd>${escapeHtml(confirmation)}</dd>`,
    '</dl>',
    '</section>',
    '<section class="result-section">',
    `<h3>${escapeHtml(localize('File to review'))}</h3>`,
    '<dl>',
    `<dt>${escapeHtml(localize('Main file'))}</dt><dd><span>${escapeHtml(artifacts.markdownPath)}</span></dd>`,
    '</dl>',
    '</section>',
    '</aside>',
    '</div>',
    '</main>',
    '</body>',
    '</html>'
  ].join('');
}

export function renderStatusPreview(status: ReviewOpsMetaStatus): string {
  const nextAction = status.nextActions[0];
  const nextActionBlock =
    nextAction === undefined
      ? `<p>${escapeHtml(localize('No next action.'))}</p>`
      : [
          `<h2>${escapeHtml(formatNextActionTitle(nextAction))}</h2>`,
          `<p>${escapeHtml(formatNextActionReason(nextAction.reason))}</p>`
        ].join('');
  const initialized = status.initialized ? localize('Initialized') : localize('Not initialized');
  const currentCycle =
    status.currentCycle === null
      ? localize('None')
      : `${formatCycleTitle(status.currentCycle.title)} (${formatCycleStatus(status.currentCycle.status)})`;

  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeHtml(localize('en'))}">`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeHtml(localize('ReviewOps Preview'))}</title>`,
    '<style>',
    'body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; }',
    'main { display: grid; gap: 16px; padding: 24px; max-width: 760px; }',
    'h1 { font-size: 24px; margin: 0 0 8px; }',
    'h2 { font-size: 16px; margin: 0 0 6px; }',
    'p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.45; }',
    '.panel { display: grid; gap: 10px; padding: 14px; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }',
    'dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }',
    'dt { color: var(--vscode-descriptionForeground); }',
    'dd { margin: 0; }',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<header>',
    '<h1>ReviewOps</h1>',
    `<p>${escapeHtml(localize('Next action first. Details stay hidden until needed.'))}</p>`,
    '</header>',
    '<section class="panel">',
    `<h2>${escapeHtml(localize('Next Safe Step'))}</h2>`,
    nextActionBlock,
    '</section>',
    '<section class="panel">',
    '<dl>',
    `<dt>${escapeHtml(localize('Status'))}</dt><dd>${escapeHtml(initialized)}</dd>`,
    `<dt>${escapeHtml(localize('Current cycle'))}</dt><dd>${escapeHtml(currentCycle)}</dd>`,
    '</dl>',
    '</section>',
    '</main>',
    '</body>',
    '</html>'
  ].join('');
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPublishDraftMode(mode: PublishDraft['mode']): string {
  switch (mode) {
    case 'summary-comment':
      return localize('Summary comment');
    case 'reply':
      return localize('Reply comment');
    case 'issue-create':
      return localize('Issue create');
    case 'issue-comment':
      return localize('Issue comment');
  }
}

function formatPublishDraftStatus(status: PublishDraft['status']): string {
  switch (status) {
    case 'draft':
      return localize('Draft');
    case 'posted':
      return localize('Posted');
    case 'failed':
      return localize('Failed');
  }
}
