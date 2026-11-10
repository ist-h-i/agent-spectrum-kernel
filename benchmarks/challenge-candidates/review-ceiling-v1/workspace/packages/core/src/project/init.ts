import {
  initializeReviewOpsProjectWithRuntime,
  type ProjectInitRuntime,
  type ProjectInitResult
} from '../application/project-init.js';
import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';

export interface InitializeProjectOptions {
  workspaceRoot: string;
  now?: () => Date;
}

export type { ProjectInitResult, ProjectInitRuntime };
export { initializeReviewOpsProjectWithRuntime } from '../application/project-init.js';

export async function initializeReviewOpsProject(options: InitializeProjectOptions): Promise<ProjectInitResult> {
  return initializeReviewOpsProjectWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot)
  });
}
