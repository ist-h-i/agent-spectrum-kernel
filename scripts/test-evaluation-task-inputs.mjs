import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareEvaluationTaskInput } from './evaluation-task-inputs.mjs';

const sourceRoot = join(import.meta.dirname, '..');
const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = bytes => `sha256:${hex(bytes)}`;

function scratch(t) {
  const path = mkdtempSync(join(realpathSync(tmpdir()), 'ask-evaluation-inputs-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('business preparation retains shared paths and selects the declared prompt', t => {
  const output = join(scratch(t), 'run');
  const root = join(sourceRoot, 'benchmarks/challenge-candidates/business-five-v3-decisions');
  const catalog = JSON.parse(readFileSync(join(root, 'catalog.json')));
  const entry = catalog.tasks[0];
  const manifest = entry.input_manifest;
  const input = { kind: 'business', root, manifest, digest: digest(readFileSync(join(root, manifest))),
    task_path: entry.task_path, prompts: { one_shot: entry.one_shot_prompt, goal_with_pr: entry.goal_with_pr_prompt }, version: catalog.version };
  const report = prepareEvaluationTaskInput({ id: entry.id, input }, output, { deliveryMode: 'goal_with_pr' });
  assert.equal(report.delivery_mode, 'goal_with_pr');
  assert.equal(report.task_file, join(report.workspace, entry.task_path));
  assert.equal(report.prompt_file, join(report.workspace, entry.goal_with_pr_prompt));
  assert.ok(readFileSync(report.prompt_file, 'utf8').startsWith('/goal '));
  assert.ok(existsSync(join(report.working_directory, '../../common/operation-and-observation.md')));
  assert.ok(!existsSync(join(report.workspace, entry.one_shot_prompt)));
  assert.ok(!existsSync(join(report.workspace, catalog.tasks[1].task_path)));
});

test('staged preparation rejects extra or substituted initial inputs', t => {
  const path = scratch(t), root = join(path, 'source'), output = join(path, 'run');
  mkdirSync(root);
  writeFileSync(join(root, 'task.md'), 'stable');
  writeFileSync(join(root, 'later.md'), 'later');
  const manifest = join(path, 'manifest.json');
  const manifestBytes = JSON.stringify({ fixture_id: 'local-stage', files: [{ path: 'task.md', sha256: hex('stable'), bytes: 6 }] });
  writeFileSync(manifest, manifestBytes);
  const task = { id: 'local-stage', input: { kind: 'staged', root, manifest, digest: digest(manifestBytes), task_path: 'task.md' } };
  assert.throws(() => prepareEvaluationTaskInput(task, output), /inventory changed/u);
  assert.ok(!existsSync(output));
  rmSync(join(root, 'later.md'));
  writeFileSync(join(root, 'task.md'), 'mutant');
  assert.throws(() => prepareEvaluationTaskInput(task, output), /digest changed/u);
  assert.ok(!existsSync(output));
  writeFileSync(join(root, 'task.md'), 'stable');
  const report = prepareEvaluationTaskInput(task, output);
  assert.equal(report.file_count, 1);
  assert.equal(readFileSync(report.task_file, 'utf8'), 'stable');
  assert.ok(!existsSync(join(report.workspace, 'later.md')));
});

test('private preparation copies only pinned inputs and protects them on disk', t => {
  const path = scratch(t), source = join(path, 'source'), output = join(path, 'run');
  mkdirSync(join(source, 'public'), { recursive: true });
  const bare = JSON.stringify({ files: [{ path: 'TASK.md', sha256: hex('synthetic task') },
    { path: 'acceptance.md', sha256: hex('synthetic criteria') }] });
  const input = { kind: 'private', manifest: 'public-manifest.json', digest: digest(bare),
    task_path: 'public/TASK.md', prompt_path: 'prompt.txt', prompt_digest: digest('synthetic prompt') };
  const assessment = { path: 'public/acceptance.md', digest: digest('synthetic criteria') };
  const task = { id: 'synthetic-logistics', input, assessment };
  writeFileSync(join(source, input.manifest), bare);
  writeFileSync(join(source, input.task_path), 'synthetic task');
  writeFileSync(join(source, assessment.path), 'synthetic criteria');
  writeFileSync(join(source, input.prompt_path), 'different prompt');
  writeFileSync(join(source, 'owner-only.txt'), 'excluded');
  assert.throws(() => prepareEvaluationTaskInput(task, output), /logistics source/u);
  assert.throws(() => prepareEvaluationTaskInput(task, output, { logisticsSource: source }), /digest changed/u);
  assert.ok(!existsSync(output));
  writeFileSync(join(source, input.prompt_path), 'synthetic prompt');
  assert.throws(() => prepareEvaluationTaskInput({ ...task, assessment: { ...assessment, digest: digest('other criteria') } },
    output, { logisticsSource: source }), /acceptance criteria/u);
  assert.ok(!existsSync(output));
  const report = prepareEvaluationTaskInput(task, output, { logisticsSource: source });
  assert.equal(report.file_count, 3);
  assert.equal(readFileSync(report.prompt_file, 'utf8'), 'synthetic prompt');
  assert.ok(!existsSync(join(report.workspace, 'owner-only.txt')));
  assert.ok(!existsSync(join(report.workspace, input.manifest)));
  for (const name of [output, report.workspace, report.working_directory]) assert.equal(lstatSync(name).mode & 0o777, 0o700);
  for (const name of [report.task_file, report.prompt_file]) assert.equal(lstatSync(name).mode & 0o777, 0o600);
  assert.throws(() => prepareEvaluationTaskInput(task, output, { logisticsSource: source }), /already exist/u);
  const link = join(path, 'link');
  symlinkSync(source, link);
  assert.throws(() => prepareEvaluationTaskInput(task, join(path, 'linked-run'), { logisticsSource: link }), /symlink/u);
  assert.throws(() => prepareEvaluationTaskInput(task, join(source, 'nested-run'), { logisticsSource: source }), /overlap/u);
});
