import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, parse, relative, resolve, sep } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { assertTrackedRepositoryMatchesHead, canonicalDigest, stableCanonicalJson, validateMaterializedPortfolio } from "./ask-benchmark-materialize.mjs";
import { verifyAdaptiveSelection } from "./ask-benchmark-selection.mjs";
import { buildCodexProjectionPlan, resolveCodexSkillClosure } from "./install-codex-adapter.mjs";
import { buildClaudeProjectionPlan, resolveClaudeSkillClosure } from "./install-claude-adapter.mjs";

export const EXECUTION_RUNNER_VERSION = "1.0.0";
export const RUNTIME_CONFIG_SCHEMA_PATH = "benchmarks/schemas/portfolio-runtime-config.schema.json";
export const RUN_IDENTITY_SCHEMA_PATH = "benchmarks/schemas/portfolio-run-identity.schema.json";
export const CASE_STATE_SCHEMA_PATH = "benchmarks/schemas/portfolio-case-state.schema.json";
export const ATTEMPT_REQUEST_SCHEMA_PATH = "benchmarks/schemas/portfolio-attempt-request.schema.json";
export const ATTEMPT_RESULT_SCHEMA_PATH = "benchmarks/schemas/portfolio-attempt-result.schema.json";
export const OUTPUT_SCHEMA_PATH = "benchmarks/schemas/agent-output.schema.json";

const CLAIM_GRACE_MS = 30_000;
const MAX_PROCESS_OUTPUT_BYTES = 20 * 1024 * 1024;
const RUN_IDENTITY_FILE = "run-identity.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path, value) {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = resolve(parent, `.${basename(path)}.${randomUUID()}.staging`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  renameSync(temporary, path);
}

