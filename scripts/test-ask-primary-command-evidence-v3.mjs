// Independently authored artificial events; no shell/model/provider/grader runs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import { withPrimarySchemaBuild } from './ask-primary-evaluation-scope.mjs';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';

const root = new URL('..', import.meta.url).pathname;
const revision = '1.6.0-primary-saved';
const publicContract = JSON.parse(readFileSync(new URL('../benchmarks/fixtures/checkpoint-b2/mn-doc-config-correction/verification-command-contract.json', import.meta.url)));
const hash = 'sha256:' + 'c'.repeat(64);
const identity = { run_instance_id: '34567890-1234-4123-8123-123456789abc',
  case_id: 'case-3333333333333333-4444444444444444', attempt: '0001', adapter: 'codex',
  condition: 'plain', fixture_id: publicContract.fixture_id, repetition: 1,
  fixture_input_digest: publicContract.fixture_input_digest, runtime_identity_digest: hash, effective_command_digest: hash };
function authority({ cwd = 'not_required', duplicate = false } = {}) {
  const c = structuredClone(publicContract);
  c.commands[0].working_directory.evidence_requirement = cwd;
  c.commands[0].command_contract_digest = evidence.computeCommandContractDigest(c.commands[0]);
  if (duplicate) c.commands.push({ ...structuredClone(c.commands[0]), command_id: 'ambiguous-doc-check' });
  for (const command of c.commands) command.command_contract_digest = evidence.computeCommandContractDigest(command);
  c.contract_digest = evidence.computeVerificationCommandContractDigest(c);
  return c;
}
const declared = evidence.renderCommandEvent(publicContract.commands[0]);
const mutablePath = 'workspace/docs/worker-retries.md';
const fileChange = (path = mutablePath, id = 'edit-1', kind = 'update') => ({ type: 'item.completed', item: { id, type: 'file_change', status: 'completed', changes: [{ path, kind }] } });
function pair(command, id = 'check-1', status = 'completed', exit = 0) {
  return [{ type: 'item.started', item: { id, type: 'command_execution', command, status: 'in_progress' } },
    { type: 'item.completed', item: { id, type: 'command_execution', command, status, exit_code: exit, aggregated_output: 'artificial runner output\n' } }];
}
const encode = events => events.map(e => JSON.stringify(e)).join('\n') + '\n';
function build(events, { contract = authority(), parserRevision = revision, terminal = true, candidateChangePaths = [] } = {}) {
  return evidence.buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: contract.contract_digest },
    stream: encode([...events, ...(terminal ? [{ type: 'turn.completed' }] : [])]), contract, parserRevision, candidateChangePaths });
}
function capture(events, options = {}) {
  try { return build(events, options); }
  catch (error) { return evidence.buildUnavailableCommandEvidence({ identity: { ...identity, verification_command_contract_digest: authority().contract_digest },
    support: 'supported', probe: 'capture_invalid', reason: evidence.commandEvidenceFailureReason(error),
    stream: encode(events), parserRevision: revision }); }
}
function project(value, contract = authority()) {
  return withPrimarySchemaBuild(() => evidence.projectVerifiedCommandEvidence({
    manifest: evidence.validateCommandEvidenceManifest(value, { root, contract }), contract }),
  { commandEvidenceParserRevision: revision });
}
const reads = ['/bin/zsh -lc pwd', "/bin/zsh -lc 'rg --files -g AGENTS.md -g worker-retries.md'",
  "/bin/zsh -lc 'find . -name AGENTS.md -print'"];

