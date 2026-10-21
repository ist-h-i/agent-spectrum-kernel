// Independent synthetic source construction. No private assets or worker starts.
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as scope from './ask-primary-evaluation-scope.mjs';
import { createHash } from 'node:crypto';
import { EVALUATOR_RUNTIME_AUTHORITY_PATHS, EVALUATOR_REPOSITORY_DESCRIPTOR_PATH, evaluatorAuthorityPathsForFixture, validateSealedRepositoryAuthorityBytes, deriveEvaluatorDependencyGraph, validateEvaluatorSourceIdentity } from './ask-benchmark-evaluator-boundary.mjs';
import { canonicalDigest } from './ask-benchmark-materialize.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const helper = 'scripts/ask-review-target-requirement.mjs';
const schemas = ['benchmarks/schemas/primary-saved-v2-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v2-portfolio-command-evidence.schema.json'];
let parent, root, revision;
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
before(() => {
  parent = realpathSync(mkdtempSync(join(tmpdir(), 'primary-processing-source-'))); root = join(parent, 'source');
  execFileSync('git', ['clone', '--no-hardlinks', '--no-checkout', ROOT, root], { stdio: 'pipe' });
  git(root, ['checkout', '--detach', git(ROOT, ['rev-parse', 'HEAD'])]);
  // Exercise the current working implementation in a separately committed source.
  // Copy only tracked public repository files, never an external private tree.
  const paths = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of paths) { mkdirSync(dirname(join(root, path)), { recursive: true }); cpSync(join(ROOT, path), join(root, path)); }
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.name=ASK synthetic source', '-c', 'user.email=synthetic-source@invalid', 'commit', '--allow-empty', '-m', 'Synthetic current processing source']);
  revision = git(root, ['rev-parse', 'HEAD']);
});
after(() => { if (parent) rmSync(parent, { recursive: true, force: true }); });

test('production processing entrypoints initialize independently in a fresh process', () => {
  // A shared test module can accidentally initialize the circular producer /
  // scope / version imports in a favorable order. Application callers must be
  // able to import each entry first, without preparation or worker dispatch.
  for (const [name, exported] of [
    ['ask-primary-scoring-version.mjs', 'readPrimaryScoringVersion'],
    ['ask-primary-evaluation-scope.mjs', 'withPrimaryProcessingSourceBuild'],
    ['ask-primary-evaluation-producer.mjs', 'inspectPrimaryEvaluationSource'],
    ['ask-primary-evaluation-private-grading.mjs', 'preflightPrimaryEvaluationGradingResources'],
    ['ask-primary-evaluation-grading.mjs', 'createPrimaryEvaluationGradingAdapter'],
    ['ask-primary-saved-scoring.mjs', 'preparePrimarySavedScoring'],
  ]) {
    const script = `const api = await import(${JSON.stringify(new URL(name, import.meta.url).href)}); if (typeof api[${JSON.stringify(exported)}] !== 'function') throw new Error('entry export missing');`;
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, stdio: 'pipe' });
  }
});

test('explicit source-only build closes the helper and additive schemas without changing defaults', () => {
  const old = deriveEvaluatorDependencyGraph({ root, baseRevision: revision });
  assert.equal(old.entry_paths.includes(helper), false);
  const graph = scope.withPrimaryProcessingSourceBuild({ root, baseRevision: revision }, () => {
    assert.equal(scope.activePrimaryProducer(), false);
    assert.equal(scope.primaryAdapterSourceDigest(), null);
    const path = '/example/benchmarks/schemas/portfolio-command-evidence.schema.json';
    assert.equal(scope.primaryGradingSchemaPath(path), path);
    const fresh = deriveEvaluatorDependencyGraph({ root, baseRevision: revision });
    assert.deepEqual(fresh.entry_paths, [...old.entry_paths, helper].sort());
    assert.ok(fresh.edge_inventory.some(edge => edge.kind === 'private_entry_import' && edge.to === helper));
    for (const path of schemas) assert.ok(fresh.node_inventory.some(node => node.path === path && node.file_type === 'authority_data'));
    const files = fresh.node_inventory.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
    const identity = { base_git_revision: revision, source_tree_digest: canonicalDigest(files),
      generator_source_digest: 'sha256:' + '1'.repeat(64), source_files: files, dependency_graph: fresh };
    assert.deepEqual(validateEvaluatorSourceIdentity({ root, identity, expectedRevision: revision }), identity);
    return fresh;
  });
  assert.notDeepEqual(graph, old);
  assert.deepEqual(deriveEvaluatorDependencyGraph({ root, baseRevision: revision }), old);
});

