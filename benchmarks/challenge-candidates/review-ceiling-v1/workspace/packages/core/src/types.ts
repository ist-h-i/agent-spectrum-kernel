export type FlowType = 'atomic' | 'composite' | 'cycle' | 'meta';
export type FlowPriority = 'P0' | 'P1' | 'P2';
export type AiExecutionMode = 'manual-only';

export type FlowInputKind =
  | 'action-plan'
  | 'artifact'
  | 'comment'
  | 'config'
  | 'diff'
  | 'fix-plan'
  | 'fix-verification'
  | 'knowledge-candidate'
  | 'refactor-plan'
  | 'refactor-verification'
  | 'response'
  | 'rule-candidate'
  | 'skill-evidence'
  | 'target'
  | 'text'
  | 'workspace';

export type FlowOutputKind =
  | 'action-plan'
  | 'artifact'
  | 'comment-triage'
  | 'config'
  | 'field-report'
  | 'fix-checklist'
  | 'fix-explanation'
  | 'fix-plan'
  | 'fix-verification'
  | 'knowledge-candidate'
  | 'publish-draft'
  | 'refactor-checklist'
  | 'refactor-explanation'
  | 'refactor-plan'
  | 'refactor-verification'
  | 'reply-draft'
  | 'rule-candidate'
  | 'skill-evidence'
  | 'status'
  | 'test-scenarios'
  | 'target'
  | 'understanding-memo';

export type FlowSideEffect =
  | 'read-workspace'
  | 'write-artifact'
  | 'write-config'
  | 'write-knowledge'
  | 'write-local-state';

export type KnowledgeHookId = string;
export type SkillHookId = string;

export interface FlowInputSpec {
  id: string;
  kind: FlowInputKind;
  required: boolean;
  description: string;
}

export interface FlowOutputSpec {
  id: string;
  kind: FlowOutputKind;
  description: string;
}

export interface FlowManifestEntry {
  id: string;
  title: string;
  type: FlowType;
  priority: FlowPriority;
  description: string;
  aiExecution: AiExecutionMode;
  network: {
    ai: false;
    devServices: boolean;
  };
  inputs: FlowInputSpec[];
  outputs: FlowOutputSpec[];
  sideEffects: FlowSideEffect[];
  knowledgeHooks: KnowledgeHookId[];
  skillHooks: SkillHookId[];
  nextActions: string[];
}

export type ReviewProviderKind = 'local-git' | 'github' | 'gitlab' | 'backlog';

export interface ReviewTargetRef {
  provider: ReviewProviderKind;
  repository: string;
  id: string;
  url?: string;
}

export interface ReviewTarget {
  ref: ReviewTargetRef;
  title: string;
  author?: string;
  sourceBranch?: string;
  targetBranch?: string;
  status?: 'open' | 'merged' | 'closed' | 'draft' | 'unknown';
  createdAt?: string;
  updatedAt?: string;
}

export interface ReviewDiff {
  target: ReviewTargetRef;
  files: ReviewDiffFile[];
  summary: {
    changedFiles: number;
    additions?: number;
    deletions?: number;
    backendTouched: boolean;
    frontendTouched: boolean;
    testTouched: boolean;
    docsTouched: boolean;
    configTouched: boolean;
  };
  rawPatch?: string;
}

export interface ReviewDiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  patch?: string;
}

