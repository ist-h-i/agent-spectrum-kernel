import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readEvaluationTaskRegistrations } from '../../../../scripts/evaluation-task-catalog.mjs';

// These checks validate delivery assets, never candidate behavior or private scoring.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '../../..');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    assert.equal(lstatSync(path).isSymbolicLink(), false, `symlink: ${path}`);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function inputPath(base, task, path) {
  assert.equal(typeof path, 'string');
  assert.ok(path && !isAbsolute(path) && !path.includes('\\') && !path.includes('\0'));
  assert.ok(path.split('/').every(part => part && part !== '.' && part !== '..' && !part.includes(':')));
  assert.ok(path.startsWith('public/common/') || path.startsWith(`public/tasks/${task}/`), 'wrong input scope');
  let current = base;
  for (const part of path.split('/')) {
    current = join(current, part);
    assert.equal(lstatSync(current).isSymbolicLink(), false, 'symlink input');
  }
  assert.ok(realpathSync(current).startsWith(realpathSync(base) + sep));
  assert.ok(lstatSync(current).isFile());
  return current;
}

const catalog = json(join(root, 'catalog.json'));
const ids = ['ch02-report-operations', 'ch03-price-rollout', 'ch04-document-access', 'ch05-sales-reconciliation', 'ch06-build-operations'];
const registered = readEvaluationTaskRegistrations().tasks.filter(task => task.input.kind === 'business');
const manifests = id => json(join(source, 'benchmarks/task-revisions', id, 'input-manifest.json'));

test('the common catalog registers the five business tasks and their authoring contracts', () => {
  assert.deepEqual(catalog.tasks.map(task => task.id), ids);
  assert.deepEqual(registered.map(task => task.id), ids);
  assert.equal(catalog.task_count, 5);
  assert.equal(catalog.private_assessment_included, false);
  assert.equal(catalog.ready_for_measurement, false);
  assert.equal(catalog.difficulty_calibrated, false);
  assert.equal(catalog.model_trials, 0);
  for (const task of catalog.tasks) {
    assert.deepEqual(task.delivery_modes, ['one_shot', 'goal_with_pr']);
    assert.equal(new Set(task.requirements).size, 14);
    assert.equal(Object.hasOwn(task, 'input_manifest'), false);
    for (const field of ['task_path', 'roles_path', 'one_shot_prompt', 'goal_with_pr_prompt']) assert.ok(existsSync(join(root, task[field])));
  }
});

