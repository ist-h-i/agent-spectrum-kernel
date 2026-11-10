import type {
  ReviewOpsCommandArtifactKind,
  ReviewOpsCommandCatalogEntry,
  ReviewOpsCommandCategory,
  ReviewOpsCommandGuideStep,
  ReviewOpsCommandPersona,
  ReviewOpsCommandRiskLevel
} from '../types.js';

type ReviewOpsCommandCatalogBaseEntry = Omit<
  ReviewOpsCommandCatalogEntry,
  | 'persona'
  | 'shortcut'
  | 'guideStep'
  | 'artifactKind'
  | 'requiresPreview'
  | 'riskLevel'
  | 'batchable'
  | 'estimatedDuration'
>;

export interface ReviewOpsCommandCategoryDefinition {
  id: ReviewOpsCommandCategory;
  title: string;
  description: string;
}

export const reviewOpsCommandCategories: ReviewOpsCommandCategoryDefinition[] = [
  {
    id: 'start-cycle',
    title: 'Start Cycle',
    description: 'Start a guided ReviewOps cycle from a specific intent.'
  },
  {
    id: 'prepare-work',
    title: 'Prepare Work',
    description: 'Create review, triage, and fix-planning artifacts.'
  },
  {
    id: 'continue-import',
    title: 'Continue / Import',
    description: 'Import external responses, continue the current cycle, and record verification.'
  },
  {
    id: 'publish-preview',
    title: 'Publish Preview',
    description: 'Create preview-first drafts before any provider write.'
  },
  {
    id: 'rules-knowledge',
    title: 'Rules / Knowledge',
    description: 'Capture reusable rules, knowledge candidates, skill evidence, and reports.'
  },
  {
    id: 'setup-status',
    title: 'Setup / Status',
    description: 'Initialize, configure, inspect, and preview the ReviewOps workspace.'
  }
];

