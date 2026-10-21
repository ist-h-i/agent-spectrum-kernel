// Prospective input/provenance preparation only. No filesystem, launcher,
// private evaluator, runtime admission or permission/configuration mutation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { comparisonConditions, isKernelPrinciplesCondition } from './ask-comparison-conditions.mjs';
import { renderCommandEvent } from './ask-benchmark-command-evidence.mjs';

export const PRIMARY_EXECUTION_INPUT_CONTRACT = 'closed_primary_inputs_v1';
export const PRIMARY_EXECUTION_INPUT_CONTRACT_V2 = 'closed_primary_inputs_v2';
export const PRIMARY_PUBLIC_CAPABILITIES_PATH = '.agents/ask-primary-public-capabilities.json';
export const PRIMARY_PUBLIC_CAPABILITIES_SCHEMA_PATH = 'benchmarks/schemas/primary-public-capability-selection-v2.schema.json';
export const isPrimaryExecutionInputContract = value => [PRIMARY_EXECUTION_INPUT_CONTRACT, PRIMARY_EXECUTION_INPUT_CONTRACT_V2].includes(value);
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

/** Versioned public instruction projection. It changes only the capability
 * source, never permission or workflow gates. A changed upstream line is refused. */
export function renderPrimaryPublicRouterV2(name, raw) {
  const originals = {
    'skill-router': '   - Read the relevant active adapter state at `.agent-spectrum-kernel/claude-install-state.json` or `.agent-spectrum-kernel/codex-install-state.json` when present. Route availability comes from `selected_skills`, not `installed_skills` or directory presence.',
    'operating-mode-router': '   - Read the relevant active adapter state at `.agent-spectrum-kernel/claude-install-state.json` or `.agent-spectrum-kernel/codex-install-state.json` when present, and treat `selected_skills` as the available route set. `installed_skills` may include retained stale files and never authorizes routing.',
    'review-router': '   - Apply the active adapter capability gate against selected_skills. Missing required capability remains explicit and blocks any dependent final judgment.',
  };
  assert.ok(Object.hasOwn(originals, name) && Buffer.isBuffer(raw), 'unknown primary public router');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw), original = originals[name];
  assert.equal(text.split(original).length, 2, 'primary public router source changed');
  const replacement = `   - In the explicitly selected closed_primary_inputs_v2 comparison only, use the pinned public \`${PRIMARY_PUBLIC_CAPABILITIES_PATH}\` as the source-configured Codex Full selected_skills. Require its exact input-contract pin and the pinned public Skill entry before selecting a route. Missing, changed or conflicting selection is insufficient evidence: stop the dependent route; never fall back to management state, directory presence, installed_skills or host/global capabilities. This list grants no execution, permission, admission or scoring authority. Missing required capability remains capability_missing and blocks any dependent judgment.`;
  return Buffer.from(text.replace(original, replacement));
}

/** Only the preparer calls this with a re-rendered source-owned Full map.
 * No plan, runtime state or caller selection is accepted. */
