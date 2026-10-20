// Public contracts and newly authored anonymous events. Nothing is executed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import { withPrimarySchemaBuild } from './ask-primary-evaluation-scope.mjs';
import { artificialAuxiliaryEnvelope } from './test-helpers-primary-auxiliary-shell-v6.mjs';
import { canonicalDigest, stableCanonicalJson } from './ask-benchmark-materialize.mjs';
import { envelopeHeaders, envelopeEnd, artificialCommand } from './test-helpers-primary-command-envelope-v4.mjs';

const root = resolve(import.meta.dirname, '..'), revision = '1.10.0-primary-saved';
const base = join(root, 'benchmarks/fixtures/checkpoint-b2/mn-build-option-update');
const contract = JSON.parse(readFileSync(join(base, 'verification-command-contract.json')));
const digest = 'sha256:' + 'd'.repeat(64), armRoot = '/artificial/v7/arms/plain';
const identity = { run_instance_id: '67890123-4567-4456-8456-456789012abc', case_id: 'case-8888888888888888-9999999999999999', attempt: '0001', adapter: 'codex',
  condition: 'plain', fixture_id: contract.fixture_id, repetition: 1, fixture_input_digest: contract.fixture_input_digest,
  verification_command_contract_digest: contract.contract_digest, runtime_identity_digest: digest, effective_command_digest: digest };
