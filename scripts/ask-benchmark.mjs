#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = resolve(ROOT, "benchmarks/checkpoint-b.config.json");
const OUTPUT_SCHEMA_PATH = resolve(ROOT, "benchmarks/schemas/agent-output.schema.json");
const CONDITIONS = ["plain", "kernel_only", "full_ask"];
const PORTFOLIO_SCHEMA_VERSION = "3.0.0";
const PORTFOLIO_CONDITIONS = ["plain", "kernel_only", "adaptive_ask", "full_ask"];
const PORTFOLIO_CONDITION_ROLES = ["context_baseline", "default_product", "primary_product", "diagnostic_maximum"];
const PORTFOLIO_ADAPTER_TRACKS = ["codex", "claude"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const command = argv.shift();
  const args = { command, output: null, runDir: null, seed: null, agentBin: "codex", configPath: DEFAULT_CONFIG_PATH };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--output") args.output = resolve(argv.shift());
    else if (flag === "--run-dir") args.runDir = resolve(argv.shift());
    else if (flag === "--seed") args.seed = argv.shift();
    else if (flag === "--agent-bin") args.agentBin = resolve(argv.shift());
    else if (flag === "--config") args.configPath = resolve(argv.shift());
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-benchmark.mjs <command> [options]

Commands:
  validate [--config <config.json>]
  plan --config <portfolio-config.json> --output <execution-plan.json> --seed <value>
  prepare [--config <config.json>] --output <empty-directory> --seed <value>
  run [--config <config.json>] --run-dir <prepared-directory> --agent-bin <codex-path>
  score [--config <config.json>] --run-dir <completed-directory> --output <normalized-result.json>
`);
}

function resolveRepoPath(value, label) {
  const path = resolve(ROOT, value);
  if (path !== ROOT && !path.startsWith(`${ROOT}${sep}`)) throw new Error(`${label} must stay inside the repository`);
  return path;
}

function fixtureRoot(config) {
  return resolveRepoPath(config.fixture_root ?? "benchmarks/fixtures", "fixture_root");
}

function fixtureFile(config, fixture, value) {
  return resolve(fixtureRoot(config), fixture.id, value);
}

function git(cwd, args, options = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function equalOrderedValues(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function validatePortfolioFoundation(config, canonicalConfigPath) {
  const errors = [];
  const configSchemaPath = resolve(dirname(canonicalConfigPath), config.$schema ?? "");
  if (config.$schema !== "./schemas/portfolio-config.schema.json" || !existsSync(configSchemaPath)) errors.push("portfolio config schema must resolve to benchmarks/schemas/portfolio-config.schema.json");
  if (config.program !== "adaptive_ask_portfolio") errors.push("portfolio program must be adaptive_ask_portfolio");
  if (!["foundation", "frozen"].includes(config.protocol_status)) errors.push("portfolio protocol_status must be foundation or frozen");

  const conditionIds = Array.isArray(config.conditions) ? config.conditions.map((entry) => entry.id) : [];
  const conditionRoles = Array.isArray(config.conditions) ? config.conditions.map((entry) => entry.role) : [];
  if (!equalOrderedValues(conditionIds, PORTFOLIO_CONDITIONS)) errors.push("portfolio conditions must be plain, kernel_only, adaptive_ask, full_ask");
  if (!equalOrderedValues(conditionRoles, PORTFOLIO_CONDITION_ROLES)) errors.push("portfolio condition roles must preserve baseline, default, primary, and diagnostic semantics");
  if (!Array.isArray(config.conditions) || config.conditions.some((entry) => typeof entry.instruction_surface !== "string" || entry.instruction_surface.trim() === "")) errors.push("portfolio conditions require non-empty instruction_surface values");

  const adapterTracks = Array.isArray(config.adapter_tracks) ? config.adapter_tracks.map((entry) => entry.id) : [];
  if (!equalOrderedValues(adapterTracks, PORTFOLIO_ADAPTER_TRACKS)) errors.push("portfolio adapter tracks must be codex and claude in separate tracks");
  if (config.pool_adapter_results !== false) errors.push("portfolio adapter results must not be pooled");
  if (!Array.isArray(config.adapter_tracks) || config.adapter_tracks.some((entry) => !["unverified", "available", "unavailable"].includes(entry.runtime_status))) errors.push("portfolio adapter runtime_status must be explicit");

  if (!Array.isArray(config.fixtures) || config.fixtures.length === 0) errors.push("portfolio fixtures are required");
  const fixtureIds = (config.fixtures ?? []).map((fixture) => fixture.id);
  if (new Set(fixtureIds).size !== fixtureIds.length) errors.push("portfolio fixture ids must be unique");
  const inputManifests = new Map();
  for (const fixture of config.fixtures ?? []) {
    if (![3, 5].includes(fixture.repetitions)) errors.push(`${fixture.id} repetitions must be 3 or 5`);
    if (fixture.aggregate_eligible !== (fixture.suite !== "calibration")) errors.push(`${fixture.id} aggregate eligibility must exclude calibration only`);
    if (fixture.id === "impl-transfer-hard" && fixture.suite === "calibration" && fixture.repetitions !== 5) errors.push("concurrent transfer calibration requires 5 repetitions");
    const root = resolve(fixtureRoot(config), fixture.id);
    for (const path of ["task.md", "workspace/package.json", "evaluator/expected.json"]) {
      if (!existsSync(resolve(root, path))) errors.push(`${fixture.id}/${path} is missing`);
    }
    if (!fixture.input_manifest_path) {
      errors.push(`${fixture.id} input_manifest_path is required`);
      continue;
    }
    const manifestPath = resolveRepoPath(fixture.input_manifest_path, `${fixture.id} input manifest`);
    if (!existsSync(manifestPath)) {
      errors.push(`${fixture.id} input manifest is missing: ${fixture.input_manifest_path}`);
      continue;
    }
    const actualDigest = sha256(readFileSync(manifestPath));
    if (actualDigest !== fixture.input_manifest_sha256) errors.push(`${fixture.id} input manifest digest does not match`);
    if (!inputManifests.has(manifestPath)) inputManifests.set(manifestPath, readJson(manifestPath));
    if (!inputManifests.get(manifestPath).fixtures?.[fixture.id]) errors.push(`${fixture.id} is absent from its input manifest`);
  }

  if (config.ordering?.strategy !== "seeded_balanced_rotation" || config.ordering?.condition_count !== PORTFOLIO_CONDITIONS.length) errors.push("portfolio ordering must use four-condition seeded_balanced_rotation");
  if (config.execution_plan?.schema_version !== "1.0.0" || !config.execution_plan?.schema_path) errors.push("portfolio execution plan schema version and path are required");
  else {
    const planSchemaPath = resolveRepoPath(config.execution_plan.schema_path, "execution plan schema");
    if (!existsSync(planSchemaPath)) errors.push(`execution plan schema is missing: ${config.execution_plan.schema_path}`);
    else {
      const planSchema = readJson(planSchemaPath);
      const requiredCaseFields = ["case_id", "block_id", "adapter_track", "fixture_id", "suite", "repetition", "registered_repetitions", "condition", "condition_order_position", "input_manifest_sha256"];
      if (planSchema.properties?.schema_version?.const !== config.execution_plan.schema_version || requiredCaseFields.some((field) => !planSchema.properties?.cases?.items?.required?.includes(field))) errors.push("execution plan schema does not match the configured case contract");
    }
  }
  if (config.adaptive_selection?.must_precede_result !== true || config.adaptive_selection?.digest_algorithm !== "sha256") errors.push("Adaptive selection must be sealed with SHA-256 before the result");
  if (config.adaptive_selection?.schema_path) {
    const selectionPath = resolveRepoPath(config.adaptive_selection.schema_path, "adaptive selection schema");
    if (!existsSync(selectionPath)) errors.push(`Adaptive selection schema is missing: ${config.adaptive_selection.schema_path}`);
    else {
      const selectionSchema = readJson(selectionPath);
      const required = ["task_class", "observed_signals", "selected_mechanisms", "skipped_mechanisms", "required_gates", "agents", "expected_evidence", "capability_downgrades", "lightweight_bypass", "projection", "selected_at", "selection_digest"];
      if (selectionSchema.additionalProperties !== false || required.some((field) => !selectionSchema.required?.includes(field))) errors.push("Adaptive selection schema is missing required pre-result fields or permits undeclared fields");
      if (["result", "score", "correctness", "recommendation", "completion_claim"].some((field) => Object.hasOwn(selectionSchema.properties ?? {}, field))) errors.push("Adaptive selection schema must not contain outcome fields");
    }
  } else errors.push("Adaptive selection schema_path is required");

  const privacy = config.privacy ?? {};
  if (["store_raw_prompts", "store_full_outputs", "store_full_event_streams", "store_full_source", "store_secrets_customer_or_personal_data"].some((field) => privacy[field] !== false)) errors.push("portfolio durable raw or sensitive capture must be explicitly disabled");
  if (typeof config.protocol_path !== "string" || config.protocol_path.trim() === "") errors.push("portfolio protocol_path is required");
  const protocolPath = resolveRepoPath(config.protocol_path ?? "", "protocol_path");
  if (!existsSync(protocolPath) || protocolPath === ROOT) errors.push(`protocol is missing: ${relative(ROOT, protocolPath)}`);
  const inputVerifier = resolve(fixtureRoot(config), "verify-inputs.mjs");
  if (existsSync(inputVerifier)) {
    const verified = spawnSync(process.execPath, [inputVerifier], { cwd: fixtureRoot(config), encoding: "utf8" });
    if (verified.status !== 0) errors.push(`agent-visible input verification failed: ${verified.stderr || verified.stdout}`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return { ...config, _kind: "portfolio", _configPath: canonicalConfigPath, _protocolPath: protocolPath };
}

function validateProtocol(configPath = DEFAULT_CONFIG_PATH) {
  const canonicalConfigPath = resolveRepoPath(relative(ROOT, configPath), "config");
  const config = readJson(canonicalConfigPath);
  if (config.schema_version === PORTFOLIO_SCHEMA_VERSION) return validatePortfolioFoundation(config, canonicalConfigPath);
  const outputSchema = readJson(OUTPUT_SCHEMA_PATH);
  const errors = [];
  if (config.protocol_status !== "frozen") errors.push("protocol_status must be frozen before execution");
  if (JSON.stringify(config.conditions) !== JSON.stringify(CONDITIONS)) errors.push("conditions must be plain, kernel_only, full_ask");
  if (!Array.isArray(config.fixtures) || config.fixtures.length < 2 || !config.fixtures.some((entry) => entry.task_class === "review") || !config.fixtures.some((entry) => entry.task_class === "implementation")) errors.push("review and implementation fixtures are required");
  if (!Number.isInteger(config.repetitions ?? 1) || (config.repetitions ?? 1) < 1) errors.push("repetitions must be a positive integer");
  if (config.thresholds.allow_expand_with_primary_metrics_unknown !== false) errors.push("expand must be prohibited when primary metrics are unknown");
  if (config.privacy.store_raw_prompts || config.privacy.store_full_outputs || config.privacy.store_full_source || config.privacy.store_secrets_customer_or_personal_data) errors.push("durable raw or sensitive capture must be disabled");
  if (!outputSchema.required?.includes("route") || !outputSchema.required?.includes("verification_commands")) errors.push("agent output schema must require route and verification evidence fields");
  if (JSON.stringify(outputSchema).includes('"oneOf"')) errors.push("agent output schema must avoid response-format-unsupported oneOf");
  if (config.checkpoint === "C") {
    const attribution = config.attribution;
    if (!attribution) errors.push("Checkpoint C requires attribution metadata");
    else {
      if (attribution.model?.current !== config.runtime.model) errors.push("Checkpoint C model attribution must match runtime.model");
      if (attribution.cli?.current !== config.runtime.agent_version) errors.push("Checkpoint C CLI attribution must match runtime.agent_version");
      if (attribution.repository?.fixture_inputs_changed !== false) errors.push("Checkpoint C must explicitly preserve frozen fixture inputs");
      for (const [pathValue, expectedHash, label] of [
        [attribution.baseline_result_path, null, "baseline result"],
        [attribution.fixture_manifest_path, attribution.fixture_manifest_sha256, "fixture manifest"],
        [attribution.adapter?.runtime_bundle_path, attribution.adapter?.runtime_bundle_sha256, "adapter runtime bundle"],
      ]) {
        if (!pathValue) {
          errors.push(`Checkpoint C ${label} path is required`);
          continue;
        }
        const path = resolveRepoPath(pathValue, label);
        if (!existsSync(path)) errors.push(`Checkpoint C ${label} is missing: ${pathValue}`);
        else if (expectedHash && sha256(readFileSync(path)) !== expectedHash) errors.push(`Checkpoint C ${label} digest does not match: ${pathValue}`);
      }
    }
  }
  const protocolPath = resolveRepoPath(config.protocol_path ?? "benchmarks/protocol.md", "protocol_path");
  if (!existsSync(protocolPath)) errors.push(`protocol is missing: ${relative(ROOT, protocolPath)}`);
  for (const fixture of config.fixtures) {
    const root = resolve(fixtureRoot(config), fixture.id);
    const expectedPath = fixture.expected_path ?? "expected.json";
    for (const path of ["task.md", expectedPath, "workspace/package.json"]) {
      if (!existsSync(resolve(root, path))) errors.push(`${fixture.id}/${path} is missing`);
    }
    if (fixture.task_class === "review") {
      const reviewSource = fixture.review_source ?? "candidate_patch";
      const reviewPath = reviewSource === "embedded_diff" ? "workspace/pr.diff" : "candidate.patch";
      if (!existsSync(resolve(root, reviewPath))) errors.push(`${fixture.id}/${reviewPath} is missing`);
      if (existsSync(resolve(root, expectedPath))) {
        const expected = readJson(resolve(root, expectedPath));
        if (Array.isArray(expected.findings) && expected.findings.some((entry) => !Array.isArray(entry.match_terms) || entry.match_terms.length < 2)) errors.push(`${fixture.id} review findings require at least two frozen match_terms`);
      }
    }
    if (fixture.task_class === "implementation") {
      const hiddenPath = fixture.hidden_tests_path ?? "hidden-tests.mjs";
      if (!existsSync(resolve(root, hiddenPath))) errors.push(`${fixture.id}/${hiddenPath} is missing`);
      if (existsSync(resolve(root, expectedPath))) {
        const expected = readJson(resolve(root, expectedPath));
        if (Array.isArray(expected.requirements) && expected.requirements.some((entry) => !Array.isArray(entry.hidden_tests) || entry.hidden_tests.length === 0)) errors.push(`${fixture.id} requirements must map to hidden tests`);
      }
    }
  }
  const inputVerifier = resolve(fixtureRoot(config), "verify-inputs.mjs");
  if (existsSync(inputVerifier)) {
    const verified = spawnSync(process.execPath, [inputVerifier], { cwd: fixtureRoot(config), encoding: "utf8" });
    if (verified.status !== 0) errors.push(`agent-visible input verification failed: ${verified.stderr || verified.stdout}`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return { ...config, _kind: "legacy", _configPath: canonicalConfigPath, _protocolPath: protocolPath };
}

function ensureEmptyDirectory(path) {
  if (existsSync(path) && (!statSync(path).isDirectory() || readdirSync(path).length > 0)) throw new Error(`output must be an empty directory: ${path}`);
  mkdirSync(path, { recursive: true });
}

function projectCondition(target, condition) {
  if (condition === "plain") return;
  if (condition === "kernel_only") {
    copyFileSync(resolve(ROOT, "AGENTS.md"), resolve(target, "AGENTS.md"));
    return;
  }
  const result = spawnSync(process.execPath, [resolve(ROOT, "scripts/install-kernel.mjs"), "--target", target, "--merge-agents"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Full ASK projection failed: ${result.stderr || result.stdout}`);
  const adapter = spawnSync(process.execPath, [resolve(ROOT, "scripts/install-codex-adapter.mjs"), "--target", target, "--profile", "full"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (adapter.status !== 0) throw new Error(`Full ASK Codex projection failed: ${adapter.stderr || adapter.stdout}`);
}

function requireLegacyConfig(config, command) {
  if (config._kind !== "legacy") throw new Error(`${command} does not yet execute portfolio configs; use plan until the materialization slice is implemented`);
}

function balancedConditionOrder(seed, adapterTrack, fixtureId, repetition) {
  const base = [...PORTFOLIO_CONDITIONS].sort((left, right) => sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${left}`).localeCompare(sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${right}`)));
  const shift = (repetition - 1) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

