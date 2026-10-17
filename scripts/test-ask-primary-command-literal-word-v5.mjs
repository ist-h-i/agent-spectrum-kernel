// Newly authored artificial events and public contracts only. Commands are data:
// neither this suite nor the parser executes/evaluates a shell word or script.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import { canonicalDigest, stableCanonicalJson } from './ask-benchmark-materialize.mjs';
import { withPrimarySchemaBuild } from './ask-primary-evaluation-scope.mjs';
import { artificialCommand, artificialEdit, envelopeHeaders, envelopeEnd } from './test-helpers-primary-command-envelope-v4.mjs';
import { artificialLiteralCommand, artificialLiteralEnvelope } from './test-helpers-primary-literal-word-v5.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';

const root = resolve(import.meta.dirname, '..'), revision = '1.8.0-primary-saved';
const contract = JSON.parse(readFileSync(join(root, 'benchmarks/fixtures/checkpoint-b2/mn-build-option-update/verification-command-contract.json')));
const digest = 'sha256:' + 'a'.repeat(64), armRoot = '/artificial/retained/arms/plain', path = 'workspace/build.config.json';
const identity = { run_instance_id: '56789012-3456-4345-8345-345678901abc', case_id: 'case-5555555555555555-6666666666666666', attempt: '0001', adapter: 'codex',
  condition: 'plain', fixture_id: contract.fixture_id, repetition: 1, fixture_input_digest: contract.fixture_input_digest,
  verification_command_contract_digest: contract.contract_digest, runtime_identity_digest: digest, effective_command_digest: digest };