export function buildPrimaryPublicCapabilitiesV2(projection, publicFiles) {
  const selected = [...projection.skills].sort();
  assert.ok(selected.length > 0 && new Set(selected).size === selected.length);
  assert.ok(selected.every(skill => /^[a-z0-9][a-z0-9-]*$/u.test(skill)));
  assert.match(projection.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  return Buffer.from(JSON.stringify({ kind: 'ask_primary_public_capability_selection_v2', adapter: 'codex', profile: 'full',
    projection_fingerprint: projection.fingerprint, selection_basis: 'source_owned_full_projection', selected_skills: selected,
    skill_assets: selected.map(skill => {
      const path = `.agents/skills/${skill}/SKILL.md`, bytes = publicFiles.get(path);
      assert.ok(Buffer.isBuffer(bytes), 'public source Skill entry required');
      return { skill, path, digest: hash(bytes), bytes: bytes.length, mode: '100644' };
    }), runtime_enabled_selection: 'unobserved', execution_authority: false, scoring_authority: false,
    formal_aggregate_eligible: false }, null, 2) + '\n');
}

/** Pure data construction, not authority. The existing preparer supplies the
 * fixed recipe/manifest and sourceDistribution paths, never user options. */
export function buildPrimaryExecutionInputContract(plan, { manifestBytes, recipe, auxiliaryPaths, sourceBinding }) {
  assert.ok(isPrimaryExecutionInputContract(plan.config.primary_input_contract), 'unknown primary input contract');
  const v2 = plan.config.primary_input_contract === PRIMARY_EXECUTION_INPUT_CONTRACT_V2;
  if (v2) {
    assert.equal(sourceBinding?.kind, 'ask_primary_public_routing_source_binding_v2');
    assert.equal(sourceBinding.schema.path, PRIMARY_PUBLIC_CAPABILITIES_SCHEMA_PATH);
    assert.match(sourceBinding.schema.digest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(sourceBinding.processing_status, 'not_admitted_for_scoring');
  } else assert.equal(sourceBinding, undefined, 'V2 source binding cannot change V1');
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
    const expected = id === 'plain' ? [] : id === 'full_ask' ? ['AGENTS.md', ...auxiliaryPaths, ...(v2 ? [] : STATES)].sort() : ['AGENTS.md'];
    assert.deepEqual(arm.assets.map(asset => asset.path).sort(), [...new Set(expected)].sort(), 'condition auxiliary inventory changed');
    assert.deepEqual(Object.keys(arm.baseline_inventory).sort(), [...Object.keys(publicInputs), ...expected].sort(), 'extra arm input');
    for (const path of Object.keys(publicInputs)) assert.deepEqual(pin(arm.baseline_inventory[path]), pin(plan.source.inventory[path]), 'public arm byte drift');
    const auxiliary = {}, excluded = [];
    for (const asset of arm.assets) {
      assert.deepEqual(pin(asset), pin(arm.baseline_inventory[asset.path]), 'auxiliary byte drift');
      if (STATES.includes(asset.path)) { assert.equal(asset.kind, 'install_identity'); assert.equal(asset.origin, 'live_core_and_codex_full_installers'); excluded.push(asset.path); continue; }
      assert.equal(asset.kind, asset.path === 'AGENTS.md' ? id === 'full_ask'
        ? 'canonical_kernel_with_preserved_custom_instructions' : 'generated_principles_with_preserved_custom_instructions' : 'full_ask_asset');
      assert.ok((id === 'full_ask' ? ['live_core_and_codex_full_installers', 'live_classified_reference_supplement', ...(v2 ? ['source_public_routing_projection_v2'] : [])] : ['canonical_principles_projection']).includes(asset.origin), 'unclassified auxiliary origin');
      auxiliary[asset.path] = mapped(asset.path, asset);
    }
    const cwd = posix.join(plan.root, arm.path, 'workspace');
    conditions[id] = { arm_root: arm.path, launch_cwd: cwd, auxiliary_inputs: auxiliary,
      excluded_control_paths: excluded.sort(), auxiliary_dependency_closure: id === 'full_ask' ? v2 ? 'source_public_routing_selection_v2' : 'unqualified_management_dependencies' : 'declared_source_assets_only',
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
  const value = { kind: v2 ? 'ask_primary_execution_inputs_v2' : KIND, mode: plan.config.primary_input_contract, fixture_id: recipe.fixture_id,
    root: plan.root, fixture_input_digest: recipe.input_manifest_digest, public_recipe_digest: canonicalDigest(recipe),
    requested_model_setting: { model: plan.config.model ?? null, reasoning_effort: plan.config.reasoning ?? null },
    source_digest: plan.source.digest, public_inputs: publicInputs, conditions,
    ...(v2 ? { public_routing_source: sourceBinding } : {}),
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
  const reference = file => `${file.arm_relative_path} -> ${file.launch_relative_path}${contract.mode === PRIMARY_EXECUTION_INPUT_CONTRACT_V2
    ? ` (${file.digest}; bytes=${file.bytes}; mode=${file.mode})` : ''}`;
  const lines = ['\nClosed primary execution inputs (proposal; not an operating-system access boundary):',
    'Initial cwd is workspace inside this condition arm. Original task names are arm-relative; workspace/foo means foo here.',
    'Read only the following fixed references and your declared work products. Fixed ../ references stay inside this arm; do not search ancestors, host Skills, global settings, sibling conditions or controller records.',
    'Public task input references (arm-relative -> cwd-relative):',
    ...Object.values(contract.public_inputs).map(reference),
    'This condition public instruction references (arm-relative -> cwd-relative):',
    ...Object.values(arm.auxiliary_inputs).map(reference),
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
      ...(contract?.conditions?.full_ask ? [contract.mode === PRIMARY_EXECUTION_INPUT_CONTRACT_V2
        ? 'full_ask_runtime_selection_unobserved' : 'full_ask_management_dependency_closure_unqualified'] : [])],
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
    assert.ok([KIND, 'ask_primary_execution_inputs_v2'].includes(contract.kind)); assert.ok(Buffer.isBuffer(stream) && stream.length > 0 && stream.length <= 1024 * 1024, 'invalid_stream');
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

/** Matching a supplied inventory is not evidence that the runtime loaded only
 * these inputs. No host text/config is accepted or returned by this diagnostic. */
export function inspectSuppliedPrimaryStartupInventory(contract, condition, raw) {
  const base = { evidence_class: 'supplied_unattested_startup_inventory', startup_closure: 'unverified',
    runtime_attestation: 'unknown', execution_authority: false, scoring_authority: false, formal_aggregate_eligible: false };
  try {
    assert.equal(contract.kind, 'ask_primary_execution_inputs_v2');
    assert.ok(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 1024 * 1024);
    const value = parseJsonRejectDuplicateKeys(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    assert.deepEqual(Object.keys(value).sort(), ['condition', 'initial_cwd', 'inputs', 'kind']);
    assert.equal(value.kind, 'ask_primary_supplied_startup_inventory_v1'); assert.equal(value.condition, condition);
    const arm = contract.conditions[condition]; assert.ok(arm); assert.equal(value.initial_cwd, arm.launch_cwd);
    const declared = [...Object.values(contract.public_inputs), ...Object.values(arm.auxiliary_inputs)]
      .map(({ arm_relative_path, digest, bytes, mode }) => ({ arm_relative_path, digest, bytes, mode }))
      .sort((a, b) => a.arm_relative_path.localeCompare(b.arm_relative_path));
    assert.deepEqual(value.inputs, declared, 'startup inventory differs from declared input pins');
    return { ...base, status: 'supplied_inventory_matches_declared_inputs', input_count: declared.length, source_digest: hash(raw) };
  } catch { return { ...base, status: 'unavailable', reason: 'supplied_startup_inventory_incomplete_or_invalid' }; }
}

/** Version-pinned mapping of supplied app-server command notifications to the
 * same strict verification-segment check. Not a process collector or full-session
 * filter: any unknown/non-command notification rejects the entire segment. */
export function inspectSuppliedPrimaryAppServerVerification(contract, condition, stream, identity) {
  const fail = () => ({ status: 'unavailable', reason: 'supplied_app_server_verification_incomplete_or_invalid',
    evidence_class: 'supplied_unattested_app_server_segment', runtime_attestation: 'unknown',
    execution_authority: false, scoring_authority: false, formal_aggregate_eligible: false, observations: [] });
  try {
    assert.equal(contract.kind, 'ask_primary_execution_inputs_v2');
    assert.deepEqual(Object.keys(identity).sort(), ['threadId', 'turnId']);
    for (const id of Object.values(identity)) assert.ok(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(id));
    assert.ok(Buffer.isBuffer(stream) && stream.length > 0 && stream.length <= 1024 * 1024);
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(stream).split('\n'); assert.equal(lines.pop(), '');
    assert.ok(lines.length > 0 && lines.length <= 256);
    const normalized = [], rawPairs = new Map();
    for (const [index, line] of lines.entries()) {
      const notification = parseJsonRejectDuplicateKeys(line), { method, params } = notification;
      assert.deepEqual(Object.keys(notification).sort(), ['method', 'params']);
      const started = method === 'item/started'; assert.ok(started || method === 'item/completed');
      assert.deepEqual(Object.keys(params).sort(), ['item', 'threadId', 'turnId', started ? 'startedAtMs' : 'completedAtMs'].sort());
      assert.equal(params.threadId, identity.threadId); assert.equal(params.turnId, identity.turnId);
      const timestamp = params[started ? 'startedAtMs' : 'completedAtMs']; assert.ok(Number.isSafeInteger(timestamp) && timestamp >= 0);
      const item = params.item;
      const required = ['type', 'id', 'command', 'cwd', 'status', 'commandActions'];
      const optional = ['pluginId', 'scriptPath', 'processId', 'source', 'aggregatedOutput', 'exitCode', 'durationMs'];
      assert.ok(required.every(key => Object.hasOwn(item, key)) && Object.keys(item).every(key => required.includes(key) || optional.includes(key)));
      assert.equal(item.type, 'commandExecution');
      // 0.162.1's generated wire schema declares default source=agent. This is
      // metadata decoding only; a supplied segment still has no authority.
      if (Object.hasOwn(item, 'source')) assert.equal(item.source, 'agent');
      for (const key of ['pluginId', 'scriptPath']) if (Object.hasOwn(item, key)) assert.equal(item[key], null);
      assert.ok(item.processId === undefined || item.processId === null || (typeof item.processId === 'string' && item.processId.length <= 128));
      // Parsed actions are descriptive metadata only. They cannot turn an
      // undeclared command into verification; the exact command check follows.
      assert.ok(Array.isArray(item.commandActions) && item.commandActions.length <= 64);
      for (const action of item.commandActions) {
        const fields = { read: ['type', 'command', 'name', 'path'], listFiles: ['type', 'command', 'path'],
          search: ['type', 'command', 'query', 'path'], unknown: ['type', 'command'] };
        assert.ok(Object.hasOwn(fields, action.type)); assert.deepEqual(Object.keys(action).sort(), [...fields[action.type]].sort());
        for (const [key, value] of Object.entries(action)) assert.ok(typeof value === 'string'
          || (['path', 'query'].includes(key) && action.type !== 'read' && value === null));
      }
      assert.ok(item.aggregatedOutput === undefined || item.aggregatedOutput === null || typeof item.aggregatedOutput === 'string');
      if (started) {
        assert.equal(item.status, 'inProgress'); assert.ok(item.exitCode === undefined || item.exitCode === null);
        assert.ok(item.durationMs === undefined || item.durationMs === null);
        assert.ok(!rawPairs.has(item.id)); rawPairs.set(item.id, { start_timestamp: timestamp, start_line: index + 1, start_digest: hash(Buffer.from(line)) });
      } else {
        assert.equal(item.status, 'completed'); assert.equal(item.exitCode, 0);
        assert.ok(item.durationMs === undefined || item.durationMs === null || (Number.isSafeInteger(item.durationMs) && item.durationMs >= 0));
        const pair = rawPairs.get(item.id); assert.ok(pair && pair.completion_line === undefined && timestamp >= pair.start_timestamp);
        Object.assign(pair, { completion_line: index + 1, completion_digest: hash(Buffer.from(line)) });
      }
      normalized.push({ type: started ? 'item.started' : 'item.completed', item: { type: 'command_execution', id: item.id,
        command: item.command, cwd: item.cwd, status: started ? 'in_progress' : 'completed', exit_code: started ? null : item.exitCode } });
    }
    const result = inspectSuppliedPrimaryVerificationProvenance(contract, condition, Buffer.from(normalized.map(item => JSON.stringify(item)).join('\n') + '\n'));
    assert.equal(result.status, 'supplied_verification_segment_complete');
    return { ...result, evidence_class: 'supplied_unattested_app_server_segment', source_stream_digest: hash(stream),
      observations: result.observations.map(observation => ({ ...observation,
        start_digest: hash(Buffer.from(lines[observation.start_line - 1])),
        completion_digest: hash(Buffer.from(lines[observation.completion_line - 1])) })),
      source_contract: 'openai/codex@092d3acd6bec3e3a14bdc7e7a2810ab628ab759d', raw_pair_pins: [...rawPairs.values()] };
  } catch { return fail(); }
}
