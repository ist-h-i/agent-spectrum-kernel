// Real original harness; only the remote CLI/model process is artificial.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_NATIVE_KIND, nativeClaudeCommand } from './claude-native-runtime.mjs';
import { executePortfolio, inspectVerifiedPortfolioExecution, verifyExecutionTerminalWorkspaceAuthority } from './ask-benchmark-execution.mjs';
import { normalizePortfolioExecution, verifyNormalizedPortfolioResults } from './ask-benchmark-normalized-results.mjs';
import { canonicalDigest } from './content-addressed-store.mjs';
export function testNativeClaudeExecution({ root, work, config, planPath, materializedPath, selectionState, plan, runtimeTemplate }) {
  const entry = plan.cases.find(c => c.adapter_track === 'claude' && c.condition === 'full_ask');
  const runtime = { ...runtimeTemplate, expected_executable_version: '2.1.318 (Claude Code)', sandbox_policy: 'workspace-write',
    permission_policy: 'strict', claude_cli: { kind: CLAUDE_NATIVE_KIND }, environment_allowlist: ['ANTHROPIC_API_KEY'], environment_value_allowlist: [] };
  const runtimePath = join(work, 'native-claude-runtime.json'), executable = join(work, 'native-claude-fixture.mjs');
  const help = 'Claude ' + nativeClaudeCommand(runtime, canonicalDigest('schema')).argv.filter(a => a.startsWith('--')).join(' ');
  const output = { task_type: 'review', decision: 'insufficient_evidence', findings: [], requirement_status: [], verification_commands: [],
    completion_claim: 'insufficient_evidence', route: null, summary: 'Artificial native CLI transport only.' };
  const counter = join(work, 'native-claude-starts.json');
  writeFileSync(executable, `#!${process.execPath}\nimport fs from 'node:fs';import assert from 'node:assert/strict';
const args=process.argv.slice(2); if(args[0]==='--version'){console.log('2.1.318 (Claude Code)');process.exit(0)}
if(args[0]==='--help'){console.log(${JSON.stringify(help)});process.exit(0)}
const value=k=>args[args.indexOf(k)+1];let task='';for await(const chunk of process.stdin)task+=chunk;
assert.ok(task.length>0);assert.ok(args.includes('--restricted'));assert.ok(args.includes('--bare'));assert.equal(value('--add-dir'),'.');assert.ok(args.includes('--no-session-persistence'));
assert.equal(value('--permission-mode'),'dontAsk');assert.equal(value('--permission-prompts'),'none');
assert.equal(value('--tools'),'Read,Glob,Grep,Skill,Edit,Write');assert.deepEqual(JSON.parse(value('--mcp-config')),{mcpServers:{}});
const settings=JSON.parse(value('--settings'));assert.equal(settings.disableAllHooks,true);assert.equal(settings.permissions.blockWritesOutsideWorkingDirectories,true);
assert.ok(settings.permissions.deny.includes('Bash'));assert.ok(!process.env.HOME&&!process.env.CLAUDE_CODE_OAUTH_TOKEN);
assert.equal(fs.statSync(process.env.CLAUDE_CONFIG_DIR).mode&0o777,0o700);
const outputSchema=JSON.parse(value('--json-schema'));assert.ok(outputSchema.required.includes('summary'));
fs.writeFileSync(${JSON.stringify(counter)},JSON.stringify({config_dir:process.env.CLAUDE_CONFIG_DIR,stdin_bytes:Buffer.byteLength(task)}));
if(value('--model')==='fixture-error'){console.log(JSON.stringify({type:'result',subtype:'error_max_turns',is_error:true,structured_output:${JSON.stringify(output)}}));process.exit(0)}
fs.writeFileSync('workspace/native-created.txt','Artificial native file-tool output.\\n');
console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:${JSON.stringify(output)}}));\n`);
  chmodSync(executable, 0o755); writeFileSync(runtimePath, JSON.stringify(runtime));
  const options = { root, config, planPath, materializedPath, selectionState, runDir: join(work, 'native-claude-run'), adapter: 'claude',
    runtimeConfigPath: runtimePath, agentBin: executable, caseId: entry.case_id, maxCases: 1, firstAttemptOnly: true };
  const previous = process.env.ANTHROPIC_API_KEY;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    assert.throws(() => executePortfolio(options), /explicit_authentication/);
    assert.equal(existsSync(options.runDir), false);
    process.env.ANTHROPIC_API_KEY = 'synthetic-native-transport-not-a-credential';
    assert.equal(executePortfolio(options).outcomes[0].status, 'completed');
    const inspection = inspectVerifiedPortfolioExecution(options), identity = inspection.adapter_identities.get('claude');
    assert.equal(identity.effective_command.output_transport, 'structured_stdout');
    assert.equal(identity.policy_enforcement.ephemeral, true); assert.equal(identity.command_evidence.support, 'unsupported');
    assert.equal(identity.environment_snapshot.entries.find(e => e.name === 'ANTHROPIC_API_KEY').value, null);
    const finalPath = join(options.runDir, 'cases', entry.case_id, 'attempts', '0001', 'final.json');
    assert.deepEqual(JSON.parse(readFileSync(finalPath)), output);
    const starts = readFileSync(counter); assert.equal(existsSync(JSON.parse(starts).config_dir), false);
    assert.throws(() => executePortfolio(options), /first-attempt/); assert.deepEqual(readFileSync(counter), starts);
    const terminal = verifyExecutionTerminalWorkspaceAuthority({ ...options, attempt: '0001' });
    assert.ok(JSON.stringify(terminal).includes('workspace/native-created.txt'), 'native edits enter the original terminal authority');
    const normalizedPath = join(work, 'native-claude-normalized');
    normalizePortfolioExecution({ ...options, outputPath: normalizedPath });
    const normalized = verifyNormalizedPortfolioResults({ ...options, outputPath: normalizedPath });
    const selected = normalized.manifest.cases.find(c => c.case_id === entry.case_id);
    assert.equal(selected.status, 'completed'); assert.equal(selected.normalized_attempts.length, 1);
    assert.ok(normalized.manifest.cases.some(c => c.condition === 'plain' && c.status === 'pending'));
    const errorRuntime = join(work, 'native-error-runtime.json'); writeFileSync(errorRuntime, JSON.stringify({ ...runtime, model: 'fixture-error' }));
    const failed = { ...options, runDir: join(work, 'native-error-run'), runtimeConfigPath: errorRuntime };
    assert.equal(executePortfolio(failed).outcomes[0].status, 'failed');
    const failedAttempt = join(failed.runDir, 'cases', entry.case_id, 'attempts', '0001');
    const failedResult = JSON.parse(readFileSync(join(failedAttempt, 'result.json')));
    assert.equal(failedResult.exit_code, 0); assert.ok(failedResult.stdout.bytes > 0, 'native envelope failure preserves original process evidence');
    assert.equal(existsSync(join(failedAttempt, 'final.json')), false);
    assert.throws(() => executePortfolio(failed), /first-attempt/);
  } finally { if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous; }
}
