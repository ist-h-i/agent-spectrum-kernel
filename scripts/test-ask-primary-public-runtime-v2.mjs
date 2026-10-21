import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { comparisonHash, serializeComparisonPlan, prepareGitBaseline, prepareUserComparison } from './ask-user-comparison-prepare.mjs';
import { readUserComparisonPlan, startUserComparison } from './ask-user-comparison.mjs';
import { buildPrimaryFixtureRecipe } from './ask-primary-fixture-recipe.mjs';
import { buildCodexProjectionPlan } from './install-codex-adapter.mjs';
import * as inputs from './ask-primary-execution-input.mjs';
import { validateBenchmarkSchemaInstance } from './ask-benchmark-schema.mjs';
import { preflightPrimaryEvaluationGrading } from './ask-primary-evaluation-grading.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
test('R1/R2 public router projection is explicit, closed and idempotence is refused', () => {
  assert.equal(inputs.PRIMARY_EXECUTION_INPUT_CONTRACT_V2, 'closed_primary_inputs_v2');
  for (const name of ['skill-router', 'operating-mode-router', 'review-router']) {
    const raw = readFileSync(join(ROOT, 'skills', name, 'SKILL.md'));
    const rendered = inputs.renderPrimaryPublicRouterV2(name, raw).toString();
    assert.ok(rendered.includes(inputs.PRIMARY_PUBLIC_CAPABILITIES_PATH));
    assert.ok(!rendered.includes('codex-install-state.json'));
    assert.ok(!rendered.includes('claude-install-state.json'));
    assert.ok(rendered.includes('capability_missing'));
    assert.throws(() => inputs.renderPrimaryPublicRouterV2(name, Buffer.from(rendered)));
  }
  assert.throws(() => inputs.renderPrimaryPublicRouterV2('unknown', Buffer.from('unknown')));
});

