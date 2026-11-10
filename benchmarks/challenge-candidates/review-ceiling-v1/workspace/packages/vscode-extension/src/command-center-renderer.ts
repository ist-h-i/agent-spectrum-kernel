import type { ReviewOpsCommandCatalogEntry, ReviewOpsMetaStatus } from '@reviewops/core';

import { labelForReviewOpsArtifactPath } from './artifact-browser.js';
import {
  formatCommandCenterVisibleOutput,
  formatCycleStatus,
  formatCycleStepStatus,
  formatCycleStepTitle,
  formatCycleTargetMode,
  formatCycleTitle,
  formatRunResultStatus,
  isConfigurableCommand,
  isContextRequiredCycle,
  isLocalDiffPromptCommand,
  isOptionalImportFlow,
  isOptionalRulesFlow,
  isOptionalSkippableCommand,
  optionalDetailLabel,
  optionalSkipLabel,
  selectRecommendedCommand,
  statusBadgeClass,
  statusBadgeClassForCycleStep,
  type ReviewOpsExperienceMode,
  type ReviewOpsWebviewRunResult
} from './command-center.js';
import { localize } from './localization.js';
import { escapeHtml } from './webview-renderers.js';

export type ReviewOpsCommandMetadataKeys =
  | 'persona'
  | 'shortcut'
  | 'guideStep'
  | 'artifactKind'
  | 'requiresPreview'
  | 'riskLevel'
  | 'batchable'
  | 'estimatedDuration';

export type CommandCenterRenderableCommand = Omit<ReviewOpsCommandCatalogEntry, ReviewOpsCommandMetadataKeys> &
  Partial<Pick<ReviewOpsCommandCatalogEntry, ReviewOpsCommandMetadataKeys>>;

export interface RenderCommandCenterHtmlOptions {
  status: ReviewOpsMetaStatus;
  commands: CommandCenterRenderableCommand[];
  nonce: string;
  cspSource: string;
  runResult?: ReviewOpsWebviewRunResult;
  experienceMode?: ReviewOpsExperienceMode;
}

function normalizeCommandForRender(command: CommandCenterRenderableCommand): ReviewOpsCommandCatalogEntry {
  return {
    ...command,
    persona: command.persona ?? 'both',
    shortcut: command.shortcut ?? '',
    guideStep: command.guideStep ?? 'none',
    artifactKind: command.artifactKind ?? 'status',
    requiresPreview: command.requiresPreview ?? command.requiresConfirmation,
    riskLevel: command.riskLevel ?? (command.requiresConfirmation ? 'high' : 'low'),
    batchable: command.batchable ?? false,
    estimatedDuration: command.estimatedDuration ?? '<1 min'
  };
}

