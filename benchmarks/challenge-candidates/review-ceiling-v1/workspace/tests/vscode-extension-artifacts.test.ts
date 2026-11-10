import { mkdtemp, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ActionPlanItemSeed, ReviewActionPlanItem, RuleCandidate } from '../packages/core/src/index';

vi.mock('@reviewops/core', async () => await import('../packages/core/src/index'), { virtual: true });
vi.mock(
  '@reviewops/providers',
  () => ({
    createGitHubPullRequestTargetRef: () => undefined,
    createGitHubReviewProvider: () => undefined,
    createLocalGitTargetRef: () => undefined,
    createLocalGitReviewProvider: () => undefined,
    createReviewPromptInputFromGitHubPullRequest: () => undefined,
    createReviewPromptInputFromLocalGitDiff: () => undefined,
    createSummaryCommentDraft: () => undefined
  }),
  { virtual: true }
);
vi.mock(
  'vscode',
  () => ({
    commands: {
      executeCommand: vi.fn()
    },
    EventEmitter: class {
      event(): undefined {
        return undefined;
      }
      fire(): void {
        return undefined;
      }
      dispose(): void {
        return undefined;
      }
    },
    TreeItem: class {
      constructor(
        public readonly label: string,
        public readonly collapsibleState: number
      ) {}
    },
    ThemeIcon: class {
      constructor(public readonly id: string) {}
    },
    TreeItemCollapsibleState: {
      None: 0
    },
    l10n: {
      t: (message: string, ...args: unknown[]) =>
        message.replaceAll(/\{(\d+)\}/gu, (match, index) => {
          const value = args[Number(index)];
          return value === undefined || value === null ? match : String(value);
        })
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath })
    },
    ViewColumn: {
      Active: 1
    },
    window: {
      showInformationMessage: vi.fn(),
      showTextDocument: vi.fn(),
      showWarningMessage: vi.fn()
    },
    workspace: {
      openTextDocument: vi.fn(async (uri: unknown) => ({ uri }))
    }
  }),
  { virtual: true }
);

const {
  createReviewOpsCycle,
  FileSystemArtifactStore,
  initializeReviewOpsProject,
  listReviewOpsCommandCatalog,
  loadCurrentReviewOpsCycle,
  saveCurrentReviewOpsCycle
} = await import('../packages/core/src/index');
const {
  actionPlanNextFlowIdForCurrentCycle,
  commandForFlowId,
  createManualRuleCandidateSeed,
  createStatusTreeNodes,
  executeReviewOpsCommandCenterCommand,
  formatActionPlanNextActionTitle,
  formatStatusMessage,
  formatRunIdForTreeDescription,
  isP0ApplicableRuleCandidate,
  listReviewOpsArtifactQuickPickItems,
  listReviewOpsArtifactViewItems,
  loadLatestImportedActionPlanSeed,
  loadLatestReviewOpsArtifact,
  loadLatestRuleApplication,
  loadLatestRuleCandidates,
  renderCommandCenterHtml,
  resolveCommandCenterInput,
  skipOptionalCommandCenterStep,
  skipOptionalResearchImportStep
} = await import('../packages/vscode-extension/src/extension');
const vscode = await import('vscode');

