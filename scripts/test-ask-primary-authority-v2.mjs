import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_PRIMARY_FIXTURE_IDS, PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { syntheticFocusedScope } from './test-helpers-primary-authority-v2.mjs';
import { finalizeMnBuildOptionUpdateSuccessorAuthority } from './ask-benchmark-mn-build-option-update-successor-authority.mjs';
import { generatePfPerformanceReviewArchive } from './ask-benchmark-pf-performance-review-archive.mjs';
import { generateMnDocConfigCorrectionReviewArchive } from './ask-benchmark-mn-doc-config-correction-review-archive.mjs';

test('performance archive uses the existing complete exact-head configuration boundary', () => {
  assert.throws(() => generatePfPerformanceReviewArchive(), /complete exact-head configuration/u);
});

test('doc successor archive keeps its legacy case layout and explicitly selects self-contained cases', () => {
  assert.throws(() => generateMnDocConfigCorrectionReviewArchive({ caseFormat: 'unknown-format' }), /case format is unknown/u);
  assert.throws(() => generateMnDocConfigCorrectionReviewArchive({ caseFormat: 'self_contained_v2' }), /complete exact-head configuration/u);
});

test('build successor: unknown profile rejects before filesystem/publication', () => {
  assert.throws(() => finalizeMnBuildOptionUpdateSuccessorAuthority({ root: '/not-a-real-primary24-source', resultProfileName: 'unknown-profile' }), /unknown build result profile/u);
});

const aliases = {
  'hi-authorization-exception': 'hi-authorization', 'hi-external-action-approval': 'hi-external-approval',
  'hi-financial-state-integrity': 'hi-financial', 'hi-versioned-migration-safety': 'hi-migration',
  'pf-api-pagination-behavior': 'pf-api-pagination', 'pf-ci-cache-flake': 'pf-ci-cache',
  'pf-data-schema-evolution': 'pf-data-schema', 'pf-frontend-async-state': 'pf-frontend-async',
  'pf-library-compat-upgrade': 'pf-library', 'pf-observability-redaction': 'pf-observability',
  'pf-performance-regression': 'pf-performance', 'pf-review-error-contract': 'pf-review-error',
};

for (const id of CANONICAL_PRIMARY_FIXTURE_IDS.filter(id => id !== 'mn-build-option-update')) {
  const module = await import(`./ask-benchmark-${aliases[id] ?? id}-authority.mjs`);
  const writers = Object.entries(module).filter(([name]) => /^write.*ProductionAuthority$/u.test(name));
  assert.equal(writers.length, 1, `${id}: existing production writer required`);
  const writer = writers[0][1];
  if (!PRIMARY_FIXTURE_IDS.includes(id)) test(`${id}: standalone static validator keeps private assets outside the repository`, () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const validator = Object.entries(module).find(([name]) => /^validate.*ProductionAuthority$/u.test(name))[1];
    assert.throws(() => validator({ root, privateRoot: join(root, 'benchmarks'), resourceAssetsOnly: true }), /private evaluator bundle must stay outside the repository/u);
  });
  test(`${id}: unknown profile rejects before filesystem/publication`, () => {
    assert.throws(() => writer({ root: '/not-a-real-primary24-source', resultProfileName: 'unknown-profile' }), /unknown.*result profile/u);
  });
  test(`${id}: static resource mode cannot accept execution boundaries`, () => {
    assert.throws(() => writer({ root: '/not-a-real-primary24-source', privateRoot: '/not-a-real-private-root',
      resourceAssetsOnly: true, boundaryRoots: {}, resultProfileName: 'requirement_scope_verification_v2' }), /resource-assets-only.*no execution boundary roots/u);
  });
}

