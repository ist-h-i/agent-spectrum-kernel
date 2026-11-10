import type { ArtifactStore } from '../ports/artifact-store.js';
import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';
import type { ReviewOpsCoreRuntime } from '../ports/runtime.js';
import { runtimeNow } from '../ports/runtime.js';
import type {
  FlowArtifactRef,
  ReviewActionPlanItem,
  ReviewCommentTriage,
  ReviewTargetRef,
  RuleCandidate,
  SkillEvidence,
  SkillSignalKind
} from '../types.js';

export interface ManualSkillEvidenceInput {
  kind: SkillSignalKind;
  title: string;
  summary: string;
  strength?: SkillEvidence['strength'];
  notes?: string;
}

export interface BuildSkillEvidenceArtifactsOptions {
  artifactStore: ArtifactStore;
  workspaceRoot: string;
  runId: string;
  target?: ReviewTargetRef;
  actionPlan?: ReviewActionPlanItem[];
  triage?: ReviewCommentTriage;
  ruleCandidates?: RuleCandidate[];
  evidenceRefs?: FlowArtifactRef[];
  manualEvidence?: ManualSkillEvidenceInput[];
  flowId?: string;
  now?: () => Date;
}

export interface BuildSkillEvidenceArtifactsWithRuntimeOptions extends Omit<BuildSkillEvidenceArtifactsOptions, 'workspaceRoot'> {
  runtime: ReviewOpsCoreRuntime;
}

export interface BuildSkillEvidenceArtifactsResult {
  skillEvidence: SkillEvidence[];
  artifacts: {
    skillEvidence: FlowArtifactRef;
  };
  fieldEvidenceLogPath: string;
}

export async function buildSkillEvidenceArtifacts(
  options: BuildSkillEvidenceArtifactsOptions
): Promise<BuildSkillEvidenceArtifactsResult> {
  return buildSkillEvidenceArtifactsWithRuntime({
    ...options,
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot)
  });
}

export async function buildSkillEvidenceArtifactsWithRuntime(
  options: BuildSkillEvidenceArtifactsWithRuntimeOptions
): Promise<BuildSkillEvidenceArtifactsResult> {
  const createdAt = runtimeNow(options.runtime, options.now).toISOString();
  const flowId = options.flowId ?? 'skill/evidence-capture';
  const skillEvidence = createSkillEvidence({
    runId: options.runId,
    createdAt,
    target: options.target,
    actionPlan: options.actionPlan ?? [],
    triage: options.triage,
    ruleCandidates: options.ruleCandidates ?? [],
    evidenceRefs: options.evidenceRefs ?? [],
    manualEvidence: options.manualEvidence ?? []
  });

  const skillEvidenceArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'skill-evidence.json',
    kind: 'json',
    content: `${JSON.stringify(skillEvidence, null, 2)}\n`,
    createdAt
  });
  const fieldEvidenceLogPath = await appendFieldEvidence(options.runtime, skillEvidence);

  return {
    skillEvidence,
    artifacts: {
      skillEvidence: skillEvidenceArtifact
    },
    fieldEvidenceLogPath
  };
}

export function createSkillEvidence(options: {
  runId: string;
  createdAt: string;
  target?: ReviewTargetRef;
  actionPlan: ReviewActionPlanItem[];
  triage?: ReviewCommentTriage;
  ruleCandidates: RuleCandidate[];
  evidenceRefs: FlowArtifactRef[];
  manualEvidence: ManualSkillEvidenceInput[];
}): SkillEvidence[] {
  const evidence: SkillEvidence[] = [];

  if (options.triage !== undefined && options.triage.totalComments > 0) {
    evidence.push({
      id: `${options.runId}-review-response-quality`,
      flowRunId: options.runId,
      target: options.target,
      createdAt: options.createdAt,
      kind: 'review-response-quality',
      title: 'Review comment triage completed',
      summary: `${options.triage.totalComments} comments triaged; ${options.triage.needsFixCount} need fixes and ${options.triage.needsReplyCount} need replies.`,
      evidenceRefs: options.evidenceRefs,
      strength: options.triage.needsFixCount + options.triage.needsReplyCount >= 3 ? 'strong' : 'medium',
      evaluationUse: 'self-review'
    });
  }

  if (options.actionPlan.length > 0) {
    evidence.push({
      id: `${options.runId}-fix-planning`,
      flowRunId: options.runId,
      target: options.target,
      createdAt: options.createdAt,
      kind: 'fix-planning',
      title: 'Manual fix plan prepared',
      summary: `${options.actionPlan.length} action items include verification and reply criteria.`,
      evidenceRefs: options.evidenceRefs,
      strength: options.actionPlan.length >= 3 ? 'strong' : 'medium',
      evaluationUse: 'mentor-review'
    });
  }

  if (options.actionPlan.some((item) => item.steps.some((step) => /test|spec|coverage/iu.test(step)))) {
    evidence.push({
      id: `${options.runId}-test-design`,
      flowRunId: options.runId,
      target: options.target,
      createdAt: options.createdAt,
      kind: 'test-design',
      title: 'Verification planning captured',
      summary: 'The action plan includes explicit test, spec, or coverage verification steps.',
      evidenceRefs: options.evidenceRefs,
      strength: 'medium',
      evaluationUse: 'mentor-review'
    });
  }

  const applicableRules = options.ruleCandidates.filter(
    (candidate) => candidate.status === 'new' || candidate.status === 'applied'
  );
  if (applicableRules.length > 0) {
    evidence.push({
      id: `${options.runId}-rule-extraction`,
      flowRunId: options.runId,
      target: options.target,
      createdAt: options.createdAt,
      kind: 'rule-extraction',
      title: 'Reusable rule candidates extracted',
      summary: `${applicableRules.length} rule candidates were prepared without automatic scoring or ranking.`,
      evidenceRefs: options.evidenceRefs,
      strength: applicableRules.length >= 2 ? 'strong' : 'medium',
      evaluationUse: 'field-report'
    });
  }

  for (const [index, manual] of options.manualEvidence.entries()) {
    evidence.push({
      id: `${options.runId}-manual-${index + 1}`,
      flowRunId: options.runId,
      target: options.target,
      createdAt: options.createdAt,
      kind: manual.kind,
      title: manual.title,
      summary: manual.summary,
      evidenceRefs: options.evidenceRefs,
      strength: manual.strength ?? 'weak',
      evaluationUse: 'self-review',
      notes: manual.notes
    });
  }

  if (evidence.length === 0) {
    evidence.push({
      id: `${options.runId}-technical-explanation`,
      flowRunId: options.runId,
      target: options.target,
      createdAt: options.createdAt,
      kind: 'technical-explanation',
      title: 'ReviewOps evidence placeholder',
      summary: 'No scored evaluation was generated; add review artifacts before using this in a field report.',
      evidenceRefs: options.evidenceRefs,
      strength: 'weak',
      evaluationUse: 'self-review'
    });
  }

  return evidence;
}

async function appendFieldEvidence(runtime: ReviewOpsCoreRuntime, skillEvidence: SkillEvidence[]): Promise<string> {
  const relativePath = '.reviewops.local/field-evidence.local.jsonl';
  await runtime.workspace.appendText(relativePath, skillEvidence.map((evidence) => JSON.stringify(evidence)).join('\n') + '\n');

  return relativePath;
}