for (const [commandEvidenceParserRevision, version] of [['1.6.0-primary-saved', 'v3'], ['1.7.0-primary-saved', 'v4'], ['1.8.0-primary-saved', 'v5'], ['1.9.0-primary-saved', 'v6'], ['1.10.0-primary-saved', 'v7']]) test(`AC-CLOSURE explicit ${commandEvidenceParserRevision} source construction selects only saved-${version} schemas without authority`, () => {
  const selected = { root, baseRevision: revision, commandEvidenceParserRevision };
  const old = deriveEvaluatorDependencyGraph({ root, baseRevision: revision });
  scope.withPrimaryProcessingSourceBuild(selected, () => {
    const graph = deriveEvaluatorDependencyGraph({ root, baseRevision: revision });
    assert.deepEqual(graph.entry_paths, [...old.entry_paths, helper].sort());
    for (const path of schemas) {
      assert.equal(graph.node_inventory.some(node => node.path === path), false);
      assert.equal(graph.node_inventory.find(node => node.path === path.replace('saved-v2-', `saved-${version}-`)).file_type, 'authority_data');
      for (const other of ['v2', 'v3', 'v4', 'v5', 'v6', 'v7'].filter(other => other !== version)) assert.equal(graph.node_inventory.some(node => node.path === path.replace('saved-v2-', `saved-${other}-`)), false);
    }
    if (version === 'v7') for (const prefix of ['primary', 'primary-k2']) assert.equal(graph.node_inventory.find(node => node.path === `benchmarks/schemas/${prefix}-saved-v7-evaluator-result-envelope.schema.json`)?.file_type, 'authority_data');
    assert.equal(scope.activePrimaryProducer(), false);
    assert.equal(scope.primaryAdapterSourceDigest(), null);
    assert.throws(() => scope.withPrimaryEvaluationProducer({}, () => {}), /source_build_no_producer_authority/u);
  });
  assert.deepEqual(deriveEvaluatorDependencyGraph({ root, baseRevision: revision }), old);
  let entered = false;
  assert.throws(() => scope.withPrimaryProcessingSourceBuild({ ...selected, commandEvidenceParserRevision: 'future' }, () => { entered = true; }), /unknown primary processing command revision/u);
  assert.equal(entered, false);
});

test('source-only build refuses root/revision changes, explicit graph injection and producer entry', () => {
  scope.withPrimaryProcessingSourceBuild({ root, baseRevision: revision }, () => {
    assert.throws(() => deriveEvaluatorDependencyGraph({ root: parent, baseRevision: revision }), /root_changed/u);
    assert.throws(() => deriveEvaluatorDependencyGraph({ root, baseRevision: '0'.repeat(40) }), /revision_changed/u);
    assert.throws(() => deriveEvaluatorDependencyGraph({ root, baseRevision: revision, entryPaths: [helper] }), /explicit_graph_parameters/u);
    assert.throws(() => scope.withPrimaryEvaluationProducer({ recordRoot: '/not-an-input', externalDigest: 'sha256:' + '0'.repeat(64) }, () => {}), /source_build.*producer|processing_build.*producer/u);
    assert.throws(() => scope.withPrimaryProcessingSourceBuild({ root, baseRevision: revision }, () => {}), /nested_scope/u);
  });
});

