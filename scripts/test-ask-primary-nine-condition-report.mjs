import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildPrimaryNineConditionReport, writePrimaryNineConditionReport, runPrimaryNineConditionReportCommand, NINE_REPORT_SETTINGS, NINE_REPORT_CONDITIONS } from './ask-primary-nine-condition-report.mjs';

import { PRIMARY_FIXTURE_REGISTRY } from './ask-primary-fixture-registry.mjs';

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fixtureID = 'hi-authorization-exception';
const prices = () => ({ currency: 'USD', as_of: '2026-10-23', source: 'https://example.invalid/operator-supplied-test-rates',
  models: ['gpt-6.1-sol', 'gpt-6-luna'].map(model => ({ model, input_per_million: 2, cached_input_per_million: 0.2, output_per_million: 10 })) });
function fixture(t, { evidenceKind = 'synthetic', allSettings = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-nine-report-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const reports = [], values = [];
  for (const [index, setting] of (allSettings ? NINE_REPORT_SETTINGS : NINE_REPORT_SETTINGS.slice(0, 1)).entries()) {
    const runID = `test-run-${index}`, planDigest = hash(`plan-${index}`), metrics = { input_tokens: 100 + index, output_tokens: 20, cached_tokens: 40, duration_ms: 50 + index };
    const child = { kind: 'ask_user_comparison_report_v1', run_id: runID, plan_digest: planDigest, evidence_kind: evidenceKind,
      configuration: { ...setting, kernel_condition: 'kernel_principles_v2' }, source: { digest: hash('same public source') },
      slots: NINE_REPORT_CONDITIONS.map(condition => ({ condition, state: 'completed', outcome: 'pass', metrics: structuredClone(metrics), cost: null,
        receipt_integrity: 'valid', process_completed: true, unresolved_child: false, scope: { status: 'pass' }, actual_model: setting.model })),
      summary: { supplied_notes: { trials: NINE_REPORT_CONDITIONS.map(condition => ({ condition, block_id: runID, task_ref: hash('same task'), success_criteria_ref: hash('same verification') })) } } };
    const grade = { status: 'completed', scoring_status: 'complete', conditions: NINE_REPORT_CONDITIONS.map(condition => ({ condition, status: 'completed', scoring_status: 'complete', evidence_kind: evidenceKind,
      grader_process_completed: true, quality: index === 0 ? 0 : 1 })),
      readout: { fixture_id: fixtureID, run_id: runID, plan_digest: planDigest, scoring_status: 'complete', scoring_version: { path: '/unused/not-opened-selector.json', digest: hash('same selector') },
        conditions: NINE_REPORT_CONDITIONS.map(condition => ({ condition, quality: index === 0 ? 0 : 1,
          requirement_judgments: [{ requirement_id: 'REQ-1', outcome: index === 0 ? 'fail' : 'pass', earned_points: index === 0 ? 0 : 1,
            matched_equivalence_class_ids: [], finding_ids: [], evidence_references: [{ kind: 'test_result', digest: hash('artificial public evidence'), bytes: 1 }] }] })) } };
    const report = { kind: 'ask_primary_evaluation_batch_report_v1', batch_id: `synthetic-batch-${index}`, manifest_digest: hash(`manifest-${index}`), state: 'completed', errors: [],
      slots: NINE_REPORT_CONDITIONS.map(condition => ({ fixture_id: fixtureID, run_id: runID, plan_digest: planDigest, condition,
        state: 'completed', quality: index === 0 ? 0 : 1, usage: structuredClone(metrics), cost: null, grading: structuredClone(grade), child_report: structuredClone(child) })) };
    const path = join(root, `report-${index}.json`); values.push(report);
    reports.push({ path, digest: '', ...setting, repetition: 1 });
  }
  const manifest = { kind: 'ask_primary_nine_condition_report_input_v1', evidence_kind: evidenceKind, fixture_ids: [fixtureID], repetitions: [1], reports };
  const path = join(root, 'manifest.json');
  const save = () => {
    reports.forEach((entry, i) => { const raw = `${JSON.stringify(values[i])}\n`; writeFileSync(entry.path, raw); entry.digest = hash(raw); });
    writeFileSync(path, JSON.stringify(manifest));
  };
  save(); return { root, path, manifest, reports, values, save };
}

test('offline report retains nine exact settings, zero scores and explicit synthetic provenance', t => {
  const f = fixture(t), report = buildPrimaryNineConditionReport(f.path);
  assert.equal(report.groups.length, 9); assert.equal(report.slots.length, 9);
  assert.equal(report.groups[0].quality.mean_of_known, 0); assert.equal(report.groups[3].quality.mean_of_known, 1);
  assert.equal(report.groups[0].total_tokens.known_sum, 120, 'cached input must not be counted twice');
  assert.equal(report.groups[0].model_duration_ms.known_sum, 50);
  assert.equal(report.groups[3].strict_requirement_success_count, 1);
  assert.ok(report.groups.every(group => group.success_count === null && group.cost === null && group.cost_per_success === null));
  assert.match(report.evidence_label, /SYNTHETIC.*NOT REAL QUALITY/u);
  assert.equal(report.execution_authority, false); assert.equal(report.scoring_authority, false); assert.equal(report.formal_aggregate_eligible, false);
});

test('missing setting/report, unstarted slots and unavailable quality remain distinct from zero', t => {
  const f = fixture(t, { allSettings: false });
  for (const slot of f.values[0].slots) {
    slot.quality = null; slot.state = 'not_started'; slot.usage = null; slot.grading = { status: 'unknown' };
    slot.child_report.evidence_kind = 'plan';
    for (const native of slot.child_report.slots) { native.state = 'not_started'; native.metrics = null; delete native.actual_model; }
  }
  f.save(); const report = buildPrimaryNineConditionReport(f.path);
  assert.ok(report.groups.every(group => group.quality.mean_of_known === null));
  assert.equal(report.groups[0].states.not_started, 1); assert.equal(report.groups[3].states.not_reported, 1);
  assert.equal(report.groups[0].total_tokens.known_sum, null); assert.equal(report.groups[0].total_tokens.complete, false);
});

test('failed attempts keep duration/usage while missing usage is incomplete rather than zero', t => {
  const f = fixture(t, { allSettings: false });
  for (const slot of f.values[0].slots) {
    slot.quality = null; slot.state = 'timeout'; slot.grading = { status: 'unknown' }; slot.usage.output_tokens = null;
    for (const native of slot.child_report.slots) { native.state = 'timeout'; native.metrics.output_tokens = null; }
  }
  f.save(); const group = buildPrimaryNineConditionReport(f.path).groups[0];
  assert.equal(group.states.timeout, 1); assert.equal(group.input_tokens.known_sum, 100);
  assert.equal(group.output_tokens.known_sum, null); assert.equal(group.total_tokens.complete, false); assert.equal(group.model_duration_ms.known_sum, 50);
  assert.equal(group.total_tokens.known_sum, 100); assert.equal(group.total_tokens.partially_known_count, 1);
});

test('completed partial private grading preserves scored conditions and null manual conditions', t => {
  const f = fixture(t, { allSettings: false });
  for (const slot of f.values[0].slots) {
    slot.grading.scoring_status = 'not_scoring_ready'; slot.grading.readout.scoring_status = 'not_scoring_ready';
    const grade = slot.grading.conditions.find(value => value.condition === 'kernel_principles_v2');
    grade.scoring_status = 'not_scoring_ready'; grade.quality = null;
    const readout = slot.grading.readout.conditions.find(value => value.condition === 'kernel_principles_v2');
    readout.quality = null; readout.requirement_judgments = [{ requirement_id: 'REQ-1', judgment: 'unknown', quality: null }];
    if (slot.condition === 'kernel_principles_v2') slot.quality = null;
  }
  f.save(); const report = buildPrimaryNineConditionReport(f.path);
  assert.equal(report.groups[0].quality.mean_of_known, 0);
  assert.equal(report.groups[1].quality.mean_of_known, null);
  assert.equal(report.groups[2].quality.mean_of_known, 0);
  assert.ok(report.groups.every(group => group.success_count === null));
});

function prefixGrade(f) {
  for (const slot of f.values[0].slots) {
    slot.grading.status = 'unknown'; slot.grading.scoring_status = 'not_scoring_ready';
    slot.grading.readout.scoring_status = 'not_scoring_ready';
    slot.grading.conditions = slot.grading.conditions.slice(0, 2);
    Object.assign(slot.grading.conditions[1], { status: 'unknown', scoring_status: 'not_scoring_ready', quality: null, grader_process_completed: null });
    for (const result of slot.grading.readout.conditions.slice(1)) {
      result.quality = null; result.requirement_judgments = [{ requirement_id: 'REQ-1', judgment: 'unknown', quality: null }];
    }
    if (slot.condition !== 'plain') slot.quality = null;
  }
}

test('interrupted private grading retains completed P score with K unknown and F absent', t => {
  const f = fixture(t, { allSettings: false }); prefixGrade(f); f.save();
  const report = buildPrimaryNineConditionReport(f.path);
  assert.equal(report.groups[0].quality.mean_of_known, 0);
  assert.equal(report.groups[1].quality.mean_of_known, null); assert.equal(report.groups[2].quality.mean_of_known, null);
  assert.equal(report.slots[0].grading_execution_status, 'unknown'); assert.equal(report.slots[0].grading_execution_complete, false);
  assert.equal(report.groups[0].grading_execution_states.unknown, 1); assert.equal(report.groups[0].grading_execution_complete_count, 0);
  assert.ok(report.groups.every(group => group.success_count === null));
});

test('partial grade refuses malformed prefixes and numeric quality on incomplete own conditions', async t => {
  const mutations = [
    f => f.values[0].slots[0].grading.conditions.reverse(),
    f => f.values[0].slots[0].grading.conditions[1].condition = 'foreign',
    f => f.values[0].slots[0].grading.conditions[1].condition = 'plain',
    f => f.values[0].slots[0].grading.conditions.shift(),
    f => f.values[0].slots[0].grading.readout.conditions.pop(),
    f => f.values[0].slots[1].quality = 0,
    f => f.values[0].slots[2].quality = 0,
    f => f.values[0].slots[0].grading.conditions[0].grader_process_completed = null,
  ];
  for (const [i, mutate] of mutations.entries()) await t.test(`invalid partial grade ${i}`, inner => {
    const f = fixture(inner, { allSettings: false }); prefixGrade(f); mutate(f); f.save();
    assert.throws(() => buildPrimaryNineConditionReport(f.path));
  });
});

test('a raw digest mismatch, symlink input and duplicate JSON keys refuse before output creation', t => {
  const f = fixture(t); writeFileSync(f.reports[0].path, '{}');
  assert.throws(() => writePrimaryNineConditionReport(f.path, join(f.root, 'out')), /bytes changed/u); assert.equal(existsSync(join(f.root, 'out')), false);
  f.save(); const link = join(f.root, 'symlink.json'); symlinkSync(f.reports[0].path, link); f.reports[0].path = link; writeFileSync(f.path, JSON.stringify(f.manifest));
  assert.throws(() => buildPrimaryNineConditionReport(f.path), /symlink/u);
  writeFileSync(f.path, '{"kind":1,"kind":2}'); assert.throws(() => buildPrimaryNineConditionReport(f.path), /duplicate/u);
});

test('duplicates, task order, unknown metadata and foreign run/plan reject', async t => {
  const mutations = [
    f => f.manifest.reports.push(f.manifest.reports[0]),
    f => f.manifest.fixture_ids.push(fixtureID),
    f => f.manifest.extra = true,
    f => f.values[0].slots.push(structuredClone(f.values[0].slots[0])),
    f => f.values[0].slots[0].child_report.plan_digest = hash('foreign'),
    f => f.values[0].slots[0].plan_digest = hash('foreign'),
    f => f.values[0].slots[0].condition = 'kernel_only',
    f => f.values[0].slots[0].fixture_id = 'nonexistent-fixture',
    f => f.values[0].slots[0].child_report.summary.supplied_notes.trials.push(structuredClone(f.values[0].slots[0].child_report.summary.supplied_notes.trials[0])),
    f => f.values[0].slots[0].child_report.summary.supplied_notes.trials[1].condition = 'foreign',
  ];
  for (const [i, mutate] of mutations.entries()) await t.test(`invalid identity ${i}`, inner => { const f = fixture(inner); mutate(f); f.save(); assert.throws(() => buildPrimaryNineConditionReport(f.path)); });
});

test('synthetic relabeling, model/effort substitutions and version/input drift refuse', async t => {
  const mutations = [
    f => f.manifest.evidence_kind = 'observed',
    f => f.values[0].slots[0].child_report.configuration.model = 'gpt-6-luna',
    f => f.values[0].slots[0].child_report.configuration.reasoning = 'low',
    f => f.values[0].slots[0].child_report.slots[0].actual_model = 'different-model',
    f => f.values[1].slots[0].child_report.source.digest = hash('different source'),
    f => f.values[1].slots[0].grading.readout.scoring_version.digest = hash('different selector'),
  ];
  for (const [i, mutate] of mutations.entries()) await t.test(`drift ${i}`, inner => { const f = fixture(inner); mutate(f); f.save(); assert.throws(() => buildPrimaryNineConditionReport(f.path)); });
});

test('numeric quality rejects ambiguous or foreign private grade/readout condition inventories', async t => {
  const mutations = [
    f => f.values[0].slots[0].grading.conditions.push(structuredClone(f.values[0].slots[0].grading.conditions[0])),
    f => f.values[0].slots[0].grading.readout.conditions.push(structuredClone(f.values[0].slots[0].grading.readout.conditions[0])),
    f => f.values[0].slots[0].grading.conditions[1].condition = 'foreign',
    f => f.values[0].slots[0].grading.readout.conditions[1].condition = 'foreign',
    f => f.values[0].slots[0].grading.conditions.reverse(),
    f => f.values[0].slots[0].grading.readout.conditions.pop(),
  ];
  for (const [i, mutate] of mutations.entries()) await t.test(`ambiguous private inventory ${i}`, inner => {
    const f = fixture(inner); mutate(f); f.save(); assert.throws(() => buildPrimaryNineConditionReport(f.path), /condition set\/order changed/u);
  });
});

test('invalid metrics, unsupported money and invented private quality reject', async t => {
  const mutations = [
    f => f.values[0].slots[0].quality = 1.5,
    f => f.values[0].slots[0].quality = -1,
    f => f.values[0].slots[0].usage.input_tokens = -1,
    f => f.values[0].slots[0].cost = 0,
    f => f.values[0].slots[0].grading.conditions[0].grader_process_completed = null,
    f => f.values[0].slots[0].child_report.slots[0].receipt_integrity = 'invalid',
    f => f.values[0].slots[0].grading.status = 'blocked',
    f => f.values[0].errors.push('retained evidence changed'),
  ];
  for (const [i, mutate] of mutations.entries()) await t.test(`invalid observation ${i}`, inner => { const f = fixture(inner); mutate(f); f.save(); assert.throws(() => buildPrimaryNineConditionReport(f.path)); });
});

test('fresh report output produces inspectable standalone charts without exposing private paths', t => {
  const f = fixture(t), output = join(f.root, 'rendered');
  const value = runPrimaryNineConditionReportCommand(['--manifest', f.path, '--output', output]);
  assert.equal(value.groups, 9);
  const cost = readFileSync(join(output, 'quality-cost.svg'), 'utf8');
  assert.match(cost, /No comparable measured points/u); assert.doesNotMatch(cost, /<circle/u); assert.match(cost, /SYNTHETIC FIXTURE/u);
  assert.match(cost, /1 tasks × 1 repetitions; 1 planned slots\/group/u);
  for (const name of ['quality-tokens.svg', 'quality-time.svg']) assert.match(readFileSync(join(output, name), 'utf8'), /<circle/u);
  const tokens = readFileSync(join(output, 'quality-tokens.svg'), 'utf8');
  assert.equal((tokens.match(/<circle /gu) ?? []).length, 3, 'three tied P/K/F coordinates must not obscure nine groups');
  assert.match(tokens, /9\/9 groups plotted; 3 distinct coordinate markers/u);
  for (const setting of ['sol high', 'sol low', 'luna max']) for (const condition of ['P', 'K2', 'F']) assert.ok(tokens.includes(`${setting} ${condition}`));
  const json = readFileSync(join(output, 'report.json'), 'utf8'); assert.doesNotMatch(json, /unused\/not-opened-selector/u);
  assert.doesNotMatch(json, new RegExp(f.root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.throws(() => writePrimaryNineConditionReport(f.path, output), /output exists/u);
  assert.throws(() => runPrimaryNineConditionReportCommand(['--manifest', f.path, '--output', output, '--run']), /usage/u);
});

test('empty report inventory retains all predeclared nine-condition rows with unknowns', t => {
  const f = fixture(t); f.manifest.reports = []; writeFileSync(f.path, JSON.stringify(f.manifest));
  const report = buildPrimaryNineConditionReport(f.path); assert.equal(report.groups.length, 9); assert.equal(report.slots.length, 9);
  assert.ok(report.slots.every(row => row.state === 'not_reported' && row.quality === null));
});

test('explicit operator prices create only a labeled reported-component estimate, never an actual bill', t => {
  const f = fixture(t); f.manifest.api_equivalent_prices = prices(); f.save();
  const report = buildPrimaryNineConditionReport(f.path), group = report.groups[0];
  assert.ok(Math.abs(group.api_equivalent_reported_component_cost.known_sum - 0.000328) < 1e-12);
  assert.equal(group.api_equivalent_reported_component_cost.complete, true);
  assert.equal(group.cost, null); assert.equal(group.cost_per_success, null); assert.equal(group.success_count, null);
  assert.equal(report.api_equivalent_prices.as_of, '2026-10-23');
  const output = join(f.root, 'priced'); writePrimaryNineConditionReport(f.path, output);
  const svg = readFileSync(join(output, 'quality-cost.svg'), 'utf8');
  assert.match(svg, /<circle/u); assert.match(svg, /not actual billing or total cost/u);
  assert.match(svg, /Operator-supplied, not verified/u); assert.match(svg, /2026-10-23/u);
  assert.match(readFileSync(join(output, 'report.md'), 'utf8'), /cache-write, tools, setup/u);
});

test('missing cached usage leaves API-equivalent estimate unknown despite supplied prices', t => {
  const f = fixture(t); f.manifest.api_equivalent_prices = prices();
  for (const slot of f.values[0].slots) {
    slot.usage.cached_tokens = null;
    for (const native of slot.child_report.slots) native.metrics.cached_tokens = null;
  }
  f.save(); const report = buildPrimaryNineConditionReport(f.path);
  assert.equal(report.groups[0].api_equivalent_reported_component_cost.known_sum, null);
  assert.equal(report.groups[0].api_equivalent_reported_component_cost.complete, false);
  assert.equal(report.groups[0].total_tokens.known_sum, 120);
});

test('operator price source is escaped in Markdown and standalone SVG scope stays explicit', t => {
  const f = fixture(t); f.manifest.api_equivalent_prices = prices();
  f.manifest.api_equivalent_prices.source = 'https://example.invalid/<b>`[x](y)'; f.save();
  const output = join(f.root, 'escaped'); writePrimaryNineConditionReport(f.path, output);
  const markdown = readFileSync(join(output, 'report.md'), 'utf8');
  assert.doesNotMatch(markdown, /<b>/u); assert.match(markdown, /&lt;b&gt;&#96;/u); assert.match(markdown, /\\\[x\\\]\\\(y\\\)/u);
  const svg = readFileSync(join(output, 'quality-cost.svg'), 'utf8');
  assert.doesNotMatch(svg, /<b>/u); assert.match(svg, /1 tasks × 1 repetitions; 1 planned slots\/group/u);
});

test('rates must be explicit, finite, closed and inventory/date/source bound', async t => {
  const mutations = [
    value => value.models[0].input_per_million = -1,
    value => value.models[0].output_per_million = null,
    value => value.models.pop(),
    value => value.models[1].model = 'gpt-6.1-sol',
    value => value.as_of = '2026-02-31',
    value => value.source = 'https://example.invalid/?token=secret',
    value => value.source = 'file:///unused/no-file-read',
    value => value.models[0].automatic_fetch = true,
  ];
  for (const [i, mutate] of mutations.entries()) await t.test(`invalid rate ${i}`, inner => {
    const f = fixture(inner), value = prices(); mutate(value); f.manifest.api_equivalent_prices = value; f.save();
    assert.throws(() => buildPrimaryNineConditionReport(f.path));
  });
});

function nativeFixture(t) {
  const f = fixture(t), protocols = [];
  f.manifest.kind = 'ask_primary_nine_condition_report_input_v2';
  f.values.splice(0, f.values.length, ...f.values.map(value => value.slots[0].child_report));
  for (const [index, entry] of f.reports.entries()) {
    entry.fixture_id = fixtureID;
    const child = f.values[index];
    const plan = { run_id: child.run_id, config: child.configuration, source: child.source,
      input: { digest: hash('same prompt') }, prompt: 'same prompt', mutable_paths: ['src/**'], policy: { retries: 0 }, execution_protocol: { resume: 'forbidden' },
      task: { digest: hash('same task') }, verification: { digest: hash('same verification') },
      kernel_definition: { source_commit: 'a'.repeat(40), digest: hash('K2 instruction') },
      full_definition: { source_commit: 'a'.repeat(40), digest: hash('Full instruction') } };
    const planRaw = JSON.stringify(plan), planPath = join(f.root, `plan-${index}.json`);
    writeFileSync(planPath, planRaw); child.plan_digest = hash(planRaw);
    entry.plan = { path: planPath, digest: hash(planRaw) };
    for (const slot of child.slots) slot.artifacts = { 'last-message.txt': hash(`answer-${index}-${slot.condition}`) };
    const protocol = { kind: 'ask_reference_review_protocol_v1', fixture_id: fixtureID,
      source_digest: child.source.digest, task_digest: plan.task.digest, verification_digest: plan.verification.digest,
      criteria: [{ id: 'REQ-1', weight: 1, description: 'Public requirement one' }, { id: 'REQ-2', weight: 1, description: 'Public requirement two' }],
      limitations: ['Artificial fixed public criteria.'] };
    const protocolRaw = JSON.stringify(protocol), protocolPath = join(f.root, `protocol-${index}.json`);
    writeFileSync(protocolPath, protocolRaw); protocols.push(protocol);
    entry.reference_protocol = { path: protocolPath, digest: hash(protocolRaw) };
    plan.reference_review_protocol_digest = hash(protocolRaw);
    const pinnedPlanRaw = JSON.stringify(plan); writeFileSync(planPath, pinnedPlanRaw);
    entry.plan.digest = hash(pinnedPlanRaw); child.plan_digest = hash(pinnedPlanRaw);
    const review = { kind: 'ask_reference_review_v1', evidence_kind: 'synthetic', fixture_id: fixtureID,
      run_id: child.run_id, plan_digest: child.plan_digest, protocol_digest: hash(protocolRaw),
      conditions: child.slots.map(slot => ({ condition: slot.condition, artifacts: slot.artifacts,
        judgments: [{ criterion_id: 'REQ-1', outcome: index === 0 ? 'fail' : 'pass', evidence: [hash('artificial review evidence')] },
          { criterion_id: 'REQ-2', outcome: 'fail', evidence: [hash('artificial review evidence')] }],
        diagnostics: { detected: index, missed: 2 - index, false_positives: 0 } })) };
    const reviewPath = join(f.root, `review-${index}.json`), raw = JSON.stringify(review); writeFileSync(reviewPath, raw);
    entry.reference_review = { path: reviewPath, digest: hash(raw) };
  }
  f.save(); return f;
}

test('native saved reports share measurement rows and keep formal/reference evidence distinct', t => {
  const f = nativeFixture(t), report = buildPrimaryNineConditionReport(f.path);
  assert.equal(report.slots.length, 9); assert.ok(report.slots.every(row => row.quality === null));
  assert.equal(report.slots[0].reference_score, 0); assert.equal(report.slots[3].reference_score, 0.5);
  assert.ok(report.slots.every(row => row.measurement_kind === 'ask_comparison_measurement_v1'));
  assert.equal(report.panels.formal.fixture_ids.length, 0); assert.deepEqual(report.panels.reference.fixture_ids, [fixtureID]);
  assert.equal(report.panels.reference.groups[0].score_100, 0);
  assert.equal(report.panels.reference.groups[0].total_tokens, 120);
  const out = join(f.root, 'unified'); writePrimaryNineConditionReport(f.path, out);
  const html = readFileSync(join(out, 'report.html'), 'utf8');
  assert.match(html, /参考レビュー/u); assert.match(html, /指定設定/u); assert.match(html, /9\/9/u);
  assert.match(html, /data-model=/u); assert.match(html, /data-condition=/u); assert.doesNotMatch(html, /protocol-0.json/u);
});

test('reference protocol, answer binding and unknown outcomes cannot invent scores', async t => {
  for (const change of ['protocol', 'answer', 'unknown', 'missing_evidence', 'instruction', 'input', 'budget', 'plan_protocol']) await t.test(change, inner => {
    const f = nativeFixture(inner), entry = f.reports[0];
    if (['instruction', 'input', 'budget', 'plan_protocol'].includes(change)) {
      const plan = JSON.parse(readFileSync(entry.plan.path));
      if (change === 'instruction') plan.full_definition.digest = hash('different instruction');
      if (change === 'input') { plan.prompt = 'different prompt'; plan.input.digest = hash(plan.prompt); }
      if (change === 'budget') plan.config.timeout_ms = 1;
      if (change === 'plan_protocol') plan.reference_review_protocol_digest = hash('different protocol');
      const raw = JSON.stringify(plan); writeFileSync(entry.plan.path, raw); entry.plan.digest = hash(raw); f.values[0].plan_digest = hash(raw);
      f.values[0].configuration = structuredClone(plan.config);
      delete entry.reference_review; f.save(); assert.throws(() => buildPrimaryNineConditionReport(f.path), /instruction|protocol/u); return;
    }
    const review = JSON.parse(readFileSync(entry.reference_review.path));
    if (change === 'protocol') review.protocol_digest = hash('different protocol');
    if (change === 'answer') review.conditions[0].artifacts['last-message.txt'] = hash('different answer');
    if (change === 'unknown') review.conditions[0].judgments[0].outcome = 'unknown';
    if (change === 'missing_evidence') review.conditions[0].judgments[0].evidence = [];
    const raw = JSON.stringify(review); writeFileSync(entry.reference_review.path, raw); entry.reference_review.digest = hash(raw); f.save();
    if (change === 'unknown') {
      const report = buildPrimaryNineConditionReport(f.path); assert.equal(report.slots[0].reference_score, null);
      assert.equal(report.panels.reference.fixture_ids.length, 0, 'missing score removes task from all nine comparison groups');
    } else assert.throws(() => buildPrimaryNineConditionReport(f.path));
  });
});

test('full24 planned inventory remains 216 missing measurements and no invented points', t => {
  const f = fixture(t); f.manifest.reports = [];
  // Canonical catalog order is shared with the existing recipe registry.
  f.manifest.fixture_ids = PRIMARY_FIXTURE_REGISTRY.map(row => row[0]); f.save();
  const report = buildPrimaryNineConditionReport(f.path);
  assert.equal(report.slots.length, 216); assert.equal(report.coverage.expected, 216);
  assert.equal(report.coverage.measured, 0); assert.equal(report.coverage.formal_scored, 0);
  assert.equal(report.panels.reference.fixture_ids.length, 0);
  const output = join(f.root, 'empty24'); writePrimaryNineConditionReport(f.path, output);
  assert.match(readFileSync(join(output, 'report.html'), 'utf8'), /0\/216/u);
});

test('artificial24×9 normalize once, compare equal task scores and sum costs over the identical task set', t => {
  const f = nativeFixture(t), templates = f.reports.map((entry, i) => ({ entry: structuredClone(entry), child: structuredClone(f.values[i]),
    plan: JSON.parse(readFileSync(entry.plan.path)), protocol: JSON.parse(readFileSync(entry.reference_protocol.path)), review: JSON.parse(readFileSync(entry.reference_review.path)) }));
  f.reports.splice(0); f.values.splice(0); f.manifest.fixture_ids = PRIMARY_FIXTURE_REGISTRY.map(row => row[0]);
  for (const [taskIndex, id] of f.manifest.fixture_ids.entries()) for (const [settingIndex, template] of templates.entries()) {
    const { entry, child, plan, protocol, review } = structuredClone(template), suffix = `${taskIndex}-${settingIndex}`;
    entry.path = join(f.root, `native-${suffix}.json`); entry.fixture_id = id;
    child.run_id = `fake-${suffix}`; plan.run_id = child.run_id;
    plan.source.digest = hash(`source-${id}`); child.source = structuredClone(plan.source);
    plan.task.digest = hash(`task-${id}`); plan.verification.digest = hash(`verify-${id}`);
    for (const trial of child.summary.supplied_notes.trials) Object.assign(trial, { block_id: child.run_id, task_ref: plan.task.digest, success_criteria_ref: plan.verification.digest });
    const save = (name, value) => { const path = join(f.root, `${name}-${suffix}.json`), raw = JSON.stringify(value); writeFileSync(path, raw); return { path, digest: hash(raw) }; };
    entry.plan = save('plan-all', plan); child.plan_digest = entry.plan.digest;
    Object.assign(protocol, { fixture_id: id, source_digest: plan.source.digest, task_digest: plan.task.digest, verification_digest: plan.verification.digest });
    entry.reference_protocol = save('protocol-all', protocol);
    plan.reference_review_protocol_digest = entry.reference_protocol.digest; entry.plan = save('plan-all', plan); child.plan_digest = entry.plan.digest;
    Object.assign(review, { fixture_id: id, run_id: child.run_id, plan_digest: child.plan_digest, protocol_digest: entry.reference_protocol.digest });
    entry.reference_review = save('review-all', review);
    f.reports.push(entry); f.values.push(child);
  }
  f.save(); const report = buildPrimaryNineConditionReport(f.path);
  assert.equal(report.slots.length, 216); assert.equal(report.coverage.measured, 216);
  assert.equal(report.coverage.reference_scored, 216); assert.equal(report.coverage.formal_scored, 0);
  assert.equal(report.panels.reference.fixture_ids.length, 24);
  assert.equal(report.panels.reference.groups[0].attempt_duration_ms, 24 * 50);
  assert.equal(report.panels.reference.groups[0].total_tokens, 24 * 120);
  assert.equal(report.panels.reference.groups[3].score_100, 50);
  // One unavailable task in one condition removes exactly this task from ALL nine plotted groups.
  f.values[0].slots[0].metrics.input_tokens = null; f.save();
  const partial = buildPrimaryNineConditionReport(f.path);
  assert.equal(partial.panels.reference.fixture_ids.length, 23);
  assert.equal(partial.panels.reference.groups[3].total_tokens, 23 * 121);
  assert.equal(partial.coverage.reference_scored, 216, 'missing usage is not missing quality');
});
