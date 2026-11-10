import type { FlowManifestEntry } from '../types.js';

export class FlowManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowManifestValidationError';
  }
}

export interface FlowRegistry {
  list(): FlowManifestEntry[];
  get(flowId: string): FlowManifestEntry | undefined;
}

const validFlowTypes = new Set(['atomic', 'composite', 'cycle', 'meta']);
const validPriorities = new Set(['P0', 'P1', 'P2']);

export const coreFoundationFlowManifest: FlowManifestEntry[] = [
  {
    id: 'project/init',
    title: 'Initialize ReviewOps Project',
    type: 'atomic',
    priority: 'P0',
    description: 'Create .reviewops/ and .reviewops.local/ workspace files.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root where ReviewOps files are created.'
      }
    ],
    outputs: [
      {
        id: 'projectFiles',
        kind: 'config',
        description: 'Created shared and local ReviewOps project files.'
      }
    ],
    sideEffects: ['write-config', 'write-local-state'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['project/context']
  },
  {
    id: 'project/context',
    title: 'Setup ReviewOps Project Context',
    type: 'atomic',
    priority: 'P0',
    description: 'Record local project context, local review rules, AI usage rules, and customer constraints.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root where local ReviewOps context files are stored.'
      },
      {
        id: 'projectContext',
        kind: 'config',
        required: true,
        description: 'Technical stack, architecture, review rules, AI usage rules, and customer constraints.'
      }
    ],
    outputs: [
      {
        id: 'localContext',
        kind: 'config',
        description: '.reviewops.local project context and project rules files.'
      }
    ],
    sideEffects: ['write-local-state'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['review/select-target', 'provider/connect']
  },
  {
    id: 'meta/list',
    title: 'List ReviewOps Flows',
    type: 'meta',
    priority: 'P0',
    description: 'List available ReviewOps P0 foundation flows.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [],
    outputs: [
      {
        id: 'flows',
        kind: 'status',
        description: 'Registered flow manifest entries.'
      }
    ],
    sideEffects: [],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['meta/status']
  },
  {
    id: 'meta/status',
    title: 'Show ReviewOps Status',
    type: 'meta',
    priority: 'P0',
    description: 'Report initialization state and the next safe action.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root to inspect.'
      }
    ],
    outputs: [
      {
        id: 'status',
        kind: 'status',
        description: 'ReviewOps project status skeleton.'
      }
    ],
    sideEffects: ['read-workspace'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: []
  }
];

