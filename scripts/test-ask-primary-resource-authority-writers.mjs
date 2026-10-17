// Explicit static resource generation only: isolated Git clone, inert synthetic
// private seed bytes, no run markers, evaluator subprocesses, models or start.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { prepareFrozenEvaluatorTestRoot } from './test-frozen-evaluator-fixture.mjs';
import { withPrimaryProcessingSourceBuild } from './ask-primary-evaluation-scope.mjs';
const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const ids = ['mp-ci-evidence-gap', 'mp-data-migration-handoff', 'mn-focused-regression-test', 'mp-accessibility-interaction-review',
  'mp-frontend-state-review', 'mp-iac-rollback-design', 'mp-performance-investigation', 'mn-doc-config-correction'];
const apis = await Promise.all(ids.map(async fixtureId => {
  const module = await import(`./ask-benchmark-${fixtureId}-authority.mjs`);
  return { fixtureId, writer: module[Object.keys(module).find(key => /^write.*ProductionAuthority$/u.test(key))],
    validator: module[Object.keys(module).find(key => /^validate.*ProductionAuthority$/u.test(key))] };
}));
for (const { fixtureId, writer, validator } of apis) {
  test(`${fixtureId}: static mode accepts only a boolean and refuses absent assets or supplied run boundaries`, () => {
    for (const api of [writer, validator]) {
      for (const resourceAssetsOnly of ['true', 1, null, {}]) assert.throws(() => api({ resourceAssetsOnly }), /resourceAssetsOnly must be a boolean/);
      assert.throws(() => api({ resourceAssetsOnly: true }), /private root and no execution boundary roots/);
      for (const boundaryRoots of [{}, { runDir: '/not-a-run' }, 'fake', []])
        assert.throws(() => api({ resourceAssetsOnly: true, privateRoot: '/not-assets', boundaryRoots }), /private root and no execution boundary roots/);
    }
    assert.throws(() => writer({ resourceAssetsOnly: true, privateRoot: '/not-assets' }), /private root/);
    assert.throws(() => writer({ privateRoot: '/not-assets' }), /private root/);
  });
}
const git = (root, ...args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16777216 });
  assert.equal(result.status, 0, `synthetic test Git command failed: ${result.stderr}`); return result.stdout.trim();
};
test('all authority modules retain default validation with their historical boundary and reject unavailable resource-only verification', t => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'ask-historical-resource-authority-'))), repository = join(parent, 'repository');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const cloned = spawnSync('git', ['clone', '--no-hardlinks', '--no-checkout', ROOT, repository], { encoding: 'utf8', maxBuffer: 16777216 });
  assert.equal(cloned.status, 0, cloned.stderr);
  git(repository, 'checkout', '--detach', git(ROOT, 'rev-parse', 'HEAD'));
  for (const fixtureId of ids) {
    const context = prepareFrozenEvaluatorTestRoot({ root: repository, fixtureId, testPath: 'scripts/test-ask-primary-resource-authority-writers.mjs' });
    try {
      // Project the exact frozen dependency closure, then test the working
      // authority module against it without resealing any evaluator identity.
      const authorityPath = `scripts/ask-benchmark-${fixtureId}-authority.mjs`;
      copyFileSync(join(ROOT, authorityPath), join(context.checkout, authorityPath));
      const privateRoot = join(parent, fixtureId); mkdirSync(privateRoot);
      const probe = `import assert from 'node:assert/strict';
const boundary = await import('./scripts/ask-benchmark-evaluator-boundary.mjs');
assert.equal(typeof boundary.verifyPrivateEvaluatorResourceAssets, 'undefined');
const module = await import(${JSON.stringify(`./${authorityPath}`)});
const writer = module[Object.keys(module).find(key => /^write.*ProductionAuthority$/u.test(key))];
const validator = module[Object.keys(module).find(key => /^validate.*ProductionAuthority$/u.test(key))];
assert.equal(validator({ root: process.cwd() }).fixtureId, ${JSON.stringify(fixtureId)});
assert.throws(() => validator({ root: process.cwd(), privateRoot: ${JSON.stringify(privateRoot)} }), /boundary roots/);
assert.throws(() => writer({ root: process.cwd(), privateRoot: ${JSON.stringify(privateRoot)}, evaluatorRevision: ${JSON.stringify(context.evidence.source_revision)}, generationDate: '2026-10-12' }), /complete.*boundary roots/);
for (const api of [writer, validator]) assert.throws(() => api({ root: process.cwd(), privateRoot: ${JSON.stringify(privateRoot)}, resourceAssetsOnly: true }), /resource-assets-only validation requires verifyPrivateEvaluatorResourceAssets/);
`;
      const before = git(context.checkout, 'status', '--porcelain');
      const checked = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: context.checkout, encoding: 'utf8', maxBuffer: 16777216, timeout: 60000 });
      assert.equal(checked.status, 0, `${fixtureId}: ${checked.error ?? checked.stderr}`);
      assert.equal(git(context.checkout, 'status', '--porcelain'), before, 'compatibility guards must not publish resources');
    } finally { context.dispose(); }
  }
});
for (const commandEvidenceParserRevision of [null, '1.5.0-primary-saved', '1.6.0-primary-saved', '1.7.0-primary-saved', '1.8.0-primary-saved']) test(`actual CI and doc writers publish statically verified pending resources (${commandEvidenceParserRevision ?? 'legacy'}); full checks remain required`, t => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'ask-resource-authority-'))), repository = join(parent, 'repository');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const cloned = spawnSync('git', ['clone', '--no-hardlinks', '--no-checkout', ROOT, repository], { encoding: 'utf8', maxBuffer: 16777216 });
  assert.equal(cloned.status, 0, cloned.stderr);
  const revision = git(ROOT, 'rev-parse', 'HEAD'); git(repository, 'checkout', '--detach', revision);
  assert.equal(existsSync(join(repository, '.git/objects/info/alternates')), false);
  const workerMarker = join(parent, 'worker-was-executed');
  for (const fixtureId of ['mp-ci-evidence-gap', 'mn-doc-config-correction']) {
    const { writer, validator } = apis.find(api => api.fixtureId === fixtureId), privateRoot = join(parent, fixtureId); mkdirSync(privateRoot);
    for (const name of ['oracle.json', 'scope-boundaries.json', 'false-positive-boundaries.json']) {
      if (fixtureId === 'mn-doc-config-correction' && name === 'false-positive-boundaries.json') continue;
      writeFileSync(join(privateRoot, name), '{"synthetic_resource_test":true}\n');
    }
    for (const name of ['rubric.md', 'human-instructions.md']) writeFileSync(join(privateRoot, name), 'Synthetic static resource test; no grading or admission.\n');
    writeFileSync(join(privateRoot, 'hidden-evaluator.mjs'), `import { writeFileSync } from 'node:fs';\nexport function evaluateCandidateSafe() { writeFileSync(${JSON.stringify(workerMarker)}, 'unexpected'); throw new Error('inert synthetic test evaluator'); }\n`);
    // The existing doc transaction requires destination files to exist. These
    // inert untrusted bootstrap targets are overwritten by generated identities.
    if (fixtureId === 'mn-doc-config-correction') for (const name of ['dependency-graph.json', 'equivalent-solutions.json', 'evidence-removal-mutations.json', 'independence.json', 'private-evaluator-bundle.json'])
      writeFileSync(join(privateRoot, name), '{}\n');
    const options = { root: repository, privateRoot, evaluatorRevision: revision, generationDate: '2026-10-12' };
    const context = callback => commandEvidenceParserRevision ? withPrimaryProcessingSourceBuild({ root: repository, baseRevision: revision, commandEvidenceParserRevision }, callback) : callback();
    const checkedWriter = options => context(() => writer(options)), checkedValidator = options => context(() => validator(options));
    assert.throws(() => checkedWriter(options), /complete.*boundary roots/);
    const generated = checkedWriter({ ...options, resourceAssetsOnly: true });
    assert.equal(generated.fixtureId, fixtureId); assert.equal(generated.validation_scope, 'resource_assets_only');
    assert.equal(generated.execution_authority, false); assert.equal(generated.scoringReady, false);
    assert.equal(generated.reviewStatus, 'pending_independent_review');
    const reference = JSON.parse(readFileSync(join(repository, 'benchmarks/fixtures/checkpoint-b2', fixtureId, 'evaluator-reference.json')));
    const graph = reference.evaluator_source_identity.dependency_graph;
    assert.equal(graph.entry_paths.includes('scripts/ask-review-target-requirement.mjs'), commandEvidenceParserRevision !== null);
    if (commandEvidenceParserRevision) {
      const selectedVersion = commandEvidenceParserRevision === '1.8.0-primary-saved' ? 'v5' : commandEvidenceParserRevision === '1.7.0-primary-saved' ? 'v4' : commandEvidenceParserRevision === '1.6.0-primary-saved' ? 'v3' : 'v2';
      for (const prefix of ['primary', 'primary-k2']) for (const version of ['v2', 'v3', 'v4', 'v5']) {
        const node = graph.node_inventory.find(node => node.path === `benchmarks/schemas/${prefix}-saved-${version}-portfolio-command-evidence.schema.json`);
        if (version === selectedVersion) assert.equal(node?.file_type, 'authority_data');
        else assert.equal(node, undefined);
      }
    }
    const checked = checkedValidator({ root: repository, privateRoot, resourceAssetsOnly: true });
    assert.equal(checked.evaluatorBundleDigest, generated.evaluatorBundleDigest);
    assert.throws(() => checkedValidator({ root: repository, privateRoot }), /boundary roots/);
    const boundaryRoots = Object.fromEntries(['materializedPath', 'selectionState', 'runDir', 'normalizedResultsPath'].map(key => {
      const path = join(parent, `${fixtureId}-${key}`); mkdirSync(path); return [key, path];
    }));
    assert.throws(() => checkedValidator({ root: repository, privateRoot, boundaryRoots }), /materialization.*manifest|marker|run.*identity|selection.*state/i);
    assert.throws(() => checkedValidator({ root: repository, privateRoot, boundaryRoots, resourceAssetsOnly: true }), /no execution boundary roots/);
    const oracle = join(privateRoot, 'oracle.json'), original = readFileSync(oracle);
    writeFileSync(oracle, 'changed synthetic oracle');
    assert.throws(() => checkedValidator({ root: repository, privateRoot, resourceAssetsOnly: true }), /asset digest/);
    writeFileSync(oracle, original);
    assert.equal(existsSync(workerMarker), false, 'static validation must never execute the evaluator');
    for (const path of Object.values(boundaryRoots)) {
      assert.equal(existsSync(join(path, 'materialization-manifest.json')), false);
      assert.equal(existsSync(join(path, 'run-identity.json')), false);
    }
  }
});