test('source-only construction accepts its writers linked staging worktree and refuses an unrelated clone', () => {
  const stage = join(parent, 'writer-stage'), unrelated = join(parent, 'unrelated-source');
  git(root, ['worktree', 'add', '--detach', stage, revision]);
  execFileSync('git', ['clone', '--no-hardlinks', root, unrelated], { stdio: 'pipe' });
  git(unrelated, ['checkout', '--detach', revision]);
  const ancestorAlias = join(parent, 'os-ancestor-alias'), finalAlias = join(parent, 'final-root-alias'), unregistered = join(parent, 'unregistered-root');
  symlinkSync(parent, ancestorAlias, 'dir'); symlinkSync(stage, finalAlias, 'dir'); mkdirSync(unregistered);
  scope.withPrimaryProcessingSourceBuild({ root, baseRevision: revision }, () => {
    assert.equal(deriveEvaluatorDependencyGraph({ root: stage, baseRevision: revision }).entry_paths.includes(helper), true);
    assert.equal(deriveEvaluatorDependencyGraph({ root: join(ancestorAlias, 'writer-stage'), baseRevision: revision }).entry_paths.includes(helper), true);
    assert.throws(() => deriveEvaluatorDependencyGraph({ root: finalAlias, baseRevision: revision }), /root_changed/u);
    assert.throws(() => deriveEvaluatorDependencyGraph({ root: unrelated, baseRevision: revision }), /root_changed/u);
    for (const gitDirectory of [join(root, '.git'), git(stage, ['rev-parse', '--absolute-git-dir'])]) {
      writeFileSync(join(unregistered, '.git'), `gitdir: ${gitDirectory}\n`);
      assert.throws(() => deriveEvaluatorDependencyGraph({ root: unregistered, baseRevision: revision }), /root_changed/u);
    }
    git(stage, ['-c', 'user.name=ASK synthetic stage', '-c', 'user.email=synthetic-source@invalid', 'commit', '--allow-empty', '-m', 'Different staging revision']);
    assert.throws(() => deriveEvaluatorDependencyGraph({ root: stage, baseRevision: revision }), /root_changed/u);
  });
});

test('async source construction has isolated lifetime and cannot retain a later graph scope', async () => {
  let late;
  await scope.withPrimaryProcessingSourceBuild({ root, baseRevision: revision }, async () => {
    await Promise.resolve();
    assert.equal(deriveEvaluatorDependencyGraph({ root, baseRevision: revision }).entry_paths.includes(helper), true);
    late = new Promise(resolve => setTimeout(() => resolve(deriveEvaluatorDependencyGraph({ root, baseRevision: revision })), 0));
  });
  assert.equal((await late).entry_paths.includes(helper), false);
  assert.equal(scope.activePrimaryProducer(), false);
  assert.equal(readFileSync(join(root, helper)).equals(readFileSync(join(ROOT, helper))), true);
});

