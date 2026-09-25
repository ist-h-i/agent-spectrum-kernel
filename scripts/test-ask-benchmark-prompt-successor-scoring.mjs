import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { readSuccessorParent, readSuccessorImplementationIdentity } from "./ask-benchmark-prompt-successor-repository.mjs";
import { createSuccessorSyntheticScoringInputs, syntheticSuccessorEvaluatorEnvelope } from "./test-prompt-successor-scoring-fixtures.mjs";

const root = realpathSync(resolve(fileURLToPath(new URL("..", import.meta.url))));
const hash = b => `sha256:${createHash("sha256").update(b).digest("hex")}`;
const read = path => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const gitEnvironment = () => ({ ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" });
const git = (cwd, ...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", cwd, ...args], {
  encoding: "utf8", env: gitEnvironment(), timeout: 60000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
}).trim();
function run(file, args, { cwd = root, timeout = 60000 } = {}) {
  const result = spawnSync(file, args, { cwd, encoding: "utf8", timeout, env: file === "git" ? gitEnvironment() : process.env, maxBuffer: 20 * 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  return result;
}
function environment(values, callback) {
  const saved = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  for (const [k,v] of Object.entries(values)) process.env[k] = v;
  try { return callback(); }
  finally { for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
async function asyncEnvironment(values, callback) {
  const saved = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  for (const [k,v] of Object.entries(values)) process.env[k] = v;
  try { return await callback(); }
  finally { for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
function selection(record, plan) {
  const item = plan.cases.find(c => c.case_id === record.case_id);
  return { task_class: item.task_class, observed_signals: ["cross-file contract"], selected_mechanisms: ["repository-orientation"],
    skipped_mechanisms: ["agent-orchestration"], required_gates: ["test-first-verification"],
    agents: { requested: ["subagent"], omitted: ["runtime_capability_unproven"] },
    expected_evidence: ["synthetic source/catalog integration"], capability_downgrades: [],
    lightweight_bypass: { used: false, reason: "Synthetic input selection; Adaptive cases remain pending." },
    projection: { adapter_track: record.adapter, profile: record.projection_evidence.selected_profile, renderer_id: record.projection_evidence.renderer_id,
      renderer_version: record.projection_evidence.renderer_version, projection_fingerprint: record.projection_evidence.projection_fingerprint } };
}

async function worker(contextPath) {
  const context = read(contextPath);
  assert.equal(root, realpathSync(context.clone), "worker runs only in its isolated local clone");
  assert.equal(git(root, "rev-parse", "HEAD"), context.cloneRevision);
  assert.equal(git(root, "status", "--porcelain"), "");
  const work = context.work;
  const record = { source_revision: context.sourceRevision, synthetic_clone_revision: context.cloneRevision,
    node: process.version, platform: process.platform, architecture: process.arch,
    // Test-design declarations, not observed counters. No instrumentation is
    // installed at these boundaries; do not cite these values as telemetry.
    declared_activity: { evidence_kind: "expected_not_instrumented", expected_provider_calls: 0,
      expected_measured_result_reads: 0, expected_private_evaluator_process_calls: 0 },
    synthetic_native_attempts: 0, checks: [], completed: false,
    limits: "Synthetic legacy-profile evaluator envelopes and pending admission; no real evaluator approval, token measurement or adoption evidence." };
  const check = async (name, fn) => { await fn(); record.checks.push({ name, status: "pass" }); console.log(`PASS ${name}`); };
  try {
    const { buildPortfolioPlan } = await import("./ask-benchmark-plan.mjs");
    const { materializePortfolio } = await import("./ask-benchmark-materialize.mjs");
    const { sealAdaptiveSelection } = await import("./ask-benchmark-selection.mjs");
    const { buildPromptSuccessorPreparation, buildSuccessorSourceScope } = await import("./ask-benchmark-prompt-successor.mjs");
    const { openSuccessorPromptInput } = await import("./ask-benchmark-prompt-successor-delivery.mjs");
    const { openSuccessorScoringInputs, inspectSuccessorScoringInputs, successorScoringOptions } = await import("./ask-benchmark-prompt-successor-scoring-inputs.mjs");
    const { prepareSuccessorPortfolioSource, executePortfolio, inspectVerifiedPortfolioExecution } = await import("./ask-benchmark-execution.mjs");
    const { normalizePortfolioExecution, verifyNormalizedPortfolioResults } = await import("./ask-benchmark-normalized-results.mjs");
    const { verifyEvaluatorAuthority } = await import("./ask-benchmark-evaluator-boundary.mjs");
    const { resolveEffectiveAdmissionAuthority } = await import("./ask-benchmark-admission-decision.mjs");
    const { buildPortfolioEngineeringResult } = await import("./ask-benchmark-portfolio-score.mjs");
    const { computeEngineeringResultSourceManifestDigest, validateEngineeringResultSourceManifest } = await import("./ask-benchmark-portfolio-result-set.mjs");
    const { verifySuccessorSourceProvenance, inspectSuccessorProvenance } = await import("./ask-benchmark-prompt-successor-provenance.mjs");
    const { inspectSuccessorCollectionControl } = await import("./ask-benchmark-prompt-successor-collection.mjs");
    const { openSuccessorMeasuredAuthority, successorMeasuredJournalPath } = await import("./ask-benchmark-prompt-successor-measured-authority.mjs");
    const { executeNextMeasuredSuccessorCase, recoverMeasuredSuccessorSession, verifyMeasuredSuccessorCollection, inspectSuccessorMeasuredCompletion } = await import("./ask-benchmark-prompt-successor-measured-execution.mjs");
    const { buildSuccessorComparisonPolicy, buildSuccessorComparisonFromProvenance } = await import("./ask-benchmark-prompt-successor-report.mjs");
    const configFile = resolve(root, "benchmarks/prompt-successor-execution.config.json");
    const rawConfig = read(configFile);
    const config = { ...rawConfig, _kind: "portfolio", _configPath: configFile, _protocolPath: resolve(root, rawConfig.protocol_path) };
    const { parent, thresholds } = await readSuccessorParent({ root });
    const implementation = readSuccessorImplementationIdentity(root);
    const compiler = process.platform === "darwin" ? "/usr/bin/clang" : "cc";
    const agentBin = resolve(work, "codex");
    run(compiler, ["-std=c11", "-Wall", "-Wextra", "-Werror", "-O0", resolve(root, "scripts/test-fixtures/prompt-successor-fake-codex.c"), "-o", agentBin]);
    const nativeFile = {
      schema_version: "1.2.0", adapter: "codex", availability: "available", unavailable_reason: null,
      expected_executable_version: "codex-cli 0.153.4", model: "synthetic-native-fake-not-a-service", reasoning_effort: "high",
      case_timeout_ms: 900000, sandbox_policy: "workspace-write", permission_policy: "never",
      executor: { id: "successor-native-fake", version: "1.0.0" },
      environment_allowlist: ["HOME", "ASK_SUCCESSOR_FAKE_CAPTURE", "ASK_SUCCESSOR_FAKE_MODE"], environment_value_allowlist: [], thermal_state: "cold", claude_cli: null,
      command_evidence: { capture_required: true, support: "supported", event_transport: "codex_exec_jsonl", event_format_revision: "codex-exec-jsonl-v1", parser_revision: "1.3.0",
        shell_capability: { support_status: "supported", family: "posix_bash", executable: "/bin/bash", envelope_arguments: ["-lc"], authority_source: "codex_exec_jsonl_command_rendering", probe_status: "runtime_event_required", downgrade_reason: null } },
    };
    const runtimeConfigPath = resolve(work, "runtime.json"); write(runtimeConfigPath, nativeFile);
    const home = resolve(work, "empty-home"); const capture = resolve(work, "captures"); mkdirSync(home); mkdirSync(capture);
    const env = { HOME: home, ASK_SUCCESSOR_FAKE_CAPTURE: capture, ASK_SUCCESSOR_FAKE_MODE: "success" };
    const runtime = { adapter: "codex", cli_version: "0.153.4", executable_digest: hash(readFileSync(agentBin)), node_version: process.version,
      os: process.platform, arch: process.arch, model: nativeFile.model, provider_model_revision: { status: "unknown", value: null }, reasoning_effort: "high",
      authentication_mode: "chatgpt_subscription", configuration_digest: hash(readFileSync(runtimeConfigPath)), sandbox: "workspace-write", approval_policy: "never", agent_network: "disabled", provider_network: "provider_only", timeout_ms: 900000 };
    const manifestPath = resolve(root, "scripts/test-fixtures/generated-successor-scoring/manifest.json");
    const manifest = read(manifestPath);
    const preparation = buildPromptSuccessorPreparation({ parent, runtime, implementation, seed: "synthetic-successor-scoring-v1",
      changeReason: "Synthetic native execution and real #197 contract integration; no measured model or evaluator.", scoringInputManifestDigest: manifest.manifest_digest });
    record.preparation_digest = preparation.preparation_digest; record.native_digest = runtime.executable_digest;
    let scoringInputs;
    await check("pre-result public inputs bind four canonical fixtures; admission remains pending", async () => {
      scoringInputs = await openSuccessorScoringInputs({ preparation, manifestPath, root });
      const info = inspectSuccessorScoringInputs(scoringInputs, preparation);
      assert.equal(info.fixtures.length, 4); assert.ok(info.fixtures.every(f => f.admission_status === "admission_pending"));
      assert.equal(info.creates_admission, false);
    });
    await check("unbound preparations cannot open scoring inputs", async () => {
      const unbound = buildPromptSuccessorPreparation({ parent, runtime, implementation, seed: "synthetic-unbound", changeReason: "Negative test only." });
      await assert.rejects(() => openSuccessorScoringInputs({ preparation: unbound, manifestPath: "/never-read", root }), { code: "SUCCESSOR_SCORING_INPUTS_REQUIRED" });
    });
    const plan = buildPortfolioPlan({ root, config, repositoryRevision: implementation.revision, seed: "synthetic-canonical-native-plan" });
    assert.equal(plan.cases.length, 112); assert.ok(plan.cases.every(c => c.fixture_id.startsWith("cal-")));
    const planPath = resolve(work, "plan.json"); write(planPath, plan);
    const materializedPath = resolve(work, "materialized");
    const materialization = materializePortfolio({ root, config, planPath, outputPath: materializedPath, repositoryRevision: implementation.revision });
    const selectionState = resolve(work, "selection-state");
    for (const item of materialization.cases.filter(c => c.condition === "adaptive_ask")) {
      sealAdaptiveSelection({ root, config, planPath, materializedPath, stateDir: selectionState, caseId: item.case_id,
        input: selection(item, plan), repositoryRevision: implementation.revision, now: () => "2026-09-22T00:00:00Z" });
    }
    const shared = { root, config, planPath, materializedPath, selectionState };
    const experimentRun = randomUUID(); const roles = {};
    await check("both roles map all 14 canonical native cases before any fake execution", () => {
      for (const role of ["current_prompt", "prompt_v2"]) {
        const execution = { ...shared, runDir: resolve(work, `run-${role}`) };
        const native = environment(env, () => prepareSuccessorPortfolioSource({ ...execution, runtimeConfigPath, agentBin, preparation }));
        const source = { plan_id: native.plan_id, plan_digest: native.plan_digest, run_instance_id: native.run_instance_id, repository_revision: native.repository_revision,
          runtime_identity_digest: native.runtime_identity_digest, materialization_manifest_digest: native.materialization_manifest_digest,
          bindings: preparation.cases.filter(c => c.prompt_role === role).map(target => {
            const item = native.cases.find(c => c.fixture_id === target.fixture_id && c.repetition === target.repetition); assert.ok(item);
            return { successor_case_id: target.case_id, source_case_id: item.case_id, fixture_input_digest: item.fixture_input_digest,
              effective_command_digest: native.effective_command_digest, environment_snapshot_digest: native.environment_snapshot_digest };
          }) };
        const scope = buildSuccessorSourceScope({ preparation, promptRole: role, runInstanceId: experimentRun, source });
        roles[role] = { execution, scope, expectedScopeDigest: scope.scope_digest, runtimeConfigPath, agentBin, native };
      }
      assert.notEqual(roles.current_prompt.native.run_instance_id, roles.prompt_v2.native.run_instance_id);
    });
    const collectionInputs = () => ({ preparation, root, accessMode: "synthetic_only",
      sources: Object.fromEntries(Object.entries(roles).map(([name, role]) => {
        const { root: _root, ...execution } = role.execution;
        return [name, { scope: role.scope, expectedScopeDigest: role.scope.scope_digest, execution }];
      })) });
    const measuredSources = Object.fromEntries(Object.entries(roles).map(([name, role]) => {
      const { root: _root, ...execution } = role.execution;
      return [name, { scope: role.scope, expectedScopeDigest: role.scope.scope_digest, execution, runtimeConfigPath, agentBin }];
    }));
    let measuredAuthority; let measuredJournalPath;
    await check("issue291 measured authority binds exact host/runtime and both native sources", async () => {
      measuredAuthority = await openSuccessorMeasuredAuthority({ preparation, sources: measuredSources, scoringInputs, root });
      measuredJournalPath = successorMeasuredJournalPath(measuredAuthority, { preparation, sources: measuredSources });
      assert.ok(measuredAuthority); assert.ok(measuredJournalPath.startsWith(work));
    });
    await check("issue291 measured authority rejects a self-consistent substituted predecessor and scopes", async () => {
      const forgedParent = structuredClone(parent);
      forgedParent.preregistration_digest = canonicalDigest({ synthetic_forgery: "issue291-predecessor" });
      const forgedPreparation = buildPromptSuccessorPreparation({
        parent: forgedParent,
        runtime,
        implementation,
        seed: "synthetic-successor-scoring-forged-parent",
        changeReason: "Negative authority-boundary test; no model call.",
        scoringInputManifestDigest: manifest.manifest_digest,
      });
      const forgedRun = randomUUID();
      const forgedSources = Object.fromEntries(Object.entries(measuredSources).map(([role, value]) => {
        const source = structuredClone(value.scope.source);
        const targets = forgedPreparation.cases.filter(c => c.prompt_role === role);
        source.bindings = source.bindings.map((binding, index) => ({
          ...binding,
          successor_case_id: targets[index].case_id,
        }));
        const scope = buildSuccessorSourceScope({ preparation: forgedPreparation, promptRole: role, runInstanceId: forgedRun, source });
        return [role, { ...value, scope, expectedScopeDigest: scope.scope_digest }];
      }));
      await assert.rejects(
        () => openSuccessorMeasuredAuthority({ preparation: forgedPreparation, sources: forgedSources, scoringInputs, root }),
        { code: "SUCCESSOR_IDENTITY_MISMATCH" },
      );
    });
    await check("issue291 measured authority requires verified pre-result scoring inputs", async () => {
      await assert.rejects(
        () => openSuccessorMeasuredAuthority({ preparation, sources: measuredSources, root }),
        { code: "SUCCESSOR_UNVERIFIED_SCORING_INPUTS" },
      );
    });
    await check("durable global claim survives a pre-spawn failure and recovery never retries", async () => {
      const hiddenAgent = resolve(work, "codex-temporarily-unavailable");
      renameSync(agentBin, hiddenAgent);
      try {
        await assert.rejects(() => asyncEnvironment(env, () => executeNextMeasuredSuccessorCase({
          authority: measuredAuthority, preparation, sources: measuredSources, root,
        })));
        assert.equal(read(`${measuredJournalPath}.lock`).automatic_retry_authorized, false);
      } finally {
        renameSync(hiddenAgent, agentBin);
      }
      const recovered = await recoverMeasuredSuccessorSession({
        authority: measuredAuthority, preparation, sources: measuredSources, root,
      });
      assert.equal(recovered.retry_performed, false);
      assert.equal(recovered.collection.terminal_count, 0);
      assert.equal(recovered.collection.next_case_id, preparation.cases[0].case_id);
    });
    await check("typed provider usage limit preserves the failed trial and blocks the next global claim", async () => {
      const providerRoot = resolve(work, "provider-limit"); mkdirSync(providerRoot);
      const providerRun = randomUUID(); const providerRoles = {};
      for (const role of ["current_prompt", "prompt_v2"]) {
        const nativeExecution = { ...shared, runDir: resolve(providerRoot, `run-${role}`) };
        const native = environment({ ...env, ASK_SUCCESSOR_FAKE_MODE: "provider-limit" }, () => prepareSuccessorPortfolioSource({ ...nativeExecution, runtimeConfigPath, agentBin, preparation }));
        const { root: _providerExecutionRoot, ...execution } = nativeExecution;
        const source = {
          plan_id: native.plan_id, plan_digest: native.plan_digest, run_instance_id: native.run_instance_id,
          repository_revision: native.repository_revision, runtime_identity_digest: native.runtime_identity_digest,
          materialization_manifest_digest: native.materialization_manifest_digest,
          bindings: preparation.cases.filter(c => c.prompt_role === role).map(target => {
            const item = native.cases.find(c => c.fixture_id === target.fixture_id && c.repetition === target.repetition); assert.ok(item);
            return {
              successor_case_id: target.case_id, source_case_id: item.case_id, fixture_input_digest: item.fixture_input_digest,
              effective_command_digest: native.effective_command_digest, environment_snapshot_digest: native.environment_snapshot_digest,
            };
          }),
        };
        const scope = buildSuccessorSourceScope({ preparation, promptRole: role, runInstanceId: providerRun, source });
        providerRoles[role] = { execution, scope, expectedScopeDigest: scope.scope_digest, runtimeConfigPath, agentBin };
      }
      const providerAuthority = await openSuccessorMeasuredAuthority({ preparation, sources: providerRoles, scoringInputs, root });
      const step = await asyncEnvironment({ ...env, ASK_SUCCESSOR_FAKE_MODE: "provider-limit" }, () => executeNextMeasuredSuccessorCase({
        authority: providerAuthority, preparation, sources: providerRoles, root,
      }));
      assert.equal(step.collection.terminal_count, 1);
      assert.equal(step.collection.status, "stopped");
      assert.equal(step.collection.next_case_id, null);
      assert.ok(step.collection.stop_reasons.includes("provider_usage_limit"));
      assert.ok(step.collection.stop_reasons.includes("native_process_failed"));
      assert.deepEqual(step.collection.cases[0].usage.provider_stop, { status: "detected", reason: "subscription_usage_limit" });
      await assert.rejects(() => asyncEnvironment(env, () => executeNextMeasuredSuccessorCase({
        authority: providerAuthority, preparation, sources: providerRoles, root,
      })), { code: "SUCCESSOR_MEASURED_STOPPED" });
      await assert.rejects(() => verifyMeasuredSuccessorCollection({
        authority: providerAuthority, preparation, sources: providerRoles, root,
      }));
    });
    await check("crash after request publication is recovered as one interrupted measured trial without retry", async () => {
      const crashRoot = resolve(work, "measured-crash"); mkdirSync(crashRoot);
      const crashRun = randomUUID(); const crashRoles = {};
      for (const role of ["current_prompt", "prompt_v2"]) {
        const nativeExecution = { ...shared, runDir: resolve(crashRoot, `run-${role}`) };
        const native = environment(env, () => prepareSuccessorPortfolioSource({ ...nativeExecution, runtimeConfigPath, agentBin, preparation }));
        const { root: _crashExecutionRoot, ...execution } = nativeExecution;
        const source = {
          plan_id: native.plan_id, plan_digest: native.plan_digest, run_instance_id: native.run_instance_id,
          repository_revision: native.repository_revision, runtime_identity_digest: native.runtime_identity_digest,
          materialization_manifest_digest: native.materialization_manifest_digest,
          bindings: preparation.cases.filter(c => c.prompt_role === role).map(target => {
            const item = native.cases.find(c => c.fixture_id === target.fixture_id && c.repetition === target.repetition); assert.ok(item);
            return {
              successor_case_id: target.case_id, source_case_id: item.case_id, fixture_input_digest: item.fixture_input_digest,
              effective_command_digest: native.effective_command_digest, environment_snapshot_digest: native.environment_snapshot_digest,
            };
          }),
        };
        const scope = buildSuccessorSourceScope({ preparation, promptRole: role, runInstanceId: crashRun, source });
        crashRoles[role] = { execution, scope, expectedScopeDigest: scope.scope_digest, runtimeConfigPath, agentBin };
      }
      const crashContextPath = resolve(crashRoot, "context.json");
      write(crashContextPath, { preparation, sources: crashRoles, root, manifestPath });
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { readFileSync } from "node:fs";
        import { openSuccessorMeasuredAuthority } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-measured-authority.mjs", import.meta.url).href)};
        import { openSuccessorScoringInputs } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-scoring-inputs.mjs", import.meta.url).href)};
        import { executeNextMeasuredSuccessorCase } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-measured-execution.mjs", import.meta.url).href)};
        const i = JSON.parse(readFileSync(process.argv[1], "utf8"));
        const scoringInputs = await openSuccessorScoringInputs({ preparation: i.preparation, manifestPath: i.manifestPath, root: i.root });
        const authority = await openSuccessorMeasuredAuthority({ preparation: i.preparation, sources: i.sources, scoringInputs, root: i.root });
        await executeNextMeasuredSuccessorCase({ authority, preparation: i.preparation, sources: i.sources, root: i.root });
      `, crashContextPath], {
        cwd: root, encoding: "utf8", timeout: 600000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ...env, ASK_BENCHMARK_FAULT: "after_request_published", ASK_BENCHMARK_FAULT_LEASE_MS: "-1000" },
      });
      assert.equal(child.error, undefined, child.error?.message);
      assert.equal(child.status, 86, child.stderr || child.stdout);
      const crashAuthority = await openSuccessorMeasuredAuthority({ preparation, sources: crashRoles, scoringInputs, root });
      const recovered = await recoverMeasuredSuccessorSession({
        authority: crashAuthority, preparation, sources: crashRoles, root,
      });
      assert.equal(recovered.retry_performed, false);
      assert.equal(recovered.collection.terminal_count, 1);
      assert.equal(recovered.collection.status, "stopped");
      assert.equal(recovered.collection.next_case_id, null);
      assert.ok(recovered.collection.stop_reasons.includes("execution_uncertain"));
      const first = preparation.cases[0]; const role = crashRoles[first.prompt_role];
      const nativeCase = role.scope.source.bindings.find(b => b.successor_case_id === first.case_id).source_case_id;
      const actual = inspectVerifiedPortfolioExecution({ ...role.execution, root }).cases.find(c => c.entry.case_id === nativeCase);
      assert.equal(actual.attempts.length, 1);
      assert.equal(actual.state.status, "interrupted");
      await assert.rejects(() => asyncEnvironment(env, () => executeNextMeasuredSuccessorCase({
        authority: crashAuthority, preparation, sources: crashRoles, root,
      })), { code: "SUCCESSOR_MEASURED_STOPPED" });
    });
    await check("collection preflight reopens the two exact native runs without authorizing execution", async () => {
      const inspected = await inspectSuccessorCollectionControl(collectionInputs());
      assert.equal(inspected.control.terminal_count, 0);
      assert.equal(inspected.control.next_case_id, preparation.cases[0].case_id);
      assert.equal(inspected.execution_authorized, false);
      await assert.rejects(() => inspectSuccessorCollectionControl({ preparation, sources: collectionInputs().sources, accessMode: "measured", root }), { code: "SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED" });
    });
    await check("controller restart reconciles a committed measured journal without repeating the trial", async () => {
      const contextPath = resolve(work, "committed-journal-crash-context.json");
      write(contextPath, { preparation, sources: measuredSources, root, manifestPath });
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { readFileSync } from "node:fs";
        import { openSuccessorMeasuredAuthority } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-measured-authority.mjs", import.meta.url).href)};
        import { openSuccessorScoringInputs } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-scoring-inputs.mjs", import.meta.url).href)};
        import { executeNextMeasuredSuccessorCase } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-measured-execution.mjs", import.meta.url).href)};
        const i = JSON.parse(readFileSync(process.argv[1], "utf8"));
        const scoringInputs = await openSuccessorScoringInputs({ preparation: i.preparation, manifestPath: i.manifestPath, root: i.root });
        const authority = await openSuccessorMeasuredAuthority({ preparation: i.preparation, sources: i.sources, scoringInputs, root: i.root });
        await executeNextMeasuredSuccessorCase({ authority, preparation: i.preparation, sources: i.sources, root: i.root });
      `, contextPath], {
        cwd: root, encoding: "utf8", timeout: 600000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ...env, ASK_BENCHMARK_FAULT: "after_measured_journal_published" },
      });
      assert.equal(child.error, undefined, child.error?.message);
      assert.equal(child.status, 86, child.stderr || child.stdout);
      assert.equal(read(`${measuredJournalPath}.lock`).automatic_retry_authorized, false);
      assert.equal(read(measuredJournalPath).terminal_count, 1);
      measuredAuthority = await openSuccessorMeasuredAuthority({ preparation, sources: measuredSources, scoringInputs, root });
      const recovered = await recoverMeasuredSuccessorSession({ authority: measuredAuthority, preparation, sources: measuredSources, root });
      assert.equal(recovered.retry_performed, false);
      assert.equal(recovered.native_status, "completed");
      assert.equal(recovered.collection.terminal_count, 1);
      assert.equal(recovered.collection.total_tokens.value, 120);
      assert.equal(recovered.collection.next_case_id, preparation.cases[1].case_id);
      assert.equal(existsSync(`${measuredJournalPath}.lock`), false);
      const first = preparation.cases[0]; const role = roles[first.prompt_role];
      const nativeCase = role.scope.source.bindings.find(b => b.successor_case_id === first.case_id).source_case_id;
      const actual = inspectVerifiedPortfolioExecution(role.execution).cases.find(c => c.entry.case_id === nativeCase);
      assert.equal(actual.attempts.length, 1);
      record.synthetic_native_attempts++;
    });
    await check("a delayed controller cannot claim a stale native prefix after another controller commits", async () => {
      const contextPath = resolve(work, "stale-controller-context.json");
      write(contextPath, { preparation, sources: measuredSources, root, manifestPath });
      const child = spawn(process.execPath, ["--input-type=module", "-e", `
        import { readFileSync } from "node:fs";
        import { openSuccessorMeasuredAuthority } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-measured-authority.mjs", import.meta.url).href)};
        import { openSuccessorScoringInputs } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-scoring-inputs.mjs", import.meta.url).href)};
        import { executeNextMeasuredSuccessorCase } from ${JSON.stringify(new URL("./ask-benchmark-prompt-successor-measured-execution.mjs", import.meta.url).href)};
        const i = JSON.parse(readFileSync(process.argv[1], "utf8"));
        const scoringInputs = await openSuccessorScoringInputs({ preparation: i.preparation, manifestPath: i.manifestPath, root: i.root });
        const authority = await openSuccessorMeasuredAuthority({ preparation: i.preparation, sources: i.sources, scoringInputs, root: i.root });
        try {
          await executeNextMeasuredSuccessorCase({ authority, preparation: i.preparation, sources: i.sources, root: i.root });
        } catch (error) {
          if (error.code === "SUCCESSOR_MEASURED_STALE_CLAIM") process.exit(23);
          throw error;
        }
      `, contextPath], {
        cwd: root, env: { ...process.env, ...env, ASK_BENCHMARK_FAULT: "before_measured_lock_pause" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      let readyResolve; let readyReject;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
      const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
      child.stderr.on("data", chunk => {
        stderr += chunk;
        if (stderr.includes("MEASURED_BEFORE_LOCK\n")) readyResolve();
      });
      child.once("error", readyReject);
      child.once("exit", (code, signal) => readyReject(new Error(`stale controller exited before lock barrier: ${code}/${signal}: ${stderr}`)));
      const watchdog = setTimeout(() => readyReject(new Error(`stale controller did not reach lock barrier: ${stderr}`)), 600000);
      let exitWatchdog;
      try {
        await ready;
        const priorJournal = read(measuredJournalPath);
        const target = preparation.cases[1];
        const step = await asyncEnvironment(env, () => executeNextMeasuredSuccessorCase({
          authority: measuredAuthority, preparation, sources: measuredSources, root,
        }));
        assert.equal(step.case_id, target.case_id);
        assert.equal(step.collection.terminal_count, 2);
        record.synthetic_native_attempts++;
        child.kill("SIGCONT");
        const result = await Promise.race([exited, new Promise((_, reject) => {
          exitWatchdog = setTimeout(() => reject(new Error(`stale controller did not exit: ${stderr}`)), 600000);
        })]);
        assert.deepEqual(result, { code: 23, signal: null }, stderr);
        assert.equal(read(measuredJournalPath).terminal_count, 2);
        assert.equal(existsSync(`${measuredJournalPath}.lock`), false);
        const role = roles[target.prompt_role];
        const nativeCase = role.scope.source.bindings.find(b => b.successor_case_id === target.case_id).source_case_id;
        const actual = inspectVerifiedPortfolioExecution(role.execution).cases.find(c => c.entry.case_id === nativeCase);
        assert.equal(actual.attempts.length, 1);
        const staleClaim = {
          schema_version: "1.1.0", kind: "prompt_successor_measured_claim",
          authority_digest: priorJournal.authority_digest, preparation_digest: preparation.preparation_digest,
          case_id: target.case_id, prompt_role: target.prompt_role, native_case_id: nativeCase,
          pre_collection_digest: priorJournal.collection_control_digest,
          pre_journal_digest: priorJournal.journal_digest, pre_entry_count: priorJournal.entries.length,
          automatic_retry_authorized: false,
        };
        write(`${measuredJournalPath}.lock`, { ...staleClaim, claim_digest: canonicalDigest(staleClaim) });
        const recovered = await recoverMeasuredSuccessorSession({ authority: measuredAuthority, preparation, sources: measuredSources, root });
        assert.equal(recovered.retry_performed, false);
        assert.equal(recovered.collection.terminal_count, 2);
        assert.equal(existsSync(`${measuredJournalPath}.lock`), false);
        assert.equal(read(measuredJournalPath).journal_digest, recovered.journal.journal_digest);
      } finally {
        clearTimeout(watchdog);
        clearTimeout(exitWatchdog);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGCONT");
          child.kill("SIGTERM");
        }
      }
    });
    await check("28 measured-launch claims preserve global order, durable journal and canonical terminal identities", async () => {
      for (const target of preparation.cases.slice(2)) {
        const step = await asyncEnvironment(env, () => executeNextMeasuredSuccessorCase({
          authority: measuredAuthority, preparation, sources: measuredSources, root,
        }));
        assert.equal(step.case_id, target.case_id);
        assert.equal(step.prompt_role, target.prompt_role);
        assert.equal(step.automatic_retry_performed, false);
        assert.equal(step.journal.durable_global_sequence_verified, true);
        record.synthetic_native_attempts++;
      }
      const finalJournal = read(measuredJournalPath);
      assert.equal(finalJournal.terminal_count, 28);
      assert.equal(finalJournal.status, "collected");
      assert.equal(finalJournal.next_case_id, null);
      assert.equal(finalJournal.automatic_retries, 0);
      for (const role of Object.values(roles)) {
        const actual = inspectVerifiedPortfolioExecution(role.execution);
        const completed = actual.cases.filter(c => c.state.status === "completed"); assert.equal(completed.length, 14);
        for (const item of completed) assert.equal(item.attempts[0].request.input_identity.fixture_id, item.entry.fixture_id);
      }
    });
    let measuredCompletion;
    await check("native collection inspection retains all 28 cases and rejects a tampered usage receipt", async () => {
      const inspected = await inspectSuccessorCollectionControl(collectionInputs());
      assert.equal(inspected.control.status, "collected");
      assert.equal(inspected.control.total_tokens.value, 28 * 120);
      assert.equal(inspected.control.terminal_count, 28);
      assert.equal(inspected.durable_global_sequence_verified, false);
      assert.equal(inspected.measured_decision_authorized, false);
      const first = preparation.cases[0]; const role = roles[first.prompt_role];
      const nativeCase = role.scope.source.bindings.find(b => b.successor_case_id === first.case_id).source_case_id;
      const path = resolve(role.execution.runDir, "cases", nativeCase, "attempts", "0001", "result.json");
      const original = readFileSync(path); const altered = JSON.parse(original);
      altered.successor_usage.metrics.total_tokens.value = 1;
      try {
        writeFileSync(path, `${JSON.stringify(altered, null, 2)}\n`);
        await assert.rejects(() => inspectSuccessorCollectionControl(collectionInputs()));
      } finally { writeFileSync(path, original); }
      assert.equal((await inspectSuccessorCollectionControl(collectionInputs())).control.total_tokens.value, 28 * 120);
      measuredCompletion = await verifyMeasuredSuccessorCollection({ authority: measuredAuthority, preparation, sources: measuredSources, root });
      const completion = inspectSuccessorMeasuredCompletion(measuredCompletion);
      assert.equal(completion.terminal_count, 28);
      assert.equal(completion.durable_global_sequence_verified, true);
      assert.equal(completion.measured_result_access_authorized, true);
    });
    const sources = {}; const handles = {};
    for (const roleName of ["current_prompt", "prompt_v2"]) {
      await check(`${roleName}: normalization -> evaluator validation -> existing #197 score -> real provenance`, async () => {
        const role = roles[roleName]; const normalizedResultsPath = resolve(work, `normalized-${roleName}`);
        const normalized = normalizePortfolioExecution({ ...role.execution, outputPath: normalizedResultsPath });
        const snapshot = normalized.sourceSnapshotDigest;
        const verified = verifyNormalizedPortfolioResults({ root, outputPath: normalizedResultsPath, sourceSnapshotDigest: snapshot });
        const engineeringResultsPath = resolve(work, `engineering-${roleName}`); mkdirSync(engineeringResultsPath);
        const evaluatorDirectory = resolve(work, `evaluator-results-${roleName}`); mkdirSync(evaluatorDirectory);
        const evaluatorOptionsByCase = {}; const inventory = [];
        for (const binding of role.scope.source.bindings) {
          const entry = verified.manifest.cases.find(c => c.case_id === binding.source_case_id); assert.ok(entry);
          assert.equal(entry.normalized_attempts.length, 1);
          const result = read(resolve(verified.generationPath, entry.normalized_attempts[0].path));
          assert.equal(result.telemetry.input_tokens.value, 100);
          assert.equal(result.telemetry.output_tokens.value, 20);
          assert.equal(result.telemetry.cached_tokens.value, 80);
          assert.equal(result.telemetry.input_tokens.reason, "committed_runtime_evidence");
          const fixtureContext = context.scoring.contexts[result.lineage.fixture_id]; assert.ok(fixtureContext);
          const envelope = syntheticSuccessorEvaluatorEnvelope({ normalized: result, sourceSnapshotDigest: snapshot, context: fixtureContext });
          const resultPath = resolve(evaluatorDirectory, `${result.normalized_result_id}.json`); write(resultPath, envelope);
          const options = { ...successorScoringOptions(scoringInputs, preparation, result.lineage.fixture_id),
            privateRoot: fixtureContext.privateRoot, manifestPath: fixtureContext.manifestPath, resultPath,
            materializedPath, selectionState, runDir: role.execution.runDir, normalizedResultsPath };
          const authority = verifyEvaluatorAuthority(options);
          const inputs = authority.scoringInputs;
          const effectiveAdmissionAuthority = resolveEffectiveAdmissionAuthority({ frozenAdmissionRecord: inputs.admissionRecord,
            requirementRecord: inputs.requirementRecord, evaluatorReference: inputs.evaluatorReference, root });
          const engineering = buildPortfolioEngineeringResult({ ...authority, effectiveAdmissionAuthority }, { root });
          assert.equal(engineering.fixture_id, result.lineage.fixture_id);
          assert.equal(engineering.scoring_status, "not_scoring_ready");
          assert.equal(engineering.effective_admission_status, "admission_pending");
          const name = `${engineering.engineering_result_id}.json`; const outputPath = resolve(engineeringResultsPath, name); write(outputPath, engineering);
          const b = readFileSync(outputPath);
          const keys = ["engineering_result_id", "engineering_result_digest", "effective_admission_mode", "effective_admission_status", "frozen_admission_record_digest", "requirement_authority_digest", "admission_decision_digest", "admission_decision_revision", "normalized_result_id", "normalized_result_digest", "case_id", "attempt", "condition", "repetition"];
          inventory.push({ path: name, raw_byte_digest: hash(b), bytes: b.length, ...Object.fromEntries(keys.map(k => [k, engineering[k]])) });
          evaluatorOptionsByCase[binding.successor_case_id] = { privateRoot: fixtureContext.privateRoot, manifestPath: fixtureContext.manifestPath, resultPath };
        }
        inventory.sort((a,b) => a.path.localeCompare(b.path));
        const sourceManifest = { schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json",
          program: "adaptive_ask_portfolio_engineering_result_source_manifest", plan_id: role.native.plan_id, plan_digest: role.native.plan_digest,
          run_instance_id: role.native.run_instance_id, source_snapshot_digest: snapshot, adapter_track: "codex",
          normalized_generation_id: `snapshot-${snapshot.slice(7)}`, normalized_manifest_digest: verified.manifest.normalized_run_digest,
          source_revision: implementation.revision, inventory };
        sourceManifest.manifest_digest = computeEngineeringResultSourceManifestDigest(sourceManifest);
        validateEngineeringResultSourceManifest(sourceManifest, { root });
        const sourceManifestPath = resolve(work, `source-${roleName}.json`); write(sourceManifestPath, sourceManifest);
        const source = { paths: { normalizedResultsPath, engineeringResultsPath, sourceManifestPath }, sourceManifestSourceDigest: hash(readFileSync(sourceManifestPath)), sourceSnapshotDigest: snapshot };
        sources[roleName] = { preparation, scope: role.scope, expectedScopeDigest: role.scope.scope_digest, source, execution: { config, planPath, materializedPath, selectionState, runDir: role.execution.runDir },
          evaluatorOptionsByCase, scoringInputs, accessMode: "synthetic_only", root };
        handles[roleName] = await verifySuccessorSourceProvenance(sources[roleName]);
        const proof = inspectSuccessorProvenance(handles[roleName]); assert.equal(proof.entries.length, 14);
        assert.equal(proof.scoring_input_manifest_digest, manifest.manifest_digest);
      });
    }
    await check("opaque synthetic and measured provenance produce distinct bounded reports", async () => {
      const policy = buildSuccessorComparisonPolicy(preparation, thresholds);
      const report = buildSuccessorComparisonFromProvenance({ preparation, policy, sources: handles });
      assert.equal(report.analysis.prompt_outcome, "insufficient_evidence");
      assert.equal(report.measured_decision_authorized, false); assert.equal(report.mutation_authorized, false);
      assert.equal(report.sources.length, 2); write(resolve(work, "synthetic-report.json"), report);
      const measuredHandles = {};
      for (const role of ["current_prompt", "prompt_v2"]) {
        await assert.rejects(() => verifySuccessorSourceProvenance({
          ...sources[role], accessMode: "measured", measuredAuthority,
        }), { code: "SUCCESSOR_RESULT_ACCESS_NOT_AUTHORIZED" });
        measuredHandles[role] = await verifySuccessorSourceProvenance({
          ...sources[role], accessMode: "measured", measuredAuthority, measuredCompletion,
        });
        const proof = inspectSuccessorProvenance(measuredHandles[role]);
        assert.equal(proof.access_mode, "measured");
        assert.equal(proof.comparison_eligible, true);
      }
      const measuredReport = buildSuccessorComparisonFromProvenance({ preparation, policy, sources: measuredHandles });
      assert.equal(measuredReport.kind, "prompt_successor_measured_comparison_report");
      assert.equal(measuredReport.evidence_kind, "measured_reverified_provenance");
      assert.equal(measuredReport.analysis.prompt_outcome, "insufficient_evidence");
      assert.equal(measuredReport.measured_decision_authorized, true);
      assert.equal(measuredReport.mutation_authorized, false);
      write(resolve(work, "measured-report.json"), measuredReport);
      record.report_digest = measuredReport.report_digest;
      const otherPreparation = buildPromptSuccessorPreparation({ parent, runtime, implementation, seed: "synthetic-other-experiment",
        changeReason: "Negative transplant test.", scoringInputManifestDigest: manifest.manifest_digest });
      assert.throws(() => buildSuccessorComparisonFromProvenance({ preparation: otherPreparation,
        policy: buildSuccessorComparisonPolicy(otherPreparation, thresholds), sources: handles }));
      assert.throws(() => buildSuccessorComparisonFromProvenance({ preparation, policy, sources: { current_prompt: handles.current_prompt, prompt_v2: handles.current_prompt } }));
      assert.throws(() => buildSuccessorComparisonFromProvenance({ preparation, policy, sources: { current_prompt: { ...handles.current_prompt }, prompt_v2: handles.prompt_v2 } }));
    });
    await check("missing or forged input capabilities fail before source reads", async () => {
      for (const bad of [undefined, {}, { kind: "verified_successor_scoring_inputs" }]) {
        await assert.rejects(() => verifySuccessorSourceProvenance({ ...sources.current_prompt, scoringInputs: bad }), { code: "SUCCESSOR_UNVERIFIED_SCORING_INPUTS" });
      }
    });
    await check("caller-supplied per-case input paths cannot override the pinned manifest", async () => {
      const args = sources.current_prompt;
      const id = args.scope.source.bindings[0].successor_case_id;
      const altered = { ...args.evaluatorOptionsByCase, [id]: { ...args.evaluatorOptionsByCase[id], catalogPath: "/never-read-catalog.json" } };
      await assert.rejects(() => verifySuccessorSourceProvenance({ ...args, evaluatorOptionsByCase: altered }),
        error => error.code === "SUCCESSOR_IDENTITY_MISMATCH" && error.path === "pre-result evaluator input.catalogPath");
    });
    await check("a later public-input substitution is rejected and restored in the test clone", () => {
      const entry = manifest.fixtures[0]; const path = resolve(root, entry.artifacts.admission_record.path); const before = readFileSync(path);
      try { writeFileSync(path, Buffer.concat([before, Buffer.from(" ")])); assert.throws(() => successorScoringOptions(scoringInputs, preparation, entry.fixture_id)); }
      finally { writeFileSync(path, before); }
    });
    record.final_revision = git(root, "rev-parse", "HEAD"); record.final_status = git(root, "status", "--porcelain");
    assert.equal(record.final_revision, context.cloneRevision); assert.equal(record.final_status, ""); assert.equal(record.checks.length, 20); record.completed = true;
  } finally {
    const evidencePath = resolve(work, "scoring-verification.json"); write(evidencePath, record); console.log(`Evidence: ${evidencePath}`);
  }
}

if (process.argv[2] === "--worker") {
  await worker(process.argv[3]);
} else {
  await test("successor canonical input and real #197 provenance integration (synthetic only)", { timeout: 5400000 }, async t => {
    assert.equal(process.versions.node.split(".")[0], "24", "Node 24 required; no successful skip");
    assert.ok(["darwin", "linux"].includes(process.platform));
    const sourceRevision = git(root, "rev-parse", "HEAD"); assert.equal(git(root, "status", "--porcelain"), "");
    const work = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-successor-scoring-e2e-"));
    t.diagnostic(`Synthetic test artifacts: ${work}`);
    const clone = resolve(work, "checkout");
    run("git", ["-c", "core.hooksPath=/dev/null", "clone", "--no-hardlinks", "--no-checkout", root, clone]); git(clone, "checkout", "--detach", sourceRevision);
    const privateBase = resolve(work, "synthetic-private"); mkdirSync(privateBase);
    const { parent } = await readSuccessorParent({ root });
    const scoring = createSuccessorSyntheticScoringInputs({ root: clone, privateBase, parent, revision: sourceRevision });
    // Real #197 roots are repository anchored. Use a separate test commit rather
    // than weakening the clean-HEAD guard or putting synthetic approvals on the PR.
    const prefix = "scripts/test-fixtures/generated-successor-scoring";
    git(clone, "add", "--", prefix);
    git(clone, "-c", "user.name=ASK synthetic integration", "-c", "user.email=synthetic-test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "test-only synthetic scoring inputs; pending admission");
    const cloneRevision = git(clone, "rev-parse", "HEAD");
    const changed = git(clone, "diff", "--name-only", sourceRevision, cloneRevision).split("\n");
    assert.ok(changed.length > 0 && changed.every(p => p.startsWith(`${prefix}/`)), "synthetic clone changes public test inputs only");
    const contextPath = resolve(work, "context.json"); write(contextPath, { sourceRevision, cloneRevision, clone, work, scoring });
    const result = spawnSync(process.execPath, [resolve(clone, relative(root, fileURLToPath(import.meta.url))), "--worker", contextPath], {
      cwd: clone, encoding: "utf8", timeout: 5300000, maxBuffer: 20 * 1024 * 1024,
    });
    writeFileSync(resolve(work, "worker.stdout.log"), result.stdout ?? ""); writeFileSync(resolve(work, "worker.stderr.log"), result.stderr ?? "");
    if (result.stdout) console.log(result.stdout);
    assert.equal(git(root, "rev-parse", "HEAD"), sourceRevision); assert.equal(git(root, "status", "--porcelain"), "");
    assert.equal(result.error, undefined, result.error?.message); assert.equal(result.status, 0, result.stderr || result.stdout);
    const proof = read(resolve(work, "scoring-verification.json")); assert.equal(proof.completed, true); assert.equal(proof.synthetic_native_attempts, 28);
    assert.deepEqual(proof.declared_activity, { evidence_kind: "expected_not_instrumented", expected_provider_calls: 0,
      expected_measured_result_reads: 0, expected_private_evaluator_process_calls: 0 });
    for (const key of ["provider_calls", "measured_result_reads", "private_evaluator_process_calls"]) assert.equal(Object.hasOwn(proof, key), false);
    t.diagnostic(`Evidence: ${resolve(work, "scoring-verification.json")}`);
  });
}
