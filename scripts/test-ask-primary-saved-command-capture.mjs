// Literal event parsing only. No commands, models, shells or evaluator workers.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import { withPrimarySchemaBuild } from './ask-primary-evaluation-scope.mjs';
const root = new URL('..', import.meta.url).pathname;
const revision = '1.4.0-primary-saved';
const digest = 'sha256:' + 'a'.repeat(64);
const identity = { run_instance_id: '12345678-1234-4123-8123-123456789abc',
  case_id: 'case-1111111111111111-2222222222222222', attempt: '0001', adapter: 'codex',
  condition: 'plain', fixture_id: 'synthetic-capture', repetition: 1,
  fixture_input_digest: digest, verification_command_contract_digest: null,
  runtime_identity_digest: digest, effective_command_digest: digest };
function contract() {
  const q = { command_id: 'focused-test', purpose: 'test',
    working_directory: { path: '.', evidence_requirement: 'not_required' }, safe_argv: null,
    execution_form: 'codex_shell_command', shell_family: 'posix_bash',
    shell_envelope: { executable: '/bin/bash', arguments: ['-lc'] },
    canonical_script: 'node workspace/test.mjs', requirement: 'required',
    alternative_group_id: null, timeout_ms: 60000 };
  q.logical_command_digest = evidence.logicalCommandDigest(q);
  q.rendered_event_command_digest = evidence.renderedEventCommandDigest(q);
  q.command_contract_digest = evidence.computeCommandContractDigest(q);
  const value = { schema_version: '1.0.0',
    schema_path: 'benchmarks/schemas/portfolio-verification-command-contract.schema.json',
    fixture_id: 'synthetic-capture', commands: [q] };
  value.contract_digest = evidence.computeVerificationCommandContractDigest(value);
  return value;
}
const authority = contract();
function events(command = "/bin/zsh -lc 'node workspace/test.mjs'") {
  return [
    { type: 'item.started', item: { id: 'cmd-1', type: 'command_execution', command, status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'cmd-1', type: 'command_execution', command, status: 'completed', exit_code: 0, aggregated_output: 'pass\n' } },
    { type: 'turn.completed' },
  ];
}
const stream = values => Buffer.from(values.map(value => JSON.stringify(value)).join('\n') + '\n');
function build(values, parserRevision = revision) {
  return evidence.buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: authority.contract_digest },
    stream: stream(values), contract: authority, parserRevision });
}
for (const [shell, flag] of [['/bin/zsh', '-lc'], ['/bin/bash', '-c']])
  test('saved-primary capture accepts ' + shell + ' ' + flag + ' without equivalence inference', () => {
    const value = build(events(shell + ' ' + flag + " 'node workspace/test.mjs'"));
    assert.equal(value.capture.parser_revision, revision);
    assert.equal(value.command_event_count, 1);
    assert.equal(value.commands[0].match_state, 'unmatched');
    assert.equal(value.commands[0].matched_command_id, null);
    assert.equal(value.commands[0].status, 'succeeded');
    assert.equal(JSON.stringify(value).includes('node workspace/test.mjs'), false);
    withPrimarySchemaBuild(() => evidence.validateCommandEvidenceManifest(value, { root, contract: authority }));
    assert.throws(() => evidence.validateCommandEvidenceManifest(value, { root, contract: authority }), /Schema/);
  });