const reviewOpsCommandCatalogBase: ReviewOpsCommandCatalogBaseEntry[] = [
  {
    id: 'cycle/research',
    kind: 'cycle',
    category: 'start-cycle',
    label: 'Start Research Cycle',
    summary: 'Investigate a code, design, or operational question.',
    outcome: 'Creates the current cycle state and makes research scope selection the next step.',
    effects: ['Writes .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.commandCenter',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['research', 'investigate', '調査']
  },
  {
    id: 'cycle/refactoring',
    kind: 'cycle',
    category: 'start-cycle',
    label: 'Start Refactoring Cycle',
    summary: 'Plan and verify a refactor with reusable evidence capture.',
    outcome: 'Creates the current cycle state and makes refactor planning the next step.',
    effects: ['Writes .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.commandCenter',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['refactor', 'refactoring', 'リファクタリング']
  },
  {
    id: 'cycle/mr-review',
    kind: 'cycle',
    category: 'start-cycle',
    label: 'Start MR Review Cycle',
    summary: 'Prepare a review prompt, import the answer, and capture evidence.',
    outcome: 'Creates the current cycle state and makes target selection the next step.',
    effects: ['Writes .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.commandCenter',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['mr', 'pr', 'review', 'review.run', 'レビュー']
  },
  {
    id: 'cycle/comment-response',
    kind: 'cycle',
    category: 'start-cycle',
    label: 'Start Comment Response Cycle',
    summary: 'Triage provider comments, plan fixes, preview replies, and capture evidence.',
    outcome: 'Creates the current cycle state and makes provider review fetch the next step.',
    effects: ['Writes .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.commandCenter',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['comment', 'reply', 'コメント', '返信']
  },
  {
    id: 'cycle/fix-review',
    kind: 'cycle',
    category: 'start-cycle',
    label: 'Start Fix Review Cycle',
    summary: 'Review a manual fix, normalize feedback, verify outcomes, and capture evidence.',
    outcome: 'Creates the current cycle state and makes target selection the next step.',
    effects: ['Writes .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.commandCenter',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['fix', 'verify', '修正', '検証']
  },
  {
    id: 'cycle/field-report',
    kind: 'cycle',
    category: 'start-cycle',
    label: 'Start Field Report Cycle',
    summary: 'Collect knowledge and skill evidence into a local field report.',
    outcome: 'Creates the current cycle state and makes knowledge capture the next step.',
    effects: ['Writes .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.commandCenter',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['field report', 'report', 'フィールドレポート']
  },
  {
    id: 'research/select-scope',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Select Research Scope',
    summary: 'Collect the scoped investigation context for the current research cycle.',
    outcome: 'Prepares scoped context for the investigation prompt.',
    effects: ['Reads selected files when provided', 'Uses .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.prepareLocalDiffReview',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['research scope', 'investigation scope', '調査範囲']
  },
  {
    id: 'research/investigate',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Prepare Research Prompt',
    summary: 'Create a manual investigation prompt from scoped context.',
    outcome: 'Opens a generated prompt artifact for external AI or human investigation.',
    effects: ['Writes .reviewops/out/research-investigate/<run-id>/prompt.md'],
    vsCodeCommand: 'reviewops.prepareLocalDiffReview',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['research prompt', 'investigate', 'requirements.draft', 'requirements', 'reqs', '調査プロンプト']
  },
  {
    id: 'research/import-findings',
    kind: 'flow',
    category: 'continue-import',
    label: 'Import Research Findings',
    summary: 'Paste and normalize manually produced investigation findings.',
    outcome: 'Records findings, follow-up seeds, and knowledge candidate artifacts.',
    effects: ['Writes research import and normalization artifacts'],
    vsCodeCommand: 'reviewops.importManualReviewResponse',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['import research', 'research findings', '調査結果']
  },
  {
    id: 'research/normalize-findings',
    kind: 'flow',
    category: 'continue-import',
    label: 'Normalize Research Findings',
    summary: 'Normalize imported investigation findings into structured follow-up work.',
    outcome: 'Uses the same import command to create normalized research artifacts.',
    effects: ['Writes research normalization artifacts'],
    vsCodeCommand: 'reviewops.importManualReviewResponse',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['normalize research', '調査正規化']
  },
  {
    id: 'research/action-plan',
    kind: 'flow',
    category: 'continue-import',
    label: 'Build Research Action Plan',
    summary: 'Turn investigation findings into follow-up actions and knowledge capture work.',
    outcome: 'Opens a research action-plan artifact for follow-up work.',
    effects: ['Writes .reviewops/out/research-action-plan/<run-id>/action-plan.md'],
    vsCodeCommand: 'reviewops.buildReviewActionPlan',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['research action plan', '調査アクション計画']
  },
  {
    id: 'review/select-target',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Select Review Target',
    summary: 'Collect local git target metadata and diff input before prompt generation.',
    outcome: 'Opens a generated prompt artifact for external AI or human review.',
    effects: ['Writes .reviewops/out/diff-review/<run-id>/prompt.md'],
    vsCodeCommand: 'reviewops.prepareLocalDiffReview',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['select target', 'target', 'レビュー対象']
  },
  {
    id: 'diff/review',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Prepare Local Diff Review',
    summary: 'Create a manual review prompt from the local git diff.',
    outcome: 'Opens a generated prompt artifact for external AI or human review.',
    effects: ['Writes .reviewops/out/diff-review/<run-id>/prompt.md'],
    vsCodeCommand: 'reviewops.prepareLocalDiffReview',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['local diff', 'prompt', '差分レビュー']
  },
  {
    id: 'provider/fetch-review',
    kind: 'provider',
    category: 'prepare-work',
    label: 'Prepare GitHub Pull Request Review',
    summary: 'Fetch GitHub pull request data and create a review prompt.',
    outcome: 'Prompts for a GitHub target and opens the generated review prompt.',
    effects: ['Reads GitHub with a stored token', 'Writes review prompt artifacts'],
    vsCodeCommand: 'reviewops.prepareGitHubPullRequestReview',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['github', 'pull request', 'pr']
  },
  {
    id: 'review/comment-triage',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Prepare GitHub Comment Triage',
    summary: 'Fetch provider comments and turn them into triage/action artifacts.',
    outcome: 'Opens local triage, action-plan seed, and reply draft artifacts.',
    effects: ['Reads GitHub with a stored token', 'Writes review work artifacts'],
    vsCodeCommand: 'reviewops.prepareGitHubCommentTriage',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['triage', 'comments', 'コメントトリアージ']
  },
  {
    id: 'fix/plan',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Plan Review Fix',
    summary: 'Convert action-plan items into manual fix plans.',
    outcome: 'Opens a fix-plan artifact with impact and verification notes.',
    effects: ['Writes .reviewops/out/fix-plan/<run-id>/fix-plan.md'],
    vsCodeCommand: 'reviewops.planReviewFix',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['fix plan', 'fix approach', '修正計画']
  },
  {
    id: 'fix/checklist',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Build Review Fix Checklist',
    summary: 'Create a checklist and focused test scenarios from the current fix plan.',
    outcome: 'Opens a manual checklist and records test-scenario artifacts for implementation tracking.',
    effects: [
      'Writes .reviewops/out/fix-checklist/<run-id>/fix-checklist.md',
      'Writes .reviewops/out/fix-checklist/<run-id>/test-scenarios.md'
    ],
    vsCodeCommand: 'reviewops.buildReviewFixChecklist',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['checklist', 'tests.scenario', 'tests=generate', 'test scenario', 'test scenarios', 'チェックリスト']
  },
  {
    id: 'response/import',
    kind: 'flow',
    category: 'continue-import',
    label: 'Import Manual Review Response',
    summary: 'Paste and normalize a manual review response.',
    outcome: 'Records findings and action-plan seed artifacts.',
    effects: ['Writes response import and normalization artifacts'],
    vsCodeCommand: 'reviewops.importManualReviewResponse',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['import', 'response', '応答インポート']
  },
  {
    id: 'response/normalize',
    kind: 'flow',
    category: 'continue-import',
    label: 'Normalize Review Response',
    summary: 'Normalize an imported review response into structured findings.',
    outcome: 'Uses the same import command to create normalized response artifacts.',
    effects: ['Writes response normalization artifacts'],
    vsCodeCommand: 'reviewops.importManualReviewResponse',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['normalize', '正規化']
  },
  {
    id: 'review/action-plan',
    kind: 'flow',
    category: 'continue-import',
    label: 'Build Review Action Plan',
    summary: 'Turn normalized findings into a manual action plan.',
    outcome: 'Opens an action-plan artifact for follow-up work.',
    effects: ['Writes .reviewops/out/review-action-plan/<run-id>/action-plan.md'],
    vsCodeCommand: 'reviewops.buildReviewActionPlan',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['action plan', 'アクション計画']
  },
  {
    id: 'fix/verify',
    kind: 'flow',
    category: 'continue-import',
    label: 'Verify Review Fix',
    summary: 'Record verification results for planned fixes.',
    outcome: 'Keeps unresolved work blocked or advances the cycle when resolved.',
    effects: ['Writes fix verification artifacts', 'May update current-cycle state'],
    vsCodeCommand: 'reviewops.verifyReviewFix',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['verify', 'self.review', 'self review', 'セルフレビュー', '検証']
  },
  {
    id: 'fix/explain',
    kind: 'flow',
    category: 'continue-import',
    label: 'Explain Review Fix',
    summary: 'Generate a concise explanation of verified fix outcomes.',
    outcome: 'Opens a fix explanation artifact for review or reply drafting.',
    effects: ['Writes fix explanation artifacts'],
    vsCodeCommand: 'reviewops.explainReviewFix',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['explain', 'fix explanation', '説明']
  },
  {
    id: 'refactor/plan',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Plan Refactoring Work',
    summary: 'Convert scoped refactoring intent into manual refactor plans.',
    outcome: 'Opens a refactor-plan artifact with impact and verification notes.',
    effects: ['Writes .reviewops/out/refactor-plan/<run-id>/refactor-plan.md'],
    vsCodeCommand: 'reviewops.planReviewFix',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['refactor plan', 'design.plan', 'design plan', 'implementation design', 'リファクタリング計画']
  },
  {
    id: 'refactor/checklist',
    kind: 'flow',
    category: 'prepare-work',
    label: 'Build Refactoring Checklist',
    summary: 'Create a checklist and focused test scenarios from the current refactor plan.',
    outcome: 'Opens a manual checklist and records test-scenario artifacts for refactoring tracking.',
    effects: [
      'Writes .reviewops/out/refactor-checklist/<run-id>/refactor-checklist.md',
      'Writes .reviewops/out/refactor-checklist/<run-id>/test-scenarios.md'
    ],
    vsCodeCommand: 'reviewops.buildReviewFixChecklist',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['refactor checklist', 'リファクタリングチェックリスト']
  },
  {
    id: 'refactor/verify',
    kind: 'flow',
    category: 'continue-import',
    label: 'Verify Refactoring Work',
    summary: 'Record verification results for planned refactoring work.',
    outcome: 'Keeps unresolved work blocked or advances the cycle when resolved.',
    effects: ['Writes refactor verification artifacts', 'May update current-cycle state'],
    vsCodeCommand: 'reviewops.verifyReviewFix',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['verify refactor', 'リファクタリング検証']
  },
  {
    id: 'refactor/explain',
    kind: 'flow',
    category: 'continue-import',
    label: 'Explain Refactoring Results',
    summary: 'Generate a concise explanation of verified refactoring outcomes.',
    outcome: 'Opens a refactor explanation artifact for evidence and knowledge capture.',
    effects: ['Writes refactor explanation artifacts'],
    vsCodeCommand: 'reviewops.explainReviewFix',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['explain refactor', 'リファクタリング説明']
  },
  {
    id: 'review/reply-drafts',
    kind: 'flow',
    category: 'continue-import',
    label: 'Draft Review Replies',
    summary: 'Create local reply draft artifacts before publishing replies.',
    outcome: 'Opens reply draft artifacts for preview and later publication.',
    effects: ['Writes reply draft artifacts'],
    vsCodeCommand: 'reviewops.draftReviewReplies',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['draft replies', 'reply draft', '返信下書き']
  },
  {
    id: 'meta/resume',
    kind: 'meta',
    category: 'continue-import',
    label: 'Continue Current Cycle',
    summary: 'Resume the next incomplete step in the current ReviewOps cycle.',
    outcome: 'Opens current cycle state and shows the next incomplete flow.',
    effects: ['Reads .reviewops.local/current-cycle.local.json'],
    vsCodeCommand: 'reviewops.resumeCurrentCycle',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['resume', 'continue', '再開']
  },
  {
    id: 'publish/summary-draft',
    kind: 'publish',
    category: 'publish-preview',
    label: 'Preview GitHub Summary Comment',
    summary: 'Create a preview-only GitHub summary comment draft.',
    outcome: 'Shows a preview first; posting still requires explicit VS Code confirmation.',
    effects: ['Writes publish draft artifacts', 'Requires confirmation before provider write'],
    vsCodeCommand: 'reviewops.previewGitHubSummaryComment',
    requiresInitialized: true,
    requiresConfirmation: true,
    aliases: ['summary', 'publish', 'publish preview', 'publish.preview', 'プレビュー']
  },
  {
    id: 'publish/reply-draft',
    kind: 'publish',
    category: 'publish-preview',
    label: 'Preview GitHub Reply Comment',
    summary: 'Create a preview-only GitHub reply comment draft.',
    outcome: 'Shows a preview first; posting still requires explicit VS Code confirmation.',
    effects: ['Writes publish draft artifacts', 'Requires confirmation before provider write'],
    vsCodeCommand: 'reviewops.previewGitHubReplyComment',
    requiresInitialized: true,
    requiresConfirmation: true,
    aliases: ['reply', 'publish', 'publish preview', 'publish.preview', '返信プレビュー']
  },
  {
    id: 'rules/propose',
    kind: 'knowledge',
    category: 'rules-knowledge',
    label: 'Propose Rules',
    summary: 'Extract candidate reusable rules from review artifacts.',
    outcome: 'Opens rule candidate artifacts; no rule is applied automatically.',
    effects: ['Writes rule candidate artifacts'],
    vsCodeCommand: 'reviewops.proposeRules',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['rules', 'rules.extract', 'rules=extract', 'rule extract', 'propose', 'ルール提案']
  },
  {
    id: 'rules/reconcile',
    kind: 'knowledge',
    category: 'rules-knowledge',
    label: 'Reconcile Rules',
    summary: 'Review candidate rules for duplicate or conflict status.',
    outcome: 'Uses the rule proposal workflow to prepare candidates for approval.',
    effects: ['Writes rule candidate artifacts'],
    vsCodeCommand: 'reviewops.proposeRules',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['reconcile', 'ルール照合']
  },
  {
    id: 'rules/apply',
    kind: 'knowledge',
    category: 'rules-knowledge',
    label: 'Apply Rules',
    summary: 'Save only user-approved rule candidates.',
    outcome: 'Shows approval selection before changing knowledge files.',
    effects: ['May update .reviewops/knowledge files', 'Requires user approval selection'],
    vsCodeCommand: 'reviewops.applyRules',
    requiresInitialized: true,
    requiresConfirmation: true,
    aliases: ['apply rules', 'ルール適用']
  },
  {
    id: 'rules/update',
    kind: 'knowledge',
    category: 'rules-knowledge',
    label: 'Update Rules',
    summary: 'Write rule update artifacts after an approved rule application.',
    outcome: 'Opens a rule update summary artifact.',
    effects: ['Writes rule update artifacts'],
    vsCodeCommand: 'reviewops.updateRules',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['update rules', 'ルール更新']
  },
  {
    id: 'knowledge/capture-candidates',
    kind: 'knowledge',
    category: 'rules-knowledge',
    label: 'Capture Knowledge Candidates',
    summary: 'Record reusable knowledge candidates from review work.',
    outcome: 'Opens local knowledge candidate artifacts.',
    effects: ['Writes knowledge candidate artifacts'],
    vsCodeCommand: 'reviewops.captureKnowledgeCandidates',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['knowledge', 'ナレッジ']
  },
  {
    id: 'skill/evidence-capture',
    kind: 'knowledge',
    category: 'rules-knowledge',
    label: 'Capture Skill Evidence',
    summary: 'Record technical behavior evidence without scoring or ranking.',
    outcome: 'Opens local skill evidence artifacts.',
    effects: ['Writes skill evidence artifacts'],
    vsCodeCommand: 'reviewops.captureSkillEvidence',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['skill', 'evidence', 'スキル証跡']
  },
  {
    id: 'field/report',
    kind: 'knowledge',
    category: 'rules-knowledge',
    label: 'Generate Field Report',
    summary: 'Summarize knowledge and skill evidence into a local field report.',
    outcome: 'Opens a local field report preview.',
    effects: ['Writes field report artifacts'],
    vsCodeCommand: 'reviewops.generateFieldReport',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['field report', 'report', 'レポート']
  },
  {
    id: 'project/init',
    kind: 'setup',
    category: 'setup-status',
    label: 'Initialize Project',
    summary: 'Create ReviewOps project files for this workspace.',
    outcome: 'Creates shared and local ReviewOps directories and starter files.',
    effects: ['Writes .reviewops/', 'Writes .reviewops.local/', 'May update .gitignore'],
    vsCodeCommand: 'reviewops.initializeProject',
    requiresInitialized: false,
    requiresConfirmation: false,
    aliases: ['init', 'initialize', '初期化']
  },
  {
    id: 'project/context',
    kind: 'setup',
    category: 'setup-status',
    label: 'Update Project Context',
    summary: 'Record local stack, review policy, AI rules, and constraints.',
    outcome: 'Opens the updated local project context file.',
    effects: ['Writes .reviewops.local/project-context.local.yaml'],
    vsCodeCommand: 'reviewops.updateProjectContext',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['context', 'コンテキスト']
  },
  {
    id: 'provider/connect',
    kind: 'provider',
    category: 'setup-status',
    label: 'Setup GitHub Token',
    summary: 'Store or clear the GitHub token used by provider commands.',
    outcome: 'Updates VS Code SecretStorage; token content is never written to workspace files.',
    effects: ['Updates VS Code SecretStorage'],
    vsCodeCommand: 'reviewops.setupGitHubToken',
    requiresInitialized: false,
    requiresConfirmation: false,
    aliases: ['github token', 'provider', 'トークン']
  },
  {
    id: 'meta/status',
    kind: 'meta',
    category: 'setup-status',
    label: 'Status',
    summary: 'Show the current ReviewOps workspace status.',
    outcome: 'Displays initialization, flow count, current cycle, and next action.',
    effects: ['Reads ReviewOps workspace state'],
    vsCodeCommand: 'reviewops.status',
    requiresInitialized: false,
    requiresConfirmation: false,
    aliases: ['status', 'ステータス']
  },
  {
    id: 'meta/next',
    kind: 'meta',
    category: 'setup-status',
    label: 'Next Action',
    summary: 'Run the next safe action from the current ReviewOps workspace state.',
    outcome: 'Initializes when needed, starts or continues the current recommended action otherwise.',
    effects: ['Reads ReviewOps workspace state', 'May run the next mapped ReviewOps command'],
    vsCodeCommand: 'reviewops.nextAction',
    requiresInitialized: false,
    requiresConfirmation: false,
    aliases: ['next action', 'recommended', '次のアクション']
  },
  {
    id: 'meta/next-artifact',
    kind: 'meta',
    category: 'setup-status',
    label: 'Show Next Actions',
    summary: 'Write a next-action artifact from current workspace state.',
    outcome: 'Opens a generated next-action artifact.',
    effects: ['Writes .reviewops/out/meta-next/<run-id>/next-actions.json'],
    vsCodeCommand: 'reviewops.showMetaNext',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['next', '次のアクション']
  },
  {
    id: 'meta/readiness',
    kind: 'meta',
    category: 'setup-status',
    label: 'Show P0 Readiness',
    summary: 'Summarize setup, providers, smoke checks, flows, and evidence readiness.',
    outcome: 'Opens a P0 readiness report artifact.',
    effects: ['Writes P0 readiness artifacts'],
    vsCodeCommand: 'reviewops.showP0Readiness',
    requiresInitialized: true,
    requiresConfirmation: false,
    aliases: ['readiness', 'p0', '準備状況']
  },
  {
    id: 'openPreview',
    kind: 'meta',
    category: 'setup-status',
    label: 'Open Status Preview',
    summary: 'Open the legacy status preview Webview.',
    outcome: 'Shows the compact ReviewOps status preview.',
    effects: ['Reads ReviewOps workspace status'],
    vsCodeCommand: 'reviewops.openPreview',
    requiresInitialized: false,
    requiresConfirmation: false,
    aliases: ['preview', 'プレビュー']
  },
  {
    id: 'openArtifacts',
    kind: 'meta',
    category: 'setup-status',
    label: 'Open ReviewOps Artifacts',
    summary: 'Open generated ReviewOps artifacts from a quick pick.',
    outcome: 'Opens a selected artifact from .reviewops/out.',
    effects: ['Reads .reviewops/out/'],
    vsCodeCommand: 'reviewops.openArtifacts',
    requiresInitialized: false,
    requiresConfirmation: false,
    aliases: ['artifacts', '成果物']
  }
];

export const reviewOpsCommandCatalog: ReviewOpsCommandCatalogEntry[] =
  reviewOpsCommandCatalogBase.map(withReviewOpsCommandMetadata);

function withReviewOpsCommandMetadata(entry: ReviewOpsCommandCatalogBaseEntry): ReviewOpsCommandCatalogEntry {
  return {
    ...entry,
    persona: commandPersona(entry),
    shortcut: commandShortcut(entry.id),
    guideStep: commandGuideStep(entry.id),
    artifactKind: commandArtifactKind(entry.id),
    requiresPreview: commandRequiresPreview(entry),
    riskLevel: commandRiskLevel(entry),
    batchable: commandBatchable(entry),
    estimatedDuration: commandEstimatedDuration(entry.id)
  };
}

function commandPersona(entry: ReviewOpsCommandCatalogBaseEntry): ReviewOpsCommandPersona {
  if (entry.id.startsWith('rules/') || entry.id === 'field/report' || entry.id === 'meta/readiness') {
    return 'senior';
  }

  if (
    entry.id === 'fix/explain' ||
    entry.id === 'review/reply-drafts' ||
    entry.id === 'fix/checklist' ||
    entry.id === 'skill/evidence-capture'
  ) {
    return 'junior';
  }

  return 'both';
}

function commandShortcut(commandId: string): string {
  switch (commandId) {
    case 'cycle/mr-review':
      return 'r';
    case 'cycle/comment-response':
      return 'c';
    case 'cycle/fix-review':
      return 'f';
    case 'cycle/research':
      return 'q';
    case 'cycle/refactoring':
      return 'd';
    case 'diff/review':
    case 'provider/fetch-review':
      return 'shift+r';
    case 'rules/propose':
      return 'shift+e';
    case 'rules/apply':
      return 'shift+a';
    case 'fix/checklist':
      return 't';
    case 'field/report':
      return 'g';
    case 'meta/next':
      return 'enter';
    default:
      return '';
  }
}

function commandGuideStep(commandId: string): ReviewOpsCommandGuideStep {
  switch (commandId) {
    case 'review/select-target':
    case 'diff/review':
    case 'provider/fetch-review':
    case 'review/comment-triage':
    case 'response/import':
    case 'response/normalize':
      return 'understand';
    case 'research/select-scope':
    case 'research/investigate':
    case 'research/import-findings':
    case 'research/normalize-findings':
      return 'investigate';
    case 'review/action-plan':
    case 'research/action-plan':
    case 'fix/plan':
    case 'refactor/plan':
      return 'design';
    case 'fix/checklist':
    case 'refactor/checklist':
      return 'implement';
    case 'fix/verify':
    case 'fix/explain':
    case 'refactor/verify':
    case 'refactor/explain':
    case 'review/reply-drafts':
    case 'publish/summary-draft':
    case 'publish/reply-draft':
    case 'knowledge/capture-candidates':
    case 'rules/propose':
    case 'rules/reconcile':
    case 'skill/evidence-capture':
      return 'confirm';
    default:
      return 'none';
  }
}

function commandArtifactKind(commandId: string): ReviewOpsCommandArtifactKind {
  switch (commandId) {
    case 'cycle/research':
    case 'cycle/refactoring':
    case 'cycle/mr-review':
    case 'cycle/comment-response':
    case 'cycle/fix-review':
    case 'cycle/field-report':
      return 'cycle-state';
    case 'research/select-scope':
    case 'research/investigate':
    case 'review/select-target':
    case 'diff/review':
    case 'provider/fetch-review':
      return 'prompt';
    case 'research/import-findings':
    case 'research/normalize-findings':
    case 'research/action-plan':
    case 'review/action-plan':
    case 'response/import':
    case 'response/normalize':
      return 'action-plan';
    case 'fix/plan':
    case 'refactor/plan':
      return 'action-plan';
    case 'fix/checklist':
    case 'refactor/checklist':
      return 'checklist';
    case 'fix/verify':
    case 'refactor/verify':
      return 'evidence';
    case 'fix/explain':
    case 'refactor/explain':
      return 'explanation';
    case 'publish/summary-draft':
    case 'publish/reply-draft':
    case 'review/reply-drafts':
      return 'publish-draft';
    case 'rules/propose':
    case 'rules/reconcile':
    case 'rules/apply':
    case 'rules/update':
      return 'rule-candidate';
    case 'knowledge/capture-candidates':
      return 'knowledge';
    case 'skill/evidence-capture':
      return 'evidence';
    case 'field/report':
      return 'field-report';
    case 'project/init':
      return 'workspace-files';
    case 'project/context':
      return 'workspace-files';
    case 'provider/connect':
      return 'provider-setting';
    case 'openArtifacts':
      return 'main-files';
    default:
      return 'status';
  }
}

function commandRequiresPreview(entry: ReviewOpsCommandCatalogBaseEntry): boolean {
  return (
    entry.requiresConfirmation ||
    entry.kind === 'publish' ||
    entry.id === 'rules/apply' ||
    entry.id === 'rules/update' ||
    entry.id === 'openArtifacts'
  );
}

function commandRiskLevel(entry: ReviewOpsCommandCatalogBaseEntry): ReviewOpsCommandRiskLevel {
  if (entry.requiresConfirmation || entry.kind === 'publish' || entry.id === 'rules/apply') {
    return 'high';
  }

  if (entry.kind === 'provider' || entry.kind === 'knowledge' || entry.id === 'project/init') {
    return 'medium';
  }

  return 'low';
}

function commandBatchable(entry: ReviewOpsCommandCatalogBaseEntry): boolean {
  if (entry.requiresConfirmation || entry.kind === 'publish' || entry.id === 'rules/apply' || entry.id === 'rules/update') {
    return false;
  }

  return (
    entry.kind === 'flow' ||
    entry.kind === 'provider' ||
    entry.kind === 'knowledge' ||
    entry.id === 'cycle/mr-review' ||
    entry.id === 'cycle/fix-review' ||
    entry.id === 'cycle/research' ||
    entry.id === 'cycle/refactoring'
  );
}

function commandEstimatedDuration(commandId: string): string {
  switch (commandId) {
    case 'provider/fetch-review':
    case 'review/comment-triage':
      return '2-4 min';
    case 'diff/review':
    case 'research/investigate':
      return '1-3 min';
    case 'review/action-plan':
    case 'research/action-plan':
    case 'fix/plan':
    case 'refactor/plan':
      return '2-5 min';
    case 'fix/checklist':
    case 'refactor/checklist':
      return '1-2 min';
    case 'fix/verify':
    case 'refactor/verify':
    case 'fix/explain':
    case 'refactor/explain':
      return '1-3 min';
    case 'rules/propose':
    case 'rules/reconcile':
      return '1-2 min';
    case 'publish/summary-draft':
    case 'publish/reply-draft':
      return 'Preview';
    default:
      return '<1 min';
  }
}

export function listReviewOpsCommandCatalog(): ReviewOpsCommandCatalogEntry[] {
  return reviewOpsCommandCatalog;
}

export function getReviewOpsCommandCatalogEntry(commandId: string): ReviewOpsCommandCatalogEntry | undefined {
  return reviewOpsCommandCatalog.find((entry) => entry.id === commandId);
}