describe('VS Code extension ReviewOps artifact loading', () => {
  it('formats compact UTC run IDs as readable JST tree descriptions', () => {
    expect(formatRunIdForTreeDescription('run_20260505T154832940z')).toBe('2026-05-06 00:48 JST');
    expect(formatRunIdForTreeDescription('knowledge-run')).toBe('knowledge-run');
  });

  it('routes rule apply and update flows to separate commands', () => {
    expect(commandForFlowId('project/context')).toBe('reviewops.updateProjectContext');
    expect(commandForFlowId('provider/connect')).toBe('reviewops.setupGitHubToken');
    expect(commandForFlowId('provider/fetch-review')).toBe('reviewops.prepareGitHubCommentTriage');
    expect(commandForFlowId('rules/apply')).toBe('reviewops.applyRules');
    expect(commandForFlowId('rules/update')).toBe('reviewops.updateRules');
    expect(commandForFlowId('meta/readiness')).toBe('reviewops.showP0Readiness');
  });

  it('resolves command input expressions in the extension host boundary', () => {
    const commands = listReviewOpsCommandCatalog();
    const batch = resolveCommandCenterInput(commands, ': review target=PR#42 rules=extract tests=generate');

    expect(resolveCommandCenterInput(commands, 'shift+e')).toMatchObject({
      commandIds: ['rules/propose'],
      batch: false
    });
    expect(resolveCommandCenterInput(commands, 'test')).toMatchObject({ commandIds: ['fix/checklist'] });
    expect(batch?.batch).toBe(true);
    expect(batch?.commandIds).toEqual(expect.arrayContaining(['cycle/mr-review', 'rules/propose', 'fix/checklist']));
    expect(resolveCommandCenterInput(commands, 'zzzz-command')).toBeUndefined();
  });

  it('routes every command catalog entry through the Command Center dispatcher', async () => {
    const commands = listReviewOpsCommandCatalog();

    for (const command of commands) {
      const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), `reviewops-command-route-${command.id.replaceAll('/', '-')}-`));
      const startContext =
        command.id === 'cycle/research' || command.id === 'cycle/refactoring'
          ? {
              scopeLabel: 'Scoped command',
              intent: 'Verify dispatcher path.',
              targetMode: 'manual' as const
            }
          : undefined;

      await expect(
        executeReviewOpsCommandCenterCommand(
          command.id,
          {
            workspaceRoot,
            initialized: command.requiresInitialized,
            sharedDirExists: command.requiresInitialized,
            localDirExists: command.requiresInitialized,
            flowCount: 35,
            currentCycle: null,
            nextActions: []
          },
          vi.fn(),
          startContext
        ),
        command.id
      ).resolves.toBe(true);
    }
  });

  it('uses cycle-specific next actions after action-plan artifacts', () => {
    const mrReviewCycle = createReviewOpsCycle({
      cycleId: 'cycle/mr-review',
      runId: 'run-mr-review',
      startedAt: '2026-05-05T09:00:00.000Z'
    });
    const commentResponseCycle = createReviewOpsCycle({
      cycleId: 'cycle/comment-response',
      runId: 'run-comment-response',
      startedAt: '2026-05-05T09:00:00.000Z'
    });
    const fixReviewCycle = createReviewOpsCycle({
      cycleId: 'cycle/fix-review',
      runId: 'run-fix-review',
      startedAt: '2026-05-05T09:00:00.000Z'
    });
    const researchCycle = createReviewOpsCycle({
      cycleId: 'cycle/research',
      runId: 'run-research',
      startedAt: '2026-05-05T09:00:00.000Z',
      startContext: {
        scopeLabel: 'Scoped workflow',
        intent: 'Investigate safely.',
        targetMode: 'manual'
      }
    });

    expect(actionPlanNextFlowIdForCurrentCycle(mrReviewCycle)).toBe('publish/summary-draft');
    expect(formatActionPlanNextActionTitle('publish/summary-draft')).toBe('Preview Summary Comment Draft');
    expect(actionPlanNextFlowIdForCurrentCycle(commentResponseCycle)).toBe('fix/plan');
    expect(actionPlanNextFlowIdForCurrentCycle(fixReviewCycle)).toBe('fix/plan');
    expect(actionPlanNextFlowIdForCurrentCycle(researchCycle)).toBe('knowledge/capture-candidates');
  });

  it('opens the simplified Command Center from the status node', () => {
    const nodes = createStatusTreeNodes({
      workspaceRoot: '/workspace',
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 45,
      currentCycle: null,
      nextActions: []
    });
    const flowNode = nodes.find((node) => node.contextValue === 'reviewops.commandCenter');
    const statusNode = nodes.find((node) => node.contextValue === 'reviewops.status');
    const artifactsNode = nodes.find((node) => node.contextValue === 'reviewops.openArtifacts');

    expect(nodes.map((node) => node.contextValue)).toEqual(['reviewops.commandCenter', 'reviewops.status', 'reviewops.openArtifacts']);
    expect(statusNode).toEqual(
      expect.objectContaining({
        label: 'Initialized',
        description: '.reviewops ready',
        tooltip: 'Ready'
      })
    );
    expect(statusNode?.tooltip).not.toBe('/workspace');
    expect(flowNode).toEqual(
      expect.objectContaining({
        label: 'Open Command Center',
        description: 'next action',
        tooltip: 'Open the simplified ReviewOps webview.',
        command: expect.objectContaining({
          command: 'reviewops.commandCenter',
          title: 'Open ReviewOps Command Center'
        })
      })
    );
    expect(artifactsNode).toEqual(
      expect.objectContaining({
        label: 'Open main files',
        description: 'main files',
        tooltip: 'Open the files worth reviewing first.'
      })
    );
  });

  it('formats status messages without workspace paths or flow counts', () => {
    const message = formatStatusMessage({
      workspaceRoot: '/workspace',
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 45,
      currentCycle: null,
      nextActions: [
        {
          id: 'next-review',
          title: 'Continue Local Diff Review',
          flowId: 'diff/review',
          reason: 'Diff review is next.'
        }
      ]
    });

    expect(message).toBe('ReviewOps is ready. Current cycle: None. Next: Continue Local Diff Review.');
    expect(message).not.toContain('/workspace');
    expect(message).not.toContain('P0 flows');
    expect(message).not.toContain('45');
  });

  it('renders command center categories and disables initialized-only commands before setup', () => {
    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: false,
        sharedDirExists: false,
        localDirExists: false,
        flowCount: 35,
        currentCycle: null,
        nextActions: []
      },
      commands: [
        {
          id: 'project/init',
          kind: 'setup',
          category: 'setup-status',
          label: 'Initialize <Project>',
          summary: 'Create files.',
          outcome: 'Workspace becomes ready.',
          effects: ['Writes .reviewops/'],
          vsCodeCommand: 'reviewops.initializeProject',
          requiresInitialized: false,
          requiresConfirmation: false,
          aliases: []
        },
        {
          id: 'cycle/research',
          kind: 'cycle',
          category: 'start-cycle',
          label: 'Start Research Cycle',
          summary: 'Investigate.',
          outcome: 'Target selection is next.',
          effects: ['Writes .reviewops.local/current-cycle.local.json'],
          vsCodeCommand: 'reviewops.commandCenter',
          requiresInitialized: true,
          requiresConfirmation: false,
          aliases: []
        },
        {
          id: 'diff/review',
          kind: 'flow',
          category: 'prepare-work',
          label: 'Prepare Local Diff Review',
          summary: 'Create a prompt.',
          outcome: 'Opens a generated prompt artifact for external AI or human review.',
          effects: ['Writes .reviewops/out/diff-review/<run-id>/prompt.md'],
          vsCodeCommand: 'reviewops.prepareLocalDiffReview',
          requiresInitialized: true,
          requiresConfirmation: false,
          aliases: []
        },
        {
          id: 'field/report',
          kind: 'knowledge',
          category: 'rules-knowledge',
          label: 'Generate Field Report',
          summary: 'Report.',
          outcome: 'Opens a local field report preview.',
          effects: ['Writes field report artifacts'],
          vsCodeCommand: 'reviewops.generateFieldReport',
          requiresInitialized: true,
          requiresConfirmation: false,
          aliases: []
        },
        {
          id: 'publish/summary-draft',
          kind: 'publish',
          category: 'publish-preview',
          label: 'Preview Summary',
          summary: 'Preview.',
          outcome: 'Confirmation is required.',
          effects: ['Requires confirmation before provider write'],
          vsCodeCommand: 'reviewops.previewGitHubSummaryComment',
          requiresInitialized: true,
          requiresConfirmation: true,
          aliases: []
        }
      ],
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });

    expect(html).toContain('<h1>ReviewOps Guide</h1>');
    expect(html).not.toContain('レビュー対応を速く、漏れなく、安全に');
    expect(html).toContain('Manual-only AI');
    expect(html).toContain('Preview-first');
    expect(html).toContain('No auto push');
    expect(html).toContain('data-experience-mode="guide"');
    expect(html).toContain('data-experience-mode="console"');
    expect(html).not.toContain('editable metrics');
    expect(html).toContain('Guided review path');
    expect(html).toContain('Finding breakdown');
    expect(html).toContain('Understanding board');
    expect(html).toContain('Next Safe Step');
    expect(html).not.toContain('What you will see');
    expect(html).not.toContain('UX value');
    expect(html).not.toContain('Project files');
    expect(html).not.toContain('What gets created');
    expect(html).not.toContain('Workspace becomes ready.');
    expect(html).not.toContain('Opens a generated prompt artifact');
    expect(html).toContain('More actions');
    expect(html).toContain('Current Position');
    expect(html).not.toContain('Pick a cycle first.');
    expect(html).not.toContain('Optional scope');
    expect(html).not.toContain('<details class="details-panel" open');
    expect(html).not.toContain('data-command-id="cycle/research" disabled');
    expect(html).not.toContain('data-cycle-context-id="cycle/research-workflow" disabled');
    expect(html).not.toContain('data-context-form="cycle/research-workflow"');
    expect(html).not.toContain('data-context-submit="cycle/research"');
    expect(html).not.toContain('Quick Commands');
    expect(html).not.toContain('All Commands');
    expect(html).toContain('Latest Preview');
    expect(html).not.toContain('No artifact captured yet.');
    expect(html).toContain('No active cycle. Use the next safe step to begin.');
    expect(html).not.toContain('.reviewops/metrics/review-work.yaml');
    expect(html).not.toContain('.reviewops/knowledge/project-debt.yaml');
    expect(html).not.toContain('Review work metrics');
    expect(html).not.toContain('Project debt register');
    expect(html).toContain('body { color: var(--vscode-foreground);');
    expect(html).toContain('overflow: hidden;');
    expect(html).toContain('.command-main { display: grid; gap: 18px; min-width: 0; min-height: 0; overflow: auto;');
    expect(html).toContain('.result-panel { display: grid; gap: 14px; align-content: start; min-height: 0; overflow: auto;');
    expect(html).toContain('Initialize &lt;Project&gt;');
    expect(html).not.toContain('data-command-options-id="diff/review" disabled');
    expect(html).not.toContain('data-command-options-id="field/report" disabled');
    expect(html).not.toContain('Configure scope');
    expect(html).not.toContain('Scope label (optional)');
    expect(html).not.toContain('Start with Scope');
    expect(html).toContain('vscode.postMessage({ type: "runCommandWithOptions", commandId, commandOptions });');
    expect(html).toContain('vscode.postMessage({ type: "startCycleWithContext", commandId, startContext: { scopeLabel, intent, targetMode, targetFiles } });');
    expect(html).toContain('vscode.postMessage({ type: "skipOptionalStep", commandId });');
    expect(html).toContain('vscode.postMessage({ type: "setExperienceMode", experienceMode });');
    expect(html).toContain('document.body.setAttribute("aria-busy", "true");');
    expect(html).toContain('const runningLabel = "Running";');
    expect(html).toContain('vscode.getState();');
    expect(html).toContain('vscode.setState({ ...currentState, commandCenterUi: { forms } });');
    expect(html).toContain('restoreCommandCenterUiState();');
    expect(html).toContain('window.addEventListener("pagehide", () => persistCommandCenterUiState());');
    expect(html).toContain('persistCommandCenterUiState(form);');
    expect(html).toContain('findCommandCenterForm(button, `[data-options-form="${id}"]`)');
    expect(html).toContain('activeButton.textContent = runningLabel');
    expect(html).toContain('vscode.postMessage({ type: "openFile", relativePath });');
    expect(html).not.toContain('Initialize <Project>');
  });

  it('keeps start-cycle choices out of the details panel', () => {
    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: null,
        nextActions: []
      },
      commands: [
        {
          id: 'cycle/mr-review',
          kind: 'cycle',
          category: 'start-cycle',
          label: 'Start MR Review Cycle',
          summary: 'Review.',
          outcome: 'Target selection is next.',
          effects: ['Writes .reviewops.local/current-cycle.local.json'],
          vsCodeCommand: 'reviewops.commandCenter',
          requiresInitialized: true,
          requiresConfirmation: false,
          aliases: []
        },
        {
          id: 'cycle/research',
          kind: 'cycle',
          category: 'start-cycle',
          label: 'Start Research Cycle',
          summary: 'Investigate.',
          outcome: 'Target selection is next.',
          effects: ['Writes .reviewops.local/current-cycle.local.json'],
          vsCodeCommand: 'reviewops.commandCenter',
          requiresInitialized: true,
          requiresConfirmation: false,
          aliases: []
        }
      ],
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });

    expect(html).toContain('More actions');
    expect(html).toContain('No active cycle. Use the next safe step to begin.');
    expect(html).not.toContain('data-command-id="cycle/mr-review"');
    expect(html).not.toContain('data-command-id="cycle/research"');
    expect(html).not.toContain('data-cycle-context-id="cycle/research-workflow"');
    expect(html).not.toContain('data-context-form="cycle/research-workflow"');
    expect(html).not.toContain('Configure scope');
    expect(html).not.toContain('Start with Scope');
  });

  it('renders the senior console with command input, run queue, and rule approval context', () => {
    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: null,
        nextActions: []
      },
      commands: listReviewOpsCommandCatalog(),
      nonce: 'testnonce',
      cspSource: 'vscode-resource:',
      experienceMode: 'console'
    });

    expect(html).toContain('<h1>ReviewOps Console</h1>');
    expect(html).toContain('id="reviewops-command-input"');
    expect(html).toContain('review target / rule / test');
    expect(html).toContain('Quick Commands');
    expect(html).toContain('<kbd>Shift+E</kbd>');
    expect(html).toContain('<span>Tests</span>');
    expect(html).toContain('Command Table');
    expect(html).toContain('Artifact output summary');
    expect(html).toContain('Run Queue');
    expect(html).toContain('Planned run order');
    expect(html).toContain('section class="section-panel workflow-panel queue-panel batch-queue-panel"');
    expect(html).toContain('Rule Candidates');
    expect(html).toContain('section class="section-panel workflow-panel queue-panel approval-queue-panel"');
    expect(html).toContain('.console-side { display: flex; flex-direction: column;');
    expect(html).toContain('.console-side > .section-panel { flex: 0 0 auto; }');
    expect(html).toContain('Run Log');
    expect(html).not.toContain('commandIndex =');
    expect(html).toContain('vscode.postMessage({ type: "runCommandInput", inputValue });');
    expect(html).toContain('vscode.postMessage({ type: "runCommandBatch"');
    expect(html).toContain('data-experience-mode="guide"');
    expect(html).toContain('aria-pressed="true">Console</button>');
  });

  it('renders a runnable next-step control for every cycle start pattern', () => {
    const cycleIds = [
      'cycle/mr-review',
      'cycle/comment-response',
      'cycle/fix-review',
      'cycle/research',
      'cycle/refactoring',
      'cycle/field-report'
    ] as const;
    const commands = listReviewOpsCommandCatalog();

    for (const cycleId of cycleIds) {
      const currentCycle = createReviewOpsCycle({
        cycleId,
        runId: `run-${cycleId.replace('/', '-')}`,
        startedAt: '2026-05-05T09:00:00.000Z',
        startContext:
          cycleId === 'cycle/research' || cycleId === 'cycle/refactoring'
            ? {
                scopeLabel: 'Scoped workflow',
                intent: 'Keep the cycle runnable.',
                targetMode: 'manual'
              }
            : undefined
      });
      const nextFlowId = currentCycle.nextActions[0]?.flowId;
      const html = renderCommandCenterHtml({
        status: {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle,
          nextActions: currentCycle.nextActions
        },
        commands,
        nonce: 'testnonce',
        cspSource: 'vscode-resource:'
      });

      expect(nextFlowId, cycleId).toBeDefined();
      const expectedCommandId = cycleId === 'cycle/comment-response' ? 'review/comment-triage' : nextFlowId;
      expect(html, cycleId).toContain(`data-command-id="${expectedCommandId}"`);
    }
  });

  it('does not expose management local files in command center details', () => {
    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: null,
        nextActions: []
      },
      commands: [],
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });

    expect(html).not.toContain('.reviewops/metrics/review-work.yaml');
    expect(html).not.toContain('.reviewops/knowledge/project-debt.yaml');
    expect(html).not.toContain('data-open-file=".reviewops/metrics/review-work.yaml"');
    expect(html).not.toContain('data-open-file=".reviewops/knowledge/project-debt.yaml"');
  });

  it('renders command center run results with escaped artifact previews', () => {
    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: null,
        nextActions: [
          {
            id: 'next-fix',
            title: 'Plan <fix>',
            flowId: 'fix/plan',
            reason: 'Continue <safely>'
          }
        ]
      },
      commands: [
        {
          id: 'fix/plan',
          kind: 'flow',
          category: 'prepare-work',
          label: 'Plan Review Fix',
          summary: 'Plan.',
          outcome: 'Opens a fix-plan artifact.',
          effects: ['Writes fix plan artifacts'],
          vsCodeCommand: 'reviewops.planReviewFix',
          requiresInitialized: true,
          requiresConfirmation: false,
          aliases: []
        }
      ],
      nonce: 'testnonce',
      cspSource: 'vscode-resource:',
      runResult: {
        status: 'success',
        title: 'Prepared <artifact>',
        message: 'Captured <one> artifact.',
        artifactPaths: ['.reviewops/out/diff-review/run_1/prompt.md'],
        preview: {
          path: '.reviewops/out/diff-review/run_1/prompt.md',
          language: 'markdown',
          content: '# Prompt <script>alert("x")</script>'
        },
        nextActions: [
          {
            title: 'Plan <fix>',
            flowId: 'fix/plan',
            reason: 'Continue <safely>'
          }
        ]
      }
    });

    expect(html).toContain('Success');
    expect(html).toContain('Prepared &lt;artifact&gt;');
    expect(html).toContain('Captured &lt;one&gt; artifact.');
    expect(html).toContain('.reviewops/out/diff-review/run_1/prompt.md');
    expect(html).toContain('class="secondary" data-open-file=".reviewops/out/diff-review/run_1/prompt.md"');
    expect(html).toContain('Main result: Review prompt');
    expect(html).toContain('Open Review prompt');
    expect(html).not.toContain('Open result');
    expect(html).toContain('# Prompt &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('.reviewops/out/diff-review/run_1/prompt.md · markdown');
    expect(html).toContain('Plan Review Fix');
    expect(html).not.toContain('Plan &lt;fix&gt;');
    expect(html).not.toContain('<h3>Artifacts</h3>');
    expect(html).not.toContain('<script>alert');
  });

  it('renders active cycle workflow position with escaped start context', () => {
    const currentCycle = createReviewOpsCycle({
      cycleId: 'cycle/research',
      runId: 'run-context',
      startedAt: '2026-05-05T09:00:00.000Z',
      startContext: {
        scopeLabel: 'auth <module>',
        intent: 'Investigate <risk> before refactor.',
        targetMode: 'selected-files',
        targetFiles: ['packages/auth/<login>.ts']
      }
    });
    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle,
        nextActions: currentCycle.nextActions
      },
      commands: [
        {
          id: 'research/select-scope',
          kind: 'flow',
          category: 'prepare-work',
          label: 'Select Research Scope',
          summary: 'Select.',
          outcome: 'Scope is selected.',
          effects: ['Reads workspace'],
          vsCodeCommand: 'reviewops.prepareLocalDiffReview',
          requiresInitialized: true,
          requiresConfirmation: false,
          aliases: []
        }
      ],
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });

    expect(html).toContain('Workflow Map');
    expect(html).toContain('Current Position');
    expect(html).toContain('workflow-step ready');
    expect(html).toContain('workflow-step pending');
    expect(html).toContain('Scope');
    expect(html).toContain('auth &lt;module&gt;');
    expect(html).not.toContain('Investigate &lt;risk&gt; before refactor.');
    expect(html).not.toContain('packages/auth/&lt;login&gt;.ts');
    expect(html).not.toContain('research/select-scope</div>');
    expect(html).toContain('data-command-id="research/select-scope"');
    expect(html).toContain('data-command-options-id="research/select-scope"');
    expect(html).toContain('data-options-form="research/select-scope"');
    const recommendedHtml = html.slice(html.indexOf('Next Safe Step'), html.indexOf('More actions'));
    expect(recommendedHtml).toContain('data-command-id="research/select-scope"');
    expect(recommendedHtml).not.toContain('data-command-options-id="research/select-scope"');
    expect(html.slice(html.indexOf('More actions'))).toContain('Advanced current action');
    expect(html).toContain('Working tree vs HEAD');
    expect(html).not.toContain('auth <module>');
  });

  it('renders configured input controls for every Command Center configurable pattern', () => {
    for (const commandId of [
      'review/select-target',
      'diff/review',
      'research/select-scope',
      'research/investigate',
      'provider/fetch-review',
      'review/comment-triage',
      'rules/propose',
      'field/report'
    ]) {
      const html = renderCommandCenterHtml({
        status: {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle: null,
          nextActions: [
            {
              id: `next-${commandId}`,
              title: `Continue ${commandId}`,
              flowId: commandId,
              reason: `${commandId} is the next active command.`
            }
          ]
        },
        commands: listReviewOpsCommandCatalog(),
        nonce: 'testnonce',
        cspSource: 'vscode-resource:'
      });

      expect(html, commandId).toContain(`data-command-options-id="${commandId}"`);
      expect(html, commandId).toContain(`data-options-form="${commandId}"`);
      expect(html, commandId).toContain(`data-options-submit="${commandId}"`);
    }

    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: null,
        nextActions: [
          {
            id: 'next-diff',
            title: 'Continue diff review',
            flowId: 'diff/review',
            reason: 'Diff review is the next active command.'
          }
        ]
      },
      commands: listReviewOpsCommandCatalog(),
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });
    expect(html).toContain('Working tree vs HEAD');
    expect(html).toContain('Staged changes');
    expect(html).toContain('Git range');
    expect(html).toContain('if (mode === "range" && !baseRef) { return undefined; }');
    expect(html).toContain('Target files are required when Selected files is chosen.');
    expect(html).toContain('if (targetMode === "selected-files" && targetFiles.length === 0)');
    expect(html).not.toContain('data-skip-optional-id="response/import"');
  });

  it('renders optional import and rule steps as skip-first only when they are active', () => {
    const commands = listReviewOpsCommandCatalog();
    const responseCycle = createReviewOpsCycle({
      cycleId: 'cycle/fix-review',
      runId: 'fix-review-run',
      startedAt: '2026-05-05T09:00:00.000Z'
    });
    const responseCurrentCycle = {
      ...responseCycle,
      steps: responseCycle.steps.map((step) =>
        step.flowId === 'review/select-target' || step.flowId === 'diff/review'
          ? { ...step, status: 'completed' as const }
          : step.flowId === 'response/import'
            ? { ...step, status: 'ready' as const }
            : step
      ),
      nextActions: [
        {
          id: 'response-import',
          title: 'Continue Import Manual Review Response',
          flowId: 'response/import',
          reason: 'Fix Review Cycle is active; response import is optional.'
        }
      ]
    };
    const responseHtml = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: responseCurrentCycle,
        nextActions: responseCurrentCycle.nextActions
      },
      commands,
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });

    const responseRecommendedHtml = responseHtml.slice(
      responseHtml.indexOf('Next Safe Step'),
      responseHtml.indexOf('More actions')
    );
    expect(responseRecommendedHtml).toContain('data-skip-optional-id="response/import"');
    expect(responseRecommendedHtml).toContain('Continue to plan');
    expect(responseRecommendedHtml).not.toContain('Import response');
    expect(responseHtml.slice(responseHtml.indexOf('More actions'))).toContain('Import response');

    const rulesCycle = createReviewOpsCycle({
      cycleId: 'cycle/refactoring',
      runId: 'refactor-run',
      startedAt: '2026-05-05T09:00:00.000Z',
      startContext: {
        scopeLabel: 'Current workspace',
        intent: 'Plan the smallest safe refactoring path for the current workspace.',
        targetMode: 'current-diff'
      }
    });
    const rulesCurrentCycle = {
      ...rulesCycle,
      steps: rulesCycle.steps.map((step) =>
        ['refactor/plan', 'refactor/checklist', 'refactor/verify', 'refactor/explain'].includes(step.flowId)
          ? { ...step, status: 'completed' as const }
          : step.flowId === 'rules/propose'
            ? { ...step, status: 'ready' as const }
            : step
      ),
      nextActions: [
        {
          id: 'rules-propose',
          title: 'Continue Propose Reusable Refactor Rules',
          flowId: 'rules/propose',
          reason: 'Refactoring Cycle is active; rule capture is optional.'
        }
      ]
    };
    const rulesHtml = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: rulesCurrentCycle,
        nextActions: rulesCurrentCycle.nextActions
      },
      commands,
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });

    const rulesRecommendedHtml = rulesHtml.slice(rulesHtml.indexOf('Next Safe Step'), rulesHtml.indexOf('More actions'));
    expect(rulesRecommendedHtml).toContain('data-skip-optional-id="rules/propose"');
    expect(rulesRecommendedHtml).toContain('Skip rules');
    expect(rulesRecommendedHtml).not.toContain('Propose rules');
    expect(rulesHtml.slice(rulesHtml.indexOf('More actions'))).toContain('Propose rules');
  });

  it('runs context-free command center cycle commands through current-cycle state', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-cycle-'));
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle: null,
      nextActions: []
    };

    await expect(executeReviewOpsCommandCenterCommand('cycle/mr-review', status, vi.fn())).resolves.toBe(true);

    const currentCycle = await (await import('../packages/core/src/index')).loadCurrentReviewOpsCycle(workspaceRoot);
    expect(currentCycle?.cycleId).toBe('cycle/mr-review');
    expect(currentCycle?.nextActions[0]?.flowId).toBe('review/select-target');
    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareLocalDiffReview');
  });

  it('runs scoped command center cycles without start context by using default scope', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-default-scope-'));
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();
    const showWarningMessage = vi.mocked(vscode.window.showWarningMessage);
    showWarningMessage.mockClear();
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle: null,
      nextActions: []
    };

    await expect(executeReviewOpsCommandCenterCommand('cycle/research', status, vi.fn())).resolves.toBe(true);

    const currentCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
    expect(currentCycle?.cycleId).toBe('cycle/research');
    expect(currentCycle?.startContext).toEqual({
      scopeLabel: 'Current workspace',
      intent: 'Investigate the current workspace and identify concrete risks, decisions, and next actions.',
      targetMode: 'current-diff'
    });
    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareLocalDiffReview');
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it('rejects selected-files scoped cycles without target files', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-missing-target-files-'));
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();
    const showWarningMessage = vi.mocked(vscode.window.showWarningMessage);
    showWarningMessage.mockClear();
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle: null,
      nextActions: []
    };

    await expect(
      executeReviewOpsCommandCenterCommand('cycle/research', status, vi.fn(), {
        scopeLabel: 'Auth module',
        intent: 'Investigate selected files.',
        targetMode: 'selected-files',
        targetFiles: []
      })
    ).resolves.toBe(false);

    const currentCycle = await (await import('../packages/core/src/index')).loadCurrentReviewOpsCycle(workspaceRoot);
    expect(currentCycle).toBeNull();
    expect(executeCommand).not.toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalledWith(
      'ReviewOps needs target files before starting Start Research Cycle with Selected files.'
    );
  });

  it('skips optional research import and creates an action plan from cycle context', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-skip-research-import-'));
    const showInformationMessage = vi.mocked(vscode.window.showInformationMessage);
    const showTextDocument = vi.mocked(vscode.window.showTextDocument);
    const openTextDocument = vi.mocked(vscode.workspace.openTextDocument);
    showInformationMessage.mockClear();
    showTextDocument.mockClear();
    openTextDocument.mockClear();
    const startContext = {
      scopeLabel: 'Auth module',
      intent: 'Investigate auth risks before release.',
      targetMode: 'manual' as const
    };
    const baseCycle = createReviewOpsCycle({
      cycleId: 'cycle/research',
      runId: 'research-run',
      startedAt: '2026-05-05T09:00:00.000Z',
      startContext
    });
    const currentCycle = {
      ...baseCycle,
      steps: baseCycle.steps.map((step) =>
        step.flowId === 'research/select-scope' || step.flowId === 'research/investigate'
          ? { ...step, status: 'completed' as const }
          : step.flowId === 'research/import-findings'
            ? { ...step, status: 'ready' as const }
            : step
      ),
      nextActions: [
        {
          id: 'research-import-findings',
          title: 'Continue Import Research Findings',
          flowId: 'research/import-findings',
          reason: 'Research Cycle is active; findings import is optional.'
        }
      ]
    };
    await saveCurrentReviewOpsCycle({ workspaceRoot, currentCycle });
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle,
      nextActions: currentCycle.nextActions
    };

    await expect(skipOptionalResearchImportStep('research/import-findings', status, vi.fn())).resolves.toBe(true);

    const reloadedCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'research/import-findings')?.status).toBe('completed');
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'research/normalize-findings')?.status).toBe('completed');
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'research/action-plan')?.status).toBe('completed');
    expect(reloadedCycle?.nextActions[0]?.flowId).toBe('knowledge/capture-candidates');
    const actionPlan = await loadLatestReviewOpsArtifact<ReviewActionPlanItem[]>({
      workspaceRoot,
      flowSlug: 'research-action-plan',
      artifactName: 'action-plan.json',
      parse: (content) => JSON.parse(content) as ReviewActionPlanItem[]
    });
    expect(actionPlan?.[0]?.title).toBe('Investigate auth risks before release.');
    expect(openTextDocument).toHaveBeenCalled();
    expect(showTextDocument).toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'ReviewOps continued without importing an external response and wrote a default action plan.'
    );
  });

  it('skips optional review response import for non-research cycles', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-skip-response-import-'));
    const showInformationMessage = vi.mocked(vscode.window.showInformationMessage);
    showInformationMessage.mockClear();
    const baseCycle = createReviewOpsCycle({
      cycleId: 'cycle/fix-review',
      runId: 'fix-review-run',
      startedAt: '2026-05-05T09:00:00.000Z'
    });
    const currentCycle = {
      ...baseCycle,
      steps: baseCycle.steps.map((step) =>
        step.flowId === 'review/select-target' || step.flowId === 'diff/review'
          ? { ...step, status: 'completed' as const }
          : step.flowId === 'response/import'
            ? { ...step, status: 'ready' as const }
            : step
      ),
      nextActions: [
        {
          id: 'response-import',
          title: 'Continue Import Manual Review Response',
          flowId: 'response/import',
          reason: 'Fix Review Cycle is active; response import is optional.'
        }
      ]
    };
    await saveCurrentReviewOpsCycle({ workspaceRoot, currentCycle });
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle,
      nextActions: currentCycle.nextActions
    };

    await expect(skipOptionalCommandCenterStep('response/import', status, vi.fn())).resolves.toBe(true);

    const reloadedCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'response/import')?.status).toBe('completed');
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'response/normalize')?.status).toBe('completed');
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'review/action-plan')?.status).toBe('completed');
    expect(reloadedCycle?.nextActions[0]?.flowId).toBe('fix/plan');
    const actionPlan = await loadLatestReviewOpsArtifact<ReviewActionPlanItem[]>({
      workspaceRoot,
      flowSlug: 'review-action-plan',
      artifactName: 'action-plan.json',
      parse: (content) => JSON.parse(content) as ReviewActionPlanItem[]
    });
    expect(actionPlan?.[0]?.title).toBe('Review the current fix and verify remaining reviewer risk.');
    expect(showInformationMessage).toHaveBeenCalledWith(
      'ReviewOps continued without importing an external response and wrote a default action plan.'
    );
  });

  it('skips optional rule application without requiring rule selection', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-skip-rules-'));
    const showInformationMessage = vi.mocked(vscode.window.showInformationMessage);
    showInformationMessage.mockClear();
    const baseCycle = createReviewOpsCycle({
      cycleId: 'cycle/refactoring',
      runId: 'refactor-run',
      startedAt: '2026-05-05T09:00:00.000Z',
      startContext: {
        scopeLabel: 'Current workspace',
        intent: 'Plan the smallest safe refactoring path for the current workspace.',
        targetMode: 'current-diff'
      }
    });
    const currentCycle = {
      ...baseCycle,
      steps: baseCycle.steps.map((step) =>
        ['refactor/plan', 'refactor/checklist', 'refactor/verify', 'refactor/explain', 'rules/propose', 'rules/reconcile'].includes(
          step.flowId
        )
          ? { ...step, status: 'completed' as const }
          : step.flowId === 'rules/apply'
            ? { ...step, status: 'ready' as const }
            : step
      ),
      nextActions: [
        {
          id: 'rules-apply',
          title: 'Continue Apply Approved Rules',
          flowId: 'rules/apply',
          reason: 'Refactoring Cycle is active; rule application is optional.'
        }
      ]
    };
    await saveCurrentReviewOpsCycle({ workspaceRoot, currentCycle });
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle,
      nextActions: currentCycle.nextActions
    };

    await expect(skipOptionalCommandCenterStep('rules/apply', status, vi.fn())).resolves.toBe(true);

    const reloadedCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'rules/apply')?.status).toBe('completed');
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'rules/update')?.status).toBe('completed');
    expect(reloadedCycle?.nextActions[0]?.flowId).toBe('knowledge/capture-candidates');
    expect(showInformationMessage).toHaveBeenCalledWith('ReviewOps skipped optional rules and continued the cycle.');
  });

  it('skips the optional rule phase from rule proposal without creating a rule selection step', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-skip-rule-proposal-'));
    const showInformationMessage = vi.mocked(vscode.window.showInformationMessage);
    showInformationMessage.mockClear();
    const baseCycle = createReviewOpsCycle({
      cycleId: 'cycle/refactoring',
      runId: 'refactor-run',
      startedAt: '2026-05-05T09:00:00.000Z',
      startContext: {
        scopeLabel: 'Current workspace',
        intent: 'Plan the smallest safe refactoring path for the current workspace.',
        targetMode: 'current-diff'
      }
    });
    const currentCycle = {
      ...baseCycle,
      steps: baseCycle.steps.map((step) =>
        ['refactor/plan', 'refactor/checklist', 'refactor/verify', 'refactor/explain'].includes(step.flowId)
          ? { ...step, status: 'completed' as const }
          : step.flowId === 'rules/propose'
            ? { ...step, status: 'ready' as const }
            : step
      ),
      nextActions: [
        {
          id: 'rules-propose',
          title: 'Continue Propose Reusable Refactor Rules',
          flowId: 'rules/propose',
          reason: 'Refactoring Cycle is active; rule capture is optional.'
        }
      ]
    };
    await saveCurrentReviewOpsCycle({ workspaceRoot, currentCycle });
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle,
      nextActions: currentCycle.nextActions
    };

    await expect(skipOptionalCommandCenterStep('rules/propose', status, vi.fn())).resolves.toBe(true);

    const reloadedCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
    for (const flowId of ['rules/propose', 'rules/reconcile', 'rules/apply', 'rules/update']) {
      expect(reloadedCycle?.steps.find((step) => step.flowId === flowId)?.status).toBe('completed');
    }
    expect(reloadedCycle?.nextActions[0]?.flowId).toBe('knowledge/capture-candidates');
    expect(showInformationMessage).toHaveBeenCalledWith('ReviewOps skipped optional rules and continued the cycle.');
  });

  it('runs scoped command center cycles with start context', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-command-center-scoped-cycle-'));
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();
    const status = {
      workspaceRoot,
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle: null,
      nextActions: []
    };

    await expect(
      executeReviewOpsCommandCenterCommand('cycle/refactoring', status, vi.fn(), {
        scopeLabel: 'UI command center',
        intent: 'Reduce flow confusion.',
        targetMode: 'manual',
        targetFiles: ['packages/vscode-extension/src/extension.ts']
      })
    ).resolves.toBe(true);

    const currentCycle = await (await import('../packages/core/src/index')).loadCurrentReviewOpsCycle(workspaceRoot);
    expect(currentCycle?.cycleId).toBe('cycle/refactoring');
    expect(currentCycle?.startContext).toEqual({
      scopeLabel: 'UI command center',
      intent: 'Reduce flow confusion.',
      targetMode: 'manual',
      targetFiles: ['packages/vscode-extension/src/extension.ts']
    });
    expect(currentCycle?.nextActions[0]?.flowId).toBe('refactor/plan');
    expect(executeCommand).toHaveBeenCalledWith('reviewops.planReviewFix');
  });

  it('runs command center flow commands through the registered VS Code command', async () => {
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();

    await expect(
      executeReviewOpsCommandCenterCommand(
        'diff/review',
        {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle: null,
          nextActions: []
        },
        vi.fn()
      )
    ).resolves.toBe(true);

    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareLocalDiffReview');
  });

  it('routes active comment response fetch directly to comment triage', async () => {
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();
    const currentCycle = createReviewOpsCycle({
      cycleId: 'cycle/comment-response',
      runId: 'run-comment-response',
      startedAt: '2026-05-05T09:00:00.000Z'
    });

    await expect(
      executeReviewOpsCommandCenterCommand(
        'provider/fetch-review',
        {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle,
          nextActions: currentCycle.nextActions
        },
        vi.fn()
      )
    ).resolves.toBe(true);

    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareGitHubCommentTriage');
  });

  it('shows comment triage as the next safe step inside an active comment-response cycle', () => {
    const currentCycle = createReviewOpsCycle({
      cycleId: 'cycle/comment-response',
      runId: 'run-comment-response',
      startedAt: '2026-05-05T09:00:00.000Z'
    });
    const html = renderCommandCenterHtml({
      status: {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle,
        nextActions: currentCycle.nextActions
      },
      commands: listReviewOpsCommandCatalog(),
      nonce: 'testnonce',
      cspSource: 'vscode-resource:'
    });
    const recommendedStart = html.indexOf('Next Safe Step');
    const recommendedEnd = html.indexOf('More actions');
    const recommendedHtml = html.slice(recommendedStart, recommendedEnd);

    expect(recommendedHtml).toContain('Prepare GitHub Comment Triage');
    expect(recommendedHtml).not.toContain('Prepare GitHub Pull Request Review');
    expect(recommendedHtml).toContain('data-command-id="review/comment-triage"');
    expect(recommendedHtml).not.toContain('data-command-id="provider/fetch-review"');
  });

  it('keeps direct provider fetch available as GitHub PR prompt preparation outside active cycles', async () => {
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();

    await expect(
      executeReviewOpsCommandCenterCommand(
        'provider/fetch-review',
        {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle: null,
          nextActions: []
        },
        vi.fn()
      )
    ).resolves.toBe(true);

    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareGitHubPullRequestReview');
  });

  it('passes configured command options through the command center dispatcher', async () => {
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();

    await expect(
      executeReviewOpsCommandCenterCommand(
        'diff/review',
        {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle: null,
          nextActions: []
        },
        vi.fn(),
        undefined,
        {
          localDiff: {
            mode: 'range',
            baseRef: 'origin/main',
            headRef: 'HEAD'
          }
        }
      )
    ).resolves.toBe(true);

    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareLocalDiffReview', {
      localDiff: {
        mode: 'range',
        baseRef: 'origin/main',
        headRef: 'HEAD'
      }
    });
  });

  it('passes configured target-selection options through the command center dispatcher', async () => {
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();

    await expect(
      executeReviewOpsCommandCenterCommand(
        'review/select-target',
        {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle: null,
          nextActions: []
        },
        vi.fn(),
        undefined,
        {
          localDiff: {
            mode: 'staged'
          }
        }
      )
    ).resolves.toBe(true);

    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareLocalDiffReview', {
      localDiff: {
        mode: 'staged'
      }
    });
  });

  it('passes all configured non-diff command options through the command center dispatcher', async () => {
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();
    const status = {
      workspaceRoot: '/workspace',
      initialized: true,
      sharedDirExists: true,
      localDirExists: true,
      flowCount: 35,
      currentCycle: null,
      nextActions: []
    };

    await expect(
      executeReviewOpsCommandCenterCommand('provider/fetch-review', status, vi.fn(), undefined, {
        githubTarget: {
          repository: 'owner/repo',
          pullRequestNumber: '12'
        }
      })
    ).resolves.toBe(true);
    await expect(
      executeReviewOpsCommandCenterCommand('review/comment-triage', status, vi.fn(), undefined, {
        githubTarget: {
          repository: 'owner/repo',
          pullRequestNumber: 12
        }
      })
    ).resolves.toBe(true);
    await expect(
      executeReviewOpsCommandCenterCommand('rules/propose', status, vi.fn(), undefined, {
        ruleProposal: {
          title: 'Require focused verification',
          rationale: 'Risky fixes need concrete verification.'
        }
      })
    ).resolves.toBe(true);
    await expect(
      executeReviewOpsCommandCenterCommand('field/report', status, vi.fn(), undefined, {
        fieldReport: {
          from: '2026-05-01',
          to: '2026-05-06',
          targetScope: 'team'
        }
      })
    ).resolves.toBe(true);

    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareGitHubPullRequestReview', {
      githubTarget: {
        repository: 'owner/repo',
        pullRequestNumber: '12'
      }
    });
    expect(executeCommand).toHaveBeenCalledWith('reviewops.prepareGitHubCommentTriage', {
      githubTarget: {
        repository: 'owner/repo',
        pullRequestNumber: 12
      }
    });
    expect(executeCommand).toHaveBeenCalledWith('reviewops.proposeRules', {
      ruleProposal: {
        title: 'Require focused verification',
        rationale: 'Risky fixes need concrete verification.'
      }
    });
    expect(executeCommand).toHaveBeenCalledWith('reviewops.generateFieldReport', {
      fieldReport: {
        from: '2026-05-01',
        to: '2026-05-06',
        targetScope: 'team'
      }
    });
  });

  it('ignores command center messages outside the catalog', async () => {
    await expect(
      executeReviewOpsCommandCenterCommand(
        'unknown/command',
        {
          workspaceRoot: '/workspace',
          initialized: true,
          sharedDirExists: true,
          localDirExists: true,
          flowCount: 35,
          currentCycle: null,
          nextActions: []
        },
        vi.fn()
      )
    ).resolves.toBe(false);
  });

  it('delegates confirmation-gated command center items to existing commands', async () => {
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    executeCommand.mockClear();

    await executeReviewOpsCommandCenterCommand(
      'publish/summary-draft',
      {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: null,
        nextActions: []
      },
      vi.fn()
    );
    await executeReviewOpsCommandCenterCommand(
      'rules/apply',
      {
        workspaceRoot: '/workspace',
        initialized: true,
        sharedDirExists: true,
        localDirExists: true,
        flowCount: 35,
        currentCycle: null,
        nextActions: []
      },
      vi.fn()
    );

    expect(executeCommand).toHaveBeenCalledWith('reviewops.previewGitHubSummaryComment');
    expect(executeCommand).toHaveBeenCalledWith('reviewops.applyRules');
  });

  it('excludes previously applied rule candidates from another apply pass', () => {
    const candidate = createRuleCandidate('focused-verification');

    expect(isP0ApplicableRuleCandidate(candidate)).toBe(true);
    expect(isP0ApplicableRuleCandidate(candidate, new Set(['focused-verification']))).toBe(false);
  });

  it('creates unique ids for repeated manual rule candidates', () => {
    const first = createManualRuleCandidateSeed(
      'Require focused verification',
      'Risky review fixes should include verification.',
      new Date('2026-05-05T07:00:00.000Z')
    );
    const second = createManualRuleCandidateSeed(
      'Require focused verification',
      'Risky review fixes should include verification.',
      new Date('2026-05-05T07:01:00.000Z')
    );

    expect(first.id).toBe('manual-rule-run_20260505T070000000z');
    expect(second.id).toBe('manual-rule-run_20260505T070100000z');
    expect(first.id).not.toBe(second.id);
    expect(first.title).toBe('Require focused verification');
    expect(first.rationale).toBe('Risky review fixes should include verification.');
  });

  it('uses the imported action-plan seed recorded on the active cycle', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-action-seed-'));
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);
    const currentPlan = [createActionPlanSeed('current-action', 'Current action')];
    const stalePlan = [createActionPlanSeed('stale-action', 'Stale action')];
    const currentSeed = await artifactStore.write({
      flowId: 'response/import',
      runId: 'current-run',
      name: 'action-plan.seed.json',
      kind: 'json',
      content: `${JSON.stringify(currentPlan, null, 2)}\n`,
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'response/import',
      runId: 'stale-run',
      name: 'action-plan.seed.json',
      kind: 'json',
      content: `${JSON.stringify(stalePlan, null, 2)}\n`,
      createdAt: new Date().toISOString()
    });

    const cycle = createReviewOpsCycle({
      cycleId: 'cycle/mr-review',
      runId: 'cycle-run',
      startedAt: new Date(Date.now() - 1_000).toISOString()
    });
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: {
        ...cycle,
        steps: cycle.steps.map((step) =>
          step.flowId === 'response/normalize'
            ? {
                ...step,
                status: 'completed',
                artifacts: [
                  {
                    ...currentSeed,
                    flowId: 'response/normalize'
                  }
                ]
              }
            : step
        )
      }
    });

    await expect(loadLatestImportedActionPlanSeed(workspaceRoot)).resolves.toEqual([
      expect.objectContaining({
        id: 'current-action',
        title: 'Current action',
        source: 'response',
        steps: currentPlan[0].steps
      })
    ]);
  });

  it('does not load globally newer artifacts from before the active cycle', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-scoped-artifact-'));
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);
    const stalePlan = [createActionPlanItem('stale-action', 'Stale action')];
    await artifactStore.write({
      flowId: 'review/action-plan',
      runId: 'stale-run',
      name: 'action-plan.json',
      kind: 'json',
      content: `${JSON.stringify(stalePlan, null, 2)}\n`,
      createdAt: new Date().toISOString()
    });

    const cycle = createReviewOpsCycle({
      cycleId: 'cycle/comment-response',
      runId: 'cycle-run',
      startedAt: new Date(Date.now() + 60_000).toISOString()
    });
    await saveCurrentReviewOpsCycle({
      workspaceRoot,
      currentCycle: cycle
    });

    await expect(
      loadLatestReviewOpsArtifact<ReviewActionPlanItem[]>({
        workspaceRoot,
        flowSlug: 'review-action-plan',
        artifactName: 'action-plan.json',
        parse: (content) => JSON.parse(content) as ReviewActionPlanItem[]
      })
    ).resolves.toBeUndefined();
  });

  it('loads rule candidates for the active approval step', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-rule-candidates-'));
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);
    await artifactStore.write({
      flowId: 'knowledge/capture-candidates',
      runId: 'rule-run',
      name: 'rule-candidates.json',
      kind: 'json',
      content: `${JSON.stringify(
        [
          {
            id: 'focused-verification',
            kind: 'test-rule',
            title: 'Require focused verification before review replies',
            rationale: 'Risky fixes should include the smallest relevant verification command.',
            source: {
              flowRunId: 'rule-run'
            },
            scope: 'portable-candidate',
            status: 'new'
          }
        ],
        null,
        2
      )}\n`,
      createdAt: new Date().toISOString()
    });

    await expect(loadLatestRuleCandidates(workspaceRoot)).resolves.toEqual([
      expect.objectContaining({
        id: 'focused-verification',
        scope: 'portable-candidate',
        status: 'new'
      })
    ]);
  });

  it('loads rule application payloads for non-applying updates', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-rule-application-'));
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);
    await artifactStore.write({
      flowId: 'rules/apply',
      runId: 'rule-apply-run',
      name: 'rule-application.json',
      kind: 'json',
      content: `${JSON.stringify(
        {
          approvedCandidateIds: ['focused-verification'],
          saved: [
            {
              candidateId: 'focused-verification',
              path: path.join('.reviewops', 'knowledge', 'test-rules.yaml')
            }
          ],
          skipped: [
            {
              candidateId: 'project-specific-rule',
              reason: 'Candidate was not approved by the user.'
            }
          ],
          actionLogPath: path.join('.reviewops', 'out', 'rule-applications.jsonl')
        },
        null,
        2
      )}\n`,
      createdAt: new Date().toISOString()
    });

    await expect(loadLatestRuleApplication(workspaceRoot)).resolves.toEqual({
      approvedCandidateIds: ['focused-verification'],
      saved: [
        {
          candidateId: 'focused-verification',
          path: path.join('.reviewops', 'knowledge', 'test-rules.yaml')
        }
      ],
      skipped: [
        {
          candidateId: 'project-specific-rule',
          reason: 'Candidate was not approved by the user.'
        }
      ],
      actionLogPath: path.join('.reviewops', 'out', 'rule-applications.jsonl')
    });
  });

  it('lists P0 artifact view items for knowledge, skill evidence, reports, and review work', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-artifact-view-'));
    await initializeReviewOpsProject({ workspaceRoot });
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);

    await artifactStore.write({
      flowId: 'knowledge/capture-candidates',
      runId: 'knowledge-run',
      name: 'portable-checklist.md',
      kind: 'markdown',
      content: '# Portable checklist\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'rules/apply',
      runId: 'rule-apply-run',
      name: 'rule-application.json',
      kind: 'json',
      content: '{"saved":[],"skipped":[]}\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'rules/update',
      runId: 'rule-update-run',
      name: 'rule-update.md',
      kind: 'markdown',
      content: '# Rule update\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'skill/evidence-capture',
      runId: 'skill-run',
      name: 'skill-evidence.json',
      kind: 'json',
      content: '[]\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'field/report',
      runId: 'report-run',
      name: 'field-report.md',
      kind: 'markdown',
      content: '# Field report\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'meta/readiness',
      runId: 'readiness-run',
      name: 'p0-readiness.md',
      kind: 'markdown',
      content: '# P0 readiness\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'review/action-plan',
      runId: 'triage-run',
      name: 'comment-triage.json',
      kind: 'json',
      content: '[]\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'review/action-plan',
      runId: 'triage-run',
      name: 'understanding-memo.md',
      kind: 'markdown',
      content: '# Understanding memo\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'review/action-plan',
      runId: 'triage-run',
      name: 'action-plan.json',
      kind: 'json',
      content: '[]\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'review/action-plan',
      runId: 'triage-run',
      name: 'reply-drafts.json',
      kind: 'json',
      content: '[]\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'review/action-plan',
      runId: 'triage-run',
      name: 'publish.draft.md',
      kind: 'markdown',
      content: '# Reply publish draft\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'fix/checklist',
      runId: 'fix-run',
      name: 'fix-checklist.md',
      kind: 'markdown',
      content: '# Fix checklist\n',
      createdAt: new Date().toISOString()
    });
    await artifactStore.write({
      flowId: 'fix/checklist',
      runId: 'fix-run',
      name: 'test-scenarios.md',
      kind: 'markdown',
      content: '# Test scenarios\n',
      createdAt: new Date().toISOString()
    });

    const knowledgePrimary = await listReviewOpsArtifactViewItems(workspaceRoot, 'knowledge');
    const knowledgeAll = await listReviewOpsArtifactViewItems(workspaceRoot, 'knowledge', { surface: 'all' });
    const skillEvidencePrimary = await listReviewOpsArtifactViewItems(workspaceRoot, 'skill-evidence');
    const skillEvidenceAll = await listReviewOpsArtifactViewItems(workspaceRoot, 'skill-evidence', { surface: 'all' });
    const reportsPrimary = await listReviewOpsArtifactViewItems(workspaceRoot, 'reports');
    const reportsAll = await listReviewOpsArtifactViewItems(workspaceRoot, 'reports', { surface: 'all' });
    const reviewWorkPrimary = await listReviewOpsArtifactViewItems(workspaceRoot, 'review-work');
    const reviewWorkAll = await listReviewOpsArtifactViewItems(workspaceRoot, 'review-work', { surface: 'all' });

    expect(knowledgePrimary).toEqual([]);
    expect(knowledgeAll).toContainEqual(
      expect.objectContaining({
        label: 'Portable checklist',
        path: path.join('.reviewops', 'out', 'knowledge-capture-candidates', 'knowledge-run', 'portable-checklist.md')
      })
    );
    expect(knowledgeAll).toContainEqual(
      expect.objectContaining({
        label: 'Rule application',
        path: path.join('.reviewops', 'out', 'rules-apply', 'rule-apply-run', 'rule-application.json')
      })
    );
    expect(knowledgeAll).toContainEqual(
      expect.objectContaining({
        label: 'Rule update',
        path: path.join('.reviewops', 'out', 'rules-update', 'rule-update-run', 'rule-update.md')
      })
    );
    expect(skillEvidencePrimary).toEqual([]);
    expect(skillEvidenceAll).toContainEqual(
      expect.objectContaining({
        label: 'Skill evidence',
        path: path.join('.reviewops', 'out', 'skill-evidence-capture', 'skill-run', 'skill-evidence.json')
      })
    );
    expect(reportsPrimary).toContainEqual(
      expect.objectContaining({
        label: 'Field report',
        tooltip: 'Open this first',
        path: path.join('.reviewops', 'out', 'field-report', 'report-run', 'field-report.md')
      })
    );
    expect(reportsPrimary).not.toContainEqual(expect.objectContaining({ label: 'P0 readiness' }));
    expect(reportsAll).toContainEqual(
      expect.objectContaining({
        label: 'P0 readiness',
        path: path.join('.reviewops', 'out', 'meta-readiness', 'readiness-run', 'p0-readiness.md')
      })
    );
    expect(reportsAll).toContainEqual(
      expect.objectContaining({
        label: 'Review work metrics',
        description: 'workspace file',
        path: path.join('.reviewops', 'metrics', 'review-work.yaml')
      })
    );
    expect(reportsAll).toContainEqual(
      expect.objectContaining({
        label: 'Project debt register',
        path: path.join('.reviewops', 'knowledge', 'project-debt.yaml')
      })
    );
    expect(reviewWorkPrimary).not.toContainEqual(expect.objectContaining({ label: 'Comment triage' }));
    expect(reviewWorkAll).toContainEqual(
      expect.objectContaining({
        label: 'Comment triage',
        path: path.join('.reviewops', 'out', 'review-action-plan', 'triage-run', 'comment-triage.json')
      })
    );
    expect(reviewWorkPrimary).toContainEqual(
      expect.objectContaining({
        label: 'Understanding memo',
        path: path.join('.reviewops', 'out', 'review-action-plan', 'triage-run', 'understanding-memo.md')
      })
    );
    expect(reviewWorkAll).toContainEqual(
      expect.objectContaining({
        label: 'Triage action plan',
        path: path.join('.reviewops', 'out', 'review-action-plan', 'triage-run', 'action-plan.json')
      })
    );
    expect(reviewWorkAll).toContainEqual(
      expect.objectContaining({
        label: 'Triage reply drafts',
        path: path.join('.reviewops', 'out', 'review-action-plan', 'triage-run', 'reply-drafts.json')
      })
    );
    expect(reviewWorkPrimary).toContainEqual(
      expect.objectContaining({
        label: 'Triage reply publish draft',
        path: path.join('.reviewops', 'out', 'review-action-plan', 'triage-run', 'publish.draft.md')
      })
    );
    expect(reviewWorkPrimary).toContainEqual(
      expect.objectContaining({
        label: 'Fix checklist',
        path: path.join('.reviewops', 'out', 'fix-checklist', 'fix-run', 'fix-checklist.md')
      })
    );
    expect(reviewWorkPrimary).toContainEqual(
      expect.objectContaining({
        label: 'Test scenarios',
        path: path.join('.reviewops', 'out', 'fix-checklist', 'fix-run', 'test-scenarios.md')
      })
    );
    await expect(listReviewOpsArtifactQuickPickItems(workspaceRoot)).resolves.toContainEqual(
      expect.objectContaining({
        label: 'Field report',
        description: 'Reports',
        detail: 'Open this first',
        artifactPath: path.join('.reviewops', 'out', 'field-report', 'report-run', 'field-report.md'),
        viewId: 'reports'
      })
    );
    await expect(listReviewOpsArtifactQuickPickItems(workspaceRoot, { surface: 'all' })).resolves.toContainEqual(
      expect.objectContaining({
        label: 'P0 readiness',
        description: 'Reports',
        detail: path.join('.reviewops', 'out', 'meta-readiness', 'readiness-run', 'p0-readiness.md'),
        artifactPath: path.join('.reviewops', 'out', 'meta-readiness', 'readiness-run', 'p0-readiness.md'),
        viewId: 'reports'
      })
    );
  });

  it('keeps artifact paths intact while showing readable run time descriptions', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-artifact-run-time-'));
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);

    await artifactStore.write({
      flowId: 'knowledge/capture-candidates',
      runId: 'run_20260505T154832940z',
      name: 'portable-checklist.md',
      kind: 'markdown',
      content: '# Portable checklist\n',
      createdAt: new Date().toISOString()
    });

    await expect(listReviewOpsArtifactViewItems(workspaceRoot, 'knowledge', { surface: 'all' })).resolves.toContainEqual(
      expect.objectContaining({
        label: 'Portable checklist',
        description: '2026-05-06 00:48 JST',
        path: path.join('.reviewops', 'out', 'knowledge-capture-candidates', 'run_20260505T154832940z', 'portable-checklist.md')
      })
    );
  });

  it('shows only the latest primary artifact run by default', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'reviewops-artifact-latest-primary-'));
    const artifactStore = new FileSystemArtifactStore(workspaceRoot);

    await artifactStore.write({
      flowId: 'diff/review',
      runId: 'old-run',
      name: 'prompt.md',
      kind: 'markdown',
      content: '# Old prompt\n',
      createdAt: '2026-05-05T09:00:00.000Z'
    });
    await artifactStore.write({
      flowId: 'diff/review',
      runId: 'new-run',
      name: 'prompt.md',
      kind: 'markdown',
      content: '# New prompt\n',
      createdAt: '2026-05-05T09:01:00.000Z'
    });
    await utimes(
      path.join(workspaceRoot, '.reviewops', 'out', 'diff-review', 'old-run', 'prompt.md'),
      new Date('2026-05-05T09:00:00.000Z'),
      new Date('2026-05-05T09:00:00.000Z')
    );
    await utimes(
      path.join(workspaceRoot, '.reviewops', 'out', 'diff-review', 'new-run', 'prompt.md'),
      new Date('2026-05-05T09:01:00.000Z'),
      new Date('2026-05-05T09:01:00.000Z')
    );

    const primary = await listReviewOpsArtifactViewItems(workspaceRoot, 'review-work');
    expect(primary).toContainEqual(
      expect.objectContaining({
        label: 'Review prompt',
        tooltip: 'Open this first',
        path: path.join('.reviewops', 'out', 'diff-review', 'new-run', 'prompt.md')
      })
    );
    expect(primary).not.toContainEqual(
      expect.objectContaining({
        label: 'Review prompt',
        path: path.join('.reviewops', 'out', 'diff-review', 'old-run', 'prompt.md')
      })
    );

    await expect(listReviewOpsArtifactViewItems(workspaceRoot, 'review-work', { surface: 'all' })).resolves.toContainEqual(
      expect.objectContaining({
        label: 'Review prompt',
        tooltip: path.join('.reviewops', 'out', 'diff-review', 'old-run', 'prompt.md'),
        path: path.join('.reviewops', 'out', 'diff-review', 'old-run', 'prompt.md')
      })
    );
    expect((await listReviewOpsArtifactQuickPickItems(workspaceRoot)).filter((item) => item.viewId === 'review-work')).toEqual([
      expect.objectContaining({
        label: 'Review prompt',
        detail: 'Open this first',
        artifactPath: path.join('.reviewops', 'out', 'diff-review', 'new-run', 'prompt.md')
      })
    ]);
  });
});

function createActionPlanItem(id: string, title: string): ReviewActionPlanItem {
  return {
    id,
    title,
    priority: 'P1',
    source: 'response',
    relatedCommentIds: [],
    steps: ['Apply the smallest relevant fix.'],
    doneCriteria: ['Run the focused verification command.']
  };
}

function createActionPlanSeed(id: string, title: string): ActionPlanItemSeed {
  return {
    id,
    title,
    priority: 'P1',
    steps: ['Apply the smallest relevant fix.']
  };
}

function createRuleCandidate(id: string): RuleCandidate {
  return {
    id,
    kind: 'test-rule',
    title: 'Require focused verification before review replies',
    rationale: 'Risky fixes should include the smallest relevant verification command.',
    source: {
      flowRunId: 'rule-run'
    },
    scope: 'portable-candidate',
    status: 'new'
  };
}
