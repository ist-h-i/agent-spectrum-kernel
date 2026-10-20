// Opt-in derivative of existing verified evidence. No process, model, grader or
// additional native observer is started here. Bodies must stay private.
import assert from 'node:assert/strict';
import { mkdirSync, lstatSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { inspectVerifiedPortfolioExecution } from './ask-benchmark-execution.mjs';
import { verifyNormalizedPortfolioResults } from './ask-benchmark-normalized-results.mjs';
import { readStableFile, assertStableFileEvidence } from './ask-benchmark-stable-file.mjs';
import { assertAtomicOutputAbsent, assertNoSymlinkPathSegments } from './ask-benchmark-atomic-publication.mjs';
import { assertBenchmarkSchemaInstance } from './ask-benchmark-schema.mjs';
import { activePrimaryProducer, primaryRuntimeObservationSourceRoots } from './ask-primary-evaluation-scope.mjs';

export const RUNTIME_OBSERVATION_VERSION = '1.0.0';
export const RUNTIME_OBSERVATION_SCHEMA_PATH = 'benchmarks/schemas/runtime-observation-carrier.schema.json';
export const PRIVATE_RUNTIME_OBSERVATION_PATH = 'runtime-observation.json';
const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const INPUT_AUTHORITIES = new WeakMap();
const MAX_BYTES = 16 * 1024 * 1024;
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const inside = (a, b) => b === a || b.startsWith(a + sep);

function assertOutputBoundary(options, path) {
  const output = resolve(path);
  for (const source of [SOURCE_ROOT, options.root, options.planPath, options.materializedPath, options.selectionState,
    options.runDir, options.normalizedResultsPath, ...primaryRuntimeObservationSourceRoots()]) {
    if (source && (inside(resolve(source), output) || inside(output, resolve(source)))) throw new Error('runtime observation root overlaps input authority');
  }
  return output;
}

function privateDirectory(path) {
  assertNoSymlinkPathSegments(path, 'runtime observation directory');
  const stat = lstatSync(path);
  assert.ok(stat.isDirectory() && (stat.mode & 0o777) === 0o700 && stat.uid === process.getuid(), 'runtime observation directory must be private');
}

function readPrivate(path) {
  const value = readStableFile(path, 'runtime observation private file', MAX_BYTES, { allowEmpty: false });
  assert.equal(value.evidence.finalPath.mode, 0o400, 'runtime observation file mode changed');
  assert.equal(value.evidence.finalPath.nlink, 1, 'runtime observation file must not be hardlinked');
  assert.equal(lstatSync(path).uid, process.getuid(), 'runtime observation file owner changed');
  return value;
}

function retainedCommandBodies(attempt, lineage) {
  const manifest = attempt.commandEvidence;
  if (!activePrimaryProducer() || !Buffer.isBuffer(attempt.nativeEventStream)) return { body: null, reason: 'retained_native_stream_unavailable', types: [], unknownCount: null };
  const stream = attempt.nativeEventStream;
  assert.equal(hash(stream), manifest.stream.digest, 'runtime observation native stream digest changed');
  assert.equal(stream.length, manifest.stream.bytes, 'runtime observation native stream bytes changed');
  if (manifest.capture.evidence_level !== 'executed') return { body: null, reason: 'command_capture_unavailable', types: [], unknownCount: null };
  let events;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(stream);
    assert.ok(text.endsWith('\n') || stream.length === 0);
    events = text.split('\n').filter(Boolean).map(line => parseJsonRejectDuplicateKeys(line));
  } catch {
    return { body: null, reason: 'retained_stream_not_closed_jsonl', types: [], unknownCount: null };
  }
  const types = new Set(); let unknownCount = 0;
  for (const event of events) {
    if (['thread.started', 'turn.completed'].includes(event.type)) continue;
    const type = event.item?.type;
    types.add(typeof type === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(type) ? type : 'unrecognized');
    if (!['item.started', 'item.completed'].includes(event.type) || type !== 'command_execution') unknownCount++;
  }
  const items = manifest.commands.map(command => {
    const started = events[command.event_sequence.started - 1], completed = events[command.event_sequence.completed - 1];
    assert.equal(started?.type, 'item.started'); assert.equal(completed?.type, 'item.completed');
    assert.equal(started.item.type, 'command_execution'); assert.equal(completed.item.type, 'command_execution');
    assert.equal(hash(Buffer.from(started.item.id)), command.runtime_item_id_digest);
    assert.equal(completed.item.id, started.item.id);
    const output = completed.item.aggregated_output ?? '';
    assert.equal(hash(Buffer.from(output)), command.aggregated_output.digest);
    assert.equal(Buffer.byteLength(output), command.aggregated_output.bytes);
    return { command_evidence_id: command.command_evidence_id, command_evidence_digest: command.command_evidence_digest,
      runtime_item_id_digest: command.runtime_item_id_digest, event_sequence: command.event_sequence,
      command: completed.item.command ?? started.item.command, aggregated_output: output };
  });
  const body = bytes({ schema_version: RUNTIME_OBSERVATION_VERSION, origin: 'verified_retained_native_command_transport', lineage, items });
  if (body.length > MAX_BYTES) return { body: null, reason: 'private_body_byte_limit', types: [...types].sort(), unknownCount };
  return { body, reason: null, types: [...types].sort(), unknownCount };
}

