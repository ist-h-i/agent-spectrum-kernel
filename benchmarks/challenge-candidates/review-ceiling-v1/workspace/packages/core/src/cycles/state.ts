import { isReviewOpsProjectContextConfiguredWithRuntime } from '../application/project-context.js';
import type { ArtifactStore } from '../ports/artifact-store.js';
import { createFlowRegistry, type FlowRegistry } from '../flows/manifest.js';
import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';
import type { ReviewOpsCoreRuntime } from '../ports/runtime.js';
import { runtimeNow } from '../ports/runtime.js';
import { parseJsonDocument, stringifyJsonDocument } from '../serialization/json.js';
import { joinWorkspacePath } from '../serialization/paths.js';
import type {
  FlowArtifactRef,
  NextAction,
  ReviewOpsCurrentCycle,
  ReviewOpsCycleDefinition,
  ReviewOpsCycleId,
  ReviewOpsCycleStateFile,
  ReviewOpsCycleStatus,
  ReviewOpsCycleStep,
  ReviewOpsCycleStartContext,
  ReviewTargetRef
} from '../types.js';

export interface CreateReviewOpsCycleOptions {
  cycleId: ReviewOpsCycleId;
  runId: string;
  startedAt: string;
  target?: ReviewTargetRef;
  startContext?: ReviewOpsCycleStartContext;
  registry?: FlowRegistry;
}

export interface SaveCurrentReviewOpsCycleOptions {
  workspaceRoot: string;
  currentCycle: ReviewOpsCurrentCycle | null;
}

export interface SaveCurrentReviewOpsCycleWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  currentCycle: ReviewOpsCurrentCycle | null;
}

export interface AdvanceCurrentReviewOpsCycleOptions {
  workspaceRoot: string;
  completedFlowIds: string[];
  artifactRefs?: FlowArtifactRef[];
  now?: () => Date;
  registry?: FlowRegistry;
}

export interface AdvanceCurrentReviewOpsCycleWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  completedFlowIds: string[];
  artifactRefs?: FlowArtifactRef[];
  now?: () => Date;
  registry?: FlowRegistry;
}

export interface ResumeCurrentReviewOpsCycleOptions {
  workspaceRoot: string;
  registry?: FlowRegistry;
}

export interface ResumeCurrentReviewOpsCycleWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  registry?: FlowRegistry;
}

export interface ReconcileCurrentReviewOpsCycleOptions {
  workspaceRoot: string;
  currentCycle: ReviewOpsCurrentCycle;
  now?: () => Date;
  registry?: FlowRegistry;
}

export interface ReconcileCurrentReviewOpsCycleWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  currentCycle: ReviewOpsCurrentCycle;
  now?: () => Date;
  registry?: FlowRegistry;
}

export interface ReviewOpsMetaNextOptions {
  workspaceRoot: string;
  initialized: boolean;
  registry?: FlowRegistry;
}

export interface ReviewOpsMetaNextWithRuntimeOptions {
  runtime: ReviewOpsCoreRuntime;
  initialized: boolean;
  registry?: FlowRegistry;
}

export interface ReviewOpsMetaNext {
  workspaceRoot: string;
  currentCycle: ReviewOpsCurrentCycle | null;
  nextActions: NextAction[];
}

export interface BuildMetaNextArtifactsOptions {
  artifactStore: ArtifactStore;
  workspaceRoot: string;
  runId: string;
  initialized: boolean;
  flowId?: string;
  registry?: FlowRegistry;
  now?: () => Date;
}

export interface BuildMetaNextArtifactsResult {
  metaNext: ReviewOpsMetaNext;
  artifacts: {
    nextActions: FlowArtifactRef;
    currentCycle: FlowArtifactRef;
  };
}

