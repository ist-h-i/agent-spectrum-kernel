// Explicit evaluation-only successor selection. This verifies static identity and
// preserved task/scoring semantics; it grants no start, worker or admission authority.
import assert from 'node:assert/strict';
import { lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = path => readStableFile(path, 'fixed primary scoring version', 33554432).bytes;
const hash = raw => `sha256:${createHash('sha256').update(raw).digest('hex')}`;
const json = path => parseJsonRejectDuplicateKeys(read(path).toString('utf8'));
const digest = value => assert.match(value, /^sha256:[a-f0-9]{64}$/u);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'closed scoring version fields required');
const safe = path => typeof path === 'string' && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && path.split('/').every(part => part && part !== '.' && part !== '..');
const resourcePaths = ['privateRoot', 'manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath'];
export const PRIMARY_SCORING_VERSION_RESOURCE_FIELDS = Object.freeze([...resourcePaths, 'admissionReviewAuthoritySourceDigest']);
export const PRIMARY_SCORING_VERSION_FILE_FIELDS = Object.freeze(['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath']);
const project = (value, allowedHeaders) => Object.fromEntries(Object.entries(value).filter(([key]) => !allowedHeaders.includes(key)));
function fixedPath(path, directory = false) {
  assert.equal(resolve(path), path, 'scoring version path must be canonical');
  assert.equal(realpathSync(path), path, 'scoring version symlink refused');
  const stat = lstatSync(path);
  assert.equal(stat.mode & 0o222, 0, 'scoring version resources must be read-only');
  assert.ok(directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1, 'scoring version resources must be independent regular files');
}

/** Preserve all fields other than explicitly permitted regenerated identity headers. */
export function verifyPrimaryScoringSemantics(fixtureId, selectedRoot, { root = ROOT } = {}) {
  assert.ok(PRIMARY_FIXTURE_IDS.includes(fixtureId), 'unknown primary fixture');
  const base = `benchmarks/fixtures/checkpoint-b2/${fixtureId}`;
  const old = name => json(join(root, base, `${name}.json`));
  const fresh = name => json(join(selectedRoot, base, `${name}.json`));
  for (const name of ['input-manifest', 'verification-command-contract'])
    assert.deepEqual(read(join(selectedRoot, base, `${name}.json`)), read(join(root, base, `${name}.json`)), `preserved ${name} changed`);
  if (fixtureId === 'mn-build-option-update') {
    // This successor regenerates the lost private mutation assets. Only their
    // content identity can change; criterion/scope/state/ID fields stay fixed.
    const mutationProjection = value => {
      assert.ok(Array.isArray(value.mutation_contracts), 'preserved evidence-map mutation contracts required');
      return { ...value, mutation_contracts: value.mutation_contracts.map(contract => {
        digest(contract.mutation_digest);
        return project(contract, ['mutation_digest']);
      }) };
    };
    assert.deepEqual(mutationProjection(fresh('evidence-map')), mutationProjection(old('evidence-map')), 'preserved evidence-map semantics changed');
  } else {
    assert.deepEqual(read(join(selectedRoot, base, 'evidence-map.json')), read(join(root, base, 'evidence-map.json')), 'preserved evidence-map changed');
  }
  for (const name of ['portfolio-catalog', 'portfolio-policy-manifest', 'portfolio-scoring-policy'])
    assert.deepEqual(read(join(selectedRoot, 'benchmarks', `${name}.json`)), read(join(root, 'benchmarks', `${name}.json`)), `preserved ${name} changed`);
  assert.deepEqual(read(join(selectedRoot, 'scripts/ask-benchmark-portfolio-score.mjs')), read(join(root, 'scripts/ask-benchmark-portfolio-score.mjs')), 'raw scorer changed');
  const input = old('input-manifest');
  for (const file of input.fixtures[fixtureId].files) {
    assert.ok(safe(file.path));
    const bytes = read(join(selectedRoot, base, file.path));
    assert.equal(bytes.length, file.bytes, 'preserved input size changed');
    assert.equal(hash(bytes), `sha256:${file.sha256}`, 'preserved input bytes changed');
  }
  const allow = {
    'requirement-record': ['admission_record_digest', 'requirement_record_digest'],
    'output-contract': ['evaluator_public_reference_digest', 'evaluator_authority_manifest_raw_sha256', 'evaluator_authority_manifest_digest', 'output_contract_digest'],
    metadata: ['evaluator_bundle_id', 'evaluator_bundle_digest', 'evaluator_byte_count', 'review_status', 'metadata_digest'],
  };
  for (const [name, fields] of Object.entries(allow)) {
    keys(fresh(name), Object.keys(old(name)));
    assert.deepEqual(project(fresh(name), fields), project(old(name), fields), `preserved ${name} semantics changed`);
  }
  const reference = fresh('evaluator-reference'), original = old('evaluator-reference');
  for (const key of ['fixture_id', 'fixture_input_digest', 'task_class', 'suite', 'fixture_role', 'verification_command_contract', 'result_profile'])
    if (Object.hasOwn(original, key)) assert.deepEqual(reference[key], original[key], `preserved reference ${key} changed`);
  return { fixture_id: fixtureId, public_semantics_preserved: true };
}

