import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
  save(record);
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
