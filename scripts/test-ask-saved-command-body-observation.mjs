// All shell strings are data. This test never spawns a shell or worker.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as evidence from './ask-benchmark-command-evidence.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/primary-command-body-observation-public.json', import.meta.url))).fixtures;
const makeContract = script => ({ commands: [{ command_id: 'public-check', canonical_script: script,
  execution_form: 'codex_shell_command', shell_family: 'posix_bash',
  shell_envelope: { executable: '/bin/bash', arguments: ['-lc'] },
  working_directory: { path: 'workspace', evidence_requirement: 'runtime_observed' } }] });
const diagnose = (rawCommand, script = 'node workspace/test.mjs') => evidence.diagnoseSavedCommandBody({ rawCommand, contract: makeContract(script) });

for (const fixture of fixtures) test('public saved render: ' + fixture.id, () => {
  const result = diagnose(fixture.observed_render, fixture.declared_script);
  assert.equal(result.state, 'compared');
  assert.equal(result.commands[0].body_bytes_equal, true);
  assert.equal(result.commands[0].canonical_render_bytes_equal, false);
  assert.equal(result.commands[0].shell_envelope_equal, fixture.observed_render.startsWith('/bin/bash -lc '));
  assert.equal(result.scoring_eligible, false);
  assert.deepEqual(result.unverified_context, ['working_directory', 'execution_actor', 'source_loaded', 'outcome']);
  assert.equal(JSON.stringify(result).includes('node -e'), false);
});

test('exact render, quote variation and changed wrapper are distinct observations', () => {
  const exact = diagnose("/bin/bash -lc 'node workspace/test.mjs'");
  const quotes = diagnose('/bin/bash -lc "node workspace/test.mjs"');
  const wrapper = diagnose("/bin/zsh -lc 'node workspace/test.mjs'");
  assert.deepEqual(exact.commands[0], { command_id: 'public-check', body_bytes_equal: true, canonical_render_bytes_equal: true, shell_envelope_equal: true });
  assert.equal(quotes.commands[0].body_bytes_equal, true);
  assert.equal(quotes.commands[0].shell_envelope_equal, true);
  assert.equal(quotes.commands[0].canonical_render_bytes_equal, false);
  assert.equal(wrapper.commands[0].body_bytes_equal, true);
  assert.equal(wrapper.commands[0].shell_envelope_equal, false);
  for (const result of [exact, quotes, wrapper]) assert.equal(result.scoring_eligible, false);
});

for (const raw of ["/bin/bash -lc 'node workspace/other.mjs'", "/bin/bash -lc 'node workspace/test.mjs; touch injected'",
  "/bin/bash -lc 'cd workspace && node test.mjs'"]) test('different body is not equivalent: ' + raw, () => {
  assert.equal(diagnose(raw).commands[0].body_bytes_equal, false);
});

for (const [label, raw] of [
  ['statement outside word', "/bin/bash -lc 'node workspace/test.mjs'; touch injected"],
  ['outer substitution', '/bin/bash -lc "node $(touch injected)"'],
  ['outer variable', '/bin/bash -lc "node $CANARY_SECRET"'],
  ['outer backtick', '/bin/bash -lc "node `touch injected`"'],
  ['unsupported executable', "/bin/sh -lc 'node workspace/test.mjs'"],
  ['extra argument', "/bin/bash -lc 'node workspace/test.mjs' forged-actor"],
  ['unclosed quote', "/bin/bash -lc 'node workspace/test.mjs"],
  ['NUL', "/bin/bash -lc 'node\0test'"],
  ['unsupported flag', "/bin/bash -e 'node workspace/test.mjs'"],
]) test('unknown input: ' + label, () => {
  const result = diagnose(raw);
  assert.equal(result.state, 'unknown');
  assert.equal(result.commands.length, 0);
  assert.equal(result.scoring_eligible, false);
  assert.ok(!JSON.stringify(result).includes('CANARY_SECRET'));
});

test('body equality cannot consume forged cwd, actor, success or source claims', () => {
  const contract = makeContract('node workspace/test.mjs');
  const result = evidence.diagnoseSavedCommandBody({ rawCommand: "/bin/zsh -lc 'node workspace/test.mjs'", contract,
    cwd: 'workspace', actor: 'codex', exit_code: 0, source_loaded: true });
  assert.equal(result.commands[0].body_bytes_equal, true);
  assert.equal(result.scoring_eligible, false);
  assert.ok(!('match_state' in result));
  assert.deepEqual(result.unverified_context, ['working_directory', 'execution_actor', 'source_loaded', 'outcome']);
});

test('nested wrappers have a finite bound', () => {
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  let raw = "/bin/bash -lc 'node workspace/test.mjs'";
  raw = '/bin/zsh -lc ' + quote(raw);
  assert.equal(diagnose(raw).commands[0].body_bytes_equal, true);
  raw = '/bin/bash -lc ' + quote(raw);
  assert.equal(diagnose(raw).state, 'unknown');
});
