// New artificial JSONL only. No shell, model, provider or private grader starts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import { withPrimarySchemaBuild, withPrimaryEvaluationProducer } from './ask-primary-evaluation-scope.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';

const root = new URL('..', import.meta.url).pathname;
const revision = '1.5.0-primary-saved';
const digest = 'sha256:' + 'b'.repeat(64);
const identity = { run_instance_id: '23456789-1234-4123-8123-123456789abc',
  case_id: 'case-2222222222222222-3333333333333333', attempt: '0001', adapter: 'codex',
  condition: 'plain', fixture_id: 'synthetic-render-v2', repetition: 1,
  fixture_input_digest: digest, runtime_identity_digest: digest, effective_command_digest: digest };

function authority({ cwd = 'not_required', duplicate = false } = {}) {
  const commands = [{ command_id: 'widget-unit', purpose: 'test',
    working_directory: { path: '.', evidence_requirement: cwd }, safe_argv: null,
    execution_form: 'codex_shell_command', shell_family: 'posix_bash',
    shell_envelope: { executable: '/bin/bash', arguments: ['-lc'] },
    canonical_script: "node workspace/widget.test.mjs --label 'Case A'",
    requirement: 'required', alternative_group_id: null, timeout_ms: 60000 }];
  if (duplicate) commands.push({ ...structuredClone(commands[0]), command_id: 'widget-alias' });
  for (const c of commands) {
    c.logical_command_digest = evidence.logicalCommandDigest(c);
    c.rendered_event_command_digest = evidence.renderedEventCommandDigest(c);
    c.command_contract_digest = evidence.computeCommandContractDigest(c);
  }
  const c = { schema_version: '1.0.0',
    schema_path: 'benchmarks/schemas/portfolio-verification-command-contract.schema.json',
    fixture_id: identity.fixture_id, commands };
  c.contract_digest = evidence.computeVerificationCommandContractDigest(c);
  return c;
}
const quoted = '/bin/bash -lc "node workspace/widget.test.mjs --label \'Case A\'"';
const shlex = `/bin/bash -lc 'node workspace/widget.test.mjs --label '"'"'Case A'"'"''`;
function pair(command, id = 'call-1', status = 'completed', exit = 0) {
  return [{ type: 'item.started', item: { id, type: 'command_execution', command, status: 'in_progress' } },
    { type: 'item.completed', item: { id, type: 'command_execution', command, status, exit_code: exit, aggregated_output: 'synthetic output\n' } }];
}
function build(commands, contract = authority(), parserRevision = revision) {
  const events = [...commands, { type: 'turn.completed' }];
  return evidence.buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: contract.contract_digest },
    stream: events.map(e => JSON.stringify(e)).join('\n') + '\n', contract, parserRevision });
}
const validate = (value, contract) => withPrimarySchemaBuild(() =>
  evidence.validateCommandEvidenceManifest(value, { root, contract }), { commandEvidenceParserRevision: revision });

for (const [label, command] of [['literal double quotes', quoted], ['shlex apostrophe concatenation', shlex]]) {
  test('v2 closes ' + label + ' to the declared shell and public command', () => {
    const contract = authority(), value = build(pair(command), contract);
    assert.equal(value.commands[0].matched_command_id, 'widget-unit');
    assert.equal(value.commands[0].rendered_event_command_digest,
      'sha256:' + createHash('sha256').update(command).digest('hex'));
    assert.equal(value.commands[0].status, 'succeeded');
    assert.deepEqual(evidence.projectVerifiedCommandEvidence({ manifest: validate(value, contract), contract }).succeeded_command_ids, ['widget-unit']);
    assert.equal(JSON.stringify(value).includes('widget.test.mjs'), false);
    assert.throws(() => evidence.validateCommandEvidenceManifest(value, { root, contract }), /Schema/);
  });
}
test('1.4 retains exact-render matching and default 1.3 behavior', () => {
  assert.equal(build(pair(quoted), authority(), '1.4.0-primary-saved').commands[0].match_state, 'unmatched');
  const exact = evidence.renderCommandEvent(authority().commands[0]);
  assert.deepEqual(build(pair(exact), authority(), '1.3.0').commands, build(pair(exact), authority(), '1.4.0-primary-saved').commands);
});
for (const command of [quoted.replace('/bin/bash -lc ', '/bin/bash -c '), quoted.replace('/bin/bash -lc ', '/bin/zsh -lc ')]) {
  test('a different shell envelope stays unmatched: ' + command.slice(0, 14), () => {
    const value = build(pair(command));
    assert.equal(value.commands[0].match_state, 'unmatched');
    assert.deepEqual(evidence.projectVerifiedCommandEvidence({ manifest: value, contract: authority() }).succeeded_command_ids, []);
  });
}
test('unobserved runtime cwd cannot receive credit from a claimed event cwd', () => {
  const contract = authority({ cwd: 'runtime_observed' }), events = pair(quoted);
  for (const event of events) event.item.cwd = '.';
  const value = build(events, contract);
  assert.equal(value.commands[0].match_state, 'cwd_unverified');
  assert.equal(value.commands[0].working_directory.status, 'unavailable');
  validate(value, contract);
});
test('safe auxiliary reads remain visible and cannot impersonate command IDs', () => {
  const events = [...pair("/bin/zsh -lc 'cat docs/widget.md'", 'read-1'), ...pair(quoted)];
  for (const event of events.slice(0, 2)) event.item.command_id = 'widget-unit';
  const value = build(events), p = evidence.projectVerifiedCommandEvidence({ manifest: validate(value, authority()), contract: authority() });
  assert.equal(value.command_event_count, 2);
  assert.equal(value.commands[0].match_state, 'unmatched');
  assert.equal(value.commands[0].matched_command_id, null);
  assert.equal(p.unmatched_command_count, 1);
  assert.deepEqual(p.succeeded_command_ids, ['widget-unit']);
});
test('one invocation cannot select the first of two public command IDs', () => {
  assert.throws(() => build(pair(quoted), authority({ duplicate: true })), error => error.code === 'ambiguous_command_match');
});
for (const [label, raw] of [
  ['unclosed quotes', quoted.slice(0, -1)],
  ['outer expansion', '/bin/bash -lc "node $(echo injected)"'],
  ['extra shell argument', quoted + ' ignored'],
  ['write auxiliary', "/bin/zsh -lc 'rm workspace/widget.mjs'"],
  ['hidden suffix', '/bin/bash -lc "node workspace/widget.test.mjs --label \'Case A\'; touch workspace/marker"'],
  ['absolute private read', "/bin/zsh -lc 'cat /private/synthetic-context.md'"],
]) test('v2 refuses ' + label + ' without dropping it behind a passing check', () => {
  assert.throws(() => build([...pair(quoted), ...pair(raw, 'bad-2')]));
});
for (const [label, mutate] of [
  ['exit contradiction', e => { e[1].item.exit_code = 1; }],
  ['command drift', e => { e[1].item.command += ' changed'; }],
  ['missing start', e => e.shift()],
  ['missing completion', e => e.pop()],
  ['duplicate ID', e => e.push(...pair(quoted))],
]) test('v2 keeps stream refusal: ' + label, () => {
  const e = pair(quoted); mutate(e); assert.throws(() => build(e));
});
test('failed and declined checks never become successful verification', () => {
  for (const [status, exit, expected] of [['failed', 2, 'failed_command_ids'], ['declined', null, 'declined_command_ids']]) {
    const value = build(pair(quoted, 'call-1', status, exit));
    const p = evidence.projectVerifiedCommandEvidence({ manifest: validate(value, authority()), contract: authority() });
    assert.deepEqual(p.succeeded_command_ids, []); assert.deepEqual(p[expected], ['widget-unit']);
  }
});

