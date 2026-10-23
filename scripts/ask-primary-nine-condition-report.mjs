#!/usr/bin/env node
// Offline projection of retained comparison reports. Never imports a launcher or grader.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDigest, parseJsonRejectDuplicateKeys, stableCanonicalJson } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { PRIMARY_FIXTURE_REGISTRY } from './ask-primary-fixture-registry.mjs';

export const NINE_REPORT_SETTINGS = Object.freeze([
  Object.freeze({ model: 'gpt-6.1-sol', reasoning: 'high' }),
  Object.freeze({ model: 'gpt-6.1-sol', reasoning: 'low' }),
  Object.freeze({ model: 'gpt-6-luna', reasoning: 'max' }),
]);
export const NINE_REPORT_CONDITIONS = Object.freeze(['plain', 'kernel_principles_v2', 'full_ask']);
const MAX_BYTES = 64 * 1024 * 1024;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const STATES = new Set(['not_started', 'unknown', 'incomplete', 'completed', 'capability_missing', 'permission_denied',
  'runner_failed', 'timeout', 'interrupted', 'result_missing', 'scope_violation', 'verification_failed',
  'authentication_required', 'execution_unknown', 'indeterminate']);
const metricKeys = ['duration_ms', 'input_tokens', 'output_tokens', 'cached_tokens'];
const keys = (value, expected, label) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} object required`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields are closed`);
};
const digest = value => assert.match(value, DIGEST, 'raw sha256 digest required');
const nonnegative = (value, label, integer = false) => {
  if (value === null || value === undefined) return null;
  assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!integer || Number.isSafeInteger(value)), `${label} must be finite and nonnegative`);
  return value;
};
const quality = value => {
  const number = nonnegative(value, 'quality');
  assert.ok(number === null || number <= 1, 'quality must be in [0,1]');
  return number;
};
const settingKey = ({ model, reasoning }) => `${model}/${reasoning}`;
const rowKey = row => `${settingKey(row)}/${row.repetition}/${row.fixture_id}/${row.condition}`;
const safeID = value => assert.ok(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value), 'bounded identifier required');
const same = (left, right, label) => assert.equal(stableCanonicalJson(left), stableCanonicalJson(right), label);
const readJson = (path, expected = null) => {
  assert.ok(isAbsolute(path) && resolve(path) === path, 'canonical absolute input path required');
  const record = readStableFile(path, 'saved comparison JSON', MAX_BYTES, { allowEmpty: false });
  if (expected !== null) { digest(expected); assert.equal(record.rawByteDigest, expected, 'saved comparison bytes changed'); }
  return { value: parseJsonRejectDuplicateKeys(record.bytes.toString('utf8')), digest: record.rawByteDigest };
};

function validateManifest(value) {
  keys(value, ['kind', 'evidence_kind', 'fixture_ids', 'repetitions', 'reports', ...(Object.hasOwn(value, 'api_equivalent_prices') ? ['api_equivalent_prices'] : [])], 'report manifest');
  assert.ok(['ask_primary_nine_condition_report_input_v1', 'ask_primary_nine_condition_report_input_v2'].includes(value.kind));
  const native = value.kind.endsWith('_v2');
  assert.ok(['observed', 'synthetic'].includes(value.evidence_kind), 'explicit evidence kind required');
  const catalog = PRIMARY_FIXTURE_REGISTRY.map(row => row[0]);
  assert.ok(Array.isArray(value.fixture_ids) && value.fixture_ids.length > 0, 'explicit task scope required');
  same(value.fixture_ids, catalog.filter(id => value.fixture_ids.includes(id)), 'tasks must be unique registered IDs in canonical order');
  assert.ok(Array.isArray(value.repetitions) && value.repetitions.length > 0 && value.repetitions.length <= 100);
  assert.ok(value.repetitions.every(n => Number.isSafeInteger(n) && n > 0));
  same(value.repetitions, [...new Set(value.repetitions)].sort((a, b) => a - b), 'unique ordered repetitions required');
  assert.ok(Array.isArray(value.reports) && value.reports.length <= NINE_REPORT_SETTINGS.length * value.repetitions.length * (native ? value.fixture_ids.length : 1));
  const seen = new Set(), paths = new Set();
  for (const entry of value.reports) {
    keys(entry, ['path', 'digest', 'model', 'reasoning', 'repetition', ...(native ? ['fixture_id', 'plan', ...(Object.hasOwn(entry, 'reference_protocol') ? ['reference_protocol'] : []), ...(Object.hasOwn(entry, 'reference_review') ? ['reference_review'] : [])] : [])], 'saved report reference'); digest(entry.digest);
    if (native) {
      assert.ok(value.fixture_ids.includes(entry.fixture_id));
      for (const key of ['plan', 'reference_protocol', 'reference_review']) if (entry[key]) { keys(entry[key], ['path', 'digest'], key); digest(entry[key].digest); }
      assert.ok(entry.plan && (!entry.reference_review || entry.reference_protocol), 'review needs a fixed protocol');
    }
    assert.ok(NINE_REPORT_SETTINGS.some(setting => settingKey(setting) === settingKey(entry)), 'unsupported model/effort setting');
    assert.ok(value.repetitions.includes(entry.repetition));
    const key = `${settingKey(entry)}/${entry.repetition}/${native ? entry.fixture_id : ''}`;
    assert.ok(!seen.has(key) && !paths.has(entry.path), 'duplicate model/repetition or report path');
    seen.add(key); paths.add(entry.path);
  }
  if (value.api_equivalent_prices !== undefined) {
    const prices = value.api_equivalent_prices;
    keys(prices, ['currency', 'as_of', 'source', 'models'], 'explicit API-equivalent prices');
    assert.match(prices.currency, /^[A-Z]{3}$/u, 'currency must be an explicit ISO-style code');
    assert.match(prices.as_of, /^\d{4}-\d{2}-\d{2}$/u, 'price date required');
    assert.equal(new Date(`${prices.as_of}T00:00:00Z`).toISOString().slice(0, 10), prices.as_of, 'invalid price date');
    assert.ok(typeof prices.source === 'string' && prices.source.length <= 2048 && !/[\s\u0000-\u001f\u007f]/u.test(prices.source), 'single-line price source URL required');
    const source = new URL(prices.source);
    assert.ok(source.protocol === 'https:' && !source.username && !source.password && !source.search && !source.hash, 'price source must be a credential-free HTTPS document URL');
    assert.ok(Array.isArray(prices.models));
    same(prices.models.map(entry => entry.model).sort(), [...new Set(NINE_REPORT_SETTINGS.map(entry => entry.model))].sort(), 'exact two-model price inventory required');
    for (const rate of prices.models) {
      keys(rate, ['model', 'input_per_million', 'cached_input_per_million', 'output_per_million'], 'model price');
      for (const key of ['input_per_million', 'cached_input_per_million', 'output_per_million']) {
        assert.notEqual(rate[key], null, 'explicit non-null rate required'); nonnegative(rate[key], key);
      }
    }
  }
}

