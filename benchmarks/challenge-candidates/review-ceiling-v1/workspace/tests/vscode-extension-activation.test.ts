import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

const vscodeMock = vi.hoisted(() => ({
  registeredCommands: [] as string[],
  commandHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  createdWebviewPanels: [] as Array<{
    options: Record<string, unknown>;
    panel: {
      dispose: () => void;
      reveal: (...args: unknown[]) => unknown;
      webview: {
        cspSource: string;
        html: string;
        onDidReceiveMessage: (...args: unknown[]) => unknown;
      };
    };
  }>,
  createdTreeViews: [] as string[],
  openTextDocument: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn(),
  showTextDocument: vi.fn(),
  showWarningMessage: vi.fn(),
  workspaceFolders: [] as Array<{ uri: { fsPath: string } }>
}));
const execFileAsync = promisify(execFile);

vi.mock('@reviewops/core', async () => await import('../packages/core/src/index'), { virtual: true });
vi.mock(
  'vscode',
  () => ({
    commands: {
      executeCommand: vi.fn(),
      registerCommand: (command: string, handler: (...args: unknown[]) => unknown) => {
        vscodeMock.registeredCommands.push(command);
        vscodeMock.commandHandlers.set(command, handler);
        return { dispose: vi.fn() };
      }
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
    ThemeIcon: class {
      constructor(public readonly id: string) {}
    },
    TreeItem: class {
      constructor(
        public readonly label: string,
        public readonly collapsibleState: number
      ) {}
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
      createWebviewPanel: (_viewType: string, _title: string, _viewColumn: number, options: Record<string, unknown>) => {
        const disposeListeners: Array<() => void> = [];
        const panel = {
          webview: {
            cspSource: 'vscode-resource:',
            html: '',
            onDidReceiveMessage: vi.fn()
          },
          reveal: vi.fn(),
          onDidDispose: (listener: () => void) => {
            disposeListeners.push(listener);
            return { dispose: vi.fn() };
          },
          dispose: () => {
            for (const listener of disposeListeners) {
              listener();
            }
          }
        };
        vscodeMock.createdWebviewPanels.push({ options, panel });
        return panel;
      },
      createTreeView: (id: string) => {
        vscodeMock.createdTreeViews.push(id);
        return { dispose: vi.fn() };
      },
      showErrorMessage: vscodeMock.showErrorMessage,
      showInformationMessage: vscodeMock.showInformationMessage,
      showInputBox: vscodeMock.showInputBox,
      showQuickPick: vscodeMock.showQuickPick,
      showTextDocument: vscodeMock.showTextDocument,
      showWarningMessage: vscodeMock.showWarningMessage
    },
    workspace: {
      openTextDocument: vscodeMock.openTextDocument,
      get workspaceFolders() {
        return vscodeMock.workspaceFolders;
      }
    }
  }),
  { virtual: true }
);

const { activate, renderPublishDraftPreviewHtml } = await import('../packages/vscode-extension/src/extension');
const { createReviewOpsCycle, initializeReviewOpsProject, loadCurrentReviewOpsCycle, saveCurrentReviewOpsCycle } = await import(
  '../packages/core/src/index'
);

interface VsCodePackage {
  contributes: {
    commands: Array<{
      command: string;
    }>;
    views: Record<string, Array<{
      id: string;
    }>>;
  };
}

describe('ReviewOps Guard activation smoke', () => {
  it('registers every contributed P0 command and sidebar view', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), 'packages/vscode-extension/package.json'), 'utf8')
    ) as VsCodePackage;
    const subscriptions: unknown[] = [];
    const context = {
      subscriptions,
      secrets: {
        delete: vi.fn(),
        get: vi.fn(),
        store: vi.fn()
      }
    };

    activate(context as unknown as Parameters<typeof activate>[0]);

    const contributedCommands = packageJson.contributes.commands.map((command) => command.command).sort();
    const contributedViewIds = packageJson.contributes.views.reviewops.map((view) => view.id).sort();

    expect([...vscodeMock.registeredCommands].sort()).toEqual(contributedCommands);
    expect([...vscodeMock.createdTreeViews].sort()).toEqual(contributedViewIds);
    expect(subscriptions.length).toBe(vscodeMock.registeredCommands.length + vscodeMock.createdTreeViews.length * 2);
    expect(subscriptions.every(isDisposable)).toBe(true);
  });

  it('renders preview-first publish drafts in a script-disabled webview shape', () => {
    const html = renderPublishDraftPreviewHtml(
      {
        id: 'draft_20260505_pull_1',
        provider: 'github',
        target: {
          provider: 'github',
          repository: 'ist-h-i/ReviewOps',
          id: 'pull:1',
          url: 'https://github.com/ist-h-i/ReviewOps/pull/1'
        },
        title: 'GitHub summary <draft>',
        body: 'Looks good <script>alert("x")</script>',
        mode: 'summary-comment',
        requiresConfirmation: true,
        status: 'draft',
        createdAt: '2026-05-05T11:00:00.000Z'
      },
      {
        markdownPath: '.reviewops/out/publish-summary-draft/run_1/publish.draft.md',
        jsonPath: '.reviewops/out/publish-summary-draft/run_1/publish.draft.json'
      }
    );

    expect(html).toContain('Preview-only draft. Posting still requires explicit confirmation in VS Code.');
    expect(html).toContain('Run Result');
    expect(html).toContain('File to review');
    expect(html).toContain('Main file');
    expect(html).toContain('Review this draft here before confirming any provider write.');
    expect(html).toContain('Summary comment');
    expect(html).toContain('.reviewops/out/publish-summary-draft/run_1/publish.draft.md');
    expect(html).toContain('GitHub summary &lt;draft&gt;');
    expect(html).toContain('Looks good &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('tells the user when local diff review has no diff', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-no-diff-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await initializeGitWorkspace(workspaceRoot);
    activateWithWorkspace(workspaceRoot);
    vscodeMock.showErrorMessage.mockClear();
    vscodeMock.showInformationMessage.mockClear();
    vscodeMock.showWarningMessage.mockClear();
    vscodeMock.openTextDocument.mockClear();

    await runRegisteredCommand('reviewops.prepareLocalDiffReview');

    expect(vscodeMock.showErrorMessage.mock.calls).toEqual([]);
    expect(vscodeMock.showWarningMessage.mock.calls).toEqual([]);
    expect(vscodeMock.showInformationMessage).toHaveBeenCalledWith('ReviewOps found no local git diff against HEAD.');
    expect(vscodeMock.openTextDocument).not.toHaveBeenCalled();
  });

  it('keeps generated prompt handoff optional instead of requiring response import', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-prompt-ready-'));
    await initializeReviewOpsProject({ workspaceRoot });
    await initializeGitWorkspace(workspaceRoot);
    await writeFile(path.join(workspaceRoot, 'src', 'example.ts'), 'export const value = 2;\n');
    activateWithWorkspace(workspaceRoot);
    vscodeMock.openTextDocument.mockResolvedValue({ uri: { fsPath: 'prompt.md' } });
    vscodeMock.showErrorMessage.mockClear();
    vscodeMock.showInformationMessage.mockClear();
    vscodeMock.showWarningMessage.mockClear();

    await runRegisteredCommand('reviewops.prepareLocalDiffReview');

    expect(vscodeMock.showInformationMessage).toHaveBeenCalledWith(
      'ReviewOps prepared a local diff review prompt for 1 changed files. Use the opened prompt only when you want outside review; otherwise continue with the next step.'
    );
    expect(vscodeMock.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: expect.stringContaining(path.join('.reviewops', 'out', 'diff-review'))
      })
    );
  });

  it('updates project context with a one-click default instead of prompting for every field', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-default-project-context-'));
    await initializeReviewOpsProject({ workspaceRoot });
    activateWithWorkspace(workspaceRoot);
    vscodeMock.openTextDocument.mockResolvedValue({ uri: { fsPath: 'project-context.local.yaml' } });
    vscodeMock.showInputBox.mockClear();
    vscodeMock.openTextDocument.mockClear();
    vscodeMock.showInformationMessage.mockClear();

    await runRegisteredCommand('reviewops.updateProjectContext');

    const contextFile = await readFile(path.join(workspaceRoot, '.reviewops.local', 'project-context.local.yaml'), 'utf8');
    expect(vscodeMock.showInputBox).not.toHaveBeenCalled();
    expect(contextFile).toContain('technicalStack');
    expect(contextFile).toContain(path.basename(workspaceRoot));
    expect(vscodeMock.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: path.join(workspaceRoot, '.reviewops.local', 'project-context.local.yaml')
      })
    );
    expect(vscodeMock.showInformationMessage).toHaveBeenCalledWith(
      'ReviewOps wrote default local project context. Edit the opened file only if needed.'
    );
  });

  it('describes an empty artifact picker without internal output paths', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-empty-artifacts-'));
    await initializeReviewOpsProject({ workspaceRoot });
    activateWithWorkspace(workspaceRoot);
    vscodeMock.showInformationMessage.mockClear();
    vscodeMock.showQuickPick.mockClear();

    await runRegisteredCommand('reviewops.openArtifacts');

    expect(vscodeMock.showQuickPick).not.toHaveBeenCalled();
    expect(vscodeMock.showInformationMessage).toHaveBeenCalledWith(
      'ReviewOps found no files to open yet. Run the next action first.'
    );
    expect(vscodeMock.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('.reviewops/out')
    );
  });

  it('creates publish preview drafts without GitHub token prompts or post confirmations', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-local-publish-preview-'));
    await initializeReviewOpsProject({ workspaceRoot });
    activateWithWorkspace(workspaceRoot);
    vscodeMock.createdWebviewPanels.length = 0;
    vscodeMock.showInputBox.mockClear();
    vscodeMock.showQuickPick.mockClear();
    vscodeMock.showWarningMessage.mockClear();
    vscodeMock.showInformationMessage.mockClear();

    await runRegisteredCommand('reviewops.previewGitHubSummaryComment');
    await runRegisteredCommand('reviewops.previewGitHubReplyComment');

    expect(vscodeMock.showInputBox).not.toHaveBeenCalled();
    expect(vscodeMock.showQuickPick).not.toHaveBeenCalled();
    expect(vscodeMock.showWarningMessage).not.toHaveBeenCalled();
    expect(vscodeMock.showInformationMessage).toHaveBeenCalledWith(
      'ReviewOps wrote a local summary preview draft. No provider post was attempted.'
    );
    expect(vscodeMock.showInformationMessage).toHaveBeenCalledWith(
      'ReviewOps wrote a local reply preview draft. No provider post was attempted.'
    );
    const publishPreviews = vscodeMock.createdWebviewPanels.filter((item) =>
      item.panel.webview.html.includes('ReviewOps Publish Draft Preview')
    );
    expect(publishPreviews).toHaveLength(2);
    for (const preview of publishPreviews) {
      expect(preview.panel.webview.html).toContain('File to review');
      expect(preview.panel.webview.html).toContain('Main file');
      expect(preview.panel.webview.html).not.toContain('Markdown artifact');
      expect(preview.panel.webview.html).toContain('publish.draft.md');
      expect(preview.panel.webview.html).not.toContain('JSON artifact');
      expect(preview.panel.webview.html).not.toContain('publish.draft.json');
    }

    const summaryDraft = await readLatestPublishDraft(workspaceRoot, 'publish-summary-draft');
    const replyDraft = await readLatestPublishDraft(workspaceRoot, 'publish-reply-draft');
    expect(summaryDraft).toMatchObject({
      provider: 'local-git',
      mode: 'summary-comment',
      status: 'draft'
    });
    expect(replyDraft).toMatchObject({
      provider: 'local-git',
      mode: 'reply',
      status: 'draft'
    });
  });

  it('renders the status preview without internal workspace details', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-simple-status-preview-'));
    await initializeReviewOpsProject({ workspaceRoot });
    activateWithWorkspace(workspaceRoot);
    vscodeMock.createdWebviewPanels.length = 0;

    await runRegisteredCommand('reviewops.openPreview');

    const html = vscodeMock.createdWebviewPanels[0]?.panel.webview.html ?? '';
    expect(html).toContain('<h1>ReviewOps</h1>');
    expect(html).toContain('Next Safe Step');
    expect(html).toContain('Current cycle');
    expect(html).not.toContain('ReviewOps Guard');
    expect(html).not.toContain(workspaceRoot);
    expect(html).not.toContain('P0 flows');
    expect(html).not.toContain('Shared files');
    expect(html).not.toContain('Local files');
  });

  it('resumes the current cycle by continuing the next operation instead of opening internal state', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-resume-next-action-'));
    await initializeReviewOpsProject({ workspaceRoot });
    const baseCycle = createReviewOpsCycle({
      cycleId: 'cycle/fix-review',
      runId: 'resume-run',
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
    activateWithWorkspace(workspaceRoot);
    vscodeMock.openTextDocument.mockClear();
    vscodeMock.showTextDocument.mockClear();
    vscodeMock.showInformationMessage.mockClear();

    await runRegisteredCommand('reviewops.resumeCurrentCycle');

    expect(vscodeMock.openTextDocument).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: path.join(workspaceRoot, '.reviewops.local', 'current-cycle.local.json')
      })
    );
    expect(vscodeMock.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: expect.stringContaining(path.join('.reviewops', 'out', 'review-action-plan'))
      })
    );
    expect(vscodeMock.showTextDocument).toHaveBeenCalled();
    const reloadedCycle = await loadCurrentReviewOpsCycle(workspaceRoot);
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'response/import')?.status).toBe('completed');
    expect(reloadedCycle?.steps.find((step) => step.flowId === 'review/action-plan')?.status).toBe('completed');
  });

  it('keeps the Command Center panel alive until it is closed', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-command-center-panel-'));
    await initializeReviewOpsProject({ workspaceRoot });
    activateWithWorkspace(workspaceRoot);
    vscodeMock.createdWebviewPanels.length = 0;

    await runRegisteredCommand('reviewops.commandCenter');
    await runRegisteredCommand('reviewops.commandCenter');

    expect(vscodeMock.createdWebviewPanels).toHaveLength(1);
    expect(vscodeMock.createdWebviewPanels[0]?.options).toMatchObject({
      enableScripts: true,
      retainContextWhenHidden: true
    });
    expect(vscodeMock.createdWebviewPanels[0]?.panel.reveal).toHaveBeenCalledWith(1);

    vscodeMock.createdWebviewPanels[0]?.panel.dispose();
    await runRegisteredCommand('reviewops.commandCenter');

    expect(vscodeMock.createdWebviewPanels).toHaveLength(2);
    vscodeMock.createdWebviewPanels[1]?.panel.dispose();
  });
});