export const promptResponseFlowManifest: FlowManifestEntry[] = [
  {
    id: 'review/select-target',
    title: 'Select Review Target',
    type: 'atomic',
    priority: 'P0',
    description: 'Collect local git target metadata and diff input before prompt generation.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root where local git metadata is inspected.'
      }
    ],
    outputs: [
      {
        id: 'reviewTarget',
        kind: 'target',
        description: 'Selected local git review target with branch and repository metadata.'
      },
      {
        id: 'diff',
        kind: 'artifact',
        description: 'Local git diff content to feed into diff/review.'
      }
    ],
    sideEffects: ['read-workspace'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['diff/review']
  },
  {
    id: 'diff/review',
    title: 'Build Local Diff Review Prompt',
    type: 'atomic',
    priority: 'P0',
    description: 'Render a manual-only review prompt from a local diff and ReviewOps context.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'diff',
        kind: 'diff',
        required: true,
        description: 'Local git diff or pasted diff content to review.'
      },
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: false,
        description: 'Workspace root used for ReviewOps templates and artifacts.'
      }
    ],
    outputs: [
      {
        id: 'promptArtifacts',
        kind: 'artifact',
        description: 'prompt.md, input-summary.md, and prompt-metadata.json artifacts.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['response/import']
  },
  {
    id: 'response/import',
    title: 'Import Manual Review Response',
    type: 'atomic',
    priority: 'P0',
    description: 'Store an AI or senior engineer response that was provided outside ReviewOps.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'rawResponse',
        kind: 'response',
        required: true,
        description: 'Raw markdown, text, or JSON fenced response pasted by the user.'
      }
    ],
    outputs: [
      {
        id: 'responseArtifacts',
        kind: 'artifact',
        description: 'response.raw.md plus normalized result skeleton artifacts.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['response/normalize']
  },
  {
    id: 'response/normalize',
    title: 'Normalize Review Response Skeleton',
    type: 'atomic',
    priority: 'P0',
    description: 'Extract a structured result skeleton from an imported manual review response.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'rawResponse',
        kind: 'response',
        required: true,
        description: 'Imported response content to normalize.'
      }
    ],
    outputs: [
      {
        id: 'result',
        kind: 'artifact',
        description: 'result.md, result.json, findings, action plan, and candidate artifacts.'
      },
      {
        id: 'actionPlanSeed',
        kind: 'action-plan',
        description: 'Seed review handling plan extracted from the response.'
      },
      {
        id: 'ruleCandidates',
        kind: 'rule-candidate',
        description: 'Reusable rule candidates found in the response.'
      },
      {
        id: 'knowledgeCandidates',
        kind: 'knowledge-candidate',
        description: 'Reusable knowledge candidates found in the response.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['review/action-plan']
  },
  {
    id: 'research/select-scope',
    title: 'Select Research Scope',
    type: 'atomic',
    priority: 'P0',
    description: 'Collect investigation scope, intent, and optional files before building a research prompt.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root where scoped investigation context is collected.'
      },
      {
        id: 'scope',
        kind: 'text',
        required: true,
        description: 'Research scope label, intent, and optional target files.'
      }
    ],
    outputs: [
      {
        id: 'researchScope',
        kind: 'artifact',
        description: 'Scoped research context used for investigation prompt generation.'
      }
    ],
    sideEffects: ['read-workspace'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['research/investigate']
  },
  {
    id: 'research/investigate',
    title: 'Build Research Prompt',
    type: 'atomic',
    priority: 'P0',
    description: 'Render a manual-only investigation prompt from scoped code, design, or operational context.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'researchScope',
        kind: 'artifact',
        required: true,
        description: 'Scope and investigation intent selected by the user.'
      },
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: false,
        description: 'Workspace root used for ReviewOps templates and artifacts.'
      }
    ],
    outputs: [
      {
        id: 'promptArtifacts',
        kind: 'artifact',
        description: 'prompt.md, input-summary.md, and prompt-metadata.json artifacts for investigation.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['research/import-findings']
  },
  {
    id: 'research/import-findings',
    title: 'Import Research Findings',
    type: 'atomic',
    priority: 'P0',
    description: 'Store manual investigation findings that were produced outside ReviewOps.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'rawFindings',
        kind: 'response',
        required: true,
        description: 'Raw markdown, text, or JSON fenced investigation findings pasted by the user.'
      }
    ],
    outputs: [
      {
        id: 'researchFindings',
        kind: 'artifact',
        description: 'Raw research findings plus normalized result skeleton artifacts.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['research/normalize-findings']
  },
  {
    id: 'research/normalize-findings',
    title: 'Normalize Research Findings',
    type: 'atomic',
    priority: 'P0',
    description: 'Extract structured findings, follow-up actions, and knowledge candidates from imported investigation notes.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'rawFindings',
        kind: 'response',
        required: true,
        description: 'Imported research findings to normalize.'
      }
    ],
    outputs: [
      {
        id: 'researchResult',
        kind: 'artifact',
        description: 'result.md, result.json, findings, action plan, and candidate artifacts.'
      },
      {
        id: 'actionPlanSeed',
        kind: 'action-plan',
        description: 'Seed follow-up plan extracted from the investigation.'
      },
      {
        id: 'knowledgeCandidates',
        kind: 'knowledge-candidate',
        description: 'Reusable knowledge candidates found in the investigation.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: ['knowledge-candidate'],
    skillHooks: [],
    nextActions: ['research/action-plan']
  },
  {
    id: 'research/action-plan',
    title: 'Build Research Action Plan',
    type: 'atomic',
    priority: 'P0',
    description: 'Convert investigation findings into follow-up actions, decisions, and knowledge capture work.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'researchFindings',
        kind: 'artifact',
        required: false,
        description: 'Normalized findings from research/normalize-findings.'
      }
    ],
    outputs: [
      {
        id: 'understandingMemo',
        kind: 'understanding-memo',
        description: 'Local memo that breaks review intent into background, impact, inspection point, fix direction, questions, and test focus.'
      },
      {
        id: 'actionPlan',
        kind: 'action-plan',
        description: 'Manual follow-up plan for the investigation.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe research handling actions.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: ['knowledge-candidate'],
    skillHooks: ['technical-explanation'],
    nextActions: ['knowledge/capture-candidates']
  },
  {
    id: 'review/comment-triage',
    title: 'Triage Review Comments',
    type: 'atomic',
    priority: 'P0',
    description: 'Classify provider review comments into fix, reply, acknowledgement, and informational work.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'comments',
        kind: 'comment',
        required: true,
        description: 'Provider comments or imported review comments to triage.'
      }
    ],
    outputs: [
      {
        id: 'commentTriage',
        kind: 'comment-triage',
        description: 'Prioritized review comment triage artifact.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['review/action-plan']
  },
  {
    id: 'review/action-plan',
    title: 'Build Review Action Plan',
    type: 'atomic',
    priority: 'P0',
    description: 'Convert normalized findings and triaged comments into manual review handling steps without automatic code changes.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'commentTriage',
        kind: 'comment',
        required: false,
        description: 'Triaged comments that need fix or reply handling.'
      },
      {
        id: 'reviewFindings',
        kind: 'artifact',
        required: false,
        description: 'Normalized review findings from response/normalize.'
      }
    ],
    outputs: [
      {
        id: 'actionPlan',
        kind: 'action-plan',
        description: 'Manual review handling plan with fix, verification, and reply criteria.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe review handling actions.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['fix/plan', 'review/reply-drafts']
  },
  {
    id: 'fix/plan',
    title: 'Build Review Fix Plan',
    type: 'atomic',
    priority: 'P0',
    description: 'Convert review action items into manual fix intent, impact, verification, reply, and rule-candidate guidance.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'actionPlan',
        kind: 'action-plan',
        required: true,
        description: 'Review action plan items that still require manual fix planning.'
      }
    ],
    outputs: [
      {
        id: 'fixPlan',
        kind: 'fix-plan',
        description: 'Manual fix plan with target files, impact, verification, and reply guidance.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after fix planning.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['fix/checklist']
  },
  {
    id: 'fix/checklist',
    title: 'Build Review Fix Checklist',
    type: 'atomic',
    priority: 'P0',
    description: 'Turn a manual fix plan into a local checklist before code changes happen outside ReviewOps.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'fixPlan',
        kind: 'fix-plan',
        required: true,
        description: 'Manual fix plan that needs a concrete checklist.'
      }
    ],
    outputs: [
      {
        id: 'fixChecklist',
        kind: 'fix-checklist',
        description: 'Local checklist for manual fix, verification, reply, and rule-candidate work.'
      },
      {
        id: 'testScenarios',
        kind: 'test-scenarios',
        description: 'Focused test scenarios derived from the fix plan before verification is recorded.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after checklist creation.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['fix/verify']
  },
  {
    id: 'fix/verify',
    title: 'Record Review Fix Verification',
    type: 'atomic',
    priority: 'P0',
    description: 'Record manual fix verification outcomes without automatic code changes or provider publishing.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'fixPlan',
        kind: 'fix-plan',
        required: true,
        description: 'Fix plan items whose outcomes are being verified.'
      }
    ],
    outputs: [
      {
        id: 'verification',
        kind: 'fix-verification',
        description: 'Resolved, partial, unresolved, new risk, or follow-up issue verification results.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after fix verification.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['fix/explain', 'review/action-plan']
  },
  {
    id: 'fix/explain',
    title: 'Explain Review Fix Results',
    type: 'atomic',
    priority: 'P0',
    description: 'Summarize manually verified fix outcomes for preview-first reviewer replies and field evidence.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'fixPlan',
        kind: 'fix-plan',
        required: true,
        description: 'Fix plan that explains what was intended.'
      },
      {
        id: 'verification',
        kind: 'fix-verification',
        required: true,
        description: 'Verification results that explain what was resolved or remains open.'
      }
    ],
    outputs: [
      {
        id: 'fixExplanation',
        kind: 'fix-explanation',
        description: 'Markdown and JSON explanation of manual fix outcomes.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after fix explanation.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: ['fix-explanation'],
    nextActions: ['publish/reply-draft', 'review/action-plan']
  },
  {
    id: 'refactor/plan',
    title: 'Plan Refactoring Work',
    type: 'atomic',
    priority: 'P0',
    description: 'Convert scoped refactoring intent into manual refactor steps, impact, verification, and rule-candidate guidance.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'refactorScope',
        kind: 'text',
        required: true,
        description: 'Scoped refactoring purpose and optional target files selected by the user.'
      }
    ],
    outputs: [
      {
        id: 'refactorPlan',
        kind: 'refactor-plan',
        description: 'Manual refactor plan with target files, impact, verification, and reusable rule guidance.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after refactor planning.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['refactor/checklist']
  },
  {
    id: 'refactor/checklist',
    title: 'Build Refactoring Checklist',
    type: 'atomic',
    priority: 'P0',
    description: 'Turn a refactor plan into a local checklist before code changes happen outside ReviewOps.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'refactorPlan',
        kind: 'refactor-plan',
        required: true,
        description: 'Manual refactor plan that needs a concrete checklist.'
      }
    ],
    outputs: [
      {
        id: 'refactorChecklist',
        kind: 'refactor-checklist',
        description: 'Local checklist for manual refactor, verification, docs, and rule-candidate work.'
      },
      {
        id: 'testScenarios',
        kind: 'test-scenarios',
        description: 'Focused test scenarios derived from the refactor plan before verification is recorded.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after checklist creation.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['refactor/verify']
  },
  {
    id: 'refactor/verify',
    title: 'Record Refactoring Verification',
    type: 'atomic',
    priority: 'P0',
    description: 'Record manual refactoring verification outcomes without automatic code changes or provider publishing.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'refactorPlan',
        kind: 'refactor-plan',
        required: true,
        description: 'Refactor plan items whose outcomes are being verified.'
      }
    ],
    outputs: [
      {
        id: 'verification',
        kind: 'refactor-verification',
        description: 'Resolved, partial, unresolved, new risk, or follow-up issue verification results.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after refactor verification.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['refactor/explain', 'refactor/plan']
  },
  {
    id: 'refactor/explain',
    title: 'Explain Refactoring Results',
    type: 'atomic',
    priority: 'P0',
    description: 'Summarize manually verified refactoring outcomes for field evidence and reusable knowledge.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'refactorPlan',
        kind: 'refactor-plan',
        required: true,
        description: 'Refactor plan that explains what was intended.'
      },
      {
        id: 'verification',
        kind: 'refactor-verification',
        required: true,
        description: 'Verification results that explain what was resolved or remains open.'
      }
    ],
    outputs: [
      {
        id: 'refactorExplanation',
        kind: 'refactor-explanation',
        description: 'Markdown and JSON explanation of manual refactor outcomes.'
      },
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Next safe actions after refactor explanation.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: ['technical-explanation'],
    nextActions: ['rules/propose', 'refactor/plan']
  },
  {
    id: 'review/reply-drafts',
    title: 'Create Review Reply Drafts',
    type: 'atomic',
    priority: 'P0',
    description: 'Create reviewer reply drafts that must be previewed before provider publishing.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'actionPlan',
        kind: 'action-plan',
        required: false,
        description: 'Manual fix plan that reply drafts should reference.'
      },
      {
        id: 'comments',
        kind: 'comment',
        required: true,
        description: 'Review comments that need replies.'
      }
    ],
    outputs: [
      {
        id: 'replyDrafts',
        kind: 'reply-draft',
        description: 'Confirmation-required reply drafts.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['publish/reply-draft']
  },
  {
    id: 'publish/reply-draft',
    title: 'Preview Comment Reply Draft',
    type: 'atomic',
    priority: 'P0',
    description: 'Preview a comment reply draft before an explicit provider post confirmation.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'reviewTarget',
        kind: 'target',
        required: true,
        description: 'Provider PR/MR target for the reply.'
      },
      {
        id: 'reply',
        kind: 'comment',
        required: true,
        description: 'Review comment reply body to preview.'
      }
    ],
    outputs: [
      {
        id: 'publishDraft',
        kind: 'publish-draft',
        description: 'Confirmation-required comment reply draft.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['rules/propose']
  },
  {
    id: 'provider/connect',
    title: 'Connect Review Provider',
    type: 'atomic',
    priority: 'P0',
    description: 'Prepare a ReviewOps provider connection while keeping token storage in the VS Code layer.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'provider',
        kind: 'target',
        required: true,
        description: 'Review provider to connect, such as GitHub.'
      }
    ],
    outputs: [
      {
        id: 'providerConnection',
        kind: 'status',
        description: 'Provider connection status without storing tokens in ReviewOps files.'
      }
    ],
    sideEffects: [],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['provider/list-targets']
  },
  {
    id: 'provider/list-targets',
    title: 'List Provider Review Targets',
    type: 'atomic',
    priority: 'P0',
    description: 'List PR/MR review targets through an isolated provider adapter.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: true
    },
    inputs: [
      {
        id: 'provider',
        kind: 'target',
        required: true,
        description: 'Configured provider adapter and repository identifier.'
      }
    ],
    outputs: [
      {
        id: 'reviewTargets',
        kind: 'target',
        description: 'Provider PR/MR targets available for ReviewOps review flows.'
      }
    ],
    sideEffects: [],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['provider/fetch-review']
  },
  {
    id: 'provider/fetch-review',
    title: 'Fetch Provider Review Data',
    type: 'atomic',
    priority: 'P0',
    description: 'Fetch PR/MR metadata, diff, and comments for prompt generation.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: true
    },
    inputs: [
      {
        id: 'reviewTarget',
        kind: 'target',
        required: true,
        description: 'Provider PR/MR target selected by the user.'
      }
    ],
    outputs: [
      {
        id: 'diff',
        kind: 'artifact',
        description: 'Provider diff content and metadata.'
      },
      {
        id: 'comments',
        kind: 'artifact',
        description: 'Provider review comments for triage.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['diff/review', 'review/comment-triage']
  },
  {
    id: 'publish/summary-draft',
    title: 'Preview Summary Comment Draft',
    type: 'atomic',
    priority: 'P0',
    description: 'Create a preview-first summary comment draft before any provider post.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'reviewTarget',
        kind: 'target',
        required: true,
        description: 'Provider PR/MR target for the summary comment.'
      },
      {
        id: 'summary',
        kind: 'text',
        required: true,
        description: 'Summary comment body to preview.'
      }
    ],
    outputs: [
      {
        id: 'publishDraft',
        kind: 'publish-draft',
        description: 'Confirmation-required summary comment draft.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['rules/propose']
  }
];

