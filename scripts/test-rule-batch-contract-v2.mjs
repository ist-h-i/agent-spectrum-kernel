import test from 'node:test';
import assert from 'node:assert/strict';
import * as reference from '../benchmarks/contracts/rule-batch/2.0.0/examples/reference.mjs';
import { mutants } from '../benchmarks/contracts/rule-batch/2.0.0/examples/mutants.mjs';
import { cases, runCases } from '../benchmarks/contracts/rule-batch/2.0.0/fixed/cases.mjs';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

test('contract-compliant example passes every fixed case', () => {
  const result = runCases(reference);
  assert.deepEqual(result.results.filter(r => r.status !== 'pass'), []);
  assert.equal(result.passed, cases.length);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  for (let i = 1; i <= 10; i++) assert.ok(cases.some(c => c.requirements.includes(`r${i}`)));
});

const witnesses = {
  replayVersionIncrease: 'replay-before-version',
  payloadAlwaysEqual: 'collision-value',
  signedZeroConflation: 'zero-negative-positive',
  droppedExpectedVersion: 'collision-version',
  droppedKey: 'collision-key',
  droppedValue: 'collision-value',
  droppedType: 'collision-number-string',
  droppedOp: 'collision-kind',
  droppedOrder: 'collision-order',
  partialCommitOnInvalid: 'operation-key-space-inside',
  unicodeBatchLeak: 'unicode-reject-set-true-212a',
  unicodeExistingKeyRewrite: 'unicode-store-preservation',
  unicodeExistingKeyRemoval: 'unicode-store-preservation',
  unicodeExistingValueRewrite: 'unicode-store-preservation',
  unicodeExistingValueRemoval: 'unicode-store-preservation',
  legacyUnicodeAliasBreak: 'unicode-single-alias',
};

for (const [id, api] of Object.entries(mutants)) test(`detects artificial fault: ${id}`, () => {
  assert.equal(typeof api.RuleService, 'function');
  const witness = cases.find(c => c.id === witnesses[id]);
  assert.ok(witness, `missing meaningful witness for ${id}`);
  // Paired positive guards against a verifier that rejects everything. Explicit
  // witnesses prevent an unrelated import/TypeError from qualifying a mutant.
  assert.doesNotThrow(() => witness.run(reference));
  assert.throws(() => witness.run(api), error =>
    error instanceof assert.AssertionError
    || (id === 'legacyUnicodeAliasBreak' && error instanceof reference.RuleValidationError));
});

test('the unchanged historical verifier accepts the compliant example in all 114 cases', t => {
  const root = mkdtempSync(join(tmpdir(), 'ask-rule-batch-positive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  const module = new URL('../benchmarks/contracts/rule-batch/2.0.0/examples/reference.mjs', import.meta.url).href;
  writeFileSync(join(root, 'src/index.mjs'), `export * from ${JSON.stringify(module)};\n`);
  const verifier = fileURLToPath(new URL('../benchmarks/contracts/rule-batch/2.0.0/fixed/legacy-verifier.v1.2.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(readFileSync(verifier)).digest('hex'),
    '0b7f9a24053b861e64069fdd107947d10e9544b40e9c943eac1cb959b8c4217c');
  const baseline = fileURLToPath(new URL('../benchmarks/contracts/rule-batch/2.0.0/fixed/legacy-baseline/', import.meta.url));
  const result = spawnSync(process.execPath, [verifier, root, baseline],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  const summary = rows.find(row => row.kind === 'summary');
  assert.equal(summary.total, 114);
  assert.equal(summary.passed, 114);
  assert.equal(summary.failed, 0);
});