export const p0CycleDefinitions: ReviewOpsCycleDefinition[] = [
  {
    id: 'cycle/mr-review',
    title: 'MR Review Cycle',
    description: 'Prepare a review prompt, import the answer, publish a previewed summary, then capture evidence.',
    steps: [
      'review/select-target',
      'diff/review',
      'response/import',
      'response/normalize',
      'review/action-plan',
      'publish/summary-draft',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]
  },
  {
    id: 'cycle/comment-response',
    title: 'Comment Response Cycle',
    description: 'Triage review comments, plan manual fixes, preview replies, then capture evidence.',
    steps: [
      'provider/fetch-review',
      'review/comment-triage',
      'review/action-plan',
      'fix/plan',
      'fix/checklist',
      'fix/verify',
      'fix/explain',
      'review/reply-drafts',
      'publish/reply-draft',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]
  },
  {
    id: 'cycle/fix-review',
    title: 'Fix Review Cycle',
    description: 'Review a manual fix, normalize feedback, verify outcomes, and capture evidence.',
    steps: [
      'review/select-target',
      'diff/review',
      'response/import',
      'response/normalize',
      'review/action-plan',
      'fix/plan',
      'fix/checklist',
      'fix/verify',
      'fix/explain',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]
  },
  {
    id: 'cycle/research',
    title: 'Research Cycle',
    description: 'Investigate a code, design, or operational question, structure findings, and capture follow-up evidence.',
    steps: [
      'research/select-scope',
      'research/investigate',
      'research/import-findings',
      'research/normalize-findings',
      'research/action-plan',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]
  },
  {
    id: 'cycle/refactoring',
    title: 'Refactoring Cycle',
    description: 'Plan a refactor, verify the resulting diff, explain outcomes, and capture reusable evidence.',
    steps: [
      'refactor/plan',
      'refactor/checklist',
      'refactor/verify',
      'refactor/explain',
      'rules/propose',
      'rules/reconcile',
      'rules/apply',
      'rules/update',
      'knowledge/capture-candidates',
      'skill/evidence-capture',
      'meta/next'
    ]
  },
  {
    id: 'cycle/field-report',
    title: 'Field Report Cycle',
    description: 'Collect knowledge and skill evidence into a local field report.',
    steps: ['knowledge/capture-candidates', 'skill/evidence-capture', 'field/report', 'meta/next']
  }
];

export function createReviewOpsCycle(options: CreateReviewOpsCycleOptions): ReviewOpsCurrentCycle {
  const registry = options.registry ?? createFlowRegistry();
  const definition = getCycleDefinition(options.cycleId);
  const steps = definition.steps.map((flowId, index): ReviewOpsCycleStep => {
    const entry = registry.get(flowId);

    return {
      flowId,
      title: entry?.title ?? flowId,
      status: index === 0 ? 'ready' : 'pending',
      reason: entry?.description ?? 'Continue the ReviewOps cycle.',
      artifacts: []
    };
  });
  const cycle: ReviewOpsCurrentCycle = {
    version: 1,
    cycleId: definition.id,
    runId: options.runId,
    title: definition.title,
    status: 'active',
    startedAt: options.startedAt,
    updatedAt: options.startedAt,
    target: options.target,
    startContext: options.startContext,
    steps,
    nextActions: []
  };

  return {
    ...cycle,
    nextActions: createNextActionsForCycle(cycle)
  };
}

export async function loadCurrentReviewOpsCycle(workspaceRoot: string): Promise<ReviewOpsCurrentCycle | null> {
  return loadCurrentReviewOpsCycleWithRuntime(createFileSystemReviewOpsRuntime(workspaceRoot));
}

export async function loadCurrentReviewOpsCycleWithRuntime(runtime: ReviewOpsCoreRuntime): Promise<ReviewOpsCurrentCycle | null> {
  const state = await readCycleState(runtime);
  return state.currentCycle;
}

export async function saveCurrentReviewOpsCycle(options: SaveCurrentReviewOpsCycleOptions): Promise<ReviewOpsCycleStateFile> {
  return saveCurrentReviewOpsCycleWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    currentCycle: options.currentCycle
  });
}

export async function saveCurrentReviewOpsCycleWithRuntime(
  options: SaveCurrentReviewOpsCycleWithRuntimeOptions
): Promise<ReviewOpsCycleStateFile> {
  const state: ReviewOpsCycleStateFile = {
    version: 1,
    currentCycle: options.currentCycle
  };
  await options.runtime.cycleStateStore.writeText(getCycleStatePath(), stringifyJsonDocument(state));
  return state;
}

export async function advanceCurrentReviewOpsCycle(
  options: AdvanceCurrentReviewOpsCycleOptions
): Promise<ReviewOpsCurrentCycle | null> {
  return advanceCurrentReviewOpsCycleWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    completedFlowIds: options.completedFlowIds,
    artifactRefs: options.artifactRefs,
    now: options.now,
    registry: options.registry
  });
}

