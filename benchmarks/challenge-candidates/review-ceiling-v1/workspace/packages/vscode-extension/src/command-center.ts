import type {
  FieldReport,
  ReviewOpsCommandCatalogEntry,
  ReviewOpsCurrentCycle,
  ReviewOpsCycleStartContext,
  ReviewOpsMetaStatus
} from '@reviewops/core';

import { localize } from './localization.js';

export type ReviewOpsExperienceMode = 'guide' | 'console';

export interface ReviewOpsCommandExecutionOptions {
  localDiff?: {
    mode?: 'working-tree' | 'staged' | 'range';
    baseRef?: string;
    headRef?: string;
  };
  githubTarget?: {
    repository?: string;
    pullRequestNumber?: number | string;
  };
  ruleProposal?: {
    title?: string;
    rationale?: string;
  };
  fieldReport?: {
    from?: string;
    to?: string;
    targetScope?: FieldReport['targetScope'];
  };
}

export interface ReviewOpsWebviewRunResult {
  status: 'idle' | 'running' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  artifactPaths: string[];
  preview?: {
    path: string;
    language: string;
    content: string;
  };
  nextActions: Array<{
    title: string;
    flowId: string;
    reason: string;
  }>;
}

export interface CommandCenterRunMessage {
  type: 'runCommand';
  commandId: string;
}

export interface CommandCenterRunBatchMessage {
  type: 'runCommandBatch';
  commandIds: string[];
}

export interface CommandCenterRunInputMessage {
  type: 'runCommandInput';
  inputValue: string;
}

export interface CommandCenterResolvedInput {
  commandIds: string[];
  batch: boolean;
}

export interface CommandCenterStartCycleWithContextMessage {
  type: 'startCycleWithContext';
  commandId: string;
  startContext: ReviewOpsCycleStartContext;
}

export interface CommandCenterRunWithOptionsMessage {
  type: 'runCommandWithOptions';
  commandId: string;
  commandOptions: ReviewOpsCommandExecutionOptions;
}

export interface CommandCenterSkipOptionalStepMessage {
  type: 'skipOptionalStep';
  commandId: string;
}

export interface CommandCenterOpenFileMessage {
  type: 'openFile';
  relativePath: string;
}

export interface CommandCenterSetExperienceModeMessage {
  type: 'setExperienceMode';
  experienceMode: ReviewOpsExperienceMode;
}

export function commandForFlowId(flowId: string): string | undefined {
  switch (flowId) {
    case 'research/select-scope':
    case 'research/investigate':
    case 'review/select-target':
    case 'diff/review':
      return 'reviewops.prepareLocalDiffReview';
    case 'project/context':
      return 'reviewops.updateProjectContext';
    case 'provider/connect':
      return 'reviewops.setupGitHubToken';
    case 'provider/fetch-review':
      return 'reviewops.prepareGitHubCommentTriage';
    case 'review/comment-triage':
      return 'reviewops.prepareGitHubCommentTriage';
    case 'research/action-plan':
    case 'review/action-plan':
      return 'reviewops.buildReviewActionPlan';
    case 'review/reply-drafts':
      return 'reviewops.draftReviewReplies';
    case 'research/import-findings':
    case 'research/normalize-findings':
    case 'response/import':
    case 'response/normalize':
      return 'reviewops.importManualReviewResponse';
    case 'refactor/plan':
    case 'fix/plan':
      return 'reviewops.planReviewFix';
    case 'refactor/checklist':
    case 'fix/checklist':
      return 'reviewops.buildReviewFixChecklist';
    case 'refactor/verify':
    case 'fix/verify':
      return 'reviewops.verifyReviewFix';
    case 'refactor/explain':
    case 'fix/explain':
      return 'reviewops.explainReviewFix';
    case 'publish/summary-draft':
      return 'reviewops.previewGitHubSummaryComment';
    case 'publish/reply-draft':
      return 'reviewops.previewGitHubReplyComment';
    case 'rules/propose':
    case 'rules/reconcile':
      return 'reviewops.proposeRules';
    case 'rules/apply':
      return 'reviewops.applyRules';
    case 'rules/update':
      return 'reviewops.updateRules';
    case 'knowledge/capture-candidates':
      return 'reviewops.captureKnowledgeCandidates';
    case 'skill/evidence-capture':
      return 'reviewops.captureSkillEvidence';
    case 'field/report':
      return 'reviewops.generateFieldReport';
    case 'meta/next':
      return 'reviewops.showMetaNext';
    case 'meta/readiness':
      return 'reviewops.showP0Readiness';
    case 'meta/resume':
      return 'reviewops.resumeCurrentCycle';
    case 'meta/status':
      return 'reviewops.status';
    case 'openPreview':
      return 'reviewops.openPreview';
    default:
      return undefined;
  }
}

