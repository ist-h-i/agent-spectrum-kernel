// Runtime I/O is entirely virtual. Imports load local source only; no comparison
// directory, real subprocess, ownership probe or terminating signal is used.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import cp from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { executeCodexSession } from './codex-exec-runner.mjs';
import { comparisonExecutionPolicy, comparisonHash, inventoryUserTree, inventoryComparisonGitMetadata, prepareUserComparison } from './ask-user-comparison-prepare.mjs';
import { acquireComparisonOwner, checkpointComparison, inspectComparisonExecution, readComparisonHistory, releaseComparisonOwner } from './ask-user-comparison-state.mjs';
import { startUserComparison, resumeUserComparison, reportUserComparison, inspectUserComparison, readUserComparisonPlan, aggregateUserComparisons } from './ask-user-comparison.mjs';

class Clock {
  at = 1800000000000; next = 1; timers = new Map();
  now = () => this.at;
  set = (fn, ms) => { const id = this.next++; this.timers.set(id, { fn, at: this.at + ms }); return id; };
  clear = id => this.timers.delete(id);
  async tick(ms) {
    const until = this.at + ms;
    for (;;) {
      const entry = [...this.timers].filter(([, v]) => v.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!entry) break;
      this.at = entry[1].at; this.timers.delete(entry[0]); entry[1].fn(); await Promise.resolve();
    }
    this.at = until;
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }
  runtime = () => ({ now: this.now, setTimer: this.set, clearTimer: this.clear, platform: 'darwin', signalProcess: () => { throw new Error('numeric PID signal forbidden'); } });
}

class MemoryFS {
  nodes = new Map(); fds = new Map(); next = 10; ino = 1; fail = null; writes = [];
  constructor() { this.nodes.set('/', { dir: true, ino: this.ino++, mode: 0o700 }); }
  path = value => resolve(String(value));
  check = (op, path) => { this.fail?.(op, path); };
  error = (code, path) => Object.assign(new Error(`${code}: ${path}`), { code });
  node = value => { const path = this.path(value), node = this.nodes.get(path); if (!node) throw this.error('ENOENT', path); return node; };
  mkdirSync = (value, options = {}) => {
    const path = this.path(value); this.check('mkdir', path);
    if (this.nodes.has(path)) { if (options.recursive && this.node(path).dir) return; throw this.error('EEXIST', path); }
    if (options.recursive) this.mkdirSync(dirname(path), { recursive: true });
    if (!this.node(dirname(path)).dir) throw this.error('ENOTDIR', path);
    this.nodes.set(path, { dir: true, ino: this.ino++, mode: options.mode ?? 0o700 }); this.writes.push(path);
  };
  existsSync = value => this.nodes.has(this.path(value));
  realpathSync = value => { this.node(value); return this.path(value); };
  lstatSync = value => {
    const n = this.node(value); return { dev: 1, ino: n.ino, nlink: 1, uid: 1000, mode: n.mode, size: n.bytes?.length ?? 0, mtimeMs: 1, ctimeMs: 1,
      isDirectory: () => !!n.dir, isFile: () => !n.dir, isSymbolicLink: () => false };
  };
  readdirSync = value => {
    const path = this.path(value); assert.ok(this.node(path).dir);
    return [...this.nodes.keys()].filter(key => key !== path && dirname(key) === path).map(key => key.split('/').at(-1));
  };
  openSync = (value, flags, mode = 0o600) => {
    const path = this.path(value); this.check('open', path);
    if (flags === 'wx') { if (this.existsSync(path)) throw this.error('EEXIST', path); this.node(dirname(path)); this.nodes.set(path, { ino: this.ino++, mode, bytes: Buffer.alloc(0) }); this.writes.push(path); }
    else assert.equal(flags, 'r');
    this.node(path); const fd = this.next++; this.fds.set(fd, { path, offset: 0 }); return fd;
  };
  closeSync = fd => { assert.ok(this.fds.delete(fd)); };
  fsyncSync = fd => this.check('fsync', this.fds.get(fd).path);
  fstatSync = fd => this.lstatSync(this.fds.get(fd).path);
  readSync = (fd, buffer, offset, length, position) => {
    const f = this.fds.get(fd), b = this.node(f.path).bytes, p = position ?? f.offset, size = Math.min(length, b.length - p);
    b.copy(buffer, offset, p, p + size); f.offset = p + size; return size;
  };
  readFileSync = (value, encoding) => {
    const path = typeof value === 'number' ? this.fds.get(value).path : this.path(value); this.check('read', path);
    const bytes = this.node(path).bytes; assert.ok(bytes); return encoding ? bytes.toString(typeof encoding === 'string' ? encoding : encoding.encoding) : Buffer.from(bytes);
  };
  writeFileSync = (value, bytes, options = {}) => {
    const path = typeof value === 'number' ? this.fds.get(value).path : this.path(value); this.check('write', path);
    if (typeof value !== 'number') {
      this.node(dirname(path)); if (options.flag === 'wx' && this.existsSync(path)) throw this.error('EEXIST', path);
      if (!this.existsSync(path)) this.nodes.set(path, { ino: this.ino++, mode: options.mode ?? 0o600 });
    }
    this.node(path).bytes = Buffer.from(bytes); this.writes.push(path);
  };
  renameSync = (from, to) => {
    from = this.path(from); to = this.path(to); this.check('rename', to); this.node(from); this.node(dirname(to));
    if (this.existsSync(to)) throw this.error('EEXIST', to);
    for (const [path, node] of [...this.nodes]) if (path === from || path.startsWith(`${from}/`)) { this.nodes.delete(path); this.nodes.set(to + path.slice(from.length), node); }
    this.writes.push(to);
  };
  rmSync = value => { const path = this.path(value); for (const key of [...this.nodes.keys()]) if (key === path || key.startsWith(`${path}/`)) this.nodes.delete(key); };
  chmodSync = (value, mode) => { this.node(value).mode = mode; };
  seed(path, bytes) { this.mkdirSync(dirname(path), { recursive: true }); this.writeFileSync(path, bytes); }
}

