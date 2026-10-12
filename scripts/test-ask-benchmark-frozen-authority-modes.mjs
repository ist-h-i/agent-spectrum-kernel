import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { readStableWorkspaceInventory } from './ask-benchmark-evaluator-boundary.mjs';
import { canonicalDigest, stableCanonicalJson } from './ask-benchmark-materialize.mjs';

// Exercise the exact private constructor stage without adding a production
// export or invoking a constructor, grader, worker, model, or CLI. The original
// constructor's call to this function stays below the retained source check.
const sourceText = readFileSync(new URL('./ask-benchmark-evaluator-boundary.mjs', import.meta.url), 'utf8');
const start = sourceText.indexOf('function materializeVerifiedFrozenAuthorityWorkspace(');
const end = sourceText.indexOf('\nfunction verifiedFinalOutputBytesForPrivateEvaluation(', start);
assert.ok(start >= 0 && end > start);
const functionText = sourceText.slice(start, end);
assert.match(sourceText, /const frozenAuthorityWorkspace = materializeVerifiedFrozenAuthorityWorkspace\(\{ evaluationRoot, source: verifiedFrozenSource \}\);/u);
function constructorStage(copy = cpSync) {
  return runInNewContext(`(${functionText})`, { mkdtempSync, resolve, cpSync: copy, chmodSync, readStableWorkspaceInventory, canonicalDigest, stableCanonicalJson });
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ask-frozen-modes-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'source'), evaluationRoot = join(root, 'evaluation');
  mkdirSync(workspace); mkdirSync(evaluationRoot);
  mkdirSync(join(workspace, 'private')); mkdirSync(join(workspace, 'private/empty'));
  mkdirSync(join(workspace, 'scripts'));
  writeFileSync(join(workspace, 'private/data.txt'), 'retained evidence\n');
  writeFileSync(join(workspace, 'scripts/check.mjs'), 'export const inert = true;\n');
  chmodSync(join(workspace, 'private/data.txt'), 0o400);
  chmodSync(join(workspace, 'scripts/check.mjs'), 0o700);
  chmodSync(join(workspace, 'private/empty'), 0o700);
  chmodSync(join(workspace, 'private'), 0o700);
  chmodSync(join(workspace, 'scripts'), 0o710);
  chmodSync(workspace, 0o700);
  return { evaluationRoot, source: readStableWorkspaceInventory(workspace) };
}
test('original frozen constructor copy preserves restrictive directories, empty directories, executable and readonly files', t => {
  const input = fixture(t), priorUmask = process.umask();
  const result = constructorStage()(input);
  assert.deepEqual(result.portableEntries, input.source.portableEntries);
  assert.equal(result.digest, input.source.digest);
  assert.equal(result.rootIdentity.mode & 0o777, input.source.rootIdentity.mode & 0o777);
  assert.equal(process.umask(), priorUmask, 'constructor must not change the process umask');
  assert.equal(result.buffers.get('scripts/check.mjs').toString(), 'export const inert = true;\n');
});
test('mode restoration still rejects copied byte drift', t => {
  const input = fixture(t);
  const corruptCopy = (source, destination, options) => {
    cpSync(source, destination, options);
    chmodSync(join(destination, 'private/data.txt'), 0o600);
    writeFileSync(join(destination, 'private/data.txt'), 'changed evidence\n');
  };
  assert.throws(() => constructorStage(corruptCopy)(input), /verified frozen fixture metadata authority workspace is inconsistent/u);
});
test('mode restoration still rejects copied file type substitution', t => {
  const input = fixture(t);
  const corruptCopy = (source, destination, options) => {
    cpSync(source, destination, options);
    rmSync(join(destination, 'private/data.txt'));
    mkdirSync(join(destination, 'private/data.txt'));
  };
  assert.throws(() => constructorStage(corruptCopy)(input), /verified frozen fixture metadata authority workspace is inconsistent/u);
});
