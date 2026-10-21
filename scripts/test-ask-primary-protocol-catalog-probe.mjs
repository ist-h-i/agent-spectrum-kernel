import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectPrimaryCatalogProtocol, CATALOG_REQUESTS } from './ask-primary-protocol-catalog-probe.mjs';
import { executeCodexSession } from './codex-exec-runner.mjs';

const secret = 'SECRET_PRIVATE_CONFIG_AND_AUTH_SENTINEL';
const init = { id: 1, result: { codexHome: `/private/${secret}`, userAgent: secret, platformOs: 'macos', platformFamily: 'unix' } };
const row = model => ({ id: model, model, displayName: secret, description: secret, isDefault: false, hidden: false,
  defaultReasoningEffort: 'high', supportedReasoningEfforts: ['low', 'high', 'max'].map(reasoningEffort => ({ reasoningEffort, description: secret })) });
const catalog = { id: 2, result: { data: [row('gpt-6.1-sol'), row('gpt-6-luna')], nextCursor: secret } };
function fakeTransport(onRequest = () => {}, { stderr = '' } = {}) {
  const writes = [], signals = []; let active;
  const spawn = () => {
    const child = new EventEmitter(); active = child;
    Object.assign(child, { pid: 43210, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough(), unref() {} });
    let pending = '';
    child.stdin = new Writable({ write(chunk, encoding, done) {
      pending += chunk.toString();
      while (pending.includes('\n')) {
        const end = pending.indexOf('\n'), request = JSON.parse(pending.slice(0, end)); pending = pending.slice(end + 1); writes.push(request);
        onRequest(request, child);
      }
      done();
    }, final(done) { queueMicrotask(() => close(0, null)); done(); } });
    const close = (code, signal) => { if (child.exitCode !== null || child.signalCode !== null) return;
      child.exitCode = code; child.signalCode = signal; child.stdout.end(); child.stderr.end(); child.emit('exit', code, signal); child.emit('close', code, signal); };
    child.kill = signal => { signals.push(signal); close(null, signal); return true; };
    child._close = close;
    queueMicrotask(() => { child.emit('spawn'); if (stderr) child.stderr.write(stderr); });
    return child;
  };
  const signalProcess = (pid, signal) => {
    if (!active || active.exitCode !== null || active.signalCode !== null) throw Object.assign(new Error(secret), { code: 'ESRCH' });
    if (signal !== 0) active.kill(signal);
  };
  return { spawn, writes, signals, signalProcess };
}
const emit = (child, value) => child.stdout.write(JSON.stringify(value) + '\n');
const request = { executable: '/synthetic/node', argv: ['/synthetic/codex.js', 'app-server', '--listen', 'stdio://'], cwd: '/synthetic/workspace' };
const run = transport => collectPrimaryCatalogProtocol(request, { spawnProcess: transport.spawn, runtime: { platform: 'darwin', signalProcess: transport.signalProcess } });

