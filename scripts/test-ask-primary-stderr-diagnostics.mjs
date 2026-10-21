import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrimaryStderrDiagnostics, classifyPrimaryStderrLine } from './ask-primary-stderr-diagnostics.mjs';
const warning = 'WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)\n';
const secret = 'PRIVATE_AUTH_PATH_AND_PERSONAL_SENTINEL';
test('only predefined stderr classes leave the boundary; dynamic values are dropped', () => {
  const value = classifyPrimaryStderrLine(`Error: failed to initialize sqlite state runtime under /private/${secret}: detail ${secret} (os error 1)`);
  assert.deepEqual(value, { kind: 'sqlite_state_runtime_error', severity: 'startup_error_text', os_error_text: 'permission_text' });
  assert.ok(!JSON.stringify(value).includes(secret));
});
test('existing exact warning may continue once; benign repeat remains a diagnostic stop', () => {
  const parser = createPrimaryStderrDiagnostics();
  assert.equal(parser.push(Buffer.from(warning)), null);
  assert.equal(parser.push(Buffer.from(warning)), 'stderr_known_warning_repeat');
  const result = parser.summary(); assert.equal(result.path_alias_warning_count, 2);
  assert.deepEqual(result.records.map(item => item.kind), ['path_alias_warning', 'path_alias_warning']);
});
test('source-known nonfatal cleanup warning is identified without permission to continue', () => {
  const parser = createPrimaryStderrDiagnostics();
  assert.equal(parser.push(Buffer.from(`WARNING: failed to clean up stale arg0 temp dirs: /private/${secret}\n`)), 'stderr_known_warning_requires_review');
  assert.equal(parser.summary().records[0].kind, 'arg0_cleanup_warning'); assert.ok(!JSON.stringify(parser.summary()).includes(secret));
});
for (const raw of [secret, `WARN arbitrary ${secret}\n`, `Error: unrelated ${secret}\n`, `{ "level":"WARN", "token":"${secret}" }\n`, warning.replace('1)', '13)')])
test(`unknown stderr refuses without preserving content (${raw.length} artificial bytes)`, () => {
  const parser = createPrimaryStderrDiagnostics(); assert.ok(parser.push(Buffer.from(raw)) || parser.finish());
  assert.equal(parser.summary().records.at(-1).kind, 'unknown'); assert.ok(!JSON.stringify(parser.summary()).includes(secret));
});
test('coalesced/split known warning and fatal error classify independently of chunk boundaries', () => {
  const raw = Buffer.from(warning + `Error: error loading otel config: ${secret}\n`);
  for (const size of [1, 7, raw.length]) {
    const parser = createPrimaryStderrDiagnostics(); let stopped;
    for (let offset = 0; offset < raw.length && !stopped; offset += size) stopped = parser.push(raw.subarray(offset, offset + size));
    assert.equal(stopped, 'stderr_startup_error'); assert.equal(parser.summary().path_alias_warning_count, 1);
    assert.equal(parser.summary().records.at(-1).kind, 'otel_configuration_error'); assert.ok(!JSON.stringify(parser.summary()).includes(secret));
  }
});
test('invalid UTF8, incomplete line and bounded storage all stop', () => {
  const invalid = createPrimaryStderrDiagnostics(); assert.equal(invalid.push(Buffer.from([255, 10])), 'stderr_invalid_encoding');
  const incomplete = createPrimaryStderrDiagnostics(); assert.equal(incomplete.push(Buffer.from('Error: error loading otel config: ')), null);
  assert.equal(incomplete.finish(), 'stderr_unterminated');
  const large = createPrimaryStderrDiagnostics(); assert.equal(large.push(Buffer.from('Error: error loading otel config: ' + secret.repeat(500))), 'stderr_limit');
});