function assertNoSymlinkSegments(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symlink: ${current}`);
  }
  return absolute;
}

function isInside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

function assertInside(root, path, label) {
  if (!isInside(root, path)) throw new Error(`${label} escapes its allowed root`);
  return resolve(path);
}

function assertPortableRelativePath(path, label) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..") || path.startsWith("./")) {
    throw new Error(`${label} must be a portable relative path`);
  }
  return path;
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function schema(root, path) {
  return resolve(root, path);
}

function validate(root, value, schemaPath, label) {
  return assertBenchmarkSchemaInstance(value, { schemaPath: schema(root, schemaPath), label });
}

function fileDigest(path) {
  return sha256(readFileSync(path));
}

function streamEvidence(value) {
  const bytes = Buffer.from(value ?? "");
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function jsonLineCount(value) {
  return String(value ?? "").split("\n").filter((line) => {
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  }).length;
}

function readRuntimeConfig(root, path, adapter) {
  if (!path || !existsSync(path) || !lstatSync(path).isFile()) throw new Error("execute-portfolio requires a regular --runtime-config file");
  assertNoSymlinkSegments(path, "runtime config");
  const bytes = readFileSync(path);
  const value = JSON.parse(bytes);
  validate(root, value, RUNTIME_CONFIG_SCHEMA_PATH, "runtime config");
  if (value.adapter !== adapter) throw new Error(`runtime config adapter ${value.adapter} does not match --adapter ${adapter}`);
  if (value.availability === "available" && (!value.expected_executable_version || (adapter === "claude" && !value.claude_cli))) {
    throw new Error("available runtime config requires expected executable version and an explicit Claude CLI contract where applicable");
  }
  if (value.availability === "unavailable" && (!value.unavailable_reason || value.unavailable_reason.trim() === "")) {
    throw new Error("unavailable runtime config requires unavailable_reason");
  }
  if (adapter === "codex" && value.claude_cli !== null) throw new Error("Codex runtime config must not provide a Claude CLI contract");
  return { value, digest: sha256(bytes) };
}

function environmentFor(runtime, extra = {}) {
  const environment = {};
  for (const key of runtime.environment_allowlist) {
    if (Object.hasOwn(process.env, key)) environment[key] = process.env[key];
  }
  return { ...environment, ...extra };
}

function validateAvailableRuntime(runtime, agentBin) {
  if (!agentBin || !existsSync(agentBin) || !lstatSync(agentBin).isFile()) throw new Error("available runtime requires a regular --agent-bin");
  assertNoSymlinkSegments(agentBin, "agent executable");
  const executable = realpathSync(agentBin);
  const version = spawnSync(executable, ["--version"], { encoding: "utf8", env: environmentFor(runtime), maxBuffer: 1024 * 1024 });
  const observedVersion = `${version.stdout ?? ""}${version.stderr ?? ""}`.trim();
  if (version.status !== 0 || !observedVersion.includes(runtime.expected_executable_version)) {
    throw new Error(`runtime executable version mismatch: expected ${runtime.expected_executable_version}, received ${observedVersion || "no version output"}`);
  }
  if (runtime.adapter === "claude") {
    const help = spawnSync(executable, ["--help"], { encoding: "utf8", env: environmentFor(runtime), maxBuffer: 1024 * 1024 });
    const helpOutput = `${help.stdout ?? ""}${help.stderr ?? ""}`;
    if (help.status !== 0 || !helpOutput.includes(runtime.claude_cli.help_marker)) {
      throw new Error("Claude CLI contract is not confirmed by local --help output");
    }
    for (const value of runtime.claude_cli.command) {
      if (!/^(?:[^{}]|\{output\}|\{task\})+$/u.test(value)) throw new Error("Claude CLI contract uses an unsupported placeholder");
    }
  }
  return {
    executable_basename: basename(executable),
    executable_sha256: fileDigest(executable),
    observed_version: observedVersion,
  };
}

function adapterIdentity({ adapter, runtime, runtimeConfigDigest, executable }) {
  return {
    schema_version: "1.0.0",
    adapter,
    runtime_config_sha256: runtimeConfigDigest,
    availability: runtime.availability,
    unavailable_reason: runtime.unavailable_reason,
    executor: runtime.executor,
    model: runtime.model,
    reasoning_effort: runtime.reasoning_effort,
    sandbox_policy: runtime.sandbox_policy,
    permission_policy: runtime.permission_policy,
    case_timeout_ms: runtime.case_timeout_ms,
    thermal_state: runtime.thermal_state,
    environment_allowlist: runtime.environment_allowlist,
    executable,
    availability_evidence: runtime.availability === "available" ? "local_version_and_contract_probe" : "declared_unavailable",
  };
}

function assertRunBoundary(runDir, materialized, selectionState) {
  const run = resolve(runDir);
  const materializedRoot = resolve(materialized);
  const selectionRoot = resolve(selectionState);
  if (isInside(materializedRoot, run) || isInside(selectionRoot, run) || isInside(run, materializedRoot) || isInside(run, selectionRoot)) {
    throw new Error("run root must stay outside materialized and selection-state roots");
  }
  const parent = dirname(run);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory()) throw new Error("run root parent must be an existing directory");
  assertNoSymlinkSegments(parent, "run root parent");
  if (existsSync(run) && (!lstatSync(run).isDirectory() || lstatSync(run).isSymbolicLink())) throw new Error("run root must be a directory and not a symlink");
  return run;
}

function readPlan(planPath) {
  if (!planPath || !existsSync(planPath) || !lstatSync(planPath).isFile()) throw new Error("execution requires a regular --plan file");
  assertNoSymlinkSegments(planPath, "execution plan");
  return readJson(planPath);
}

function loadSelections({ root, config, planPath, materializedPath, selectionState, repositoryRevision, plan }) {
  if (!selectionState || !existsSync(selectionState) || !lstatSync(selectionState).isDirectory()) throw new Error("execution requires an existing --selection-state directory");
  assertNoSymlinkSegments(selectionState, "selection state");
  const indexPath = resolve(selectionState, "selection-state.json");
  if (!existsSync(indexPath) || !lstatSync(indexPath).isFile()) throw new Error("selection state index is missing");
  const selections = new Map();
  for (const entry of plan.cases.filter((caseRecord) => caseRecord.condition === "adaptive_ask")) {
    const record = verifyAdaptiveSelection({ root, config, planPath, materializedPath, stateDir: selectionState, caseId: entry.case_id, repositoryRevision });
    selections.set(entry.case_id, record);
  }
  return { selections, stateDigest: `sha256:${fileDigest(indexPath)}` };
}

function runIdentity({ root, plan, materialized, selections, repositoryRevision, config }) {
  return {
    schema_version: "1.0.0",
    program: "adaptive_ask_portfolio_execution",
    plan: { id: plan.plan_id, digest: canonicalDigest(plan) },
    materialization: {
      manifest_digest: materialized.manifestDigest,
      output_root_identity: materialized.manifest.output_root_identity,
    },
    repository_revision: repositoryRevision,
    runner: { version: EXECUTION_RUNNER_VERSION, source_revision: repositoryRevision },
    config: { sha256: plan.config_sha256, protocol_sha256: plan.protocol_sha256 },
    case_namespace: canonicalDigest(plan.cases.map((entry) => entry.case_id)),
    selection_state_digest: selections.stateDigest,
    output_schema_digest: `sha256:${fileDigest(schema(root, OUTPUT_SCHEMA_PATH))}`,
  };
}

function initialCaseState(entry, selection) {
  return {
    schema_version: "1.0.0",
    case_id: entry.case_id,
    adapter: entry.adapter_track,
    condition: entry.condition,
    status: "pending",
    attempt_count: 0,
    terminal_attempt: null,
    selection_digest: selection?.selection_digest?.value ?? null,
  };
}

function statePath(runDir, caseId) {
  return resolve(runDir, "cases", caseId, "state.json");
}

function readCaseState(root, runDir, entry) {
  const path = statePath(runDir, entry.case_id);
  if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`case state is missing: ${entry.case_id}`);
  assertNoSymlinkSegments(path, `${entry.case_id} state`);
  const state = readJson(path);
  validate(root, state, CASE_STATE_SCHEMA_PATH, `${entry.case_id} state`);
  if (state.case_id !== entry.case_id || state.adapter !== entry.adapter_track || state.condition !== entry.condition) throw new Error(`${entry.case_id} state identity mismatch`);
  return state;
}

function writeCaseState(runDir, entry, state) {
  writeJsonAtomic(statePath(runDir, entry.case_id), state);
}

function initializeRun({ root, runDir, identity, plan, selections }) {
  const identityPath = resolve(runDir, RUN_IDENTITY_FILE);
  if (existsSync(runDir) && readdirSync(runDir).length > 0) {
    if (!existsSync(identityPath)) throw new Error("non-empty run root is missing run identity");
    const existing = readJson(identityPath);
    validate(root, existing, RUN_IDENTITY_SCHEMA_PATH, "run identity");
    if (stableCanonicalJson(existing) !== stableCanonicalJson(identity)) throw new Error("run identity changed; refusing resume");
    return false;
  }
  const parent = dirname(runDir);
  const staging = mkdtempSync(resolve(parent, `.${basename(runDir)}.staging-`));
  try {
    writeJsonAtomic(resolve(staging, RUN_IDENTITY_FILE), identity);
    mkdirSync(resolve(staging, "adapters"));
    for (const entry of plan.cases) {
      const caseRoot = resolve(staging, "cases", entry.case_id);
      mkdirSync(resolve(caseRoot, "attempts"), { recursive: true });
      writeJsonAtomic(resolve(caseRoot, "state.json"), initialCaseState(entry, selections.selections.get(entry.case_id)));
    }
    if (existsSync(runDir)) rmdirSync(runDir);
    renameSync(staging, runDir);
    return true;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function loadExecutionContext({ root, config, planPath, materializedPath, selectionState, runDir, initialize = true }) {
  assertTrackedRepositoryMatchesHead(root);
  const repositoryRevision = git(root, ["rev-parse", "HEAD"]);
  const plan = readPlan(planPath);
  const materialized = validateMaterializedPortfolio({ root, config, plan, materializedRoot: materializedPath, repositoryRevision });
  const selections = loadSelections({ root, config, planPath, materializedPath, selectionState, repositoryRevision, plan });
  const identity = runIdentity({ root, plan, materialized, selections, repositoryRevision, config });
  const safeRunDir = assertRunBoundary(runDir, materializedPath, selectionState);
  const initialized = initialize
    ? initializeRun({ root, runDir: safeRunDir, identity, plan, selections })
    : (() => {
      const path = resolve(safeRunDir, RUN_IDENTITY_FILE);
      if (!existsSync(path)) throw new Error("run identity is missing");
      const existing = readJson(path);
      validate(root, existing, RUN_IDENTITY_SCHEMA_PATH, "run identity");
      if (stableCanonicalJson(existing) !== stableCanonicalJson(identity)) throw new Error("run identity changed; refusing verification");
      return false;
    })();
  return { repositoryRevision, plan, materialized, selections, identity, runDir: safeRunDir, initialized };
}

function ensureAdapterIdentity({ root, runDir, adapter, runtimeConfig, agentBin }) {
  const executable = runtimeConfig.value.availability === "available" ? validateAvailableRuntime(runtimeConfig.value, agentBin) : null;
  const identity = adapterIdentity({ adapter, runtime: runtimeConfig.value, runtimeConfigDigest: runtimeConfig.digest, executable });
  const path = resolve(runDir, "adapters", `${adapter}.json`);
  if (existsSync(path)) {
    const existing = readJson(path);
    if (stableCanonicalJson(existing) !== stableCanonicalJson(identity)) throw new Error(`${adapter} runtime identity changed; refusing resume`);
  } else writeJsonAtomic(path, identity);
  return identity;
}

function claimPath(runDir, caseId) {
  return resolve(runDir, "cases", caseId, "claim");
}

function readClaim(runDir, caseId) {
  const root = claimPath(runDir, caseId);
  if (!existsSync(root)) return null;
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error(`${caseId} claim is invalid`);
  const path = resolve(root, "claim.json");
  if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`${caseId} claim is incomplete; explicit recovery is required`);
  const claim = readJson(path);
  if (!claim?.claim_id || claim.case_id !== caseId || !claim.lease_expires_at || !claim.attempt) throw new Error(`${caseId} claim is invalid`);
  return claim;
}

function claimIsExpired(claim, now = Date.now()) {
  return Number.isFinite(Date.parse(claim.lease_expires_at)) && Date.parse(claim.lease_expires_at) < now;
}

function acquireClaim({ runDir, entry, attempt, runtime }) {
  const directory = claimPath(runDir, entry.case_id);
  try {
    mkdirSync(directory, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") return null;
    throw error;
  }
  const acquiredAt = new Date().toISOString();
  const claim = {
    schema_version: "1.0.0",
    claim_id: randomUUID(),
    case_id: entry.case_id,
    worker_id: `${process.pid}`,
    pid: process.pid,
    acquired_at: acquiredAt,
    lease_expires_at: new Date(Date.now() + runtime.case_timeout_ms + CLAIM_GRACE_MS).toISOString(),
    attempt,
    selection_digest: null,
  };
  writeJsonAtomic(resolve(directory, "claim.json"), claim);
  return claim;
}

function releaseClaim(runDir, caseId) {
  const path = claimPath(runDir, caseId);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

function nextAttempt(runDir, entry) {
  const directory = resolve(runDir, "cases", entry.case_id, "attempts");
  const existing = readdirSync(directory, { withFileTypes: true })
    .filter((item) => item.isDirectory() && /^[0-9]{4}$/u.test(item.name))
    .map((item) => Number(item.name));
  return String((Math.max(0, ...existing) + 1)).padStart(4, "0");
}

function copyWorkspace({ materializedRoot, record, attemptRoot }) {
  const sourceRoot = resolve(materializedRoot, record.case_id);
  const workspace = resolve(attemptRoot, "workspace");
  mkdirSync(workspace, { recursive: true });
  const inventory = [...record.agent_visible_files, ...record.projected_asset_inventory];
  for (const file of inventory) {
    const relativePath = assertPortableRelativePath(file.path, `${record.case_id} materialized path`);
    const source = assertInside(sourceRoot, resolve(sourceRoot, relativePath), `${record.case_id} materialized source`);
    const destination = assertInside(workspace, resolve(workspace, relativePath), `${record.case_id} execution destination`);
    assertNoSymlinkSegments(source, `${record.case_id} materialized source`);
    if (!lstatSync(source).isFile() || fileDigest(source) !== file.sha256 || statSync(source).size !== file.bytes) throw new Error(`${record.case_id} materialized source drifted before execution copy`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination, 0);
    chmodSync(destination, Number.parseInt(file.mode, 8));
  }
  return workspace;
}

function sourceForProjectedSkill(root, adapter, path) {
  const prefix = adapter === "codex" ? ".agents/skills/" : ".claude/skills/";
  if (!path.startsWith(prefix) || !path.endsWith("/SKILL.md")) throw new Error(`selection projection contains a non-skill asset: ${path}`);
  const skill = path.slice(prefix.length, -"/SKILL.md".length);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(skill)) throw new Error(`selection projection has an invalid skill path: ${path}`);
  return resolve(root, "skills", skill, "SKILL.md");
}

function applyAdaptiveSelection({ root, adapter, selection, workspace }) {
  const requested = [...new Set([...selection.selected_mechanisms, ...selection.required_gates])];
  if (selection.lightweight_bypass.used) {
    if (requested.length !== 0) throw new Error("lightweight bypass must not project additional skills");
    return { status: "lightweight_bypass", selected_skills: [], inventory: [], source_digests: [], projection_fingerprint: null, capability_downgrades: selection.capability_downgrades };
  }
  const closure = adapter === "codex" ? resolveCodexSkillClosure(requested) : resolveClaudeSkillClosure(requested);
  const plan = adapter === "codex"
    ? buildCodexProjectionPlan({ profileName: "minimal", skills: closure, skipPrompts: true, skipCommand: true })
    : buildClaudeProjectionPlan({ profileName: "implementation", skills: closure, skipHooks: true, skipRuntime: true, skipCommands: true });
  const inventory = [];
  for (const asset of plan.projectedManagedAssets) {
    const source = sourceForProjectedSkill(root, adapter, asset.path);
    if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error(`selection projection source is unavailable: ${asset.path}`);
    const destination = assertInside(workspace, resolve(workspace, asset.path), "selection projection destination");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination, 0);
    chmodSync(destination, statSync(source).mode & 0o777);
    inventory.push({ path: asset.path, sha256: fileDigest(destination), bytes: statSync(destination).size, mode: `0${(statSync(destination).mode & 0o777).toString(8).padStart(3, "0")}` });
  }
  return {
    status: selection.capability_downgrades.length > 0 ? "capability_downgraded" : "projected",
    selected_skills: plan.selectedSkills,
    inventory: inventory.sort((left, right) => left.path.localeCompare(right.path)),
    source_digests: Object.values(plan.renderer_inputs).flat().map((item) => ({ path: item.path, sha256: item.digest })).sort((left, right) => left.path.localeCompare(right.path)),
    projection_fingerprint: plan.fingerprint,
    capability_downgrades: selection.capability_downgrades,
  };
}

function isolatedCodexHome() {
  const sourceHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : process.env.HOME ? resolve(process.env.HOME, ".codex") : null;
  const home = mkdtempSync(resolve(tmpdir(), "ask-portfolio-codex-home-"));
  chmodSync(home, 0o700);
  const auth = sourceHome ? resolve(sourceHome, "auth.json") : null;
  if (auth && existsSync(auth) && lstatSync(auth).isFile()) symlinkSync(auth, resolve(home, "auth.json"));
  return home;
}

function executeAgent({ root, runtime, executable, workspace, outputTemporary }) {
  const task = readFileSync(resolve(workspace, "BENCHMARK_TASK.md"), "utf8");
  if (runtime.adapter === "codex") {
    const codexHome = isolatedCodexHome();
    try {
      return spawnSync(executable, [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--model", runtime.model,
        "-c", `model_reasoning_effort=\"${runtime.reasoning_effort}\"`,
        "--sandbox", runtime.sandbox_policy,
        "--output-schema", resolve(root, OUTPUT_SCHEMA_PATH),
        "--output-last-message", outputTemporary,
        "-",
      ], {
        cwd: workspace,
        encoding: "utf8",
        input: task,
        env: environmentFor(runtime, { CODEX_HOME: codexHome }),
        timeout: runtime.case_timeout_ms,
        maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
      });
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  }
  const args = runtime.claude_cli.command.map((part) => part.replaceAll("{output}", outputTemporary).replaceAll("{task}", "BENCHMARK_TASK.md"));
  return spawnSync(executable, args, {
    cwd: workspace,
    encoding: "utf8",
    env: environmentFor(runtime),
    timeout: runtime.case_timeout_ms,
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
  });
}