test('R1/R2/R3/R4/R5 V2 source selection is pinned in Full only, management is controller-only and start remains blocked', async t => {
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-primary-public-v2-')));
  t.after(() => rmSync(area, { recursive: true, force: true }));
  const id = 'hi-authorization-exception', base = join(ROOT, 'benchmarks/fixtures/checkpoint-b2', id), repo = join(area, 'seed'); mkdirSync(repo);
  const manifest = JSON.parse(readFileSync(join(base, 'input-manifest.json')));
  for (const entry of manifest.fixtures[id].files) { const target = join(repo, entry.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(join(base, entry.path))); }
  const commit = prepareGitBaseline(repo), recipe = buildPrimaryFixtureRecipe(id), verification = join(area, 'recipe.json'); writeFileSync(verification, JSON.stringify(recipe));
  const options = { repo, commit, taskFile: join(repo, 'task.md'), verificationFile: verification, output: join(area, 'closed'),
    mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class, kernelCondition: 'kernel_principles_v2',
    executionContract: 'single_shot_v1', evidenceKind: 'synthetic', cliBin: '/synthetic/never-run-codex', primaryInputContract: 'closed_primary_inputs_v2' };
  const prepared = prepareUserComparison(options), { plan } = readUserComparisonPlan(prepared.root);
  assert.equal(plan.primary_execution_input.kind, 'ask_primary_execution_inputs_v2');
  const full = join(prepared.root, 'arms/full_ask'), path = inputs.PRIMARY_PUBLIC_CAPABILITIES_PATH;
  const docBytes = readFileSync(join(full, path)), document = JSON.parse(docBytes);
  assert.deepEqual(document.selected_skills, [...buildCodexProjectionPlan({ profileName: 'full' }).skills].sort());
  assert.equal(document.kind, 'ask_primary_public_capability_selection_v2');
  assert.equal(document.execution_authority, false); assert.equal(document.scoring_authority, false);
  const schemaPath = join(ROOT, inputs.PRIMARY_PUBLIC_CAPABILITIES_SCHEMA_PATH);
  assert.deepEqual(validateBenchmarkSchemaInstance(document, { schemaPath }), []);
  for (const changed of [{ ...document, execution_authority: true }, { ...document, extra: 'host/config' },
    { ...document, selected_skills: [...document.selected_skills, document.selected_skills[0]] }]) {
    assert.ok(validateBenchmarkSchemaInstance(changed, { schemaPath }).length > 0);
  }
  assert.equal(plan.primary_execution_input.public_routing_source.processing_status, 'not_admitted_for_scoring');
  assert.equal(inputs.primaryExecutionInputPreflight(plan.primary_execution_input).status, 'blocked');
  assert.equal(plan.primary_execution_input.conditions.full_ask.auxiliary_dependency_closure, 'source_public_routing_selection_v2');
  assert.ok(plan.primary_execution_input.conditions.full_ask.auxiliary_inputs[path]);
  assert.equal(plan.arms.full_ask.assets.filter(asset => asset.origin === 'source_public_routing_projection_v2').length, 7);
  const fullPrompt = readFileSync(join(prepared.root, plan.primary_execution_input.conditions.full_ask.input.path), 'utf8');
  assert.ok(fullPrompt.includes(plan.primary_execution_input.conditions.full_ask.auxiliary_inputs[path].digest));
  for (const state of ['install-state.json', 'codex-install-state.json']) {
    assert.equal(existsSync(join(full, '.agent-spectrum-kernel', state)), false);
    assert.equal(existsSync(join(prepared.root, 'control/full-installation', state)), true);
    assert.ok(!Object.keys(plan.arms.full_ask.baseline_inventory).some(p => p.endsWith(state)));
  }
  for (const condition of ['plain', 'kernel_principles_v2']) {
    assert.equal(existsSync(join(prepared.root, 'arms', condition, path)), false);
    assert.ok(!readFileSync(join(prepared.root, plan.primary_execution_input.conditions[condition].input.path), 'utf8').includes(path));
  }
  let launches = 0;
  await assert.rejects(startUserComparison(prepared.root, prepared.plan_digest, { runner: async () => { launches++; } }), /closed primary execution input.*unqualified/);
  assert.equal(launches, 0); assert.equal(existsSync(join(prepared.root, 'control/start.json')), false);
  const grading = preflightPrimaryEvaluationGrading({ root: prepared.root });
  assert.equal(grading.status, 'not_scoring_ready'); assert.ok(grading.blockers.includes('closed_primary_input_processing_unconfigured'));
  writeFileSync(join(full, path), JSON.stringify({ ...document, selected_skills: ['invented'], execution_authority: true }));
  assert.throws(() => readUserComparisonPlan(prepared.root), /source-owned.*bytes changed/);
  writeFileSync(join(full, path), docBytes);
  readUserComparisonPlan(prepared.root);
  // Re-hashing a selected plan cannot downgrade a V2 preparation to legacy.
  const saved = readFileSync(join(prepared.root, 'control/plan.json'));
  const savedDigest = readFileSync(join(prepared.root, 'control/plan.digest'));
  const downgraded = structuredClone(plan); delete downgraded.config.primary_input_contract; delete downgraded.primary_execution_input;
  const changedPlan = serializeComparisonPlan(downgraded);
  writeFileSync(join(prepared.root, 'control/plan.json'), changedPlan);
  writeFileSync(join(prepared.root, 'control/plan.digest'), comparisonHash(changedPlan) + '\n');
  assert.throws(() => readUserComparisonPlan(prepared.root), /orphaned closed primary input/);
  writeFileSync(join(prepared.root, 'control/plan.json'), saved);
  writeFileSync(join(prepared.root, 'control/plan.digest'), savedDigest);
  readUserComparisonPlan(prepared.root);
  const legacy = prepareUserComparison({ ...options, output: join(area, 'v1'), primaryInputContract: 'closed_primary_inputs_v1' });
  assert.equal(legacy.plan.primary_execution_input.kind, 'ask_primary_execution_inputs_v1');
  assert.equal(existsSync(join(legacy.root, 'arms/full_ask', path)), false);
  assert.equal(existsSync(join(legacy.root, 'arms/full_ask/.agent-spectrum-kernel/codex-install-state.json')), true);
});

