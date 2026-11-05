import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CLAUDE_NATIVE_KIND, validateNativeClaudeRuntime, nativeClaudeCommand, nativeClaudeSettings,
  nativeClaudeEnvironment, decodeNativeClaudeResult, assertNativeClaudeInstructions, assertNativeClaudeAuthentication, nativeClaudeInput } from './claude-native-runtime.mjs';
import { executeContainedAgent, inspectPortfolioRuntimeContract, executePortfolio, OUTPUT_SCHEMA_PATH } from './ask-benchmark-execution.mjs';
import { canonicalDigest } from './content-addressed-store.mjs';
import { assertBenchmarkSchemaInstance } from './ask-benchmark-schema.mjs';
const root = resolve(import.meta.dirname, '..');
function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'ask-claude-native-'))); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const runtime = { schema_version: '1.2.0', adapter: 'claude', availability: 'available', unavailable_reason: null,
    expected_executable_version: '2.1.318 (Claude Code)', model: 'fixture-model', reasoning_effort: 'high', case_timeout_ms: 5000,
    sandbox_policy: 'workspace-write', permission_policy: 'strict', executor: { id: 'native-fixture', version: '1' },
    environment_allowlist: [], environment_value_allowlist: [], thermal_state: 'cold', claude_cli: { kind: CLAUDE_NATIVE_KIND },
    command_evidence: { capture_required: true, support: 'unsupported', event_transport: 'none', event_format_revision: null, parser_revision: null,
      shell_capability: { support_status: 'unsupported', family: null, executable: null, envelope_arguments: null,
        authority_source: 'none', probe_status: 'unsupported', downgrade_reason: 'native_restricted_file_tools_only' } } };
  return { directory, runtime };
}
test('native Claude has a closed, versioned, restricted file-tool policy and redacted explicit authentication', t => {
  const { runtime } = fixture(t); validateNativeClaudeRuntime(runtime);
  const command = nativeClaudeCommand(runtime, canonicalDigest('schema'));
  assert.equal(command.task_transport, 'file'); assert.equal(command.output_transport, 'structured_stdout');
  assert.ok(command.argv.includes('--restricted')); assert.ok(command.argv.includes('--bare'));
  assert.equal(command.argv[command.argv.indexOf('--add-dir') + 1], '.'); assert.ok(!command.argv.includes('--dangerously-skip-permissions'));
  assert.deepEqual(nativeClaudeSettings(runtime).permissions.allow, ['Read', 'Glob', 'Grep', 'Skill', 'Edit', 'Write']);
  const readonly = nativeClaudeSettings({ ...runtime, sandbox_policy: 'read-only' });
  assert.ok(!readonly.permissions.allow.includes('Write') && readonly.permissions.deny.includes('Write'));
  for (const altered of [{ permission_policy: 'bypassPermissions' }, { sandbox_policy: 'danger-full-access' },
    { expected_executable_version: '2.1.317' }, { expected_executable_version: '3.0.0' }, { environment_allowlist: ['HOME'] },
    { environment_allowlist: ['ANTHROPIC_API_KEY'], environment_value_allowlist: ['ANTHROPIC_API_KEY'] },
    { claude_cli: { kind: CLAUDE_NATIVE_KIND, command: ['unsafe'] } }]) {
    assert.throws(() => validateNativeClaudeRuntime({ ...runtime, ...altered }));
  }
  assert.throws(() => assertNativeClaudeAuthentication({}), /explicit_authentication/);
  assert.throws(() => assertNativeClaudeAuthentication({ ANTHROPIC_API_KEY: 'synthetic', CLAUDE_CODE_OAUTH_TOKEN: 'synthetic' }), /explicit_authentication/);
  const environment = nativeClaudeEnvironment({ ANTHROPIC_API_KEY: 'artificial-only' }, '/private/fixture');
  assert.equal(environment.CLAUDE_CONFIG_DIR, '/private/fixture'); assert.equal(environment.DISABLE_TELEMETRY, '1');
  assert.throws(() => nativeClaudeEnvironment({ ANTHROPIC_API_KEY: 'artificial-only', ANTHROPIC_BASE_URL: 'foreign' }, '/private/fixture'), /expansion/);
  for (const task of ['/plugin install untrusted', '! touch outside']) {
    const input = nativeClaudeInput(task); assert.ok(!/^[!\/]/.test(input)); assert.ok(input.includes('BENCHMARK_TASK.md'));
    assert.ok(!input.includes(task)); assert.equal(input, nativeClaudeInput());
  }
});
test('native result decoding keeps error/duplicate/invalid UTF-8/oversized outputs out of the original output boundary', () => {
  const packet = { type: 'result', subtype: 'success', is_error: false, structured_output: { summary: 'artificial' } };
  assert.deepEqual(JSON.parse(decodeNativeClaudeResult(JSON.stringify(packet))), packet.structured_output);
  for (const altered of [{ is_error: true }, { subtype: 'error_max_turns' }, { type: 'system' }, { structured_output: null }]) {
    assert.throws(() => decodeNativeClaudeResult(JSON.stringify({ ...packet, ...altered })));
  }
  assert.throws(() => decodeNativeClaudeResult('{"type":"result","type":"result"}'), /invalid JSON/);
  assert.throws(() => decodeNativeClaudeResult(Buffer.from([255])), /UTF-8/);
  assert.throws(() => decodeNativeClaudeResult(JSON.stringify({ ...packet, structured_output: { x: 'a'.repeat(1024 * 1024) } })), /limit/);
  assert.throws(() => assertBenchmarkSchemaInstance(JSON.parse(decodeNativeClaudeResult(JSON.stringify(packet))),
    { schemaPath: join(root, OUTPUT_SCHEMA_PATH), label: 'native fake output' }));
});
test('passive native Skills cannot smuggle preprocessing, fork/agent/hooks headers or links', t => {
  const { directory } = fixture(t), skills = join(directory, '.claude', 'skills', 'sample'); mkdirSync(skills, { recursive: true });
  const path = join(skills, 'SKILL.md'); writeFileSync(path, '---\nname: sample\ndescription: Artificial skill\n---\nRead the fixture.\n');
  assertNativeClaudeInstructions(directory);
  for (const header of ['context: fork', 'hooks: {}', 'allowed-tools: Bash', 'description: |\n  context: fork', '"context": fork', '<<: *unsafe']) {
    writeFileSync(path, `\uFEFF---\r\nname: sample\r\n${header}\r\n---\r\nText`);
    assert.throws(() => assertNativeClaudeInstructions(directory), /header/);
  }
  writeFileSync(path, 'The result is !`touch outside`'); assert.throws(() => assertNativeClaudeInstructions(directory), /preprocessing/);
  const hiddenHeader = '---\nname: sample\ndescription: Passive\n---: ignored\ncontext: fork\nhooks: {}\n---\nText';
  writeFileSync(path, hiddenHeader); assert.throws(() => assertNativeClaudeInstructions(directory), /header/);
  rmSync(path); const foldedPath = join(skills, 'skill.md'); writeFileSync(foldedPath, hiddenHeader);
  assert.throws(() => assertNativeClaudeInstructions(directory), /header/); rmSync(foldedPath);
  symlinkSync('/etc/passwd', path); assert.throws(() => assertNativeClaudeInstructions(directory), /link/);
});
test('real contained fake process exercises official argv/stdin/JSON transport; version/help needs no auth and start refuses missing auth before run creation', t => {
  const { directory, runtime } = fixture(t), executable = join(directory, 'native-claude.mjs'), runtimePath = join(directory, 'runtime.json');
  const output = { task_type: 'review', decision: 'insufficient_evidence', findings: [], requirement_status: [], verification_commands: [],
    completion_claim: 'insufficient_evidence', route: null, summary: 'Artificial native transport; no model.' };
  const command = nativeClaudeCommand(runtime, canonicalDigest('schema'));
  const help = 'Claude ' + command.argv.filter(a => a.startsWith('--')).join(' ');
  writeFileSync(executable, `#!${process.execPath}\nconst args=process.argv.slice(2);if(args[0]==='--version'){console.log('2.1.318 (Claude Code)');process.exit(0)}if(args[0]==='--help'){console.log(${JSON.stringify(help)});process.exit(0)}\nlet task='';for await(const chunk of process.stdin)task+=chunk; if(task!=='artificial task'||!args.includes('--restricted'))process.exit(64);console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:${JSON.stringify(output)}}));\n`);
  chmodSync(executable, 0o755); writeFileSync(runtimePath, JSON.stringify(runtime));
  const preflight = inspectPortfolioRuntimeContract({ root, runtimeConfigPath: runtimePath, adapter: 'claude', agentBin: executable });
  assert.equal(preflight.availability, 'available'); assert.equal(preflight.model_calls, 0);
  const runDir = join(directory, 'must-not-create');
  assert.throws(() => executePortfolio({ root, runtimeConfigPath: runtimePath, adapter: 'claude', agentBin: executable, runDir }), /explicit_authentication/);
  assert.equal(existsSync(runDir), false);
  for (const secretName of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) {
    writeFileSync(runtimePath, JSON.stringify({ ...runtime, availability: 'unavailable', unavailable_reason: 'artificial unavailable',
      expected_executable_version: null, environment_allowlist: [secretName], environment_value_allowlist: [secretName] }));
    assert.throws(() => executePortfolio({ root, runtimeConfigPath: runtimePath, adapter: 'claude', agentBin: executable, runDir }), /remain redacted/);
    assert.equal(existsSync(runDir), false, 'unavailable runtime cannot publish a credential snapshot');
  }
  writeFileSync(runtimePath, JSON.stringify(runtime));
  const raw = executeContainedAgent(executable, command.argv.map(a => a === '{output_schema_json}' ? readFileSync(join(root, OUTPUT_SCHEMA_PATH), 'utf8') : a),
    { cwd: directory, input: 'artificial task', env: nativeClaudeEnvironment({ ANTHROPIC_API_KEY: 'artificial-only' }, join(directory, 'config')),
      timeout: 5000, maxBuffer: 1024 * 1024 });
  assert.equal(raw.status, 0); assert.equal(raw.workspace_descendants_detected, false);
  assert.deepEqual(JSON.parse(decodeNativeClaudeResult(raw.stdout)), output);
});
