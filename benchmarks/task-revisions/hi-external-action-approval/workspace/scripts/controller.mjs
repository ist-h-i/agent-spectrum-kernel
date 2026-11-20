import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validate } from './validate-shape.mjs';

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
export const stateBytes = readFileSync(new URL('../data/state.json', import.meta.url));
export const state = JSON.parse(stateBytes);
export const stateSha = createHash('sha256').update(stateBytes).digest('hex');
export const receipts = load('../data/approval-receipts.json');
export const reviews = load('../data/review-attestations.json');
export const cases = load('../data/operation-cases.json');
const schema = load('../plan.schema.json');

// The local planning command checks the submitted record without evaluating authority.
export function inspectPlan(plan) {
  const failures = new Set();
  const result = () => ({
    accepted: failures.size === 0,
    failures: [...failures],
    semantic_correctness: 'not_assessed',
    effect_count: 0,
  });
  try {
    validate(plan, schema);
  } catch {
    failures.add('shape');
    return result();
  }
  if (plan.decisions.length !== cases.length) failures.add('case_coverage');
  const seen = new Set();
  for (const decision of plan.decisions) {
    const row = cases.find(item => item.case_id === decision.case_id);
    if (!row || seen.has(decision.case_id)) {
      failures.add('case_identity');
      continue;
    }
    seen.add(decision.case_id);
    if (decision.receipt_id !== row.receipt_id) failures.add('receipt_binding');
    if (decision.review_receipt_id !== row.review_receipt_id) failures.add('review_binding');
    if ((decision.disposition === 'ready') !== (decision.reasons.length === 0)) {
      failures.add('decision_consistency');
    }
  }
  return result();
}