export function commandForCommandCenterEntry(
  entry: ReviewOpsCommandCatalogEntry,
  status: ReviewOpsMetaStatus
): string | undefined {
  const isActiveNextStep = status.currentCycle?.nextActions[0]?.flowId === entry.id;
  if (isActiveNextStep) {
    return commandForFlowId(entry.id) ?? entry.vsCodeCommand;
  }

  return entry.vsCodeCommand || commandForFlowId(entry.id);
}

export function statusBadgeClass(status: ReviewOpsWebviewRunResult['status']): string {
  switch (status) {
    case 'success':
      return 'ok';
    case 'warning':
      return 'warn';
    case 'error':
      return 'error';
    case 'running':
    case 'idle':
      return 'info';
  }
}

export function statusBadgeClassForCycleStep(status: 'pending' | 'ready' | 'completed' | 'blocked'): string {
  switch (status) {
    case 'completed':
      return 'ok';
    case 'ready':
      return 'info';
    case 'blocked':
      return 'error';
    case 'pending':
      return 'kind';
  }
}

export function formatCycleTitle(title: string): string {
  return localize(title);
}

export function formatCycleStepTitle(title: string): string {
  return localize(title);
}

export function formatCycleStatus(status: ReviewOpsCurrentCycle['status']): string {
  switch (status) {
    case 'active':
      return localize('Active');
    case 'blocked':
      return localize('Blocked');
    case 'completed':
      return localize('Completed');
  }
}

export function formatCycleStepStatus(status: 'pending' | 'ready' | 'completed' | 'blocked'): string {
  switch (status) {
    case 'completed':
      return localize('Done');
    case 'ready':
      return localize('Now');
    case 'blocked':
      return localize('Blocked');
    case 'pending':
      return localize('Later');
  }
}

export function formatNextActionTitle(action: { title: string }): string {
  if (action.title.startsWith('Continue ')) {
    return localize('Continue {0}', localize(action.title.slice('Continue '.length)));
  }

  if (action.title.startsWith('Unblock ')) {
    return localize('Unblock {0}', localize(action.title.slice('Unblock '.length)));
  }

  if (action.title.endsWith(' complete')) {
    return localize('{0} complete', localize(action.title.slice(0, -' complete'.length)));
  }

  return localize(action.title);
}

export function formatNextActionReason(reason: string): string {
  const blockedMatch = /^The (.+) is blocked at (.+)\.$/u.exec(reason);
  if (blockedMatch !== null) {
    return localize('The {0} is blocked at {1}.', localize(blockedMatch[1]), localize(blockedMatch[2]));
  }

  const activeMatch = /^(.+) is active; (.+)$/u.exec(reason);
  if (activeMatch !== null) {
    return localize('{0} is active; {1}', localize(activeMatch[1]), localize(activeMatch[2]));
  }

  const completeMatch = /^(.+) is complete; (.+)$/u.exec(reason);
  if (completeMatch !== null) {
    return localize('{0} is complete; {1}', localize(completeMatch[1]), formatNextActionReason(completeMatch[2]));
  }

  return localize(reason);
}

