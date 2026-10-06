import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { setup } from './test-helpers-ask-core-producer.mjs';
import { runCoreNativeConnection } from './ask-core-native-connection.mjs';
import { normalizeCoreConnectedResult } from './ask-core-connected-normalizer.mjs';
import { buildCoreDirectControllerRecord, inspectCoreControllerRecords } from './ask-core-controller-records.mjs';
import { produceCoreCaptureArtifacts, verifyCoreCaptureProducer, materializeCoreCaptureCandidate, buildCoreCaptureScoringInputs, createCoreCaptureSealedEvaluatorExecution } from './ask-core-capture-producer.mjs';
import { withCoreCaptureProducer, activeCoreProducer } from './ask-core-producer-scope.mjs';
import { coreGradingSchemaPath, assertCoreGradingVerified } from './ask-core-grading-authority.mjs';
import { digest } from './ask-core-bundle-product.mjs';

function records(head, task, evidenceClass = 'synthetic_fixture', captureDigest = 'sha256:'+'a'.repeat(64), requestDigest = 'sha256:'+'b'.repeat(64)) {
  const producerStdoutBytes = Buffer.from('synthetic producer transcript\n'), reviewerStdoutBytes = Buffer.from('synthetic independent reviewer transcript\n');
  const metadata = { evidence_class: evidenceClass, task_id: task, source_head: head, capture_digest: captureDigest, execution_request_digest: requestDigest, invocation: { executable: 'synthetic-controller', arguments: ['fixture-only'] }, started_ms: 100, completed_ms: 200 };
  const p = buildCoreDirectControllerRecord({ ...metadata, invocation_id: 'synthetic-producer', role: 'producer' }, producerStdoutBytes);
  const r = buildCoreDirectControllerRecord({ ...metadata, invocation_id: 'synthetic-reviewer', role: 'reviewer' }, reviewerStdoutBytes);
  const ownerBytes = Buffer.from(JSON.stringify({ kind: 'ask_core_direct_records_owner_acceptance_v1', decision: 'accept_custody', assurance: 'repository_owner_attested_controller_archive', cryptographic_provider_signature_present: false, purpose: 'derived_scoring_inputs_only_no_execution_permission', source_head: head, task_id: task, capture_digest: captureDigest, execution_request_digest: requestDigest, producer_record_digest: p.digest, reviewer_record_digest: r.digest, actual_invocation_role_task_associations_confirmed: true, independent_review_confirmed: true }) + '\n');
  return { producerRecordBytes: p.bytes, producerRecordDigest: p.digest, producerStdoutBytes, reviewerRecordBytes: r.bytes, reviewerRecordDigest: r.digest, reviewerStdoutBytes, ownerBytes, ownerDigest: digest(ownerBytes) };
}
async function produced(t, scenario = 'pass') {
  const s = setup(t);
  for (const c of ['plain', 'core', 'full']) s.options.scenarios[c] = scenario;
  const r = await runCoreNativeConnection(s.options), captureRoot = join(s.root, 'capture');
  const n = normalizeCoreConnectedResult(s.options.paths.evidence_root, r.result_digest, captureRoot);
  const input = { captureRoot, captureDigest: n.result_digest, preparationRoot: s.options.preparation, preparationDigest: s.options.preparationDigest, connectionRoot: s.options.paths.evidence_root, controllerRecords: records(s.request.git_head, n.fixture_id, 'synthetic_fixture', n.result_digest, n.execution_request_digest) };
  const output = produceCoreCaptureArtifacts(input, join(s.root, 'producer'));
  return { ...s, output, input, options: { recordRoot: output.output_root, externalDigest: output.external_digest } };
}

test('saved real-contract-shaped synthetic capture produces original normalizer, terminal candidate and scorer inputs, with no model/private calls', async t => {
  const p = await produced(t, 'command_success');
  assert.equal(p.output.evidence_class, 'synthetic_fixture');
  for (const condition of ['plain', 'core', 'full']) {
    const input = buildCoreCaptureScoringInputs(p.options, { condition });
    assert.equal(input.normalizedResult.lineage.condition, condition);
    assert.deepEqual(input.normalizedResult.command_evidence.succeeded_command_ids, ['session-key-focused-test']);
    assert.deepEqual(input.missing_inputs, ['privateRoot', 'privateEvaluationRoot', 'frozenSourceRoot']);
    assert.deepEqual(input.missing_observations, []);
    assert.equal(input.normalizedResult.telemetry.input_tokens.value, 100);
    assert.equal(input.normalizedResult.telemetry.output_tokens.value, 1);
    assert.equal(input.normalizedResult.telemetry.cached_tokens.value, 0);
    assert.equal(input.normalizedResult.telemetry.thermal_state.status, 'unknown');
    assert.equal(input.model_calls, 0); assert.equal(input.grader_process_starts, 0); assert.equal(input.scoring_ready, false);
    const parent = join(p.root, 'candidate-' + condition); mkdirSync(parent, { mode: 0o700 });
    const candidate = materializeCoreCaptureCandidate(p.options, { condition, outputParent: parent });
    assert.equal(candidate.verified_authority.normalized_result.lineage.condition, condition);
    assert.deepEqual(readFileSync(join(candidate.output_root, 'workspace', 'src', 'session-key.mjs')), readFileSync(join(p.input.captureRoot, 'task-snapshots', condition, 'workspace', 'src', 'session-key.mjs')));
    assert.equal(existsSync(join(candidate.output_root, 'AGENTS.md')), false);
  }
  rmSync(p.input.preparationRoot, { recursive: true }); rmSync(p.input.connectionRoot, { recursive: true }); rmSync(p.input.captureRoot, { recursive: true });
  assert.equal(verifyCoreCaptureProducer(p.options).evidence_class, 'synthetic_fixture');
  assert.equal(buildCoreCaptureScoringInputs(p.options, { condition: 'core', privateRoot: '/unopened/private-input', privateEvaluationRoot: '/unopened/grader-output', frozenSourceRoot: '/unopened/frozen-source' }).status, 'private_evaluation_artifacts_pending');
});