for (const task of catalog.tasks) {
  test(`${task.id}: both delivery modes bind complete public inputs by hash`, () => {
    const manifest = manifests(task.id);
    const registration = registered.find(row => row.id === task.id);
    assert.equal(manifest.kind, 'evaluation_input_manifest_v2');
    assert.equal(manifest.id, task.id);
    assert.equal(manifest.version, registration.input.version);
    assert.deepEqual(Object.keys(manifest.modes), ['one_shot', 'goal_with_pr']);
    for (const [mode, inventory] of Object.entries(manifest.modes)) {
      const {files: inputFiles, ...layout} = inventory;
      assert.deepEqual(layout, registration.input.modes[mode]);
      assert.equal(inventory.working_directory, `public/tasks/${task.id}`);
      assert.equal(inventory.task_path, task.task_path);
      assert.equal(dirname(join(root, task.task_path)), join(root, inventory.working_directory));
      const paths = inputFiles.map(row => row.path);
      assert.equal(new Set(paths).size, paths.length);
      assert.deepEqual(paths, [...paths].sort());
      assert.ok(paths.includes('public/common/operation-and-observation.md'));
      for (const row of inputFiles) {
        const bytes = readFileSync(inputPath(root, task.id, row.path));
        assert.equal(bytes.length, row.bytes);
        assert.equal(sha(bytes), row.sha256, row.path);
      }
    }
    const one = manifest.modes.one_shot.files.map(row => row.path);
    const goal = manifest.modes.goal_with_pr.files.map(row => row.path);
    assert.ok(one.includes(task.one_shot_prompt) && !one.includes(task.goal_with_pr_prompt));
    assert.ok(goal.includes(task.goal_with_pr_prompt) && !goal.includes(task.one_shot_prompt));
    assert.deepEqual(one.filter(path => path !== task.one_shot_prompt), goal.filter(path => path !== task.goal_with_pr_prompt));
    const actual = files(join(root, 'public/tasks', task.id)).map(path => relative(root, path).split(sep).join('/'));
    assert.deepEqual(new Set([...one, ...goal].filter(path => path.startsWith(`public/tasks/${task.id}/`))), new Set(actual));
    assert.ok(readFileSync(join(root, task.goal_with_pr_prompt), 'utf8').startsWith('/goal ' + readFileSync(join(root, task.one_shot_prompt), 'utf8').trim()));
  });

  test(`${task.id}: fixture principals, contracts and relative documentation are connected`, () => {
    const fixture = json(join(root, 'public/tasks', task.id, 'fixtures/example.json'));
    const actors = new Map(fixture.actors.map(actor => [actor.id, actor]));
    assert.equal(actors.size, fixture.actors.length);
    for (const grant of fixture.grants) {
      assert.equal(actors.get(grant.actor)?.tenant, grant.tenant);
      assert.ok(grant.operations.length && new Set(grant.operations).size === grant.operations.length);
    }
    const text = readFileSync(join(root, 'public/tasks', task.id, 'contract.md'), 'utf8') + readFileSync(join(root, 'public/common/operation-and-observation.md'), 'utf8');
    for (const requirement of task.requirements) assert.match(text, new RegExp(`\\b${requirement}\\b`));
    for (const path of files(join(root, 'public/tasks', task.id)).filter(path => path.endsWith('.md'))) {
      for (const [, link] of readFileSync(path, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
        assert.ok(!/^[a-z]+:/i.test(link), 'remote input link');
        const target = resolve(dirname(path), link);
        assert.ok(target.startsWith(join(root, 'public') + sep));
        assert.ok(lstatSync(target).isFile());
      }
    }
  });
}

test('published inventory contains only declared inputs and public delivery metadata', () => {
  const allowed = new Set(['README.md', 'catalog.json', 'tools/public-package.test.mjs']);
  for (const task of catalog.tasks) {
    for (const mode of Object.values(manifests(task.id).modes)) for (const row of mode.files) allowed.add(row.path);
  }
  assert.deepEqual(new Set(files(root).map(path => relative(root, path).split(sep).join('/'))), allowed);
});

test('input selection rejects traversal, cross-task, owner assets and symlink escapes', () => {
  for (const path of ['/tmp/x', '../private/x', 'public/common/../x', 'public/common\\x', 'public/tasks/ch01/x', 'private/GRADER.md']) assert.throws(() => inputPath(root, ids[0], path));
  const scratch = mkdtempSync(join(tmpdir(), 'ask-public-input-boundary-'));
  try {
    mkdirSync(join(scratch, 'public/common'), { recursive: true });
    writeFileSync(join(scratch, 'owner-only'), 'not an input');
    symlinkSync(join(scratch, 'owner-only'), join(scratch, 'public/common/linked'));
    assert.throws(() => inputPath(scratch, ids[0], 'public/common/linked'), /symlink input/);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

// Workflow authoring checks; these never execute or assess a submitted app.
test('workflows bind existing requirements and both delivery modes', () => {
  assert.equal(catalog.ready_for_test_cycle, true);
  const workflowIds = new Set();
  for (const task of catalog.tasks) {
    assert.equal(task.workflows.length, 3);
    const text = readFileSync(join(root, task.workflow_path), 'utf8');
    for (const flow of task.workflows) {
      assert.ok(!workflowIds.has(flow.id)); workflowIds.add(flow.id);
      assert.ok(flow.requirements.length >= 3);
      assert.ok(flow.requirements.every(id => task.requirements.includes(id)));
      assert.ok(text.includes(`## ${flow.id} `));
    }
    assert.ok(text.includes('担当・開始状態') && text.includes('外から確認する結果') && text.includes('禁止結果'));
    const manifest = manifests(task.id);
    for (const mode of Object.values(manifest.modes)) assert.ok(mode.files.some(row => row.path === task.workflow_path));
  }
  assert.equal(workflowIds.size, 15);
});

test('workflow edition preserves the declared original business contracts', () => {
  assert.equal(catalog.contract_origin.package, 'business-five-v2-workflows');
  assert.ok(catalog.contract_origin.unchanged_inputs.length >= 5);
  for (const row of catalog.contract_origin.unchanged_inputs) {
    assert.equal(sha(readFileSync(inputPath(root, ids.find(id => row.path.startsWith(`public/tasks/${id}/`)) ?? ids[0], row.path))), row.sha256);
  }
});


test('decision contracts are explicit and bound in both modes', () => {
  for (const task of catalog.tasks) {
    assert.ok(task.decision_requirements.length >= 5);
    assert.ok(task.decision_requirements.every(id => task.requirements.includes(id)));
    const text = readFileSync(join(root, task.decision_path), 'utf8');
    for (const id of task.decision_requirements) assert.ok(text.includes(id));
    const manifest = manifests(task.id);
    for (const mode of Object.values(manifest.modes)) assert.ok(mode.files.some(row => row.path === task.decision_path));
  }
});
