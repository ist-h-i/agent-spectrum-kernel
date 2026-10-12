import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildPrimaryFixtureRecipe, PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { comparisonExecutionPolicy, comparisonHash } from './ask-user-comparison-prepare.mjs';
import { buildAgentsBlock } from './installer-lifecycle.mjs';
import { principlesCapability, renderKernelPrinciples } from './kernel-principles.mjs';
import { coreGradingConditions, coreGradingSchemaPath } from './ask-core-grading-authority.mjs';
import { PRIMARY_GRADING_CONDITIONS, createPrimaryEvaluationGradingAdapter, exportPrimaryEvaluationGradingForTest,
  exportPrimaryEvaluationGradingRequest, isPrimaryEvaluationGradingAdapter, preflightPrimaryEvaluationGrading,
  replayPrimaryEvaluationGradingRequest, writePrimaryEvaluationGradingRequest } from './ask-primary-evaluation-grading.mjs';

// All terminal/request/check bytes below are fake; no start, resume, evaluator,
// subprocess, ownership diagnostics or private original is invoked.
const hash = comparisonHash, raw = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
function fixture(fixture_id = 'mp-ci-evidence-gap') {
  const recipe = buildPrimaryFixtureRecipe(fixture_id), plan_digest = hash('fake plan');
  const base = new URL(`../benchmarks/fixtures/checkpoint-b2/${fixture_id}/`, import.meta.url);
  const reference = JSON.parse(readFileSync(new URL('evaluator-reference.json', base)));
  const block = { fixture_id, root: '/fake-primary', run_id: `fake-${fixture_id}`, plan_digest };
  const plan = { run_id: block.run_id, config: { evidence_kind: 'synthetic', kernel_condition: 'kernel_principles_v1' },
    source: { digest: hash('source') }, task: { digest: hash('task') }, verification: { digest: hash('verification') } };
  const records = {}, slots = [], states = {};
  for (const condition of PRIMARY_GRADING_CONDITIONS) {
    const artifacts = { 'stdout.jsonl': hash('fake stdout'), 'stderr.log': hash('fake stderr'), 'patch.diff': hash('fake redacted diff'),
      'changes.json': hash('fake scope') }, commandRequests = {};
    const checks = recipe.checks.map((check, index) => {
      const cwd = join(block.root, 'verification', condition, check.cwd);
      const request = { run_id: plan.run_id, plan_digest, condition, evidence_kind: 'synthetic', command_id: check.id,
        command_contract_digest: check.contract_command_digest, fixture_input_digest: recipe.input_manifest_digest,
        observation_origin: 'controller_native_fixture_command', executable: check.executable, argv: check.argv, cwd };
      const name = `verification-${index}.request.json`, logs = [`verification-${index}.stdout.log`, `verification-${index}.stderr.log`, `verification-${index}.log`];
      commandRequests[name] = { raw: raw(request) }; artifacts[name] = hash(commandRequests[name].raw);
      artifacts[`verification-${index}.spawn.json`] = hash(`fake spawn ${index}`);
      for (const name of logs) artifacts[name] = hash(`fake ${name}`);
      return { id: check.id, command_id: check.id, command_contract_digest: check.contract_command_digest,
        fixture_input_digest: recipe.input_manifest_digest, verification_kind: 'native_public_command', command: [check.executable, ...check.argv],
        cwd, logs, log_metadata: { full_evidence_available: true, view: { truncated: false } }, test_result: 'pass', status: 'pass',
        process_completed: true, spawn_observed: true, exit_code: 0 };
    });
    const value = { run_id: plan.run_id, plan_digest, condition, evidence_kind: 'synthetic', state: 'completed', outcome: 'unknown',
      artifacts, scope: { status: 'pass', changed_paths: recipe.mutable_paths, violations: [] }, launch_requested: true,
      spawn_observed: true, process_completed: true, unresolved_child: false, exit_code: 0,
      metrics: { duration_ms: 12, input_tokens: null, output_tokens: null, cached_tokens: null },
      usage_lower_bound: { known_tokens: 0, complete: false }, cost: null,
      verification: { checks, execution_origin: 'synthetic_injected_verifier' } };
    records[condition] = { value, raw: raw(value), digest: hash(raw(value)), commandRequests };
    slots.push({ ...value, receipt_integrity: 'valid' }); states[condition] = { terminal_digest: records[condition].digest };
  }
  return { block, loaded: { plan, plan_digest }, recipe, binding: { fixture_id, input_manifest_digest: recipe.input_manifest_digest,
    evaluator_bundle_digest: reference.evaluator_bundle_digest,
    scoring_input_freeze_digest: hash(readFileSync(new URL('scoring-input-freeze-manifest.json', base))), profile_id: 'primary_single_shot_v1' },
    records, report: { run_id: plan.run_id, plan_digest, slots,
      execution: { state: 'completed', start_consumed: true, history: { digest: hash('fake history'), snapshot: { slots: states } } } } };
}
function refresh(input, condition = 'plain') {
  const record = input.records[condition]; record.raw = raw(record.value); record.digest = hash(record.raw);
  input.report.slots[input.report.slots.findIndex(slot => slot.condition === condition)] = { ...record.value, receipt_integrity: 'valid' };
  input.report.execution.history.snapshot.slots[condition].terminal_digest = record.digest;
}

