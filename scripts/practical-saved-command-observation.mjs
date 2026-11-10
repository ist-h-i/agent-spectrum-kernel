// Read-only caller-source-reference capture. Never an official/native verification gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseJsonRejectDuplicateKeys } from './ask-benchmark-duplicate-key-json.mjs';

const MAX_BYTES = 16 * 1024 * 1024, MAX_LINE_BYTES = 1024 * 1024, MAX_LINES = 100000;
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, label) => assert.ok(typeof value === 'string' && !value.includes('\0'), label);

// Literal words only, deliberately not a shell parser. Expansions, operators,
// comments, escapes and multiline programs stay unknown; nothing is evaluated.
function literalWords(value) {
  if (/[\n\r\0\\$`;&|<>(){}!*?~#]/u.test(value)) return null;
  const words = [], raw = [], pattern = /(?:[^\s'"\x00-\x1f]+|'[^']*'|"[^"]*")+/gy;
  let at = 0;
  while (at < value.length) {
    while (value[at] === ' ' || value[at] === '\t') at++;
    if (at === value.length) break;
    pattern.lastIndex = at;
    const match = pattern.exec(value);
    if (!match) return null;
    raw.push(match[0]);
    words.push(match[0].replace(/'([^']*)'|"([^"]*)"/gu, (_, single, double) => single ?? double));
    at = pattern.lastIndex;
    if (at < value.length && ![' ', '\t'].includes(value[at])) return null;
  }
  return { words, raw };
}

function decodeBody(command) {
  const outer = /^(\/bin\/(?:zsh|bash)) -lc (.*)$/su.exec(command);
  if (!outer) return /^\/bin\//u.test(command) ? null : command;
  const word = outer[2];
  let body = '', quote = null, sawQuote = false;
  for (let index = 0; index < word.length; index++) {
    const character = word[index];
    if (character === '\0') return null;
    if (quote === "'") {
      if (character === "'") quote = null; else body += character;
      continue;
    }
    if (character === '\\') {
      const next = word[++index];
      if (next === undefined || /[\n\r\0]/u.test(next)) return null;
      if (quote === '"' && !['$', '`', '"', '\\'].includes(next)) body += '\\';
      body += next;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else if (['$', '`'].includes(character)) return null;
      else body += character;
      continue;
    }
    if (["'", '"'].includes(character)) { quote = character; sawQuote = true; continue; }
    if (/[\s$`;&|<>(){}!*?~#]/u.test(character)) return null;
    body += character;
  }
  return quote === null && sawQuote ? body : null;
}

function classify(body) {
  const unknown = { kind: 'unknown', equivalence: 'unknown', execution_verified: false };
  if (body === null) return unknown;
  const tokens = literalWords(body);
  if (!tokens || !tokens.words.length) return unknown;
  const { words, raw } = tokens;
  const environment = {};
  while (/^npm_config_(?:userconfig|globalconfig)=/u.test(words[0] ?? '')) {
    if (!/^npm_config_(?:userconfig|globalconfig)=/u.test(raw.shift())) return unknown;
    const split = words.shift().split('='), key = split.shift(), value = split.join('=');
    if (!value || Object.hasOwn(environment, key)) return unknown;
    environment[key] = value;
  }
  let kind;
  if (words.length === 2 && words[0] === 'npm' && words[1] === 'test') kind = 'npm_test';
  else if (words.length === 3 && words[0] === 'npm' && words[1] === 'run' && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(words[2])) kind = 'npm_run_script';
  else if (words[0] === 'node' && words[1] === '--test' && words.slice(2).every(word => word && !word.startsWith('-'))) kind = 'node_test';
  else if (words[0] === 'node' && words.length >= 2 && /^(?!-).+\.(?:mjs|cjs|js)$/u.test(words[1])) kind = 'node_script';
  else return unknown;
  return { kind, basis: 'declared_invocation_shape_only', argv: words, environment,
    equivalence: 'unknown', execution_verified: false };
}

export function captureSavedCommandObservations({ jsonl, receipt, expectedRequestDigest }) {
  assert.ok(Buffer.isBuffer(jsonl), 'saved JSONL must be a Buffer');
  assert.ok(jsonl.length > 0 && jsonl.length <= MAX_BYTES, 'saved JSONL byte limit');
  assert.equal(jsonl.at(-1), 10, 'saved JSONL cut final line');
  assert.match(expectedRequestDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(object(receipt) && object(receipt.local), 'missing receipt');
  assert.equal(receipt.request_digest, expectedRequestDigest, 'receipt request digest mismatch');
  assert.equal(receipt.terminal, true, 'receipt not terminal');
  for (const key of ['spawn_observed', 'termination_confirmed']) assert.equal(receipt.local[key], true, key);
  assert.equal(receipt.local.exit_code, 0, 'provider exit code');
  assert.equal(receipt.local.error, null, 'provider error');
  for (const key of ['output_limited', 'timed_out', 'interrupted']) assert.equal(receipt.local[key], false, key);
  assert.ok(Array.isArray(receipt.observation?.artifacts), 'missing receipt artifacts');
  const paths = new Set();
  for (const artifact of receipt.observation.artifacts) {
    assert.ok(object(artifact), 'invalid artifact');
    text(artifact.path, 'artifact path');
    assert.ok(!paths.has(artifact.path), 'duplicate artifact path');
    paths.add(artifact.path);
  }
  const artifacts = receipt.observation.artifacts.filter(a => a.path === 'task-codex.stdout.jsonl');
  assert.equal(artifacts.length, 1, 'single task stdout artifact required');
  assert.deepEqual(Object.keys(artifacts[0]).sort(), ['digest', 'path']);
  assert.equal(artifacts[0].digest, digest(jsonl), 'saved JSONL digest mismatch');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(jsonl);
  const lines = source.slice(0, -1).split('\n');
  assert.ok(lines.length <= MAX_LINES, 'saved JSONL line limit');
  const starts = new Map(), finished = new Set(), observations = [];
  for (const [index, line] of lines.entries()) {
    assert.ok(Buffer.byteLength(line) <= MAX_LINE_BYTES, 'saved JSONL line byte limit');
    const event = parseJsonRejectDuplicateKeys(line, 'saved command event');
    assert.ok(object(event) && typeof event.type === 'string', 'invalid root event');
    if (event.item?.type !== 'command_execution') continue;
    assert.ok(['item.started', 'item.completed'].includes(event.type), 'unsupported command event lifecycle');
    const item = event.item;
    text(item.id, 'command ID'); assert.ok(item.id.length > 0, 'empty command ID');
    text(item.command, 'command text'); text(item.aggregated_output, 'command output');
    for (const flag of ['output_limited', 'timed_out', 'interrupted', 'truncated']) {
      assert.ok(!Object.hasOwn(item, flag) || item[flag] === false, 'command capture incomplete');
      assert.ok(!Object.hasOwn(event, flag) || event[flag] === false, 'event capture incomplete');
    }
    if (event.type === 'item.started') {
      assert.ok(!starts.has(item.id), 'duplicate command start ID');
      assert.equal(item.status, 'in_progress', 'invalid start status');
      assert.equal(item.exit_code, null, 'invalid start exit');
      starts.set(item.id, { item, line: index + 1 });
      continue;
    }
    const start = starts.get(item.id);
    assert.ok(start && !finished.has(item.id), 'missing start or duplicate command end');
    assert.equal(item.command, start.item.command, 'command mismatch');
    assert.ok(['completed', 'failed'].includes(item.status), 'invalid end status');
    assert.ok(Number.isSafeInteger(item.exit_code), 'invalid end exit');
    assert.equal(item.status === 'completed', item.exit_code === 0, 'status exit mismatch');
    finished.add(item.id);
    const cwd = item.working_directory ?? item.cwd ?? null;
    if (cwd !== null) text(cwd, 'working directory');
    observations.push({ id: item.id, command: item.command, aggregated_output: item.aggregated_output,
      status: item.status, exit_code: item.exit_code, success: item.exit_code === 0,
      success_basis: 'saved_event_exit_only', data_trust: 'untrusted',
      working_directory: cwd === null ? { state: 'unknown' } : { state: 'reported_only', path: cwd },
      decoded_body: decodeBody(item.command), decoded_body_trust: 'untrusted',
      invocation: classify(decodeBody(item.command)), start_line: start.line, end_line: index + 1,
      scoring_eligible: false, verification_accepted: false });
  }
  assert.equal(starts.size, finished.size, 'missing command end');
  return { kind: 'practical_saved_command_observations_v1', evidence_kind: 'caller_source_reference',
    request_digest: expectedRequestDigest, evidence_ref: { ...artifacts[0] }, observations,
    scoring_eligible: false, verification_accepted: false,
    coverage_caveats: ['root_command_execution_events_only', 'command_and_output_are_untrusted_data',
      'receipt_authenticity_requires_caller_binding', 'execution_actor_unknown', 'source_loaded_unknown',
      'working_directory_not_inferred', 'declared_invocation_shape_is_not_execution_verification',
      'command_equivalence_unknown', 'no_stdout_only_proof', 'no_official_or_native_acceptance'] };
}
