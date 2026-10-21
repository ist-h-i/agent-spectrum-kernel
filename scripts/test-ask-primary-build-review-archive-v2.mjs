import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as archive from './ask-benchmark-mn-build-option-update-review-archive.mjs';
import * as publicModule from './ask-benchmark-mn-build-option-update.mjs';
import { canonicalDigest } from './ask-benchmark-materialize.mjs';
import { computeEvaluatorBundleId, computeEvaluatorBundleDigest } from './ask-benchmark-evaluator-boundary.mjs';
import { reviewArchiveSha256 as sha } from './ask-benchmark-review-archive-identity.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ID = 'mn-build-option-update', FIXTURE = `benchmarks/fixtures/checkpoint-b2/${ID}`;
const GENERATOR = 'scripts/ask-benchmark-mn-build-option-update-review-archive.mjs';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const json = path => JSON.parse(readFileSync(path));
const commit = root => git(root, '-c', 'user.name=ASK Test', '-c', 'user.email=ask-test@example.invalid', 'commit', '--quiet', '-am', 'artificial archive boundary fixture');
function entries(path) {
  const raw = readFileSync(path), map = new Map(); let offset = 0;
  while (raw.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(raw.readUInt16LE(offset + 8), 0);
    assert.equal(raw.readUInt16LE(offset + 10), 0);
    assert.equal(raw.readUInt16LE(offset + 12), 0x21);
    const size = raw.readUInt32LE(offset + 18), length = raw.readUInt16LE(offset + 26), extra = raw.readUInt16LE(offset + 28);
    const name = raw.subarray(offset + 30, offset + 30 + length).toString('utf8');
    const start = offset + 30 + length + extra;
    assert.ok(!map.has(name)); map.set(name, raw.subarray(start, start + size)); offset = start + size;
  }
  return map;
}

test('build has an explicit V2 archive API alongside legacy', () => {
  assert.equal(typeof archive.generateMnBuildOptionUpdateReviewArchiveV2, 'function');
  assert.equal(typeof archive.generateMnBuildOptionUpdateReviewArchive, 'function');
  assert.throws(() => archive.generateMnBuildOptionUpdateReviewArchiveV2(), /requires/);
});

