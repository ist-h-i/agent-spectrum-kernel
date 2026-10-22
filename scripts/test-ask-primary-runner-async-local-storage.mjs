// Ordinary library compatibility through the original TEST sealed executor.
// Synthetic private modules only; no grading, model, start or ownership probe.
import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeMpCiEvidenceGapProductionAuthority } from './ask-benchmark-mp-ci-evidence-gap-authority.mjs';
import { createSealedEvaluatorExecutionForTest, executeSealedEvaluatorForTest, readEvaluatorAuthorityAnchorFromFreeze } from './ask-benchmark-evaluator-boundary.mjs';
import { comparisonHash } from './ask-user-comparison-prepare.mjs';
import { PF_PERFORMANCE_PRIVATE_BODY_HEADER } from './ask-benchmark-pf-performance-probe.mjs';
const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url))), fixtureBase = 'benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap';
const json = path => JSON.parse(readFileSync(path));
const git = (root, ...args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16777216 });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
};
const writable = path => { const stat = lstatSync(path); if (stat.isDirectory()) { chmodSync(path, 0o700); for (const name of readdirSync(path)) writable(join(path, name)); } else chmodSync(path, 0o600); };
function fixture(t) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'ask-runner-async-local-'))), root = join(parent, 'repository');
  t.after(() => { writable(parent); rmSync(parent, { recursive: true, force: true }); });
  const clone = spawnSync('git', ['clone', '--no-hardlinks', '--no-checkout', ROOT, root], { encoding: 'utf8', maxBuffer: 16777216 });
  assert.equal(clone.status, 0, clone.stderr); git(root, 'checkout', '--detach', git(ROOT, 'rev-parse', 'HEAD'));
  // Bind the actual working runner bytes in this isolated test Git repository.
  const currentSources = ['scripts/ask-benchmark-private-evaluator-runner.mjs', 'scripts/ask-primary-evaluation-grading.mjs', 'scripts/ask-primary-evaluation-private-grading.mjs', 'scripts/ask-benchmark-evaluator-boundary.mjs','scripts/ask-benchmark-pf-performance-probe.mjs','scripts/ask-primary-evaluation-scope.mjs'];
  for (const path of currentSources) cpSync(join(ROOT, path), join(root, path));
  git(root, 'add', ...currentSources);
  git(root, '-c', 'user.name=ASK synthetic test', '-c', 'user.email=ask-synthetic-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Synthetic AsyncLocalStorage runner source snapshot');
  const revision = git(root, 'rev-parse', 'HEAD'); assert.equal(existsSync(join(root, '.git/objects/info/alternates')), false);
  let next = 0;
  const run = (source,{performanceFixture=false,candidateMissing=false}={}) => {
    const index = ++next, privateRoot = join(parent, `private-${index}`), authorityRoot = join(parent, `authority-${index}`);
    mkdirSync(privateRoot); mkdirSync(authorityRoot);
    for (const name of ['oracle.json', 'scope-boundaries.json', 'false-positive-boundaries.json']) writeFileSync(join(privateRoot, name), '{"synthetic_standard_library_test":true}\n');
    for (const name of ['rubric.md', 'human-instructions.md']) writeFileSync(join(privateRoot, name), 'Synthetic standard library compatibility only.\n');
    writeFileSync(join(privateRoot, 'hidden-evaluator.mjs'), source);
    writeMpCiEvidenceGapProductionAuthority({ root, privateRoot, evaluatorRevision: revision, generationDate: '2026-10-12', resourceAssetsOnly: true });
    const manifest = json(join(privateRoot, 'private-evaluator-bundle.json')), hiddenAsset = manifest.asset_inventory.find(asset => asset.role === 'hidden_tests');
    const freezeManifestPath = join(root, fixtureBase, 'scoring-input-freeze-manifest.json');
    const externalAuthorityAnchor = readEvaluatorAuthorityAnchorFromFreeze({ root, freezeManifestPath, freezeManifestSourceDigest: comparisonHash(readFileSync(freezeManifestPath)) });
    const frozenWorkspace = join(parent, `frozen-${index}`), candidateWorkspace = join(parent, `candidate-${index}`), evaluationInputRoot = join(parent, `evidence-${index}`);
    for (const path of [frozenWorkspace, candidateWorkspace, evaluationInputRoot]) { mkdirSync(path); writeFileSync(join(path, 'input.txt'), 'synthetic unchanged input\n'); }
    if(performanceFixture)for(const workspace of [frozenWorkspace,candidateWorkspace]){
      mkdirSync(join(workspace,'src'));mkdirSync(join(workspace,'data'));
      if(!candidateMissing||workspace!==candidateWorkspace)writeFileSync(join(workspace,'src/event-lookup.mjs'),'export function lookupEvents(){return [];}\n');
      writeFileSync(join(workspace,'data/measurement-config.json'),'{"artificial_fixture":true}\n');
      mkdirSync(join(workspace,'reference'));mkdirSync(join(workspace,'scripts'));
      writeFileSync(join(workspace,'reference/scan-lookup.mjs'),'// inert artificial reference\n');
      writeFileSync(join(workspace,'scripts/generate-data.mjs'),'// inert artificial data\n');
    }
    const lineage = { run_instance_id: '11111111-1111-4111-8111-111111111111', case_id: `case-${String(index).padStart(16, "0")}-${"0".repeat(16)}`, attempt: '0001' };
    if(performanceFixture)lineage.fixture_id='pf-performance-regression';
    const execution = createSealedEvaluatorExecutionForTest({ root, privateEvaluationRoot: authorityRoot, privateRoot, hiddenAsset,
      frozenWorkspace, candidateWorkspace, evaluationInputRoot, evaluationLineage: lineage, evaluatorRevision: revision, externalAuthorityAnchor });
    return executeSealedEvaluatorForTest({ execution, externalAuthorityAnchor, repositoryRoot: root, normalized: { lineage }, label: 'synthetic standard library compatibility' });
  };
  return { run };
}
test('sealed TEST runner exposes only AsyncLocalStorage and preserves its async scope without parent context', t => {
  const f = fixture(t), parentScope = new AsyncLocalStorage();
  const result = parentScope.run('parent-only-context', () => f.run(`
import { AsyncLocalStorage } from 'node:async_hooks';
import * as namespace from 'node:async_hooks';
const scope = new AsyncLocalStorage();
export async function evaluateCandidateSafe() {
  const before = scope.getStore() ?? null;
  const propagated = await scope.run('worker-local-context', async () => { await Promise.resolve(); return scope.getStore(); });
  return { exports: Object.keys(namespace).sort(), before, propagated, after: scope.getStore() ?? null };
}
`));
  assert.deepEqual(result.firstFragment, { exports: ['AsyncLocalStorage'], before: null, propagated: 'worker-local-context', after: null });
  assert.deepEqual(result.firstFragment, result.secondFragment); assert.deepEqual(result.firstBytes, result.secondBytes);
  assert.equal(parentScope.getStore(), undefined);
});

