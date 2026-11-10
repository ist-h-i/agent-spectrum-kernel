import * as vscode from 'vscode';
import path from 'node:path';

import {
  advanceCurrentReviewOpsCycle,
  FileSystemArtifactStore,
  buildFieldReportArtifacts,
  buildKnowledgeCaptureArtifacts,
  buildMetaNextArtifacts,
  buildP0ReadinessArtifacts,
  buildReviewFixChecklistArtifacts,
  buildReviewFixExplanationArtifacts,
  buildReviewFixPlanArtifacts,
  buildReviewFixVerificationArtifacts,
  buildReviewPromptArtifacts,
  buildReviewResolutionArtifacts,
  buildSkillEvidenceArtifacts,
  createReviewOpsCycle,
  getReviewOpsCommandCatalogEntry,
  getReviewOpsMetaStatus,
  importReviewResponseArtifacts,
  initializeReviewOpsProject,
  listReviewOpsCommandCatalog,
  loadCurrentReviewOpsCycle,
  recordReviewOpsMetricsEvent,
  createReplyPublishDrafts,
  resumeCurrentReviewOpsCycle,
  saveApprovedRuleCandidates,
  saveCurrentReviewOpsCycle,
  setupReviewOpsProjectContext,
  type FieldReport,
  type PublishDraft,
  type FlowArtifactRef,
  type ProjectContextInput,
  type ProjectInitResult,
  type P0ManualSmokeStepId,
  type ReviewActionPlanItem,
  type ReviewFindingSeed,
  type ReviewOpsCurrentCycle,
  type ReviewOpsMetricsEventInput,
  type ReviewPromptInput,
  type ReviewFixPlan,
  type ReviewFixVerification,
  type ReviewFixVerificationResult,
  type ReviewOpsCycleId,
  type ReviewOpsCycleStartContext,
  type ReviewOpsMetaStatus,
  type ReviewTargetRef,
  type ReviewReply,
  type RuleCandidateSeed,
  type RuleCandidate
} from '@reviewops/core';
import {
  createGitHubReviewProvider,
  createLocalGitReviewProvider,
  createReviewPromptInputFromGitHubPullRequest,
  createReviewPromptInputFromLocalGitDiff,
  createSummaryCommentDraft
} from '@reviewops/providers';
import {
  listReviewOpsArtifactQuickPickItems,
  type ReviewOpsArtifactQuickPickItem
} from './artifact-browser.js';
import {
  loadLatestImportedActionPlanSeed,
  loadLatestKnowledgeCandidateSeeds,
  loadLatestReviewActionPlan,
  loadLatestReviewFindingSeeds,
  loadLatestReviewFixPlan,
  loadLatestReviewFixVerification,
  loadLatestRuleApplication,
  loadLatestRuleCandidates
} from './artifact-loader.js';
import {
  commandForCommandCenterEntry,
  commandForFlowId,
  formatCycleStatus,
  formatCycleTitle,
  formatNextActionReason,
  formatNextActionTitle,
  isCommandCenterOpenFileMessage,
  isCommandCenterRunBatchMessage,
  isCommandCenterRunInputMessage,
  isCommandCenterRunMessage,
  isCommandCenterRunWithOptionsMessage,
  isCommandCenterSetExperienceModeMessage,
  isCommandCenterSkipOptionalStepMessage,
  isCommandCenterStartCycleWithContextMessage,
  isReviewOpsExperienceMode,
  isOptionalImportFlow,
  isOptionalRulesFlow,
  normalizeReviewOpsCycleStartContext,
  optionalImportFlowIdsForCurrentCycle,
  resolveCommandCenterInput,
  validateReviewOpsCycleStartContext,
  type ReviewOpsCommandExecutionOptions,
  type ReviewOpsExperienceMode,
  type ReviewOpsWebviewRunResult
} from './command-center.js';
import {
  renderPublishDraftPreviewHtml,
  renderStatusPreview,
  type PublishDraftArtifactPaths
} from './webview-renderers.js';
import { writePublishDraftArtifacts } from './publish-draft-artifacts.js';
import {
  createCommandCenterRunResult,
  createCommandCenterRunningResult,
  isCommandCenterOpenableFile,
  type ReviewOpsWebviewRunCapture
} from './command-center-results.js';
import {
  buildScopedCyclePromptArtifacts,
  createCycleStartContextFocus,
  renderCycleStartContextNotes
} from './scoped-cycle-prompt.js';
import {
  writeReviewActionPlanArtifacts,
  writeReviewReplyDraftArtifacts,
  writeRuleApplicationArtifacts,
  writeRuleUpdateArtifacts
} from './review-work-artifacts.js';
import { ReviewOpsArtifactTreeDataProvider, ReviewOpsStatusTreeDataProvider } from './tree-views.js';
import { renderCommandCenterHtml } from './command-center-renderer.js';
import { createRunId } from './run-id.js';
import {
  isReviewTargetRef,
  rememberCurrentCycleTarget,
  resolveCurrentCycleTargetOrLocalWorkspace,
  resolveGitHubPullRequestTarget,
  resolveLocalGitReviewTarget,
  resolvePublishPreviewTarget
} from './review-targets.js';
export {
  formatRunIdForTreeDescription,
  listReviewOpsArtifactQuickPickItems,
  listReviewOpsArtifactViewItems,
  type ReviewOpsArtifactQuickPickItem,
  type ReviewOpsArtifactSurfaceFilter,
  type ReviewOpsArtifactViewId,
  type ReviewOpsArtifactViewItem
} from './artifact-browser.js';
export {
  loadLatestImportedActionPlanSeed,
  loadLatestReviewOpsArtifact,
  loadLatestRuleApplication,
  loadLatestRuleCandidates,
  type RuleApplicationPayload
} from './artifact-loader.js';
export {
  commandForFlowId,
  resolveCommandCenterInput,
  type ReviewOpsCommandExecutionOptions,
  type ReviewOpsWebviewRunResult
} from './command-center.js';
export { formatActionPlanNextActionTitle } from './review-work-artifacts.js';
export { writePublishDraftArtifacts } from './publish-draft-artifacts.js';
export { type ReviewOpsWebviewRunCapture } from './command-center-results.js';
export { renderCommandCenterHtml, type RenderCommandCenterHtmlOptions } from './command-center-renderer.js';
export { renderPublishDraftPreviewHtml, type PublishDraftArtifactPaths } from './webview-renderers.js';
export { createStatusTreeNodes, type ReviewOpsTreeNode } from './tree-views.js';
import { localize } from './localization.js';

