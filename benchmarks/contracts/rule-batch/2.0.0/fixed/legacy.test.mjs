import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const candidate = fileURLToPath(new URL('../../', import.meta.url));
const verifier = fileURLToPath(new URL('./legacy-verifier.v1.2.mjs', import.meta.url));
const baseline = fileURLToPath(new URL('./legacy-baseline/', import.meta.url));
const expected = JSON.parse(readFileSync(new URL('./legacy-case-ids.json', import.meta.url)));
const result = spawnSync(process.execPath, [verifier, candidate, baseline],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, shell: false });
let rows = [], parseError;
try { rows = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
catch (error) { parseError = error; }
const cases = rows.filter(row => row.kind === 'case');
test('historical v1.2 produces exactly its pinned 114 graded case records', () => {
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.ok(result.status === 0 || result.status === 1);
  assert.equal(parseError, undefined);
  assert.deepStrictEqual(cases.map(row => ({ id: row.id, requirement: `r${row.requirement}` })), expected);
  assert.equal(rows.filter(row => row.kind === 'summary').length, 1);
  const summary = rows.find(row => row.kind === 'summary');
  assert.equal(summary.total, 114);
  assert.equal(summary.failed, cases.filter(row => row.status === 'fail').length);
  assert.equal(summary.passed, cases.filter(row => row.status === 'pass').length);
  assert.equal(result.status, summary.failed ? 1 : 0);
});
for (const record of expected) test(`historical-v1.2/${record.id}`, () => {
  const row = cases.find(c => c.id === record.id);
  assert.ok(row, 'missing case execution evidence');
  assert.equal(row.status, 'pass', row.error?.message);
});
// v1.2's Kelvin observation remains an ungraded historical diagnostic. New
// graded Unicode/signed-zero cases live in contract.test.mjs, under the new ID.
