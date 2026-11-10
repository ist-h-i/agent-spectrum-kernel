import { parse } from 'yaml';

export interface PromptTemplateSection {
  id: string;
  title: string;
  required: boolean;
}

export interface PromptTemplate {
  id: string;
  flowId: string;
  version: number;
  sections: PromptTemplateSection[];
}

export interface PromptTemplateCatalog {
  version: number;
  templates: PromptTemplate[];
}

export class PromptTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

export const defaultPromptSections: PromptTemplateSection[] = [
  { id: 'purpose', title: 'Purpose', required: true },
  { id: 'projectContext', title: 'Project Context', required: true },
  { id: 'target', title: 'Target', required: true },
  { id: 'inputSummary', title: 'Input Summary', required: true },
  { id: 'rules', title: 'Rules / Guidelines', required: true },
  { id: 'task', title: 'Task', required: true },
  { id: 'expectedOutput', title: 'Expected Output', required: true },
  { id: 'outputSchema', title: 'Output JSON Schema', required: true }
];

export const defaultDiffReviewPromptTemplate: PromptTemplate = {
  id: 'diff-review-default',
  flowId: 'diff/review',
  version: 1,
  sections: defaultPromptSections
};

export function loadPromptTemplatesFromYaml(content: string): PromptTemplateCatalog {
  if (content.trim().length === 0) {
    return { version: 1, templates: [] };
  }

  const parsed: unknown = parse(content);
  if (!isRecord(parsed)) {
    throw new PromptTemplateError('Prompt template catalog must be a YAML mapping.');
  }

  const version = readPositiveInteger(parsed.version, 'catalog version');
  const rawTemplates = parsed.templates;
  if (!Array.isArray(rawTemplates)) {
    throw new PromptTemplateError('Prompt template catalog must include a templates array.');
  }

  return {
    version,
    templates: rawTemplates.map((template, index) => normalizePromptTemplate(template, index))
  };
}

export function selectPromptTemplate(
  catalog: PromptTemplateCatalog,
  flowId: string,
  fallback: PromptTemplate = defaultDiffReviewPromptTemplate
): PromptTemplate {
  const template = catalog.templates.find((candidate) => candidate.flowId === flowId);
  if (template !== undefined) {
    return template;
  }

  if (fallback.flowId === flowId) {
    return fallback;
  }

  throw new PromptTemplateError(`No prompt template is registered for flow ${flowId}.`);
}

function normalizePromptTemplate(value: unknown, index: number): PromptTemplate {
  if (!isRecord(value)) {
    throw new PromptTemplateError(`Prompt template at index ${index} must be a mapping.`);
  }

  const id = readNonEmptyString(value.id, `template[${index}].id`);
  const flowId = readNonEmptyString(value.flowId, `template[${index}].flowId`);
  const version = readPositiveInteger(value.version, `template[${index}].version`);
  const rawSections = value.sections;

  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    throw new PromptTemplateError(`Prompt template ${id} must include at least one section.`);
  }

  const sections = rawSections.map((section, sectionIndex) =>
    normalizePromptTemplateSection(section, `${id}.sections[${sectionIndex}]`)
  );
  const duplicateSection = findDuplicate(sections.map((section) => section.id));
  if (duplicateSection !== undefined) {
    throw new PromptTemplateError(`Prompt template ${id} includes duplicate section ${duplicateSection}.`);
  }

  return { id, flowId, version, sections };
}

function normalizePromptTemplateSection(value: unknown, label: string): PromptTemplateSection {
  if (!isRecord(value)) {
    throw new PromptTemplateError(`${label} must be a mapping.`);
  }

  return {
    id: readNonEmptyString(value.id, `${label}.id`),
    title: readNonEmptyString(value.title, `${label}.title`),
    required: typeof value.required === 'boolean' ? value.required : true
  };
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PromptTemplateError(`${label} must be a non-empty string.`);
  }

  return value;
}

function readPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new PromptTemplateError(`${label} must be a positive integer.`);
  }

  return Number(value);
}

function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