function componentCost(row, prices) {
  if (!prices || [row.input_tokens, row.output_tokens, row.cached_tokens].some(value => value === null)) return null;
  const rate = prices.models.find(value => value.model === row.model);
  return nonnegative(((row.input_tokens - row.cached_tokens) * rate.input_per_million + row.cached_tokens * rate.cached_input_per_million + row.output_tokens * rate.output_per_million) / 1_000_000,
    'API-equivalent reported-component estimate');
}

function projectSlot(slot, entry, manifest, provenance, sourcePins, scoringPins, runReports) {
  assert.ok(manifest.fixture_ids.includes(slot.fixture_id), 'report task outside declared scope');
  assert.ok(NINE_REPORT_CONDITIONS.includes(slot.condition), 'unexpected condition');
  assert.ok(STATES.has(slot.state), 'unknown execution state'); safeID(slot.run_id); digest(slot.plan_digest);
  const row = { model: entry.model, reasoning: entry.reasoning, repetition: entry.repetition, fixture_id: slot.fixture_id,
    condition: slot.condition, state: slot.state, run_id: slot.run_id, plan_digest: slot.plan_digest, quality: quality(slot.quality),
    evidence_kind: manifest.evidence_kind, input_tokens: null, output_tokens: null, cached_tokens: null,
    duration_ms: null, cost: null, strict_requirement_success: null, success: null, process_completed: null,
    usage_components: { reasoning_output_tokens: null, cache_write_input_tokens: null }, reference_protocol_status: 'not_supplied',
    grading_execution_status: slot.grading?.status ?? 'unknown', grading_execution_complete: slot.grading?.status === 'completed',
    success_limitation: 'safety/blocker aggregates are not embedded in the retained batch report; no adoption or full pass inferred',
    actual_model: null, actual_model_status: 'unobserved', source_digest: null, task_digest: null, verification_digest: null,
    scoring_version_digest: null, report_digest: provenance.digest };
  assert.ok(['completed', 'unknown', 'blocked', 'not_started'].includes(row.grading_execution_status), 'unknown aggregate grading execution status');
  assert.ok(slot.cost == null, 'native batch cost has no supported monetary contract; non-null cost cannot be interpreted');
  const child = slot.child_report;
  if (!child) {
    assert.equal(row.quality, null, 'quality without retained child report');
    assert.equal(slot.usage, null, 'usage without retained child report');
    return row;
  }
  assert.equal(child.kind, 'ask_user_comparison_report_v1');
  assert.equal(child.run_id, row.run_id); assert.equal(child.plan_digest, row.plan_digest);
  assert.ok(child.evidence_kind === manifest.evidence_kind || child.evidence_kind === 'plan', 'mixed synthetic/observed evidence');
  assert.equal(child.configuration?.model, row.model, 'configured model differs from manifest');
  assert.equal(child.configuration?.reasoning, row.reasoning, 'configured effort differs from manifest');
  assert.equal(child.configuration?.kernel_condition, 'kernel_principles_v2', 'wrong K definition');
  assert.ok(Array.isArray(child.slots));
  same(child.slots.map(value => value.condition), NINE_REPORT_CONDITIONS, 'child condition set/order changed');
  const native = child.slots.find(value => value.condition === row.condition);
  row.process_completed = native.process_completed ?? null;
  assert.equal(native.state, row.state, 'batch and child state differ');
  assert.ok(native.cost == null, 'unsupported native monetary value');
  same(slot.usage, native.metrics ?? null, 'batch and child usage differ');
  if (child.evidence_kind === 'plan') assert.ok(child.slots.every(value => value.state === 'not_started'), 'plan-only evidence contains execution');
  if (native.actual_model != null) {
    assert.ok(typeof native.actual_model === 'string' && /^[a-zA-Z0-9._:/-]{1,160}$/u.test(native.actual_model), 'invalid observed model identifier');
    row.actual_model = native.actual_model;
    row.actual_model_status = native.actual_model === row.model ? 'reported_matches_requested' : 'reported_differs_requested';
    assert.equal(native.actual_model, row.model, 'observed model differs; separate experiment required');
  }
  for (const key of metricKeys) row[key] = nonnegative(native.metrics?.[key], key, key !== 'duration_ms');
  row.usage_components = Object.fromEntries(['reasoning_output_tokens', 'cache_write_input_tokens'].map(key => [key, nonnegative(native.usage_components?.[key], key, true)]));
  assert.ok(row.cached_tokens === null || row.input_tokens === null || row.cached_tokens <= row.input_tokens, 'cached input exceeds input total');
  if (native.state === 'not_started') assert.ok(metricKeys.every(key => row[key] === null), 'unstarted slot has measured usage/time');
  const sameRun = runReports.get(row.run_id), childDigest = canonicalDigest(child);
  if (sameRun) assert.equal(sameRun, childDigest, 'same run has different retained child reports'); else runReports.set(row.run_id, childDigest);
  digest(child.source?.digest); row.source_digest = child.source.digest;
  const trials = child.summary?.supplied_notes?.trials;
  assert.ok(Array.isArray(trials), 'retained task/verification references required');
  same(trials.map(value => value.condition), NINE_REPORT_CONDITIONS, 'task reference condition set/order changed');
  const trial = trials.find(value => value.condition === row.condition);
  assert.ok(trial && trial.block_id === row.run_id, 'retained task/verification references required');
  digest(trial.task_ref); digest(trial.success_criteria_ref);
  row.task_digest = trial.task_ref; row.verification_digest = trial.success_criteria_ref;
  const taskPins = { source_digest: row.source_digest, task_digest: row.task_digest, verification_digest: row.verification_digest,
    runtime_declarations: Object.fromEntries(['cli_version', 'platform', 'global_ask_presence', 'primary_input_contract'].map(key => [key, child.configuration[key] ?? null])) };
  if (sourcePins.has(row.fixture_id)) same(sourcePins.get(row.fixture_id), taskPins, 'task/source/verification differs between settings or repetitions');
  else sourcePins.set(row.fixture_id, taskPins);
  const grade = slot.grading, graded = grade?.conditions?.find(value => value.condition === row.condition);
  const readout = grade?.readout, result = readout?.conditions?.find(value => value.condition === row.condition);
  if (readout?.scoring_version) {
    digest(readout.scoring_version.digest); row.scoring_version_digest = readout.scoring_version.digest;
    if (scoringPins.has(row.fixture_id)) assert.equal(scoringPins.get(row.fixture_id), row.scoring_version_digest, 'mixed scoring versions');
    else scoringPins.set(row.fixture_id, row.scoring_version_digest);
  }
  if (row.quality !== null) {
    assert.ok(['completed', 'unknown'].includes(grade?.status), 'quality without retained private grading execution');
    const gradingIDs = grade.conditions.map(value => value.condition);
    assert.ok(gradingIDs.length > 0 && gradingIDs.length <= NINE_REPORT_CONDITIONS.length, 'private grading condition set/order changed');
    same(gradingIDs, NINE_REPORT_CONDITIONS.slice(0, gradingIDs.length), 'private grading condition set/order changed');
    if (grade.status === 'completed') same(gradingIDs, NINE_REPORT_CONDITIONS, 'completed private grading inventory incomplete');
    same(readout.conditions.map(value => value.condition), NINE_REPORT_CONDITIONS, 'private readout condition set/order changed');
    assert.equal(graded?.status, 'completed'); assert.equal(graded?.scoring_status, 'complete');
    assert.equal(graded?.evidence_kind, manifest.evidence_kind, 'private grading evidence kind differs');
    assert.equal(graded?.grader_process_completed, true, 'grading child completion unverified');
    assert.equal(quality(graded.quality), row.quality); assert.equal(quality(result?.quality), row.quality);
    assert.equal(readout?.run_id, row.run_id); assert.equal(readout?.plan_digest, row.plan_digest); assert.equal(readout?.fixture_id, row.fixture_id);
    assert.ok(row.scoring_version_digest, 'numeric quality needs an explicit scoring version');
    assert.equal(native.receipt_integrity, 'valid', 'quality has no valid native receipt');
    assert.equal(native.process_completed, true); assert.equal(native.unresolved_child, false);
    assert.equal(native.scope?.status, 'pass');
    assert.ok(['completed', 'verification_failed'].includes(native.state));
    const requirements = result.requirement_judgments;
    if (Array.isArray(requirements) && requirements.length > 0) {
      const outcomes = new Set(['pass', 'fail', 'partial', 'not_evaluated', 'manual_review_required', 'unavailable']);
      const ids = new Set();
      for (const requirement of requirements) {
        safeID(requirement.requirement_id); assert.ok(!ids.has(requirement.requirement_id)); ids.add(requirement.requirement_id);
        assert.ok(outcomes.has(requirement.outcome), 'unknown requirement outcome');
        nonnegative(requirement.earned_points, 'earned_points');
        if (['pass', 'fail', 'partial'].includes(requirement.outcome)) assert.ok(requirement.evidence_references?.length > 0, 'decided requirement lacks evidence');
      }
      row.strict_requirement_success = row.quality === 1 && requirements.every(value => value.outcome === 'pass');
    }
  }
  return row;
}

