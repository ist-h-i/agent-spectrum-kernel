import type { ArtifactStore } from '../ports/artifact-store.js';
import { createFileSystemReviewOpsRuntime } from '../infrastructure/fs/runtime.js';
import type { ReviewOpsCoreRuntime } from '../ports/runtime.js';
import { runtimeNow } from '../ports/runtime.js';
import type { KnowledgeCandidateSeed, ReviewFindingSeed, RuleCandidateSeed } from '../responses/normalize.js';
import { joinWorkspacePath } from '../serialization/paths.js';
import { parseYamlDocument, stringifyYamlDocument } from '../serialization/yaml.js';
import type {
  FlowArtifactRef,
  KnowledgeCandidate,
  KnowledgeCandidateKind,
  KnowledgeScope,
  RuleCandidate,
  RuleCandidateKind
} from '../types.js';

export interface ExistingRuleSummary {
  id: string;
  title: string;
  body?: string;
}

export interface RuleReconciliationItem {
  candidateId: string;
  status: RuleCandidate['status'];
  reason: string;
  matchedRuleId?: string;
}

export interface RuleReconciliation {
  total: number;
  newCount: number;
  duplicateCount: number;
  mergeNeededCount: number;
  conflictCount: number;
  items: RuleReconciliationItem[];
}

export interface BuildKnowledgeCaptureArtifactsOptions {
  artifactStore: ArtifactStore;
  runId: string;
  ruleSeeds?: RuleCandidateSeed[];
  knowledgeSeeds?: KnowledgeCandidateSeed[];
  findings?: ReviewFindingSeed[];
  existingRules?: ExistingRuleSummary[];
  repository?: string;
  flowId?: string;
  now?: () => Date;
}

export interface BuildKnowledgeCaptureArtifactsResult {
  ruleCandidates: RuleCandidate[];
  knowledgeCandidates: KnowledgeCandidate[];
  reconciliation: RuleReconciliation;
  artifacts: {
    ruleCandidates: FlowArtifactRef;
    knowledgeCandidates: FlowArtifactRef;
    reconciliation: FlowArtifactRef;
    portableChecklist: FlowArtifactRef;
  };
}

export interface SaveApprovedRuleCandidatesOptions {
  workspaceRoot: string;
  candidates: RuleCandidate[];
  approvedCandidateIds: string[];
  approvedBy?: string;
  now?: () => Date;
}

export interface SaveApprovedRuleCandidatesWithRuntimeOptions extends Omit<SaveApprovedRuleCandidatesOptions, 'workspaceRoot'> {
  runtime: ReviewOpsCoreRuntime;
}

export interface SaveApprovedRuleCandidatesResult {
  saved: Array<{
    candidateId: string;
    path: string;
  }>;
  skipped: Array<{
    candidateId: string;
    reason: string;
  }>;
  actionLogPath: string;
}

export interface RuleApplicationPayload {
  approvedCandidateIds: string[];
  saved: SaveApprovedRuleCandidatesResult['saved'];
  skipped: SaveApprovedRuleCandidatesResult['skipped'];
  actionLogPath: string;
}

interface AppliedRuleDocumentEntry {
  id: string;
  kind: RuleCandidateKind;
  title: string;
  scope: KnowledgeScope;
  status: 'applied';
  approvedAt: string;
  approvedBy?: string;
  rationale: string;
}

const portableChecklist = [
  'No customer names, repository names, URLs, incidents, personal names, or project-specific specs are included.',
  'The wording is generalized enough to reuse outside this repository.',
  'A human reviewer approved the candidate before sharing it beyond the project.'
];

