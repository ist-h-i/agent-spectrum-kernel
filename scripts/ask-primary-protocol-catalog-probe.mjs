#!/usr/bin/env node
// One bounded protocol observation, never a task/model/scoring dispatcher.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeCodexSession } from './codex-exec-runner.mjs';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 2 * 1024 * 1024, MAX_LINE = 128 * 1024;
const PATH_WARNING = 'WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)\n';
const SETTINGS = Object.freeze([
  Object.freeze({ model: 'gpt-6.1-sol', effort: 'high' }),
  Object.freeze({ model: 'gpt-6.1-sol', effort: 'low' }),
  Object.freeze({ model: 'gpt-6-luna', effort: 'max' }),
]);
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
export const CATALOG_REQUESTS = freeze([
  Object.freeze({ id: 1, method: 'initialize', params: { clientInfo: { name: 'ask_primary_protocol_probe', version: '1' }, capabilities: { experimentalApi: false, requestAttestation: false } } }),
  Object.freeze({ method: 'initialized' }),
  Object.freeze({ id: 2, method: 'model/list', params: { limit: 100, includeHidden: false } }),
]);
const text = value => typeof value === 'string' && value.length <= 8192;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const serialize = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const allowedError = value => ['EPERM', 'EACCES', 'ENOENT', 'ETIMEDOUT', 'ENOBUFS', 'EPIPE', 'ABORT_ERR'].includes(value) ? value : null;
const allowedSignal = value => ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGHUP'].includes(value) ? value : null;

/** Raw DTOs/errors remain inside this I/O boundary; only a finite projection
 * leaves it. The existing runner owns deadline, cancellation and group cleanup. */