/** Exact closed manifest shape. Private files are pinned, never parsed here. */
export function readPrimaryScoringVersion(selector, fixtureId, { root = ROOT, verifyResourceFiles = false } = {}) {
  keys(selector, ['path', 'digest']); digest(selector.digest); fixedPath(selector.path);
  const raw = read(selector.path); assert.equal(hash(raw), selector.digest, 'scoring version manifest changed');
  const manifest = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  keys(manifest, ['kind', 'scoring_version_id', 'fixtures']);
  assert.equal(manifest.kind, 'ask_primary_scoring_version_v1');
  assert.match(manifest.scoring_version_id, /^[a-z][a-z0-9_-]{1,127}$/u);
  keys(manifest.fixtures, PRIMARY_FIXTURE_IDS);
  assert.ok(PRIMARY_FIXTURE_IDS.includes(fixtureId), 'unknown primary fixture');
  const fixture = manifest.fixtures[fixtureId];
  keys(fixture, ['frozen_source_root', 'selected', 'resource', 'resource_file_digests']);
  fixedPath(fixture.frozen_source_root, true);
  keys(fixture.resource, PRIMARY_SCORING_VERSION_RESOURCE_FIELDS);
  keys(fixture.resource_file_digests, PRIMARY_SCORING_VERSION_FILE_FIELDS);
  digest(fixture.resource.admissionReviewAuthoritySourceDigest);
  for (const key of resourcePaths) fixedPath(fixture.resource[key], key === 'privateRoot');
  for (const key of PRIMARY_SCORING_VERSION_FILE_FIELDS) {
    digest(fixture.resource_file_digests[key]);
    if (verifyResourceFiles) assert.equal(hash(read(fixture.resource[key])), fixture.resource_file_digests[key], `scoring version ${key} changed`);
  }
  assert.equal(fixture.resource_file_digests.admissionReviewAuthorityPath, fixture.resource.admissionReviewAuthoritySourceDigest);
  const base = `benchmarks/fixtures/checkpoint-b2/${fixtureId}`, freezePath = `${base}/scoring-input-freeze-manifest.json`;
  const freeze = json(join(fixture.frozen_source_root, freezePath));
  assert.equal(freeze.fixture_id, fixtureId);
  const pins = Object.values(freeze).filter(value => value && typeof value === 'object' && Object.hasOwn(value, 'path') && Object.hasOwn(value, 'raw_byte_digest'));
  const expected = [...pins.map(value => value.path), freezePath, `${base}/input-manifest.json`, `${base}/metadata.json`, `${base}/task.md`,
    `${base}/source-freeze-candidate.json`, `${base}/admission-review.json`, 'scripts/ask-benchmark-portfolio-score.mjs'];
  keys(fixture.selected, [...new Set(expected)]);
  for (const [path, expectedDigest] of Object.entries(fixture.selected)) {
    assert.ok(safe(path), 'unsafe scoring version pin path'); digest(expectedDigest);
    fixedPath(join(fixture.frozen_source_root, path));
    assert.equal(hash(read(join(fixture.frozen_source_root, path))), expectedDigest, 'selected scoring version public bytes changed');
  }
  for (const pin of pins) assert.equal(fixture.selected[pin.path], pin.raw_byte_digest, 'scoring version freeze closure changed');
  verifyPrimaryScoringSemantics(fixtureId, fixture.frozen_source_root, { root });
  return { selector: structuredClone(selector), scoring_version_id: manifest.scoring_version_id,
    root: fixture.frozen_source_root, fixture: structuredClone(fixture) };
}
export function primaryScoringRoot(block, { root = ROOT } = {}) {
  return block.grading?.scoring_version ? readPrimaryScoringVersion(block.grading.scoring_version, block.fixture_id, { root }).root : root;
}
export function verifyPrimaryScoringVersionResource(block, resource, { root = ROOT } = {}) {
  if (!block.grading?.scoring_version) return null;
  const selected = readPrimaryScoringVersion(block.grading.scoring_version, block.fixture_id, { root, verifyResourceFiles: true });
  assert.equal(resource.frozenSourceRoot, selected.root, 'scoring version source substitution');
  for (const key of PRIMARY_SCORING_VERSION_RESOURCE_FIELDS) assert.equal(resource[key], selected.fixture.resource[key], `scoring version resource ${key} substitution`);
  return selected;
}