const canonicalPromptDigest = value => { assert.equal(typeof value, 'string', 'fixed prompt required'); return `sha256:${createHash('sha256').update(value).digest('hex')}`; };

function normalizeNativeReport(child, entry) {
  assert.equal(child.kind, 'ask_user_comparison_report_v1');
  const retained = readJson(entry.plan.path, entry.plan.digest), plan = retained.value;
  assert.equal(entry.plan.digest, child.plan_digest, 'report/plan digest mismatch');
  assert.equal(plan.run_id, child.run_id); same(plan.config, child.configuration, 'plan configuration differs');
  same(plan.source, child.source, 'plan source differs');
  assert.ok(plan.kernel_definition && plan.full_definition, 'fixed instruction identities required');
  assert.equal(plan.input?.digest, canonicalPromptDigest(plan.prompt), 'saved prompt/input digest differs');
  assert.ok(Array.isArray(plan.mutable_paths) && plan.policy && plan.execution_protocol, 'fixed scope/budget/policy required');
  const trials = child.summary?.supplied_notes?.trials;
  assert.ok(Array.isArray(trials));
  for (const trial of trials) {
    assert.equal(trial.task_ref, plan.task?.digest); assert.equal(trial.success_criteria_ref, plan.verification?.digest);
  }
  return { kind: 'ask_primary_evaluation_batch_report_v1', batch_id: child.run_id, manifest_digest: entry.plan.digest,
    state: child.overall?.state ?? 'unknown', errors: [],
    instruction_identity: { kernel: plan.kernel_definition, full: plan.full_definition },
    comparison_identity: { input_digest: plan.input.digest, policy: plan.policy, execution_protocol: plan.execution_protocol, mutable_paths: plan.mutable_paths,
      config: Object.fromEntries(Object.entries(plan.config).filter(([key]) => !['model', 'reasoning'].includes(key))),
      personal_inputs: Object.fromEntries(Object.entries(plan.arms ?? {}).map(([id, arm]) => [id, arm.personal_prompt?.input_digest ?? null])) },
    reference_protocol_digest: plan.reference_review_protocol_digest ?? null,
    slots: child.slots.map(native => ({ fixture_id: entry.fixture_id, run_id: child.run_id, plan_digest: child.plan_digest,
      condition: native.condition, state: native.state, quality: null, usage: native.metrics ?? null, cost: null,
      grading: { status: 'unknown' }, child_report: child })) };
}

