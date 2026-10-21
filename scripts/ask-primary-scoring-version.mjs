import * as unsafeActionContract from './ask-primary-unsafe-action-contract.mjs';
// Explicit evaluation-only successor selection. This verifies static identity and
// preserved task/scoring semantics; it grants no start, worker or admission authority.
import assert from 'node:assert/strict';
import { lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { computeResultProfileDigest, REQUIREMENT_SCOPE_VERIFICATION_PROFILE_NAME } from './ask-benchmark-scoring-contract.mjs';
import * as primaryFixtureRecipes from './ask-primary-fixture-recipe.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = path => readStableFile(path, 'fixed primary scoring version', 33554432).bytes;
const hash = raw => `sha256:${createHash('sha256').update(raw).digest('hex')}`;
const json = path => parseJsonRejectDuplicateKeys(read(path).toString('utf8'));
const digest = value => assert.match(value, /^sha256:[a-f0-9]{64}$/u);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'closed scoring version fields required');
const safe = path => typeof path === 'string' && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && path.split('/').every(part => part && part !== '.' && part !== '..');
const resourcePaths = ['privateRoot', 'manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath'];
const scoringVersionKinds = Object.freeze(Array.from({ length: 10 }, (_, i) => `ask_primary_scoring_version_v${i + 1}`));
const V7_KIND = 'ask_primary_scoring_version_v7';
const V8_KIND = 'ask_primary_scoring_version_v8';
const V9_KIND = 'ask_primary_scoring_version_v9';
const V10_KIND = 'ask_primary_scoring_version_v10';
const registeredVersion = kind => [V7_KIND,V8_KIND,V9_KIND,V10_KIND].includes(kind);
/** The optional catalog API is supplied by the registered-task recipe version.
 * Without it this implementation remains closed over the historical nine. */
export function isPrimaryScoringFixtureId(fixtureId, { evaluationVersion = null } = {}) {
  return PRIMARY_FIXTURE_IDS.includes(fixtureId) || (registeredVersion(evaluationVersion)
    && typeof primaryFixtureRecipes.isRegisteredPrimaryFixtureId === 'function'
    && primaryFixtureRecipes.isRegisteredPrimaryFixtureId(fixtureId) === true);
}
/** A map without a set retains v7's existing explicit legacy subset. Full new
 * inventories are opt-in, exact and checked by the recipe's registry authority. */
export function validatePrimaryScoringVersionFixtureInventory(manifest) {
  assert.ok(scoringVersionKinds.includes(manifest.kind), 'unknown primary scoring version');
  const ids = Object.keys(manifest.fixtures);
  if (!registeredVersion(manifest.kind)) {
    assert.ok(!Object.hasOwn(manifest, 'fixture_set'), 'historical scoring version cannot select a fixture set');
    keys(manifest.fixtures, PRIMARY_FIXTURE_IDS);
  } else if (!Object.hasOwn(manifest, 'fixture_set')) {
    assert.ok(ids.length > 0 && ids.every(id => PRIMARY_FIXTURE_IDS.includes(id)), 'v7 requires a nonempty explicit primary fixture selection');
  } else {
    assert.ok(['legacy9', 'catalog24'].includes(manifest.fixture_set), 'unknown primary fixture set');
    if (typeof primaryFixtureRecipes.assertPrimaryFixtureInventory === 'function') {
      primaryFixtureRecipes.assertPrimaryFixtureInventory(ids, manifest.fixture_set);
    } else {
      assert.equal(manifest.fixture_set, 'legacy9', 'catalog24 requires the registered primary recipe API');
      assert.deepEqual(ids, PRIMARY_FIXTURE_IDS, 'complete registered primary fixture set required in fixed order');
    }
    assert.ok(ids.every(id => isPrimaryScoringFixtureId(id, { evaluationVersion: manifest.kind })), 'unknown primary fixture');
  }
  return ids;
}
export const PRIMARY_SCORING_VERSION_RESOURCE_FIELDS = Object.freeze([...resourcePaths, 'admissionReviewAuthoritySourceDigest']);
export const PRIMARY_SCORING_VERSION_FILE_FIELDS = Object.freeze(['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath']);
export const PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH = 'scripts/ask-review-target-requirement.mjs';
export const PRIMARY_PROCESSING_SOURCE_PATHS = Object.freeze(['scripts/ask-benchmark-command-evidence.mjs', PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH,
  'benchmarks/schemas/primary-saved-v2-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v2-portfolio-command-evidence.schema.json']);
export const PRIMARY_PROCESSING_V3_SOURCE_PATHS = Object.freeze(['scripts/ask-benchmark-command-evidence.mjs', PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH,
  'benchmarks/schemas/primary-saved-v3-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v3-portfolio-command-evidence.schema.json']);
