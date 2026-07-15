import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  linkSync,
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
import { basename, dirname, parse, resolve, sep } from "node:path";
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
export const ATTEMPT_COMMIT_SCHEMA_PATH = "benchmarks/schemas/portfolio-attempt-commit.schema.json";
export const CLAIM_SCHEMA_PATH = "benchmarks/schemas/portfolio-claim.schema.json";
export const ADAPTER_IDENTITY_SCHEMA_PATH = "benchmarks/schemas/portfolio-adapter-identity.schema.json";
export const OUTPUT_SCHEMA_PATH = "benchmarks/schemas/agent-output.schema.json";

const CLAIM_GRACE_MS = 30_000;
const MAX_PROCESS_OUTPUT_BYTES = 20 * 1024 * 1024;
const MAX_FINAL_OUTPUT_BYTES = 1024 * 1024;
const RUN_IDENTITY_FILE = "run-identity.json";
const TERMINAL_STATUSES = new Set(["completed", "failed", "unavailable", "interrupted", "invalid"]);
const CASE_ID_PATTERN = /^case-[a-f0-9]{16}-[a-f0-9]{16}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ATTEMPT_PATTERN = /^[0-9]{4}$/u;
const WORKSPACE_PARENT_PATTERN = /^ask-portfolio-workspaces-[A-Za-z0-9_-]{6,}$/u;
const DURABLE_SCALAR_MAX_LENGTH = 160;
const WORKSPACE_OWNERSHIP_FILE = "ownership.json";
const RESULT_STAGING_FILE = "result.pending.json";
const TEMP_ROOT = realpathSync(tmpdir());

class RuntimeIntegrityError extends Error {}