function publishFinal(root, attemptRoot, outputTemporary) {
  if (!existsSync(outputTemporary) || !lstatSync(outputTemporary).isFile()) throw new Error("agent final structured output is missing");
  const bytes = readFileSync(outputTemporary);
  const final = JSON.parse(bytes);
  validate(root, final, OUTPUT_SCHEMA_PATH, "agent final structured output");
  const destination = resolve(attemptRoot, "final.json");
  if (existsSync(destination)) throw new Error("attempt final output already exists");
  renameSync(outputTemporary, destination);
  return { path: "final.json", sha256: sha256(bytes), bytes: bytes.length };
}

function requestRecord({ entry, attempt, materialized, selection, projection, identity }) {
  return {
    schema_version: "1.0.0",
    kind: "request",
    case_id: entry.case_id,
    attempt,
    adapter: entry.adapter_track,
    condition: entry.condition,
    input_identity: {
      plan_digest: identity.plan.digest,
      materialization_manifest_digest: materialized.manifestDigest,
      frozen_input_digest: materialized.casesById.get(entry.case_id).frozen_input_digest,
    },
    selection: selection ? { digest: selection.selection_digest.value, selected_mechanisms: selection.selected_mechanisms, required_gates: selection.required_gates } : null,
    projection,
    agent: { adapter: entry.adapter_track, autonomous_agents_started: 0 },
  };
}

