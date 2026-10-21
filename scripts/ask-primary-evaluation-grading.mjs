// Public offline export plus the fixed original grading adapter. CLI stays offline.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { comparisonHash } from './ask-user-comparison-prepare.mjs';
import { readUserComparisonPlan, reportUserComparison } from './ask-user-comparison.mjs';
import { buildPrimaryFixtureRecipe, primaryFixtureIdsForSet, isRegisteredPrimaryFixtureId } from './ask-primary-fixture-recipe.mjs';
import { producePrimaryEvaluationArtifacts, normalizePrimaryRuntimeObservationCarrier } from './ask-primary-evaluation-producer.mjs';
import { preflightPrimaryEvaluationGradingResources, runPrimaryEvaluationPrivateGrading } from './ask-primary-evaluation-private-grading.mjs';

import { primaryScoringRoot, verifyPrimaryScoringVersionResource } from './ask-primary-scoring-version.mjs';

import { PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_EVALUATION_CONDITIONS, primaryProfileForKernel, primaryProfileForRequest } from './ask-primary-evaluation-profile.mjs';

export const PRIMARY_GRADING_CONDITIONS = PRIMARY_EVALUATION_CONDITIONS;
export const PRIMARY_GRADING_PROFILE_ID = PRIMARY_EVALUATION_PROFILE_ID;
export const PRIMARY_GRADING_RESERVATION_MS = 11100000; // 4 original runs x 3 conditions x original API max 15m + 5m conversion/save.
const ROOT = fileURLToPath(new URL('../', import.meta.url)), LIMIT = 16 * 1024 * 1024;
const adapters = new WeakSet();
const read = path => readStableFile(path, 'public primary grading evidence', LIMIT).bytes;
const parse = raw => parseJsonRejectDuplicateKeys(raw.toString('utf8'));
const json = path => parse(read(path));
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const digest = value => assert.match(value, /^sha256:[a-f0-9]{64}$/u);
const serialize = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const notReady = blockers => ({ status: 'not_scoring_ready', scoring_status: 'not_scoring_ready',
  authority_status: 'unknown', quality: null, admission: 'unknown', blockers,
  model_calls: 0, grader_process_starts: 0 });
const unknownCauses = () => ({ model_implementation_failure: 'unknown', ask_procedure_or_judgment_problem: 'unknown',
  task_ambiguity_or_unsolvability: 'unknown', evaluator_false_positive_or_negative: 'unknown', execution_environment_failure: 'unknown' });

// Posthoc public grading metadata only; never added to an agent task prompt.
function publicReadoutAuthority(fixtureId, root) {
  const base = `benchmarks/fixtures/checkpoint-b2/${fixtureId}`;
  const load = name => { const path = `${base}/${name}.json`, raw = read(join(root, path)); return { path, raw, value: parse(raw) }; };
  const requirement = load('requirement-record'), output = load('output-contract'), reference = load('evaluator-reference'), freeze = load('scoring-input-freeze-manifest');
  for (const item of [requirement, output, reference, freeze]) assert.equal(item.value.fixture_id, fixtureId);
  for (const [item, pin] of [[requirement, freeze.value.requirement_record], [output, freeze.value.output_contract], [reference, freeze.value.evaluator_public_reference]]) {
    assert.equal(item.path, pin.path); assert.equal(comparisonHash(item.raw), pin.raw_byte_digest, 'public grading reference raw bytes drifted');
  }
  const r = requirement.value;
  assert.equal(r.requirement_record_digest, freeze.value.requirement_record.record_digest);
  assert.equal(r.requirement_set_digest, freeze.value.requirement_record.set_digest);
  assert.equal(output.value.output_contract_digest, freeze.value.output_contract.semantic_digest);
  assert.equal(reference.value.public_metadata_digest, freeze.value.evaluator_public_reference.semantic_digest);
  assert.ok(Array.isArray(r.requirements) && r.requirements.length > 0);
  const requirements = r.requirements.map(item => {
    assert.ok(typeof item.requirement_id === 'string' && item.requirement_id.length > 0); digest(item.requirement_digest);
    return { requirement_id: item.requirement_id, requirement_digest: item.requirement_digest };
  });
  assert.equal(new Set(requirements.map(item => item.requirement_id)).size, requirements.length);
  return { requirements, references: {
    requirement_record: { path: requirement.path, id: r.requirement_record_id, raw_digest: comparisonHash(requirement.raw),
      record_digest: freeze.value.requirement_record.record_digest, set_digest: freeze.value.requirement_record.set_digest },
    output_contract: { path: output.path, id: output.value.output_contract_id, raw_digest: comparisonHash(output.raw),
      semantic_digest: output.value.output_contract_digest, result_profile: output.value.result_profile },
    evaluator_reference: { path: reference.path, raw_digest: comparisonHash(reference.raw), semantic_digest: reference.value.public_metadata_digest,
      bundle_id: reference.value.evaluator_bundle_id, bundle_digest: reference.value.evaluator_bundle_digest, revision: reference.value.evaluator_revision },
    scoring_input_freeze: { path: freeze.path, raw_digest: comparisonHash(freeze.raw), semantic_digest: freeze.value.manifest_digest,
      revision: freeze.value.freeze_revision, result_profile: freeze.value.result_profile },
  } };
}