export function formatCycleTargetMode(mode: ReviewOpsCycleStartContext['targetMode']): string {
  switch (mode) {
    case 'current-diff':
      return localize('Current diff');
    case 'selected-files':
      return localize('Selected files');
    case 'project-wide':
      return localize('Project-wide');
    case 'manual':
      return localize('Manual target');
  }
}

export function formatRunResultStatus(status: ReviewOpsWebviewRunResult['status']): string {
  switch (status) {
    case 'idle':
      return localize('Idle');
    case 'running':
      return localize('Running');
    case 'success':
      return localize('Success');
    case 'warning':
      return localize('Needs attention');
    case 'error':
      return localize('Failed');
  }
}

export function formatCommandCenterVisibleOutput(command: ReviewOpsCommandCatalogEntry): string {
  return localize(commandCenterVisibleOutputKey(command.id));
}

export function commandCenterVisibleOutputKey(commandId: string): string {
  switch (commandId) {
    case 'cycle/research':
    case 'cycle/refactoring':
    case 'cycle/mr-review':
    case 'cycle/comment-response':
    case 'cycle/fix-review':
    case 'cycle/field-report':
      return 'Current cycle';
    case 'research/select-scope':
      return 'Research scope';
    case 'research/investigate':
      return 'Research prompt';
    case 'research/import-findings':
    case 'research/normalize-findings':
    case 'research/action-plan':
      return 'Research action plan';
    case 'review/select-target':
    case 'diff/review':
    case 'provider/fetch-review':
      return 'Review prompt';
    case 'review/comment-triage':
      return 'Reply publish draft';
    case 'fix/plan':
      return 'Fix plan';
    case 'fix/checklist':
      return 'Fix checklist';
    case 'response/import':
    case 'response/normalize':
      return 'Imported result';
    case 'review/action-plan':
      return 'Action plan';
    case 'fix/verify':
      return 'Fix verification';
    case 'fix/explain':
      return 'Fix explanation';
    case 'refactor/plan':
      return 'Refactor plan';
    case 'refactor/checklist':
      return 'Refactor checklist';
    case 'refactor/verify':
      return 'Refactor verification';
    case 'refactor/explain':
      return 'Refactor explanation';
    case 'review/reply-drafts':
      return 'Reply drafts';
    case 'meta/resume':
    case 'meta/next':
      return 'Next action';
    case 'publish/summary-draft':
    case 'publish/reply-draft':
      return 'Publish draft';
    case 'rules/propose':
    case 'rules/reconcile':
    case 'rules/apply':
    case 'rules/update':
      return 'Rules summary';
    case 'knowledge/capture-candidates':
      return 'Portable checklist';
    case 'skill/evidence-capture':
      return 'Skill evidence';
    case 'field/report':
      return 'Field report';
    case 'project/init':
      return 'Project files';
    case 'project/context':
      return 'Project context file';
    case 'provider/connect':
      return 'GitHub token setting';
    case 'meta/status':
    case 'openPreview':
      return 'Status preview';
    case 'meta/next-artifact':
      return 'Next actions';
    case 'meta/readiness':
      return 'P0 readiness';
    case 'openArtifacts':
      return 'Main files';
    default:
      return 'Result';
  }
}

export function optionalSkipLabel(commandId: string): string {
  if (isOptionalRulesCommand(commandId)) {
    return 'Skip rules';
  }

  return 'Continue to plan';
}

export function optionalDetailLabel(commandId: string): string {
  if (commandId === 'rules/propose') {
    return 'Propose rules';
  }
  if (commandId === 'rules/reconcile') {
    return 'Review rules';
  }
  if (commandId === 'rules/apply' || commandId === 'rules/update') {
    return 'Apply rules';
  }
  if (commandId.startsWith('research/')) {
    return 'Import findings';
  }

  return 'Import response';
}

export function isContextRequiredCycle(commandId: string): boolean {
  return commandId === 'cycle/research' || commandId === 'cycle/refactoring';
}

export function isConfigurableCommand(commandId: string): boolean {
  return (
    isLocalDiffPromptCommand(commandId) ||
    commandId === 'provider/fetch-review' ||
    commandId === 'review/comment-triage' ||
    commandId === 'rules/propose' ||
    commandId === 'field/report'
  );
}

