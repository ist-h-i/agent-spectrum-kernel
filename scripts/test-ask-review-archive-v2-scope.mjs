// Static scope controls with artificial metadata; never admission or execution.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { PRIMARY_PROCESSING_V7_SOURCE_PATHS } from './ask-primary-scoring-version.mjs';
import { activePrimaryProducer, primaryEvaluatorDependencyGraphParameters } from './ask-primary-evaluation-scope.mjs';
import { validateReviewArchiveProductionAuthority } from './ask-benchmark-review-archive-identity.mjs';
import { generateMnBuildOptionUpdateReviewArchive } from './ask-benchmark-mn-build-option-update-review-archive.mjs';
const fixtureId = 'mp-data-migration-handoff', sourceRevision = 'a'.repeat(40);
function fixture(t, profile = 'requirement_scope_verification_v2') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-archive-v2-scope-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, 'benchmarks/fixtures/checkpoint-b2', fixtureId); mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'output-contract.json'), JSON.stringify({ result_profile: { name: profile } }));
  writeFileSync(join(folder, 'evaluator-reference.json'), JSON.stringify({ evaluator_revision: sourceRevision }));
  const initialized = spawnSync('git', ['init', '--quiet', root], { encoding: 'utf8' }); assert.equal(initialized.status, 0, initialized.stderr);
  for (const path of PRIMARY_PROCESSING_V7_SOURCE_PATHS) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); cpSync(new URL('../' + path, import.meta.url), target); }
  return { root, fixtureId, sourceRevision };
}
const unscoped = () => assert.equal(primaryEvaluatorDependencyGraphParameters({ defaultParameters: false }), null);
test('legacy archive validation leaves its original unscoped interpretation intact', t => {
  const config = fixture(t, 'binary_scope_verification_v1');
  assert.equal(validateReviewArchiveProductionAuthority(config, () => { unscoped(); return 'legacy'; }), 'legacy'); unscoped();
});
test('v2 archive validation selects only a synchronous source scope and releases it', t => {
  const config = fixture(t);
  assert.equal(validateReviewArchiveProductionAuthority(config, () => {
    assert.equal(activePrimaryProducer(), false);
    assert.throws(() => primaryEvaluatorDependencyGraphParameters({ defaultParameters: false }), /primary_explicit_graph_parameters_refused/u);
    return 'static-resource';
  }), 'static-resource'); unscoped();
});
test('v2 archive source revision mismatch refuses before invoking validation', t => {
  const config = fixture(t); let called = false;
  assert.throws(() => validateReviewArchiveProductionAuthority({ ...config, sourceRevision: 'b'.repeat(40) }, () => called = true), /source revision differs/u);
  assert.equal(called, false); unscoped();
});
test('v2 archive validation errors release the scope without changing the original failure', t => {
  const config = fixture(t), error = new Error('artificial-validator-failure');
  assert.throws(() => validateReviewArchiveProductionAuthority(config, () => { throw error; }), value => value === error); unscoped();
});
test('v2 archive refuses asynchronous validation and detached scope reuse', t => {
  const config = fixture(t);
  assert.throws(() => validateReviewArchiveProductionAuthority(config, () => Promise.resolve('not-authority')), /must be synchronous/u); unscoped();
});
test('v2 archive refuses changed processing bytes without invoking validation', t => {
  const config = fixture(t), path = join(config.root, PRIMARY_PROCESSING_V7_SOURCE_PATHS[0]);
  writeFileSync(path, readFileSync(path, 'utf8') + '\n// artificial drift\n'); let called = false;
  assert.throws(() => validateReviewArchiveProductionAuthority(config, () => called = true), /processing_source_changed/u);
  assert.equal(called, false); unscoped();
});

test('build case archives reject output-parent symlinks into every source root before publication', t => {
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-build-case-archive-')));
  t.after(() => rmSync(area, { recursive: true, force: true }));
  const root = join(area, 'source'), privateRoot = join(area, 'private'), caseRoot = join(area, 'cases');
  for (const path of [root, privateRoot, caseRoot]) mkdirSync(path);
  writeFileSync(join(caseRoot, 'cases.json'), JSON.stringify({ fixture_id: 'mn-build-option-update', cases: [{ case_id: 'inert-artificial-case' }] }));
  for (const [index, source] of [root, privateRoot, caseRoot].entries()) {
    const alias = join(area, 'output-alias-' + index), outputPath = join(alias, 'must-not-exist.zip'); symlinkSync(source, alias, 'dir');
    assert.throws(() => generateMnBuildOptionUpdateReviewArchive({ root, privateRoot, caseRoot, outputPath, reviewedHead: sourceRevision }), /output must stay outside source roots/u);
    assert.equal(existsSync(outputPath), false);
  }
});