function planPortfolio(args) {
  const config = validateProtocol(args.configPath);
  if (config._kind !== "portfolio") throw new Error("plan requires an Adaptive portfolio config");
  if (!args.output || !args.seed) throw new Error("plan requires --output and --seed");
  const blocks = [];
  for (const adapter of config.adapter_tracks) {
    for (const fixture of config.fixtures) {
      for (let repetition = 1; repetition <= fixture.repetitions; repetition += 1) {
        const blockId = `block-${sha256(`${args.seed}:${adapter.id}:${fixture.id}:${repetition}`).slice(0, 12)}`;
        const orderedConditions = balancedConditionOrder(args.seed, adapter.id, fixture.id, repetition);
        const cases = orderedConditions.map((condition, index) => ({
          case_id: `case-${sha256(`${args.seed}:${adapter.id}:${fixture.id}:${repetition}:${condition}`).slice(0, 16)}`,
          block_id: blockId,
          adapter_track: adapter.id,
          fixture_id: fixture.id,
          suite: fixture.suite,
          task_class: fixture.task_class,
          difficulty: fixture.difficulty,
          aggregate_eligible: fixture.aggregate_eligible,
          repetition,
          registered_repetitions: fixture.repetitions,
          condition,
          condition_order_position: index + 1,
          input_manifest_path: fixture.input_manifest_path,
          input_manifest_sha256: fixture.input_manifest_sha256,
        }));
        blocks.push({ order_key: sha256(`${args.seed}:block-order:${adapter.id}:${fixture.id}:${repetition}`), cases });
      }
    }
  }
  blocks.sort((left, right) => left.order_key.localeCompare(right.order_key));
  const plan = {
    schema_version: "1.0.0",
    schema_path: config.execution_plan.schema_path,
    program: config.program,
    protocol_path: relative(ROOT, config._protocolPath),
    protocol_sha256: sha256(readFileSync(config._protocolPath)),
    config_path: relative(ROOT, config._configPath),
    config_sha256: sha256(readFileSync(config._configPath)),
    repository_revision: git(ROOT, ["rev-parse", "HEAD"]),
    seed_sha256: sha256(args.seed),
    ordering_strategy: config.ordering.strategy,
    conditions: config.conditions.map((entry) => entry.id),
    adapter_tracks: config.adapter_tracks.map((entry) => ({ id: entry.id, runtime_status: entry.runtime_status })),
    pool_adapter_results: config.pool_adapter_results,
    cases: blocks.flatMap((block) => block.cases),
  };
  writeJson(args.output, plan);
  console.log(`Wrote deterministic portfolio plan with ${plan.cases.length} cases to ${args.output}`);
}

