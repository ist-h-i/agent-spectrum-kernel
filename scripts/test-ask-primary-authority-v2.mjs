import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_PRIMARY_FIXTURE_IDS, PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeMnBuildOptionUpdateSuccessorAuthority } from './ask-benchmark-mn-build-option-update-successor-authority.mjs';
import { generatePfPerformanceReviewArchive } from './ask-benchmark-pf-performance-review-archive.mjs';

test('performance archive uses the existing complete exact-head configuration boundary', () => {
  assert.throws(() => generatePfPerformanceReviewArchive(), /complete exact-head configuration/u);
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
