import * as vscode from 'vscode';
import path from 'node:path';

import { getReviewOpsMetaStatus, type ReviewOpsMetaStatus } from '@reviewops/core';

import {
  getReviewOpsArtifactEmptyLabel,
  listReviewOpsArtifactViewItems,
  type ReviewOpsArtifactViewId
} from './artifact-browser.js';
import {
  formatCycleStatus,
  formatCycleTitle,
  formatNextActionReason,
  formatNextActionTitle
} from './command-center.js';
import { localize } from './localization.js';

export interface ReviewOpsTreeNode {
  label: string;
  description?: string;
  tooltip?: string;
  contextValue: string;
  icon: vscode.ThemeIcon;
  command?: vscode.Command;
}

export class ReviewOpsStatusTreeDataProvider implements vscode.TreeDataProvider<ReviewOpsTreeNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ReviewOpsTreeNode | undefined | void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly workspaceRoot: () => string | undefined) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(element: ReviewOpsTreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip ?? element.label;
    item.contextValue = element.contextValue;
    item.iconPath = element.icon;
    item.command = element.command;
    return item;
  }

  async getChildren(element?: ReviewOpsTreeNode): Promise<ReviewOpsTreeNode[]> {
    if (element !== undefined) {
      return [];
    }

    const workspaceRoot = this.workspaceRoot();
    if (workspaceRoot === undefined) {
      return [
        {
          label: localize('Open a workspace folder'),
          description: localize('required'),
          contextValue: 'reviewops.noWorkspace',
          icon: new vscode.ThemeIcon('warning')
        }
      ];
    }

    try {
      const status = await getReviewOpsMetaStatus({ workspaceRoot });
      return createStatusTreeNodes(status);
    } catch (error) {
      return [
        {
          label: localize('Status failed'),
          description: formatError(error),
          contextValue: 'reviewops.statusError',
          icon: new vscode.ThemeIcon('error')
        }
      ];
    }
  }
}

export class ReviewOpsArtifactTreeDataProvider
  implements vscode.TreeDataProvider<ReviewOpsTreeNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ReviewOpsTreeNode | undefined | void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly workspaceRoot: () => string | undefined,
    private readonly viewId: ReviewOpsArtifactViewId
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(element: ReviewOpsTreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip ?? element.label;
    item.contextValue = element.contextValue;
    item.iconPath = element.icon;
    item.command = element.command;
    return item;
  }

  async getChildren(element?: ReviewOpsTreeNode): Promise<ReviewOpsTreeNode[]> {
    if (element !== undefined) {
      return [];
    }

    const workspaceRoot = this.workspaceRoot();
    if (workspaceRoot === undefined) {
      return [
        {
          label: localize('Open a workspace folder'),
          description: localize('required'),
          contextValue: 'reviewops.noWorkspace',
          icon: new vscode.ThemeIcon('warning')
        }
      ];
    }

    try {
      const artifacts = await listReviewOpsArtifactViewItems(workspaceRoot, this.viewId);
      if (artifacts.length === 0) {
        return [
          {
            label: localize(getReviewOpsArtifactEmptyLabel(this.viewId)),
            description: localize('Run the next action first'),
            contextValue: 'reviewops.emptyArtifacts',
            icon: new vscode.ThemeIcon('info')
          }
        ];
      }

      return artifacts.map((artifact) => ({
        label: artifact.label,
        description: artifact.description,
        tooltip: artifact.tooltip,
        contextValue: `reviewops.artifact.${this.viewId}`,
        icon: new vscode.ThemeIcon(artifact.iconId),
        command: {
          command: 'vscode.open',
          title: localize('Open ReviewOps File'),
          arguments: [vscode.Uri.file(path.join(workspaceRoot, artifact.path))]
        }
      }));
    } catch (error) {
      return [
        {
          label: localize('File scan failed'),
          description: formatError(error),
          contextValue: 'reviewops.artifactError',
          icon: new vscode.ThemeIcon('error')
        }
      ];
    }
  }
}

export function createStatusTreeNodes(status: ReviewOpsMetaStatus): ReviewOpsTreeNode[] {
  const nextAction = status.nextActions[0];
  const nodes: ReviewOpsTreeNode[] = [
    {
      label: localize('Open Command Center'),
      description: localize('next action'),
      tooltip: localize('Open the simplified ReviewOps webview.'),
      contextValue: 'reviewops.commandCenter',
      icon: new vscode.ThemeIcon('run-all'),
      command: {
        command: 'reviewops.commandCenter',
        title: localize('Open ReviewOps Command Center')
      }
    },
    {
      label: status.initialized ? localize('Initialized') : localize('Not initialized'),
      description: status.initialized ? localize('.reviewops ready') : localize('setup required'),
      tooltip: status.initialized ? localize('Ready') : localize('Setup required'),
      contextValue: 'reviewops.status',
      icon: new vscode.ThemeIcon(status.initialized ? 'pass-filled' : 'warning'),
      command: {
        command: 'reviewops.status',
        title: localize('Show ReviewOps Status')
      }
    }
  ];

  if (nextAction !== undefined) {
    nodes.push({
      label: formatNextActionTitle(nextAction),
      description: localize('next'),
      tooltip: formatNextActionReason(nextAction.reason),
      contextValue: 'reviewops.nextAction',
      icon: new vscode.ThemeIcon('play'),
      command: {
        command: 'reviewops.nextAction',
        title: localize('Show ReviewOps Next Action')
      }
    });
  }

  if (status.currentCycle !== null) {
    nodes.push({
      label: formatCycleTitle(status.currentCycle.title),
      description: formatCycleStatus(status.currentCycle.status),
      tooltip: localize('Current cycle'),
      contextValue: 'reviewops.currentCycle',
      icon: new vscode.ThemeIcon('debug-continue'),
      command: {
        command: 'reviewops.resumeCurrentCycle',
        title: localize('Resume Current Cycle')
      }
    });
  }

  nodes.push({
    label: localize('Open main files'),
    description: localize('main files'),
    tooltip: localize('Open the files worth reviewing first.'),
    contextValue: 'reviewops.openArtifacts',
    icon: new vscode.ThemeIcon('folder-opened'),
    command: {
      command: 'reviewops.openArtifacts',
      title: localize('Open ReviewOps Main Files')
    }
  });

  return nodes;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
