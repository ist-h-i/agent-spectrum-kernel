import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comparisonHash, inventoryUserTree, prepareUserComparison } from './ask-user-comparison-prepare.mjs';
import { PRIMARY_BATCH_LIMITS, PRIMARY_FIXTURE_IDS, inspectPrimaryEvaluationBatch, preparePrimaryEvaluationBatch, reportPrimaryEvaluationBatch, startPrimaryEvaluationBatch } from './ask-primary-evaluation-batch.mjs';
const hash = value => comparisonHash(value);
function git(root, args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8',
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-primary-batch-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const blocks = PRIMARY_FIXTURE_IDS.map((fixture_id, index) => {
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
    const value = edit({ kind: 'ask_primary_evaluation_batch_manifest_v1', batch_id: `fake-${++number}`, root: join(root, `batch-${number}`),
      conditions: ['plain', 'kernel_only', 'full_ask'], limits: PRIMARY_BATCH_LIMITS, blocks: structuredClone(blocks) });
    const path = join(root, `manifest-${number}.json`); writeFileSync(path, JSON.stringify(value)); return { path, value, digest: hash(readFileSync(path)) };
  } };
}
function adapters(overrides = {}) {
  const calls = [], grades = [];
  return { calls, grades, gradingAdapter: { preflight: () => ({ status: 'ready', blockers: [] }), grade: async block => { grades.push(block.fixture_id); return { status: 'completed', quality: null }; }, ...overrides.grading },
    startComparison: async (root, planDigest) => {
      calls.push(root); const plan = JSON.parse(readFileSync(join(root, 'control/plan.json')));
      return { run_id: plan.run_id, plan_digest: planDigest, overall: { state: overrides.state ?? 'completed' },
        usage_budget: { known_tokens_lower_bound: overrides.tokens ?? 3, complete: overrides.usageComplete ?? false },
        slots: ['plain', 'kernel_only', 'full_ask'].map(condition => ({ condition, state: overrides.slotState ?? 'completed', receipt_integrity: 'valid',
          process_completed: !overrides.unknownChild, unresolved_child: overrides.unknownChild ?? false, verification: { checks: overrides.unknownVerifier ? [{ process_completed: false, spawn_observed: true, status: 'unknown' }] : [] }, metrics: { input_tokens: null, output_tokens: null } })) };
    } };
}
test('primary batch is model-free until a digest-bound, grading-connected, fake-only start', async t => {
  const f = fixture(t);
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
  await t.test('unknown child, denial, auth and interrupt prevent grading and subsequent starts', async () => {
    for (const overrides of [{ unknownChild: true }, { unknownVerifier: true }, { state: 'permission_denied' }, { state: 'authentication_required' }, { state: 'interrupted' }]) {
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
    const timed = await startPrimaryEvaluationBatch(n.value.root, n.digest, { ...b, now: () => ++tick <= 2 ? 1000 : 172800000 });
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
    assert.equal(failed.state, 'stopped'); assert.equal(failed.slots.filter(slot => slot.state === 'unknown').length, 3);
  });
});
