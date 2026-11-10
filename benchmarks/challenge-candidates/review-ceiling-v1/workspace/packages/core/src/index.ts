export const reviewOpsCoreName = 'ReviewOps Core';

export interface ReviewOpsCoreInfo {
  name: typeof reviewOpsCoreName;
  layer: 'core';
  aiExecution: 'manual-only';
}

export function getReviewOpsCoreInfo(): ReviewOpsCoreInfo {
  return {
    name: reviewOpsCoreName,
    layer: 'core',
    aiExecution: 'manual-only'
  };
}

export * from './types.js';
export * from './domain/diff-classification.js';
export * from './ports/runtime.js';
export * from './serialization/json.js';
export * from './ports/artifact-store.js';
export * from './infrastructure/fs/artifact-store.js';
export * from './infrastructure/fs/runtime.js';
export * from './infrastructure/fs/workspace-store.js';
export * from './infrastructure/memory/runtime.js';
export * from './flows/manifest.js';
export * from './flows/run.js';
export * from './cycles/state.js';
export * from './artifacts/artifact-store.js';
export * from './artifacts/open-artifact.js';
export * from './actions/action-log.js';
export * from './config/config-store.js';
export * from './project/init.js';
export * from './project/context.js';
export * from './meta/status.js';
export * from './meta/readiness.js';
export * from './meta/command-catalog.js';
export * from './metrics/review-work.js';
export * from './prompts/templates.js';
export * from './prompts/render.js';
export * from './responses/normalize.js';
export * from './responses/import.js';
export * from './reviews/action-plan-understanding.js';
export * from './reviews/comment-resolution.js';
export * from './reviews/fix-flow.js';
export * from './knowledge/capture.js';
export * from './skill/evidence.js';
export * from './reports/field-report.js';