export function isLocalDiffPromptCommand(commandId: string): boolean {
  return (
    commandId === 'review/select-target' ||
    commandId === 'diff/review' ||
    commandId === 'research/select-scope' ||
    commandId === 'research/investigate'
  );
}

export function isOptionalImportCommand(commandId: string): boolean {
  return (
    commandId === 'response/import' ||
    commandId === 'response/normalize' ||
    commandId === 'research/import-findings' ||
    commandId === 'research/normalize-findings'
  );
}

export function isOptionalRulesCommand(commandId: string): boolean {
  return (
    commandId === 'rules/propose' ||
    commandId === 'rules/reconcile' ||
    commandId === 'rules/apply' ||
    commandId === 'rules/update'
  );
}

export function isOptionalSkippableCommand(commandId: string): boolean {
  return isOptionalImportCommand(commandId) || isOptionalRulesCommand(commandId);
}

export function isOptionalImportFlow(flowId: string, status: ReviewOpsMetaStatus): boolean {
  return (
    status.currentCycle !== null &&
    status.nextActions[0]?.flowId === flowId &&
    isOptionalImportCommand(flowId)
  );
}

export function isOptionalRulesFlow(flowId: string, status: ReviewOpsMetaStatus): boolean {
  return status.currentCycle !== null && status.nextActions[0]?.flowId === flowId && isOptionalRulesCommand(flowId);
}

export function optionalImportFlowIdsForCurrentCycle(currentCycle: ReviewOpsCurrentCycle): string[] {
  return currentCycle.cycleId === 'cycle/research'
    ? ['research/import-findings', 'research/normalize-findings']
    : ['response/import', 'response/normalize'];
}

export function normalizeReviewOpsCycleStartContext(
  commandId: string,
  value: ReviewOpsCycleStartContext | undefined
): ReviewOpsCycleStartContext | undefined {
  const defaults = createDefaultReviewOpsCycleStartContext(commandId);
  if (defaults === undefined) {
    return undefined;
  }

  if (value === undefined) {
    return defaults;
  }

  const scopeLabel = value.scopeLabel.trim() || defaults.scopeLabel;
  const intent = value.intent.trim() || defaults.intent;
  const targetMode = isCycleTargetMode(value.targetMode) ? value.targetMode : defaults.targetMode;
  const targetFiles = value.targetFiles?.map((item) => item.trim()).filter((item) => item.length > 0);

  return {
    scopeLabel,
    intent,
    targetMode,
    ...(targetFiles === undefined || targetFiles.length === 0 ? {} : { targetFiles })
  };
}

export function validateReviewOpsCycleStartContext(
  commandId: string,
  value: ReviewOpsCycleStartContext | undefined
): 'missing-scope' | 'missing-target-files' | undefined {
  if (!isContextRequiredCycle(commandId)) {
    return undefined;
  }

  const normalized = normalizeReviewOpsCycleStartContext(commandId, value);
  if (normalized === undefined) {
    return 'missing-scope';
  }

  if (normalized.scopeLabel.trim().length === 0 || normalized.intent.trim().length === 0) {
    return 'missing-scope';
  }

  const targetFiles = normalized.targetFiles?.map((item) => item.trim()).filter((item) => item.length > 0);
  if (normalized.targetMode === 'selected-files' && (targetFiles === undefined || targetFiles.length === 0)) {
    return 'missing-target-files';
  }

  return undefined;
}

export function createDefaultReviewOpsCycleStartContext(commandId: string): ReviewOpsCycleStartContext | undefined {
  switch (commandId) {
    case 'cycle/research':
      return {
        scopeLabel: 'Current workspace',
        intent: 'Investigate the current workspace and identify concrete risks, decisions, and next actions.',
        targetMode: 'current-diff'
      };
    case 'cycle/refactoring':
      return {
        scopeLabel: 'Current workspace',
        intent: 'Plan the smallest safe refactoring path for the current workspace.',
        targetMode: 'current-diff'
      };
    default:
      return undefined;
  }
}

