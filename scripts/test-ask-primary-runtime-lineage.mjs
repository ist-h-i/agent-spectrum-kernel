import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareUserComparison, prepareGitBaseline } from './ask-user-comparison-prepare.mjs';
import { collectUserComparisonRuntimeLineageForTest, startUserComparison } from './ask-user-comparison.mjs';
import { buildPrimaryFixtureRecipe } from './ask-primary-fixture-recipe.mjs';
import { collectPrimaryRuntimeLineage, verifyPrimaryRuntimeLineageReceipt } from './ask-primary-runtime-lineage.mjs';
import { producePrimaryRuntimeLineageArtifacts, verifyPrimaryRuntimeLineageArtifacts, verifyPrimaryEvaluationProducer } from './ask-primary-evaluation-producer.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url)), ID = 'mn-build-option-update';
const secret = 'SECRET_AUTH_HOST_CONFIGURATION_SENTINEL';
const read = path => readFileSync(path, 'utf8');
for (const missing of ['runner', 'inventory']) test('L6 lazy support rejects missing historical '+missing+' exports before evaluation', async t => {
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-lineage-lazy-link-'))); t.after(() => rmSync(area, { recursive: true, force: true }));
  const marker = join(area, 'evaluated');
  writeFileSync(join(area, 'support.mjs'), readFileSync(join(ROOT, 'scripts/ask-primary-runtime-collection-support.mjs')));
  const sideEffect = 'import {writeFileSync} from "node:fs"; writeFileSync('+JSON.stringify(marker)+',"unexpected evaluation");\n';
  writeFileSync(join(area, 'codex-exec-runner.mjs'), sideEffect + (missing === 'runner' ? 'export const historicalRunner = true;' : 'export function executeCodexSession() {}'));
  writeFileSync(join(area, 'ask-user-comparison-prepare.mjs'), sideEffect + (missing === 'inventory' ? 'export const historicalPrepare = true;' : 'export function inventoryUserTree() {}'));
  await assert.rejects(import(pathToFileURL(join(area, 'support.mjs')).href), {name:'SyntaxError'});
  assert.equal(existsSync(marker),false,'link failure must precede either module evaluation');
});
function fixture(t, kernelCondition = 'kernel_principles_v2') {
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-runtime-lineage-'))); t.after(() => rmSync(area, { recursive: true, force: true }));
  const repo = join(area, 'seed'), base = join(ROOT, 'benchmarks/fixtures/checkpoint-b2', ID);
  mkdirSync(repo); const manifest = JSON.parse(read(join(base, 'input-manifest.json')));
  for (const entry of manifest.fixtures[ID].files) { const target = join(repo, entry.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(join(base, entry.path))); }
  const commit = prepareGitBaseline(repo), recipe = buildPrimaryFixtureRecipe(ID), verification = join(area, 'verification.json'); writeFileSync(verification, JSON.stringify(recipe));
  const made = prepareUserComparison({ repo, commit, taskFile: join(repo, 'task.md'), verificationFile: verification, output: join(area, 'prepared'), mutablePaths: recipe.mutable_paths,
    taskClass: recipe.runner_task_class, kernelCondition, executionContract: 'single_shot_v1', evidenceKind: 'synthetic', cliBin: '/synthetic/never-start',
    model: 'gpt-6.1-sol', reasoning: 'high', primaryInputContract: 'closed_primary_inputs_v2' });
  return { ...made, area };
}
function transport(f, condition, { mutate = (value) => value, fail = null, chunked = false, extra = false, missingEdit = false, lateEdit = false, changeInput = false, mismatchSnapshot = false, afterVerification = false, iteration = false } = {}) {
  const writes = [], signals = []; let frames = 0;
  const selected = f.plan.primary_execution_input.conditions[condition], cwd = selected.launch_cwd;
  const items = [], clock = () => 1000 + ++frames;
  const pair = (item, end, done) => {
    if (item.type === 'fileChange' && missingEdit) return;
    done({ method: 'item/started', params: { threadId: 'thread_one', turnId: 'turn_one', startedAtMs: clock(), item } });
    const finished = { ...item, ...end };
    done({ method: 'item/completed', params: { threadId: 'thread_one', turnId: 'turn_one', completedAtMs: clock(), item: finished } }); items.push(finished);
  };
  const spawn = () => {
    const child = new EventEmitter(); Object.assign(child, { pid: 45678, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough(), unref() {} });
    const close = (code, signal) => { if (child.exitCode !== null || child.signalCode !== null) return; child.exitCode = code; child.signalCode = signal; child.stdout.end(); child.stderr.end(); child.emit('exit', code, signal); child.emit('close', code, signal); };
    const emit = value => {
      const changed = mutate(structuredClone(value)); if (changed === null || child.exitCode !== null || child.signalCode !== null) return;
      const raw = Buffer.from(typeof changed === 'string' ? changed : JSON.stringify(changed) + '\n');
      if (chunked) for (let offset = 0; offset < raw.length; offset += 13) child.stdout.write(raw.subarray(offset, offset + 13)); else child.stdout.write(raw);
    };
    child.kill = signal => { signals.push(signal); close(null, signal); return true; };
    let pending = '';
    child.stdin = new Writable({ write(chunk, encoding, callback) {
      pending += chunk.toString();
      while (pending.includes('\n')) {
        const end = pending.indexOf('\n'), message = JSON.parse(pending.slice(0, end)); pending = pending.slice(end + 1); writes.push(message);
        queueMicrotask(() => {
          if (message.id === 1) {
            if (fail === 'stderr') { child.stderr.write(secret); return; }
            if (fail === 'hang') return;
            emit({ id: 1, result: { codexHome: '/host/' + secret, userAgent: secret, platformFamily: 'unix', platformOs: 'macos' } });
          }
          if (message.id === 2) emit({ id: 2, result: { thread: { id: 'thread_one', cwd, turns: [], cliVersion: '0.162.1', createdAt: 1, updatedAt: 1,
            ephemeral: true, modelProvider: 'openai', preview: '', projectId: null, sessionId: 'session_one', source: 'vscode', status: { type: 'idle' } }, model: f.plan.config.model, modelProvider: 'openai', cwd,
            approvalPolicy: 'never', approvalsReviewer: 'user', sandbox: { type: 'workspaceWrite' } } });
          if (message.id === 3) {
            if (fail === 'approval') { emit({ id: 9, method: 'item/commandExecution/requestApproval', params: { secret } }); return; }
            const turn = { id: 'turn_one', status: 'inProgress', items: [] };
            emit({ id: 3, result: { turn } }); emit({ method: 'turn/started', params: { threadId: 'thread_one', turn } });
            if (iteration) {
              const command = { id: 'prior_failed', type: 'commandExecution', command: selected.verification[0].rendered_event_command, cwd, commandActions: [], status: 'inProgress' };
              pair(command, { status: 'failed', exitCode: 1 }, emit);
            }
            const patch = { id: 'edit_one', type: 'fileChange', status: 'inProgress', changes: [{ path: 'build.config.json', kind: { type: 'update' }, diff: 'synthetic declared patch' }] };
            if (!lateEdit) pair(patch, { status: 'completed' }, emit);
            writeFileSync(join(cwd, 'build.config.json'), '{"synthetic":"candidate"}\n');
            if (changeInput) writeFileSync(join(cwd, '../task.md'), 'immutable drift');
            if (extra) writeFileSync(join(cwd, 'undeclared.txt'), 'scope drift');
            for (const [index, check] of selected.verification.entries()) {
              const command = { id: 'command_' + index, type: 'commandExecution', command: check.rendered_event_command, cwd, commandActions: [], status: 'inProgress' };
              pair(command, { status: 'completed', exitCode: 0 }, emit);
            }
            if (afterVerification) writeFileSync(join(cwd, 'build.config.json'), 'unobserved edit after checks');
            if (lateEdit) pair(patch, { status: 'completed' }, emit);
            pair({ id: 'answer_one', type: 'agentMessage', text: '', phase: 'final_answer' }, { text: 'synthetic final' }, emit);
            emit({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread_one', turnId: 'turn_one', tokenUsage: {
              total: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 30, reasoningOutputTokens: 5, totalTokens: 120 },
              last: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 30, reasoningOutputTokens: 5, totalTokens: 120 } } } });
            emit({ method: 'turn/completed', params: { threadId: 'thread_one', turn: { id: 'turn_one', status: 'completed', items } } });
            if (mismatchSnapshot) writeFileSync(join(cwd, 'build.config.json'), 'post-turn child edit');
          }
        });
      }
      callback();
    }, final(callback) { queueMicrotask(() => close(0, null)); callback(); } });
    queueMicrotask(() => child.emit('spawn')); return child;
  };
  return { spawn, writes, signals };
}
const collect = (f, condition, fake, options = {}) => collectUserComparisonRuntimeLineageForTest(f.root, condition, { spawnProcess: fake.spawn, timeoutMs: 1000, ...options });