test('all 23 production writers close new v2 resource identities without executing the evaluator', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-primary24-v2-static-'))), repository = join(area, 'source');
  t.after(() => rmSync(area, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16777216 });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git('clone', '--no-local', '--no-checkout', root, repository);
  const revision = git('-C', root, 'rev-parse', 'HEAD'); git('-C', repository, 'checkout', '--detach', revision);
  const { withPrimaryProcessingSourceBuild } = await import(pathToFileURL(join(repository, 'scripts/ask-primary-evaluation-scope.mjs')));
  const marker = join(area, 'unexpected-evaluator-start');
  for (const id of CANONICAL_PRIMARY_FIXTURE_IDS.filter(id => id !== 'mn-build-option-update')) {
    const privateRoot = join(area, id); mkdirSync(privateRoot);
    const module = await import(pathToFileURL(join(repository, `scripts/ask-benchmark-${aliases[id] ?? id}-authority.mjs`)));
    const writer = Object.entries(module).find(([name]) => /^write.*ProductionAuthority$/u.test(name))[1];
    const validator = Object.entries(module).find(([name]) => /^validate.*ProductionAuthority$/u.test(name))[1];
    for (const name of ['oracle.json', 'scope-boundaries.json', ...(id === 'mn-client-compatibility-fix' || id.startsWith('mp-') ? ['false-positive-boundaries.json'] : [])])
      writeFileSync(join(privateRoot, name), '{"synthetic_static_asset":true}\n');
    for (const name of ['rubric.md', 'human-instructions.md']) writeFileSync(join(privateRoot, name), 'Inert artificial static resource test. No admission.\n');
    if (id === 'mn-focused-regression-test') {
      const loader = Buffer.from('// Inert artificial resource. Never executed.\n');
      writeFileSync(join(privateRoot, 'authenticated-generic-loader.mjs'), loader);
      writeFileSync(join(privateRoot, 'scope-boundaries.json'), JSON.stringify(syntheticFocusedScope(loader)) + '\n');
    }
    writeFileSync(join(privateRoot, 'hidden-evaluator.mjs'), `import { writeFileSync } from 'node:fs';\nexport function evaluateCandidateSafe() { writeFileSync(${JSON.stringify(marker)}, 'unexpected'); throw new Error('inert static fixture'); }\n`);
    for (const name of ['dependency-graph.json', 'equivalent-solutions.json', 'evidence-removal-mutations.json', 'independence.json', 'private-evaluator-bundle.json']) writeFileSync(join(privateRoot, name), '{}\n');
    const fixtureRoot = join(repository, 'benchmarks/fixtures/checkpoint-b2', id);
    const before = Object.fromEntries(['input-manifest.json', 'verification-command-contract.json', 'requirement-record.json'].map(name => [name, readFileSync(join(fixtureRoot, name))]));
    withPrimaryProcessingSourceBuild({ root: repository, baseRevision: revision, commandEvidenceParserRevision: '1.10.0-primary-saved' }, () => {
      const generated = writer({ root: repository, privateRoot, evaluatorRevision: revision, generationDate: '2026-10-20', resourceAssetsOnly: true, resultProfileName: 'requirement_scope_verification_v2' });
      const checked = validator({ root: repository, privateRoot, resourceAssetsOnly: true });
      assert.equal(checked.evaluatorBundleDigest, generated.evaluatorBundleDigest);
      assert.equal(checked.validation_scope, 'resource_assets_only'); assert.equal(checked.execution_authority, false); assert.equal(checked.scoringReady, false);
    });
    for (const name of ['input-manifest.json', 'verification-command-contract.json']) assert.deepEqual(readFileSync(join(fixtureRoot, name)), before[name], `${id}: ${name}`);
    const requirements = JSON.parse(readFileSync(join(fixtureRoot, 'requirement-record.json')));
    assert.deepEqual(requirements.requirements, JSON.parse(before['requirement-record.json']).requirements, `${id}: task requirements and weights`);
    const output = JSON.parse(readFileSync(join(fixtureRoot, 'output-contract.json'))), freeze = JSON.parse(readFileSync(join(fixtureRoot, 'scoring-input-freeze-manifest.json')));
    assert.equal(output.result_profile.name, 'requirement_scope_verification_v2'); assert.deepEqual(freeze.result_profile, output.result_profile);
    assert.equal(existsSync(marker), false);
  }
});
