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
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 35);
  assert.deepEqual(ids, registration.tasks.map(task => task.id));
  assert.ok(tasks.filter(task => task.input.kind === 'primary').length >= 27);
  assert.deepEqual(tasks.filter(task => task.input.kind !== 'primary').map(task => task.id), ['ch01-inventory-reservation-logistics',
    'ch02-report-operations', 'ch03-price-rollout', 'ch04-document-access',
    'ch05-sales-reconciliation', 'ch06-build-operations', 'rc01-shared-review-platform', 'ch08-growth-workspace']);
  assert.ok(tasks.every(task => task.title && task.domain && task.observations.length));
  assert.equal(new Set(tasks.map(task => task.catalog_id)).size, tasks.length);
  const byNumber = new Map(tasks.map(task => [task.catalog_id, task]));
  for (const [number, slug, estimate] of [
    ['ASK-003', 'hi-financial-state-integrity', 'hard'],
    ['ASK-023', 'pf-performance-regression', 'hard'],
    ['ASK-033', 'implementation-timeline-restore', 'expert'],
    ['ASK-034', 'implementation-workspace-upgrade', 'expert'],
    ['ASK-035', 'implementation-clearing-cutover', 'expert'],
  ]) {
    assert.equal(byNumber.get(number)?.id, slug);
    assert.equal(byNumber.get(number)?.difficulty, estimate);
  }
  const transfer = byNumber.get('ASK-003');
  assert.equal(transfer.primary_type, 'investigation');
  assert.ok(transfer.observations.some(item => item.criterion_id === 'previous-inputs' && item.points === 2));
  assert.ok(transfer.observations.some(item => item.criterion_id === 'submitted-check' && item.points === 2 && item.requires_delivery));
  const clearing = byNumber.get('ASK-035');
  assert.equal(clearing.primary_type, 'implementation');
  assert.deepEqual(clearing.observations.map(item => item.criterion_id), ['teller', 'settlement', 'delivery', 'statements', 'continuity']);
  for (const task of tasks) {
    assert.match(task.catalog_id, /^ASK-\d{3,}$/u);
    assert.equal(task.primary_type, task.task_types[0]);
    assert.ok(task.labels.length && task.labels.every(label => registration.labels.includes(label)));
    assert.equal(task.assessment.calibration.github_repository_id, registration.assets.github_repository_id);
    const row = registration.tasks.find(row => row.id === task.id);
    assert.equal(task.assessment.calibration.revision, row.protected_revision ?? registration.assets.revision);
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
  const absent = ['task-list', '--model', 'unregistered-test-model', '--effort', 'max', '--condition', 'test', '--score-range', '40-60'];
  assert.deepEqual(cli(...absent), []);
  assert.doesNotMatch(cliOutput(...absent, '--format', 'table'), /ASK-\d+/u);
  assert.throws(() => cli('task-list', '--score-range', '60-40'), /--score-range/u);
});

async function isolatedScoreCatalog(t) {
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
  return { root, registration, row, write, listEvaluationTasks, task };
}

