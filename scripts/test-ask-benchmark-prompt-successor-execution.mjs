import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortfolioPlan } from "./ask-benchmark-plan.mjs";
import { canonicalDigest, materializePortfolio } from "./ask-benchmark-materialize.mjs";
import { sealAdaptiveSelection } from "./ask-benchmark-selection.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { prepareSuccessorPortfolioSource, executePortfolio, inspectVerifiedPortfolioExecution } from "./ask-benchmark-execution.mjs";
import { normalizePortfolioExecution, verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { buildPromptSuccessorPreparation, buildSuccessorSourceScope } from "./ask-benchmark-prompt-successor.mjs";
import { readSuccessorParent, readSuccessorImplementationIdentity } from "./ask-benchmark-prompt-successor-repository.mjs";
import { openSuccessorPromptInput, consumeSuccessorPromptInput, successorInputProjection } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { assertSuccessorNativeExecutable } from "./ask-benchmark-prompt-successor-native.mjs";
import { inspectChildTermination } from "./test-successor-process-state.mjs";

// This entry is for a clean committed candidate. All generated files stay outside
// it. There is no PATH lookup of Codex, provider call, real credential or evaluator.
const root = realpathSync(resolve(fileURLToPath(new URL("..", import.meta.url))));
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024 }).trim();
const splitNul = (bytes) => {
  assert.equal(bytes.at(-1), 0, "native capture must have a terminal NUL");
  return bytes.subarray(0, -1).toString("utf8").split("\0");
};
function withEnvironment(values, action) {
  const before = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try { return action(); }
  finally { for (const [key, value] of before) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
function command(file, args, label) {
  const result = spawnSync(file, args, { encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined, `${label}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  return result;
}
function selectionInput(record, plan) {
  const entry = plan.cases.find((candidate) => candidate.case_id === record.case_id);
  return {
    task_class: entry.task_class, observed_signals: ["cross-file contract"],
    selected_mechanisms: ["repository-orientation"], skipped_mechanisms: ["agent-orchestration"],
    required_gates: ["test-first-verification"], agents: { requested: ["subagent"], omitted: ["runtime_capability_unproven"] },
    expected_evidence: ["synthetic native transport verification"], capability_downgrades: [],
    lightweight_bypass: { used: false, reason: "Synthetic pre-result selection; no Adaptive case is executed." },
    projection: {
      adapter_track: record.adapter, profile: record.projection_evidence.selected_profile,
      renderer_id: record.projection_evidence.renderer_id, renderer_version: record.projection_evidence.renderer_version,
      projection_fingerprint: record.projection_evidence.projection_fingerprint,
    },
  };
}
function nativeConfig(timeoutMs = 900000) {
  return {
    schema_version: "1.2.0", adapter: "codex", availability: "available", unavailable_reason: null,
    expected_executable_version: "codex-cli 0.153.4", model: "synthetic-native-fake-not-a-service", reasoning_effort: "high",
    case_timeout_ms: timeoutMs, sandbox_policy: "workspace-write", permission_policy: "never",
    executor: { id: "successor-native-fake", version: "1.0.0" },
    environment_allowlist: ["HOME", "ASK_SUCCESSOR_FAKE_CAPTURE", "ASK_SUCCESSOR_FAKE_MODE"], environment_value_allowlist: [],
    thermal_state: "cold", claude_cli: null,
    command_evidence: {
      capture_required: true, support: "supported", event_transport: "codex_exec_jsonl",
      event_format_revision: "codex-exec-jsonl-v1", parser_revision: "1.3.0",
      shell_capability: {
        support_status: "supported", family: "posix_bash", executable: "/bin/bash", envelope_arguments: ["-lc"],
        authority_source: "codex_exec_jsonl_command_rendering", probe_status: "runtime_event_required", downgrade_reason: null,
      },
    },
  };
}
function nativeCaptureIds(directory) { return readdirSync(directory).filter((name) => /^[0-9]+\.stdin$/u.test(name)).sort(); }
function nativeCapture(directory, before) {
  const added = nativeCaptureIds(directory).filter((name) => !before.includes(name));
  assert.equal(added.length, 1, "exactly one native fake invocation must capture stdin");
  const id = added[0].slice(0, -".stdin".length);
  return { id, stdin: readFileSync(resolve(directory, `${id}.stdin`)), argv: splitNul(readFileSync(resolve(directory, `${id}.argv`))),
    meta: splitNul(readFileSync(resolve(directory, `${id}.meta`))) };
}
function independentStdin(preparation, target, task) {
  const frozen = preparation.predecessor.source_revision;
  const readFrozen = (path) => execFileSync("git", ["-C", root, "show", `${frozen}:${path}`], { timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
  const registration = JSON.parse(readFrozen("benchmarks/prompt-v2-preregistration.json"));
  const mode = target.task_class === "review" ? "review" : "implement";
  let path = `docs/fixtures/codex-pre-compact-prompts/skill-${mode}.md`;
  if (target.prompt_role === "prompt_v2") {
    const archiveRoot = registration.generated_authority_binding_contract.rendered_source_root;
    const reference = JSON.parse(readFrozen(`${archiveRoot}/reference.json`));
    const item = reference.adapters.find((entry) => entry.adapter === "codex").files.find((entry) => entry.path === `codex/skill-${mode}.md`);
    assert.ok(item, "frozen v2 template exists"); path = `${archiveRoot}/${item.path}`;
  }
  // Byte splicing is independent of the production UTF-8 rendering function.
  const template = readFrozen(path); const marker = Buffer.from("$ARGUMENTS");
  const index = template.indexOf(marker);
  assert.ok(index >= 0 && template.indexOf(marker, index + marker.length) < 0, "one template marker");
  return Buffer.concat([template.subarray(0, index), task, template.subarray(index + marker.length)]);
}

await test("F3: successor input traverses the real native runner without a provider", { timeout: 600000 }, async (t) => {
  assert.equal(process.versions.node.split(".")[0], "24", "requires Node 24; wrong runtime is a failure, not a skip");
  assert.ok(["darwin", "linux"].includes(process.platform), "POSIX native-process test; Windows needs a separate process-control test");
  assert.equal(git("status", "--porcelain", "--untracked-files=normal"), "", "commit the candidate before this test; do not bypass cleanliness");
  const implementation = readSuccessorImplementationIdentity(root);
  const work = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-successor-native-e2e-"));
  const captures = resolve(work, "captures"); const home = resolve(work, "empty-home");
  mkdirSync(captures); mkdirSync(home);
  const evidence = { target: implementation, base: "e6db9604ed0d66b11289b2f6ceb768657e245849", node: process.version,
    platform: process.platform, architecture: process.arch, provider_calls: 0, evaluator_calls: 0, measured_result_reads: 0,
    protected_files_modified: false, checks: [], native_attempts: [], limitation: "Fake-process transport/control evidence, not real Codex isolation or evaluator/opaque-provenance report acceptance." };
  evidence.child_termination = [];
  const assertTerminatedChild = (pid, mode) => {
    const observed = inspectChildTermination(pid);
    evidence.child_termination.push({ pid, mode, ...observed });
    assert.equal(observed.execution_terminated, true, "the fake descendant must no longer execute");
    if (!observed.reaped) t.diagnostic(`${mode}: terminated zombie remains owned by the host reaper; reaped=false`);
  };
  t.diagnostic(`Generated test artifacts (outside checkout): ${work}`);
  const check = async (name, action) => t.test(name, async () => {
    try { await action(); evidence.checks.push({ name, status: "pass" }); }
    catch (error) { evidence.checks.push({ name, status: "fail", code: error.code ?? null, message: String(error.message) }); throw error; }
  });
  try {
    const compiler = process.platform === "darwin" ? "/usr/bin/clang" : "cc";
    const cSource = resolve(root, "scripts/test-fixtures/prompt-successor-fake-codex.c");
    const agentBin = resolve(work, "codex");
    const build = command(compiler, ["-std=c11", "-Wall", "-Wextra", "-Werror", "-O0", cSource, "-o", agentBin], "native fake compilation");
    evidence.compiler = command(compiler, ["--version"], "compiler version").stdout.split("\n")[0];
    evidence.fake_source_digest = hash(readFileSync(cSource)); evidence.compiler_exit = build.status;
    const nativeDigest = hash(readFileSync(agentBin));
    evidence.native = assertSuccessorNativeExecutable({ path: agentBin, expectedDigest: nativeDigest, os: process.platform, arch: process.arch });
    const { parent } = await readSuccessorParent({ root });
    // A tracked test config keeps source paths repository-relative while all
    // generated state remains outside the clean checkout. No config is rewritten.
    const configFile = resolve(root, "benchmarks/prompt-successor-execution.config.json");
    const inputConfig = json(configFile);
    assertBenchmarkSchemaInstance(inputConfig, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-config.schema.json"), label: "F3 test configuration" });
    assert.equal(inputConfig.fixtures.length, 4);
    for (const fixture of inputConfig.fixtures) {
      const declared = parent.fixtures.find((entry) => entry.fixture_id === fixture.id);
      assert.ok(declared); assert.equal(fixture.repetitions, declared.repetitions);
      assert.equal(fixture.source_fixture_id, declared.source_fixture_id);
    }
    const config = { ...inputConfig, _kind: "portfolio", _configPath: configFile, _protocolPath: resolve(root, inputConfig.protocol_path) };
    const plan = buildPortfolioPlan({ root, config, repositoryRevision: implementation.revision, seed: "f3-native-fake-source-plan" });
    assertBenchmarkSchemaInstance(plan, { schemaPath: resolve(root, config.execution_plan.schema_path), label: "F3 native plan" });
    assert.equal(plan.cases.length, 112, "retain both adapters and four ordinary conditions in the source plan");
    const planPath = resolve(work, "plan.json"); writeJson(planPath, plan);
    const materializedPath = resolve(work, "materialized");
    const materialized = materializePortfolio({ root, config, planPath, outputPath: materializedPath, repositoryRevision: implementation.revision });
    const selectionState = resolve(work, "selection-state");
    for (const record of materialized.cases.filter((entry) => entry.condition === "adaptive_ask")) {
      sealAdaptiveSelection({ root, config, planPath, materializedPath, stateDir: selectionState, caseId: record.case_id,
        input: selectionInput(record, plan), repositoryRevision: implementation.revision, now: () => "2026-09-22T00:00:00Z" });
    }
    const common = { root, config, planPath, materializedPath, selectionState };
    const scenario = (mode, timeoutMs = 900000) => {
      const directory = resolve(work, `${mode}-${timeoutMs}`); mkdirSync(directory);
      const runtimeConfigPath = resolve(directory, "runtime.json"); const runtimeFile = nativeConfig(timeoutMs); writeJson(runtimeConfigPath, runtimeFile);
      const environment = { HOME: home, ASK_SUCCESSOR_FAKE_CAPTURE: captures, ASK_SUCCESSOR_FAKE_MODE: mode };
      const runtime = { adapter: "codex", cli_version: "0.153.4", executable_digest: nativeDigest, node_version: process.version,
        os: process.platform, arch: process.arch, model: runtimeFile.model, provider_model_revision: { status: "unknown", value: null },
        reasoning_effort: "high", authentication_mode: "api_key", configuration_digest: hash(readFileSync(runtimeConfigPath)),
        sandbox: "workspace-write", approval_policy: "never", agent_network: "disabled", provider_network: "provider_only", timeout_ms: timeoutMs };
      // "api_key" above is a synthetic closed-enum value, NOT an observed login.
      // The fake HOME is empty and no credential environment variable is inherited.
      return { directory, runtimeConfigPath, environment, runtime, invoke: (action) => withEnvironment(environment, action) };
    };
    const prepareRole = (s, preparation, role, successorRun) => {
      const runDir = resolve(s.directory, role); const execution = { ...common, runDir };
      const before = nativeCaptureIds(captures);
      const prepared = s.invoke(() => prepareSuccessorPortfolioSource({ ...execution, runtimeConfigPath: s.runtimeConfigPath, agentBin, preparation }));
      assert.deepEqual(nativeCaptureIds(captures), before, "source preparation may probe version/help but must not execute a case");
      assert.equal(prepared.model_calls, 0); assert.equal(prepared.case_attempts_created, 0);
      const bindings = preparation.cases.filter((target) => target.prompt_role === role).map((target) => {
        const entry = prepared.cases.find((entry) => entry.fixture_id === target.fixture_id && entry.repetition === target.repetition);
        assert.ok(entry, `native source case for ${target.case_id}`);
        return { successor_case_id: target.case_id, source_case_id: entry.case_id, fixture_input_digest: entry.fixture_input_digest,
          effective_command_digest: prepared.effective_command_digest, environment_snapshot_digest: prepared.environment_snapshot_digest };
      });
      const source = { plan_id: prepared.plan_id, plan_digest: prepared.plan_digest, run_instance_id: prepared.run_instance_id,
        repository_revision: prepared.repository_revision, runtime_identity_digest: prepared.runtime_identity_digest,
        materialization_manifest_digest: prepared.materialization_manifest_digest, bindings };
      const scope = buildSuccessorSourceScope({ preparation, promptRole: role, runInstanceId: successorRun, source });
      return { execution, prepared, scope, preparation, scenario: s };
    };
    const prepare = (s) => buildPromptSuccessorPreparation({ parent, runtime: s.runtime, implementation,
      seed: `f3-native-${basename(s.directory)}`, changeReason: "Disposable compiled native fake only; no provider/evaluator execution." });
    const input = (role, target) => openSuccessorPromptInput({ preparation: role.preparation, scope: role.scope, expectedScopeDigest: role.scope.scope_digest, caseId: target.case_id, root });
    const targetFor = (preparation, role, taskClass) => preparation.cases.find((target) => target.prompt_role === role && target.task_class === taskClass && target.repetition === 1);
    const argsFor = (role, target, handle) => ({ ...role.execution, adapter: "codex", runtimeConfigPath: role.scenario.runtimeConfigPath,
      agentBin, caseId: role.scope.source.bindings.find((binding) => binding.successor_case_id === target.case_id).source_case_id,
      maxCases: 1, retryFailed: false, successorPromptInput: handle });
    const observed = (role, nativeCase) => {
      const inspection = inspectVerifiedPortfolioExecution(role.execution);
      const record = inspection.cases.find((entry) => entry.entry.case_id === nativeCase);
      assert.equal(record.attempts.length, 1); assert.equal(record.attempts[0].attempt, "0001");
      return { inspection, record, attempt: record.attempts[0] };
    };
    const success = scenario("success"); const preparation = prepare(success); const successorRun = randomUUID();
    let roles;
    await check("prepareSuccessorPortfolioSource creates separate role runs without starting cases", () => {
      roles = Object.fromEntries(["current_prompt", "prompt_v2"].map((role) => [role, prepareRole(success, preparation, role, successorRun)]));
      assert.notEqual(roles.current_prompt.prepared.run_instance_id, roles.prompt_v2.prepared.run_instance_id);
      assert.equal(roles.current_prompt.prepared.runtime_identity_digest, roles.prompt_v2.prepared.runtime_identity_digest);
      for (const role of Object.values(roles)) assert.ok(inspectVerifiedPortfolioExecution(role.execution).cases.every((entry) => entry.attempts.length === 0));
    });
    assert.ok(roles, "role preparation must succeed before execution checks");
    for (const roleName of ["current_prompt", "prompt_v2"]) for (const taskClass of ["review", "implementation"]) {
      await check(`${roleName}/${taskClass}: exact stdin, argv, request, terminal closure and single consumption`, async () => {
        const role = roles[roleName]; const target = targetFor(preparation, roleName, taskClass); assert.ok(target);
        const nativeCase = role.scope.source.bindings.find((binding) => binding.successor_case_id === target.case_id).source_case_id;
        const record = materialized.cases.find((entry) => entry.case_id === nativeCase);
        const taskRecord = record.agent_visible_files.find((entry) => entry.path === "BENCHMARK_TASK.md");
        const task = readFileSync(resolve(materializedPath, nativeCase, "BENCHMARK_TASK.md"));
        const expected = consumeSuccessorPromptInput(await input(role, target), { caseId: target.case_id, taskBytes: task, expectedTaskDigest: `sha256:${taskRecord.sha256}` });
        assert.deepEqual(expected.stdin, independentStdin(preparation, target, task));
        const handle = await input(role, target); const args = argsFor(role, target, handle); const before = nativeCaptureIds(captures);
        const result = success.invoke(() => executePortfolio(args));
        assert.deepEqual(result.outcomes, [{ case_id: nativeCase, status: "completed" }]);
        const capture = nativeCapture(captures, before); const { inspection, attempt } = observed(role, nativeCase);
        assert.deepEqual(capture.stdin, expected.stdin, "actual C-process stdin matches the independently composed frozen bytes");
        const [cwd, codexHome, mode] = capture.meta; assert.equal(mode, "success");
        const output = capture.argv[capture.argv.indexOf("--output-last-message") + 1];
        assert.equal(output, resolve(dirname(cwd), "agent-final.json"));
        const identity = inspection.adapter_identities.get("codex");
        assert.deepEqual(capture.argv, identity.effective_command.argv.map((part) => part.replaceAll("{output}", output).replaceAll("{output_schema}", resolve(root, "benchmarks/schemas/agent-output.schema.json"))));
        assert.equal(capture.argv.filter((arg) => arg === "sandbox_workspace_write.network_access=false").length, 1);
        assert.equal(identity.case_timeout_ms, 900000, "successor's unchanged timeout is passed to the real runner");
        assert.deepEqual(attempt.request.projection, successorInputProjection(expected.binding));
        assert.equal(attempt.result.request_sha256, attempt.evidence.request_digest);
        assert.equal(attempt.commit.result_sha256, attempt.evidence.result_digest);
        assert.equal(attempt.result.terminal_workspace_authority_availability, "captured");
        assert.ok(attempt.terminalWorkspaceAuthority);
        assert.equal(existsSync(cwd), false, "runner's temporary workspace is gone");
        assert.equal(existsSync(codexHome), false, "runner's isolated fake home is gone");
        const count = nativeCaptureIds(captures).length;
        assert.throws(() => success.invoke(() => executePortfolio(args)), { code: "SUCCESSOR_UNVERIFIED_PROMPT_SOURCE" });
        assert.equal(nativeCaptureIds(captures).length, count, "consumed handle cannot spawn a duplicate process");
        const newHandle = await input(role, target);
        assert.throws(() => success.invoke(() => executePortfolio({ ...args, successorPromptInput: newHandle, retryFailed: true })));
        assert.equal(nativeCaptureIds(captures).length, count, "forbidden retry is rejected before spawn");
        assert.equal(observed(role, nativeCase).record.attempts.length, 1);
        evidence.native_attempts.push({ successor_case_id: target.case_id, role: roleName, task_class: taskClass,
          native_run_instance_id: inspection.identity.run_instance_id, native_case_id: nativeCase,
          capture_id: capture.id, stdin_digest: hash(capture.stdin), argv_digest: canonicalDigest(capture.argv),
          request_digest: attempt.evidence.request_digest, result_digest: attempt.evidence.result_digest,
          terminal_commit_digest: attempt.evidence.commit_digest, terminal_workspace_digest: attempt.evidence.terminal_workspace_authority_digest });
      });
    }
    await check("real normalization preserves the partial inventory and native run/attempt bindings", () => {
      for (const role of Object.values(roles)) {
        const outputPath = resolve(role.scenario.directory, `${role.scope.prompt_role}-normalized`);
        const normalized = normalizePortfolioExecution({ ...role.execution, outputPath });
        const verified = verifyNormalizedPortfolioResults({ ...role.execution, outputPath });
        assert.equal(verified.freshness, "current");
        assert.equal(verified.manifest.source.run_instance_id, role.prepared.run_instance_id);
        assert.equal(verified.manifest.completeness.terminal_cases, 2);
        assert.equal(verified.manifest.completeness.partial, true, "unexecuted cases are not fabricated complete");
        for (const entry of verified.manifest.inventory) {
          const row = json(resolve(verified.generationPath, entry.path));
          const actual = observed(role, row.lineage.case_id).attempt;
          assert.equal(row.lineage.request_digest, actual.evidence.request_digest);
          assert.equal(row.lineage.raw_result_digest, actual.evidence.result_digest);
          assert.equal(row.lineage.terminal_commit_digest, actual.evidence.commit_digest);
        }
        assert.ok(normalized.sourceSnapshotDigest);
      }
    });
    await check("forged handles, cross-case invocation and retries cannot start a process", async () => {
      const role = roles.current_prompt; const target = preparation.cases.find((entry) => entry.prompt_role === "current_prompt" && entry.repetition === 2);
      const handle = await input(role, target); const args = argsFor(role, target, handle); const before = nativeCaptureIds(captures);
      for (const override of [{ successorPromptInput: {} }, { caseId: "case-0000000000000000-0000000000000000" }, { maxCases: 2 }, { retryFailed: true }]) {
        assert.throws(() => success.invoke(() => executePortfolio({ ...args, ...override })));
      }
      assert.deepEqual(nativeCaptureIds(captures), before);
    });
    await check("a failing native fake stays failed, keeps terminal evidence and cannot be silently retried", async () => {
      const s = scenario("failure"); const prep = prepare(s); const role = prepareRole(s, prep, "current_prompt", randomUUID());
      const target = targetFor(prep, "current_prompt", "implementation"); const handle = await input(role, target); const args = argsFor(role, target, handle);
      const before = nativeCaptureIds(captures); const result = s.invoke(() => executePortfolio(args));
      assert.deepEqual(result.outcomes, [{ case_id: args.caseId, status: "failed" }]);
      nativeCapture(captures, before); const actual = observed(role, args.caseId).attempt;
      assert.equal(actual.result.exit_code, 7); assert.equal(actual.result.final_output, null);
      assert.equal(actual.result.failure_kind, "agent_failure"); assert.equal(actual.commit.status, "failed");
      assert.equal(actual.result.terminal_workspace_authority_availability, "captured", "a cleanly terminated failing agent retains workspace evidence");
      assert.ok(actual.terminalWorkspaceAuthority);
      const count = nativeCaptureIds(captures).length;
      assert.throws(() => s.invoke(() => executePortfolio({ ...args, successorPromptInput: handle })));
      assert.equal(nativeCaptureIds(captures).length, count);
    });
    await check("a residual descendant is terminated and invalidates successor terminal-workspace evidence", async () => {
      const s = scenario("residual"); const prep = prepare(s); const role = prepareRole(s, prep, "current_prompt", randomUUID());
      const target = targetFor(prep, "current_prompt", "implementation"); const args = argsFor(role, target, await input(role, target));
      const before = nativeCaptureIds(captures); const result = s.invoke(() => executePortfolio(args));
      const capture = nativeCapture(captures, before);
      const pid = Number(readFileSync(resolve(captures, `${capture.id}.child`), "utf8").trim());
      assertTerminatedChild(pid, "residual");
      assert.deepEqual(result.outcomes, [{ case_id: args.caseId, status: "invalid" }]);
      const actual = observed(role, args.caseId).attempt;
      assert.equal(actual.result.final_output, null); assert.equal(actual.result.terminal_workspace_authority_availability, "unavailable");
      for (const field of ["terminal_workspace_authority_path", "terminal_workspace_authority_sha256", "terminal_workspace_authority_bytes", "terminal_workspace_authority_digest", "terminal_workspace_tree_digest"]) {
        assert.equal(actual.result[field], null, `invalid result must not retain ${field}`);
        assert.equal(actual.commit[field], null, `invalid commit must not retain ${field}`);
      }
      assert.equal(actual.terminalWorkspaceAuthority, null);
      const attemptPath = resolve(role.execution.runDir, "cases", args.caseId, "attempts", "0001");
      assert.equal(existsSync(resolve(attemptPath, "terminal-workspace-authority.json")), false, "catch must not publish workspace authority after residual cleanup fails");
      assert.equal(existsSync(capture.meta[0]), false);
    });
    await check("the same contained-runner timeout path rejects a hanging native fake (ordinary-path control)", () => {
      // Deliberately ordinary path: do not weaken the successor's frozen 900000ms
      // contract to shorten this test or claim we waited for its full deadline.
      const s = scenario("timeout", 1200); const nativeCase = plan.cases.find((entry) => entry.adapter_track === "codex" && entry.condition === "full_ask").case_id;
      const execution = { ...common, runDir: resolve(s.directory, "ordinary-control") };
      const before = nativeCaptureIds(captures);
      const result = s.invoke(() => executePortfolio({ ...execution, adapter: "codex", runtimeConfigPath: s.runtimeConfigPath, agentBin, caseId: nativeCase, maxCases: 1 }));
      const capture = nativeCapture(captures, before);
      assert.deepEqual(result.outcomes, [{ case_id: nativeCase, status: "failed" }]);
      const actual = inspectVerifiedPortfolioExecution(execution).cases.find((entry) => entry.entry.case_id === nativeCase).attempts[0];
      assert.equal(actual.result.failure_kind, "timeout"); assert.equal(actual.result.final_output, null);
      assert.equal(actual.result.terminal_workspace_authority_availability, "captured", "a cleanly terminated timeout retains workspace evidence");
      assert.ok(actual.terminalWorkspaceAuthority);
      const pid = Number(readFileSync(resolve(captures, `${capture.id}.child`), "utf8").trim());
      assertTerminatedChild(pid, "timeout"); assert.equal(existsSync(capture.meta[0]), false);
      evidence.timeout_limit = { observed_path: "shared_runner_ordinary_control", observed_timeout_ms: 1200, successor_deadline_ms: 900000, successor_full_deadline_elapsed: false };
    });
  } finally {
    evidence.final_status = git("status", "--porcelain", "--untracked-files=normal");
    evidence.final_revision = git("rev-parse", "HEAD");
    evidence.completed = evidence.checks.length === 10 && evidence.checks.every((entry) => entry.status === "pass");
    writeFileSync(resolve(work, "verification.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
    t.diagnostic(`Evidence: ${resolve(work, "verification.json")}`);
    assert.equal(evidence.final_status, "", "test must not mutate the candidate");
    assert.equal(evidence.final_revision, implementation.revision);
  }
});
