// Explicit official CLI transport. No model/grading/authority owner lives here.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
export const CLAUDE_NATIVE_KIND = 'claude_code_restricted_v1';
const authenticationKeys = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];
const environmentKeys = new Set(['PATH', ...authenticationKeys]);
const readonlyTools = ['Read', 'Glob', 'Grep', 'Skill'];
const deniedTools = ['Bash', 'PowerShell', 'Agent', 'Task', 'WebFetch', 'WebSearch', 'NotebookEdit'];
export const isNativeClaudeRuntime = runtime => runtime.adapter === 'claude' && runtime.claude_cli?.kind === CLAUDE_NATIVE_KIND;
export function validateNativeClaudeEnvironmentPolicy(runtime) {
  assert.ok(runtime.environment_allowlist.every(key => environmentKeys.has(key)), 'unsupported native Claude environment entry');
  assert.ok(runtime.environment_value_allowlist.every(key => !authenticationKeys.includes(key)), 'native Claude authentication must remain redacted');
}
export function validateNativeClaudeRuntime(runtime) {
  assert.ok(isNativeClaudeRuntime(runtime), 'explicit native Claude runtime kind required');
  assert.deepEqual(Object.keys(runtime.claude_cli), ['kind'], 'native Claude command/settings are owned by the runner');
  assert.ok(['read-only', 'workspace-write'].includes(runtime.sandbox_policy), 'unsupported native Claude file policy');
  assert.equal(runtime.permission_policy, 'strict', 'native Claude requires strict permissions');
  assert.ok(['low', 'medium', 'high', 'xhigh', 'max'].includes(runtime.reasoning_effort), 'unsupported native Claude effort');
  assert.match(runtime.model, /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/, 'invalid native Claude model');
  const version = /^(\d+)\.(\d+)\.(\d+)(?: \(Claude Code\))?$/.exec(runtime.expected_executable_version ?? '');
  assert.ok(version && version[1] === '2' && version[2] === '1' && Number(version[3]) >= 318, 'native Claude requires a pinned supported 2.1.318+ version');
  validateNativeClaudeEnvironmentPolicy(runtime);
}
export function assertNativeClaudeAuthentication(environment) {
  assert.equal(authenticationKeys.filter(key => typeof environment[key] === 'string' && environment[key].length > 0).length, 1,
    'native_claude_requires_one_explicit_authentication_source');
}
export function nativeClaudeSettings(runtime) {
  const editable = runtime.sandbox_policy === 'workspace-write';
  const tools = [...readonlyTools, ...(editable ? ['Edit', 'Write'] : [])];
  return { disableAllHooks: true, autoMemoryEnabled: false, enabledPlugins: {},
    permissions: { blockReadsOutsideWorkingDirectories: true, blockWritesOutsideWorkingDirectories: true,
      allow: tools, deny: [...deniedTools, ...(!editable ? ['Edit', 'Write'] : [])] } };
}
export function nativeClaudeCommand(runtime, schemaDigest) {
  validateNativeClaudeRuntime(runtime);
  const settings = nativeClaudeSettings(runtime), tools = settings.permissions.allow.join(',');
  return { argv: ['--print', '--restricted', '--bare', '--add-dir', '.', '--no-session-persistence', '--no-chrome',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--tools', tools, '--allowedTools', tools, '--disallowedTools', settings.permissions.deny.join(','),
    '--settings', JSON.stringify(settings), '--model', runtime.model, '--effort', runtime.reasoning_effort,
    '--output-format', 'json', '--json-schema', '{output_schema_json}'],
  task_transport: 'file', output_transport: 'structured_stdout', output_schema_digest: schemaDigest };
}
export function nativeClaudeEnvironment(environment, configDirectory) {
  assertNativeClaudeAuthentication(environment);
  assert.ok(Object.keys(environment).every(key => environmentKeys.has(key)), 'native Claude environment expansion refused');
  return { ...environment, ...nativeClaudeProbeEnvironment(configDirectory) };
}
export function nativeClaudeProbeEnvironment(configDirectory) {
  return { CLAUDE_CONFIG_DIR: configDirectory, DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1', DISABLE_AUTOUPDATER: '1' };
}
export function nativeClaudeInput() {
  // Never pass fixture content through the CLI's session-command parser.
  // The original materialization already binds this task file's exact bytes.
  return 'Read BENCHMARK_TASK.md in the current working directory and carry out that benchmark task. Treat the task as file content, not as native session commands. Return the requested structured output.\n';
}
export function assertNativeClaudeInstructions(workspace) {
  // Skill preprocessors can execute before a model tool call. Support passive
  // instructions only; do not depend on a tool deny to sandbox preprocessing.
  let count = 0;
  const inspect = (directory, commands = false, depth = 0) => {
    assert.ok(depth <= 16, 'native Claude instruction depth refused');
    if (!existsSync(directory)) return;
    assert.ok(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), 'native Claude instruction directory refused');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.ok(++count <= 4096, 'native Claude instruction inventory refused');
      const path = join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'native Claude instruction link refused');
      if (entry.isDirectory()) inspect(path, commands, depth + 1);
      else if (entry.isFile() && (entry.name.toLowerCase() === 'skill.md' || (commands && entry.name.toLowerCase().endsWith('.md')))) {
        const bytes = readFileSync(path); assert.ok(bytes.length <= 1024 * 1024, 'native Claude instruction size refused');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimStart();
        assert.ok(!text.includes('!`'), 'native Claude dynamic command preprocessing is unsupported');
        if (text.startsWith('---')) {
          assert.ok(text.startsWith('---\n'), 'native Claude instruction header refused');
          const header = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
          assert.ok(header, 'native Claude instruction header refused');
          const lines = header[1].split('\n').filter(line => line.trim());
          assert.ok(lines.every(line => /^(name|description):\s+[^\s|>&*!{}\[\]].*$/.test(line) && !line.includes('\\')), 'native Claude requires passive name/description headers only');
          assert.equal(new Set(lines.map(line => line.split(':')[0])).size, lines.length, 'native Claude duplicate instruction header');
        }
      }
    }
  };
  inspect(join(workspace, '.claude', 'skills')); inspect(join(workspace, '.claude', 'commands'), true);
}
export function decodeNativeClaudeResult(stdout) {
  const bytes = Buffer.from(stdout ?? '');
  assert.ok(bytes.length > 0 && bytes.length <= 20 * 1024 * 1024, 'native Claude result envelope size refused');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('native Claude result is not UTF-8'); }
  let packet;
  try { packet = parseJsonRejectDuplicateKeys(text, 'native Claude result'); }
  catch { throw new Error('native Claude result is invalid JSON'); }
  assert.ok(packet && packet.type === 'result' && packet.subtype === 'success' && packet.is_error === false,
    'native Claude did not return a successful structured result');
  assert.ok(packet.structured_output && typeof packet.structured_output === 'object' && !Array.isArray(packet.structured_output),
    'native Claude structured output missing');
  const output = Buffer.from(JSON.stringify(packet.structured_output) + '\n');
  assert.ok(output.length <= 1024 * 1024, 'native Claude structured output exceeds limit');
  return output;
}