export function renderCommandCenterHtml(options: RenderCommandCenterHtmlOptions): string {
  const { status, nonce, cspSource } = options;
  const commands = options.commands.map(normalizeCommandForRender);
  const experienceMode = options.experienceMode ?? 'guide';
  const runResult = options.runResult ?? createIdleCommandCenterRunResult(status);
  const initializedBadge = status.initialized
    ? `<span class="badge ok">${escapeHtml(localize('Initialized'))}</span>`
    : `<span class="badge warn">${escapeHtml(localize('Not initialized'))}</span>`;
  const currentCycle =
    status.currentCycle === null
      ? escapeHtml(localize('None'))
      : `${escapeHtml(formatCycleTitle(status.currentCycle.title))} <span class="muted">${escapeHtml(formatCycleStatus(status.currentCycle.status))}</span>`;
  const currentTarget = escapeHtml(status.currentCycle?.startContext?.scopeLabel ?? localize('Workspace'));
  const recommendedCommand = selectRecommendedCommand(status, commands);
  const resultPanel = renderCommandCenterRunResult(runResult, status);
  const experienceTitle = experienceMode === 'guide' ? localize('ReviewOps Guide') : localize('ReviewOps Console');
  const experienceShell =
    experienceMode === 'guide'
      ? renderCommandCenterGuide(status, commands, recommendedCommand, resultPanel)
      : renderCommandCenterConsole(status, commands, recommendedCommand, runResult, resultPanel);

  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeHtml(localize('en'))}">`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(nonce)}';">`,
    `<title>${escapeHtml(localize('ReviewOps Command Center'))}</title>`,
    '<style>',
    'html, body { height: 100%; }',
    'body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; overflow: hidden; line-break: strict; }',
    'main { box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 18px; width: 100%; height: 100vh; padding: 24px; max-width: 1560px; }',
    '.hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: start; }',
    '.hero-copy { display: grid; gap: 6px; }',
    'h1 { font-size: 24px; margin: 0 0 8px; }',
    'h2 { font-size: 15px; margin: 0; }',
    'h3 { font-size: 14px; line-height: 1.35; margin: 0; overflow-wrap: break-word; }',
    'p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.42; overflow-wrap: break-word; }',
    '.summary { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }',
    '.badge { display: inline-flex; align-items: center; width: fit-content; min-height: 19px; box-sizing: border-box; border-radius: 4px; padding: 3px 8px; font-size: 11px; font-weight: 600; white-space: nowrap; }',
    '.badge.ok { color: var(--vscode-testing-iconPassed); background: color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent); }',
    '.badge.warn { color: var(--vscode-testing-iconQueued); background: color-mix(in srgb, var(--vscode-testing-iconQueued) 14%, transparent); }',
    '.badge.error { color: var(--vscode-testing-iconFailed); background: color-mix(in srgb, var(--vscode-testing-iconFailed) 12%, transparent); }',
    '.badge.info { color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); }',
    '.badge.kind { color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); }',
    '.badge.risk-low { color: var(--vscode-testing-iconPassed); background: color-mix(in srgb, var(--vscode-testing-iconPassed) 10%, transparent); }',
    '.badge.risk-medium { color: var(--vscode-testing-iconQueued); background: color-mix(in srgb, var(--vscode-testing-iconQueued) 12%, transparent); }',
    '.badge.risk-high { color: var(--vscode-testing-iconFailed); background: color-mix(in srgb, var(--vscode-testing-iconFailed) 10%, transparent); }',
    '.mode-switch { display: inline-flex; gap: 4px; padding: 3px; border-radius: 6px; background: var(--vscode-editorWidget-background); }',
    '.mode-switch button { padding: 5px 10px; color: var(--vscode-descriptionForeground); background: transparent; }',
    '.mode-switch button.active { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }',
    '.layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 0.42fr); gap: 18px; align-items: stretch; min-height: 0; }',
    '.command-main { display: grid; gap: 18px; min-width: 0; min-height: 0; overflow: auto; padding-right: 4px; }',
    '.priority-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr); gap: 14px; align-items: start; }',
    '.guide-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 0.34fr); gap: 18px; min-height: 0; }',
    '.guide-main { display: grid; gap: 16px; min-height: 0; overflow: auto; padding-right: 4px; }',
    '.guide-side { display: grid; gap: 14px; align-content: start; min-height: 0; overflow: auto; }',
    '.key-chip, .quick-command kbd { display: inline-flex; align-items: center; min-height: 19px; box-sizing: border-box; border: 1px solid var(--vscode-keybindingLabel-border, var(--vscode-panel-border)); border-bottom-color: var(--vscode-keybindingLabel-bottomBorder, var(--vscode-panel-border)); border-radius: 4px; padding: 1px 6px; color: var(--vscode-keybindingLabel-foreground, var(--vscode-foreground)); background: var(--vscode-keybindingLabel-background, var(--vscode-editorWidget-background)); font-family: var(--vscode-editor-font-family); font-size: 11px; line-height: 1; white-space: nowrap; }',
    '.guide-stepper { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 8px; }',
    '.guide-step { display: grid; gap: 4px; min-width: 0; padding: 10px; border-radius: 6px; background: var(--vscode-editorWidget-background); }',
    '.guide-step.active { outline: 2px solid var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-focusBorder) 12%, var(--vscode-editorWidget-background)); }',
    '.guide-step.complete { background: color-mix(in srgb, var(--vscode-testing-iconPassed) 10%, var(--vscode-editorWidget-background)); }',
    '.guide-step span:last-child { font-size: 12px; font-weight: 600; overflow-wrap: break-word; }',
    '.guide-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(156px, 1fr)); gap: 10px; }',
    '.guide-tile { display: grid; align-content: center; min-width: 0; min-height: 42px; padding: 12px; border-radius: 6px; background: var(--vscode-editorWidget-background); }',
    '.guide-tile strong { font-size: 13px; }',
    '.guide-insight-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }',
    '.guide-insight-list li { min-width: 0; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; overflow-wrap: break-word; }',
    '.guide-insight-list strong { color: var(--vscode-foreground); }',
    '.value-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(116px, 1fr)); gap: 8px; }',
    '.value-chip { display: grid; gap: 3px; min-width: 0; padding: 9px; border-radius: 6px; background: var(--vscode-editorWidget-background); }',
    '.value-chip strong { font-size: 12px; overflow-wrap: break-word; }',
    '.value-chip span { color: var(--vscode-descriptionForeground); font-size: 11px; overflow-wrap: break-word; }',
    '.console-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 0.36fr); grid-template-rows: auto minmax(0, 1fr); gap: 14px; min-height: 0; }',
    '.console-bar { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px; }',
    '.console-bar input { min-height: 34px; font-family: var(--vscode-editor-font-family); }',
    '.quick-commands { display: flex; gap: 6px; flex-wrap: wrap; }',
    '.quick-command { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; }',
    '.quick-command span { white-space: nowrap; }',
    '.console-main { display: grid; gap: 14px; min-height: 0; overflow: auto; padding-right: 4px; }',
    '.console-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 0; overflow: auto; padding-right: 4px; padding-bottom: 16px; scrollbar-gutter: stable; }',
    '.command-table { display: grid; overflow-x: auto; }',
    '.command-table-header, .command-table-row { display: grid; grid-template-columns: minmax(180px, 1.2fr) minmax(132px, 0.65fr) minmax(116px, 0.55fr) minmax(160px, 0.75fr) minmax(76px, auto); gap: 10px; align-items: center; min-width: 760px; padding: 9px 12px; }',
    '.command-table-header { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: 0; background: var(--vscode-editorWidget-background); }',
    '.command-table-row + .command-table-row { border-top: 1px solid var(--vscode-panel-border); }',
    '.command-table-row.disabled { opacity: 0.58; }',
    '.command-cell { min-width: 0; overflow-wrap: break-word; }',
    '.run-log { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }',
    '.run-log li { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 8px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }',
    '.rule-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }',
    '.rule-list li { display: grid; gap: 5px; padding: 10px; border-radius: 6px; background: var(--vscode-editorWidget-background); }',
    '.rule-list label { display: flex; gap: 8px; align-items: center; color: var(--vscode-foreground); }',
    '.rule-list input { width: auto; }',
    '.batch-queue { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }',
    '.batch-queue li { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 8px; align-items: start; padding: 9px 0; border-top: 1px solid var(--vscode-panel-border); }',
    '.batch-queue li:first-child { border-top: 0; }',
    '.batch-index { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 999px; color: var(--vscode-testing-iconPassed); background: color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent); font-size: 11px; font-weight: 700; }',
    '.artifact-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(116px, 1fr)); gap: 8px; }',
    '.section { display: grid; gap: 10px; }',
    '.section-heading { display: grid; gap: 4px; }',
    '.section-panel { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; overflow: hidden; }',
    '.section-panel.command-table { overflow-x: auto; }',
    '.console-side > .section-panel { flex: 0 0 auto; }',
    '.workflow-panel { padding: 14px; display: grid; gap: 12px; }',
    '.workflow-map { display: grid; grid-template-columns: repeat(auto-fit, minmax(156px, 1fr)); gap: 10px; }',
    '.workflow-step { position: relative; display: grid; gap: 5px; min-width: 0; padding: 10px; border-radius: 6px; background: var(--vscode-editorWidget-background); }',
    '.workflow-step::after { content: ""; position: absolute; right: -10px; top: 50%; width: 10px; border-top: 1px solid var(--vscode-panel-border); }',
    '.workflow-step:last-child::after { display: none; }',
    '.workflow-step.completed { background: color-mix(in srgb, var(--vscode-testing-iconPassed) 11%, var(--vscode-editorWidget-background)); }',
    '.workflow-step.ready { outline: 2px solid var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-focusBorder) 12%, var(--vscode-editorWidget-background)); }',
    '.workflow-step.blocked { outline: 2px solid var(--vscode-testing-iconFailed); background: color-mix(in srgb, var(--vscode-testing-iconFailed) 10%, var(--vscode-editorWidget-background)); }',
    '.workflow-step.pending { opacity: 0.72; }',
    '.workflow-step-title { font-weight: 600; font-size: 12px; overflow-wrap: break-word; }',
    '.context-form { display: none; gap: 9px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border); }',
    '.context-form.open { display: grid; }',
    '.command-options-form { display: none; gap: 9px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border); }',
    '.command-options-form.open { display: grid; }',
    '.command-row .context-form { grid-column: 1 / -1; }',
    '.command-row .command-options-form { grid-column: 1 / -1; }',
    '.field { display: grid; gap: 4px; }',
    'label { color: var(--vscode-descriptionForeground); font-size: 12px; }',
    'input, textarea, select { box-sizing: border-box; width: 100%; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 4px; padding: 6px 8px; font: inherit; }',
    'textarea { min-height: 68px; resize: vertical; }',
    'input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }',
    '.form-error { display: none; color: var(--vscode-testing-iconFailed); font-size: 12px; }',
    '.form-error.visible { display: block; }',
    '.result-panel { display: grid; gap: 14px; align-content: start; min-height: 0; overflow: auto; padding: 14px; }',
    '.result-panel.running { border-color: var(--vscode-progressBar-background); }',
    '.result-panel.success { border-color: var(--vscode-testing-iconPassed); }',
    '.result-panel.warning { border-color: var(--vscode-testing-iconQueued); }',
    '.result-panel.error { border-color: var(--vscode-testing-iconFailed); }',
    '.result-header { display: grid; gap: 8px; }',
    '.result-status { width: fit-content; }',
    '.result-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }',
    '.result-list li { min-width: 0; overflow-wrap: break-word; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }',
    '.result-preview { display: grid; gap: 7px; min-width: 0; }',
    '.result-preview pre { margin: 0; max-height: 420px; overflow: auto; white-space: pre-wrap; overflow-wrap: break-word; color: var(--vscode-editor-foreground); background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); line-height: 1.45; }',
    '.result-file-action { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; }',
    '.result-empty { color: var(--vscode-descriptionForeground); font-size: 12px; }',
    '.recommended-panel { padding: 14px; display: grid; gap: 10px; border-color: var(--vscode-focusBorder); }',
    '.recommended-panel.disabled { opacity: 0.58; }',
    '.recommended-body { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: end; }',
    '.recommended-copy { display: grid; gap: 7px; min-width: 0; }',
    '.title-line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }',
    '.meta-line { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; overflow-wrap: break-word; }',
    '.command-stack { display: grid; }',
    '.command-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 11px 12px; min-width: 0; }',
    '.command-row + .command-row { border-top: 1px solid var(--vscode-panel-border); }',
    '.command-row.disabled { opacity: 0.58; }',
    '.command-copy { display: grid; gap: 5px; min-width: 0; }',
    '.quick-stack .command-row { padding: 10px 12px; }',
    '.details-stack { display: grid; gap: 12px; }',
    '.details-panel { background: transparent; border: 0; }',
    '.details-panel > summary { cursor: pointer; color: var(--vscode-foreground); font-weight: 600; outline: none; }',
    '.details-panel > summary:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 3px; border-radius: 4px; }',
    '.details-panel[open] > summary { margin-bottom: 12px; }',
    '.controls { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }',
    'button { cursor: pointer; min-height: 28px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; padding: 6px 12px; font: inherit; font-weight: 600; white-space: nowrap; transition: background-color 160ms ease, opacity 160ms ease; }',
    'button.secondary { color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); }',
    'button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }',
    'button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }',
    'button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }',
    'button:active:not(:disabled) { opacity: 0.86; }',
    'button:disabled { cursor: not-allowed; opacity: 0.64; }',
    '.muted { color: var(--vscode-descriptionForeground); }',
    '@media (prefers-reduced-motion: reduce) { button { transition: none; } }',
    '@media (max-width: 1040px) { body { overflow: auto; } main { display: block; height: auto; min-height: 100vh; } .layout, .guide-layout, .console-layout { grid-template-columns: 1fr; } .console-bar { grid-template-columns: 1fr; } .command-main, .guide-main, .guide-side, .console-main, .console-side, .result-panel { overflow: visible; } }',
    '@media (max-width: 980px) { .section-panel.command-table { overflow-x: visible; } .command-table-header { display: none; } .command-table-row { grid-template-columns: 1fr; min-width: 0; align-items: start; } }',
    '@media (max-width: 760px) { main { padding: 16px; } .hero, .priority-grid, .recommended-body, .command-row, .guide-grid, .value-grid, .artifact-strip { grid-template-columns: 1fr; } .summary { justify-content: flex-start; } .controls { justify-content: flex-start; } .guide-stepper { grid-template-columns: 1fr; } button { white-space: normal; } }',
    '</style>',
    '</head>',
    '<body>',
    `<main class="experience-${escapeHtml(experienceMode)}">`,
    '<header class="hero">',
    '<div class="hero-copy">',
    `<h1>${escapeHtml(experienceTitle)}</h1>`,
    '</div>',
    '<div class="summary">',
    renderExperienceModeSwitch(experienceMode),
    initializedBadge,
    `<span class="badge ok">${escapeHtml(localize('Manual-only AI'))}</span>`,
    `<span class="badge warn">${escapeHtml(localize('Preview-first'))}</span>`,
    `<span class="badge info">${escapeHtml(localize('Local-first'))}</span>`,
    `<span class="badge info">${escapeHtml(localize('No auto push'))}</span>`,
    `<span class="badge info">${escapeHtml(localize('Target'))}: ${currentTarget}</span>`,
    `<span class="badge info">${escapeHtml(localize('Current cycle'))}: ${currentCycle}</span>`,
    '</div>',
    '</header>',
    experienceShell,
    '</main>',
    `<script nonce="${escapeHtml(nonce)}">`,
    'const vscode = acquireVsCodeApi();',
    `const currentExperienceMode = ${JSON.stringify(experienceMode)};`,
    `const runningLabel = ${JSON.stringify(localize('Running'))};`,
    `const selectedFilesRequiredLabel = ${JSON.stringify(localize('Target files are required when Selected files is chosen.'))};`,
    'function readCommandCenterState() {',
    '  const currentState = vscode.getState();',
    '  return currentState && typeof currentState === "object" ? currentState : {};',
    '}',
    'function commandCenterFormKey(form) {',
    '  const contextId = form.getAttribute("data-context-form");',
    '  if (contextId) { return `context:${contextId}`; }',
    '  const optionsId = form.getAttribute("data-options-form");',
    '  return optionsId ? `options:${optionsId}` : "";',
    '}',
    'function collectCommandCenterFormValues(form) {',
    '  const values = {};',
    '  form.querySelectorAll("input[name], textarea[name], select[name]").forEach((field) => { values[field.name] = field.value; });',
    '  return values;',
    '}',
    'function persistCommandCenterUiState(sourceForm) {',
    '  const currentState = readCommandCenterState();',
    '  const currentUi = currentState.commandCenterUi && typeof currentState.commandCenterUi === "object" ? currentState.commandCenterUi : {};',
    '  const forms = currentUi.forms && typeof currentUi.forms === "object" ? { ...currentUi.forms } : {};',
    '  const saveForm = (form) => {',
    '    const formKey = commandCenterFormKey(form);',
    '    if (!formKey) { return; }',
    '    forms[formKey] = { open: form.classList.contains("open"), values: collectCommandCenterFormValues(form) };',
    '  };',
    '  if (sourceForm) {',
    '    saveForm(sourceForm);',
    '  } else {',
    '    const renderedKeys = new Set();',
    '    const openKeys = new Set();',
    '    document.querySelectorAll("[data-context-form], [data-options-form]").forEach((form) => {',
    '      const formKey = commandCenterFormKey(form);',
    '      if (!formKey) { return; }',
    '      renderedKeys.add(formKey);',
    '      if (form.classList.contains("open")) {',
    '        openKeys.add(formKey);',
    '        saveForm(form);',
    '      } else if (!forms[formKey]) {',
    '        saveForm(form);',
    '      }',
    '    });',
    '    renderedKeys.forEach((formKey) => {',
    '      if (!openKeys.has(formKey) && forms[formKey]) { forms[formKey] = { ...forms[formKey], open: false }; }',
    '    });',
    '  }',
    '  vscode.setState({ ...currentState, commandCenterUi: { forms } });',
    '}',
    'function restoreCommandCenterUiState() {',
    '  const currentState = readCommandCenterState();',
    '  const currentUi = currentState.commandCenterUi && typeof currentState.commandCenterUi === "object" ? currentState.commandCenterUi : {};',
    '  const forms = currentUi.forms && typeof currentUi.forms === "object" ? currentUi.forms : {};',
    '  const openedKeys = new Set();',
    '  document.querySelectorAll("[data-context-form], [data-options-form]").forEach((form) => {',
    '    const formKey = commandCenterFormKey(form);',
    '    const saved = formKey ? forms[formKey] : undefined;',
    '    if (!saved || typeof saved !== "object") { return; }',
    '    const values = saved.values && typeof saved.values === "object" ? saved.values : {};',
    '    form.querySelectorAll("input[name], textarea[name], select[name]").forEach((field) => {',
    '      const value = values[field.name];',
    '      if (typeof value === "string") { field.value = value; }',
    '    });',
    '    if (saved.open && !openedKeys.has(formKey)) {',
    '      form.classList.add("open");',
    '      openedKeys.add(formKey);',
    '    } else {',
    '      form.classList.remove("open");',
    '    }',
    '  });',
    '}',
    'function persistCommandCenterEventState(event) {',
    '  const target = event.target;',
    '  const form = target && typeof target.closest === "function" ? target.closest("[data-context-form], [data-options-form]") : null;',
    '  if (form) { persistCommandCenterUiState(form); }',
    '}',
    'function findCommandCenterForm(button, selector) {',
    '  const container = button.closest(".command-row, .recommended-panel, .workflow-panel");',
    '  const scopedForm = container ? container.querySelector(selector) : null;',
    '  return scopedForm || document.querySelector(selector);',
    '}',
    'restoreCommandCenterUiState();',
    'document.addEventListener("input", persistCommandCenterEventState);',
    'document.addEventListener("change", persistCommandCenterEventState);',
    'window.addEventListener("pagehide", () => persistCommandCenterUiState());',
    'function disableCommandButtons(activeButton) {',
    '  persistCommandCenterUiState();',
    '  document.body.setAttribute("aria-busy", "true");',
    '  document.querySelectorAll("button[data-command-id], button[data-command-batch], button[data-cycle-context-id], button[data-context-submit], button[data-command-options-id], button[data-options-submit], button[data-skip-optional-id], button[data-command-input-run]").forEach((candidate) => { candidate.disabled = true; });',
    '  if (activeButton) { activeButton.textContent = runningLabel; }',
    '}',
    'document.querySelectorAll("button[data-experience-mode]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const experienceMode = button.getAttribute("data-experience-mode");',
    '    if (!experienceMode || experienceMode === currentExperienceMode) { return; }',
    '    vscode.postMessage({ type: "setExperienceMode", experienceMode });',
    '  });',
    '});',
    'function runCommandInput(activeButton) {',
    '  const input = document.querySelector("#reviewops-command-input");',
    '  const error = document.querySelector("[data-command-input-error]");',
    '  const inputValue = input ? input.value : "";',
    '  if (!inputValue.trim()) {',
    '    if (error) { error.classList.add("visible"); }',
    '    if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }',
    '    return;',
    '  }',
    '  if (error) { error.classList.remove("visible"); }',
    '  if (input) { input.removeAttribute("aria-invalid"); }',
    '  disableCommandButtons(activeButton);',
    '  vscode.postMessage({ type: "runCommandInput", inputValue });',
    '}',
    'document.querySelectorAll("button[data-command-input-run]").forEach((button) => {',
    '  button.addEventListener("click", () => runCommandInput(button));',
    '});',
    'const commandInput = document.querySelector("#reviewops-command-input");',
    'if (commandInput) {',
    '  commandInput.addEventListener("keydown", (event) => {',
    '    if (event.key === "Enter") { event.preventDefault(); runCommandInput(document.querySelector("button[data-command-input-run]")); }',
    '  });',
    '}',
    'document.querySelectorAll("button[data-command-id]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const commandId = button.getAttribute("data-command-id");',
    '    if (!commandId || button.disabled) { return; }',
    '    disableCommandButtons(button);',
    '    vscode.postMessage({ type: "runCommand", commandId });',
    '  });',
    '});',
    'document.querySelectorAll("button[data-command-batch]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const commandIds = button.getAttribute("data-command-batch");',
    '    if (!commandIds || button.disabled) { return; }',
    '    const ids = commandIds.split(",").map((value) => value.trim()).filter(Boolean);',
    '    if (ids.length === 0) { return; }',
    '    disableCommandButtons(button);',
    '    vscode.postMessage({ type: "runCommandBatch", commandIds: ids });',
    '  });',
    '});',
    'document.querySelectorAll("button[data-cycle-context-id]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const id = button.getAttribute("data-cycle-context-id");',
    '    const form = id ? findCommandCenterForm(button, `[data-context-form="${id}"]`) : null;',
    '    if (!form || button.disabled) { return; }',
    '    form.classList.toggle("open");',
    '    persistCommandCenterUiState(form);',
    '    const firstInput = form.querySelector("input, textarea, select");',
    '    if (firstInput && form.classList.contains("open")) { firstInput.focus(); }',
    '  });',
    '});',
    'document.querySelectorAll("button[data-command-options-id]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const id = button.getAttribute("data-command-options-id");',
    '    const form = id ? findCommandCenterForm(button, `[data-options-form="${id}"]`) : null;',
    '    if (!form || button.disabled) { return; }',
    '    form.classList.toggle("open");',
    '    persistCommandCenterUiState(form);',
    '    const firstInput = form.querySelector("input, textarea, select");',
    '    if (firstInput && form.classList.contains("open")) { firstInput.focus(); }',
    '  });',
    '});',
    'document.querySelectorAll("button[data-context-submit]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const commandId = button.getAttribute("data-context-submit");',
    '    const form = commandId ? button.closest("[data-context-form]") : null;',
    '    if (!commandId || !form || button.disabled) { return; }',
    '    const scopeLabel = form.querySelector("[name=scopeLabel]").value.trim();',
    '    const intent = form.querySelector("[name=intent]").value.trim();',
    '    const targetMode = form.querySelector("[name=targetMode]").value;',
    '    const targetFilesInput = form.querySelector("[name=targetFiles]").value.trim();',
    '    const error = form.querySelector("[data-form-error]");',
    '    const targetFiles = targetFilesInput ? targetFilesInput.split(/[\\n,]+/).map((value) => value.trim()).filter(Boolean) : [];',
    '    if (targetMode === "selected-files" && targetFiles.length === 0) {',
    '      if (error) { error.textContent = selectedFilesRequiredLabel; error.classList.add("visible"); }',
    '      return;',
    '    }',
    '    if (error) { error.classList.remove("visible"); }',
    '    persistCommandCenterUiState(form);',
    '    disableCommandButtons(button);',
    '    vscode.postMessage({ type: "startCycleWithContext", commandId, startContext: { scopeLabel, intent, targetMode, targetFiles } });',
    '  });',
    '});',
    'document.querySelectorAll("button[data-skip-optional-id]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const commandId = button.getAttribute("data-skip-optional-id");',
    '    if (!commandId || button.disabled) { return; }',
    '    disableCommandButtons(button);',
    '    vscode.postMessage({ type: "skipOptionalStep", commandId });',
    '  });',
    '});',
    'document.querySelectorAll("button[data-options-submit]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const commandId = button.getAttribute("data-options-submit");',
    '    const form = commandId ? button.closest("[data-options-form]") : null;',
    '    if (!commandId || !form || button.disabled) { return; }',
    '    const commandOptions = collectCommandOptions(commandId, form);',
    '    const error = form.querySelector("[data-form-error]");',
    '    if (!commandOptions) {',
    '      if (error) { error.classList.add("visible"); }',
    '      return;',
    '    }',
    '    if (error) { error.classList.remove("visible"); }',
    '    persistCommandCenterUiState(form);',
    '    disableCommandButtons(button);',
    '    vscode.postMessage({ type: "runCommandWithOptions", commandId, commandOptions });',
    '  });',
    '});',
    'function valueOf(form, name) {',
    '  const field = form.querySelector(`[name="${name}"]`);',
    '  return field ? field.value.trim() : "";',
    '}',
    'function collectCommandOptions(commandId, form) {',
    '  if (commandId === "review/select-target" || commandId === "diff/review" || commandId === "research/select-scope" || commandId === "research/investigate") {',
    '    const mode = valueOf(form, "mode") || "working-tree";',
    '    const baseRef = valueOf(form, "baseRef");',
    '    const headRef = valueOf(form, "headRef");',
    '    if (mode === "range" && !baseRef) { return undefined; }',
    '    return { localDiff: { mode, baseRef, headRef } };',
    '  }',
    '  if (commandId === "provider/fetch-review" || commandId === "review/comment-triage") {',
    '    const repository = valueOf(form, "repository");',
    '    const pullRequestNumber = valueOf(form, "pullRequestNumber");',
    '    if (!repository || !pullRequestNumber) { return undefined; }',
    '    return { githubTarget: { repository, pullRequestNumber } };',
    '  }',
    '  if (commandId === "rules/propose") {',
    '    const title = valueOf(form, "title");',
    '    const rationale = valueOf(form, "rationale");',
    '    if (!title || !rationale) { return undefined; }',
    '    return { ruleProposal: { title, rationale } };',
    '  }',
    '  if (commandId === "field/report") {',
    '    return { fieldReport: { from: valueOf(form, "from"), to: valueOf(form, "to"), targetScope: valueOf(form, "targetScope") } };',
    '  }',
    '  return undefined;',
    '}',
    'document.querySelectorAll("button[data-open-file]").forEach((button) => {',
    '  button.addEventListener("click", () => {',
    '    const relativePath = button.getAttribute("data-open-file");',
    '    if (!relativePath || button.disabled) { return; }',
    '    persistCommandCenterUiState();',
    '    vscode.postMessage({ type: "openFile", relativePath });',
    '  });',
    '});',
    '</script>',
    '</body>',
    '</html>'
  ].join('');
}

function renderExperienceModeSwitch(experienceMode: ReviewOpsExperienceMode): string {
  return [
    '<div class="mode-switch" role="group" aria-label="ReviewOps experience mode">',
    renderExperienceModeButton('guide', localize('Guide'), experienceMode),
    renderExperienceModeButton('console', localize('Console'), experienceMode),
    '</div>'
  ].join('');
}

function renderExperienceModeButton(
  mode: ReviewOpsExperienceMode,
  label: string,
  currentMode: ReviewOpsExperienceMode
): string {
  const active = mode === currentMode;
  return `<button type="button" class="${active ? 'active' : ''}" data-experience-mode="${escapeHtml(mode)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
}

