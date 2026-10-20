import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comparisonHash, inventoryUserTree, prepareUserComparison } from './ask-user-comparison-prepare.mjs';
import { PRIMARY_BATCH_LIMITS, primaryBatchLimitsForSet, PRIMARY_GRADING_RESERVATION_MS, PRIMARY_FIXTURE_IDS, inspectPrimaryEvaluationBatch, preparePrimaryEvaluationBatch, reportPrimaryEvaluationBatch, startPrimaryEvaluationBatch } from './ask-primary-evaluation-batch.mjs';
import { primaryFixtureIdsForSet } from './ask-primary-fixture-recipe.mjs';
const hash = value => comparisonHash(value);
function git(root, args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8',
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function fixture(t, fixtureSet = 'legacy9') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-primary-batch-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const blocks = primaryFixtureIdsForSet(fixtureSet).map((fixture_id, index) => {
    const publicRoot = join(root, `public-${index}`), source = join(root, `seed-${index}`);
    mkdirSync(publicRoot); mkdirSync(join(publicRoot, 'workspace'));
    writeFileSync(join(publicRoot, 'task.md'), 'Update workspace/value.mjs to 1.\n');
    writeFileSync(join(publicRoot, 'workspace/value.mjs'), 'export const value = 0;\n');
    writeFileSync(join(publicRoot, 'workspace/value.test.mjs'), "import test from 'node:test'; test('fixture', () => {});\n");
    const files = Object.entries(inventoryUserTree(publicRoot)).map(([path, value]) => ({ path, bytes: value.bytes, sha256: value.digest.slice(7) }));
    const inputManifest = join(root, `input-${index}.json`);
    writeFileSync(inputManifest, JSON.stringify({ scope: 'agent-visible task.md + workspace/**', fixtures: { [fixture_id]: { files } } }));
    cpSync(publicRoot, source, { recursive: true }); git(source, ['init', '-q']); git(source, ['add', '.']);
    git(source, ['-c', 'user.name=Batch test', '-c', 'user.email=batch@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fake seed']);
    const recipe = join(root, `verification-${index}.json`);
    writeFileSync(recipe, JSON.stringify({ command: ['node', '--test', 'workspace/value.test.mjs'], requirements: [] }));
    const prepared = prepareUserComparison({ repo: source, commit: git(source, ['rev-parse', 'HEAD']), taskFile: join(publicRoot, 'task.md'),
      verificationFile: recipe, output: join(root, `child-${index}`), mutablePaths: ['workspace/value.mjs'], taskClass: 'trivial',
      evidenceKind: 'synthetic', executionContract: 'single_shot_v1', cliVersion: 'fake-test', tokenBudget: 5000000, overallTimeoutMs: 14400000 });
    return { fixture_id, root: prepared.root, run_id: prepared.plan.run_id, plan_digest: prepared.plan_digest,
      source_digest: prepared.plan.source.digest, task_digest: prepared.plan.task.digest, verification_digest: prepared.plan.verification.digest,
      public_input_root: publicRoot, input_manifest: { path: inputManifest, digest: hash(readFileSync(inputManifest)) },
      grading: { status: 'ready', blockers: [], timeout_ms: 300000, binding: { fixture_id, input_manifest_digest: hash(readFileSync(inputManifest)),
        evaluator_bundle_digest: hash('fake evaluator'), scoring_input_freeze_digest: hash('fake scoring'), profile_id: 'fake-primary-v1' } } };
  });
  let number = 0;
  return { root, blocks, manifest(edit = value => value) {
    // Each fake batch gets fresh synthetic receipts; never erase unrelated slot evidence.
    for (const block of blocks) if (existsSync(join(block.root, 'control/slots/.synthetic-batch-receipts')))
      rmSync(join(block.root, 'control/slots'), { recursive: true });
    const value = edit({ kind: 'ask_primary_evaluation_batch_manifest_v1', batch_id: `fake-${++number}`, root: join(root, `batch-${number}`),
      conditions: ['plain', 'kernel_only', 'full_ask'], ...(fixtureSet === 'catalog24' ? { fixture_set: fixtureSet } : {}), limits: primaryBatchLimitsForSet(fixtureSet), blocks: structuredClone(blocks) });
    const path = join(root, `manifest-${number}.json`); writeFileSync(path, JSON.stringify(value)); return { path, value, digest: hash(readFileSync(path)) };
  } };
}
function adapters(overrides = {}) {
  const calls = [], grades = [];
  return { calls, grades, gradingAdapter: { preflight: () => ({ status: 'ready', blockers: [] }), grade: async block => { grades.push(block.fixture_id); return { status: 'completed', quality: null }; }, ...overrides.grading },
    startComparison: async (root, planDigest) => {
      calls.push(root); const plan = JSON.parse(readFileSync(join(root, 'control/plan.json')));
      const slots = ['plain', 'kernel_only', 'full_ask'].map(condition => ({ condition, state: overrides.slotState ?? 'completed',
        outcome: overrides.outcome ?? 'pass', receipt_integrity: 'valid', exit_code: 0, scope: { status: 'pass' },
        process_completed: !overrides.unknownChild, unresolved_child: overrides.unknownChild ?? false,
        verification: { checks: [{ process_completed: !overrides.unknownVerifier, spawn_observed: true,
          status: overrides.unknownVerifier ? 'unknown' : overrides.slotState === 'verification_failed' ? 'fail' : 'pass', exit_code: overrides.slotState === 'verification_failed' ? 1 : 0 }], requirements: [] },
        metrics: { input_tokens: null, output_tokens: null } }));
      const terminalDigests = Object.fromEntries(slots.map(slot => {
        const folder = join(root, 'control/slots', slot.condition); mkdirSync(folder, { recursive: true });
        const raw = JSON.stringify(slot), terminalDigest = hash(raw);
        writeFileSync(join(folder, 'result.json'), raw); writeFileSync(join(folder, 'result.digest'), terminalDigest);
        return [slot.condition, terminalDigest];
      }));
      writeFileSync(join(root, 'control/slots/.synthetic-batch-receipts'), 'synthetic');
      const report = { run_id: plan.run_id, plan_digest: planDigest, overall: { state: overrides.state ?? 'completed' },
        execution: { state: 'available', start_consumed: true, resume_allowed: false, owner: { released: true },
          history: { pending: [], snapshot: { run_id: plan.run_id, plan_digest: planDigest, event: 'invocation_ended', stop: null,
            slots: Object.fromEntries(slots.map(slot => [slot.condition, { phase: 'terminal', attempts: 1, terminal_digest: terminalDigests[slot.condition] }])) } } },
        usage_budget: { known_tokens_lower_bound: overrides.tokens ?? 3, complete: overrides.usageComplete ?? false }, slots };
      overrides.editReport?.(report, root); return report;
    } };
}
test('primary batch is model-free until a digest-bound, grading-connected, fake-only start', async t => {
  const f = fixture(t);
  t.afterEach(() => f.blocks.forEach(block => rmSync(join(block.root, 'control/slots'), { recursive: true, force: true })));
  await t.test('prepare/inspect/report preserve all 27 unknown slots and missing grading blockers', () => {
    const m = f.manifest(), p = preparePrimaryEvaluationBatch(m.path);
    assert.equal(p.status, 'blocked'); assert.equal(p.slots.length, 27);
    assert.equal(inspectPrimaryEvaluationBatch(m.value.root).start_consumed, false);
    const report = reportPrimaryEvaluationBatch(m.value.root);
    assert.equal(report.state, 'not_started'); assert.ok(report.slots.every(slot => slot.state === 'not_started' && slot.quality === null && slot.cost === null));
  });
  await t.test('fixed nine IDs, order, duplicate run, source digest, condition aliases are rejected', () => {
    for (const edit of [m => { m.blocks.pop(); }, m => { m.blocks.reverse(); }, m => { m.blocks[1].run_id = m.blocks[0].run_id; },
      m => { m.blocks[0].source_digest = hash('wrong'); }, m => { m.conditions[1] = 'kernel_principles_v1'; }, m => { m.root = m.blocks[0].root; }]) {
      const m = f.manifest(m => { edit(m); return m; }); assert.throws(() => preparePrimaryEvaluationBatch(m.path));
    }
  });
  await t.test('bad digest and disconnected grading dispatch no fake block', async () => {
    const m = f.manifest(), a = adapters(); preparePrimaryEvaluationBatch(m.path, a);
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, hash('wrong'), a));
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, { startComparison: a.startComparison }));
    assert.equal(a.calls.length, 0); assert.equal(existsSync(join(m.value.root, 'consumption')), false);
    // Omitting the fake adapter would select production start, and is rejected for these entirely synthetic plans before consumption.
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, { gradingAdapter: a.gradingAdapter }), /synthetic plans cannot call production start/u);
  });
  await t.test('grading reserves four original worker runs per condition; historical budgets are read-only', async () => {
    assert.equal(PRIMARY_GRADING_RESERVATION_MS, 11100000); assert.equal(PRIMARY_BATCH_LIMITS.overall_timeout_ms, 302400000);
    const a = adapters(), m = f.manifest(v => ({ ...v, blocks: v.blocks.map(block => ({ ...block, grading: { ...block.grading, timeout_ms: PRIMARY_GRADING_RESERVATION_MS } })) }));
    preparePrimaryEvaluationBatch(m.path, a);
    assert.equal(reportPrimaryEvaluationBatch(m.value.root).limits.overall_timeout_ms, 302400000);
    const invalid = f.manifest(v => ({ ...v, blocks: v.blocks.map(block => ({ ...block, grading: { ...block.grading, timeout_ms: PRIMARY_GRADING_RESERVATION_MS + 1 } })) }));
    assert.throws(() => preparePrimaryEvaluationBatch(invalid.path, a), /185 minutes/);
    for (const oldTime of [172800000, 216000000]) {
      const old = { ...m.value, limits: { ...PRIMARY_BATCH_LIMITS, overall_timeout_ms: oldTime } }, raw = JSON.stringify(old);
      // Only synthetic temporary records simulate prior budgets; actual r2/r3 records are never rewritten.
      writeFileSync(m.path, raw); writeFileSync(join(m.value.root, 'manifest.json'), raw);
      const preparedPath = join(m.value.root, 'prepared.json'), prepared = JSON.parse(readFileSync(preparedPath)); prepared.manifest_digest = hash(raw);
      const record = JSON.stringify(prepared); writeFileSync(preparedPath, record); writeFileSync(`${preparedPath}.digest`, hash(record));
      assert.equal(reportPrimaryEvaluationBatch(m.value.root).limits.overall_timeout_ms, oldTime);
      assert.ok(inspectPrimaryEvaluationBatch(m.value.root, a).blockers.some(b => b.reason === 'historical_preparation_budget_requires_new_plan'));
      await assert.rejects(startPrimaryEvaluationBatch(m.value.root, hash(raw), a), /connections required/);
      assert.equal(a.calls.length, 0); assert.equal(existsSync(join(m.value.root, 'consumption')), false);
      const newOld = f.manifest(v => ({ ...v, limits: old.limits }));
      assert.throws(() => preparePrimaryEvaluationBatch(newOld.path, a), /current budget/);
    }
  });
  await t.test('observed plans reject caller-ready fake grading before production dispatch', async () => {
    const originals = f.blocks.map(block => ({ plan: readFileSync(join(block.root, 'control/plan.json')), digest: readFileSync(join(block.root, 'control/plan.digest')) }));
    try {
      const updated = f.blocks.map((block, index) => {
        const plan = JSON.parse(originals[index].plan); plan.config.evidence_kind = 'observed';
        const raw = JSON.stringify(plan); writeFileSync(join(block.root, 'control/plan.json'), raw); writeFileSync(join(block.root, 'control/plan.digest'), hash(raw));
        return { ...block, plan_digest: hash(raw) };
      });
      const m = f.manifest(value => ({ ...value, blocks: updated })), a = adapters();
      const prepared = preparePrimaryEvaluationBatch(m.path, a);
      assert.equal(prepared.status, 'blocked'); assert.ok(prepared.blockers.every(blocker => /not registered/u.test(blocker.reason)));
      await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, { gradingAdapter: a.gradingAdapter }), /connections required/u);
      assert.equal(a.calls.length, 0); assert.equal(existsSync(join(m.value.root, 'consumption')), false);
    } finally {
      f.blocks.forEach((block, index) => { writeFileSync(join(block.root, 'control/plan.json'), originals[index].plan); writeFileSync(join(block.root, 'control/plan.digest'), originals[index].digest); });
    }
  });
  await t.test('fake sequential nine blocks; verification failure can continue; consumed once', async () => {
    const m = f.manifest(), a = adapters({ state: 'task_failed', slotState: 'verification_failed' }); preparePrimaryEvaluationBatch(m.path, a);
    const report = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
    assert.equal(report.state, 'completed'); assert.equal(a.calls.length, 9); assert.equal(a.grades.length, 9);
    assert.deepEqual(a.calls, f.blocks.map(block => block.root)); assert.equal(report.slots.length, 27);
    assert.equal(report.usage.known_tokens_lower_bound, 27); assert.equal(report.usage.complete, false); assert.equal(report.usage.cost, null);
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, a), /consumed/u);
  });
  await t.test('completed execution with pending semantic quality reaches grading before the next fixed block', async () => {
    const m = f.manifest(), events = [], a = adapters({ state: 'indeterminate', outcome: 'unknown' });
    const start = a.startComparison;
    a.startComparison = async (...args) => { events.push('start'); return start(...args); };
    a.gradingAdapter.grade = async (block, report) => {
      events.push('grade'); a.grades.push(block.fixture_id);
      assert.equal(report.overall.state, 'indeterminate');
      assert.ok(report.slots.every(slot => slot.state === 'completed' && slot.outcome === 'unknown'
        && slot.scope.status === 'pass' && slot.receipt_integrity === 'valid' && slot.verification.requirements.length === 0));
      return { status: 'completed', conditions: report.slots.map(slot => ({ condition: slot.condition,
        status: 'completed', scoring_status: 'manual_required', quality: null })) };
    };
    preparePrimaryEvaluationBatch(m.path, a);
    const report = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
    assert.equal(report.state, 'completed'); assert.equal(a.calls.length, 9); assert.equal(a.grades.length, 9);
    assert.deepEqual(events, Array.from({ length: 9 }, () => ['start', 'grade']).flat());
    assert.ok(report.slots.every(slot => slot.quality === null && slot.grading.status === 'completed'
      && slot.grading.conditions.every(condition => condition.scoring_status === 'manual_required')));
  });
  await t.test('indeterminate is accepted only for closed execution with pending quality', async () => {
    const cases = [
      report => { report.execution.state = 'indeterminate'; },
      report => { delete report.execution; },
      report => { report.execution.owner.released = false; },
      report => { report.execution.start_consumed = false; },
      report => { report.execution.resume_allowed = true; },
      report => { report.execution.history.pending.push('unpublished'); },
      report => { report.execution.history.snapshot.event = 'verification_running'; },
      report => { report.execution.history.snapshot.stop = { state: 'timeout' }; },
      report => { report.execution.history.snapshot.slots.plain.phase = 'verifying'; },
      report => { delete report.execution.history.snapshot.slots.plain.terminal_digest; },
      report => { report.execution.history.snapshot.slots.plain.terminal_digest = hash('changed terminal'); },
      report => { report.slots[0].state = 'execution_unknown'; },
      report => { report.slots[0].receipt_integrity = 'invalid'; },
      (_report, root) => { rmSync(join(root, 'control/slots/plain/result.digest')); },
      (_report, root) => { writeFileSync(join(root, 'control/slots/plain/result.json'), '{}'); },
      report => { report.slots[0].scope.status = 'fail'; },
      report => { report.slots[0].scope.status = 'unknown'; },
      report => { report.slots[0].outcome = 'fail'; },
      report => { report.slots[0].verification.checks = []; },
      report => { report.slots[0].verification.checks[0].status = 'timeout'; },
      report => { report.slots[0].verification.checks[0].exit_code = 1; },
    ];
    for (const editReport of cases) {
      const m = f.manifest(), a = adapters({ state: 'indeterminate', outcome: 'unknown', editReport });
      preparePrimaryEvaluationBatch(m.path, a);
      const report = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
      assert.equal(report.terminal.stop, 'unsafe_or_incomplete_child');
      assert.equal(a.calls.length, 1); assert.equal(a.grades.length, 0);
    }
  });
  await t.test('unknown child, denial, auth and interrupt prevent grading and subsequent starts', async () => {
    for (const overrides of [{ unknownChild: true }, { unknownVerifier: true }, { state: 'permission_denied' }, { state: 'authentication_required' }, { state: 'interrupted' },
      { state: 'timeout' }, { state: 'state_corrupt' }, { state: 'ownership_unverified' }, { slotState: 'scope_violation' }]) {
      const m = f.manifest(), a = adapters(overrides); preparePrimaryEvaluationBatch(m.path, a);
      const report = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
      assert.equal(report.state, 'stopped'); assert.equal(a.calls.length, 1); assert.equal(a.grades.length, 0);
      assert.equal(report.slots.filter(slot => slot.state === 'not_started').length, 24);
    }
  });
  await t.test('lower-bound budget and full-block deadline reservations stop later dispatch', async () => {
    const m = f.manifest(), a = adapters({ tokens: 45000000 }); preparePrimaryEvaluationBatch(m.path, a);
    const report = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
    assert.equal(report.terminal.stop, 'usage_budget_exhausted'); assert.equal(a.calls.length, 1); assert.equal(a.grades.length, 0);
    const n = f.manifest(), b = adapters(); preparePrimaryEvaluationBatch(n.path, b);
    let tick = 0;
    const timed = await startPrimaryEvaluationBatch(n.value.root, n.digest, { ...b, now: () => ++tick <= 2 ? 1000 : PRIMARY_BATCH_LIMITS.overall_timeout_ms });
    assert.equal(timed.terminal.stop, 'insufficient_deadline_reservation'); assert.equal(b.calls.length, 0);
  });
  await t.test('manifest drift, mutable workspace, prior starts and preexisting output cannot dispatch', async () => {
    const m = f.manifest(), a = adapters(); preparePrimaryEvaluationBatch(m.path, a);
    writeFileSync(m.path, `${readFileSync(m.path)} `);
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, a), /external manifest changed/u);
    const workspace = join(f.blocks[0].root, 'arms/plain/workspace/value.mjs'), original = readFileSync(workspace);
    writeFileSync(workspace, 'changed');
    assert.throws(() => preparePrimaryEvaluationBatch(f.manifest().path), /workspace changed/u); writeFileSync(workspace, original);
    const slot = join(f.blocks[0].root, 'control/slots/plain'); mkdirSync(slot, { recursive: true }); writeFileSync(join(slot, 'unexpected'), 'unknown');
    assert.throws(() => preparePrimaryEvaluationBatch(f.manifest().path), /preexisting slot/u); rmSync(slot, { recursive: true });
    const start = join(f.blocks[0].root, 'control/start.digest'); writeFileSync(start, 'partial');
    assert.throws(() => preparePrimaryEvaluationBatch(f.manifest().path), /start record missing/u); rmSync(start);
    const publicTask = join(f.blocks[0].public_input_root, 'task.md'), taskBytes = readFileSync(publicTask);
    writeFileSync(publicTask, 'drift');
    assert.throws(() => preparePrimaryEvaluationBatch(f.manifest().path)); writeFileSync(publicTask, taskBytes);
    assert.equal(a.calls.length, 0);
  });
  await t.test('grading unknown prevents subsequent blocks', async () => {
    const m = f.manifest(), a = adapters({ grading: { grade: async () => ({ status: 'unknown' }) } }); preparePrimaryEvaluationBatch(m.path, a);
    const report = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
    assert.equal(report.terminal.stop, 'grading_incomplete'); assert.equal(a.calls.length, 1);
  });
  await t.test('lost requested report or required grading cannot retain completed batch', async () => {
    for (const name of ['report', 'grading', 'requested']) {
      const m = f.manifest(), a = adapters(); preparePrimaryEvaluationBatch(m.path, a);
      assert.equal((await startPrimaryEvaluationBatch(m.value.root, m.digest, a)).state, 'completed');
      const path = join(m.value.root, 'consumption', `block-0-${name}.json`);
      rmSync(path); rmSync(`${path}.digest`);
      const report = reportPrimaryEvaluationBatch(m.value.root);
      assert.equal(report.state, 'consumption_unknown'); assert.ok(report.errors.length > 0);
      if (name === 'report') {
        assert.equal(report.usage.missing_requested_report_count, 1);
        assert.equal(report.slots.slice(0, 3).every(slot => slot.state === 'unknown'), true);
      }
      await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, a), /consumed/);
    }
  });
  await t.test('partial consumption and result publication remain unknown; no restart', async () => {
    const m = f.manifest(), a = adapters(); preparePrimaryEvaluationBatch(m.path, a); mkdirSync(join(m.value.root, 'consumption'));
    const report = reportPrimaryEvaluationBatch(m.value.root); assert.equal(report.state, 'consumption_unknown'); assert.equal(report.slots.length, 27);
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, a), /consumed/u);
    const n = f.manifest(); preparePrimaryEvaluationBatch(n.path, a);
    const failed = await startPrimaryEvaluationBatch(n.value.root, n.digest, { ...a, startComparison: async () => { throw new Error('fake child unknown'); } });
    assert.equal(failed.state, 'consumption_unknown'); assert.equal(failed.terminal.state, 'stopped');
    assert.equal(failed.usage.missing_requested_report_count, 1); assert.equal(failed.slots.filter(slot => slot.state === 'unknown').length, 3);
  });
});


