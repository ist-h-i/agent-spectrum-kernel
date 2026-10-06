import { mkdirSync, writeFileSync, lstatSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { digest, sourceBytes, safePath, assetRecords } from './ask-core-bundle-product.mjs';
import { coreFixtureInputs } from './ask-core-task-admission.mjs';
import { replayCoreConnectedNormalization } from './ask-core-connected-normalizer.mjs';
import { replayCoreNativeContract } from './ask-core-native-preparation.mjs';
import { auditCoreBundle, inventoryCoreInstall } from './install-ask-core-bundle.mjs';
import { inspectCoreControllerRecords } from './ask-core-controller-records.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { noAcl } from './ask-local-codex-boundaries.mjs';
import { buildCodexCommandEvidence, buildUnavailableCommandEvidence, validateVerificationCommandContract, validateCommandEvidenceManifest } from './ask-benchmark-command-evidence.mjs';
import { captureTerminalWorkspaceInventory, buildTerminalWorkspaceAuthority, readVerifiedTerminalWorkspaceAuthority } from './ask-benchmark-terminal-workspace.mjs';
import { normalizePortfolioExecution, verifyNormalizedPortfolioResults } from './ask-benchmark-normalized-results.mjs';
import { materializeVerifiedTerminalCandidate } from './ask-benchmark-terminal-candidate.mjs';
import { coreGradingSources } from './ask-core-grading-authority.mjs';
import { withCoreCaptureProducer } from './ask-core-producer-scope.mjs';
import { verifyPortfolioScoringRootLineage, verifyPublicEvaluatorReference, verifyPrivateEvaluatorBundle, readEvaluatorAuthorityAnchorFromFreeze, createProductionSealedEvaluatorExecution } from './ask-benchmark-evaluator-boundary.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONDITIONS = ['plain', 'core', 'full'];
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const rawJsonDigest = value => digest(Buffer.from(JSON.stringify(value) + '\n'));
const overlap = (a, b) => a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
function need(ok, reason = 'core_capture_producer_refused') { if (!ok) throw new Error(reason); }
function closed(v, keys) { need(v && typeof v === 'object' && !Array.isArray(v) && same(Object.keys(v).sort(), [...keys].sort())); }
function json(bytes) { return parseJsonRejectDuplicateKeys(new TextDecoder('utf8', { fatal: true }).decode(bytes)); }
function read(path, max = 33554432, derivedPublicRecord = false) {
  const s = lstatSync(path);
  need(realpathSync(path) === path && s.isFile() && s.nlink === 1 && s.uid === process.getuid(), 'core_producer_regular_owned_file_required');
  need([0o600, 0o444, ...(derivedPublicRecord ? [0o644] : [])].includes(s.mode & 0o777), 'core_producer_file_mode_changed');
  return readStableFile(path, 'Core capture producer evidence', max).bytes;
}
function privateDirectory(path) {
  const s = lstatSync(path);
  need(realpathSync(path) === path && s.isDirectory() && s.uid === process.getuid() && (s.mode & 0o777) === 0o700, 'core_producer_private_directory_required');
  noAcl([path]);
}
function write(root, path, value, mode = 0o600) {
  need(safePath(path));
  mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, path), Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + '\n'), { flag: 'wx', mode });
}
function files(root, prefix = '', excludeNormalized = false) {
  const result = new Map(), checked = [];
  const visit = p => {
    if (excludeNormalized && (p === 'normalized' || p.startsWith('normalized/'))) return;
    const s = lstatSync(join(root, p));
    need(!s.isSymbolicLink() && s.uid === process.getuid() && realpathSync(join(root, p)) === join(root, p));
    checked.push(join(root, p));
    if (s.isDirectory()) { need((s.mode & 0o777) === 0o700, 'core_producer_directory_mode_changed'); for (const n of readdirSync(join(root, p)).sort()) visit(p ? p + '/' + n : n); }
    else { need(s.isFile() && s.nlink === 1 && result.size < 4096); result.set(p, read(join(root, p))); }
  };
  visit(prefix);
  for (let i = 0; i < checked.length; i += 64) noAcl(checked.slice(i, i + 64));
  return result;
}
function inventory(entries) { return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)).map(([p, b]) => [p, { bytes: b.length, digest: digest(b) }])); }
function capture(root, sha) {
  const n = replayCoreConnectedNormalization(root, sha);
  need(n.status === 'offline_connected_normalization_verified', 'core_producer_saved_capture_not_verified');
  return n;
}
function controllerInput(root, manifest) {
  const p = name => read(join(root, 'controller', name), name.endsWith('.stdout') ? 8388608 : 1048576);
  return { producerRecordBytes: p('producer.json'), producerRecordDigest: manifest.controller.producer_record_digest, producerStdoutBytes: p('producer.stdout'), reviewerRecordBytes: p('reviewer.json'), reviewerRecordDigest: manifest.controller.reviewer_record_digest, reviewerStdoutBytes: p('reviewer.stdout'), ownerBytes: p('owner.json'), ownerDigest: manifest.controller.owner_digest };
}
function invocationBinding(n, input) {
  const source = json(read(join(input.captureRoot, 'connected-source.json')));
  const evidenceClass = n.evidence_class === 'synthetic_process_only' ? 'synthetic_fixture' : 'owner_attested_native_record';
  const records = inspectCoreControllerRecords(input.controllerRecords, { expectedHead: source.request.git_head, expectedTask: n.fixture_id, expectedCaptureDigest: n.result_digest, expectedRequestDigest: n.execution_request_digest, evidenceClass });
  if (evidenceClass === 'owner_attested_native_record') need(execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 1000, maxBuffer: 1024, env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } }).trim() === source.request.git_head, 'core_producer_native_head_changed');
  return { source, records, evidenceClass };
}
function ids(n) {
  const hex = canonicalDigest({ capture: n.connection_digest, product: n.product_digest }).slice(7);
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return { run: uuid, block: `block-${hex.slice(0, 16)}-${hex.slice(16, 28)}`, cases: Object.fromEntries(CONDITIONS.map(c => [c, `case-${hex.slice(0, 16)}-${canonicalDigest(c).slice(7, 23)}`])) };
}
function artifactPaths(root) { return { root: ROOT, config: null, planPath: join(root, 'plan.json'), materializedPath: join(root, 'materialized'), selectionState: join(root, 'selection'), runDir: join(root, 'run') }; }
function commandEvidence(identity, stream, contract) {
  // This is the existing actual Codex JSONL parser, not a command inferred from
  // final output, task success, shell text or a fixture's preferred answer.
  try { return buildCodexCommandEvidence({ identity, stream, contract }); }
  catch { return buildUnavailableCommandEvidence({ identity, support: 'supported', probe: 'capture_invalid', reason: 'saved_command_stream_unavailable', stream }); }
}
function derive(root, n, source, preparation) {
  const id = ids(n), fixture = json(sourceBytes('benchmarks/adaptive-portfolio.config.json')).fixtures.find(f => f.id === n.fixture_id);
  need(fixture, 'core_producer_public_fixture_missing');
  const contract = validateVerificationCommandContract(json(sourceBytes(`benchmarks/fixtures/checkpoint-b2/${n.fixture_id}/verification-command-contract.json`)), { root: ROOT });
  const entries = CONDITIONS.map((condition, index) => ({ case_id: id.cases[condition], adapter_track: 'codex', condition, fixture_id: n.fixture_id, input_manifest_sha256: n.fixture_input_digest.slice(7), suite: fixture.suite, task_class: fixture.task_class, difficulty: fixture.difficulty, registered_repetitions: fixture.repetitions, aggregate_eligible: fixture.aggregate_eligible, repetition: 1, condition_order_position: n.order.indexOf(condition) + 1, block_id: id.block }));
  const planBase = { kind: 'ask_core_capture_derived_portfolio_plan_v1', capture_digest: n.connection_digest, source_head: source.request.git_head, cases: entries };
  const plan = { ...planBase, plan_id: 'plan-' + canonicalDigest(planBase).slice(7) };
  const materialization = { kind: 'ask_core_capture_derived_materialization_v1', plan_id: plan.plan_id, preparation_digest: n.preparation_digest, product_digest: n.product_digest, conditions: preparation.conditions };
  const materializationDigest = rawJsonDigest(materialization);
  const selection = { kind: 'ask_core_capture_derived_selection_v1', plan_id: plan.plan_id, policy: 'fixed_core_or_full_no_adaptive_selection', selections: [] };
  const identity = { run_instance_id: id.run, repository_revision: source.request.git_head, plan_id: plan.plan_id, materialization_manifest_digest: materializationDigest, selection_state_digest: rawJsonDigest(selection), origin: 'saved_core_capture_conversion', capture_digest: n.connection_digest };
  const adapterIdentity = { adapter: 'codex', effective_command: { origin: 'saved_launches', commands: source.launches }, environment_snapshot: { entries: [] }, environment_observation: 'unknown', unavailable_reason: null, thermal_state: 'unknown', model: source.request.comparison.model, reasoning_effort: source.request.comparison.effort, sandbox_policy: 'workspace-write', permission_policy: 'never' };
  const cases = [], output = new Map([['plan.json', plan], ['materialized/materialization-manifest.json', materialization], ['selection/selection-state.json', selection], ['run/run-identity.json', identity], ['run/adapters/codex.json', adapterIdentity]]);
  for (const entry of entries) {
    const condition = entry.condition, trial = n.trials[condition], attempts = [], state = { status: 'pending', attempt_count: 0, terminal_attempt: null, origin: 'saved_core_capture_conversion' };
    if (!trial.capture_digest && trial.state !== 'not_started') state.status = 'invalid';
    if (trial.capture_digest) {
      const raw = json(read(join(root, 'capture', 'captures', condition + '.json')));
      const baseRoot = join(root, 'materialized', entry.case_id), terminalRoot = join(root, 'terminal', entry.case_id);
      const baseInstall = inventoryCoreInstall(baseRoot), terminalInstall = inventoryCoreInstall(terminalRoot);
      need(same(assetRecords(baseInstall), { ...raw.before.inputs, ...raw.before.intervention }) && same(baseInstall.directories, raw.before.directories), 'core_producer_materialization_changed');
      need(same(assetRecords(terminalInstall), { ...raw.after.inputs, ...raw.after.intervention }) && same(terminalInstall.directories, raw.after.directories), 'core_producer_terminal_snapshot_changed');
      if (condition !== 'plain') need(auditCoreBundle(baseRoot, preparation.state_digests[condition], { task_inputs: preparation.task_inputs }).status === 'model_free_install_verified', 'core_producer_product_audit_failed');
      const managed = Object.keys(raw.before.intervention).sort();
      const terminalIdentity = { run_instance_id: id.run, case_id: entry.case_id, attempt: '0001', adapter: 'codex', condition, fixture_id: n.fixture_id, fixture_input_digest: n.fixture_input_digest, materialization_manifest_digest: materializationDigest };
      const baseSnapshot = captureTerminalWorkspaceInventory(baseRoot);
      const terminal = buildTerminalWorkspaceAuthority({ root: ROOT, baseSnapshot, terminalWorkspaceRoot: terminalRoot, identity: terminalIdentity, managedAssetPaths: managed });
      const prefix = `run/cases/${entry.case_id}/attempts/0001/`;
      const stdout = Buffer.from(raw.capture.stdout, 'base64'), stderr = Buffer.from(raw.stderr, 'base64');
      const request = { ...terminalIdentity, origin: 'saved_core_capture_conversion', capture_digest: trial.capture_digest, launch: source.launches[condition], projection: { capability_downgrades: [], inventory: [] }, agent: { autonomous_agents_started: 0 }, selection: null };
      const commandIdentity = { ...terminalIdentity, repetition: 1, verification_command_contract_digest: contract.contract_digest, runtime_identity_digest: canonicalDigest(adapterIdentity), effective_command_digest: canonicalDigest(adapterIdentity.effective_command) };
      const commands = commandEvidence(commandIdentity, stdout, contract);
      validateCommandEvidenceManifest(commands, { root: ROOT, contract });
      const final = trial.final_output.status === 'captured' ? read(join(root, prefix, 'final.json'), 1048576) : null;
      if (final) need(digest(final) === trial.final_output.digest && final.length === trial.final_output.bytes, 'core_producer_final_output_changed');
      const result = { status: trial.state === 'completed_capture' ? 'completed' : 'failed', duration_ms: trial.completed_ms - trial.started_ms, exit_code: raw.capture.status, final_output: final ? { path: 'final.json', bytes: final.length, sha256: digest(final).slice(7) } : null, stdout: { bytes: stdout.length, sha256: digest(stdout).slice(7) }, stderr: { bytes: stderr.length, sha256: digest(stderr).slice(7) }, event_counts: { json_lines: stdout.toString('utf8').split('\n').filter(Boolean).length }, failure_kind: trial.state === 'completed_capture' ? null : 'saved_capture_failed_or_unknown', core_capture_usage: trial.usage, terminal_workspace_authority_availability: 'captured', terminal_workspace_authority_support: 'supported', terminal_workspace_authority_digest: terminal.authority.authority_digest, terminal_workspace_tree_digest: terminal.authority.terminal_candidate_tree_digest, terminal_workspace_authority_bytes: terminal.bytes.length, origin: 'saved_core_capture_conversion' };
      const commit = { kind: 'ask_core_capture_derived_terminal_commit_v1', request_digest: rawJsonDigest(request), result_digest: rawJsonDigest(result), command_evidence_digest: rawJsonDigest(commands), capture_digest: trial.capture_digest, terminal_workspace_authority_digest: terminal.authority.authority_digest };
      state.status = result.status; state.attempt_count = 1; state.terminal_attempt = '0001';
      const evidence = { request_digest: rawJsonDigest(request), result_digest: rawJsonDigest(result), commit_digest: rawJsonDigest(commit), command_evidence_digest: rawJsonDigest(commands), final_output_digest: final ? digest(final) : null, final_output_bytes: final?.length ?? null, terminal_workspace_authority_availability: 'captured', terminal_workspace_authority_support: 'supported', terminal_workspace_authority_digest: terminal.authority.authority_digest, terminal_workspace_tree_digest: terminal.authority.terminal_candidate_tree_digest, terminal_workspace_authority_bytes: terminal.bytes.length };
      attempts.push({ attempt: '0001', request, result, evidence, commandEvidence: commands, verificationCommandContract: contract, terminalWorkspaceAuthority: terminal, expectedBaseInventory: baseSnapshot.inventory.filter(f => f.file_type === 'regular_file'), expectedManagedAssetPaths: managed });
      for (const [name, value] of [['request.json', request], ['result.json', result], ['terminal-commit.json', commit], ['command-evidence.json', commands], ['terminal-workspace-authority.json', terminal.bytes], ['stdout.jsonl', stdout], ['stderr.log', stderr]]) output.set(prefix + name, value);
    }
    output.set(`run/cases/${entry.case_id}/state.json`, state);
    cases.push({ entry, state, attempts });
  }
  return { output, inspection: { identity, plan, materialization: { manifestDigest: materializationDigest }, selections: { stateDigest: rawJsonDigest(selection) }, adapter_identities: new Map([['codex', adapterIdentity]]), cases } };
}

