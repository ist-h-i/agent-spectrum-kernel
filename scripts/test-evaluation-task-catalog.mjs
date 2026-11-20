import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { readEvaluationTaskRegistrations } from './evaluation-task-catalog.mjs';

const source = realpathSync(new URL('..', import.meta.url));
const cliOutput = (...args) => execFileSync(process.execPath, [
  join(source, 'scripts/practical-evaluation-cli.mjs'), ...args,
], { encoding: 'utf8' });
const cli = (...args) => JSON.parse(cliOutput(...args));

test('one selection entry lists the current primary, business and staged tasks', () => {
  const tasks = cli('task-list');
  const ids = tasks.map(task => task.id);
  const registration = readEvaluationTaskRegistrations();
  assert.equal(new Set(ids).size, 32);
  assert.equal(ids.length, 32);
  assert.deepEqual(ids, registration.tasks.map(task => task.id));
  assert.equal(tasks.filter(task => task.input.kind === 'primary').length, 24);
  assert.deepEqual(tasks.filter(task => task.input.kind !== 'primary').map(task => task.id), ['ch01-inventory-reservation-logistics',
    'ch02-report-operations', 'ch03-price-rollout', 'ch04-document-access',
    'ch05-sales-reconciliation', 'ch06-build-operations', 'rc01-shared-review-platform', 'ch08-growth-workspace']);
  assert.ok(tasks.every(task => task.title && task.domain && task.observations.length));
  assert.equal(new Set(tasks.map(task => task.catalog_id)).size, tasks.length);
  for (const task of tasks) {
    assert.match(task.catalog_id, /^ASK-\d{3,}$/u);
    assert.equal(task.primary_type, task.task_types[0]);
    assert.ok(task.labels.length && task.labels.every(label => registration.labels.includes(label)));
    assert.equal(task.assessment.calibration.github_repository_id, registration.assets.github_repository_id);
    assert.equal(task.assessment.calibration.revision, registration.assets.revision);
    if (task.input.kind === 'private') continue;
    assert.equal(task.input.manifest, `benchmarks/task-revisions/${task.id}/input-manifest.json`);
    const manifest = JSON.parse(readFileSync(join(source, task.input.manifest)));
    assert.equal(manifest.kind, 'evaluation_input_manifest_v2');
    assert.equal(manifest.id, task.id);
    assert.equal(manifest.version, task.input.version);
    assert.deepEqual(Object.keys(manifest.modes), task.input.delivery_modes);
  }

  const matches = cli('task-list', '--difficulty', 'medium_hard', '--type', 'review', '--skill', 'controlled-implementation');
  assert.deepEqual(matches.map(task => task.id), ['pf-observability-redaction']);
  assert.ok(matches[0].task_types.includes('implementation'));
  assert.ok(matches[0].observations.some(item => item.skills.includes('controlled-implementation') && item.observation));
  assert.ok(cli('task-list', '--difficulty', 'unassessed').some(task => task.id === 'ch02-report-operations'));
  assert.ok(cli('task-list', '--type', 'test').some(task => task.id === 'ch08-growth-workspace'));
  const staged = tasks.filter(task => task.input.kind === 'staged');
  for (const task of staged) assert.ok(existsSync(join(source, task.difficulty_source)), task.id);
  const logistics = tasks.find(task => task.input.kind === 'private');
  assert.match(logistics.input.archive_api_path, new RegExp(`^repositories/[0-9]+/tarball/${logistics.input.revision}$`, 'u'));
  const business = tasks.find(task => task.id === 'ch02-report-operations');
  assert.ok(business.assessment.public_criteria.some(ref => ref.path.endsWith('/contract.md')));
  assert.match(business.assessment.input_contract_digest, /^sha256:[a-f0-9]{64}$/u);
  assert.throws(() => cli('task-list', '--skill', 'not-a-skill'), /unknown skill/u);
});

test('operators select by stable catalog number, work type and all requested labels', () => {
  const label = cli('task-list', '--label', 'ui', '--type', 'review').map(task => task.catalog_id);
  assert.ok(label.includes('ASK-011') && label.includes('ASK-014') && label.includes('ASK-031'));
  const narrowed = cli('task-list', '--label', 'ui', '--label', 'accessibility', '--type', 'review');
  assert.ok(narrowed.some(task => task.id === 'mp-accessibility-interaction-review'));
  assert.ok(narrowed.every(task => task.labels.includes('accessibility') && task.labels.includes('ui')));
  assert.ok(!narrowed.some(task => task.catalog_id === 'ASK-014'));
  const text = cliOutput('task-list', '--id', 'ASK-012', '--format', 'table');
  assert.match(text, /Estimated difficulty/u);
  assert.match(text, /ASK-012/u);
  assert.doesNotMatch(text, /ASK-013/u);
  assert.throws(() => cli('task-list', '--label', 'not-a-label'), /unknown label/u);
  assert.throws(() => cli('task-list', '--id', 'ASK-000'), /unknown evaluation task/u);
});

