// Synthetic static copies only. No evaluator worker, model, start or resume.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { comparisonHash as hash } from './ask-user-comparison-prepare.mjs';
import { canonicalDigest } from './content-addressed-store.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { readPrimaryScoringVersion, primaryScoringRoot, verifyPrimaryScoringVersionResource } from './ask-primary-scoring-version.mjs';
import * as scoringVersion from './ask-primary-scoring-version.mjs';
import { preparePrimaryEvaluation } from './ask-primary-evaluation-prepare.mjs';
import { exportPrimaryEvaluationGradingRequest, primaryGradingSemanticQuality } from './ask-primary-evaluation-grading.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';
import { activePrimaryProducer, withPrimaryHistoricalEvaluatorResources, primaryEvaluatorDependencyGraphParameters } from './ask-primary-evaluation-scope.mjs';
import { runPrimaryEvaluationPrivateGrading } from './ask-primary-evaluation-private-grading.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url))), raw = value => `${JSON.stringify(value, null, 2)}\n`;
const json = path => JSON.parse(readFileSync(path));
const mode = (path, writable) => { const stat = lstatSync(path); if (stat.isDirectory()) { chmodSync(path, writable ? 0o700 : 0o500); for (const name of readdirSync(path)) mode(join(path, name), writable); } else chmodSync(path, writable ? 0o600 : 0o400); };
const processingFiles = ['scripts/ask-benchmark-command-evidence.mjs', 'scripts/ask-review-target-requirement.mjs',
  'benchmarks/schemas/primary-saved-v2-portfolio-command-evidence.schema.json',
  'benchmarks/schemas/primary-k2-saved-v2-portfolio-command-evidence.schema.json'];