for (const kernel of ['kernel_principles_v1', 'kernel_principles_v2']) for (const condition of ['plain', kernel, 'full_ask'])
  test('L1-L4 existing runner -> owned receipt -> producer/readback ' + kernel + '/' + condition, async t => {
    const f = fixture(t, kernel), fake = transport(f, condition, { chunked: true }), receipt = await collect(f, condition, fake);
    const observation = verifyPrimaryRuntimeLineageReceipt(receipt);
    assert.equal(observation.status, 'collected_synthetic'); assert.equal(observation.termination_confirmed, true);
    assert.deepEqual(fake.writes.map(value => value.method), ['initialize', 'initialized', 'thread/start', 'turn/start']);
    assert.equal(fake.writes[3].params.input[0].text, read(join(f.root, f.plan.primary_execution_input.conditions[condition].input.path)));
    assert.equal(fake.writes[2].params.cwd, f.plan.primary_execution_input.conditions[condition].launch_cwd);
    assert.equal(observation.verification.observations.length, f.plan.primary_execution_input.conditions[condition].verification.length);
    assert.equal(observation.usage.total.cachedInputTokens, 30); assert.equal(observation.usage.total.reasoningOutputTokens, 5);
    assert.equal(observation.native_configuration.per_turn_resolved_model, null);
    assert.ok(!JSON.stringify(observation).includes(secret)); assert.equal(observation.scoring_authority, false); assert.equal(observation.quality, null);
    const made = producePrimaryRuntimeLineageArtifacts(receipt, join(f.area, 'producer'));
    assert.equal(verifyPrimaryRuntimeLineageArtifacts(made, receipt).scoring_ready, false);
    assert.throws(() => verifyPrimaryEvaluationProducer({ recordRoot: made.recordRoot, externalDigest: made.externalDigest }), /unknown primary producer version/);
    for (const forged of [structuredClone(receipt), JSON.parse(JSON.stringify(receipt)), {}, Symbol.for('ask.runtime')]) assert.throws(() => verifyPrimaryRuntimeLineageReceipt(forged), /owned runtime receipt/);
    assert.equal(existsSync(join(f.root, 'control/start.json')), false);
    writeFileSync(join(made.recordRoot, 'runtime-lineage.json'), '{}'); assert.throws(() => verifyPrimaryRuntimeLineageArtifacts(made, receipt));
  });

