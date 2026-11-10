import { createInitializeAction, getReviewOpsMetaNextWithRuntime } from '../cycles/state.js';
import { createFlowRegistry, type FlowRegistry } from '../flows/manifest.js';
import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';
import type { ReviewOpsCoreRuntime } from '../ports/runtime.js';
import type { FlowManifestEntry, NextAction, ReviewOpsCurrentCycle } from '../types.js';

export interface MetaStatusOptions {
  workspaceRoot: string;
  registry?: FlowRegistry;
}

export interface MetaStatusWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  registry?: FlowRegistry;
}

export interface ReviewOpsMetaStatus {
  workspaceRoot: string;
  initialized: boolean;
  sharedDirExists: boolean;
  localDirExists: boolean;
  flowCount: number;
  currentCycle: ReviewOpsCurrentCycle | null;
  nextActions: NextAction[];
}

export function listReviewOpsFlows(registry: FlowRegistry = createFlowRegistry()): FlowManifestEntry[] {
  return registry.list();
}

export async function getReviewOpsMetaStatus(options: MetaStatusOptions): Promise<ReviewOpsMetaStatus> {
  return getReviewOpsMetaStatusWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    registry: options.registry
  });
}

export async function getReviewOpsMetaStatusWithRuntime(options: MetaStatusWithRuntimeOptions): Promise<ReviewOpsMetaStatus> {
  const registry = options.registry ?? createFlowRegistry();
  const sharedDirExists = await options.runtime.workspace.directoryExists('.reviewops');
  const localDirExists = await options.runtime.workspace.directoryExists('.reviewops.local');
  const initialized = sharedDirExists && localDirExists;
  const metaNext = await getReviewOpsMetaNextWithRuntime({
    runtime: options.runtime,
    initialized,
    registry
  });

  return {
    workspaceRoot: options.runtime.workspaceRoot,
    initialized,
    sharedDirExists,
    localDirExists,
    flowCount: registry.list().length,
    currentCycle: metaNext.currentCycle,
    nextActions: initialized ? metaNext.nextActions : [createInitializeAction()]
  };
}