test('measured scores stay bound to the tested input, scoring definition and protected revision', async t => {
  const { root, registration, row, write, listEvaluationTasks, task } = await isolatedScoreCatalog(t);
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
  const results = registration.model_studies[0].results;
  results.push({ ...result, score_group: 'task' });
  assert.throws(observe, /duplicate study task and score group/u);
  results.pop();
  for (const [key, value] of [['model', 'different-model'], ['reasoning_effort', 'max'], ['id', 'another-study'], ['protected_revision', 'a'.repeat(40)]]) {
    result[key] = value;
    assert.throws(observe, /unexpected model result field/u);
    delete result[key];
  }
  result.conditions[0].median_percent = 100;
  assert.throws(observe, /unexpected model condition field/u);
  delete result.conditions[0].median_percent;
  result.maximum_points = 100;
  result.conditions[0].scores = [50];
  assert.throws(observe, /maximum must match the registered rubric group/u);
  result.maximum_points = 10;
  result.conditions[0].scores = [0, null, 6];
  registration.assets.revision = '1'.repeat(40);
  assert.equal(observe().edition, 'previous_protected_revision');
  row.protected_revision = registration.model_studies[0].protected_revision;
  assert.equal(observe().edition, 'current');
  row.protected_revision = 'invalid';
  assert.throws(observe, /invalid protected revision/u);
  delete row.protected_revision;
  result.score_group = 'product';
  assert.throws(observe, /maximum must match the registered rubric group/u);
  delete result.score_group;
  row.acceptance_files = [join(row.input.root, 'task.md')];
  assert.equal(observe().edition, 'previous_assessment');
  row.input.version += '-updated';
  assert.equal(observe().edition, 'previous_input');
  result.conditions[0].scores.push(11);
  assert.throws(observe, /invalid model scores/u);

  const staged = readEvaluationTaskRegistrations().tasks.find(task => task.id === 'ch08-growth-workspace');
  registration.tasks = [staged];
  const files = [`benchmarks/task-revisions/${staged.id}/input-manifest.json`, `benchmarks/task-revisions/${staged.id}/rubric.json`,
    join(staged.input.root, 'task.md'), ...staged.acceptance_files];
  for (const path of files) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    copyFileSync(join(source, path), join(root, path));
  }
  const [study] = registration.model_studies;
  registration.model_studies = [];
  write();
  const [challenge] = listEvaluationTasks();
  study.protected_revision = registration.assets.revision;
  study.results = [{task_id: challenge.id, input_version: challenge.input.version, input_digest: challenge.input.digest,
    assessment_digest: challenge.assessment.digest, score_group: 'challenge', maximum_points: 100,
    conditions: [{condition: 'control', scores: [50.25]}, {condition: 'paired-decimals', scores: [0.6, 1.2]}]}];
  registration.model_studies = [study];
  assert.equal(observe().edition, 'current');
  const product = { ...study.results[0], score_group: 'product', maximum_points: 6, conditions: [{ condition: 'control', scores: [3] }] };
  const submission = { ...product, score_group: 'submission', maximum_points: 4, conditions: [{ condition: 'control', scores: [1] }] };
  study.results.push(product, submission);
  write();
  for (const [range, expected] of [['50-50', 'product'], ['50.25-50.25', 'challenge'], ['25-25', 'submission']]) {
    const [match] = listEvaluationTasks({ scoreRange: range });
    assert.deepEqual(match.difficulty_observations.map(row => row.score_group), [expected]);
    assert.equal(match.difficulty_observations[0].id, study.id);
  }
  const paired = scoreRange => listEvaluationTasks({ condition: 'paired-decimals', scoreRange });
  assert.equal(paired('0.9-0.9')[0].difficulty_observations[0].conditions[0].median_percent, 0.9);
  assert.deepEqual(paired('0-0.8999999999999999'), []);
  assert.deepEqual(paired('0.9000000000000001-100'), []);
  assert.deepEqual(paired('0.90000000000000001-1'), []);
  assert.throws(() => paired('100.000000000000001-100.000000000000001'), /--score-range/u);
  study.results.push({ ...submission });
  assert.throws(observe, /duplicate study task and score group/u);
  study.results = [study.results[0]];
  study.results[0].score_group = 'product';
  study.results[0].conditions = [{ condition: 'control', scores: [50] }];
  assert.throws(observe, /maximum must match the registered rubric group/u);
});

test('empirical selection compares medians within current scored conditions and retains raw samples', async t => {
  const { registration, write, listEvaluationTasks, task } = await isolatedScoreCatalog(t);
  const result = {
    task_id: task.id, input_version: task.input.version, input_digest: task.input.digest,
    assessment_digest: task.assessment.digest, maximum_points: 10,
    conditions: [
      { condition: 'automatic', scores: [8, null, 2] },
      { condition: 'manual', scores: [10, 0, 10] },
      { condition: 'missing', scores: [null] },
      { condition: 'low', scores: [0] },
    ],
  };
  const study = {
    id: 'current', report: 'test fixture', report_digest: 'sha256:' + '0'.repeat(64),
    model: 'A', runtime: 'fixture', reasoning_effort: 'max', source_revision: '0'.repeat(40),
    protected_revision: registration.assets.revision, limitations: ['Contract test only.'], results: [result],
  };
  registration.model_studies = [
    study, { ...study, id: 'other-model', model: 'B' }, { ...study, id: 'other-effort', reasoning_effort: 'medium' },
    { ...study, id: 'prior-input', results: [{ ...result, input_version: 'earlier' }] },
    { ...study, id: 'prior-scoring', results: [{ ...result, assessment_digest: 'sha256:' + 'f'.repeat(64) }] },
    { ...study, id: 'prior-assets', protected_revision: 'a'.repeat(40) },
  ];
  write();
  const select = options => listEvaluationTasks({ model: 'A', effort: 'max', ...options });
  const [match] = select({ scoreRange: '50-50' });
  assert.deepEqual(match.difficulty_observations.map(study => study.id), ['current']);
  assert.deepEqual(match.difficulty_observations[0].conditions, [{
    condition: 'automatic', scores: [8, null, 2], trial_count: 3, scored_count: 2, median_percent: 50,
  }]);
  assert.equal(select({ scoreRange: '49.99-50', condition: 'automatic' }).length, 1);
  assert.equal(select({ scoreRange: '50-50.01', condition: 'automatic' }).length, 1);
  assert.equal(select({ scoreRange: '0-0', condition: 'low' }).length, 1);
  assert.equal(select({ scoreRange: '100-100', condition: 'manual' }).length, 1);
  assert.deepEqual(select({ scoreRange: '40-60', condition: 'manual' }), []);
  assert.deepEqual(select({ condition: 'missing' }), []);
  assert.deepEqual(select({ model: 'unseen' }), []);
  assert.deepEqual(select({ effort: 'unseen' }), []);
  assert.equal(listEvaluationTasks()[0].difficulty_observations.length, 6);
  assert.equal(listEvaluationTasks()[0].difficulty_observations[0].conditions.length, 4);
  for (const scoreRange of ['60-40', '0-101', '-5-10', '50', 'x-60']) {
    assert.throws(() => select({ scoreRange }), /--score-range/u);
  }
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