export const PRIMARY_PROCESSING_V4_SOURCE_PATHS = Object.freeze(['scripts/ask-benchmark-command-evidence.mjs', PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH,
  'benchmarks/schemas/primary-saved-v4-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v4-portfolio-command-evidence.schema.json']);
export const PRIMARY_PROCESSING_V5_SOURCE_PATHS = Object.freeze(['scripts/ask-benchmark-command-evidence.mjs', PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH,
  'benchmarks/schemas/primary-saved-v5-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v5-portfolio-command-evidence.schema.json']);
export const PRIMARY_PROCESSING_V6_SOURCE_PATHS = Object.freeze(['scripts/ask-benchmark-command-evidence.mjs', PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH,
  'benchmarks/schemas/primary-saved-v6-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v6-portfolio-command-evidence.schema.json']);
export const PRIMARY_PROCESSING_V7_SOURCE_PATHS = Object.freeze(['scripts/ask-benchmark-command-evidence.mjs', 'scripts/ask-benchmark-scoring-contract.mjs',
  PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH,
  'benchmarks/schemas/primary-saved-v7-portfolio-command-evidence.schema.json', 'benchmarks/schemas/primary-k2-saved-v7-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-saved-v7-evaluator-result-envelope.schema.json', 'benchmarks/schemas/primary-k2-saved-v7-evaluator-result-envelope.schema.json']);
export const PRIMARY_PROCESSING_V8_SOURCE_PATHS = Object.freeze([
  'scripts/ask-benchmark-command-evidence.mjs', 'scripts/ask-benchmark-scoring-contract.mjs',
  'scripts/ask-primary-unsafe-action-contract.mjs', 'scripts/ask-benchmark-normalized-results.mjs',
  'scripts/ask-benchmark-evaluator-boundary.mjs', 'scripts/ask-benchmark-portfolio-score.mjs', 'scripts/ask-primary-engineering-safety.mjs',
  'scripts/ask-primary-evaluation-producer.mjs', 'scripts/ask-primary-evaluation-private-grading.mjs', 'scripts/ask-primary-evaluation-grading.mjs', 'scripts/ask-primary-evaluation-scope.mjs', 'scripts/ask-benchmark-runtime-observation.mjs', 'scripts/generate-ask-primary-grading-schemas.mjs',
  PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH,
  ...['primary','primary-k2'].flatMap(prefix=>['portfolio-command-evidence','normalized-portfolio-result','evaluator-result-envelope','portfolio-engineering-result']
    .map(name=>`benchmarks/schemas/${prefix}-saved-v8-${name}.schema.json`)),
]);
export const PRIMARY_PROCESSING_V9_SOURCE_PATHS = Object.freeze([
  ...PRIMARY_PROCESSING_V8_SOURCE_PATHS, 'scripts/ask-primary-discovery-grammar-v9.mjs',
  ...['primary','primary-k2'].flatMap(prefix=>['portfolio-command-evidence','normalized-portfolio-result','evaluator-result-envelope','portfolio-engineering-result']
    .map(name=>`benchmarks/schemas/${prefix}-saved-v9-${name}.schema.json`)),
]);
export const PRIMARY_PROCESSING_V10_SOURCE_PATHS = Object.freeze([
  ...PRIMARY_PROCESSING_V9_SOURCE_PATHS, 'scripts/ask-primary-runtime-v10.mjs',
  'scripts/ask-primary-execution-input.mjs', 'scripts/ask-user-comparison-prepare.mjs', 'scripts/ask-user-comparison.mjs', 'scripts/install-codex-adapter.mjs',
  'benchmarks/schemas/primary-public-capability-selection-v2.schema.json', 'benchmarks/schemas/primary-runtime-v10-binding.schema.json',
  ...['primary','primary-k2'].flatMap(prefix=>['portfolio-command-evidence','normalized-portfolio-result','evaluator-result-envelope','portfolio-engineering-result']
    .map(name=>`benchmarks/schemas/${prefix}-saved-v10-${name}.schema.json`)),
]);
function processingSourcePaths(commandEvidenceParserRevision) {
  if (commandEvidenceParserRevision === '1.13.0-primary-app-server') return PRIMARY_PROCESSING_V10_SOURCE_PATHS;
  if (commandEvidenceParserRevision === '1.12.0-primary-saved') return PRIMARY_PROCESSING_V9_SOURCE_PATHS;
  if (commandEvidenceParserRevision === '1.11.0-primary-saved') return PRIMARY_PROCESSING_V8_SOURCE_PATHS;
  if (commandEvidenceParserRevision === '1.10.0-primary-saved') return PRIMARY_PROCESSING_V7_SOURCE_PATHS;
  if (commandEvidenceParserRevision === '1.9.0-primary-saved') return PRIMARY_PROCESSING_V6_SOURCE_PATHS;
  if (commandEvidenceParserRevision === '1.8.0-primary-saved') return PRIMARY_PROCESSING_V5_SOURCE_PATHS;
  if (commandEvidenceParserRevision === '1.5.0-primary-saved') return PRIMARY_PROCESSING_SOURCE_PATHS;
  if (commandEvidenceParserRevision === '1.7.0-primary-saved') return PRIMARY_PROCESSING_V4_SOURCE_PATHS;
  assert.equal(commandEvidenceParserRevision, '1.6.0-primary-saved', 'unknown primary processing command revision');
  return PRIMARY_PROCESSING_V3_SOURCE_PATHS;
}
/** Closed build-time authority data, shared by graph construction and sealed
 * byte validation. Runtime modules in the processing closure stay modules. */
