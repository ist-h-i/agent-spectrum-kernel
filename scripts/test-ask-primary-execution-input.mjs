import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildPrimaryExecutionInputContract, primaryExecutionInputPreflight, renderPrimaryExecutionInputBoundary,
  inspectSuppliedPrimaryVerificationProvenance } from './ask-primary-execution-input.mjs';
import { artificialPrimaryVerificationEvents } from './test-fixtures/primary-execution-input-events.mjs';
import { buildPrimaryFixtureRecipe, CANONICAL_PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { prepareGitBaseline, prepareUserComparison, comparisonHash, derivePreparedPrimaryExecutionInput } from './ask-user-comparison-prepare.mjs';
import { readUserComparisonPlan, userCodexInvocation, inspectUserComparison, startUserComparison } from './ask-user-comparison.mjs';
import { preflightPrimaryEvaluationGrading } from './ask-primary-evaluation-grading.mjs';
import { preparePrimaryEvaluation } from './ask-primary-evaluation-prepare.mjs';
const ROOT = new URL('../', import.meta.url).pathname;
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const pin = value => ({ digest: hash(value), bytes: Buffer.byteLength(value), mode: '100644' });
const statePaths = ['.agent-spectrum-kernel/codex-install-state.json', '.agent-spectrum-kernel/install-state.json'];
function artificialPlan(id = 'hi-authorization-exception') {
  const manifestBytes = readFileSync(join(ROOT, 'benchmarks/fixtures/checkpoint-b2', id, 'input-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const recipe = buildPrimaryFixtureRecipe(id), files = manifest.fixtures[id].files;
  const inventory = Object.fromEntries(files.map(file => [file.path, { digest: 'sha256:' + file.sha256, bytes: file.bytes, mode: '100644' }]));
  const arms = {};
  for (const condition of ['plain', 'kernel_principles_v2', 'full_ask']) {
    const auxiliary = condition === 'plain' ? [] : [{ path: 'AGENTS.md', ...pin(condition), kind: condition === 'full_ask' ? 'canonical_kernel_with_preserved_custom_instructions' : 'generated_principles_with_preserved_custom_instructions', origin: condition === 'full_ask' ? 'live_core_and_codex_full_installers' : 'canonical_principles_projection' }];
    if (condition === 'full_ask') {
      auxiliary.push({ path: '.agents/skills/artificial/SKILL.md', ...pin('Artificial public instruction'), kind: 'full_ask_asset', origin: 'live_core_and_codex_full_installers' });
      for (const path of statePaths) auxiliary.push({ path, ...pin('Artificial installer identity, not input'), kind: 'install_identity', origin: 'live_core_and_codex_full_installers' });
    }
    arms[condition] = { id: condition, path: `arms/${condition}`, assets: auxiliary,
      baseline_inventory: { ...inventory, ...Object.fromEntries(auxiliary.map(({ path, digest, bytes, mode }) => [path, { digest, bytes, mode }])) } };
  }
  const plan = { root: '/synthetic/primary-input-contract', source: { inventory, digest: hash(JSON.stringify(inventory)) },
    task: { digest: inventory['task.md'].digest }, verification: { recipe }, mutable_paths: recipe.mutable_paths,
    config: { kernel_condition: 'kernel_principles_v2', primary_input_contract: 'closed_primary_inputs_v1' },
    policy: { execution_contract: 'single_shot_v1', attempts: 1, retries: 0, concurrency: 1 }, arms,
    prompt: 'Public artificial task.\n' };
  return { plan, manifestBytes, recipe, auxiliaryPaths: ['.agents/skills/artificial/SKILL.md'] };
}
const build = f => buildPrimaryExecutionInputContract(f.plan, { manifestBytes: f.manifestBytes, recipe: f.recipe, auxiliaryPaths: f.auxiliaryPaths });

for (const id of CANONICAL_PRIMARY_FIXTURE_IDS) test(`I2/I4 canonical public input and verification pins ${id}`, () => {
  const f = artificialPlan(id), c = build(f);
  assert.equal(c.fixture_id, id); assert.equal(c.fixture_input_digest, f.recipe.input_manifest_digest);
  assert.deepEqual(Object.keys(c.public_inputs).sort(), Object.keys(f.plan.source.inventory).sort());
  for (const condition of Object.keys(c.conditions)) {
    const arm = c.conditions[condition];
    assert.equal(arm.launch_cwd, `/synthetic/primary-input-contract/arms/${condition}/workspace`);
    assert.equal(c.public_inputs['task.md'].launch_relative_path, '../task.md');
    assert.ok(arm.verification.every(check => check.cwd === arm.launch_cwd));
    assert.deepEqual(arm.work_products.map(item => item.arm_relative_path), f.recipe.mutable_paths);
  }
  assert.equal(Object.keys(c.conditions.plain.auxiliary_inputs).length, 0);
  assert.deepEqual(Object.keys(c.conditions.kernel_principles_v2.auxiliary_inputs), ['AGENTS.md']);
  assert.ok(!Object.keys(c.conditions.full_ask.auxiliary_inputs).some(path => statePaths.includes(path)));
  assert.deepEqual(c.conditions.full_ask.excluded_control_paths, statePaths);
  assert.equal(c.execution_authority, false); assert.equal(c.formal_aggregate_eligible, false);
});
test('I2/I3 binds exact auxiliary bytes and distinguishes declared new work products', () => {
  const f = artificialPlan(), c = build(f), k = c.conditions.kernel_principles_v2;
  assert.equal(k.auxiliary_inputs['AGENTS.md'].launch_relative_path, '../AGENTS.md');
  assert.equal(k.auxiliary_inputs['AGENTS.md'].digest, f.plan.arms.kernel_principles_v2.baseline_inventory['AGENTS.md'].digest);
  const work = c.conditions.plain.work_products.find(row => row.arm_relative_path === 'workspace/review.json');
  assert.equal(work.launch_relative_path, 'review.json'); assert.equal(work.initial_input_digest, null);
  assert.equal(work.provenance, 'candidate_edit_and_final_snapshot_required');
  assert.ok(!Object.hasOwn(c.public_inputs, 'workspace/review.json'));
  const p = renderPrimaryExecutionInputBoundary(c, 'plain');
  assert.ok(!p.includes('.agents/skills/artificial')); assert.ok(p.includes('review.json'));
  assert.ok(p.includes('not an operating-system access boundary'));
});
for (const path of ['/synthetic-host/private.md', '../outside.md', '.codex/auth.json', '.GIT/config', '.env', '.netrc', '.npmrc', 'tokens.yaml', 'CONTROL/results.json', '.agents/runs/result.json', '.agent-spectrum-kernel/install-state.json']) test(`I3 refuses arbitrary auxiliary ${path}`, () => {
  const f = artificialPlan(); f.auxiliaryPaths.push(path);
  assert.throws(() => build(f));
});
test('I2 same public inputs and per-condition auxiliary pins for all nine declared settings', () => {
  const settings = [{ model: 'gpt-6.1-sol', reasoning: 'high' }, { model: 'gpt-6.1-sol', reasoning: 'low' }, { model: 'gpt-6-luna', reasoning: 'max' }];
  const contracts = settings.map(setting => { const f = artificialPlan(); Object.assign(f.plan.config, setting); return build(f); });
  for (const [index, contract] of contracts.entries()) {
    assert.deepEqual(contract.public_inputs, contracts[0].public_inputs);
    assert.deepEqual(contract.requested_model_setting, { model: settings[index].model, reasoning_effort: settings[index].reasoning });
    for (const condition of Object.keys(contract.conditions)) {
      assert.deepEqual(contract.conditions[condition].auxiliary_inputs, contracts[0].conditions[condition].auxiliary_inputs);
      assert.equal(primaryExecutionInputPreflight(contract).status, 'blocked');
    }
  }
});
test('I1/I2 refuses public byte changes, extra task inputs, condition widening and non-single-shot', () => {
  for (const mutate of [f => f.plan.source.inventory['task.md'].digest = hash('changed'),
    f => f.plan.source.inventory['notes/host.md'] = pin('host'),
    f => f.plan.policy.execution_contract = 'resumable', f => f.plan.config.kernel_condition = 'kernel_only',
    f => f.plan.arms.full_ask.assets[0].digest = hash('changed')]) {
    const f = artificialPlan(); mutate(f); assert.throws(() => build(f));
  }
});
test('I5 caller flags and artificial complete provenance never authorize launch or scoring', () => {
  const c = build(artificialPlan());
  for (const v of [c, { ...c, runtime_attestation: 'verified', execution_authority: true, ready: true }]) {
    const p = primaryExecutionInputPreflight(v); assert.equal(p.status, 'blocked');
    assert.equal(p.model_calls, 0); assert.equal(p.execution_authority, false);
    assert.ok(p.blockers.includes('effective_startup_input_closure_unverified'));
  }
  const observed = inspectSuppliedPrimaryVerificationProvenance(c, 'plain', artificialPrimaryVerificationEvents(c, 'plain'));
  assert.equal(observed.status, 'supplied_verification_segment_complete');
  assert.equal(observed.runtime_attestation, 'unknown'); assert.equal(observed.execution_authority, false);
  assert.equal(observed.scoring_authority, false); assert.equal(observed.model_calls, 0);
});
for (const change of ['missing_cwd', 'wrong_cwd', 'changed_command', 'incomplete', 'duplicate', 'mismatched_pair', 'failed', 'host_read', 'late_edit']) test(`I7 provenance fixture fail-closed ${change}`, () => {
  const c = build(artificialPlan());
  const r = inspectSuppliedPrimaryVerificationProvenance(c, 'plain', artificialPrimaryVerificationEvents(c, 'plain', change));
  assert.equal(r.status, 'unavailable'); assert.deepEqual(r.observations, []);
  assert.equal(r.execution_authority, false); assert.equal(r.scoring_authority, false);
});
test('I7 rejects malformed, duplicate-key, extra-field and non-native prose provenance', () => {
  const c = build(artificialPlan()), valid = artificialPrimaryVerificationEvents(c, 'plain');
  const events = valid.toString('utf8').trim().split('\n').map(line => JSON.parse(line)); events[0].item.unknown_authority = true;
  for (const stream of [Buffer.from('verification passed\n'), Buffer.from('{"type":"item.started","type":"item.completed"}\n'),
    Buffer.from(events.map(row => JSON.stringify(row)).join('\n') + '\n'), Buffer.from([0xff, 0x0a]), valid.subarray(0, -1)]) {
    const r = inspectSuppliedPrimaryVerificationProvenance(c, 'plain', stream); assert.equal(r.status, 'unavailable'); assert.deepEqual(r.observations, []);
  }
});
test('I1/I4/I6 existing single-task entry prepares, inspects and refuses closed-input dispatch before consumption', async t => {
  const area = realpathSync(mkdtempSync(join(tmpdir(), 'ask-primary-input-contract-')));
  t.after(() => rmSync(area, { recursive: true, force: true }));
  const id = 'hi-authorization-exception', base = join(ROOT, 'benchmarks/fixtures/checkpoint-b2', id), repo = join(area, 'seed'); mkdirSync(repo);
  const manifest = JSON.parse(readFileSync(join(base, 'input-manifest.json')));
  for (const entry of manifest.fixtures[id].files) { const target = join(repo, entry.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(join(base, entry.path))); }
  const commit = prepareGitBaseline(repo), recipe = buildPrimaryFixtureRecipe(id), verification = join(area, 'recipe.json'); writeFileSync(verification, JSON.stringify(recipe));
  const options = { repo, commit, taskFile: join(repo, 'task.md'), verificationFile: verification, output: join(area, 'closed'),
    mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class, kernelCondition: 'kernel_principles_v2',
    executionContract: 'single_shot_v1', evidenceKind: 'synthetic', cliBin: '/synthetic/never-run-codex', primaryInputContract: 'closed_primary_inputs_v1' };
  const prepared = prepareUserComparison(options), loaded = readUserComparisonPlan(prepared.root);
  const contract = loaded.plan.primary_execution_input; assert.ok(contract);
  for (const condition of Object.keys(contract.conditions)) {
    const invocation = userCodexInvocation(prepared.root, loaded.plan, condition);
    assert.equal(invocation.cwd, join(prepared.root, `arms/${condition}/workspace`));
    assert.ok(invocation.input.includes('Closed primary execution inputs'));
    assert.ok(!invocation.input.includes('control/baselines'));
    assert.equal(invocation.inputDigest, comparisonHash(Buffer.from(invocation.input)));
  }
  assert.equal(inspectUserComparison(prepared.root).primary_execution_input.status, 'blocked');
  let launches = 0;
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(startUserComparison(prepared.root, prepared.plan_digest, { runner: async () => { launches++; } }), /closed primary execution input.*unqualified/);
  assert.equal(launches, 0);
  for (const name of ['start.json', 'start.digest', 'leases', 'history']) assert.equal(existsSync(join(prepared.root, 'control', name)), false);
  const grading = preflightPrimaryEvaluationGrading({ root: prepared.root });
  assert.equal(grading.status, 'not_scoring_ready'); assert.ok(grading.blockers.includes('closed_primary_input_processing_unconfigured'));
  const legacy = prepareUserComparison({ ...options, output: join(area, 'legacy'), primaryInputContract: undefined });
  assert.equal(legacy.plan.primary_execution_input, undefined);
  assert.equal(userCodexInvocation(legacy.root, legacy.plan, 'plain').cwd, join(legacy.root, 'arms/plain'));
  assert.equal(Object.hasOwn(userCodexInvocation(legacy.root, legacy.plan, 'plain'), 'inputDigest'), false);
  const rawPath = join(prepared.root, 'control/plan.json'), digestPath = join(prepared.root, 'control/plan.digest');
  const raw = readFileSync(rawPath), digest = readFileSync(digestPath), forged = JSON.parse(raw);
  forged.primary_execution_input.execution_authority = true;
  const changed = Buffer.from(JSON.stringify(forged)); writeFileSync(rawPath, changed); writeFileSync(digestPath, comparisonHash(changed));
  assert.throws(() => readUserComparisonPlan(prepared.root), /primary input contract changed/);
  writeFileSync(rawPath, raw); writeFileSync(digestPath, digest);
  const stripped = JSON.parse(raw); delete stripped.config.primary_input_contract; delete stripped.primary_execution_input;
  const strippedBytes = Buffer.from(JSON.stringify(stripped)), strippedDigest = comparisonHash(strippedBytes);
  writeFileSync(rawPath, strippedBytes); writeFileSync(digestPath, strippedDigest);
  assert.throws(() => readUserComparisonPlan(prepared.root), /orphaned closed primary input artifacts/);
  await assert.rejects(startUserComparison(prepared.root, strippedDigest, { runner: async () => { launches++; } }), /orphaned closed primary input artifacts/);
  assert.equal(launches, 0);
  for (const name of ['start.json', 'start.digest', 'leases', 'history']) assert.equal(existsSync(join(prepared.root, 'control', name)), false);
  writeFileSync(rawPath, raw); writeFileSync(digestPath, digest);
  const altered = JSON.parse(raw), assetPath = '.agents/skills/adr-review/SKILL.md';
  const fake = Buffer.from('Artificial forged auxiliary input\n'), fakePin = pin(fake);
  const asset = altered.arms.full_ask.assets.find(asset => asset.path === assetPath);
  Object.assign(asset, fakePin); altered.arms.full_ask.baseline_inventory[assetPath] = fakePin;
  assert.throws(() => derivePreparedPrimaryExecutionInput(altered), /source-owned.*(?:bytes|pin).*changed/);
  const baselinePath = join(prepared.root, altered.arms.full_ask.baseline_path, assetPath), armPath = join(prepared.root, altered.arms.full_ask.path, assetPath);
  const baselineBefore = readFileSync(baselinePath), armBefore = readFileSync(armPath);
  writeFileSync(baselinePath, fake); writeFileSync(armPath, fake);
  assert.throws(() => derivePreparedPrimaryExecutionInput(altered), /source-owned.*(?:bytes|pin).*changed/);
  writeFileSync(baselinePath, baselineBefore); writeFileSync(armPath, armBefore);
  for (const [path, bytes] of [[baselinePath, baselineBefore], [armPath, armBefore]]) {
    rmSync(path); writeFileSync(path, bytes, { flag: 'wx', mode: 0o700 });
  }
  assert.throws(() => derivePreparedPrimaryExecutionInput(JSON.parse(raw)), /source-owned file mode changed/);
  for (const [path, bytes] of [[baselinePath, baselineBefore], [armPath, armBefore]]) {
    rmSync(path); writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  }
  assert.deepEqual(derivePreparedPrimaryExecutionInput(JSON.parse(raw)), contract);
  const badPath = JSON.parse(raw); badPath.arms.full_ask.baseline_path = '/synthetic/host';
  assert.throws(() => derivePreparedPrimaryExecutionInput(badPath), /source-owned primary baseline path required/);
  assert.throws(() => preparePrimaryEvaluation(repo, { output: join(area, 'invalid'), primaryInputContract: 'untrusted' }), /unknown primary input contract/);
  assert.equal(existsSync(join(area, 'invalid')), false);
});
