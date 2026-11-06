import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspectPortfolioRuntimeContract } from './ask-benchmark-execution.mjs';
test('no-model runtime preflight uses original version/help contract and fails closed', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-native-contract-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const executable = join(root, 'codex-fixture'), config = join(root, 'runtime.json');
  const flags = '--ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --json --model --config --sandbox --output-schema --output-last-message';
  const script = version => `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${version}"; else echo "${flags}"; fi\n`;
  writeFileSync(executable, script('fixture-cli-v1')); chmodSync(executable, 0o755);
  writeFileSync(config, JSON.stringify({ schema_version: '1.2.0', adapter: 'codex', availability: 'available', unavailable_reason: null,
    expected_executable_version: 'fixture-cli-v1', model: 'no-model', reasoning_effort: 'high', case_timeout_ms: 10000,
    sandbox_policy: 'read-only', permission_policy: 'never', executor: { id: 'fixture', version: '1' }, environment_allowlist: [], environment_value_allowlist: [], thermal_state: 'cold', claude_cli: null,
    command_evidence: { capture_required: true, support: 'unknown', event_transport: 'none', event_format_revision: null, parser_revision: null,
      shell_capability: { support_status: 'unknown', family: null, executable: null, envelope_arguments: null, authority_source: 'none', probe_status: 'unknown', downgrade_reason: 'fixture_no_events' } } }));
  const options = { root: resolve(import.meta.dirname, '..'), runtimeConfigPath: config, adapter: 'codex', agentBin: executable };
  const result = inspectPortfolioRuntimeContract(options); assert.equal(result.availability, 'available'); assert.equal(result.model_calls, 0);
  assert.equal(result.runtime_execution_implied, false); assert.equal(result.command_events_observed, false);
  writeFileSync(executable, script('other-cli')); assert.equal(inspectPortfolioRuntimeContract(options).reason, 'version_mismatch');
  assert.equal(inspectPortfolioRuntimeContract({ ...options, agentBin: null }).reason, 'cli_not_supplied');
  const claude = JSON.parse(readFileSync(config));
  claude.adapter = 'claude'; claude.permission_policy = 'strict';
  claude.claude_cli = { help_marker: 'fixture-cli', sandbox_argument: '--sandbox', permission_argument: '--permission-policy',
    command: ['--benchmark-output', '{output}', '--benchmark-task', '{task}', '--sandbox', '{sandbox_policy}', '--permission-policy', '{permission_policy}'] };
  claude.command_evidence.support = 'unsupported';
  Object.assign(claude.command_evidence.shell_capability, { support_status: 'unsupported', probe_status: 'unsupported' });
  writeFileSync(config, JSON.stringify(claude)); writeFileSync(executable, script('fixture-cli-v1'));
  assert.equal(inspectPortfolioRuntimeContract({ ...options, adapter: 'claude' }).reason, 'help_contract_mismatch', 'missing native Claude contract cannot become available');
});
