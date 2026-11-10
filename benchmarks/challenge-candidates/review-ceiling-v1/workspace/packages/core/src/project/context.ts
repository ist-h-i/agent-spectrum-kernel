import {
  isReviewOpsProjectContextConfiguredWithRuntime,
  setupReviewOpsProjectContextWithRuntime,
  type ProjectContextRuntime,
  type ProjectContextInput,
  type ReviewOpsProjectContextFile,
  type ReviewOpsProjectRuleEntry,
  type ReviewOpsProjectRulesFile,
  type SetupReviewOpsProjectContextResult
} from '../application/project-context.js';
import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';

export type {
  ProjectContextRuntime,
  ProjectContextInput,
  ReviewOpsProjectContextFile,
  ReviewOpsProjectRuleEntry,
  ReviewOpsProjectRulesFile,
  SetupReviewOpsProjectContextResult
};
export {
  isReviewOpsProjectContextConfiguredWithRuntime,
  ProjectContextError,
  normalizeProjectContextInput,
  setupReviewOpsProjectContextWithRuntime
} from '../application/project-context.js';

export interface SetupReviewOpsProjectContextOptions {
  workspaceRoot: string;
  input: ProjectContextInput;
  now?: () => Date;
}

export async function setupReviewOpsProjectContext(
  options: SetupReviewOpsProjectContextOptions
): Promise<SetupReviewOpsProjectContextResult> {
  return setupReviewOpsProjectContextWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    input: options.input,
    now: options.now
  });
}

export async function isReviewOpsProjectContextConfigured(workspaceRoot: string): Promise<boolean> {
  return isReviewOpsProjectContextConfiguredWithRuntime(createFileSystemReviewOpsRuntime(workspaceRoot));
}