test('legacy bash-lc bytes and exact matching stay unchanged', () => {
  const raw = "/bin/bash -lc 'node workspace/test.mjs'";
  const legacy = build(events(raw), evidence.COMMAND_EVIDENCE_PARSER_REVISION);
  const current = build(events(raw));
  assert.equal(legacy.capture.parser_revision, '1.3.0');
  assert.equal(legacy.commands[0].match_state, 'matched');
  assert.deepEqual(current.commands, legacy.commands);
  evidence.validateCommandEvidenceManifest(legacy, { root, contract: authority });
});
test('legacy parsing does not acquire the saved-primary profile', () => {
  assert.throws(() => build(events(), evidence.COMMAND_EVIDENCE_PARSER_REVISION), /unsupported shell/);
});
test('literal double quotes and concatenated fragments are read, never evaluated', () => {
  for (const command of [
    '/bin/zsh -lc "node workspace/test.mjs"',
    '/bin/bash -c "node \\"workspace/quoted.mjs\\""',
    '/bin/zsh -lc "node "' + "'workspace/test.mjs'",
    "/bin/zsh -lc 'node '\\''workspace/test.mjs'\\'''",
    '/bin/zsh -lc "node workspace/test.mjs\nnode workspace/other.mjs"',
  ]) assert.equal(build(events(command)).command_event_count, 1);
});
for (const [label, command] of [
  ['unclosed word', "/bin/zsh -lc 'node workspace/test.mjs"],
  ['extra statement', "/bin/zsh -lc 'node workspace/test.mjs'; touch injected"],
  ['two arguments', '/bin/zsh -lc "node" "workspace/test.mjs"'],
  ['outer dollar expansion', '/bin/zsh -lc "node $(touch injected)"'],
  ['outer backtick expansion', '/bin/zsh -lc "node ' + String.fromCharCode(96) + 'touch injected' + String.fromCharCode(96) + '"'],
  ['unsupported shell', "/bin/sh -lc 'node workspace/test.mjs'"],
  ['unsupported flag', "/bin/zsh -c 'node workspace/test.mjs'"],
  ['unsafe authority', "/bin/zsh -lc 'node /Users/example/private.mjs'"],
  ['escaped NUL', '/bin/zsh -lc "node \\' + '\0' + '"'],
]) test(label + ' stays unknown with a portable reason', () => {
  let error;
  try { build(events(command)); } catch (caught) { error = caught; }
  assert.ok(error);
  const reason = evidence.commandEvidenceFailureReason(error);
  assert.match(reason, /^capture_invalid:[a-z_]+$/);
  assert.ok(!reason.includes(command));
  const value = evidence.buildUnavailableCommandEvidence({ identity: { ...identity,
    verification_command_contract_digest: authority.contract_digest }, support: 'supported',
    probe: 'capture_invalid', reason, stream: stream(events(command)), parserRevision: revision });
  assert.equal(value.capture.evidence_level, 'unavailable');
  assert.equal(value.capture.downgrade_reason, reason);
  assert.equal(value.commands.length, 0);
});
for (const [label, mutate, reason] of [
  ['pair drift', values => { values[1].item.command += ' changed'; }, 'command_drift'],
  ['missing pair', values => { values.shift(); }, 'completed_without_started'],
  ['incomplete pair', values => { values.splice(1, 1); }, 'started_without_completed'],
  ['missing terminal', values => { values.pop(); }, 'missing_terminal_turn'],
  ['duplicate terminal', values => { values.push({ type: 'turn.completed' }); }, 'duplicate_terminal_turn'],
  ['contradictory exit', values => { values[1].item.exit_code = 1; }, 'status_exit_contradiction'],
]) test(label + ' retains structural refusal', () => {
  const values = events(); mutate(values);
  assert.throws(() => build(values), error => error.code === reason);
});
test('duplicate JSON keys and malformed JSONL remain unknown', () => {
  for (const raw of ['{"type":"turn.completed","type":"turn.started"}\n', '{bad}\n'])
    assert.throws(() => evidence.buildCodexCommandEvidence({ identity, contract: authority, stream: raw, parserRevision: revision }),
      error => error.code === 'malformed_jsonl');
});
test('diagnostics exclude arbitrary exception messages or codes', () => {
  assert.equal(evidence.commandEvidenceFailureReason(new Error('secret raw command')), 'capture_invalid:unclassified');
  assert.equal(evidence.commandEvidenceFailureReason(new evidence.CommandEvidenceError('secret-unbounded-code', 'raw command')),
    'capture_invalid:unclassified');
});
test('existing bounded inline-script authority remains unknown rather than bypassed', () => {
  const raw = '/bin/zsh -lc "node -e \'const fs=require(\\"node:fs\\");console.log(fs.readFileSync(\\"workspace/review.json\\",\\"utf8\\"))\'"';
  assert.throws(() => build(events(raw)), error => error.code === 'unsafe_command');
});
test('unrecognized parser revisions cannot declare compatibility', () => {
  assert.throws(() => build(events(), 'future-unverified'), error => error.code === 'unsupported_parser_revision');
});
