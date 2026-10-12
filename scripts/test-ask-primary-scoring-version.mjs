// Synthetic static copies only. No evaluator worker, model, start or resume.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { comparisonHash as hash } from './ask-user-comparison-prepare.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { readPrimaryScoringVersion, primaryScoringRoot, verifyPrimaryScoringVersionResource } from './ask-primary-scoring-version.mjs';
import { preparePrimaryEvaluation } from './ask-primary-evaluation-prepare.mjs';
import { exportPrimaryEvaluationGradingRequest, primaryGradingSemanticQuality } from './ask-primary-evaluation-grading.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';
import { withPrimaryHistoricalEvaluatorResources, primaryEvaluatorDependencyGraphParameters } from './ask-primary-evaluation-scope.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url))), raw = value => `${JSON.stringify(value, null, 2)}\n`;
const json = path => JSON.parse(readFileSync(path));
const mode = (path, writable) => { const stat = lstatSync(path); if (stat.isDirectory()) { chmodSync(path, writable ? 0o700 : 0o500); for (const name of readdirSync(path)) mode(join(path, name), writable); } else chmodSync(path, writable ? 0o600 : 0o400); };
function setup(t) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'ask-scoring-version-'))), runtime = join(parent, 'runtime'), privateRoot = join(parent, 'private');
  mkdirSync(runtime); mkdirSync(privateRoot);
  t.after(() => { mode(parent, true); rmSync(parent, { recursive: true, force: true }); });
  for (const id of PRIMARY_FIXTURE_IDS) cpSync(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', id), join(runtime, 'benchmarks/fixtures/checkpoint-b2', id), { recursive: true });
  for (const name of ['portfolio-catalog', 'portfolio-policy-manifest', 'portfolio-scoring-policy']) cpSync(join(ROOT, 'benchmarks', `${name}.json`), join(runtime, 'benchmarks', `${name}.json`));
  mkdirSync(join(runtime, 'scripts')); cpSync(join(ROOT, 'scripts/ask-benchmark-portfolio-score.mjs'), join(runtime, 'scripts/ask-benchmark-portfolio-score.mjs'));
  const resource = { privateRoot, admissionReviewAuthoritySourceDigest: hash('synthetic static receipt') };
  for (const key of ['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath']) {
    resource[key] = join(privateRoot, key); writeFileSync(resource[key], 'synthetic static receipt');
  }
  const manifestPath = join(parent, 'scoring-version.json');
  const seal = () => {
    mode(runtime, true); mode(privateRoot, true);
    const fixtures = {};
    for (const id of PRIMARY_FIXTURE_IDS) {
      const base = `benchmarks/fixtures/checkpoint-b2/${id}`, freezePath = `${base}/scoring-input-freeze-manifest.json`, freeze = json(join(runtime, freezePath));
      const pins = Object.values(freeze).filter(value => value && typeof value === 'object' && value.path && value.raw_byte_digest);
      for (const pin of pins) pin.raw_byte_digest = hash(readFileSync(join(runtime, pin.path)));
      writeFileSync(join(runtime, freezePath), raw(freeze));
      const paths = [...pins.map(pin => pin.path), freezePath, `${base}/input-manifest.json`, `${base}/metadata.json`, `${base}/task.md`, `${base}/source-freeze-candidate.json`, `${base}/admission-review.json`, 'scripts/ask-benchmark-portfolio-score.mjs'];
      fixtures[id] = { frozen_source_root: runtime, selected: Object.fromEntries(paths.map(path => [path, hash(readFileSync(join(runtime, path)))])),
        resource: { ...resource }, resource_file_digests: Object.fromEntries(['manifestPath', 'admissionDecisionPath', 'admissionReviewAuthorityPath', 'admissionReviewArchivePath'].map(key => [key, hash(readFileSync(resource[key]))])) };
    }
    try { chmodSync(manifestPath, 0o600); } catch {}
    writeFileSync(manifestPath, raw({ kind: 'ask_primary_scoring_version_v1', scoring_version_id: 'synthetic-successor-v1', fixtures }));
    mode(runtime, false); mode(privateRoot, false); chmodSync(manifestPath, 0o400);
    return { path: manifestPath, digest: hash(readFileSync(manifestPath)) };
  };
  const mutate = (path, callback) => { const target = join(runtime, path); chmodSync(target, 0o600); const value = json(target); callback(value); writeFileSync(target, raw(value)); };
  return { parent, runtime, privateRoot, resource, seal, mutate, selector: seal() };
}
const id = PRIMARY_FIXTURE_IDS[0], base = `benchmarks/fixtures/checkpoint-b2/${id}`;
test('explicit version verifies all nine preserved semantics and resource identity; default stays old', t => {
  const f = setup(t);
  for (const fixtureId of PRIMARY_FIXTURE_IDS) {
    const selected = readPrimaryScoringVersion(f.selector, fixtureId);
    assert.equal(selected.root, f.runtime); assert.equal(selected.scoring_version_id, 'synthetic-successor-v1');
    const block = { fixture_id: fixtureId, grading: { scoring_version: f.selector } };
    assert.equal(primaryScoringRoot(block), f.runtime);
    assert.equal(verifyPrimaryScoringVersionResource(block, { frozenSourceRoot: f.runtime, ...f.resource }).root, f.runtime);
  }
  assert.equal(primaryScoringRoot({ fixture_id: id, grading: {} }), ROOT);
});
test('identity header regeneration allowed, while requirement items/output semantics remain unchanged', t => {
  const f = setup(t);
  f.mutate(`${base}/requirement-record.json`, value => { value.admission_record_digest = hash('new admission'); value.requirement_record_digest = hash('new record'); });
  f.mutate(`${base}/output-contract.json`, value => { value.evaluator_public_reference_digest = hash('new ref'); value.output_contract_digest = hash('new contract'); });
  f.mutate(`${base}/metadata.json`, value => { value.evaluator_bundle_id = 'new-bundle'; value.evaluator_bundle_digest = hash('new bundle'); });
  assert.equal(readPrimaryScoringVersion(f.seal(), id).root, f.runtime);
});
for (const [label, path, edit] of [
  ['requirement points', `${base}/requirement-record.json`, value => value.requirements[0].max_points++],
  ['requirement IDs', `${base}/requirement-record.json`, value => value.requirements[0].requirement_id = 'substitute'],
  ['partial credit', `${base}/requirement-record.json`, value => value.requirements[0].partial_credit_allowed = true],
  ['equivalence class', `${base}/requirement-record.json`, value => value.requirements[0].equivalence_class_ids = []],
  ['output profile', `${base}/output-contract.json`, value => value.result_profile.name = 'other'],
  ['output findings', `${base}/output-contract.json`, value => value.declares_findings = false],
  ['task class', `${base}/metadata.json`, value => value.task_class = 'trivial'],
  ['scoring policy', 'benchmarks/portfolio-scoring-policy.json', value => value.substitute = true],
  ['scope', `${base}/evidence-map.json`, value => value.scope_boundary_authority.allowed_candidate_paths.push('workspace/extra')],
]) test(`resealed manifest cannot authorize changed ${label}`, t => {
  const f = setup(t); f.mutate(path, edit); assert.throws(() => readPrimaryScoringVersion(f.seal(), id), /preserved/);
});
test('raw public/manifest/private changes and root/resource substitution rejected without fallback', t => {
  const f = setup(t), block = { fixture_id: id, grading: { scoring_version: f.selector } };
  assert.throws(() => readPrimaryScoringVersion({ ...f.selector, digest: hash('wrong') }, id), /manifest changed/);
  assert.throws(() => verifyPrimaryScoringVersionResource(block, { frozenSourceRoot: ROOT, ...f.resource }), /source substitution/);
  assert.throws(() => verifyPrimaryScoringVersionResource(block, { frozenSourceRoot: f.runtime, ...f.resource, manifestPath: f.resource.admissionDecisionPath }), /manifestPath substitution/);
  chmodSync(f.resource.manifestPath, 0o600); writeFileSync(f.resource.manifestPath, 'different'); chmodSync(f.resource.manifestPath, 0o400);
  assert.throws(() => verifyPrimaryScoringVersionResource(block, { frozenSourceRoot: f.runtime, ...f.resource }), /manifestPath changed/);
});
test('historical graph scope selects explicit version and refuses a different root; no producer authority', t => {
  const f = setup(t), ref = json(join(f.runtime, base, 'evaluator-reference.json'));
  const block = { fixture_id: id, grading: { scoring_version: f.selector, binding: { fixture_id: id, profile_id: 'primary_principles_v2_single_shot_v1',
    input_manifest_digest: hash(readFileSync(join(f.runtime, base, 'input-manifest.json'))), evaluator_bundle_digest: ref.evaluator_bundle_digest,
    scoring_input_freeze_digest: hash(readFileSync(join(f.runtime, base, 'scoring-input-freeze-manifest.json'))) } } };
  withPrimaryHistoricalEvaluatorResources(block, f.runtime, () => {
    const parameters = primaryEvaluatorDependencyGraphParameters({ root: f.runtime, baseRevision: ref.evaluator_revision, defaultParameters: {} });
    assert.equal(parameters.root, f.runtime); assert.equal(parameters.baseRevision, ref.evaluator_revision);
  });
  assert.equal(primaryEvaluatorDependencyGraphParameters({ root: f.runtime, baseRevision: ref.evaluator_revision, defaultParameters: {} }), null);
  assert.throws(() => withPrimaryHistoricalEvaluatorResources(block, ROOT, () => {}), /version_root_changed/);
});
test('model-free prepare binds explicit version in all blocks and exported readouts', t => {
  const f = setup(t), publicParent = join(f.parent, 'public'); mkdirSync(publicParent);
  for (const fixtureId of PRIMARY_FIXTURE_IDS) {
    const manifest = json(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', fixtureId, 'input-manifest.json'));
    for (const file of manifest.fixtures[fixtureId].files) {
      const target = join(publicParent, fixtureId, file.path); mkdirSync(join(target, '..'), { recursive: true });
      cpSync(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', fixtureId, file.path), target);
    }
  }
  const output = join(f.parent, 'prepared');
  const prepared = preparePrimaryEvaluation(publicParent, { output, evidenceKind: 'synthetic', scoringVersionPath: f.selector.path, scoringVersionDigest: f.selector.digest });
  assert.equal(prepared.model_calls, 0); assert.equal(prepared.old_ownership_diagnostics, 0);
  const manifest = json(prepared.manifest_path);
  for (const block of manifest.blocks) {
    assert.deepEqual(block.grading.scoring_version, f.selector);
    const exported = exportPrimaryEvaluationGradingRequest(block);
    assert.deepEqual(exported.request.scoring_version, f.selector); assert.deepEqual(exported.readout.scoring_version, f.selector);
    assert.equal(exported.request.quality, null); assert.equal(exported.request.grader_process_starts, 0);
    assert.ok(exported.request.slots.every(slot => slot.state === 'not_started'));
  }
});

test('completed grading with null quality remains unknown; partial and zero scores are preserved', () => {
  const required = ['plain', 'kernel_principles_v2', 'full_ask'];
  const conditions = required.map(condition => ({ condition, status: 'completed', quality: null }));
  assert.equal(primaryGradingSemanticQuality(conditions, required), 'unknown');
  conditions[0].quality = 0;
  assert.equal(primaryGradingSemanticQuality(conditions, required), 'partial');
  conditions[1].quality = 0.5; conditions[2].quality = 1;
  assert.equal(primaryGradingSemanticQuality(conditions, required), 'scored');
  conditions[1].status = 'blocked';
  assert.equal(primaryGradingSemanticQuality(conditions, required), 'partial');
});
test('retained synthetic producer and original scoring-input assembly retain selected successor root and reject substitution', async t => {
  const f = setup(t), source = syntheticPrimarySource(t, { kernelCondition: 'kernel_principles_v2' });
  source.block.grading.scoring_version = f.selector;
  const fixtureId = source.block.fixture_id, fixtureBase = `benchmarks/fixtures/checkpoint-b2/${fixtureId}`;
  source.block.grading.binding.scoring_input_freeze_digest = hash(readFileSync(join(f.runtime, fixtureBase, 'scoring-input-freeze-manifest.json')));
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'version-producer'));
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  assert.deepEqual(verifyPrimaryEvaluationProducer(options).request.scoring_version, f.selector);
  const runtime = { condition: 'plain', frozenSourceRoot: f.runtime, ...f.resource };
  const input = buildPrimaryEvaluationScoringInputs(options, runtime);
  assert.equal(input.scorerOptions.root, f.runtime); assert.equal(input.scoring_ready, false); assert.equal(input.grader_process_starts, 0);
  assert.throws(() => buildPrimaryEvaluationScoringInputs(options, { ...runtime, frozenSourceRoot: ROOT }), /source substitution/);
});