/** Uses only explicitly supplied saved capture/preparation/final files. No CLI,
 * model, auth store, private grader input, evaluator or new grant is opened. */
export function produceCoreCaptureArtifacts(input, outputRoot) {
  closed(input, ['captureRoot', 'captureDigest', 'preparationRoot', 'preparationDigest', 'connectionRoot', 'controllerRecords']);
  const n = capture(input.captureRoot, input.captureDigest), preparation = replayCoreNativeContract(input.preparationRoot, input.preparationDigest);
  need(preparation.status === 'offline_native_preparation_contract_verified' && input.preparationDigest === n.preparation_digest, 'core_producer_preparation_required');
  const { source, records, evidenceClass } = invocationBinding(n, input), target = resolve(outputRoot), id = ids(n);
  need(!existsSync(target) && realpathSync(dirname(target)) === dirname(target), 'core_producer_new_output_required');
  for (const path of [input.captureRoot, input.preparationRoot, input.connectionRoot, ROOT]) need(!overlap(target, resolve(path)), 'core_producer_output_overlap');
  const baseline = Object.fromEntries(CONDITIONS.map(c => [c, inventoryCoreInstall(join(input.preparationRoot, 'conditions', c))]));
  const final = {};
  for (const c of CONDITIONS) if (n.trials[c].final_output?.status === 'captured') {
    final[c] = read(join(input.connectionRoot, c + '-final.txt'), 1048576);
    need(digest(final[c]) === n.trials[c].final_output.digest && final[c].length === n.trials[c].final_output.bytes, 'core_producer_final_output_required');
  }
  mkdirSync(target, { mode: 0o700 }); privateDirectory(target);
  for (const [p, b] of files(resolve(input.captureRoot))) write(target, 'capture/' + p, b);
  write(target, 'preparation.json', read(join(input.preparationRoot, 'control', 'native-preparation.json'), 1048576));
  for (const c of CONDITIONS) {
    for (const dir of baseline[c].directories) {
      need(safePath(dir));
      mkdirSync(join(target, 'materialized', id.cases[c], dir), { recursive: true, mode: 0o700 });
      if (n.trials[c].capture_digest) mkdirSync(join(target, 'terminal', id.cases[c], dir), { recursive: true, mode: 0o700 });
    }
    for (const [p, b] of baseline[c]) {
      write(target, `materialized/${id.cases[c]}/${p}`, b);
      if (n.trials[c].capture_digest) write(target, `terminal/${id.cases[c]}/${p}`, p === 'task.md' || p.startsWith('workspace/') ? read(join(input.captureRoot, 'task-snapshots', c, p)) : b);
    }
    if (final[c]) write(target, `run/cases/${id.cases[c]}/attempts/0001/final.json`, final[c]);
  }
  for (const [name, key] of [['producer.json', 'producerRecordBytes'], ['producer.stdout', 'producerStdoutBytes'], ['reviewer.json', 'reviewerRecordBytes'], ['reviewer.stdout', 'reviewerStdoutBytes'], ['owner.json', 'ownerBytes']]) write(target, 'controller/' + name, input.controllerRecords[key]);
  const manifest = { kind: 'ask_core_capture_producer_v1', evidence_class: evidenceClass, capture_digest: input.captureDigest, preparation_digest: input.preparationDigest, controller: { producer_record_digest: records.producer_record_digest, reviewer_record_digest: records.reviewer_record_digest, owner_digest: records.owner_digest }, source_digests: coreGradingSources(), artifact_inventory: null, execution_permission: false, live_ready: false, scoring_ready: false, model_calls: 0, grader_process_starts: 0 };
  // Bootstrapping schema scope is internal and verifies saved source evidence;
  // it cannot accept caller-authored inspection or score any result.
  return finishProduction(target, manifest, n, source, preparation);
}