const githubTokenSecretKey = 'reviewops.github.token';
const reviewOpsExperienceModeKey = 'reviewops.experienceMode';
let activeWebviewRunCapture: ReviewOpsWebviewRunCapture | undefined;
let activeCommandCenterPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const statusTree = new ReviewOpsStatusTreeDataProvider(getWorkspaceRoot);
  const reviewWorkTree = new ReviewOpsArtifactTreeDataProvider(getWorkspaceRoot, 'review-work');
  const knowledgeTree = new ReviewOpsArtifactTreeDataProvider(getWorkspaceRoot, 'knowledge');
  const skillEvidenceTree = new ReviewOpsArtifactTreeDataProvider(getWorkspaceRoot, 'skill-evidence');
  const reportsTree = new ReviewOpsArtifactTreeDataProvider(getWorkspaceRoot, 'reports');
  const statusView = vscode.window.createTreeView('reviewops.statusView', {
    treeDataProvider: statusTree
  });
  const reviewWorkView = vscode.window.createTreeView('reviewops.reviewWorkView', {
    treeDataProvider: reviewWorkTree
  });
  const knowledgeView = vscode.window.createTreeView('reviewops.knowledgeView', {
    treeDataProvider: knowledgeTree
  });
  const skillEvidenceView = vscode.window.createTreeView('reviewops.skillEvidenceView', {
    treeDataProvider: skillEvidenceTree
  });
  const reportsView = vscode.window.createTreeView('reviewops.reportsView', {
    treeDataProvider: reportsTree
  });
  const refreshAllViews = () => {
    statusTree.refresh();
    reviewWorkTree.refresh();
    knowledgeTree.refresh();
    skillEvidenceTree.refresh();
    reportsTree.refresh();
  };
  const applyApprovedRulesCommand = async () => {
    await runCommand(async () => {
      const status = await readWorkspaceStatus();
      if (status === undefined) {
        return;
      }

      if (!status.initialized) {
        await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before applying rules.'));
        return;
      }

      const candidates = await loadLatestRuleCandidates(status.workspaceRoot);
      if (candidates === undefined || candidates.length === 0) {
        await vscode.window.showWarningMessage(localize('Propose ReviewOps rules before applying approved rules.'));
        return;
      }

      const previousApplication = await loadLatestRuleApplication(status.workspaceRoot);
      const appliedCandidateIds = new Set(previousApplication?.saved.map((item) => item.candidateId) ?? []);
      const approvedCandidates = await promptApprovedRuleCandidates(candidates, appliedCandidateIds);
      if (approvedCandidates === undefined) {
        return;
      }

      const now = new Date();
      const runId = createRunId(now);
      const result = await saveApprovedRuleCandidates({
        workspaceRoot: status.workspaceRoot,
        candidates,
        approvedCandidateIds: approvedCandidates.map((candidate) => candidate.id),
        now: () => now
      });
      const artifacts = await writeRuleApplicationArtifacts(status.workspaceRoot, runId, result, approvedCandidates, now);

      await markCycleStepsCompleted(status.workspaceRoot, ['rules/apply', 'rules/update'], [
        artifacts.ruleApplicationJson,
        artifacts.ruleUpdateMarkdown,
        artifacts.ruleUpdateJson
      ]);
      await recordMetricsSafe(status.workspaceRoot, {
        kind: 'rules-apply',
        createdAt: now.toISOString(),
        flowId: 'rules/apply',
        runId,
        counts: {
          ruleCandidates: result.saved.length
        },
        artifactPaths: [artifacts.ruleApplicationJson.path, artifacts.ruleUpdateMarkdown.path, artifacts.ruleUpdateJson.path]
      });
      refreshAllViews();
      await openWorkspaceFile(status.workspaceRoot, artifacts.ruleUpdateMarkdown.path);
      await vscode.window.showInformationMessage(
        result.saved.length === 0
          ? localize('ReviewOps applied no rules and recorded {0} skipped candidate.', result.skipped.length)
          : localize('ReviewOps saved {0} approved rule candidate and skipped {1}.', result.saved.length, result.skipped.length)
      );
    });
  };
  const updateRulesCommand = async () => {
    await runCommand(async () => {
      const status = await readWorkspaceStatus();
      if (status === undefined) {
        return;
      }

      if (!status.initialized) {
        await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before updating rule artifacts.'));
        return;
      }

      const application = await loadLatestRuleApplication(status.workspaceRoot);
      if (application === undefined) {
        await vscode.window.showWarningMessage(localize('Apply approved rules before updating rule artifacts.'));
        return;
      }

      const now = new Date();
      const artifacts = await writeRuleUpdateArtifacts(status.workspaceRoot, createRunId(now), application, now);

      await markCycleStepsCompleted(status.workspaceRoot, ['rules/update'], [artifacts.ruleUpdateMarkdown, artifacts.ruleUpdateJson]);
      refreshAllViews();
      await openWorkspaceFile(status.workspaceRoot, artifacts.ruleUpdateMarkdown.path);
      await vscode.window.showInformationMessage(
        localize('ReviewOps updated rule artifacts for {0} saved rule and {1} skipped candidate.', application.saved.length, application.skipped.length)
      );
    });
  };

  const disposables = [
    statusTree,
    reviewWorkTree,
    knowledgeTree,
    skillEvidenceTree,
    reportsTree,
    statusView,
    reviewWorkView,
    knowledgeView,
    skillEvidenceView,
    reportsView,
    vscode.commands.registerCommand('reviewops.initializeProject', async () => {
      await runCommand(async () => {
        const workspaceRoot = await requireWorkspaceRoot();
        if (workspaceRoot === undefined) {
          return;
        }

        const result = await initializeReviewOpsProject({ workspaceRoot });
        refreshAllViews();
        await vscode.window.showInformationMessage(formatProjectInitMessage(result));
      });
    }),
    vscode.commands.registerCommand('reviewops.updateProjectContext', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before setting project context.'));
          return;
        }

        const result = await setupReviewOpsProjectContext({
          workspaceRoot: status.workspaceRoot,
          input: createDefaultProjectContextInput(status.workspaceRoot)
        });

        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.contextPath);
        await vscode.window.showInformationMessage(localize('ReviewOps wrote default local project context. Edit the opened file only if needed.'));
      });
    }),
    vscode.commands.registerCommand('reviewops.openPreview', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        openStatusPreview(status);
      });
    }),
    vscode.commands.registerCommand('reviewops.openArtifacts', async () => {
      await runCommand(async () => {
        const workspaceRoot = await requireWorkspaceRoot();
        if (workspaceRoot === undefined) {
          return;
        }

        const artifacts = await listReviewOpsArtifactQuickPickItems(workspaceRoot);
        if (artifacts.length === 0) {
          await vscode.window.showInformationMessage(localize('ReviewOps found no files to open yet. Run the next action first.'));
          return;
        }

        const showAllArtifactsItem: ReviewOpsArtifactQuickPickItem = {
          label: localize('Advanced: show supporting files'),
          description: localize('JSON, metadata, and older runs.'),
          artifactPath: '',
          viewId: 'review-work',
          showAll: true
        };
        const selected = await vscode.window.showQuickPick([...artifacts, showAllArtifactsItem], {
          placeHolder: localize('Select the file to open.')
        });
        if (selected === undefined) {
          return;
        }

        if (selected.showAll) {
          const allArtifacts = await listReviewOpsArtifactQuickPickItems(workspaceRoot, { surface: 'all' });
          const selectedAll = await vscode.window.showQuickPick(allArtifacts, {
            placeHolder: localize('Select the file to open.')
          });
          if (selectedAll === undefined) {
            return;
          }

          await openWorkspaceFile(workspaceRoot, selectedAll.artifactPath);
          return;
        }

        await openWorkspaceFile(workspaceRoot, selected.artifactPath);
      });
    }),
    vscode.commands.registerCommand('reviewops.commandCenter', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        openCommandCenter(status, refreshAllViews, context);
      });
    }),
    vscode.commands.registerCommand('reviewops.nextAction', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        const [nextAction] = status.nextActions;
        if (nextAction === undefined) {
          await vscode.window.showInformationMessage(localize('ReviewOps has no next action for this workspace.'));
          return;
        }

        if (nextAction.flowId === 'project/init') {
          const initializeLabel = localize('Initialize');
          const selection = await vscode.window.showInformationMessage(formatNextActionReason(nextAction.reason), initializeLabel);
          if (selection === initializeLabel) {
            await vscode.commands.executeCommand('reviewops.initializeProject');
          }
          return;
        }

        await continueNextAction(nextAction.flowId, status, refreshAllViews);
      });
    }),
    vscode.commands.registerCommand('reviewops.resumeCurrentCycle', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before resuming a cycle.'));
          return;
        }

        const resumed = await resumeCurrentReviewOpsCycle({ workspaceRoot: status.workspaceRoot });
        refreshAllViews();

        if (resumed.currentCycle === null) {
          await vscode.window.showInformationMessage(localize('ReviewOps has no current cycle to resume. Use Next Action to start one.'));
          return;
        }

        const nextStatus: ReviewOpsMetaStatus = {
          ...status,
          currentCycle: resumed.currentCycle,
          nextActions: resumed.nextActions
        };
        const [nextAction] = resumed.nextActions;
        if (nextAction === undefined) {
          await vscode.window.showInformationMessage(localize('{0} is ready.', formatCycleTitle(resumed.currentCycle.title)));
          return;
        }

        await continueNextAction(nextAction.flowId, nextStatus, refreshAllViews);
      });
    }),
    vscode.commands.registerCommand('reviewops.setupGitHubToken', async () => {
      await runCommand(async () => {
        const token = await vscode.window.showInputBox({
          prompt: localize('Paste a GitHub token for ReviewOps provider calls. It will be stored in VS Code SecretStorage.'),
          password: true,
          ignoreFocusOut: true
        });

        if (token === undefined) {
          return;
        }

        if (token.trim().length === 0) {
          await context.secrets.delete(githubTokenSecretKey);
          await vscode.window.showInformationMessage(localize('ReviewOps removed the GitHub token from VS Code SecretStorage.'));
          return;
        }

        await context.secrets.store(githubTokenSecretKey, token.trim());
        await vscode.window.showInformationMessage(localize('ReviewOps stored the GitHub token in VS Code SecretStorage.'));
      });
    }),
    vscode.commands.registerCommand('reviewops.prepareGitHubPullRequestReview', async (options?: ReviewOpsCommandExecutionOptions) => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before preparing a GitHub pull request review.'));
          return;
        }

        const token = await readGitHubTokenOrPromptSetup(context);
        if (token === undefined) {
          return;
        }

        const target = await resolveGitHubPullRequestTarget(status, options?.githubTarget);
        if (target === undefined) {
          return;
        }
        await rememberCurrentCycleTarget(status.workspaceRoot, target);

        const provider = createGitHubReviewProvider({
          repository: target.repository,
          token
        });
        const [reviewTarget, diff, comments] = await Promise.all([
          provider.getReviewTarget(target),
          provider.getDiff(target),
          provider.getComments(target)
        ]);

        if (diff.summary.changedFiles === 0) {
          await vscode.window.showInformationMessage(localize('ReviewOps found no changed files for this GitHub pull request.'));
          return;
        }

        const now = new Date();
        const promptInput = createReviewPromptInputFromGitHubPullRequest(diff, comments);
        const result = await buildReviewPromptArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId: createRunId(now),
          input: {
            ...promptInput,
            notes: [promptInput.notes, '', `Pull request title: ${reviewTarget.title}`].join('\n')
          },
          now: () => now
        });

        await markCycleStepsCompleted(status.workspaceRoot, ['review/select-target', 'provider/fetch-review', 'diff/review'], [
          result.artifacts.prompt,
          result.artifacts.inputSummary,
          result.artifacts.metadata
        ]);
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.prompt.path);
        await vscode.window.showInformationMessage(
          formatPromptReadyMessage(
            localize(
              'ReviewOps prepared a GitHub pull request review prompt for {0} changed files and {1} comments.',
              diff.summary.changedFiles,
              comments.length
            )
          )
        );
      });
    }),

    vscode.commands.registerCommand('reviewops.prepareGitHubCommentTriage', async (options?: ReviewOpsCommandExecutionOptions) => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before preparing GitHub comment triage.'));
          return;
        }

        const canUseProviderWithoutPrompt =
          options?.githubTarget !== undefined || status.currentCycle?.target !== undefined;
        const token = canUseProviderWithoutPrompt ? await readGitHubTokenOrPromptSetup(context) : undefined;
        if (token === undefined) {
          if (status.currentCycle?.cycleId === 'cycle/comment-response') {
            await prepareLocalCommentResponseFallback(status);
            refreshAllViews();
          }
          return;
        }

        const target = await resolveGitHubPullRequestTarget(status, options?.githubTarget);
        if (target === undefined) {
          return;
        }
        await rememberCurrentCycleTarget(status.workspaceRoot, target);

        const provider = createGitHubReviewProvider({
          repository: target.repository,
          token
        });
        const comments = await provider.getComments(target);
        const now = new Date();
        const runId = createRunId(now);
        const result = await buildReviewResolutionArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId,
          target,
          comments,
          now: () => now
        });

        await markCycleStepsCompleted(
          status.workspaceRoot,
          ['provider/fetch-review', 'review/comment-triage', 'review/action-plan'],
          [
            result.artifacts.commentTriage,
            result.artifacts.understandingMemoJson,
            result.artifacts.understandingMemoMarkdown,
            result.artifacts.actionPlan,
            result.artifacts.replyDrafts,
            result.artifacts.publishDraft,
            result.artifacts.nextActions
          ]
        );
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'comment-triage',
          createdAt: now.toISOString(),
          flowId: 'review/comment-triage',
          runId,
          counts: {
            triageComments: result.triage.totalComments,
            fixPlanItems: result.actionPlan.length,
            replyDrafts: result.replyDrafts.length
          },
          artifactPaths: [
            result.artifacts.commentTriage.path,
            result.artifacts.understandingMemoJson.path,
            result.artifacts.understandingMemoMarkdown.path,
            result.artifacts.actionPlan.path,
            result.artifacts.replyDrafts.path,
            result.artifacts.publishDraft.path,
            result.artifacts.nextActions.path
          ]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.understandingMemoMarkdown.path);
        await vscode.window.showInformationMessage(
          localize('ReviewOps prepared comment triage for {0} comments, {1} action items, and {2} reply drafts.', comments.length, result.actionPlan.length, result.replyDrafts.length)
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.prepareLocalDiffReview', async (options?: ReviewOpsCommandExecutionOptions) => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before preparing a local diff review.'));
          return;
        }

        const provider = createLocalGitReviewProvider({ workspaceRoot: status.workspaceRoot });
        const cycleStartContext = status.currentCycle?.startContext;
        let target: ReviewTargetRef | undefined;
        try {
          target = await resolveLocalGitReviewTarget(status.workspaceRoot, provider, options?.localDiff);
        } catch (error) {
          if (cycleStartContext === undefined) {
            throw error;
          }

          await prepareScopedCyclePrompt(status, cycleStartContext);
          refreshAllViews();
          await vscode.window.showInformationMessage(formatScopedPromptReadyMessage(status));
          return;
        }
        if (target === undefined) {
          if (cycleStartContext !== undefined) {
            await prepareScopedCyclePrompt(status, cycleStartContext);
            refreshAllViews();
            await vscode.window.showInformationMessage(formatScopedPromptReadyMessage(status));
            return;
          }
          await vscode.window.showWarningMessage(localize('ReviewOps could not find a local git review target.'));
          return;
        }

        const diff = await provider.getDiff(target);
        if (diff.summary.changedFiles === 0) {
          if (cycleStartContext !== undefined) {
            await prepareScopedCyclePrompt(status, cycleStartContext);
            refreshAllViews();
            await vscode.window.showInformationMessage(formatScopedPromptReadyMessage(status));
            return;
          }
          await vscode.window.showInformationMessage(localize('ReviewOps found no local git diff against HEAD.'));
          return;
        }

        const now = new Date();
        const flowIds = promptFlowIdsForCurrentCycle(status.currentCycle);
        const result = await buildReviewPromptArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId: createRunId(now),
          input: withCycleStartContext(createReviewPromptInputFromLocalGitDiff(diff), cycleStartContext),
          flowId: flowIds.at(-1),
          now: () => now
        });

        await markCycleStepsCompleted(
          status.workspaceRoot,
          flowIds,
          attachArtifactsToCompletedFlows([result.artifacts.prompt, result.artifacts.inputSummary, result.artifacts.metadata], flowIds)
        );
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.prompt.path);
        await vscode.window.showInformationMessage(
          formatPromptReadyMessage(localize('ReviewOps prepared a local diff review prompt for {0} changed files.', diff.summary.changedFiles))
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.importManualReviewResponse', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before importing a review response.'));
          return;
        }

        const rawResponse = await vscode.window.showInputBox({
          prompt: localize('Paste the manual review response to import and normalize.'),
          ignoreFocusOut: true
        });
        if (rawResponse === undefined || rawResponse.trim().length === 0) {
          return;
        }

        const now = new Date();
        const runId = createRunId(now);
        const flowIds = responseFlowIdsForCurrentCycle(status.currentCycle);
        const result = await importReviewResponseArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId,
          rawResponse: rawResponse.trim(),
          flowId: responseImportFlowIdForCurrentCycle(status.currentCycle),
          now: () => now
        });

        await markCycleStepsCompleted(
          status.workspaceRoot,
          flowIds,
          attachArtifactsToCompletedFlows(
            [
              result.artifacts.rawResponse,
              result.artifacts.resultMarkdown,
              result.artifacts.resultJson,
              result.artifacts.reviewFindings,
              result.artifacts.actionPlan,
              result.artifacts.replyDrafts,
              result.artifacts.knowledgeCandidates,
              result.artifacts.ruleCandidates
            ],
            flowIds
          )
        );
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'response-import',
          createdAt: now.toISOString(),
          flowId: responseImportFlowIdForCurrentCycle(status.currentCycle),
          runId,
          counts: {
            fixPlanItems: result.normalizeResult.actionPlan.length,
            replyDrafts: result.normalizeResult.replyDrafts.length,
            ruleCandidates: result.normalizeResult.ruleCandidates.length,
            knowledgeCandidates: result.normalizeResult.knowledgeCandidates.length
          },
          artifactPaths: [
            result.artifacts.resultMarkdown.path,
            result.artifacts.resultJson.path,
            result.artifacts.reviewFindings.path,
            result.artifacts.actionPlan.path,
            result.artifacts.replyDrafts.path,
            result.artifacts.knowledgeCandidates.path,
            result.artifacts.ruleCandidates.path
          ]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.resultMarkdown.path);
        await vscode.window.showInformationMessage(
          localize('ReviewOps imported {0} findings and {1} action items.', result.normalizeResult.reviewFindings.length, result.normalizeResult.actionPlan.length)
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.buildReviewActionPlan', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before building a review action plan.'));
          return;
        }

        const actionPlanFlowId = actionPlanFlowIdForCurrentCycle(status.currentCycle);
        const importedActionPlan = await loadLatestImportedActionPlanSeed(
          status.workspaceRoot,
          responseImportFlowIdForCurrentCycle(status.currentCycle)
        );
        const actionPlan =
          importedActionPlan !== undefined && importedActionPlan.length > 0
            ? importedActionPlan
            : createReviewActionPlanFromCurrentCycle(status.currentCycle);
        if (actionPlan === undefined) {
          return;
        }

        const now = new Date();
        const runId = createRunId(now);
        const artifacts = await writeReviewActionPlanArtifacts(status.workspaceRoot, runId, actionPlan, now, {
          flowId: actionPlanFlowId,
          title: actionPlanTitleForCurrentCycle(status.currentCycle),
          nextFlowId: actionPlanNextFlowIdForCurrentCycle(status.currentCycle)
        });

        await markCycleStepsCompleted(status.workspaceRoot, [actionPlanFlowId], [
          artifacts.actionPlanJson,
          artifacts.actionPlanMarkdown,
          artifacts.understandingMemoJson,
          artifacts.understandingMemoMarkdown,
          artifacts.nextActions
        ]);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'action-plan',
          createdAt: now.toISOString(),
          flowId: actionPlanFlowId,
          runId,
          counts: {
            fixPlanItems: actionPlan.length
          },
          artifactPaths: [
            artifacts.actionPlanJson.path,
            artifacts.actionPlanMarkdown.path,
            artifacts.understandingMemoJson.path,
            artifacts.understandingMemoMarkdown.path,
            artifacts.nextActions.path
          ]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, artifacts.actionPlanMarkdown.path);
        await vscode.window.showInformationMessage(
          importedActionPlan !== undefined && importedActionPlan.length > 0
            ? localize('ReviewOps wrote {0} imported review action-plan items.', actionPlan.length)
            : localize('ReviewOps wrote a default review action plan.')
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.planReviewFix', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before planning a review fix.'));
          return;
        }

        const flowId = workPlanFlowIdForCurrentCycle(status.currentCycle);
        const itemNoun = formatWorkItemNoun(status.currentCycle);
        const actionPlan =
          (await loadLatestReviewActionPlan(status.workspaceRoot)) ??
          createReviewActionPlanFromCurrentCycle(status.currentCycle);
        if (actionPlan === undefined) {
          return;
        }
        if (actionPlan.length === 0) {
          await vscode.window.showWarningMessage(localize('ReviewOps could not find any action-plan items to turn into {0} items.', itemNoun));
          return;
        }

        const now = new Date();
        const runId = createRunId(now);
        const result = await buildReviewFixPlanArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId,
          actionPlan,
          flowId,
          now: () => now
        });

        await markCycleStepsCompleted(status.workspaceRoot, [flowId], [
          result.artifacts.fixPlanJson,
          result.artifacts.fixPlanMarkdown,
          result.artifacts.nextActions
        ]);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'fix-plan',
          createdAt: now.toISOString(),
          flowId,
          runId,
          counts: {
            fixPlanItems: result.fixPlan.summary.totalItems
          },
          artifactPaths: [result.artifacts.fixPlanJson.path, result.artifacts.fixPlanMarkdown.path, result.artifacts.nextActions.path]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.fixPlanMarkdown.path);
        await vscode.window.showInformationMessage(localize('ReviewOps planned {0} {1} items.', result.fixPlan.summary.totalItems, itemNoun));
      });
    }),
    vscode.commands.registerCommand('reviewops.buildReviewFixChecklist', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before building a review fix checklist.'));
          return;
        }

        const flowId = workChecklistFlowIdForCurrentCycle(status.currentCycle);
        const planFlowId = workPlanFlowIdForCurrentCycle(status.currentCycle);
        const itemNoun = formatWorkItemNoun(status.currentCycle);
        const fixPlan = await loadLatestReviewFixPlan(status.workspaceRoot, planFlowId);
        if (fixPlan === undefined) {
          await vscode.window.showWarningMessage(localize('Build a ReviewOps {0} plan before building a checklist.', itemNoun));
          return;
        }
        if (fixPlan.items.length === 0) {
          await vscode.window.showWarningMessage(localize('ReviewOps could not find any {0} plan items for the checklist.', itemNoun));
          return;
        }

        const now = new Date();
        const artifactStore = new FileSystemArtifactStore(status.workspaceRoot);
        const checklistResult = await buildReviewFixChecklistArtifacts({
          artifactStore,
          runId: createRunId(now),
          fixPlan,
          flowId,
          now: () => now
        });

        await markCycleStepsCompleted(status.workspaceRoot, [flowId], [
          checklistResult.artifacts.checklistJson,
          checklistResult.artifacts.checklistMarkdown,
          checklistResult.artifacts.testScenariosJson,
          checklistResult.artifacts.testScenariosMarkdown,
          checklistResult.artifacts.nextActions
        ]);
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, checklistResult.artifacts.checklistMarkdown.path);
        await vscode.window.showInformationMessage(
          localize('ReviewOps built {0} manual {1} checklist items.', checklistResult.checklist.summary.totalItems, itemNoun)
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.verifyReviewFix', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before verifying a review fix.'));
          return;
        }

        const flowId = workVerifyFlowIdForCurrentCycle(status.currentCycle);
        const planFlowId = workPlanFlowIdForCurrentCycle(status.currentCycle);
        const itemNoun = formatWorkItemNoun(status.currentCycle);
        const verificationInput = await resolveReviewFixVerificationInput(status.workspaceRoot, planFlowId, itemNoun);
        if (verificationInput === undefined) {
          return;
        }

        const now = new Date();
        const runId = createRunId(now);
        const result = await buildReviewFixVerificationArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId,
          fixPlan: verificationInput.fixPlan,
          results: verificationInput.results,
          flowId,
          now: () => now
        });

        const verificationArtifacts = [
          result.artifacts.verificationJson,
          result.artifacts.verificationMarkdown,
          result.artifacts.nextActions
        ];
        const allResolved = verificationInput.results.every((verificationResult) => verificationResult.status === 'resolved');
        if (allResolved) {
          await markCycleStepsCompleted(status.workspaceRoot, [flowId], verificationArtifacts);
        } else {
          await markCycleStepBlocked(
            status.workspaceRoot,
            flowId,
            verificationArtifacts,
            localize('ReviewOps recorded unresolved verification results; resolve the remaining verification risk before continuing.')
          );
        }
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'fix-verification',
          createdAt: now.toISOString(),
          flowId,
          runId,
          counts: {
            unresolvedRisks:
              result.verification.summary.unresolvedCount +
              result.verification.summary.newRiskCount +
              result.verification.summary.followUpIssueCount,
            addedTests: countVerificationTestSignals(result.verification)
          },
          artifactPaths: [
            result.artifacts.verificationJson.path,
            result.artifacts.verificationMarkdown.path,
            result.artifacts.nextActions.path
          ]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.verificationMarkdown.path);
        await vscode.window.showInformationMessage(
          allResolved
            ? localize('ReviewOps recorded {0} resolved {1} verification results.', result.verification.summary.resolvedCount, itemNoun)
            : localize('ReviewOps kept fix verification blocked with unresolved results.')
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.explainReviewFix', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before explaining a review fix.'));
          return;
        }

        const flowId = workExplainFlowIdForCurrentCycle(status.currentCycle);
        const verifyFlowId = workVerifyFlowIdForCurrentCycle(status.currentCycle);
        const planFlowId = workPlanFlowIdForCurrentCycle(status.currentCycle);
        const itemNoun = formatWorkItemNoun(status.currentCycle);
        const fixPlan = await loadLatestReviewFixPlan(status.workspaceRoot, planFlowId);
        if (fixPlan === undefined) {
          await vscode.window.showWarningMessage(localize('Build a ReviewOps {0} plan before explaining results.', itemNoun));
          return;
        }
        const verification = await loadLatestReviewFixVerification(status.workspaceRoot, verifyFlowId);
        if (verification === undefined) {
          await vscode.window.showWarningMessage(localize('Record ReviewOps {0} verification before explaining results.', itemNoun));
          return;
        }

        const now = new Date();
        const artifactStore = new FileSystemArtifactStore(status.workspaceRoot);
        const explanationResult = await buildReviewFixExplanationArtifacts({
          artifactStore,
          runId: createRunId(now),
          fixPlan,
          verification,
          flowId,
          now: () => now
        });

        const explanationArtifacts = [
          explanationResult.artifacts.explanationJson,
          explanationResult.artifacts.explanationMarkdown,
          explanationResult.artifacts.nextActions
        ];
        const allResolved = verification.results.every((verificationResult) => verificationResult.status === 'resolved');
        if (allResolved) {
          await markCycleStepsCompleted(status.workspaceRoot, [flowId], explanationArtifacts);
        } else {
          await markCycleStepBlocked(
            status.workspaceRoot,
            verifyFlowId,
            explanationArtifacts,
            localize('ReviewOps recorded unresolved verification results; resolve the remaining verification risk before explaining fixes.')
          );
        }
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, explanationResult.artifacts.explanationMarkdown.path);
        await vscode.window.showInformationMessage(
          allResolved
            ? localize('ReviewOps wrote an explanation for {0} verified {1} item.', explanationResult.explanation.summary.verifiedItems, itemNoun)
            : localize('ReviewOps kept explanation blocked with unresolved verification results.')
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.draftReviewReplies', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before drafting review replies.'));
          return;
        }

        const reply = await createDefaultReviewReply(status.workspaceRoot, status.currentCycle);

        const now = new Date();
        const runId = createRunId(now);
        const artifacts = await writeReviewReplyDraftArtifacts(status.workspaceRoot, runId, [reply], now);

        await markCycleStepsCompleted(status.workspaceRoot, ['review/reply-drafts'], [
          artifacts.replyDraftsJson,
          artifacts.replyDraftsMarkdown,
          artifacts.nextActions
        ]);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'reply-draft',
          createdAt: now.toISOString(),
          flowId: 'review/reply-drafts',
          runId,
          counts: {
            replyDrafts: 1
          },
          artifactPaths: [artifacts.replyDraftsJson.path, artifacts.replyDraftsMarkdown.path, artifacts.nextActions.path]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, artifacts.replyDraftsMarkdown.path);
        await vscode.window.showInformationMessage(localize('ReviewOps wrote local reply drafts for preview before publishing.'));
      });
    }),
    vscode.commands.registerCommand('reviewops.showMetaNext', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before showing next actions.'));
          return;
        }

        const shouldCompleteMetaNext = status.currentCycle?.nextActions[0]?.flowId === 'meta/next';
        if (shouldCompleteMetaNext) {
          await markCycleStepsCompleted(status.workspaceRoot, ['meta/next']);
        }

        const refreshedStatus = await getReviewOpsMetaStatus({ workspaceRoot: status.workspaceRoot });
        const now = new Date();
        const result = await buildMetaNextArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          workspaceRoot: status.workspaceRoot,
          runId: createRunId(now),
          initialized: refreshedStatus.initialized,
          now: () => now
        });

        if (shouldCompleteMetaNext) {
          await markCycleStepsCompleted(status.workspaceRoot, ['meta/next'], [
            result.artifacts.nextActions,
            result.artifacts.currentCycle
          ]);
        }

        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.nextActions.path);
        await vscode.window.showInformationMessage(localize('ReviewOps wrote {0} next action entries.', result.metaNext.nextActions.length));
      });
    }),
    vscode.commands.registerCommand('reviewops.showP0Readiness', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before writing P0 readiness artifacts.'));
          return;
        }

        const manualSmokeStepIds: P0ManualSmokeStepId[] = [];

        const now = new Date();
        const result = await buildP0ReadinessArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          workspaceRoot: status.workspaceRoot,
          runId: createRunId(now),
          availableProviders: ['local-git', 'github'],
          manualSmokeStepIds,
          now: () => now
        });

        await markCycleStepsCompleted(status.workspaceRoot, ['meta/readiness'], [
          result.artifacts.markdown,
          result.artifacts.json
        ]);
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.markdown.path);
        await vscode.window.showInformationMessage(
          localize('ReviewOps P0 readiness is {0}: {1}/{2} checks ready.', result.report.status, result.report.summary.ready, result.report.summary.total)
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.previewGitHubSummaryComment', async (options?: ReviewOpsCommandExecutionOptions) => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before previewing a GitHub summary comment.'));
          return;
        }

        const target = resolvePublishPreviewTarget(status, options?.githubTarget);
        const body = await createDefaultSummaryCommentBody(status.workspaceRoot, status.currentCycle);

        const now = new Date();
        const runId = createRunId(now);
        const draft = createSummaryPublishDraft(target, body, now);
        const artifacts = await writePublishDraftArtifacts(status.workspaceRoot, runId, draft);

        await markCycleStepsCompleted(status.workspaceRoot, ['publish/summary-draft']);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'publish-preview',
          createdAt: now.toISOString(),
          flowId: 'publish/summary-draft',
          runId,
          counts: {
            previewPosts: 1
          },
          artifactPaths: [artifacts.markdownPath, artifacts.jsonPath]
        });
        refreshAllViews();
        openPublishDraftPreview(status.workspaceRoot, draft, artifacts);
        await vscode.window.showInformationMessage(localize('ReviewOps wrote a local summary preview draft. No provider post was attempted.'));
      });
    }),

    vscode.commands.registerCommand('reviewops.previewGitHubReplyComment', async (options?: ReviewOpsCommandExecutionOptions) => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before previewing a GitHub reply comment.'));
          return;
        }

        const target = resolvePublishPreviewTarget(status, options?.githubTarget);
        const reply = await createDefaultReviewReply(status.workspaceRoot, status.currentCycle);

        const now = new Date();
        const runId = createRunId(now);
        const [replyDraft] = createReplyPublishDrafts({
          target,
          replies: [reply],
          createdAt: now.toISOString()
        });
        if (replyDraft === undefined) {
          return;
        }

        const artifacts = await writePublishDraftArtifacts(status.workspaceRoot, runId, replyDraft.publishDraft);
        await markCycleStepsCompleted(status.workspaceRoot, ['publish/reply-draft']);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'publish-preview',
          createdAt: now.toISOString(),
          flowId: 'publish/reply-draft',
          runId,
          counts: {
            previewPosts: 1,
            replyDrafts: 1
          },
          artifactPaths: [artifacts.markdownPath, artifacts.jsonPath]
        });
        refreshAllViews();
        openPublishDraftPreview(status.workspaceRoot, replyDraft.publishDraft, artifacts);
        await vscode.window.showInformationMessage(localize('ReviewOps wrote a local reply preview draft. No provider post was attempted.'));
      });
    }),
    vscode.commands.registerCommand('reviewops.applyRules', applyApprovedRulesCommand),
    vscode.commands.registerCommand('reviewops.updateRules', updateRulesCommand),
    vscode.commands.registerCommand('reviewops.proposeRules', async (options?: ReviewOpsCommandExecutionOptions) => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before proposing rules.'));
          return;
        }

        const now = new Date();
        const runId = createRunId(now);
        const ruleInput = await resolveRuleProposalInput(status.workspaceRoot, now, options?.ruleProposal);
        if (ruleInput === undefined) {
          return;
        }
        const result = await buildKnowledgeCaptureArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId,
          ruleSeeds: ruleInput.ruleSeeds,
          findings: ruleInput.findings,
          now: () => now
        });

        await markCycleStepsCompleted(
          status.workspaceRoot,
          ['rules/propose', 'rules/reconcile'],
          [
            result.artifacts.ruleCandidates,
            result.artifacts.knowledgeCandidates,
            result.artifacts.reconciliation,
            result.artifacts.portableChecklist
          ]
        );
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'knowledge-capture',
          createdAt: now.toISOString(),
          flowId: 'rules/propose',
          runId,
          counts: {
            ruleCandidates: result.ruleCandidates.length,
            knowledgeCandidates: result.knowledgeCandidates.length
          },
          artifactPaths: [
            result.artifacts.ruleCandidates.path,
            result.artifacts.knowledgeCandidates.path,
            result.artifacts.reconciliation.path,
            result.artifacts.portableChecklist.path
          ]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.portableChecklist.path);
        await vscode.window.showInformationMessage(
          localize('ReviewOps proposed {0} rule candidate for review. No rule was applied automatically.', result.ruleCandidates.length)
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.captureKnowledgeCandidates', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before capturing knowledge candidates.'));
          return;
        }

        const now = new Date();
        const knowledgeSeeds =
          (await loadLatestKnowledgeCandidateSeeds(
            status.workspaceRoot,
            responseImportFlowIdForCurrentCycle(status.currentCycle)
          )) ?? [];
        const runId = createRunId(now);
        const result = await buildKnowledgeCaptureArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId,
          knowledgeSeeds,
          now: () => now
        });

        await markCycleStepsCompleted(status.workspaceRoot, ['knowledge/capture-candidates'], [
          result.artifacts.ruleCandidates,
          result.artifacts.knowledgeCandidates,
          result.artifacts.reconciliation,
          result.artifacts.portableChecklist
        ]);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'knowledge-capture',
          createdAt: now.toISOString(),
          flowId: 'knowledge/capture-candidates',
          runId,
          counts: {
            ruleCandidates: result.ruleCandidates.length,
            knowledgeCandidates: result.knowledgeCandidates.length
          },
          artifactPaths: [
            result.artifacts.ruleCandidates.path,
            result.artifacts.knowledgeCandidates.path,
            result.artifacts.reconciliation.path,
            result.artifacts.portableChecklist.path
          ]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.portableChecklist.path);
        await vscode.window.showInformationMessage(
          localize('ReviewOps captured {0} knowledge candidate without proposing a rule.', result.knowledgeCandidates.length)
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.captureSkillEvidence', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before capturing skill evidence.'));
          return;
        }

        const now = new Date();
        const runId = createRunId(now);
        const actionPlan = await loadLatestReviewActionPlan(status.workspaceRoot);
        const ruleCandidates = await loadLatestRuleCandidates(status.workspaceRoot);
        const target = isReviewTargetRef(status.currentCycle?.target) ? status.currentCycle.target : undefined;
        const result = await buildSkillEvidenceArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          workspaceRoot: status.workspaceRoot,
          runId,
          target,
          actionPlan,
          ruleCandidates,
          manualEvidence: createDefaultManualSkillEvidence(status.currentCycle),
          now: () => now
        });

        await markCycleStepsCompleted(status.workspaceRoot, ['skill/evidence-capture'], [result.artifacts.skillEvidence]);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'skill-evidence',
          createdAt: now.toISOString(),
          flowId: 'skill/evidence-capture',
          runId,
          counts: {
            skillEvidenceSignals: result.skillEvidence.length
          },
          artifactPaths: [result.artifacts.skillEvidence.path]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.skillEvidence.path);
        await vscode.window.showInformationMessage(
          localize('ReviewOps captured {0} skill evidence entry without scoring or ranking.', result.skillEvidence.length)
        );
      });
    }),
    vscode.commands.registerCommand('reviewops.generateFieldReport', async (options?: ReviewOpsCommandExecutionOptions) => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        if (!status.initialized) {
          await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before generating a field report.'));
          return;
        }

        const now = new Date();
        const reportOptions = resolveFieldReportOptions(now, options?.fieldReport);
        const runId = createRunId(now);
        const result = await buildFieldReportArtifacts({
          artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
          runId,
          period: reportOptions.period,
          targetScope: reportOptions.targetScope,
          now: () => now
        });

        await markCycleStepsCompleted(status.workspaceRoot, ['field/report'], [
          result.artifacts.markdown,
          result.artifacts.json
        ]);
        await recordMetricsSafe(status.workspaceRoot, {
          kind: 'field-report',
          createdAt: now.toISOString(),
          flowId: 'field/report',
          runId,
          counts: {
            unresolvedRisks: result.report.unresolvedRisks,
            addedTests: result.report.addedTests,
            ruleCandidates: result.report.ruleCandidates,
            knowledgeCandidates: result.report.knowledgeCandidates,
            skillEvidenceSignals: result.report.skillSignals.length
          },
          artifactPaths: [result.artifacts.markdown.path, result.artifacts.json.path]
        });
        refreshAllViews();
        await openWorkspaceFile(status.workspaceRoot, result.artifacts.markdown.path);
        await vscode.window.showInformationMessage(localize('ReviewOps generated a local field report preview.'));
      });
    }),
    vscode.commands.registerCommand('reviewops.status', async () => {
      await runCommand(async () => {
        const status = await readWorkspaceStatus();
        if (status === undefined) {
          return;
        }

        refreshAllViews();
        await vscode.window.showInformationMessage(formatStatusMessage(status));
      });
    })
  ];

  context.subscriptions.push(...disposables);
}

