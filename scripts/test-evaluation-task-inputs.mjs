import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { listEvaluationTasks } from './evaluation-task-catalog.mjs';
import { prepareEvaluationTaskInput } from './evaluation-task-inputs.mjs';

const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = bytes => `sha256:${hex(bytes)}`;
const entry = (path, body) => ({ path, bytes: Buffer.byteLength(body), sha256: hex(body) });

function scratch(t) {
  const path = mkdtempSync(join(realpathSync(tmpdir()), 'ask-evaluation-inputs-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('business preparation retains shared paths and selects the declared prompt', t => {
  const output = join(scratch(t), 'run');
  const task = listEvaluationTasks().find(row => row.id === 'ch02-report-operations');
  const report = prepareEvaluationTaskInput(task, output, { deliveryMode: 'goal_with_pr' });
  assert.equal(report.delivery_mode, 'goal_with_pr');
  assert.equal(report.task_file, join(report.workspace, task.input.task_path));
  assert.equal(report.prompt_file, join(report.working_directory, 'goal-pr.txt'));
  assert.ok(readFileSync(report.prompt_file, 'utf8').startsWith('/goal '));
  assert.ok(existsSync(join(report.working_directory, '../../common/operation-and-observation.md')));
  assert.ok(!existsSync(join(report.working_directory, 'prompt.txt')));
  assert.ok(!existsSync(join(report.working_directory, '../ch03-price-rollout/TASK.md')));
  assert.throws(() => prepareEvaluationTaskInput(task, join(output, 'wrong'), { deliveryMode: 'default' }), /mode is not registered/u);
});

test('staged preparation rejects extra or substituted initial inputs', t => {
  const path = scratch(t), root = join(path, 'source'), output = join(path, 'run');
  mkdirSync(root);
  writeFileSync(join(root, 'task.md'), 'stable');
  writeFileSync(join(root, 'later.md'), 'later');
  const manifestBytes = JSON.stringify({ kind: 'evaluation_input_manifest_v2', id: 'local-stage', version: 'test',
    modes: { default: { working_directory: '.', task_path: 'task.md', files: [entry('task.md', 'stable')] } } });
  writeFileSync(join(path, 'manifest.json'), manifestBytes);
  const task = { id: 'local-stage', input: { kind: 'staged', root: 'source', manifest: 'manifest.json',
    digest: digest(manifestBytes), task_path: 'task.md', version: 'test', delivery_modes: ['default'], default_delivery: 'default' } };
  const options = { checkoutRoot: path };
  assert.throws(() => prepareEvaluationTaskInput(task, output, options), /inventory changed/u);
  assert.ok(!existsSync(output));
  rmSync(join(root, 'later.md'));
  writeFileSync(join(root, 'task.md'), 'mutant');
  assert.throws(() => prepareEvaluationTaskInput(task, output, options), /digest changed/u);
  assert.ok(!existsSync(output));
  writeFileSync(join(root, 'task.md'), 'stable');
  const report = prepareEvaluationTaskInput(task, output, options);
  assert.equal(report.file_count, 1);
  assert.equal(readFileSync(report.task_file, 'utf8'), 'stable');
  assert.ok(!existsSync(join(report.workspace, 'later.md')));
});

test('private preparation copies only pinned inputs and protects them on disk', t => {
  const path = scratch(t), assetsRoot = join(path, 'assets'), assetPath = 'solver-inputs/synthetic-logistics';
  const source = join(assetsRoot, assetPath), output = join(path, 'run');
  mkdirSync(join(source, 'public'), { recursive: true });
  const taskPath = 'public/TASK.md', promptPath = 'prompt.txt', criteriaPath = 'public/acceptance.md';
  const version = 'test';
  const bare = JSON.stringify({ kind: 'evaluation_input_manifest_v2', id: 'synthetic-logistics', version,
    modes: { default: { working_directory: 'public', task_path: taskPath, prompt_path: promptPath,
      files: [entry(taskPath, 'synthetic task'), entry(criteriaPath, 'synthetic criteria'), entry(promptPath, 'synthetic prompt')] } } });
  const input = { kind: 'private', asset_path: assetPath, manifest: assetPath + '/input-manifest.json', digest: digest(bare),
    task_path: taskPath, version, delivery_modes: ['default'], default_delivery: 'default' };
  const assessment = { protected_criteria: { path: criteriaPath, digest: digest('synthetic criteria') } };
  const task = { id: 'synthetic-logistics', input, assessment };
  writeFileSync(join(assetsRoot, input.manifest), bare);
  writeFileSync(join(source, taskPath), 'synthetic task');
  writeFileSync(join(source, criteriaPath), 'synthetic criteria');
  writeFileSync(join(source, promptPath), 'different prompt');
  writeFileSync(join(source, 'owner-only.txt'), 'excluded');
  mkdirSync(join(assetsRoot, 'task-revisions/synthetic-logistics'), { recursive: true });
  writeFileSync(join(assetsRoot, 'task-revisions/synthetic-logistics/stage-2.md'), 'A synthetic protected stage.');
  assert.throws(() => prepareEvaluationTaskInput(task, output), /protected evaluation assets/u);
  assert.throws(() => prepareEvaluationTaskInput(task, output, { assetsRoot }), /digest changed/u);
  assert.ok(!existsSync(output));
  writeFileSync(join(source, promptPath), 'synthetic prompt');
  assert.throws(() => prepareEvaluationTaskInput({ ...task, assessment: { protected_criteria: { path: criteriaPath, digest: digest('other criteria') } } },
    output, { assetsRoot }), /protected acceptance pin/u);
  assert.ok(!existsSync(output));
  const report = prepareEvaluationTaskInput(task, output, { assetsRoot });
  assert.equal(report.file_count, 3);
  assert.equal(readFileSync(report.prompt_file, 'utf8'), 'synthetic prompt');
  assert.ok(!existsSync(join(report.workspace, 'owner-only.txt')));
  assert.ok(!existsSync(join(report.workspace, 'input-manifest.json')));
  assert.ok(!existsSync(join(report.workspace, 'stage-2.md')));
  assert.ok(!existsSync(join(report.workspace, 'task-revisions')));
  for (const name of [output, report.workspace, report.working_directory]) assert.equal(lstatSync(name).mode & 0o777, 0o700);
  for (const name of [report.task_file, report.prompt_file]) assert.equal(lstatSync(name).mode & 0o777, 0o600);
  assert.throws(() => prepareEvaluationTaskInput(task, output, { assetsRoot }), /already exist/u);
  const link = join(path, 'link');
  symlinkSync(assetsRoot, link);
  assert.throws(() => prepareEvaluationTaskInput(task, join(path, 'linked-run'), { assetsRoot: link }), /symlink/u);
  assert.throws(() => prepareEvaluationTaskInput(task, join(source, 'nested-run'), { assetsRoot }), /overlap/u);
});
