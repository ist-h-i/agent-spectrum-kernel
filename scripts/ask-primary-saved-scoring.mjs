// Preparation is read-only apart from a new record directory. No normalization,
// worker, model, provider, comparison start/resume or CAS mutation occurs there.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { inspectPrimaryEvaluationSource, primaryProducerSources } from './ask-primary-evaluation-producer.mjs';
import { createPrimaryEvaluationGradingAdapter } from './ask-primary-evaluation-grading.mjs';
import { primaryScoringRoot, readPrimaryScoringVersion, verifyPrimaryScoringVersionResource } from './ask-primary-scoring-version.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url))), ENTRY = 'scripts/ask-primary-saved-scoring.mjs';
const ROLES = ['baseline', 'challenger'], LIMIT = 32 * 1024 * 1024;
const hash = raw => `sha256:${createHash('sha256').update(raw).digest('hex')}`;
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'closed saved scoring fields required');
const overlap = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const read = path => readStableFile(path, 'saved primary scoring input', LIMIT);
const json = path => parseJsonRejectDuplicateKeys(read(path).bytes.toString('utf8'));
function canonical(path) { assert.equal(resolve(path), path); assert.equal(realpathSync(path), path, 'saved scoring symlink refused'); return path; }
function reference(value, label) {
  keys(value, ['path', 'digest']); canonical(value.path); assert.match(value.digest, /^sha256:[a-f0-9]{64}$/u);
  const checked = read(value.path); assert.equal(hash(checked.bytes), value.digest, `${label} digest changed`);
  return { value: parseJsonRejectDuplicateKeys(checked.bytes.toString('utf8')), mode: checked.evidence.finalPath.mode };
}
function inputFields(input) {
  keys(input, ['source', 'scoringVersion', 'resources', 'retainedRoots']); keys(input.resources, ROLES);
  assert.ok(Array.isArray(input.retainedRoots) && input.retainedRoots.length, 'explicit retained roots required');
  for (const path of input.retainedRoots) assert.ok(lstatSync(canonical(path)).isDirectory(), 'retained root must be a directory');
}
function closedSource(source) {
  const request = source.request;
  return request.controller.state === 'available' && request.controller.start_consumed === true
    && request.slots.length === request.conditions.length && request.slots.every(slot => slot.terminal_digest
      && slot.controller_checkpoint_digest === slot.terminal_digest && slot.process_completed === true && slot.unresolved_child === false);
}
function pinSource(source) {
  return { request_digest: source.request_digest, snapshot_digest: source.snapshot_digest, references: source.references,
    source_repository: source.source_repository, source_closed: closedSource(source),
    conditions: source.request.conditions, evidence_kind: source.request.evidence_kind };
}
const implementation = () => ({ ...primaryProducerSources(), [ENTRY]: hash(read(join(ROOT, ENTRY)).bytes) });

/** Bind all original nine blocks for both roles. Source labels grant no authority:
 * each block is re-exported/inspected through the existing retained-byte reader. */