function resultRecord({ entry, attempt, status, processResult = null, finalOutput = null, failureKind = null }) {
  const stdout = streamEvidence(processResult?.stdout ?? "");
  const stderr = streamEvidence(processResult?.stderr ?? "");
  return {
    schema_version: "1.0.0",
    kind: "result",
    case_id: entry.case_id,
    attempt,
    status,
    exit_code: processResult?.status ?? null,
    duration_ms: processResult?.duration_ms ?? null,
    failure_kind: failureKind,
    final_output: finalOutput,
    stdout,
    stderr,
    event_counts: { json_lines: jsonLineCount(processResult?.stdout ?? "") },
  };
}

function completeCase({ root, runDir, entry, state, claim, attempt, attemptRoot, result }) {
  validate(root, result, ATTEMPT_RESULT_SCHEMA_PATH, `${entry.case_id} attempt result`);
  writeJsonAtomic(resolve(attemptRoot, "result.json"), result);
  writeCaseState(runDir, entry, {
    ...state,
    status: result.status,
    attempt_count: Number(attempt),
    terminal_attempt: attempt,
    selection_digest: claim.selection_digest,
  });
  releaseClaim(runDir, entry.case_id);
}

function completedArtifactValid({ root, runDir, entry, state }) {
  if (!state.terminal_attempt) return false;
  const attemptRoot = resolve(runDir, "cases", entry.case_id, "attempts", state.terminal_attempt);
  const resultPath = resolve(attemptRoot, "result.json");
  if (!existsSync(resultPath) || !lstatSync(resultPath).isFile()) return false;
  try {
    const result = readJson(resultPath);
    validate(root, result, ATTEMPT_RESULT_SCHEMA_PATH, `${entry.case_id} completed result`);
    if (result.status !== "completed" || !result.final_output) return false;
    const finalPath = resolve(attemptRoot, result.final_output.path);
    if (!existsSync(finalPath) || !lstatSync(finalPath).isFile()) return false;
    if (fileDigest(finalPath) !== result.final_output.sha256 || statSync(finalPath).size !== result.final_output.bytes) return false;
    validate(root, readJson(finalPath), OUTPUT_SCHEMA_PATH, `${entry.case_id} completed output`);
    return true;
  } catch {
    return false;
  }
}

