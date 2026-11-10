import { isReviewOpsProjectContextConfiguredWithRuntime } from '../application/project-context.js';
import type { ArtifactStore } from '../ports/artifact-store.js';
import { createFlowRegistry, type FlowRegistry } from '../flows/manifest.js';
import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';
import type { ReviewOpsCoreRuntime } from '../ports/runtime.js';
import { runtimeNow } from '../ports/runtime.js';
import type { FlowArtifactRef, NextAction, ReviewProviderKind } from '../types.js';
import { getReviewOpsMetaStatusWithRuntime } from './status.js';

export type P0ReadinessAreaId =
  | 'repository-bootstrap'
  | 'core-foundation'
  | 'prompt-response'
  | 'vscode-ui'
  | 'local-git-provider'
  | 'remote-provider'
  | 'review-comment-fix'
  | 'knowledge-skill-report'
  | 'cycle-meta';

export type P0ReadinessStatus = 'ready' | 'needs-setup' | 'manual-check-required';
export type P0ManualSmokeStepId =
  | 'initialize-project'
  | 'project-context'
  | 'status-command'
  | 'next-action'
  | 'local-diff-review'
  | 'artifact-views';
export type P0ManualSmokeStepStatus = 'verified' | 'pending';

export interface P0ManualSmokeStep {
  id: P0ManualSmokeStepId;
  title: string;
  status: P0ManualSmokeStepStatus;
}

export interface P0ManualSmokeStatus {
  verified: boolean;
  steps: P0ManualSmokeStep[];
}

export interface P0ReadinessCheck {
  areaId: P0ReadinessAreaId;
  title: string;
  status: P0ReadinessStatus;
  evidence: string[];
  missing?: string[];
  nextActionFlowId?: string;
  manualCheck?: string;
  manualSmoke?: P0ManualSmokeStatus;
}

export interface P0ReadinessReport {
  generatedAt: string;
  workspaceRoot: string;
  status: P0ReadinessStatus;
  summary: {
    total: number;
    ready: number;
    needsSetup: number;
    manualCheckRequired: number;
  };
  checks: P0ReadinessCheck[];
  nextActions: NextAction[];
}

export interface GetReviewOpsP0ReadinessOptions {
  workspaceRoot: string;
  registry?: FlowRegistry;
  availableProviders?: ReviewProviderKind[];
  manualSmokeVerified?: boolean;
  manualSmokeStepIds?: P0ManualSmokeStepId[];
  now?: () => Date;
}

export interface GetReviewOpsP0ReadinessWithRuntimeOptions extends Omit<GetReviewOpsP0ReadinessOptions, 'workspaceRoot'> {
  runtime: ReviewOpsCoreRuntime;
}

export interface BuildP0ReadinessArtifactsOptions extends GetReviewOpsP0ReadinessOptions {
  artifactStore: ArtifactStore;
  runId: string;
  flowId?: string;
}

export interface BuildP0ReadinessArtifactsResult {
  report: P0ReadinessReport;
  artifacts: {
    markdown: FlowArtifactRef;
    json: FlowArtifactRef;
  };
}

const defaultAvailableProviders: ReviewProviderKind[] = ['local-git', 'github'];
const remoteProviderKinds: ReviewProviderKind[] = ['github', 'gitlab'];
const p0ManualSmokeStepDefinitions: Array<Omit<P0ManualSmokeStep, 'status'>> = [
  {
    id: 'initialize-project',
    title: 'Run Initialize Project in a VS Code Extension Host'
  },
  {
    id: 'project-context',
    title: 'Run Update Project Context and save local context files'
  },
  {
    id: 'status-command',
    title: 'Run Status and confirm workspace state'
  },
  {
    id: 'next-action',
    title: 'Run Next Action and confirm guided flow handoff'
  },
  {
    id: 'local-diff-review',
    title: 'Run Prepare Local Diff Review and confirm a prompt artifact opens'
  },
  {
    id: 'artifact-views',
    title: 'Open Review Work, Knowledge, Skill Evidence, and Reports artifact views'
  }
];