function applyReferenceReview(row, slot, entry, normalized, evidenceKind) {
  if (!entry.reference_protocol) return;
  const protocol = readJson(entry.reference_protocol.path, entry.reference_protocol.digest).value;
  keys(protocol, ['kind', 'fixture_id', 'source_digest', 'task_digest', 'verification_digest', 'criteria', 'limitations'], 'reference protocol');
  assert.equal(protocol.kind, 'ask_reference_review_protocol_v1'); assert.equal(protocol.fixture_id, row.fixture_id);
  for (const key of ['source_digest', 'task_digest', 'verification_digest']) assert.equal(protocol[key], row[key], 'reference/public input differs');
  assert.ok(Array.isArray(protocol.criteria) && protocol.criteria.length > 0 && protocol.criteria.length <= 1000);
  const ids = new Set();
  for (const criterion of protocol.criteria) {
    keys(criterion, ['id', 'weight', 'description'], 'public criterion'); safeID(criterion.id);
    assert.ok(!ids.has(criterion.id)); ids.add(criterion.id);
    assert.ok(nonnegative(criterion.weight, 'criterion weight') > 0);
    assert.ok(typeof criterion.description === 'string' && criterion.description.length > 0 && criterion.description.length <= 4000);
  }
  assert.ok(Array.isArray(protocol.limitations) && protocol.limitations.every(value => typeof value === 'string' && value.length <= 4000));
  row.reference_protocol_digest = entry.reference_protocol.digest;
  row.reference_protocol_status = normalized.reference_protocol_digest === null ? 'not_plan_pinned' : 'plan_pinned';
  if (normalized.reference_protocol_digest === null) return;
  assert.equal(normalized.reference_protocol_digest, entry.reference_protocol.digest, 'reference protocol differs from fixed execution plan');
  if (!entry.reference_review) return;
  const review = readJson(entry.reference_review.path, entry.reference_review.digest).value;
  keys(review, ['kind', 'evidence_kind', 'fixture_id', 'run_id', 'plan_digest', 'protocol_digest', 'conditions'], 'reference review');
  assert.equal(review.kind, 'ask_reference_review_v1'); assert.equal(review.evidence_kind, evidenceKind);
  for (const key of ['fixture_id', 'run_id', 'plan_digest']) assert.equal(review[key], row[key], 'reference run identity mismatch');
  assert.equal(review.protocol_digest, entry.reference_protocol.digest, 'reference protocol mismatch');
  same(review.conditions.map(value => value.condition), NINE_REPORT_CONDITIONS, 'reference condition inventory differs');
  const result = review.conditions.find(value => value.condition === row.condition);
  keys(result, ['condition', 'artifacts', 'judgments', 'diagnostics'], 'reference condition');
  const native = slot.child_report.slots.find(value => value.condition === row.condition);
  same(result.artifacts, native.artifacts, 'reference answer artifacts differ');
  assert.ok(Object.keys(result.artifacts).length > 0, 'review needs retained answer artifacts');
  for (const value of Object.values(result.artifacts)) digest(value);
  assert.equal(native.receipt_integrity, 'valid'); assert.equal(native.process_completed, true);
  assert.equal(native.unresolved_child, false); assert.equal(native.scope?.status, 'pass');
  assert.ok(['completed', 'verification_failed'].includes(native.state), 'unfinished answer cannot receive reference score');
  same(result.judgments.map(value => value.criterion_id), protocol.criteria.map(value => value.id), 'criterion inventory differs');
  let earned = 0, possible = 0, unknown = false;
  for (const [index, judgment] of result.judgments.entries()) {
    keys(judgment, ['criterion_id', 'outcome', 'evidence'], 'reference judgment');
    assert.ok(['pass', 'fail', 'unknown'].includes(judgment.outcome));
    assert.ok(Array.isArray(judgment.evidence) && (judgment.outcome === 'unknown' || judgment.evidence.length > 0), 'decided reference criterion needs evidence');
    judgment.evidence.forEach(digest);
    const weight = protocol.criteria[index].weight; possible += weight;
    if (judgment.outcome === 'unknown') unknown = true;
    if (judgment.outcome === 'pass') earned += weight;
  }
  assert.ok(Number.isFinite(possible) && possible > 0 && Number.isFinite(earned), 'reference weights overflow');
  row.reference_score = unknown ? null : earned / possible;
  keys(result.diagnostics, Object.keys(result.diagnostics), 'reference diagnostics');
  const allowed = ['detected', 'missed', 'false_positives', 'duplicates', 'factual_or_locator_errors'];
  assert.ok(Object.keys(result.diagnostics).every(key => allowed.includes(key)));
  for (const value of Object.values(result.diagnostics)) assert.ok(nonnegative(value, 'diagnostic count', true) !== null);
  row.reference_diagnostics = result.diagnostics;
  row.reference_review_digest = entry.reference_review.digest;
}