export const knowledgeSkillReportFlowManifest: FlowManifestEntry[] = [
  {
    id: 'rules/propose',
    title: 'Propose ReviewOps Rules',
    type: 'atomic',
    priority: 'P0',
    description: 'Turn review findings, replies, and imported response seeds into rule candidates.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'reviewArtifacts',
        kind: 'artifact',
        required: false,
        description: 'Review findings, action plans, or reply drafts that may contain reusable rules.'
      }
    ],
    outputs: [
      {
        id: 'ruleCandidates',
        kind: 'rule-candidate',
        description: 'Rule candidates for user review before any knowledge write.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: ['rule-candidate'],
    skillHooks: ['rule-extraction'],
    nextActions: ['rules/reconcile']
  },
  {
    id: 'rules/reconcile',
    title: 'Reconcile ReviewOps Rules',
    type: 'atomic',
    priority: 'P0',
    description: 'Detect duplicate, merge-needed, and conflicting rule candidates before applying them.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'ruleCandidates',
        kind: 'rule-candidate',
        required: true,
        description: 'Rule candidates proposed from review artifacts.'
      }
    ],
    outputs: [
      {
        id: 'reconciledRuleCandidates',
        kind: 'rule-candidate',
        description: 'Rule candidates annotated with reconcile status.'
      },
      {
        id: 'reconciliation',
        kind: 'artifact',
        description: 'Duplicate and conflict summary for user review.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: ['rule-reconcile'],
    skillHooks: [],
    nextActions: ['rules/apply']
  },
  {
    id: 'rules/apply',
    title: 'Apply Approved ReviewOps Rules',
    type: 'atomic',
    priority: 'P0',
    description: 'Save only user-approved rule candidates into shared or local ReviewOps knowledge files.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'approvedRuleCandidates',
        kind: 'rule-candidate',
        required: true,
        description: 'Rule candidates that the user explicitly approved.'
      }
    ],
    outputs: [
      {
        id: 'appliedRules',
        kind: 'config',
        description: 'Updated .reviewops/knowledge or .reviewops.local rule files.'
      }
    ],
    sideEffects: ['write-knowledge', 'write-local-state'],
    knowledgeHooks: ['rule-apply'],
    skillHooks: ['rule-extraction'],
    nextActions: ['rules/update']
  },
  {
    id: 'rules/update',
    title: 'Update ReviewOps Rule Status',
    type: 'atomic',
    priority: 'P0',
    description: 'Write rule application status artifacts after an approval-based rule update.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'appliedRules',
        kind: 'artifact',
        required: false,
        description: 'Rule application log or artifacts created by rules/apply.'
      }
    ],
    outputs: [
      {
        id: 'ruleStatus',
        kind: 'status',
        description: 'Rule update summary for the current cycle.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: ['rule-status'],
    skillHooks: [],
    nextActions: ['knowledge/capture-candidates']
  },
  {
    id: 'knowledge/capture-candidates',
    title: 'Capture Knowledge Candidates',
    type: 'atomic',
    priority: 'P0',
    description: 'Classify knowledge candidates as project-local, portable-candidate, or prohibited.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'knowledgeSeeds',
        kind: 'knowledge-candidate',
        required: false,
        description: 'Candidate good practices, tips, debt patterns, or roadmap skills from review artifacts.'
      }
    ],
    outputs: [
      {
        id: 'knowledgeCandidates',
        kind: 'knowledge-candidate',
        description: 'Classified knowledge candidates with portable checklist guidance.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: ['knowledge-candidate'],
    skillHooks: ['good-practice-recognition'],
    nextActions: ['skill/evidence-capture']
  },
  {
    id: 'skill/evidence-capture',
    title: 'Capture Skill Evidence',
    type: 'atomic',
    priority: 'P0',
    description: 'Record technical behavior evidence without scoring, ranking, or automatic evaluation.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'reviewArtifacts',
        kind: 'artifact',
        required: false,
        description: 'Action plans, triage artifacts, rules, and replies that support skill evidence.'
      }
    ],
    outputs: [
      {
        id: 'skillEvidence',
        kind: 'skill-evidence',
        description: 'Skill evidence JSON and field evidence JSONL entries.'
      }
    ],
    sideEffects: ['write-artifact', 'write-local-state'],
    knowledgeHooks: [],
    skillHooks: ['skill-evidence'],
    nextActions: ['field/report']
  },
  {
    id: 'field/report',
    title: 'Generate Field Report',
    type: 'atomic',
    priority: 'P0',
    description: 'Generate a local field report from review work, knowledge candidates, and skill evidence.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'skillEvidence',
        kind: 'skill-evidence',
        required: false,
        description: 'Skill evidence entries to summarize for mentor or field review.'
      },
      {
        id: 'knowledgeCandidates',
        kind: 'knowledge-candidate',
        required: false,
        description: 'Portable knowledge candidates to include in the report.'
      }
    ],
    outputs: [
      {
        id: 'fieldReport',
        kind: 'field-report',
        description: 'field-report.md and field-report.json artifacts.'
      }
    ],
    sideEffects: ['write-artifact'],
    knowledgeHooks: ['field-report'],
    skillHooks: ['field-report'],
    nextActions: ['meta/status']
  }
];

