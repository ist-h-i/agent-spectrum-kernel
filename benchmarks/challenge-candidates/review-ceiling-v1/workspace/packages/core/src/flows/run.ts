import type { FlowRun, FlowRunStatus, FlowRunTransition, NextAction } from '../types.js';

export class FlowRunTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowRunTransitionError';
  }
}

export interface CreateFlowRunOptions {
  id: string;
  flowId: string;
  at: string;
  cycleId?: string;
  nextActions?: NextAction[];
}

export interface TransitionFlowRunOptions {
  to: FlowRunStatus;
  reason: string;
  at: string;
}

const allowedTransitions: ReadonlyMap<FlowRunStatus, readonly FlowRunStatus[]> = new Map([
  ['created', ['prepared', 'failed']],
  ['prepared', ['prompt_generated', 'artifact_generated', 'failed']],
  ['prompt_generated', ['awaiting_ai_response', 'artifact_generated', 'failed']],
  ['awaiting_ai_response', ['response_imported', 'failed']],
  ['response_imported', ['artifact_generated', 'action_planned', 'failed']],
  ['artifact_generated', ['action_planned', 'ready_to_publish', 'knowledge_captured', 'failed']],
  ['action_planned', ['ready_to_publish', 'knowledge_captured', 'skill_evidence_captured', 'failed']],
  ['ready_to_publish', ['published', 'failed']],
  ['published', ['knowledge_captured', 'skill_evidence_captured', 'failed']],
  ['knowledge_captured', ['skill_evidence_captured', 'failed']],
  ['skill_evidence_captured', ['failed']],
  ['failed', []]
]);

export function createFlowRun(options: CreateFlowRunOptions): FlowRun {
  return {
    id: options.id,
    flowId: options.flowId,
    cycleId: options.cycleId,
    status: 'created',
    createdAt: options.at,
    updatedAt: options.at,
    artifacts: [],
    nextActions: options.nextActions ?? []
  };
}

export function canTransitionFlowRun(from: FlowRunStatus, to: FlowRunStatus): boolean {
  return allowedTransitions.get(from)?.includes(to) ?? false;
}

export function transitionFlowRun(
  run: FlowRun,
  options: TransitionFlowRunOptions
): { run: FlowRun; transition: FlowRunTransition } {
  if (!canTransitionFlowRun(run.status, options.to)) {
    throw new FlowRunTransitionError(`Cannot transition flow run ${run.id} from ${run.status} to ${options.to}.`);
  }

  return {
    run: {
      ...run,
      status: options.to,
      updatedAt: options.at
    },
    transition: {
      from: run.status,
      to: options.to,
      reason: options.reason,
      at: options.at
    }
  };
}