function prepare(args) {
  const config = validateProtocol(args.configPath);
  requireLegacyConfig(config, "prepare");
  if (!args.output || !args.seed) throw new Error("prepare requires --output and --seed");
  ensureEmptyDirectory(args.output);
  const cases = [];
  for (const fixture of config.fixtures) {
    for (let repetition = 1; repetition <= (config.repetitions ?? 1); repetition += 1) {
      for (const condition of CONDITIONS) {
        const caseId = `case-${sha256(`${args.seed}:${fixture.id}:${repetition}:${condition}`).slice(0, 12)}`;
        const target = resolve(args.output, caseId);
        const nested = fixture.layout === "nested";
        const workspace = nested ? resolve(target, "workspace") : target;
        mkdirSync(target, { recursive: true });
        cpSync(fixtureFile(config, fixture, "workspace"), workspace, { recursive: true });
        copyFileSync(fixtureFile(config, fixture, "task.md"), resolve(target, "BENCHMARK_TASK.md"));
        projectCondition(target, condition);
        git(workspace, ["init", "-q"]);
        git(workspace, ["config", "user.name", "ASK Benchmark"]);
        git(workspace, ["config", "user.email", "benchmark.invalid@example.invalid"]);
        git(workspace, ["add", "-A"]);
        git(workspace, ["commit", "-q", "-m", "benchmark baseline"]);
        if (fixture.task_class === "review" && (fixture.review_source ?? "candidate_patch") === "candidate_patch") git(workspace, ["apply", fixtureFile(config, fixture, "candidate.patch")]);
        cases.push({
          case_id: caseId,
          fixture_id: fixture.id,
          task_class: fixture.task_class,
          difficulty: fixture.difficulty ?? null,
          repetition,
          sandbox: fixture.sandbox,
          condition,
          workspace_subdir: nested ? "workspace" : null,
          expected_path: fixture.expected_path ?? "expected.json",
          hidden_tests_path: fixture.hidden_tests_path ?? (fixture.task_class === "implementation" ? "hidden-tests.mjs" : null),
          order_key: sha256(`${args.seed}:order:${caseId}`),
        });
      }
    }
  }
  cases.sort((left, right) => left.order_key.localeCompare(right.order_key));
  writeJson(resolve(args.output, "run.json"), {
    schema_version: "1.0.0",
    checkpoint: config.checkpoint,
    seed_sha256: sha256(args.seed),
    protocol_path: relative(ROOT, config._protocolPath),
    protocol_sha256: sha256(readFileSync(config._protocolPath)),
    config_path: relative(ROOT, config._configPath),
    config_sha256: sha256(readFileSync(config._configPath)),
    repository_revision: git(ROOT, ["rev-parse", "HEAD"]),
    cases,
  });
  console.log(`Prepared ${cases.length} blinded cases in ${args.output}`);
}