for (const [name, options] of Object.entries({ missingEdit: { missingEdit: true }, lateEdit: { lateEdit: true }, scope: { extra: true }, immutable: { changeInput: true }, stderr: { fail: 'stderr' }, approval: { fail: 'approval' } }))
  test('L2/L5 partial failure retained, no quality0: ' + name, async t => {
    const f = fixture(t), fake = transport(f, 'plain', options), receipt = await collect(f, 'plain', fake);
    const observation = verifyPrimaryRuntimeLineageReceipt(receipt);
    assert.equal(observation.status, 'unavailable'); assert.equal(observation.quality, null); assert.ok(observation.reason);
    assert.ok(!JSON.stringify(observation).includes(secret)); assert.equal(observation.scoring_authority, false);
    if (!['stderr', 'approval'].includes(name)) { assert.ok(observation.item_pairs.length > 0); assert.equal(observation.thread_id, 'thread_one'); assert.ok(observation.usage); }
    const made = producePrimaryRuntimeLineageArtifacts(receipt, join(f.area, 'failure-producer'));
    assert.equal(verifyPrimaryRuntimeLineageArtifacts(made, receipt).observation.status, 'unavailable');
  });

for (const [name, mutation] of Object.entries({
  wrong_thread: value => { if (value.params?.threadId) value.params.threadId = 'other'; return value; },
  wrong_turn: value => { if (value.params?.turnId) value.params.turnId = 'other'; return value; },
  failed_command: value => { if (value.method === 'item/completed' && value.params.item.type === 'commandExecution') value.params.item.exitCode = 1; return value; },
  missing_cwd: value => { if (value.params?.item?.type === 'commandExecution') delete value.params.item.cwd; return value; },
  changed_cwd: value => { if (value.params?.item?.type === 'commandExecution') value.params.item.cwd += '/other'; return value; },
  unknown_command: value => { if (value.params?.item?.type === 'commandExecution') value.params.item.command = '/bin/bash -lc evil'; return value; },
  missing_start: value => value.method === 'item/started' && value.params.item.type === 'commandExecution' ? null : value,
  missing_completion: value => value.method === 'item/completed' && value.params.item.type === 'commandExecution' ? null : value,
  unknown_item: value => { if (value.params?.item) value.params.item.type = 'unknown'; return value; },
  dangerous_edit: value => { if (value.params?.item?.type === 'fileChange') value.params.item.changes[0].path = '../../host-secret'; return value; },
  summary_status: value => { if (value.method === 'turn/completed') value.params.turn.items.find(item => item.type === 'commandExecution').status = 'failed'; return value; },
  summary_exit: value => { if (value.method === 'turn/completed') value.params.turn.items.find(item => item.type === 'commandExecution').exitCode = 17; return value; },
  summary_source_null: value => { if (value.method === 'turn/completed') value.params.turn.items.find(item => item.type === 'commandExecution').source = null; return value; },
  summary_source: value => { if (value.method === 'turn/completed') value.params.turn.items.find(item => item.type === 'commandExecution').source = 'plugin'; return value; },
  changed_turn_summary: value => { if (value.method === 'turn/completed') value.params.turn.items.find(item => item.type === 'commandExecution').command = '/bin/bash -lc evil'; return value; },
  invalid_json: value => value.id === 1 ? '{"id":1,"id":1}\n' : value,
  bom: value => value.id === 1 ? '\ufeff' + JSON.stringify(value) + '\n' : value,
  changed_model: value => { if (value.id === 2) value.result.model = 'other'; return value; },
  broader_sandbox: value => { if (value.id === 2) value.result.sandbox.type = 'dangerFullAccess'; return value; },
})) test('L1/L5 reject boundary ' + name, async t => {
  const f = fixture(t), fake = transport(f, 'plain', { mutate: mutation }), receipt = await collect(f, 'plain', fake);
  assert.equal(verifyPrimaryRuntimeLineageReceipt(receipt).status, 'unavailable');
});