function markUnavailable({ root, runDir, entry, state, identity }) {
  if (["completed", "unavailable"].includes(state.status)) return;
  const attempt = nextAttempt(runDir, entry);
  const attemptRoot = resolve(runDir, "cases", entry.case_id, "attempts", attempt);
  mkdirSync(attemptRoot, { recursive: false });
  const request = requestRecord({ entry, attempt, materialized: { manifestDigest: identity.materialization.manifest_digest, casesById: new Map([[entry.case_id, { frozen_input_digest: null }]]) }, selection: null, projection: { status: "runtime_unavailable", inventory: [] }, identity });
  validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${entry.case_id} unavailable request`);
  writeJsonAtomic(resolve(attemptRoot, "request.json"), request);
  completeCase({ root, runDir, entry, state, claim: { selection_digest: state.selection_digest }, attempt, attemptRoot, result: resultRecord({ entry, attempt, status: "unavailable", failureKind: "runtime_unavailable" }) });
}

function executeCase({ root, config, context, entry, runtime, executable }) {
  const state = readCaseState(root, context.runDir, entry);
  if (state.status === "completed") {
    if (!completedArtifactValid({ root, runDir: context.runDir, entry, state })) throw new Error(`${entry.case_id} completed artifact is corrupt; refusing re-execution`);
    return "completed";
  }
  if (state.status === "failed" && !context.retryFailed) return "failed";
  if (state.status === "unavailable" || state.status === "invalid") return state.status;
  const existingClaim = readClaim(context.runDir, entry.case_id);
  if (existingClaim) {
    if (claimIsExpired(existingClaim)) throw new Error(`${entry.case_id} has an expired claim; run recover-case with claim ID ${existingClaim.claim_id}`);
    return "active";
  }
  const attempt = nextAttempt(context.runDir, entry);
  const claim = acquireClaim({ runDir: context.runDir, entry, attempt, runtime });
  if (!claim) return "active";
  const activeState = { ...state, status: "active", attempt_count: Number(attempt), terminal_attempt: null };
  writeCaseState(context.runDir, entry, activeState);
  const attemptRoot = resolve(context.runDir, "cases", entry.case_id, "attempts", attempt);
  let processResult = null;
  try {
    mkdirSync(attemptRoot, { recursive: false });
    let selection = null;
    if (entry.condition === "adaptive_ask") {
      selection = verifyAdaptiveSelection({ root, config, planPath: context.planPath, materializedPath: context.materializedPath, stateDir: context.selectionState, caseId: entry.case_id, repositoryRevision: context.repositoryRevision });
      const expected = context.selections.selections.get(entry.case_id)?.selection_digest.value;
      if (selection.selection_digest.value !== expected) throw new Error("Adaptive selection changed before execution");
      claim.selection_digest = selection.selection_digest.value;
      writeJsonAtomic(resolve(claimPath(context.runDir, entry.case_id), "claim.json"), claim);
    }
    const workspace = copyWorkspace({ materializedRoot: context.materializedPath, record: context.materialized.casesById.get(entry.case_id), attemptRoot });
    const projection = selection ? applyAdaptiveSelection({ root, adapter: entry.adapter_track, selection, workspace }) : { status: "materialized", inventory: [], selected_skills: [] };
    if (selection) {
      const beforeSpawn = verifyAdaptiveSelection({ root, config, planPath: context.planPath, materializedPath: context.materializedPath, stateDir: context.selectionState, caseId: entry.case_id, repositoryRevision: context.repositoryRevision });
      if (beforeSpawn.selection_digest.value !== claim.selection_digest) throw new Error("Adaptive selection changed before process spawn");
    }
    const request = requestRecord({ entry, attempt, materialized: context.materialized, selection, projection, identity: context.identity });
    validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${entry.case_id} attempt request`);
    writeJsonAtomic(resolve(attemptRoot, "request.json"), request);
    const temporaryOutput = resolve(attemptRoot, ".agent-final.staging.json");
    const started = process.hrtime.bigint();
    const raw = executeAgent({ root, runtime, executable, workspace, outputTemporary: temporaryOutput });
    processResult = { ...raw, duration_ms: Math.round(Number(process.hrtime.bigint() - started) / 1_000_000) };
    if (selection) {
      const afterSpawn = verifyAdaptiveSelection({ root, config, planPath: context.planPath, materializedPath: context.materializedPath, stateDir: context.selectionState, caseId: entry.case_id, repositoryRevision: context.repositoryRevision });
      if (afterSpawn.selection_digest.value !== claim.selection_digest) throw new Error("Adaptive selection changed during process execution");
    }
    if (processResult.error?.code === "ETIMEDOUT") throw new Error("case timeout");
    if (processResult.status !== 0) throw new Error(`agent exited ${processResult.status}`);
    const finalOutput = publishFinal(root, attemptRoot, temporaryOutput);
    completeCase({ root, runDir: context.runDir, entry, state: activeState, claim, attempt, attemptRoot, result: resultRecord({ entry, attempt, status: "completed", processResult, finalOutput }) });
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalid = /Adaptive selection|projection|materialized source|selection changed/u.test(message);
    const temporaryOutput = resolve(attemptRoot, ".agent-final.staging.json");
    if (existsSync(temporaryOutput)) rmSync(temporaryOutput, { force: true });
    const result = resultRecord({
      entry,
      attempt,
      status: invalid ? "invalid" : "failed",
      processResult,
      failureKind: /timeout/u.test(message) ? "timeout" : invalid ? "invalid_input_or_selection" : "agent_failure",
    });
    if (existsSync(attemptRoot)) completeCase({ root, runDir: context.runDir, entry, state: activeState, claim, attempt, attemptRoot, result });
    else releaseClaim(context.runDir, entry.case_id);
    return result.status;
  }
}