function renderCommandCenterGuide(
  status: ReviewOpsMetaStatus,
  commands: ReviewOpsCommandCatalogEntry[],
  recommendedCommand: ReviewOpsCommandCatalogEntry | undefined,
  resultPanel: string
): string {
  const recommended = renderCommandCenterRecommended(recommendedCommand, status);
  const workflowMap = renderCommandCenterWorkflowMap(status);
  const advancedAction = renderCommandCenterAdvancedAction(recommendedCommand, status);
  const activeStep = recommendedCommand?.guideStep ?? 'understand';

  return [
    '<div class="guide-layout">',
    '<div class="guide-main">',
    renderGuideStepper(activeStep),
    recommended,
    renderGuideSupportGrid(recommendedCommand),
    '<details class="details-panel">',
    `<summary>${escapeHtml(localize('More actions'))}</summary>`,
    '<div class="details-stack">',
    workflowMap,
    advancedAction,
    renderGuideCommandShortcuts(commands),
    '</div>',
    '</details>',
    '</div>',
    '<aside class="guide-side">',
    renderGuideConcernPanel(recommendedCommand),
    resultPanel,
    '</aside>',
    '</div>'
  ].join('');
}

function renderCommandCenterConsole(
  status: ReviewOpsMetaStatus,
  commands: ReviewOpsCommandCatalogEntry[],
  recommendedCommand: ReviewOpsCommandCatalogEntry | undefined,
  runResult: ReviewOpsWebviewRunResult,
  resultPanel: string
): string {
  const queueCommands = commandCenterConsoleQueue(commands, recommendedCommand);
  const batchableQueue = queueCommands.filter((command) => command.batchable);

  return [
    '<div class="console-layout">',
    '<section class="section-panel console-bar">',
    '<div class="field">',
    `<label for="reviewops-command-input">${escapeHtml(localize('Command input'))}</label>`,
    `<input id="reviewops-command-input" type="text" inputmode="search" placeholder="${escapeHtml(localize('review target / rule / test'))}" aria-label="${escapeHtml(localize('Command input'))}">`,
    `<div class="form-error" data-command-input-error role="alert">${escapeHtml(localize('No matching ReviewOps command.'))}</div>`,
    '</div>',
    '<div class="controls">',
    `<button type="button" data-command-input-run>${escapeHtml(localize('Run'))}</button>`,
    batchableQueue.length > 1
      ? `<button type="button" class="secondary" data-command-batch="${escapeHtml(batchableQueue.map((command) => command.id).join(','))}">${escapeHtml(localize('Run Queue'))}</button>`
      : '',
    '</div>',
    '</section>',
    '<div class="console-main">',
    renderConsoleQuickCommands(commands),
    renderConsoleCommandQueue(queueCommands, status),
    renderConsoleArtifactSummary(queueCommands),
    renderConsoleRunLog(runResult, status),
    '</div>',
    '<aside class="console-side">',
    renderConsoleBatchQueue(queueCommands),
    renderConsoleRuleCandidates(commands),
    resultPanel,
    '</aside>',
    '</div>'
  ].join('');
}