function sandbox(t) {
  const memory = new MemoryFS(), clock = new Clock(), ownership = [], gitSnapshots = new Map(); let uuid = 0;
  // The legacy observer reads Linux boot metadata from fs rather than sysctl.
  // Supply virtual bytes on every host; the single-shot path must never read it.
  memory.seed('/proc/sys/kernel/random/boot_id', 'fake-boot-identity\n');
  for (const name of ['mkdirSync', 'existsSync', 'realpathSync', 'lstatSync', 'readdirSync', 'openSync', 'closeSync', 'fsyncSync', 'fstatSync', 'readSync', 'readFileSync', 'writeFileSync', 'renameSync', 'rmSync', 'chmodSync']) t.mock.method(fs, name, memory[name]);
  t.mock.method(process, 'getuid', () => 1000);
  t.mock.method(process, 'kill', (pid, signal) => { ownership.push([pid, signal]); assert.equal(signal, 0, 'no numeric terminating signal'); });
  t.mock.method(os, 'hostname', () => 'fake-host');
  t.mock.method(os, 'release', () => 'fake-os');
  t.mock.method(crypto, 'randomUUID', () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`);
  t.mock.method(cp, 'spawn', () => { throw new Error('real subprocess prohibited'); });
  t.mock.method(cp, 'spawnSync', (bin, args, options) => {
    if (bin === '/usr/sbin/sysctl' || bin === '/bin/ps') { ownership.push([bin, args]); return { status: 0, stdout: 'fake-identity' }; }
    assert.equal(bin, 'git', 'unexpected executable');
    const cwd = options.cwd;
    if (args.includes('init')) memory.mkdirSync(join(cwd, '.git/objects'), { recursive: true });
    if (args.includes('commit')) gitSnapshots.set(cwd, inventoryUserTree(cwd));
    let stdout = '';
    if (args.includes('rev-parse')) stdout = 'a'.repeat(40);
    if (args.includes('diff')) {
      const before = gitSnapshots.get(cwd) ?? {}, after = inventoryUserTree(cwd);
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort();
      stdout = args.includes('--name-only') ? changed.map(key => `${key}\0`).join('') : changed.length ? 'fake patch\n' : '';
    }
    return { status: 0, stdout, stderr: '' };
  });
  t.mock.method(Date, 'now', clock.now);
  t.mock.method(performance, 'now', () => clock.at);
  t.mock.method(globalThis, 'setTimeout', clock.set);
  t.mock.method(globalThis, 'clearTimeout', clock.clear);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return { memory, clock, ownership };
}
const IDS = ['plain', 'kernel_only', 'full_ask'];
function fixture(env, { single = true, root = '/fake/run' } = {}) {
  const { memory: m } = env;
  m.mkdirSync(join(root, 'control/patch-workspaces'), { recursive: true });
  const prompt = 'Implement the fake task.\n', recipe = { command: ['node', '--test', 'test/value.test.mjs'], requirements: [{ id: 'value', description: 'value is one', command: ['node', '--test', 'test/value.test.mjs'] }] };
  const arms = {};
  for (const id of IDS) {
    for (const folder of [`arms/${id}`, `control/baselines/${id}`]) {
      m.seed(join(root, folder, 'src/value.mjs'), 'export const value = 0;\n');
      m.seed(join(root, folder, 'test/value.test.mjs'), '// fake test source; never executed\n');
    }
    const cwd = join(root, 'arms', id);
    for (const dir of ['objects/info', 'objects/pack', 'info']) m.mkdirSync(join(cwd, '.git', dir), { recursive: true });
    for (const name of ['config', 'HEAD', 'info/attributes']) m.seed(join(cwd, '.git', name), 'fake metadata\n');
    arms[id] = { path: `arms/${id}`, baseline_path: `control/baselines/${id}`, baseline_inventory: inventoryUserTree(cwd), git_metadata: inventoryComparisonGitMetadata(cwd), assets: [],
      capability: { status: 'available', missing: [] }, configuration: 'fake condition configuration' };
  }
  m.seed(join(root, 'inputs/prompt.md'), prompt);
  m.seed(join(root, 'control/verification.json'), JSON.stringify(recipe));
  m.seed(join(root, 'control/node-test-reporter.mjs'), '// fake reporter bytes\n');
  const plan = { kind: 'ask_user_comparison_plan_v1', root, run_id: root, prompt, policy: comparisonExecutionPolicy(single ? 'single_shot_v1' : undefined),
    execution_protocol: { version: 2, resume: single ? 'forbidden' : 'never_requested_conditions_only' },
    input: { path: 'inputs/prompt.md', digest: comparisonHash(prompt) }, task: { digest: comparisonHash(prompt) },
    source: { repo: '/fake/source', commit: 'a'.repeat(40), digest: comparisonHash('fake source') },
    verification: { path: 'control/verification.json', recipe, digest: comparisonHash(JSON.stringify(recipe)), reporter: { path: 'control/node-test-reporter.mjs', digest: comparisonHash('// fake reporter bytes\n'), format: 'ask_node_summary_jsonl_v1' } },
    mutable_paths: ['src/'], arms, condition_differences: [], unknowns: ['fake only'],
    config: { evidence_kind: 'synthetic', timeout_ms: 1000, verification_timeout_ms: 1000, overall_timeout_ms: 100000, token_budget: null, cli_bin: 'fake-cli', model: 'fake-model', reasoning: null, cli_version: 'fake-version', global_ask_presence: 'unknown' } };
  const raw = JSON.stringify(plan); m.seed(join(root, 'control/plan.json'), raw); m.seed(join(root, 'control/plan.digest'), comparisonHash(raw));
  return { root, plan, plan_digest: comparisonHash(raw) };
}
const summary = () => {
  const counts = { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
  return [JSON.stringify({ format: 'ask_node_file_summary_v1', file: 'test/value.test.mjs', success: true, counts }), JSON.stringify({ format: 'ask_node_run_summary_v1', success: true, counts })].join('\n') + '\n';
};
function executions(env, { unknownModel = false, unknownVerifier = false, timeout = false, interrupt = false } = {}) {
  const calls = [], checks = [];
  const runner = async invocation => {
    calls.push(invocation); invocation.onSpawn({ pid: 4242 });
    if (!unknownModel) env.memory.writeFileSync(join(invocation.cwd, 'src/value.mjs'), 'export const value = 1;\n');
    env.memory.seed(invocation.argv[invocation.argv.indexOf('--output-last-message') + 1], 'Fake final message.\n');
    return { spawnObserved: true, exitCode: unknownModel ? null : 0, signal: null, terminationConfirmed: !unknownModel, timedOut: timeout, interrupted: interrupt,
      stdout: `${JSON.stringify({ type: 'thread.started', thread_id: invocation.cwd })}\n${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 2 } })}\n`, stderr: '', durationMs: 1 };
  };
  const verifier = async invocation => { checks.push(invocation); invocation.onSpawn({ pid: 4343 }); return { spawnObserved: true, exitCode: unknownVerifier ? null : 0,
    terminationConfirmed: !unknownVerifier, stdout: summary(), stderr: '', durationMs: 1 }; };
  return { calls, checks, runner, verifier };
}
const start = (p, ex) => startUserComparison(p.root, p.plan_digest, ex);

function childFixture() {
  const child = new EventEmitter(), signals = [], inputs = [];
  child.pid = 777; child.exitCode = null; child.signalCode = null;
  for (const name of ['stdin', 'stdout', 'stderr']) { child[name] = new EventEmitter(); child[name].destroy = () => {}; }
  child.stdin.end = input => inputs.push(input);
  child.unref = () => {};
  child.kill = signal => { signals.push(signal); return true; };
  const exit = (code = 0, signal = null) => { child.exitCode = code; child.signalCode = signal; child.emit('exit', code, signal); };
  const close = (code = child.exitCode, signal = child.signalCode) => child.emit('close', code, signal);
  return { child, signals, inputs, exit, close };
}
function session(clock, fixture, extra = {}) {
  const requests = [];
  const promise = executeCodexSession({ executable: 'fake', argv: [], cwd: '/fake', input: '', timeoutMs: 100, terminationScope: 'direct_child', ...extra },
    (...args) => { requests.push(args); return fixture.child; }, clock.runtime());
  fixture.child.emit('spawn'); return { promise, requests };
}

test('single-shot direct-child timeout targets only held child and suppresses delayed signals after exit', async t => {
  const { clock } = sandbox(t), f = childFixture(), s = session(clock, f);
  assert.equal(s.requests[0][2].detached, false);
  await clock.tick(100); assert.deepEqual(f.signals, ['SIGTERM']);
  f.exit(null, 'SIGTERM'); await clock.tick(1000); assert.deepEqual(f.signals, ['SIGTERM']);
  f.close(); const r = await s.promise; assert.equal(r.timedOut, true); assert.equal(r.terminationConfirmed, true);
  await clock.tick(3000); assert.deepEqual(f.signals, ['SIGTERM']);
});
test('normal child exit before delayed observer error sends no signal', async t => {
  const { clock } = sandbox(t), f = childFixture();
  const s = session(clock, f, { onSpawn: () => { f.exit(); throw new Error('receipt unavailable after exit'); } });
  f.close(); const r = await s.promise; await clock.tick(4000);
  assert.equal(r.error.message, 'receipt unavailable after exit'); assert.deepEqual(f.signals, []);
});
test('close suppresses even a captured stale timeout callback; unknown child ends controller wait with error', async t => {
  const { clock } = sandbox(t), closed = childFixture(), s = session(clock, closed);
  const callback = [...clock.timers.values()][0].fn;
  closed.exit(); closed.close(); await s.promise; callback(); await clock.tick(3000); assert.deepEqual(closed.signals, []);
  const f = childFixture(), unknown = session(clock, f);
  await clock.tick(2200); const r = await unknown.promise;
  assert.equal(r.terminationConfirmed, false); assert.equal(r.cleanupError.code, 'PROCESS_DID_NOT_CLOSE'); assert.deepEqual(f.signals, ['SIGTERM', 'SIGKILL']);
  f.exit(); f.close(); await clock.tick(4000); assert.deepEqual(f.signals, ['SIGTERM', 'SIGKILL']);
});
test('single-shot policy is opt-in; unknown contract and altered policy are refused', t => {
  const env = sandbox(t), p = fixture(env);
  assert.deepEqual(comparisonExecutionPolicy(), { attempts: 1, retries: 0, concurrency: 1 });
  assert.throws(() => comparisonExecutionPolicy('fallback'), /unknown_execution_contract/);
  assert.equal(readUserComparisonPlan(p.root).plan.policy.resume, 'forbidden');
  assert.equal(reportUserComparison(p.root).execution.start_consumed, false);
  assert.match(reportUserComparison(p.root).overall.required_action, /No start has been consumed/);
  p.plan.policy.resume = 'allowed'; const raw = JSON.stringify(p.plan);
  env.memory.writeFileSync(join(p.root, 'control/plan.json'), raw); env.memory.writeFileSync(join(p.root, 'control/plan.digest'), comparisonHash(raw));
  assert.throws(() => readUserComparisonPlan(p.root));
});
test('single-shot shares scope, verification, logs, receipts, time, usage and aggregation without ownership probes', async t => {
  const env = sandbox(t), p = fixture(env), ex = executions(env);
  const report = await start(p, ex);
  assert.equal(report.overall.state, 'completed'); assert.equal(ex.calls.length, 3); assert.equal(ex.checks.length, 6);
  assert.ok([...ex.calls, ...ex.checks].every(request => request.terminationScope === 'direct_child'));
  assert.equal(new Set(ex.calls.map(request => request.cwd)).size, 3);
  assert.ok(report.slots.every(slot => slot.receipt_integrity === 'valid' && slot.scope.status === 'pass' && slot.patch_ref === 'patch.diff' && slot.metrics.duration_ms !== null && slot.metrics.input_tokens === 3));
  assert.ok(report.slots.every(slot => slot.verification.execution_origin === 'synthetic_injected_verifier' && !slot.verification.independent_process));
  assert.equal(aggregateUserComparisons([p.root]).groups[0].evidence_kind, 'synthetic');
  assert.equal(report.execution.start_consumed, true); assert.equal(report.execution.resume_allowed, false);
  assert.deepEqual(env.ownership, []);
  assert.match(inspectUserComparison(p.root).timeout_boundary, /descendants/);
  const events = readComparisonHistory(p.root, p.plan, p.plan_digest);
  assert.equal(events.snapshot.slots.plain.attempts, 1); assert.ok(env.memory.writes.some(path => path.endsWith('exit-code.txt')));
  await assert.rejects(start(p, ex)); await assert.rejects(resumeUserComparison(p.root, p.plan_digest, ex), /forbids resume/); assert.equal(ex.calls.length, 3);
});
test('concurrent starts have exactly one consumer before any child request', async t => {
  const env = sandbox(t), p = fixture(env), ex = executions(env);
  let enter; const reached = new Promise(resolve => { enter = resolve; }); let finish; const hold = new Promise(resolve => { finish = resolve; });
  const run = ex.runner; ex.runner = async invocation => { enter(); await hold; return run(invocation); };
  const first = start(p, ex); await reached;
  await assert.rejects(start(p, ex), /consumed/); finish(); await first; assert.equal(ex.calls.length, 3); assert.deepEqual(env.ownership, []);
});
test('crash just after exclusive marker and partial owner publication remain consumed with zero launches', async t => {
  const env = sandbox(t), p = fixture(env), ex = executions(env);
  env.memory.fail = (op, path) => { if (op === 'fsync' && path.endsWith('/leases')) throw new Error('crash after consumption'); };
  assert.throws(() => acquireComparisonOwner(p.root, p.plan, p.plan_digest, false), /crash/);
  env.memory.fail = null;
  assert.equal(inspectComparisonExecution(p.root, p.plan, p.plan_digest).start_consumed, true);
  await assert.rejects(start(p, ex)); await assert.rejects(resumeUserComparison(p.root, p.plan_digest, ex)); assert.equal(ex.calls.length, 0); assert.deepEqual(env.ownership, []);
});
test('partial launch intent publication blocks spawn and leaves append-only consumed history', async t => {
  const env = sandbox(t), p = fixture(env), ex = executions(env);
  env.memory.fail = (op, path) => { if (op === 'write' && path.endsWith('/record.digest') && env.memory.readFileSync(path.replace('record.digest', 'record.json'), 'utf8').includes('launch_intent')) throw new Error('partial intent'); };
  await assert.rejects(start(p, ex), /partial intent/); env.memory.fail = null;
  assert.equal(ex.calls.length, 0); assert.equal(reportUserComparison(p.root).overall.state, 'state_corrupt');
  const before = new Map(env.memory.nodes); await assert.rejects(start(p, ex)); assert.deepEqual(env.memory.nodes, before); assert.deepEqual(env.ownership, []);
});
test('unknown model or verification termination stops every later process', async t => {
  const env = sandbox(t);
  for (const scenario of ['unknownModel', 'unknownVerifier']) {
    const p = fixture(env, { root: `/fake/${scenario}` }), ex = executions(env, { [scenario]: true });
    const report = await start(p, ex); assert.equal(ex.calls.length, 1); assert.equal(ex.checks.length, scenario === 'unknownModel' ? 0 : 1);
    assert.equal(report.overall.state, 'runner_failed'); assert.equal(report.slots[0].unresolved_child, true);
    assert.ok(report.slots.slice(1).every(slot => slot.state === 'not_started'));
    await assert.rejects(resumeUserComparison(p.root, p.plan_digest, ex));
  }
  assert.deepEqual(env.ownership, []);
});
test('timeout and interruption close single-shot run without automatic resume or new-ID retry', async t => {
  const env = sandbox(t);
  for (const state of ['timeout', 'interrupt']) {
    const p = fixture(env, { root: `/fake/${state}` }), ex = executions(env, { [state]: true });
    const report = await start(p, ex); assert.equal(ex.calls.length, 1); assert.equal(ex.checks.length, 0);
    assert.equal(report.overall.state, state === 'timeout' ? 'timeout' : 'interrupted');
    assert.match(report.overall.required_action, /no automatic retry/); await assert.rejects(start(p, ex));
  }
  assert.deepEqual(env.ownership, []);
});
test('log write failure and output collision preserve original bytes and never start later arms', async t => {
  const env = sandbox(t);
  for (const collide of [false, true]) {
    const p = fixture(env, { root: `/fake/failure-${collide}` }), ex = executions(env), path = join(p.root, 'control/slots/plain/stdout.jsonl');
    if (collide) env.memory.seed(path, 'existing evidence');
    else env.memory.fail = (op, name) => { if (op === 'write' && name === path) throw new Error('log save failed'); };
    await assert.rejects(start(p, ex)); env.memory.fail = null; assert.equal(ex.calls.length, collide ? 0 : 1); assert.equal(ex.checks.length, 0);
    if (collide) assert.equal(env.memory.readFileSync(path, 'utf8'), 'existing evidence');
    await assert.rejects(start(p, ex)); await assert.rejects(resumeUserComparison(p.root, p.plan_digest, ex));
  }
  assert.deepEqual(env.ownership, []);
});
test('new preparation output collision refuses before touching output or launching any process', t => {
  const env = sandbox(t); env.memory.mkdirSync('/fake/source', { recursive: true }); env.memory.seed('/fake/output/existing', 'keep');
  const before = new Map(env.memory.nodes);
  assert.throws(() => prepareUserComparison({ repo: '/fake/source', output: '/fake/output', executionContract: 'single_shot_v1' }), /output_exists/);
  assert.deepEqual(env.memory.nodes, before); assert.deepEqual(env.ownership, []);
});
test('legacy contract keeps ownership and pending-only resume using exclusively fake metadata I/O', async t => {
  const env = sandbox(t), p = fixture(env, { single: false }), ex = executions(env, { interrupt: true });
  const first = await start(p, ex); assert.equal(first.overall.state, 'interrupted'); assert.equal(ex.calls.length, 1);
  assert.ok(env.ownership.length > 0); const next = executions(env);
  const report = await resumeUserComparison(p.root, p.plan_digest, next); assert.equal(next.calls.length, 2);
  assert.ok(next.calls.every(request => request.terminationScope === undefined));
  assert.deepEqual(report.slots.map(slot => slot.state), ['interrupted', 'completed', 'completed']);
  assert.equal(report.execution.start_consumed, undefined);
});

test('partial start header and invocation-report publication cannot reopen a consumed run', async t => {
  const env = sandbox(t);
  for (const suffix of ['start.digest', '/exit-code.txt']) {
    const p = fixture(env, { root: `/fake/partial-${suffix === 'start.digest' ? 'header' : 'report'}` }), ex = executions(env);
    env.memory.fail = (op, path) => { if (op === 'write' && path.endsWith(suffix)) throw new Error('partial publication'); };
    await assert.rejects(start(p, ex), /partial publication/); env.memory.fail = null;
    const calls = ex.calls.length; assert.equal(calls, suffix === 'start.digest' ? 0 : 3);
    assert.equal(reportUserComparison(p.root).overall.state, 'state_corrupt');
    await assert.rejects(start(p, ex)); await assert.rejects(resumeUserComparison(p.root, p.plan_digest, ex)); assert.equal(ex.calls.length, calls);
  }
  assert.deepEqual(env.ownership, []);
});
test('an exit code alone cannot substitute for confirmed lifecycle termination', async t => {
  const env = sandbox(t), p = fixture(env), ex = executions(env);
  const run = ex.runner; ex.runner = async request => { const value = await run(request); delete value.terminationConfirmed; return value; };
  const report = await start(p, ex);
  assert.equal(ex.calls.length, 1); assert.equal(ex.checks.length, 0); assert.equal(report.slots[0].cleanup_error.code, 'CHILD_TERMINATION_UNKNOWN');
  assert.equal(report.slots[0].scope.status, 'unknown'); assert.deepEqual(env.ownership, []);
});
test('capability absence and task-test failure retain existing sequential independent-arm behavior', async t => {
  const env = sandbox(t), p = fixture(env), ex = executions(env);
  p.plan.arms.kernel_only.capability = { status: 'capability_missing', missing: ['fake-required-route'] };
  const raw = JSON.stringify(p.plan); p.plan_digest = comparisonHash(raw);
  env.memory.writeFileSync(join(p.root, 'control/plan.json'), raw); env.memory.writeFileSync(join(p.root, 'control/plan.digest'), p.plan_digest);
  const verify = ex.verifier; ex.verifier = async request => { const value = await verify(request); if (request.cwd.endsWith('/plain')) value.exitCode = 1; return value; };
  const report = await start(p, ex);
  assert.deepEqual(report.slots.map(slot => slot.state), ['verification_failed', 'capability_missing', 'completed']);
  assert.equal(ex.calls.length, 2); assert.equal(report.overall.state, 'task_failed'); assert.deepEqual(env.ownership, []);
});
test('direct-child event/property race, aborted request and failed signal stay bounded without numeric signalling', async t => {
  const { clock } = sandbox(t), f = childFixture(), s = session(clock, f);
  f.child.exitCode = 0; await clock.tick(100); assert.deepEqual(f.signals, []);
  f.exit(); f.close(); await s.promise;
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const r = await executeCodexSession({ executable: 'fake', argv: [], cwd: '/fake', input: '', timeoutMs: 100, signal: controller.signal, terminationScope: 'direct_child' }, () => { calls++; }, clock.runtime());
  assert.equal(calls, 0); assert.equal(r.terminationConfirmed, true); assert.equal(r.interrupted, true);
  const denied = childFixture(); denied.child.kill = () => false; const request = session(clock, denied);
  await clock.tick(100); denied.exit(); denied.close(); const failed = await request.promise;
  assert.equal(failed.cleanupError.code, 'CHILD_SIGNAL_FAILED');
});
test('default legacy runner retains process-group contract under fake signal and clock I/O', async t => {
  const { clock } = sandbox(t), f = childFixture(), signals = [], runtime = clock.runtime();
  runtime.signalProcess = (pid, signal) => { signals.push([pid, signal]); if (signal === 0) throw Object.assign(new Error('fake group absent'), { code: 'ESRCH' }); };
  let options;
  const promise = executeCodexSession({ executable: 'fake', argv: [], cwd: '/fake', input: '', timeoutMs: 100 }, (bin, argv, spawnOptions) => { options = spawnOptions; return f.child; }, runtime);
  f.child.emit('spawn'); await clock.tick(0); f.exit(); f.close(); const r = await promise;
  assert.equal(options.detached, true); assert.equal(r.terminationConfirmed, undefined); assert.ok(signals.some(([pid, signal]) => pid === -777 && signal === 'SIGTERM')); assert.deepEqual(f.signals, []);
});

test('empty owner/history directories are consistently consumed and unknown in inspection and admission', async t => {
  const env = sandbox(t);
  for (const name of ['leases', 'history']) {
    const p = fixture(env, { root: `/fake/empty-${name}` }), ex = executions(env);
    env.memory.mkdirSync(join(p.root, 'control', name));
    const inspected = inspectComparisonExecution(p.root, p.plan, p.plan_digest);
    assert.equal(inspected.start_consumed, true); assert.equal(inspected.state, 'indeterminate'); assert.equal(inspected.resume_allowed, false);
    await assert.rejects(start(p, ex)); assert.equal(ex.calls.length, 0);
  }
  assert.deepEqual(env.ownership, []);
});