test('artificial build archive boundaries (no real resource admission)', async t => {
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-build-archive-v2-')));
  t.after(() => rmSync(area, { recursive: true, force: true }));
  const runtime = join(area, 'runtime'), root = join(area, 'candidate'), privateRoot = join(area, 'private'), caseRoot = join(area, 'cases');
  // Commit a private test copy of the current generator so tests also work before
  // author commit. No protected checkout or frozen review asset is modified.
  execFileSync('git', ['clone', '--local', '--no-hardlinks', '--quiet', ROOT, runtime]);
  cpSync(join(ROOT, GENERATOR), join(runtime, GENERATOR));
  if (git(runtime, 'status', '--porcelain')) commit(runtime);
  const sourceRevision = git(runtime, 'rev-parse', 'HEAD');
  execFileSync('git', ['clone', '--local', '--no-hardlinks', '--quiet', runtime, root]);
  git(root, 'remote', 'set-url', 'origin', 'https://github.com/ist-h-i/agent-spectrum-kernel.git');
  mkdirSync(privateRoot); mkdirSync(caseRoot);
  const bytes = readFileSync(join(runtime, GENERATOR)), sourceFiles = [{ path: GENERATOR, bytes: bytes.length, sha256: sha(bytes) }];
  const dependencyGraph = { graph_digest: canonicalDigest({ artificial: true }) };
  const sourceIdentity = { base_git_revision: sourceRevision, source_tree_digest: canonicalDigest(sourceFiles), source_files: sourceFiles, dependency_graph: dependencyGraph };
  const inert = Buffer.from('artificial data; never imported or evaluated\n'); writeFileSync(join(privateRoot, 'inert.txt'), inert);
  const bundle = { schema_version: '1.0.0', schema_path: 'artificial-only', fixture_identity: { fixture_id: ID }, input_identity: { artificial: true }, evaluator_revision: sourceRevision, evaluator_source_identity: sourceIdentity, dependency_graph: dependencyGraph, asset_inventory: [{ role: 'inert_data', path: 'inert.txt', bytes: inert.length, sha256: sha(inert) }] };
  bundle.evaluator_bundle_id = computeEvaluatorBundleId(bundle); bundle.evaluator_bundle_digest = computeEvaluatorBundleDigest(bundle);
  write(join(privateRoot, 'private-evaluator-bundle.json'), bundle);
  const referencePath = join(root, FIXTURE, 'evaluator-reference.json'), reference = json(referencePath);
  Object.assign(reference, { evaluator_revision: sourceRevision, evaluator_source_identity: sourceIdentity, evaluator_bundle_id: bundle.evaluator_bundle_id, evaluator_bundle_digest: bundle.evaluator_bundle_digest }); write(referencePath, reference);
  const outputPath = join(root, FIXTURE, 'output-contract.json'), output = json(outputPath);
  output.result_profile.name = 'binary_scope_verification'; write(outputPath, output);
  write(join(caseRoot, 'cases.json'), { fixture_id: ID, cases: [{ case_id: 'normal-artificial' }, { case_id: 'bad-artificial' }] });
  commit(root); const reviewedHead = git(root, 'rev-parse', 'HEAD');
  let validations = 0, rejectAuthority = false;
  // Only public semantic validation is stubbed. Real source graph derivation,
  // Git ancestry/runtime bytes, private hashes, ZIP and case closure all run.
  // This test's artificial bundle is never a genuine production resource.
  t.mock.module(pathToFileURL(join(runtime, 'scripts/ask-benchmark-mn-build-option-update.mjs')).href, { namedExports: { ...publicModule, validateMnBuildOptionUpdatePublicFixture: () => { validations++; if (rejectAuthority) throw new Error('artificial authority rejection'); return {}; } } });
  const api = await import(pathToFileURL(join(runtime, GENERATOR)).href);
  const config = { root, privateRoot, caseRoot, reviewedHead, sourceRevision };
  const generate = (name, override = {}) => api.generateMnBuildOptionUpdateReviewArchiveV2({ ...config, outputPath: join(area, name), ...override });
  const restoreRepository = () => { git(root, 'reset', '--hard', reviewedHead); };

  await t.test('B2-GENERATOR / OUTPUT / PENDING: deterministic embedded closure', () => {
    const first = generate('first.zip'), second = generate('second.zip');
    assert.equal(validations, 2); assert.equal(first.archiveSha256, second.archiveSha256);
    assert.deepEqual(readFileSync(first.archivePath), readFileSync(second.archivePath));
    const files = entries(first.archivePath), manifest = JSON.parse(files.get('REVIEW-MANIFEST.json'));
    assert.equal(manifest.archive_format.revision, 'mn-build-closed-source-store-zip.v2');
    assert.equal(manifest.evaluator_source_revision, sourceRevision); assert.equal(manifest.reviewed_repository_head, reviewedHead);
    assert.equal(manifest.private_case_count, 2); assert.equal(manifest.private_asset_count, 1);
    assert.equal(manifest.independent_review_status, 'pending'); assert.equal(manifest.admission_status, 'admission_pending');
    for (const key of ['author_self_approval', 'scoring_ready', 'measured_execution', 'scoring_published']) assert.equal(manifest[key], false);
    const graph = manifest.archive_generator_source_identity;
    assert.ok(graph.node_inventory.length > 1);
    assert.ok(graph.node_inventory.some(({ path }) => path === GENERATOR));
    assert.ok(graph.node_inventory.some(({ path }) => path === 'scripts/ask-benchmark-review-archive-identity.mjs'));
    assert.deepEqual(manifest.archive_format.generator_source_inventory, graph.node_inventory);
    assert.equal(manifest.archive_format.generator_source_digest, sha(bytes));
    for (const node of graph.node_inventory) {
      const actual = files.get(`archive-generator-source/${node.path}`);
      assert.equal(actual.length, node.bytes); assert.equal(sha(actual), node.sha256);
      assert.deepEqual(actual, readFileSync(join(runtime, node.path)));
    }
    for (const entry of manifest.entries) { assert.equal(files.get(entry.path).length, entry.bytes); assert.equal(sha(files.get(entry.path)), entry.sha256); }
    assert.throws(() => generate('first.zip'), /EEXIST/);
  });
  await t.test('B2-IDENTITY: wrong head, source, parent and remote rejected', () => {
    assert.throws(() => generate('wrong-head.zip', { reviewedHead: sourceRevision }), /HEAD/);
    assert.throws(() => generate('collapsed.zip', { sourceRevision: reviewedHead }), /distinct/);
    assert.throws(() => generate('wrong-source.zip', { sourceRevision: '0'.repeat(40) }), /evaluator source revision/);
    git(root, '-c', 'user.name=ASK Test', '-c', 'user.email=ask-test@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'extra descendant');
    assert.throws(() => generate('non-direct.zip', { reviewedHead: git(root, 'rev-parse', 'HEAD') }), /direct one-parent/); restoreRepository();
    git(root, 'remote', 'set-url', 'origin', 'https://example.invalid/other.git');
    assert.throws(() => generate('foreign.zip'), /repository identity/);
    git(root, 'remote', 'set-url', 'origin', 'https://github.com/ist-h-i/agent-spectrum-kernel.git');
  });
  await t.test('B2-IDENTITY: dirty repository and changed runtime fail closed', () => {
    writeFileSync(join(root, 'untracked-boundary-control.txt'), 'untracked');
    assert.throws(() => generate('dirty.zip'), /tracked or untracked/); rmSync(join(root, 'untracked-boundary-control.txt'));
    writeFileSync(join(runtime, GENERATOR), Buffer.concat([bytes, Buffer.from('\n// artificial drift\n')]));
    assert.throws(() => generate('runtime-drift.zip'), /dependency bytes|generator source|dependency graph/); writeFileSync(join(runtime, GENERATOR), bytes);
    writeFileSync(join(root, GENERATOR), Buffer.concat([bytes, Buffer.from('\n// candidate substitution\n')]));
    git(root, '-c', 'user.name=ASK Test', '-c', 'user.email=ask-test@example.invalid', 'commit', '--quiet', '-am', 'artificial substitution', '--amend');
    try { assert.throws(() => generate('candidate-drift.zip', { reviewedHead: git(root, 'rev-parse', 'HEAD') }), /dependency bytes|generator source/); }
    finally { restoreRepository(); }
  });
  await t.test('B2-ASSETS: public validator cannot be bypassed', () => {
    rejectAuthority = true; assert.throws(() => generate('invalid-public.zip'), /artificial authority rejection/); rejectAuthority = false;
    assert.equal(existsSync(join(area, 'invalid-public.zip')), false);
  });
  await t.test('B2-ASSETS: changed, extra and linked private assets rejected', () => {
    writeFileSync(join(privateRoot, 'inert.txt'), 'tampered'); assert.throws(() => generate('bad-private.zip'), /private asset bytes/); writeFileSync(join(privateRoot, 'inert.txt'), inert);
    writeFileSync(join(privateRoot, 'extra.txt'), 'extra'); assert.throws(() => generate('extra-private.zip'), /inventory is not closed/); rmSync(join(privateRoot, 'extra.txt'));
    symlinkSync('inert.txt', join(privateRoot, 'linked.txt')); assert.throws(() => generate('link-private.zip'), /symlink|not a regular/); rmSync(join(privateRoot, 'linked.txt'));
    const changed = structuredClone(bundle); changed.evaluator_source_identity.source_tree_digest = sha('not the public identity');
    changed.evaluator_bundle_id = computeEvaluatorBundleId(changed); changed.evaluator_bundle_digest = computeEvaluatorBundleDigest(changed);
    write(join(privateRoot, 'private-evaluator-bundle.json'), changed);
    assert.throws(() => generate('identity-private.zip'), /private\/public evaluator identity/);
    const rebound = { ...reference, evaluator_bundle_id: changed.evaluator_bundle_id, evaluator_bundle_digest: changed.evaluator_bundle_digest };
    write(referencePath, rebound);
    git(root, '-c', 'user.name=ASK Test', '-c', 'user.email=ask-test@example.invalid', 'commit', '--quiet', '-am', 'artificial private substitution', '--amend');
    try { assert.throws(() => generate('source-identity-private.zip', { reviewedHead: git(root, 'rev-parse', 'HEAD') }), /private\/public evaluator source identity/); }
    finally { restoreRepository(); write(join(privateRoot, 'private-evaluator-bundle.json'), bundle); }
  });
  await t.test('B2-ASSETS / OUTPUT: cases, external roots and aliases rejected', () => {
    writeFileSync(join(caseRoot, 'extra.txt'), 'extra'); assert.throws(() => generate('extra-case.zip'), /case inventory is not closed/); rmSync(join(caseRoot, 'extra.txt'));
    const caseBytes = readFileSync(join(caseRoot, 'cases.json')); rmSync(join(caseRoot, 'cases.json'));
    assert.throws(() => generate('missing-case.zip'), /root is empty|require cases.json/); writeFileSync(join(caseRoot, 'cases.json'), caseBytes);
    assert.throws(() => generate('overlap.zip', { caseRoot: privateRoot }), /disjoint/);
    const link = join(area, 'private-alias'); symlinkSync(privateRoot, link, 'dir'); assert.throws(() => generate('linked-root.zip', { privateRoot: link }), /non-symlink directory/);
    for (const [index, target] of [root, privateRoot, caseRoot].entries()) {
      const alias = join(area, `output-alias-${index}`); symlinkSync(target, alias, 'dir');
      const destination = join(alias, 'forbidden-archive.zip');
      assert.throws(() => generate('unused.zip', { outputPath: destination }), /output must stay outside/); assert.equal(existsSync(destination), false);
    }
  });
  await t.test('B2-LEGACY: explicit API retains legacy format; CLI requires opt in', () => {
    const result = api.generateMnBuildOptionUpdateReviewArchive({ ...config, outputPath: join(area, 'legacy.zip') });
    const manifest = JSON.parse(entries(result.archivePath).get('REVIEW-MANIFEST.json'));
    assert.equal(manifest.archive_format.revision, 'issue-254-node-store-zip.v1');
    assert.equal(manifest.archive_generator_source_identity, undefined);
    const invalid = spawnSync(process.execPath, [join(runtime, GENERATOR), '--source-revision', sourceRevision], { encoding: 'utf8', timeout: 15000 });
    assert.equal(invalid.status, 1); assert.match(invalid.stderr, /require --format v2/);
    assert.equal(generate('final-valid.zip').scoringReady, false);
  });
});