function renderGuideStepper(activeStep: ReviewOpsCommandCatalogEntry['guideStep']): string {
  const steps: Array<{ id: ReviewOpsCommandCatalogEntry['guideStep']; label: string }> = [
    { id: 'understand', label: 'Understand' },
    { id: 'investigate', label: 'Investigate' },
    { id: 'design', label: 'Design' },
    { id: 'implement', label: 'Implement' },
    { id: 'confirm', label: 'Confirm' }
  ];
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));

  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Guided review path'))}</h2>`,
    '</div>',
    '<div class="guide-stepper" aria-label="Guided review path">',
    steps
      .map((step, index) => {
        const stateClass = index < activeIndex ? 'complete' : index === activeIndex ? 'active' : '';
        return [
          `<article class="guide-step ${escapeHtml(stateClass)}" aria-current="${index === activeIndex ? 'step' : 'false'}">`,
          `<span class="badge ${index < activeIndex ? 'ok' : index === activeIndex ? 'info' : 'kind'}">${index + 1}</span>`,
          `<span>${escapeHtml(localize(step.label))}</span>`,
          '</article>'
        ].join('');
      })
      .join(''),
    '</div>',
    '</section>'
  ].join('');
}

function renderGuideSupportGrid(command: ReviewOpsCommandCatalogEntry | undefined): string {
  const riskClass = command === undefined ? 'risk-low' : `risk-${command.riskLevel}`;
  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Finding breakdown'))}</h2>`,
    '</div>',
    '<div class="guide-grid">',
    renderGuideTile('What was said'),
    renderGuideTile('Why it matters'),
    renderGuideTile('Where to inspect'),
    renderGuideTile('How to fix'),
    renderGuideTile('What to ask'),
    renderGuideTile('How to test'),
    '</div>',
    '<div class="title-line">',
    `<span class="badge ${escapeHtml(riskClass)}">${escapeHtml(formatCommandRiskLabel(command?.riskLevel ?? 'low'))}</span>`,
    `<span class="badge warn">${escapeHtml(localize('Review before posting'))}</span>`,
    '</div>',
    '</section>'
  ].join('');
}

