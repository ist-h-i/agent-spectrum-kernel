import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MN_CLIENT_COMPATIBILITY_FIXTURE_ROOT, validateMnClientCompatibilityFixInputClosure } from './ask-benchmark-mn-client-compatibility-fix.mjs';
import { validateMnClientCompatibilityFixProductionAuthority } from './ask-benchmark-mn-client-compatibility-fix-authority.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('client public input is closed, ordinary, and matches frozen catalog metadata', () => {
  const result = validateMnClientCompatibilityFixInputClosure({ root });
  assert.equal(result.fixtureId, 'mn-client-compatibility-fix');
  const catalog = JSON.parse(readFileSync(resolve(root, 'benchmarks/portfolio-catalog.json')));
  const expected = catalog.fixtures.find(f => f.fixture_id === result.fixtureId);
  assert.equal(expected.task_class, 'local_implementation');
  assert.equal(expected.domain, 'client_mobile');
  assert.equal(expected.difficulty, 'medium');
});

test('changed public bytes cannot reuse the input identity', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'ask-client-public-'));
  try {
    cpSync(resolve(root, MN_CLIENT_COMPATIBILITY_FIXTURE_ROOT), resolve(scratch, MN_CLIENT_COMPATIBILITY_FIXTURE_ROOT), { recursive: true });
    const target = resolve(scratch, MN_CLIENT_COMPATIBILITY_FIXTURE_ROOT, 'workspace/docs/client-support.md');
    writeFileSync(target, `${readFileSync(target, 'utf8')}\nChanged input.\n`);
    assert.throws(() => validateMnClientCompatibilityFixInputClosure({ root: scratch }), /inventory/u);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('actual frozen client production authority is valid and remains pending', () => {
  const result = validateMnClientCompatibilityFixProductionAuthority({ root });
  assert.equal(result.reviewStatus, 'pending_independent_review');
  assert.equal(result.scoringReady, false);
});