const coreFoundationFlowIds = ['project/init', 'project/context', 'meta/list', 'meta/status'];
const promptResponseFlowIds = [
  'review/select-target',
  'diff/review',
  'response/import',
  'response/normalize',
  'research/select-scope',
  'research/investigate',
  'research/import-findings',
  'research/normalize-findings',
  'research/action-plan'
];
const localGitFlowIds = ['review/select-target', 'diff/review'];
const remoteProviderFlowIds = ['provider/connect', 'provider/list-targets', 'provider/fetch-review'];
const reviewCommentFixFlowIds = [
  'review/comment-triage',
  'review/action-plan',
  'fix/plan',
  'fix/checklist',
  'fix/verify',
  'fix/explain',
  'refactor/plan',
  'refactor/checklist',
  'refactor/verify',
  'refactor/explain',
  'review/reply-drafts',
  'publish/summary-draft',
  'publish/reply-draft'
];
const knowledgeSkillReportFlowIds = [
  'rules/propose',
  'rules/reconcile',
  'rules/apply',
  'rules/update',
  'knowledge/capture-candidates',
  'skill/evidence-capture',
  'field/report'
];
const cycleMetaFlowIds = [
  'cycle/mr-review',
  'cycle/comment-response',
  'cycle/fix-review',
  'cycle/research',
  'cycle/refactoring',
  'cycle/field-report',
  'meta/next',
  'meta/resume',
  'meta/readiness'
];

export async function getReviewOpsP0Readiness(
  options: GetReviewOpsP0ReadinessOptions
): Promise<P0ReadinessReport> {
  return getReviewOpsP0ReadinessWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    registry: options.registry,
    availableProviders: options.availableProviders,
    manualSmokeVerified: options.manualSmokeVerified,
    manualSmokeStepIds: options.manualSmokeStepIds,
    now: options.now
  });
}

export async function getReviewOpsP0ReadinessWithRuntime(
  options: GetReviewOpsP0ReadinessWithRuntimeOptions
): Promise<P0ReadinessReport> {
  const registry = options.registry ?? createFlowRegistry();
  const generatedAt = runtimeNow(options.runtime, options.now).toISOString();
  const status = await getReviewOpsMetaStatusWithRuntime({ runtime: options.runtime, registry });
  const projectContextConfigured = status.initialized ? await isReviewOpsProjectContextConfiguredWithRuntime(options.runtime) : true;
  const availableProviders = new Set(options.availableProviders ?? defaultAvailableProviders);
  const manualSmoke = createP0ManualSmokeStatus({
    manualSmokeVerified: options.manualSmokeVerified,
    manualSmokeStepIds: options.manualSmokeStepIds
  });
  const checks: P0ReadinessCheck[] = [
    createRepositoryBootstrapCheck(status.initialized),
    createCoreFoundationCheck({
      registry,
      projectContextConfigured
    }),
    createFlowGroupCheck({
      areaId: 'prompt-response',
      title: 'Prompt and response',
      registry,
      flowIds: promptResponseFlowIds,
      evidence: ['Review prompt/response and research investigation flows are registered.']
    }),
    createVsCodeUiCheck(manualSmoke),
    createProviderCheck({
      areaId: 'local-git-provider',
      title: 'Local git provider',
      registry,
      flowIds: localGitFlowIds,
      providerReady: availableProviders.has('local-git'),
      missingProviderMessage: 'local-git provider adapter is not available to this readiness check.',
      evidence: ['Local git diff review is the local-first P0 target path.']
    }),
    createProviderCheck({
      areaId: 'remote-provider',
      title: 'GitHub or GitLab provider MVP',
      registry,
      flowIds: remoteProviderFlowIds,
      providerReady: remoteProviderKinds.some((provider) => availableProviders.has(provider)),
      missingProviderMessage: 'At least one P0 remote provider adapter, GitHub or GitLab, is required.',
      evidence: [`Available remote providers: ${formatProviderList(availableProviders, remoteProviderKinds)}.`]
    }),
    createFlowGroupCheck({
      areaId: 'review-comment-fix',
      title: 'Review, comment, fix, and refactor flows',
      registry,
      flowIds: reviewCommentFixFlowIds,
      evidence: ['Comment triage, action planning, manual fix/refactor handling, and preview-first publish drafts are registered.']
    }),
    createFlowGroupCheck({
      areaId: 'knowledge-skill-report',
      title: 'Knowledge, skill, and report flows',
      registry,
      flowIds: knowledgeSkillReportFlowIds,
      evidence: ['Rule approval, knowledge capture, skill evidence, and field report flows are registered.']
    }),
    createFlowGroupCheck({
      areaId: 'cycle-meta',
      title: 'Cycle and meta flows',
      registry,
      flowIds: cycleMetaFlowIds,
      evidence: ['P0 cycles, resume, next action, and readiness reporting flows are registered.']
    })
  ];
  const summary = summarizeChecks(checks);

  return {
    generatedAt,
    workspaceRoot: options.runtime.workspaceRoot,
    status: summarizeStatus(summary),
    summary,
    checks,
    nextActions: createReadinessNextActions(checks, status.nextActions)
  };
}