test('only the three ordered RPCs are sent; private values never cross the summary boundary', async () => {
  const transport = fakeTransport((request, child) => {
    if (request.id === 1) queueMicrotask(() => emit(child, init));
    if (request.id === 2) queueMicrotask(() => emit(child, catalog));
  });
  const result = await run(transport);
  assert.equal(result.status, 'observed'); assert.equal(result.termination, 'confirmed');
  assert.deepEqual(transport.writes, CATALOG_REQUESTS);
  assert.ok(result.settings.every(value => value.status === 'advertised'));
  assert.ok(!JSON.stringify(result).includes(secret)); assert.equal(result.model_calls, 0); assert.equal(result.runtime_attestation, 'unknown');
});
for (const [name, event] of Object.entries({
  auth_request: { id: 7, method: 'account/login/start', params: { token: secret } },
  command_request: { id: 7, method: 'command/exec', params: { command: secret } },
  notification: { method: 'thread/started', params: { secret } },
  error: { id: 1, error: { code: -1, message: secret } },
  wrong_order: catalog,
  unknown_field: { ...init, private: secret },
  unknown_result: { ...init, result: { ...init.result, instructions: secret } },
})) test(`unknown/unsafe ${name} stops without another RPC or private output`, async () => {
  const transport = fakeTransport((request, child) => { if (request.id === 1) queueMicrotask(() => emit(child, event)); });
  const result = await run(transport);
  assert.equal(result.status, 'unavailable'); assert.equal(transport.writes.length, 1); assert.ok(!JSON.stringify(result).includes(secret));
});
test('unknown stderr is not retained or returned', async () => {
  const transport = fakeTransport(() => {}, { stderr: secret });
  const result = await run(transport); assert.equal(result.status, 'unavailable'); assert.ok(!JSON.stringify(result).includes(secret));
});
for (const [name, raw, kind, reason] of [
  ['sqlite', `Error: failed to initialize sqlite state runtime under /private/${secret}: ${secret} (os error 1)\n`, 'sqlite_state_runtime_error', 'stderr_startup_error'],
  ['otel', `Error: error loading otel config: ${secret}\n`, 'otel_configuration_error', 'stderr_startup_error'],
  ['cleanup warning', `WARNING: failed to clean up stale arg0 temp dirs: ${secret}\n`, 'arg0_cleanup_warning', 'stderr_known_warning_requires_review'],
  ['unknown trace', `2026-10-21T00:00:00Z WARN codex_app_server: ${secret}\n`, 'unknown', 'stderr_unknown'],
]) test(`typed stderr ${name} remains unavailable and private`, async () => {
  const transport = fakeTransport(() => {}, { stderr: raw });
  const result = await run(transport);
  assert.equal(result.kind, 'ask_primary_catalog_observation_v2'); assert.equal(result.reason, reason); assert.equal(result.status, 'unavailable');
  assert.equal(result.stderr_diagnostics.records[0].kind, kind);
  assert.ok(result.sent.every(item => item.method === 'initialize')); assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(result.settings.every(value => value.status === 'not_observed'));
});
test('fixed RPCs cannot be mutated into another method or body', () => {
  assert.throws(() => { CATALOG_REQUESTS[0].params.clientInfo.name = 'other'; });
  assert.throws(() => { CATALOG_REQUESTS[2].method = 'turn/start'; });
});
const warning = 'WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)\n';
test('only one exact previously observed PATH warning is accepted', async () => {
  for (const stderr of [warning, warning + warning, warning.replace('1)', `${secret})`)]) {
    const transport = fakeTransport((request, child) => {
      if (request.id === 1) queueMicrotask(() => emit(child, init));
      if (request.id === 2) queueMicrotask(() => emit(child, catalog));
    }, { stderr });
    const result = await run(transport);
    assert.equal(result.status, stderr === warning ? 'observed' : 'unavailable');
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});
for (const [name, raw] of Object.entries({ duplicate: '{"id":1,"id":1,"result":{}}\n', malformed: secret + '\n',
  invalid_utf8: Buffer.from([0xff, 10]), long_line: 'x'.repeat(128 * 1024 + 1), oversized: Buffer.alloc(2 * 1024 * 1024 + 1) }))
test(`bounded framing rejects ${name}`, async () => {
  const transport = fakeTransport((request, child) => { if (request.id === 1) queueMicrotask(() => child.stdout.write(raw)); });
  const result = await run(transport); assert.equal(result.status, 'unavailable'); assert.equal(transport.writes.length, 1);
  assert.ok(!JSON.stringify(result).includes(secret));
});
test('late unknown output discards catalog matches', async () => {
  const transport = fakeTransport((request, child) => {
    if (request.id === 1) queueMicrotask(() => emit(child, init));
    if (request.id === 2) queueMicrotask(() => { emit(child, catalog); emit(child, { method: 'unknown', params: { secret } }); });
  });
  const result = await run(transport); assert.equal(result.status, 'unavailable');
  assert.ok(result.settings.every(value => value.status === 'not_observed'));
});
test('split bytes, one-page absence and ambiguous catalog are not invented support', async () => {
  for (const rows of [[], [row('gpt-6.1-sol'), row('gpt-6.1-sol')]]) {
    const transport = fakeTransport((request, child) => {
      const reply = request.id === 1 ? init : request.id === 2 ? { id: 2, result: { data: rows, nextCursor: secret } } : null;
      if (reply) queueMicrotask(() => { const raw = Buffer.from(JSON.stringify(reply) + '\n');
        for (let index = 0; index < raw.length; index += 7) child.stdout.write(raw.subarray(index, index + 7)); });
    });
    const result = await run(transport); assert.equal(result.status, 'observed'); assert.equal(result.catalog_has_more, true);
    assert.ok(result.settings.every(value => value.status === 'not_observed')); assert.ok(!JSON.stringify(result).includes(secret));
  }
});
test('spawn failure exposes only allowlisted errno, not error messages', async () => {
  const result = await collectPrimaryCatalogProtocol(request, { spawnProcess() { throw Object.assign(new Error(secret), { code: 'EPERM' }); } });
  assert.equal(result.status, 'unavailable'); assert.equal(result.termination, 'not_spawned'); assert.equal(result.error_code, 'EPERM');
  assert.ok(!JSON.stringify(result).includes(secret));
});
test('ordinary Node fake completes through real owned process transport; no Codex process', async t => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'ask-catalog-fake-'))); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const code = `const readline=require('node:readline');const r=readline.createInterface({input:process.stdin});r.on('line',raw=>{const q=JSON.parse(raw);if(q.id===1)console.log(${JSON.stringify(JSON.stringify(init))});if(q.id===2)console.log(${JSON.stringify(JSON.stringify(catalog))});});`;
  const result = await collectPrimaryCatalogProtocol({ executable: process.execPath, argv: ['-e', code], cwd }, { timeoutMs: 10000 });
  assert.equal(result.status, 'observed'); assert.equal(result.termination, 'confirmed'); assert.ok(!JSON.stringify(result).includes(secret));
});
test('timeout kills owned Node fake group and confirms termination', async t => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'ask-catalog-timeout-'))); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = await collectPrimaryCatalogProtocol({ executable: process.execPath, argv: ['-e', 'setInterval(()=>{},1000)'], cwd }, { timeoutMs: 100 });
  assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'timeout'); assert.equal(result.termination, 'confirmed');
});
test('cleanup uncertainty cannot become an observed catalog', async () => {
  const transport = fakeTransport((request, child) => {
    if (request.id === 1) queueMicrotask(() => emit(child, init));
    if (request.id === 2) queueMicrotask(() => emit(child, catalog));
  });
  const result = await collectPrimaryCatalogProtocol(request, { spawnProcess: transport.spawn,
    runtime: { platform: 'darwin', signalProcess() { throw Object.assign(new Error(secret), { code: 'EPERM' }); },
      setTimer: (fn, ms) => setTimeout(fn, Math.min(ms, 1)) } });
  assert.equal(result.status, 'unavailable'); assert.equal(result.termination, 'unknown');
  assert.ok(result.settings.every(value => value.status === 'not_observed')); assert.ok(!JSON.stringify(result).includes(secret));
});
test('explicit no-retention returns no raw bytes; default fixed-stdin behavior is unchanged', async t => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'ask-catalog-session-'))); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const retainOutput of [true, false]) {
    const result = await executeCodexSession({ executable: process.execPath, argv: ['-e', 'process.stdin.pipe(process.stdout)'],
      cwd, input: secret, timeoutMs: 10000, retainOutput });
    assert.equal(result.exitCode, 0); assert.equal(result.stdout.toString(), retainOutput ? secret : ''); assert.equal(result.stderr.length, 0);
  }
});
test('protocol input capability expires at process termination and enforces its bound', async t => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'ask-catalog-input-'))); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  let channel;
  const result = await executeCodexSession({ executable: process.execPath, argv: ['-e', 'process.stdin.resume()'], cwd, input: '', timeoutMs: 10000,
    onStdinReady(value) { channel = value; assert.throws(() => value.write('x'.repeat(65537))); value.end(); } });
  assert.equal(result.exitCode, 0); assert.throws(() => channel.write('late')); assert.throws(() => channel.end());
});
test('real owned Node fake and its child are terminated and reaped on timeout', async t => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'ask-catalog-child-'))); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const code = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.on('SIGTERM',()=>{c.once('close',()=>process.exit(0));c.kill('SIGTERM');});setInterval(()=>{},1000);`;
  const result = await collectPrimaryCatalogProtocol({ executable: process.execPath, argv: ['-e', code], cwd }, { timeoutMs: 500 });
  assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'timeout'); assert.equal(result.termination, 'confirmed');
});