export async function buildKnowledgeCaptureArtifacts(
  options: BuildKnowledgeCaptureArtifactsOptions
): Promise<BuildKnowledgeCaptureArtifactsResult> {
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const flowId = options.flowId ?? 'knowledge/capture-candidates';
  const proposedRules = proposeRuleCandidates({
    runId: options.runId,
    ruleSeeds: options.ruleSeeds ?? [],
    findings: options.findings ?? [],
    repository: options.repository
  });
  const { candidates: ruleCandidates, reconciliation } = reconcileRuleCandidates(
    proposedRules,
    options.existingRules ?? []
  );
  const knowledgeCandidates = classifyKnowledgeCandidateSeeds({
    runId: options.runId,
    seeds: options.knowledgeSeeds ?? [],
    repository: options.repository
  });

  const ruleCandidatesArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'rule-candidates.json',
    kind: 'json',
    content: toJson(ruleCandidates),
    createdAt
  });
  const knowledgeCandidatesArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'knowledge-candidates.json',
    kind: 'json',
    content: toJson(knowledgeCandidates),
    createdAt
  });
  const reconciliationArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'rules-reconciliation.json',
    kind: 'json',
    content: toJson(reconciliation),
    createdAt
  });
  const portableChecklistArtifact = await options.artifactStore.write({
    flowId,
    runId: options.runId,
    name: 'portable-checklist.md',
    kind: 'markdown',
    content: renderPortableChecklist(ruleCandidates, knowledgeCandidates),
    createdAt
  });

  return {
    ruleCandidates,
    knowledgeCandidates,
    reconciliation,
    artifacts: {
      ruleCandidates: ruleCandidatesArtifact,
      knowledgeCandidates: knowledgeCandidatesArtifact,
      reconciliation: reconciliationArtifact,
      portableChecklist: portableChecklistArtifact
    }
  };
}

export function createRuleApplicationPayload(
  result: SaveApprovedRuleCandidatesResult,
  approvedCandidates: RuleCandidate[]
): RuleApplicationPayload {
  return {
    approvedCandidateIds: approvedCandidates.map((candidate) => candidate.id),
    saved: result.saved,
    skipped: result.skipped,
    actionLogPath: result.actionLogPath
  };
}

export function renderRuleUpdateMarkdown(application: RuleApplicationPayload): string {
  const lines = [
    '# ReviewOps Rule Update',
    '',
    'ReviewOps records only user-approved applicable rules. Update artifacts do not apply rules again.',
    '',
    `Approved candidates: ${application.approvedCandidateIds.length}`,
    `Saved rules: ${application.saved.length}`,
    `Skipped candidates: ${application.skipped.length}`,
    `Action log: ${application.actionLogPath}`,
    '',
    '## Saved',
    '',
    ...renderRuleUpdateSavedLines(application.saved),
    '',
    '## Skipped',
    '',
    ...renderRuleUpdateSkippedLines(application.skipped),
    ''
  ];

  return lines.join('\n');
}

export function proposeRuleCandidates(options: {
  runId: string;
  ruleSeeds: RuleCandidateSeed[];
  findings?: ReviewFindingSeed[];
  repository?: string;
}): RuleCandidate[] {
  const seededRules = options.ruleSeeds.map((seed, index) =>
    toRuleCandidate({
      id: seed.id,
      title: seed.title,
      rationale: seed.rationale,
      runId: options.runId,
      fallbackIndex: index,
      repository: options.repository
    })
  );
  const findingRules = (options.findings ?? [])
    .filter((finding) => shouldPromoteFindingToRule(finding))
    .map((finding, index) =>
      toRuleCandidate({
        id: `finding-rule-${finding.id}`,
        title: finding.title,
        rationale: finding.recommendation ?? finding.summary,
        runId: options.runId,
        findingId: finding.id,
        fallbackIndex: seededRules.length + index,
        repository: options.repository
      })
    );

  return dedupeRules([...seededRules, ...findingRules]);
}

export function classifyKnowledgeCandidateSeeds(options: {
  runId: string;
  seeds: KnowledgeCandidateSeed[];
  repository?: string;
}): KnowledgeCandidate[] {
  return options.seeds.map((seed, index): KnowledgeCandidate => {
    const text = `${seed.title}\n${seed.summary}`;
    const scope = classifyScope(text, options.repository);

    return {
      id: safeId(seed.id, `knowledge-${index + 1}`),
      kind: classifyKnowledgeKind(text),
      title: seed.title,
      summary: seed.summary,
      sourceFlowRunId: options.runId,
      scope,
      status: scope === 'prohibited' ? 'rejected' : 'candidate'
    };
  });
}