export async function buildP0ReadinessArtifacts(
  options: BuildP0ReadinessArtifactsOptions
): Promise<BuildP0ReadinessArtifactsResult> {
  const report = await getReviewOpsP0Readiness(options);
  const flowId = options.flowId ?? 'meta/readiness';
  const markdown = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'p0-readiness.md',
    kind: 'markdown',
    content: renderP0ReadinessMarkdown(report),
    createdAt: report.generatedAt
  });
  const json = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'p0-readiness.json',
    kind: 'json',
    content: `${JSON.stringify(report, null, 2)}\n`,
    createdAt: report.generatedAt
  });

  return {
    report,
    artifacts: {
      markdown,
      json
    }
  };
}

export function renderP0ReadinessMarkdown(report: P0ReadinessReport): string {
  const lines = [
    '# ReviewOps P0 Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Workspace: ${report.workspaceRoot}`,
    `Overall status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- Ready: ${report.summary.ready}`,
    `- Needs setup: ${report.summary.needsSetup}`,
    `- Manual check required: ${report.summary.manualCheckRequired}`,
    '',
    '## Checks',
    ''
  ];

  for (const check of report.checks) {
    lines.push(`### ${check.title}`, '', `- Status: ${check.status}`);
    for (const evidence of check.evidence) {
      lines.push(`- Evidence: ${evidence}`);
    }
    for (const missing of check.missing ?? []) {
      lines.push(`- Missing: ${missing}`);
    }
    if (check.nextActionFlowId !== undefined) {
      lines.push(`- Next flow: ${check.nextActionFlowId}`);
    }
    if (check.manualCheck !== undefined) {
      lines.push(`- Manual check: ${check.manualCheck}`);
    }
    if (check.manualSmoke !== undefined) {
      lines.push(`- Manual smoke: ${check.manualSmoke.verified ? 'verified' : 'pending'}`);
      for (const step of check.manualSmoke.steps) {
        lines.push(`  - [${step.status === 'verified' ? 'x' : ' '}] ${step.title}`);
      }
    }
    lines.push('');
  }

  lines.push('## Next Actions', '');
  if (report.nextActions.length === 0) {
    lines.push('- No next action is available.');
  } else {
    for (const action of report.nextActions) {
      lines.push(`- ${action.title} (${action.flowId}): ${action.reason}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function createP0ManualSmokeStatus(options: {
  manualSmokeVerified?: boolean;
  manualSmokeStepIds?: P0ManualSmokeStepId[];
}): P0ManualSmokeStatus {
  const verifiedStepIds = new Set<P0ManualSmokeStepId>(
    options.manualSmokeVerified === true
      ? p0ManualSmokeStepDefinitions.map((step) => step.id)
      : (options.manualSmokeStepIds ?? [])
  );
  const steps = p0ManualSmokeStepDefinitions.map<P0ManualSmokeStep>((step) => ({
    ...step,
    status: verifiedStepIds.has(step.id) ? 'verified' : 'pending'
  }));

  return {
    verified: steps.every((step) => step.status === 'verified'),
    steps
  };
}

function createRepositoryBootstrapCheck(initialized: boolean): P0ReadinessCheck {
  return {
    areaId: 'repository-bootstrap',
    title: 'Repository bootstrap',
    status: initialized ? 'ready' : 'needs-setup',
    evidence: initialized
      ? ['.reviewops/ and .reviewops.local/ are present.']
      : ['.reviewops/ and .reviewops.local/ must be initialized before P0 flows can run.'],
    nextActionFlowId: initialized ? undefined : 'project/init'
  };
}

function createCoreFoundationCheck(options: { registry: FlowRegistry; projectContextConfigured: boolean }): P0ReadinessCheck {
  const missingFlows = missingFlowIds(options.registry, coreFoundationFlowIds);
  const projectContextMissing = !options.projectContextConfigured;
  const missing = [...missingFlows, ...(projectContextMissing ? ['project/context has not been configured.'] : [])];

  return {
    areaId: 'core-foundation',
    title: 'Core foundation',
    status: missing.length === 0 ? 'ready' : 'needs-setup',
    evidence:
      missing.length === 0
        ? [
            `${options.registry.list().length} P0 flow manifest entries are registered.`,
            'Core flow manifest validation keeps AI execution manual-only and AI network disabled.',
            'Project context is configured.'
          ]
        : ['Core flow manifest or workspace context is incomplete.'],
    missing: missing.length === 0 ? undefined : missing,
    nextActionFlowId: missing.length === 0 ? undefined : (missingFlows[0] ?? 'project/context')
  };
}

function createFlowGroupCheck(options: {
  areaId: P0ReadinessAreaId;
  title: string;
  registry: FlowRegistry;
  flowIds: string[];
  evidence: string[];
}): P0ReadinessCheck {
  const missing = missingFlowIds(options.registry, options.flowIds);

  return {
    areaId: options.areaId,
    title: options.title,
    status: missing.length === 0 ? 'ready' : 'needs-setup',
    evidence: missing.length === 0 ? options.evidence : ['Required P0 flow registrations are incomplete.'],
    missing: missing.length === 0 ? undefined : missing,
    nextActionFlowId: missing.length === 0 ? undefined : missing[0]
  };
}

function createVsCodeUiCheck(manualSmoke: P0ManualSmokeStatus): P0ReadinessCheck {
  const verifiedSteps = manualSmoke.steps.filter((step) => step.status === 'verified');
  const pendingSteps = manualSmoke.steps.filter((step) => step.status === 'pending');

  return {
    areaId: 'vscode-ui',
    title: 'VS Code UI',
    status: manualSmoke.verified ? 'ready' : 'manual-check-required',
    evidence: manualSmoke.verified
      ? ['VS Code Extension Host smoke was marked verified for all required P0 UI steps.']
      : [
          'Automated package and activation smoke tests cover command/view registration.',
          `Manual smoke progress: ${verifiedSteps.length}/${manualSmoke.steps.length} required steps verified.`
        ],
    manualCheck: manualSmoke.verified
      ? undefined
      : `Before tagging v0.1, run ReviewOps Guard in a VS Code Extension Host and complete: ${pendingSteps.map((step) => step.title).join('; ')}.`,
    manualSmoke
  };
}

function createProviderCheck(options: {
  areaId: P0ReadinessAreaId;
  title: string;
  registry: FlowRegistry;
  flowIds: string[];
  providerReady: boolean;
  missingProviderMessage: string;
  evidence: string[];
}): P0ReadinessCheck {
  const missing = [...missingFlowIds(options.registry, options.flowIds), ...(options.providerReady ? [] : [options.missingProviderMessage])];

  return {
    areaId: options.areaId,
    title: options.title,
    status: missing.length === 0 ? 'ready' : 'needs-setup',
    evidence: missing.length === 0 ? options.evidence : ['Provider readiness is incomplete.'],
    missing: missing.length === 0 ? undefined : missing,
    nextActionFlowId: missing.length === 0 ? undefined : options.flowIds[0]
  };
}

function missingFlowIds(registry: FlowRegistry, flowIds: string[]): string[] {
  return flowIds.filter((flowId) => registry.get(flowId) === undefined);
}

function summarizeChecks(checks: P0ReadinessCheck[]): P0ReadinessReport['summary'] {
  return {
    total: checks.length,
    ready: checks.filter((check) => check.status === 'ready').length,
    needsSetup: checks.filter((check) => check.status === 'needs-setup').length,
    manualCheckRequired: checks.filter((check) => check.status === 'manual-check-required').length
  };
}

function summarizeStatus(summary: P0ReadinessReport['summary']): P0ReadinessStatus {
  if (summary.needsSetup > 0) {
    return 'needs-setup';
  }

  if (summary.manualCheckRequired > 0) {
    return 'manual-check-required';
  }

  return 'ready';
}

function createReadinessNextActions(checks: P0ReadinessCheck[], fallback: NextAction[]): NextAction[] {
  const needsSetup = checks.find((check) => check.status === 'needs-setup' && check.nextActionFlowId !== undefined);
  if (needsSetup?.nextActionFlowId !== undefined) {
    return [
      {
        id: `p0-readiness-${needsSetup.areaId}`,
        title: `Complete ${needsSetup.title}`,
        flowId: needsSetup.nextActionFlowId,
        reason: needsSetup.evidence[0] ?? `${needsSetup.title} is required for ReviewOps P0.`
      }
    ];
  }

  const manualCheck = checks.find((check) => check.status === 'manual-check-required');
  if (manualCheck !== undefined) {
    return [
      {
        id: `p0-readiness-${manualCheck.areaId}`,
        title: `Verify ${manualCheck.title}`,
        flowId: 'meta/readiness',
        reason: manualCheck.manualCheck ?? `${manualCheck.title} needs a manual readiness check.`
      }
    ];
  }

  return fallback;
}

function formatProviderList(availableProviders: Set<ReviewProviderKind>, expectedProviders: ReviewProviderKind[]): string {
  const matching = expectedProviders.filter((provider) => availableProviders.has(provider));
  return matching.length === 0 ? 'none' : matching.join(', ');
}