function isDisposable(value: unknown): value is { dispose: () => void } {
  return typeof value === 'object' && value !== null && 'dispose' in value && typeof value.dispose === 'function';
}

function activateWithWorkspace(workspaceRoot: string): void {
  vscodeMock.workspaceFolders = [{ uri: { fsPath: workspaceRoot } }];
  vscodeMock.commandHandlers.clear();
  activate({
    subscriptions: [],
    secrets: {
      delete: vi.fn(),
      get: vi.fn(),
      store: vi.fn()
    }
  } as unknown as Parameters<typeof activate>[0]);
}

async function runRegisteredCommand(command: string): Promise<void> {
  const handler = vscodeMock.commandHandlers.get(command);
  expect(handler).toBeDefined();
  await handler?.();
}

async function initializeGitWorkspace(workspaceRoot: string): Promise<void> {
  await mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
  await writeFile(path.join(workspaceRoot, 'src', 'example.ts'), 'export const value = 1;\n');
  await runGit(workspaceRoot, ['init']);
  await runGit(workspaceRoot, ['config', 'user.email', 'reviewops@example.com']);
  await runGit(workspaceRoot, ['config', 'user.name', 'ReviewOps Test']);
  await runGit(workspaceRoot, ['add', '.']);
  await runGit(workspaceRoot, ['commit', '-m', 'initial']);
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function readLatestPublishDraft(workspaceRoot: string, flowSlug: string): Promise<Record<string, unknown>> {
  const flowDir = path.join(workspaceRoot, '.reviewops', 'out', flowSlug);
  const [runId] = (await readdir(flowDir)).filter((entry) => entry.startsWith('run_')).sort().reverse();
  expect(runId).toBeDefined();
  return JSON.parse(await readFile(path.join(flowDir, runId as string, 'publish.draft.json'), 'utf8')) as Record<string, unknown>;
}
