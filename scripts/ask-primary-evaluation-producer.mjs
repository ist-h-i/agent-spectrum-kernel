import {PRIMARY_RUNTIME_V10_REVISION, buildPrimaryRuntimeV10Binding, assertPrimaryRuntimeV10ScoringAuthority} from './ask-primary-runtime-v10.mjs';
// Faithful offline conversion of retained single-shot bytes. No model, shell,
// private evaluator, ownership recovery, grant or admission mutation occurs.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { normalizeRuntimeObservationCarrier } from './ask-benchmark-runtime-observation.mjs';
import { buildPrimaryFixtureRecipe } from './ask-primary-fixture-recipe.mjs';
import { buildCodexCommandEvidence, buildUnavailableCommandEvidence, commandEvidenceFailureReason, commandEvidenceFailureDiagnostic, commandEvidenceRetainedUnsafeActions, PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION, validateVerificationCommandContract, validateCommandEvidenceManifest } from './ask-benchmark-command-evidence.mjs';
import { captureTerminalWorkspaceInventory, buildTerminalWorkspaceAuthority, readVerifiedTerminalWorkspaceAuthority } from './ask-benchmark-terminal-workspace.mjs';
import { normalizePortfolioExecution, verifyNormalizedPortfolioResults } from './ask-benchmark-normalized-results.mjs';
import { materializeVerifiedTerminalCandidate } from './ask-benchmark-terminal-candidate.mjs';
import { verifyPortfolioScoringRootLineage, verifyEvaluatorAuthority, verifyPublicEvaluatorReference, verifyPrivateEvaluatorBundle,
  readEvaluatorAuthorityAnchorFromFreeze, createProductionSealedEvaluatorExecution } from './ask-benchmark-evaluator-boundary.mjs';
import { scorePrimaryEvaluatorResult } from './ask-primary-engineering-safety.mjs';
import { PRIMARY_PROFILE_SCHEMAS, withPrimarySchemaBuild, withPrimaryEvaluationProducer } from './ask-primary-evaluation-scope.mjs';

import { primaryScoringRoot, primaryProcessingSelection, verifyPrimaryScoringVersionResource, isPrimaryScoringFixtureId } from './ask-primary-scoring-version.mjs';