export async function advanceCurrentReviewOpsCycleWithRuntime(
  options: AdvanceCurrentReviewOpsCycleWithRuntimeOptions
): Promise<ReviewOpsCurrentCycle | null> {
  const currentCycle = await loadCurrentReviewOpsCycleWithRuntime(options.runtime);
  if (currentCycle === null) {
    return null;
  }

  const advanced = advanceReviewOpsCycle(currentCycle, {
    completedFlowIds: options.completedFlowIds,
    artifactRefs: options.artifactRefs ?? [],
    advancedAt: runtimeNow(options.runtime, options.now).toISOString(),
    registry: options.registry
  });
  await saveCurrentReviewOpsCycleWithRuntime({
    runtime: options.runtime,
    currentCycle: advanced
  });

  return advanced;
}

export function advanceReviewOpsCycle(
  cycle: ReviewOpsCurrentCycle,
  options: {
    completedFlowIds: string[];
    artifactRefs?: FlowArtifactRef[];
    advancedAt: string;
    registry?: FlowRegistry;
  }
): ReviewOpsCurrentCycle {
  const completed = new Set(options.completedFlowIds);
  const artifactRefs = options.artifactRefs ?? [];
  let firstOpenSeen = false;
  const steps = cycle.steps.map((step): ReviewOpsCycleStep => {
    if (completed.has(step.flowId)) {
      return {
        ...step,
        status: 'completed',
        artifacts: appendStepArtifacts(step.artifacts, artifactRefs.filter((artifact) => artifact.flowId === step.flowId))
      };
    }

    if (step.status === 'completed') {
      return step;
    }

    if (!firstOpenSeen) {
      firstOpenSeen = true;
      return {
        ...step,
        status: step.status === 'blocked' ? 'blocked' : 'ready'
      };
    }

    return {
      ...step,
      status: step.status === 'blocked' ? 'blocked' : 'pending'
    };
  });
  const status: ReviewOpsCycleStatus = steps.every((step) => step.status === 'completed')
    ? 'completed'
    : steps.some((step) => step.status === 'blocked')
      ? 'blocked'
      : 'active';
  const nextCycle = {
    ...cycle,
    status,
    steps,
    updatedAt: options.advancedAt
  };

  return {
    ...nextCycle,
    nextActions: createNextActionsForCycle(nextCycle, options.registry)
  };
}

export async function resumeCurrentReviewOpsCycle(
  options: ResumeCurrentReviewOpsCycleOptions
): Promise<ReviewOpsMetaNext> {
  return resumeCurrentReviewOpsCycleWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    registry: options.registry
  });
}

export async function resumeCurrentReviewOpsCycleWithRuntime(
  options: ResumeCurrentReviewOpsCycleWithRuntimeOptions
): Promise<ReviewOpsMetaNext> {
  const currentCycle = await loadCurrentReviewOpsCycleWithRuntime(options.runtime);

  return {
    workspaceRoot: options.runtime.workspaceRoot,
    currentCycle,
    nextActions:
      currentCycle === null
        ? createStartCycleActions()
        : createNextActionsForCycle(currentCycle, options.registry)
  };
}

export async function getReviewOpsMetaNext(options: ReviewOpsMetaNextOptions): Promise<ReviewOpsMetaNext> {
  return getReviewOpsMetaNextWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    initialized: options.initialized,
    registry: options.registry
  });
}

export async function getReviewOpsMetaNextWithRuntime(options: ReviewOpsMetaNextWithRuntimeOptions): Promise<ReviewOpsMetaNext> {
  if (!options.initialized) {
    return {
      workspaceRoot: options.runtime.workspaceRoot,
      currentCycle: null,
      nextActions: [createInitializeAction()]
    };
  }

  let currentCycle = await loadCurrentReviewOpsCycleWithRuntime(options.runtime);
  if (currentCycle !== null) {
    const reconciled = await reconcileCurrentReviewOpsCycleFromArtifactsWithRuntime({
      runtime: options.runtime,
      currentCycle,
      registry: options.registry
    });
    if (reconciled !== currentCycle) {
      currentCycle = reconciled;
      await saveCurrentReviewOpsCycleWithRuntime({
        runtime: options.runtime,
        currentCycle
      });
    }

    return {
      workspaceRoot: options.runtime.workspaceRoot,
      currentCycle,
      nextActions: createNextActionsForCycle(currentCycle, options.registry)
    };
  }

  return {
    workspaceRoot: options.runtime.workspaceRoot,
    currentCycle: null,
    nextActions: (await isReviewOpsProjectContextConfiguredWithRuntime(options.runtime)) ? createStartCycleActions() : [createProjectContextAction()]
  };
}