// The builder runs under the same independently reverified capture profile as
// later normalizer/terminal helpers. The temporary bootstrap contains no run
// authority; it is used only to select additive condition schemas.
let building = null;
export function coreProducerBuildingProfile() { return building !== null; }
function finishProduction(target, manifest, n, source, preparation) {
  need(building === null);
  building = target;
  try {
    const derived = derive(target, n, source, preparation);
    for (const [p, v] of derived.output) write(target, p, v, p.endsWith('terminal-workspace-authority.json') ? 0o444 : 0o600);
  } finally { building = null; }
  manifest.artifact_inventory = inventory(files(target));
  write(target, 'producer.json', manifest);
  const externalDigest = digest(read(join(target, 'producer.json'))), options = { recordRoot: target, externalDigest };
  const normalized = withCoreCaptureProducer(options, verified => normalizePortfolioExecution({ ...verified.executionOptions, outputPath: join(target, 'normalized') }));
  return { kind: manifest.kind, evidence_class: manifest.evidence_class, output_root: target, external_digest: externalDigest, normalized, execution_permission: false, live_ready: false, scoring_ready: false, model_calls: 0, grader_process_starts: 0 };
}

export function verifyCoreCaptureProducer(options) {
  closed(options, ['recordRoot', 'externalDigest']);
  const root = resolve(options.recordRoot); privateDirectory(root);
  noAcl([join(root, 'producer.json')]);
  const raw = read(join(root, 'producer.json'), 1048576); need(digest(raw) === options.externalDigest, 'core_producer_external_digest_changed');
  const m = json(raw);
  closed(m, ['kind', 'evidence_class', 'capture_digest', 'preparation_digest', 'controller', 'source_digests', 'artifact_inventory', 'execution_permission', 'live_ready', 'scoring_ready', 'model_calls', 'grader_process_starts']);
  need(m.kind === 'ask_core_capture_producer_v1' && m.execution_permission === false && m.live_ready === false && m.scoring_ready === false && m.model_calls === 0 && m.grader_process_starts === 0 && same(m.source_digests, coreGradingSources()), 'core_producer_source_or_status_changed');
  closed(m.controller, ['producer_record_digest', 'reviewer_record_digest', 'owner_digest']);
  const actual = files(root, '', true); actual.delete('producer.json');
  for (const p of [...actual.keys()]) if (p.startsWith('normalized/')) actual.delete(p);
  need(same(inventory(actual), m.artifact_inventory), 'core_producer_artifact_inventory_changed');
  const n = capture(join(root, 'capture'), m.capture_digest), p = read(join(root, 'preparation.json'), 1048576);
  need(digest(p) === m.preparation_digest && n.preparation_digest === m.preparation_digest, 'core_producer_preparation_changed');
  const preparation = json(p);
  need(preparation.kind === 'ask_core_native_preparation_v1' && preparation.task === n.fixture_id && preparation.product_manifest_digest === n.product_digest && same(preparation.task_inputs, assetRecords(coreFixtureInputs(n.fixture_id).inputs)), 'core_producer_preparation_binding_changed');
  const { source, records, evidenceClass } = invocationBinding(n, { captureRoot: join(root, 'capture'), controllerRecords: controllerInput(root, m) });
  need(m.evidence_class === evidenceClass);
  need(building === null);
  let derived;
  building = root;
  try { derived = derive(root, n, source, preparation); }
  finally { building = null; }
  for (const [path, value] of derived.output) {
    const expected = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + '\n');
    need(same(m.artifact_inventory[path], { bytes: expected.length, digest: digest(expected) }), 'core_producer_derived_record_changed');
  }
  return { inspection: derived.inspection, executionOptions: artifactPaths(root), capture: n, records, evidence_class: evidenceClass, execution_permission: false, scoring_ready: false };
}