// Same complete task set across all nine groups, equal weight per task. No
// observed-only means masquerade as full24, and formal/reference never pool.
function comparisonPanel(rows, manifest, scoreKey) {
  const eligible = manifest.fixture_ids.filter(fixture => {
    const population = rows.filter(row => row.fixture_id === fixture);
    return population.every(row => row[scoreKey] !== null && row.duration_ms !== null && row.input_tokens !== null && row.output_tokens !== null)
      && (scoreKey !== 'reference_score' || new Set(population.map(row => row.reference_protocol_digest)).size === 1);
  });
  if (scoreKey === 'reference_score') for (const fixture of manifest.fixture_ids) {
    const pins = rows.filter(row => row.fixture_id === fixture && row.reference_protocol_digest).map(row => row.reference_protocol_digest);
    assert.ok(new Set(pins).size <= 1, 'reference protocol differs across settings or repetitions');
  }
  const groups = NINE_REPORT_SETTINGS.flatMap(setting => NINE_REPORT_CONDITIONS.map(condition => {
    const members = rows.filter(row => eligible.includes(row.fixture_id) && settingKey(row) === settingKey(setting) && row.condition === condition);
    const total = key => members.length ? sum(members.map(row => row[key])).known_sum : null;
    const perTask = eligible.map(fixture => {
      const values = members.filter(row => row.fixture_id === fixture).map(row => row[scoreKey]);
      return values.reduce((a, b) => a + b, 0) / values.length;
    });
    return { ...setting, condition, score_100: eligible.length ? perTask.reduce((a, b) => a + b, 0) / eligible.length * 100 : null,
      attempt_duration_ms: total('duration_ms'), total_tokens: members.length ? sum(members.map(row => row.input_tokens + row.output_tokens)).known_sum : null };
  }));
  return { score_basis: scoreKey === 'quality' ? 'formal_retained_score' : 'public_reference_review',
    fixture_ids: eligible, excluded_fixture_ids: manifest.fixture_ids.filter(id => !eligible.includes(id)),
    planned_tasks: manifest.fixture_ids.length, repetitions: manifest.repetitions.length,
    aggregation: 'equal task weight, normalized 0–100; summed attempts on identical task intersection', groups };
}

function sum(values) {
  const known = values.filter(value => value !== null), result = known.reduce((total, value) => total + value, 0);
  assert.ok(Number.isFinite(result) && result <= Number.MAX_SAFE_INTEGER, 'aggregate overflow');
  return { known_sum: known.length ? result : null, complete: known.length === values.length, known_count: known.length, missing_count: values.length - known.length };
}