function renderGuideTile(title: string): string {
  return [
    '<article class="guide-tile">',
    `<strong>${escapeHtml(localize(title))}</strong>`,
    '</article>'
  ].join('');
}

function renderGuideConcernPanel(command: ReviewOpsCommandCatalogEntry | undefined): string {
  const commandLabel = command === undefined ? localize('No next action') : localize(command.label);
  const items = [
    commandLabel,
    localize('What is the smallest safe fix?'),
    localize('Whether additional tests are required before replying.')
  ];

  return [
    '<section class="section-panel workflow-panel">',
    '<div class="title-line">',
    `<span class="badge info">${escapeHtml(localize('Junior guide'))}</span>`,
    `<h2>${escapeHtml(localize('Understanding board'))}</h2>`,
    '</div>',
    `<ul class="guide-insight-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
    '</section>'
  ].join('');
}

function renderGuideCommandShortcuts(commands: ReviewOpsCommandCatalogEntry[]): string {
  const guideCommands = commands
    .filter((command) => command.category !== 'start-cycle')
    .filter((command) => command.persona === 'junior' || command.persona === 'both')
    .slice(0, 6);
  if (guideCommands.length === 0) {
    return '';
  }

  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Helpful guide actions'))}</h2>`,
    '</div>',
    '<div class="section-panel command-stack quick-stack">',
    guideCommands.map((command) => renderCommandCenterCommandRow(command, false)).join(''),
    '</div>',
    '</section>'
  ].join('');
}

function renderCommandCenterCommandRow(command: ReviewOpsCommandCatalogEntry, disabled: boolean): string {
  return [
    `<div class="command-row${disabled ? ' disabled' : ''}">`,
    '<div class="command-copy">',
    '<div class="title-line">',
    `<span class="badge kind">${escapeHtml(localize(command.guideStep === 'none' ? command.kind : command.guideStep))}</span>`,
    `<h3>${escapeHtml(localize(command.label))}</h3>`,
    '</div>',
    `<div class="meta-line">${escapeHtml(localize(command.summary))}</div>`,
    '</div>',
    '<div class="controls">',
    renderCommandCenterPrimaryButton(command, disabled),
    '</div>',
    '</div>'
  ].join('');
}

function renderConsoleQuickCommands(commands: ReviewOpsCommandCatalogEntry[]): string {
  const quickCommands = [
    { commandId: 'cycle/mr-review', key: 'R', label: 'Review' },
    { commandId: 'rules/propose', key: 'Shift+E', label: 'Rules' },
    { commandId: 'fix/verify', key: 'S', label: 'Self-review' },
    { commandId: 'refactor/plan', key: 'D', label: 'Design' },
    { commandId: 'research/investigate', key: 'Q', label: 'Requirements' },
    { commandId: 'fix/checklist', key: 'T', label: 'Tests' }
  ];
  const buttons = quickCommands
    .map(({ commandId, key, label }) => {
      const command = commands.find((item) => item.id === commandId);
      if (command === undefined) {
        return '';
      }

      return [
        `<button type="button" class="secondary quick-command" data-command-id="${escapeHtml(command.id)}" title="${escapeHtml(localize(command.label))}">`,
        `<kbd>${escapeHtml(key)}</kbd>`,
        `<span>${escapeHtml(localize(label))}</span>`,
        '</button>'
      ].join('');
    })
    .join('');

  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Quick Commands'))}</h2>`,
    '</div>',
    `<div class="quick-commands">${buttons}</div>`,
    '</section>'
  ].join('');
}