export interface ReviewComment {
  id: string;
  author?: string;
  body: string;
  file?: string;
  line?: number;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReviewReply {
  commentId: string;
  body: string;
}

export type ReviewCommentDisposition = 'needs-fix' | 'needs-reply' | 'acknowledge' | 'informational';
export type ReviewCommentPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface ReviewCommentTriageItem {
  id: string;
  commentId: string;
  title: string;
  disposition: ReviewCommentDisposition;
  priority: ReviewCommentPriority;
  requiresCodeChange: boolean;
  requiresReply: boolean;
  file?: string;
  line?: number;
  author?: string;
  bodyExcerpt: string;
  suggestedAction: string;
}

export interface ReviewCommentTriage {
  totalComments: number;
  needsFixCount: number;
  needsReplyCount: number;
  informationalCount: number;
  items: ReviewCommentTriageItem[];
}

export interface ReviewUnderstandingMemoItem {
  id: string;
  commentId: string;
  title: string;
  disposition: ReviewCommentDisposition;
  priority: ReviewCommentPriority;
  background: string;
  problem: string;
  impact: string;
  inspectionPoint: string;
  fixDirection: string;
  question: string;
  testFocus: string;
}

export interface ReviewUnderstandingMemo {
  target?: ReviewTargetRef;
  items: ReviewUnderstandingMemoItem[];
  nextQuestions: string[];
  summary: {
    totalItems: number;
    needsFixCount: number;
    needsReplyCount: number;
    questionCount: number;
  };
}

export interface ReviewActionPlanUnderstandingMemoItem {
  id: string;
  title: string;
  priority: ReviewCommentPriority;
  source: 'comment' | 'response';
  background: string;
  problem: string;
  impact: string;
  inspectionPoint: string;
  fixDirection: string;
  question: string;
  testFocus: string;
}

export type ReviewActionPlanUnderstandingMemo = ReviewActionPlanUnderstandingMemoItem[];

export interface ReviewActionPlanItem {
  id: string;
  title: string;
  priority: ReviewCommentPriority;
  source: 'comment' | 'response';
  relatedCommentIds: string[];
  steps: string[];
  doneCriteria: string[];
}

export type ReviewFixPlanStatus = 'planned' | 'verified';

export interface ReviewFixPlanItem {
  id: string;
  sourceActionId: string;
  title: string;
  priority: ReviewCommentPriority;
  targetFiles: string[];
  approach: string;
  impact: string;
  verification: string[];
  docsUpdateRequired: boolean;
  replyRequired: boolean;
  ruleCandidate: boolean;
  status: ReviewFixPlanStatus;
}

export interface ReviewFixPlan {
  target?: ReviewTargetRef;
  items: ReviewFixPlanItem[];
  summary: {
    totalItems: number;
    p0Count: number;
    requiresReplyCount: number;
    docsUpdateCount: number;
    ruleCandidateCount: number;
  };
}

export interface ReviewFixChecklistItem {
  id: string;
  fixPlanItemId: string;
  title: string;
  priority: ReviewCommentPriority;
  checks: string[];
  status: 'open';
}

export interface ReviewFixChecklist {
  target?: ReviewTargetRef;
  items: ReviewFixChecklistItem[];
  summary: {
    totalItems: number;
    p0Count: number;
    replyRequiredCount: number;
  };
}

export interface ReviewTestScenarioItem {
  id: string;
  fixPlanItemId: string;
  title: string;
  priority: ReviewCommentPriority;
  targetFiles: string[];
  scenario: string;
  setup: string;
  steps: string[];
  expectedOutcome: string;
  commands: string[];
  riskCovered: string;
}

export interface ReviewTestScenarios {
  target?: ReviewTargetRef;
  items: ReviewTestScenarioItem[];
  summary: {
    totalItems: number;
    p0Count: number;
    commandCount: number;
  };
}

export type ReviewFixVerificationStatus =
  | 'resolved'
  | 'partially_resolved'
  | 'not_resolved'
  | 'new_risk_found'
  | 'needs_followup_issue';

export interface ReviewFixVerificationResult {
  id: string;
  fixPlanItemId: string;
  status: ReviewFixVerificationStatus;
  evidence: string;
  commands: string[];
  unresolvedRisk?: string;
  followUpIssueTitle?: string;
  verifiedAt: string;
}

export interface ReviewFixVerification {
  target?: ReviewTargetRef;
  results: ReviewFixVerificationResult[];
  summary: {
    resolvedCount: number;
    partiallyResolvedCount: number;
    unresolvedCount: number;
    newRiskCount: number;
    followUpIssueCount: number;
  };
}

export interface ReviewFixExplanation {
  target?: ReviewTargetRef;
  body: string;
  resolvedItemIds: string[];
  unresolvedRisks: string[];
  followUpIssueTitles: string[];
  summary: {
    verifiedItems: number;
    resolvedCount: number;
    unresolvedCount: number;
    followUpIssueCount: number;
  };
}

export interface ReviewReplyDraft {
  commentId: string;
  publishDraft: PublishDraft;
}

export type RuleCandidateKind =
  | 'coding-guideline'
  | 'review-rule'
  | 'architecture-rule'
  | 'docs-drift-rule'
  | 'test-rule'
  | 'generic-debt-pattern';

export type KnowledgeScope =
  | 'project-local'
  | 'portable-candidate'
  | 'organization-portable'
  | 'prohibited';

export interface RuleCandidate {
  id: string;
  kind: RuleCandidateKind;
  title: string;
  rationale: string;
  source: {
    flowRunId: string;
    artifactId?: string;
    commentId?: string;
    findingId?: string;
  };
  scope: KnowledgeScope;
  suggestedRule?: Record<string, unknown>;
  reviewQuestions?: string[];
  mentorHints?: string[];
  risks?: string[];
  mitigations?: string[];
  status: 'new' | 'duplicate' | 'merge_needed' | 'conflict' | 'applied' | 'rejected';
}

export type KnowledgeCandidateKind =
  | 'good-practice'
  | 'review-tip'
  | 'generic-debt-pattern'
  | 'roadmap-skill'
  | 'coding-guideline'
  | 'project-debt';

export interface KnowledgeCandidate {
  id: string;
  kind: KnowledgeCandidateKind;
  title: string;
  summary: string;
  details?: string;
  sourceFlowRunId: string;
  scope: KnowledgeScope;
  status: 'candidate' | 'accepted' | 'rejected' | 'promoted';
}

export type SkillSignalKind =
  | 'bug-risk-detection'
  | 'architecture-boundary-understanding'
  | 'test-design'
  | 'docs-drift-awareness'
  | 'review-response-quality'
  | 'fix-planning'
  | 'technical-explanation'
  | 'rule-extraction'
  | 'good-practice-recognition';

export interface SkillEvidence {
  id: string;
  flowRunId: string;
  target?: ReviewTargetRef;
  createdAt: string;
  kind: SkillSignalKind;
  title: string;
  summary: string;
  evidenceRefs: FlowArtifactRef[];
  strength: 'weak' | 'medium' | 'strong';
  evaluationUse: 'self-review' | 'mentor-review' | 'field-report';
  notes?: string;
}

export interface FieldReport {
  id: string;
  period: {
    from: string;
    to: string;
  };
  targetScope: 'developer' | 'field' | 'reviewer' | 'team';
  summary: string;
  resolvedFindings: number;
  unresolvedRisks: number;
  addedTests: number;
  ruleCandidates: number;
  knowledgeCandidates: number;
  skillSignals: SkillEvidence[];
  portableKnowledgeCandidates: KnowledgeCandidate[];
  recommendedMentorActions: string[];
  markdownPath: string;
  jsonPath: string;
}

export interface IssueRef {
  provider: 'github' | 'gitlab' | 'backlog' | 'jira';
  repository: string;
  id: string;
  url?: string;
}

export interface WorkItemRef {
  provider: 'local';
  id: string;
  title: string;
}

export interface PublishDraft {
  id: string;
  provider: ReviewProviderKind | IssueRef['provider'];
  target: ReviewTargetRef | IssueRef;
  title: string;
  body: string;
  mode: 'summary-comment' | 'reply' | 'issue-create' | 'issue-comment';
  requiresConfirmation: true;
  status: 'draft' | 'posted' | 'failed';
  createdAt: string;
  url?: string;
}

export type FlowRunStatus =
  | 'created'
  | 'prepared'
  | 'prompt_generated'
  | 'awaiting_ai_response'
  | 'response_imported'
  | 'artifact_generated'
  | 'action_planned'
  | 'ready_to_publish'
  | 'published'
  | 'knowledge_captured'
  | 'skill_evidence_captured'
  | 'failed';

export interface NextAction {
  id: string;
  title: string;
  flowId: string;
  reason: string;
}

export type ReviewOpsCommandKind = 'cycle' | 'flow' | 'setup' | 'meta' | 'provider' | 'publish' | 'knowledge';

export type ReviewOpsCommandPersona = 'junior' | 'senior' | 'both';

export type ReviewOpsCommandGuideStep = 'understand' | 'investigate' | 'design' | 'implement' | 'confirm' | 'none';

export type ReviewOpsCommandArtifactKind =
  | 'action-plan'
  | 'checklist'
  | 'cycle-state'
  | 'evidence'
  | 'explanation'
  | 'field-report'
  | 'knowledge'
  | 'main-files'
  | 'prompt'
  | 'provider-setting'
  | 'publish-draft'
  | 'rule-candidate'
  | 'status'
  | 'workspace-files';

export type ReviewOpsCommandRiskLevel = 'low' | 'medium' | 'high';

export type ReviewOpsCommandCategory =
  | 'start-cycle'
  | 'prepare-work'
  | 'continue-import'
  | 'publish-preview'
  | 'rules-knowledge'
  | 'setup-status';

export interface ReviewOpsCommandCatalogEntry {
  id: string;
  kind: ReviewOpsCommandKind;
  category: ReviewOpsCommandCategory;
  label: string;
  summary: string;
  outcome: string;
  effects: string[];
  vsCodeCommand: string;
  requiresInitialized: boolean;
  requiresConfirmation: boolean;
  aliases: string[];
  persona: ReviewOpsCommandPersona;
  shortcut: string;
  guideStep: ReviewOpsCommandGuideStep;
  artifactKind: ReviewOpsCommandArtifactKind;
  requiresPreview: boolean;
  riskLevel: ReviewOpsCommandRiskLevel;
  batchable: boolean;
  estimatedDuration: string;
}

export type ReviewOpsCycleId =
  | 'cycle/mr-review'
  | 'cycle/comment-response'
  | 'cycle/fix-review'
  | 'cycle/research'
  | 'cycle/refactoring'
  | 'cycle/field-report';

export type ReviewOpsCycleStatus = 'active' | 'blocked' | 'completed';

export type ReviewOpsCycleStepStatus = 'pending' | 'ready' | 'completed' | 'blocked';

export interface ReviewOpsCycleStartContext {
  scopeLabel: string;
  intent: string;
  targetMode: 'current-diff' | 'selected-files' | 'project-wide' | 'manual';
  targetFiles?: string[];
}

export interface ReviewOpsCycleDefinition {
  id: ReviewOpsCycleId;
  title: string;
  description: string;
  steps: string[];
}

export interface ReviewOpsCycleStep {
  flowId: string;
  title: string;
  status: ReviewOpsCycleStepStatus;
  reason: string;
  artifacts: FlowArtifactRef[];
}

export interface ReviewOpsCurrentCycle {
  version: 1;
  cycleId: ReviewOpsCycleId;
  runId: string;
  title: string;
  status: ReviewOpsCycleStatus;
  startedAt: string;
  updatedAt: string;
  target?: ReviewTargetRef | IssueRef | WorkItemRef;
  startContext?: ReviewOpsCycleStartContext;
  steps: ReviewOpsCycleStep[];
  nextActions: NextAction[];
}

export interface ReviewOpsCycleStateFile {
  version: 1;
  currentCycle: ReviewOpsCurrentCycle | null;
}

export type FlowArtifactKind = 'json' | 'jsonl' | 'markdown' | 'text' | 'yaml';

export interface FlowArtifactRef {
  flowId: string;
  runId: string;
  name: string;
  kind: FlowArtifactKind;
  path: string;
  createdAt: string;
}

export interface FlowRunError {
  code: string;
  message: string;
}

export interface FlowRun {
  id: string;
  flowId: string;
  cycleId?: string;
  status: FlowRunStatus;
  createdAt: string;
  updatedAt: string;
  target?: ReviewTargetRef | IssueRef | WorkItemRef;
  artifacts: FlowArtifactRef[];
  nextActions: NextAction[];
  error?: FlowRunError;
}

export interface FlowRunTransition {
  from: FlowRunStatus;
  to: FlowRunStatus;
  reason: string;
  at: string;
}