function publicBinding(block, loaded, root) {
  const { plan, plan_digest } = loaded;
  assert.equal(plan.primary_execution_input, undefined, 'closed primary input processing requires a separately reviewed version');
  assert.equal(loaded.root, resolve(block.root), 'controller root substitution');
  assert.ok(isRegisteredPrimaryFixtureId(block.fixture_id), 'unknown primary fixture');
  assert.equal(plan.policy.execution_contract, 'single_shot_v1', 'grading export requires single_shot_v1');
  const profile = primaryProfileForKernel(plan.config.kernel_condition);
  assert.deepEqual(Object.keys(plan.arms).sort(), [...profile.conditions].sort(), 'actual condition IDs required');
  assert.equal(plan.run_id, block.run_id); assert.equal(plan_digest, block.plan_digest);
  for (const name of ['source', 'task', 'verification']) {
    digest(block[`${name}_digest`]); assert.equal(plan[name].digest, block[`${name}_digest`]);
  }
  for (const name of ['task', 'input', 'verification']) {
    assert.ok(typeof plan[name].path === 'string' && !plan[name].path.startsWith('/')
      && !plan[name].path.includes('\\') && plan[name].path.split('/').every(part => part && part !== '.' && part !== '..'));
    assert.equal(comparisonHash(read(join(block.root, plan[name].path))), plan[name].digest, `saved ${name} bytes changed`);
  }
  assert.equal(comparisonHash(read(join(block.root, plan.verification.reporter.path))), plan.verification.reporter.digest, 'saved reporter bytes changed');
  const recipe = buildPrimaryFixtureRecipe(block.fixture_id, { root });
  assert.deepEqual(plan.verification.recipe, recipe, 'formal fixture recipe required');
  assert.equal(plan.config.task_class, recipe.runner_task_class, 'runner task class substitution');
  assert.deepEqual(plan.mutable_paths, recipe.mutable_paths, 'mutable scope substitution');
  digest(block.input_manifest.digest);
  const raw = read(block.input_manifest.path), fixed = read(join(root, 'benchmarks/fixtures/checkpoint-b2', block.fixture_id, 'input-manifest.json'));
  assert.equal(comparisonHash(raw), block.input_manifest.digest, 'public input raw digest changed');
  assert.deepEqual(raw, fixed, 'public input manifest is not the fixed raw authority');
  assert.equal(recipe.input_manifest_digest, block.input_manifest.digest);
  const manifest = parse(raw), expected = {};
  assert.deepEqual(Object.keys(manifest.fixtures), [block.fixture_id]);
  for (const file of manifest.fixtures[block.fixture_id].files) {
    assert.ok(file.path === 'task.md' || /^workspace\/(?!.*(?:^|\/)\.{1,2}(?:\/|$))[^\\\0]+$/u.test(file.path));
    assert.ok(!Object.hasOwn(expected, file.path));
    expected[file.path] = { bytes: file.bytes, digest: `sha256:${file.sha256}` };
    const bytes = read(join(block.public_input_root, file.path));
    assert.equal(bytes.length, file.bytes); assert.equal(comparisonHash(bytes), expected[file.path].digest);
  }
  assert.deepEqual(Object.keys(plan.source.inventory).sort(), Object.keys(expected).sort());
  for (const [path, entry] of Object.entries(expected)) {
    assert.equal(plan.source.inventory[path].digest, entry.digest); assert.equal(plan.source.inventory[path].bytes, entry.bytes);
  }
  assert.equal(plan.task.digest, expected['task.md'].digest);
  const scoringRoot = primaryScoringRoot(block, { root });
  const base = join(scoringRoot, 'benchmarks/fixtures/checkpoint-b2', block.fixture_id);
  const reference = json(join(base, 'evaluator-reference.json'));
  assert.equal(reference.fixture_id, block.fixture_id); assert.equal(reference.fixture_input_digest, block.input_manifest.digest);
  assert.equal(reference.task_class, recipe.task_class); digest(reference.evaluator_bundle_digest);
  const binding = { fixture_id: block.fixture_id, input_manifest_digest: block.input_manifest.digest,
    evaluator_bundle_digest: reference.evaluator_bundle_digest,
    scoring_input_freeze_digest: comparisonHash(read(join(base, 'scoring-input-freeze-manifest.json'))), profile_id: profile.id };
  assert.deepEqual(block.grading?.binding, binding, 'declared grading binding differs from fixed public metadata pins');
  return { recipe, binding, readoutAuthority: publicReadoutAuthority(block.fixture_id, scoringRoot) };
}