export async function reconcileCurrentReviewOpsCycleFromArtifacts(
  options: ReconcileCurrentReviewOpsCycleOptions
): Promise<ReviewOpsCurrentCycle> {
  return reconcileCurrentReviewOpsCycleFromArtifactsWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    currentCycle: options.currentCycle,
    now: options.now,
    registry: options.registry
  });
}

export async function reconcileCurrentReviewOpsCycleFromArtifactsWithRuntime(
  options: ReconcileCurrentReviewOpsCycleWithRuntimeOptions
): Promise<ReviewOpsCurrentCycle> {
  if (options.currentCycle.status === 'completed') {
    return options.currentCycle;
  }

  const completion = await inferResponseImportCompletion(options.runtime, options.currentCycle);
  if (completion.completedFlowIds.length === 0) {
    return options.currentCycle;
  }

  return advanceReviewOpsCycle(options.currentCycle, {
    completedFlowIds: completion.completedFlowIds,
    artifactRefs: completion.artifactRefs,
    advancedAt: runtimeNow(options.runtime, options.now).toISOString(),
    registry: options.registry
  });
}

export async function buildMetaNextArtifacts(options: BuildMetaNextArtifactsOptions): Promise<BuildMetaNextArtifactsResult> {
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const flowId = options.flowId ?? 'meta/next';
  const metaNext = await getReviewOpsMetaNext({
    workspaceRoot: options.workspaceRoot,
    initialized: options.initialized,
    registry: options.registry
  });
  const nextActions = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'next-actions.json',
    kind: 'json',
    content: `${JSON.stringify(metaNext.nextActions, null, 2)}\n`,
    createdAt
  });
  const currentCycle = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'current-cycle.json',
    kind: 'json',
    content: `${JSON.stringify(metaNext.currentCycle, null, 2)}\n`,
    createdAt
  });

  return {
    metaNext,
    artifacts: {
      nextActions,
      currentCycle
    }
  };
}

export function createInitializeAction(): NextAction {
  return {
    id: 'initialize-project',
    title: 'Initialize ReviewOps project files',
    flowId: 'project/init',
    reason: '.reviewops/ and .reviewops.local/ are required before other P0 flows.'
  };
}

export function createProjectContextAction(): NextAction {
  return {
    id: 'setup-project-context',
    title: 'Setup ReviewOps project context',
    flowId: 'project/context',
    reason: 'Record local technical stack, review policy, AI usage rules, and customer constraints before review cycles.'
  };
}

function createStartCycleActions(): NextAction[] {
  return [
    {
      id: 'start-mr-review-cycle',
      title: 'Start MR review cycle',
      flowId: 'cycle/mr-review',
      reason: 'No current cycle is active; start by selecting a review target and preparing a prompt.'
    },
    {
      id: 'start-comment-response-cycle',
      title: 'Start comment response cycle',
      flowId: 'cycle/comment-response',
      reason: 'Use this when provider comments already exist and need triage, fixes, replies, and evidence capture.'
    },
    {
      id: 'start-fix-review-cycle',
      title: 'Start fix review cycle',
      flowId: 'cycle/fix-review',
      reason: 'Use this when an existing manual fix needs a focused review, follow-up planning, and verification.'
    },
    {
      id: 'start-research-cycle',
      title: 'Start research cycle',
      flowId: 'cycle/research',
      reason: 'Use this when a code, design, or operational question needs structured investigation without review-response handling.'
    },
    {
      id: 'start-refactoring-cycle',
      title: 'Start refactoring cycle',
      flowId: 'cycle/refactoring',
      reason: 'Use this when a refactor needs scoped planning, checklist-based verification, explanation, and reusable rule capture.'
    },
    {
      id: 'start-field-report-cycle',
      title: 'Start field report cycle',
      flowId: 'cycle/field-report',
      reason: 'Use this when review artifacts are ready to summarize into local field evidence.'
    }
  ];
}