function renderConsoleCommandQueue(commands: ReviewOpsCommandCatalogEntry[], status: ReviewOpsMetaStatus): string {
  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Command Table'))}</h2>`,
    '</div>',
    '<div class="section-panel command-table">',
    '<div class="command-table-header">',
    `<span>${escapeHtml(localize('Cmd'))}</span>`,
    `<span>${escapeHtml(localize('Target'))}</span>`,
    `<span>${escapeHtml(localize('Risk'))}</span>`,
    `<span>${escapeHtml(localize('Output'))}</span>`,
    `<span>${escapeHtml(localize('Run'))}</span>`,
    '</div>',
    commands.map((command) => renderConsoleCommandRow(command, status)).join(''),
    '</div>',
    '</section>'
  ].join('');
}

function renderConsoleCommandRow(command: ReviewOpsCommandCatalogEntry, status: ReviewOpsMetaStatus): string {
  const disabled = command.requiresInitialized && !status.initialized;
  const shortcut = renderCommandShortcut(command.shortcut);
  return [
    `<div class="command-table-row${disabled ? ' disabled' : ''}">`,
    `<div class="command-cell"><strong>${escapeHtml(localize(command.label))}</strong><div class="meta-line">${escapeHtml(command.id)}${shortcut}</div></div>`,
    `<div class="command-cell">${escapeHtml(commandCenterConsoleTarget(command))}<div class="meta-line">${escapeHtml(localize(command.batchable ? 'Batchable' : 'Single explicit action'))}</div></div>`,
    `<div class="command-cell"><span class="badge ${escapeHtml(`risk-${command.riskLevel}`)}">${escapeHtml(formatCommandRiskLabel(command.riskLevel))}</span><div class="meta-line">${escapeHtml(localize(command.estimatedDuration))}</div></div>`,
    `<div class="command-cell">${escapeHtml(formatCommandCenterVisibleOutput(command))}</div>`,
    '<div class="controls">',
    renderCommandCenterPrimaryButton(command, disabled, status),
    '</div>',
    '</div>'
  ].join('');
}

function renderCommandShortcut(shortcut: string): string {
  if (shortcut.length === 0) {
    return '';
  }

  return ` <kbd class="key-chip">${escapeHtml(formatCommandShortcut(shortcut))}</kbd>`;
}

function formatCommandShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => (part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('+');
}

function renderConsoleArtifactSummary(commands: ReviewOpsCommandCatalogEntry[]): string {
  const artifacts = ['prompt', 'action-plan', 'rule-candidate', 'evidence']
    .map((kind) => commands.filter((command) => command.artifactKind === kind).length)
    .map((count, index) => {
      const labels = ['Prompts', 'Plans', 'Rules', 'Evidence'];
      return `<div class="value-chip"><strong>${escapeHtml(localize(labels[index]))}</strong><span>${count}</span></div>`;
    })
    .join('');

  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Artifact output summary'))}</h2>`,
    '</div>',
    `<div class="artifact-strip">${artifacts}</div>`,
    '</section>'
  ].join('');
}

function renderConsoleBatchQueue(commands: ReviewOpsCommandCatalogEntry[]): string {
  const batchCommands = commands.filter((command) => command.batchable);
  const items = batchCommands.map((command, index) =>
    [
      '<li>',
      `<span class="batch-index">${index + 1}</span>`,
      '<div>',
      `<strong>${escapeHtml(localize(command.label))}</strong>`,
      `<div class="meta-line">${escapeHtml(formatCommandCenterVisibleOutput(command))} · ${escapeHtml(localize(command.estimatedDuration))}</div>`,
      `<div class="title-line"><span class="badge ${escapeHtml(`risk-${command.riskLevel}`)}">${escapeHtml(formatCommandRiskLabel(command.riskLevel))}</span><span class="badge info">${escapeHtml(localize(command.artifactKind))}</span></div>`,
      '</div>',
      '</li>'
    ].join('')
  );

  return [
    '<section class="section-panel workflow-panel queue-panel batch-queue-panel">',
    '<div class="title-line">',
    `<span class="badge ok">${escapeHtml(localize('Batch queue'))}</span>`,
    `<h2>${escapeHtml(localize('Planned run order'))}</h2>`,
    '</div>',
    `<ol class="batch-queue">${items.join('')}</ol>`,
    batchCommands.length > 1
      ? `<div class="controls"><button type="button" data-command-batch="${escapeHtml(batchCommands.map((command) => command.id).join(','))}">${escapeHtml(localize('Run Queue'))}</button></div>`
      : '',
    '</section>'
  ].join('');
}

function renderConsoleRunLog(runResult: ReviewOpsWebviewRunResult, status: ReviewOpsMetaStatus): string {
  const nextLogs = runResult.nextActions.length > 0 ? runResult.nextActions : status.nextActions;
  const rows = [
    `<li><span>${escapeHtml(localize('Now'))}</span><span>${escapeHtml(runResult.title)} · ${escapeHtml(runResult.message)}</span></li>`,
    ...nextLogs.slice(0, 4).map((action, index) =>
      `<li><span>next+${index + 1}</span><span>${escapeHtml(localize(action.title))} · ${escapeHtml(localize(action.reason))}</span></li>`
    )
  ];

  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Run Log'))}</h2>`,
    '</div>',
    '<div class="section-panel workflow-panel">',
    `<ul class="run-log">${rows.join('')}</ul>`,
    '</div>',
    '</section>'
  ].join('');
}

function renderConsoleRuleCandidates(commands: ReviewOpsCommandCatalogEntry[]): string {
  const ruleCommands = commands.filter((command) => command.id.startsWith('rules/')).slice(0, 4);
  const listItems = ruleCommands.map((command, index) =>
    [
      '<li>',
      '<label>',
      `<input type="checkbox" ${index === 0 ? 'checked ' : ''}disabled>`,
      `<span>${escapeHtml(localize(command.label))}</span>`,
      '</label>',
      `<div class="meta-line">${escapeHtml(localize(command.outcome))}</div>`,
      `<div class="title-line"><span class="badge ${escapeHtml(command.requiresPreview ? 'warn' : 'info')}">${escapeHtml(localize(command.requiresPreview ? 'Approval required' : 'Candidate only'))}</span><span class="badge ${escapeHtml(`risk-${command.riskLevel}`)}">${escapeHtml(formatCommandRiskLabel(command.riskLevel))}</span></div>`,
      '</li>'
    ].join('')
  );

  return [
    '<section class="section-panel workflow-panel queue-panel approval-queue-panel">',
    '<div class="title-line">',
    `<span class="badge info">${escapeHtml(localize('Rule Candidates'))}</span>`,
    `<h2>${escapeHtml(localize('Approval queue'))}</h2>`,
    '</div>',
    `<ul class="rule-list">${listItems.join('')}</ul>`,
    '</section>'
  ].join('');
}

function commandCenterConsoleQueue(
  commands: ReviewOpsCommandCatalogEntry[],
  recommendedCommand: ReviewOpsCommandCatalogEntry | undefined
): ReviewOpsCommandCatalogEntry[] {
  const preferred = [
    recommendedCommand?.id,
    'cycle/mr-review',
    'provider/fetch-review',
    'rules/propose',
    'fix/verify',
    'refactor/plan',
    'research/investigate',
    'fix/checklist',
    'publish/summary-draft'
  ].filter((id): id is string => id !== undefined);
  const seen = new Set<string>();
  return preferred
    .map((id) => commands.find((command) => command.id === id))
    .filter((command): command is ReviewOpsCommandCatalogEntry => command !== undefined)
    .filter((command) => {
      if (seen.has(command.id)) {
        return false;
      }
      seen.add(command.id);
      return true;
    });
}

function commandCenterConsoleTarget(command: ReviewOpsCommandCatalogEntry): string {
  if (command.id.startsWith('rules/')) {
    return localize('Rule candidates');
  }
  if (command.id.startsWith('publish/')) {
    return localize('Provider draft');
  }
  if (command.id.startsWith('research/')) {
    return localize('Scoped question');
  }
  if (command.id.startsWith('refactor/')) {
    return localize('Design scope');
  }
  if (command.id.startsWith('fix/')) {
    return localize('Current fix');
  }
  if (command.id.startsWith('provider/')) {
    return localize('PR/MR target');
  }
  if (command.id.startsWith('cycle/')) {
    return localize('Workspace flow');
  }
  return localize('Workspace');
}