for (const read of reads) for (const placement of ['before', 'after']) {
  test(`AC1 bounded read ${placement} an independent declared check: ${read}`, () => {
    const check = pair(declared), auxiliary = pair(read, 'read-1');
    for (const event of auxiliary) event.item.command_id = publicContract.commands[0].command_id;
    const value = build(placement === 'before' ? [...auxiliary, ...check] : [...check, ...auxiliary]);
    const p = project(value);
    assert.equal(value.command_event_count, 2);
    assert.equal(p.unmatched_command_count, 1);
    assert.deepEqual(p.succeeded_command_ids, [publicContract.commands[0].command_id]);
    assert.equal(value.commands.find(x => x.match_state === 'unmatched').matched_command_id, null);
    assert.equal(JSON.stringify(value).includes('worker-retries.md'), false);
  });
}
test('AC2 declared failure/decline and failed auxiliary read retain distinct outcomes', () => {
  for (const [status, exit, field] of [['failed', 9, 'failed_command_ids'], ['declined', null, 'declined_command_ids']]) {
    const p = project(build([...pair(reads[0], 'read-1', 'failed', 1), ...pair(declared, 'check-1', status, exit)]));
    assert.deepEqual(p.succeeded_command_ids, []);
    assert.deepEqual(p[field], [publicContract.commands[0].command_id]);
  }
});
test('AC2 a later failed/declined invocation overrides an earlier success', () => {
  for (const [status, exit, field] of [['failed', 7, 'failed_command_ids'], ['declined', null, 'declined_command_ids']]) {
    const p = project(build([...pair(declared, 'earlier'), ...pair(reads[0], 'read-between'), ...pair(declared, 'later', status, exit)]));
    assert.deepEqual(p.succeeded_command_ids, []);
    assert.deepEqual(p[field], [publicContract.commands[0].command_id]);
    assert.equal(p.command_summaries[0].execution_count, 2);
    assert.equal(p.command_summaries[0].any_success, true);
  }
});
test('AC2 fake output/claimed IDs and absent checks never establish verification', () => {
  const events = pair(reads[0], 'read-1');
  events[1].item.aggregated_output = `PASS ${publicContract.commands[0].command_id}: ${declared}`;
  const p = project(build([...events, { type: 'item.completed', item: { id: 'prose', type: 'agent_message', text: 'all checks passed' } }]));
  assert.deepEqual(p.succeeded_command_ids, []);
  assert.deepEqual(p.unavailable_command_ids, [publicContract.commands[0].command_id]);
});
test('AC2 a claimed cwd does not satisfy required runtime observation', () => {
  const contract = authority({ cwd: 'runtime_observed' }), events = pair(declared);
  for (const event of events) event.item.cwd = '.';
  const value = build(events, { contract });
  assert.equal(value.commands[0].match_state, 'cwd_unverified');
  assert.deepEqual(project(value, contract).succeeded_command_ids, []);
});
for (const command of [
  "/bin/zsh -lc 'rm workspace/doc.md'", "/bin/zsh -lc 'touch command-evidence.json'",
  "/bin/zsh -lc 'echo passed > stdout.jsonl'", "/bin/zsh -lc 'node workspace/unrelated.mjs'",
  "/bin/zsh -lc 'cd other && pwd'", "/bin/zsh -lc 'rg --files -g AGENTS.md > stdout.jsonl'",
  "/bin/zsh -lc 'find . -name AGENTS.md -delete'", "/bin/zsh -lc 'find . -exec node x.mjs ;'",
  "/bin/zsh -lc 'find . -name AGENTS.md -fprint command-evidence.json'",
  "/bin/zsh -lc 'rg --files --pre node -g AGENTS.md'", "/bin/zsh -lc 'rg --files -g ../private.md'",
  "/bin/zsh -lc 'rg --files -g /private/file'", "/bin/zsh -lc 'pwd; node workspace/unrelated.mjs'",
  '/bin/zsh -lc "pwd $(node injected.mjs)"', "/bin/zsh -lc 'pwd", '/bin/zsh -lc pwd ignored',
]) for (const position of ['before', 'between', 'after']) test(`AC3 untrusted ${position}: ${command}`, () => {
  const check = pair(declared, 'first'), unsafe = pair(command, 'unsafe-1'), later = pair(declared, 'later');
  const value = capture(position === 'before' ? [...unsafe, ...check] : position === 'between' ? [...check, ...unsafe, ...later] : [...check, ...unsafe]);
  assert.equal(value.capture.evidence_level, 'unavailable');
  assert.match(value.capture.downgrade_reason, /^capture_invalid:/u);
  assert.equal(value.commands.length, 0);
  assert.deepEqual(project(value).succeeded_command_ids, []);
});
for (const [label, mutate] of [
  ['missing start', e => e.shift()], ['missing completion', e => e.pop()],
  ['command drift', e => { e[1].item.command += ' changed'; }],
  ['status/exit contradiction', e => { e[1].item.exit_code = 2; }],
  ['duplicate ID', e => e.push(...pair(declared))],
  ['overlap', e => e.splice(1, 0, ...pair(reads[0], 'read-overlap'))],
  ['missing started command', e => { delete e[0].item.command; }],
  ['missing completed command', e => { delete e[1].item.command; }],
]) test(`AC4 invalid association ${label} remains unavailable`, () => {
  const events = pair(declared); mutate(events); const value = capture(events);
  assert.equal(value.capture.evidence_level, 'unavailable');
  assert.deepEqual(project(value).succeeded_command_ids, []);
});
test('AC4 missing/duplicate terminal, trailing event, truncated JSON and duplicate keys refuse', () => {
  assert.throws(() => build(pair(declared), { terminal: false }));
  assert.throws(() => build([...pair(declared), { type: 'turn.completed' }]));
  assert.throws(() => build([{ type: 'turn.completed' }, ...pair(declared)]));
  for (const stream of [encode([...pair(declared), { type: 'turn.completed' }]).slice(0, -1),
    '{"type":"turn.completed","type":"turn.failed"}\n', '{broken}\n']) {
    assert.throws(() => evidence.buildCodexCommandEvidence({ identity, stream, contract: authority(), parserRevision: revision }));
  }
});
test('AC4 event loss and failed runtime turns preserve explicit unavailable reasons', () => {
  for (const [event, reason] of [
    [{ type: 'error', message: 'runtime reported dropped events' }, 'event_drop'],
    [{ type: 'item.completed', item: { id: 'runtime-error', type: 'error', message: 'unknown runtime failure' } }, 'runtime_item_error'],
    [{ type: 'turn.failed' }, 'turn_failed'],
  ]) {
    const value = capture([...pair(declared), event]);
    assert.equal(value.capture.downgrade_reason, 'capture_invalid:' + reason);
    assert.deepEqual(project(value).succeeded_command_ids, []);
  }
});
test('AC3 bounded canonical candidate edits after reads and before verification are retainable', () => {
  const value = build([...pair(reads[0], 'read-before'), fileChange(), ...pair(declared)], { candidateChangePaths: [mutablePath] });
  assert.deepEqual(project(value).succeeded_command_ids, [publicContract.commands[0].command_id]);
  assert.equal(value.command_event_count, 2);
});
for (const path of ['command-evidence.json', 'stdout.jsonl', 'producer.json', 'workspace/config/retry-policy.json',
  '../workspace/docs/worker-retries.md', '/tmp/workspace/docs/worker-retries.md', 'docs/worker-retries.md']) {
  test('AC3 file change outside exact public candidate scope is unavailable: ' + path, () => {
    const value = capture([fileChange(path), ...pair(declared)], { candidateChangePaths: [mutablePath] });
    assert.equal(value.capture.downgrade_reason, 'capture_invalid:unverified_file_change');
    assert.deepEqual(project(value).succeeded_command_ids, []);
  });
}
test('AC3 post-check, overlapping, unbound and failed file changes remain unavailable', () => {
  for (const events of [[...pair(declared), fileChange()], [pair(declared)[0], fileChange(), pair(declared)[1]],
    [{ ...fileChange(), item: { ...fileChange().item, status: 'failed' } }, ...pair(declared)]]) {
    const value = capture(events, { candidateChangePaths: [mutablePath] });
    assert.equal(value.capture.evidence_level, 'unavailable');
    assert.deepEqual(project(value).succeeded_command_ids, []);
  }
  assert.equal(capture([fileChange(), ...pair(declared)]).capture.downgrade_reason, 'capture_invalid:unverified_file_change');
});
test('AC3 failed/declined/cwd-unverified starts also close candidate edit permission', () => {
  for (const [status, exit] of [['failed', 2], ['declined', null], ['completed', 0]]) {
    const events = [...pair(declared, 'check-1', status, exit), fileChange()];
    const value = capture(events, { contract: authority({ cwd: 'runtime_observed' }), candidateChangePaths: [mutablePath] });
    assert.equal(value.capture.downgrade_reason, 'capture_invalid:unverified_file_change');
  }
});
for (const event of [
  { type: 'item.completed', item: { id: 'opaque', type: 'mcp_tool_call', tool: 'write_file' } },
  { type: 'item.updated', item: { id: 'opaque', type: 'command_execution', command: "/bin/zsh -lc 'touch stdout.jsonl'" } },
  { type: 'item.completed', item: { id: 'opaque', type: 'agent_message', text: 'done', changes: [{ path: 'stdout.jsonl', kind: 'update' }] } },
  { type: 'turn.completed', item: { id: 'opaque', type: 'mcp_tool_call' } },
]) test('AC3 opaque or disguised side effects cannot hide in inert event types: ' + event.type + '/' + event.item.type, () => {
  const value = capture([...pair(declared), event]);
  assert.equal(value.capture.downgrade_reason, 'capture_invalid:unsupported_event');
  assert.deepEqual(project(value).succeeded_command_ids, []);
});
test('AC4 action/inert identity drift and duplicate file-change IDs refuse', () => {
  for (const events of [[fileChange(), fileChange(), ...pair(declared)],
    [{ type: 'item.completed', item: { id: 'check-1', type: 'agent_message', text: 'fake' } }, ...pair(declared)]]) {
    assert.equal(capture(events, { candidateChangePaths: [mutablePath] }).capture.evidence_level, 'unavailable');
  }
});
test('AC5 non-command refusal is v3-only', () => {
  const events = [...pair(declared), fileChange('command-evidence.json')];
  assert.equal(build(events, { parserRevision: '1.5.0-primary-saved' }).commands[0].status, 'succeeded');
  assert.equal(capture(events).capture.evidence_level, 'unavailable');
});
test('AC5 ambiguous public authority is refused and different shell cannot acquire its ID', () => {
  assert.throws(() => build(pair(declared), { contract: authority({ duplicate: true }) }));
  const value = capture(pair(declared.replace('/bin/bash -lc ', '/bin/zsh -lc ')));
  assert.equal(value.capture.evidence_level, 'unavailable');
  assert.deepEqual(project(value).succeeded_command_ids, []);
});
test('AC5 old v2 rejection is preserved; old exact checks still work', () => {
  for (const command of reads) assert.throws(() => build([...pair(command, 'read-1'), ...pair(declared)], { parserRevision: '1.5.0-primary-saved' }));
  for (const parserRevision of ['1.3.0', '1.4.0-primary-saved', '1.5.0-primary-saved']) {
    const value = build(pair(declared), { parserRevision });
    assert.equal(value.commands[0].matched_command_id, publicContract.commands[0].command_id);
    assert.equal(value.commands[0].status, 'succeeded');
  }
  const value = build(pair(declared));
  assert.throws(() => withPrimarySchemaBuild(() => evidence.validateCommandEvidenceManifest(value, { root, contract: authority() }),
    { commandEvidenceParserRevision: '1.5.0-primary-saved' }), /Schema/u);
});
test('AC5 stricter association/envelope policy is exclusive to v3', () => {
  const changedEnvelope = pair(declared.replace('/bin/bash -lc ', '/bin/zsh -lc '));
  assert.equal(build(changedEnvelope, { parserRevision: '1.5.0-primary-saved' }).commands[0].match_state, 'unmatched');
  const overlap = pair(declared); overlap.splice(1, 0, ...pair("/bin/zsh -lc 'pwd'", 'overlap'));
  assert.equal(build(overlap, { parserRevision: '1.5.0-primary-saved' }).command_event_count, 2);
  for (const index of [0, 1]) {
    const events = pair(declared); delete events[index].item.command;
    assert.equal(build(events, { parserRevision: '1.5.0-primary-saved' }).commands[0].status, 'succeeded');
    assert.equal(capture(events).capture.downgrade_reason, 'capture_invalid:missing_command');
  }
  assert.equal(capture(overlap).capture.downgrade_reason, 'capture_invalid:overlapping_commands');
});
for (const kernelCondition of ['kernel_principles_v1', 'kernel_principles_v2']) {
  for (const outcome of ['success', 'failure', 'unavailable']) test(`AC6 artificial doc roundtrip ${kernelCondition}/${outcome}`, async t => {
    let fakeRunnerCalls = 0;
    const fakeRunner = () => {
      fakeRunnerCalls++;
      return [...pair(reads[0], 'read-before'), fileChange(), ...pair(declared, 'declared-doc', outcome === 'failure' ? 'failed' : 'completed', outcome === 'failure' ? 4 : 0),
        ...pair(outcome === 'unavailable' ? "/bin/zsh -lc 'touch stdout.jsonl'" : reads[1], 'read-after')];
    };
    const source = syntheticPrimarySource(t, { fixtureId: 'mn-doc-config-correction', kernelCondition, command: 'missing', extraNativeEvents: fakeRunner() });
    const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'v3'), { commandEvidenceParserRevision: revision });
    assert.equal(fakeRunnerCalls, 1);
    assert.equal(produced.model_calls, 0); assert.equal(produced.grader_process_starts, 0);
    const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
    assert.equal(verifyPrimaryEvaluationProducer(options).commandEvidenceParserRevision, revision);
    const manifestPath = join(produced.output_root, 'producer.json'), manifest = JSON.parse(readFileSync(manifestPath));
    assert.equal(manifest.kind, 'ask_primary_evaluation_producer_v3');
    for (const condition of ['plain', kernelCondition, 'full_ask']) {
      const { normalizedResult } = buildPrimaryEvaluationScoringInputs(options, { condition });
      const p = normalizedResult.command_evidence, id = publicContract.commands[0].command_id;
      assert.deepEqual(p.succeeded_command_ids, outcome === 'success' ? [id] : []);
      assert.deepEqual(p.failed_command_ids, outcome === 'failure' ? [id] : []);
      assert.deepEqual(p.unavailable_command_ids, outcome === 'unavailable' ? [id] : []);
      assert.equal(p.evidence_level, outcome === 'unavailable' ? 'unavailable' : 'executed');
    }
    manifest.command_evidence_parser_revision = '1.5.0-primary-saved';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    assert.throws(() => verifyPrimaryEvaluationProducer(options));
    const freshPin = 'sha256:' + createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
    assert.throws(() => verifyPrimaryEvaluationProducer({ ...options, externalDigest: freshPin }), /primary v3 parser revision changed/u);
    const rejected = join(source.root, 'future');
    await assert.rejects(producePrimaryEvaluationArtifacts(source.block, rejected, { commandEvidenceParserRevision: 'future' }));
    assert.equal(existsSync(rejected), false);
    const overridden = join(source.root, 'caller-context');
    await assert.rejects(producePrimaryEvaluationArtifacts(source.block, overridden, { commandEvidenceParserRevision: revision, candidateChangePaths: ['stdout.jsonl'] }), /caller context override/u);
    assert.equal(existsSync(overridden), false);
  });
}
test('AC6 transient evidence writes cannot survive full producer rederivation', async t => {
  const events = [...pair(declared), fileChange('command-evidence.json', 'add-evidence', 'add'), fileChange('command-evidence.json', 'remove-evidence', 'delete')];
  const source = syntheticPrimarySource(t, { fixtureId: 'mn-doc-config-correction', command: 'missing', extraNativeEvents: events });
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'refused-v3'), { commandEvidenceParserRevision: revision });
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  verifyPrimaryEvaluationProducer(options);
  for (const condition of ['plain', 'kernel_principles_v1', 'full_ask']) {
    const p = buildPrimaryEvaluationScoringInputs(options, { condition }).normalizedResult.command_evidence;
    assert.equal(p.evidence_level, 'unavailable'); assert.deepEqual(p.succeeded_command_ids, []);
    const plan = JSON.parse(readFileSync(join(produced.output_root, 'plan.json'))), c = plan.cases.find(x => x.condition === condition);
    const m = JSON.parse(readFileSync(join(produced.output_root, 'run/cases', c.case_id, 'attempts/0001/command-evidence.json')));
    assert.equal(m.capture.downgrade_reason, 'capture_invalid:unverified_file_change');
  }
});
