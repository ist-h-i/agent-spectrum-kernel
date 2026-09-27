import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { createIssue291SyntheticPendingPackages, createIssue291SyntheticReviewOverlays } from "./test-fixtures/issue291-synthetic-admission.mjs";
import {
  assertCalibrationEffectiveAdmission, assertCalibrationExecutionAdmission, assertCalibrationScoringAdmissionCandidate,
  assertCalibrationPrivateIsolationPaths,
  inspectCalibrationExecutionAdmission, inspectCalibrationUnstartedInventories,
  openCalibrationExecutionAdmission, reopenCalibrationExecutionAdmission,
} from "./ask-benchmark-calibration-execution-admission.mjs";

const root = realpathSync(resolve(fileURLToPath(new URL("..", import.meta.url))));
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const read = path => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const gitEnvironment = () => ({ ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" });
const git = (cwd, ...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", cwd, ...args], {
  encoding: "utf8", env: gitEnvironment(), timeout: 60000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
}).trim();
function command(file, args, { cwd = root, timeout = 60000 } = {}) {
  const result = spawnSync(file, args, { cwd, encoding: "utf8", timeout, maxBuffer: 20 * 1024 * 1024,
    env: file === "git" ? gitEnvironment() : process.env });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  return result;
}
function withEnvironment(values, callback) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try { return callback(); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
function syntheticSelection(record, plan) {
  const item = plan.cases.find(value => value.case_id === record.case_id);
  assert.ok(item);
  return { task_class: item.task_class, observed_signals: ["cross-file contract"], selected_mechanisms: ["repository-orientation"],
    skipped_mechanisms: ["agent-orchestration"], required_gates: ["test-first-verification"],
    agents: { requested: ["subagent"], omitted: ["runtime_capability_unproven"] },
    expected_evidence: ["synthetic source/catalog integration"], capability_downgrades: [],
    lightweight_bypass: { used: false, reason: "Synthetic input selection; Adaptive cases remain pending." },
    projection: { adapter_track: record.adapter, profile: record.projection_evidence.selected_profile,
      renderer_id: record.projection_evidence.renderer_id, renderer_version: record.projection_evidence.renderer_version,
      projection_fingerprint: record.projection_evidence.projection_fingerprint } };
}

function createInventory(t) {
  const base = realpathSync(mkdtempSync(resolve(tmpdir(), "ask291-admission-inventory-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const sources = {}; const normalizedRoots = {};
  for (const role of ["current_prompt", "prompt_v2"]) {
    const runDir = resolve(base, `run-${role}`);
    mkdirSync(resolve(runDir, "adapters"), { recursive: true });
    mkdirSync(resolve(runDir, "cases", "case-a", "attempts"), { recursive: true });
    writeFileSync(resolve(runDir, "run-identity.json"), "{}\n");
    writeFileSync(resolve(runDir, "cases", "case-a", "state.json"), "{}\n");
    const result = resolve(base, `normalized-${role}`);
    const baseline = resolve(result, 'generations', `snapshot-${'a'.repeat(64)}`);
    mkdirSync(baseline, { recursive: true });
    writeFileSync(resolve(result, "normalized-results-root.json"), "{}\n");
    writeFileSync(resolve(baseline, "normalized-run.json"), "{}\n");
    sources[role] = { execution: { runDir }, scope: { run_instance_id: "synthetic-unstarted" } };
    normalizedRoots[role] = result;
  }
  return { base, sources, normalizedRoots };
}

const candidate = () => ({ fixtures: CALIBRATION_SOURCE_BINDINGS.map(([fixture_id, source_fixture_id]) => ({
  fixture_id, source_fixture_id, admission_status: "admission_pending", effective_admission_status: "review_evidence_missing",
  admission_overlay: { decision_digest: `sha256:${"a".repeat(64)}` },
})) });

if (process.argv[2] !== "--synthetic-admission-worker") {
test("result-blind inventory guard accepts only empty unstarted roots", t => {
  const input = createInventory(t);
  assert.deepEqual(inspectCalibrationUnstartedInventories(input), {
    kind: "calibration_unstarted_inventory_inspection", verified_native_state: false,
    verified_private_admission: false, measured_result_bytes_read: 0,
  });
  writeFileSync(resolve(input.normalizedRoots.current_prompt, "orphan-model-output.txt"), "never read me\n");
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
});

test("marker-only and a second pre-result generation cannot masquerade as an empty collection", t => {
  const input = createInventory(t);
  const generations = resolve(input.normalizedRoots.current_prompt, 'generations');
  rmSync(generations, { recursive: true });
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
  const first = resolve(generations, `snapshot-${'a'.repeat(64)}`);
  const second = resolve(generations, `snapshot-${'b'.repeat(64)}`);
  mkdirSync(first, { recursive: true });
  mkdirSync(second);
  writeFileSync(resolve(first, 'normalized-run.json'), '{}\n');
  writeFileSync(resolve(second, 'normalized-run.json'), '{}\n');
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
});

test("run guard rejects claims, attempts and orphan output before byte scanning", t => {
  const input = createInventory(t);
  const caseRoot = resolve(input.sources.current_prompt.execution.runDir, "cases", "case-a");
  mkdirSync(resolve(caseRoot, "claim"));
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
  rmSync(resolve(caseRoot, "claim"), { recursive: true });
  writeFileSync(resolve(caseRoot, "attempts", "0001"), "never read me\n");
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
});

test("candidate shape rejects wrong fixture, source, missing overlay and late status", () => {
  assert.deepEqual(assertCalibrationScoringAdmissionCandidate(candidate()), {
    kind: "calibration_scoring_candidate_inspection", creates_admission: false,
  });
  for (const mutate of [
    value => { value.fixtures[0].fixture_id = "cal-other"; },
    value => { value.fixtures[0].source_fixture_id = value.fixtures[1].source_fixture_id; },
    value => { value.fixtures.reverse(); },
  ]) {
    const value = candidate(); mutate(value);
    assert.throws(() => assertCalibrationScoringAdmissionCandidate(value), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
  }
  for (const mutate of [
    value => { value.fixtures[0].admission_status = "admitted"; },
    value => { value.fixtures[0].effective_admission_status = "admitted"; },
    value => { value.fixtures[0].admission_overlay = null; },
    value => { value.fixtures[0].admission_overlay.decision_digest = null; },
  ]) {
    const value = candidate(); mutate(value);
    assert.throws(() => assertCalibrationScoringAdmissionCandidate(value), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  }
});

test("private bundle and independent review files must all be under the native deny root", t => {
  const base = realpathSync(mkdtempSync(resolve(tmpdir(), "ask291-isolation-paths-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = resolve(base, "repository");
  const denyRoot = resolve(base, "private-authority");
  const privateRoot = resolve(denyRoot, "cal-session-refresh");
  const reviewAuthorityPath = resolve(denyRoot, "review-authority.json");
  const reviewArchivePath = resolve(denyRoot, "review-archive.json");
  mkdirSync(root); mkdirSync(privateRoot, { recursive: true });
  writeFileSync(reviewAuthorityPath, "{}\n"); writeFileSync(reviewArchivePath, "{}\n");
  const entry = { root, denyRoot, privateRoot, reviewAuthorityPath, reviewArchivePath };
  assert.deepEqual(assertCalibrationPrivateIsolationPaths(entry), {
    kind: "calibration_private_isolation_inspection", creates_admission: false,
  });
  const outside = resolve(base, "review-outside.json"); writeFileSync(outside, "{}\n");
  for (const field of ["reviewAuthorityPath", "reviewArchivePath"]) {
    assert.throws(() => assertCalibrationPrivateIsolationPaths({ ...entry, [field]: outside }),
      { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  }
  assert.throws(() => assertCalibrationPrivateIsolationPaths({ ...entry, privateRoot: root }),
    { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
});

test("opaque admission cannot be forged or reopened from a claimed digest", t => {
  assert.throws(() => inspectCalibrationExecutionAdmission({}), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  assert.throws(() => assertCalibrationExecutionAdmission({}, {}), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  assert.throws(() => reopenCalibrationExecutionAdmission({}, "sha256:bad"), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  const input = createInventory(t);
  writeFileSync(resolve(input.normalizedRoots.prompt_v2, "orphan-result.json"), "never read me\n");
  assert.throws(() => openCalibrationExecutionAdmission({ ...input, preparation: {}, scoringInputs: {} }),
    { code: "SUCCESSOR_IDENTITY_MISMATCH" });
});
}

// This worker runs only from a clean disposable clone. Its private assets and
// review declarations are synthetic contract inputs, never Issue #291 evidence.
async function syntheticAdmissionWorker(contextPath) {
  const context = read(contextPath);
  assert.equal(root, realpathSync(context.clone));
  assert.equal(git(root, "rev-parse", "HEAD"), context.cloneRevision);
  assert.equal(git(root, "status", "--porcelain"), "");
  const work = context.work;
  const { readSuccessorParent, readSuccessorImplementationIdentity } = await import("./ask-benchmark-prompt-successor-repository.mjs");
  const { buildPortfolioPlan } = await import("./ask-benchmark-plan.mjs");
  const { materializePortfolio } = await import("./ask-benchmark-materialize.mjs");
  const { sealAdaptiveSelection } = await import("./ask-benchmark-selection.mjs");
  const { buildPromptSuccessorPreparation, buildSuccessorSourceScope } = await import("./ask-benchmark-prompt-successor.mjs");
  const { openSuccessorScoringInputs, inspectSuccessorScoringInputs } = await import("./ask-benchmark-prompt-successor-scoring-inputs.mjs");
  const { readIssue291SealedFreeze, reopenIssue291ReadyContext } = await import("./ask-benchmark-issue291-preflight.mjs");
  const { ISSUE_291_MEASURED_AUTHORITY } = await import("./ask-benchmark-prompt-successor-measured-authority.mjs");
  const { canonicalDigest } = await import("./content-addressed-store.mjs");
  const { prepareSuccessorPortfolioSource } = await import("./ask-benchmark-execution.mjs");
  const { normalizePortfolioExecution } = await import("./ask-benchmark-normalized-results.mjs");
  const { assertSuccessorHostIsolationReady } = await import("./ask-benchmark-prompt-successor-host-isolation.mjs");
  const configFile = resolve(root, "benchmarks/prompt-successor-execution.config.json");
  const rawConfig = read(configFile);
  const config = { ...rawConfig, _kind: "portfolio", _configPath: configFile, _protocolPath: resolve(root, rawConfig.protocol_path) };
  const { parent } = await readSuccessorParent({ root });
  const implementation = readSuccessorImplementationIdentity(root);
  const compiler = process.platform === "darwin" ? "/usr/bin/clang" : "cc";
  const agentBin = resolve(work, "codex");
  command(compiler, ["-std=c11", "-Wall", "-Wextra", "-Werror", "-O0",
    resolve(root, "scripts/test-fixtures/prompt-successor-fake-codex.c"), "-o", agentBin]);
  const privateDenyRoot = resolve(work, "synthetic-private");
  assert.ok(existsSync(privateDenyRoot));
  const nativeFile = { schema_version: "1.2.0", adapter: "codex", availability: "available", unavailable_reason: null,
    expected_executable_version: "codex-cli 0.153.4", model: "synthetic-native-fake-not-a-service", reasoning_effort: "medium",
    case_timeout_ms: 900000, sandbox_policy: "workspace-write", permission_policy: "never",
    successor_private_evaluator_root: privateDenyRoot, executor: { id: "successor-native-fake", version: "1.0.0" },
    environment_allowlist: ["HOME", "ASK_SUCCESSOR_FAKE_CAPTURE", "ASK_SUCCESSOR_FAKE_MODE"],
    environment_value_allowlist: [], thermal_state: "cold", claude_cli: null,
    command_evidence: { capture_required: true, support: "supported", event_transport: "codex_exec_jsonl",
      event_format_revision: "codex-exec-jsonl-v1", parser_revision: "1.3.0",
      shell_capability: { support_status: "supported", family: "posix_bash", executable: "/bin/bash", envelope_arguments: ["-lc"],
        authority_source: "codex_exec_jsonl_command_rendering", probe_status: "runtime_event_required", downgrade_reason: null } } };
  const runtimeConfigPath = resolve(work, "runtime.json"); write(runtimeConfigPath, nativeFile);
  const home = resolve(work, "empty-home"); const capture = resolve(work, "captures"); mkdirSync(home); mkdirSync(capture);
  const env = { HOME: home, ASK_SUCCESSOR_FAKE_CAPTURE: capture, ASK_SUCCESSOR_FAKE_MODE: "success" };
  const runtime = { adapter: "codex", cli_version: "0.153.4", executable_digest: hash(readFileSync(agentBin)),
    node_version: process.version, os: process.platform, arch: process.arch, model: nativeFile.model,
    provider_model_revision: { status: "unknown", value: null }, reasoning_effort: "medium",
    authentication_mode: "chatgpt_subscription", configuration_digest: hash(readFileSync(runtimeConfigPath)),
    sandbox: "workspace-write", approval_policy: "never", agent_network: "disabled", provider_network: "provider_only", timeout_ms: 900000 };
  const preparation = buildPromptSuccessorPreparation({ parent, runtime, implementation, seed: "synthetic-calibration-admission-v1",
    changeReason: "Synthetic pre-result admission contract test; no measured model or evaluator.",
    scoringInputManifestDigest: read(context.scoringManifestPath).manifest_digest });
  const scoringInputs = await openSuccessorScoringInputs({ preparation, manifestPath: context.scoringManifestPath, root });
  const scoring = inspectSuccessorScoringInputs(scoringInputs, preparation);
  assert.equal(scoring.fixtures.length, 4);
  assert.ok(scoring.fixtures.every(item => item.admission_status === "admission_pending"
    && item.effective_admission_status === "review_evidence_missing" && item.admission_overlay));
  console.log("PASS synthetic public scoring inputs open with four pinned overlay candidates");
  const plan = buildPortfolioPlan({ root, config, repositoryRevision: implementation.revision,
    seed: "synthetic-calibration-admission-plan" });
  assert.equal(plan.cases.length, 112);
  const planPath = resolve(work, "plan.json"); write(planPath, plan);
  const materializedPath = resolve(work, "materialized");
  const materialization = materializePortfolio({ root, config, planPath, outputPath: materializedPath,
    repositoryRevision: implementation.revision });
  const selectionState = resolve(work, "selection-state");
  const runRoot = resolve(work, "issue291-run"); mkdirSync(runRoot);
  copyFileSync(context.scoringManifestPath, resolve(runRoot, "scoring-input-manifest.json"));
  for (const item of materialization.cases.filter(value => value.condition === "adaptive_ask")) {
    sealAdaptiveSelection({ root, config, planPath, materializedPath, stateDir: selectionState, caseId: item.case_id,
      input: syntheticSelection(item, plan), repositoryRevision: implementation.revision, now: () => "2026-09-22T00:00:00Z" });
  }
  const shared = { root, config, planPath, materializedPath, selectionState };
  mkdirSync(resolve(runRoot, "native-runs"));
  const experimentRun = randomUUID(); const roles = {};
  for (const role of ["current_prompt", "prompt_v2"]) {
    const execution = { ...shared, runDir: resolve(runRoot, "native-runs", `run-${role}`) };
    const native = withEnvironment(env, () => prepareSuccessorPortfolioSource({ ...execution,
      runtimeConfigPath, agentBin, preparation }));
    const source = { plan_id: native.plan_id, plan_digest: native.plan_digest, run_instance_id: native.run_instance_id,
      repository_revision: native.repository_revision, runtime_identity_digest: native.runtime_identity_digest,
      materialization_manifest_digest: native.materialization_manifest_digest,
      bindings: preparation.cases.filter(item => item.prompt_role === role).map(target => {
        const item = native.cases.find(value => value.fixture_id === target.fixture_id && value.repetition === target.repetition);
        assert.ok(item);
        return { successor_case_id: target.case_id, source_case_id: item.case_id,
          fixture_input_digest: item.fixture_input_digest, effective_command_digest: native.effective_command_digest,
          environment_snapshot_digest: native.environment_snapshot_digest };
      }) };
    const scope = buildSuccessorSourceScope({ preparation, promptRole: role, runInstanceId: experimentRun, source });
    roles[role] = { execution, scope, expectedScopeDigest: scope.scope_digest, runtimeConfigPath, agentBin, native };
  }
  const sources = Object.fromEntries(Object.entries(roles).map(([role, value]) => {
    const { root: _root, ...execution } = value.execution;
    return [role, { scope: value.scope, expectedScopeDigest: value.scope.scope_digest,
      execution, runtimeConfigPath, agentBin }];
  }));
  const normalizedRoots = Object.fromEntries(Object.entries(roles).map(([role, value]) => {
    const outputPath = resolve(runRoot, `normalized-${role}`);
    normalizePortfolioExecution({ ...value.execution, outputPath });
    return [role, outputPath];
  }));
  assert.equal(inspectCalibrationUnstartedInventories({ sources, normalizedRoots }).measured_result_bytes_read, 0);
  console.log("PASS two roles retain 28 pending cases and zero attempts");
  const spec = { run_root: runRoot, runtime_config_path: runtimeConfigPath, agent_bin: agentBin };
  const preflightContext = { source: implementation, preparation, sources, normalized_roots: normalizedRoots,
    scoring_manifest_path: resolve(runRoot, "scoring-input-manifest.json"), diagnostic_root: resolve(runRoot, "host-diagnostic") };
  const specPath = resolve(work, "issue291-spec.json");
  write(specPath, { schema_version: "1.0.0", ...spec,
    private_admission_sources: context.admissionSourcesByFixture,
    seed: "synthetic-calibration-admission-v1", plan_seed: "synthetic-calibration-admission-plan" });
  const contextBody = { schema_version: "1.0.0", kind: "issue291_preflight_context",
    spec_digest: hash(readFileSync(specPath)), ...preflightContext };
  write(resolve(runRoot, "preflight-context.json"), { ...contextBody, context_digest: canonicalDigest(contextBody) });
  await assert.rejects(reopenIssue291ReadyContext(specPath, `sha256:${"f".repeat(64)}`),
    { code: "ENOENT" }, "synthetic spec and context must pass every pre-freeze check before the expensive admission test");
  console.log("PASS production reopen reaches only the absent freeze after synthetic spec and context checks");
  const admissionInput = { preparation, sources, scoringInputs,
    admissionSourcesByFixture: context.admissionSourcesByFixture, normalizedRoots, root };
  const opened = openCalibrationExecutionAdmission(admissionInput);
  const evidence = inspectCalibrationExecutionAdmission(opened);
  assert.equal(evidence.fixtures.length, 4);
  assert.equal(evidence.measured_result_reads_at_admission, 0);
  assert.equal(evidence.automatic_retry_authorized, false);
  assert.ok(evidence.fixtures.every(item => item.review_status === "approved" && item.independence_status === "verified"));
  console.log("PASS four synthetic private bundles and simulated reviews open an opaque pre-result admission");
  const first = context.admissionSourcesByFixture[CALIBRATION_SOURCE_BINDINGS[0][0]];
  const fixtureId = CALIBRATION_SOURCE_BINDINGS[0][0];
  const role = "current_prompt";
  const admissionContext = { preparation, sources, scoringInputs };
  const checked = () => assertCalibrationEffectiveAdmission(opened, fixtureId, role, normalizedRoots[role], admissionContext);
  const firstCheck = checked();
  assert.deepEqual(firstCheck.evidence, evidence);
  assert.equal(firstCheck.effectiveAuthority.effective_admission_status, "admitted");
  for (const [label, path, expected] of [
    ["reviewed public", resolve(root, `benchmarks/fixtures/checkpoint-b2/${fixtureId}/metadata.json`),
      /public authority changed after independent review/u],
    ["private manifest", first.manifestPath, /calibration execution admission drift/u],
    ["independent review", first.reviewAuthorityPath, /sealed admission review authority raw digest differs/u],
    ["review archive", first.reviewArchivePath, /external review archive raw identity differs/u],
  ]) {
    const bytes = readFileSync(path);
    const isolateReviewedByteGuard = label === "reviewed public";
    if (isolateReviewedByteGuard) git(root, "update-index", "--assume-unchanged", "--", relative(root, path));
    try {
      writeFileSync(path, Buffer.concat([bytes, Buffer.from(" ")]));
      if (isolateReviewedByteGuard) assert.equal(git(root, "status", "--porcelain"), "", "isolate the reviewed-byte guard from the generic dirty-source guard");
      assert.throws(checked, { message: expected }, `${label} drift must reject a warmed admission`);
    } finally {
      writeFileSync(path, bytes);
      if (isolateReviewedByteGuard) git(root, "update-index", "--no-assume-unchanged", "--", relative(root, path));
    }
  }
  assert.deepEqual(checked().evidence, evidence, "restored bytes reopen the warmed admission");
  assert.throws(() => assertCalibrationEffectiveAdmission(opened, "cal-other", role, normalizedRoots[role], admissionContext),
    { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  assert.throws(() => assertCalibrationEffectiveAdmission(opened, fixtureId, "other_role", normalizedRoots[role], admissionContext),
    { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  assert.throws(() => assertCalibrationEffectiveAdmission(opened, fixtureId, role, normalizedRoots.prompt_v2, admissionContext),
    { code: "SUCCESSOR_IDENTITY_MISMATCH" });
  console.log("PASS warmed admission rejects exact public, private, review, fixture, role, and result-root drift");
  const original = readFileSync(first.manifestPath);
  const drifted = Buffer.from(original.toString("utf8").replace(
    /"evaluator_bundle_digest": "sha256:[a-f0-9]{64}"/u, `"evaluator_bundle_digest": "sha256:${"0".repeat(64)}"`));
  assert.notDeepEqual(drifted, original);
  try {
    writeFileSync(first.manifestPath, drifted);
    assert.throws(() => reopenCalibrationExecutionAdmission(admissionInput, evidence.admission_digest),
      { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  } finally { writeFileSync(first.manifestPath, original); }
  console.log("PASS exact private bundle digest drift rejects reopen");
  const reopened = reopenCalibrationExecutionAdmission(admissionInput, evidence.admission_digest);
  assert.deepEqual(inspectCalibrationExecutionAdmission(reopened), evidence);
  console.log("PASS exact admission digest reopens from the same synthetic public/private/review bytes");
  const runIdentityPath = resolve(roles.current_prompt.execution.runDir, "run-identity.json");
  const runIdentityBytes = readFileSync(runIdentityPath);
  try {
    const changed = JSON.parse(runIdentityBytes);
    changed.run_instance_id = randomUUID();
    writeFileSync(runIdentityPath, `${JSON.stringify(changed)}\n`);
    assert.throws(() => reopenCalibrationExecutionAdmission(admissionInput, evidence.admission_digest),
      { message: /native scoped run identity/u });
  } finally { writeFileSync(runIdentityPath, runIdentityBytes); }
  console.log("PASS native run identity drift rejects static reopen without terminal result inspection");
  const selectionIndexPath = resolve(selectionState, "selection-state.json");
  const selectionIndexBytes = readFileSync(selectionIndexPath);
  const selectionIndexMode = statSync(selectionIndexPath).mode & 0o777;
  const pairedRunIdentityPath = resolve(roles.prompt_v2.execution.runDir, "run-identity.json");
  const pairedRunIdentityBytes = readFileSync(pairedRunIdentityPath);
  try {
    chmodSync(selectionIndexPath, 0o600);
    const reordered = JSON.parse(selectionIndexBytes);
    reordered.sealed_cases.reverse();
    writeFileSync(selectionIndexPath, `${JSON.stringify(reordered)}\n`);
    for (const [path, bytes] of [[runIdentityPath, runIdentityBytes], [pairedRunIdentityPath, pairedRunIdentityBytes]]) {
      const matchedRun = JSON.parse(bytes);
      matchedRun.selection_state_digest = hash(readFileSync(selectionIndexPath));
      writeFileSync(path, `${JSON.stringify(matchedRun)}\n`);
    }
    assert.throws(() => reopenCalibrationExecutionAdmission(admissionInput, evidence.admission_digest),
      { message: /reopened calibration execution admission/u });
  } finally {
    writeFileSync(runIdentityPath, runIdentityBytes);
    writeFileSync(pairedRunIdentityPath, pairedRunIdentityBytes);
    writeFileSync(selectionIndexPath, selectionIndexBytes);
    chmodSync(selectionIndexPath, selectionIndexMode);
  }
  console.log("PASS coordinated run and selection index mutation cannot reuse a frozen admission digest");
  // The production guard is used unmodified. A sandbox subcommand observation
  // is insufficient to attest the later exec session, so a real freeze remains
  // unavailable on this fake host. No measured authority is opened here.
  const unobservedExec = { model_calls: 0, allowed_control_observed: true,
    private_read_denied_observed: true, exec_session_policy_observed: false };
  assert.throws(() => assertSuccessorHostIsolationReady({ current_prompt: unobservedExec, prompt_v2: unobservedExec }),
    { code: "SUCCESSOR_HOST_ISOLATION_REQUIRED" });
  assert.equal(inspectCalibrationUnstartedInventories({ sources, normalizedRoots }).measured_result_bytes_read, 0);
  console.log("PASS production host-readiness guard rejects missing exec-session proof; no freeze or claim made");
  // A terminal sentinel is deliberately malformed. Reopening the static
  // admission and checking a freeze must never parse its bytes.
  const terminalPath = resolve(roles.current_prompt.execution.runDir, "cases",
    roles.current_prompt.native.cases[0].case_id, "attempts", "0001", "result.json");
  mkdirSync(resolve(terminalPath, ".."));
  writeFileSync(terminalPath, "not terminal JSON\n");
  assert.deepEqual(inspectCalibrationExecutionAdmission(
    reopenCalibrationExecutionAdmission(admissionInput, evidence.admission_digest)), evidence);
  const experiment = sources.current_prompt.scope.run_instance_id;
  const freezePath = resolve(runRoot, "native-runs", `.ask-successor-issue291-${experiment}.authority.json`);
  const sourceClosures = Object.fromEntries(Object.entries(sources).map(([promptRole, source]) => [promptRole,
    canonicalDigest({ scope_digest: source.scope.scope_digest, run_dir: source.execution.runDir,
      runtime_config_path: source.runtimeConfigPath, agent_bin: source.agentBin })]));
  const freezeBody = { schema_version: "1.0.0", kind: "prompt_successor_measured_authority_freeze", evidence: {
    schema_version: "1.1.0", kind: "prompt_successor_measured_authority",
    authority_source: "github_issue_291_plus_durable_result_blind_freeze",
    issue: ISSUE_291_MEASURED_AUTHORITY.issue,
    original_issue_source: { revision: ISSUE_291_MEASURED_AUTHORITY.source_revision,
      tree: ISSUE_291_MEASURED_AUTHORITY.source_tree,
      role: "historical_frozen_measurement_source_not_runtime_authority" },
    preregistration_source: { revision: preparation.predecessor.source_revision,
      tree: preparation.predecessor.source_tree },
    implementation, preparation_digest: preparation.preparation_digest,
    scoring_input_identity: { manifest_digest: preparation.scoring_input_manifest_digest },
    calibration_execution_admission: { admission_digest: evidence.admission_digest },
    experiment_run_instance_id: experiment, source_closures: sourceClosures,
    authority_record_path_digest: canonicalDigest({ path: freezePath }),
    journal_path_digest: canonicalDigest({ path: resolve(runRoot, "native-runs", `.ask-successor-issue291-${experiment}.journal.json`) }),
    sealed_before_first_attempt: true, durable_reopen_authorized: true,
    exact_host_runtime_verified_at_freeze: true, exact_native_sources_verified_at_freeze: true,
    ordered_execution_authorized: true, measured_result_access_authorized: true,
    measured_decision_authorized: true, automatic_retry_authorized: false,
    portfolio_mutation_authorized: false,
  } };
  const sealed = { ...freezeBody, record_digest: canonicalDigest(freezeBody) };
  write(freezePath, sealed);
  const freezeInput = { spec, context: preflightContext, expectedFreezeDigest: sealed.record_digest };
  assert.equal(readIssue291SealedFreeze(freezeInput).admissionDigest, evidence.admission_digest);
  const changed = structuredClone(sealed);
  changed.evidence.preparation_digest = `sha256:${"0".repeat(64)}`;
  changed.record_digest = canonicalDigest({ schema_version: changed.schema_version, kind: changed.kind, evidence: changed.evidence });
  writeFileSync(freezePath, `${JSON.stringify(changed)}\n`);
  assert.throws(() => readIssue291SealedFreeze(freezeInput), { message: /seal report authority_freeze_digest/u });
  assert.throws(() => readIssue291SealedFreeze({ ...freezeInput, expectedFreezeDigest: changed.record_digest }),
    { message: /measured freeze preparation/u });
  await assert.rejects(reopenIssue291ReadyContext(specPath, sealed.record_digest),
    { message: /seal report authority_freeze_digest/u });
  console.log("PASS sealed freeze requires the external digest and exact preparation before terminal result access");
}

if (process.argv[2] === "--synthetic-admission-worker") {
  await syntheticAdmissionWorker(process.argv[3]);
} else {
  test("four synthetic calibration admissions open, reject drift, and reopen before any result", { timeout: 900000 }, async t => {
    assert.equal(process.versions.node.split(".")[0], "24", "Node 24 required; no successful skip");
    const sourceRevision = git(root, "rev-parse", "HEAD");
    assert.equal(git(root, "status", "--porcelain"), "", "run this integration from a committed source snapshot");
    const work = mkdtempSync(resolve(realpathSync(tmpdir()), "ask291-synthetic-admission-"));
    t.after(() => rmSync(work, { recursive: true, force: true }));
    t.diagnostic("Synthetic admission integration uses a disposable clone and external test assets.");
    const clone = resolve(work, "checkout");
    command("git", ["-c", "core.hooksPath=/dev/null", "clone", "--no-hardlinks", "--no-checkout", root, clone]);
    git(clone, "checkout", "--detach", sourceRevision);
    const privateBase = resolve(work, "synthetic-private"); mkdirSync(privateBase);
    const candidates = createIssue291SyntheticPendingPackages({ root: clone, privateBase, revision: sourceRevision });
    git(clone, "add", "--", "benchmarks/fixtures/checkpoint-b2");
    git(clone, "-c", "user.name=ASK synthetic integration", "-c", "user.email=synthetic-test@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-m", "test-only pending calibration packages");
    const reviewedHead = git(clone, "rev-parse", "HEAD");
    const admissionSourcesByFixture = createIssue291SyntheticReviewOverlays({ root: clone, privateBase, candidates, reviewedHead });
    git(clone, "add", "--", "benchmarks/fixtures/admission-decision");
    git(clone, "-c", "user.name=ASK synthetic integration", "-c", "user.email=synthetic-test@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-m", "test-only simulated review admission overlays");
    const cloneRevision = git(clone, "rev-parse", "HEAD");
    assert.equal(git(clone, "status", "--porcelain"), "");
    const scoringManifestPath = resolve(work, "scoring-input-manifest.json");
    command(process.execPath, [resolve(clone, "scripts/ask-benchmark-calibration-input-package.mjs"), "assemble",
      "--output", scoringManifestPath], { cwd: clone, timeout: 600000 });
    const contextPath = resolve(work, "context.json");
    write(contextPath, { clone, cloneRevision, work, scoringManifestPath, admissionSourcesByFixture });
    const result = spawnSync(process.execPath,
      [resolve(clone, relative(root, fileURLToPath(import.meta.url))), "--synthetic-admission-worker", contextPath],
      { cwd: clone, encoding: "utf8", timeout: 840000, maxBuffer: 20 * 1024 * 1024 });
    if (result.stdout) console.log(result.stdout);
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(git(root, "rev-parse", "HEAD"), sourceRevision);
    assert.equal(git(root, "status", "--porcelain"), "");
    t.diagnostic("Simulated review and external synthetic assets do not prove independent review or real host isolation.");
  });
}
