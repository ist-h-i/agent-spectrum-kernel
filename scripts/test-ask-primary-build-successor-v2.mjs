import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { computeOutputContractDigest, computeResultProfileDigest, computeScoringInputFreezeManifestDigest } from './ask-benchmark-scoring-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const relative = 'benchmarks/fixtures/checkpoint-b2/mn-build-option-update';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const rawDigest = raw => `sha256:${createHash('sha256').update(raw).digest('hex')}`;
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function fixture(t) {
  const work = mkdtempSync(join(tmpdir(), 'ask-build-profile-transaction-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const repository = join(work, 'repository'), privateRoot = join(work, 'private');
  const target = join(repository, relative);
  mkdirSync(target, { recursive: true }); mkdirSync(privateRoot);
  cpSync(join(root, relative), target, { recursive: true });
  const reference = json(join(target, 'evaluator-reference.json'));
  // Minimal identity stand-in tests publication only; no private authority or
  // admitted resource is manufactured by this transaction test.
  write(join(privateRoot, 'private-evaluator-bundle.json'), {
    evaluator_bundle_id: reference.evaluator_bundle_id, evaluator_bundle_digest: reference.evaluator_bundle_digest,
    evaluator_revision: reference.evaluator_revision, evaluator_source_identity: reference.evaluator_source_identity,
    dependency_graph: reference.evaluator_source_identity.dependency_graph,
  });
  const names = ['output-contract.json', 'scoring-input-freeze-manifest.json', 'admission-review.json', 'source-freeze-candidate.json'];
  const before = new Map(names.map(name => [name, readFileSync(join(target, name))]));
  return { repository, privateRoot, target, before };
}

let rejectPublished = false, validations = 0;
test.mock.module('./ask-benchmark-mn-build-option-update.mjs', { namedExports: {
  validateMnBuildOptionUpdatePublicFixture: ({ root: repository }) => {
    validations++;
    const target = join(repository, relative), outputBytes = readFileSync(join(target, 'output-contract.json'));
    const output = JSON.parse(outputBytes), freeze = json(join(target, 'scoring-input-freeze-manifest.json'));
    assert.equal(output.output_contract_digest, computeOutputContractDigest(output));
    assert.deepEqual(freeze.result_profile, output.result_profile);
    assert.equal(freeze.output_contract.raw_byte_digest, rawDigest(outputBytes));
    assert.deepEqual(Object.keys(freeze.output_contract).sort(), ['path', 'raw_byte_digest', 'semantic_digest']);
    assert.equal(freeze.output_contract.semantic_digest, output.output_contract_digest);
    assert.equal(freeze.manifest_digest, computeScoringInputFreezeManifestDigest(freeze));
    const candidate = json(join(target, 'source-freeze-candidate.json'));
    assert.equal(candidate.public_bindings.output_contract.raw_sha256, rawDigest(outputBytes));
    assert.equal(candidate.public_bindings.output_contract.semantic_digest, output.output_contract_digest);
    if (rejectPublished) throw new Error('intentional published authority rejection');
    return { reviewStatus: 'pending_independent_review' };
  },
} });
const { finalizeMnBuildOptionUpdateSuccessorAuthority: finalize } = await import('./ask-benchmark-mn-build-option-update-successor-authority.mjs?transaction-controls');

for (const corruption of ['missing', 'malformed']) test(`build ${corruption} freeze leaves original output bytes intact`, t => {
  const f = fixture(t), path = join(f.target, 'scoring-input-freeze-manifest.json');
  if (corruption === 'missing') rmSync(path); else writeFileSync(path, '{broken');
  assert.throws(() => finalize({ root: f.repository, privateRoot: f.privateRoot, resultProfileName: 'requirement_scope_verification_v2' }), /scoring freeze/);
  for (const [name, bytes] of f.before) if (name !== 'scoring-input-freeze-manifest.json') assert.deepEqual(readFileSync(join(f.target, name)), bytes);
});

test('build publishes coherent v2 output/freeze/candidate together', t => {
  const f = fixture(t), before = validations;
  const result = finalize({ root: f.repository, privateRoot: f.privateRoot, resultProfileName: 'requirement_scope_verification_v2' });
  assert.equal(validations, before + 1);
  assert.equal(result.scoringReady, false);
  assert.deepEqual(json(join(f.target, 'output-contract.json')).result_profile,
    { name: 'requirement_scope_verification_v2', digest: computeResultProfileDigest({ name: 'requirement_scope_verification_v2' }) });
});

test('build late validation failure restores every original byte', t => {
  const f = fixture(t); rejectPublished = true;
  try {
    assert.throws(() => finalize({ root: f.repository, privateRoot: f.privateRoot, resultProfileName: 'requirement_scope_verification_v2' }), /intentional published authority rejection/);
  } finally { rejectPublished = false; }
  for (const [name, bytes] of f.before) assert.deepEqual(readFileSync(join(f.target, name)), bytes);
  assert.deepEqual(readdirSync(join(f.repository, 'benchmarks/fixtures/checkpoint-b2')), ['mn-build-option-update']);
});