for (const kernelCondition of ['kernel_principles_v1', 'kernel_principles_v2']) test('explicit producer v2 rederives pinned evidence for ' + kernelCondition, async t => {
  // Use only checked-in public declarations, with fresh artificial event bytes.
  const contract = JSON.parse(readFileSync(new URL('../benchmarks/fixtures/checkpoint-b2/mn-build-option-update/verification-command-contract.json', import.meta.url)));
  const events = contract.commands.flatMap((c, i) => pair('/bin/bash -lc "' + c.canonical_script.replace(/[\\"$`]/gu, x => '\\' + x) + '"', 'public-check-' + i));
  const source = syntheticPrimarySource(t, { kernelCondition, command: 'missing', extraNativeEvents: events });
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'v2'), { commandEvidenceParserRevision: revision });
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  const verified = verifyPrimaryEvaluationProducer(options);
  assert.equal(verified.commandEvidenceParserRevision, revision);
  assert.equal(produced.model_calls, 0); assert.equal(produced.grader_process_starts, 0);
  for (const condition of ['plain', kernelCondition, 'full_ask']) {
    const input = buildPrimaryEvaluationScoringInputs(options, { condition });
    assert.deepEqual(input.normalizedResult.command_evidence.succeeded_command_ids, contract.commands.map(c => c.command_id));
    assert.equal(input.normalizedResult.command_evidence.unmatched_command_count, 0);
  }
  withPrimaryEvaluationProducer(options, () => {
    assert.throws(() => withPrimarySchemaBuild(() => {}, { profileId: verified.request.profile_id, commandEvidenceParserRevision: '1.4.0-primary-saved' }), /processing_mix/);
  });
  const file = join(produced.output_root, 'producer.json'), manifest = JSON.parse(readFileSync(file));
  assert.equal(manifest.kind, 'ask_primary_evaluation_producer_v2');
  manifest.command_evidence_parser_revision = '1.4.0-primary-saved';
  const raw = JSON.stringify(manifest) + '\n'; writeFileSync(file, raw);
  const externalDigest = 'sha256:' + createHash('sha256').update(raw).digest('hex');
  assert.throws(() => verifyPrimaryEvaluationProducer({ ...options, externalDigest }), /v2 parser revision changed/);
});
test('unrecognized processing selection refuses before publishing a synthetic producer', async t => {
  const source = syntheticPrimarySource(t), output = join(source.root, 'refused');
  await assert.rejects(producePrimaryEvaluationArtifacts(source.block, output, { commandEvidenceParserRevision: 'future' }), /unsupported primary/);
  assert.equal(existsSync(output), false);
});
test('v2 retains strict JSON and terminal closure', () => {
  for (const stream of ['{"type":"turn.completed","type":"turn.started"}\n', '{bad}\n', '{"type":"turn.completed"}']) {
    assert.throws(() => evidence.buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: authority().contract_digest }, stream, contract: authority(), parserRevision: revision }));
  }
});