/** Public identity readiness: evaluator code/answers are deliberately not opened.
 * An explicit version selects its sealed public closure; resource authority is
 * independently checked by the registered adapter.
 * Caller fields such as grading.status/ready/admitted cannot authorize dispatch. */
export function preflightPrimaryEvaluationGrading(block, { root = ROOT } = {}) {
  try {
    const loaded = readUserComparisonPlan(block.root);
    if (loaded.plan.primary_execution_input) return { ...notReady(['closed_primary_input_processing_unconfigured']), binding: null,
      timeout_ms: block.grading?.timeout_ms ?? PRIMARY_GRADING_RESERVATION_MS };
    const { binding } = publicBinding(block, loaded, root);
    return { ...notReady(['private_original_bundle_authority_unavailable', 'private_admission_review_authority_unavailable',
      'frozen_scoring_runtime_not_configured', 'private_evaluator_runtime_unverified']), binding, timeout_ms: block.grading?.timeout_ms ?? PRIMARY_GRADING_RESERVATION_MS };
  } catch {
    return { ...notReady(['public_controller_fixture_binding_unverified', 'private_original_bundle_authority_unavailable']), binding: null, timeout_ms: block.grading?.timeout_ms ?? PRIMARY_GRADING_RESERVATION_MS };
  }
}

function artifactMap(artifacts) {
  const copy = {};
  for (const [name, value] of Object.entries(artifacts ?? {})) {
    assert.ok(/^[a-zA-Z0-9._-]+$/u.test(name) && name !== '.' && name !== '..', 'unsafe slot artifact');
    digest(value); copy[name] = value;
  }
  return copy;
}

