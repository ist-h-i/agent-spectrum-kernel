import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalEvolutionObservation } from './ask-personal-evolution-observation.mjs';
import { canonicalDigest } from './content-addressed-store.mjs';
import { buildInstructionLoopFeedback, projectInstructionLoopObservation } from './instruction-loop-feedback.mjs';

function finding(n, kind = 'instruction_gap') {
  return { kind, tags: ['routing'], severity: 2, observation: buildPersonalEvolutionObservation({
    observation_id: 'finding-' + n, repository_id: 'local', task_ids: ['task-' + n],
    correction: 'Require boundary verification before modifying the selected instruction.',
    intended_mechanism: 'Add an applicable instruction step.', applicability: 'Repeated instruction omissions.',
    non_applicability: ['One-off task correction.'], evidence_status: 'Supported',
    evidence_refs: [{ artifact_id: 'review-' + n, digest: canonicalDigest(n) }],
    privacy: { classification: 'public_summary', raw_content_retained: false, private_answers_retained: false },
  }) };
}
test('public observations group repeat friction and keep non-instruction destinations separate', () => {
  const feedback = buildInstructionLoopFeedback({ findings: [finding(1), finding(2), finding(3, 'deterministic_failure')] });
  assert.equal(feedback.candidates.length, 2);
  assert.equal(feedback.candidates.find(c => c.destination === 'instruction').occurrences, 2);
  assert.equal(feedback.candidates.find(c => c.destination === 'check').occurrences, 1);
  const projected = projectInstructionLoopObservation(feedback);
  assert.deepEqual(projected.tags, ['routing']);
  assert.equal(JSON.stringify(projected).includes('repository_id'), false);
  assert.equal(JSON.stringify(projected).includes('task_ids'), false);
  assert.deepEqual(feedback, buildInstructionLoopFeedback({ findings: [finding(3, 'deterministic_failure'), finding(2), finding(1)] }));
});
test('no instruction destination cannot accidentally start instruction generation', () => {
  const feedback = buildInstructionLoopFeedback({ findings: [finding(1, 'one_off')] });
  assert.equal(feedback.selected_id, null); assert.throws(() => projectInstructionLoopObservation(feedback), /no instruction candidate/);
});
test('duplicate/tampered/private observations and arbitrary data refuse', () => {
  assert.throws(() => buildInstructionLoopFeedback({ findings: [finding(1), finding(1)] }), /duplicate/);
  const f = finding(1); f.observation = { ...f.observation, correction: 'changed' };
  assert.throws(() => buildInstructionLoopFeedback({ findings: [f] }), /drifted/);
  assert.throws(() => projectInstructionLoopObservation({ goal: 'secret=abc' }), /public/);
  assert.throws(() => projectInstructionLoopObservation({ goal: 'public', raw_log: 'private' }), /arbitrary/);
});
test('recomputed checksums cannot smuggle arbitrary fields, identifiers, tags or a different selection', () => {
  const feedback = buildInstructionLoopFeedback({ findings: [finding(1)] });
  for (const mutate of [v => { v.candidates[0].raw_task_logs = 'PRIVATE MATERIAL'; },
    v => { v.candidates[0].evidence[0].raw = 'PRIVATE MATERIAL'; }, v => { v.tags = ['private user@example.test']; },
    v => { v.candidates[0].summary.correction = '/Users/private/secret'; }, v => { v.candidates[0].id = canonicalDigest('wrong'); }]) {
    const v = structuredClone(feedback); mutate(v); const { feedback_digest, ...body } = v;
    v.feedback_digest = canonicalDigest(body); assert.throws(() => projectInstructionLoopObservation(v));
  }
});