export function buildPrimaryNineConditionReport(manifestPath) {
  const input = readJson(manifestPath), manifest = input.value; validateManifest(manifest);
  const rows = new Map(), taskRuns = new Map(), runOwners = new Map(), sourcePins = new Map(), scoringPins = new Map(), runReports = new Map(), inputs = [];
  for (const entry of manifest.reports) {
    const saved = readJson(entry.path, entry.digest);
    const report = manifest.kind.endsWith('_v2') ? normalizeNativeReport(saved.value, entry) : saved.value;
    assert.equal(report.kind, 'ask_primary_evaluation_batch_report_v1'); safeID(report.batch_id); digest(report.manifest_digest);
    assert.ok(Array.isArray(report.slots) && Array.isArray(report.errors), 'batch slots/errors required');
    inputs.push({ digest: entry.digest, model: entry.model, reasoning: entry.reasoning, repetition: entry.repetition, batch_manifest_digest: report.manifest_digest,
      state: report.state, error_count: report.errors.length });
    for (const slot of report.slots) {
      if (report.errors.length) assert.equal(slot.quality, null, 'batch integrity errors cannot carry numeric quality');
      const row = projectSlot(slot, entry, manifest, saved, sourcePins, scoringPins, runReports);
      row.measurement_kind = 'ask_comparison_measurement_v1';
      row.reference_score = null; row.reference_protocol_digest = null; row.reference_diagnostics = null;
      if (manifest.kind.endsWith('_v2')) {
        const pin = canonicalDigest({ instruction: report.instruction_identity, comparison: report.comparison_identity });
        const key = `instruction/${row.fixture_id}`;
        if (sourcePins.has(key)) assert.equal(sourcePins.get(key), pin, 'instruction/input/scope/budget differs across settings'); else sourcePins.set(key, pin);
        applyReferenceReview(row, slot, entry, report, manifest.evidence_kind);
      }
      row.api_equivalent_reported_component_cost = componentCost(row, manifest.api_equivalent_prices);
      const key = rowKey(row), taskKey = `${settingKey(row)}/${row.repetition}/${row.fixture_id}`;
      assert.ok(!rows.has(key), 'duplicate task/condition/repetition slot');
      const runBinding = `${row.run_id}/${row.plan_digest}`;
      if (taskRuns.has(taskKey)) assert.equal(taskRuns.get(taskKey), runBinding, 'task conditions belong to different plans/runs'); else taskRuns.set(taskKey, runBinding);
      if (runOwners.has(row.run_id)) assert.equal(runOwners.get(row.run_id), taskKey, 'duplicate run reused across tasks/settings/repetitions'); else runOwners.set(row.run_id, taskKey);
      rows.set(key, row);
    }
  }
  const ordered = [], groups = [];
  for (const setting of NINE_REPORT_SETTINGS) for (const condition of NINE_REPORT_CONDITIONS) {
    const members = manifest.repetitions.flatMap(repetition => manifest.fixture_ids.map(fixture_id => {
      const expected = { ...setting, repetition, fixture_id, condition }, existing = rows.get(rowKey(expected));
      return existing ?? { ...expected, state: 'not_reported', quality: null, input_tokens: null, output_tokens: null, cached_tokens: null,
        duration_ms: null, cost: null, api_equivalent_reported_component_cost: null, success: null, strict_requirement_success: null, evidence_kind: manifest.evidence_kind,
        grading_execution_status: 'not_reported', grading_execution_complete: false,
        measurement_kind: 'ask_comparison_measurement_v1', reference_score: null, reference_protocol_digest: null, reference_diagnostics: null,
        process_completed: null, reference_protocol_status: 'not_supplied', usage_components: { reasoning_output_tokens: null, cache_write_input_tokens: null },
        actual_model: null, actual_model_status: 'unobserved', run_id: null, plan_digest: null, report_digest: null };
    }));
    ordered.push(...members);
    const qualities = members.map(row => row.quality).filter(value => value !== null), inputTokens = sum(members.map(row => row.input_tokens)), outputTokens = sum(members.map(row => row.output_tokens));
    groups.push({ ...setting, condition, expected_slots: members.length, reported_slots: members.filter(row => row.state !== 'not_reported').length,
      quality: { mean_of_known: qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null, known_count: qualities.length, missing_count: members.length - qualities.length,
        complete: qualities.length === members.length }, states: Object.fromEntries([...new Set(members.map(row => row.state))].map(state => [state, members.filter(row => row.state === state).length])),
      grading_execution_states: Object.fromEntries([...new Set(members.map(row => row.grading_execution_status))].map(state => [state, members.filter(row => row.grading_execution_status === state).length])),
      grading_execution_complete_count: members.filter(row => row.grading_execution_complete).length,
      strict_requirement_success_count: members.filter(row => row.strict_requirement_success === true).length,
      success_count: null, success_missing_count: members.length,
      input_tokens: inputTokens, output_tokens: outputTokens, cached_tokens: sum(members.map(row => row.cached_tokens)),
      total_tokens: { ...sum(members.map(row => row.input_tokens === null || row.output_tokens === null ? null : row.input_tokens + row.output_tokens)),
        known_sum: inputTokens.known_sum === null && outputTokens.known_sum === null ? null : nonnegative((inputTokens.known_sum ?? 0) + (outputTokens.known_sum ?? 0), 'known input+output lower bound', true),
        partially_known_count: members.filter(row => (row.input_tokens === null) !== (row.output_tokens === null)).length },
      model_duration_ms: sum(members.map(row => row.duration_ms)), end_to_end_duration_ms: null,
      api_equivalent_reported_component_cost: sum(members.map(row => row.api_equivalent_reported_component_cost)),
      cost: null, cost_per_success: null, cost_per_success_status: 'undefined_missing_monetary_and_safety_evidence' });
  }
  const coverage = { expected: ordered.length, reported: ordered.filter(row => row.state !== 'not_reported').length,
    measured: ordered.filter(row => row.duration_ms !== null).length,
    completed: ordered.filter(row => row.state === 'completed' && row.process_completed === true).length,
    not_started: ordered.filter(row => ['not_started', 'not_reported'].includes(row.state)).length,
    formal_scored: ordered.filter(row => row.quality !== null).length,
    reference_scored: ordered.filter(row => row.reference_score !== null).length,
    unscorable: ordered.filter(row => !['not_started', 'not_reported'].includes(row.state) && row.quality === null && row.reference_score === null).length,
    missing: ordered.filter(row => row.state === 'not_reported').length };
  return { kind: 'ask_primary_nine_condition_report_v1', evidence_kind: manifest.evidence_kind, coverage,
    panels: { formal: comparisonPanel(ordered, manifest, 'quality'), reference: comparisonPanel(ordered, manifest, 'reference_score') },
    evidence_label: manifest.evidence_kind === 'synthetic' ? 'SYNTHETIC FIXTURE — NOT REAL QUALITY' : 'OBSERVED REPORT PROJECTION — NOT RUNTIME QUALIFICATION',
    manifest_digest: input.digest, fixture_ids: manifest.fixture_ids, repetitions: manifest.repetitions, inputs, slots: ordered, groups,
    api_equivalent_prices: manifest.api_equivalent_prices ?? null,
    execution_authority: false, scoring_authority: false, formal_aggregate_eligible: false,
    limitations: ['Offline JSON integrity/projection does not independently verify runtime or private grading authority.',
      'Public source/task/verification and scoring selector pins are checked when retained; complete ASK/startup/resource provenance still requires the original plans and receipts.',
      'Child source.digest identifies the public task seed, not Full/kernel instruction source. Seed equality does not establish experiment comparability; instruction and startup identity are not embedded in these reports and remain unverified.',
      'Configured model/effort are not independently resolved values. Missing actual model is retained as unobserved.',
      'Quality means cover known private scores only; denominators and missing rows are explicit. No significance or causal claim is made.',
      'Input+output excludes cached tokens as an additional charge; cached input is a subset and is never added again.',
      'Duration is the retained model-condition duration, not total grader/setup/provider wall time.',
      'Actual monetary cost, included ChatGPT quota consumption and full pass remain unknown. Optional operator-supplied prices are unverified, date/source-labeled API-equivalent estimates of reported input/cached/output components only; cache-write, tools, setup/review, grader and other charges are not measured or included.',
      'One repetition and fixed execution order do not estimate variance or establish superiority; cache/provider/session effects remain possible confounders.',
      'Native/runtime/admission acceptance is not established by a public check or this report; missing native-dependent scores remain unknown.',
      'Synthetic fixtures are development evidence only and cannot be pooled with observed results.'] };
}