function buildRequest({ block, loaded, report, records, recipe, binding, readoutAuthority, testOnly = false }) {
  const { plan, plan_digest } = loaded, profile = primaryProfileForKernel(plan.config.kernel_condition);
  assert.equal(recipe.fixture_id, block.fixture_id); assert.equal(binding.fixture_id, block.fixture_id);
  assert.equal(binding.input_manifest_digest, recipe.input_manifest_digest); assert.equal(binding.profile_id, profile.id);
  assert.equal(block.run_id, plan.run_id); assert.equal(block.plan_digest, plan_digest);
  assert.ok(readoutAuthority?.requirements?.length > 0, 'public requirement readout references required');
  const requirementUnknowns = () => readoutAuthority.requirements.map(item => ({ ...item, judgment: 'unknown', quality: null,
    evidence_status: 'unknown', evidence_refs: [], evaluator_result_ref: null }));
  assert.equal(report.run_id, plan.run_id); assert.equal(report.plan_digest, plan_digest);
  assert.deepEqual(report.slots.map(slot => slot.condition), profile.conditions, 'report condition substitution');
  const slots = report.slots.map(slot => {
    const record = records[slot.condition];
    if (!record || slot.receipt_integrity !== 'valid') return { condition: slot.condition, state: slot.state ?? 'unknown',
      terminal_digest: null, quality: null, authority_status: 'unknown', requirement_judgments: requirementUnknowns(),
      cause_analysis: unknownCauses(), blockers: ['controller_terminal_unavailable'] };
    const terminal = record.value;
    assert.equal(comparisonHash(record.raw), record.digest, 'terminal raw digest changed');
    assert.ok(same(parse(record.raw), terminal), 'terminal differs from raw saved record');
    for (const [key, value] of Object.entries({ condition: slot.condition, run_id: plan.run_id, plan_digest,
      evidence_kind: plan.config.evidence_kind })) assert.equal(terminal[key], value, `terminal ${key} substitution`);
    const artifacts = artifactMap(terminal.artifacts), blockers = [];
    const checkpointDigest = report.execution?.history?.snapshot?.slots?.[slot.condition]?.terminal_digest;
    if (checkpointDigest !== record.digest) blockers.push('controller_terminal_checkpoint_unverified');
    if (!artifacts['stdout.jsonl'] || !artifacts['stderr.log']) blockers.push('stdout_stderr_artifacts_unavailable');
    if (terminal.process_completed !== true || terminal.unresolved_child !== false) blockers.push('process_termination_unknown');
    const checks = (terminal.verification?.checks ?? []).map((check, index) => {
      const expected = recipe.checks.find(value => value.id === check.id);
      assert.ok(expected, 'unknown native check ID');
      assert.equal(check.command_id, expected.id); assert.equal(check.command_contract_digest, expected.contract_command_digest);
      assert.equal(check.fixture_input_digest, recipe.input_manifest_digest);
      assert.equal(check.verification_kind, 'native_public_command');
      assert.deepEqual(check.command, [expected.executable, ...expected.argv]);
      assert.equal(check.cwd, join(block.root, 'verification', slot.condition, expected.cwd));
      const logs = artifactMap(Object.fromEntries((check.logs ?? []).map(name => [name, artifacts[name]])));
      assert.deepEqual(check.logs, [`verification-${index}.stdout.log`, `verification-${index}.stderr.log`, `verification-${index}.log`], 'native stdout/stderr/view logs required');
      const requestName = `verification-${index}.request.json`, spawnName = `verification-${index}.spawn.json`;
      const commandRequest = record.commandRequests?.[requestName];
      if (!commandRequest || !artifacts[requestName] || !artifacts[spawnName]) blockers.push('native_command_receipts_unavailable');
      else {
        assert.equal(comparisonHash(commandRequest.raw), artifacts[requestName]);
        const request = parse(commandRequest.raw);
        for (const [key, value] of Object.entries({ condition: slot.condition, run_id: plan.run_id, plan_digest,
          evidence_kind: plan.config.evidence_kind, command_id: expected.id, command_contract_digest: expected.contract_command_digest,
          fixture_input_digest: recipe.input_manifest_digest, observation_origin: 'controller_native_fixture_command',
          executable: expected.executable, cwd: check.cwd })) assert.equal(request[key], value, `native request ${key} mismatch`);
        assert.deepEqual(request.argv, expected.argv);
      }
      if (check.process_completed !== true || check.spawn_observed !== true || !Number.isInteger(check.exit_code)) blockers.push('native_check_termination_unknown');
      return { id: check.id, command_contract_digest: check.command_contract_digest, fixture_input_digest: check.fixture_input_digest,
        command: check.command, cwd: check.cwd, exit_code: check.exit_code ?? null, spawn_observed: check.spawn_observed ?? null,
        process_completed: check.process_completed ?? null, test_result: check.test_result ?? 'unknown', status: check.status ?? 'unknown',
        log_metadata: check.log_metadata ?? null, artifacts: logs, request_digest: artifacts[requestName] ?? null,
        spawn_digest: artifacts[spawnName] ?? null, semantic_quality: 'unknown' };
    });
    assert.equal(new Set(checks.map(check => check.id)).size, checks.length, 'duplicate native check');
    if (!same(checks.map(check => check.id), recipe.checks.map(check => check.id))) blockers.push('native_checks_incomplete');
    return { condition: slot.condition, state: terminal.state, public_outcome: terminal.outcome,
      terminal_digest: record.digest, terminal_ref: `control/slots/${slot.condition}/result.json`,
      controller_checkpoint_digest: checkpointDigest ?? null,
      launch_requested: terminal.launch_requested ?? null, spawn_observed: terminal.spawn_observed ?? null,
      process_completed: terminal.process_completed ?? null, unresolved_child: terminal.unresolved_child ?? null,
      exit_code: terminal.exit_code ?? null, scope: terminal.scope ?? { status: 'unknown' },
      usage: { metrics: terminal.metrics ?? null, lower_bound: terminal.usage_lower_bound ?? null, cost: terminal.cost ?? null },
      artifacts, native_checks: checks, verification_origin: terminal.verification?.execution_origin ?? 'unknown',
      quality: null, authority_status: 'unknown', requirement_judgments: requirementUnknowns(), cause_analysis: unknownCauses(), blockers };
  });
  return { kind: 'ask_primary_evaluation_grading_request_v1', profile_id: profile.id,
    evidence_kind: plan.config.evidence_kind, test_only: testOnly, run_id: plan.run_id, plan_digest,
    fixture_id: block.fixture_id, fixture_input_digest: recipe.input_manifest_digest, formal_task_class: recipe.task_class,
    runner_task_class: recipe.runner_task_class, public_scope: recipe.mutable_paths, source_digest: plan.source.digest,
    task_digest: plan.task.digest, verification_digest: plan.verification.digest, binding,
    ...(block.grading?.scoring_version ? { scoring_version: structuredClone(block.grading.scoring_version) } : {}), conditions: [...profile.conditions], slots,
    public_grading_references: readoutAuthority.references,
    controller: { state: report.execution?.state ?? 'unknown', history_digest: report.execution?.history?.digest ?? null,
      start_consumed: report.execution?.start_consumed ?? null },
    scorer_connection: { status: 'profile_and_normalization_implemented_private_runtime_pending', verify_export: 'scripts/ask-benchmark-evaluator-boundary.mjs#verifyEvaluatorAuthority',
      score_export: 'scripts/ask-benchmark-portfolio-score.mjs#scoreEvaluatorResult',
      options: null, missing: ['fixed_private_originals', 'scoring_input_freeze_authority'] },
    ...notReady(['private_original_bundle_authority_unavailable']) };
}