class RuntimeContractError extends Error {
  constructor(reason, executable) {
    super(`runtime contract is unconfirmed: ${reason}`);
    this.contractReason = reason;
    this.executable = executable;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path, value, { stagingOwner = null, faultName = null } = {}) {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  if (stagingOwner !== null) assertClaimId(stagingOwner);
  const owner = stagingOwner ? `.${stagingOwner}` : "";
  const temporary = resolve(parent, `.${basename(path)}${owner}.${randomUUID()}.staging`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  if (faultName) fault(faultName);
  renameSync(temporary, path);
}

function writeJsonExclusive(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function writeJsonIdempotent(path, value, label, options = {}) {
  if (existsSync(path)) {
    const existing = readJson(path);
    if (stableCanonicalJson(existing) !== stableCanonicalJson(value)) throw new Error(`${label} already exists with different content`);
    return false;
  }
  writeJsonAtomic(path, value, options);
  return true;
}

function publishJsonExclusive(path, value) {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = resolve(parent, `.${basename(path)}.${randomUUID()}.staging`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
}

function prefixedFileDigest(path) {
  return `sha256:${fileDigest(path)}`;
}

function fault(name) {
  if (process.env.ASK_BENCHMARK_FAULT === name) process.exit(86);
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

function assertCaseId(caseId) {
  if (typeof caseId !== "string" || !CASE_ID_PATTERN.test(caseId)) throw new Error("case ID is invalid");
  return caseId;
}

function assertClaimId(claimId) {
  if (typeof claimId !== "string" || !UUID_PATTERN.test(claimId)) throw new Error("claim ID is invalid");
  return claimId;
}

function assertAttempt(attempt) {
  if (typeof attempt !== "string" || !ATTEMPT_PATTERN.test(attempt)) throw new Error("attempt ID is invalid");
  return attempt;
}

function caseRootPath(runDir, caseId) {
  const casesRoot = resolve(runDir, "cases");
  return assertInside(casesRoot, resolve(casesRoot, assertCaseId(caseId)), `${caseId} case root`);
}

function attemptRootPath(runDir, caseId, attempt) {
  const attemptsRoot = resolve(caseRootPath(runDir, caseId), "attempts");
  const path = assertInside(attemptsRoot, resolve(attemptsRoot, assertAttempt(attempt)), `${caseId} attempt`);
  assertNoSymlinkSegments(path, `${caseId} attempt`);
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

function normalizeDurableScalar(value, fallback = "unavailable") {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, DURABLE_SCALAR_MAX_LENGTH);
  return normalized || fallback;
}

function durableScalarEvidence(rawValue, normalizedValue, fallback) {
  const bytes = Buffer.from(String(rawValue ?? ""));
  return {
    value: normalizeDurableScalar(normalizedValue, fallback),
    digest: `sha256:${sha256(bytes)}`,
    bytes: bytes.length,
  };
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
  if (adapter === "claude" && value.availability === "available") validateClaudeCommandTemplate(value);
  if (value.environment_value_allowlist.some((key) => !value.environment_allowlist.includes(key))) throw new Error("environment value allowlist must be a subset of environment allowlist");
  return { value, digest: sha256(bytes) };
}

function placeholderCount(command, placeholder) {
  return command.reduce((count, part) => count + part.split(placeholder).length - 1, 0);
}

function validateClaudeCommandTemplate(runtime) {
  const contract = runtime.claude_cli;
  if (!contract) throw new Error("available Claude runtime requires a CLI contract");
  for (const placeholder of ["{task}", "{output}", "{sandbox_policy}", "{permission_policy}"]) {
    if (placeholderCount(contract.command, placeholder) !== 1) throw new Error(`Claude CLI contract requires exactly one ${placeholder} placeholder`);
  }
  for (const part of contract.command) {
    if (!/^(?:[^{}]|\{output\}|\{task\}|\{sandbox_policy\}|\{permission_policy\})+$/u.test(part)) throw new Error("Claude CLI contract uses an unsupported placeholder");
  }
  const sandboxIndex = contract.command.indexOf(contract.sandbox_argument);
  const permissionIndex = contract.command.indexOf(contract.permission_argument);
  if (sandboxIndex < 0 || contract.command[sandboxIndex + 1] !== "{sandbox_policy}") throw new Error("Claude CLI contract does not apply the declared sandbox policy");
  if (permissionIndex < 0 || contract.command[permissionIndex + 1] !== "{permission_policy}") throw new Error("Claude CLI contract does not apply the declared permission policy");
  const expected = ["--benchmark-output", "{output}", "--benchmark-task", "{task}", contract.sandbox_argument, "{sandbox_policy}", contract.permission_argument, "{permission_policy}"];
  if (stableCanonicalJson(contract.command) !== stableCanonicalJson(expected)) throw new Error("Claude CLI contract contains unsupported or conflicting arguments");
}

function environmentSnapshotRecord(runtime, values) {
  const valueKeys = new Set(runtime.environment_value_allowlist);
  const entries = [...runtime.environment_allowlist].sort().map((name) => {
    const present = Object.hasOwn(values, name);
    if (!present) return { name, present: false, value: null, digest: null, bytes: 0 };
    const evidence = durableScalarEvidence(values[name], values[name], "present");
    return { name, present: true, value: valueKeys.has(name) ? evidence.value : null, digest: evidence.digest, bytes: evidence.bytes };
  });
  return { digest: canonicalDigest(entries), entries };
}

function captureEnvironment(runtime) {
  const values = {};
  for (const key of runtime.environment_allowlist) {
    if (Object.hasOwn(process.env, key)) values[key] = process.env[key];
  }
  return { runtime, values, record: environmentSnapshotRecord(runtime, values) };
}

function environmentFor(snapshot, extra = {}) {
  if (stableCanonicalJson(environmentSnapshotRecord(snapshot.runtime, snapshot.values)) !== stableCanonicalJson(snapshot.record)) throw new RuntimeIntegrityError("captured environment snapshot changed in memory");
  return { ...snapshot.values, ...extra };
}

export function effectiveCommand(root, runtime) {
  if (runtime.availability === "unavailable") {
    return { argv: [], task_transport: "none", output_transport: "none", output_schema_digest: null };
  }
  if (runtime.adapter === "codex") {
    return {
      argv: [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--model", runtime.model,
        "-c", `model_reasoning_effort=\"${runtime.reasoning_effort}\"`,
        "-c", `approval_policy=\"${runtime.permission_policy}\"`,
        "--sandbox", runtime.sandbox_policy,
        "--output-schema", "{output_schema}",
        "--output-last-message", "{output}",
        "-",
      ],
      task_transport: "stdin",
      output_transport: "file",
      output_schema_digest: `sha256:${fileDigest(schema(root, OUTPUT_SCHEMA_PATH))}`,
    };
  }
  validateClaudeCommandTemplate(runtime);
  return {
    argv: runtime.claude_cli.command,
    task_transport: "file",
    output_transport: "file",
    output_schema_digest: null,
  };
}

function validateAgentExecutable(agentBin) {
  if (!agentBin || !existsSync(agentBin) || !lstatSync(agentBin).isFile()) throw new Error("available runtime requires a regular --agent-bin");
  assertNoSymlinkSegments(agentBin, "agent executable");
  const executable = realpathSync(agentBin);
  return {
    path: executable,
    descriptor: {
      executable_basename: basename(executable),
      executable_sha256: fileDigest(executable),
    },
  };
}

function assertExecutableIdentity(verifiedExecutable) {
  const executable = verifiedExecutable.path;
  try {
    assertNoSymlinkSegments(executable, "agent executable");
    if (!existsSync(executable) || !lstatSync(executable).isFile() || realpathSync(executable) !== executable) throw new Error("agent executable is no longer the verified regular file");
    if (fileDigest(executable) !== verifiedExecutable.descriptor.executable_sha256) throw new Error("agent executable digest changed after runtime identity capture");
  } catch (error) {
    throw new RuntimeIntegrityError(error instanceof Error ? error.message : String(error));
  }
  return executable;
}

function probeAvailableRuntime(runtime, verifiedExecutable, command, environmentSnapshot) {
  const executable = assertExecutableIdentity(verifiedExecutable);
  const version = spawnSync(executable, ["--version"], { encoding: "utf8", env: environmentFor(environmentSnapshot), maxBuffer: 1024 * 1024 });
  assertExecutableIdentity(verifiedExecutable);
  const observedVersionOutput = `${version.stdout ?? ""}${version.stderr ?? ""}`;
  const versionConfirmed = version.status === 0 && observedVersionOutput.includes(runtime.expected_executable_version);
  const versionEvidence = durableScalarEvidence(observedVersionOutput, versionConfirmed ? runtime.expected_executable_version : "unconfirmed", "unconfirmed");
  const executableEvidence = {
    ...verifiedExecutable.descriptor,
    observed_version: versionEvidence.value,
    observed_version_digest: versionEvidence.digest,
    observed_version_bytes: versionEvidence.bytes,
  };
  if (!versionConfirmed) throw new RuntimeContractError("version_mismatch", executableEvidence);
  {
    const helpArgs = runtime.adapter === "codex" ? ["exec", "--help"] : ["--help"];
    assertExecutableIdentity(verifiedExecutable);
    const help = spawnSync(executable, helpArgs, { encoding: "utf8", env: environmentFor(environmentSnapshot), maxBuffer: 1024 * 1024 });
    assertExecutableIdentity(verifiedExecutable);
    const helpOutput = `${help.stdout ?? ""}${help.stderr ?? ""}`;
    const requiredFlags = runtime.adapter === "codex"
      ? ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--model", "--config", "--sandbox", "--output-schema", "--output-last-message"]
      : command.argv.filter((part) => part.startsWith("-") && part !== "-");
    const markerMatches = runtime.adapter === "codex" || helpOutput.includes(runtime.claude_cli.help_marker);
    if (help.status !== 0 || !markerMatches || !requiredFlags.every((flag) => helpOutput.includes(flag))) {
      throw new RuntimeContractError("help_contract_mismatch", executableEvidence);
    }
  }
  return executableEvidence;
}

function adapterIdentity({ adapter, runtime, runtimeConfigDigest, executable, command, environmentSnapshot, availabilityEvidence = null }) {
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
    environment_value_allowlist: runtime.environment_value_allowlist,
    environment_snapshot: environmentSnapshot.record,
    executable,
    effective_command: command,
    effective_command_digest: canonicalDigest(command),
    policy_enforcement: {
      sandbox_policy: runtime.sandbox_policy,
      permission_policy: runtime.permission_policy,
      ephemeral: adapter === "codex",
      user_config_isolated: adapter === "codex",
      rules_isolated: adapter === "codex",
    },
    availability_evidence: availabilityEvidence ?? (runtime.availability === "available" ? "local_version_and_contract_probe" : "declared_unavailable"),
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

function runIdentityPath(runDir) {
  const path = assertInside(runDir, resolve(runDir, RUN_IDENTITY_FILE), "run identity");
  assertNoSymlinkSegments(path, "run identity");
  return path;
}

function adapterIdentityPath(runDir, adapter) {
  if (!["codex", "claude"].includes(adapter)) throw new Error("adapter identity uses an unsupported adapter");
  const adaptersRoot = assertInside(runDir, resolve(runDir, "adapters"), "adapter identity root");
  assertNoSymlinkSegments(adaptersRoot, "adapter identity root");
  if (!existsSync(adaptersRoot) || !lstatSync(adaptersRoot).isDirectory() || lstatSync(adaptersRoot).isSymbolicLink()) throw new Error("adapter identity root must be a real directory");
  const path = assertInside(adaptersRoot, resolve(adaptersRoot, `${adapter}.json`), `${adapter} runtime identity`);
  assertNoSymlinkSegments(path, `${adapter} runtime identity`);
  return path;
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
    active_claim_id: null,
    terminal_attempt: null,
    selection_digest: selection?.selection_digest?.value ?? null,
  };
}

function statePath(runDir, caseId) {
  const path = resolve(caseRootPath(runDir, caseId), "state.json");
  assertNoSymlinkSegments(path, `${caseId} state`);
  return path;
}

function readCaseState(root, runDir, entry) {
  const path = statePath(runDir, entry.case_id);
  if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`case state is missing: ${entry.case_id}`);
  assertNoSymlinkSegments(path, `${entry.case_id} state`);
  const state = readJson(path);
  validate(root, state, CASE_STATE_SCHEMA_PATH, `${entry.case_id} state`);
  if (state.case_id !== entry.case_id || state.adapter !== entry.adapter_track || state.condition !== entry.condition) throw new Error(`${entry.case_id} state identity mismatch`);
  if (state.status === "pending" && (state.attempt_count !== 0 || state.active_claim_id !== null || state.terminal_attempt !== null)) throw new Error(`${entry.case_id} pending state is inconsistent`);
  if (state.status === "active" && (state.attempt_count < 1 || !UUID_PATTERN.test(state.active_claim_id ?? "") || state.terminal_attempt !== null)) throw new Error(`${entry.case_id} active state is inconsistent`);
  if (TERMINAL_STATUSES.has(state.status) && (state.attempt_count < 1 || state.active_claim_id !== null || state.terminal_attempt === null)) throw new Error(`${entry.case_id} terminal state is inconsistent`);
  if ((entry.condition === "adaptive_ask") !== (typeof state.selection_digest === "string")) throw new Error(`${entry.case_id} state selection identity is inconsistent`);
  return state;
}

function writeCaseState(runDir, entry, state) {
  writeJsonAtomic(statePath(runDir, entry.case_id), state);
}

function initializeRun({ root, runDir, identity, plan, selections }) {
  const identityPath = runIdentityPath(runDir);
  if (existsSync(runDir) && readdirSync(runDir).length > 0) {
    if (!existsSync(identityPath)) throw new Error("non-empty run root is missing run identity");
    const existing = readJson(identityPath);
    validate(root, existing, RUN_IDENTITY_SCHEMA_PATH, "run identity");
    if (stableCanonicalJson(existing) !== stableCanonicalJson({ ...identity, run_instance_id: existing.run_instance_id })) throw new Error("run identity changed; refusing resume");
    return { initialized: false, identity: existing };
  }
  const persistedIdentity = { ...identity, run_instance_id: randomUUID() };
  validate(root, persistedIdentity, RUN_IDENTITY_SCHEMA_PATH, "run identity");
  const parent = dirname(runDir);
  const staging = mkdtempSync(resolve(parent, `.${basename(runDir)}.staging-`));
  try {
    writeJsonAtomic(runIdentityPath(staging), persistedIdentity);
    mkdirSync(resolve(staging, "adapters"));
    for (const entry of plan.cases) {
      const caseRoot = resolve(staging, "cases", entry.case_id);
      mkdirSync(resolve(caseRoot, "attempts"), { recursive: true });
      writeJsonAtomic(resolve(caseRoot, "state.json"), initialCaseState(entry, selections.selections.get(entry.case_id)));
    }
    if (existsSync(runDir)) rmdirSync(runDir);
    renameSync(staging, runDir);
    return { initialized: true, identity: persistedIdentity };
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
  const initializedRun = initialize
    ? initializeRun({ root, runDir: safeRunDir, identity, plan, selections })
    : (() => {
      const path = runIdentityPath(safeRunDir);
      if (!existsSync(path)) throw new Error("run identity is missing");
      const existing = readJson(path);
      validate(root, existing, RUN_IDENTITY_SCHEMA_PATH, "run identity");
      if (stableCanonicalJson(existing) !== stableCanonicalJson({ ...identity, run_instance_id: existing.run_instance_id })) throw new Error("run identity changed; refusing verification");
      return { initialized: false, identity: existing };
    })();
  return { repositoryRevision, plan, materialized, selections, identity: initializedRun.identity, runDir: safeRunDir, initialized: initializedRun.initialized };
}

function adapterHasAttempts(runDir, plan, adapter) {
  return plan.cases.some((entry) => entry.adapter_track === adapter && readdirSync(resolve(caseRootPath(runDir, entry.case_id), "attempts")).length > 0);
}

function readAdapterIdentity(root, runDir, adapter) {
  const path = adapterIdentityPath(runDir, adapter);
  if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`${adapter} runtime identity is missing`);
  const identity = readJson(path);
  validate(root, identity, ADAPTER_IDENTITY_SCHEMA_PATH, `${adapter} runtime identity`);
  if (identity.adapter !== adapter || identity.effective_command_digest !== canonicalDigest(identity.effective_command)) throw new Error(`${adapter} runtime identity is invalid`);
  if (identity.environment_snapshot.digest !== canonicalDigest(identity.environment_snapshot.entries)) throw new Error(`${adapter} environment snapshot digest is invalid`);
  assertCanonicalEqual(identity.environment_snapshot.entries.map((entry) => entry.name).sort(), [...identity.environment_allowlist].sort(), `${adapter} environment snapshot names`);
  if (identity.environment_value_allowlist.some((name) => !identity.environment_allowlist.includes(name))) throw new Error(`${adapter} environment value allowlist is invalid`);
  for (const entry of identity.environment_snapshot.entries) {
    if (!entry.present && (entry.value !== null || entry.digest !== null || entry.bytes !== 0)) throw new Error(`${adapter} absent environment entry has evidence`);
    if (entry.present && entry.digest === null) throw new Error(`${adapter} present environment entry is missing its digest`);
    if (entry.value !== null && !identity.environment_value_allowlist.includes(entry.name)) throw new Error(`${adapter} environment snapshot exposes a non-declared value`);
  }
  if (identity.policy_enforcement.sandbox_policy !== identity.sandbox_policy || identity.policy_enforcement.permission_policy !== identity.permission_policy) throw new Error(`${adapter} runtime policy identity is inconsistent`);
  if (identity.availability === "available" && adapter === "codex") {
    const argv = identity.effective_command.argv;
    if (!argv.includes("--ephemeral") || !argv.includes("--ignore-user-config") || !argv.includes("--ignore-rules") || !argv.includes("--skip-git-repo-check") || argv[argv.indexOf("--sandbox") + 1] !== identity.sandbox_policy || !argv.includes(`approval_policy=\"${identity.permission_policy}\"`) || argv[argv.indexOf("--output-schema") + 1] !== "{output_schema}") throw new Error("Codex effective command does not enforce its runtime policy");
  }
  if (identity.availability === "available" && adapter === "claude") {
    const argv = identity.effective_command.argv;
    if (placeholderCount(argv, "{task}") !== 1 || placeholderCount(argv, "{output}") !== 1 || placeholderCount(argv, "{sandbox_policy}") !== 1 || placeholderCount(argv, "{permission_policy}") !== 1) throw new Error("Claude effective command contract is incomplete");
  }
  return identity;
}

function ensureAdapterIdentity({ root, runDir, plan, adapter, runtimeConfig, verifiedExecutable, environmentSnapshot }) {
  let effectiveRuntime = runtimeConfig.value;
  let command = effectiveCommand(root, effectiveRuntime);
  let executable = null;
  let availabilityEvidence = null;
  if (effectiveRuntime.availability === "available") {
    try {
      executable = probeAvailableRuntime(effectiveRuntime, verifiedExecutable, command, environmentSnapshot);
    } catch (error) {
      if (error instanceof RuntimeIntegrityError) throw error;
      effectiveRuntime = {
        ...effectiveRuntime,
        availability: "unavailable",
        unavailable_reason: `runtime_contract_unconfirmed:${error instanceof RuntimeContractError ? error.contractReason : "probe_failed"}`,
      };
      executable = error instanceof RuntimeContractError ? error.executable : null;
      command = effectiveCommand(root, effectiveRuntime);
      availabilityEvidence = "contract_probe_failed";
    }
  }
  const identity = adapterIdentity({ adapter, runtime: effectiveRuntime, runtimeConfigDigest: runtimeConfig.digest, executable, command, environmentSnapshot, availabilityEvidence });
  const path = adapterIdentityPath(runDir, adapter);
  if (!existsSync(path) && adapterHasAttempts(runDir, plan, adapter)) throw new Error(`${adapter} runtime identity is missing after attempts were created; refusing replacement`);
  const published = publishJsonExclusive(path, identity);
  const existing = published ? identity : readAdapterIdentity(root, runDir, adapter);
  if (stableCanonicalJson(existing) !== stableCanonicalJson(identity)) throw new Error(`${adapter} runtime identity changed; refusing resume`);
  return { identity: existing, digest: canonicalDigest(existing) };
}

function claimPath(runDir, caseId) {
  const path = resolve(caseRootPath(runDir, caseId), "claim");
  assertNoSymlinkSegments(path, `${caseId} claim`);
  return path;
}

function claimStagingPath(runDir, caseId, claimId) {
  const caseRoot = caseRootPath(runDir, caseId);
  const path = assertInside(caseRoot, resolve(caseRoot, `.claim-${assertClaimId(claimId)}.staging`), `${caseId} staged claim`);
  assertNoSymlinkSegments(path, `${caseId} staged claim`);
  return path;
}

function readClaim(root, runDir, caseId) {
  const directory = claimPath(runDir, caseId);
  if (!existsSync(directory)) return null;
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error(`${caseId} claim is invalid`);
  const path = resolve(directory, "claim.json");
  if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`${caseId} claim is incomplete; explicit recovery is required`);
  const claim = readJson(path);
  validate(root, claim, CLAIM_SCHEMA_PATH, `${caseId} claim`);
  if (claim.case_id !== caseId) throw new Error(`${caseId} claim identity mismatch`);
  if ((claim.condition === "adaptive_ask") !== (claim.selection !== null)) throw new Error(`${caseId} claim selection identity is inconsistent`);
  return claim;
}

function readStagedClaim(root, runDir, caseId, claimId) {
  const directory = claimStagingPath(runDir, caseId, claimId);
  const path = resolve(directory, "claim.json");
  if (!existsSync(path) || !lstatSync(path).isFile()) return null;
  const claim = readJson(path);
  validate(root, claim, CLAIM_SCHEMA_PATH, `${caseId} staged claim`);
  if (claim.case_id !== caseId || claim.claim_id !== claimId) throw new Error("staged claim identity mismatch");
  if ((claim.condition === "adaptive_ask") !== (claim.selection !== null)) throw new Error("staged claim selection identity is inconsistent");
  return { claim, directory };
}

function claimIsExpired(claim, now = Date.now()) {
  return Number.isFinite(Date.parse(claim.lease_expires_at)) && Date.parse(claim.lease_expires_at) < now;
}

function inputIdentityFor(context, entry) {
  return {
    plan_id: context.identity.plan.id,
    plan_digest: context.identity.plan.digest,
    materialization_manifest_digest: context.materialized.manifestDigest,
    frozen_input_digest: context.materialized.casesById.get(entry.case_id).frozen_input_digest,
  };
}

function selectionIdentityFor(context, entry) {
  const selection = context.selections.selections.get(entry.case_id);
  return selection ? { digest: selection.selection_digest.value, selected_mechanisms: selection.selected_mechanisms, required_gates: selection.required_gates } : null;
}

function workspaceOwnership(claim, runIdentity) {
  if (claim.run_instance_id !== runIdentity.run_instance_id) throw new Error("claim run instance does not match workspace owner");
  return {
    schema_version: "1.0.0",
    claim_id: assertClaimId(claim.claim_id),
    case_id: assertCaseId(claim.case_id),
    run_instance_id: assertClaimId(claim.run_instance_id),
    workspace_parent: claim.workspace_parent,
    workspace_token: assertClaimId(claim.workspace_token),
  };
}

function assertEphemeralWorkspaceOwnership(claim, runIdentity) {
  if (!WORKSPACE_PARENT_PATTERN.test(claim.workspace_parent ?? "")) throw new Error("claim workspace parent is invalid");
  const parent = assertInside(TEMP_ROOT, resolve(TEMP_ROOT, claim.workspace_parent), "claim workspace parent");
  assertNoSymlinkSegments(parent, "claim workspace parent");
  if (!existsSync(parent)) return null;
  if (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink()) throw new Error("claim workspace parent is not a real directory");
  const markerPath = assertInside(parent, resolve(parent, WORKSPACE_OWNERSHIP_FILE), "claim workspace ownership marker");
  assertNoSymlinkSegments(markerPath, "claim workspace ownership marker");
  if (!existsSync(markerPath) || !lstatSync(markerPath).isFile()) throw new Error("claim workspace ownership marker is missing or invalid");
  assertCanonicalEqual(readJson(markerPath), workspaceOwnership(claim, runIdentity), "claim workspace ownership");
  return parent;
}

function acquireClaim({ root, context, entry, attempt, runtime, adapter }) {
  const claimId = randomUUID();
  const directory = claimPath(context.runDir, entry.case_id);
  const staging = claimStagingPath(context.runDir, entry.case_id, claimId);
  const workspaceToken = randomUUID();
  const workspaceParentPath = mkdtempSync(resolve(TEMP_ROOT, "ask-portfolio-workspaces-"));
  chmodSync(workspaceParentPath, 0o700);
  const workspaceParent = basename(workspaceParentPath);
  mkdirSync(staging, { recursive: false });
  const acquiredAt = new Date().toISOString();
  const injectedLeaseMs = process.env.ASK_BENCHMARK_FAULT ? Number(process.env.ASK_BENCHMARK_FAULT_LEASE_MS) : Number.NaN;
  const leaseMs = Number.isFinite(injectedLeaseMs) ? injectedLeaseMs : runtime.case_timeout_ms + CLAIM_GRACE_MS;
  const claim = {
    schema_version: "1.0.0",
    run_instance_id: context.identity.run_instance_id,
    claim_id: claimId,
    case_id: entry.case_id,
    attempt,
    adapter: entry.adapter_track,
    condition: entry.condition,
    worker_id: `${process.pid}`,
    pid: process.pid,
    acquired_at: acquiredAt,
    lease_expires_at: new Date(Date.now() + leaseMs).toISOString(),
    workspace_parent: workspaceParent,
    workspace_token: workspaceToken,
    input_identity: inputIdentityFor(context, entry),
    selection: selectionIdentityFor(context, entry),
    runtime_identity_digest: adapter.digest,
    effective_command_digest: adapter.identity.effective_command_digest,
    environment_snapshot_digest: adapter.identity.environment_snapshot.digest,
  };
  validate(root, claim, CLAIM_SCHEMA_PATH, `${entry.case_id} claim`);
  try {
    writeJsonExclusive(resolve(workspaceParentPath, WORKSPACE_OWNERSHIP_FILE), workspaceOwnership(claim, context.identity));
    writeJsonExclusive(resolve(staging, "claim.json"), claim);
    fault("after_claim_record_written");
    fault("after_claim_staged");
    renameSync(staging, directory);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    removeEphemeralWorkspace(claim, context.identity);
    if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) return null;
    throw error;
  }
  fault("after_claim_published");
  return claim;
}

function releaseClaim(root, runDir, caseId, claimId) {
  const path = claimPath(runDir, caseId);
  if (!existsSync(path)) return false;
  const claim = readClaim(root, runDir, caseId);
  if (claim.claim_id !== claimId) throw new Error("claim ID changed before release");
  rmSync(path, { recursive: true, force: true });
  return true;
}

function nextAttempt(runDir, entry) {
  const directory = resolve(caseRootPath(runDir, entry.case_id), "attempts");
  assertNoSymlinkSegments(directory, `${entry.case_id} attempts`);
  const existing = readdirSync(directory, { withFileTypes: true })
    .filter((item) => item.isDirectory() && /^[0-9]{4}$/u.test(item.name))
    .map((item) => Number(item.name));
  return String((Math.max(0, ...existing) + 1)).padStart(4, "0");
}

function ephemeralWorkspacePath(claim) {
  if (!WORKSPACE_PARENT_PATTERN.test(claim.workspace_parent ?? "")) throw new Error("claim workspace parent is invalid");
  assertClaimId(claim.workspace_token);
  const parent = assertInside(TEMP_ROOT, resolve(TEMP_ROOT, claim.workspace_parent), "claim workspace parent");
  const path = assertInside(parent, resolve(parent, claim.workspace_token), "claim workspace");
  assertNoSymlinkSegments(path, "claim workspace");
  return path;
}

function removeEphemeralWorkspace(claim, runIdentity) {
  const workspace = ephemeralWorkspacePath(claim);
  const parent = dirname(workspace);
  if (!existsSync(parent)) return;
  assertEphemeralWorkspaceOwnership(claim, runIdentity);
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
  if (existsSync(parent)) {
    assertNoSymlinkSegments(parent, "claim workspace parent");
    rmSync(parent, { recursive: true, force: true });
  }
}

function copyWorkspace({ materializedRoot, record, claim, runIdentity }) {
  const sourceRoot = resolve(materializedRoot, record.case_id);
  assertEphemeralWorkspaceOwnership(claim, runIdentity);
  const ephemeralRoot = ephemeralWorkspacePath(claim);
  mkdirSync(ephemeralRoot, { recursive: false, mode: 0o700 });
  const workspace = resolve(ephemeralRoot, "workspace");
  mkdirSync(workspace, { mode: 0o700 });
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
  return { ephemeralRoot, workspace };
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

function isolatedCodexHome(environment) {
  const sourceHome = environment.CODEX_HOME ? resolve(environment.CODEX_HOME) : environment.HOME ? resolve(environment.HOME, ".codex") : null;
  const home = mkdtempSync(resolve(tmpdir(), "ask-portfolio-codex-home-"));
  chmodSync(home, 0o700);
  const auth = sourceHome ? resolve(sourceHome, "auth.json") : null;
  if (auth && existsSync(auth) && lstatSync(auth).isFile()) symlinkSync(auth, resolve(home, "auth.json"));
  return home;
}

function materializeCommand(root, command, runtime, outputTemporary) {
  return command.argv.map((part) => part
    .replaceAll("{output}", outputTemporary)
    .replaceAll("{output_schema}", resolve(root, OUTPUT_SCHEMA_PATH))
    .replaceAll("{task}", "BENCHMARK_TASK.md")
    .replaceAll("{sandbox_policy}", runtime.sandbox_policy)
    .replaceAll("{permission_policy}", runtime.permission_policy));
}

function executeAgent({ root, runtime, executable, workspace, outputTemporary, command, environmentSnapshot }) {
  const task = readFileSync(resolve(workspace, "BENCHMARK_TASK.md"), "utf8");
  const environment = environmentFor(environmentSnapshot);
  if (runtime.adapter === "codex") {
    const codexHome = isolatedCodexHome(environment);
    try {
      return spawnSync(executable, materializeCommand(root, command, runtime, outputTemporary), {
        cwd: workspace,
        encoding: "utf8",
        input: task,
        env: { ...environment, CODEX_HOME: codexHome },
        timeout: runtime.case_timeout_ms,
        maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
      });
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  }
  const args = materializeCommand(root, command, runtime, outputTemporary);
  return spawnSync(executable, args, {
    cwd: workspace,
    encoding: "utf8",
    env: environment,
    timeout: runtime.case_timeout_ms,
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
  });
}

function executeVerifiedAgent({ verifiedExecutable, ...options }) {
  const executable = assertExecutableIdentity(verifiedExecutable);
  const result = executeAgent({ ...options, executable });
  assertExecutableIdentity(verifiedExecutable);
  return result;
}

function inspectFinal(root, outputTemporary) {
  if (!existsSync(outputTemporary) || !lstatSync(outputTemporary).isFile()) throw new Error("agent final structured output is missing");
  if (statSync(outputTemporary).size > MAX_FINAL_OUTPUT_BYTES) throw new Error("agent final structured output exceeds the maximum byte size");
  const bytes = readFileSync(outputTemporary);
  const final = JSON.parse(bytes);
  validate(root, final, OUTPUT_SCHEMA_PATH, "agent final structured output");
  return { record: { path: "final.json", sha256: sha256(bytes), bytes: bytes.length }, bytes };
}

function publishFinal(root, attemptRoot, source, record, claimId) {
  assertClaimId(claimId);
  const destination = resolve(attemptRoot, "final.json");
  assertInside(attemptRoot, destination, "attempt final output");
  assertNoSymlinkSegments(destination, "attempt final output");
  if (existsSync(destination)) {
    const size = statSync(destination).size;
    if (size > MAX_FINAL_OUTPUT_BYTES || size !== record.bytes || fileDigest(destination) !== record.sha256) throw new Error("attempt final output already exists with different content");
    validate(root, readJson(destination), OUTPUT_SCHEMA_PATH, "durable agent final structured output");
    return false;
  }
  const inspected = inspectFinal(root, source);
  if (stableCanonicalJson(inspected.record) !== stableCanonicalJson(record)) throw new Error("agent final structured output identity changed");
  const staging = resolve(attemptRoot, `.final.json.${claimId}.${randomUUID()}.staging`);
  writeFileSync(staging, inspected.bytes, { flag: "wx" });
  fault("after_final_staged");
  renameSync(staging, destination);
  return true;
}

function normalizedProjection(projection) {
  return {
    status: projection.status,
    selected_skills: projection.selected_skills ?? [],
    inventory: projection.inventory ?? [],
    source_digests: projection.source_digests ?? [],
    projection_fingerprint: projection.projection_fingerprint ?? null,
    capability_downgrades: projection.capability_downgrades ?? [],
  };
}

function requestRecord({ entry, attempt, claim, projection }) {
  return {
    schema_version: "1.0.0",
    kind: "request",
    run_instance_id: claim.run_instance_id,
    case_id: entry.case_id,
    attempt,
    adapter: entry.adapter_track,
    condition: entry.condition,
    claim: {
      id: claim.claim_id,
      lease_expires_at: claim.lease_expires_at,
      workspace_parent: claim.workspace_parent,
      workspace_token: claim.workspace_token,
    },
    input_identity: claim.input_identity,
    selection: claim.selection,
    projection: normalizedProjection(projection),
    agent: {
      adapter: entry.adapter_track,
      runtime_identity_digest: claim.runtime_identity_digest,
      effective_command_digest: claim.effective_command_digest,
      environment_snapshot_digest: claim.environment_snapshot_digest,
      autonomous_agents_started: 0,
    },
  };
}

function resultRecord({ entry, attempt, claim, requestPath, status, processResult = null, finalOutput = null, failureKind = null, recoveryReason = null }) {
  const stdout = streamEvidence(processResult?.stdout ?? "");
  const stderr = streamEvidence(processResult?.stderr ?? "");
  return {
    schema_version: "1.0.0",
    kind: "result",
    run_instance_id: claim.run_instance_id,
    case_id: entry.case_id,
    attempt,
    adapter: entry.adapter_track,
    condition: entry.condition,
    runtime_identity_digest: claim.runtime_identity_digest,
    effective_command_digest: claim.effective_command_digest,
    request_sha256: prefixedFileDigest(requestPath),
    status,
    exit_code: processResult?.status ?? null,
    duration_ms: processResult?.duration_ms ?? null,
    failure_kind: failureKind,
    recovery_reason: recoveryReason,
    final_output: finalOutput,
    stdout,
    stderr,
    event_counts: { json_lines: jsonLineCount(processResult?.stdout ?? "") },
  };
}

function commitRecord({ claim, result, requestPath, resultPath }) {
  return {
    schema_version: "1.0.0",
    kind: "terminal_commit",
    run_instance_id: claim.run_instance_id,
    claim_id: claim.claim_id,
    claim_lease_expires_at: claim.lease_expires_at,
    case_id: claim.case_id,
    attempt: claim.attempt,
    adapter: claim.adapter,
    condition: claim.condition,
    status: result.status,
    runtime_identity_digest: claim.runtime_identity_digest,
    effective_command_digest: claim.effective_command_digest,
    request_sha256: prefixedFileDigest(requestPath),
    result_sha256: prefixedFileDigest(resultPath),
  };
}

function completeCase({ root, runDir, entry, state, claim, attempt, attemptRoot, result, finalSource = null }) {
  const requestPath = resolve(attemptRoot, "request.json");
  assertNoSymlinkSegments(requestPath, `${entry.case_id} attempt request`);
  if (!existsSync(requestPath)) throw new Error("terminal attempt request is missing");
  validate(root, result, ATTEMPT_RESULT_SCHEMA_PATH, `${entry.case_id} attempt result`);
  const resultPath = resolve(attemptRoot, "result.json");
  assertNoSymlinkSegments(resultPath, `${entry.case_id} attempt result`);
  if (result.status === "completed") {
    const pendingResultPath = resolve(attemptRoot, RESULT_STAGING_FILE);
    assertNoSymlinkSegments(pendingResultPath, `${entry.case_id} pending attempt result`);
    writeJsonIdempotent(pendingResultPath, result, `${entry.case_id} pending attempt result`, { stagingOwner: claim.claim_id, faultName: "after_pending_result_staged" });
    const source = finalSource ?? resolve(ephemeralWorkspacePath(claim), "agent-final.json");
    publishFinal(root, attemptRoot, source, result.final_output, claim.claim_id);
    fault("after_final_published");
    if (existsSync(resultPath)) {
      writeJsonIdempotent(resultPath, result, `${entry.case_id} attempt result`, { stagingOwner: claim.claim_id });
      rmSync(pendingResultPath, { force: true });
    } else {
      renameSync(pendingResultPath, resultPath);
    }
  } else {
    writeJsonIdempotent(resultPath, result, `${entry.case_id} attempt result`, { stagingOwner: claim.claim_id });
  }
  fault("after_result_published");
  const commit = commitRecord({ claim, result, requestPath, resultPath });
  validate(root, commit, ATTEMPT_COMMIT_SCHEMA_PATH, `${entry.case_id} terminal commit`);
  const commitPath = resolve(attemptRoot, "commit.json");
  assertNoSymlinkSegments(commitPath, `${entry.case_id} terminal commit`);
  writeJsonIdempotent(commitPath, commit, `${entry.case_id} terminal commit`, { stagingOwner: claim.claim_id, faultName: "after_commit_staged" });
  const terminalState = {
    ...state,
    status: result.status,
    attempt_count: Math.max(state.attempt_count, Number(attempt)),
    active_claim_id: null,
    terminal_attempt: attempt,
    selection_digest: claim.selection?.digest ?? null,
  };
  validate(root, terminalState, CASE_STATE_SCHEMA_PATH, `${entry.case_id} terminal state`);
  writeCaseState(runDir, entry, terminalState);
  fault("after_state_published");
  releaseClaim(root, runDir, entry.case_id, claim.claim_id);
  return terminalState;
}

function assertCanonicalEqual(actual, expected, label) {
  if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${label} mismatch`);
}

function validateTerminalAttempt({ root, context, entry, attempt }) {
  const attemptRoot = attemptRootPath(context.runDir, entry.case_id, attempt);
  const requestPath = resolve(attemptRoot, "request.json");
  const resultPath = resolve(attemptRoot, "result.json");
  const commitPath = resolve(attemptRoot, "commit.json");
  for (const [path, label] of [[requestPath, "request"], [resultPath, "result"], [commitPath, "terminal commit"]]) {
    assertNoSymlinkSegments(path, `${entry.case_id} ${label}`);
    if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`${entry.case_id} ${label} is missing`);
  }
  const request = readJson(requestPath);
  const result = readJson(resultPath);
  const commit = readJson(commitPath);
  validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${entry.case_id} request`);
  validate(root, result, ATTEMPT_RESULT_SCHEMA_PATH, `${entry.case_id} result`);
  validate(root, commit, ATTEMPT_COMMIT_SCHEMA_PATH, `${entry.case_id} terminal commit`);
  const adapterIdentity = readAdapterIdentity(root, context.runDir, entry.adapter_track);
  const runtimeIdentityDigest = canonicalDigest(adapterIdentity);
  const expectedInput = inputIdentityFor(context, entry);
  const expectedSelection = selectionIdentityFor(context, entry);
  if (request.run_instance_id !== context.identity.run_instance_id || request.case_id !== entry.case_id || request.attempt !== attempt || request.adapter !== entry.adapter_track || request.condition !== entry.condition) throw new Error(`${entry.case_id} request identity mismatch`);
  if (request.claim.id !== commit.claim_id || request.claim.lease_expires_at !== commit.claim_lease_expires_at) throw new Error(`${entry.case_id} request claim evidence mismatch`);
  if ((entry.condition === "adaptive_ask") !== (request.selection !== null)) throw new Error(`${entry.case_id} request selection shape mismatch`);
  assertCanonicalEqual(request.input_identity, expectedInput, `${entry.case_id} request input identity`);
  assertCanonicalEqual(request.selection, expectedSelection, `${entry.case_id} request selection`);
  if (request.agent.adapter !== entry.adapter_track || request.agent.runtime_identity_digest !== runtimeIdentityDigest || request.agent.effective_command_digest !== adapterIdentity.effective_command_digest || request.agent.environment_snapshot_digest !== adapterIdentity.environment_snapshot.digest) throw new Error(`${entry.case_id} request runtime identity mismatch`);
  if (result.run_instance_id !== context.identity.run_instance_id || result.case_id !== entry.case_id || result.attempt !== attempt || result.adapter !== entry.adapter_track || result.condition !== entry.condition) throw new Error(`${entry.case_id} result identity mismatch`);
  if (result.status === "completed") {
    if (result.exit_code !== 0 || result.failure_kind !== null || result.recovery_reason !== null || result.final_output === null) throw new Error(`${entry.case_id} completed result semantics mismatch`);
  } else if (result.failure_kind === null || result.final_output !== null || (result.failure_kind === "stale_claim_recovered") !== (result.recovery_reason !== null)) throw new Error(`${entry.case_id} terminal failure result semantics mismatch`);
  if (result.runtime_identity_digest !== runtimeIdentityDigest || result.effective_command_digest !== adapterIdentity.effective_command_digest || result.request_sha256 !== prefixedFileDigest(requestPath)) throw new Error(`${entry.case_id} result evidence mismatch`);
  if (commit.run_instance_id !== context.identity.run_instance_id || commit.case_id !== entry.case_id || commit.attempt !== attempt || commit.adapter !== entry.adapter_track || commit.condition !== entry.condition || commit.status !== result.status) throw new Error(`${entry.case_id} terminal commit identity mismatch`);
  if (commit.runtime_identity_digest !== runtimeIdentityDigest || commit.effective_command_digest !== adapterIdentity.effective_command_digest || commit.request_sha256 !== prefixedFileDigest(requestPath) || commit.result_sha256 !== prefixedFileDigest(resultPath)) throw new Error(`${entry.case_id} terminal commit evidence mismatch`);
  const expectedInventory = result.status === "completed" ? ["commit.json", "final.json", "request.json", "result.json"] : ["commit.json", "request.json", "result.json"];
  const inventory = readdirSync(attemptRoot).sort();
  assertCanonicalEqual(inventory, expectedInventory, `${entry.case_id} terminal attempt inventory`);
  if (result.status === "completed") {
    const finalPath = resolve(attemptRoot, result.final_output.path);
    assertInside(attemptRoot, finalPath, `${entry.case_id} final output`);
    assertNoSymlinkSegments(finalPath, `${entry.case_id} final output`);
    const size = statSync(finalPath).size;
    if (size > MAX_FINAL_OUTPUT_BYTES || size !== result.final_output.bytes || fileDigest(finalPath) !== result.final_output.sha256) throw new Error(`${entry.case_id} final output digest mismatch`);
    validate(root, readJson(finalPath), OUTPUT_SCHEMA_PATH, `${entry.case_id} completed output`);
  }
  return { request, result, commit };
}

function validateTerminalCase({ root, context, entry, state }) {
  if (!TERMINAL_STATUSES.has(state.status) || !state.terminal_attempt) throw new Error(`${entry.case_id} terminal state is invalid`);
  if (Number(state.terminal_attempt) < 1 || Number(state.terminal_attempt) > state.attempt_count) throw new Error(`${entry.case_id} terminal attempt is outside the attempt count`);
  if (state.terminal_attempt !== String(state.attempt_count).padStart(4, "0")) throw new Error(`${entry.case_id} terminal state does not reference the latest attempt`);
  for (let number = 1; number <= state.attempt_count; number += 1) {
    const attempt = String(number).padStart(4, "0");
    const artifacts = validateTerminalAttempt({ root, context, entry, attempt });
    if (attempt === state.terminal_attempt && artifacts.result.status !== state.status) throw new Error(`${entry.case_id} terminal status mismatch`);
  }
  const expectedSelection = selectionIdentityFor(context, entry)?.digest ?? null;
  if (state.selection_digest !== expectedSelection) throw new Error(`${entry.case_id} state selection digest mismatch`);
  return true;
}

function claimPublishedBeforeState(state, claim) {
  if (!["pending", "failed", "interrupted"].includes(state.status)) return false;
  return Number(claim.attempt) === state.attempt_count + 1;
}

function preflightCaseClaim({ root, context, entry, state }) {
  const claim = readClaim(root, context.runDir, entry.case_id);
  if (!claim) {
    if (state.status === "active") throw new Error(`${entry.case_id} active state is missing its bound claim; explicit recovery is required`);
    return null;
  }
  validateClaimAgainstContext({ root, context, entry, claim });
  const claimAttempt = Number(claim.attempt);
  const publishedBeforeState = claimPublishedBeforeState(state, claim);
  const boundActive = state.status === "active"
    && state.active_claim_id === claim.claim_id
    && state.attempt_count === claimAttempt;
  if (!publishedBeforeState && !boundActive) throw new Error(`${entry.case_id} claim does not match case state`);
  if (claimIsExpired(claim)) throw new Error(`${entry.case_id} has an expired claim; run recover-case with claim ID ${claim.claim_id}`);
  return claim;
}

function markUnavailable({ root, context, entry, state, runtime, adapter }) {
  if (["completed", "unavailable"].includes(state.status)) return;
  if (preflightCaseClaim({ root, context, entry, state })) return "active";
  const attempt = nextAttempt(context.runDir, entry);
  const claim = acquireClaim({ root, context, entry, attempt, runtime, adapter });
  if (!claim) return "active";
  const activeState = { ...state, status: "active", attempt_count: Number(attempt), active_claim_id: claim.claim_id, terminal_attempt: null };
  writeCaseState(context.runDir, entry, activeState);
  const attemptRoot = attemptRootPath(context.runDir, entry.case_id, attempt);
  mkdirSync(attemptRoot, { recursive: false });
  const request = requestRecord({ entry, attempt, claim, projection: { status: "runtime_unavailable" } });
  validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${entry.case_id} unavailable request`);
  const requestPath = resolve(attemptRoot, "request.json");
  writeJsonAtomic(requestPath, request, { stagingOwner: claim.claim_id, faultName: "after_request_staged" });
  completeCase({ root, runDir: context.runDir, entry, state: activeState, claim, attempt, attemptRoot, result: resultRecord({ entry, attempt, claim, requestPath, status: "unavailable", failureKind: "runtime_unavailable" }) });
  removeEphemeralWorkspace(claim, context.identity);
  return "unavailable";
}

function executeCase({ root, config, context, entry, runtime, verifiedExecutable, adapter, environmentSnapshot }) {
  const state = readCaseState(root, context.runDir, entry);
  if (TERMINAL_STATUSES.has(state.status)) validateTerminalCase({ root, context, entry, state });
  if (preflightCaseClaim({ root, context, entry, state })) return "active";
  if (TERMINAL_STATUSES.has(state.status) && (["completed", "unavailable", "invalid"].includes(state.status) || (state.status === "failed" && !context.retryFailed))) return state.status;
  const attempt = nextAttempt(context.runDir, entry);
  const claim = acquireClaim({ root, context, entry, attempt, runtime, adapter });
  if (!claim) return "active";
  const activeState = { ...state, status: "active", attempt_count: Number(attempt), active_claim_id: claim.claim_id, terminal_attempt: null };
  writeCaseState(context.runDir, entry, activeState);
  const attemptRoot = attemptRootPath(context.runDir, entry.case_id, attempt);
  let processResult = null;
  let ephemeralRoot = null;
  let projection = { status: "attempt_setup_failed" };
  try {
    mkdirSync(attemptRoot, { recursive: false });
    let selection = context.selections.selections.get(entry.case_id) ?? null;
    if (entry.condition === "adaptive_ask") {
      const observed = verifyAdaptiveSelection({ root, config, planPath: context.planPath, materializedPath: context.materializedPath, stateDir: context.selectionState, caseId: entry.case_id, repositoryRevision: context.repositoryRevision });
      const expected = context.selections.selections.get(entry.case_id)?.selection_digest.value;
      if (observed.selection_digest.value !== expected) throw new Error("Adaptive selection changed before execution");
    }
    const copied = copyWorkspace({ materializedRoot: context.materializedPath, record: context.materialized.casesById.get(entry.case_id), claim, runIdentity: context.identity });
    ephemeralRoot = copied.ephemeralRoot;
    const workspace = copied.workspace;
    fault("after_workspace_created");
    projection = selection ? applyAdaptiveSelection({ root, adapter: entry.adapter_track, selection, workspace }) : { status: "materialized" };
    if (selection) {
      const beforeSpawn = verifyAdaptiveSelection({ root, config, planPath: context.planPath, materializedPath: context.materializedPath, stateDir: context.selectionState, caseId: entry.case_id, repositoryRevision: context.repositoryRevision });
      if (beforeSpawn.selection_digest.value !== claim.selection.digest) throw new Error("Adaptive selection changed before process spawn");
    }
    const request = requestRecord({ entry, attempt, claim, projection });
    validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${entry.case_id} attempt request`);
    const requestPath = resolve(attemptRoot, "request.json");
    writeJsonAtomic(requestPath, request, { stagingOwner: claim.claim_id, faultName: "after_request_staged" });
    const temporaryOutput = resolve(ephemeralRoot, "agent-final.json");
    const started = process.hrtime.bigint();
    const raw = executeVerifiedAgent({ root, runtime, verifiedExecutable, workspace, outputTemporary: temporaryOutput, command: adapter.identity.effective_command, environmentSnapshot });
    processResult = { ...raw, duration_ms: Math.round(Number(process.hrtime.bigint() - started) / 1_000_000) };
    if (selection) {
      const afterSpawn = verifyAdaptiveSelection({ root, config, planPath: context.planPath, materializedPath: context.materializedPath, stateDir: context.selectionState, caseId: entry.case_id, repositoryRevision: context.repositoryRevision });
      if (afterSpawn.selection_digest.value !== claim.selection.digest) throw new Error("Adaptive selection changed during process execution");
    }
    if (processResult.error?.code === "ETIMEDOUT") throw new Error("case timeout");
    if (processResult.status !== 0) throw new Error(`agent exited ${processResult.status}`);
    const finalOutput = inspectFinal(root, temporaryOutput).record;
    completeCase({ root, runDir: context.runDir, entry, state: activeState, claim, attempt, attemptRoot, result: resultRecord({ entry, attempt, claim, requestPath, status: "completed", processResult, finalOutput }), finalSource: temporaryOutput });
    return "completed";
  } catch (error) {
    if (error instanceof RuntimeIntegrityError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const invalid = /Adaptive selection|projection|materialized source|selection changed/u.test(message);
    const temporaryOutput = ephemeralRoot ? resolve(ephemeralRoot, "agent-final.json") : null;
    if (temporaryOutput && existsSync(temporaryOutput)) rmSync(temporaryOutput, { force: true });
    const requestPath = resolve(attemptRoot, "request.json");
    if (existsSync(attemptRoot) && !existsSync(requestPath)) {
      const request = requestRecord({ entry, attempt, claim, projection });
      validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${entry.case_id} failed attempt request`);
      writeJsonAtomic(requestPath, request, { stagingOwner: claim.claim_id, faultName: "after_request_staged" });
    }
    const result = resultRecord({
      entry,
      attempt,
      claim,
      requestPath,
      status: invalid ? "invalid" : "failed",
      processResult,
      failureKind: /timeout/u.test(message) ? "timeout" : invalid ? "invalid_input_or_selection" : "agent_failure",
    });
    if (existsSync(attemptRoot)) completeCase({ root, runDir: context.runDir, entry, state: activeState, claim, attempt, attemptRoot, result });
    else releaseClaim(root, context.runDir, entry.case_id, claim.claim_id);
    return result.status;
  } finally {
    removeEphemeralWorkspace(claim, context.identity);
  }
}

export function executePortfolio({ root, config, planPath, materializedPath, selectionState, runDir, adapter, runtimeConfigPath, agentBin, caseId = null, maxCases = null, retryFailed = false }) {
  if (!adapter || !["codex", "claude"].includes(adapter)) throw new Error("execute-portfolio requires --adapter codex or claude");
  if (maxCases !== null && (!Number.isInteger(maxCases) || maxCases < 1)) throw new Error("--max-cases must be a positive integer");
  const runtimeConfig = readRuntimeConfig(root, runtimeConfigPath, adapter);
  const environmentSnapshot = captureEnvironment(runtimeConfig.value);
  const verifiedExecutable = runtimeConfig.value.availability === "available" ? validateAgentExecutable(agentBin) : null;
  const context = loadExecutionContext({ root, config, planPath, materializedPath, selectionState, runDir });
  fault("after_run_initialized");
  context.planPath = planPath;
  context.materializedPath = materializedPath;
  context.selectionState = selectionState;
  context.retryFailed = retryFailed;
  const runtimeIdentity = ensureAdapterIdentity({ root, runDir: context.runDir, plan: context.plan, adapter, runtimeConfig, verifiedExecutable, environmentSnapshot });
  const cases = context.plan.cases.filter((entry) => entry.adapter_track === adapter && (!caseId || entry.case_id === caseId));
  if (caseId && cases.length === 0) throw new Error(`case ${caseId} does not belong to adapter ${adapter}`);
  const outcomes = [];
  let executed = 0;
  if (runtimeIdentity.identity.availability === "unavailable") {
    for (const entry of cases) {
      const state = readCaseState(root, context.runDir, entry);
      if (TERMINAL_STATUSES.has(state.status)) validateTerminalCase({ root, context, entry, state });
      if (["completed", "unavailable", "invalid"].includes(state.status)) {
        outcomes.push({ case_id: entry.case_id, status: state.status });
        continue;
      }
      if (maxCases !== null && executed >= maxCases) break;
      const status = markUnavailable({ root, context, entry, state, runtime: { ...runtimeConfig.value, availability: "unavailable", unavailable_reason: runtimeIdentity.identity.unavailable_reason }, adapter: runtimeIdentity });
      outcomes.push({ case_id: entry.case_id, status });
      if (status !== "active") executed += 1;
    }
  } else {
    for (const entry of cases) {
      const state = readCaseState(root, context.runDir, entry);
      const actionable = state.status === "pending" || state.status === "interrupted" || (state.status === "failed" && retryFailed);
      if (actionable && maxCases !== null && executed >= maxCases) break;
      const status = executeCase({ root, config, context, entry, runtime: runtimeConfig.value, verifiedExecutable, adapter: runtimeIdentity, environmentSnapshot });
      outcomes.push({ case_id: entry.case_id, status });
      if (actionable && status !== "active") executed += 1;
    }
  }
  return { adapter, initialized: context.initialized, outcomes };
}

function validateClaimAgainstContext({ root, context, entry, claim }) {
  const identity = readAdapterIdentity(root, context.runDir, entry.adapter_track);
  if (claim.run_instance_id !== context.identity.run_instance_id || claim.adapter !== entry.adapter_track || claim.condition !== entry.condition || claim.runtime_identity_digest !== canonicalDigest(identity) || claim.effective_command_digest !== identity.effective_command_digest || claim.environment_snapshot_digest !== identity.environment_snapshot.digest) throw new Error(`${entry.case_id} claim runtime identity mismatch`);
  assertCanonicalEqual(claim.input_identity, inputIdentityFor(context, entry), `${entry.case_id} claim input identity`);
  assertCanonicalEqual(claim.selection, selectionIdentityFor(context, entry), `${entry.case_id} claim selection`);
}

function classificationForCase({ root, context, entry }) {
  try {
    const state = readCaseState(root, context.runDir, entry);
    const claim = readClaim(root, context.runDir, entry.case_id);
    if (claim) {
      validateClaimAgainstContext({ root, context, entry, claim });
      if (state.status !== "active" || state.active_claim_id !== claim.claim_id) throw new Error(`${entry.case_id} claim does not match active state`);
      return { case_id: entry.case_id, status: "active", stale_claim: claimIsExpired(claim) };
    }
    if (TERMINAL_STATUSES.has(state.status)) validateTerminalCase({ root, context, entry, state });
    else if (state.status === "active") throw new Error(`${entry.case_id} active state is missing its claim`);
    return { case_id: entry.case_id, status: state.status };
  } catch (error) {
    return { case_id: entry.case_id, status: "invalid", reason: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyPortfolioExecution({ root, config, planPath, materializedPath, selectionState, runDir }) {
  const context = loadExecutionContext({ root, config, planPath, materializedPath, selectionState, runDir, initialize: false });
  return {
    cases: context.plan.cases.map((entry) => classificationForCase({ root, context, entry })),
  };
}

function assertRecoveryEvidence({ root, run, state, claim, request, result }) {
  validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${claim.case_id} recovery request`);
  validate(root, result, ATTEMPT_RESULT_SCHEMA_PATH, `${claim.case_id} recovery result`);
  const runIdentity = readJson(runIdentityPath(run));
  validate(root, runIdentity, RUN_IDENTITY_SCHEMA_PATH, "recovery run identity");
  const identity = readAdapterIdentity(root, run, claim.adapter);
  if (claim.run_instance_id !== runIdentity.run_instance_id || claim.runtime_identity_digest !== canonicalDigest(identity) || claim.effective_command_digest !== identity.effective_command_digest || claim.environment_snapshot_digest !== identity.environment_snapshot.digest) throw new Error("recovery runtime identity mismatch");
  if (request.run_instance_id !== runIdentity.run_instance_id || request.case_id !== claim.case_id || request.attempt !== claim.attempt || request.adapter !== claim.adapter || request.condition !== claim.condition) throw new Error("recovery request identity mismatch");
  if (request.claim.id !== claim.claim_id || request.claim.lease_expires_at !== claim.lease_expires_at || request.claim.workspace_parent !== claim.workspace_parent || request.claim.workspace_token !== claim.workspace_token) throw new Error("recovery request claim identity mismatch");
  assertCanonicalEqual(request.input_identity, claim.input_identity, "recovery request input identity");
  assertCanonicalEqual(request.selection, claim.selection, "recovery request selection");
  if (request.agent.runtime_identity_digest !== claim.runtime_identity_digest || request.agent.effective_command_digest !== claim.effective_command_digest || request.agent.environment_snapshot_digest !== claim.environment_snapshot_digest) throw new Error("recovery request runtime identity mismatch");
  if (result.run_instance_id !== runIdentity.run_instance_id || result.case_id !== claim.case_id || result.attempt !== claim.attempt || result.adapter !== claim.adapter || result.condition !== claim.condition || result.runtime_identity_digest !== claim.runtime_identity_digest || result.effective_command_digest !== claim.effective_command_digest) throw new Error("recovery result identity mismatch");
  if (state.case_id !== claim.case_id || state.adapter !== claim.adapter || state.condition !== claim.condition || state.status !== "active" || state.active_claim_id !== claim.claim_id) throw new Error("recovery state identity mismatch");
}

function recoveryResult({ root, attemptRoot, entry, claim, requestPath, reason }) {
  const resultPath = resolve(attemptRoot, "result.json");
  assertNoSymlinkSegments(resultPath, `${entry.case_id} recovery result`);
  if (existsSync(resultPath)) return readJson(resultPath);
  const pendingPath = resolve(attemptRoot, RESULT_STAGING_FILE);
  assertNoSymlinkSegments(pendingPath, `${entry.case_id} pending recovery result`);
  if (existsSync(pendingPath)) {
    const pending = readJson(pendingPath);
    validate(root, pending, ATTEMPT_RESULT_SCHEMA_PATH, `${entry.case_id} pending recovery result`);
    const finalPath = resolve(attemptRoot, "final.json");
    assertNoSymlinkSegments(finalPath, `${entry.case_id} recovery final output`);
    if (pending.status === "completed" && existsSync(finalPath)) return pending;
    rmSync(pendingPath, { force: true });
  }
  return resultRecord({
    entry,
    attempt: claim.attempt,
    claim,
    requestPath,
    status: "interrupted",
    failureKind: "stale_claim_recovered",
    recoveryReason: durableScalarEvidence(reason, reason, "operator_recovery"),
  });
}

function reconcileAttemptStaging(attemptRoot, claimId) {
  assertClaimId(claimId);
  if (!existsSync(attemptRoot)) return;
  const targets = ["request.json", RESULT_STAGING_FILE, "result.json", "final.json", "commit.json"];
  for (const name of readdirSync(attemptRoot)) {
    if (!name.endsWith(".staging")) continue;
    const target = targets.find((candidate) => name.startsWith(`.${candidate}.${claimId}.`));
    if (!target) throw new Error("attempt contains staging evidence not owned by the recovered claim");
    const token = name.slice(`.${target}.${claimId}.`.length, -".staging".length);
    if (!UUID_PATTERN.test(token)) throw new Error("attempt contains malformed staging evidence");
    const path = assertInside(attemptRoot, resolve(attemptRoot, name), "attempt staging evidence");
    assertNoSymlinkSegments(path, "attempt staging evidence");
    if (!lstatSync(path).isFile()) throw new Error("attempt staging evidence must be a regular file");
    rmSync(path, { force: true });
  }
}

function assertCommittedRecoveryEvidence({ root, run, state, commit }) {
  const attemptRoot = attemptRootPath(run, state.case_id, state.terminal_attempt);
  const requestPath = resolve(attemptRoot, "request.json");
  const resultPath = resolve(attemptRoot, "result.json");
  assertNoSymlinkSegments(requestPath, `${state.case_id} committed request`);
  assertNoSymlinkSegments(resultPath, `${state.case_id} committed result`);
  const request = readJson(requestPath);
  const result = readJson(resultPath);
  validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${state.case_id} committed request`);
  validate(root, result, ATTEMPT_RESULT_SCHEMA_PATH, `${state.case_id} committed result`);
  const runIdentity = readJson(runIdentityPath(run));
  validate(root, runIdentity, RUN_IDENTITY_SCHEMA_PATH, "committed run identity");
  const identity = readAdapterIdentity(root, run, state.adapter);
  const identityDigest = canonicalDigest(identity);
  if (commit.run_instance_id !== runIdentity.run_instance_id || commit.case_id !== state.case_id || commit.attempt !== state.terminal_attempt || commit.adapter !== state.adapter || commit.condition !== state.condition || commit.status !== state.status) throw new Error("terminal commit does not match state");
  if (commit.runtime_identity_digest !== identityDigest || commit.effective_command_digest !== identity.effective_command_digest || commit.request_sha256 !== prefixedFileDigest(requestPath) || commit.result_sha256 !== prefixedFileDigest(resultPath)) throw new Error("terminal commit evidence mismatch");
  if (request.run_instance_id !== runIdentity.run_instance_id || request.case_id !== commit.case_id || request.attempt !== commit.attempt || request.adapter !== commit.adapter || request.condition !== commit.condition || request.agent.runtime_identity_digest !== identityDigest || request.agent.environment_snapshot_digest !== identity.environment_snapshot.digest) throw new Error("committed request identity mismatch");
  if (request.claim.id !== commit.claim_id || request.claim.lease_expires_at !== commit.claim_lease_expires_at) throw new Error("committed request claim evidence mismatch");
  if (result.run_instance_id !== runIdentity.run_instance_id || result.case_id !== commit.case_id || result.attempt !== commit.attempt || result.adapter !== commit.adapter || result.condition !== commit.condition || result.status !== commit.status || result.request_sha256 !== commit.request_sha256 || result.runtime_identity_digest !== identityDigest) throw new Error("committed result identity mismatch");
  const expectedInventory = result.status === "completed" ? ["commit.json", "final.json", "request.json", "result.json"] : ["commit.json", "request.json", "result.json"];
  assertCanonicalEqual(readdirSync(attemptRoot).sort(), expectedInventory, "committed attempt inventory");
  if (result.status === "completed") {
    const finalPath = resolve(attemptRoot, result.final_output.path);
    assertInside(attemptRoot, finalPath, `${state.case_id} committed final output`);
    assertNoSymlinkSegments(finalPath, `${state.case_id} committed final output`);
    const size = statSync(finalPath).size;
    if (size > MAX_FINAL_OUTPUT_BYTES || size !== result.final_output.bytes || fileDigest(finalPath) !== result.final_output.sha256) throw new Error("committed final output mismatch");
    validate(root, readJson(finalPath), OUTPUT_SCHEMA_PATH, `${state.case_id} committed final output`);
  }
}

export function recoverPortfolioCase({ root, runDir, caseId, claimId, reason }) {
  if (!caseId || !claimId || !reason?.trim()) throw new Error("recover-case requires --case-id, --claim-id, and --reason");
  assertCaseId(caseId);
  assertClaimId(claimId);
  const run = resolve(runDir);
  assertNoSymlinkSegments(run, "run root");
  const identityPath = runIdentityPath(run);
  const identity = readJson(identityPath);
  validate(root, identity, RUN_IDENTITY_SCHEMA_PATH, "run identity");
  const stateFile = statePath(run, caseId);
  if (!existsSync(stateFile)) throw new Error(`case state is missing: ${caseId}`);
  let state = readJson(stateFile);
  validate(root, state, CASE_STATE_SCHEMA_PATH, `${caseId} state`);
  const claim = readClaim(root, run, caseId);
  if (!claim) {
    const staged = readStagedClaim(root, run, caseId, claimId);
    if (staged) {
      if (!claimIsExpired(staged.claim)) throw new Error("staged claim lease has not expired");
      removeEphemeralWorkspace(staged.claim, identity);
      rmSync(staged.directory, { recursive: true, force: true });
      return { case_id: caseId, status: state.status };
    }
    if (TERMINAL_STATUSES.has(state.status) && state.terminal_attempt) {
      const commit = readJson(resolve(attemptRootPath(run, caseId, state.terminal_attempt), "commit.json"));
      validate(root, commit, ATTEMPT_COMMIT_SCHEMA_PATH, `${caseId} terminal commit`);
      if (commit.claim_id !== claimId) throw new Error("claim ID does not match the terminal commit");
      assertCommittedRecoveryEvidence({ root, run, state, commit });
      return { case_id: caseId, status: state.status };
    }
    if (state.status !== "active" || state.active_claim_id !== claimId) throw new Error("claim ID does not match the active claim");
    const attempt = String(state.attempt_count).padStart(4, "0");
    const attemptRoot = attemptRootPath(run, caseId, attempt);
    const requestPath = resolve(attemptRoot, "request.json");
    if (!existsSync(requestPath)) throw new Error("active claim is missing and no durable request evidence exists");
    assertNoSymlinkSegments(requestPath, `${caseId} recovery request`);
    const request = readJson(requestPath);
    validate(root, request, ATTEMPT_REQUEST_SCHEMA_PATH, `${caseId} recovery request`);
    if (request.claim.id !== claimId || !claimIsExpired({ lease_expires_at: request.claim.lease_expires_at })) throw new Error("lost claim evidence is not expired or does not match");
    const recoveredClaim = {
      schema_version: "1.0.0",
      run_instance_id: request.run_instance_id,
      claim_id: request.claim.id,
      case_id: request.case_id,
      attempt: request.attempt,
      adapter: request.adapter,
      condition: request.condition,
      worker_id: "durable-request-recovery",
      pid: 1,
      acquired_at: request.claim.lease_expires_at,
      lease_expires_at: request.claim.lease_expires_at,
      workspace_parent: request.claim.workspace_parent,
      workspace_token: request.claim.workspace_token,
      input_identity: request.input_identity,
      selection: request.selection,
      runtime_identity_digest: request.agent.runtime_identity_digest,
      effective_command_digest: request.agent.effective_command_digest,
      environment_snapshot_digest: request.agent.environment_snapshot_digest,
    };
    assertEphemeralWorkspaceOwnership(recoveredClaim, identity);
    const entry = { case_id: caseId, adapter_track: state.adapter, condition: state.condition };
    const result = recoveryResult({ root, attemptRoot, entry, claim: recoveredClaim, requestPath, reason });
    assertRecoveryEvidence({ root, run, state, claim: recoveredClaim, request, result });
    const terminalState = completeCase({ root, runDir: run, entry, state, claim: recoveredClaim, attempt, attemptRoot, result });
    removeEphemeralWorkspace(recoveredClaim, identity);
    return { case_id: caseId, status: terminalState.status };
  }
  if (claim.claim_id !== claimId) throw new Error("claim ID does not match the active claim");
  assertEphemeralWorkspaceOwnership(claim, identity);
  const publishedBeforeState = claimPublishedBeforeState(state, claim);
  if (TERMINAL_STATUSES.has(state.status) && state.terminal_attempt && !publishedBeforeState) {
    const commitPath = resolve(attemptRootPath(run, caseId, state.terminal_attempt), "commit.json");
    assertNoSymlinkSegments(commitPath, `${caseId} terminal commit`);
    const commit = readJson(commitPath);
    validate(root, commit, ATTEMPT_COMMIT_SCHEMA_PATH, `${caseId} terminal commit`);
    if (commit.claim_id !== claimId) throw new Error("claim ID does not match the terminal commit");
    assertCommittedRecoveryEvidence({ root, run, state, commit });
    releaseClaim(root, run, caseId, claimId);
    removeEphemeralWorkspace(claim, identity);
    return { case_id: caseId, status: state.status };
  }
  if (publishedBeforeState) {
    if (state.status === "pending" && (state.attempt_count !== 0 || state.active_claim_id !== null)) throw new Error("published claim does not match pending state");
    if (TERMINAL_STATUSES.has(state.status)) {
      const previousCommitPath = resolve(attemptRootPath(run, caseId, state.terminal_attempt), "commit.json");
      assertNoSymlinkSegments(previousCommitPath, `${caseId} previous terminal commit`);
      const previousCommit = readJson(previousCommitPath);
      validate(root, previousCommit, ATTEMPT_COMMIT_SCHEMA_PATH, `${caseId} previous terminal commit`);
      assertCommittedRecoveryEvidence({ root, run, state, commit: previousCommit });
    }
    if (claim.adapter !== state.adapter || claim.condition !== state.condition || (claim.selection?.digest ?? null) !== state.selection_digest) throw new Error("published claim does not match prior state identity");
    if (!claimIsExpired(claim)) throw new Error("claim lease has not expired");
    const identity = readAdapterIdentity(root, run, claim.adapter);
    if (claim.runtime_identity_digest !== canonicalDigest(identity) || claim.effective_command_digest !== identity.effective_command_digest || claim.environment_snapshot_digest !== identity.environment_snapshot.digest) throw new Error("published claim runtime identity mismatch");
    state = { ...state, status: "active", attempt_count: Number(claim.attempt), active_claim_id: claimId, terminal_attempt: null };
    validate(root, state, CASE_STATE_SCHEMA_PATH, `${caseId} reconciled active state`);
    writeCaseState(run, { case_id: caseId }, state);
  } else if (state.status !== "active" || state.active_claim_id !== claimId) {
    throw new Error("active state does not bind the supplied claim");
  }
  if (!claimIsExpired(claim)) throw new Error("claim lease has not expired");
  const attemptRoot = attemptRootPath(run, caseId, claim.attempt);
  mkdirSync(attemptRoot, { recursive: true });
  reconcileAttemptStaging(attemptRoot, claimId);
  const requestPath = resolve(attemptRoot, "request.json");
  if (!existsSync(requestPath)) {
    const recoveryRequest = requestRecord({ entry: { case_id: caseId, adapter_track: claim.adapter, condition: claim.condition }, attempt: claim.attempt, claim, projection: { status: "recovered_interruption" } });
    validate(root, recoveryRequest, ATTEMPT_REQUEST_SCHEMA_PATH, `${caseId} recovered request`);
    writeJsonAtomic(requestPath, recoveryRequest, { stagingOwner: claim.claim_id, faultName: "after_request_staged" });
  }
  const entry = { case_id: caseId, adapter_track: state.adapter, condition: state.condition };
  const result = recoveryResult({ root, attemptRoot, entry, claim, requestPath, reason });
  const request = readJson(requestPath);
  assertRecoveryEvidence({ root, run, state, claim, request, result });
  const terminalState = completeCase({ root, runDir: run, entry, state, claim, attempt: claim.attempt, attemptRoot, result });
  removeEphemeralWorkspace(claim, identity);
  return { case_id: caseId, status: terminalState.status };
}
