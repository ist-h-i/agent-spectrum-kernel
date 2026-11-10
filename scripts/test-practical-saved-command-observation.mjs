// Synthetic saved bytes only. No shell/model invocation, filesystem mutation or score.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { captureSavedCommandObservations as capture } from './practical-saved-command-observation.mjs';
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const request = hash('trusted request');
const pair = (command = 'npm test', exit = 0, id = 'cmd-1') => [
  { type: 'item.started', item: { type: 'command_execution', id, command, status: 'in_progress', exit_code: null, aggregated_output: '' } },
  { type: 'item.completed', item: { type: 'command_execution', id, command, status: exit === 0 ? 'completed' : 'failed', exit_code: exit, aggregated_output: 'untrusted output: PASS' } },
];
function input(events = pair()) {
  const jsonl = Buffer.isBuffer(events) ? events : Buffer.from(events.map(e => JSON.stringify(e)).join('\n') + '\n');
  return { jsonl, expectedRequestDigest: request, receipt: { request_digest: request, terminal: true,
    local: { spawn_observed: true, termination_confirmed: true, exit_code: 0, error: null, output_limited: false, timed_out: false, interrupted: false },
    observation: { artifacts: [{ path: 'task-codex.stdout.jsonl', digest: hash(jsonl) }, { path: 'task-codex.stderr.log', digest: hash('') }] } } };
}