/** Read the saved report and terminals ourselves; a supplied child report is not authority. */
export function exportPrimaryEvaluationGradingRequest(block, { root = ROOT } = {}) {
  const loaded = readUserComparisonPlan(block.root), { recipe, binding, readoutAuthority } = publicBinding(block, loaded, root);
  const report = reportUserComparison(block.root), records = {};
  for (const slot of report.slots) {
    if (slot.receipt_integrity !== 'valid') continue;
    const folder = join(block.root, 'control/slots', slot.condition), raw = read(join(folder, 'result.json'));
    const terminalDigest = read(join(folder, 'result.digest')).toString('utf8');
    assert.equal(comparisonHash(raw), terminalDigest);
    const value = parse(raw);
    for (const [name, expected] of Object.entries(artifactMap(value.artifacts))) assert.equal(comparisonHash(read(join(folder, name))), expected);
    assert.ok(same(value, Object.fromEntries(Object.entries(slot).filter(([key]) => key !== 'receipt_integrity'))), 'report/terminal mismatch');
    const commandRequests = {};
    for (const name of Object.keys(value.artifacts).filter(name => /^verification-\d+\.request\.json$/u.test(name))) commandRequests[name] = { raw: read(join(folder, name)) };
    records[slot.condition] = { raw, digest: terminalDigest, value, commandRequests };
  }
  const request = buildRequest({ block, loaded, report, records, recipe, binding, readoutAuthority });
  // Re-read at export boundary so changed source/plan/terminal bytes cannot be quietly retained.
  assert.equal(readUserComparisonPlan(block.root).plan_digest, loaded.plan_digest);
  publicBinding(block, loaded, root);
  for (const slot of request.slots) if (slot.terminal_digest) {
    assert.equal(comparisonHash(read(join(block.root, slot.terminal_ref))), slot.terminal_digest);
    for (const [name, expected] of Object.entries(slot.artifacts)) assert.equal(comparisonHash(read(join(dirname(join(block.root, slot.terminal_ref)), name))), expected);
  }
  const finalReport = reportUserComparison(block.root);
  assert.equal(finalReport.execution?.history?.digest, report.execution?.history?.digest, 'controller history changed at export boundary');
  return { request, request_digest: comparisonHash(serialize(request)), readout: buildPrimaryEvaluationReadout(request) };
}

/** Pure fake fixture coverage of the mapper; never eligible for production adapter membership. */
export function exportPrimaryEvaluationGradingForTest(input) {
  assert.equal(input.loaded.plan.config.evidence_kind, 'synthetic', 'test export forbids observed evidence');
  primaryProfileForKernel(input.loaded.plan.config.kernel_condition);
  const request = buildRequest({ ...input, readoutAuthority: publicReadoutAuthority(input.block.fixture_id, ROOT), testOnly: true });
  return { request, request_digest: comparisonHash(serialize(request)), readout: buildPrimaryEvaluationReadout(request) };
}