function formatCommandRiskLabel(riskLevel: ReviewOpsCommandCatalogEntry['riskLevel']): string {
  switch (riskLevel) {
    case 'high':
      return localize('High risk');
    case 'medium':
      return localize('Medium risk');
    case 'low':
      return localize('Low risk');
  }
}

function createIdleCommandCenterRunResult(status: ReviewOpsMetaStatus): ReviewOpsWebviewRunResult {
  return {
    status: 'idle',
    title: localize('Latest Preview'),
    message: localize('Run the next action. The main result will appear here.'),
    artifactPaths: [],
    nextActions: status.nextActions.map((action) => ({
      title: action.title,
      flowId: action.flowId,
      reason: action.reason
    }))
  };
}

function renderCommandCenterWorkflowMap(status: ReviewOpsMetaStatus): string {
  if (status.currentCycle === null) {
    return [
      '<section class="section">',
      '<div class="section-heading">',
      `<h2>${escapeHtml(localize('Current Position'))}</h2>`,
      '</div>',
      '<div class="section-panel workflow-panel">',
      `<p class="result-empty">${escapeHtml(localize('No active cycle. Use the next safe step to begin.'))}</p>`,
      '</div>',
      '</section>'
    ].join('');
  }

  const currentStep = status.currentCycle.steps.find((step) => step.status === 'ready' || step.status === 'blocked');
  const startContext = status.currentCycle.startContext;
  const contextBlock =
    startContext === undefined
      ? ''
      : [
          '<div class="meta-line">',
          `${escapeHtml(localize('Scope'))}: ${escapeHtml(startContext.scopeLabel)} · ${escapeHtml(formatCycleTargetMode(startContext.targetMode))}`,
          '</div>'
        ].join('');
  const steps = status.currentCycle.steps
    .map((step, index) =>
      [
        `<article class="workflow-step ${escapeHtml(step.status)}" aria-current="${step.flowId === currentStep?.flowId ? 'step' : 'false'}">`,
        `<span class="badge ${escapeHtml(statusBadgeClassForCycleStep(step.status))}">${escapeHtml(formatCycleStepStatus(step.status))}</span>`,
        `<div class="workflow-step-title">${index + 1}. ${escapeHtml(formatCycleStepTitle(step.title))}</div>`,
        '</article>'
      ].join('')
    )
    .join('');

  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Workflow Map'))}</h2>`,
    '</div>',
    '<div class="section-panel workflow-panel">',
    '<div class="title-line">',
    `<span class="badge info">${escapeHtml(localize('Current Position'))}</span>`,
    `<h3>${escapeHtml(formatCycleTitle(status.currentCycle.title))}</h3>`,
    `<span class="badge ${escapeHtml(status.currentCycle.status === 'completed' ? 'ok' : status.currentCycle.status === 'blocked' ? 'error' : 'info')}">${escapeHtml(formatCycleStatus(status.currentCycle.status))}</span>`,
    '</div>',
    contextBlock,
    `<div class="workflow-map">${steps}</div>`,
    '</div>',
    '</section>'
  ].join('');
}

function renderCommandCenterRunResult(
  result: ReviewOpsWebviewRunResult,
  status: ReviewOpsMetaStatus
): string {
  const resultFilePath = result.preview?.path ?? result.artifactPaths[0];
  const resultFileAction =
    resultFilePath === undefined ? '' : renderCommandCenterResultFileAction(resultFilePath);
  const preview =
    result.preview === undefined
      ? [
          `<p class="result-empty">${escapeHtml(localize('No preview yet. The main result appears here after the next action.'))}</p>`,
          resultFileAction
        ].join('')
      : [
          '<div class="result-preview">',
          `<pre>${escapeHtml(result.preview.content)}</pre>`,
          resultFileAction,
          '</div>'
        ].join('');
  const currentPosition = renderCommandCenterCurrentPosition(status);

  return [
    `<aside class="section-panel result-panel ${escapeHtml(result.status)}" aria-live="polite" aria-busy="${result.status === 'running' ? 'true' : 'false'}">`,
    '<div class="result-header">',
    `<span class="badge result-status ${escapeHtml(statusBadgeClass(result.status))}">${escapeHtml(formatRunResultStatus(result.status))}</span>`,
    `<h2>${escapeHtml(result.title)}</h2>`,
    `<p>${escapeHtml(result.message)}</p>`,
    '</div>',
    '<section class="section">',
    `<h3>${escapeHtml(localize('Current Position'))}</h3>`,
    currentPosition,
    '</section>',
    '<section class="section">',
    `<h3>${escapeHtml(localize('Preview'))}</h3>`,
    preview,
    '</section>',
    '</aside>'
  ].join('');
}

function renderCommandCenterResultFileAction(relativePath: string): string {
  const artifactLabel = labelForReviewOpsArtifactPath(relativePath);
  return [
    '<div class="result-file-action">',
    `<span class="meta-line">${escapeHtml(localize('Main result'))}: ${escapeHtml(artifactLabel)}</span>`,
    `<button type="button" class="secondary" data-open-file="${escapeHtml(relativePath)}">${escapeHtml(localize('Open {0}', artifactLabel))}</button>`,
    '</div>'
  ].join('');
}

function renderCommandCenterCurrentPosition(status: ReviewOpsMetaStatus): string {
  if (status.currentCycle === null) {
    return `<p class="result-empty">${escapeHtml(localize('No active cycle. Use the next safe step to begin.'))}</p>`;
  }

  const currentStep = status.currentCycle.steps.find((step) => step.status === 'ready' || step.status === 'blocked');
  if (currentStep === undefined) {
    return `<p class="result-empty">${escapeHtml(localize('This cycle has no open step.'))}</p>`;
  }

  return [
    `<div class="meta-line">${escapeHtml(formatCycleTitle(status.currentCycle.title))} · ${escapeHtml(formatCycleStatus(status.currentCycle.status))}</div>`,
    `<p>${escapeHtml(formatCycleStepTitle(currentStep.title))}</p>`,
    `<div class="meta-line">${escapeHtml(localize(currentStep.reason))}</div>`
  ].join('');
}

function renderCommandCenterRecommended(
  command: ReviewOpsCommandCatalogEntry | undefined,
  status: ReviewOpsMetaStatus
): string {
  if (command === undefined) {
    return '';
  }

  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Next Safe Step'))}</h2>`,
    '</div>',
    renderCommandCenterFeatureAction(command, status),
    '</section>'
  ].join('');
}

function renderCommandCenterFeatureAction(command: ReviewOpsCommandCatalogEntry, status: ReviewOpsMetaStatus): string {
  const disabled = command.requiresInitialized && !status.initialized;
  return [
    `<article class="section-panel recommended-panel${disabled ? ' disabled' : ''}">`,
    '<div class="title-line">',
    `<span class="badge kind">${escapeHtml(localize(command.requiresConfirmation ? 'Preview first' : command.kind))}</span>`,
    `<span class="badge ${escapeHtml(`risk-${command.riskLevel}`)}">${escapeHtml(formatCommandRiskLabel(command.riskLevel))}</span>`,
    `<span class="badge info">${escapeHtml(localize(command.estimatedDuration))}</span>`,
    `<h3>${escapeHtml(localize(command.label))}</h3>`,
    '</div>',
    '<div class="recommended-body">',
    '<div class="recommended-copy">',
    `<p>${escapeHtml(localize(command.summary))}</p>`,
    '</div>',
    '<div class="controls">',
    renderCommandCenterPrimaryButton(command, disabled, status),
    '</div>',
    '</div>',
    '</article>'
  ].join('');
}

function renderCommandCenterAdvancedAction(
  command: ReviewOpsCommandCatalogEntry | undefined,
  status: ReviewOpsMetaStatus
): string {
  if (command === undefined || !hasCommandCenterAdvancedAction(command, status)) {
    return '';
  }

  const disabled = command.requiresInitialized && !status.initialized;
  const contextFormId = `${command.id}-advanced`;
  return [
    '<section class="section">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(localize('Advanced current action'))}</h2>`,
    '</div>',
    '<div class="section-panel workflow-panel">',
    '<div class="title-line">',
    `<span class="badge kind">${escapeHtml(localize(command.kind))}</span>`,
    `<h3>${escapeHtml(localize(command.label))}</h3>`,
    '</div>',
    `<p>${escapeHtml(localize(command.summary))}</p>`,
    '<div class="controls">',
    renderCommandCenterAdvancedControls(command, disabled, contextFormId, status),
    '</div>',
    renderCommandCenterCycleContextForm(command, contextFormId),
    renderCommandCenterCommandOptionsForm(command),
    '</div>',
    '</section>'
  ].join('');
}