const xml = value => String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const markdownText = value => xml(value).replace(/[`\\[\]()*_!~|]/gu, char => char === '`' ? '&#96;' : `\\${char}`);
const short = group => `${group.model === 'gpt-6-luna' ? 'luna' : 'sol'} ${group.reasoning} ${group.condition === 'plain' ? 'P' : group.condition === 'full_ask' ? 'F' : 'K2'}`;
// One renderer for both evidence classes; no score or missing metric is inferred.
function chart(report, axis, basis = 'formal') {
  const panel = report.panels[basis];
  const selected = report.slots.filter(row => panel.fixture_ids.includes(row.fixture_id));
  const amount = group => {
    if (axis === 'time') return group.attempt_duration_ms === null ? null : group.attempt_duration_ms / 1000;
    if (axis === 'tokens') return group.total_tokens;
    const members = selected.filter(row => settingKey(row) === settingKey(group) && row.condition === group.condition);
    const total = sum(members.map(row => row.api_equivalent_reported_component_cost));
    return members.length && total.complete ? total.known_sum : null;
  };
  const points = panel.groups.filter(group => group.score_100 !== null && amount(group) !== null);
  const maximum = Math.max(0, ...points.map(amount)) || 1;
  const label = axis === 'cost' ? report.api_equivalent_prices ? `API equivalent ${report.api_equivalent_prices.currency} — not actual billing or total cost` : 'Monetary estimate unavailable — no explicit operator-supplied prices'
    : axis === 'tokens' ? 'Summed input + output tokens (cached input is a subset)' : 'Summed attempt seconds (not parallel wall time; excludes separate grading)';
  const clusters = new Map();
  for (const point of points) {
    const key = JSON.stringify([amount(point), point.score_100]);
    if (!clusters.has(key)) clusters.set(key, { id: clusters.size + 1, groups: [] });
    clusters.get(key).groups.push(point);
  }
  const colors = ['#0072B2', '#D55E00', '#009E73'];
  const dots = points.map(group => {
    const x = 75 + amount(group) / maximum * 650, y = 370 - group.score_100 * 2.7;
    const index = NINE_REPORT_SETTINGS.findIndex(value => settingKey(value) === settingKey(group)), fill = colors[index];
    const shape = group.condition === 'plain' ? `<circle cx="${x}" cy="${y}" r="6"/>`
      : group.condition === 'full_ask' ? `<rect x="${x - 5}" y="${y - 5}" width="10" height="10"/>`
        : `<path d="M${x} ${y - 7} L${x - 6} ${y + 5} L${x + 6} ${y + 5} Z"/>`;
    return `<g data-model="${xml(settingKey(group))}" data-condition="${xml(group.condition)}" fill="${fill}" fill-opacity="0.6" stroke="${fill}"><title>${xml(short(group))}: score ${group.score_100}, x ${amount(group)}</title>${shape}</g>`;
  }).join('');
  const coordinateLabels = [...clusters.values()].map(cluster => { const point = cluster.groups[0]; return `<text x="${83 + amount(point) / maximum * 650}" y="${363 - point.score_100 * 2.7}" font-size="12">${cluster.id}</text>`; }).join('');
  let legendRow = 0;
  const legend = [...clusters.values()].flatMap(cluster => cluster.groups.map(group => `<text x="780" y="${122 + 22 * legendRow++}" font-size="12">${cluster.id}: ${xml(short(group))}</text>`)).join('');
  const scope = `${report.fixture_ids.length} tasks × ${report.repetitions.length} repetitions; ${report.fixture_ids.length * report.repetitions.length} planned slots/group`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="555" viewBox="0 0 1000 555"><rect width="1000" height="555" fill="white"/><g font-family="sans-serif" fill="#1a202c"><text x="30" y="30" font-size="20">${basis === 'formal' ? 'Formal retained score' : 'Public reference review score'} / ${xml(axis)}</text><text x="30" y="52" font-size="12">${xml(report.evidence_label)}</text><text x="30" y="72" font-size="12">${xml(scope)}</text><path d="M75 90 V370 H750" fill="none" stroke="#718096"/><text x="33" y="104">100</text><text x="42" y="373">0</text><text x="75" y="400">0</text><text x="680" y="400">${axis === 'cost' && !points.length ? 'unknown' : maximum.toPrecision(4)}</text><text x="75" y="424" font-size="12">${xml(label)}</text><text x="780" y="100" font-size="12">Shared ID = tied coordinates</text><text x="30" y="453" font-size="12">Common scored tasks: ${panel.fixture_ids.length}/${panel.planned_tasks}; equal task weight; score 0–100.</text><text x="30" y="475" font-size="12">${xml(points.length ? `${points.length}/9 groups plotted; ${clusters.size} distinct coordinate markers. No jitter; coincident groups remain in the table.` : 'No comparable measured points. Unknown values are not zero; no cost or quality points were invented.')}</text><text x="30" y="497" font-size="12">Color: sol high blue / sol low orange / luna max green. Shape: P circle / K2 triangle / F square.</text><text x="30" y="519" font-size="11">${xml(axis === 'cost' && report.api_equivalent_prices ? `Operator-supplied, not verified. As of ${report.api_equivalent_prices.as_of}; source: ${report.api_equivalent_prices.source}` : 'Requested settings; resolved model may be unobserved. No execution, scoring or adoption authority.')}</text>${dots}${coordinateLabels}${legend}</g></svg>\n`;
}

export function renderPrimaryNineConditionHtml(report) {
  const number = value => value === null || value === undefined ? '未取得' : Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
  const score = value => value === null ? '—' : number(value * 100);
  const sections = ['formal', 'reference'].map(basis => {
    const panel = report.panels[basis];
    return `<section><h2>${basis === 'formal' ? '正式採点（保存された得点）' : '参考レビュー（公開要件の固定基準）'}</h2><p>比較共通集合：${panel.fixture_ids.length}/${panel.planned_tasks}課題。課題内を0–100へ正規化し課題を等重み。全9条件で得点・時間・tokenが揃う課題だけを同じ分母で比較します。</p><p>対象：${xml(panel.fixture_ids.join(', ') || 'なし')}。除外：${xml(panel.excluded_fixture_ids.join(', ') || 'なし')}。</p>${chart(report, 'time', basis)}${chart(report, 'tokens', basis)}</section>`;
  }).join('');
  const heatmap = report.fixture_ids.map(id => `<tr><th>${xml(id)}</th>${NINE_REPORT_SETTINGS.flatMap(setting => NINE_REPORT_CONDITIONS.map(condition => {
    const rows = report.slots.filter(row => row.fixture_id === id && settingKey(row) === settingKey(setting) && row.condition === condition);
    const known = key => rows.every(row => row[key] !== null) ? rows.reduce((total, row) => total + row[key], 0) / rows.length : null;
    const formal = known('quality'), reference = known('reference_score');
    const tone = reference ?? formal;
    return `<td style="background:${tone === null ? '#f2f4f5' : `hsl(${reference === null ? 40 : 190} 45% ${96 - tone * 25}%)`}">正式 ${score(formal)}<br>参考 ${score(reference)}</td>`;
  })).join('')}</tr>`).join('');
  const headers = NINE_REPORT_SETTINGS.flatMap(setting => NINE_REPORT_CONDITIONS.map(condition => `<th>${xml(short({ ...setting, condition }))}</th>`)).join('');
  const rows = report.slots.map(row => `<tr><th>${xml(row.fixture_id)}</th><td>${xml(short(row))}</td><td>${row.repetition}</td><td>${xml(row.state)}</td><td>${score(row.quality)}</td><td>${score(row.reference_score)}</td><td>${number(row.duration_ms === null ? null : row.duration_ms / 1000)}</td><td>${number(row.input_tokens)}</td><td>${number(row.cached_tokens)}</td><td>${number(row.output_tokens)}</td><td>${number(row.usage_components?.reasoning_output_tokens)}</td><td>${number(row.usage_components?.cache_write_input_tokens)}</td><td>${xml(row.actual_model ?? '不明')}</td><td>${xml(row.reference_diagnostics ? JSON.stringify(row.reference_diagnostics) : '未取得')}</td></tr>`).join('');
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ASK ${report.fixture_ids.length}課題・9条件比較</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px;color:#183042;background:#fff}h1,h2{line-height:1.4}.scroll{overflow:auto}table{border-collapse:collapse;font-size:13px;width:100%}th,td{border:1px solid #d8e1e6;padding:8px;text-align:left;white-space:nowrap}svg{display:block;width:100%;height:auto;min-width:650px}section{margin:32px 0}.notice{padding:16px;background:#eef4f6}li{margin:8px 0}</style><h1>ASK 指定設定別・9条件比較</h1><p>${xml(report.evidence_label)}</p><div class="notice">${report.fixture_ids.length}課題 × 9条件 × ${report.repetitions.length}反復。実行完了 ${report.coverage.completed}/${report.coverage.expected}、時間取得 ${report.coverage.measured}/${report.coverage.expected}、正式得点 ${report.coverage.formal_scored}/${report.coverage.expected}、参考得点 ${report.coverage.reference_scored}/${report.coverage.expected}、未開始 ${report.coverage.not_started}（うち未報告 ${report.coverage.missing}）、採点不能 ${report.coverage.unscorable}。未取得・未実行は0点・0費用ではありません。</div><p>金額費用は不明。横軸は同一課題集合の試行時間合計／input+output合計です。並列の全体経過時間とは区別します。cached inputはinputの内数、reasoningはoutputへ再加算しません。正式採点と参考レビューの得点は混ぜません。1反復の場合、統計的優位を主張しません。native/runtime/admission未達はこの図で解消しません。</p>${sections}<h2>課題×9条件ヒートマップ（0–100）</h2><p>セル内の正式・参考を別に記載。背景は参考値があれば青、参考欠測で正式値だけなら黄、両方未取得は灰色です。</p><div class="scroll"><table><tr><th>課題</th>${headers}</tr>${heatmap}</table></div><h2>全試行の内訳</h2><div class="scroll"><table><tr><th>課題</th><th>指定設定・方式</th><th>反復</th><th>状態</th><th>正式</th><th>参考</th><th>秒</th><th>input</th><th>cached内数</th><th>output</th><th>reported reasoning</th><th>reported cache write</th><th>resolved model</th><th>参考診断</th></tr>${rows}</table></div><h2>比較条件と限界</h2><ul>${report.limitations.map(value => `<li>${xml(value)}</li>`).join('')}</ul></html>\n`;
}

export function writePrimaryNineConditionReport(manifestPath, output) {
  assert.ok(isAbsolute(output) && resolve(output) === output && realpathSync(dirname(output)) === dirname(output), 'fresh canonical output required');
  assert.equal(existsSync(output), false, 'output exists; never overwrite');
  const input = readJson(manifestPath); validateManifest(input.value);
  for (const path of [manifestPath, ...input.value.reports.flatMap(entry => [entry.path, ...['plan', 'reference_protocol', 'reference_review'].filter(key => entry[key]).map(key => entry[key].path)])]) assert.ok(path !== output && !path.startsWith(`${output}/`), 'output overlaps an input');
  const report = buildPrimaryNineConditionReport(manifestPath);
  assert.equal(report.manifest_digest, input.digest, 'manifest changed while preparing report');
  mkdirSync(output, { mode: 0o700 });
  const save = (name, value) => writeFileSync(`${output}/${name}`, value, { flag: 'wx', mode: 0o600 });
  save('report.html', renderPrimaryNineConditionHtml(report));
  for (const axis of ['tokens', 'time']) save(`reference-${axis}.svg`, chart(report, axis, 'reference'));
  save('report.json', `${JSON.stringify(report, null, 2)}\n`);
  for (const axis of ['cost', 'tokens', 'time']) save(`quality-${axis}.svg`, chart(report, axis));
  const number = value => value === null ? 'unknown' : String(value);
  save('report.md', `# Nine-condition comparison\n\n${report.evidence_label}\n\n| Setting | Condition | Quality (known/expected) | Input+output known lower bound | Model ms known sum | API equivalent components (known/expected) | Full pass | Cost / pass |\n|---|---|---|---|---|---|---|---|\n${report.groups.map(group => `| ${group.model} ${group.reasoning} | ${group.condition} | ${number(group.quality.mean_of_known)} (${group.quality.known_count}/${group.expected_slots}) | ${number(group.total_tokens.known_sum)} (${group.total_tokens.known_count}/${group.expected_slots}) | ${number(group.model_duration_ms.known_sum)} (${group.model_duration_ms.known_count}/${group.expected_slots}) | ${number(group.api_equivalent_reported_component_cost.known_sum)} (${group.api_equivalent_reported_component_cost.known_count}/${group.expected_slots}) | unknown | undefined |`).join('\n')}\n\n${report.api_equivalent_prices ? `Operator-supplied prices (unverified), ${report.api_equivalent_prices.currency}, as of ${report.api_equivalent_prices.as_of}: ${markdownText(report.api_equivalent_prices.source)}\n\n` : ''}${report.limitations.map(note => `- ${note}`).join('\n')}\n`);
  return { kind: report.kind, manifest_digest: report.manifest_digest, output, evidence_kind: report.evidence_kind,
    groups: report.groups.length, expected_slots: report.slots.length, execution_authority: false, scoring_authority: false };
}

export function runPrimaryNineConditionReportCommand(argv) {
  assert.ok(argv.length === 4 && argv[0] === '--manifest' && argv[2] === '--output', 'usage: --manifest INPUT_JSON --output NEW_DIRECTORY');
  return writePrimaryNineConditionReport(argv[1], argv[3]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runPrimaryNineConditionReportCommand(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(`Offline report refused: ${error.message}`); process.exitCode = 10; }
}