export function selectRecommendedCommand(
  status: ReviewOpsMetaStatus,
  commands: ReviewOpsCommandCatalogEntry[]
): ReviewOpsCommandCatalogEntry | undefined {
  if (!status.initialized) {
    return findCommand(commands, 'project/init');
  }

  if (status.currentCycle !== null) {
    const nextAction = status.nextActions[0];
    if (nextAction !== undefined) {
      return findCommandForNextAction(commands, nextAction.flowId, status) ?? findCommand(commands, 'meta/resume');
    }

    return findCommand(commands, 'meta/resume');
  }

  const nextAction = status.nextActions[0];
  if (nextAction !== undefined) {
    const nextCommand = findCommandForNextAction(commands, nextAction.flowId, status);
    if (nextCommand !== undefined) {
      return nextCommand;
    }
  }

  return findCommand(commands, 'meta/next');
}

export function findCommand(
  commands: ReviewOpsCommandCatalogEntry[],
  commandId: string
): ReviewOpsCommandCatalogEntry | undefined {
  return commands.find((command) => command.id === commandId);
}

export function resolveCommandCenterInput(
  commands: ReviewOpsCommandCatalogEntry[],
  value: string
): CommandCenterResolvedInput | undefined {
  const matches = findCommandsFromInput(commands, value);
  if (matches.length === 0) {
    return undefined;
  }

  const batchCommands = matches.filter((command) => command.batchable);
  if (batchCommands.length > 1) {
    return {
      commandIds: batchCommands.map((command) => command.id),
      batch: true
    };
  }

  return {
    commandIds: [matches[0].id],
    batch: false
  };
}

function findCommandsFromInput(commands: ReviewOpsCommandCatalogEntry[], value: string): ReviewOpsCommandCatalogEntry[] {
  const normalized = normalizeCommandInput(value);
  if (normalized.length === 0) {
    return [];
  }

  const exact = commands.find((command) => commandSearchValues(command, true).some((candidate) => candidate === normalized));
  if (exact !== undefined) {
    return [exact];
  }

  const matches = commands
    .map((command) => {
      const values = commandSearchValues(command, false).filter((candidate) => candidate.length >= 3);
      const indexes = values.map((candidate) => commandMatchIndex(candidate, normalized)).filter((index) => index >= 0);
      return indexes.length === 0 ? undefined : { command, index: Math.min(...indexes) };
    })
    .filter((match): match is { command: ReviewOpsCommandCatalogEntry; index: number } => match !== undefined)
    .sort((left, right) => left.index - right.index);
  const seen = new Set<string>();

  return matches
    .map((match) => match.command)
    .filter((command) => {
      if (seen.has(command.id)) {
        return false;
      }
      seen.add(command.id);
      return true;
    });
}

function commandSearchValues(command: ReviewOpsCommandCatalogEntry, includeShortcut: boolean): string[] {
  const values = [command.id, localize(command.label), ...command.aliases];
  if (includeShortcut && command.shortcut.length > 0) {
    values.push(command.shortcut);
  }

  return values.map(normalizeCommandInput).filter((candidate) => candidate.length > 0);
}

function normalizeCommandInput(value: string): string {
  return value.trim().toLowerCase().replace(/^[:>\s]+/u, '');
}

function commandMatchIndex(candidate: string, normalized: string): number {
  const expressionIndex = normalized.indexOf(candidate);
  return expressionIndex >= 0 ? expressionIndex : candidate.includes(normalized) ? 0 : -1;
}

export function findCommandForNextAction(
  commands: ReviewOpsCommandCatalogEntry[],
  flowId: string,
  status?: ReviewOpsMetaStatus
): ReviewOpsCommandCatalogEntry | undefined {
  if (flowId === 'provider/fetch-review' && status?.currentCycle?.cycleId === 'cycle/comment-response') {
    return findCommand(commands, 'review/comment-triage') ?? findCommand(commands, flowId);
  }

  const direct = findCommand(commands, flowId);
  if (direct !== undefined) {
    return direct;
  }

  const vsCodeCommand = commandForFlowId(flowId);
  return vsCodeCommand === undefined ? undefined : commands.find((command) => command.vsCodeCommand === vsCodeCommand);
}