export function deactivate(): void {
  return;
}

async function runCommand(command: () => Promise<void>): Promise<void> {
  try {
    await command();
  } catch (error) {
    const message = formatError(error);
    if (activeWebviewRunCapture !== undefined) {
      activeWebviewRunCapture.errorMessage = message;
    }
    await vscode.window.showErrorMessage(localize('ReviewOps failed: {0}', message));
  }
}

async function readWorkspaceStatus(): Promise<ReviewOpsMetaStatus | undefined> {
  const workspaceRoot = await requireWorkspaceRoot();
  if (workspaceRoot === undefined) {
    return undefined;
  }

  return getReviewOpsMetaStatus({ workspaceRoot });
}

async function continueNextAction(
  flowId: string,
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void,
  startContext?: ReviewOpsCycleStartContext
): Promise<void> {
  const cycleId = toCycleId(flowId);
  if (cycleId !== undefined) {
    const now = new Date();
    const runId = createRunId(now);
    const cycle = createReviewOpsCycle({
      cycleId,
      runId,
      startedAt: now.toISOString(),
      startContext
    });
    await saveCurrentReviewOpsCycle({
      workspaceRoot: status.workspaceRoot,
      currentCycle: cycle
    });
    await recordMetricsSafe(status.workspaceRoot, {
      kind: 'review-cycle',
      createdAt: now.toISOString(),
      flowId,
      runId,
      counts: {
        reviewCycles: 1
      }
    });
    refreshStatusView();
    const [nextAction] = cycle.nextActions;
    if (nextAction !== undefined) {
      await continueNextAction(nextAction.flowId, { ...status, currentCycle: cycle, nextActions: cycle.nextActions }, refreshStatusView);
      return;
    }

    await vscode.window.showInformationMessage(
      localize('ReviewOps started {0}.', formatCycleTitle(cycle.title))
    );
    return;
  }

  if (await skipOptionalCommandCenterStep(flowId, status, refreshStatusView)) {
    return;
  }

  const command = commandForFlowId(flowId);
  if (command !== undefined) {
    await vscode.commands.executeCommand(command);
    return;
  }

  await vscode.window.showInformationMessage(localize('ReviewOps next flow: {0}', flowId));
}