test('sealed TEST controller selects only the explicit private performance route and gives worker sanitized unavailable state',t=>{
  const f=fixture(t);
  const body=`export function evaluateCandidateSafe(input){return {probe:input.privatePerformanceProbe??null};}`;
  assert.deepEqual(f.run(body).firstFragment,{probe:null});
  const result=f.run(PF_PERFORMANCE_PRIVATE_BODY_HEADER+body,{performanceFixture:true});
  assert.deepEqual(Object.keys(result.firstFragment.probe).sort(),['candidate_source_digest','probe_version','quality','reason','state']);
  assert.equal(result.firstFragment.probe.state,'unavailable');assert.equal(result.firstFragment.probe.quality,null);
  assert.equal(result.firstFragment.probe.reason,'private_probe_capture_unavailable');
  assert.deepEqual(result.firstFragment,result.secondFragment);
  const missing=f.run(PF_PERFORMANCE_PRIVATE_BODY_HEADER+body,{performanceFixture:true,candidateMissing:true});
  assert.equal(missing.firstFragment.probe.state,'unavailable');assert.equal(missing.firstFragment.probe.quality,null);
  assert.throws(()=>f.run(PF_PERFORMANCE_PRIVATE_BODY_HEADER+body),/fixture mismatch/);
});
test('sealed TEST runner keeps other async_hooks/module exports and unrelated unsupported builtins unavailable', t => {
  const f = fixture(t);
  for (const name of ['createHook', 'AsyncResource']) assert.throws(() => f.run(`import { ${name} } from 'node:async_hooks'; export function evaluateCandidateSafe() { return { unsupported: typeof ${name} }; }`), /does not provide an export named/);
  for (const name of ['createRequire', 'Module']) assert.throws(() => f.run(`import { ${name} } from 'node:module'; export function evaluateCandidateSafe() { return { unsupported: typeof ${name} }; }`), /does not provide an export named/);
  assert.throws(() => f.run("import { PerformanceObserver } from 'node:perf_hooks'; export function evaluateCandidateSafe() { return { unsupported: typeof PerformanceObserver }; }"), /does not provide an export named/);
  assert.throws(() => f.run("import { EventEmitter } from 'node:events'; export function evaluateCandidateSafe() { return { unsupported: typeof EventEmitter }; }"), /unapproved builtin: node:events/);
});
test('sealed TEST runner imports the existing scoring-contract through its verified private entry', t => {
  const f = fixture(t);
  const result = f.run(`
export async function evaluateCandidateSafe({ repositoryRoot }) {
  const contract = await import('file://' + repositoryRoot + '/scripts/ask-benchmark-scoring-contract.mjs');
  const namespace = await import('node:module');
  const clock = await import('node:perf_hooks');
  const before = clock.performance.now(), after = clock.performance.now();
  return { digest: contract.computeRequirementDigest({ synthetic_standard_library_contract: true }), exports_available: typeof contract.computeRequirementDigest === 'function',
    module_exports: Object.keys(namespace).sort(), known_builtin: namespace.isBuiltin('node:fs'), unknown_builtin: namespace.isBuiltin('synthetic-not-a-builtin'),
    clock_exports: Object.keys(clock).sort(), clock_methods: Object.keys(clock.performance).sort(), clock_frozen: Object.isFrozen(clock.performance),
    monotonic_clock: Number.isFinite(before) && Number.isFinite(after) && after >= before, unavailable_mark: typeof clock.performance.mark };
}
`);
  assert.equal(result.firstFragment.exports_available, true); assert.match(result.firstFragment.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(result.firstFragment.module_exports, ['isBuiltin']); assert.equal(result.firstFragment.known_builtin, true); assert.equal(result.firstFragment.unknown_builtin, false);
  assert.deepEqual(result.firstFragment.clock_exports, ['performance']); assert.deepEqual(result.firstFragment.clock_methods, ['now']);
  assert.equal(result.firstFragment.clock_frozen, true); assert.equal(result.firstFragment.monotonic_clock, true); assert.equal(result.firstFragment.unavailable_mark, 'undefined');
  assert.deepEqual(result.firstFragment, result.secondFragment);
});