export async function collectPrimaryCatalogProtocol(invocation, { spawnProcess, runtime = {}, timeoutMs = 60000, signal } = {}) {
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000);
  const controller = new AbortController();
  let channel, stage = 0, failure = null, bytes = 0, lines = 0, warningCount = 0;
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), advertised = null, hasMore = false;
  const sent = [], received = [];
  const stop = reason => { failure ??= reason; controller.abort(); };
  const abort = () => stop('interrupted');
  const send = index => { sent.push(index); channel.write(JSON.stringify(CATALOG_REQUESTS[index]) + '\n'); };
  const accept = value => {
    if (!keys(value, ['id', 'result'], ['jsonrpc']) || (Object.hasOwn(value, 'jsonrpc') && value.jsonrpc !== '2.0')) return stop('unexpected_rpc');
    if (stage === 1 && value.id === 1) {
      const result = value.result;
      if (!keys(result, ['codexHome', 'platformFamily', 'platformOs', 'userAgent'])
        || ![result.codexHome, result.userAgent].every(text)
        || !['unix', 'windows'].includes(result.platformFamily) || !['macos', 'linux', 'windows'].includes(result.platformOs)) return stop('invalid_initialize');
      received.push(1); stage = 2; send(1); send(2); return;
    }
    if (stage !== 2 || value.id !== 2 || !keys(value.result, ['data'], ['nextCursor']) || !Array.isArray(value.result.data)
      || value.result.data.length > 100 || (value.result.nextCursor !== undefined && value.result.nextCursor !== null && !text(value.result.nextCursor))) return stop('invalid_catalog');
    const required = ['id', 'model', 'displayName', 'description', 'isDefault', 'hidden', 'defaultReasoningEffort', 'supportedReasoningEfforts'];
    const optional = ['additionalSpeedTiers', 'availabilityNux', 'availableAccessPrograms', 'defaultServiceTier', 'inputModalities', 'modelSpecialty',
      'multiAgentVersion', 'serviceTiers', 'supportsPersonality', 'upgrade', 'upgradeInfo'];
    for (const row of value.result.data) {
      if (!keys(row, required, optional) || ![row.id, row.model, row.displayName, row.description, row.defaultReasoningEffort].every(text)
        || typeof row.isDefault !== 'boolean' || typeof row.hidden !== 'boolean' || !Array.isArray(row.supportedReasoningEfforts)
        || row.supportedReasoningEfforts.length > 32 || row.supportedReasoningEfforts.some(effort => !keys(effort, ['reasoningEffort', 'description'])
          || !text(effort.reasoningEffort) || !text(effort.description) || !effort.reasoningEffort.length)
        || new Set(row.supportedReasoningEfforts.map(effort => effort.reasoningEffort)).size !== row.supportedReasoningEfforts.length) return stop('invalid_catalog');
    }
    advertised = SETTINGS.map(setting => {
      const matching = value.result.data.filter(row => row.model === setting.model && !row.hidden);
      return matching.length === 1 && matching[0].supportedReasoningEfforts.some(item => item.reasoningEffort === setting.effort);
    });
    hasMore = typeof value.result.nextCursor === 'string'; received.push(2); stage = 3; channel.end();
  };
  const output = ({ stream, chunk }) => {
    if (failure) return;
    bytes += chunk.length;
    if (bytes > MAX_BYTES) return stop('output_limit');
    if (stream === 'stderr') {
      stderr = Buffer.concat([stderr, chunk]);
      // Exactly one already-observed public PATH warning is recognized. No
      // dynamic path/error regex, redaction or arbitrary stderr log retention.
      const expected = Buffer.from(PATH_WARNING);
      if (warningCount || stderr.length > expected.length || !expected.subarray(0, stderr.length).equals(stderr)) return stop('unexpected_stderr');
      if (stderr.length === expected.length) { warningCount++; stderr = Buffer.alloc(0); }
      return;
    }
    stdout = Buffer.concat([stdout, chunk]);
    for (;;) {
      const end = stdout.indexOf(10);
      if (end < 0) { if (stdout.length > MAX_LINE) stop('line_limit'); return; }
      if (end > MAX_LINE || ++lines > 8) return stop('line_limit');
      const raw = stdout.subarray(0, end); stdout = stdout.subarray(end + 1);
      try { accept(parseJsonRejectDuplicateKeys(new TextDecoder('utf-8', { fatal: true }).decode(raw))); }
      catch { stop('invalid_json'); }
      if (failure) return;
    }
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let result, spawnSeen = false;
  try {
    result = await executeCodexSession({ ...invocation, input: '', retainOutput: false, timeoutMs, signal: controller.signal, onOutput: output, onSpawn() { spawnSeen = true; },
      onStdinReady(value) { channel = value; stage = 1; send(0); } }, spawnProcess, runtime);
  } catch { result = { spawnObserved: spawnSeen, exitCode: null, signal: null, error: null, cleanupError: true, durationMs: 0 }; stop('transport_error'); }
  finally { signal?.removeEventListener('abort', abort); }
  const terminated = !result.spawnObserved ? 'not_spawned' : !result.cleanupError && (Number.isInteger(result.exitCode) || allowedSignal(result.signal)) ? 'confirmed' : 'unknown';
  if (!failure && (stdout.length || stderr.length)) failure = 'unterminated_output';
  if (!failure && (stage !== 3 || result.error || result.exitCode !== 0 || result.signal || terminated !== 'confirmed')) failure = result.timedOut ? 'timeout' : 'transport_incomplete';
  const observed = failure === null;
  // Drop every raw stream/reference and every arbitrary child error/metadata.
  stdout = stderr = Buffer.alloc(0);
  return { kind: 'ask_primary_catalog_observation_v1', status: observed ? 'observed' : 'unavailable', reason: failure,
    sent: sent.map(index => ({ method: CATALOG_REQUESTS[index].method, ...(CATALOG_REQUESTS[index].id ? { id: CATALOG_REQUESTS[index].id } : {}) })),
    replies: received, output_bytes: bytes, output_lines: lines, known_path_warning_count: warningCount,
    spawn_observed: result.spawnObserved === true, exit_code: Number.isInteger(result.exitCode) && result.exitCode >= 0 && result.exitCode <= 255 ? result.exitCode : null,
    signal: allowedSignal(result.signal), error_code: allowedError(result.error?.code), termination: terminated,
    elapsed_ms: Number.isFinite(result.durationMs) && result.durationMs >= 0 ? Math.ceil(result.durationMs) : null,
    settings: SETTINGS.map((value, index) => ({ ...value, status: observed && advertised[index] ? 'advertised' : 'not_observed' })),
    catalog_has_more: observed ? hasMore : null, model_calls: 0, runtime_attestation: 'unknown', scoring_authority: false };
}