export function isCommandCenterRunMessage(message: unknown): message is CommandCenterRunMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'commandId' in message &&
    message.type === 'runCommand' &&
    typeof message.commandId === 'string'
  );
}

export function isCommandCenterRunBatchMessage(message: unknown): message is CommandCenterRunBatchMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'commandIds' in message &&
    message.type === 'runCommandBatch' &&
    Array.isArray(message.commandIds) &&
    message.commandIds.length > 0 &&
    message.commandIds.every((commandId) => typeof commandId === 'string')
  );
}

export function isCommandCenterRunInputMessage(message: unknown): message is CommandCenterRunInputMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'inputValue' in message &&
    message.type === 'runCommandInput' &&
    typeof message.inputValue === 'string'
  );
}

export function isCommandCenterRunWithOptionsMessage(message: unknown): message is CommandCenterRunWithOptionsMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'commandId' in message &&
    'commandOptions' in message &&
    message.type === 'runCommandWithOptions' &&
    typeof message.commandId === 'string' &&
    isReviewOpsCommandExecutionOptions(message.commandOptions)
  );
}

export function isCommandCenterSkipOptionalStepMessage(
  message: unknown
): message is CommandCenterSkipOptionalStepMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'commandId' in message &&
    message.type === 'skipOptionalStep' &&
    typeof message.commandId === 'string' &&
    isOptionalSkippableCommand(message.commandId)
  );
}

export function isCommandCenterStartCycleWithContextMessage(
  message: unknown
): message is CommandCenterStartCycleWithContextMessage {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('type' in message) ||
    !('commandId' in message) ||
    !('startContext' in message) ||
    message.type !== 'startCycleWithContext' ||
    typeof message.commandId !== 'string' ||
    !isContextRequiredCycle(message.commandId) ||
    !isReviewOpsCycleStartContext(message.startContext)
  ) {
    return false;
  }

  return true;
}

export function isCommandCenterOpenFileMessage(message: unknown): message is CommandCenterOpenFileMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'relativePath' in message &&
    message.type === 'openFile' &&
    typeof message.relativePath === 'string'
  );
}

export function isCommandCenterSetExperienceModeMessage(
  message: unknown
): message is CommandCenterSetExperienceModeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'experienceMode' in message &&
    message.type === 'setExperienceMode' &&
    isReviewOpsExperienceMode(message.experienceMode)
  );
}

export function isReviewOpsExperienceMode(value: unknown): value is ReviewOpsExperienceMode {
  return value === 'guide' || value === 'console';
}

function isReviewOpsCycleStartContext(value: unknown): value is ReviewOpsCycleStartContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const targetFilesValid =
    candidate.targetFiles === undefined ||
    (Array.isArray(candidate.targetFiles) && candidate.targetFiles.every((item) => typeof item === 'string'));

  return (
    typeof candidate.scopeLabel === 'string' &&
    typeof candidate.intent === 'string' &&
    isCycleTargetMode(candidate.targetMode) &&
    targetFilesValid
  );
}

function isReviewOpsCommandExecutionOptions(value: unknown): value is ReviewOpsCommandExecutionOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  return (
    (candidate.localDiff === undefined || isRecord(candidate.localDiff)) &&
    (candidate.githubTarget === undefined || isRecord(candidate.githubTarget)) &&
    (candidate.ruleProposal === undefined || isRecord(candidate.ruleProposal)) &&
    (candidate.fieldReport === undefined || isRecord(candidate.fieldReport))
  );
}

function isCycleTargetMode(value: unknown): value is ReviewOpsCycleStartContext['targetMode'] {
  return value === 'current-diff' || value === 'selected-files' || value === 'project-wide' || value === 'manual';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