import { primaryProfileForKernel, primaryProfileForRequest } from './ask-primary-evaluation-profile.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), LIMIT = 33554432;
const read = path => readStableFile(path, 'primary producer retained evidence', LIMIT).bytes;
const json = path => parseJsonRejectDuplicateKeys(read(path).toString('utf8'));
const bytes = value => Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + '\n');
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`, same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const safe = path => typeof path === 'string' && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && path.split('/').every(part => part && part !== '.' && part !== '..');
function write(root, path, value, mode = 0o600) { assert.ok(safe(path)); const target = join(root, path); mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); writeFileSync(target, bytes(value), { flag: 'wx', mode }); }
function entries(root, prefix = '') {
  const result = {};
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (path === 'normalized' || path === 'producer.json') continue;
    assert.ok(safe(path)); const target = join(root, path), stat = lstatSync(target);
    assert.equal(realpathSync(target), target); assert.ok(!stat.isSymbolicLink());
    if (stat.isDirectory()) Object.assign(result, entries(root, path));
    else { assert.ok(stat.isFile() && stat.nlink === 1); const raw = read(target); result[path] = { bytes: raw.length, digest: hash(raw), mode:stat.mode&0o777 }; }
  }
  return result;
}
export function primaryProducerSources() {
  const paths = ['scripts/ask-primary-evaluation-producer.mjs', 'scripts/ask-primary-evaluation-scope.mjs',
    'scripts/ask-primary-evaluation-private-grading.mjs', 'scripts/ask-primary-evaluation-profile.mjs',
    'scripts/ask-primary-evaluation-grading.mjs', 'scripts/generate-ask-primary-grading-schemas.mjs',
    'scripts/ask-benchmark-schema.mjs', 'scripts/ask-benchmark-normalized-results.mjs', 'scripts/ask-benchmark-execution.mjs',
    'scripts/ask-benchmark-evaluator-boundary.mjs', 'scripts/ask-benchmark-command-evidence.mjs', 'scripts/ask-benchmark-terminal-workspace.mjs',
    'scripts/ask-benchmark-terminal-candidate.mjs', 'scripts/ask-benchmark-portfolio-score.mjs',
    ...PRIMARY_PROFILE_SCHEMAS.flatMap(name => [`benchmarks/schemas/${name}.schema.json`, `benchmarks/schemas/primary-${name}.schema.json`, `benchmarks/schemas/primary-k2-${name}.schema.json`]),
    'benchmarks/schemas/primary-saved-v2-portfolio-command-evidence.schema.json', 'benchmarks/schemas/primary-k2-saved-v2-portfolio-command-evidence.schema.json',
    'benchmarks/schemas/primary-saved-v3-portfolio-command-evidence.schema.json', 'benchmarks/schemas/primary-k2-saved-v3-portfolio-command-evidence.schema.json',
    'benchmarks/schemas/primary-saved-v4-portfolio-command-evidence.schema.json', 'benchmarks/schemas/primary-k2-saved-v4-portfolio-command-evidence.schema.json',
    'benchmarks/schemas/primary-saved-v5-portfolio-command-evidence.schema.json', 'benchmarks/schemas/primary-k2-saved-v5-portfolio-command-evidence.schema.json',
    'benchmarks/schemas/primary-saved-v6-portfolio-command-evidence.schema.json', 'benchmarks/schemas/primary-k2-saved-v6-portfolio-command-evidence.schema.json',
    'benchmarks/schemas/primary-saved-v7-portfolio-command-evidence.schema.json', 'benchmarks/schemas/primary-k2-saved-v7-portfolio-command-evidence.schema.json',
    ...['primary','primary-k2'].flatMap(prefix=>['portfolio-command-evidence','normalized-portfolio-result','evaluator-result-envelope','portfolio-engineering-result'].map(name=>`benchmarks/schemas/${prefix}-saved-v8-${name}.schema.json`)),
    ...['primary','primary-k2'].flatMap(prefix=>['portfolio-command-evidence','normalized-portfolio-result','evaluator-result-envelope','portfolio-engineering-result'].map(name=>`benchmarks/schemas/${prefix}-saved-v9-${name}.schema.json`)),
    ...['primary','primary-k2'].flatMap(prefix=>['portfolio-command-evidence','normalized-portfolio-result','evaluator-result-envelope','portfolio-engineering-result'].map(name=>`benchmarks/schemas/${prefix}-saved-v10-${name}.schema.json`)),
    'benchmarks/schemas/primary-runtime-v10-binding.schema.json',
    'benchmarks/schemas/primary-saved-v7-evaluator-result-envelope.schema.json', 'benchmarks/schemas/primary-k2-saved-v7-evaluator-result-envelope.schema.json'];
  const all=new Set([...paths,'scripts/ask-primary-fixture-recipe.mjs','benchmarks/adaptive-portfolio.config.json',
    'benchmarks/schemas/runtime-observation-carrier.schema.json',
    'benchmarks/portfolio-catalog.json','benchmarks/portfolio-policy-manifest.json','benchmarks/portfolio-scoring-policy.json']);
  const pending=[...all].filter(path=>path.endsWith('.mjs'));
  // Reuse the existing Core producer's local-import source-pin convention.
  // This reads code bytes only; it does not import or execute dependencies.
  while(pending.length){const path=pending.pop();for(const match of read(join(ROOT,path)).toString('utf8').matchAll(/(?<!["'`])(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"'\r\n]+)["']/gu)){
    if(isBuiltin(match[1]))continue;assert.ok(match[1].startsWith('.'),'primary external source import refused');
    const ref=posix.normalize(posix.join(posix.dirname(path),match[1]));assert.ok(safe(ref));
    if(!all.has(ref)){all.add(ref);if(ref.endsWith('.mjs'))pending.push(ref);}
  }}
  return Object.fromEntries([...all].sort().map(path=>[path,hash(read(join(ROOT,path)))]));
}
const executionOptions = root => ({ root: resolve(ROOT), config: null, planPath: join(root, 'plan.json'), materializedPath: join(root, 'materialized'), selectionState: join(root, 'selection'), runDir: join(root, 'run') });
function identifiers(request) {
  const profile = primaryProfileForRequest(request);
  const h = canonicalDigest({ run_id: request.run_id, plan_digest: request.plan_digest, fixture: request.fixture_id }).slice(7);
  return { run: `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`,
    block: `block-${h.slice(0,16)}-${h.slice(16,28)}`, cases: Object.fromEntries(profile.conditions.map(c => [c, `case-${h.slice(0,16)}-${canonicalDigest(c).slice(7,23)}`])) };
}
async function checkedSource(block, evaluationVersion = null) {
  assert.ok(isPrimaryScoringFixtureId(block.fixture_id, { evaluationVersion }), 'primary fixture set is closed');
  const [{ exportPrimaryEvaluationGradingRequest }, { readUserComparisonPlan }, { inventoryUserTree }] = await Promise.all([
    import('./ask-primary-evaluation-grading.mjs'), import('./ask-user-comparison.mjs'), import('./ask-user-comparison-prepare.mjs')]);
  const exported = exportPrimaryEvaluationGradingRequest(block), loaded = readUserComparisonPlan(block.root);
  const request = exported.request;
  const snapshots = {}, references = {};
  const retainedRead = path => { const checked=readStableFile(path,'primary retained original',LIMIT),raw=checked.bytes;
    references[path] = { bytes: raw.length, digest: hash(raw),mode:checked.evidence.finalPath.mode }; return raw; };
  const retainTree = path => { if (!existsSync(path)) return; const stat = lstatSync(path); assert.ok(!stat.isSymbolicLink());
    if (stat.isDirectory()) for (const name of readdirSync(path)) retainTree(join(path, name)); else retainedRead(path); };
  for (const path of ['control/plan.json','control/plan.digest','control/task.md','inputs/prompt.md','control/verification.json','control/node-test-reporter.mjs',
    'control/kernel-principles-source.md','control/kernel-principles-renderer.mjs','control/kernel-principles-task-metadata.json','control/kernel-principles-renderer-closure',
    'control/personal-prompt-asset.json','inputs/full_ask-prompt.md','control/start.json','control/start.digest','control/history','control/leases']) retainTree(join(block.root,path));
  retainedRead(block.input_manifest.path);
  if (block.grading?.scoring_version) retainedRead(block.grading.scoring_version.path);
  for (const slot of request.slots) {
    const condition = slot.condition, arm = loaded.plan.arms[condition], baseRoot = join(block.root, arm.baseline_path);
    assert.deepEqual(inventoryUserTree(baseRoot), arm.baseline_inventory, 'primary baseline changed');
    const baseline = Object.fromEntries(Object.entries(arm.baseline_inventory).map(([path, entry]) => { assert.ok(safe(path)); const original_path = join(baseRoot,path);
      return [path, { bytes: retainedRead(original_path), mode: entry.mode, original_path }]; }));
    let terminal = null;
    if (slot.terminal_digest) {
      assert.equal(request.controller.state, 'available', 'primary controller closure unknown');
      assert.equal(request.controller.start_consumed, true, 'primary saved start required');
      assert.equal(slot.controller_checkpoint_digest, slot.terminal_digest, 'primary controller checkpoint required');
      assert.equal(slot.process_completed, true); assert.equal(slot.unresolved_child, false, 'primary child termination unknown');
      if (request.evidence_kind === 'observed') assert.equal(arm.capability.status, 'available', 'primary observed capability unavailable');
      assert.ok(slot.artifacts['changes.json'], 'saved whole-tree inventory required');
      if(slot.state==='completed')assert.ok(slot.artifacts['last-message.txt'],'completed primary slot needs saved response bytes');
      retainTree(join(block.root,'control/slots',condition));
      const changes = json(join(block.root, 'control/slots', condition, 'changes.json'));
      assert.deepEqual(changes.before, arm.baseline_inventory);
      assert.ok(same(changes.scope, slot.scope), 'scope receipt differs from whole-tree inventory');
      terminal = {};
      for (const [path, entry] of Object.entries(changes.after)) {
        assert.ok(safe(path));
        const unchanged = same(changes.before[path] ?? null, entry);
        const source = unchanged ? join(baseRoot, path) : join(block.root, 'control/patch-workspaces', condition, path);
        const raw = retainedRead(source); assert.equal(raw.length, entry.bytes, 'retained terminal bytes changed'); assert.equal(hash(raw), entry.digest, 'retained terminal bytes changed');
        terminal[path] = { bytes: raw, mode: entry.mode, original_path: source };
      }
      // The patch copy is only a source of changed file bytes; no Git execution.
      // Missing snapshots/changed bytes cannot be replaced with verifier output.
    }
    snapshots[condition] = { baseline, terminal };
  }
  return { ...exported, loaded, snapshots, references };
}
function snapshotDigest(snapshots) {
  return canonicalDigest(Object.fromEntries(Object.entries(snapshots).map(([condition, item]) => [condition,
    Object.fromEntries(Object.entries(item).map(([kind, tree]) => [kind, tree === null ? null : Object.fromEntries(Object.entries(tree).map(([path, f]) => [path, { bytes: f.bytes.length, digest: hash(f.bytes), mode: f.mode }]))]))])));
}
/** Read-only source closure for saved-result preparation. No derived records,
 * normalization, grading workers or model/controller operations are performed. */
