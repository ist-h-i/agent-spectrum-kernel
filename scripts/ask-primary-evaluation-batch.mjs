#!/usr/bin/env node
// A one-use coordinator over prepared single_shot_v1 blocks; no new model runner.
import assert from 'node:assert/strict';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { isPrimaryEvaluationGradingAdapter, PRIMARY_GRADING_RESERVATION_MS } from './ask-primary-evaluation-grading.mjs';
import { comparisonHash, inventoryComparisonGitMetadata, inventoryUserTree } from './ask-user-comparison-prepare.mjs';
import { inspectUserComparison, readUserComparisonPlan, reportUserComparison, startUserComparison } from './ask-user-comparison.mjs';

export const PRIMARY_FIXTURE_IDS = Object.freeze(['mp-ci-evidence-gap', 'mp-data-migration-handoff', 'mn-focused-regression-test',
  'mp-accessibility-interaction-review', 'mp-frontend-state-review', 'mp-iac-rollback-design', 'mp-performance-investigation',
  'mn-build-option-update', 'mn-doc-config-correction']);
export { PRIMARY_GRADING_RESERVATION_MS };
export const PRIMARY_BATCH_LIMITS = Object.freeze({ overall_timeout_ms: 302400000, token_budget: 45000000, retries: 0, concurrency: 1, resume: 'forbidden' });
const LIMIT = 16 * 1024 * 1024;
const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const stable = path => readStableFile(path, 'primary batch artifact', LIMIT).bytes;
const json = path => parseJsonRejectDuplicateKeys(stable(path).toString('utf8'));
const overlap = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const digest = value => assert.match(value, /^sha256:[a-f0-9]{64}$/u);
const present = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const canonical = path => { assert.ok(isAbsolute(path) && resolve(path) === path, 'canonical absolute path required'); assert.equal(realpathSync(path), path); return path; };
function saveNew(path, value) {
  const raw = Buffer.isBuffer(value) ? value : bytes(value);
  assert.ok(raw.length <= LIMIT);
  canonical(dirname(path));
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, raw); fsyncSync(fd); } finally { closeSync(fd); }
  const parent = openSync(dirname(path), 'r');
  try { fsyncSync(parent); } finally { closeSync(parent); }
}
function saveRecord(path, value) {
  const raw = bytes(value); saveNew(path, raw); saveNew(`${path}.digest`, Buffer.from(comparisonHash(raw)));
}
function record(path) {
  const raw = stable(path); assert.equal(stable(`${path}.digest`).toString(), comparisonHash(raw), 'partial or changed publication');
  return parseJsonRejectDuplicateKeys(raw.toString('utf8'));
}
function bindInput(block, plan) {
  canonical(block.public_input_root); canonical(block.input_manifest.path); digest(block.input_manifest.digest);
  assert.ok(!existsSync(join(block.public_input_root, '.git')), 'fixed public input must not carry Git metadata');
  assert.equal(comparisonHash(stable(block.input_manifest.path)), block.input_manifest.digest, 'public input manifest changed');
  const input = json(block.input_manifest.path);
  assert.equal(input.scope, 'agent-visible task.md + workspace/**');
  assert.deepEqual(Object.keys(input.fixtures), [block.fixture_id], 'manifest must bind exactly this fixture');
  const files = input.fixtures[block.fixture_id].files;
  assert.ok(Array.isArray(files) && files.length > 1);
  const expected = {};
  for (const file of files) {
    assert.ok(typeof file.path === 'string' && !/[\\\0]/u.test(file.path) && file.path.split('/').every(part => part && part !== '.' && part !== '..')
      && (file.path === 'task.md' || file.path.startsWith('workspace/')), 'unsafe public input path');
    assert.ok(!Object.hasOwn(expected, file.path), 'duplicate input file');
    const raw = stable(join(block.public_input_root, file.path));
    assert.equal(raw.length, file.bytes); assert.equal(comparisonHash(raw), `sha256:${file.sha256}`);
    expected[file.path] = { digest: comparisonHash(raw), bytes: raw.length };

  }
  assert.equal(expected['task.md']?.digest, plan.task.digest, 'fixture task differs from plan task');
  const actual = inventoryUserTree(block.public_input_root);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), 'extra or missing public input');
  for (const [path, entry] of Object.entries(expected)) { assert.equal(actual[path].digest, entry.digest); assert.equal(actual[path].bytes, entry.bytes); }
  assert.deepEqual(Object.keys(plan.source.inventory).sort(), Object.keys(expected).sort(), 'source includes input outside manifest');
  for (const [path, entry] of Object.entries(expected)) { assert.equal(plan.source.inventory[path].digest, entry.digest); assert.equal(plan.source.inventory[path].bytes, entry.bytes); }
}
function checkBlock(block, conditions, pending) {
  const loaded = readUserComparisonPlan(block.root), { plan } = loaded;
  assert.equal(plan.policy.execution_contract, 'single_shot_v1', 'only single_shot_v1 may be inspected');
  assert.equal(plan.run_id, block.run_id); assert.equal(loaded.plan_digest, block.plan_digest, 'fixed plan changed');
  for (const field of ['source', 'task', 'verification']) { digest(block[`${field}_digest`]); assert.equal(plan[field].digest, block[`${field}_digest`]); }
  assert.deepEqual(['plain', plan.config.kernel_condition ?? 'kernel_only', 'full_ask'], conditions, 'actual condition IDs differ; aliases forbidden');
  assert.equal(plan.rerun_of ?? null, null, 'prior-run retries forbidden');
  assert.equal(plan.config.token_budget, 5000000, 'each fixed block must bind its 5M admission budget');
  assert.ok(Number.isSafeInteger(plan.config.overall_timeout_ms) && plan.config.overall_timeout_ms > 0 && plan.config.overall_timeout_ms <= 14400000, 'fixed block limit must be at most 4h');
  canonical(plan.source.repo); bindInput(block, plan);
  assert.equal(comparisonHash(bytes(plan.source.inventory)), plan.source.digest, 'source inventory digest changed');
  assert.deepEqual(inventoryUserTree(plan.source.repo), plan.source.inventory, 'source changed');
  for (const field of ['task', 'input', 'verification']) assert.equal(comparisonHash(stable(join(block.root, plan[field].path))), plan[field].digest, `${field} changed`);
  assert.equal(stable(join(block.root, plan.input.path)).toString('utf8'), plan.prompt, 'prompt and plan differ');
  assert.deepEqual(json(join(block.root, plan.verification.path)), plan.verification.recipe, 'recipe and plan differ');
  assert.equal(comparisonHash(stable(join(block.root, plan.verification.reporter.path))), plan.verification.reporter.digest, 'reporter changed');
  for (const id of conditions) {
    const arm = plan.arms[id];
    assert.deepEqual(inventoryUserTree(join(block.root, arm.baseline_path)), arm.baseline_inventory, 'baseline changed');
    if (pending) {
      assert.deepEqual(inventoryUserTree(join(block.root, arm.path)), arm.baseline_inventory, 'pending workspace changed');
      assert.deepEqual(inventoryComparisonGitMetadata(join(block.root, arm.path)), arm.git_metadata, 'pending Git metadata changed');
      const slot = join(block.root, 'control/slots', id);
      assert.ok(!existsSync(slot) || readdirSync(slot).length === 0, 'preexisting slot output');
    }
  }
  if (pending) {
    const slotsRoot = join(block.root, 'control/slots');
    assert.ok(!existsSync(slotsRoot) || readdirSync(slotsRoot).every(id => conditions.includes(id)), 'unexpected slot directory');
    const invocations = join(block.root, 'control/invocations');
    assert.ok(!existsSync(invocations) || readdirSync(invocations).length === 0, 'preexisting invocation output');
    const inspection = inspectUserComparison(block.root);
    assert.equal(inspection.execution.start_consumed, false, 'past or unknown start forbidden');
    assert.equal(inspection.execution.state, 'available', 'execution state unavailable');
    return { ...loaded, inspection };
  }
  return loaded;
}
// Narrow continuation of one stopped primary batch. All reads are metadata/byte
// checks; no legacy ownership probing, starts, auth inspection or worker calls.
export function validatePrimaryRemainingEightContinuation(value) {
  const fields = ['kind', 'parent_manifest', 'parent_start_record', 'parent_first_report', 'retained_first_grading',
    'retained_scoring_version', 'parent_batch_id', 'parent_run_id', 'original_fixture_ids', 'original_unstarted_blocks', 'analysis_policy'];
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), fields.sort(), 'closed remaining-eight continuation required');
  assert.equal(value.kind, 'ask_primary_remaining_eight_v1');
  assert.deepEqual(value.analysis_policy, { natural_language: 'manual_allowed', command_match: 'exact_rendered_no_shell_equivalence',
    capture_failure: 'whole_capture_unknown', missing_raw_score: 'retain_raw_separate_unknown_analysis',
    manual_scoring: 'not_start_or_next_fixture_prerequisite' });
  const pinned = ref => {
    assert.deepEqual(Object.keys(ref).sort(), ['digest', 'path']); canonical(ref.path); digest(ref.digest);
    const raw = stable(ref.path); assert.equal(comparisonHash(raw), ref.digest, 'parent/retained evidence changed');
    return parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  };
  const parent = pinned(value.parent_manifest);
  assert.equal(parent.kind, 'ask_primary_evaluation_batch_manifest_v1');
  assert.equal(Object.hasOwn(parent, 'continuation'), false, 'continuation chaining is not supported');
  assert.equal(parent.batch_id, value.parent_batch_id); canonical(parent.root);
  assert.equal(basename(parent.root), 'batch', 'fixed parent batch layout required');
  assert.equal(basename(dirname(parent.root)), 'run', 'fixed parent run layout required');
  assert.equal(value.parent_manifest.path, join(dirname(parent.root), 'batch-manifest.json'), 'fixed external parent manifest required');
  assert.deepEqual(parent.blocks.map(block => block.fixture_id), PRIMARY_FIXTURE_IDS);
  assert.deepEqual(value.original_fixture_ids, PRIMARY_FIXTURE_IDS);
  const conditions = ['plain', 'kernel_principles_v2', 'full_ask']; assert.deepEqual(parent.conditions, conditions);
  const first = parent.blocks[0]; assert.equal(value.parent_run_id, first.run_id);
  const parentPrepared = record(join(parent.root, 'prepared.json'));
  assert.equal(parentPrepared.manifest_path, value.parent_manifest.path);
  assert.equal(parentPrepared.manifest_digest, value.parent_manifest.digest);
  assert.equal(value.parent_start_record.path, join(parent.root, 'consumption/start.json'));
  const start = pinned(value.parent_start_record); record(value.parent_start_record.path);
  assert.equal(start.batch_id, parent.batch_id); assert.equal(start.manifest_digest, value.parent_manifest.digest);
  const terminal = record(join(parent.root, 'consumption/terminal.json'));
  assert.equal(terminal.state, 'stopped'); assert.equal(terminal.manifest_digest, value.parent_manifest.digest);
  assert.equal(value.parent_first_report.path, join(parent.root, 'consumption/block-0-report.json'));
  const firstReport = pinned(value.parent_first_report); record(value.parent_first_report.path);
  assert.ok(safeTerminal(firstReport, first, conditions), 'parent first execution is not closed');
  const requested = record(join(parent.root, 'consumption/block-0-requested.json'));
  assert.equal(requested.run_id, first.run_id); assert.equal(requested.plan_digest, first.plan_digest);
  const remaining = parent.blocks.slice(1);
  assert.deepEqual(value.original_unstarted_blocks, remaining.map(block => ({ fixture_id: block.fixture_id,
    run_id: block.run_id, plan_digest: block.plan_digest, start_consumed: false })));
  for (const [index, block] of remaining.entries()) {
    canonical(block.root);
    for (const name of ['requested', 'report', 'grading']) for (const suffix of ['', '.digest'])
      assert.ok(!present(join(parent.root, 'consumption/block-' + (index + 1) + '-' + name + '.json' + suffix)), 'original remaining block not unstarted');
    for (const name of ['start.json', 'start.digest', 'leases', 'history'])
      assert.ok(!present(join(block.root, 'control', name)), 'original remaining intent is not unstarted');
    for (const name of ['invocations', 'slots']) {
      const dir = join(block.root, 'control', name);
      if (!present(dir)) continue;
      canonical(dir); assert.ok(lstatSync(dir).isDirectory(), 'original remaining directory invalid');
      assert.ok(readdirSync(dir).every(entry => name === 'slots' && conditions.includes(entry)
        && canonical(join(dir, entry)) && lstatSync(join(dir, entry)).isDirectory()
        && readdirSync(join(dir, entry)).length === 0), 'original remaining evidence is not unstarted');
    }
  }
  const grade = pinned(value.retained_first_grading), gradeRoot = dirname(value.retained_first_grading.path);
  assert.equal(grade.kind, 'derived_processing_only_grading_result');
  assert.equal(grade.criterion_version_id, 'ask-primary-fresh-scoring-v4');
  assert.equal(grade.original_run_id, first.run_id); assert.equal(grade.status, 'completed');
  assert.equal(grade.failure, null); assert.equal(grade.originals_unchanged, true);
  assert.equal(grade.model_calls, 0); assert.equal(grade.comparison_start_resume, 0); assert.equal(grade.grader_process_starts, 12);
  assert.deepEqual(grade.conditions.map(item => item.condition), conditions);
  const version = pinned(value.retained_scoring_version);
  assert.equal(version.kind, 'ask_primary_scoring_version_v1'); assert.deepEqual(Object.keys(version.fixtures).sort(), [...PRIMARY_FIXTURE_IDS].sort());
  assert.equal(grade.producer.record_root, join(gradeRoot, 'producer'));
  const producer = pinned({ path: join(grade.producer.record_root, 'producer.json'), digest: grade.producer.digest });
  assert.equal(producer.kind, 'ask_primary_evaluation_producer_v1');
  const parentEvidenceKind = readUserComparisonPlan(first.root).plan.config.evidence_kind;
  assert.equal(producer.evidence_kind, parentEvidenceKind, 'retained producer evidence kind differs');
  for (const key of ['fixture_id', 'root', 'run_id', 'plan_digest']) assert.equal(producer.block[key], first[key]);
  assert.deepEqual(producer.block.grading.scoring_version, value.retained_scoring_version);
  for (const item of grade.conditions) {
    assert.equal(item.status, 'completed'); assert.equal(item.model_calls, 0); assert.equal(item.evidence_kind, parentEvidenceKind);
    assert.equal(item.grader_process_completed, true); assert.equal(item.grader_process_starts, 4);
    assert.ok(item.quality === null || Number.isFinite(item.quality));
    assert.equal(item.worker_receipts.length, 4);
    for (const [receiptIndex, receipt] of item.worker_receipts.entries()) {
      assert.equal(receipt.kind, 'ask_primary_private_worker_stdio_v1'); assert.equal(receipt.condition, item.condition); assert.equal(receipt.evidence_kind, parentEvidenceKind);
      assert.equal(receipt.spawn_observed, true); assert.equal(receipt.process_completed, true); assert.equal(receipt.exit_code, 0);
      assert.equal(receipt.signal, null); assert.equal(receipt.error_code, null); assert.equal(receipt.log_capture_status, 'complete');
      for (const channel of ['stdout', 'stderr']) {
        const ref = receipt[channel]; assert.equal(ref.path, String(receiptIndex + 1).padStart(4, '0') + '.' + channel + '.log'); digest(ref.digest);
        const path = join(gradeRoot, 'private-' + item.condition, 'worker-logs', ref.path); canonical(path);
        const raw = stable(path); assert.equal(raw.length, ref.bytes, 'retained worker log changed'); assert.equal(comparisonHash(raw), ref.digest, 'retained worker log changed');
      }
    }
    for (const key of ['evaluator_result', 'engineering_result']) {
      const ref = item.public_artifacts[key]; assert.equal(dirname(ref.path), join(gradeRoot, 'public-' + item.condition)); pinned(ref);
    }
  }
  return { fixture_ids: PRIMARY_FIXTURE_IDS.slice(1), parent_evidence_kind: parentEvidenceKind, parent_run_ids: parent.blocks.map(block => block.run_id),
    issuance_path: join(dirname(dirname(dirname(parent.root))), '.ask-primary-continuations', value.parent_manifest.digest.slice(7) + '.json'),
    parent_roots: [dirname(dirname(parent.root)), gradeRoot,
      ...parent.blocks.flatMap(block => [block.root, block.public_input_root, readUserComparisonPlan(block.root).plan.source.repo])] };
}
export function assertPrimaryContinuationIsolation(continuation, roots) {
  for (const candidate of roots) for (const parentRoot of continuation.parent_roots)
    assert.ok(!overlap(candidate, parentRoot), 'continuation execution/input/source/output overlaps parent');
}
export function assertPrimaryContinuationGradingIsolation(continuation, ref) {
  assert.deepEqual(Object.keys(ref).sort(), ['digest', 'path']); canonical(ref.path); digest(ref.digest);
  const raw = stable(ref.path); assert.equal(comparisonHash(raw), ref.digest, 'continuation grading resources changed');
  const resources = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  assert.equal(resources.kind, 'ask_primary_grading_resources_v1');
  assert.ok(isAbsolute(resources.output_root) && resolve(resources.output_root) === resources.output_root);
  canonical(dirname(resources.output_root));
  assertPrimaryContinuationIsolation(continuation, [resources.output_root]);
}
// An issuance is preparation metadata, never execution authorization. It lives
// beside the original evaluation, not within it, and is never deleted/replaced.
const issuanceGrants = new WeakMap();
export function reservePrimaryRemainingEightOutput(value, output) {
  const continuation = validatePrimaryRemainingEightContinuation(value);
  assert.ok(isAbsolute(output) && resolve(output) === output); canonical(dirname(output));
  assertPrimaryContinuationIsolation(continuation, [output]);
  const registry = dirname(continuation.issuance_path);
  const expected = { kind: 'ask_primary_remaining_eight_issuance_v1', parent_manifest: value.parent_manifest,
    output_root: output, execution_authority: false };
  assert.ok(['', '.digest', '.manifest', '.manifest.digest'].every(suffix => !present(continuation.issuance_path + suffix)),
    'remaining-eight output already issued; no replacement IDs or sibling plan');
  assertPrimaryContinuationIsolation(continuation, [registry]);
  if (!present(registry)) mkdirSync(registry, { mode: 0o700 });
  canonical(registry);
  saveRecord(continuation.issuance_path, expected);
  const grant = Object.freeze({});
  issuanceGrants.set(grant, Object.freeze({ path: continuation.issuance_path, output_root: output,
    parent_manifest_digest: value.parent_manifest.digest }));
  return grant;
}
function validateManifest(manifest, pending) {
  assert.equal(manifest.kind, 'ask_primary_evaluation_batch_manifest_v1');
  assert.ok(typeof manifest.batch_id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/u.test(manifest.batch_id));
  assert.deepEqual(manifest.limits, [172800000, 216000000].includes(manifest.limits?.overall_timeout_ms)
    ? { ...PRIMARY_BATCH_LIMITS, overall_timeout_ms: manifest.limits.overall_timeout_ms } : PRIMARY_BATCH_LIMITS, 'unknown primary batch budget');
  const continuation = Object.hasOwn(manifest, 'continuation') ? validatePrimaryRemainingEightContinuation(manifest.continuation) : null;
  const ids = continuation?.fixture_ids ?? PRIMARY_FIXTURE_IDS;
  assert.deepEqual(manifest.blocks.map(block => block.fixture_id), ids, 'exact fixed primary fixture order required');
  if (continuation) {
    assert.deepEqual(manifest.conditions, ['plain', 'kernel_principles_v2', 'full_ask']);
    for (const block of manifest.blocks) {
      assert.ok(!continuation.parent_run_ids.includes(block.run_id), 'original child run ID cannot be reused');
      assert.deepEqual(block.grading.scoring_version, manifest.continuation.retained_scoring_version, 'retained scoring version required');
      assertPrimaryContinuationIsolation(continuation, [block.root, block.public_input_root, manifest.root]);
      if (block.grading.resources) assertPrimaryContinuationGradingIsolation(continuation, block.grading.resources);
    }
  }
  assert.equal(manifest.conditions.length, 3); assert.equal(new Set(manifest.conditions).size, 3);
  assert.equal(new Set(manifest.blocks.map(block => block.run_id)).size, ids.length, 'duplicate run ID');
  const loaded = manifest.blocks.map(block => checkBlock(block, manifest.conditions, pending));
  assert.equal(new Set(loaded.map(value => value.plan.config.evidence_kind)).size, 1, 'mixed evidence kinds');
  if (continuation) assert.ok(loaded.every(value => value.plan.config.evidence_kind === continuation.parent_evidence_kind), 'continuation evidence kind differs from parent');
  const roots = [manifest.root, ...loaded.flatMap((value, index) => [value.root, value.plan.source.repo, manifest.blocks[index].public_input_root])];
  if (continuation) assertPrimaryContinuationIsolation(continuation, roots);
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) assert.ok(!overlap(roots[i], roots[j]), 'batch/input/source/child root overlap');
  for (const block of manifest.blocks) for (const value of loaded) {
    assert.ok(!overlap(block.input_manifest.path, value.root) && !overlap(block.input_manifest.path, value.plan.source.repo), 'input manifest overlaps execution source');
  }
  return loaded;
}
function gradingPreflight(manifest, loaded, adapter) {
  return manifest.blocks.flatMap((block, index) => {
    const declared = block.grading;
    assert.ok(declared && ['ready', 'blocked'].includes(declared.status) && Array.isArray(declared.blockers), 'grading binding required');
    assert.ok(declared.binding && typeof declared.binding === 'object', 'grading identity binding required');
    assert.deepEqual(Object.keys(declared.binding).sort(), ['fixture_id', 'input_manifest_digest', 'evaluator_bundle_digest', 'scoring_input_freeze_digest', 'profile_id'].sort(), 'exact grading binding fields required');
    assert.equal(declared.binding.fixture_id, block.fixture_id);
    assert.equal(declared.binding.input_manifest_digest, block.input_manifest.digest);
    digest(declared.binding.evaluator_bundle_digest); digest(declared.binding.scoring_input_freeze_digest);
    assert.ok(typeof declared.binding.profile_id === 'string' && declared.binding.profile_id.length > 0);
    assert.ok(Number.isSafeInteger(declared.timeout_ms) && declared.timeout_ms > 0 && declared.timeout_ms <= PRIMARY_GRADING_RESERVATION_MS, 'grading reservation must be bounded to 185 minutes');
    const blockers = declared.status === 'blocked' ? declared.blockers.length ? [...declared.blockers] : ['grading declared blocked'] : [];
    if (!adapter || typeof adapter.preflight !== 'function' || typeof adapter.grade !== 'function') blockers.push('grading adapter not connected');
    else if (loaded[index].plan.config.evidence_kind === 'observed' && !isPrimaryEvaluationGradingAdapter(adapter)) blockers.push('production grading adapter is not registered; caller ready labels cannot authorize dispatch');
    else {
      const result = adapter.preflight(block, loaded[index]);
      assert.ok(result && ['ready', 'blocked'].includes(result.status) && Array.isArray(result.blockers), 'invalid grading preflight');
      if (result.status !== 'ready' || result.blockers.length) blockers.push(...result.blockers, ...(result.blockers.length ? [] : ['grading preflight blocked']));
    }
    for (const condition of manifest.conditions) if (loaded[index].plan.arms[condition].capability.status !== 'available') blockers.push(`${condition}: capability missing`);
    return blockers.map(reason => ({ fixture_id: block.fixture_id, reason }));
  });
}
export function preparePrimaryEvaluationBatch(manifestPath, { gradingAdapter, issuance = null } = {}) {
  canonical(manifestPath);
  const raw = stable(manifestPath), manifest = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  assert.ok(isAbsolute(manifest.root) && resolve(manifest.root) === manifest.root); canonical(dirname(manifest.root));
  assert.ok(!existsSync(manifest.root), 'batch output exists; never reuse');
  assert.deepEqual(manifest.limits, PRIMARY_BATCH_LIMITS, 'new preparation must use the current budget');
  const loaded = validateManifest(manifest, true);
  for (const value of loaded) assert.ok(!overlap(manifestPath, value.root) && !overlap(manifestPath, value.plan.source.repo), 'external manifest overlaps execution source');
  assert.ok(!overlap(manifestPath, manifest.root));
  const blockers = gradingPreflight(manifest, loaded, gradingAdapter);
  if (manifest.continuation) {
    const continuation = validatePrimaryRemainingEightContinuation(manifest.continuation);
    const grant = issuance ?? reservePrimaryRemainingEightOutput(manifest.continuation, dirname(manifest.root));
    assert.ok(issuanceGrants.has(grant), 'live preparation issuance required; partial publication cannot be recovered');
    const issued = issuanceGrants.get(grant);
    assert.equal(issued.path, continuation.issuance_path);
    assert.equal(issued.output_root, dirname(manifest.root));
    assert.equal(issued.parent_manifest_digest, manifest.continuation.parent_manifest.digest);
    assert.deepEqual(record(issued.path), { kind: 'ask_primary_remaining_eight_issuance_v1',
      parent_manifest: manifest.continuation.parent_manifest, output_root: dirname(manifest.root), execution_authority: false });
    issuanceGrants.delete(grant);
    // Bind the sole issued output to these exact IDs and bytes before publication.
    saveRecord(continuation.issuance_path + '.manifest', { manifest_path: manifestPath,
      manifest_digest: comparisonHash(raw), child_run_ids: manifest.blocks.map(block => block.run_id) });
  }
  mkdirSync(manifest.root, { mode: 0o700 });
  saveNew(join(manifest.root, 'manifest.json'), raw);
  saveRecord(join(manifest.root, 'prepared.json'), { manifest_path: manifestPath, manifest_digest: comparisonHash(raw), batch_id: manifest.batch_id,
    status: blockers.length ? 'blocked' : 'prepared', blockers });
  return inspectPrimaryEvaluationBatch(manifest.root, { gradingAdapter });
}
function readBatch(root) {
  canonical(root);
  const prepared = record(join(root, 'prepared.json')), raw = stable(join(root, 'manifest.json'));
  assert.equal(comparisonHash(raw), prepared.manifest_digest);
  assert.equal(comparisonHash(stable(prepared.manifest_path)), prepared.manifest_digest, 'external manifest changed');
  const manifest = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  assert.equal(manifest.root, root); assert.equal(manifest.batch_id, prepared.batch_id);
  if (manifest.continuation) {
    const continuation = validatePrimaryRemainingEightContinuation(manifest.continuation);
    assert.deepEqual(record(continuation.issuance_path), { kind: 'ask_primary_remaining_eight_issuance_v1',
      parent_manifest: manifest.continuation.parent_manifest, output_root: dirname(root), execution_authority: false });
    assert.deepEqual(record(continuation.issuance_path + '.manifest'), { manifest_path: prepared.manifest_path,
      manifest_digest: prepared.manifest_digest, child_run_ids: manifest.blocks.map(block => block.run_id) });
  }
  return { root, manifest, prepared, manifest_digest: prepared.manifest_digest };
}
export function inspectPrimaryEvaluationBatch(root, { gradingAdapter } = {}) {
  const batch = readBatch(root), consumed = existsSync(join(root, 'consumption'));
  const loaded = validateManifest(batch.manifest, !consumed);
  const blockers = gradingPreflight(batch.manifest, loaded, gradingAdapter);
  if (batch.manifest.limits.overall_timeout_ms !== PRIMARY_BATCH_LIMITS.overall_timeout_ms)
    blockers.push({ fixture_id: null, reason: 'historical_preparation_budget_requires_new_plan' });
  return { ...batch, status: consumed ? 'consumed' : blockers.length ? 'blocked' : 'prepared', blockers, start_consumed: consumed,
    slot_count: batch.manifest.blocks.length * batch.manifest.conditions.length, slots: batch.manifest.blocks.flatMap((block, index) => batch.manifest.conditions.map(condition => ({ fixture_id: block.fixture_id, run_id: block.run_id, condition, state: consumed ? 'unknown' : 'not_started', quality: null, capability: loaded[index].plan.arms[condition].capability }))) };
}
function safeTerminal(report, block, conditions) {
  assert.equal(report.run_id, block.run_id); assert.equal(report.plan_digest, block.plan_digest);
  assert.deepEqual(report.slots.map(slot => slot.condition), conditions);
  if (!['completed', 'task_failed', 'indeterminate'].includes(report.overall.state)) return false;
  const execution = report.execution, history = execution?.history, checkpoint = history?.snapshot;
  if (execution?.state !== 'available' || execution.start_consumed !== true || execution.resume_allowed !== false
    || execution.owner?.released !== true || !Array.isArray(history?.pending) || history.pending.length
    || checkpoint?.event !== 'invocation_ended' || checkpoint.stop !== null
    || checkpoint.run_id !== block.run_id || checkpoint.plan_digest !== block.plan_digest) return false;
  // The single-task report retains semantic unknown. Only this primary safety
  // projection can admit it after execution closure and native evidence pass.
  const qualityPending = report.overall.state === 'indeterminate';
  return report.slots.every(slot => {
    const terminal = checkpoint.slots?.[slot.condition], checks = slot.verification?.checks;
    if (terminal?.phase !== 'terminal' || terminal.attempts !== 1 || slot.receipt_integrity !== 'valid') return false;
    try {
      const path = join(block.root, 'control/slots', slot.condition, 'result.json');
      if (comparisonHash(stable(path)) !== terminal.terminal_digest
        || stable(join(dirname(path), 'result.digest')).toString() !== terminal.terminal_digest) return false;
    } catch { return false; }
    return ['completed', 'verification_failed'].includes(slot.state) && slot.process_completed === true
      && slot.exit_code === 0 && !slot.unresolved_child && !slot.cleanup_error && !slot.runner_error && slot.scope?.status === 'pass'
      && Array.isArray(checks) && checks.length > 0 && checks.every(check => !check.cleanup_error && !check.runner_error
        && check.process_completed === true && check.spawn_observed === true && ['pass', 'fail'].includes(check.status)
        && Number.isInteger(check.exit_code) && check.exit_code >= 0 && (check.status === 'pass' ? check.exit_code === 0 : check.exit_code !== 0))
      && (!qualityPending || slot.state === 'completed' && ['pass', 'unknown'].includes(slot.outcome)
        && checks.every(check => check.status === 'pass'));
  });
}
export async function startPrimaryEvaluationBatch(root, confirmedManifestDigest, { gradingAdapter, startComparison = startUserComparison, signal, now = Date.now } = {}) {
  const batch = inspectPrimaryEvaluationBatch(root, { gradingAdapter });
  assert.equal(confirmedManifestDigest, batch.manifest_digest, 'human must confirm external manifest digest');
  assert.equal(batch.start_consumed, false, 'start consumed or unknown; no resume');
  assert.equal(batch.blockers.length, 0, 'all grading/capability connections required before dispatch');
  const loaded = validateManifest(batch.manifest, true);
  assert.ok(startComparison === startUserComparison ? loaded.every(value => value.plan.config.evidence_kind === 'observed')
    : loaded.every(value => value.plan.config.evidence_kind === 'synthetic'), 'fake start adapters require entirely synthetic plans; synthetic plans cannot call production start');
  const consumption = join(root, 'consumption'); mkdirSync(consumption, { mode: 0o700 }); // Exclusive, never removed, even on partial write.
  const started = now(), deadline = started + PRIMARY_BATCH_LIMITS.overall_timeout_ms;
  saveRecord(join(consumption, 'start.json'), { batch_id: batch.manifest.batch_id, manifest_digest: batch.manifest_digest, started_at_ms: started, deadline_at_ms: deadline });
  let known = 0, stop = null, lastTime = started;
  const controller = new AbortController(), relay = () => controller.abort();
  signal?.addEventListener('abort', relay, { once: true }); if (signal?.aborted) relay();
  const timer = setTimeout(relay, Math.max(1, deadline - now())); timer.unref();
  try {
    for (const [index, block] of batch.manifest.blocks.entries()) {
      const current = now(); assert.ok(current >= lastTime, 'clock moved backwards'); lastTime = current;
      if (controller.signal.aborted) { stop = 'interrupted_or_deadline'; break; }
      if (known >= PRIMARY_BATCH_LIMITS.token_budget) { stop = 'usage_budget_exhausted'; break; }
      // Reserve the entire fixed child limit plus grading reservation before dispatch.
      const reserve = loaded[index].plan.config.overall_timeout_ms + (block.grading.timeout_ms ?? PRIMARY_GRADING_RESERVATION_MS);
      if (deadline - current < reserve) { stop = 'insufficient_deadline_reservation'; break; }
      const fresh = checkBlock(block, batch.manifest.conditions, true);
      const blockers = gradingPreflight({ ...batch.manifest, blocks: [block] }, [fresh], gradingAdapter);
      assert.equal(blockers.length, 0, 'grading connection changed');
      saveRecord(join(consumption, `block-${index}-requested.json`), { run_id: block.run_id, plan_digest: block.plan_digest });
      const invocationReport = await startComparison(block.root, block.plan_digest, { signal: controller.signal });
      const report = startComparison === startUserComparison ? reportUserComparison(block.root) : invocationReport;
      const safe = safeTerminal(report, block, batch.manifest.conditions);
      saveRecord(join(consumption, `block-${index}-report.json`), report);
      if (!safe || controller.signal.aborted || now() >= deadline) { stop = 'unsafe_or_incomplete_child'; break; }
      const lower = report.usage_budget?.known_tokens_lower_bound;
      assert.ok(Number.isSafeInteger(lower) && lower >= 0, 'usage lower bound missing'); known += lower;
      if (known >= PRIMARY_BATCH_LIMITS.token_budget) { stop = 'usage_budget_exhausted'; break; }
      const grade = await gradingAdapter.grade(block, report, { signal: controller.signal, deadline_at_ms: deadline });
      saveRecord(join(consumption, `block-${index}-grading.json`), grade);
      if (!grade || grade.status !== 'completed' || controller.signal.aborted || now() >= deadline) { stop = 'grading_incomplete'; break; }
    }
    saveRecord(join(consumption, 'terminal.json'), { manifest_digest: batch.manifest_digest, stop, state: stop ? 'stopped' : 'completed' });
  } catch (error) {
    // Publication failure leaves consumption permanent; unknown work must never be repeated.
    try { saveRecord(join(consumption, 'terminal.json'), { manifest_digest: batch.manifest_digest, state: 'stopped', stop: String(error.message) }); } catch { /* retain incomplete consumption */ }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); }
  return reportPrimaryEvaluationBatch(root);
}
export function reportPrimaryEvaluationBatch(root) {
  const batch = readBatch(root), errors = []; let loaded = [];
  try { loaded = validateManifest(batch.manifest, false); } catch (error) { errors.push(`fixed input: ${error.message}`); }
  const folder = join(root, 'consumption'), consumed = existsSync(folder);
  const read = name => { const path = join(folder, name); if (!existsSync(path) && !existsSync(`${path}.digest`)) return null; try { return record(path); } catch (error) { errors.push(`${name}: ${error.message}`); return null; } };
  const start = consumed ? read('start.json') : null, terminal = consumed ? read('terminal.json') : null;
  if (start && (start.manifest_digest !== batch.manifest_digest || start.batch_id !== batch.manifest.batch_id)) errors.push('start identity changed');
  if (terminal && terminal.manifest_digest !== batch.manifest_digest) errors.push('terminal identity changed');
  const reports = batch.manifest.blocks.map((block, index) => {
    const requested = consumed ? read(`block-${index}-requested.json`) : null;
    const report = consumed ? read(`block-${index}-report.json`) : null;
    const grading = consumed ? read(`block-${index}-grading.json`) : null;
    if (requested && !report) errors.push(`block ${index} requested report missing`);
    if (!requested && (report || grading)) errors.push(`block ${index} evidence has no request`);
    if (terminal?.state === 'completed' && (!requested || !report || grading?.status !== 'completed')) errors.push(`block ${index} completed batch evidence incomplete`);
    if (requested && (requested.run_id !== block.run_id || requested.plan_digest !== block.plan_digest)) errors.push(`block ${index} request identity changed`);
    if (report && (report.run_id !== block.run_id || report.plan_digest !== block.plan_digest)) { errors.push(`block ${index} report identity changed`); return { block, requested, report: null, grading: null }; }
    return { block, requested, report, grading };
  });
  const slots = reports.flatMap(({ block, requested, report, grading }, index) => batch.manifest.conditions.map(condition => ({ fixture_id: block.fixture_id, run_id: block.run_id,
    plan_digest: block.plan_digest, condition, state: report?.slots?.find(slot => slot.condition === condition)?.state ?? (requested ? 'unknown' : 'not_started'),
    quality: grading?.conditions?.find(slot => slot.condition === condition)?.status === 'completed'
      ? grading.conditions.find(slot => slot.condition === condition).quality : null,
    capability: loaded[index]?.plan.arms[condition]?.capability ?? { status: 'unknown' }, grading: grading ?? { status: 'unknown' }, usage: report?.slots?.find(slot => slot.condition === condition)?.metrics ?? null,
    cost: null, child_report: report }))); // Child report preserves native single-task receipts and unknowns.
  return { kind: 'ask_primary_evaluation_batch_report_v1', batch_id: batch.manifest.batch_id, manifest_digest: batch.manifest_digest,
    state: errors.length || consumed && (!start || !terminal) ? 'consumption_unknown' : terminal?.state ?? 'not_started', start_consumed: consumed, errors, terminal,
    blockers: batch.prepared.blockers, slots, usage: { known_tokens_lower_bound: reports.reduce((sum, value) => sum + (value.report?.usage_budget?.known_tokens_lower_bound ?? 0), 0),
      complete: reports.every(value => value.report?.usage_budget?.complete === true),
      unknown_block_count: reports.filter(value => value.report?.usage_budget?.complete !== true).length,
      missing_requested_report_count: reports.filter(value => value.requested && !value.report).length,
      cost: null }, limits: batch.manifest.limits,
    ...(batch.manifest.continuation ? { continuation: structuredClone(batch.manifest.continuation), analytical_fixture_count: 9 } : {}),
    limitations: ['reported input+output is a lower bound; cached input is not added again', 'budget admission occurs between fixed blocks; child plans retain their own token budgets',
      'local deadline is not provider cancellation or a hard cost cap; forced controller exit cannot guarantee child/descendant shutdown', 'no resume, retries, saved-PID probes or additional sessions', 'quality remains unknown until the fixed grading adapter supplies evidence'] };
}
async function main() {
  const [command, path] = process.argv.slice(2);
  assert.equal(process.argv.length, 4, 'prepare MANIFEST | inspect ROOT | report ROOT');
  const value = command === 'prepare' ? preparePrimaryEvaluationBatch(path) : command === 'inspect' ? inspectPrimaryEvaluationBatch(path)
    : command === 'report' ? reportPrimaryEvaluationBatch(path) : assert.fail('only model-free prepare/inspect/report are available in CLI; start needs explicit programmatic grading connection');
  console.log(JSON.stringify(value, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 10; });