for (const [scenario, field] of [['pass', 'unavailable_command_ids'], ['command_failure', 'failed_command_ids'], ['command_declined', 'declined_command_ids']]) {
  test(`capture success does not replace ${scenario} verification command evidence`, async t => {
    const p = await produced(t, scenario), input = buildCoreCaptureScoringInputs(p.options, { condition: 'core' });
    assert.deepEqual(input.normalizedResult.command_evidence[field], ['session-key-focused-test']);
    assert.deepEqual(input.normalizedResult.command_evidence.succeeded_command_ids, []);
    assert.throws(() => createCoreCaptureSealedEvaluatorExecution(p.options, { condition: 'core', privateRoot: '/must-not-open/private', privateEvaluationRoot: '/must-not-open/output', frozenSourceRoot: '/must-not-open/source', manifestPath: '/must-not-open/private/manifest.json' }), /commands_or_outcome_not_verified/);
  });
}

test('producer scope preserves legacy defaults, cannot grade or leak into async descendants, and rechecks original artifacts', async t => {
  const p = await produced(t), verified = verifyCoreCaptureProducer(p.options);
  const legacy = '/example/benchmarks/schemas/normalized-portfolio-result.schema.json';
  assert.equal(coreGradingSchemaPath(legacy), legacy);
  withCoreCaptureProducer(p.options, () => { assert.match(coreGradingSchemaPath(legacy), /core-normalized/); assert.throws(() => assertCoreGradingVerified({}), /cannot_authorize_scoring/); });
  assert.equal(activeCoreProducer(), null);
  let descendant;
  withCoreCaptureProducer(p.options, () => { assert.equal(typeof activeCoreProducer(), 'boolean'); descendant = new Promise(resolve => queueMicrotask(() => resolve(activeCoreProducer()))); });
  assert.equal(await descendant, null);
  assert.throws(() => withCoreCaptureProducer(p.options, () => Promise.resolve()), /async_scope/);
  assert.equal(activeCoreProducer(), null);
  const requestPath = join(p.output.output_root, 'run', 'cases', verified.inspection.cases[0].entry.case_id, 'attempts', '0001', 'request.json');
  const original = readFileSync(requestPath), changed = JSON.parse(original); changed.origin = 'native-original-execution'; writeFileSync(requestPath, JSON.stringify(changed) + '\n');
  assert.throws(() => verifyCoreCaptureProducer(p.options), /inventory_changed/);
  const manifestPath = join(p.output.output_root, 'producer.json'), manifest = JSON.parse(readFileSync(manifestPath));
  const path = requestPath.slice(p.output.output_root.length + 1), bytes = readFileSync(requestPath); manifest.artifact_inventory[path] = { bytes: bytes.length, digest: digest(bytes) };
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
  assert.throws(() => verifyCoreCaptureProducer({ ...p.options, externalDigest: digest(readFileSync(manifestPath)) }), /derived_record_changed/);
});

test('allowed task mutation reconstructs captured bytes and makes no claim that commands passed', async t => {
  const p = await produced(t, 'allowed_mutation'), parent = join(p.root, 'mutated-candidate'); mkdirSync(parent, { mode: 0o700 });
  const candidate = materializeCoreCaptureCandidate(p.options, { condition: 'core', outputParent: parent });
  assert.equal(readFileSync(join(candidate.output_root, 'workspace', 'test', 'session-key.test.mjs'), 'utf8'), '// synthetic scope-only change\n');
  assert.deepEqual(buildCoreCaptureScoringInputs(p.options, { condition: 'core' }).normalizedResult.command_evidence.succeeded_command_ids, []);
});

test('direct stdout associations need bounded external digests, separate roles, exact task/HEAD and explicit owner custody', () => {
  const head = 'a'.repeat(40), task = 'mn-focused-regression-test', input = records(head, task);
  assert.equal(inspectCoreControllerRecords(input, { expectedHead: head, expectedTask: task, expectedCaptureDigest: 'sha256:'+'a'.repeat(64), expectedRequestDigest: 'sha256:'+'b'.repeat(64), evidenceClass: 'synthetic_fixture' }).producer.role, 'producer');
  for (const key of ['producerRecordDigest', 'reviewerRecordDigest', 'ownerDigest']) assert.throws(() => inspectCoreControllerRecords({ ...input, [key]: 'sha256:' + 'b'.repeat(64) }, { expectedHead: head, expectedTask: task, expectedCaptureDigest: 'sha256:'+'a'.repeat(64), expectedRequestDigest: 'sha256:'+'b'.repeat(64), evidenceClass: 'synthetic_fixture' }));
  for (const [key, value] of [['source_head', 'b'.repeat(40)], ['task_id', 'foreign-task'], ['independent_review_confirmed', false], ['actual_invocation_role_task_associations_confirmed', false], ['purpose', 'allow_model_execution']]) {
    const owner = JSON.parse(input.ownerBytes); owner[key] = value; const ownerBytes = Buffer.from(JSON.stringify(owner));
    assert.throws(() => inspectCoreControllerRecords({ ...input, ownerBytes, ownerDigest: digest(ownerBytes) }, { expectedHead: head, expectedTask: task, expectedCaptureDigest: 'sha256:'+'a'.repeat(64), expectedRequestDigest: 'sha256:'+'b'.repeat(64), evidenceClass: 'synthetic_fixture' }));
  }
});