export async function inspectPrimaryEvaluationSource(block) {
  const source = await checkedSource(block);
  return { request: source.request, request_digest: source.request_digest, snapshot_digest: snapshotDigest(source.snapshots),
    references: structuredClone(source.references), source_repository: source.loaded.plan.source.repo ?? null,
    producer_normalizations: 0, model_calls: 0, grader_process_starts: 0 };
}
function typedUsage(metrics) { return { metrics: Object.fromEntries(['input_tokens','output_tokens','cached_tokens'].map(name => {
  const value = metrics?.[name]; return [name, Number.isSafeInteger(value) && value >= 0 ? { status: 'known', value, reason: 'saved_controller_usage' } : { status: 'unknown', value: null, reason: 'usage_not_observed' }]; })) }; }
function derive(target, source, parserRevision = PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION) {
  const { request, loaded, snapshots } = source, ids = identifiers(request), fixture = json(join(ROOT, 'benchmarks/adaptive-portfolio.config.json')).fixtures.find(f => f.id === request.fixture_id);
  assert.ok(fixture);
  const contract = validateVerificationCommandContract(json(join(ROOT, `benchmarks/fixtures/checkpoint-b2/${request.fixture_id}/verification-command-contract.json`)), { root: ROOT });
  const profile = primaryProfileForRequest(request);
  assert.equal(primaryProfileForKernel(loaded.plan.config.kernel_condition).id, profile.id, 'primary retained plan profile changed');
  assert.deepEqual(Object.keys(loaded.plan.arms).sort(), [...profile.conditions].sort(), 'primary retained plan arms changed');
  assert.deepEqual(Object.keys(snapshots).sort(), [...profile.conditions].sort(), 'primary retained snapshots changed');
  const cases = request.conditions.map((condition, index) => ({ case_id: ids.cases[condition], adapter_track: 'codex', condition,
    fixture_id: request.fixture_id, input_manifest_sha256: request.fixture_input_digest.slice(7), suite: fixture.suite, task_class: fixture.task_class,
    difficulty: fixture.difficulty, registered_repetitions: fixture.repetitions, aggregate_eligible: fixture.aggregate_eligible,
    repetition: 1, condition_order_position: index + 1, block_id: ids.block }));
  const planBase = { kind: 'ask_primary_derived_portfolio_plan_v1', comparison_run_id: request.run_id, comparison_plan_digest: request.plan_digest,
    comparison_scope: 'practical_three_conditions_one_repetition', formal_aggregate_eligible: false,
    grading_export_digest: source.request_digest, cases }, plan = { ...planBase, plan_id: `plan-${canonicalDigest(planBase).slice(7)}` };
  const materialization = { kind: 'ask_primary_derived_materialization_v1', plan_id: plan.plan_id, comparison_plan_digest: request.plan_digest };
  const selection = { kind: 'ask_primary_derived_selection_v1', plan_id: plan.plan_id, policy: 'fixed_primary_no_adaptive_selection', selections: [] };
  const identity = { run_instance_id: ids.run, repository_revision: loaded.plan.source.commit, plan_id: plan.plan_id,
    materialization_manifest_digest: hash(bytes(materialization)), selection_state_digest: hash(bytes(selection)), origin: 'saved_primary_comparison_conversion' };
  const adapter = { adapter: 'codex', effective_command: { origin: 'saved_primary_comparison', comparison_plan_digest: request.plan_digest },
    environment_snapshot: { entries: [] }, environment_observation: 'unknown', unavailable_reason: null, thermal_state: 'unknown',
    model: loaded.plan.config.model, reasoning_effort: loaded.plan.config.reasoning, sandbox_policy: 'workspace-write', permission_policy: 'unknown',
    policy_observation: 'ordinary_global_and_provider_configuration_not_observed', model_observation: 'requested_configuration_only' };
  const output = new Map([['plan.json', plan], ['materialized/materialization-manifest.json', materialization], ['selection/selection-state.json', selection],
    ['run/run-identity.json', identity], ['run/adapters/codex.json', adapter]]), inspected = [];
  for (const entry of cases) {
    const condition = entry.condition, slot = request.slots.find(s => s.condition === condition), snapshot = snapshots[condition];
    const state = { status: 'pending', attempt_count: 0, terminal_attempt: null, origin: 'saved_primary_comparison_conversion' }, attempts = [];
    if (snapshot.terminal) {
      const prefix = `run/cases/${entry.case_id}/attempts/0001/`, folder = join(loaded.root, 'control/slots', condition);
      const stdout = read(join(folder, 'stdout.jsonl')), stderr = read(join(folder, 'stderr.log'));
      const final = slot.artifacts['last-message.txt'] ? read(join(folder, 'last-message.txt')) : null;
      const terminalIdentity = { run_instance_id: ids.run, case_id: entry.case_id, attempt: '0001', adapter: 'codex', condition,
        fixture_id: request.fixture_id, fixture_input_digest: request.fixture_input_digest, materialization_manifest_digest: identity.materialization_manifest_digest };
      const baseSnapshot = captureTerminalWorkspaceInventory(join(target, 'materialized', entry.case_id));
      const managed = loaded.plan.arms[condition].assets.map(asset => asset.path).sort();
      const terminal = buildTerminalWorkspaceAuthority({ root: ROOT, baseSnapshot, terminalWorkspaceRoot: join(target, 'terminal', entry.case_id), identity: terminalIdentity, managedAssetPaths: managed });
      const r = { ...terminalIdentity, origin: 'saved_primary_comparison_conversion', comparison_terminal_digest: slot.terminal_digest,
        projection: { capability_downgrades: [], inventory: [] }, agent: { autonomous_agents_started: 0 }, selection: null };
      const commandIdentity = { ...terminalIdentity, repetition: 1, verification_command_contract_digest: contract.contract_digest,
        runtime_identity_digest: canonicalDigest(adapter), effective_command_digest: canonicalDigest(adapter.effective_command) };
      let editContext = {};
      if ([PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION].includes(parserRevision)) {
        const arm = loaded.plan.arms[condition];
        assert.equal(arm.path, `arms/${condition}`, 'primary v4 exact source arm path required');
        const paths = [...new Set([...Object.keys(snapshot.baseline), ...Object.keys(snapshot.terminal)])];
        editContext = { candidateWorkspaceRoot: join(loaded.root, arm.path),
          candidateChangePaths: buildPrimaryFixtureRecipe(request.fixture_id).mutable_paths,
          candidateChanges: paths.filter(path => { const before=snapshot.baseline[path], after=snapshot.terminal[path];
            return !before || !after || before.mode !== after.mode || !before.bytes.equals(after.bytes); })
            .map(path => ({path,kind:!snapshot.baseline[path]?'add':!snapshot.terminal[path]?'delete':'update'})) };
      }
      if ([PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION].includes(parserRevision)) editContext.auxiliaryReadInputManifest = read(join(ROOT, `benchmarks/fixtures/checkpoint-b2/${request.fixture_id}/input-manifest.json`));
      let commands;
      try { commands = buildCodexCommandEvidence({ identity: commandIdentity, stream: stdout, contract, parserRevision,
        candidateChangePaths: parserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION
          ? buildPrimaryFixtureRecipe(request.fixture_id).mutable_paths : [], ...editContext }); }
      catch (error) { commands = buildUnavailableCommandEvidence({ identity: commandIdentity, support: 'supported', probe: 'capture_invalid', reason: commandEvidenceFailureReason(error,{parserRevision}), stream: stdout, parserRevision, failureDiagnostic: commandEvidenceFailureDiagnostic(error,{parserRevision}), retainedUnsafeActions: commandEvidenceRetainedUnsafeActions(error,{parserRevision}) }); }
      validateCommandEvidenceManifest(commands, { root: ROOT, contract });
      // The original normalized outcome is the model CLI outcome. Independent
      // controller checks and scope findings remain supplemental receipts.
      const status = slot.process_completed === true && slot.exit_code === 0 ? 'completed' : slot.state === 'interrupted' ? 'interrupted' : 'failed';
      const result = { status, duration_ms: slot.usage?.metrics?.duration_ms ?? null, exit_code: slot.exit_code,
        final_output: final ? { path: 'primary-response.txt', format:'primary_plain_utf8_response_v1', bytes: final.length, sha256: hash(final).slice(7) } : null,
        stdout: { bytes: stdout.length, sha256: hash(stdout).slice(7) }, stderr: { bytes: stderr.length, sha256: hash(stderr).slice(7) },
        event_counts: { json_lines: stdout.toString('utf8').split('\n').filter(Boolean).length }, failure_kind: status === 'completed' ? null : 'saved_primary_model_process_failed_or_unknown',
        saved_controller_state: slot.state, saved_controller_scope: slot.scope,
        primary_capture_usage: typedUsage(slot.usage?.metrics), terminal_workspace_authority_availability: 'captured', terminal_workspace_authority_support: 'supported',
        terminal_workspace_authority_digest: terminal.authority.authority_digest, terminal_workspace_tree_digest: terminal.authority.terminal_candidate_tree_digest,
        terminal_workspace_authority_bytes: terminal.bytes.length, origin: 'saved_primary_comparison_conversion' };
      const commit = { kind: 'ask_primary_derived_terminal_commit_v1', request_digest: hash(bytes(r)), result_digest: hash(bytes(result)),
        command_evidence_digest: hash(bytes(commands)), comparison_terminal_digest: slot.terminal_digest };
      const evidence = { request_digest: hash(bytes(r)), result_digest: hash(bytes(result)), commit_digest: hash(bytes(commit)), command_evidence_digest: hash(bytes(commands)),
        final_output_digest: final ? hash(final) : null, final_output_bytes: final?.length ?? null,
        ...Object.fromEntries(Object.entries(result).filter(([key]) => key.startsWith('terminal_workspace_'))) };
      Object.assign(state, { status, attempt_count: 1, terminal_attempt: '0001' });
      attempts.push({ attempt: '0001', request: r, result, evidence, commandEvidence: commands, verificationCommandContract: contract, nativeEventStream: Buffer.from(stdout),
        terminalWorkspaceAuthority: terminal, expectedBaseInventory: baseSnapshot.inventory.filter(f => f.file_type === 'regular_file'), expectedManagedAssetPaths: managed });
      for (const [name, value] of [['request.json', r], ['result.json', result], ['terminal-commit.json', commit], ['command-evidence.json', commands],
        ['terminal-workspace-authority.json', terminal.bytes], ['stdout.jsonl', stdout], ['stderr.log', stderr], ...(final ? [['primary-response.txt', final]] : [])]) output.set(prefix + name, value);
    }
    output.set(`run/cases/${entry.case_id}/state.json`, state); inspected.push({ entry, state, attempts });
  }
  return { output, inspection: { identity, plan, materialization: { manifestDigest: hash(bytes(materialization)) }, selections: { stateDigest: hash(bytes(selection)) },
    adapter_identities: new Map([['codex', adapter]]), cases: inspected } };
}