async function inputs(input, outputRoot) {
  inputFields(input); canonical(dirname(outputRoot)); assert.equal(resolve(outputRoot), outputRoot);
  const original = reference(input.source, 'saved source'), grouped = original.value.blocks;
  keys(grouped, ROLES);
  for (const role of ROLES) {
    assert.ok(Array.isArray(grouped[role]) && grouped[role].length === PRIMARY_FIXTURE_IDS.length, 'all nine primary blocks required');
    assert.deepEqual(grouped[role].map(block => block.fixture_id).sort(), [...PRIMARY_FIXTURE_IDS].sort(), 'primary fixture block set differs');
  }
  assert.deepEqual(grouped.baseline.map(block => block.fixture_id), grouped.challenger.map(block => block.fixture_id), 'paired source block order differs');
  const roots = new Set(ROLES.flatMap(role => grouped[role].map(block => block.root)));
  assert.equal(roots.size, 2 * PRIMARY_FIXTURE_IDS.length, 'duplicate source block root');
  const protectedPaths = [ROOT, dirname(input.source.path), ...input.retainedRoots];
  const resourceValues = {}, blocks = {}, versions = {};
  for (const role of ROLES) {
    const resource = reference(input.resources[role], 'grading resource'); resourceValues[role] = resource.value;
    keys(resource.value, ['kind', 'output_root', 'fixtures']); assert.equal(resource.value.kind, 'ask_primary_grading_resources_v1');
    keys(resource.value.fixtures, PRIMARY_FIXTURE_IDS);
    assert.equal(resolve(resource.value.output_root), resource.value.output_root); canonical(dirname(resource.value.output_root));
    protectedPaths.push(input.resources[role].path);
    blocks[role] = grouped[role].map(block => {
      const version = readPrimaryScoringVersion(input.scoringVersion, block.fixture_id, { verifyResourceFiles: true });
      assert.ok(version.processing, 'saved scoring requires an explicit processing v2/v3 selector'); versions[block.fixture_id] = version;
      const base = join(version.root, 'benchmarks/fixtures/checkpoint-b2', block.fixture_id), freezePath = join(base, 'scoring-input-freeze-manifest.json');
      const ref = json(join(base, 'evaluator-reference.json'));
      const selected = { ...structuredClone(block), grading: { ...structuredClone(block.grading),
        scoring_version: structuredClone(input.scoringVersion), resources: structuredClone(input.resources[role]),
        binding: { ...structuredClone(block.grading.binding), evaluator_bundle_digest: ref.evaluator_bundle_digest,
          scoring_input_freeze_digest: hash(read(freezePath).bytes) } } };
      verifyPrimaryScoringVersionResource(selected, resource.value.fixtures[block.fixture_id]);
      protectedPaths.push(canonical(block.root), canonical(block.public_input_root), primaryScoringRoot(block), version.root,
        ...Object.entries(version.fixture.resource).filter(([key]) => key !== 'admissionReviewAuthoritySourceDigest').map(([, path]) => path));
      return selected;
    });
  }
  protectedPaths.push(input.scoringVersion.path);
  const outputs = [outputRoot, ...ROLES.map(role => resourceValues[role].output_root)];
  for (let i = 0; i < outputs.length; i++) {
    for (const path of protectedPaths) assert.ok(!overlap(outputs[i], resolve(path)), 'saved scoring output overlaps retained input or fixed authority');
    for (let j = 0; j < i; j++) assert.ok(!overlap(outputs[i], outputs[j]), 'saved scoring outputs overlap');
  }
  const bindings = {};
  for (const role of ROLES) {
    bindings[role] = [];
    for (let i = 0; i < blocks[role].length; i++) {
      const before = await inspectPrimaryEvaluationSource(grouped[role][i]), selected = await inspectPrimaryEvaluationSource(blocks[role][i]);
      assert.equal(before.snapshot_digest, selected.snapshot_digest, 'saved execution bytes differ after processing rebinding');
      if (before.source_repository) for (const path of outputs) assert.ok(!overlap(path, resolve(before.source_repository)), 'saved scoring output overlaps source repository');
      bindings[role].push({ fixture_id: blocks[role][i].fixture_id, original: pinSource(before), selected: pinSource(selected) });
    }
  }
  return { blocks, bindings, resourceValues, source_mode: original.mode,
    processing: versions[PRIMARY_FIXTURE_IDS[0]].processing, implementation_sources: implementation() };
}
function preflight(input, blocks) {
  const adapters = Object.fromEntries(ROLES.map(role => [role, createPrimaryEvaluationGradingAdapter({
    resourcesPath: input.resources[role].path, resourcesDigest: input.resources[role].digest })]));
  return { adapters, preflights: Object.fromEntries(ROLES.map(role => [role, blocks[role].map(block => ({ fixture_id: block.fixture_id, result: adapters[role].preflight(block) }))])) };
}
function ready(bindings, preflights) {
  return ROLES.every(role => bindings[role].every(item => item.original.source_closed && item.selected.source_closed)
    && preflights[role].length === PRIMARY_FIXTURE_IDS.length && preflights[role].every(item => item.result.status === 'ready'));
}

export async function preparePrimarySavedScoring({ outputRoot, ...input }) {
  assert.ok(!existsSync(outputRoot), 'saved scoring preparation already exists');
  const checked = await inputs(input, outputRoot), { preflights } = preflight(input, checked.blocks);
  const record = { kind: 'ask_primary_saved_scoring_preparation_v1', input: structuredClone(input),
    blocks: checked.blocks, bindings: checked.bindings, source_mode: checked.source_mode,
    processing: checked.processing, implementation_sources: checked.implementation_sources, preflights,
    status: ready(checked.bindings, preflights) ? 'prepared' : 'blocked', posthoc_processing: true,
    execution_permission: false, scoring_ready: false, formal_aggregate_eligible: false,
    model_calls: 0, grader_process_starts: 0, producer_normalizations: 0 };
  mkdirSync(outputRoot, { mode: 0o700 }); const raw = encode(record);
  writeFileSync(join(outputRoot, 'preparation.json'), raw, { flag: 'wx', mode: 0o600 });
  return { output_root: outputRoot, external_digest: hash(raw), status: record.status,
    model_calls: 0, grader_process_starts: 0, producer_normalizations: 0, execution_permission: false };
}

