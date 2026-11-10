import type { Clock, ProjectStore } from '../ports/runtime.js';
import { runtimeNow } from '../ports/runtime.js';
import { parseYamlDocument, stringifyYamlDocument } from '../serialization/yaml.js';
import type { RuleCandidateKind } from '../types.js';

export interface ProjectContextInput {
  technicalStack?: string[];
  architecture?: string[];
  codingConventions?: string[];
  testPolicy?: string[];
  reviewPolicy?: string[];
  aiUsageRules?: string[];
  customerConstraints?: string[];
}

export interface ReviewOpsProjectContextFile {
  version: 1;
  updatedAt: string;
  context: Required<ProjectContextInput>;
}

export interface ReviewOpsProjectRulesFile {
  version: 1;
  updatedAt: string;
  rules: ReviewOpsProjectRuleEntry[];
  guidelines?: ReviewOpsProjectRuleEntry[];
  patterns?: ReviewOpsProjectRuleEntry[];
}

export interface ProjectContextRuntime {
  readonly workspaceRoot: string;
  readonly clock: Clock;
  readonly projectStore: ProjectStore;
}

export interface SetupReviewOpsProjectContextWithRuntimeOptions {
  runtime: ProjectContextRuntime;
  input: ProjectContextInput;
  now?: () => Date;
}

export interface SetupReviewOpsProjectContextResult {
  workspaceRoot: string;
  contextPath: string;
  rulesPath: string;
  context: ReviewOpsProjectContextFile;
  rules: ReviewOpsProjectRulesFile;
}

export type ReviewOpsProjectRuleEntry = {
  id: string;
  kind: RuleCandidateKind;
  title: string;
  scope: 'project-local';
  status: 'applied';
  rationale: string;
  source?: string;
  updatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
} & Record<string, unknown>;

interface ReviewOpsProjectRuleCollections {
  rules: ReviewOpsProjectRuleEntry[];
  guidelines: ReviewOpsProjectRuleEntry[];
  patterns: ReviewOpsProjectRuleEntry[];
}

type ProjectRuleCollectionKey = keyof ReviewOpsProjectRuleCollections;

export class ProjectContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectContextError';
  }
}

const contextFilePath = '.reviewops.local/project-context.local.yaml';
const rulesFilePath = '.reviewops.local/project-rules.local.yaml';
const projectContextRuleSource = 'project/context';

export async function setupReviewOpsProjectContextWithRuntime(
  options: SetupReviewOpsProjectContextWithRuntimeOptions
): Promise<SetupReviewOpsProjectContextResult> {
  const updatedAt = runtimeNow(options.runtime, options.now).toISOString();
  const normalized = normalizeProjectContextInput(options.input);
  if (!hasAnyProjectContextValue(normalized)) {
    throw new ProjectContextError('Project context setup requires at least one non-empty context value.');
  }

  const context: ReviewOpsProjectContextFile = {
    version: 1,
    updatedAt,
    context: normalized
  };
  const existingRuleCollections = await readExistingProjectRuleCollections(options.runtime);
  const mergedRuleCollections = mergeProjectRuleCollections(
    existingRuleCollections,
    groupProjectRuleEntries(buildProjectContextRuleEntries(normalized, updatedAt))
  );
  const rules: ReviewOpsProjectRulesFile = {
    version: 1,
    updatedAt,
    rules: mergedRuleCollections.rules,
    ...(mergedRuleCollections.guidelines.length > 0 ? { guidelines: mergedRuleCollections.guidelines } : {}),
    ...(mergedRuleCollections.patterns.length > 0 ? { patterns: mergedRuleCollections.patterns } : {})
  };

  await options.runtime.projectStore.writeText(contextFilePath, stringifyYamlDocument(context));
  await options.runtime.projectStore.writeText(rulesFilePath, stringifyYamlDocument(rules));

  return {
    workspaceRoot: options.runtime.workspaceRoot,
    contextPath: contextFilePath,
    rulesPath: rulesFilePath,
    context,
    rules
  };
}

export async function isReviewOpsProjectContextConfiguredWithRuntime(runtime: ProjectContextRuntime): Promise<boolean> {
  const content = await runtime.projectStore.readText(contextFilePath);
  if (content === undefined) {
    return false;
  }

  const parsed = parseYamlDocument(content, contextFilePath);
  if (!isRecord(parsed) || !isRecord(parsed.context)) {
    return false;
  }

  return Object.values(parsed.context).some((value) => Array.isArray(value) && value.some(isNonEmptyString));
}

export function normalizeProjectContextInput(input: ProjectContextInput): Required<ProjectContextInput> {
  return {
    technicalStack: normalizeStringList(input.technicalStack),
    architecture: normalizeStringList(input.architecture),
    codingConventions: normalizeStringList(input.codingConventions),
    testPolicy: normalizeStringList(input.testPolicy),
    reviewPolicy: normalizeStringList(input.reviewPolicy),
    aiUsageRules: normalizeStringList(input.aiUsageRules),
    customerConstraints: normalizeStringList(input.customerConstraints)
  };
}