// A source-bound candidate record, not the historical execution producer token.
async function v10Source(block) {
  assert.equal(primaryProcessingSelection(block)?.command_evidence_parser_revision, PRIMARY_RUNTIME_V10_REVISION, 'V10 fixed selector required');
  const {readUserComparisonPlan}=await import('./ask-user-comparison.mjs');
  const loaded=readUserComparisonPlan(block.root);
  assert.equal(loaded.plan_digest,block.plan_digest,'V10 plan identity changed');
  assert.equal(loaded.plan.run_id,block.run_id,'V10 run identity changed');
  assert.equal(loaded.plan.verification.recipe.fixture_id,block.fixture_id,'V10 fixture changed');
  const binding=buildPrimaryRuntimeV10Binding({plan:loaded.plan,planDigest:loaded.plan_digest});
  const paths=['control/plan.json','control/plan.digest',...Object.values(loaded.plan.primary_execution_input.conditions).map(c=>c.input.path)];
  const references=Object.fromEntries(paths.map(path=>{const v=readStableFile(join(loaded.root,path),'V10 prepared input',LIMIT);return[path,{digest:hash(v.bytes),bytes:v.bytes.length,mode:v.evidence.finalPath.mode}];}));
  return {binding,references,loaded};
}
async function produceV10(block,outputRoot) {
  const source=await v10Source(block),target=resolve(outputRoot);assert.ok(!existsSync(target));assert.equal(realpathSync(dirname(target)),dirname(target));
  for(const input of [ROOT,source.loaded.root,source.loaded.plan.source.repo,primaryScoringRoot(block)].filter(Boolean)){
    const path=realpathSync(input);assert.ok(target!==path&&!target.startsWith(path+'/'),'V10 output overlaps an input');
  }
  mkdirSync(target,{mode:0o700});write(target,'runtime-binding.json',source.binding);
  const manifest={kind:'ask_primary_evaluation_producer_v10',command_evidence_parser_revision:PRIMARY_RUNTIME_V10_REVISION,preparation_only:true,block,
    binding_digest:source.binding.binding_digest,retained_input_references:source.references,source_digests:primaryProducerSources(),artifact_inventory:entries(target),
    runtime_attestation:'unknown',execution_permission:false,scoring_ready:false,formal_aggregate_eligible:false,model_calls:0,grader_process_starts:0};
  write(target,'producer.json',manifest);
  return {output_root:target,external_digest:hash(bytes(manifest)),normalized:null,preparation_only:true,scoring_ready:false,formal_aggregate_eligible:false,model_calls:0,grader_process_starts:0};
}
async function verifyV10(manifest,target) {
  assert.deepEqual(readdirSync(target).sort(),['producer.json','runtime-binding.json'],'V10 candidate output is closed');
  assert.deepEqual(Object.keys(manifest).sort(),['kind','command_evidence_parser_revision','preparation_only','block','binding_digest','retained_input_references','source_digests','artifact_inventory','runtime_attestation','execution_permission','scoring_ready','formal_aggregate_eligible','model_calls','grader_process_starts'].sort());
  assert.equal(manifest.command_evidence_parser_revision,PRIMARY_RUNTIME_V10_REVISION);assert.equal(manifest.preparation_only,true);assert.equal(manifest.runtime_attestation,'unknown');
  for(const name of ['execution_permission','scoring_ready','formal_aggregate_eligible'])assert.equal(manifest[name],false);
  assert.equal(manifest.model_calls,0);assert.equal(manifest.grader_process_starts,0);
  const source=await v10Source(manifest.block);
  assert.deepEqual(manifest.retained_input_references,source.references,'V10 retained input pins changed');
  assert.deepEqual(manifest.source_digests,primaryProducerSources(),'V10 producer source changed');assert.deepEqual(manifest.artifact_inventory,entries(target),'V10 artifact inventory changed');
  assert.deepEqual(read(join(target,'runtime-binding.json')),bytes(source.binding),'V10 runtime binding changed');assert.equal(manifest.binding_digest,source.binding.binding_digest);
  return {preparationOnly:true,binding:source.binding,block:manifest.block,commandEvidenceParserRevision:PRIMARY_RUNTIME_V10_REVISION,execution_permission:false,scoring_ready:false};
}