export const cycleMetaFlowManifest: FlowManifestEntry[] = [
  {
    id: 'cycle/mr-review',
    title: 'Run MR Review Cycle',
    type: 'cycle',
    priority: 'P0',
    description: 'Guide target selection, prompt creation, manual response handling, summary publishing, and evidence capture.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root that owns the current ReviewOps cycle state.'
      }
    ],
    outputs: [
      {
        id: 'currentCycle',
        kind: 'status',
        description: 'Current cycle state and next manual flow.'
      }
    ],
    sideEffects: ['write-local-state'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['review/select-target']
  },
  {
    id: 'cycle/comment-response',
    title: 'Run Comment Response Cycle',
    type: 'cycle',
    priority: 'P0',
    description: 'Guide provider comment fetch, triage, manual fix planning, previewed replies, and evidence capture.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root that owns the current ReviewOps cycle state.'
      }
    ],
    outputs: [
      {
        id: 'currentCycle',
        kind: 'status',
        description: 'Current cycle state and next manual flow.'
      }
    ],
    sideEffects: ['write-local-state'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['provider/fetch-review']
  },
  {
    id: 'cycle/fix-review',
    title: 'Run Fix Review Cycle',
    type: 'cycle',
    priority: 'P0',
    description: 'Guide focused review of an existing manual fix, follow-up planning, verification, and evidence capture.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root that owns the current ReviewOps cycle state.'
      }
    ],
    outputs: [
      {
        id: 'currentCycle',
        kind: 'status',
        description: 'Current cycle state and next manual flow.'
      }
    ],
    sideEffects: ['write-local-state'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['review/select-target']
  },
  {
    id: 'cycle/research',
    title: 'Run Research Cycle',
    type: 'cycle',
    priority: 'P0',
    description: 'Guide structured investigation from scope selection through findings normalization, action planning, and evidence capture.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root that owns the current ReviewOps cycle state.'
      }
    ],
    outputs: [
      {
        id: 'currentCycle',
        kind: 'status',
        description: 'Current cycle state and next manual flow.'
      }
    ],
    sideEffects: ['write-local-state'],
    knowledgeHooks: ['knowledge-candidate'],
    skillHooks: ['skill-evidence'],
    nextActions: ['research/select-scope']
  },
  {
    id: 'cycle/refactoring',
    title: 'Run Refactoring Cycle',
    type: 'cycle',
    priority: 'P0',
    description: 'Guide refactor planning, checklist creation, verification, explanation, and reusable evidence capture.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root that owns the current ReviewOps cycle state.'
      }
    ],
    outputs: [
      {
        id: 'currentCycle',
        kind: 'status',
        description: 'Current cycle state and next manual flow.'
      }
    ],
    sideEffects: ['write-local-state'],
    knowledgeHooks: ['rule-candidate', 'knowledge-candidate'],
    skillHooks: ['technical-explanation', 'skill-evidence'],
    nextActions: ['refactor/plan']
  },
  {
    id: 'cycle/field-report',
    title: 'Run Field Report Cycle',
    type: 'cycle',
    priority: 'P0',
    description: 'Guide knowledge candidate capture, skill evidence capture, and local field report generation.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root that owns the current ReviewOps cycle state.'
      }
    ],
    outputs: [
      {
        id: 'currentCycle',
        kind: 'status',
        description: 'Current cycle state and next manual flow.'
      }
    ],
    sideEffects: ['write-local-state'],
    knowledgeHooks: ['field-report'],
    skillHooks: ['field-report'],
    nextActions: ['knowledge/capture-candidates']
  },
  {
    id: 'meta/next',
    title: 'Show Next ReviewOps Action',
    type: 'meta',
    priority: 'P0',
    description: 'Inspect project and current-cycle state to recommend the next safe manual action.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root to inspect for ReviewOps state.'
      }
    ],
    outputs: [
      {
        id: 'nextActions',
        kind: 'status',
        description: 'Ordered next actions for the active or suggested cycle.'
      }
    ],
    sideEffects: ['read-workspace', 'write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['meta/resume', 'meta/readiness']
  },
  {
    id: 'meta/resume',
    title: 'Resume Current ReviewOps Cycle',
    type: 'meta',
    priority: 'P0',
    description: 'Load .reviewops.local/current-cycle.local.json and continue the next incomplete step.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root containing local cycle state.'
      }
    ],
    outputs: [
      {
        id: 'currentCycle',
        kind: 'status',
        description: 'Current cycle status and next incomplete flow.'
      }
    ],
    sideEffects: ['read-workspace'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['meta/next']
  },
  {
    id: 'meta/readiness',
    title: 'Show ReviewOps P0 Readiness',
    type: 'meta',
    priority: 'P0',
    description: 'Summarize P0 readiness across setup, providers, UI smoke, review flows, evidence, reports, and cycle/meta.',
    aiExecution: 'manual-only',
    network: {
      ai: false,
      devServices: false
    },
    inputs: [
      {
        id: 'workspaceRoot',
        kind: 'workspace',
        required: true,
        description: 'Workspace root to inspect for ReviewOps P0 readiness.'
      }
    ],
    outputs: [
      {
        id: 'readiness',
        kind: 'status',
        description: 'P0 readiness report with setup, manual smoke, and next-action status.'
      }
    ],
    sideEffects: ['read-workspace', 'write-artifact'],
    knowledgeHooks: [],
    skillHooks: [],
    nextActions: ['meta/next']
  }
];