/** Existing terminal authority reconstruction, not caller-provided candidate
 * bytes or a synthesized verified_terminal_candidate label. */
export function materializeCoreCaptureCandidate(options, { condition, outputParent }) {
  return withCoreCaptureProducer(options, verified => {
    need(CONDITIONS.includes(condition));
    privateDirectory(resolve(outputParent));
    for (const input of [ROOT, resolve(options.recordRoot)]) need(!overlap(resolve(outputParent), input), 'core_producer_candidate_output_overlap');
    const outputPath = join(resolve(options.recordRoot), 'normalized');
    const normalized = verifyNormalizedPortfolioResults({ ...verified.executionOptions, outputPath });
    const entry = normalized.manifest.cases.find(c => c.condition === condition)?.normalized_attempts[0];
    need(entry, 'core_producer_condition_not_started');
    return materializeVerifiedTerminalCandidate({ ...verified.executionOptions, normalizedResultsPath: outputPath, sourceSnapshotDigest: normalized.manifest.source_snapshot_digest, normalizedResultId: entry.normalized_result_id, outputParent });
  });
}

/** Concrete future original private-helper/scorer inputs; assembling these
 * opens no privateRoot and performs no grader/model calls. Missing runtime
 * inputs are distinct from the completed capture conversion code. */