export function primaryProcessingAuthorityPaths(commandEvidenceParserRevision) {
  const selected = processingSourcePaths(commandEvidenceParserRevision);
  return selected.filter(path => path.endsWith('.schema.json') ||
    (['1.11.0-primary-saved','1.12.0-primary-saved','1.13.0-primary-app-server'].includes(commandEvidenceParserRevision) && path === 'scripts/generate-ask-primary-grading-schemas.mjs'));
}
export const PRIMARY_PROCESSING_AUTHORITY_PATHS = Object.freeze([...new Set([
  '1.5.0-primary-saved','1.6.0-primary-saved','1.7.0-primary-saved','1.8.0-primary-saved',
  '1.9.0-primary-saved','1.10.0-primary-saved','1.11.0-primary-saved','1.12.0-primary-saved','1.13.0-primary-app-server',
].flatMap(primaryProcessingAuthorityPaths))]);
/** Source bytes only. This descriptor supplies no admission or execution authority. */
export function primaryProcessingDescriptor({ root = ROOT, commandEvidenceParserRevision = '1.5.0-primary-saved' } = {}) {
  return { command_evidence_parser_revision: commandEvidenceParserRevision, review_recognition_revision: '2',
    source_file_digests: Object.fromEntries(processingSourcePaths(commandEvidenceParserRevision).map(path => [path, hash(read(join(root, path)))])) };
}
function verifyProcessingDescriptor(value, selectedRoot, root, commandEvidenceParserRevision) {
  keys(value, ['command_evidence_parser_revision', 'review_recognition_revision', 'source_file_digests']);
  assert.equal(value.command_evidence_parser_revision, commandEvidenceParserRevision, 'primary processing revision differs from manifest kind');
  assert.equal(value.review_recognition_revision, '2', 'unknown primary processing review revision');
  const paths = processingSourcePaths(commandEvidenceParserRevision);
  keys(value.source_file_digests, paths);
  const expected = primaryProcessingDescriptor({ root, commandEvidenceParserRevision });
  for (const path of paths) {
    digest(value.source_file_digests[path]); fixedPath(join(selectedRoot, path));
    assert.equal(hash(read(join(selectedRoot, path))), value.source_file_digests[path], 'processing source bytes changed');
    assert.equal(value.source_file_digests[path], expected.source_file_digests[path], 'processing source differs from selected implementation');
  }
}
const project = (value, allowedHeaders) => Object.fromEntries(Object.entries(value).filter(([key]) => !allowedHeaders.includes(key)));
function fixedPath(path, directory = false) {
  assert.equal(resolve(path), path, 'scoring version path must be canonical');
  assert.equal(realpathSync(path), path, 'scoring version symlink refused');
  const stat = lstatSync(path);
  assert.equal(stat.mode & 0o222, 0, 'scoring version resources must be read-only');
  assert.ok(directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1, 'scoring version resources must be independent regular files');
}