test('catalog24 uses the existing batch entrance and preserves task failures, manual requirements and later results', async t => {
  const f = fixture(t, 'catalog24'), m = f.manifest(), a = adapters();
  const baseStart = a.startComparison;
  a.startComparison = async (root, digest) => {
    const report = await baseStart(root, digest), index = f.blocks.findIndex(block => block.root === root);
    if (index === 3) { report.overall.state = 'task_failed'; for (const slot of report.slots) {
      slot.state = 'verification_failed'; slot.verification.checks[0].status = 'fail'; slot.verification.checks[0].exit_code = 1;
      slot.verification.checks[0].logs = ['retained-fixed-failure.log'];
      const folder = join(root, 'control/slots', slot.condition), raw = JSON.stringify(slot), value = hash(raw);
      writeFileSync(join(folder, 'retained-fixed-failure.log'), 'intentional fixed verification failure\n');
      writeFileSync(join(folder, 'result.json'), raw); writeFileSync(join(folder, 'result.digest'), value);
      report.execution.history.snapshot.slots[slot.condition].terminal_digest = value;
    }}
    return report;
  };
  a.gradingAdapter.grade = async (block) => {
    a.grades.push(block.fixture_id); const index = f.blocks.findIndex(item => item.fixture_id === block.fixture_id);
    const outcome = index === 3 ? 'fail' : index === 7 ? 'manual_review_required' : 'pass';
    return { status: 'completed', conditions: m.value.conditions.map(condition => ({ condition, status: 'completed',
      quality: outcome === 'manual_review_required' ? null : outcome === 'fail' ? 0 : 1,
      requirement_judgments: [{ requirement_id: 'fixed-control', outcome, earned_points: outcome === 'manual_review_required' ? null : outcome === 'fail' ? 0 : 1 }],
      failure_reasons: outcome === 'pass' ? [] : [outcome === 'fail' ? 'intentional_fixed_task_failure' : 'fixed_measurement_unavailable'] })) };
  };
  const prepared = preparePrimaryEvaluationBatch(m.path, a);
  assert.equal(prepared.slot_count, 72); assert.equal(prepared.slots.length, 72);
  assert.ok(prepared.slots.every(slot => slot.quality === null));
  const report = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
  assert.equal(report.state, 'completed'); assert.equal(a.calls.length, 24); assert.equal(a.grades.length, 24);
  assert.equal(report.slots.length, 72); assert.equal(report.limits.token_budget, 120000000);
  assert.ok(report.limits.overall_timeout_ms >= 24*(14400000+PRIMARY_GRADING_RESERVATION_MS));
  assert.ok(report.slots.filter(slot=>slot.fixture_id===f.blocks[3].fixture_id).every(slot=>slot.quality===0 && slot.child_report.slots.every(s=>s.verification.checks[0].logs.length===1)));
  assert.ok(report.slots.filter(slot=>slot.fixture_id===f.blocks[7].fixture_id).every(slot=>slot.quality===null && slot.grading.conditions.every(s=>s.requirement_judgments[0].outcome==='manual_review_required')));
  assert.ok(report.slots.filter(slot=>slot.fixture_id===f.blocks[23].fixture_id).every(slot=>slot.quality===1));
  for (const mutate of [value=>value.blocks.pop(), value=>value.fixture_set='legacy9', value=>value.blocks.reverse()]) {
    const bad=f.manifest(value=>{mutate(value);return value;}); assert.throws(()=>preparePrimaryEvaluationBatch(bad.path,a));
  }
});
