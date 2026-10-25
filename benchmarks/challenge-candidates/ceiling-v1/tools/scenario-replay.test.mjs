// Public transport logic test, not a container/security admission test.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { prepare, root } from './public-workspace.mjs';

test('the same submitted scenario check replays observations without loading implementation source', () => {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-replay-unit-'));
  const id = 'ch05-stream-window-revisions';
  try {
    const tester = resolve(parent, 'tester'), service = resolve(parent, 'service');
    prepare(id, tester); prepare(id, service);
    // This source is deliberately unusable: extraction/replay must not import it.
    writeFileSync(resolve(tester, 'src/processor.mjs'), `throw Error('tester must not execute implementation during replay');`);
    mkdirSync(resolve(tester, '.ceiling'));
    const modePath = resolve(tester, '.ceiling/scenario-mode.json');
    const command = ['--test', '--test-reporter=./harness/scenario-reporter.mjs', 'test/scenario-public.test.mjs'];
    const options = { cwd: tester, encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 15000 };
    writeFileSync(modePath, JSON.stringify({ mode: 'extract' }));
    const extracted = JSON.parse(execFileSync(process.execPath, command, options));
    assert.equal(extracted.passed, 1); assert.equal(extracted.scenarios.length, 1);
    const scenario = extracted.scenarios[0];
    const observed = JSON.parse(execFileSync(process.execPath, ['harness/scenario-worker.mjs'], {
      cwd: service, input: JSON.stringify({ program: scenario.program, transportNonce: 'public-control' }), encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 15000,
    }));
    assert.equal(observed.state, 'completed');
    writeFileSync(modePath, JSON.stringify({ mode: 'replay', observations: { [scenario.id]: observed } }));
    const replayed = JSON.parse(execFileSync(process.execPath, command, options));
    assert.equal(replayed.passed, 1); assert.equal(replayed.failed, 0);
    assert.deepEqual(replayed.scenarios, extracted.scenarios);
    // Altered public observations check the failure channel; this is not counted
    // as a semantic mutant or private-grader validation result.
    const altered = structuredClone(observed);
    for (const value of Object.values(altered.observations)) if (value?.outputs?.length) value.outputs[0].amountMinor = '0';
    writeFileSync(modePath, JSON.stringify({ mode: 'replay', observations: { [scenario.id]: altered } }));
    const rejected = spawnSync(process.execPath, command, options);
    assert.equal(rejected.status, 1);
    assert.ok(JSON.parse(rejected.stdout).failures.some(item => item.code === 'ERR_ASSERTION'));
    assert.match(readFileSync(resolve(tester, 'src/processor.mjs'), 'utf8'), /must not execute/u);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('mixed behavioral assertion and setup failure retain separate failure provenance', () => {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), 'ceiling-mixed-provenance-'));
  try {
    const path = resolve(parent, 'mixed.test.mjs');
    writeFileSync(path, `import { test, describe, before } from 'node:test';
      import assert from 'node:assert/strict';
      test('behavior assertion', () => assert.equal(1, 2));
      describe('setup failure', () => {
        before(() => { throw Error('setup did not complete'); });
        test('body must not run', () => {});
      });`);
    const result = spawnSync(process.execPath, ['--test', `--test-reporter=${resolve(root, 'runtime/scenario-reporter.mjs')}`, path], {
      cwd: parent, encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 15000,
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    const behavioralAssertion = failure => failure.type === 'testCodeFailure' && failure.code === 'ERR_ASSERTION';
    assert.ok(report.failures.some(behavioralAssertion), 'behavior assertion must remain observable');
    assert.ok(report.failures.some(failure => !behavioralAssertion(failure)), 'setup failure must remain observable');
    assert.equal(report.failures.every(behavioralAssertion), false, 'mixed failures cannot qualify as assertion-only detection');
    assert.ok(report.failures.every(failure => typeof failure.file === 'string' && Number.isInteger(failure.line)), 'independent review requires failure positions');
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