test('measured scores stay bound to the tested input, scoring definition and protected revision', async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ask-difficulty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const registration = readEvaluationTaskRegistrations();
  const row = registration.tasks.find(task => task.id === 'mn-doc-config-correction');
  registration.tasks = [row];
  registration.model_studies = [];
  const taskRoot = join(root, row.input.root);
  mkdirSync(taskRoot, { recursive: true });
  for (const name of ['task.md', 'rubric.json', 'input-manifest.json']) {
    copyFileSync(join(source, row.input.root, name), join(taskRoot, name));
  }
  mkdirSync(join(root, 'scripts'));
  for (const name of ['evaluation-task-catalog.mjs', 'content-addressed-store.mjs']) {
    copyFileSync(join(source, 'scripts', name), join(root, 'scripts', name));
  }
  copyFileSync(join(source, 'manifest.json'), join(root, 'manifest.json'));
  const write = () => writeFileSync(join(root, 'benchmarks/evaluation-tasks.json'), JSON.stringify(registration));
  write();
  const { listEvaluationTasks } = await import(pathToFileURL(join(root, 'scripts/evaluation-task-catalog.mjs')));
  const [task] = listEvaluationTasks();
  const result = { task_id: task.id, input_version: task.input.version, input_digest: task.input.digest,
    assessment_digest: task.assessment.digest, maximum_points: 10, conditions: [{ condition: 'control', scores: [0, null, 6] }] };
  registration.model_studies.push({
    id: 'synthetic-validation', report: 'test fixture', report_digest: 'sha256:' + '0'.repeat(64),
    model: 'fixture', runtime: 'fixture', reasoning_effort: 'test', source_revision: '0'.repeat(40),
    protected_revision: registration.assets.revision, limitations: ['Contract test only.'], results: [result],
  });
  const observe = () => {
    write();
    return listEvaluationTasks()[0].difficulty_observations[0];
  };
  assert.equal(observe().edition, 'current');
  assert.deepEqual(observe().conditions[0], { condition: 'control', scores: [0, null, 6], trial_count: 3, scored_count: 2 });
  registration.assets.revision = '1'.repeat(40);
  assert.equal(observe().edition, 'previous_protected_revision');
  row.acceptance_files = [join(row.input.root, 'task.md')];
  assert.equal(observe().edition, 'previous_assessment');
  row.input.version += '-updated';
  assert.equal(observe().edition, 'previous_input');
  result.conditions[0].scores.push(11);
  assert.throws(observe, /invalid model scores/u);
});

test('every listed public task prepares independently through the selection CLI', () => {
  const sandbox = mkdtempSync(join(realpathSync(tmpdir()), 'ask-catalog-'));
  try {
    for (const task of cli('task-list').filter(task => task.input.kind !== 'private')) {
      const output = join(sandbox, task.id);
      const report = cli('task-prepare', '--id', task.catalog_id, '--root', output);
      assert.equal(report.task_id, task.id);
      assert.equal(report.model_calls, 0);
      assert.equal(report.input_manifest_digest, task.input.digest);
      assert.equal(report.assessment.digest, task.assessment.digest);
      assert.ok(existsSync(report.task_file), task.id);
      assert.ok(existsSync(report.prompt_file ?? report.task_file), task.id);
      if (task.input.kind === 'primary') assert.ok(existsSync(join(report.working_directory, 'package.json')), task.id);
      assert.ok(!existsSync(join(report.workspace, 'OPERATIONAL-UPDATE.md')), task.id);
      assert.ok(!existsSync(join(report.workspace, 'evaluation-preparation.json')), task.id);
      const prompt = readFileSync(report.prompt_file ?? report.task_file, 'utf8');
      assert.doesNotMatch(prompt, /sol-medium-20261120|difficulty_observations|ask_full_explicit_skill/u);
    }
    const goal = cli('task-prepare', '--id', 'ch02-report-operations', '--root', join(sandbox, 'goal'),
      '--delivery-mode', 'goal_with_pr');
    assert.match(readFileSync(goal.prompt_file, 'utf8'), /^\/goal/u);
    assert.ok(!existsSync(join(goal.working_directory, 'prompt.txt')));
    const rejected = join(sandbox, 'missing-private-source');
    assert.throws(() => cli('task-prepare', '--id', 'ch01-inventory-reservation-logistics', '--root', rejected),
      /assets-root|protected evaluation assets/u);
    assert.ok(!existsSync(rejected));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