export function buildCoreCaptureScoringInputs(options, { condition, privateRoot = null, privateEvaluationRoot = null, frozenSourceRoot = null, manifestPath = null, resultPath = null, privateEvaluationRecordPath = null, privateFragmentPath = null } = {}) {
  return withCoreCaptureProducer(options, verified => {
    need(CONDITIONS.includes(condition));
    const normalizedResultsPath = join(resolve(options.recordRoot), 'normalized');
    const normalized = verifyNormalizedPortfolioResults({ ...verified.executionOptions, outputPath: normalizedResultsPath });
    verifyPortfolioScoringRootLineage({ ...verified.executionOptions, normalizedResultsPath }, normalized);
    const entry = normalized.manifest.cases.find(c => c.condition === condition)?.normalized_attempts[0];
    need(entry, 'core_producer_condition_not_started');
    const record = json(read(join(normalized.generationPath, entry.path), 33554432, true));
    const fixture = verified.capture.fixture_id, base = join(ROOT, 'benchmarks', 'fixtures', 'checkpoint-b2', fixture);
    const freeze = json(sourceBytes(`benchmarks/fixtures/checkpoint-b2/${fixture}/scoring-input-freeze-manifest.json`));
    const frozenPaths = Object.fromEntries([['catalogPath','catalog'],['policyManifestPath','policy_manifest'],['scoringPolicyPath','scoring_policy'],['admissionRecordPath','admission_record'],['requirementRecordPath','requirement_record'],['outputContractPath','output_contract']].map(([key,field]) => { need(safePath(freeze[field].path)); return [key, join(ROOT, freeze[field].path)]; }));
    const missingInputs = Object.entries({ privateRoot, privateEvaluationRoot, frozenSourceRoot }).filter(([, v]) => v === null).map(([k]) => k);
    const privateArtifacts = { manifestPath, resultPath, privateEvaluationRecordPath, privateFragmentPath };
    for (const v of [privateRoot, privateEvaluationRoot, frozenSourceRoot, ...Object.values(privateArtifacts)]) if (v !== null) need(typeof v === 'string' && resolve(v) === v, 'core_producer_absolute_input_required');
    const pendingArtifacts = Object.entries(privateArtifacts).filter(([, value]) => value === null).map(([key]) => key);
    const commandObservations = record.command_evidence;
    const missingObservations = [...(commandObservations.unavailable_command_ids.length ? ['verification_command_execution'] : []), ...(commandObservations.failed_command_ids.length ? ['verification_command_failed'] : []), ...(commandObservations.declined_command_ids.length ? ['verification_command_declined'] : []), ...(commandObservations.required_alternative_groups.some(group => group.satisfaction_state !== 'satisfied') ? ['verification_alternative_group_not_satisfied'] : [])];
    return { kind: 'ask_core_capture_scoring_inputs_v1', status: missingInputs.length ? 'runtime_inputs_missing' : pendingArtifacts.length ? 'private_evaluation_artifacts_pending' : 'assembled_not_executed', evidence_class: verified.evidence_class, condition,
      privateHelperOptions: { ...verified.executionOptions, root: frozenSourceRoot ?? ROOT, normalizedResultsPath, sourceSnapshotDigest: normalized.manifest.source_snapshot_digest, normalizedResultId: entry.normalized_result_id, privateRoot, privateEvaluationRoot },
      scorerOptions: { ...verified.executionOptions, ...frozenPaths, ...privateArtifacts, coreCaptureProducer: { ...options }, coreConnectedNormalization: { outputRoot: join(resolve(options.recordRoot), 'capture'), externalDigest: verified.capture.result_digest }, root: frozenSourceRoot ?? ROOT, normalizedResultsPath, sourceSnapshotDigest: normalized.manifest.source_snapshot_digest, referencePath: join(base, 'evaluator-reference.json'), scoringInputFreezeManifestPath: join(base, 'scoring-input-freeze-manifest.json'), scoringInputFreezeManifestSourceDigest: verified.capture.evaluator_reference.scoring_input_freeze_raw_digest, privateRoot, privateEvaluationRoot },
      normalizedResult: record, missing_inputs: missingInputs, missing_observations: missingObservations,
      pending_private_artifacts: pendingArtifacts,
      original_private_evaluator_compatibility: 'unknown', scoring_ready: false, execution_permission: false, live_ready: false, model_calls: 0, grader_process_starts: 0 };
  });
}