export async function skipOptionalCommandCenterStep(
  flowId: string,
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void
): Promise<boolean> {
  if (isOptionalImportFlow(flowId, status)) {
    return skipOptionalImportStep(flowId, status, refreshStatusView);
  }

  if (isOptionalRulesFlow(flowId, status)) {
    return skipOptionalRulesStep(flowId, status, refreshStatusView);
  }

  return false;
}

export async function skipOptionalResearchImportStep(
  flowId: string,
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void
): Promise<boolean> {
  return skipOptionalImportStep(flowId, status, refreshStatusView);
}

async function skipOptionalImportStep(
  flowId: string,
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void
): Promise<boolean> {
  if (!isOptionalImportFlow(flowId, status)) {
    return false;
  }

  const currentCycle = status.currentCycle;
  if (currentCycle === null) {
    return false;
  }

  const actionPlan = createReviewActionPlanFromCurrentCycle(currentCycle);

  const now = new Date();
  const runId = createRunId(now);
  const actionPlanFlowId = actionPlanFlowIdForCurrentCycle(currentCycle);
  const artifacts = await writeReviewActionPlanArtifacts(status.workspaceRoot, runId, actionPlan, now, {
    flowId: actionPlanFlowId,
    title: actionPlanTitleForCurrentCycle(currentCycle),
    nextFlowId: actionPlanNextFlowIdForCurrentCycle(currentCycle)
  });

  await markCycleStepsCompleted(
    status.workspaceRoot,
    [...optionalImportFlowIdsForCurrentCycle(currentCycle), actionPlanFlowId],
    [
      artifacts.actionPlanJson,
      artifacts.actionPlanMarkdown,
      artifacts.understandingMemoJson,
      artifacts.understandingMemoMarkdown,
      artifacts.nextActions
    ]
  );
  await recordMetricsSafe(status.workspaceRoot, {
    kind: 'action-plan',
    createdAt: now.toISOString(),
    flowId: actionPlanFlowId,
    runId,
    counts: {
      fixPlanItems: actionPlan.length
    },
    artifactPaths: [
      artifacts.actionPlanJson.path,
      artifacts.actionPlanMarkdown.path,
      artifacts.understandingMemoJson.path,
      artifacts.understandingMemoMarkdown.path,
      artifacts.nextActions.path
    ]
  });
  refreshStatusView();
  await openWorkspaceFile(status.workspaceRoot, artifacts.actionPlanMarkdown.path);
  await vscode.window.showInformationMessage(
    localize('ReviewOps continued without importing an external response and wrote a default action plan.')
  );
  return true;
}

