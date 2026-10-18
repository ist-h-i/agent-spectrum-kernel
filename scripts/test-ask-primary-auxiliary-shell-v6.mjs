// Public contracts and independently authored artificial captures only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import { withPrimarySchemaBuild } from './ask-primary-evaluation-scope.mjs';
import { canonicalDigest } from './content-addressed-store.mjs';
import { artificialAuxiliaryEnvelope } from './test-helpers-primary-auxiliary-shell-v6.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';

const root = resolve(import.meta.dirname, '..'), revision = '1.9.0-primary-saved';
const base = join(root, 'benchmarks/fixtures/checkpoint-b2/mn-build-option-update');
const input = readFileSync(join(base, 'input-manifest.json'));
const contract = JSON.parse(readFileSync(join(base, 'verification-command-contract.json')));
const digest = 'sha256:' + 'b'.repeat(64), armRoot = '/artificial/v6/arms/plain', path = 'workspace/build.config.json';
const identity = { run_instance_id: '56789012-3456-4345-8345-345678901abc', case_id: 'case-7777777777777777-8888888888888888', attempt: '0001', adapter: 'codex',
  condition: 'plain', fixture_id: contract.fixture_id, repetition: 1, fixture_input_digest: contract.fixture_input_digest,
  verification_command_contract_digest: contract.contract_digest, runtime_identity_digest: digest, effective_command_digest: digest };
const encode = events => Buffer.from(events.map(value => JSON.stringify(value)).join('\n') + '\n');
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const events = () => artificialAuxiliaryEnvelope({ contract, armRoot });
function build(value, options = {}) {
  return evidence.buildCodexCommandEvidence({ identity, stream: encode(value), contract, parserRevision: revision,
    candidateChangePaths: [path], candidateChanges: [{ path, kind: 'update' }], candidateWorkspaceRoot: armRoot,
    auxiliaryReadInputManifest: input, ...options });
}
function project(value, selected = contract) {
  return withPrimarySchemaBuild(() => evidence.projectVerifiedCommandEvidence({
    manifest: evidence.validateCommandEvidenceManifest(value, { root, contract: selected }), contract: selected,
  }), { commandEvidenceParserRevision: revision });
}
test('AC6-2/3/6 artificial zsh reads, scoped edit and two literal Bash checks close together', () => {
  const manifest = build(events()), result = project(manifest);
  assert.equal(manifest.capture.parser_revision, revision);
  assert.equal(manifest.capture.failure_diagnostic, null);
  assert.equal(result.unmatched_command_count, 3);
  assert.deepEqual(result.succeeded_command_ids, contract.commands.map(command => command.command_id));
  for (const command of manifest.commands.filter(value => value.match_state === 'matched')) assert.match(command.literal_word_encoding, /^[lensd]+$/u);
  assert.ok(manifest.commands.filter(value => value.match_state === 'unmatched').every(value => value.literal_word_encoding === null));
  assert.ok(manifest.commands.every(value => value.working_directory.status === 'unavailable' && value.working_directory.value === null));
  assert.equal(JSON.stringify(manifest).includes(armRoot), false);
  assert.equal(JSON.stringify(manifest).includes('new artificial saved output'), false);
});
test('AC6-1 v5 retains whole-capture refusal of the same artificial foreign auxiliary shell', () => {
  assert.throws(() => build(events(), { parserRevision: '1.8.0-primary-saved' }), error => error.code === 'unsupported_shell');
});