/** Future separately authorized private-read step. This connects the original
 * production constructor; it does not run its sealed worker or a model. Do not
 * call while private reads are excluded. No fallback private bundle is built. */
export function createCoreCaptureSealedEvaluatorExecution(options, runtimeInputs) {
  return withCoreCaptureProducer(options, verified => {
    const inputs = buildCoreCaptureScoringInputs(options, runtimeInputs);
    need(inputs.normalizedResult.outcome === 'completed' && inputs.missing_observations.length === 0, 'core_producer_commands_or_outcome_not_verified');
    need(inputs.missing_inputs.length === 0 && inputs.scorerOptions.manifestPath, 'core_producer_private_runtime_inputs_required');
    privateDirectory(runtimeInputs.privateEvaluationRoot);
    for (const input of [ROOT, resolve(options.recordRoot), runtimeInputs.privateRoot, runtimeInputs.frozenSourceRoot]) need(!overlap(runtimeInputs.privateEvaluationRoot, input), 'core_producer_private_output_overlap');
    const root = runtimeInputs.frozenSourceRoot;
    verifyPublicEvaluatorReference({ root, referencePath: inputs.scorerOptions.referencePath });
    const externalAuthorityAnchor = readEvaluatorAuthorityAnchorFromFreeze({ root, freezeManifestPath: inputs.scorerOptions.scoringInputFreezeManifestPath, freezeManifestSourceDigest: inputs.scorerOptions.scoringInputFreezeManifestSourceDigest, referencePath: inputs.scorerOptions.referencePath });
    const bundle = verifyPrivateEvaluatorBundle(inputs.scorerOptions);
    need(bundle.manifest.evaluator_bundle_digest === verified.capture.evaluator_reference.bundle_digest, 'core_producer_original_private_bundle_changed');
    const hiddenAsset = bundle.manifest.asset_inventory.find(asset => asset.role === 'hidden_tests');
    need(hiddenAsset, 'core_producer_original_hidden_asset_required');
    return createProductionSealedEvaluatorExecution({ ...inputs.privateHelperOptions, hiddenAsset, externalAuthorityAnchor, evaluatorRevision: verified.capture.evaluator_reference.evaluator_revision });
  });
}