function derive(options) {
  // Always current verification. A snapshot-only normalized check is not a
  // substitute for re-inspecting the actual execution and retained producer.
  const inspection = inspectVerifiedPortfolioExecution(options);
  const normalized = verifyNormalizedPortfolioResults({ ...options, outputPath: options.normalizedResultsPath, sourceSnapshotDigest: null });
  const files = new Map(), records = [];
  for (const c of normalized.manifest.cases) for (const ref of c.normalized_attempts) {
    const raw = readStableFile(join(normalized.generationPath, ref.path), 'runtime observation normalized source', MAX_BYTES).bytes;
    const record = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
    assert.equal(record.normalized_result_id, ref.normalized_result_id);
    assert.equal(record.normalized_result_digest, ref.normalized_result_digest);
    const inspected = inspection.cases.find(item => item.entry.case_id === c.case_id);
    const attempt = inspected?.attempts.find(item => item.attempt === ref.attempt); assert.ok(attempt);
    const l = record.lineage, lineage = {
      run_instance_id: l.run_instance_id, case_id: l.case_id, attempt: l.attempt, fixture_id: l.fixture_id,
      fixture_input_digest: l.fixture_input_digest, condition: l.condition, adapter: l.adapter_track,
      runtime_identity_digest: l.runtime_identity_digest, environment_snapshot_digest: l.environment_snapshot_digest,
      request_digest: l.request_digest, raw_result_digest: l.raw_result_digest, terminal_commit_digest: l.terminal_commit_digest,
      normalized_result_id: record.normalized_result_id, normalized_result_digest: record.normalized_result_digest,
      source_snapshot_digest: normalized.manifest.source_snapshot_digest,
    };
    const retained = retainedCommandBodies(attempt, lineage), bodyPath = `bodies/${record.normalized_result_id}.json`;
    const base = { schema_version: RUNTIME_OBSERVATION_VERSION, schema_path: RUNTIME_OBSERVATION_SCHEMA_PATH,
      origin: 'verified_execution_and_normalized_snapshot', lineage,
      availability: retained.body ? 'captured' : 'unknown', support: attempt.commandEvidence.capture.support,
      missing_reason: retained.reason, parser_revision: attempt.commandEvidence.capture.parser_revision,
      coverage: { scope_id: 'codex-command-execution-items-v1', status: retained.body ? retained.unknownCount === 0 ? 'complete' : 'partial' : 'unknown',
        observed_native_item_types: retained.types, unknown_event_count: retained.unknownCount, task_operation_coverage: 'unknown' },
      // The performance carrier keeps its historical closed reference projection.
      // v8 action authority remains in the separately verified normalized record.
      command_evidence: { manifest_digest: attempt.commandEvidence.manifest_digest, references: record.command_evidence.references.map(({ unsafe_action_category: _category, ...reference }) => reference) },
      approval_evidence: { status: 'unknown', specific_action_approval_digest: null, frozen_instruction_input_digest: l.fixture_input_digest, grant_claimed: false },
      source_evidence: { basis: 'verified_snapshot_endpoints', terminal_workspace_authority_digest: l.terminal_workspace_authority_digest,
        terminal_workspace_tree_digest: l.terminal_workspace_tree_digest, loaded_source_status: 'unknown' },
      body_reference: retained.body ? { path: bodyPath, digest: hash(retained.body), bytes: retained.body.length } : null,
      unsafe_action_classification: 'unknown', privacy: { raw_command_public: false, raw_output_public: false, raw_native_id_public: false, absolute_paths_public: false } };
    const value = { ...base, observation_digest: canonicalDigest(base) };
    assertBenchmarkSchemaInstance(value, { schemaPath: join(SOURCE_ROOT, RUNTIME_OBSERVATION_SCHEMA_PATH), label: 'runtime observation carrier' });
    files.set(`records/${record.normalized_result_id}.json`, bytes(value));
    if (retained.body) files.set(bodyPath, retained.body);
    records.push(value);
  }
  const inventory = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, raw]) => ({ path, digest: hash(raw), bytes: raw.length }));
  const sourcePins = ['scripts/ask-benchmark-runtime-observation.mjs', RUNTIME_OBSERVATION_SCHEMA_PATH].map(path => ({ path, digest: hash(readStableFile(join(SOURCE_ROOT, path), 'runtime observation processing source', MAX_BYTES).bytes) }));
  const manifestBase = { schema_version: RUNTIME_OBSERVATION_VERSION, kind: 'ask_verified_runtime_observation_carrier_v1',
    source_snapshot_digest: normalized.manifest.source_snapshot_digest, normalized_run_digest: normalized.manifest.normalized_run_digest,
    source_pins: sourcePins, inventory, record_count: records.length,
    boundaries: { model_calls: 0, grader_process_starts: 0, scoring_ready: false, absence_of_unsafe_actions_proven: false, loaded_source_proven: false } };
  const manifest = { ...manifestBase, manifest_digest: canonicalDigest(manifestBase) };
  files.set('runtime-observations.json', bytes(manifest));
  return { files, records, manifest };
}