const encode = events => Buffer.from(events.map(event => JSON.stringify(event)).join('\n') + '\n');
const hash = raw => 'sha256:' + createHash('sha256').update(raw).digest('hex');
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
function build(events, { contract: selected = contract, ...options } = {}) {
  return evidence.buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: selected.contract_digest },
    stream: encode(events), contract: selected, parserRevision: revision, candidateChangePaths: [path],
    candidateChanges: [{ path, kind: 'update' }], candidateWorkspaceRoot: armRoot, ...options });
}
function project(value, selected = contract) {
  return withPrimarySchemaBuild(() => evidence.projectVerifiedCommandEvidence({
    manifest: evidence.validateCommandEvidenceManifest(value, { root, contract: selected }), contract: selected,
  }), { commandEvidenceParserRevision: revision });
}
function refused(events, reason, options = {}) {
  let error; try { build(events, options); } catch (caught) { error = caught; }
  assert.ok(error, 'complete artificial capture must refuse');
  if (reason) assert.equal(error.code, reason);
  const value = evidence.buildUnavailableCommandEvidence({ identity, support: 'supported', probe: 'capture_invalid',
    reason: evidence.commandEvidenceFailureReason(error, { parserRevision: revision }), stream: encode(events), parserRevision: revision });
  assert.deepEqual(value.commands, []); assert.deepEqual(project(value).succeeded_command_ids, []);
  return value;
}
const combined = () => artificialLiteralEnvelope({ contract, armRoot, path });
const wordEvents = raw => [...envelopeHeaders(), ...artificialCommand(raw, 'artificial-literal-check'), envelopeEnd()];
const doubleWord = value => '"' + value.replace(/[\\"$\u0060]/gu, character => '\\' + character) + '"';
function oneContract(script, { cwd = 'not_required', direct = false } = {}) {
  const value = structuredClone(contract), command = value.commands[0];
  value.commands = [command]; command.working_directory.evidence_requirement = cwd;
  command.canonical_script = direct ? null : script;
  if (direct) { command.execution_form = 'direct_argv'; command.safe_argv = script.split(' '); command.shell_family = null; command.shell_envelope = null; }
  command.logical_command_digest = evidence.logicalCommandDigest(command);
  command.rendered_event_command_digest = evidence.renderedEventCommandDigest(command);
  command.command_contract_digest = evidence.computeCommandContractDigest(command);
  value.contract_digest = evidence.computeVerificationCommandContractDigest(value);
  return evidence.validateVerificationCommandContract(value, { root });
}
function reseal(value) {
  const boundIdentity = Object.fromEntries(Object.keys(identity).map(key => [key, value[key]]));
  for (const command of value.commands) {
    const base = omit(command, ['command_evidence_id', 'command_evidence_digest', 'bytes']);
    command.command_evidence_digest = canonicalDigest({ ...boundIdentity, ...base });
    command.command_evidence_id = 'command-evidence-' + command.command_evidence_digest.slice(7, 39);
    command.bytes = Buffer.byteLength(stableCanonicalJson(omit(command, ['bytes'])));
  }
  value.manifest_digest = canonicalDigest(omit(value, ['manifest_digest']));
  return value;
}

test('AC5-1/3 v5 combined edit and parallel checks close genuine IDs and actual invocation bytes', () => {
  const value = build(combined()), result = project(value);
  assert.equal(value.capture.parser_revision, revision); assert.equal(value.capture.evidence_level, 'executed');
  assert.equal(result.unmatched_command_count, 2); assert.equal(value.command_event_count, 4);
  assert.deepEqual(result.succeeded_command_ids, contract.commands.map(command => command.command_id));
  for (const command of value.commands.filter(command => command.match_state === 'matched')) {
    const authority = contract.commands.find(item => item.command_id === command.matched_command_id);
    assert.match(command.literal_word_encoding, /^[lensd]+$/u);
    assert.equal(command.rendered_event_command_digest, hash(artificialLiteralCommand(authority)));
    assert.notEqual(command.rendered_event_command_digest, authority.rendered_event_command_digest);
  }
  assert.ok(value.commands.filter(command => command.match_state === 'unmatched').every(command => command.literal_word_encoding === null));
  assert.ok(Object.values(value.privacy).every(flag => flag === false));
  assert.equal(JSON.stringify(value).includes(armRoot), false);
  assert.equal(JSON.stringify(value).includes(contract.commands[0].canonical_script), false);
});

const sample = 'node public-check.mjs "日本語 ! 🚀"';
for (const [label, script, word] of [
  ['single quote', sample, "'" + sample + "'"],
  ['double quote', sample, doubleWord(sample)],
  ['literal/quote concatenation', sample, 'node' + doubleWord(sample.slice(4).split('!')[0]) + "'!'" + doubleWord(sample.split('!')[1])],
  ['empty quote spans', sample, "''" + doubleWord(sample) + '""'],
  ['escaped code points and spaces', sample, [...sample].map(point => '\\' + point).join('')],
  ['escaped newline before and inside word', sample, '\\\n' + doubleWord(sample.slice(0, 4)) + '\\\n' + doubleWord(sample.slice(4))],
  ['double quote nonspecial backslash', 'node public-check.mjs x\\q', '"node public-check.mjs x\\q"'],
  ['double quote dollar/backtick/backslash escapes', 'node public-check.mjs "$VALUE" \u0060literal\u0060 \\', doubleWord('node public-check.mjs "$VALUE" \u0060literal\u0060 \\')],
  ['single quote protects expansions as literal bytes', 'node public-check.mjs "$VALUE" \u0060literal\u0060', '\'node public-check.mjs "$VALUE" \u0060literal\u0060\''],
  ['plain word', 'node', 'node'],
  ['unquoted Unicode points', 'node日本語🚀', 'node日本語🚀'],
]) test('AC5-1 finite word: ' + label, () => {
  const selected = oneContract(script), raw = '/bin/bash -lc ' + word;
  const value = build(wordEvents(raw), { contract: selected, candidateChanges: [] });
  assert.deepEqual(project(value, selected).succeeded_command_ids, [selected.commands[0].command_id]);
  assert.equal(value.commands[0].logical_command_digest, selected.commands[0].logical_command_digest);
  assert.equal(value.commands[0].rendered_event_command_digest, hash(raw));
});

const validWord = doubleWord(contract.commands[0].canonical_script);
for (const [label, word] of [
  ['extra word', validWord + ' extra'], ['extra command', validWord + '; pwd'], ['redirect', validWord + '>result'],
  ['pipe', validWord + '|cat'], ['background', validWord + '&'], ['comment', validWord + ' # extra'],
  ['variable expansion', '"$CHECK"'], ['command expansion', '"$(pwd)"'], ['backtick expansion', '"\u0060pwd\u0060"'],
  ['arithmetic expansion', '"$((1+1))"'], ['process substitution', '<(pwd)'], ['tilde', '~'],
  ['glob', '*'], ['brace expansion', '{a,b}'], ['ANSI-C quote', "$'node'"], ['unquoted bang', 'node!'],
  ['NUL in single quotes', "'node\0'"], ['NUL after slash', '"node\\\0"'], ['lone surrogate', "'node\ud800'"],
  ['unclosed single quote', "'node"], ['unclosed double quote', '"node'], ['trailing escape', 'node\\'],
  ['empty body', "''"], ['only escaped newline', '\\\n'], ['outer whitespace', ' ' + validWord],
]) test('AC5-2 refuses executable or malformed word: ' + label, () => {
  refused(wordEvents('/bin/bash -lc ' + word), undefined, { candidateChanges: [] });
});
for (const [label, raw] of [
  ['different shell', '/bin/zsh -lc ' + validWord], ['bash c', '/bin/bash -c ' + validWord],
  ['different flag order', '/bin/bash -cl ' + validWord], ['extra flag', '/bin/bash --noprofile -lc ' + validWord],
  ['nested shell', '/bin/bash -lc ' + doubleWord('/bin/bash -lc ' + validWord)],
  ['body one character', '/bin/bash -lc ' + doubleWord(contract.commands[0].canonical_script.replace('node -e', 'node -x'))],
  ['trailing body space', '/bin/bash -lc ' + doubleWord(contract.commands[0].canonical_script + ' ')],
  ['trailing body newline', '/bin/bash -lc ' + doubleWord(contract.commands[0].canonical_script + '\n')],
  ['external instruction read', "/bin/zsh -lc 'cat /outside/instructions/SKILL.md'"],
]) test('AC5-2 no authority from ' + label, () => {
  refused(wordEvents(raw), undefined, { candidateChanges: [] });
});
test('AC5-2 Unicode normalization and invalid UTF8 cannot change registered bytes', () => {
  const selected = oneContract('node check-é.mjs');
  refused(wordEvents('/bin/bash -lc ' + doubleWord('node check-e\u0301.mjs')), undefined, { contract: selected, candidateChanges: [] });
  const stream = Buffer.concat([Buffer.from('{"type":"'), Buffer.from([0xff]), Buffer.from('"}\n')]);
  assert.throws(() => build([], { stream }), error => error.code === 'malformed_jsonl');
});
for (const raw of ["/bin/zsh -lc 'pwd'", "/bin/bash -c 'rg --files'", "/bin/zsh -lc 'ls'"]) test('AC5-2 a different auxiliary envelope invalidates later success: ' + raw, () => {
  const events = combined(); events.splice(2, 0, ...artificialCommand(raw, 'artificial-other-envelope'));
  const value = refused(events, 'unsupported_shell');
  assert.equal(value.capture.downgrade_reason, 'capture_unsupported:unsupported_shell');
});

for (const [label, mutate, reason] of [
  ['missing start', events => events.splice(events.findIndex(event => event.type === 'item.started' && event.item?.id === 'artificial-check-0'), 1), 'completed_without_started'],
  ['command drift', events => { events.find(event => event.type === 'item.completed' && event.item?.id === 'artificial-check-0').item.command += ' '; }, 'command_drift'],
  ['ID reuse', events => events.splice(-1, 0, ...artificialCommand(artificialLiteralCommand(contract.commands[0]), 'artificial-check-0')), 'duplicate_item_id'],
  ['missing completion', events => events.splice(events.findIndex(event => event.type === 'item.completed' && event.item?.id === 'artificial-check-0'), 1), 'started_without_completed'],
  ['missing header', events => events.shift(), 'unsupported_event'],
  ['extra terminal', events => events.push(envelopeEnd()), 'duplicate_terminal_turn'],
  ['post-check edit', events => { const edit = events.splice(6, 2); events.splice(-1, 0, ...edit); }, 'unverified_file_change'],
  ['unexplained snapshot edit', events => events.splice(6, 2), 'unverified_file_change'],
  ['cross-arm edit', events => { for (const event of events) if (event.item?.type === 'file_change') event.item.changes[0].path = '/artificial/retained/arms/full_ask/' + path; }, 'unverified_file_change'],
  ['unknown side effect', events => events.splice(-1, 0, { type: 'item.completed', item: { id: 'artificial-opaque', type: 'mcp_tool_call' } }), 'unsupported_event'],
]) test('AC5-3 inherited lifecycle refuses ' + label, () => { const events = combined(); mutate(events); refused(events, reason); });

for (const cwd of ['not_required', 'runtime_observed']) test('AC5-3 new spellings cannot overlap the same check or authorize later edits: ' + cwd, () => {
  const selected = oneContract(contract.commands[0].canonical_script, { cwd });
  const first = artificialCommand(artificialLiteralCommand(selected.commands[0]), 'artificial-first');
  const second = artificialCommand(artificialLiteralCommand(selected.commands[0], { literalPrefix: true }), 'artificial-second');
  refused([...envelopeHeaders(), first[0], second[0], second[1], first[1], envelopeEnd()], 'overlapping_commands', { contract: selected, candidateChanges: [] });
  for (const [status, exit] of [['completed', 0], ['failed', 1], ['declined', null]]) {
    const pair = artificialCommand(artificialLiteralCommand(selected.commands[0]), 'artificial-before-edit', status, exit);
    refused([...envelopeHeaders(), ...pair, ...artificialEdit(path), envelopeEnd()], 'unverified_file_change', { contract: selected });
  }
});
test('AC5-3 failed exit1 and serial latest failure stay failure; absent checks stay Unknown', () => {
  const events = combined();
  events.splice(-1, 0, ...artificialCommand(artificialLiteralCommand(contract.commands[0]), 'artificial-later-failure', 'failed', 1));
  const result = project(build(events));
  assert.deepEqual(result.succeeded_command_ids, [contract.commands[1].command_id]); assert.deepEqual(result.failed_command_ids, [contract.commands[0].command_id]);
  assert.equal(result.references.at(-1).exit_code, 1); assert.equal(result.references.at(-1).outcome, 'failed');
  const absent = project(build([...envelopeHeaders(), envelopeEnd()], { candidateChanges: [] }));
  assert.deepEqual(absent.succeeded_command_ids, []); assert.deepEqual(absent.unavailable_command_ids, contract.commands.map(command => command.command_id));
});
test('AC5-5 exact trace closes cwd-unverified records and direct argv requires null', () => {
  const selected = oneContract(sample, { cwd: 'runtime_observed' });
  const value = build(wordEvents('/bin/bash -lc ' + doubleWord(sample)), { contract: selected, candidateChanges: [] });
  assert.equal(project(value, selected).cwd_unverified_command_count, 1); assert.deepEqual(project(value, selected).succeeded_command_ids, []);
  const forged = structuredClone(value); forged.commands[0].literal_word_encoding = null;
  assert.throws(() => project(reseal(forged), selected), /close to public authority/u);
  const direct = oneContract('node check.mjs', { direct: true });
  const plain = build(wordEvents('node check.mjs'), { contract: direct, candidateChanges: [] });
  assert.equal(plain.commands[0].literal_word_encoding, null); assert.equal(project(plain, direct).succeeded_command_ids.length, 1);
  plain.commands[0].literal_word_encoding = 'l'; assert.throws(() => project(reseal(plain), direct), /must not carry/u);
});
for (const [label, mutate] of [
  ['missing trace', value => { delete value.commands[2].literal_word_encoding; }],
  ['null trace', value => { value.commands[2].literal_word_encoding = null; }],
  ['unclosed quote trace', value => { value.commands[2].literal_word_encoding += 'd'; }],
  ['empty-prefix trace with unchanged raw digest', value => { value.commands[2].literal_word_encoding = 'ss' + value.commands[2].literal_word_encoding; }],
  ['expansion trace', value => { value.commands[2].literal_word_encoding = '$'; }],
  ['omitted public point', value => { value.commands[2].literal_word_encoding = 'dd'; }],
  ['raw digest', value => { value.commands[2].rendered_event_command_digest = digest; }],
  ['logical digest', value => { value.commands[2].logical_command_digest = digest; }],
  ['claimed different ID', value => { value.commands[2].matched_command_id = contract.commands[0].command_id; }],
  ['unmatched trace', value => { value.commands[0].literal_word_encoding = 'ss'; }],
]) test('AC5-5 resealed evidence cannot forge ' + label, () => {
  const value = build(combined()); mutate(value); assert.throws(() => project(reseal(value)));
});
test('AC5-5 independently changed body and manifest identity do not bypass closure', () => {
  const value = build(combined()), changed = oneContract(contract.commands[1].canonical_script + 'x');
  assert.throws(() => project(value, changed), /binding mismatch/u);
  value.commands[2].command_evidence_id = 'command-evidence-' + '0'.repeat(32);
  value.manifest_digest = canonicalDigest(omit(value, ['manifest_digest']));
  assert.throws(() => project(value), /identity mismatch/u);
});
test('AC5-6 v4 still refuses new literal spellings and v5 cannot validate as an older schema', () => {
  assert.throws(() => build(combined(), { parserRevision: '1.7.0-primary-saved' }), error => error.code === 'unsafe_command');
  const value = build(combined());
  for (const commandEvidenceParserRevision of ['1.4.0-primary-saved', '1.5.0-primary-saved', '1.6.0-primary-saved', '1.7.0-primary-saved']) {
    assert.throws(() => withPrimarySchemaBuild(() => evidence.validateCommandEvidenceManifest(value, { root, contract }), { commandEvidenceParserRevision }), /Schema/u);
  }
});

for (const kernelCondition of ['kernel_principles_v1', 'kernel_principles_v2']) for (const outcome of ['success', 'failure1', 'unknown']) test('AC5-4 public artificial producer/normalizer ' + kernelCondition + '/' + outcome, async t => {
  const source = syntheticPrimarySource(t, { command: 'missing', kernelCondition, mutate: true, nativeEvents: ({ armRoot, contract }) => {
    const events = artificialLiteralEnvelope({ contract, armRoot, path, status: outcome === 'failure1' ? 'failed' : 'completed', exit_code: outcome === 'failure1' ? 1 : 0 });
    if (outcome === 'unknown') events.splice(-1, 0, ...artificialCommand("/bin/zsh -lc 'node unknown-program.mjs'", 'artificial-unknown'));
    return events;
  } });
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'literal-v5'), { commandEvidenceParserRevision: revision });
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest }, verified = verifyPrimaryEvaluationProducer(options);
  assert.equal(verified.commandEvidenceParserRevision, revision); assert.equal(produced.model_calls, 0); assert.equal(produced.grader_process_starts, 0);
  for (const condition of ['plain', kernelCondition, 'full_ask']) {
    const { normalizedResult } = buildPrimaryEvaluationScoringInputs(options, { condition }), proof = normalizedResult.command_evidence;
    assert.ok(normalizedResult.lineage.terminal_workspace_tree_digest);
    assert.equal(proof.succeeded_command_ids.length, outcome === 'success' ? 2 : 0);
    assert.equal(proof.failed_command_ids.length, outcome === 'failure1' ? 2 : 0);
    assert.equal(proof.evidence_level, outcome === 'unknown' ? 'unavailable' : 'executed');
    for (const ref of proof.references.filter(ref => ref.command_id !== null)) {
      assert.match(ref.command_evidence_id, /^command-evidence-/u); assert.equal(ref.exit_code, outcome === 'failure1' ? 1 : 0);
      assert.ok(verified.inspection.cases.flatMap(item => item.attempts).some(attempt => attempt.commandEvidence.commands.some(command => command.command_evidence_digest === ref.digest)));
    }
  }
  const manifestPath = join(produced.output_root, 'producer.json'), manifest = JSON.parse(readFileSync(manifestPath));
  assert.equal(manifest.kind, 'ask_primary_evaluation_producer_v5'); manifest.command_evidence_parser_revision = '1.7.0-primary-saved';
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
  assert.throws(() => verifyPrimaryEvaluationProducer({ recordRoot: produced.output_root, externalDigest: hash(readFileSync(manifestPath)) }), /primary v5 parser revision changed/u);
  const rejected = join(source.root, 'override');
  await assert.rejects(producePrimaryEvaluationArtifacts(source.block, rejected, { commandEvidenceParserRevision: revision, candidateChanges: [] }), /context override/u);
  assert.equal(existsSync(rejected), false);
});