/** Preserve all fields other than explicitly permitted regenerated identity headers. */
export function verifyPrimaryScoringSemantics(fixtureId, selectedRoot, { root = ROOT, evaluationVersion = null } = {}) {
  assert.ok(isPrimaryScoringFixtureId(fixtureId, { evaluationVersion }), 'unknown primary fixture');
  const base = `benchmarks/fixtures/checkpoint-b2/${fixtureId}`;
  if ([V8_KIND,V9_KIND,V10_KIND].includes(evaluationVersion)) {
    const basis = unsafeActionContract.PRIMARY_UNSAFE_ACTION_AUTHORIZATION[fixtureId];
    if (basis) {
      assert.equal(hash(read(join(selectedRoot,basis.task_path))),basis.task_sha256,'v8 unsafe action task authorization basis changed');
      assert.equal(json(join(selectedRoot,base,'verification-command-contract.json')).contract_digest,basis.verification_command_contract_digest,'v8 unsafe action command authorization basis changed');
    }
  }
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
  const v7 = registeredVersion(evaluationVersion);
  const expectedProfile = { name: REQUIREMENT_SCOPE_VERIFICATION_PROFILE_NAME, digest: computeResultProfileDigest({ name: REQUIREMENT_SCOPE_VERIFICATION_PROFILE_NAME }) };
  if (v7) {
    assert.deepEqual(fresh('output-contract').result_profile, expectedProfile, 'v7 output requires its explicit new result profile');
    assert.deepEqual(fresh('scoring-input-freeze-manifest').result_profile, expectedProfile, 'v7 freeze result profile drift');
  }
  const allow = {
    'requirement-record': ['admission_record_digest', 'requirement_record_digest'],
    'output-contract': ['evaluator_public_reference_digest', 'evaluator_authority_manifest_raw_sha256', 'evaluator_authority_manifest_digest', 'output_contract_digest', ...(v7 ? ['result_profile'] : [])],
    metadata: ['evaluator_bundle_id', 'evaluator_bundle_digest', 'evaluator_byte_count', 'review_status', 'metadata_digest'],
  };
  for (const [name, fields] of Object.entries(allow)) {
    keys(fresh(name), Object.keys(old(name)));
    assert.deepEqual(project(fresh(name), fields), project(old(name), fields), `preserved ${name} semantics changed`);
  }
  const reference = fresh('evaluator-reference'), original = old('evaluator-reference');
  for (const key of ['fixture_id', 'fixture_input_digest', 'task_class', 'suite', 'fixture_role', 'verification_command_contract', 'result_profile'])
    if (Object.hasOwn(original, key)) assert.deepEqual(reference[key], v7 && key === 'result_profile' ? expectedProfile : original[key], `preserved reference ${key} changed`);
  return { fixture_id: fixtureId, public_semantics_preserved: true };
}

/** Exact closed manifest shape. Private files are pinned, never parsed here. */
export function readPrimaryScoringVersion(selector, fixtureId, { root = ROOT, verifyResourceFiles = false } = {}) {
  keys(selector, ['path', 'digest']); digest(selector.digest); fixedPath(selector.path);
  const raw = read(selector.path); assert.equal(hash(raw), selector.digest, 'scoring version manifest changed');
  const manifest = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  assert.ok(scoringVersionKinds.includes(manifest.kind), 'unknown primary scoring version');
  const processing = manifest.kind !== 'ask_primary_scoring_version_v1';
  keys(manifest, ['kind', 'scoring_version_id', 'fixtures', ...(processing ? ['processing'] : []),
    ...(registeredVersion(manifest.kind) && Object.hasOwn(manifest, 'fixture_set') ? ['fixture_set'] : [])]);
  assert.match(manifest.scoring_version_id, /^[a-z][a-z0-9_-]{1,127}$/u);
  validatePrimaryScoringVersionFixtureInventory(manifest);
  assert.ok(isPrimaryScoringFixtureId(fixtureId, { evaluationVersion: manifest.kind }), 'unknown primary fixture');
  assert.ok(Object.hasOwn(manifest.fixtures, fixtureId), 'fixture absent from explicit scoring version');
  const fixture = manifest.fixtures[fixtureId];
  keys(fixture, ['frozen_source_root', 'selected', 'resource', 'resource_file_digests']);
  fixedPath(fixture.frozen_source_root, true);
  if (processing) verifyProcessingDescriptor(manifest.processing, fixture.frozen_source_root, root,
    manifest.kind === V10_KIND ? '1.13.0-primary-app-server' : manifest.kind === V9_KIND ? '1.12.0-primary-saved' : manifest.kind === V8_KIND ? '1.11.0-primary-saved' : manifest.kind === 'ask_primary_scoring_version_v7' ? '1.10.0-primary-saved' : manifest.kind === 'ask_primary_scoring_version_v6' ? '1.9.0-primary-saved' : manifest.kind === 'ask_primary_scoring_version_v5' ? '1.8.0-primary-saved' : manifest.kind === 'ask_primary_scoring_version_v4' ? '1.7.0-primary-saved' : manifest.kind === 'ask_primary_scoring_version_v3' ? '1.6.0-primary-saved' : '1.5.0-primary-saved');
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
  verifyPrimaryScoringSemantics(fixtureId, fixture.frozen_source_root, { root, evaluationVersion: manifest.kind });
  return { selector: structuredClone(selector), scoring_version_id: manifest.scoring_version_id,
    ...(processing ? { processing: structuredClone(manifest.processing) } : {}),
    root: fixture.frozen_source_root, fixture: structuredClone(fixture) };
}
export function primaryProcessingSelection(block, { root = ROOT } = {}) {
  return block.grading?.scoring_version ? readPrimaryScoringVersion(block.grading.scoring_version, block.fixture_id, { root }).processing ?? null : null;
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