function inventory(root) {
  const files = new Map();
  const visit = (path, prefix = '') => {
    privateDirectory(path);
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name), relative = prefix + name, stat = lstatSync(full);
      assert.ok(!stat.isSymbolicLink(), 'runtime observation symlink refused');
      if (stat.isDirectory()) { assert.ok(['records', 'bodies'].includes(relative), 'runtime observation directory inventory changed'); visit(full, relative + '/'); }
      else { assert.ok(stat.isFile(), 'runtime observation unsupported file'); files.set(relative, readPrivate(full)); }
    }
  };
  visit(root); return files;
}

export function verifyRuntimeObservationCarrier(options) {
  const output = assertOutputBoundary(options, options.observationRoot);
  const expected = derive(options), before = inventory(output);
  assert.deepEqual([...before.keys()].sort(), [...expected.files.keys()].sort(), 'runtime observation inventory changed');
  for (const [path, raw] of expected.files) assert.deepEqual(before.get(path).bytes, raw, 'runtime observation bytes or lineage changed');
  const afterSource = derive(options);
  for (const [path, raw] of expected.files) assert.deepEqual(afterSource.files.get(path), raw, 'runtime observation source changed during verification');
  const after = inventory(output);
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [path, value] of before) assertStableFileEvidence(value, after.get(path), 'runtime observation private custody');
  return expected;
}

export function normalizeRuntimeObservationCarrier(options) {
  const output = assertOutputBoundary(options, options.observationRoot);
  assertAtomicOutputAbsent(output, 'runtime observation output');
  const expected = derive(options);
  mkdirSync(output, { mode: 0o700 });
  try {
    for (const [path, raw] of expected.files) {
      const target = join(output, path); if (dirname(target) !== output) mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, raw, { flag: 'wx', mode: 0o400 });
    }
    verifyRuntimeObservationCarrier(options);
  } catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
  return { observation_root: output, manifest_digest: expected.manifest.manifest_digest, record_count: expected.records.length, model_calls: 0, grader_process_starts: 0 };
}