async function skipOptionalRulesStep(
  flowId: string,
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void
): Promise<boolean> {
  if (!isOptionalRulesFlow(flowId, status)) {
    return false;
  }

  await markCycleStepsCompleted(status.workspaceRoot, ['rules/propose', 'rules/reconcile', 'rules/apply', 'rules/update']);
  refreshStatusView();
  await vscode.window.showInformationMessage(localize('ReviewOps skipped optional rules and continued the cycle.'));
  return true;
}

async function prepareLocalCommentResponseFallback(status: ReviewOpsMetaStatus): Promise<void> {
  const now = new Date();
  const runId = createRunId(now);
  const target = resolveCurrentCycleTargetOrLocalWorkspace(status, path.basename(status.workspaceRoot));
  const result = await buildReviewResolutionArtifacts({
    artifactStore: new FileSystemArtifactStore(status.workspaceRoot),
    runId,
    target,
    comments: [],
    now: () => now
  });

  await markCycleStepsCompleted(
    status.workspaceRoot,
    ['provider/fetch-review', 'review/comment-triage', 'review/action-plan'],
    [
      result.artifacts.commentTriage,
      result.artifacts.understandingMemoJson,
      result.artifacts.understandingMemoMarkdown,
      result.artifacts.actionPlan,
      result.artifacts.replyDrafts,
      result.artifacts.publishDraft,
      result.artifacts.nextActions
    ]
  );
  await recordMetricsSafe(status.workspaceRoot, {
    kind: 'comment-triage',
    createdAt: now.toISOString(),
    flowId: 'review/comment-triage',
    runId,
    counts: {
      triageComments: 0,
      fixPlanItems: result.actionPlan.length,
      replyDrafts: result.replyDrafts.length
    },
    artifactPaths: [
      result.artifacts.commentTriage.path,
      result.artifacts.understandingMemoJson.path,
      result.artifacts.understandingMemoMarkdown.path,
      result.artifacts.actionPlan.path,
      result.artifacts.replyDrafts.path,
      result.artifacts.publishDraft.path,
      result.artifacts.nextActions.path
    ]
  });
  await openWorkspaceFile(status.workspaceRoot, result.artifacts.understandingMemoMarkdown.path);
  await vscode.window.showInformationMessage(
    localize('ReviewOps continued without provider input and created a local comment-response workspace.')
  );
}