function suppliedFixture(condition = 'plain') {
  const cwd = `/synthetic/public/arms/${condition}/workspace`, command = "/bin/bash -lc 'node --test public.test.mjs'";
  const contract = { kind: 'ask_primary_execution_inputs_v2', root: '/synthetic/public',
    public_inputs: {}, conditions: { [condition]: { launch_cwd: cwd, auxiliary_inputs: {},
      verification: [{ command_id: 'public-check', cwd, rendered_event_command: command }] } } };
  const item = { type: 'commandExecution', id: 'synthetic-command-1', pluginId: null, scriptPath: null, command, cwd,
    processId: null, source: 'agent', status: 'inProgress', commandActions: [{ type: 'unknown', command: 'node --test public.test.mjs' }], aggregatedOutput: null, exitCode: null, durationMs: null };
  const identity = { threadId: 'synthetic-thread-1', turnId: 'synthetic-turn-1' };
  const events = [{ method: 'item/started', params: { ...identity, startedAtMs: 10, item } },
    { method: 'item/completed', params: { ...identity, completedAtMs: 20, item: { ...item, status: 'completed', exitCode: 0, durationMs: 10, aggregatedOutput: 'Artificial test output' } } }];
  return { contract, identity, events };
}
const encode = events => Buffer.from(events.map(value => JSON.stringify(value)).join('\n') + '\n');
test('R6 wire required/optional fields are pinned to the installed binary public schema, not TypeScript nullability', () => {
  const observed = JSON.parse(readFileSync(join(ROOT, 'docs/fixtures/primary-codex-command-wire-01621.json')));
  assert.equal(observed.observation_scope, 'offline_binary_generated_schema_only'); assert.equal(observed.runtime_events_observed, false);
  for (const schema of observed.schemas) {
    assert.deepEqual(schema.command_required, ['command', 'commandActions', 'cwd', 'id', 'status', 'type']);
    assert.equal(schema.source_default, 'agent');
  }
});
for (const condition of ['plain', 'kernel_principles_v2', 'full_ask']) test(`R6 documented wire metadata omission ${condition} is non-authoritative`, () => {
  const f = suppliedFixture(condition);
  for (const event of f.events) for (const field of ['pluginId', 'scriptPath', 'processId', 'source', 'durationMs', 'aggregatedOutput']) delete event.params.item[field];
  delete f.events[0].params.item.exitCode;
  const result = inputs.inspectSuppliedPrimaryAppServerVerification(f.contract, condition, encode(f.events), f.identity);
  assert.equal(result.status, 'supplied_verification_segment_complete'); assert.equal(result.runtime_attestation, 'unknown');
  assert.equal(result.execution_authority, false); assert.equal(result.scoring_authority, false);
  assert.equal(result.observations[0].start_digest, comparisonHash(Buffer.from(JSON.stringify(f.events[0]))));
  delete f.events[1].params.item.exitCode;
  const missingExit = inputs.inspectSuppliedPrimaryAppServerVerification(f.contract, condition, encode(f.events), f.identity);
  assert.equal(missingExit.status, 'unavailable'); assert.deepEqual(missingExit.observations, []);
});
for (const condition of ['plain', 'kernel_principles_v2', 'full_ask']) test(`R5 supplied app-server segment ${condition} never attests installed runtime`, () => {
  const f = suppliedFixture(condition), result = inputs.inspectSuppliedPrimaryAppServerVerification(f.contract, condition, encode(f.events), f.identity);
  assert.equal(result.status, 'supplied_verification_segment_complete'); assert.equal(result.observations.length, 1);
  assert.equal(result.raw_pair_pins.length, 1); assert.equal(result.runtime_attestation, 'unknown');
  assert.equal(result.source_stream_digest, comparisonHash(encode(f.events)));
  assert.equal(result.observations[0].start_digest, comparisonHash(Buffer.from(JSON.stringify(f.events[0]))));
  assert.equal(result.observations[0].completion_digest, comparisonHash(Buffer.from(JSON.stringify(f.events[1]))));
  assert.equal(result.scoring_authority, false); assert.equal(result.execution_authority, false); assert.equal(result.formal_aggregate_eligible, false);
  assert.ok(!JSON.stringify(result).includes('Artificial test output'));
});
const badSegments = {
  missing_cwd: f => { delete f.events[0].params.item.cwd; },
  changed_cwd: f => { f.events[1].params.item.cwd = '/synthetic/host'; },
  another_thread: f => { f.events[1].params.threadId = 'another-thread'; },
  another_turn: f => { f.events[1].params.turnId = 'another-turn'; },
  unknown_method: f => { f.events[0].method = 'unknown/notification'; },
  late_edit: f => { f.events.push({ method: 'item/completed', params: { ...f.identity, completedAtMs: 21, item: { type: 'fileChange', id: 'late-edit' } } }); },
  undeclared_command: f => { for (const event of f.events) event.params.item.command += ' && unknown'; },
  parsed_action_spoof: f => { for (const event of f.events) { event.params.item.command = 'unsafe unknown'; event.params.item.commandActions = []; } },
  incomplete: f => { f.events.pop(); },
  duplicate: f => { f.events.push(structuredClone(f.events[1])); },
  failed: f => { f.events[1].params.item.status = 'failed'; f.events[1].params.item.exitCode = 1; },
  declined: f => { f.events[1].params.item.status = 'declined'; },
  timestamp_reversed: f => { f.events[1].params.completedAtMs = 9; },
  caller_authority: f => { f.events[0].params.authority = true; },
  plugin_execution: f => { f.events[0].params.item.pluginId = 'arbitrary-plugin'; },
  user_shell: f => { f.events[0].params.item.source = 'userShell'; },
  null_source: f => { f.events[0].params.item.source = null; },
  missing_id: f => { delete f.events[0].params.item.id; },
  missing_type: f => { delete f.events[0].params.item.type; },
  missing_status: f => { delete f.events[0].params.item.status; },
  missing_command: f => { delete f.events[0].params.item.command; },
  missing_actions: f => { delete f.events[0].params.item.commandActions; },
};
for (const [name, mutate] of Object.entries(badSegments)) test(`R5 refuses supplied app-server ${name}`, () => {
  const f = suppliedFixture(); mutate(f);
  const result = inputs.inspectSuppliedPrimaryAppServerVerification(f.contract, 'plain', encode(f.events), f.identity);
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.observations, []); assert.equal(result.scoring_authority, false);
});
test('R5 startup supplied pins are agreement only; unknown inputs and caller closure claims fail', () => {
  const { contract } = suppliedFixture();
  const value = { kind: 'ask_primary_supplied_startup_inventory_v1', condition: 'plain', initial_cwd: contract.conditions.plain.launch_cwd, inputs: [] };
  const inspect = v => inputs.inspectSuppliedPrimaryStartupInventory(contract, 'plain', Buffer.from(JSON.stringify(v)));
  const result = inspect(value);
  assert.equal(result.status, 'supplied_inventory_matches_declared_inputs'); assert.equal(result.startup_closure, 'unverified');
  assert.equal(result.execution_authority, false); assert.equal(result.formal_aggregate_eligible, false);
  for (const changed of [{ ...value, runtime_authority: true }, { ...value, inputs: [{ path: '/synthetic/host/AGENTS.md' }] },
    { ...value, initial_cwd: contract.root }, { ...value, condition: 'full_ask' }]) assert.equal(inspect(changed).status, 'unavailable');
});
test('R5 malformed supplied bytes, duplicate keys, missing identity and caller hints fail closed', () => {
  const f = suppliedFixture(), valid = encode(f.events);
  for (const raw of [Buffer.from([255, 10]), valid.subarray(0, -1), Buffer.from('{"method":"item/started","method":"item/completed"}\n')]) {
    assert.equal(inputs.inspectSuppliedPrimaryAppServerVerification(f.contract, 'plain', raw, f.identity).status, 'unavailable');
  }
  for (const identity of [undefined, {}, { ...f.identity, authority: true }]) {
    assert.equal(inputs.inspectSuppliedPrimaryAppServerVerification(f.contract, 'plain', valid, identity).status, 'unavailable');
  }
});
