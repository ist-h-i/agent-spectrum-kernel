import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const source = realpathSync(new URL('..', import.meta.url));
const cli = (...args) => JSON.parse(execFileSync(process.execPath, [
  join(source, 'scripts/practical-evaluation-cli.mjs'), ...args,
], { encoding: 'utf8' }));

test('one selection entry lists the current primary, business and staged tasks', () => {
  const tasks = cli('task-list');
  const ids = tasks.map(task => task.id);
  const primary = JSON.parse(readFileSync(join(source, 'benchmarks/portfolio-catalog.json')))
    .fixtures.filter(row => row.fixture_role === 'primary').map(row => row.fixture_id);
  assert.equal(new Set(ids).size, 32);
  assert.equal(ids.length, 32);
  assert.deepEqual(new Set(ids), new Set([...primary, 'ch01-inventory-reservation-logistics',
    'ch02-report-operations', 'ch03-price-rollout', 'ch04-document-access',
    'ch05-sales-reconciliation', 'ch06-build-operations', 'rc01-shared-review-platform', 'ch08-growth-workspace']));
  assert.ok(tasks.every(task => task.title && task.domain && task.observations.length));

  const matches = cli('task-list', '--difficulty', 'medium_hard', '--type', 'review', '--skill', 'controlled-implementation');
  assert.deepEqual(matches.map(task => task.id), ['pf-observability-redaction']);
  assert.ok(matches[0].task_types.includes('implementation'));
  assert.ok(matches[0].observations.some(item => item.skills.includes('controlled-implementation') && item.observation));
  assert.ok(cli('task-list', '--difficulty', 'unassessed').some(task => task.id === 'ch02-report-operations'));
  assert.throws(() => cli('task-list', '--skill', 'not-a-skill'), /unknown skill/u);
});

test('every listed public task prepares independently through the selection CLI', () => {
  const sandbox = mkdtempSync(join(realpathSync(tmpdir()), 'ask-catalog-'));
  try {
    for (const task of cli('task-list').filter(task => task.input.kind !== 'private')) {
      const output = join(sandbox, task.id);
      const report = cli('task-prepare', '--id', task.id, '--root', output);
      assert.equal(report.task_id, task.id);
      assert.equal(report.model_calls, 0);
      assert.equal(report.input_manifest_digest, task.input.digest);
      assert.equal(report.assessment.digest, task.assessment.digest);
      assert.ok(existsSync(report.task_file), task.id);
      assert.ok(existsSync(report.prompt_file ?? report.task_file), task.id);
      assert.ok(!existsSync(join(report.workspace, 'OPERATIONAL-UPDATE.md')), task.id);
      assert.ok(!existsSync(join(report.workspace, 'evaluation-preparation.json')), task.id);
    }
    const goal = cli('task-prepare', '--id', 'ch02-report-operations', '--root', join(sandbox, 'goal'),
      '--delivery-mode', 'goal_with_pr');
    assert.match(readFileSync(goal.prompt_file, 'utf8'), /^\/goal/u);
    assert.ok(!existsSync(join(goal.working_directory, 'prompt.txt')));
    const rejected = join(sandbox, 'missing-private-source');
    assert.throws(() => cli('task-prepare', '--id', 'ch01-inventory-reservation-logistics', '--root', rejected),
      /logistics-source/u);
    assert.ok(!existsSync(rejected));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