export async function producePrimaryEvaluationArtifacts(block, outputRoot, { commandEvidenceParserRevision, ...unknown } = {}) {
  const processing = primaryProcessingSelection(block);
  commandEvidenceParserRevision ??= processing?.command_evidence_parser_revision ?? PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION;
  if (processing) assert.equal(commandEvidenceParserRevision, processing.command_evidence_parser_revision, 'primary processing selector override refused');
  if(commandEvidenceParserRevision===PRIMARY_RUNTIME_V10_REVISION){assert.deepEqual(Object.keys(unknown),[],'V10 caller context override refused');return produceV10(block,outputRoot);}
  assert.ok([PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION].includes(commandEvidenceParserRevision), 'unsupported primary command evidence revision');
  if ([PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION].includes(commandEvidenceParserRevision)) assert.deepEqual(Object.keys(unknown), [], 'primary caller context override refused');
  const source = await checkedSource(block, processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION ? 'ask_primary_scoring_version_v9' : processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION ? 'ask_primary_scoring_version_v8' : processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION
    ? 'ask_primary_scoring_version_v7' : null), target = resolve(outputRoot);
  assert.ok(!existsSync(target)); assert.equal(realpathSync(dirname(target)), dirname(target));
  for (const input of [ROOT, block.root, block.public_input_root]) assert.ok(target !== resolve(input) && !target.startsWith(`${resolve(input)}/`), 'primary output overlaps authority');
  mkdirSync(target, { mode: 0o700 });
  const id = identifiers(source.request);
  for (const condition of source.request.conditions) for (const [kind, tree] of Object.entries(source.snapshots[condition])) if (tree) {
    const prefix = `${kind === 'baseline' ? 'materialized' : 'terminal'}/${id.cases[condition]}`;
    mkdirSync(join(target, prefix), { recursive: true, mode: 0o700 });
    for (const [path, file] of Object.entries(tree)) write(target, `${prefix}/${path}`, file.bytes, file.mode === '100755' ? 0o700 : 0o600);
  }
  const derived = withPrimarySchemaBuild(() => derive(target, source, commandEvidenceParserRevision), { profileId: primaryProfileForRequest(source.request).id, commandEvidenceParserRevision });
  for (const [path, value] of derived.output) write(target, path, value, path.endsWith('terminal-workspace-authority.json') ? 0o444 : 0o600);
  write(target, 'saved-grading-export.json', source.request);
  const retainedSource = { loaded: source.loaded, request_digest: source.request_digest, references: source.references,
    snapshots: Object.fromEntries(Object.entries(source.snapshots).map(([condition,item])=>[condition,Object.fromEntries(Object.entries(item).map(([kind,tree])=>[kind,
      tree === null ? null : Object.fromEntries(Object.entries(tree).map(([path,file])=>[path,{ original_path:file.original_path,bytes:file.bytes.length,digest:hash(file.bytes),mode:file.mode }]))]))])) };
  write(target, 'source-binding.json', retainedSource);
  const v2 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION;
  const v3 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION;
  const v4 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION;
  const v5 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION;
  const v6 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION;
  const v7 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION;
  const v9 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION;
  const v8 = commandEvidenceParserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION;
  const manifest = { kind: v9 ? 'ask_primary_evaluation_producer_v9' : v8 ? 'ask_primary_evaluation_producer_v8' : v7 ? 'ask_primary_evaluation_producer_v7' : v6 ? 'ask_primary_evaluation_producer_v6' : v5 ? 'ask_primary_evaluation_producer_v5' : v4 ? 'ask_primary_evaluation_producer_v4' : v3 ? 'ask_primary_evaluation_producer_v3' : v2 ? 'ask_primary_evaluation_producer_v2' : 'ask_primary_evaluation_producer_v1',
    ...(v2 || v3 || v4 || v5 || v6 || v7 || v8 || v9 ? { command_evidence_parser_revision: commandEvidenceParserRevision } : {}), evidence_kind: source.request.evidence_kind, response_format:'primary_plain_utf8_response_v1', block, grading_export_digest: source.request_digest,
    snapshot_digest: snapshotDigest(source.snapshots), source_digests: primaryProducerSources(), artifact_inventory: entries(target),
    execution_permission: false, scoring_ready: false, formal_aggregate_eligible: false, model_calls: 0, grader_process_starts: 0 };
  write(target, 'producer.json', manifest); const options = { recordRoot: target, externalDigest: hash(bytes(manifest)) };
  const normalized = withPrimaryEvaluationProducer(options, verified => normalizePortfolioExecution({ ...verified.executionOptions, outputPath: join(target, 'normalized') }));
  return { output_root: target, external_digest: options.externalDigest, normalized, scoring_ready: false, formal_aggregate_eligible: false, model_calls: 0, grader_process_starts: 0 };
}
/** Candidate consistency readback only; never the verified execution producer token. */
export async function verifyPrimaryRuntimeV10Preparation(options) {
  assert.deepEqual(Object.keys(options).sort(),['externalDigest','recordRoot']);
  const target=resolve(options.recordRoot);assert.equal(realpathSync(target),target);
  const raw=read(join(target,'producer.json'));assert.equal(hash(raw),options.externalDigest,'V10 external producer pin changed');
  const manifest=parseJsonRejectDuplicateKeys(raw.toString('utf8'));assert.equal(manifest.kind,'ask_primary_evaluation_producer_v10');
  return verifyV10(manifest,target);
}
export function verifyPrimaryEvaluationProducer(options) {
  assert.deepEqual(Object.keys(options).sort(), ['externalDigest', 'recordRoot']);
  const target = resolve(options.recordRoot); assert.equal(realpathSync(target), target);
  const raw = read(join(target, 'producer.json')); assert.equal(hash(raw), options.externalDigest, 'primary external producer pin changed');
  const manifest = parseJsonRejectDuplicateKeys(raw.toString('utf8'));
  if(manifest.kind==='ask_primary_evaluation_producer_v10')assertPrimaryRuntimeV10ScoringAuthority(manifest);
  assert.ok(['ask_primary_evaluation_producer_v1', 'ask_primary_evaluation_producer_v2', 'ask_primary_evaluation_producer_v3', 'ask_primary_evaluation_producer_v4', 'ask_primary_evaluation_producer_v5', 'ask_primary_evaluation_producer_v6', 'ask_primary_evaluation_producer_v7', 'ask_primary_evaluation_producer_v8', 'ask_primary_evaluation_producer_v9'].includes(manifest.kind), 'unknown primary producer version');
  const commandEvidenceParserRevision = manifest.kind !== 'ask_primary_evaluation_producer_v1' ? manifest.command_evidence_parser_revision : PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION;
  if (manifest.kind === 'ask_primary_evaluation_producer_v9') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION, 'primary v9 parser revision changed');
  else if (manifest.kind === 'ask_primary_evaluation_producer_v8') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, 'primary v8 parser revision changed');
  else if (manifest.kind === 'ask_primary_evaluation_producer_v7') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, 'primary v7 parser revision changed');
  else if (manifest.kind === 'ask_primary_evaluation_producer_v6') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, 'primary v6 parser revision changed');
  else if (manifest.kind === 'ask_primary_evaluation_producer_v5') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION, 'primary v5 parser revision changed');
  else if (manifest.kind === 'ask_primary_evaluation_producer_v4') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, 'primary v4 parser revision changed');
  else if (manifest.kind === 'ask_primary_evaluation_producer_v3') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION, 'primary v3 parser revision changed');
  else if (manifest.kind === 'ask_primary_evaluation_producer_v2') assert.equal(commandEvidenceParserRevision, PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, 'primary v2 parser revision changed');
  else assert.equal(Object.hasOwn(manifest, 'command_evidence_parser_revision'), false, 'legacy primary producer cannot select a new parser');
  const processing = primaryProcessingSelection(manifest.block);
  assert.ok(isPrimaryScoringFixtureId(manifest.block.fixture_id, { evaluationVersion:
    manifest.kind === 'ask_primary_evaluation_producer_v9' && processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION ? 'ask_primary_scoring_version_v9' : manifest.kind === 'ask_primary_evaluation_producer_v8' && processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION ? 'ask_primary_scoring_version_v8' : manifest.kind === 'ask_primary_evaluation_producer_v7' && processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION
      ? 'ask_primary_scoring_version_v7' : null }), 'primary fixture set is closed');
  if (processing) assert.equal(commandEvidenceParserRevision, processing.command_evidence_parser_revision, 'primary producer differs from fixed processing selector');
  assert.equal(manifest.execution_permission, false); assert.equal(manifest.scoring_ready, false);
  assert.equal(manifest.response_format,'primary_plain_utf8_response_v1');
  assert.equal(manifest.formal_aggregate_eligible,false);
  assert.equal(manifest.model_calls, 0); assert.equal(manifest.grader_process_starts, 0); assert.ok(same(manifest.source_digests, primaryProducerSources()), 'primary producer sources changed');
  assert.ok(same(entries(target), manifest.artifact_inventory), 'primary producer artifact inventory changed');
  const retained = json(join(target,'source-binding.json'));
  for(const [path,entry]of Object.entries(retained.references)){const checked=readStableFile(path,'primary retained original',LIMIT),raw=checked.bytes;
    assert.equal(checked.evidence.finalPath.mode,entry.mode,'primary original evidence mode changed');assert.equal(raw.length,entry.bytes,'primary original evidence changed');assert.equal(hash(raw),entry.digest,'primary original evidence changed');}
  const snapshots=Object.fromEntries(Object.entries(retained.snapshots).map(([condition,item])=>[condition,Object.fromEntries(Object.entries(item).map(([kind,tree])=>[kind,
    tree === null ? null : Object.fromEntries(Object.entries(tree).map(([path,file])=>{assert.ok(retained.references[file.original_path]);const raw=read(file.original_path);assert.equal(hash(raw),file.digest);assert.equal(raw.length,file.bytes);return[path,{bytes:raw,mode:file.mode,original_path:file.original_path}];}))]))]));
  const source={request:json(join(target,'saved-grading-export.json')),request_digest:retained.request_digest,loaded:retained.loaded,snapshots};
  assert.equal(source.loaded.plan_digest,manifest.block.plan_digest);assert.equal(source.loaded.plan.run_id,manifest.block.run_id);
  assert.equal(hash(Buffer.from(JSON.stringify(source.request,null,2)+'\n')),source.request_digest,'primary grading export changed');
  assert.equal(source.request.evidence_kind, manifest.evidence_kind);
  assert.deepEqual(source.request.binding, manifest.block.grading.binding, 'primary saved request block binding changed');
  assert.deepEqual(source.request.scoring_version, manifest.block.grading.scoring_version, 'primary scoring version selector changed');
  primaryScoringRoot(manifest.block);
  assert.equal(source.request_digest, manifest.grading_export_digest); assert.equal(snapshotDigest(source.snapshots), manifest.snapshot_digest);
  const id = identifiers(source.request);
  for (const condition of source.request.conditions) for (const [kind, tree] of Object.entries(source.snapshots[condition])) if (tree) {
    const prefix = `${kind === 'baseline' ? 'materialized' : 'terminal'}/${id.cases[condition]}`;
    for (const [path, file] of Object.entries(tree)) assert.deepEqual(read(join(target, prefix, path)), file.bytes, 'primary copied snapshot differs from original');
  }
  const derived = withPrimarySchemaBuild(() => derive(target, source, commandEvidenceParserRevision), { profileId: primaryProfileForRequest(source.request).id, commandEvidenceParserRevision });
  for (const [path, value] of derived.output) assert.deepEqual(read(join(target, path)), bytes(value), 'primary derived record changed');
  return { inspection: derived.inspection, executionOptions: executionOptions(target), request: source.request, evidence_kind: manifest.evidence_kind, source_digests:manifest.source_digests,
    block: manifest.block, commandEvidenceParserRevision, originalSourceRepository: source.loaded.plan.source.repo ?? null, execution_permission: false, scoring_ready: false };
}
export function verifyPrimaryProducedTerminal(inspection, { root, runDir, caseId, attempt }) {
  const c = inspection.cases.find(value => value.entry.case_id === caseId), a = c?.attempts.find(value => value.attempt === attempt); assert.ok(a);
  const verified = readVerifiedTerminalWorkspaceAuthority({ root, authorityPath: join(runDir, 'cases', caseId, 'attempts', attempt, 'terminal-workspace-authority.json'),
    expected: { run_instance_id: inspection.identity.run_instance_id, case_id: caseId, attempt, adapter: 'codex', condition: c.entry.condition,
      fixture_id: c.entry.fixture_id, fixture_input_digest: `sha256:${c.entry.input_manifest_sha256}`, materialization_manifest_digest: inspection.materialization.manifestDigest },
    expectedBaseInventory: a.expectedBaseInventory, expectedManagedAssetPaths: a.expectedManagedAssetPaths });
  assert.ok(same(verified.authority, a.terminalWorkspaceAuthority.authority));
  return { ...verified, execution: { run_instance_id: inspection.identity.run_instance_id, case_id: caseId, attempt, adapter: 'codex', condition: c.entry.condition,
    fixture_id: c.entry.fixture_id, fixture_input_digest: `sha256:${c.entry.input_manifest_sha256}`, materialization_manifest_digest: inspection.materialization.manifestDigest,
    request_digest: a.evidence.request_digest, raw_result_digest: a.evidence.result_digest, terminal_commit_digest: a.evidence.commit_digest,
    ...Object.fromEntries(Object.entries(a.evidence).filter(([key]) => key.startsWith('terminal_workspace_'))) } };
}
export function materializePrimaryEvaluationCandidate(options, { condition, outputParent }) {
  return withPrimaryEvaluationProducer(options, verified => {
    assert.ok(primaryProfileForRequest(verified.request).conditions.includes(condition)); const outputPath = join(options.recordRoot, 'normalized');
    const normalized = verifyNormalizedPortfolioResults({ ...verified.executionOptions, outputPath });
    const entry = normalized.manifest.cases.find(c => c.condition === condition)?.normalized_attempts[0]; assert.ok(entry, 'primary condition not started');
    return materializeVerifiedTerminalCandidate({ ...verified.executionOptions, normalizedResultsPath: outputPath, sourceSnapshotDigest: normalized.manifest.source_snapshot_digest,
      normalizedResultId: entry.normalized_result_id, outputParent });
  });
}
export function buildPrimaryEvaluationScoringInputs(options, runtimeInputs = {}) {
  return withPrimaryEvaluationProducer(options, verified => buildPrimaryEvaluationScoringInputsWithinScope(options,runtimeInputs,verified));
}
// Explicit opt-in; existing producer and normalized records remain byte-exact.
export function normalizePrimaryRuntimeObservationCarrier(options, { observationRoot }) {
  return withPrimaryEvaluationProducer(options, verified => normalizeRuntimeObservationCarrier({
    ...verified.executionOptions, normalizedResultsPath: join(options.recordRoot, 'normalized'), observationRoot,
  }));
}
function buildPrimaryEvaluationScoringInputsWithinScope(options, { condition, frozenSourceRoot = null, privateRoot = null, privateEvaluationRoot = null, manifestPath = null,
  resultPath = null, privateEvaluationRecordPath = null, privateFragmentPath = null,
  runtimeObservationRoot = null,
  admissionDecisionPath = null, admissionReviewAuthorityPath = null, admissionReviewAuthoritySourceDigest = null, admissionReviewArchivePath = null }, verified) {
    assert.ok(primaryProfileForRequest(verified.request).conditions.includes(condition)); const normalizedResultsPath = join(options.recordRoot, 'normalized');
    const normalized = verifyNormalizedPortfolioResults({ ...verified.executionOptions, outputPath: normalizedResultsPath });
    verifyPortfolioScoringRootLineage({ ...verified.executionOptions, normalizedResultsPath }, normalized);
    const entry = normalized.manifest.cases.find(c => c.condition === condition)?.normalized_attempts[0]; assert.ok(entry, 'primary condition not started');
    const record = json(join(normalized.generationPath, entry.path)), freezePath = verified.request.public_grading_references.scoring_input_freeze.path;
    const selectedRoot = primaryScoringRoot(verified.block);
    const sourceRoot = frozenSourceRoot ?? selectedRoot;
    verifyPrimaryScoringVersionResource(verified.block, { frozenSourceRoot: sourceRoot, privateRoot, manifestPath, admissionDecisionPath,
      admissionReviewAuthorityPath, admissionReviewAuthoritySourceDigest, admissionReviewArchivePath });
    assert.equal(resolve(sourceRoot), sourceRoot, 'canonical source root required');
    const freeze = json(join(sourceRoot, freezePath)); assert.equal(hash(read(join(sourceRoot, freezePath))), verified.request.binding.scoring_input_freeze_digest);
    const paths = Object.fromEntries([['catalogPath','catalog'],['policyManifestPath','policy_manifest'],['scoringPolicyPath','scoring_policy'],
      ['admissionRecordPath','admission_record'],['requirementRecordPath','requirement_record'],['outputContractPath','output_contract'],['referencePath','evaluator_public_reference']]
      .map(([key, name]) => { assert.ok(safe(freeze[name].path)); return [key, join(sourceRoot, freeze[name].path)]; }));
    const review = {admissionDecisionPath,admissionReviewAuthorityPath,admissionReviewAuthoritySourceDigest,admissionReviewArchivePath};
    const reviewCount=Object.values(review).filter(value=>value!==null).length;
    assert.ok(reviewCount===0||reviewCount===4,'primary admission review inputs must be supplied together');
    const admissionMetadata=existsSync(paths.admissionRecordPath)?json(paths.admissionRecordPath).admission_status:'unknown';
    return { status: 'assembled_not_executed', normalizedResult: record,
      privateHelperOptions:{...verified.executionOptions,root:sourceRoot,normalizedResultsPath,sourceSnapshotDigest:normalized.manifest.source_snapshot_digest,
        normalizedResultId:entry.normalized_result_id,privateRoot,privateEvaluationRoot,
        ...(runtimeObservationRoot !== null ? { runtimeObservationRoot } : {})},
      scorerOptions: { ...verified.executionOptions, root: sourceRoot, ...paths, ...(reviewCount?review:{}),
      ...(runtimeObservationRoot !== null ? { runtimeObservationRoot } : {}),
      normalizedResultsPath, sourceSnapshotDigest: normalized.manifest.source_snapshot_digest, scoringInputFreezeManifestPath: join(sourceRoot, freezePath),
      scoringInputFreezeManifestSourceDigest: verified.request.binding.scoring_input_freeze_digest, primaryEvaluationProducer: { ...options },
      privateRoot, privateEvaluationRoot, manifestPath, resultPath, privateEvaluationRecordPath, privateFragmentPath },
      missing_inputs: Object.entries({ frozenSourceRoot, privateRoot, privateEvaluationRoot, manifestPath, resultPath, privateEvaluationRecordPath, privateFragmentPath }).filter(([,value]) => value === null).map(([key]) => key),
      frozen_admission_status:admissionMetadata,effective_admission_authority:'unresolved',
      original_private_evaluator_compatibility: 'unknown', scoring_ready: false, formal_aggregate_eligible:false, model_calls: 0, grader_process_starts: 0 };
}
/** Future authorized private-read constructor only. No worker or model starts.
 * Immutable original bundle/source authority checks are reused without aliases.
 */