function createNextActionsForCycle(cycle: ReviewOpsCurrentCycle, registry: FlowRegistry = createFlowRegistry()): NextAction[] {
  if (cycle.status === 'completed') {
    return [
      ...createStartCycleActions().map((action) => ({
        ...action,
        reason: `${cycle.title} is complete; ${action.reason}`
      })),
      {
        id: `${safeActionId(cycle.cycleId)}-complete`,
        title: `${cycle.title} complete`,
        flowId: 'meta/status',
        reason: 'All cycle steps are complete; check status or start another cycle.'
      }
    ];
  }

  const nextStep = cycle.steps.find((step) => step.status === 'ready' || step.status === 'blocked');
  if (nextStep === undefined) {
    return [];
  }

  const entry = registry.get(nextStep.flowId);

  return [
    {
      id: `${safeActionId(cycle.cycleId)}-${safeActionId(nextStep.flowId)}`,
      title: nextStep.status === 'blocked' ? `Unblock ${nextStep.title}` : `Continue ${nextStep.title}`,
      flowId: nextStep.flowId,
      reason:
        nextStep.status === 'blocked'
          ? `The ${cycle.title} is blocked at ${nextStep.title}.`
          : `${cycle.title} is active; ${entry?.description ?? nextStep.reason}`
    }
  ];
}

async function inferResponseImportCompletion(
  runtime: ReviewOpsCoreRuntime,
  cycle: ReviewOpsCurrentCycle
): Promise<{ completedFlowIds: string[]; artifactRefs: FlowArtifactRef[] }> {
  const artifactSet = await findLatestResponseImportArtifactSet(runtime, cycle.startedAt);
  if (artifactSet === undefined) {
    return {
      completedFlowIds: [],
      artifactRefs: []
    };
  }

  const completedFlowIds: string[] = [];
  const artifactRefs: FlowArtifactRef[] = [];
  const importStepIndex = cycle.steps.findIndex((step) => step.flowId === 'response/import' && step.status !== 'completed');
  if (
    importStepIndex !== -1 &&
    previousStepsAreComplete(cycle, importStepIndex, completedFlowIds) &&
    artifactSet.byName.has('response.raw.md')
  ) {
    completedFlowIds.push('response/import');
    artifactRefs.push(...artifactSet.toRefs('response/import', ['response.raw.md']));
  }

  const normalizeStepIndex = cycle.steps.findIndex(
    (step) => step.flowId === 'response/normalize' && step.status !== 'completed'
  );
  const normalizeArtifacts = [
    'result.md',
    'result.json',
    'review-findings.json',
    'action-plan.seed.json',
    'reply-drafts.seed.json',
    'knowledge-candidates.json',
    'rule-candidates.json'
  ];
  if (
    normalizeStepIndex !== -1 &&
    previousStepsAreComplete(cycle, normalizeStepIndex, completedFlowIds) &&
    normalizeArtifacts.every((name) => artifactSet.byName.has(name))
  ) {
    completedFlowIds.push('response/normalize');
    artifactRefs.push(...artifactSet.toRefs('response/normalize', normalizeArtifacts));
  }

  return {
    completedFlowIds,
    artifactRefs
  };
}

async function findLatestResponseImportArtifactSet(
  runtime: ReviewOpsCoreRuntime,
  cycleStartedAt: string
): Promise<ResponseImportArtifactSet | undefined> {
  const responseImportDirectory = joinWorkspacePath('.reviewops', 'out', 'response-import');
  const minimumMtime = Date.parse(cycleStartedAt);
  const runIds = await runtime.cycleStateStore.listDirectories(responseImportDirectory);
  const sets = (
    await Promise.all(
      runIds.map((runId) => readResponseImportArtifactSet(runtime, joinWorkspacePath(responseImportDirectory, runId), runId))
    )
  )
    .filter((set): set is ResponseImportArtifactSet => set !== undefined)
    .filter((set) => Number.isNaN(minimumMtime) || set.latestMtime >= minimumMtime)
    .sort((left, right) => right.latestMtime - left.latestMtime);

  return sets[0];
}