function pin(path, max = 512 * 1024 * 1024) {
  const value = readStableFile(path, 'protocol executable pin', max, { allowEmpty: false });
  return { path: value.canonicalPath, digest: value.rawByteDigest };
}
function sourcePins() { return ['ask-primary-protocol-catalog-probe.mjs', 'codex-exec-runner.mjs', 'content-addressed-store.mjs', 'ask-benchmark-stable-file.mjs']
  .map(name => ({ name, digest: pin(join(HERE, name), MAX_BYTES).digest })); }
function platformNative(launcher) {
  const target = { 'darwin-arm64': ['codex-darwin-arm64', 'aarch64-apple-darwin'], 'darwin-x64': ['codex-darwin-x64', 'x86_64-apple-darwin'],
    'linux-arm64': ['codex-linux-arm64', 'aarch64-unknown-linux-musl'], 'linux-x64': ['codex-linux-x64', 'x86_64-unknown-linux-musl'] }[`${process.platform}-${process.arch}`];
  assert.ok(target, 'unsupported protocol probe platform');
  const packagePath = createRequire(launcher).resolve(`@openai/${target[0]}/package.json`);
  return { platform_package: pin(packagePath, MAX_BYTES), native: pin(join(dirname(packagePath), 'vendor', target[1], 'bin/codex')) };
}
export function preparePrimaryCatalogProbe(launcher) {
  const source = pin(launcher, MAX_BYTES), native = platformNative(source.path);
  const known = JSON.parse(readFileSync(join(HERE, '../docs/fixtures/primary-codex-command-wire-01621.json'), 'utf8'));
  assert.equal(native.native.digest, known.binary_digest, 'installed binary changed since offline observation');
  assert.equal(source.digest, 'sha256:61b0194f3bb6534439c8d26a3ed57d0805f84b884588b761795323eeb92fcf70', 'installed launcher changed since offline observation');
  return { kind: 'ask_primary_catalog_probe_plan_v1', cli_version: known.cli_version, platform: process.platform, arch: process.arch,
    node: pin(process.execPath), launcher: source, ...native, source_pins: sourcePins(), policy: 'initialize_catalog_only_normal_permissions_v1' };
}
function writeNew(path, value) { const fd = openSync(path, 'wx', 0o600); try { writeFileSync(fd, serialize(value)); fsyncSync(fd); } finally { closeSync(fd); } }
export async function runPrimaryCatalogProbe(planPath, output, confirm) {
  const raw = readStableFile(planPath, 'protocol plan', 64 * 1024).bytes, plan = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  assert.equal(hash(raw), confirm, 'protocol plan confirmation mismatch');
  assert.deepEqual(plan, preparePrimaryCatalogProbe(plan.launcher.path), 'protocol plan or executable/source chain changed');
  assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'Node startup injection variables are outside this probe contract');
  assert.ok(isAbsolute(output) && resolve(output) === output && realpathSync(dirname(output)) === dirname(output), 'unsafe protocol output');
  mkdirSync(output, { mode: 0o700 }); // exclusive creation is the attempt marker; never resume/reuse
  const cwd = join(output, 'workspace'); mkdirSync(cwd, { mode: 0o700 });
  writeNew(join(output, 'intent.json'), { kind: 'ask_primary_catalog_probe_intent_v1', plan_digest: confirm,
    pins: [plan.node, plan.launcher, plan.native, plan.platform_package].map(value => value.digest), source_pins: plan.source_pins,
    attempt: 1, retry: 0, timeout_ms: 60000, maximum_output_bytes: MAX_BYTES });
  const controller = new AbortController(), abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  let summary;
  try { summary = await collectPrimaryCatalogProtocol({ executable: plan.node.path,
    argv: [plan.launcher.path, 'app-server', '--listen', 'stdio://'], cwd }, { signal: controller.signal }); }
  finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  writeNew(join(output, 'summary.json'), summary);
  return summary;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    assert.ok(args.length === 5 && args[0] === 'run' && args[3] === '--confirm', 'expected run PLAN OUTPUT --confirm DIGEST');
    const result = await runPrimaryCatalogProbe(args[1], args[2], args[4]);
    console.log(JSON.stringify(result)); process.exitCode = result.status === 'observed' ? 0 : 1;
  } catch { console.log(JSON.stringify({ kind: 'ask_primary_catalog_probe_refusal_v1', status: 'unavailable', reason: 'preflight_or_persistence_refused', model_calls: 0 })); process.exitCode = 1; }
}