function isolatedCodexHome() {
  const sourceHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : resolve(process.env.HOME, ".codex");
  const authPath = resolve(sourceHome, "auth.json");
  if (!existsSync(authPath)) throw new Error(`Codex auth is unavailable: ${authPath}`);
  const home = mkdtempSync(resolve(tmpdir(), "ask-benchmark-codex-home-"));
  chmodSync(home, 0o700);
  symlinkSync(authPath, resolve(home, "auth.json"));
  return home;
}

function tokenUsageFromJsonl(text) {
  let input = null;
  let output = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const queue = [event];
    while (queue.length > 0) {
      const value = queue.pop();
      if (!value || typeof value !== "object") continue;
      for (const [key, item] of Object.entries(value)) {
        if (["input_tokens", "inputTokens"].includes(key) && Number.isFinite(item)) input = Math.max(input ?? 0, item);
        else if (["output_tokens", "outputTokens"].includes(key) && Number.isFinite(item)) output = Math.max(output ?? 0, item);
        else if (typeof item === "object") queue.push(item);
      }
    }
  }
  return { input_tokens: input, output_tokens: output };
}

function executeCases(args) {
  const config = validateProtocol(args.configPath);
  requireLegacyConfig(config, "run");
  if (!args.runDir || !existsSync(resolve(args.runDir, "run.json"))) throw new Error("run requires a prepared --run-dir");
  if (!existsSync(args.agentBin) || !lstatSync(args.agentBin).isFile()) throw new Error(`agent binary is unavailable: ${args.agentBin}`);
  const manifest = readJson(resolve(args.runDir, "run.json"));
  if (manifest.checkpoint !== config.checkpoint || manifest.config_sha256 !== sha256(readFileSync(config._configPath))) throw new Error("run manifest does not match the selected frozen config");
  const version = spawnSync(args.agentBin, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) throw new Error(`agent version check failed: ${version.stderr || version.stdout}`);
  const observedVersion = version.stdout.trim();
  if (!observedVersion.includes(config.runtime.agent_version)) throw new Error(`agent version mismatch: expected ${config.runtime.agent_version}, received ${observedVersion}`);
  manifest.runtime_observation = { agent_version: observedVersion };
  writeJson(resolve(args.runDir, "run.json"), manifest);
  const codexHome = isolatedCodexHome();
  try {
    for (const entry of manifest.cases) {
      const target = resolve(args.runDir, entry.case_id);
      const finalPath = resolve(target, ".benchmark-final.json");
      const runPath = resolve(target, ".benchmark-run.json");
      if (existsSync(runPath)) continue;
      const prompt = readFileSync(resolve(target, "BENCHMARK_TASK.md"), "utf8");
      const commandArgs = [
        "exec",
        ...(entry.workspace_subdir ? ["--skip-git-repo-check"] : []),
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--model", config.runtime.model,
        "-c", `model_reasoning_effort=\"${config.runtime.reasoning_effort}\"`,
        "--sandbox", entry.sandbox,
        "--output-schema", OUTPUT_SCHEMA_PATH,
        "--output-last-message", finalPath,
        "--json",
        "-",
      ];
      const started = process.hrtime.bigint();
      const result = spawnSync(args.agentBin, commandArgs, {
        cwd: target,
        encoding: "utf8",
        input: prompt,
        env: { ...process.env, CODEX_HOME: codexHome },
        maxBuffer: 50 * 1024 * 1024,
        timeout: config.runtime.case_timeout_ms,
      });
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const output = existsSync(finalPath) ? readFileSync(finalPath) : Buffer.from("");
      const usage = tokenUsageFromJsonl(result.stdout ?? "");
      writeJson(runPath, {
        exit_code: result.status,
        duration_ms: Math.round(durationMs),
        ...usage,
        output_sha256: output.length > 0 ? sha256(output) : null,
        output_bytes: output.length,
        runtime_error: result.error?.code === "ETIMEDOUT" ? "case_timeout" : result.error ? "agent_process_failed" : result.status === 0 ? null : "agent_nonzero_exit",
      });
      writeFileSync(resolve(target, ".benchmark-events.jsonl"), result.stdout ?? "");
      writeFileSync(resolve(target, ".benchmark-stderr.txt"), result.stderr ?? "");
      console.log(`${entry.case_id}: ${result.status === 0 ? "completed" : `failed (${result.status})`}`);
    }
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
}

function parseFinal(path) {
  if (!existsSync(path)) return null;
  try { return readJson(path); } catch { return null; }
}

function normalizeFindingPath(value) {
  return String(value ?? "").replace(/^\.\//, "").replace(/^workspace\//, "");
}

function reviewOracles(expected) {
  if (Array.isArray(expected.major_findings)) {
    return expected.major_findings.map((entry) => ({ id: entry.id, files: [entry.file], terms: entry.terms }));
  }
  return (expected.findings ?? []).map((entry) => ({
    id: entry.id,
    files: (entry.evidence ?? []).map((evidence) => evidence.file),
    terms: entry.match_terms,
  }));
}

function reviewMetrics(final, expected) {
  const findings = Array.isArray(final?.findings) ? final.findings.filter((entry) => ["blocking", "major"].includes(entry.severity)) : [];
  const oracles = reviewOracles(expected);
  const matched = new Set();
  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    const text = `${finding.summary ?? ""} ${finding.evidence ?? ""}`.toLowerCase();
    for (const oracle of oracles) {
      const termCount = oracle.terms.filter((term) => text.includes(term.toLowerCase())).length;
      const fileMatches = oracle.files.map(normalizeFindingPath).includes(normalizeFindingPath(finding.file));
      if (fileMatches && termCount >= 2 && ![...matched].some((value) => value.endsWith(`:${oracle.id}`))) {
        matched.add(`${index}:${oracle.id}`);
        break;
      }
    }
  }
  const validIndexes = new Set([...matched].map((value) => Number(value.split(":")[0])));
  const falsePositives = findings.filter((_, index) => !validIndexes.has(index)).length;
  const missed = oracles.length - matched.size;
  return {
    valid_blocking_or_major_findings: matched.size,
    major_findings_missed: missed,
    unsupported_or_false_positive_findings: falsePositives,
    merge_decision_correct: expected.merge_decision ? ["request_changes", "block"].includes(final?.decision) : null,
    requirement_satisfaction_rate: null,
    scope_deviations: 0,
    automated_correction_units: missed + falsePositives,
  };
}

function testSummary(result) {
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const pass = text.match(/# pass (\d+)/);
  const fail = text.match(/# fail (\d+)/);
  const passedNames = [...text.matchAll(/^ok \d+ - (.+?)(?: #.*)?$/gm)].map((match) => match[1].trim());
  const failedNames = [...text.matchAll(/^not ok \d+ - (.+?)(?: #.*)?$/gm)].map((match) => match[1].trim());
  return { passed: pass ? Number(pass[1]) : null, failed: fail ? Number(fail[1]) : null, passed_names: passedNames, failed_names: failedNames, exit_code: result.status };
}

function globMatches(path, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "::DOUBLE_STAR::").replace(/\*/g, "[^/]*").replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function implementationMetrics(caseRoot, workspace, expected, hiddenTestsPath) {
  const hidden = spawnSync(process.execPath, [hiddenTestsPath, workspace], { cwd: caseRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const summary = testSummary(hidden);
  const tracked = git(workspace, ["diff", "--name-only", "HEAD", "--"]).split("\n").filter(Boolean);
  const untracked = git(workspace, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  const changed = [...new Set([...tracked, ...untracked])].filter((path) => !path.startsWith(".benchmark-"));
  const allowedPatterns = expected.allowed_paths ?? expected.allowed_files ?? [];
  const deviations = changed.filter((path) => !allowedPatterns.some((pattern) => globMatches(path, pattern)));
  const requirements = Array.isArray(expected.requirements) ? expected.requirements : (expected.requirement_ids ?? []).map((id) => ({ id }));
  const passedNames = new Set(summary.passed_names);
  const satisfied = Array.isArray(expected.requirements)
    ? requirements.filter((requirement) => requirement.hidden_tests.every((name) => passedNames.has(name))).length
    : Math.min(summary.passed ?? 0, requirements.length);
  const requirementFailures = Array.isArray(expected.requirements)
    ? requirements.filter((requirement) => !requirement.hidden_tests.every((name) => passedNames.has(name))).map((requirement) => requirement.id)
    : [];
  const total = requirements.length;
  return {
    valid_blocking_or_major_findings: null,
    major_findings_missed: null,
    unsupported_or_false_positive_findings: null,
    merge_decision_correct: null,
    requirement_satisfaction_rate: summary.passed === null ? null : satisfied / total,
    requirements_total: total,
    requirements_satisfied: summary.passed === null ? null : satisfied,
    requirement_failures: requirementFailures,
    hidden_tests: { total: (summary.passed ?? 0) + (summary.failed ?? 0), ...summary },
    scope_deviations: deviations.length,
    changed_file_count: changed.length,
    automated_correction_units: summary.passed === null ? null : (total - satisfied) + deviations.length,
  };
}

function routeMetrics(final, taskClass) {
  if (!final?.route) return { correct_route: null, under_processing: null, over_processing: null, contracts_reported: false };
  const route = `${final.route.operating_mode} ${final.route.primary_workflow}`.toLowerCase();
  const correct = taskClass === "review" ? route.includes("review") : route.includes("implementation") || route.includes("controlled");
  return { correct_route: correct, under_processing: correct ? false : true, over_processing: null, contracts_reported: true };
}

function percentChange(baseline, candidate) {
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate) || baseline === 0) return null;
  return ((candidate - baseline) / baseline) * 100;
}

function mean(values) {
  const numeric = values.filter(Number.isFinite);
  return numeric.length === 0 ? null : numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function aggregate(runs, fixtureId, condition) {
  const rows = runs.filter((entry) => entry.fixture_id === fixtureId && entry.condition === condition);
  if (rows.length === 0) return null;
  return {
    quality: {
      valid_blocking_or_major_findings: mean(rows.map((row) => row.outcome_quality.valid_blocking_or_major_findings)),
      requirement_satisfaction_rate: mean(rows.map((row) => row.outcome_quality.requirement_satisfaction_rate)),
      unsupported_or_false_positive_findings: mean(rows.map((row) => row.outcome_quality.unsupported_or_false_positive_findings)),
      scope_deviations: mean(rows.map((row) => row.outcome_quality.scope_deviations)),
      unverified_completion_or_readiness_claims: mean(rows.map((row) => row.outcome_quality.unverified_completion_or_readiness_claims)),
    },
    duration_ms: mean(rows.map((row) => row.cost_latency.total_duration_ms)),
    total_tokens: mean(rows.map((row) => Number.isFinite(row.cost_latency.input_tokens) && Number.isFinite(row.cost_latency.output_tokens) ? row.cost_latency.input_tokens + row.cost_latency.output_tokens : null)),
    rework_count: mean(rows.map((row) => row.outcome_quality.rework_count)),
    senior_review_minutes: mean(rows.map((row) => row.human_effort.senior_review_minutes)),
    automated_correction_units: mean(rows.map((row) => row.outcome_quality.automated_correction_units)),
    abandoned: rows.some((row) => row.runtime_evidence.execution_status !== "executed"),
  };
}

function materialQualityGain(config, fixture, kernel, full) {
  if (fixture.task_class === "review") {
    return (full.quality.valid_blocking_or_major_findings - kernel.quality.valid_blocking_or_major_findings) >= (config.thresholds.minimum_review_valid_finding_gain ?? Number.POSITIVE_INFINITY);
  }
  return (full.quality.requirement_satisfaction_rate - kernel.quality.requirement_satisfaction_rate) >= (config.thresholds.minimum_implementation_requirement_rate_gain ?? Number.POSITIVE_INFINITY);
}

function qualityGuardrailWorsened(config, kernel, full) {
  return ((full.quality.unsupported_or_false_positive_findings ?? 0) - (kernel.quality.unsupported_or_false_positive_findings ?? 0)) > (config.thresholds.maximum_false_positive_increase ?? 0)
    || ((full.quality.scope_deviations ?? 0) - (kernel.quality.scope_deviations ?? 0)) > (config.thresholds.maximum_scope_deviation_increase ?? 0)
    || ((full.quality.unverified_completion_or_readiness_claims ?? 0) - (kernel.quality.unverified_completion_or_readiness_claims ?? 0)) > (config.thresholds.maximum_unverified_claim_increase ?? 0);
}

function recommendationFor(config, runs, fixture) {
  const kernel = aggregate(runs, fixture.id, "kernel_only");
  const full = aggregate(runs, fixture.id, "full_ask");
  if (!kernel || !full || full.abandoned) return { fixture_id: fixture.id, recommendation: "stop", reason: "Full ASK did not complete the workflow." };
  const qualityKey = fixture.task_class === "review" ? "valid_blocking_or_major_findings" : "requirement_satisfaction_rate";
  const fullQuality = full.quality[qualityKey];
  const kernelQuality = kernel.quality[qualityKey];
  if (Number.isFinite(fullQuality) && Number.isFinite(kernelQuality) && fullQuality < kernelQuality) return { fixture_id: fixture.id, recommendation: "stop", reason: "Full ASK quality was lower than Kernel-only." };
  if (qualityGuardrailWorsened(config, kernel, full)) return { fixture_id: fixture.id, recommendation: "stop", reason: "Full ASK worsened a frozen quality guardrail." };
  const seniorReduction = percentChange(kernel.senior_review_minutes, full.senior_review_minutes);
  const reworkReduction = percentChange(kernel.rework_count, full.rework_count);
  const durationOverhead = percentChange(kernel.duration_ms, full.duration_ms);
  const tokenOverhead = percentChange(kernel.total_tokens, full.total_tokens);
  const qualityGain = materialQualityGain(config, fixture, kernel, full) && config.thresholds.allow_expand_with_material_quality_gain === true;
  const primaryMet = qualityGain
    || (seniorReduction !== null && seniorReduction <= -config.thresholds.senior_correction_reduction_percent)
    || (reworkReduction !== null && reworkReduction <= -config.thresholds.rework_reduction_percent);
  const durationLimit = qualityGain ? config.thresholds.maximum_duration_overhead_with_quality_gain_percent : config.thresholds.maximum_duration_overhead_percent;
  const tokenLimit = qualityGain ? config.thresholds.maximum_token_overhead_with_quality_gain_percent : config.thresholds.maximum_token_overhead_percent;
  const overheadAcceptable = (durationOverhead === null || durationOverhead <= durationLimit)
    && (tokenOverhead === null || tokenOverhead <= tokenLimit);
  if (primaryMet && overheadAcceptable) return { fixture_id: fixture.id, recommendation: "expand", reason: "A fixed primary improvement threshold and all guardrails were met." };
  if (qualityGain && !overheadAcceptable) return { fixture_id: fixture.id, recommendation: "retain", reason: "Full ASK improved quality, but exceeded the frozen quality-gain overhead allowance." };
  if (!primaryMet && !overheadAcceptable) return { fixture_id: fixture.id, recommendation: "simplify", reason: "Material improvement was unproven and Full ASK exceeded a fixed overhead guardrail." };
  return { fixture_id: fixture.id, recommendation: "retain", reason: "Quality was non-inferior, but material incremental value was not proven." };
}

function comparisonFor(runs, fixture) {
  const kernel = aggregate(runs, fixture.id, "kernel_only");
  const full = aggregate(runs, fixture.id, "full_ask");
  const qualityKey = fixture.task_class === "review" ? "valid_blocking_or_major_findings" : "requirement_satisfaction_rate";
  return {
    fixture_id: fixture.id,
    task_class: fixture.task_class,
    quality_metric: qualityKey,
    kernel_only_quality: kernel?.quality?.[qualityKey] ?? null,
    full_ask_quality: full?.quality?.[qualityKey] ?? null,
    quality_gain: Number.isFinite(kernel?.quality?.[qualityKey]) && Number.isFinite(full?.quality?.[qualityKey]) ? full.quality[qualityKey] - kernel.quality[qualityKey] : null,
    automated_correction_units_delta: Number.isFinite(kernel?.automated_correction_units) && Number.isFinite(full?.automated_correction_units) ? full.automated_correction_units - kernel.automated_correction_units : null,
    duration_overhead_percent: percentChange(kernel?.duration_ms, full?.duration_ms),
    token_overhead_percent: percentChange(kernel?.total_tokens, full?.total_tokens),
    senior_correction_reduction_percent: percentChange(kernel?.senior_review_minutes, full?.senior_review_minutes),
    rework_reduction_percent: percentChange(kernel?.rework_count, full?.rework_count),
  };
}

function score(args) {
  const config = validateProtocol(args.configPath);
  requireLegacyConfig(config, "score");
  if (!args.runDir || !args.output) throw new Error("score requires --run-dir and --output");
  const manifest = readJson(resolve(args.runDir, "run.json"));
  if (manifest.checkpoint !== config.checkpoint || manifest.config_sha256 !== sha256(readFileSync(config._configPath))) throw new Error("run manifest does not match the selected frozen config");
  const configuredFixtures = new Map(config.fixtures.map((fixture) => [fixture.id, fixture]));
  const runs = manifest.cases.map((entry) => {
    const caseRoot = resolve(args.runDir, entry.case_id);
    const workspace = entry.workspace_subdir ? resolve(caseRoot, entry.workspace_subdir) : caseRoot;
    const fixture = configuredFixtures.get(entry.fixture_id);
    const final = parseFinal(resolve(caseRoot, ".benchmark-final.json"));
    const runtime = existsSync(resolve(caseRoot, ".benchmark-run.json")) ? readJson(resolve(caseRoot, ".benchmark-run.json")) : {};
    const expected = readJson(fixtureFile(config, fixture, entry.expected_path));
    const hiddenTestsPath = entry.hidden_tests_path ? fixtureFile(config, fixture, entry.hidden_tests_path) : null;
    const quality = entry.task_class === "review" ? reviewMetrics(final, expected) : implementationMetrics(caseRoot, workspace, expected, hiddenTestsPath);
    const claimedComplete = final?.completion_claim === "complete";
    const verificationPassed = final?.verification_commands?.some((command) => command.result === "passed") ?? false;
    const objectiveFailure = quality.hidden_tests?.exit_code ? quality.hidden_tests.exit_code !== 0 : false;
    quality.unverified_completion_or_readiness_claims = claimedComplete && (!verificationPassed || objectiveFailure) ? 1 : 0;
    if (Number.isFinite(quality.automated_correction_units)) quality.automated_correction_units += quality.unverified_completion_or_readiness_claims;
    quality.rework_count = null;
    return {
      case_id: entry.case_id,
      fixture_id: entry.fixture_id,
      task_class: entry.task_class,
      difficulty: entry.difficulty,
      repetition: entry.repetition,
      condition: entry.condition,
      outcome_quality: quality,
      human_effort: { senior_review_minutes: null, additional_investigation_minutes: null, unresolved_human_decisions: null },
      cost_latency: {
        total_duration_ms: runtime.duration_ms ?? null,
        ai_tool_execution_ms: runtime.duration_ms ?? null,
        input_tokens: runtime.input_tokens ?? null,
        output_tokens: runtime.output_tokens ?? null,
        usage_cost: null,
        final_output_bytes: runtime.output_bytes ?? (existsSync(resolve(caseRoot, ".benchmark-final.json")) ? statSync(resolve(caseRoot, ".benchmark-final.json")).size : null),
      },
      adoption_behavior: routeMetrics(final, entry.task_class),
      runtime_evidence: {
        projected_assets_available: entry.condition === "plain" ? "not_applicable" : existsSync(resolve(caseRoot, "AGENTS.md")) ? "present" : "missing",
        full_skill_projection_available: entry.condition === "full_ask" ? existsSync(resolve(caseRoot, ".agents/skills")) : null,
        execution_status: runtime.exit_code === 0 && final ? "executed" : runtime.exit_code === undefined ? "unknown" : "failed",
        output_sha256: runtime.output_sha256 ?? null,
        capability_downgrade: runtime.runtime_error ?? null,
      },
    };
  });
  const result = {
    schema_version: "1.0.0",
    checkpoint: config.checkpoint,
    protocol: {
      status: config.protocol_status,
      frozen_at: config.protocol_frozen_at,
      protocol_sha256: manifest.protocol_sha256,
      config_sha256: manifest.config_sha256,
      repository_revision: manifest.repository_revision,
    },
    runtime: { ...config.runtime, observed_agent_version: manifest.runtime_observation?.agent_version ?? null },
    ...(config.attribution ? { attribution: config.attribution } : {}),
    runs,
    comparison: {
      primary_comparator: "kernel_only",
      workflow_comparisons: config.fixtures.map((fixture) => comparisonFor(runs, fixture)),
      workflow_recommendations: config.fixtures.map((fixture) => recommendationFor(config, runs, fixture)),
      thresholds: config.thresholds,
    },
    limitations: [
      `${config.fixtures.length} synthetic fixtures with ${config.repetitions ?? 1} repetition(s) do not establish universal or causal value.`,
      "Senior correction time, additional investigation time, unresolved human decisions, rework, and usage cost are unknown until a blinded human evaluator records them.",
      "Review finding matching is a frozen semantic heuristic and may undercount or overcount paraphrases.",
      "Automated correction units are a bounded quality proxy, not human effort or rework.",
      config.checkpoint === "C"
        ? "Checkpoint C does not isolate architecture causally because CLI, repository, and adapter projection evidence changed from B2; model and fixture inputs were controlled."
        : "Checkpoint C remains pending until #179 and must separate architecture changes from model, CLI, repository, and adapter changes."
    ],
    privacy: {
      raw_prompts_stored_in_result: false,
      full_outputs_stored_in_result: false,
      full_source_stored_in_result: false,
      secrets_customer_or_personal_data_stored: false,
      temporary_run_directory: "operator-managed and not committed"
    }
  };
  writeJson(args.output, result);
  console.log(`Wrote normalized benchmark result to ${args.output}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "validate") {
    validateProtocol(args.configPath);
    console.log("ASK benchmark protocol validation passed");
  } else if (args.command === "plan") planPortfolio(args);
  else if (args.command === "prepare") prepare(args);
  else if (args.command === "run") executeCases(args);
  else if (args.command === "score") score(args);
  else if (args.command === "help" || !args.command) help();
  else throw new Error(`Unknown command: ${args.command}`);
} catch (error) {
  console.error(`ASK benchmark failed: ${error.message}`);
  process.exit(1);
}