export function executePortfolio({ root, config, planPath, materializedPath, selectionState, runDir, adapter, runtimeConfigPath, agentBin, caseId = null, maxCases = null, retryFailed = false }) {
  if (!adapter || !["codex", "claude"].includes(adapter)) throw new Error("execute-portfolio requires --adapter codex or claude");
  if (maxCases !== null && (!Number.isInteger(maxCases) || maxCases < 1)) throw new Error("--max-cases must be a positive integer");
  const context = loadExecutionContext({ root, config, planPath, materializedPath, selectionState, runDir });
  context.planPath = planPath;
  context.materializedPath = materializedPath;
  context.selectionState = selectionState;
  context.retryFailed = retryFailed;
  const runtimeConfig = readRuntimeConfig(root, runtimeConfigPath, adapter);
  const identity = ensureAdapterIdentity({ root, runDir: context.runDir, adapter, runtimeConfig, agentBin });
  const cases = context.plan.cases.filter((entry) => entry.adapter_track === adapter && (!caseId || entry.case_id === caseId));
  if (caseId && cases.length === 0) throw new Error(`case ${caseId} does not belong to adapter ${adapter}`);
  const outcomes = [];
  let executed = 0;
  if (runtimeConfig.value.availability === "unavailable") {
    for (const entry of cases) {
      const state = readCaseState(root, context.runDir, entry);
      if (["completed", "unavailable", "invalid"].includes(state.status)) {
        outcomes.push({ case_id: entry.case_id, status: state.status });
        continue;
      }
      if (maxCases !== null && executed >= maxCases) break;
      markUnavailable({ root, runDir: context.runDir, entry, state, identity: context.identity });
      outcomes.push({ case_id: entry.case_id, status: "unavailable" });
      executed += 1;
    }
  } else {
    const executable = realpathSync(agentBin);
    for (const entry of cases) {
      const state = readCaseState(root, context.runDir, entry);
      const actionable = state.status === "pending" || state.status === "interrupted" || (state.status === "failed" && retryFailed);
      if (actionable && maxCases !== null && executed >= maxCases) break;
      const status = executeCase({ root, config, context, entry, runtime: runtimeConfig.value, executable });
      outcomes.push({ case_id: entry.case_id, status });
      if (actionable && status !== "active") executed += 1;
    }
  }
  return { adapter, initialized: context.initialized, outcomes };
}