export function buildPrimaryEvaluationReadout(request) {
  primaryProfileForRequest(request);
  return { kind: 'ask_primary_evaluation_task_readout_v1', fixture_id: request.fixture_id,
    formal_task_class: request.formal_task_class, run_id: request.run_id, plan_digest: request.plan_digest,
    public_grading_references: request.public_grading_references,
    ...(request.scoring_version ? { scoring_version: structuredClone(request.scoring_version) } : {}),
    conditions: request.slots.map(slot => ({ condition: slot.condition, execution_state: slot.state, quality: null,
      scope: slot.scope ?? { status: 'unknown' }, usage: slot.usage ?? null,
      native_checks: slot.native_checks ?? [], requirement_judgments: slot.requirement_judgments, cause_analysis: slot.cause_analysis, blockers: slot.blockers })),
    cause_analysis: unknownCauses(),
    posthoc_candidates: [], scoring_status: 'not_scoring_ready', semantic_quality: 'unknown',
    limitation: 'Public command results are structural evidence only. Cause attribution and private quality remain unknown.' };
}

/** Digest-pinned replay re-exports saved evidence; it never scores or upgrades readiness. */
export function replayPrimaryEvaluationGradingRequest(path, expectedDigest, block, options = {}) {
  try {
    digest(expectedDigest); const raw = read(path); assert.equal(comparisonHash(raw), expectedDigest);
    const saved = parse(raw), current = exportPrimaryEvaluationGradingRequest(block, options);
    assert.ok(same(saved, current.request), 'saved request changed or controller lineage drifted');
    return { status: 'offline_export_verified', ...current, scoring_status: 'not_scoring_ready', quality: null, model_calls: 0, grader_process_starts: 0 };
  } catch { return { ...notReady(['saved_export_or_controller_lineage_unverified']), status: 'blocked' }; }
}

const resourceKeys = ['frozenSourceRoot', 'privateRoot', 'manifestPath', 'admissionDecisionPath',
  'admissionReviewAuthorityPath', 'admissionReviewAuthoritySourceDigest', 'admissionReviewArchivePath'];
const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
function immutableTree(path) {
  assert.equal(realpathSync(path), path, 'fixed resource must be canonical');
  const stat = lstatSync(path);
  assert.equal(stat.mode & 0o222, 0, 'fixed resources must be read-only');
  if (stat.isDirectory()) for (const name of readdirSync(path)) immutableTree(join(path, name));
  else assert.ok(stat.isFile() && stat.nlink === 1, 'fixed resource cannot be linked or special');
}
function loadResources(path, expectedDigest, root) {
  digest(expectedDigest); assert.equal(realpathSync(path), path);
  const raw = read(path); assert.equal(comparisonHash(raw), expectedDigest, 'grading resources changed');
  const resources = parse(raw);
  assert.deepEqual(Object.keys(resources).sort(), ['kind', 'output_root', 'fixtures'].sort());
  assert.equal(resources.kind, 'ask_primary_grading_resources_v1');
  const ids = Object.keys(resources.fixtures).sort();
  const fixtureSet = ids.length === primaryFixtureIdsForSet('catalog24').length ? 'catalog24' : 'legacy9';
  assert.deepEqual(ids, [...primaryFixtureIdsForSet(fixtureSet)].sort(), 'complete registered grading resource inventory required');
  assert.equal(resolve(resources.output_root), resources.output_root);
  assert.equal(realpathSync(dirname(resources.output_root)), dirname(resources.output_root));
  assert.ok(!existsSync(resources.output_root), 'grading output already exists');
  for (const resource of Object.values(resources.fixtures)) {
    assert.deepEqual(Object.keys(resource).sort(), [...resourceKeys].sort());
    digest(resource.admissionReviewAuthoritySourceDigest);
    for (const key of resourceKeys.filter(key => key !== 'admissionReviewAuthoritySourceDigest')) {
      assert.equal(resolve(resource[key]), resource[key]); assert.equal(realpathSync(resource[key]), resource[key]);
      assert.ok(!overlaps(resource[key], resources.output_root), 'grading output overlaps fixed asset');
    }
    assert.ok(!overlaps(root, resources.output_root) && !overlaps(path, resources.output_root));
    immutableTree(resource.frozenSourceRoot); immutableTree(resource.privateRoot);
    assert.ok(lstatSync(join(resource.frozenSourceRoot, '.git')).isDirectory(), 'independent Git root required');
    assert.ok(!existsSync(join(resource.frozenSourceRoot, '.git/objects/info/alternates')), 'shared Git alternates forbidden');
  }
  return resources;
}