const quotedWord = value => '"' + value.replace(/[\\"$`]/gu, point => '\\' + point) + '"';
function replaceRead(value, raw) {
  for (const event of value) if (event.item?.id === 'artificial-v6-cat') event.item.command = raw;
  return value;
}
function unavailable(value, reason, options = {}) {
  let error; try { build(value, options); } catch (caught) { error = caught; }
  assert.ok(error, 'the complete artificial capture must refuse'); assert.equal(error.code, reason);
  const failure = evidence.commandEvidenceFailureDiagnostic(error, { parserRevision: revision });
  const manifest = evidence.buildUnavailableCommandEvidence({ identity: options.identity ?? identity, support: 'supported', probe: 'capture_invalid',
    reason: evidence.commandEvidenceFailureReason(error, { parserRevision: revision }), stream: options.stream ?? encode(value), parserRevision: revision, failureDiagnostic: failure });
  assert.equal(manifest.command_event_count, 0); assert.deepEqual(manifest.commands, []);
  assert.deepEqual(project(manifest, options.contract ?? contract).succeeded_command_ids, []);
  return { manifest, failure };
}
for (const script of [
  'pwd', 'cat task.md', "cat -- 'task.md' workspace/build.config.json", 'cat "workspace/docs/build-options.md"',
  'rg --files', "rg --files -g '*.json' -- workspace", 'rg --files -g "*.md" -- .',
]) for (const shell of ['/bin/zsh -lc ', '/bin/bash -lc ']) test('AC6-3 exact auxiliary effect/path/syntax: ' + shell + script, () => {
  const manifest = build(replaceRead(events(), shell + quotedWord(script)));
  assert.equal(project(manifest).unmatched_command_count, 3);
});
for (const [script, reason] of [
  ['cat AGENTS.md', 'auxiliary_read_path_unavailable'], ['cat workspace/AGENTS.md', 'auxiliary_read_path_unavailable'],
  ['cat workspace/../task.md', 'auxiliary_read_path_unavailable'], ['cat /outside/SKILL.md', 'unsupported_command'],
  ['cat ./task.md', 'auxiliary_read_path_unavailable'], ['cat -- -', 'unsupported_command'],
  ['rg --files -- ../outside', 'auxiliary_read_path_unavailable'], ['rg --files -- workspace/unknown', 'auxiliary_read_path_unavailable'],
  ['rg --files --hidden', 'unsupported_command'], ['rg --files --no-ignore', 'unsupported_command'],
  ['rg --files -g *.md', 'unsupported_command'], ['rg --files -g "!*.md"', 'unsupported_command'],
  ["rg --files -g '../*'", 'unsupported_command'], ["rg --files -g '/outside/*'", 'unsupported_command'],
  ['find . -name AGENTS.md -print', 'unsupported_command'], ['ls workspace', 'unsupported_command'],
  ['pwd && cat task.md', 'unsafe_command'], ['pwd; pwd', 'unsafe_command'], ['cat task.md > result', 'unsafe_command'],
  ['cat $TARGET', 'unsafe_command'], ['cat $(pwd)', 'unsafe_command'], ['cat `pwd`', 'unsafe_command'],
  ['cat task.md\nnode other.mjs', 'unsafe_command'], ['node unknown.mjs', 'unsupported_command'],
]) test('AC6-3 unknown or additional auxiliary effect stays unavailable: ' + script, () => {
  const value = replaceRead(events(), '/bin/zsh -lc ' + quotedWord(script));
  const { failure } = unavailable(value, reason);
  assert.equal(failure.line, 5); assert.equal(failure.event_type, 'item.started');
  assert.equal(failure.runtime_item_id_digest, hash('artificial-v6-cat'));
  assert.equal(failure.rendered_event_command_digest, hash(value[4].item.command));
  assert.equal(failure.event_line_digest, hash(JSON.stringify(value[4])));
  assert.equal(JSON.stringify(failure).includes(script), false);
});
for (const [name, raw] of [
  ['public body under zsh', '/bin/zsh -lc ' + quotedWord(contract.commands[0].canonical_script)],
  ['Bash-c', '/bin/bash -c "cat task.md"'], ['other flag', '/bin/zsh -cl "cat task.md"'],
  ['extra flag', '/bin/zsh --no-rcs -lc "cat task.md"'],
]) test('AC6-2 a different public envelope cannot be salvaged as an auxiliary read: ' + name, () => {
  unavailable(replaceRead(events(), raw), 'unsupported_shell');
});
for (const word of ['"cat task.md" extra', '"$CHECK"', '"$(pwd)"', '"`pwd`"', "'cat task.md", "''", "'cat task.md\0'"])
  test('AC6-2/3 outer literal grammar refuses malformed/expanded/extra words: ' + JSON.stringify(word), () => {
    assert.throws(() => build(replaceRead(events(), '/bin/zsh -lc ' + word)), error => ['ambiguous_shell_word', 'malformed_shell_envelope'].includes(error.code));
  });
test('AC6-4 auxiliary scope must close to public manifest bytes and exact original root context', () => {
  for (const options of [
    { auxiliaryReadInputManifest: null }, { auxiliaryReadInputManifest: Buffer.from('{}') },
    { auxiliaryReadInputManifest: Buffer.concat([input, Buffer.from('\n')]) }, { candidateWorkspaceRoot: null },
  ]) unavailable(events(), 'auxiliary_read_context_unavailable', options);
});
test('AC6-2 even a public body that is a finite read cannot be rescued under zsh', () => {
  const selected = structuredClone(contract); selected.commands = [selected.commands[0]];
  const command = selected.commands[0]; command.canonical_script = 'cat task.md';
  command.logical_command_digest = evidence.logicalCommandDigest(command);
  command.rendered_event_command_digest = evidence.renderedEventCommandDigest(command);
  command.command_contract_digest = evidence.computeCommandContractDigest(command);
  selected.contract_digest = evidence.computeVerificationCommandContractDigest(selected);
  evidence.validateVerificationCommandContract(selected, { root });
  const value = prefix => [{ type: 'thread.started', thread_id: 'new-artificial-read-authority-thread' }, { type: 'turn.started' },
    { type: 'item.started', item: { id: 'new-artificial-read-authority', type: 'command_execution', command: prefix + '"cat task.md"', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'new-artificial-read-authority', type: 'command_execution', command: prefix + '"cat task.md"', status: 'completed', exit_code: 0, aggregated_output: 'artificial only' } },
    { type: 'turn.completed' }];
  const options = { contract: selected, identity: { ...identity, verification_command_contract_digest: selected.contract_digest }, candidateChanges: [] };
  assert.deepEqual(project(build(value('/bin/bash -lc '), options), selected).succeeded_command_ids, [command.command_id]);
  unavailable(value('/bin/zsh -lc '), 'unsupported_shell', options);
});
test('AC6-5 no-local-event failures keep all locators null', () => {
  const value = events(); value.pop();
  const { failure } = unavailable(value, 'missing_terminal_turn');
  assert.deepEqual(Object.values(failure).filter(item => item !== null), ['missing_terminal_turn']);
  const missing = unavailable(events(), 'auxiliary_read_context_unavailable', { auxiliaryReadInputManifest: Buffer.from('{}') }).failure;
  assert.deepEqual(Object.values(missing).filter(item => item !== null), ['auxiliary_read_context_unavailable']);
  const truncated = unavailable(events(), 'stream_truncated', { stream: encode(events()).subarray(0, -1) }).failure;
  assert.deepEqual(Object.values(truncated).filter(item => item !== null), ['stream_truncated']);
});
test('AC6-5 a newly authored malformed word identifies its own original line and invocation digest', () => {
  const value = replaceRead(events(), "/bin/zsh -lc 'cat task.md");
  const { failure } = unavailable(value, 'malformed_shell_envelope');
  assert.equal(failure.line, 5); assert.equal(failure.event_type, 'item.started');
  assert.equal(failure.rendered_event_command_digest, hash(value[4].item.command));
  assert.equal(failure.event_line_digest, hash(JSON.stringify(value[4])));
});
test('AC6-5 unknown event type is never copied into diagnostics and later checks do not repair it', () => {
  const value = events(), secretType = 'unknown-event-with-private-text';
  value.splice(-1, 0, { type: secretType });
  const { failure, manifest } = unavailable(value, 'unsupported_event');
  assert.equal(failure.line, value.length - 1); assert.equal(failure.event_type, null);
  assert.equal(JSON.stringify(manifest).includes(secretType), false);
});
test('AC6-5 completion drift diagnoses actual completion bytes; failure diagnostics cannot alter reason/location semantics', () => {
  const value = events(); value[5].item.command += ' ';
  const { failure, manifest } = unavailable(value, 'command_drift');
  assert.equal(failure.line, 6); assert.equal(failure.rendered_event_command_digest, hash(value[5].item.command));
  const reseal = object => { const base = { ...object }; delete base.manifest_digest; object.manifest_digest = canonicalDigest(base); return object; };
  const forged = structuredClone(manifest); forged.capture.failure_diagnostic.event_type = 'arbitrary-private-text';
  assert.throws(() => project(reseal(forged)));
  const reasonDrift = structuredClone(manifest); reasonDrift.capture.failure_diagnostic.reason = 'unsupported_command';
  assert.throws(() => project(reseal(reasonDrift)), /diagnostic reason differs/u);
  const nonLocal = structuredClone(manifest); nonLocal.capture.failure_diagnostic.line = null;
  assert.throws(() => project(reseal(nonLocal)), /non-local failure/u);
  const accepted = build(events()); accepted.capture.failure_diagnostic = structuredClone(failure);
  assert.throws(() => project(reseal(accepted)), /executed capture cannot carry/u);
  assert.equal(evidence.commandEvidenceFailureDiagnostic(new Error('private message and stack'), { parserRevision: '1.8.0-primary-saved' }), null);
  assert.equal(JSON.stringify(evidence.commandEvidenceFailureDiagnostic(new Error('private message and stack'), { parserRevision: revision })).includes('private'), false);
});

test('AC6-1 earlier wire bytes retain the independently observed main253100e artificial golden values', () => {
  const command = evidence.renderCommandEvent(contract.commands[0]);
  const value = [{ type: 'thread.started', thread_id: 'fresh-artificial-golden-thread' }, { type: 'turn.started' },
    { type: 'item.started', item: { id: 'fresh-artificial-golden-check', type: 'command_execution', command, status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'fresh-artificial-golden-check', type: 'command_execution', command, status: 'completed', exit_code: 0, aggregated_output: 'fresh artificial golden output' } },
    { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }];
  const golden = {
    '1.3.0': 'c750ba1e19f60a3bb44a6389c5737a4b952a1a3d5f4c32c79b2cab284438150e',
    '1.4.0-primary-saved': 'a4cd9c33187ab6df0484e1519d08fc032d18c905638ef6f9cbda246ccd7197c7',
    '1.5.0-primary-saved': 'dfb2aba9505ba026bf4522a7cd17ef691751ba28ad42365002efbf68788ea29a',
    '1.6.0-primary-saved': 'e09f2389f7572d0b5f704c1638ba7ffebb37953a5ea077c620f627406172063f',
    '1.7.0-primary-saved': '4ed99525b5e389343e0af414fd5e7efe7b256ab5646a2f1da41b585894010873',
    '1.8.0-primary-saved': '91a4dc768e426e4f3df4b4df7d25069e1c6ce2b2423725a7c5c4d103ea7a2664',
  };
  for (const [parserRevision, digest] of Object.entries(golden)) {
    const manifest = evidence.buildCodexCommandEvidence({ identity, stream: encode(value), contract, parserRevision });
    assert.equal(hash(JSON.stringify(manifest) + '\n'), 'sha256:' + digest);
    assert.equal(Object.hasOwn(manifest.capture, 'failure_diagnostic'), false);
  }
});
test('AC6-1/2 v6 wire and literal authority cannot validate under an older selected schema', () => {
  const value = build(events());
  for (const commandEvidenceParserRevision of ['1.5.0-primary-saved', '1.6.0-primary-saved', '1.7.0-primary-saved', '1.8.0-primary-saved'])
    assert.throws(() => withPrimarySchemaBuild(() => evidence.validateCommandEvidenceManifest(value, { root, contract }), { commandEvidenceParserRevision }), /Schema/u);
});
for (const kernelCondition of ['kernel_principles_v1', 'kernel_principles_v2']) for (const outcome of ['success', 'failure1', 'unknown'])
  test('AC6-4/5/6 artificial producer-normalizer and original read scope: ' + kernelCondition + '/' + outcome, async t => {
    const source = syntheticPrimarySource(t, { command: 'missing', kernelCondition, mutate: true, nativeEvents: ({ armRoot, contract }) => {
      const value = artificialAuxiliaryEnvelope({ contract, armRoot, status: outcome === 'failure1' ? 'failed' : 'completed', exit_code: outcome === 'failure1' ? 1 : 0 });
      if (outcome === 'unknown') replaceRead(value, '/bin/zsh -lc "cat AGENTS.md"');
      return value;
    } });
    const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'auxiliary-v6'), { commandEvidenceParserRevision: revision });
    const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest }, verified = verifyPrimaryEvaluationProducer(options);
    assert.equal(verified.commandEvidenceParserRevision, revision);
    assert.equal(produced.model_calls, 0); assert.equal(produced.grader_process_starts, 0);
    for (const condition of ['plain', kernelCondition, 'full_ask']) {
      const { normalizedResult } = buildPrimaryEvaluationScoringInputs(options, { condition }), proof = normalizedResult.command_evidence;
      assert.equal(proof.succeeded_command_ids.length, outcome === 'success' ? 2 : 0);
      assert.equal(proof.failed_command_ids.length, outcome === 'failure1' ? 2 : 0);
      assert.equal(proof.evidence_level, outcome === 'unknown' ? 'unavailable' : 'executed');
      for (const ref of proof.references.filter(ref => ref.command_id !== null)) {
        assert.equal(ref.exit_code, outcome === 'failure1' ? 1 : 0);
        assert.ok(verified.inspection.cases.flatMap(item => item.attempts).some(attempt => attempt.commandEvidence.commands.some(command => command.command_evidence_digest === ref.digest)));
      }
    }
    for (const attempt of verified.inspection.cases.flatMap(item => item.attempts)) {
      const capture = attempt.commandEvidence.capture;
      assert.equal(capture.failure_diagnostic?.reason ?? null, outcome === 'unknown' ? 'auxiliary_read_path_unavailable' : null);
      if (outcome === 'unknown') { assert.equal(capture.failure_diagnostic.line, 5); assert.deepEqual(attempt.commandEvidence.commands, []); }
    }
    const manifestPath = join(produced.output_root, 'producer.json'), manifestBytes = readFileSync(manifestPath), manifest = JSON.parse(manifestBytes);
    if (outcome === 'unknown' && kernelCondition === 'kernel_principles_v1') {
      // A schema-valid locator and freshly pinned shallow digests cannot replace
      // the observation re-derived from the original artificial stream.
      const path = Object.keys(manifest.artifact_inventory).find(path => path.endsWith('/command-evidence.json'));
      assert.ok(path);
      const capturePath = join(produced.output_root, path), original = readFileSync(capturePath), forged = JSON.parse(original);
      assert.equal(forged.capture.failure_diagnostic.line, 5); forged.capture.failure_diagnostic.line = 6;
      delete forged.manifest_digest; forged.manifest_digest = canonicalDigest(forged);
      const changed = Buffer.from(JSON.stringify(forged) + '\n'), repinned = structuredClone(manifest);
      repinned.artifact_inventory[path].bytes = changed.length; repinned.artifact_inventory[path].digest = hash(changed);
      try {
        writeFileSync(capturePath, changed); writeFileSync(manifestPath, JSON.stringify(repinned) + '\n');
        assert.throws(() => verifyPrimaryEvaluationProducer({ recordRoot: produced.output_root, externalDigest: hash(readFileSync(manifestPath)) }), /primary derived record changed/u);
      } finally { writeFileSync(capturePath, original); writeFileSync(manifestPath, manifestBytes); }
    }
    assert.equal(manifest.kind, 'ask_primary_evaluation_producer_v6'); manifest.command_evidence_parser_revision = '1.8.0-primary-saved';
    writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
    assert.throws(() => verifyPrimaryEvaluationProducer({ recordRoot: produced.output_root, externalDigest: hash(readFileSync(manifestPath)) }), /primary v6 parser revision changed/u);
    const target = join(source.root, 'context-override');
    await assert.rejects(producePrimaryEvaluationArtifacts(source.block, target, { commandEvidenceParserRevision: revision, auxiliaryReadInputManifest: input }), /context override/u);
    assert.equal(existsSync(target), false);
  });