function hasCommandCenterAdvancedAction(command: ReviewOpsCommandCatalogEntry, status: ReviewOpsMetaStatus): boolean {
  return (
    isContextRequiredCycle(command.id) ||
    isConfigurableCommand(command.id) ||
    (isOptionalSkippableCommand(command.id) &&
      (isOptionalImportFlow(command.id, status) || isOptionalRulesFlow(command.id, status)))
  );
}

function renderCommandCenterPrimaryButton(
  command: ReviewOpsCommandCatalogEntry,
  disabled: boolean,
  status?: ReviewOpsMetaStatus
): string {
  const isActiveOptionalStep =
    status !== undefined && (isOptionalImportFlow(command.id, status) || isOptionalRulesFlow(command.id, status));
  if (isActiveOptionalStep) {
    return `<button type="button" data-skip-optional-id="${escapeHtml(command.id)}"${disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(disabled ? localize('Initialize first') : localize(optionalSkipLabel(command.id)))}</button>`;
  }

  if (isContextRequiredCycle(command.id)) {
    return `<button type="button" data-command-id="${escapeHtml(command.id)}"${disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(disabled ? localize('Initialize first') : localize('Start'))}</button>`;
  }

  return `<button type="button" data-command-id="${escapeHtml(command.id)}"${disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(disabled ? localize('Initialize first') : localize('Run'))}</button>`;
}

function renderCommandCenterAdvancedControls(
  command: ReviewOpsCommandCatalogEntry,
  disabled: boolean,
  contextFormId: string,
  status: ReviewOpsMetaStatus
): string {
  if (isOptionalSkippableCommand(command.id) && (isOptionalImportFlow(command.id, status) || isOptionalRulesFlow(command.id, status))) {
    return `<button type="button" class="secondary" data-command-id="${escapeHtml(command.id)}"${disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(localize(optionalDetailLabel(command.id)))}</button>`;
  }

  if (isContextRequiredCycle(command.id)) {
    return `<button type="button" class="secondary" data-cycle-context-id="${escapeHtml(contextFormId)}"${disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(localize('Configure scope'))}</button>`;
  }

  if (isConfigurableCommand(command.id)) {
    return `<button type="button" class="secondary" data-command-options-id="${escapeHtml(command.id)}"${disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(localize('Configure'))}</button>`;
  }

  return '';
}

function renderCommandCenterCycleContextForm(command: ReviewOpsCommandCatalogEntry, contextFormId = command.id): string {
  if (!isContextRequiredCycle(command.id)) {
    return '';
  }

  return [
    `<div class="context-form" data-context-form="${escapeHtml(contextFormId)}">`,
    '<div class="field">',
    `<label>${escapeHtml(localize('Scope label (optional)'))}</label>`,
    `<input name="scopeLabel" type="text" placeholder="${escapeHtml(localize('Default: Current workspace'))}">`,
    '</div>',
    '<div class="field">',
    `<label>${escapeHtml(localize('Purpose or question (optional)'))}</label>`,
    `<textarea name="intent" placeholder="${escapeHtml(localize('Leave empty to use the default cycle purpose.'))}"></textarea>`,
    '</div>',
    '<div class="field">',
    `<label>${escapeHtml(localize('Target mode'))}</label>`,
    '<select name="targetMode">',
    `<option value="current-diff">${escapeHtml(localize('Current diff'))}</option>`,
    `<option value="selected-files">${escapeHtml(localize('Selected files'))}</option>`,
    `<option value="project-wide">${escapeHtml(localize('Project-wide'))}</option>`,
    `<option value="manual">${escapeHtml(localize('Manual target'))}</option>`,
    '</select>',
    '</div>',
    '<div class="field">',
    `<label>${escapeHtml(localize('Target files'))}</label>`,
    `<textarea name="targetFiles" placeholder="${escapeHtml(localize('Optional: one file path per line, or comma-separated.'))}"></textarea>`,
    '</div>',
    `<div class="form-error" data-form-error>${escapeHtml(localize('Target files are required when Selected files is chosen.'))}</div>`,
    '<div class="controls">',
    `<button type="button" data-context-submit="${escapeHtml(command.id)}">${escapeHtml(localize('Start with Scope'))}</button>`,
    '</div>',
    '</div>'
  ].join('');
}

function renderCommandCenterCommandOptionsForm(command: ReviewOpsCommandCatalogEntry): string {
  if (!isConfigurableCommand(command.id)) {
    return '';
  }

  return [
    `<div class="command-options-form" data-options-form="${escapeHtml(command.id)}">`,
    renderCommandOptionsFields(command.id),
    `<div class="form-error" data-form-error>${escapeHtml(localize('ReviewOps needs the required fields before running this configured command.'))}</div>`,
    '<div class="controls">',
    `<button type="button" data-options-submit="${escapeHtml(command.id)}">${escapeHtml(localize('Run Configured'))}</button>`,
    '</div>',
    '</div>'
  ].join('');
}

function renderCommandOptionsFields(commandId: string): string {
  if (isLocalDiffPromptCommand(commandId)) {
    return [
      '<div class="field">',
      `<label>${escapeHtml(localize('Diff source'))}</label>`,
      '<select name="mode">',
      `<option value="working-tree">${escapeHtml(localize('Working tree vs HEAD'))}</option>`,
      `<option value="staged">${escapeHtml(localize('Staged changes'))}</option>`,
      `<option value="range">${escapeHtml(localize('Git range'))}</option>`,
      '</select>',
      '</div>',
      '<div class="field">',
      `<label>${escapeHtml(localize('Base ref'))}</label>`,
      '<input name="baseRef" type="text" placeholder="origin/main">',
      '</div>',
      '<div class="field">',
      `<label>${escapeHtml(localize('Head ref'))}</label>`,
      '<input name="headRef" type="text" placeholder="HEAD">',
      '</div>'
    ].join('');
  }

  if (commandId === 'provider/fetch-review' || commandId === 'review/comment-triage') {
    return [
      '<div class="field">',
      `<label>${escapeHtml(localize('GitHub repository'))}</label>`,
      '<input name="repository" type="text" placeholder="owner/repo">',
      '</div>',
      '<div class="field">',
      `<label>${escapeHtml(localize('Pull request number'))}</label>`,
      '<input name="pullRequestNumber" type="number" min="1" step="1" placeholder="1">',
      '</div>'
    ].join('');
  }

  if (commandId === 'rules/propose') {
    return [
      '<div class="field">',
      `<label>${escapeHtml(localize('Rule title'))}</label>`,
      `<input name="title" type="text" placeholder="${escapeHtml(localize('Require focused verification for risky review fixes'))}">`,
      '</div>',
      '<div class="field">',
      `<label>${escapeHtml(localize('Rule rationale'))}</label>`,
      `<textarea name="rationale" placeholder="${escapeHtml(localize('Why this rule candidate is useful.'))}"></textarea>`,
      '</div>'
    ].join('');
  }

  if (commandId === 'field/report') {
    return [
      '<div class="field">',
      `<label>${escapeHtml(localize('From date'))}</label>`,
      '<input name="from" type="date">',
      '</div>',
      '<div class="field">',
      `<label>${escapeHtml(localize('To date'))}</label>`,
      '<input name="to" type="date">',
      '</div>',
      '<div class="field">',
      `<label>${escapeHtml(localize('Report scope'))}</label>`,
      '<select name="targetScope">',
      `<option value="field">${escapeHtml(localize('Field'))}</option>`,
      `<option value="developer">${escapeHtml(localize('Developer'))}</option>`,
      `<option value="reviewer">${escapeHtml(localize('Reviewer'))}</option>`,
      `<option value="team">${escapeHtml(localize('Team'))}</option>`,
      '</select>',
      '</div>'
    ].join('');
  }

  return '';
}
