import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrimaryFixtureRecipe } from './ask-primary-fixture-recipe.mjs';
const AUTHENTIC_ROOT = fileURLToPath(new URL('../', import.meta.url));
import { comparisonHash, inventoryUserTree, prepareUserComparison } from './ask-user-comparison-prepare.mjs';
import { PRIMARY_BATCH_LIMITS, PRIMARY_GRADING_RESERVATION_MS, PRIMARY_FIXTURE_IDS, validatePrimaryRemainingEightContinuation, reservePrimaryRemainingEightOutput, inspectPrimaryEvaluationBatch, preparePrimaryEvaluationBatch, reportPrimaryEvaluationBatch, startPrimaryEvaluationBatch } from './ask-primary-evaluation-batch.mjs';
import { preparePrimaryEvaluation } from './ask-primary-evaluation-prepare.mjs';
const hash = value => comparisonHash(value);
function git(root, args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8',
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function fixture(t, { kernelCondition = 'kernel_only' } = {}) {
  const conditions = ['plain', kernelCondition, 'full_ask'];
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-primary-batch-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const blocks = PRIMARY_FIXTURE_IDS.map((fixture_id, index) => {
    const publicRoot = join(root, `public-${index}`), source = join(root, `seed-${index}`);
    mkdirSync(publicRoot); mkdirSync(join(publicRoot, 'workspace'));
    const authentic = kernelCondition === 'kernel_principles_v2' ? buildPrimaryFixtureRecipe(fixture_id) : null;
    if (authentic) {
      const base = join(AUTHENTIC_ROOT, 'benchmarks/fixtures/checkpoint-b2', fixture_id);
      cpSync(join(base, 'task.md'), join(publicRoot, 'task.md'));
      cpSync(join(base, 'workspace'), join(publicRoot, 'workspace'), { recursive: true });
    } else {
      writeFileSync(join(publicRoot, 'task.md'), 'Update workspace/value.mjs to 1.\n');
      writeFileSync(join(publicRoot, 'workspace/value.mjs'), 'export const value = 0;\n');
      writeFileSync(join(publicRoot, 'workspace/value.test.mjs'), "import test from 'node:test'; test('fixture', () => {});\n");
    }
    const files = Object.entries(inventoryUserTree(publicRoot)).map(([path, value]) => ({ path, bytes: value.bytes, sha256: value.digest.slice(7) }));
    const inputManifest = join(root, `input-${index}.json`);
    writeFileSync(inputManifest, JSON.stringify({ scope: 'agent-visible task.md + workspace/**', fixtures: { [fixture_id]: { files } } }));
    cpSync(publicRoot, source, { recursive: true }); git(source, ['init', '-q']); git(source, ['add', '.']);
    git(source, ['-c', 'user.name=Batch test', '-c', 'user.email=batch@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fake seed']);
    const recipe = join(root, `verification-${index}.json`);
    writeFileSync(recipe, JSON.stringify(authentic ?? { command: ['node', '--test', 'workspace/value.test.mjs'], requirements: [] }));
    const prepared = prepareUserComparison({ repo: source, commit: git(source, ['rev-parse', 'HEAD']), taskFile: join(publicRoot, 'task.md'),
      verificationFile: recipe, output: join(root, `child-${index}`), mutablePaths: authentic?.mutable_paths ?? ['workspace/value.mjs'], taskClass: authentic?.runner_task_class ?? 'trivial', kernelCondition,
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
      conditions: [...conditions], limits: { ...PRIMARY_BATCH_LIMITS }, blocks: structuredClone(blocks) });
    const path = join(root, `manifest-${number}.json`); writeFileSync(path, JSON.stringify(value)); return { path, value, digest: hash(readFileSync(path)) };
  } };
}
function adapters(overrides = {}) {
  const calls = [], grades = [];
  return { calls, grades, gradingAdapter: { preflight: () => ({ status: 'ready', blockers: [] }), grade: async block => { grades.push(block.fixture_id); return { status: 'completed', quality: null }; }, ...overrides.grading },
    startComparison: async (root, planDigest) => {
      calls.push(root); const plan = JSON.parse(readFileSync(join(root, 'control/plan.json')));
      const slots = ['plain', plan.config.kernel_condition ?? 'kernel_only', 'full_ask'].map(condition => ({ condition, state: overrides.slotState ?? 'completed',
        outcome: overrides.outcome ?? (overrides.slotState === 'verification_failed' ? 'fail' : 'pass'), receipt_integrity: 'valid', exit_code: 0, scope: { status: 'pass' },
        process_completed: !overrides.unknownChild, unresolved_child: overrides.unknownChild ?? false,
        verification: { checks: [{ process_completed: !overrides.unknownVerifier, spawn_observed: true,
          status: overrides.unknownVerifier ? 'unknown' : overrides.slotState === 'verification_failed' ? 'fail' : 'pass', exit_code: overrides.slotState === 'verification_failed' ? 1 : 0 }], requirements: [] },
        metrics: { input_tokens: null, output_tokens: null } }));
      overrides.editSlots?.(slots, calls.length - 1);
      const firstNonpass = slots.find(slot => slot.state !== 'completed' || slot.outcome !== 'pass');
      const overallState = firstNonpass ? firstNonpass.state === 'verification_failed' ? 'task_failed' : 'indeterminate' : 'completed';
      const terminalDigests = Object.fromEntries(slots.map(slot => {
        const folder = join(root, 'control/slots', slot.condition); mkdirSync(folder, { recursive: true });
        const raw = JSON.stringify(slot), terminalDigest = hash(raw);
        writeFileSync(join(folder, 'result.json'), raw); writeFileSync(join(folder, 'result.digest'), terminalDigest);
        return [slot.condition, terminalDigest];
      }));
      writeFileSync(join(root, 'control/slots/.synthetic-batch-receipts'), 'synthetic');
      const report = { run_id: plan.run_id, plan_digest: planDigest, overall: { state: overrides.state ?? overallState },
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

const remainingPolicy = {
  natural_language: 'manual_allowed', command_match: 'exact_rendered_no_shell_equivalence',
  capture_failure: 'whole_capture_unknown', missing_raw_score: 'retain_raw_separate_unknown_analysis',
  manual_scoring: 'not_start_or_next_fixture_prerequisite',
};
const pinned = path => ({ path, digest: hash(readFileSync(path)) });
async function remainingFixture(t) {
  const parent = fixture(t, { kernelCondition: 'kernel_principles_v2' });
  const versionPath = join(parent.root, 'retained-version.json');
  writeFileSync(versionPath, JSON.stringify({ kind: 'ask_primary_scoring_version_v1', scoring_version_id: 'synthetic-fixed-v4',
    fixtures: Object.fromEntries(PRIMARY_FIXTURE_IDS.map(id => [id, {}])) }));
  const version = pinned(versionPath); parent.blocks[0].grading.scoring_version = version;
  const pm = parent.manifest(), parentRun = join(parent.root, 'evaluation/run');
  mkdirSync(parentRun, { recursive: true });
  pm.value.root = join(parentRun, 'batch'); pm.path = join(parentRun, 'batch-manifest.json');
  writeFileSync(pm.path, JSON.stringify(pm.value)); pm.digest = hash(readFileSync(pm.path));
  const pa = adapters({ state: 'indeterminate', outcome: 'unknown', grading: { grade: async () => ({ status: 'unknown' }) } });
  preparePrimaryEvaluationBatch(pm.path, pa);
  const stopped = await startPrimaryEvaluationBatch(pm.value.root, pm.digest, pa);
  assert.equal(stopped.state, 'stopped'); assert.equal(pa.calls.length, 1);
  const first = parent.blocks[0], packet = join(parent.root, 'retained-first'); mkdirSync(packet);
  const producerRoot = join(packet, 'producer'); mkdirSync(producerRoot);
  const producerPath = join(producerRoot, 'producer.json');
  writeFileSync(producerPath, JSON.stringify({ kind: 'ask_primary_evaluation_producer_v1', evidence_kind: 'synthetic', block: first }));
  const conditions = pm.value.conditions.map(condition => {
    const logs = join(packet, `private-${condition}`, 'worker-logs'), pub = join(packet, `public-${condition}`);
    mkdirSync(logs, { recursive: true }); mkdirSync(pub);
    const artifacts = Object.fromEntries(['evaluator_result', 'engineering_result'].map(name => {
      const path = join(pub, name + '.json'); writeFileSync(path, JSON.stringify({ synthetic: true })); return [name, pinned(path)];
    }));
    const receipts = Array.from({ length: 4 }, (_, index) => {
      const channels = Object.fromEntries(['stdout', 'stderr'].map(channel => {
        const path = `${String(index + 1).padStart(4, '0')}.${channel}.log`, raw = 'synthetic\n';
        writeFileSync(join(logs, path), raw); return [channel, { path, bytes: Buffer.byteLength(raw), digest: hash(raw) }];
      }));
      return { kind: 'ask_primary_private_worker_stdio_v1', evidence_kind: 'synthetic', condition,
        spawn_observed: true, process_completed: true, exit_code: 0, signal: null, error_code: null,
        log_capture_status: 'complete', ...channels };
    });
    return { condition, evidence_kind: 'synthetic', status: 'completed', quality: null, scoring_status: 'not_scoring_ready',
      model_calls: 0, grader_process_starts: 4, grader_process_completed: true, public_artifacts: artifacts, worker_receipts: receipts };
  });
  const gradePath = join(packet, 'final-posthoc-report.json');
  writeFileSync(gradePath, JSON.stringify({ kind: 'derived_processing_only_grading_result',
    criterion_version_id: 'ask-primary-fresh-scoring-v4', original_run_id: first.run_id, status: 'completed', failure: null,
    originals_unchanged: true, model_calls: 0, comparison_start_resume: 0, grader_process_starts: 12,
    conditions, producer: { record_root: producerRoot, digest: hash(readFileSync(producerPath)) } }));
  const continuation = { kind: 'ask_primary_remaining_eight_v1', parent_batch_id: pm.value.batch_id,
    retained_scoring_version: version, parent_manifest: pinned(pm.path),
    parent_start_record: pinned(join(pm.value.root, 'consumption/start.json')),
    parent_first_report: pinned(join(pm.value.root, 'consumption/block-0-report.json')),
    retained_first_grading: pinned(gradePath), parent_run_id: first.run_id, original_fixture_ids: [...PRIMARY_FIXTURE_IDS],
    original_unstarted_blocks: parent.blocks.slice(1).map(block => ({ fixture_id: block.fixture_id, run_id: block.run_id,
      plan_digest: block.plan_digest, start_consumed: false })), analysis_policy: remainingPolicy };
  const fresh = fixture(t, { kernelCondition: 'kernel_principles_v2' });
  for (const block of fresh.blocks) block.grading.scoring_version = version;
  const manifest = (edit = value => value) => fresh.manifest(value => edit({ ...value,
    blocks: value.blocks.slice(1), continuation: structuredClone(continuation) }));
  return { parent, pm, first, gradePath, continuation, fresh, manifest };
}
function assertSiblingRefused(f) {
  const sibling = join(f.fresh.root, 'sibling'); mkdirSync(sibling);
  const m = f.manifest(value => ({ ...value, root: join(sibling, 'batch') }));
  assert.throws(() => preparePrimaryEvaluationBatch(m.path, adapters()), /already issued/u);
  assert.equal(existsSync(m.value.root), false);
}
test('remaining-eight is one fresh exact 24-slot plan with retained parent evidence', async t => {
  const f = await remainingFixture(t);
  const preserved = [f.pm.path, f.continuation.parent_start_record.path, f.continuation.parent_first_report.path, f.gradePath,
    ...['plain', 'kernel_principles_v2', 'full_ask'].flatMap(c => ['result.json', 'result.digest'].map(n => join(f.first.root, 'control/slots', c, n)))];
  const before = preserved.map(p => hash(readFileSync(p)));
  await t.test('all24 partial/manual results save and terminate; second start never dispatches', async () => {
    const m = f.manifest(), a = adapters({ editSlots: mixClosedNativeSlots });
    a.gradingAdapter.grade = async block => {
      a.grades.push(block.fixture_id);
      return { status: 'completed', scoring_status: 'not_scoring_ready', conditions: m.value.conditions.map((condition, i) => ({
        condition, status: 'completed', scoring_status: i === 0 ? 'complete' : 'not_scoring_ready', quality: i === 0 ? 0.5 : null,
        requirement_judgments: [{ requirement_id: 'synthetic-only', outcome: i === 0 ? 'pass' : 'manual_review_required', evidence_references: [] }],
      })) };
    };
    const prepared = preparePrimaryEvaluationBatch(m.path, a);
    assert.equal(prepared.slot_count, 24); assert.equal(prepared.start_consumed, false);
    const result = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
    assert.equal(result.state, 'completed'); assert.equal(a.calls.length, 8); assert.equal(a.grades.length, 8);
    assert.deepEqual(result.slots.map(s => s.fixture_id), PRIMARY_FIXTURE_IDS.slice(1).flatMap(id => [id, id, id]));
    assert.equal(result.slots.length, 24); assert.equal(result.slots.filter(s => s.quality === null).length, 16);
    assert.equal(result.slots.filter(s => s.quality === 0.5).length, 8);
    assert.deepEqual(result.continuation.original_fixture_ids, PRIMARY_FIXTURE_IDS);
    assert.ok(result.slots.every(s => s.grading.conditions.length === 3));
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, a), /consumed/u); assert.equal(a.calls.length, 8);
  });
  await t.test('issued parent refuses another sibling manifest before publication', () => assertSiblingRefused(f));
  await t.test('prepare refuses parent or retained-grade output before any write', () => {
    for (const output of [join(f.parent.blocks[1].root, 'new-output'), join(f.gradePath.replace('/final-posthoc-report.json', ''), 'new-output')]) {
      const options = { output, continuation: f.continuation, scoringVersionPath: f.continuation.retained_scoring_version.path,
        scoringVersionDigest: f.continuation.retained_scoring_version.digest };
      assert.throws(() => preparePrimaryEvaluation(f.fresh.root, options), /overlaps parent/u);
      assert.equal(existsSync(output), false);
    }
  });
  await t.test('grading output under retained parent or grade is rejected before writes', () => {
    for (const target of [f.parent.blocks[1].root, f.gradePath.replace('/final-posthoc-report.json', '')]) {
      const output = join(target, 'new-grading'), resources = join(f.fresh.root, 'unsafe-resources.json');
      writeFileSync(resources, JSON.stringify({ kind: 'ask_primary_grading_resources_v1', output_root: output }));
      const ref = pinned(resources), options = { output: join(f.fresh.root, 'unused-preparation'), continuation: f.continuation,
        scoringVersionPath: f.continuation.retained_scoring_version.path, scoringVersionDigest: f.continuation.retained_scoring_version.digest,
        gradingResourcesPath: ref.path, gradingResourcesDigest: ref.digest };
      assert.throws(() => preparePrimaryEvaluation(f.fresh.root, options), /overlaps parent/u);
      const m = f.manifest(value => { value.blocks[0].grading.resources = ref; return value; });
      assert.throws(() => preparePrimaryEvaluationBatch(m.path, adapters()), /overlaps parent/u);
      assert.equal(existsSync(output), false); assert.equal(existsSync(options.output), false);
    }
  });
  await t.test('no substitution, changed lineage, reused IDs/roots, first replay, or lower budget', () => {
    const edits = [m => m.blocks.reverse(), m => m.blocks.push(f.fresh.blocks[0]), m => m.blocks.pop(),
      m => m.continuation.parent_manifest.digest = hash('changed'), m => m.continuation.parent_run_id = 'wrong',
      m => m.continuation.original_fixture_ids.reverse(), m => m.continuation.original_unstarted_blocks[0].start_consumed = true,
      m => m.continuation.retained_first_grading.digest = hash('changed'), m => m.continuation.analysis_policy.manual_scoring = 'required',
      m => m.conditions[1] = 'kernel_principles_v1', m => m.blocks[0].run_id = f.parent.blocks[1].run_id,
      m => m.blocks[0].root = f.parent.blocks[1].root, m => m.blocks[0].public_input_root = f.parent.blocks[1].public_input_root,
      m => m.limits.token_budget = 40000000, m => m.limits.overall_timeout_ms = 216000000, m => m.continuation.arbitrary_retry = true];
    for (const edit of edits) {
      const m = f.manifest(value => { edit(value); return value; }); assert.throws(() => preparePrimaryEvaluationBatch(m.path, adapters()));
    }
    const corrupted = join(f.gradePath.replace('/final-posthoc-report.json', ''), 'private-plain/worker-logs/0001.stdout.log');
    const oldLog = readFileSync(corrupted); writeFileSync(corrupted, 'corrupt');
    try { assert.throws(() => preparePrimaryEvaluationBatch(f.manifest().path, adapters()), /worker log changed/u); }
    finally { writeFileSync(corrupted, oldLog); }
    const link = join(f.parent.blocks[1].root, 'control/start.json'); symlinkSync(join(f.parent.root, 'absent-target'), link);
    try { assert.throws(() => preparePrimaryEvaluationBatch(f.manifest().path, adapters()), /unstarted/u); }
    finally { rmSync(link); }
    const oldIntent = join(f.parent.blocks[1].root, 'control/history'); mkdirSync(oldIntent);
    try { assert.throws(() => preparePrimaryEvaluationBatch(f.manifest().path, adapters()), /unstarted/u); }
    finally { rmSync(oldIntent, { recursive: true }); }
  });
  await t.test('orphan/torn issuance markers refuse before any publication', async () => {
    const q = await remainingFixture(t), context = validatePrimaryRemainingEightContinuation(q.continuation);
    mkdirSync(join(q.parent.root, '.ask-primary-continuations'));
    for (const suffix of ['', '.digest', '.manifest', '.manifest.digest']) {
      const marker = context.issuance_path + suffix; writeFileSync(marker, 'torn intent');
      try {
        assert.throws(() => reservePrimaryRemainingEightOutput(q.continuation, join(q.fresh.root, 'unused')), /already issued/u);
        assert.equal(readFileSync(marker, 'utf8'), 'torn intent');
        assert.equal(existsSync(context.issuance_path), suffix === '');
      } finally { rmSync(marker); }
    }
    const grant = reservePrimaryRemainingEightOutput(q.continuation, q.fresh.root), m = q.manifest();
    assert.equal(Object.isFrozen(grant), true);
    assert.throws(() => { grant.path = 'another-parent'; }, TypeError);
    assert.throws(() => preparePrimaryEvaluationBatch(m.path, { ...adapters(), issuance: { ...grant } }), /live preparation issuance/u);
    assert.equal(existsSync(m.value.root), false);
    preparePrimaryEvaluationBatch(m.path, { ...adapters(), issuance: grant });
  });
  await t.test('grading uncertainty saves failure once without replacement IDs or sibling plan', async () => {
    const q = await remainingFixture(t), m = q.manifest(), a = adapters({ grading: { grade: async block => {
      a.grades.push(block.fixture_id); return { status: 'unknown' };
    } } });
    preparePrimaryEvaluationBatch(m.path, a); const result = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
    assert.equal(result.state, 'stopped'); assert.equal(a.calls.length, 1); assert.equal(a.grades.length, 1);
    assert.equal(result.slots[0].run_id, m.value.blocks[0].run_id);
    await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, a), /consumed/u); assertSiblingRefused(q);
  });
  await t.test('permission/unknown execution stops without grading; consumed remains', async () => {
    for (const state of ['permission_denied', 'authentication_required', 'execution_blocked', 'running']) {
      const q = await remainingFixture(t), m = q.manifest(), a = adapters({ state });
      preparePrimaryEvaluationBatch(m.path, a); const result = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
      assert.equal(result.state, 'stopped'); assert.equal(a.calls.length, 1); assert.equal(a.grades.length, 0);
      await assert.rejects(startPrimaryEvaluationBatch(m.value.root, m.digest, a), /consumed/u);
    }
  });
  assert.deepEqual(preserved.map(p => hash(readFileSync(p))), before);
});

// Authentic synthetic receipt construction precedes byte/digest publication.
// Logical order differs across blocks; the reporter selects the first nonpass.
function mixClosedNativeSlots(slots, index) {
  const unknown = index % 3, failed = (index + 1) % 3;
  slots[unknown].outcome = 'unknown';
  slots[failed].state = 'verification_failed'; slots[failed].outcome = 'fail';
  slots[failed].verification.checks[0].status = 'fail'; slots[failed].verification.checks[0].exit_code = 1;
}
test('mixed primary native failures and pending quality advance independent of first-nonpass order', async t => {
  const f = fixture(t, { kernelCondition: 'kernel_principles_v2' }), m = f.manifest(), a = adapters({ editSlots: mixClosedNativeSlots });
  preparePrimaryEvaluationBatch(m.path, a);
  const result = await startPrimaryEvaluationBatch(m.value.root, m.digest, a);
  assert.equal(result.state, 'completed'); assert.equal(a.calls.length, 9); assert.equal(a.grades.length, 9);
  assert.equal(result.slots.filter(slot => slot.state === 'verification_failed').length, 9);
  for (const editSlots of [
    slots => { slots[0].outcome = 'unknown'; slots[0].verification.checks[0].status = 'fail'; slots[0].verification.checks[0].exit_code = 1; },
    slots => { slots[0].state = 'verification_failed'; slots[0].outcome = 'fail'; },
    slots => { mixClosedNativeSlots(slots, 0); slots[1].outcome = 'pass'; },
  ]) {
    const bad = f.manifest(), b = adapters({ editSlots }); preparePrimaryEvaluationBatch(bad.path, b);
    const stopped = await startPrimaryEvaluationBatch(bad.value.root, bad.digest, b);
    assert.equal(stopped.state, 'stopped'); assert.equal(b.calls.length, 1); assert.equal(b.grades.length, 0);
    await assert.rejects(startPrimaryEvaluationBatch(bad.value.root, bad.digest, b), /consumed/u);
  }
});
