import assert from 'node:assert/strict';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys, assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { listEvaluationTasks } from './evaluation-task-catalog.mjs';
import { readPrimaryRevision } from './evaluation-task-inputs.mjs';

const boundedRead = (path, label) => readStableFile(path, label, 256 * 1024 * 1024);
const json = (path, label) => parseJsonRejectDuplicateKeys(boundedRead(path, label).bytes.toString('utf8'), label);
const safePath = value => typeof value === 'string' && !/[:\\\x00]/u.test(value)
  && value.split('/').every(part => part && part !== '.' && part !== '..');

function inventory(root) {
  const files = new Map();
  function visit(directory, prefix) {
    for (const name of readdirSync(directory).sort()) {
      if (name === '.git') continue;
      const relative = prefix + name, path = join(directory, name), stat = lstatSync(path);
      assert.ok(safePath(relative) && !stat.isSymbolicLink(), 'submission requires regular relative file paths');
      if (stat.isDirectory()) visit(path, `${relative}/`);
      else files.set(relative, boundedRead(path, 'submission file').rawByteDigest);
    }
  }
  visit(root, '');
  return files;
}

function fixedChanges(task, workspace, current) {
  const { files, editable } = readPrimaryRevision(task.id, task.input);
  const allowed = new Set(editable), basePaths = new Set(files.map(file => file.path));
  const changes = [];
  for (const { path, bytes } of files) {
    if (allowed.has(path)) continue;
    if (!current.has(path)) { changes.push({ path, change: 'removed' }); continue; }
    const actual = boundedRead(join(workspace, path), 'fixed candidate input').bytes;
    if (bytes.equals(actual)) continue;
    if (allowed.has(`${path}#json-block`)) {
      const outside = content => {
        const blocks = [...content.matchAll(/^```json[^\S\n]*\r?\n[\s\S]*?^```[^\S\n]*(?=\n|$)/gmu)];
        return blocks.length === 1 ? content.slice(0, blocks[0].index) + content.slice(blocks[0].index + blocks[0][0].length) : null;
      };
      const before = outside(bytes.toString('utf8'));
      if (before !== null && before === outside(actual.toString('utf8'))) continue;
    }
    changes.push({ path, change: 'modified' });
  }
  for (const path of current.keys()) if (!basePaths.has(path) && !allowed.has(path)) changes.push({ path, change: 'added' });
  return changes;
}

export function inspectEvaluationSubmission(root) {
  const directory = resolve(root);
  assertNoSymlinkPathSegments(directory, 'evaluation root');
  const preparation = json(join(directory, 'evaluation-preparation.json'), 'evaluation preparation');
  const task = listEvaluationTasks().find(row => row.id === preparation.task_id);
  assert.ok(task, 'unknown prepared task');
  assert.deepEqual(preparation.input, task.input, 'prepared input is from another version');
  assert.deepEqual(preparation.assessment, task.assessment, 'prepared assessment is from another version');
  const workspace = join(realpathSync(directory), 'workspace');
  assert.equal(preparation.workspace, workspace, 'preparation workspace changed');
  assertNoSymlinkPathSegments(workspace, 'submission workspace');
  const files = inventory(workspace);
  const subject = { task_id: task.id, input_digest: task.input.digest, assessment_digest: task.assessment.digest,
    submission_digest: canonicalDigest([...files].map(([path, digest]) => ({ path, digest }))) };
  return { subject, file_count: files.size, fixed_input_changes: task.input.kind === 'primary' ? fixedChanges(task, workspace, files) : null,
    scoring_scope: task.assessment.scoring_scope, criteria: task.observations };
}

function checkedEvidence(directory, refs) {
  assert.ok(Array.isArray(refs) && refs.length, 'observed judgments require saved evidence files');
  for (const ref of refs) {
    assert.ok(safePath(ref.path), 'invalid evidence path');
    assert.equal(boundedRead(join(directory, ref.path), 'assessment evidence').rawByteDigest, ref.digest, 'assessment evidence changed');
  }
  return refs;
}

// Arithmetic over an independent assessor's observations. Does not infer semantic or UI success.
export function scoreEvaluationSubmission(root, recordPath) {
  const { subject, criteria, scoring_scope, fixed_input_changes } = inspectEvaluationSubmission(root);
  const path = resolve(recordPath), record = json(path, 'assessor record');
  assert.deepEqual(record.subject, subject, 'assessor record is for a different submission or version');
  assert.ok(Array.isArray(record.items), 'assessor items must be an array');
  const judgments = new Map(record.items.map(item => [item.criterion_id, item]));
  assert.equal(judgments.size, record.items.length, 'duplicate criterion judgment');
  const ids = new Set(criteria.map(item => item.criterion_id));
  assert.ok([...judgments.keys()].every(id => ids.has(id)), 'unknown criterion judgment');
  const results = criteria.map(({ criterion_id, points: maximum, group }) => {
    const item = judgments.get(criterion_id);
    const reason = item?.reason ?? (item ? '' : 'No observation supplied.');
    assert.ok(typeof reason === 'string' && reason.trim(), 'a judgment needs its observation or missing evidence');
    if (item) assert.ok(item.points === null || (Number.isInteger(item.points) && item.points >= 0 && item.points <= maximum), 'points outside criterion range');
    const points = item?.points ?? null;
    const evidence = points === null && !item?.evidence?.length ? [] : checkedEvidence(dirname(path), item.evidence);
    return { criterion_id, group: group ?? 'task', maximum, points, status: points === null ? 'unobserved' : 'observed', reason, evidence };
  });
  const groups = {};
  for (const group of new Set(results.map(row => row.group))) {
    const items = results.filter(row => row.group === group);
    const missing = items.filter(row => row.points === null).length;
    const confirmed = items.reduce((sum, row) => sum + (row.points ?? 0), 0);
    groups[group] = { maximum: items.reduce((sum, row) => sum + row.maximum, 0), confirmed_points: confirmed,
      points: missing ? null : confirmed, unobserved: missing };
  }
  const critical = record.critical_violations ?? [];
  assert.ok(Array.isArray(critical), 'critical violations must be an array');
  for (const entry of critical) {
    assert.ok(typeof entry.impact === 'string' && entry.impact.trim(), 'critical violation requires observed impact');
    checkedEvidence(dirname(path), entry.evidence);
  }
  return { subject, scoring_scope, groups, results, fixed_input_changes, critical_violations: critical, model_calls: 0 };
}