export async function verifyPrimarySavedScoringPreparation({ recordRoot, externalDigest, ...unknown }) {
  assert.equal(Object.keys(unknown).length, 0, 'unknown saved scoring controls'); canonical(recordRoot);
  const record = reference({ path: join(recordRoot, 'preparation.json'), digest: externalDigest }, 'preparation').value;
  keys(record, ['kind', 'input', 'blocks', 'bindings', 'source_mode', 'processing', 'implementation_sources', 'preflights',
    'status', 'posthoc_processing', 'execution_permission', 'scoring_ready', 'formal_aggregate_eligible', 'model_calls', 'grader_process_starts', 'producer_normalizations']);
  assert.equal(record.kind, 'ask_primary_saved_scoring_preparation_v1');
  for (const key of ['execution_permission', 'scoring_ready', 'formal_aggregate_eligible']) assert.equal(record[key], false);
  for (const key of ['model_calls', 'grader_process_starts', 'producer_normalizations']) assert.equal(record[key], 0);
  assert.equal(record.posthoc_processing, true);
  const checked = await inputs(record.input, recordRoot);
  for (const key of ['blocks', 'bindings', 'source_mode', 'processing', 'implementation_sources']) assert.ok(same(record[key], checked[key]), `saved scoring ${key} changed`);
  keys(record.preflights, ROLES);
  assert.equal(record.status, ready(record.bindings, record.preflights) ? 'prepared' : 'blocked', 'saved scoring readiness status differs');
  return { record, status: record.status, execution_permission: false, model_calls: 0, grader_process_starts: 0, producer_normalizations: 0 };
}

/** Separate explicit invocation only. Never called by preparation or the CLI.
 * Uses the existing grading adapter; no new scoring formula or model runner. */
export async function gradePreparedPrimarySavedScoring(options, { signal = null, deadline_at_ms = null, ...unknown } = {}) {
  assert.equal(Object.keys(unknown).length, 0, 'unknown saved scoring execution controls');
  const checked = await verifyPrimarySavedScoringPreparation(options), record = checked.record;
  assert.equal(record.status, 'prepared', 'saved scoring preparation is blocked');
  const fresh = preflight(record.input, record.blocks);
  assert.ok(ready(record.bindings, fresh.preflights), 'saved scoring resource preflight is not ready');
  // Claim the new ordinary output directory before any grading dispatch. A
  // concurrent caller must not publish a losing partial result over the winner.
  const resultRoot = join(options.recordRoot, 'grading');
  assert.ok(!existsSync(resultRoot), 'saved grading output already exists'); mkdirSync(resultRoot, { mode: 0o700 });
  const resultPath = join(resultRoot, 'derived-grading-result.json');
  const results = Object.fromEntries(ROLES.map(role => [role, []])); let failure = null, unchanged = false;
  try {
    outer: for (let i = 0; i < PRIMARY_FIXTURE_IDS.length; i++) for (const role of ROLES) {
      assert.ok(!signal?.aborted, 'saved scoring aborted');
      const current = pinSource(await inspectPrimaryEvaluationSource(record.blocks[role][i]));
      assert.ok(same(current, record.bindings[role][i].selected), 'saved scoring source changed before grading');
      const result = await fresh.adapters[role].grade(record.blocks[role][i], null, { signal, deadline_at_ms });
      results[role].push({ fixture_id: record.blocks[role][i].fixture_id, ...result });
      if (result.status !== 'completed') { failure = 'existing_private_grading_incomplete'; break outer; }
    }
  } catch { failure = 'saved_scoring_interrupted_or_input_unverified'; }
  try { await verifyPrimarySavedScoringPreparation(options); unchanged = true; } catch { failure ??= 'retained_source_changed'; }
  const all = ROLES.flatMap(role => results[role]);
  const result = { kind: 'ask_primary_saved_scoring_result_v1', source: record.input.source,
    scoring_version: record.input.scoringVersion, processing: record.processing, results,
    status: !failure && all.length === 2 * PRIMARY_FIXTURE_IDS.length ? 'completed' : 'incomplete', failure,
    inspected_sources_unchanged: unchanged, model_calls: 0, comparison_start_resume: 0,
    grader_process_starts: all.every(item => Number.isInteger(item.grader_process_starts)) ? all.reduce((n, item) => n + item.grader_process_starts, 0) : null,
    posthoc_processing: true, formal_aggregate_eligible: false };
  writeFileSync(resultPath, encode(result), { flag: 'wx', mode: 0o600 }); return { ...result, result_path: resultPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, configPath, outputRoot] = process.argv.slice(2);
  assert.equal(action, 'prepare', 'CLI supports prepare only; grading is a separate explicitly authorized invocation');
  const result = await preparePrimarySavedScoring({ ...json(configPath), outputRoot });
  process.stdout.write(JSON.stringify(result) + '\n'); if (result.status === 'blocked') process.exitCode = 2;
}