export function verifyCoreProducedTerminal(inspection, { root, runDir, caseId, attempt }) {
  const c = inspection.cases.find(x => x.entry.case_id === caseId), a = c?.attempts.find(x => x.attempt === attempt);
  need(a, 'core_producer_terminal_attempt_missing');
  const verified = readVerifiedTerminalWorkspaceAuthority({ root, authorityPath: join(runDir, 'cases', caseId, 'attempts', attempt, 'terminal-workspace-authority.json'), expected: { run_instance_id: inspection.identity.run_instance_id, case_id: caseId, attempt, adapter: 'codex', condition: c.entry.condition, fixture_id: c.entry.fixture_id, fixture_input_digest: 'sha256:' + c.entry.input_manifest_sha256, materialization_manifest_digest: inspection.materialization.manifestDigest }, expectedBaseInventory: a.expectedBaseInventory, expectedManagedAssetPaths: a.expectedManagedAssetPaths });
  need(same(verified.authority, a.terminalWorkspaceAuthority.authority), 'core_producer_terminal_authority_changed');
  return { ...verified, execution: { run_instance_id: inspection.identity.run_instance_id, case_id: caseId, attempt, adapter: 'codex', condition: c.entry.condition, fixture_id: c.entry.fixture_id, fixture_input_digest: 'sha256:' + c.entry.input_manifest_sha256, materialization_manifest_digest: inspection.materialization.manifestDigest, request_digest: a.evidence.request_digest, raw_result_digest: a.evidence.result_digest, terminal_commit_digest: a.evidence.commit_digest, ...Object.fromEntries(Object.entries(a.evidence).filter(([k]) => k.startsWith('terminal_workspace_'))) } };
}