const encode = events => Buffer.from(events.map(value => JSON.stringify(value)).join('\n') + '\n');
function events(shell = '/bin/bash') {
  const list = artificialAuxiliaryEnvelope({ contract, armRoot });
  for (const event of list) if (event.item?.id.startsWith('artificial-v6-check-')) event.item.command = event.item.command.replace(/^\/bin\/bash/u, shell);
  return list;
}
function build(stream, parserRevision = revision, selected = contract, changes = [{ path: 'workspace/build.config.json', kind: 'update' }]) {
  return evidence.buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: selected.contract_digest }, stream: Buffer.isBuffer(stream) ? stream : encode(stream), contract: selected, parserRevision,
    candidateChangePaths: changes.map(value => value.path), candidateChanges: changes,
    candidateWorkspaceRoot: armRoot, auxiliaryReadInputManifest: readFileSync(join(base, 'input-manifest.json')) });
}
function project(manifest, selected = contract) {
  return withPrimarySchemaBuild(() => evidence.projectVerifiedCommandEvidence({
    manifest: evidence.validateCommandEvidenceManifest(manifest, { root, contract: selected }), contract: selected,
  }), { commandEvidenceParserRevision: revision });
}
for (const shell of ['/bin/bash', '/bin/zsh']) test('O7-RUNTIME actual shell witness closes the exact body: ' + shell, () => {
  const manifest = build(events(shell));
  assert.deepEqual(project(manifest).succeeded_command_ids, contract.commands.map(value => value.command_id));
  for (const command of manifest.commands.filter(value => value.match_state === 'matched')) {
    assert.equal(command.runtime_shell_executable, shell);
    assert.match(command.literal_word_encoding, /^[lensd]+$/u);
  }
  assert.equal(JSON.stringify(manifest).includes(armRoot), false);
});
test('O7-OLD v6 still refuses the same public check under zsh', () => {
  assert.throws(() => build(events('/bin/zsh'), '1.9.0-primary-saved'), error => error.code === 'unsupported_shell');
});
for (const shell of ['/bin/bash', '/bin/zsh']) test('O7-RUNTIME exit failure stays failure despite success text: ' + shell, () => {
  const list = events(shell);
  for (const event of list) if (event.type === 'item.completed' && event.item?.id === 'artificial-v6-check-0') {
    event.item.status = 'failed'; event.item.exit_code = 1; event.item.aggregated_output = 'validation: pass';
  }
  assert.deepEqual(project(build(list)).failed_command_ids, [contract.commands[0].command_id]);
});
for (const change of ['shell', 'flag', 'body', 'missing_terminal', 'duplicate_terminal']) test('O7-RUNTIME changed or ambiguous runtime cannot pass: ' + change, () => {
  const list = events('/bin/zsh');
  for (const event of list) if (event.item?.id === 'artificial-v6-check-0') {
    if (change === 'shell') event.item.command = event.item.command.replace('/bin/zsh', '/bin/sh');
    if (change === 'flag') event.item.command = event.item.command.replace(' -lc ', ' -c ');
    if (change === 'body') event.item.command += ' && echo pass';
  }
  if (change === 'missing_terminal') list.pop();
  if (change === 'duplicate_terminal') list.push(list.at(-1));
  assert.throws(() => build(list), /shell|literal|unsupported|unsafe|terminal|completion|activity|stream|processing|revision/u);
});
for (const change of ['witness', 'missing_witness', 'null_witness', 'unsupported_witness', 'digest', 'trace']) test('O7-RUNTIME forged persisted witness fails public authority closure: ' + change, () => {
  const manifest = build(events('/bin/zsh'));
  const command = manifest.commands.find(value => value.match_state === 'matched');
  if (change === 'witness') command.runtime_shell_executable = '/bin/bash';
  if (change === 'missing_witness') delete command.runtime_shell_executable;
  if (change === 'null_witness') command.runtime_shell_executable = null;
  if (change === 'unsupported_witness') command.runtime_shell_executable = '/bin/sh';
  if (change === 'digest') command.rendered_event_command_digest = digest;
  if (change === 'trace') command.literal_word_encoding = 's';
  // Deliberately recompute non-authoritative wrappers; the public body/trace/
  // actual rendered digest must still refuse a self-consistent forgery.
  const { command_evidence_id: ignoredId, command_evidence_digest: ignoredDigest, bytes: ignoredBytes, ...body } = command;
  const command_evidence_digest = canonicalDigest({ ...identity, ...body });
  const command_evidence_id = `command-evidence-${command_evidence_digest.slice(7, 39)}`;
  Object.assign(command, { command_evidence_id, command_evidence_digest, bytes: Buffer.byteLength(stableCanonicalJson({ command_evidence_id, command_evidence_digest, ...body })) });
  const { manifest_digest: ignoredManifestDigest, ...manifestBody } = manifest;
  manifest.manifest_digest = canonicalDigest(manifestBody);
  assert.throws(() => project(manifest), /digest|bytes|authority|witness|shell|encoding|trace|required|enum/u);
});
function artificialContract({ direct = false, cwd = 'not_required' } = {}) {
  const selected = structuredClone(contract), command = selected.commands[0]; selected.commands = [command];
  command.working_directory.evidence_requirement = cwd;
  if (direct) Object.assign(command, { execution_form: 'direct_argv', safe_argv: ['node', 'public-check.mjs'], canonical_script: null, shell_family: null, shell_envelope: null });
  command.logical_command_digest = evidence.logicalCommandDigest(command); command.rendered_event_command_digest = evidence.renderedEventCommandDigest(command);
  command.command_contract_digest = evidence.computeCommandContractDigest(command); selected.contract_digest = evidence.computeVerificationCommandContractDigest(selected);
  return evidence.validateVerificationCommandContract(selected, { root });
}
test('O7-RUNTIME direct argv has a null witness', () => {
  const selected = artificialContract({ direct: true });
  const manifest = build([...envelopeHeaders(), ...artificialCommand(evidence.renderCommandEvent(selected.commands[0]), 'artificial-direct'), envelopeEnd()], revision, selected, []);
  assert.equal(manifest.commands[0].runtime_shell_executable, null);
  assert.deepEqual(project(manifest, selected).succeeded_command_ids, [selected.commands[0].command_id]);
});
test('O7-RUNTIME a shell witness does not establish the working directory', () => {
  const selected = artificialContract({ cwd: 'runtime_observed' });
  const manifest = build([...envelopeHeaders(), ...artificialCommand(evidence.renderCommandEvent(selected.commands[0]).replace('/bin/bash', '/bin/zsh'), 'artificial-cwd'), envelopeEnd()], revision, selected, []);
  assert.equal(manifest.commands[0].runtime_shell_executable, '/bin/zsh');
  assert.deepEqual(project(manifest, selected).succeeded_command_ids, []); assert.equal(project(manifest, selected).cwd_unverified_command_count, 1);
});
for (const word of ['"$(echo pass)"', '"${CHECK}"', "'body' 'extra'", '"`echo pass`"']) test('O7-RUNTIME dynamic or multiple shell words refuse: ' + word, () => {
  assert.throws(() => build([...envelopeHeaders(), ...artificialCommand('/bin/zsh -lc ' + word, 'artificial-dynamic'), envelopeEnd()]), /literal|shell|word|expansion|command/u);
});