export function reconcileRuleCandidates(
  candidates: RuleCandidate[],
  existingRules: ExistingRuleSummary[]
): {
  candidates: RuleCandidate[];
  reconciliation: RuleReconciliation;
} {
  const items = candidates.map((candidate): RuleReconciliationItem => {
    const duplicate = existingRules.find((rule) => isDuplicateRule(candidate, rule));
    if (duplicate !== undefined) {
      return {
        candidateId: candidate.id,
        status: 'duplicate',
        reason: 'A rule with the same normalized title or body already exists.',
        matchedRuleId: duplicate.id
      };
    }

    const conflict = existingRules.find((rule) => hasRuleConflict(candidate, rule));
    if (conflict !== undefined) {
      return {
        candidateId: candidate.id,
        status: 'conflict',
        reason: 'The candidate appears to contradict an existing rule and needs human review.',
        matchedRuleId: conflict.id
      };
    }

    const mergeNeeded = existingRules.find((rule) => isMergeCandidate(candidate, rule));
    if (mergeNeeded !== undefined) {
      return {
        candidateId: candidate.id,
        status: 'merge_needed',
        reason: 'A similar rule exists; merge the wording before applying.',
        matchedRuleId: mergeNeeded.id
      };
    }

    return {
      candidateId: candidate.id,
      status: candidate.scope === 'prohibited' ? 'rejected' : 'new',
      reason:
        candidate.scope === 'prohibited'
          ? 'The candidate includes prohibited or sensitive-looking content.'
          : 'No duplicate or conflict was detected.'
    };
  });

  const statusById = new Map(items.map((item) => [item.candidateId, item.status]));
  const reconciled = candidates.map((candidate) => ({
    ...candidate,
    status: statusById.get(candidate.id) ?? candidate.status
  }));

  return {
    candidates: reconciled,
    reconciliation: {
      total: items.length,
      newCount: items.filter((item) => item.status === 'new').length,
      duplicateCount: items.filter((item) => item.status === 'duplicate').length,
      mergeNeededCount: items.filter((item) => item.status === 'merge_needed').length,
      conflictCount: items.filter((item) => item.status === 'conflict').length,
      items
    }
  };
}

export async function saveApprovedRuleCandidates(
  options: SaveApprovedRuleCandidatesOptions
): Promise<SaveApprovedRuleCandidatesResult> {
  return saveApprovedRuleCandidatesWithRuntime({
    runtime: createFileSystemReviewOpsRuntime(options.workspaceRoot),
    candidates: options.candidates,
    approvedCandidateIds: options.approvedCandidateIds,
    approvedBy: options.approvedBy,
    now: options.now
  });
}

export async function saveApprovedRuleCandidatesWithRuntime(
  options: SaveApprovedRuleCandidatesWithRuntimeOptions
): Promise<SaveApprovedRuleCandidatesResult> {
  const createdAt = runtimeNow(options.runtime, options.now).toISOString();
  const approved = new Set(options.approvedCandidateIds);
  const result: SaveApprovedRuleCandidatesResult = {
    saved: [],
    skipped: [],
    actionLogPath: joinWorkspacePath('.reviewops', 'out', 'rule-applications.jsonl')
  };

  for (const candidate of options.candidates) {
    if (!approved.has(candidate.id)) {
      result.skipped.push({ candidateId: candidate.id, reason: 'Candidate was not approved by the user.' });
      continue;
    }
    if (
      candidate.status === 'duplicate' ||
      candidate.status === 'merge_needed' ||
      candidate.status === 'conflict' ||
      candidate.status === 'rejected'
    ) {
      result.skipped.push({ candidateId: candidate.id, reason: `Candidate status is ${candidate.status}.` });
      continue;
    }
    if (candidate.scope === 'prohibited' || candidate.scope === 'organization-portable') {
      result.skipped.push({ candidateId: candidate.id, reason: `Scope ${candidate.scope} is not applied by P0 local flows.` });
      continue;
    }

    const relativePath =
      candidate.scope === 'project-local'
        ? joinWorkspacePath('.reviewops.local', 'project-rules.local.yaml')
        : joinWorkspacePath('.reviewops', 'knowledge', fileNameForRuleKind(candidate.kind));

    await appendYamlRule(options.runtime, relativePath, candidate, createdAt, options.approvedBy);
    result.saved.push({
      candidateId: candidate.id,
      path: relativePath
    });
  }

  await appendRuleApplicationLog(options.runtime, result, createdAt, options.approvedBy);
  return result;
}

