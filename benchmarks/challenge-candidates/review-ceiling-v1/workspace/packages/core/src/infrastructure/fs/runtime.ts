import { FileSystemArtifactStore } from './artifact-store.js';
import type { ReviewOpsCoreRuntime } from '../../ports/runtime.js';
import { systemClock } from '../../ports/runtime.js';
import { FileSystemWorkspaceStore } from './workspace-store.js';

export function createFileSystemReviewOpsRuntime(workspaceRoot: string): ReviewOpsCoreRuntime {
  const workspace = new FileSystemWorkspaceStore(workspaceRoot);
  const artifactStore = new FileSystemArtifactStore(workspace.workspaceRoot);

  return {
    workspaceRoot: workspace.workspaceRoot,
    clock: systemClock,
    artifactStore,
    workspace,
    projectStore: workspace,
    cycleStateStore: workspace,
    metricsStore: workspace,
    ruleStore: workspace,
    actionLogStore: workspace,
    workspaceFileReader: workspace
  };
}
