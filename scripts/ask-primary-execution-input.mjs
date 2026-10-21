// Prospective input/provenance preparation only. No filesystem, launcher,
// private evaluator, runtime admission or permission/configuration mutation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { comparisonConditions, isKernelPrinciplesCondition } from './ask-comparison-conditions.mjs';
import { renderCommandEvent } from './ask-benchmark-command-evidence.mjs';

export const PRIMARY_EXECUTION_INPUT_CONTRACT = 'closed_primary_inputs_v1';
const KIND = 'ask_primary_execution_inputs_v1';
const STATES = ['.agent-spectrum-kernel/codex-install-state.json', '.agent-spectrum-kernel/install-state.json'];
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const pin = entry => {
  assert.match(entry?.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0);
  assert.ok(['100644', '100755'].includes(entry.mode));
  return { digest: entry.digest, bytes: entry.bytes, mode: entry.mode };
};
function safePath(path) {
  assert.ok(typeof path === 'string' && path && !posix.isAbsolute(path) && !/[\\\u0000-\u001f\u007f]/u.test(path)
    && path.split('/').every(part => part && !['.', '..', '.git', '.codex', '.ssh', '.aws'].includes(part.toLowerCase())), 'unsafe primary input path');
  assert.ok(!/^(?:control|private|runtime)\//iu.test(path) && !/^\.agents\/(?:runs|runtime)\//iu.test(path), 'management input refused');
  assert.ok(!path.toLowerCase().startsWith('.agent-spectrum-kernel/'), 'installer identity is not an auxiliary input');
  assert.ok(!/^(?:\.env(?:\..*)?|(?:auth|credentials?|tokens?|cookies?|secrets?)\.(?:jsonl?|ya?ml|txt)|\.netrc|\.npmrc|\.pypirc|id_rsa|id_ed25519)$/iu.test(posix.basename(path))
    && !/\.(?:p12|pfx|key)$/iu.test(path), 'secret input refused');
  return path;
}
const mapped = (path, entry) => ({ arm_relative_path: safePath(path), launch_relative_path: posix.relative('workspace', path), ...pin(entry) });

/** Pure data construction, not authority. The existing preparer supplies the
 * fixed recipe/manifest and sourceDistribution paths, never user options. */
export function buildPrimaryExecutionInputContract(plan, { manifestBytes, recipe, auxiliaryPaths }) {
  assert.equal(plan.config.primary_input_contract, PRIMARY_EXECUTION_INPUT_CONTRACT);
  assert.equal(plan.policy.execution_contract, 'single_shot_v1');
  assert.ok(isKernelPrinciplesCondition(plan.config.kernel_condition), 'primary principles condition required');
  assert.ok(posix.isAbsolute(plan.root) && plan.root !== '/' && posix.normalize(plan.root) === plan.root && !/[\\\u0000-\u001f\u007f]/u.test(plan.root));
  assert.deepEqual(plan.verification.recipe, recipe, 'fixed public recipe required');
  assert.ok(Buffer.isBuffer(manifestBytes));
  assert.equal(hash(manifestBytes), recipe.input_manifest_digest, 'fixed public manifest required');
  const manifest = parseJsonRejectDuplicateKeys(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  assert.deepEqual(Object.keys(manifest.fixtures), [recipe.fixture_id]);
  const publicInputs = {};
  for (const file of manifest.fixtures[recipe.fixture_id].files) {
    safePath(file.path); assert.ok(file.path === 'task.md' || file.path.startsWith('workspace/'));
    assert.ok(!Object.hasOwn(publicInputs, file.path), 'duplicate public input');
    const value = pin(plan.source.inventory[file.path]);
    assert.equal(value.digest, 'sha256:' + file.sha256); assert.equal(value.bytes, file.bytes);
    publicInputs[file.path] = mapped(file.path, value);
  }
  assert.deepEqual(Object.keys(plan.source.inventory).sort(), Object.keys(publicInputs).sort(), 'extra task input');
  assert.equal(plan.task.digest, publicInputs['task.md'].digest);
  assert.deepEqual(plan.mutable_paths, recipe.mutable_paths, 'mutable scope changed');
  assert.ok(Array.isArray(auxiliaryPaths) && new Set(auxiliaryPaths).size === auxiliaryPaths.length);
  for (const path of auxiliaryPaths) safePath(path);
  const ids = comparisonConditions(plan.config.kernel_condition);
  assert.deepEqual(Object.keys(plan.arms).sort(), [...ids].sort());
  const conditions = {};
  for (const id of ids) {
    const arm = plan.arms[id]; assert.equal(arm.path, `arms/${id}`);
    const expected = id === 'plain' ? [] : id === 'full_ask' ? ['AGENTS.md', ...auxiliaryPaths, ...STATES].sort() : ['AGENTS.md'];
    assert.deepEqual(arm.assets.map(asset => asset.path).sort(), [...new Set(expected)].sort(), 'condition auxiliary inventory changed');
    assert.deepEqual(Object.keys(arm.baseline_inventory).sort(), [...Object.keys(publicInputs), ...expected].sort(), 'extra arm input');
    for (const path of Object.keys(publicInputs)) assert.deepEqual(pin(arm.baseline_inventory[path]), pin(plan.source.inventory[path]), 'public arm byte drift');
    const auxiliary = {}, excluded = [];
    for (const asset of arm.assets) {
      assert.deepEqual(pin(asset), pin(arm.baseline_inventory[asset.path]), 'auxiliary byte drift');
      if (STATES.includes(asset.path)) { assert.equal(asset.kind, 'install_identity'); assert.equal(asset.origin, 'live_core_and_codex_full_installers'); excluded.push(asset.path); continue; }
      assert.equal(asset.kind, asset.path === 'AGENTS.md' ? id === 'full_ask'
        ? 'canonical_kernel_with_preserved_custom_instructions' : 'generated_principles_with_preserved_custom_instructions' : 'full_ask_asset');
      assert.ok((id === 'full_ask' ? ['live_core_and_codex_full_installers', 'live_classified_reference_supplement'] : ['canonical_principles_projection']).includes(asset.origin), 'unclassified auxiliary origin');
      auxiliary[asset.path] = mapped(asset.path, asset);
    }
    const cwd = posix.join(plan.root, arm.path, 'workspace');
    conditions[id] = { arm_root: arm.path, launch_cwd: cwd, auxiliary_inputs: auxiliary,
      excluded_control_paths: excluded.sort(), auxiliary_dependency_closure: id === 'full_ask' ? 'unqualified_management_dependencies' : 'declared_source_assets_only',
      work_products: recipe.mutable_paths.map(path => { assert.ok(path.startsWith('workspace/')); safePath(path);
        return { arm_relative_path: path, launch_relative_path: posix.relative('workspace', path),
          initial_input_digest: publicInputs[path]?.digest ?? null, provenance: 'candidate_edit_and_final_snapshot_required' }; }),
      verification: recipe.checks.map(check => {
        assert.equal(check.cwd, 'workspace'); assert.equal(check.executable, '/bin/bash'); assert.equal(check.argv[0], '-lc'); assert.equal(check.argv.length, 2);
        return { command_id: check.id, cwd, executable: check.executable, argv: [...check.argv],
          contract_command_digest: check.contract_command_digest,
          rendered_event_command: renderCommandEvent({ execution_form: 'codex_shell_command', shell_family: 'posix_bash',
            shell_envelope: { executable: check.executable, arguments: ['-lc'] }, canonical_script: check.argv[1] }) };
      }) };
  }
  const value = { kind: KIND, mode: PRIMARY_EXECUTION_INPUT_CONTRACT, fixture_id: recipe.fixture_id,
    root: plan.root, fixture_input_digest: recipe.input_manifest_digest, public_recipe_digest: canonicalDigest(recipe),
    requested_model_setting: { model: plan.config.model ?? null, reasoning_effort: plan.config.reasoning ?? null },
    source_digest: plan.source.digest, public_inputs: publicInputs, conditions,
    required_runtime_evidence: ['effective_startup_input_closure', 'initial_cli_cwd', 'native_command_cwd',
      'runtime_executable_identity', 'resolved_model_and_effort', 'native_start_completion_raw_bytes', 'candidate_edit_and_final_snapshot'],
    runtime_attestation: 'unknown', execution_authority: false, scoring_authority: false, formal_aggregate_eligible: false };
  for (const id of ids) {
    const input = Buffer.from(plan.prompt + renderPrimaryExecutionInputBoundary(value, id));
    conditions[id].input = { path: `inputs/primary-conditions/${id}.md`, digest: hash(input), bytes: input.length };
  }
  return { ...value, contract_digest: canonicalDigest(value) };
}

export function renderPrimaryExecutionInputBoundary(contract, condition) {
  const arm = contract.conditions[condition]; assert.ok(arm);
  const lines = ['\nClosed primary execution inputs (proposal; not an operating-system access boundary):',
    'Initial cwd is workspace inside this condition arm. Original task names are arm-relative; workspace/foo means foo here.',
    'Read only the following fixed references and your declared work products. Fixed ../ references stay inside this arm; do not search ancestors, host Skills, global settings, sibling conditions or controller records.',
    'Public task input references (arm-relative -> cwd-relative):',
    ...Object.values(contract.public_inputs).map(file => `${file.arm_relative_path} -> ${file.launch_relative_path}`),
    'This condition public instruction references (arm-relative -> cwd-relative):',
    ...Object.values(arm.auxiliary_inputs).map(file => `${file.arm_relative_path} -> ${file.launch_relative_path}`),
    'Declared mutable work products; initial pins do not attest later candidate bytes:',
    ...arm.work_products.map(file => `${file.arm_relative_path} -> ${file.launch_relative_path}`),
    'Run each exact final script using the tool working-directory parameter for the current workspace. Do not add a cd wrapper, substitute a command, or use controller verification as model self-verification.',
    ...arm.verification.map(check => JSON.stringify({ command_id: check.command_id, cwd: '.', executable: check.executable, argv: check.argv })),
    'Preserve native command start/completion, actual command cwd and candidate/final-snapshot lineage. Missing provenance is unknown; stop and report it rather than asserting verification success.',
    'Installer identity, runtime records, credentials and host/global instruction files are not auxiliary task inputs. Do not import them.',
  ];
  return lines.join('\n') + '\n';
}

/** No admission path exists here. Supplied booleans/captures never lift this. */
export function primaryExecutionInputPreflight(contract) {
  return { status: 'blocked', contract_kind: contract?.kind ?? null,
    blockers: ['effective_startup_input_closure_unverified', 'native_command_cwd_authority_unverified',
      'closed_primary_input_processing_unconfigured',
      ...(contract?.conditions?.full_ask ? ['full_ask_management_dependency_closure_unqualified'] : [])],
    runtime_attestation: 'unknown', execution_authority: false, scoring_authority: false,
    formal_aggregate_eligible: false, model_calls: 0, native_cli_starts: 0 };
}

/** Public supplied verification-segment diagnostics only, never a native
 * collector/admission or full-session normalizer. Artificial data stays so. */
export function inspectSuppliedPrimaryVerificationProvenance(contract, condition, stream) {
  const base = { evidence_class: 'supplied_unattested_verification_segment', runtime_attestation: 'unknown',
    execution_authority: false, scoring_authority: false, formal_aggregate_eligible: false, model_calls: 0, native_cli_starts: 0,
    observations: [] };
  try {
    assert.equal(contract.kind, KIND); assert.ok(Buffer.isBuffer(stream) && stream.length > 0 && stream.length <= 1024 * 1024, 'invalid_stream');
    const arm = contract.conditions[condition]; assert.ok(arm, 'unknown_condition');
    const pending = new Map(), completed = new Set(), observations = [];
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(stream).split('\n'); assert.equal(lines.pop(), '', 'unterminated_stream');
    assert.ok(lines.length > 0 && lines.length <= 256, 'event_limit');
    for (const [index, line] of lines.entries()) {
      const event = parseJsonRejectDuplicateKeys(line), item = event.item;
      assert.ok(Object.keys(event).every(key => ['type', 'item'].includes(key)) && ['item.started', 'item.completed'].includes(event.type) && item?.type === 'command_execution', 'unknown_or_edit_event');
      assert.ok(Object.keys(item).every(key => ['id', 'type', 'command', 'cwd', 'status', 'exit_code', 'aggregated_output'].includes(key)), 'unknown_item_shape');
      assert.ok(typeof item.id === 'string' && item.id.length > 0 && !completed.has(item.id), 'duplicate_pair');
      const check = arm.verification.find(check => check.rendered_event_command === item.command); assert.ok(check, 'undeclared_command');
      assert.equal(item.cwd, arm.launch_cwd, 'native_command_cwd_unavailable_or_mismatched');
      if (event.type === 'item.started') {
        assert.equal(pending.size, 0, 'overlapping_or_duplicate_start'); assert.equal(item.status, 'in_progress'); assert.equal(item.exit_code, null);
        pending.set(item.id, { command_id: check.command_id, command: item.command, cwd: item.cwd, start_line: index + 1, start_digest: hash(Buffer.from(line)) });
      } else {
        const start = pending.get(item.id); assert.ok(start, 'missing_start');
        assert.equal(item.command, start.command, 'command_pair_mismatch'); assert.equal(item.cwd, start.cwd);
        assert.equal(item.status, 'completed', 'verification_failed_or_unknown'); assert.equal(item.exit_code, 0, 'verification_failed_or_unknown');
        observations.push({ command_id: start.command_id, cwd: item.cwd, start_line: start.start_line, completion_line: index + 1,
          start_digest: start.start_digest, completion_digest: hash(Buffer.from(line)), exit_code: item.exit_code });
        pending.delete(item.id); completed.add(item.id);
      }
    }
    assert.equal(pending.size, 0, 'incomplete_pair');
    assert.deepEqual([...new Set(observations.map(item => item.command_id))].sort(), arm.verification.map(check => check.command_id).sort(), 'required_verification_missing');
    return { ...base, status: 'supplied_verification_segment_complete', source_stream_digest: hash(stream), observations };
  } catch { return { ...base, status: 'unavailable', reason: 'supplied_verification_provenance_incomplete_or_invalid', source_stream_digest: Buffer.isBuffer(stream) ? hash(stream) : null }; }
}