function toRuleCandidate(options: {
  id: string;
  title: string;
  rationale: string;
  runId: string;
  findingId?: string;
  fallbackIndex: number;
  repository?: string;
}): RuleCandidate {
  const text = `${options.title}\n${options.rationale}`;
  const scope = classifyScope(text, options.repository);

  return {
    id: safeId(options.id, `rule-${options.fallbackIndex + 1}`),
    kind: classifyRuleKind(text),
    title: options.title,
    rationale: options.rationale,
    source: {
      flowRunId: options.runId,
      findingId: options.findingId
    },
    scope,
    suggestedRule: {
      title: options.title,
      rationale: options.rationale
    },
    reviewQuestions: scope === 'portable-candidate' ? portableChecklist : ['Confirm this should remain project-local.'],
    mentorHints: ['Use this as discussion evidence, not as an automatic evaluation score.'],
    risks: scope === 'portable-candidate' ? ['Portable promotion still requires human confidentiality review.'] : [],
    mitigations: scope === 'portable-candidate' ? ['Run the portable checklist before sharing.'] : [],
    status: scope === 'prohibited' ? 'rejected' : 'new'
  };
}

function shouldPromoteFindingToRule(finding: ReviewFindingSeed): boolean {
  return finding.category === 'architecture' || finding.category === 'test' || finding.category === 'docs';
}

function classifyRuleKind(text: string): RuleCandidateKind {
  const normalized = text.toLowerCase();
  if (/(architecture|boundary|layer|dependency)/u.test(normalized)) {
    return 'architecture-rule';
  }
  if (/(docs?|readme|drift)/u.test(normalized)) {
    return 'docs-drift-rule';
  }
  if (/(test|spec|coverage)/u.test(normalized)) {
    return 'test-rule';
  }
  if (/(debt|legacy|workaround)/u.test(normalized)) {
    return 'generic-debt-pattern';
  }
  if (/(style|format|naming|guideline)/u.test(normalized)) {
    return 'coding-guideline';
  }

  return 'review-rule';
}

function classifyKnowledgeKind(text: string): KnowledgeCandidateKind {
  const normalized = text.toLowerCase();
  if (/(good|practice|pattern|example)/u.test(normalized)) {
    return 'good-practice';
  }
  if (/(debt|legacy|workaround)/u.test(normalized)) {
    return 'generic-debt-pattern';
  }
  if (/(skill|roadmap|learning)/u.test(normalized)) {
    return 'roadmap-skill';
  }
  if (/(guideline|rule|standard)/u.test(normalized)) {
    return 'coding-guideline';
  }
  if (/(project|local|customer|repository|incident)/u.test(normalized)) {
    return 'project-debt';
  }

  return 'review-tip';
}

function classifyScope(text: string, repository?: string): KnowledgeScope {
  const normalized = text.toLowerCase();
  const normalizedRepository = repository?.toLowerCase();
  if (/(secret|token|password|credential|private key|access key)/u.test(normalized)) {
    return 'prohibited';
  }
  if (
    /https?:\/\//u.test(text) ||
    /(customer|client|incident|outage|障害|顧客|案件固有)/u.test(normalized) ||
    (normalizedRepository !== undefined && normalizedRepository.length > 0 && normalized.includes(normalizedRepository))
  ) {
    return 'project-local';
  }

  return 'portable-candidate';
}

function isDuplicateRule(candidate: RuleCandidate, existing: ExistingRuleSummary): boolean {
  const candidateTitle = normalizeText(candidate.title);
  const existingTitle = normalizeText(existing.title);
  const existingBody = normalizeText(existing.body ?? '');

  return candidateTitle === existingTitle || existingBody.includes(candidateTitle);
}

function hasRuleConflict(candidate: RuleCandidate, existing: ExistingRuleSummary): boolean {
  const candidateText = normalizeText(`${candidate.title} ${candidate.rationale}`);
  const existingText = normalizeText(`${existing.title} ${existing.body ?? ''}`);
  const candidateNegative = /\b(must not|never|avoid|禁止)\b/u.test(candidateText);
  const existingNegative = /\b(must not|never|avoid|禁止)\b/u.test(existingText);

  return candidateNegative !== existingNegative && sharedKeywordCount(candidateText, existingText) >= 2;
}

function isMergeCandidate(candidate: RuleCandidate, existing: ExistingRuleSummary): boolean {
  return sharedKeywordCount(normalizeText(candidate.title), normalizeText(existing.title)) >= 3;
}