export const p0FlowManifest: FlowManifestEntry[] = [
  ...coreFoundationFlowManifest,
  ...promptResponseFlowManifest,
  ...knowledgeSkillReportFlowManifest,
  ...cycleMetaFlowManifest
];

export function validateFlowManifestEntry(entry: FlowManifestEntry): void {
  if (entry.id.trim().length === 0) {
    throw new FlowManifestValidationError('Flow id is required.');
  }

  if (!entry.id.includes('/')) {
    throw new FlowManifestValidationError(`Flow id must include a domain prefix: ${entry.id}`);
  }

  if (!validFlowTypes.has(entry.type)) {
    throw new FlowManifestValidationError(`Unsupported flow type for ${entry.id}: ${entry.type}`);
  }

  if (!validPriorities.has(entry.priority)) {
    throw new FlowManifestValidationError(`Unsupported flow priority for ${entry.id}: ${entry.priority}`);
  }

  if (entry.aiExecution !== 'manual-only') {
    throw new FlowManifestValidationError(`Flow ${entry.id} must be manual-only for AI execution.`);
  }

  if (entry.network.ai !== false) {
    throw new FlowManifestValidationError(`Flow ${entry.id} cannot enable AI network access.`);
  }

  if (entry.title.trim().length === 0 || entry.description.trim().length === 0) {
    throw new FlowManifestValidationError(`Flow ${entry.id} must include a title and description.`);
  }
}

export function validateFlowManifest(entries: FlowManifestEntry[]): void {
  const seen = new Set<string>();

  for (const entry of entries) {
    validateFlowManifestEntry(entry);

    if (seen.has(entry.id)) {
      throw new FlowManifestValidationError(`Duplicate flow id: ${entry.id}`);
    }

    seen.add(entry.id);
  }
}

export function createFlowRegistry(entries: FlowManifestEntry[] = p0FlowManifest): FlowRegistry {
  validateFlowManifest(entries);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  return {
    list: () => [...entries],
    get: (flowId: string) => byId.get(flowId)
  };
}
