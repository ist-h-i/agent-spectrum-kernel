import { readFileSync } from 'node:fs';
import { validate } from './validate-shape.mjs';

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
export const phases = load('../data/schema-phases.json');
export const state = load('../data/mixed-state.json');
export const cases = load('../data/rollback-cases.json');
const schema = load('../plan.schema.json');

export function readRecord(row, reader) {
  if (reader === 'v1') return row.name ?? null;
  if (reader === 'v2_fallback') return row.display_name ?? row.name ?? null;
  if (reader === 'v2') return row.display_name ?? null;
  throw new Error('unrecognized_reader');
}

export function writeRecord(row, writer, value) {
  if (writer === 'v1') return { ...row, name: value };
  if (writer === 'v2_dual') return { ...row, name: value, display_name: value };
  if (writer === 'v2') return { id: row.id, display_name: value };
  throw new Error('unrecognized_writer');
}

// Plan syntax and binding are checked locally. Release and recovery judgments use separate evidence.
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
  if (plan.rollback_cases.length !== cases.length) failures.add('case_coverage');
  const seen = new Set();
  for (const decision of plan.rollback_cases) {
    if (!cases.some(row => row.case_id === decision.case_id) || seen.has(decision.case_id)) {
      failures.add('case_identity');
      continue;
    }
    seen.add(decision.case_id);
    const expectedSnapshot = decision.action === 'restore_snapshot' ? state.snapshot_id : null;
    if (decision.snapshot_id !== expectedSnapshot) failures.add('snapshot_reference');
  }
  return result();
}