// Bytes-only public validation. No private bundle or evaluator is opened.
test('v1 through v8 source graphs pass sealed byte validation with exact known file types', () => {
  const hash = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
  const fixtureId = 'mn-build-option-update';
  const fixturePaths = evaluatorAuthorityPathsForFixture(fixtureId).fixturePaths;
  const manifestPath = fixturePaths.find(path => path.endsWith('/evaluator-authority-manifest.json'));
  const manifest = JSON.parse(readFileSync(join(root, manifestPath)));
  function validate(graph) {
    const paths = [...new Set([...graph.node_inventory.map(node => node.path), ...fixturePaths, ...EVALUATOR_RUNTIME_AUTHORITY_PATHS])].sort();
    const buffers = new Map(paths.map(path => [path, readFileSync(join(root, path))]));
    const files = paths.map(path => ({path, file_type: 'file', mode: 0o444, bytes: buffers.get(path).length, sha256: hash(buffers.get(path))}));
    const directories = new Set();
    for (const path of paths) for (let parent = dirname(path); parent !== '.'; parent = dirname(parent)) directories.add(parent);
    const inventory = [...files, ...[...directories].map(path => ({path, file_type: 'directory', mode: 0o555, bytes:null, sha256:null}))].sort((a,b) => a.path.localeCompare(b.path));
    const fixtures = fixturePaths.map(path => files.find(item => item.path === path));
    const descriptorBase = { schema_version: '1.0.0', schema_path: 'sealed-repository-authority-contract-v1', program: 'adaptive_ask_sealed_repository_authority',
      evaluator_revision: manifest.evaluator_revision, source_graph_digest: graph.graph_digest, source_graph: graph,
      fixture_authority_digest: canonicalDigest(fixtures), fixture_authority: fixtures,
      evaluator_authority_manifest_path: manifestPath, evaluator_authority_manifest_raw_sha256: hash(buffers.get(manifestPath)), evaluator_authority_manifest_digest: manifest.manifest_digest,
      runtime_authority_paths: [...EVALUATOR_RUNTIME_AUTHORITY_PATHS], sealed_mode_policy: {regular_file_mode:0o444,executable_file_mode:0o555,directory_mode:0o555,executable_paths:[]},
      execution_authority_transport:'in_memory_byte_map_v1', inventory };
    const descriptor = {...descriptorBase, authority_digest: canonicalDigest(descriptorBase)};
    buffers.set(EVALUATOR_REPOSITORY_DESCRIPTOR_PATH, Buffer.from(JSON.stringify(descriptor,null,2)+'\n'));
    return validateSealedRepositoryAuthorityBytes({descriptor, buffers});
  }
  // The same public manifest, fixture bytes, descriptor rules and generator pass
  // without the v2 source-only selection.
  assert.ok(validate(deriveEvaluatorDependencyGraph({root,baseRevision:revision})));
  for (const [commandEvidenceParserRevision,version] of [
    ['1.5.0-primary-saved','v2'],['1.6.0-primary-saved','v3'],['1.7.0-primary-saved','v4'],
    ['1.8.0-primary-saved','v5'],['1.9.0-primary-saved','v6'],['1.10.0-primary-saved','v7'],['1.11.0-primary-saved','v8'],
  ]) {
    const graph = scope.withPrimaryProcessingSourceBuild({root,baseRevision:revision,commandEvidenceParserRevision}, () => deriveEvaluatorDependencyGraph({root,baseRevision:revision}));
    const selectedSchemas = schemas.map(path => path.replace('saved-v2-', `saved-${version}-`));
    for (const path of selectedSchemas) assert.equal(graph.node_inventory.find(node => node.path === path).file_type, 'authority_data');
    assert.ok(validate(graph));
    if(version === 'v8') {
      const dataPaths=graph.node_inventory.filter(node=>node.path.includes('-saved-v8-')).map(node=>node.path);
      const generator='scripts/generate-ask-primary-grading-schemas.mjs';
      assert.equal(dataPaths.length,8);assert.equal(graph.node_inventory.find(node=>node.path===generator).file_type,'authority_data');
      for(const path of [...dataPaths,generator]) {
        const changed=structuredClone(graph);changed.node_inventory.find(node=>node.path===path).file_type=path===generator?'module':'json';
        const {graph_digest,...base}=changed;changed.graph_digest=canonicalDigest(base);
        assert.throws(()=>validate(changed),/source graph file type is invalid/u);
      }
      assert.ok(!graph.edge_inventory.some(edge=>edge.kind==='private_entry_import'&&edge.to===generator));
    }
    for (const path of [selectedSchemas[0], helper]) {
      const changed = structuredClone(graph); changed.node_inventory.find(node => node.path === path).file_type = path === helper ? 'authority_data' : 'json';
      const { graph_digest, ...base } = changed; changed.graph_digest = canonicalDigest(base);
      assert.throws(() => validate(changed), /source graph file type is invalid/u);
    }
  }
});
