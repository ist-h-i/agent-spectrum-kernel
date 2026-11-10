import { describe, expect, it } from 'vitest';

import {
  PromptTemplateError,
  loadPromptTemplatesFromYaml,
  selectPromptTemplate
} from '../index.js';

describe('prompt template loader', () => {
  it('loads ReviewOps prompt templates from YAML and selects by flow id', () => {
    const catalog = loadPromptTemplatesFromYaml(`
version: 1
templates:
  - id: diff-review-default
    flowId: diff/review
    version: 1
    sections:
      - id: purpose
        title: Purpose
      - id: inputSummary
        title: Input Summary
`);

    const template = selectPromptTemplate(catalog, 'diff/review');

    expect(catalog.version).toBe(1);
    expect(template.id).toBe('diff-review-default');
    expect(template.sections.map((section) => section.id)).toEqual(['purpose', 'inputSummary']);
    expect(template.sections[0]?.required).toBe(true);
  });

  it('uses the built-in diff review template when the catalog is empty', () => {
    const template = selectPromptTemplate(loadPromptTemplatesFromYaml('version: 1\ntemplates: []\n'), 'diff/review');

    expect(template.id).toBe('diff-review-default');
    expect(template.flowId).toBe('diff/review');
  });

  it('rejects malformed template catalogs', () => {
    expect(() =>
      loadPromptTemplatesFromYaml(`
version: 1
templates:
  - id: duplicate-sections
    flowId: diff/review
    version: 1
    sections:
      - id: purpose
        title: Purpose
      - id: purpose
        title: Purpose Again
`)
    ).toThrow(PromptTemplateError);
  });
});