async function readResponseImportArtifactSet(
  runtime: ReviewOpsCoreRuntime,
  runDirectory: string,
  runId: string
): Promise<ResponseImportArtifactSet | undefined> {
  const byName = new Map<string, ResponseImportArtifactFile>();

  for (const artifact of responseImportArtifactSpecs) {
    const targetPath = joinWorkspacePath(runDirectory, artifact.name);
    const fileInfo = await runtime.cycleStateStore.fileInfo(targetPath);
    if (fileInfo?.isFile !== true) {
      continue;
    }

    byName.set(artifact.name, {
      ...artifact,
      path: fileInfo.path,
      createdAt: fileInfo.modifiedAt,
      mtimeMs: fileInfo.mtimeMs
    });
  }

  if (byName.size === 0) {
    return undefined;
  }

  return {
    byName,
    latestMtime: Math.max(...[...byName.values()].map((artifact) => artifact.mtimeMs)),
    toRefs(flowId, names) {
      return names.flatMap((name): FlowArtifactRef[] => {
        const artifact = byName.get(name);
        if (artifact === undefined) {
          return [];
        }

        return [
          {
            flowId,
            runId,
            name: artifact.name,
            kind: artifact.kind,
            path: artifact.path,
            createdAt: artifact.createdAt
          }
        ];
      });
    }
  };
}

function previousStepsAreComplete(cycle: ReviewOpsCurrentCycle, stepIndex: number, plannedCompletedFlowIds: string[]): boolean {
  const planned = new Set(plannedCompletedFlowIds);
  return cycle.steps.slice(0, stepIndex).every((step) => step.status === 'completed' || planned.has(step.flowId));
}

async function readCycleState(runtime: ReviewOpsCoreRuntime): Promise<ReviewOpsCycleStateFile> {
  const content = await runtime.cycleStateStore.readText(getCycleStatePath());
  if (content === undefined) {
    return {
      version: 1,
      currentCycle: null
    };
  }

  const parsed = parseJsonDocument(content, getCycleStatePath()) as ReviewOpsCycleStateFile;
  return {
    version: 1,
    currentCycle: parsed.currentCycle ?? null
  };
}

function getCycleDefinition(cycleId: ReviewOpsCycleId): ReviewOpsCycleDefinition {
  const definition = p0CycleDefinitions.find((cycle) => cycle.id === cycleId);
  if (definition === undefined) {
    throw new Error(`Unsupported ReviewOps cycle: ${cycleId}`);
  }

  return definition;
}

function appendStepArtifacts(existing: FlowArtifactRef[], additions: FlowArtifactRef[]): FlowArtifactRef[] {
  // A shared portal may relocate artifacts; retain one reference per logical output.
  const outputKey = (artifact: FlowArtifactRef): string => `${artifact.flowId}:${artifact.name}`;
  const byKey = new Map(existing.map((artifact) => [outputKey(artifact), artifact]));
  for (const artifact of additions) {
    byKey.set(outputKey(artifact), artifact);
  }

  return [...byKey.values()];
}

function getCycleStatePath(): string {
  return joinWorkspacePath('.reviewops.local', 'current-cycle.local.json');
}

function safeActionId(value: string): string {
  return value.replaceAll(/[^0-9a-z]+/giu, '-').replaceAll(/^-+|-+$/gu, '').toLowerCase();
}

const responseImportArtifactSpecs = [
  { name: 'response.raw.md', kind: 'markdown' as const },
  { name: 'result.md', kind: 'markdown' as const },
  { name: 'result.json', kind: 'json' as const },
  { name: 'review-findings.json', kind: 'json' as const },
  { name: 'action-plan.seed.json', kind: 'json' as const },
  { name: 'reply-drafts.seed.json', kind: 'json' as const },
  { name: 'knowledge-candidates.json', kind: 'json' as const },
  { name: 'rule-candidates.json', kind: 'json' as const }
];

interface ResponseImportArtifactFile {
  name: string;
  kind: FlowArtifactRef['kind'];
  path: string;
  createdAt: string;
  mtimeMs: number;
}

interface ResponseImportArtifactSet {
  byName: Map<string, ResponseImportArtifactFile>;
  latestMtime: number;
  toRefs(flowId: string, names: string[]): FlowArtifactRef[];
}
