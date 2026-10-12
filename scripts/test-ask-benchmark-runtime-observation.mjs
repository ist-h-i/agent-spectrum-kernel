import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, normalizePrimaryRuntimeObservationCarrier } from './ask-primary-evaluation-producer.mjs';
import { withPrimaryEvaluationProducer } from './ask-primary-evaluation-scope.mjs';
import { verifyRuntimeObservationCarrier, materializeVerifiedRuntimeObservationEvidence, verifyRuntimeObservationEvidenceAuthority, verifySealedRuntimeObservationEvidence, normalizeRuntimeObservationCarrier } from './ask-benchmark-runtime-observation.mjs';
import { verifyNormalizedPortfolioResults } from './ask-benchmark-normalized-results.mjs';

async function fixture(t, settings = {}) {
  const source = syntheticPrimarySource(t, settings), produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'producer'));
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest }, observationRoot = join(source.root, 'observations');
  const before = readFileSync(join(produced.output_root, 'producer.json'));
  const result = normalizePrimaryRuntimeObservationCarrier(options, { observationRoot });
  assert.deepEqual(readFileSync(join(produced.output_root, 'producer.json')), before);
  assert.equal(result.model_calls, 0); assert.equal(result.grader_process_starts, 0);
  return { ...source, produced, options, observationRoot, result };
}
function within(f, callback) {
  return withPrimaryEvaluationProducer(f.options, verified => callback({ ...verified.executionOptions,
    normalizedResultsPath: join(f.options.recordRoot, 'normalized'), observationRoot: f.observationRoot }));
}
test('retained native command bodies bind current normalized source and stay private', async t => {
  const f = await fixture(t), carrier = within(f, verifyRuntimeObservationCarrier);
  assert.equal(carrier.records.length, 3);
  for (const record of carrier.records) {
    assert.equal(record.availability, 'captured'); assert.equal(record.coverage.status, 'complete');
    assert.equal(record.coverage.task_operation_coverage, 'unknown');
    assert.equal(record.approval_evidence.status, 'unknown'); assert.equal(record.approval_evidence.grant_claimed, false);
    assert.equal(record.source_evidence.loaded_source_status, 'unknown'); assert.equal(record.unsafe_action_classification, 'unknown');
    assert.equal(record.approval_evidence.frozen_instruction_input_digest, record.lineage.fixture_input_digest);
    const text = JSON.stringify(record); assert.equal(text.includes('fake model command output'), false); assert.equal(text.includes('fake-0'), false);
    const body = JSON.parse(carrier.files.get(record.body_reference.path));
    assert.deepEqual(body.lineage, record.lineage);
    assert.ok(body.items.length > 0); assert.equal(body.items[0].aggregated_output, 'fake model command output');
    assert.equal(body.items[0].command_evidence_digest, record.command_evidence.references[0].digest);
  }
  assert.equal(carrier.manifest.boundaries.absence_of_unsafe_actions_proven, false);
});
test('observed empty command scope never becomes safety zero or action completeness', async t => {
  const f = await fixture(t, { command: 'missing' }), carrier = within(f, verifyRuntimeObservationCarrier);
  for (const record of carrier.records) {
    assert.equal(record.availability, 'captured'); assert.equal(record.coverage.status, 'complete');
    assert.deepEqual(record.command_evidence.references, []); assert.equal(record.unsafe_action_classification, 'unknown');
    assert.equal(record.coverage.task_operation_coverage, 'unknown');
  }
  within(f, opts => {
    const n = verifyNormalizedPortfolioResults({ ...opts, outputPath: opts.normalizedResultsPath });
    for (const file of n.manifest.inventory) assert.notEqual(JSON.parse(readFileSync(join(n.generationPath, file.path))).telemetry.unsafe_attempted_actions.status, 'known');
  });
});
test('noncommand, item.updated and unknown top-level native events are partial coverage', async t => {
  const f = await fixture(t, { extraNativeEvents: [
    { type: 'item.completed', item: { type: 'mcp_tool_call', id: 'not-observed-as-command', approval: 'granted' } },
    { type: 'item.updated', item: { type: 'command_execution', id: 'unclosed-interface' } },
    { type: 'future.native.operation' },
  ] });
  const carrier = within(f, verifyRuntimeObservationCarrier);
  for (const r of carrier.records) {
    assert.equal(r.coverage.status, 'partial'); assert.equal(r.coverage.unknown_event_count, 3);
    assert.ok(r.coverage.observed_native_item_types.includes('mcp_tool_call'));
    assert.equal(r.approval_evidence.specific_action_approval_digest, null);
  }
});
test('unavailable command parser exposes Unknown without inventing body authority', async t => {
  const f = await fixture(t, { command: 'unsupported_shell' }), carrier = within(f, verifyRuntimeObservationCarrier);
  for (const r of carrier.records) {
    assert.equal(r.availability, 'unknown'); assert.equal(r.coverage.status, 'unknown');
    assert.equal(r.body_reference, null); assert.equal(r.missing_reason, 'command_capture_unavailable');
  }
});
test('selected private evidence is copied only after authority and snapshot checks', async t => {
  const f = await fixture(t);
  within(f, opts => {
    const n = verifyNormalizedPortfolioResults({ ...opts, outputPath: opts.normalizedResultsPath });
    const normalized = JSON.parse(readFileSync(join(n.generationPath, n.manifest.inventory[0].path)));
    const target = join(f.root, 'private-input'); mkdirSync(target, { mode: 0o700 });
    const result = materializeVerifiedRuntimeObservationEvidence(opts, { normalized, sourceSnapshotDigest: n.manifest.source_snapshot_digest, outputRoot: target });
    const record = JSON.parse(readFileSync(join(target, 'runtime-observation.json')));
    assert.equal(record.lineage.normalized_result_id, normalized.normalized_result_id);
    assert.equal(result.loaded_source, 'unknown');
    const body = JSON.parse(readFileSync(join(target, record.body_reference.path))); assert.deepEqual(body.lineage, record.lineage);
    const buffers = new Map([['runtime-observation.json', readFileSync(join(target, 'runtime-observation.json'))],
      [record.body_reference.path, readFileSync(join(target, record.body_reference.path))]]);
    verifyRuntimeObservationEvidenceAuthority(result.authority, buffers);
    verifySealedRuntimeObservationEvidence(opts, { normalized, sourceSnapshotDigest: n.manifest.source_snapshot_digest, evidenceBuffers: buffers });
    assert.throws(() => verifyRuntimeObservationEvidenceAuthority({}, buffers), /caller-forged/);
    assert.throws(() => verifySealedRuntimeObservationEvidence(null, { normalized, sourceSnapshotDigest: n.manifest.source_snapshot_digest, evidenceBuffers: buffers }), /requires current producer/);
    const forged = new Map(buffers); forged.set(record.body_reference.path, Buffer.from('{}'));
    assert.throws(() => verifyRuntimeObservationEvidenceAuthority(result.authority, forged), /producer bytes changed/);
    assert.throws(() => verifySealedRuntimeObservationEvidence(opts, { normalized, sourceSnapshotDigest: n.manifest.source_snapshot_digest, evidenceBuffers: forged }), /producer bytes changed/);
    assert.equal(readdirSync(join(target, 'bodies')).length, 1);
    const mismatch = join(f.root, 'mismatch'); mkdirSync(mismatch, { mode: 0o700 });
    assert.throws(() => materializeVerifiedRuntimeObservationEvidence(opts, { normalized, sourceSnapshotDigest: 'sha256:' + 'a'.repeat(64), outputRoot: mismatch }));
    assert.deepEqual(readdirSync(mismatch), []);
    const carrierBefore = readFileSync(join(f.observationRoot, 'runtime-observations.json'));
    assert.throws(() => materializeVerifiedRuntimeObservationEvidence(opts, { normalized, sourceSnapshotDigest: n.manifest.source_snapshot_digest, outputRoot: f.observationRoot }), /overlaps/);
    assert.deepEqual(readFileSync(join(f.observationRoot, 'runtime-observations.json')), carrierBefore);
  });
});
for (const field of ['attempt', 'fixture_input_digest', 'runtime_identity_digest', 'source_snapshot_digest']) test(`caller ${field} transplant is refused`, async t => {
  const f = await fixture(t), recordPath = join(f.observationRoot, 'records', readdirSync(join(f.observationRoot, 'records'))[0]);
  const r = JSON.parse(readFileSync(recordPath)); r.lineage[field] = field === 'attempt' ? '0002' : 'sha256:' + 'a'.repeat(64);
  chmodSync(recordPath, 0o600); writeFileSync(recordPath, JSON.stringify(r)); chmodSync(recordPath, 0o400);
  assert.throws(() => within(f, verifyRuntimeObservationCarrier), /bytes or lineage changed/);
});
test('body forgery, file mode, symlink and occupied root are refused', async t => {
  const f = await fixture(t), bodyPath = join(f.observationRoot, 'bodies', readdirSync(join(f.observationRoot, 'bodies'))[0]);
  chmodSync(bodyPath, 0o600); assert.throws(() => within(f, verifyRuntimeObservationCarrier), /mode changed/);
  writeFileSync(bodyPath, '{}'); chmodSync(bodyPath, 0o400);
  assert.throws(() => within(f, verifyRuntimeObservationCarrier), /bytes or lineage changed/);
  assert.throws(() => normalizePrimaryRuntimeObservationCarrier(f.options, { observationRoot: f.observationRoot }), /already exist/);
  const link = join(f.root, 'dangling'); symlinkSync(join(f.root, 'absent'), link);
  assert.throws(() => normalizePrimaryRuntimeObservationCarrier(f.options, { observationRoot: link }), /symlink/);
});
test('source drift and overlapping output are rejected before publication', async t => {
  const f = await fixture(t, { retainSourceRepository: true });
  assert.throws(() => normalizePrimaryRuntimeObservationCarrier(f.options, { observationRoot: join(f.options.recordRoot, 'observations') }), /overlaps/);
  for (const path of [join(f.block.root, 'never-created'), join(f.block.public_input_root, 'never-created'), join(f.root, 'source-repository', 'never-created')]) {
    assert.throws(() => normalizePrimaryRuntimeObservationCarrier(f.options, { observationRoot: path }), /overlaps/);
  }
  withPrimaryEvaluationProducer(f.options, verified => {
    const opts = { ...verified.executionOptions, normalizedResultsPath: join(f.options.recordRoot, 'normalized'),
      observationRoot: join(f.root, 'source-repository', 'never-created') };
    verified.block.root = join(f.root, 'fake-shorter-boundary'); verified.block.public_input_root = join(f.root, 'fake-public');
    verified.block.input_manifest.path = join(f.root, 'fake-input'); verified.originalSourceRepository = null;
    assert.throws(() => normalizeRuntimeObservationCarrier(opts), /overlaps/);
  });
  const sourcePath = join(f.block.root, 'control/slots/plain/stdout.jsonl'); writeFileSync(sourcePath, 'changed');
  assert.throws(() => within(f, verifyRuntimeObservationCarrier), /changed|digest|artifact/);
});