test('L3 retained input, source and final-snapshot replay checks; L4 real start remains blocked', async t => {
  const f = fixture(t), fake = transport(f, 'plain'), receipt = await collect(f, 'plain', fake);
  await assert.rejects(() => collectPrimaryRuntimeLineage({ plan: f.plan, runtimeAuthority: true, receipt }), /effective_startup_input_closure_unverified/);
  assert.equal(fake.writes.length, 4);
  await assert.rejects(() => startUserComparison(f.root, f.plan_digest), /synthetic plans cannot use the real launcher|injected fake runners require synthetic evidence/);
  assert.equal(existsSync(join(f.root, 'control/start.json')), false);
  const path = join(f.plan.primary_execution_input.conditions.plain.launch_cwd, 'build.config.json'), original = readFileSync(path);
  writeFileSync(path, 'late write'); assert.throws(() => verifyPrimaryRuntimeLineageReceipt(receipt), /final runtime workspace changed/); writeFileSync(path, original);
  const stdin = join(f.root, f.plan.primary_execution_input.conditions.plain.input.path); writeFileSync(stdin, 'changed retained stdin');
  assert.throws(() => verifyPrimaryRuntimeLineageReceipt(receipt), /retained runtime plan\/input changed/);
});

test('L5 bounded hung fake child ends and stays unavailable', async t => {
  const f = fixture(t), fake = transport(f, 'plain', { fail: 'hang' }), receipt = await collect(f, 'plain', fake, { timeoutMs: 5 });
  const observation = verifyPrimaryRuntimeLineageReceipt(receipt); assert.equal(observation.status, 'unavailable'); assert.equal(observation.termination_confirmed, true); assert.ok(fake.signals.length);
});