function selectedInputAuthority(verified, { normalized, sourceSnapshotDigest }) {
  const record = verified.records.find(value => value.lineage.normalized_result_id === normalized.normalized_result_id);
  assert.ok(record, 'runtime observation selected normalized result missing');
  assert.equal(record.lineage.normalized_result_digest, normalized.normalized_result_digest);
  assert.equal(record.lineage.source_snapshot_digest, sourceSnapshotDigest);
  for (const field of ['run_instance_id', 'case_id', 'attempt', 'fixture_id', 'fixture_input_digest', 'condition', 'runtime_identity_digest', 'environment_snapshot_digest', 'request_digest', 'raw_result_digest', 'terminal_commit_digest']) assert.equal(record.lineage[field], normalized.lineage[field], `runtime observation selected ${field} changed`);
  const selected = new Map([[PRIVATE_RUNTIME_OBSERVATION_PATH, bytes(record)]]);
  if (record.body_reference) selected.set(record.body_reference.path, verified.files.get(record.body_reference.path));
  const authority = Object.freeze({});
  INPUT_AUTHORITIES.set(authority, new Map([...selected].map(([path, raw]) => [path, Buffer.from(raw)])));
  return { record, selected, authority };
}

// A module-owned token bridges verified producer bytes into the existing seal.
// A caller-supplied digest/Map cannot mint one. This function grants no execution.
export function verifyRuntimeObservationEvidenceAuthority(authority, evidenceBuffers) {
  const expected = INPUT_AUTHORITIES.get(authority);
  assert.ok(expected, 'runtime observation input authority missing or caller-forged');
  const actualPaths = [...evidenceBuffers.keys()].filter(path => path === PRIVATE_RUNTIME_OBSERVATION_PATH || path.startsWith('bodies/')).sort();
  assert.deepEqual(actualPaths, [...expected.keys()].sort(), 'runtime observation sealed inventory changed');
  for (const [path, raw] of expected) assert.deepEqual(evidenceBuffers.get(path), raw, 'runtime observation producer bytes changed before or after sealing');
}

export function verifySealedRuntimeObservationEvidence(options, { normalized, sourceSnapshotDigest, evidenceBuffers }) {
  const present = evidenceBuffers.has(PRIVATE_RUNTIME_OBSERVATION_PATH) || [...evidenceBuffers.keys()].some(path => path.startsWith('bodies/'));
  if (options === null) { assert.ok(!present, 'sealed runtime observation requires current producer authority'); return; }
  const verified = verifyRuntimeObservationCarrier(options);
  const { authority } = selectedInputAuthority(verified, { normalized, sourceSnapshotDigest });
  verifyRuntimeObservationEvidenceAuthority(authority, evidenceBuffers);
}

export function materializeVerifiedRuntimeObservationEvidence(options, { normalized, sourceSnapshotDigest, outputRoot }) {
  const verified = verifyRuntimeObservationCarrier(options), { record, selected, authority } = selectedInputAuthority(verified, { normalized, sourceSnapshotDigest });
  privateDirectory(outputRoot);
  assertOutputBoundary(options, outputRoot);
  const output = resolve(outputRoot), original = resolve(options.observationRoot);
  assert.ok(!inside(output, original) && !inside(original, output), 'runtime observation copy overlaps its original carrier');
  assertAtomicOutputAbsent(join(outputRoot, PRIVATE_RUNTIME_OBSERVATION_PATH), 'sealed runtime observation output');
  if (record.body_reference) {
    const bodyDirectory = join(outputRoot, 'bodies');
    assertAtomicOutputAbsent(bodyDirectory, 'sealed runtime observation body directory');
    mkdirSync(bodyDirectory, { mode: 0o700 });
  }
  for (const [path, raw] of selected) assertAtomicOutputAbsent(join(outputRoot, path), 'sealed runtime observation output');
  for (const [path, raw] of selected) writeFileSync(join(outputRoot, path), raw, { flag: 'wx', mode: 0o400 });
  // Recheck original authority after the copy; callers must not proceed to seal
  // the evaluation input if retained source changed while copying.
  verifyRuntimeObservationCarrier(options);
  for (const [path, raw] of selected) assert.deepEqual(readPrivate(join(outputRoot, path)).bytes, raw);
  return { authority, observation_digest: record.observation_digest, command_references: record.command_evidence.references,
    availability: record.availability, coverage: record.coverage, specific_action_approval: 'unknown', loaded_source: 'unknown' };
}