function hasAnyProjectContextValue(input: Required<ProjectContextInput>): boolean {
  return Object.values(input).some((values) => values.length > 0);
}

async function readExistingProjectRuleCollections(runtime: ProjectContextRuntime): Promise<ReviewOpsProjectRuleCollections> {
  const content = await runtime.projectStore.readText(rulesFilePath);
  if (content === undefined) {
    return emptyProjectRuleCollections();
  }

  const parsed = parseYamlDocument(content, rulesFilePath);
  if (!isRecord(parsed)) {
    return emptyProjectRuleCollections();
  }

  return {
    rules: readProjectRuleCollection(parsed, 'rules'),
    guidelines: readProjectRuleCollection(parsed, 'guidelines'),
    patterns: readProjectRuleCollection(parsed, 'patterns')
  };
}

function readProjectRuleCollection(
  parsed: Record<string, unknown>,
  key: ProjectRuleCollectionKey
): ReviewOpsProjectRuleEntry[] {
  return Array.isArray(parsed[key]) ? parsed[key].filter(isReviewOpsProjectRuleEntry) : [];
}

function mergeProjectRuleCollections(
  existingCollections: ReviewOpsProjectRuleCollections,
  contextCollections: ReviewOpsProjectRuleCollections
): ReviewOpsProjectRuleCollections {
  return {
    rules: mergeProjectRuleCollection(existingCollections.rules, contextCollections.rules),
    guidelines: mergeProjectRuleCollection(existingCollections.guidelines, contextCollections.guidelines),
    patterns: mergeProjectRuleCollection(existingCollections.patterns, contextCollections.patterns)
  };
}

function mergeProjectRuleCollection(
  existingRules: ReviewOpsProjectRuleEntry[],
  contextRules: ReviewOpsProjectRuleEntry[]
): ReviewOpsProjectRuleEntry[] {
  return [...existingRules.filter((rule) => rule.source !== projectContextRuleSource), ...contextRules];
}

function groupProjectRuleEntries(entries: ReviewOpsProjectRuleEntry[]): ReviewOpsProjectRuleCollections {
  return entries.reduce((collections, entry) => {
    collections[collectionKeyForProjectRuleKind(entry.kind)].push(entry);
    return collections;
  }, emptyProjectRuleCollections());
}

function emptyProjectRuleCollections(): ReviewOpsProjectRuleCollections {
  return {
    rules: [],
    guidelines: [],
    patterns: []
  };
}

function buildProjectContextRuleEntries(
  input: Required<ProjectContextInput>,
  updatedAt: string
): ReviewOpsProjectRuleEntry[] {
  return [
    ...toProjectContextRuleEntries('architecture', 'Architecture policy', 'architecture-rule', input.architecture, updatedAt),
    ...toProjectContextRuleEntries(
      'coding-conventions',
      'Coding convention',
      'coding-guideline',
      input.codingConventions,
      updatedAt
    ),
    ...toProjectContextRuleEntries('test-policy', 'Test policy', 'test-rule', input.testPolicy, updatedAt),
    ...toProjectContextRuleEntries('review-policy', 'Review policy', 'review-rule', input.reviewPolicy, updatedAt),
    ...toProjectContextRuleEntries('ai-usage-rules', 'AI usage rule', 'review-rule', input.aiUsageRules, updatedAt),
    ...toProjectContextRuleEntries(
      'customer-constraints',
      'Customer constraint',
      'review-rule',
      input.customerConstraints,
      updatedAt
    )
  ];
}

function toProjectContextRuleEntries(
  idPrefix: string,
  titlePrefix: string,
  kind: RuleCandidateKind,
  values: string[],
  updatedAt: string
): ReviewOpsProjectRuleEntry[] {
  return values.map((value, index) => ({
    id: `project-context-${idPrefix}-${index + 1}`,
    kind,
    title: `${titlePrefix}: ${value}`,
    scope: 'project-local',
    status: 'applied',
    source: projectContextRuleSource,
    updatedAt,
    rationale: `Recorded by ReviewOps project context setup: ${value}`
  }));
}

function collectionKeyForProjectRuleKind(kind: RuleCandidateKind): ProjectRuleCollectionKey {
  if (kind === 'coding-guideline') {
    return 'guidelines';
  }
  if (kind === 'generic-debt-pattern') {
    return 'patterns';
  }

  return 'rules';
}

function normalizeStringList(values: string[] | undefined): string[] {
  if (values === undefined) {
    return [];
  }

  return [...new Set(values.map((value) => value.trim()).filter(isNonEmptyString))];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReviewOpsProjectRuleEntry(value: unknown): value is ReviewOpsProjectRuleEntry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.kind) &&
    isNonEmptyString(value.title) &&
    value.scope === 'project-local' &&
    value.status === 'applied' &&
    isNonEmptyString(value.rationale)
  );
}