export function createPrimaryEvaluationSealedEvaluatorExecution(options, runtimeInputs) {
  return withPrimaryEvaluationProducer(options, verified => {
    const inputs=buildPrimaryEvaluationScoringInputsWithinScope(options, runtimeInputs, verified);
    for(const name of ['frozenSourceRoot','privateRoot','privateEvaluationRoot','manifestPath'])assert.ok(runtimeInputs[name],'primary original private runtime inputs required');
    const target=resolve(runtimeInputs.privateEvaluationRoot);assert.equal(realpathSync(target),target);assert.ok(lstatSync(target).isDirectory());
    for(const path of [ROOT,options.recordRoot,runtimeInputs.frozenSourceRoot,runtimeInputs.privateRoot])assert.ok(target!==resolve(path)&&!target.startsWith(`${resolve(path)}/`),'primary private output overlaps authority');
    const root=runtimeInputs.frozenSourceRoot;
    verifyPublicEvaluatorReference({root,referencePath:inputs.scorerOptions.referencePath});
    const externalAuthorityAnchor=readEvaluatorAuthorityAnchorFromFreeze({root,freezeManifestPath:inputs.scorerOptions.scoringInputFreezeManifestPath,
      freezeManifestSourceDigest:inputs.scorerOptions.scoringInputFreezeManifestSourceDigest,referencePath:inputs.scorerOptions.referencePath});
    const bundle=verifyPrivateEvaluatorBundle(inputs.scorerOptions);
    assert.equal(bundle.manifest.evaluator_bundle_digest,verified.request.binding.evaluator_bundle_digest,'primary original private bundle changed');
    const hiddenAsset=bundle.manifest.asset_inventory.find(asset=>asset.role==='hidden_tests');assert.ok(hiddenAsset,'primary original hidden asset required');
    return createProductionSealedEvaluatorExecution({...inputs.privateHelperOptions,hiddenAsset,externalAuthorityAnchor,evaluatorRevision:bundle.manifest.evaluator_revision,
      ...(runtimeInputs.runtimeObservationRoot ? { runtimeObservationRoot: runtimeInputs.runtimeObservationRoot } : {})});
  });
}
export function verifyPrimaryEvaluationResult(options) { assert.ok(options.primaryEvaluationProducer); return withPrimaryEvaluationProducer(options.primaryEvaluationProducer, () => verifyEvaluatorAuthority(options), { grading: true }); }
export function scorePrimaryEvaluationResult(options) {
  assert.ok(options.primaryEvaluationProducer);
  return withPrimaryEvaluationProducer(options.primaryEvaluationProducer, verified => {
    const normalized=verifyNormalizedPortfolioResults({...verified.executionOptions,outputPath:options.normalizedResultsPath,sourceSnapshotDigest:options.sourceSnapshotDigest});
    const entry=normalized.manifest.cases.flatMap(item=>item.normalized_attempts).find(item=>item.normalized_result_id===options.normalizedResultId);
    assert.ok(entry,'selected original normalized result required');
    return scorePrimaryEvaluatorResult(options,json(join(normalized.generationPath,entry.path)));
  },{grading:true});
}