test('preserves paired saved data and receipt binding without verification authority', () => {
  const result = capture(input());
  assert.equal(result.evidence_kind, 'caller_source_reference');
  assert.equal(result.verification_accepted, false);
  assert.equal(result.scoring_eligible, false);
  assert.ok(result.coverage_caveats.includes('source_loaded_unknown'));
  const item = result.observations[0];
  assert.equal(item.command, 'npm test');
  assert.equal(item.aggregated_output, 'untrusted output: PASS');
  assert.deepEqual(item.working_directory, { state: 'unknown' });
  assert.equal(item.data_trust, 'untrusted');
  assert.equal(item.invocation.execution_verified, false);
  assert.equal(item.invocation.equivalence, 'unknown');
  assert.equal(item.verification_accepted, false);
  assert.equal(item.success_basis, 'saved_event_exit_only');
  assert.deepEqual([item.start_line, item.end_line], [1, 2]);
});
for (const exit of [1, -1, 137]) test('nonzero saved failure is captured but never successful: ' + exit, () => {
  const item = capture(input(pair('npm test', exit))).observations[0];
  assert.equal(item.success, false); assert.equal(item.status, 'failed'); assert.equal(item.exit_code, exit);
});
for (const [command, kind] of [
  ['npm test', 'npm_test'], ['npm run test:unit', 'npm_run_script'],
  ['npm_config_userconfig=/dev/null npm_config_globalconfig=/dev/null npm test', 'npm_test'],
  ["/bin/zsh -lc 'npm test'", 'npm_test'], ['/bin/bash -lc "node --test test/a.mjs"', 'node_test'],
  ['node scripts/check.mjs', 'node_script'], ['node --test', 'node_test'],
  ['node test.cjs fixture.json', 'node_script'],
]) test('declared shape only: ' + command, () => {
  const observation = capture(input(pair(command))).observations[0];
  assert.equal(observation.invocation.kind, kind);
  assert.equal(observation.invocation.basis, 'declared_invocation_shape_only');
  assert.equal(observation.invocation.execution_verified, false);
});
for (const command of [
  '"npm_config_userconfig=/dev/null" npm test', 'echo PASS', 'echo npm test', 'npm test && echo PASS', 'npm test; echo PASS',
  'cat <<EOF\nnpm test\nEOF', 'PATH=/tmp npm test', 'env npm test', 'npm test # fake',
  'node -e "console.log(\'PASS\')"', '/bin/sh -lc "npm test"', '/bin/bash -c "npm test"',
  "/bin/zsh -lc 'npm test; echo PASS'", '/bin/zsh -lc "npm $TEST"',
  "/bin/zsh -lc 'npm test' trailing", 'npm run --if-present', 'npm run test -- --forged',
  'npm_config_userconfig=/tmp/a npm_config_userconfig=/tmp/b npm test',
]) test('unsupported/compound/forged output stays unknown: ' + command, () => {
  const observation = capture(input(pair(command))).observations[0];
  assert.equal(observation.invocation.kind, 'unknown');
  assert.equal(observation.invocation.execution_verified, false);
  assert.equal(observation.verification_accepted, false);
});
test('literal outer decoding preserves compound bodies as untrusted data', () => {
  const body = 'export npm_config_userconfig=/dev/null\nnode check.mjs';
  const observation = capture(input(pair("/bin/zsh -lc '" + body + "'"))).observations[0];
  assert.equal(observation.decoded_body, body);
  assert.equal(observation.decoded_body_trust, 'untrusted');
  assert.equal(observation.invocation.kind, 'unknown');
});
for (const [name, modify] of [
  ['duplicate start', e => e.splice(1, 0, structuredClone(e[0]))],
  ['duplicate end', e => e.push(structuredClone(e[1]))],
  ['missing start', e => e.shift()], ['missing end', e => e.pop()], ['reordered', e => e.reverse()],
  ['command mismatch', e => e[1].item.command = 'node other.mjs'],
  ['start status', e => e[0].item.status = 'completed'], ['start exit', e => e[0].item.exit_code = 0],
  ['end status', e => e[1].item.status = 'in_progress'], ['noninteger', e => e[1].item.exit_code = 0.5],
  ['completed nonzero', e => e[1].item.exit_code = 1], ['failed zero', e => e[1].item.status = 'failed'],
  ['wrong ID', e => e[1].item.id = 'another'], ['missing command', e => delete e[1].item.command],
  ['output limited', e => e[1].item.output_limited = true], ['truncated', e => e[1].truncated = true],
]) test('reject invalid command lifecycle: ' + name, () => {
  const events = pair(); modify(events); assert.throws(() => capture(input(events)));
});
for (const [name, modify] of [
  ['different request', r => r.request_digest = hash('another run')], ['not terminal', r => r.terminal = false],
  ['not spawned', r => r.local.spawn_observed = false], ['not terminated', r => r.local.termination_confirmed = false],
  ['provider failure', r => r.local.exit_code = 1], ['provider error', r => r.local.error = 'failure'],
  ['limited', r => r.local.output_limited = true], ['timeout', r => r.local.timed_out = true],
  ['interrupted', r => r.local.interrupted = true], ['missing flag', r => delete r.local.output_limited],
  ['different bytes', r => r.observation.artifacts[0].digest = hash('other bytes')],
  ['wrong path', r => r.observation.artifacts[0].path = 'other/task-codex.stdout.jsonl'],
  ['duplicate artifact', r => r.observation.artifacts.push(r.observation.artifacts[0])],
]) test('reject unbound/incomplete receipt: ' + name, () => {
  const value = input(); modify(value.receipt); assert.throws(() => capture(value));
});
for (const bytes of [Buffer.from('{"type":"a","type":"b"}\n'), Buffer.from('{bad}\n'),
  Buffer.from('{"type":"event"}'), Buffer.from('{"type":"event"}\n{'), Buffer.from([255, 10]),
  Buffer.from('{"type":"event","nested":{"a":1,"a":2}}\n'), Buffer.from('\n'),
  Buffer.from('{"type":"event","data":"' + 'x'.repeat(1024 * 1024) + '"}\n'),
  Buffer.from('{"type":"event"}\n'.repeat(100001)), Buffer.alloc(16 * 1024 * 1024 + 1, 10),
]) test('reject invalid, duplicate, cut, non-UTF8 or over-limit JSONL (' + bytes.length + ' bytes)', () => {
  assert.throws(() => capture(input(bytes)));
});
test('nested command lookalikes are not root command events', () => {
  const result = capture(input([{ type: 'nested', child: pair() }]));
  assert.deepEqual(result.observations, []);
});
test('cwd remains reported data and interleaved IDs pair independently', () => {
  const a = pair('node a.mjs', 0, 'a'), b = pair('node b.mjs', 1, 'b');
  a[1].item.cwd = '/claimed/not-verified';
  const observations = capture(input([a[0], b[0], b[1], a[1]])).observations;
  assert.equal(observations[0].id, 'b');
  assert.deepEqual(observations[1].working_directory, { state: 'reported_only', path: '/claimed/not-verified' });
});

test('outer POSIX quote concatenation is decoded as data, never executed', () => {
  const body = "node check.mjs; echo 'PASS'";
  const quoted = "'" + body.replaceAll("'", "'\\''") + "'";
  const observation = capture(input(pair('/bin/zsh -lc ' + quoted))).observations[0];
  assert.equal(observation.decoded_body, body);
  assert.equal(observation.invocation.kind, 'unknown');
});