function sharedKeywordCount(left: string, right: string): number {
  const leftWords = new Set(left.split(/\s+/u).filter((word) => word.length >= 4));
  const rightWords = new Set(right.split(/\s+/u).filter((word) => word.length >= 4));

  return [...leftWords].filter((word) => rightWords.has(word)).length;
}

async function appendYamlRule(
  runtime: ReviewOpsCoreRuntime,
  relativePath: string,
  candidate: RuleCandidate,
  approvedAt: string,
  approvedBy?: string
): Promise<void> {
  const current = await runtime.ruleStore.readText(relativePath) ?? `version: 1\n${collectionKeyForRuleKind(candidate.kind)}: []\n`;

  const key = collectionKeyForRuleKind(candidate.kind);
  const document = parseYamlRuleDocument(current);
  const collection = Array.isArray(document[key]) ? document[key] : [];
  collection.push(toAppliedRuleDocumentEntry(candidate, approvedAt, approvedBy));
  document[key] = collection;

  await runtime.ruleStore.writeText(relativePath, stringifyYamlDocument(document));
}

async function appendRuleApplicationLog(
  runtime: ReviewOpsCoreRuntime,
  result: SaveApprovedRuleCandidatesResult,
  createdAt: string,
  approvedBy?: string
): Promise<void> {
  await runtime.actionLogStore.appendText(
    result.actionLogPath,
    `${JSON.stringify({
      createdAt,
      approvedBy,
      saved: result.saved,
      skipped: result.skipped
    })}\n`,
  );
}

function fileNameForRuleKind(kind: RuleCandidateKind): string {
  switch (kind) {
    case 'coding-guideline':
      return 'coding-guidelines.yaml';
    case 'architecture-rule':
      return 'architecture-rules.yaml';
    case 'docs-drift-rule':
      return 'docs-drift-rules.yaml';
    case 'test-rule':
      return 'test-rules.yaml';
    case 'generic-debt-pattern':
      return 'generic-debt-patterns.yaml';
    case 'review-rule':
      return 'review-rules.yaml';
  }
}

function collectionKeyForRuleKind(kind: RuleCandidateKind): string {
  if (kind === 'coding-guideline') {
    return 'guidelines';
  }
  if (kind === 'generic-debt-pattern') {
    return 'patterns';
  }

  return 'rules';
}

function parseYamlRuleDocument(current: string): Record<string, unknown> {
  if (current.trim().length === 0) {
    return { version: 1 };
  }

  const parsed = parseYamlDocument(current, 'rule document');
  if (!isRecord(parsed)) {
    return { version: 1 };
  }

  return parsed.version === undefined ? { version: 1, ...parsed } : { ...parsed };
}

function toAppliedRuleDocumentEntry(
  candidate: RuleCandidate,
  approvedAt: string,
  approvedBy?: string
): AppliedRuleDocumentEntry {
  return {
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    scope: candidate.scope,
    status: 'applied',
    approvedAt,
    ...(approvedBy === undefined ? {} : { approvedBy }),
    rationale: candidate.rationale
  };
}

function renderPortableChecklist(rules: RuleCandidate[], knowledge: KnowledgeCandidate[]): string {
  const portableCount = [...rules, ...knowledge].filter((candidate) => candidate.scope === 'portable-candidate').length;
  return [
    '# ReviewOps Portable Knowledge Checklist',
    '',
    `Portable candidates: ${portableCount}`,
    '',
    ...portableChecklist.map((item) => `- [ ] ${item}`),
    ''
  ].join('\n');
}

function renderRuleUpdateSavedLines(saved: SaveApprovedRuleCandidatesResult['saved']): string[] {
  if (saved.length === 0) {
    return ['_No rules were saved._'];
  }

  return saved.map((item) => `- ${item.candidateId}: ${item.path}`);
}

function renderRuleUpdateSkippedLines(skipped: SaveApprovedRuleCandidatesResult['skipped']): string[] {
  if (skipped.length === 0) {
    return ['_No candidates were skipped._'];
  }

  return skipped.map((item) => `- ${item.candidateId}: ${item.reason}`);
}

function dedupeRules(candidates: RuleCandidate[]): RuleCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalizeText(candidate.title);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function safeId(value: string, fallback: string): string {
  const normalized = value.replaceAll(/[^0-9a-z-]/giu, '-').replaceAll(/^-+|-+$/gu, '').toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