/** Execution completion is separate from whether semantic quality was resolved. */
export function primaryGradingSemanticQuality(conditions, requiredConditions) {
  const resolved = requiredConditions.map(condition => conditions.find(item => item.condition === condition))
    .filter(item => item?.status === 'completed' && typeof item.quality === 'number' && Number.isFinite(item.quality));
  return resolved.length === requiredConditions.length && requiredConditions.length > 0 ? 'scored' : resolved.length > 0 ? 'partial' : 'unknown';
}

/** Resources are separately pinned and private; no caller readiness labels or grader callbacks. */
export function createPrimaryEvaluationGradingAdapter({ root = ROOT, resourcesPath = null, resourcesDigest = null } = {}) {
  assert.equal(resourcesPath === null, resourcesDigest === null, 'resource path and raw digest supplied together');
  let configuration = null;
  const resourceFor = block => {
    if (!resourcesPath) return null;
    const currentRaw = read(resourcesPath); assert.equal(comparisonHash(currentRaw), resourcesDigest, 'grading resources changed');
    if (!configuration) configuration = loadResources(resourcesPath, resourcesDigest, root);
    const resource = configuration.fixtures[block.fixture_id]; assert.ok(resource);
    verifyPrimaryScoringVersionResource(block, resource, { root });
    assert.deepEqual(block.grading.resources, { path: resourcesPath, digest: resourcesDigest }, 'grading resources are not bound to fixed batch');
    for (const key of resourceKeys.filter(key => key !== 'admissionReviewAuthoritySourceDigest')) immutableTree(resource[key]);
    const loaded = readUserComparisonPlan(block.root);
    for (const path of [block.root, block.public_input_root, loaded.plan.source.repo]) {
      assert.ok(!overlaps(resolve(path), configuration.output_root), 'grading output overlaps execution input');
      for (const key of resourceKeys.filter(key => key !== 'admissionReviewAuthoritySourceDigest'))
        assert.ok(!overlaps(resolve(path), resource[key]), 'private grading asset overlaps execution input');
    }
    return resource;
  };
  const adapter = Object.freeze({
    preflight(block) {
      const value = preflightPrimaryEvaluationGrading(block, { root });
      if (!resourcesPath || !value.binding) return { ...value, status: 'blocked' };
      try {
        assert.equal(block.grading.timeout_ms, PRIMARY_GRADING_RESERVATION_MS, 'full original grading reservation required');
        const resource = resourceFor(block), loaded = readUserComparisonPlan(block.root);
        publicBinding(block, loaded, root);
        return preflightPrimaryEvaluationGradingResources(block, resource);
      } catch { return { ...notReady(['fixed_grading_resource_authority_unverified']), status: 'blocked' }; }
    },
    async grade(block, _report, { signal = null, deadline_at_ms = null } = {}) {
      let started = false;
      try {
        assert.equal(adapter.preflight(block).status, 'ready', 'grading resource preflight required');
        assert.ok(!signal?.aborted);
        const profile = primaryProfileForKernel(readUserComparisonPlan(block.root).plan.config.kernel_condition);
        const resource = resourceFor(block), output = join(configuration.output_root, block.fixture_id);
        mkdirSync(configuration.output_root, { recursive: true, mode: 0o700 }); mkdirSync(output, { mode: 0o700 });
        const produced = await producePrimaryEvaluationArtifacts(block, join(output, 'producer'));
        const producerOptions = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
        const runtimeObservationRoot = block.fixture_id === 'pf-performance-regression' ? join(output, 'runtime-observations') : null;
        if (runtimeObservationRoot) normalizePrimaryRuntimeObservationCarrier(producerOptions, { observationRoot: runtimeObservationRoot });
        const conditions = [];
        for (const condition of profile.conditions) {
          assert.ok(!signal?.aborted);
          const privateEvaluationRoot = join(output, `private-${condition}`); mkdirSync(privateEvaluationRoot, { mode: 0o700 });
          started = true;
          const graded = runPrimaryEvaluationPrivateGrading(producerOptions, { ...resource, condition,
            ...(runtimeObservationRoot ? { runtimeObservationRoot } : {}),
            privateEvaluationRoot, publicResultRoot: join(output, `public-${condition}`) },
          { signal, deadlineAtMs: deadline_at_ms });
          conditions.push(graded);
          if (graded.status !== 'completed') break;
        }
        const complete = conditions.length === profile.conditions.length && conditions.every(value => value.status === 'completed');
        const numericComplete = complete && conditions.every(value => value.scoring_status === 'complete');
        const exported = exportPrimaryEvaluationGradingRequest(block, { root });
        const readout = { ...exported.readout, scoring_status: numericComplete ? 'complete' : 'not_scoring_ready',
          ...(exported.request.scoring_version ? { grading_execution_status: complete ? 'completed' : 'incomplete' } : {}),
          conditions: exported.readout.conditions.map(slot => {
            const graded = conditions.find(item => item.condition === slot.condition);
            if (!graded || graded.status !== 'completed') return { ...slot, private_grading: graded ?? { status: 'not_started' } };
            const envelope = json(graded.public_artifacts.evaluator_result.path);
            assert.equal(comparisonHash(read(graded.public_artifacts.evaluator_result.path)), graded.public_artifacts.evaluator_result.digest);
            return { ...slot, quality: graded.quality, requirement_judgments: envelope.requirement_results,
              evaluator_result_ref: graded.public_artifacts.evaluator_result, private_grading: graded };
          }), semantic_quality: primaryGradingSemanticQuality(conditions, profile.conditions) };
        writeFileSync(join(output, 'task-readout.json'), serialize(readout), { mode: 0o600, flag: 'wx' });
        return { status: complete ? 'completed' : 'unknown', scoring_status: readout.scoring_status, quality: null,
          conditions, readout, producer: { record_root: produced.output_root, digest: produced.external_digest },
          formal_aggregate_eligible: false, grader_process_completed: conditions.some(item => item.grader_process_completed === null)
            ? null : conditions.length > 0 && conditions.every(item => item.grader_process_completed === true),
          grader_process_starts: conditions.every(item => Number.isInteger(item.grader_process_starts))
            ? conditions.reduce((count, item) => count + item.grader_process_starts, 0) : null };
      } catch { return { ...notReady(['controller_or_original_grading_pipeline_unverified']), status: 'unknown',
        grader_process_completed: started ? null : false, grader_process_starts: started ? null : 0 }; }
    },
  });
  adapters.add(adapter); return adapter;
}
export const isPrimaryEvaluationGradingAdapter = adapter => adapters.has(adapter);