async function markCycleStepsCompleted(
  workspaceRoot: string,
  completedFlowIds: string[],
  artifactRefs: Parameters<typeof advanceCurrentReviewOpsCycle>[0]['artifactRefs'] = []
): Promise<void> {
  await advanceCurrentReviewOpsCycle({
    workspaceRoot,
    completedFlowIds,
    artifactRefs,
    now: () => new Date()
  });
}

async function markCycleStepBlocked(
  workspaceRoot: string,
  flowId: string,
  artifactRefs: Parameters<typeof advanceCurrentReviewOpsCycle>[0]['artifactRefs'] = [],
  reason = 'ReviewOps needs this step to be resolved before the cycle can continue.'
): Promise<void> {
  const currentCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
  if (currentCycle === null) {
    return;
  }

  const blockedStep = currentCycle.steps.find((step) => step.flowId === flowId);
  if (blockedStep === undefined) {
    return;
  }

  const now = new Date().toISOString();
  const steps = currentCycle.steps.map((step) =>
    step.flowId === flowId
      ? {
          ...step,
          status: 'blocked' as const,
          artifacts: [...step.artifacts, ...artifactRefs.filter((artifact) => artifact.flowId === flowId)]
        }
      : step
  );
  await saveCurrentReviewOpsCycle({
    workspaceRoot,
    currentCycle: {
      ...currentCycle,
      status: 'blocked',
      updatedAt: now,
      steps,
      nextActions: [
        {
          id: `blocked-${toReviewOpsId(flowId)}`,
          title: `Unblock ${blockedStep.title}`,
          flowId,
          reason
        }
      ]
    }
  });
}

function toCycleId(flowId: string): ReviewOpsCycleId | undefined {
  if (
    flowId === 'cycle/mr-review' ||
    flowId === 'cycle/comment-response' ||
    flowId === 'cycle/fix-review' ||
    flowId === 'cycle/research' ||
    flowId === 'cycle/refactoring' ||
    flowId === 'cycle/field-report'
  ) {
    return flowId;
  }

  return undefined;
}

export async function executeReviewOpsCommandCenterCommand(
  commandId: string,
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void,
  startContext?: ReviewOpsCycleStartContext,
  commandOptions?: ReviewOpsCommandExecutionOptions
): Promise<boolean> {
  const entry = getReviewOpsCommandCatalogEntry(commandId);
  if (entry === undefined) {
    return false;
  }

  if (entry.requiresInitialized && !status.initialized) {
    await vscode.window.showWarningMessage(localize('Initialize ReviewOps project files before running {0}.', localize(entry.label)));
    return false;
  }

  const cycleId = toCycleId(entry.id);
  if (cycleId !== undefined) {
    const cycleStartContext = normalizeReviewOpsCycleStartContext(entry.id, startContext);
    const cycleStartContextValidation = validateReviewOpsCycleStartContext(entry.id, cycleStartContext);
    if (cycleStartContextValidation !== undefined) {
      await vscode.window.showWarningMessage(
        cycleStartContextValidation === 'missing-target-files'
          ? localize('ReviewOps needs target files before starting {0} with Selected files.', localize(entry.label))
          : localize('ReviewOps needs scope details before starting {0}.', localize(entry.label))
      );
      return false;
    }

    await continueNextAction(cycleId, status, refreshStatusView, cycleStartContext);
    return true;
  }

  const command = commandForCommandCenterEntry(entry, status);
  if (command === undefined || command === 'reviewops.commandCenter') {
    return false;
  }

  if (commandOptions === undefined) {
    await vscode.commands.executeCommand(command);
  } else {
    await vscode.commands.executeCommand(command, commandOptions);
  }
  refreshStatusView();
  return true;
}

async function executeReviewOpsCommandCenterBatch(
  commandIds: string[],
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void
): Promise<boolean> {
  const uniqueCommandIds = [...new Set(commandIds)];
  let currentStatus = status;
  let executedAny = false;

  for (const commandId of uniqueCommandIds) {
    const entry = getReviewOpsCommandCatalogEntry(commandId);
    if (entry === undefined || !entry.batchable) {
      continue;
    }

    const executed = await executeReviewOpsCommandCenterCommand(commandId, currentStatus, refreshStatusView);
    executedAny = executedAny || executed;
    currentStatus = (await readWorkspaceStatus()) ?? currentStatus;
  }

  return executedAny;
}

async function requireWorkspaceRoot(): Promise<string | undefined> {
  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot === undefined) {
    await vscode.window.showWarningMessage(localize('ReviewOps requires an open workspace folder.'));
  }

  return workspaceRoot;
}

function createDefaultProjectContextInput(workspaceRoot: string): ProjectContextInput {
  return {
    technicalStack: [`Workspace: ${path.basename(workspaceRoot) || 'Current workspace'}`]
  };
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function readGitHubTokenOrPromptSetup(context: vscode.ExtensionContext): Promise<string | undefined> {
  const token = await context.secrets.get(githubTokenSecretKey);
  if (token !== undefined && token.trim().length > 0) {
    return token;
  }

  const setupGitHubTokenLabel = localize('Setup GitHub Token');
  const selection = await vscode.window.showWarningMessage(
    localize('ReviewOps needs a GitHub token in VS Code SecretStorage before calling the GitHub provider.'),
    setupGitHubTokenLabel
  );
  if (selection === setupGitHubTokenLabel) {
    await vscode.commands.executeCommand('reviewops.setupGitHubToken');
  }

  return undefined;
}

async function promptApprovedRuleCandidates(
  candidates: RuleCandidate[],
  appliedCandidateIds: ReadonlySet<string>
): Promise<RuleCandidate[] | undefined> {
  const applicableCandidates = candidates.filter((candidate) => isP0ApplicableRuleCandidate(candidate, appliedCandidateIds));
  if (applicableCandidates.length === 0) {
    const recordSkippedRulesLabel = localize('Record Skipped Rules');
    const selection = await vscode.window.showWarningMessage(
      localize(
        'ReviewOps found {0} rule candidate but none is new, approved, and applicable for P0 local flows. Record the skipped result and continue?',
        candidates.length
      ),
      { modal: true },
      recordSkippedRulesLabel
    );
    return selection === recordSkippedRulesLabel ? [] : undefined;
  }

  const selected = await vscode.window.showQuickPick(
    applicableCandidates.map((candidate) => ({
      label: candidate.title,
      description: `${candidate.kind} / ${candidate.scope}`,
      detail: candidate.rationale,
      candidate
    })),
    {
      canPickMany: true,
      placeHolder: localize('Select rule candidates that a user approved for local ReviewOps saving.')
    }
  );
  if (selected === undefined) {
    return undefined;
  }

  const approvedCandidates = selected.map((item) => item.candidate);
  if (approvedCandidates.length === 0) {
    const continueWithoutRulesLabel = localize('Continue Without Rules');
    const selection = await vscode.window.showWarningMessage(
      localize('ReviewOps will save no rules and record all candidates as skipped. Continue?'),
      { modal: true },
      continueWithoutRulesLabel
    );
    return selection === continueWithoutRulesLabel ? [] : undefined;
  }

  const portableCount = approvedCandidates.filter((candidate) => candidate.scope === 'portable-candidate').length;
  const applyApprovedRulesLabel = localize('Apply Approved Rules');
  const selection = await vscode.window.showWarningMessage(
    [
      localize('ReviewOps will save {0} approved rule candidate.', approvedCandidates.length),
      portableCount > 0
        ? localize('{0} portable candidate still requires the checklist before sharing.', portableCount)
        : undefined
    ]
      .filter((line): line is string => line !== undefined)
      .join(' '),
    { modal: true },
    applyApprovedRulesLabel
  );

  return selection === applyApprovedRulesLabel ? approvedCandidates : undefined;
}

export function isP0ApplicableRuleCandidate(candidate: RuleCandidate, appliedCandidateIds: ReadonlySet<string> = new Set()): boolean {
  return (
    candidate.status === 'new' &&
    !appliedCandidateIds.has(candidate.id) &&
    (candidate.scope === 'project-local' || candidate.scope === 'portable-candidate')
  );
}

export function createManualRuleCandidateSeed(title: string, rationale: string, now: Date): RuleCandidateSeed {
  return {
    id: `manual-rule-${createRunId(now)}`,
    title: title.trim(),
    rationale: rationale.trim()
  };
}

async function createDefaultReviewReply(
  workspaceRoot: string,
  currentCycle: ReviewOpsCurrentCycle | null
): Promise<ReviewReply> {
  const actionPlan = await loadLatestReviewActionPlan(workspaceRoot);
  const title =
    actionPlan?.[0]?.title ??
    (currentCycle === null
      ? 'ReviewOps follow-up'
      : `${formatCycleTitle(currentCycle.title)} follow-up`);

  return {
    commentId: 'reviewops-summary',
    body: [
      `ReviewOps draft: ${title}`,
      '',
      'Please edit this local draft before publishing if reviewer-specific wording is required.'
    ].join('\n')
  };
}

async function createDefaultSummaryCommentBody(
  workspaceRoot: string,
  currentCycle: ReviewOpsCurrentCycle | null
): Promise<string> {
  const actionPlan = await loadLatestReviewActionPlan(workspaceRoot);
  if (actionPlan !== undefined && actionPlan.length > 0) {
    return [
      'ReviewOps summary draft:',
      '',
      ...actionPlan.map((item) => `- ${item.title}`),
      '',
      'Please review and edit this draft before posting.'
    ].join('\n');
  }

  return [
    `ReviewOps summary draft for ${currentCycle === null ? 'the current workspace' : formatCycleTitle(currentCycle.title)}.`,
    '',
    'Please review and edit this draft before posting.'
  ].join('\n');
}

function createSummaryPublishDraft(target: ReviewTargetRef, body: string, now: Date): PublishDraft {
  const createdAt = now.toISOString();
  if (target.provider === 'github') {
    try {
      return createSummaryCommentDraft({
        target,
        body,
        createdAt
      });
    } catch {
      // Keep summary preview usable for partially known provider targets.
    }
  }

  return {
    id: `draft_${createdAt.replaceAll(/[^0-9a-z]/giu, '')}_${toReviewOpsId(target.provider)}_${toReviewOpsId(target.id)}`,
    provider: target.provider,
    target,
    title: `Summary draft for ${target.repository} ${target.id}`,
    body: body.trim(),
    mode: 'summary-comment',
    requiresConfirmation: true,
    status: 'draft',
    createdAt
  };
}

function createReviewActionPlanFromCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): ReviewActionPlanItem[] {
  const fromStartContext = createReviewActionPlanFromCycleStartContext(currentCycle?.startContext, currentCycle?.cycleId);
  return fromStartContext ?? [createDefaultReviewActionPlanItem(currentCycle)];
}