for (const [name, options, reason] of [
  ['after-turn', { mismatchSnapshot: true }, 'post_turn_workspace_changed'],
  ['after-verification', { afterVerification: true }, 'unobserved_post_verification_edit'],
]) test('L2 snapshot boundary ' + name, async t => {
  const f = fixture(t), receipt = await collect(f, 'plain', transport(f, 'plain', options));
  const observation = verifyPrimaryRuntimeLineageReceipt(receipt);
  assert.equal(observation.status, 'unavailable'); assert.equal(observation.reason, reason);
  assert.ok(observation.item_pairs.length > 0); assert.ok(observation.final_response); assert.ok(observation.usage);
});

test('L2 retains failed iteration but requires final passing verification after edit', async t => {
  const f = fixture(t), receipt = await collect(f, 'plain', transport(f, 'plain', { iteration: true }));
  const observation = verifyPrimaryRuntimeLineageReceipt(receipt);
  assert.equal(observation.status, 'collected_synthetic'); assert.equal(observation.item_pairs[0].status, 'failed');
  assert.equal(observation.item_pairs[0].exit_code, 1); assert.equal(observation.quality, null);
  assert.equal(observation.verification.observations.length, f.plan.primary_execution_input.conditions.plain.verification.length);
});

test('L3 original source/baselines are rechecked; producer refuses overlapping roots before mutation', async t => {
  const f = fixture(t), receipt = await collect(f, 'plain', transport(f, 'plain'));
  for (const root of [f.root, f.plan.source.repo, join(f.root, f.plan.arms.plain.baseline_path)]) {
    const path = join(root, 'runtime-output-must-not-exist');
    assert.throws(() => producePrimaryRuntimeLineageArtifacts(receipt, path), /overlaps retained/); assert.equal(existsSync(path), false);
  }
  for (const path of [join(f.plan.source.repo, 'task.md'), join(f.root, f.plan.arms.plain.baseline_path, 'task.md')]) {
    const original = readFileSync(path); writeFileSync(path, 'changed original');
    assert.throws(() => verifyPrimaryRuntimeLineageReceipt(receipt), /prepared source\/baseline changed/); writeFileSync(path, original);
    assert.equal(verifyPrimaryRuntimeLineageReceipt(receipt).status, 'collected_synthetic');
  }
});

test('L5 snapshot failure retains valid native pairs and produces unavailable diagnostic', async t => {
  const f = fixture(t); let linked = false;
  const fake = transport(f, 'plain', { mutate: value => {
    if (!linked && value.method === 'item/completed' && value.params.item.type === 'commandExecution') {
      linked = true; symlinkSync(f.area, join(f.plan.primary_execution_input.conditions.plain.launch_cwd, 'unknown-link'));
    }
    return value;
  } });
  const receipt = await collect(f, 'plain', fake), observation = verifyPrimaryRuntimeLineageReceipt(receipt);
  assert.equal(observation.status, 'unavailable'); assert.equal(observation.reason, 'verification_snapshot_unavailable');
  assert.ok(observation.item_pairs.some(item => item.type === 'commandExecution')); assert.equal(observation.final_snapshot_digest, null);
  const made = producePrimaryRuntimeLineageArtifacts(receipt, join(f.area, 'snapshot-failure-producer'));
  assert.equal(verifyPrimaryRuntimeLineageArtifacts(made, receipt).observation.status, 'unavailable');
});
