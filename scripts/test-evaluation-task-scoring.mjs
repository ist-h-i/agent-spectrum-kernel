import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectEvaluationSubmission, scoreEvaluationSubmission } from './evaluation-task-scoring.mjs';

function trial(t, id) {
  const sandbox = mkdtempSync(join(realpathSync(tmpdir()), 'ask-revision-scoring-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const root = join(sandbox, 'trial');
  const prepared = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, 'practical-evaluation-cli.mjs'),
    'task-prepare', '--id', id, '--root', root], { encoding: 'utf8' }));
  const recordPath = join(sandbox, 'judgments.json');
  const save = record => writeFileSync(recordPath, JSON.stringify(record));
  return { sandbox, root, prepared, recordPath, save };
}

test('current primary prompt and score are bound to the submitted bytes and observed evidence', t => {
  const { sandbox, root, prepared, recordPath, save } = trial(t, 'mn-build-option-update');
  const prompt = readFileSync(prepared.task_file, 'utf8');
  assert.match(prompt, /## Scoring \(10 points\)/u);
  assert.doesNotMatch(prompt, /sha256|controlled-implementation|scope-control|test-first-verification/u);
  const snapshot = inspectEvaluationSubmission(root);
  assert.deepEqual(snapshot.fixed_input_changes, []);
  const evidence = Buffer.from('Synthetic assessor observation.');
  const ref = { path: 'observation.txt', digest: `sha256:${createHash('sha256').update(evidence).digest('hex')}` };
  writeFileSync(join(sandbox, ref.path), evidence);
  const item = { criterion_id: snapshot.criteria[0].criterion_id, points: 0, reason: 'Observed during fixture verification.', evidence: [ref] };
  const record = { subject: snapshot.subject, items: [item] };
  save(record);
  const score = scoreEvaluationSubmission(root, recordPath);
  assert.equal(score.groups.task.points, null);
  assert.equal(score.groups.task.unobserved, snapshot.criteria.length - 1);
  assert.equal(score.results[0].points, 0);
  assert.equal(score.results[1].points, null);
  save({ ...record, items: [item, item] });
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /duplicate criterion/u);
  save({ ...record, items: [{ ...item, criterion_id: 'outside-rubric' }] });
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /unknown criterion/u);
  save({ ...record, items: [{ ...item, evidence: [] }] });
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /saved evidence/u);
  const reportItem = { ...item, criterion_id: 'unit-result', points: 1 };
  save({ ...record, items: [reportItem] });
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /final answer is required/u);
  mkdirSync(join(root, 'delivery'));
  writeFileSync(join(root, 'delivery/answer.md'), 'Observed one check only.');
  const withDelivery = {subject: inspectEvaluationSubmission(root).subject, items: [reportItem]};
  save(withDelivery);
  assert.equal(scoreEvaluationSubmission(root, recordPath).results.find(r => r.criterion_id === 'unit-result').points, 1);
  writeFileSync(join(root, 'delivery/answer.md'), 'Claimed compilation and distribution.');
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /different submission/u);
  const revisedDelivery = inspectEvaluationSubmission(root).subject;
  save({subject: revisedDelivery, items: [item]});
  writeFileSync(join(sandbox, ref.path), 'different evidence');
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /evidence changed/u);
  const editable = join(prepared.working_directory, 'build.config.json');
  writeFileSync(editable, readFileSync(editable, 'utf8') + '\n');
  assert.deepEqual(inspectEvaluationSubmission(root).fixed_input_changes, []);
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /different submission/u);
  const fixed = join(prepared.working_directory, 'package.json');
  writeFileSync(fixed, readFileSync(fixed, 'utf8') + '\n');
  assert.deepEqual(inspectEvaluationSubmission(root).fixed_input_changes, [{ path: 'workspace/package.json', change: 'modified' }]);
});

test('business diagnostics keep separate product and submission points', t => {
  const { root, recordPath, save } = trial(t, 'ch02-report-operations');
  const { subject } = inspectEvaluationSubmission(root);
  save({ subject, items: [] });
  const score = scoreEvaluationSubmission(root, recordPath);
  assert.equal(score.scoring_scope, 'supplemental');
  assert.deepEqual(Object.keys(score.groups).sort(), ['product', 'submission']);
  assert.equal(score.groups.product.points, null);
  assert.equal(score.groups.submission.points, null);
  assert.ok(!Object.hasOwn(score, 'quality_score'));
});


test('the allowed JSON example retains its fences and location in the guide', t => {
  const {root, prepared} = trial(t, 'mn-doc-config-correction');
  const guide = join(prepared.working_directory, 'docs/worker-retries.md');
  const before = readFileSync(guide, 'utf8');
  const block = /^```json[^\n]*\n[\s\S]*?^```[^\n]*/mu.exec(before)[0];
  writeFileSync(guide, before.replace(block, block.replace('{','{ ')));
  assert.deepEqual(inspectEvaluationSubmission(root).fixed_input_changes, []);
  writeFileSync(guide, before.replace(block,'') + block);
  assert.deepEqual(inspectEvaluationSubmission(root).fixed_input_changes, [{path:'workspace/docs/worker-retries.md',change:'modified'}]);
});


test('unexecuted staged preparation cannot receive product or reassessment credit', t => {
  const {root, recordPath, save} = trial(t, 'ch08-growth-workspace');
  const {subject, criteria} = inspectEvaluationSubmission(root);
  assert.equal(subject.stage_handoff_digest, null);
  save({subject, items:[{criterion_id:criteria[0].criterion_id, points:0, reason:'No independent stage record.'}]});
  assert.throws(() => scoreEvaluationSubmission(root, recordPath), /staged score handoff/u);
  save({subject, items:[]});
  assert.equal(scoreEvaluationSubmission(root, recordPath).groups.submission.points, null);
});


test('additional claims outside a closed workspace schema require the submitted final record', t => {
  for (const [id, axis] of [['pf-observability-redaction','signal-evidence'],['hi-versioned-migration-safety','recovery-proof']]) {
    const {root, recordPath, save} = trial(t, id);
    const {subject} = inspectEvaluationSubmission(root);
    save({subject, items:[{criterion_id:axis, points:1, reason:'Assessor observation.'}]});
    assert.throws(() => scoreEvaluationSubmission(root, recordPath), /submitted final answer/u);
    save({subject, items:[]});
    assert.equal(scoreEvaluationSubmission(root, recordPath).results.find(item => item.criterion_id === axis).status, 'unobserved');
  }
});