function classificationForCase({ root, runDir, entry }) {
  try {
    const state = readCaseState(root, runDir, entry);
    const claim = readClaim(runDir, entry.case_id);
    if (claim) return { case_id: entry.case_id, status: "active", stale_claim: claimIsExpired(claim) };
    if (state.status === "completed" && !completedArtifactValid({ root, runDir, entry, state })) return { case_id: entry.case_id, status: "invalid" };
    return { case_id: entry.case_id, status: state.status };
  } catch (error) {
    return { case_id: entry.case_id, status: "invalid", reason: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyPortfolioExecution({ root, config, planPath, materializedPath, selectionState, runDir }) {
  const context = loadExecutionContext({ root, config, planPath, materializedPath, selectionState, runDir, initialize: false });
  return {
    cases: context.plan.cases.map((entry) => classificationForCase({ root, runDir: context.runDir, entry })),
  };
}

export function recoverPortfolioCase({ root, runDir, caseId, claimId, reason }) {
  if (!caseId || !claimId || !reason?.trim()) throw new Error("recover-case requires --case-id, --claim-id, and --reason");
  const run = resolve(runDir);
  assertNoSymlinkSegments(run, "run root");
  const identity = readJson(resolve(run, RUN_IDENTITY_FILE));
  validate(root, identity, RUN_IDENTITY_SCHEMA_PATH, "run identity");
  const stateFile = statePath(run, caseId);
  if (!existsSync(stateFile)) throw new Error(`case state is missing: ${caseId}`);
  const state = readJson(stateFile);
  validate(root, state, CASE_STATE_SCHEMA_PATH, `${caseId} state`);
  const claim = readClaim(run, caseId);
  if (!claim || claim.claim_id !== claimId) throw new Error("claim ID does not match the active claim");
  if (!claimIsExpired(claim)) throw new Error("claim lease has not expired");
  const attemptRoot = resolve(run, "cases", caseId, "attempts", claim.attempt);
  const resultPath = resolve(attemptRoot, "result.json");
  if (existsSync(resultPath)) throw new Error("claimed attempt already has a terminal result; refusing recovery");
  const entry = { case_id: caseId, adapter_track: state.adapter, condition: state.condition };
  const result = resultRecord({ entry, attempt: claim.attempt, status: "interrupted", failureKind: `stale_claim_recovered:${reason.trim()}` });
  validate(root, result, ATTEMPT_RESULT_SCHEMA_PATH, `${caseId} interrupted result`);
  writeJsonAtomic(resultPath, result);
  writeJsonAtomic(stateFile, { ...state, status: "interrupted", terminal_attempt: claim.attempt, attempt_count: Math.max(state.attempt_count, Number(claim.attempt)) });
  releaseClaim(run, caseId);
  return { case_id: caseId, status: "interrupted" };
}