function createReviewActionPlanFromCycleStartContext(
  startContext: ReviewOpsCycleStartContext | undefined,
  cycleId?: ReviewOpsCycleId
): ReviewActionPlanItem[] | undefined {
  if (startContext === undefined) {
    return undefined;
  }
  const refactor = cycleId === 'cycle/refactoring';

  return [
    {
      id: `cycle-action-${toReviewOpsId(startContext.scopeLabel)}`,
      title: startContext.intent,
      priority: 'P1',
      source: 'response',
      relatedCommentIds: [],
      steps: [
        `${refactor ? 'Scope the refactor' : 'Scope the work'}: ${startContext.scopeLabel}`,
        ...(startContext.targetFiles ?? []).map((file) => `Inspect ${file}`),
        refactor
          ? 'Apply the smallest behavior-preserving refactor outside ReviewOps.'
          : 'Apply the smallest manual change outside ReviewOps.',
        'Run focused verification and record the result.'
      ],
      doneCriteria: [
        refactor
          ? 'The scoped refactor is implemented or explicitly deferred.'
          : 'The scoped work is implemented or explicitly deferred.',
        ...(refactor ? ['No behavior change is expected unless explicitly documented.'] : []),
        'A focused verification result is recorded in ReviewOps.'
      ]
    }
  ];
}

function createDefaultReviewActionPlanItem(currentCycle: ReviewOpsCurrentCycle | null): ReviewActionPlanItem {
  const cycleId = currentCycle?.cycleId;
  const title = defaultActionPlanTitleForCycle(cycleId);

  return {
    id: `cycle-action-${toReviewOpsId(cycleId ?? 'current-workspace')}`,
    title,
    priority: 'P1',
    source: 'response',
    relatedCommentIds: [],
    steps: defaultActionPlanStepsForCycle(cycleId),
    doneCriteria: [
      'The smallest relevant main file is reviewed.',
      'Any required code or reply work is explicitly completed or deferred.',
      'A focused verification result is recorded before publishing.'
    ]
  };
}

function createDefaultManualSkillEvidence(
  currentCycle: ReviewOpsCurrentCycle | null
): Parameters<typeof buildSkillEvidenceArtifacts>[0]['manualEvidence'] {
  if (currentCycle === null) {
    return [];
  }

  return [
    {
      kind: 'technical-explanation',
      title: `${formatCycleTitle(currentCycle.title)} progress captured`,
      summary: 'ReviewOps captured cycle progress without requiring additional Webview input.',
      strength: 'weak'
    }
  ];
}

function defaultActionPlanTitleForCycle(cycleId: ReviewOpsCycleId | undefined): string {
  switch (cycleId) {
    case 'cycle/mr-review':
      return 'Review the current workspace diff and prepare a reviewer-safe response.';
    case 'cycle/comment-response':
      return 'Triage available reviewer comments and prepare the smallest safe response.';
    case 'cycle/fix-review':
      return 'Review the current fix and verify remaining reviewer risk.';
    case 'cycle/research':
      return 'Investigate the current workspace and identify concrete risks, decisions, and next actions.';
    case 'cycle/refactoring':
      return 'Plan the smallest safe refactoring path for the current workspace.';
    case 'cycle/field-report':
      return 'Summarize current ReviewOps evidence into a field report.';
    default:
      return 'Review the current workspace and decide the next smallest safe action.';
  }
}

function defaultActionPlanStepsForCycle(cycleId: ReviewOpsCycleId | undefined): string[] {
  switch (cycleId) {
    case 'cycle/comment-response':
      return [
        'Use any available provider comments or local notes.',
        'Identify the smallest response or fix that reduces review risk.',
        'Draft the response locally before publishing.'
      ];
    case 'cycle/refactoring':
      return [
        'Scope the behavior-preserving refactor.',
        'Plan the smallest local change.',
        'Run focused verification and capture the result.'
      ];
    case 'cycle/field-report':
      return [
        'Gather the latest ReviewOps artifacts.',
        'Summarize unresolved risks, added tests, rules, knowledge, and skill evidence.',
        'Review the generated field report before sharing.'
      ];
    default:
      return [
        'Inspect the current workspace state.',
        'Apply or explicitly defer the smallest relevant manual change.',
        'Run focused verification and capture the result.'
      ];
  }
}

type ReviewFixVerificationInput = {
  fixPlan: ReviewFixPlan;
  results: Array<Omit<ReviewFixVerificationResult, 'id' | 'verifiedAt'>>;
};

async function resolveReviewFixVerificationInput(
  workspaceRoot: string,
  planFlowId = 'fix/plan',
  itemNoun = 'review fix'
): Promise<ReviewFixVerificationInput | undefined> {
  const fixPlan = await loadLatestReviewFixPlan(workspaceRoot, planFlowId);
  if (fixPlan === undefined) {
    await vscode.window.showWarningMessage(localize('Build a ReviewOps {0} plan before recording verification.', itemNoun));
    return undefined;
  }
  if (fixPlan.items.length === 0) {
    await vscode.window.showWarningMessage(localize('ReviewOps could not find any {0} plan items to verify.', itemNoun));
    return undefined;
  }

  return {
    fixPlan,
    results: fixPlan.items.map((item) => ({
      fixPlanItemId: item.id,
      status: 'needs_followup_issue',
      evidence:
        'ReviewOps created this verification note without extra Webview input. Replace this text with actual verification evidence before treating the work as complete.',
      commands: [],
      followUpIssueTitle: `Verify ${item.title}`
    }))
  };
}

function toReviewOpsId(value: string): string {
  const normalized = value.replaceAll(/[^0-9a-z]+/giu, '-').replaceAll(/^-+|-+$/gu, '').toLowerCase();
  return normalized.length > 0 ? normalized : 'manual-item';
}

async function resolveRuleProposalInput(
  workspaceRoot: string,
  now: Date,
  options?: ReviewOpsCommandExecutionOptions['ruleProposal']
): Promise<{ ruleSeeds?: RuleCandidateSeed[]; findings?: ReviewFindingSeed[] } | undefined> {
  if (options !== undefined && options.title !== undefined && options.rationale !== undefined) {
    const title = options.title.trim();
    const rationale = options.rationale.trim();
    if (title.length === 0 || rationale.length === 0) {
      await vscode.window.showWarningMessage(localize('ReviewOps needs a rule title and rationale before proposing a manual rule.'));
      return undefined;
    }

    return {
      ruleSeeds: [createManualRuleCandidateSeed(title, rationale, now)]
    };
  }

  const findings = (await loadLatestReviewFindingSeeds(workspaceRoot)) ?? [];
  if (findings.length > 0) {
    return { findings };
  }

  const title = await vscode.window.showInputBox({
    prompt: localize('Rule candidate title to preview before saving.'),
    placeHolder: localize('Require focused verification for risky review fixes'),
    ignoreFocusOut: true
  });
  if (title === undefined || title.trim().length === 0) {
    return undefined;
  }

  const rationale = await vscode.window.showInputBox({
    prompt: localize('Why this rule candidate is useful.'),
    ignoreFocusOut: true
  });
  if (rationale === undefined || rationale.trim().length === 0) {
    return undefined;
  }

  return {
    ruleSeeds: [createManualRuleCandidateSeed(title, rationale, now)]
  };
}

function resolveFieldReportOptions(
  now: Date,
  options?: ReviewOpsCommandExecutionOptions['fieldReport']
): { period: FieldReport['period']; targetScope: FieldReport['targetScope'] } {
  const defaultPeriod = createSevenDayReportPeriod(now);
  const from = normalizeDateOnly(options?.from) ?? defaultPeriod.from;
  const to = normalizeDateOnly(options?.to) ?? defaultPeriod.to;

  return {
    period: from <= to ? { from, to } : { from: to, to: from },
    targetScope: isFieldReportTargetScope(options?.targetScope) ? options.targetScope : 'field'
  };
}

function normalizeDateOnly(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(trimmed) ? trimmed : undefined;
}

function isFieldReportTargetScope(value: unknown): value is FieldReport['targetScope'] {
  return value === 'developer' || value === 'field' || value === 'reviewer' || value === 'team';
}

function formatProjectInitMessage(result: ProjectInitResult): string {
  return localize(
    'ReviewOps project files are ready. {0} created {1} updated {2} existing',
    result.created.length,
    result.updated.length,
    result.existing.length
  );
}

export function formatStatusMessage(status: ReviewOpsMetaStatus): string {
  const nextAction = status.nextActions[0] === undefined ? localize('No next action') : formatNextActionTitle(status.nextActions[0]);
  const initialized = status.initialized ? localize('ReviewOps is ready.') : localize('ReviewOps is not initialized.');
  const cycle =
    status.currentCycle === null
      ? localize('Current cycle: {0}.', localize('None'))
      : localize(
          'Current cycle: {0}.',
          `${formatCycleTitle(status.currentCycle.title)} ${formatCycleStatus(status.currentCycle.status)}`
        );
  return `${initialized} ${cycle} ${localize('Next: {0}.', nextAction)}`;
}

async function openWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<void> {
  if (activeWebviewRunCapture !== undefined) {
    activeWebviewRunCapture.openedFiles.push({ workspaceRoot, relativePath });
    return;
  }

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(workspaceRoot, relativePath)));
  await vscode.window.showTextDocument(document, {
    preview: false
  });
}

function formatPromptReadyMessage(baseMessage: string): string {
  return localize(
    '{0} Use the opened prompt only when you want outside review; otherwise continue with the next step.',
    baseMessage
  );
}

function formatScopedPromptReadyMessage(status: ReviewOpsMetaStatus): string {
  return formatPromptReadyMessage(
    localize('ReviewOps prepared a scoped {0} prompt.', formatCycleTitle(status.currentCycle?.title ?? 'Research Cycle'))
  );
}

function promptFlowIdsForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string[] {
  return currentCycle?.cycleId === 'cycle/research'
    ? ['research/select-scope', 'research/investigate']
    : ['review/select-target', 'diff/review'];
}

function responseFlowIdsForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string[] {
  return currentCycle?.cycleId === 'cycle/research'
    ? ['research/import-findings', 'research/normalize-findings']
    : ['response/import', 'response/normalize'];
}

function responseImportFlowIdForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/research' ? 'research/import-findings' : 'response/import';
}

function actionPlanFlowIdForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/research' ? 'research/action-plan' : 'review/action-plan';
}

function actionPlanTitleForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/research' ? 'ReviewOps Research Action Plan' : 'ReviewOps Action Plan';
}

export function actionPlanNextFlowIdForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  switch (currentCycle?.cycleId) {
    case 'cycle/research':
      return 'knowledge/capture-candidates';
    case 'cycle/mr-review':
      return 'publish/summary-draft';
    case 'cycle/comment-response':
    case 'cycle/fix-review':
    default:
      return 'fix/plan';
  }
}

function workPlanFlowIdForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/refactoring' ? 'refactor/plan' : 'fix/plan';
}

function workChecklistFlowIdForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/refactoring' ? 'refactor/checklist' : 'fix/checklist';
}

function workVerifyFlowIdForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/refactoring' ? 'refactor/verify' : 'fix/verify';
}

function workExplainFlowIdForCurrentCycle(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/refactoring' ? 'refactor/explain' : 'fix/explain';
}

function formatWorkItemNoun(currentCycle: ReviewOpsCurrentCycle | null): string {
  return currentCycle?.cycleId === 'cycle/refactoring' ? localize('refactor') : localize('review fix');
}

function attachArtifactsToCompletedFlows(artifactRefs: FlowArtifactRef[], completedFlowIds: string[]): FlowArtifactRef[] {
  return completedFlowIds.flatMap((flowId) => artifactRefs.map((artifact) => ({ ...artifact, flowId })));
}

async function prepareScopedCyclePrompt(
  status: ReviewOpsMetaStatus,
  startContext: ReviewOpsCycleStartContext
): Promise<void> {
  const flowIds = promptFlowIdsForCurrentCycle(status.currentCycle);
  const result = await buildScopedCyclePromptArtifacts(status.workspaceRoot, startContext, flowIds.at(-1));
  await markCycleStepsCompleted(
    status.workspaceRoot,
    flowIds,
    attachArtifactsToCompletedFlows([result.artifacts.prompt, result.artifacts.inputSummary, result.artifacts.metadata], flowIds)
  );
  await openWorkspaceFile(status.workspaceRoot, result.artifacts.prompt.path);
}

function withCycleStartContext(
  input: ReviewPromptInput,
  startContext: ReviewOpsCycleStartContext | undefined
): ReviewPromptInput {
  if (startContext === undefined) {
    return input;
  }

  return {
    ...input,
    focus: [...(input.focus ?? []), ...createCycleStartContextFocus(startContext)],
    notes: [input.notes, renderCycleStartContextNotes(startContext)].filter((note): note is string => Boolean(note)).join('\n\n')
  };
}

function createSevenDayReportPeriod(now: Date): { from: string; to: string } {
  const from = new Date(now.getTime());
  from.setUTCDate(from.getUTCDate() - 6);

  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10)
  };
}

async function recordMetricsSafe(workspaceRoot: string, event: ReviewOpsMetricsEventInput): Promise<void> {
  try {
    await recordReviewOpsMetricsEvent({
      workspaceRoot,
      event
    });
  } catch (error) {
    await vscode.window.showWarningMessage(localize('ReviewOps could not update local metrics files: {0}', formatError(error)));
  }
}

function countVerificationTestSignals(verification: ReviewFixVerification): number {
  return verification.results.filter((result) =>
    [...result.commands, result.evidence].some((value) => /(test|spec|coverage)/iu.test(value))
  ).length;
}

function openPublishDraftPreview(workspaceRoot: string, draft: PublishDraft, artifacts: PublishDraftArtifactPaths): void {
  if (activeWebviewRunCapture !== undefined) {
    activeWebviewRunCapture.openedFiles.push({ workspaceRoot, relativePath: artifacts.markdownPath });
  }

  const panel = vscode.window.createWebviewPanel(
    'reviewopsPublishDraftPreview',
    localize('ReviewOps Publish Draft Preview'),
    vscode.ViewColumn.Active,
    {
      enableScripts: false,
      retainContextWhenHidden: false
    }
  );

  panel.webview.html = renderPublishDraftPreviewHtml(draft, artifacts);
}

function openStatusPreview(status: ReviewOpsMetaStatus): void {
  const panel = vscode.window.createWebviewPanel(
    'reviewopsStatusPreview',
    localize('ReviewOps Preview'),
    vscode.ViewColumn.Active,
    {
      enableScripts: false,
      retainContextWhenHidden: false
    }
  );

  panel.webview.html = renderStatusPreview(status);
}

function openCommandCenter(
  status: ReviewOpsMetaStatus,
  refreshStatusView: () => void,
  context: vscode.ExtensionContext
): void {
  if (activeCommandCenterPanel !== undefined) {
    activeCommandCenterPanel.reveal(vscode.ViewColumn.Active);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'reviewopsCommandCenter',
    localize('ReviewOps Command Center'),
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  activeCommandCenterPanel = panel;
  panel.onDidDispose(() => {
    if (activeCommandCenterPanel === panel) {
      activeCommandCenterPanel = undefined;
    }
  });
  const render = async (
    currentStatus: ReviewOpsMetaStatus,
    runResult?: ReviewOpsWebviewRunResult,
    experienceMode = readReviewOpsExperienceMode(context)
  ) => {
    panel.webview.html = renderCommandCenterHtml({
      status: currentStatus,
      commands: listReviewOpsCommandCatalog(),
      nonce: createNonce(),
      cspSource: panel.webview.cspSource,
      runResult,
      experienceMode
    });
  };

  void render(status);
  panel.webview.onDidReceiveMessage((message: unknown) => {
    void runCommand(async () => {
      if (isCommandCenterOpenFileMessage(message)) {
        const currentStatus = (await readWorkspaceStatus()) ?? status;
        if (!isCommandCenterOpenableFile(message.relativePath)) {
          await vscode.window.showWarningMessage(localize('ReviewOps ignored an unavailable local file.'));
          return;
        }

        await openWorkspaceFile(currentStatus.workspaceRoot, message.relativePath);
        return;
      }

      if (isCommandCenterSetExperienceModeMessage(message)) {
        await getExtensionWorkspaceState(context)?.update(reviewOpsExperienceModeKey, message.experienceMode);
        await getExtensionGlobalState(context)?.update(reviewOpsExperienceModeKey, message.experienceMode);
        const currentStatus = (await readWorkspaceStatus()) ?? status;
        await render(currentStatus, undefined, message.experienceMode);
        return;
      }

      if (
        !isCommandCenterRunMessage(message) &&
        !isCommandCenterRunBatchMessage(message) &&
        !isCommandCenterRunInputMessage(message) &&
        !isCommandCenterStartCycleWithContextMessage(message) &&
        !isCommandCenterRunWithOptionsMessage(message) &&
        !isCommandCenterSkipOptionalStepMessage(message)
      ) {
        return;
      }

      const currentStatus = (await readWorkspaceStatus()) ?? status;
      let commandIds: string[];
      if (isCommandCenterRunBatchMessage(message)) {
        commandIds = message.commandIds;
      } else if (isCommandCenterRunInputMessage(message)) {
        const resolvedInput = resolveCommandCenterInput(listReviewOpsCommandCatalog(), message.inputValue);
        if (resolvedInput === undefined) {
          await render(
            currentStatus,
            await createCommandCenterRunResult({
              entry: undefined,
              executed: false,
              capture: { openedFiles: [] },
              status: currentStatus
            })
          );
          await vscode.window.showWarningMessage(localize('No matching ReviewOps command.'));
          return;
        }
        commandIds = resolvedInput.commandIds;
      } else {
        commandIds = [message.commandId];
      }
      const entry = getReviewOpsCommandCatalogEntry(commandIds[0]);
      await render(currentStatus, createCommandCenterRunningResult(entry, currentStatus));

      const capture: ReviewOpsWebviewRunCapture = { openedFiles: [] };
      const previousCapture = activeWebviewRunCapture;
      activeWebviewRunCapture = capture;
      let executed = false;
      try {
        executed = isCommandCenterRunBatchMessage(message)
          ? await executeReviewOpsCommandCenterBatch(message.commandIds, currentStatus, refreshStatusView)
          : isCommandCenterRunInputMessage(message)
            ? commandIds.length > 1
              ? await executeReviewOpsCommandCenterBatch(commandIds, currentStatus, refreshStatusView)
              : await executeReviewOpsCommandCenterCommand(commandIds[0], currentStatus, refreshStatusView)
          : isCommandCenterSkipOptionalStepMessage(message)
            ? await skipOptionalCommandCenterStep(message.commandId, currentStatus, refreshStatusView)
            : isCommandCenterStartCycleWithContextMessage(message)
            ? await executeReviewOpsCommandCenterCommand(message.commandId, currentStatus, refreshStatusView, message.startContext)
            : isCommandCenterRunWithOptionsMessage(message)
              ? await executeReviewOpsCommandCenterCommand(
                  message.commandId,
                  currentStatus,
                  refreshStatusView,
                  undefined,
                  message.commandOptions
                )
              : await executeReviewOpsCommandCenterCommand(message.commandId, currentStatus, refreshStatusView);
      } finally {
        activeWebviewRunCapture = previousCapture;
      }
      const refreshedStatus = (await readWorkspaceStatus()) ?? currentStatus;
      const runResult = await createCommandCenterRunResult({
        entry,
        executed,
        capture,
        status: refreshedStatus
      });
      await render(refreshedStatus, runResult);

      if (!executed) {
        await vscode.window.showWarningMessage(localize('ReviewOps ignored an unavailable Command Center action.'));
      }
    });
  });
}

function readReviewOpsExperienceMode(context: vscode.ExtensionContext): ReviewOpsExperienceMode {
  const workspaceValue = getExtensionWorkspaceState(context)?.get<unknown>(reviewOpsExperienceModeKey);
  if (isReviewOpsExperienceMode(workspaceValue)) {
    return workspaceValue;
  }

  const globalValue = getExtensionGlobalState(context)?.get<unknown>(reviewOpsExperienceModeKey);
  return isReviewOpsExperienceMode(globalValue) ? globalValue : 'guide';
}

function getExtensionWorkspaceState(context: vscode.ExtensionContext):
  | {
      get<T>(key: string): T | undefined;
      update(key: string, value: unknown): Thenable<void>;
    }
  | undefined {
  return (context as Partial<vscode.ExtensionContext>).workspaceState;
}

function getExtensionGlobalState(context: vscode.ExtensionContext):
  | {
      get<T>(key: string): T | undefined;
      update(key: string, value: unknown): Thenable<void>;
    }
  | undefined {
  return (context as Partial<vscode.ExtensionContext>).globalState;
}

function createNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