test('all nine task readouts preserve actual IDs, formal classes, frozen public input and unknown quality', () => {
  for (const id of PRIMARY_FIXTURE_IDS) {
    const input = fixture(id), value = exportPrimaryEvaluationGradingForTest(input), request = value.request;
    assert.equal(request.fixture_id, id); assert.equal(request.fixture_input_digest, input.recipe.input_manifest_digest);
    assert.equal(request.formal_task_class, input.recipe.task_class); assert.equal(request.runner_task_class, input.recipe.runner_task_class);
    assert.deepEqual(request.conditions, PRIMARY_GRADING_CONDITIONS); assert.equal(request.run_id, input.block.run_id);
    assert.equal(request.plan_digest, input.block.plan_digest); assert.equal(request.scoring_status, 'not_scoring_ready');
    assert.equal(request.admission, 'unknown'); assert.equal(request.quality, null); assert.equal(request.test_only, true);
    assert.equal(request.model_calls, 0); assert.equal(request.grader_process_starts, 0); assert.equal(request.scorer_connection.options, null);
    assert.deepEqual(request.public_scope, input.recipe.mutable_paths);
    assert.equal(request.public_grading_references.scoring_input_freeze.raw_digest, input.binding.scoring_input_freeze_digest);
    assert.equal(request.public_grading_references.evaluator_reference.bundle_digest, input.binding.evaluator_bundle_digest);
    assert.ok(request.public_grading_references.scoring_input_freeze.revision);
    assert.ok(request.public_grading_references.output_contract.semantic_digest);
    for (const slot of request.slots) {
      assert.equal(slot.terminal_digest, input.records[slot.condition].digest); assert.deepEqual(slot.blockers, []);
      assert.equal(slot.usage.metrics.input_tokens, null); assert.equal(slot.usage.lower_bound.complete, false);
      assert.equal(slot.usage.cost, null); assert.equal(slot.artifacts['stdout.jsonl'], hash('fake stdout'));
      assert.equal(slot.artifacts['stderr.log'], hash('fake stderr')); assert.equal(slot.native_checks[0].exit_code, 0);
      assert.equal(slot.native_checks[0].request_digest, input.records[slot.condition].value.artifacts['verification-0.request.json']);
      assert.ok(slot.requirement_judgments.length > 0);
      assert.ok(slot.requirement_judgments.every(item => item.judgment === 'unknown' && item.quality === null && item.evidence_status === 'unknown' && item.evidence_refs.length === 0));
      assert.equal(Object.keys(slot.cause_analysis).length, 5); assert.ok(Object.values(slot.cause_analysis).every(value => value === 'unknown'));
    }
    assert.deepEqual(value.readout.public_grading_references, request.public_grading_references);
    assert.deepEqual(value.readout.conditions[0].requirement_judgments, request.slots[0].requirement_judgments);
    assert.deepEqual(value.readout.conditions[0].cause_analysis, request.slots[0].cause_analysis);
    assert.equal(Object.keys(value.readout.cause_analysis).length, 5); assert.ok(Object.values(value.readout.cause_analysis).every(v => v === 'unknown'));
    assert.deepEqual(value.readout.posthoc_candidates, []); assert.equal(value.request_digest, hash(raw(request)));
    assert.equal(value.request_digest, exportPrimaryEvaluationGradingForTest(input).request_digest);
  }
});
test('fake-only mapper rejects observed evidence and condition aliases', () => {
  const input = fixture(); input.loaded.plan.config.evidence_kind = 'observed';
  assert.throws(() => exportPrimaryEvaluationGradingForTest(input), /forbids observed/);
  for (const condition of ['kernel_only', 'core', 'full', 'kernel_principles_v2_candidate']) {
    const input = fixture(); input.report.slots[1].condition = condition;
    assert.throws(() => exportPrimaryEvaluationGradingForTest(input), /condition substitution/);
  }
});
test('run, plan, terminal, check command IDs/digests/input/cwd and log substitutions are refused', () => {
  for (const edit of [i => { i.records.plain.value.run_id = 'other'; }, i => { i.records.plain.value.plan_digest = hash('other'); },
    i => { i.records.plain.value.verification.checks[0].command_id = 'other'; },
    i => { i.records.plain.value.verification.checks[0].command_contract_digest = hash('other'); },
    i => { i.records.plain.value.verification.checks[0].fixture_input_digest = hash('other'); },
    i => { i.records.plain.value.verification.checks[0].command = ['/bin/false']; },
    i => { i.records.plain.value.verification.checks[0].cwd = '/other'; },
    i => { i.records.plain.value.verification.checks[0].logs.reverse(); },
    i => { i.records.plain.value.verification.checks.push(i.records.plain.value.verification.checks[0]); }]) {
    const input = fixture(); edit(input); refresh(input); assert.throws(() => exportPrimaryEvaluationGradingForTest(input));
  }
  const input = fixture(); input.records.plain.raw = Buffer.from('changed'); assert.throws(() => exportPrimaryEvaluationGradingForTest(input), /terminal raw digest/);
});
test('native request receipt differs from terminal/check metadata is refused', () => {
  const input = fixture(), name = 'verification-0.request.json', request = JSON.parse(input.records.plain.commandRequests[name].raw);
  request.argv = ['-lc', 'false']; input.records.plain.commandRequests[name].raw = raw(request);
  input.records.plain.value.artifacts[name] = hash(raw(request)); refresh(input);
  assert.throws(() => exportPrimaryEvaluationGradingForTest(input));
});
test('unknown child, missing usage and missing slots never become zero quality or scoring ready', () => {
  const input = fixture(); input.records.plain.value.unresolved_child = true;
  input.records.plain.value.verification.checks[0].process_completed = false; refresh(input);
  delete input.records.full_ask; input.report.slots[2] = { condition: 'full_ask', state: 'not_started' };
  const value = exportPrimaryEvaluationGradingForTest(input);
  assert.ok(value.request.slots[0].blockers.includes('process_termination_unknown'));
  assert.ok(value.request.slots[0].blockers.includes('native_check_termination_unknown'));
  assert.equal(value.request.slots[2].terminal_digest, null); assert.equal(value.request.slots[2].quality, null);
  assert.equal(value.readout.conditions[2].usage, null); assert.equal(value.request.scoring_status, 'not_scoring_ready');
});
test('failed command is preserved and does not assign a failure cause', () => {
  const input = fixture(); input.records.plain.value.state = 'verification_failed';
  Object.assign(input.records.plain.value.verification.checks[0], { exit_code: 7, status: 'fail', test_result: 'fail' }); refresh(input);
  const value = exportPrimaryEvaluationGradingForTest(input);
  assert.equal(value.readout.conditions[0].native_checks[0].exit_code, 7);
  assert.equal(value.readout.conditions[0].execution_state, 'verification_failed'); assert.equal(value.readout.conditions[0].quality, null);
  assert.ok(Object.values(value.readout.cause_analysis).every(v => v === 'unknown'));
});
test('missing checkpoint cannot attest a caller-created terminal', () => {
  const input = fixture(); delete input.report.execution.history.snapshot.slots.plain;
  assert.ok(exportPrimaryEvaluationGradingForTest(input).request.slots[0].blockers.includes('controller_terminal_checkpoint_unverified'));
});
test('membership is unforgeable with labels, copy or prototype inheritance; factory preflight always blocks', async () => {
  const adapter = createPrimaryEvaluationGradingAdapter(); assert.equal(isPrimaryEvaluationGradingAdapter(adapter), true);
  assert.ok(Object.isFrozen(adapter));
  for (const fake of [null, undefined, { ...adapter }, Object.create(adapter), { status: 'ready', primary: true }]) assert.equal(isPrimaryEvaluationGradingAdapter(fake), false);
  const block = { root: '/nonexistent-fake-primary', grading: { status: 'ready', admitted: true, private_assets_available: true } };
  assert.equal(adapter.preflight(block).status, 'blocked'); assert.equal(preflightPrimaryEvaluationGrading(block).status, 'not_scoring_ready');
  const value = await adapter.grade(block, { status: 'completed', quality: 1 }); assert.equal(value.status, 'unknown'); assert.equal(value.quality, null);
  assert.equal(value.grader_process_starts, 0);
});
test('legacy and Core profiles still reject primary K IDs outside their original scope', () => {
  const schema = JSON.parse(readFileSync(new URL('../benchmarks/schemas/normalized-portfolio-result.schema.json', import.meta.url)));
  assert.deepEqual(schema.properties.lineage.properties.condition.enum, ['plain', 'kernel_only', 'adaptive_ask', 'full_ask']);
  const legacy = '/fake/benchmarks/schemas/normalized-portfolio-result.schema.json'; assert.equal(coreGradingSchemaPath(legacy), legacy);
  assert.deepEqual(coreGradingConditions(['plain', 'kernel_only', 'adaptive_ask', 'full_ask']), ['plain', 'kernel_only', 'adaptive_ask', 'full_ask']);
});
test('offline replay refuses changed bytes and fake exports lacking saved controller authority', t => {
  const root = mkdtempSync(join(tmpdir(), 'primary-grading-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const value = exportPrimaryEvaluationGradingForTest(fixture()), path = join(root, 'request.json'); writeFileSync(path, raw(value.request));
  assert.equal(replayPrimaryEvaluationGradingRequest(path, hash('changed'), fixture().block).status, 'blocked');
  assert.equal(replayPrimaryEvaluationGradingRequest(path, value.request_digest, fixture().block).status, 'blocked');
  assert.throws(() => exportPrimaryEvaluationGradingRequest(fixture().block));
});

function savedPending(t, fixture_id) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'primary-grading-plan-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, bytes) => { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, bytes, { mode: 0o600 }); };
  const base = new URL(`../benchmarks/fixtures/checkpoint-b2/${fixture_id}/`, import.meta.url);
  const inputRaw = readFileSync(new URL('input-manifest.json', base)), manifest = JSON.parse(inputRaw);
  const publicRoot = join(root, 'public'), comparisonRoot = join(root, 'comparison'), seedRoot = join(root, 'seed'), inventory = {};
  mkdirSync(seedRoot, { mode: 0o700 });
  for (const file of manifest.fixtures[fixture_id].files) {
    const bytes = readFileSync(new URL(file.path, base)); write(join(publicRoot, file.path), bytes);
    inventory[file.path] = { digest: hash(bytes), bytes: bytes.length };
  }
  const recipe = buildPrimaryFixtureRecipe(fixture_id), source = readFileSync(new URL('../AGENTS.md', import.meta.url)), renderer = readFileSync(new URL('./kernel-principles.mjs', import.meta.url));
  const generated = renderKernelPrinciples(source), agents = Buffer.from(buildAgentsBlock(generated.body));
  write(join(comparisonRoot, 'control/kernel-principles-source.md'), source);
  write(join(comparisonRoot, 'control/kernel-principles-renderer.mjs'), renderer);
  write(join(comparisonRoot, 'control/baselines/kernel_principles_v1/AGENTS.md'), agents);
  const arms = Object.fromEntries(PRIMARY_GRADING_CONDITIONS.map(id => [id, { path: `arms/${id}`, baseline_path: `control/baselines/${id}`,
    configuration: {}, assets: [], capability: { status: 'available' } }]));
  const baselineEntry = { digest: hash(agents), bytes: agents.length };
  Object.assign(arms.kernel_principles_v1, { label: 'K-principles', baseline_inventory: { 'AGENTS.md': baselineEntry },
    assets: [{ path: 'AGENTS.md', ...baselineEntry, kind: 'generated_principles_with_preserved_custom_instructions', origin: 'canonical_principles_projection' }],
    capability: principlesCapability(source, generated.body, generated.generation, recipe.runner_task_class) });
  const plan = { kind: 'ask_user_comparison_plan_v1', root: comparisonRoot, run_id: `synthetic-pending-${fixture_id}`,
    config: { evidence_kind: 'synthetic', kernel_condition: 'kernel_principles_v1', task_class: recipe.runner_task_class,
      global_ask_presence: 'unknown', cli_version: 'fake-not-executed', model: null, reasoning: null,
      timeout_ms: 100, verification_timeout_ms: 100, overall_timeout_ms: 1000, token_budget: null },
    policy: comparisonExecutionPolicy('single_shot_v1'), execution_protocol: { resume: 'forbidden' },
    kernel_definition: { canonical_source: { path: 'control/kernel-principles-source.md', digest: hash(source) },
      renderer_source: { path: 'control/kernel-principles-renderer.mjs', digest: hash(renderer) }, source_commit: 'f'.repeat(40), generation: generated.generation },
    source_installation: { preserved_custom_agents_digest: hash('') }, source: { repo: seedRoot, commit: 'f'.repeat(40), digest: hash('synthetic source'), inventory },
    input: { path: 'inputs/prompt.md', digest: hash('synthetic prompt') }, task: { path: 'control/task.md', digest: inventory['task.md'].digest },
    verification: { path: 'control/verification.json', digest: hash(raw(recipe)), recipe,
      reporter: { path: 'control/node-test-reporter.mjs', format: 'ask_node_summary_jsonl_v1', digest: hash('synthetic reporter') } },
    mutable_paths: recipe.mutable_paths, arms, unknowns: [], condition_differences: [] };
  write(join(comparisonRoot, 'control/plan.json'), raw(plan)); const planDigest = hash(raw(plan));
  write(join(comparisonRoot, 'control/plan.digest'), planDigest);
  write(join(comparisonRoot, 'control/task.md'), readFileSync(new URL('task.md', base)));
  write(join(comparisonRoot, 'inputs/prompt.md'), 'synthetic prompt');
  write(join(comparisonRoot, 'control/verification.json'), raw(recipe));
  write(join(comparisonRoot, 'control/node-test-reporter.mjs'), 'synthetic reporter');
  const inputPath = join(root, 'input.json'); write(inputPath, inputRaw);
  const ref = JSON.parse(readFileSync(new URL('evaluator-reference.json', base)));
  return { root: comparisonRoot, fixture_id, run_id: plan.run_id, plan_digest: planDigest, source_digest: plan.source.digest,
    task_digest: plan.task.digest, verification_digest: plan.verification.digest, public_input_root: publicRoot,
    input_manifest: { path: inputPath, digest: hash(inputRaw) }, grading: { status: 'ready', binding: { fixture_id,
      input_manifest_digest: hash(inputRaw), evaluator_bundle_digest: ref.evaluator_bundle_digest,
      scoring_input_freeze_digest: hash(readFileSync(new URL('scoring-input-freeze-manifest.json', base))), profile_id: 'primary_single_shot_v1' } } };
}
test('saved synthetic pending plans export/replay all nine fixed bindings without any dispatch', t => {
  for (const id of PRIMARY_FIXTURE_IDS) {
    const block = savedPending(t, id), preflight = preflightPrimaryEvaluationGrading(block);
    assert.equal(preflight.status, 'not_scoring_ready'); assert.deepEqual(preflight.binding, block.grading.binding);
    assert.equal(preflight.binding.scoring_input_freeze_digest, block.grading.binding.scoring_input_freeze_digest);
    const value = exportPrimaryEvaluationGradingRequest(block);
    assert.equal(value.request.fixture_id, id); assert.equal(value.request.controller.start_consumed, false);
    assert.equal(value.request.public_grading_references.scoring_input_freeze.raw_digest, block.grading.binding.scoring_input_freeze_digest);
    assert.ok(value.request.slots.every(slot => slot.requirement_judgments.length > 0 && slot.requirement_judgments.every(item => item.judgment === 'unknown')));
    assert.ok(value.request.slots.every(slot => slot.state === 'not_started' && slot.terminal_digest === null && slot.quality === null));
    const path = join(dirname(block.root), 'export.json'); writeFileSync(path, raw(value.request));
    const replay = replayPrimaryEvaluationGradingRequest(path, value.request_digest, block);
    assert.equal(replay.status, 'offline_export_verified'); assert.equal(replay.scoring_status, 'not_scoring_ready');
    assert.equal(replay.model_calls, 0); assert.equal(replay.grader_process_starts, 0);
    block.grading.binding.scoring_input_freeze_digest = hash('substitution');
    assert.equal(preflightPrimaryEvaluationGrading(block).binding, null);
    assert.throws(() => exportPrimaryEvaluationGradingRequest(block), /grading binding/);
  }
});
test('saved public recipe bytes cannot drift behind an unchanged plan digest', t => {
  const block = savedPending(t, 'mn-build-option-update');
  writeFileSync(join(block.root, 'control/verification.json'), 'changed');
  assert.equal(preflightPrimaryEvaluationGrading(block).binding, null);
  assert.throws(() => exportPrimaryEvaluationGradingRequest(block), /saved verification bytes/);
});
test('saved synthetic terminal production read branch preserves evidence and cannot invent a checkpoint', t => {
  const id = 'mn-build-option-update', block = savedPending(t, id), input = fixture(id);
  for (const condition of PRIMARY_GRADING_CONDITIONS) {
    const record = input.records[condition], value = record.value, folder = join(block.root, 'control/slots', condition);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    Object.assign(value, { run_id: block.run_id, plan_digest: block.plan_digest });
    const content = { 'stdout.jsonl': Buffer.from('fake stdout'), 'stderr.log': Buffer.from('fake stderr'),
      'patch.diff': Buffer.from('fake redacted diff'), 'changes.json': Buffer.from('fake scope') };
    for (const [index, check] of value.verification.checks.entries()) {
      check.cwd = join(block.root, 'verification', condition, input.recipe.checks[index].cwd);
      const name = `verification-${index}.request.json`, request = JSON.parse(record.commandRequests[name].raw);
      Object.assign(request, { run_id: block.run_id, plan_digest: block.plan_digest, cwd: check.cwd });
      content[name] = raw(request); content[`verification-${index}.spawn.json`] = Buffer.from(`fake spawn ${index}`);
      for (const name of check.logs) content[name] = Buffer.from(`fake ${name}`);
    }
    value.artifacts = Object.fromEntries(Object.entries(content).map(([name, bytes]) => [name, hash(bytes)]));
    for (const [name, bytes] of Object.entries(content)) writeFileSync(join(folder, name), bytes, { mode: 0o600 });
    writeFileSync(join(folder, 'result.json'), raw(value), { mode: 0o600 }); writeFileSync(join(folder, 'result.digest'), hash(raw(value)), { mode: 0o600 });
  }
  const value = exportPrimaryEvaluationGradingRequest(block);
  assert.ok(value.request.slots.every(slot => slot.terminal_digest && slot.native_checks.length > 0));
  assert.ok(value.request.slots.every(slot => slot.blockers.includes('controller_terminal_checkpoint_unverified')));
  assert.ok(value.request.slots.every(slot => slot.requirement_judgments.every(item => item.judgment === 'unknown')));
  assert.equal(value.request.controller.start_consumed, false); assert.equal(value.request.scoring_status, 'not_scoring_ready');
  const path = join(dirname(block.root), 'terminal-export.json'); writeFileSync(path, raw(value.request));
  assert.equal(replayPrimaryEvaluationGradingRequest(path, value.request_digest, block).status, 'offline_export_verified');
  writeFileSync(join(block.root, 'control/slots/plain/stderr.log'), 'changed');
  const drift = exportPrimaryEvaluationGradingRequest(block);
  assert.equal(drift.request.slots[0].terminal_digest, null); assert.equal(drift.request.slots[0].quality, null);
  assert.equal(replayPrimaryEvaluationGradingRequest(path, value.request_digest, block).status, 'blocked');
});

test('offline export writer refuses retained seed and symlink parents before writing', t => {
  const block = savedPending(t, 'mn-build-option-update'), parent = dirname(block.root);
  const seed = join(parent, 'seed'), output = join(parent, 'request.json');
  assert.throws(() => writePrimaryEvaluationGradingRequest(join(seed, 'oracle.json'), block), /overlaps/);
  const link = join(parent, 'seed-link'); symlinkSync(seed, link);
  assert.throws(() => writePrimaryEvaluationGradingRequest(join(link, 'oracle.json'), block), /canonical/);
  const external = join(parent, 'external'); mkdirSync(external); const externalLink = join(parent, 'external-link'); symlinkSync(external, externalLink);
  assert.throws(() => writePrimaryEvaluationGradingRequest(join(externalLink, 'request.json'), block), /canonical/);
  const value = writePrimaryEvaluationGradingRequest(output, block);
  assert.equal(hash(readFileSync(output)), value.request_digest);
  assert.throws(() => writePrimaryEvaluationGradingRequest(output, block));
});
