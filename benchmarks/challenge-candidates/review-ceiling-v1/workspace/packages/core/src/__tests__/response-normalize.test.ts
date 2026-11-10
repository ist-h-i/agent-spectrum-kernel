import { describe, expect, it } from 'vitest';

import { normalizeReviewResponse } from '../index.js';

describe('response normalize skeleton', () => {
  it('extracts JSON fenced response data into ReviewOps result seeds', () => {
    const result = normalizeReviewResponse(`
Summary goes here.

\`\`\`json
{
  "findings": [
    {
      "title": "Null input can trigger a major runtime failure",
      "category": "bug-risk",
      "severity": "major",
      "evidence": "src/parser.ts:10",
      "recommendation": "Guard null before parsing"
    }
  ],
  "actionPlan": [
    { "title": "Add parser guard", "priority": "P1", "steps": ["Add null check", "Add regression test"] }
  ],
  "replyDrafts": [
    { "target": "review thread", "body": "I will add a guard and regression test before posting." }
  ],
  "ruleCandidates": [
    { "title": "Guard external parser inputs", "rationale": "Repeated parser entry points need explicit validation." }
  ],
  "knowledgeCandidates": [
    { "title": "Parser input validation", "summary": "Treat parser boundaries as untrusted inputs." }
  ]
}
\`\`\`
`);

    expect(result.structured).toBe(true);
    expect(result.requiresUserEdit).toBe(false);
    expect(result.reviewFindings[0]).toMatchObject({
      category: 'bug-risk',
      severity: 'major',
      evidence: 'src/parser.ts:10'
    });
    expect(result.actionPlan[0]?.steps).toEqual(['Add null check', 'Add regression test']);
    expect(result.resultMarkdown).toContain('## Rule Candidates');
  });

  it('keeps fallback markdown findings and requires user edit when JSON is missing', () => {
    const result = normalizeReviewResponse('- Missing test coverage for the edge case');

    expect(result.structured).toBe(false);
    expect(result.requiresUserEdit).toBe(true);
    expect(result.reviewFindings[0]).toMatchObject({
      category: 'test',
      title: 'Missing test coverage for the edge case'
    });
    expect(result.warnings).toContain('No valid JSON fenced block was found; fallback markdown parsing was used.');
  });
});