function setup(t, { processingV2 = false, processingV3 = false } = {}) {
  const processing = processingV2 || processingV3, version = processingV3 ? 'v3' : 'v2';
  const sourcePaths = processingFiles.map(path => processingV3 ? path.replace('saved-v2-', 'saved-v3-') : path);
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'ask-scoring-version-'))), runtime = join(parent, 'runtime'), privateRoot = join(parent, 'private');
  mkdirSync(runtime); mkdirSync(privateRoot);
  t.after(() => { mode(parent, true); rmSync(parent, { recursive: true, force: true }); });
  for (const id of PRIMARY_FIXTURE_IDS) cpSync(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', id), join(runtime, 'benchmarks/fixtures/checkpoint-b2', id), { recursive: true });
  for (const name of ['portfolio-catalog', 'portfolio-policy-manifest', 'portfolio-scoring-policy']) cpSync(join(ROOT, 'benchmarks', `${name}.json`), join(runtime, 'benchmarks', `${name}.json`));
  mkdirSync(join(runtime, 'scripts')); cpSync(join(ROOT, 'scripts/ask-benchmark-portfolio-score.mjs'), join(runtime, 'scripts/ask-benchmark-portfolio-score.mjs'));
  if (processing) for (const path of sourcePaths) {
    mkdirSync(resolve(join(runtime, path), '..'), { recursive: true }); cpSync(join(ROOT, path), join(runtime, path));
  }
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
    writeFileSync(manifestPath, raw({ kind: processing ? `ask_primary_scoring_version_${version}` : 'ask_primary_scoring_version_v1',
      scoring_version_id: processing ? `synthetic-processing-${version}` : 'synthetic-successor-v1',
      ...(processing ? { processing: { command_evidence_parser_revision: processingV3 ? '1.6.0-primary-saved' : '1.5.0-primary-saved', review_recognition_revision: '2',
        source_file_digests: Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(join(runtime, path)))])) } } : {}), fixtures }));
    mode(runtime, false); mode(privateRoot, false); chmodSync(manifestPath, 0o400);
    return { path: manifestPath, digest: hash(readFileSync(manifestPath)) };
  };
  const mutate = (path, callback) => { const target = join(runtime, path); chmodSync(target, 0o600); const value = json(target); callback(value); writeFileSync(target, raw(value)); };
  return { parent, runtime, privateRoot, resource, seal, mutate, selector: seal() };
}
const id = PRIMARY_FIXTURE_IDS[0], base = `benchmarks/fixtures/checkpoint-b2/${id}`;
for (const processingV3 of [false, true]) test(`saved paired scoring ${processingV3 ? 'v3' : 'v2'} preparation retains all nine blocks per role with no dispatch`, async t => {
  const f = setup(t, { processingV2: !processingV3, processingV3 }), retained = join(f.parent, 'retained'); mkdirSync(retained);
  const roles = ['baseline', 'challenger'], blocks = {};
  for (const role of roles) blocks[role] = PRIMARY_FIXTURE_IDS.map(fixtureId => syntheticPrimarySource(t, { fixtureId }).block);
  const sourcePath = join(retained, 'paired-source.json'); writeFileSync(sourcePath, raw({ blocks }), { mode: 0o400 });
  const source = { path: sourcePath, digest: hash(readFileSync(sourcePath)) }, resources = {};
  for (const role of roles) {
    const path = join(f.parent, `resources-${role}.json`);
    writeFileSync(path, raw({ kind: 'ask_primary_grading_resources_v1', output_root: join(f.parent, `future-${role}`),
      fixtures: Object.fromEntries(PRIMARY_FIXTURE_IDS.map(fixtureId => [fixtureId, { frozenSourceRoot: f.runtime, ...f.resource }])) }), { mode: 0o400 });
    resources[role] = { path, digest: hash(readFileSync(path)) };
  }
  const args = { source, scoringVersion: f.selector, resources, retainedRoots: [retained], outputRoot: join(f.parent, 'prepared-saved-scoring') };
  const saved = await import('./ask-primary-saved-scoring.mjs');
  const prepared = await saved.preparePrimarySavedScoring(args);
  assert.equal(prepared.status, 'blocked'); // Synthetic static receipts are deliberately not admission.
  assert.equal(prepared.model_calls, 0); assert.equal(prepared.grader_process_starts, 0); assert.equal(prepared.producer_normalizations, 0);
  const options = { recordRoot: prepared.output_root, externalDigest: prepared.external_digest };
  const checked = await saved.verifyPrimarySavedScoringPreparation(options);
  assert.equal(checked.record.processing.command_evidence_parser_revision, processingV3 ? '1.6.0-primary-saved' : '1.5.0-primary-saved');
  assert.deepEqual(Object.keys(checked.record.blocks), roles);
  for (const role of roles) {
    assert.equal(checked.record.blocks[role].length, 9);
    assert.equal(existsSync(join(f.parent, `future-${role}`)), false);
  }
  assert.equal(checked.record.execution_permission, false); assert.equal(checked.record.formal_aggregate_eligible, false);
  assert.equal(JSON.stringify(checked.record).includes('synthetic static receipt'), false);
  assert.equal(hash(readFileSync(source.path)), source.digest);
  await assert.rejects(saved.gradePreparedPrimarySavedScoring(options), /blocked|not.ready|preflight/u);
  await t.test('overlapping output and missing primary source blocks refuse before writing', async () => {
    await assert.rejects(saved.preparePrimarySavedScoring({ ...args, outputRoot: retained }), /overlap|exists/u);
    const missing = join(retained, 'missing-block.json'); writeFileSync(missing, raw({ blocks: { ...blocks, baseline: blocks.baseline.slice(1) } }));
    await assert.rejects(saved.preparePrimarySavedScoring({ ...args, source: { path: missing, digest: hash(readFileSync(missing)) }, outputRoot: join(f.parent, 'missing-output') }), /nine|fixture|block/u);
    assert.equal(existsSync(join(f.parent, 'missing-output')), false);
  });
  await t.test('source and resource drift cannot reopen a preparation', async () => {
    const original = readFileSync(source.path); chmodSync(source.path, 0o600); writeFileSync(source.path, raw({ blocks, changed: true })); chmodSync(source.path, 0o400);
    await assert.rejects(saved.verifyPrimarySavedScoringPreparation(options), /source.*changed|digest/u);
    chmodSync(source.path, 0o600); writeFileSync(source.path, original); chmodSync(source.path, 0o400);
    const path = resources.baseline.path, bytes = readFileSync(path); chmodSync(path, 0o600); writeFileSync(path, 'changed synthetic resource'); chmodSync(path, 0o400);
    await assert.rejects(saved.verifyPrimarySavedScoringPreparation(options), /resource.*changed|digest/u);
    chmodSync(path, 0o600); writeFileSync(path, bytes); chmodSync(path, 0o400);
  });
  await t.test('a caller-repinned readiness label cannot start a grading worker', async () => {
    const path = join(prepared.output_root, 'preparation.json'), value = json(path); value.status = 'prepared';
    for (const role of roles) for (const item of value.preflights[role]) item.result.status = 'ready';
    writeFileSync(path, raw(value));
    const repinned = { recordRoot: prepared.output_root, externalDigest: hash(readFileSync(path)) };
    assert.equal((await saved.verifyPrimarySavedScoringPreparation(repinned)).status, 'prepared');
    await assert.rejects(saved.gradePreparedPrimarySavedScoring(repinned), /not.ready|preflight/u);
    for (const role of roles) assert.equal(existsSync(join(f.parent, `future-${role}`)), false);
  });
});
test('v2 pins public processing bytes and selects the new parser without changing v1', t => {
  const f = setup(t, { processingV2: true });
  const selected = readPrimaryScoringVersion(f.selector, id);
  assert.equal(selected.processing.command_evidence_parser_revision, '1.5.0-primary-saved');
  assert.equal(selected.processing.review_recognition_revision, '2');
  assert.deepEqual(Object.keys(selected.processing.source_file_digests).sort(), [...processingFiles].sort());
  assert.deepEqual(scoringVersion.primaryProcessingSelection({ fixture_id: id, grading: { scoring_version: f.selector } }), selected.processing);
  assert.equal(scoringVersion.primaryProcessingSelection({ fixture_id: id, grading: {} }), null);
  assert.equal(scoringVersion.primaryProcessingSelection({ fixture_id: id, grading: { scoring_version: setup(t).selector } }), null);
});
test('AC-VERSION an explicit v3 manifest pins parser 1.6 and saved-v3 sources for all nine tasks', t => {
  const f = setup(t, { processingV3: true });
  for (const fixtureId of PRIMARY_FIXTURE_IDS) {
    const selected = readPrimaryScoringVersion(f.selector, fixtureId, { verifyResourceFiles: true });
    assert.equal(selected.processing.command_evidence_parser_revision, '1.6.0-primary-saved');
    assert.equal(selected.processing.review_recognition_revision, '2');
    assert.deepEqual(Object.keys(selected.processing.source_file_digests).sort(), processingFiles.map(path => path.replace('saved-v2-', 'saved-v3-')).sort());
    assert.equal(selected.root, f.runtime);
    assert.equal(verifyPrimaryScoringVersionResource({ fixture_id: fixtureId, grading: { scoring_version: f.selector } }, { frozenSourceRoot: f.runtime, ...f.resource }).root, f.runtime);
  }
});
for (const version of ['v2', 'v3']) test(`AC-VERSION ${version} refuses a repinned kind/revision/schema/source mismatch`, t => {
  const f = setup(t, { processingV2: version === 'v2', processingV3: version === 'v3' }), path = f.selector.path, initial = readFileSync(path);
  for (const mutate of [
    value => { value.kind = version === 'v2' ? 'ask_primary_scoring_version_v3' : 'ask_primary_scoring_version_v2'; },
    value => { value.processing.command_evidence_parser_revision = version === 'v2' ? '1.6.0-primary-saved' : '1.5.0-primary-saved'; },
    value => { value.processing.command_evidence_parser_revision = 'future'; },
    value => { value.processing.review_recognition_revision = 'future'; },
    value => { const pins = value.processing.source_file_digests, key = Object.keys(pins).find(path => path.endsWith('.schema.json')); pins[key.replace(`saved-${version}-`, version === 'v2' ? 'saved-v3-' : 'saved-v2-')] = pins[key]; delete pins[key]; },
    value => { value.processing.source_file_digests['scripts/ask-benchmark-command-evidence.mjs'] = hash('forged parser'); },
    value => { value.processing.source_file_digests['scripts/new-processing-authority.mjs'] = hash('extra'); },
  ]) {
    const value = JSON.parse(initial); mutate(value); chmodSync(path, 0o600); writeFileSync(path, raw(value)); chmodSync(path, 0o400);
    assert.throws(() => readPrimaryScoringVersion({ path, digest: hash(readFileSync(path)) }, id));
  }
});
test('AC-VERSION fixed v3 selects the existing producer v3 and refuses old parser overrides before writing', async t => {
  const f = setup(t, { processingV3: true }), source = syntheticPrimarySource(t, { fixtureId: id });
  source.block.grading.scoring_version = f.selector;
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'fixed-v3-producer'));
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  assert.equal(verifyPrimaryEvaluationProducer(options).commandEvidenceParserRevision, '1.6.0-primary-saved');
  assert.equal(json(join(produced.output_root, 'producer.json')).kind, 'ask_primary_evaluation_producer_v3');
  for (const commandEvidenceParserRevision of ['1.4.0-primary-saved', '1.5.0-primary-saved']) {
    const output = join(source.root, `override-${commandEvidenceParserRevision}`);
    await assert.rejects(producePrimaryEvaluationArtifacts(source.block, output, { commandEvidenceParserRevision }), /selector override/u);
    assert.equal(existsSync(output), false);
  }
});
const nativePair = (command, name = 'auxiliary') => [
  { type: 'item.started', item: { id: name, type: 'command_execution', command, status: 'in_progress' } },
  { type: 'item.completed', item: { id: name, type: 'command_execution', command, status: 'completed', exit_code: 0 } },
];
for (const [label, command, events, available] of [
  ['bounded read', 'pass', nativePair('/bin/zsh -lc pwd'), true],
  ['failed check', 'failed', nativePair('/bin/zsh -lc pwd'), true],
  ['missing check', 'missing', nativePair('/bin/zsh -lc pwd'), true],
  ['unsafe write', 'pass', nativePair("/bin/zsh -lc 'touch stdout.jsonl'"), false],
  ['unknown operation', 'pass', [{ type: 'item.completed', item: { id: 'opaque', type: 'mcp_tool_call', status: 'completed' } }], false],
  ['ambiguous association', 'pass', [...nativePair('/bin/zsh -lc pwd'), nativePair('/bin/zsh -lc pwd')[1]], false],
]) test(`AC-CONSUMER fixed v3 ${label} retains only supported normalized verification`, async t => {
  const f = setup(t, { processingV3: true }), fixtureId = 'mn-doc-config-correction';
  const source = syntheticPrimarySource(t, { fixtureId, command, extraNativeEvents: events });
  source.block.grading.scoring_version = f.selector;
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'fixed-v3'));
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  assert.equal(verifyPrimaryEvaluationProducer(options).commandEvidenceParserRevision, '1.6.0-primary-saved');
  assert.equal(produced.model_calls, 0); assert.equal(produced.grader_process_starts, 0);
  const contract = json(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', fixtureId, 'verification-command-contract.json'));
  const commandId = contract.commands[0].command_id;
  for (const condition of ['plain', 'kernel_principles_v1', 'full_ask']) {
    const p = buildPrimaryEvaluationScoringInputs(options, { condition, frozenSourceRoot: f.runtime, ...f.resource }).normalizedResult.command_evidence;
    assert.equal(p.evidence_level, available ? 'executed' : 'unavailable');
    assert.deepEqual(p.succeeded_command_ids, available && command === 'pass' ? [commandId] : []);
    assert.deepEqual(p.failed_command_ids, available && command === 'failed' ? [commandId] : []);
    // A complete auxiliary stream is executed evidence, but supplies no missing
    // declared invocation. Capture availability is not verification success.
    assert.deepEqual(p.unavailable_command_ids, !available || command === 'missing' ? [commandId] : []);
  }
});
test('v2 refuses a self-consistently repinned different public helper', t => {
  const f = setup(t, { processingV2: true }), path = join(f.runtime, 'scripts/ask-review-target-requirement.mjs');
  mode(f.runtime, true); writeFileSync(path, 'export const syntheticForgedHelper = true;\n');
  const selector = f.seal();
  assert.throws(() => readPrimaryScoringVersion(selector, id), /processing source.*changed|processing source.*differs/u);
});
test('v2 refuses unsupported processing selectors even with a fresh external digest', t => {
  const f = setup(t, { processingV2: true }), path = f.selector.path;
  const initial = readFileSync(path);
  for (const mutate of [p => { p.command_evidence_parser_revision = 'future'; },
    p => { p.review_recognition_revision = 'future'; }, p => { p.automatic_admission = true; },
    p => { delete p.source_file_digests[processingFiles[0]]; }]) {
    const value = JSON.parse(initial); mutate(value.processing); chmodSync(path, 0o600); writeFileSync(path, raw(value)); chmodSync(path, 0o400);
    assert.throws(() => readPrimaryScoringVersion({ path, digest: hash(readFileSync(path)) }, id));
  }
});
test('the existing producer call derives v2 from the fixed selector and refuses an override before writing', async t => {
  const f = setup(t, { processingV2: true }), source = syntheticPrimarySource(t, { fixtureId: id });
  source.block.grading.scoring_version = f.selector;
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'selected-producer'));
  const verified = verifyPrimaryEvaluationProducer({ recordRoot: produced.output_root, externalDigest: produced.external_digest });
  assert.equal(verified.commandEvidenceParserRevision, '1.5.0-primary-saved');
  assert.equal(json(join(produced.output_root, 'producer.json')).kind, 'ask_primary_evaluation_producer_v2');
  const output = join(source.root, 'conflicting-producer');
  await assert.rejects(producePrimaryEvaluationArtifacts(source.block, output, { commandEvidenceParserRevision: '1.4.0-primary-saved' }), /selector override/u);
  assert.equal(readdirSync(source.root).includes('conflicting-producer'), false);
  const v3Output = join(source.root, 'conflicting-producer-v3');
  await assert.rejects(producePrimaryEvaluationArtifacts(source.block, v3Output, { commandEvidenceParserRevision: '1.6.0-primary-saved' }), /selector override/u);
  assert.equal(readdirSync(source.root).includes('conflicting-producer-v3'), false);
});
for (const commandEvidenceParserRevision of ['1.5.0-primary-saved', '1.6.0-primary-saved']) test(`an unbound offline ${commandEvidenceParserRevision} capture cannot start the private grading path`, async t => {
  const source = syntheticPrimarySource(t);
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'offline-producer'), { commandEvidenceParserRevision });
  const result = runPrimaryEvaluationPrivateGrading({ recordRoot: produced.output_root, externalDigest: produced.external_digest }, { condition: 'plain' });
  assert.equal(result.status, 'blocked'); assert.equal(result.grader_process_starts, 0); assert.equal(result.model_calls, 0); assert.equal(result.quality, null);
});
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
for (const processingV3 of [false, true]) test(`AC-CLOSURE historical ${processingV3 ? 'v3' : 'v2'} selection requires its exact schema types and helper edge`, t => {
  const f = setup(t, { processingV2: !processingV3, processingV3 });
  const referencePath = `${base}/evaluator-reference.json`, reference = json(join(f.runtime, referencePath));
  const identity = reference.evaluator_source_identity, graph = identity.dependency_graph;
  const selectedPaths = processingFiles.map(path => processingV3 ? path.replace('saved-v2-', 'saved-v3-') : path);
  const helper = 'scripts/ask-review-target-requirement.mjs';
  // Artificial projection tests only historical graph selection, not complete
  // source identity validity. Genuine derive/sealed/static-writer verification
  // is exercised separately in the source construction and writer suites.
  graph.entry_paths = [...graph.entry_paths, helper].sort();
  for (const path of selectedPaths) {
    const bytes = readFileSync(join(f.runtime, path));
    graph.node_inventory = graph.node_inventory.filter(node => node.path !== path);
    graph.node_inventory.push({ path, bytes: bytes.length, sha256: hash(bytes), file_type: path.endsWith('.schema.json') ? 'authority_data' : 'module',
      base_git_revision_bytes: bytes.length, base_git_revision_sha256: hash(bytes) });
  }
  const edge = { ...graph.edge_inventory.find(edge => edge.kind === 'private_entry_import'), to: helper, specifier: helper };
  edge.syntax_identity = `private_entry_import:${edge.from}:${helper}`; delete edge.edge_digest;
  graph.edge_inventory.push({ ...edge, edge_digest: canonicalDigest(edge) });
  const original = structuredClone(reference);
  const bind = edit => {
    const value = structuredClone(original), identity = value.evaluator_source_identity, graph = identity.dependency_graph;
    edit(graph); graph.node_inventory.sort((a, b) => a.path.localeCompare(b.path));
    graph.edge_inventory.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
    const { graph_digest, ...body } = graph; graph.graph_digest = canonicalDigest(body);
    identity.source_files = graph.node_inventory.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
    identity.source_tree_digest = canonicalDigest(identity.source_files);
    f.mutate(referencePath, current => Object.assign(current, value));
    const selector = f.seal();
    return { fixture_id: id, grading: { scoring_version: selector, binding: { fixture_id: id, profile_id: 'primary_single_shot_v1',
      input_manifest_digest: hash(readFileSync(join(f.runtime, base, 'input-manifest.json'))), evaluator_bundle_digest: value.evaluator_bundle_digest,
      scoring_input_freeze_digest: hash(readFileSync(join(f.runtime, base, 'scoring-input-freeze-manifest.json'))) } } };
  };
  const block = bind(() => {}), parameters = { root: f.runtime, baseRevision: reference.evaluator_revision, defaultParameters: {} };
  withPrimaryHistoricalEvaluatorResources(block, f.runtime, () => {
    const selected = primaryEvaluatorDependencyGraphParameters(parameters);
    for (const path of selectedPaths.filter(path => path.endsWith('.schema.json'))) assert.ok(selected.authorityPaths.includes(path));
    for (const path of selectedPaths.filter(path => path.endsWith('.schema.json')).map(path => path.replace(processingV3 ? 'saved-v3-' : 'saved-v2-', processingV3 ? 'saved-v2-' : 'saved-v3-'))) assert.equal(selected.authorityPaths.includes(path), false);
    assert.equal(activePrimaryProducer(), false);
  });
  assert.equal(primaryEvaluatorDependencyGraphParameters(parameters), null);
  const schema = selectedPaths.find(path => path.endsWith('.schema.json'));
  for (const [edit, reason] of [
    [graph => { graph.node_inventory = graph.node_inventory.filter(node => node.path !== schema); }, /processing_graph_source_missing/u],
    [graph => { graph.node_inventory.find(node => node.path === schema).file_type = 'json'; }, /processing_graph_source_missing/u],
    [graph => { graph.edge_inventory = graph.edge_inventory.filter(edge => edge.kind !== 'private_entry_import' || edge.to !== helper); }, /processing_graph_helper_edge_missing/u],
  ]) assert.throws(() => withPrimaryHistoricalEvaluatorResources(bind(edit), f.runtime, () => {}), reason);
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

const buildId = 'mn-build-option-update', buildMap = `benchmarks/fixtures/checkpoint-b2/${buildId}/evidence-map.json`;
test('build evidence-map allows only valid regenerated mutation asset digests', t => {
  const f = setup(t);
  f.mutate(buildMap, value => { for (const contract of value.mutation_contracts) contract.mutation_digest = hash(`new asset ${contract.mutation_id}`); });
  assert.equal(readPrimaryScoringVersion(f.seal(), buildId).root, f.runtime);
});
for (const [label, edit] of [
  ['malformed digest', value => value.mutation_contracts[0].mutation_digest = 'sha256:not-a-digest'],
  ['maps', value => value.maps[0].agent_visible_paths.pop()],
  ['scope', value => value.scope_boundary_authority.allowed_candidate_paths.push('workspace/extra')],
  ['recoverability state', value => value.mutation_contracts[0].expected_recoverability_state = 'recoverable'],
  ['admission state', value => value.mutation_contracts[0].expected_admission_result = 'pass'],
  ['mutation ID', value => value.mutation_contracts[0].mutation_id = 'replacement'],
  ['target ID', value => value.mutation_contracts[0].target_evidence_map_id = 'replacement'],
  ['schema', value => value.schema_version = '2.0.0'],
  ['extra criterion', value => value.mutation_contracts[0].new_rule = 'ignore'],
  ['missing contract', value => value.mutation_contracts.pop()],
]) test(`build evidence-map rebinding refuses changed ${label}`, t => {
  const f = setup(t); f.mutate(buildMap, edit); assert.throws(() => readPrimaryScoringVersion(f.seal(), buildId));
});
test('build evidence-map delta does not allow mutation identity changes in other fixtures', t => {
  const f = setup(t); f.mutate(`${base}/evidence-map.json`, value => value.mutation_contracts[0].mutation_digest = hash('other mutation'));
  assert.throws(() => readPrimaryScoringVersion(f.seal(), id), /preserved evidence-map/);
});