/** Export writes must be outside every retained input, including the independent seed. */
export function writePrimaryEvaluationGradingRequest(output, block, { root = ROOT } = {}) {
  assert.ok(output && !existsSync(output));
  const target = resolve(output), parent = dirname(target);
  assert.equal(realpathSync(parent), parent, 'export parent must be canonical and contain no symlink');
  const loaded = readUserComparisonPlan(block.root);
  for (const input of [root, block.root, block.public_input_root, loaded.plan.source.repo]) {
    const base = realpathSync(input);
    assert.ok(target !== base && !target.startsWith(`${base}/`), 'export overlaps a retained authority/input');
  }
  const value = exportPrimaryEvaluationGradingRequest(block, { root });
  writeFileSync(join(parent, basename(target)), serialize(value.request), { mode: 0o600, flag: 'wx' });
  return value;
}

// CLI is offline export/replay only; no start/resume or scorer command exists.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, blockPath, output, pinnedDigest] = process.argv.slice(2), block = json(blockPath);
    if (command === 'preflight') console.log(JSON.stringify(preflightPrimaryEvaluationGrading(block), null, 2));
    else if (command === 'export') {
      const value = writePrimaryEvaluationGradingRequest(output, block);
      console.log(JSON.stringify({ request_digest: value.request_digest, readout: value.readout }, null, 2));
    } else if (command === 'replay') console.log(JSON.stringify(replayPrimaryEvaluationGradingRequest(output, pinnedDigest, block), null, 2));
    else throw new Error('offline command required');
  } catch { console.error('Primary grading offline export refused; no process started.'); process.exitCode = 1; }
}
