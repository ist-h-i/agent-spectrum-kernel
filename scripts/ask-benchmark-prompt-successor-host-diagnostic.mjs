import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
  readStableBytes, stableCanonicalJson,
} from "./content-addressed-store.mjs";
import { assertCalibrationExecutionAdmission } from "./ask-benchmark-calibration-execution-admission.mjs";
import { OUTPUT_SCHEMA_PATH, inspectVerifiedPortfolioExecution } from "./ask-benchmark-execution.mjs";
import { assertSuccessorAdapterFacts, assertSuccessorProfileCommand } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { capturedSuccessorEnvironment, probeSuccessorPrivateRootDeny } from "./ask-benchmark-prompt-successor-host-isolation.mjs";
import { validateSuccessorFromRepository } from "./ask-benchmark-prompt-successor-repository.mjs";
import { successorClosed, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ROLES = ["current_prompt", "prompt_v2"];
const PROFILE = "ask_issue291";
const MAX_EVENT_BYTES = 4 * 1024 * 1024;
const MAX_SESSION_BYTES = 4 * 1024 * 1024;
const DIAGNOSTIC_PROMPT = Buffer.from(
  "Issue 291 host diagnostic outside the measured trial inventory. Do not use tools or read files. "
  + "Return one JSON object matching the supplied output schema: task_type review, decision not_applicable, "
  + "findings [], requirement_status [], verification_commands [], completion_claim not_applicable, "
  + "route null, summary diagnostic only.\n",
);
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function fail(detail) { successorFail("SUCCESSOR_HOST_DIAGNOSTIC_INVALID", detail); }
function inside(parent, path) {
  const offset = relative(parent, path);
  return offset === "" || (offset !== ".." && !offset.startsWith(`..${sep}`) && !offset.startsWith("/"));
}
function directory(path, label) {
  assertNoSymlinkPathSegments(path, label);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a real directory`);
  return realpathSync(path);
}
function regular(path, label) {
  assertNoSymlinkPathSegments(path, label);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file`);
  return realpathSync(path);
}
function readJson(path, label, limit = 1024 * 1024) {
  regular(path, label);
  return parseJsonRejectDuplicateKeys(readStableBytes(path, label, limit), label);
}
function writeOnce(path, value) {
  const bytes = Buffer.from(`${stableCanonicalJson(value)}\n`);
  let fd;
  try { fd = openSync(path, "wx", 0o600); }
  catch (error) { if (error?.code === "EEXIST") fail(`${basename(path)} already exists`); throw error; }
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  const dir = openSync(dirname(path), "r");
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
function writeBytesOnce(path, bytes) {
  let fd;
  try { fd = openSync(path, "wx", 0o600); }
  catch (error) { if (error?.code === "EEXIST") fail(`${basename(path)} already exists`); throw error; }
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  const dir = openSync(dirname(path), "r");
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
function jsonLines(bytes, label) {
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trimEnd().split("\n");
  if (lines.length < 1 || lines.length > 20000) fail(`${label} line count`);
  return lines.map((line, index) => parseJsonRejectDuplicateKeys(Buffer.from(line), `${label} line ${index + 1}`));
}
function sessionFiles(home) {
  const sessions = directory(resolve(home, "sessions"), "diagnostic sessions root");
  const found = [];
  function walk(path, depth) {
    if (depth > 4) fail("diagnostic session nesting");
    for (const name of readdirSync(path)) {
      const next = resolve(path, name);
      if (lstatSync(next).isDirectory()) walk(directory(next, "diagnostic session directory"), depth + 1);
      else {
        regular(next, "diagnostic session file");
        if (!/^rollout-.*\.jsonl$/u.test(name)) fail("unexpected diagnostic session file");
        found.push(next);
      }
    }
  }
  walk(sessions, 0);
  if (found.length !== 1) fail("exactly one diagnostic exec session is required");
  return found[0];
}
export function parseSuccessorExecSessionEvidence({ stdout, session, source, runtime, cwd, privateRoot }) {
  const events = jsonLines(stdout, "diagnostic exec JSONL");
  const started = events.filter(entry => entry.type === "turn.started");
  const completed = events.filter(entry => entry.type === "turn.completed");
  const threads = events.filter(entry => entry.type === "thread.started");
  const allowedEvents = new Set(["thread.started", "turn.started", "turn.completed",
    "item.started", "item.updated", "item.completed"]);
  const nonToolItems = new Set(["agent_message", "reasoning"]);
  if (threads.length !== 1 || started.length !== 1 || completed.length !== 1
    || events.some(entry => !allowedEvents.has(entry.type)
      || (entry.type.startsWith("item.")
        ? !nonToolItems.has(entry.item?.type) : Object.hasOwn(entry, "item")))) {
    fail("diagnostic exec did not complete one tool-free turn");
  }
  const rows = jsonLines(session, "diagnostic session JSONL");
  const metadata = rows.filter(row => row.type === "session_meta").map(row => row.payload);
  const contexts = rows.filter(row => row.type === "turn_context").map(row => row.payload);
  if (metadata.length !== 1 || contexts.length !== 1) fail("diagnostic session metadata or turn context is missing or duplicated");
  const meta = metadata[0], context = contexts[0];
  const safeSessionEvents = new Set(["user_message", "agent_message", "agent_reasoning",
    "agent_reasoning_raw_content", "token_count", "thread_settings_applied"]);
  const safeCompletedItems = new Set(["UserMessage", "AgentMessage", "Reasoning"]);
  let sessionStarts = 0, sessionCompletions = 0;
  for (const row of rows) {
    if (row.type === "session_meta" || row.type === "turn_context"
      || ["token_usage_record", "world_state", "security_risk_score"].includes(row.type)) continue;
    const payload = row.payload;
    if (row.type === "response_item") {
      if (payload?.type === "reasoning"
        || (payload?.type === "message" && ["assistant", "user"].includes(payload.role))) continue;
    } else if (row.type === "event_msg") {
      if (safeSessionEvents.has(payload?.type)) continue;
      if (["item.started", "item.updated", "item_completed", "item_started", "item_updated"].includes(payload?.type)
        && safeCompletedItems.has(payload.item?.type)) continue;
      if (["task_started", "turn_started", "task_complete", "turn_complete"].includes(payload?.type)
        && (payload.turn_id === undefined || payload.turn_id === context.turn_id)
        && !(["task_complete", "turn_complete"].includes(payload.type) && payload.error != null)) {
        if (["task_started", "turn_started"].includes(payload.type)) sessionStarts++;
        else sessionCompletions++;
        continue;
      }
    }
    fail("diagnostic session contains a tool action or unknown event");
  }
  if (sessionStarts > 1 || sessionCompletions > 1) fail("diagnostic session contains multiple turn markers");
  successorExact(meta.model_provider, "openai", "diagnostic model provider");
  successorExact(meta.cli_version, runtime.cli_version, "diagnostic CLI version");
  successorExact(resolve(meta.cwd), cwd, "diagnostic session cwd");
  successorExact(context.model, runtime.model, "diagnostic resolved model");
  successorExact(context.effort, runtime.reasoning_effort, "diagnostic resolved reasoning effort");
  successorExact(context.approval_policy, runtime.approval_policy, "diagnostic resolved approval policy");
  successorExact(context.sandbox_policy?.type, runtime.sandbox, "diagnostic resolved sandbox mode");
  successorExact(context.sandbox_policy?.network_access, false, "diagnostic resolved agent network policy");
  successorExact(context.permission_profile?.type, "managed", "diagnostic permission profile type");
  successorExact(context.permission_profile?.file_system?.type, "restricted", "diagnostic effective filesystem policy");
  successorExact(context.permission_profile?.network, "restricted", "diagnostic effective network policy");
  const entries = context.permission_profile?.file_system?.entries;
  if (!Array.isArray(entries) || entries.filter(entry => entry?.path?.type === "path"
    && entry.path.path === privateRoot && entry.access === "deny").length !== 1) {
    fail("diagnostic exec session lacks exact private-root deny rule");
  }
  if (context.active_permission_profile !== undefined) {
    successorExact(context.active_permission_profile?.id, PROFILE, "diagnostic active permission profile");
  }
  successorExact(resolve(context.cwd), cwd, "diagnostic turn cwd");
  if (typeof meta.id !== "string" || meta.id.length < 10 || threads[0].thread_id !== meta.id) fail("diagnostic session ID mismatch");
  if (typeof context.turn_id !== "string" || context.turn_id.length < 10) fail("diagnostic turn ID missing");
  return {
    provider: meta.model_provider, model: context.model, reasoning_effort: context.effort,
    approval_policy: context.approval_policy, sandbox: context.sandbox_policy.type,
    agent_network: "disabled", provider_network: runtime.provider_network,
    active_permission_profile: context.active_permission_profile?.id ?? null,
    private_root_path_digest: canonicalDigest({ path: privateRoot }),
    source_runtime_identity_digest: source.scope.source.runtime_identity_digest,
    session_id_digest: canonicalDigest({ session_id: meta.id }),
    turn_id_digest: canonicalDigest({ turn_id: context.turn_id }),
    turn_started_count: started.length, turn_completed_count: completed.length,
  };
}

function inspectNativePrecall({ root, preparation, sources, hostIsolationProbePath, admission, requireUnstarted }) {
  const manifestPathDigest = admission.fixtures[0]?.private_manifest_path_digest;
  if (!manifestPathDigest) fail("admitted private manifest is missing");
  const probes = Object.fromEntries(ROLES.map(role => [role,
    probeSuccessorPrivateRootDeny({ root, source: sources[role], runtime: preparation.runtime,
      privateManifestPath: hostIsolationProbePath, expectedManifestPathDigest: manifestPathDigest }),
  ]));
  const identities = Object.fromEntries(ROLES.map(role => [role,
    readJson(resolve(sources[role].execution.runDir, "adapters/codex.json"), `${role} adapter identity`),
  ]));
  for (const role of ROLES) {
    assertSuccessorAdapterFacts(preparation.runtime, identities[role], { checkHost: true });
    successorExact(canonicalDigest(identities[role]), sources[role].scope.source.runtime_identity_digest, `${role} native runtime identity`);
    if (requireUnstarted) {
      const actual = inspectVerifiedPortfolioExecution({ ...sources[role].execution, root });
      if (actual.cases.some(entry => entry.state.status !== "pending" || entry.state.attempt_count !== 0 || entry.attempts.length !== 0)) {
        fail("diagnostic must precede all measured attempts");
      }
    }
  }
  successorExact(canonicalDigest(identities.current_prompt), canonicalDigest(identities.prompt_v2), "paired diagnostic runtime identity");
  const configPath = regular(sources.current_prompt.runtimeConfigPath, "diagnostic native config");
  const config = readJson(configPath, "diagnostic native config");
  const privateRoot = directory(config.successor_private_evaluator_root, "diagnostic private deny root");
  const executable = regular(sources.current_prompt.agentBin, "diagnostic native executable");
  successorExact(executable, regular(sources.prompt_v2.agentBin, "paired native executable"), "paired native executable");
  const identity = identities.current_prompt;
  const environment = capturedSuccessorEnvironment(identity);
  const command = identity.effective_command;
  assertSuccessorProfileCommand(command, privateRoot);
  successorExact(command.output_schema_digest, hash(readFileSync(regular(resolve(root, OUTPUT_SCHEMA_PATH), "diagnostic output schema"))),
    "diagnostic output schema bytes");
  return { probes, identity, environment, command, privateRoot, executable };
}

function diagnosticLocation({ root, sources, privateRoot, normalizedRoots, diagnosticRoot }) {
  const parent = directory(diagnosticRoot, "external diagnostic root");
  const repository = directory(root, "repository root");
  const runParent = directory(dirname(resolve(sources.current_prompt.execution.runDir)), "measured run parent");
  for (const forbidden of [repository, runParent, privateRoot, ...ROLES.map(role => directory(normalizedRoots[role], `${role} measured result root`))]) {
    if (inside(forbidden, parent) || inside(parent, forbidden)) fail("diagnostic root overlaps authority, run, or private root");
  }
  const id = sources.current_prompt.scope.run_instance_id;
  successorExact(id, sources.prompt_v2.scope.run_instance_id, "diagnostic paired experiment ID");
  return resolve(parent, `issue291-host-diagnostic-${id}`);
}
function policySettings(command) {
  const values = [];
  for (let index = 0; index < command.argv.length; index++) {
    if (command.argv[index] === "-c") values.push(command.argv[++index]);
  }
  return values;
}
function diagnosticCommand(command, root, outputPath) {
  const measuredArgv = command.argv;
  if (measuredArgv.filter(value => value === "--ephemeral").length !== 1
    || measuredArgv[0] !== "exec" || measuredArgv.at(-1) !== "-") fail("measured command cannot be projected to a diagnostic exec");
  const diagnosticArgv = measuredArgv.filter(value => value !== "--ephemeral").map(value => value
    .replaceAll("{output_schema}", resolve(root, OUTPUT_SCHEMA_PATH))
    .replaceAll("{output}", outputPath));
  if (diagnosticArgv.includes("--ephemeral") || diagnosticArgv.at(-1) !== "-") fail("diagnostic argv projection drift");
  return { measuredArgv, diagnosticArgv, difference: "diagnostic omits only --ephemeral to persist the CLI session JSONL" };
}
function capturedAuthSource(identity, environment) {
  const sourceHome = identity.environment_allowlist.includes("CODEX_HOME") && process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : environment.HOME ? resolve(environment.HOME, ".codex") : null;
  if (!sourceHome) fail("captured authentication home is unavailable");
  const path = regular(resolve(sourceHome, "auth.json"), "captured subscription authentication");
  return path;
}
function linkedHome(path, auth) {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
  symlinkSync(auth, resolve(path, "auth.json"));
  return path;
}
function unlinkAuth(path) {
  const link = resolve(path, "auth.json");
  rmSync(link, { force: true });
}
function runNoModelPreflight({ executable, environment, auth, command, privateRoot, runtime, cwd }) {
  const home = mkdtempSync(resolve(tmpdir(), "ask-issue291-diagnostic-check-"));
  chmodSync(home, 0o700);
  symlinkSync(auth, resolve(home, "auth.json"));
  try {
    const env = { ...environment, CODEX_HOME: home };
    const version = spawnSync(executable, ["--version"], { cwd, env, encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 });
    const versionText = `${version.stdout ?? ""}${version.stderr ?? ""}`.trim();
    if (version.error || version.signal || version.status !== 0 || versionText !== `codex-cli ${runtime.cli_version}`) {
      fail("diagnostic native CLI version is unverified");
    }
    const login = spawnSync(executable, ["login", "status"], { cwd, env, encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 });
    const loginStatus = `${login.stdout ?? ""}${login.stderr ?? ""}`.trim();
    if (login.error || login.signal || login.status !== 0 || loginStatus !== "Logged in using ChatGPT") {
      fail("diagnostic subscription login status is unverified");
    }
    const help = spawnSync(executable, ["exec", "--help"], { cwd, env, encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024 });
    const helpText = `${help.stdout ?? ""}${help.stderr ?? ""}`;
    if (help.error || help.signal || help.status !== 0 || !helpText.includes("--ephemeral")
      || !helpText.includes("Run without persisting session files to disk")) {
      fail("native CLI does not attest the diagnostic persistence-only argv difference");
    }
    const args = ["debug", "prompt-input", "-c", `model=${JSON.stringify(runtime.model)}`,
      ...policySettings(command).flatMap(setting => ["-c", setting])];
    const debug = spawnSync(executable, args, { cwd, env, encoding: "utf8", timeout: 15000, maxBuffer: MAX_EVENT_BYTES });
    if (debug.error || debug.signal || debug.status !== 0) fail("native resolved-policy diagnostic failed");
    const items = parseJsonRejectDuplicateKeys(Buffer.from(debug.stdout), "native resolved-policy diagnostic");
    if (!Array.isArray(items)) fail("native resolved-policy diagnostic shape");
    const policyItems = items.filter(item => item.role === "developer")
      .flatMap(item => item.content ?? []).map(item => item.text ?? "")
      .filter(text => text.includes("<permissions instructions>"));
    if (policyItems.length !== 1) fail("native resolved-policy message is missing or duplicated");
    const developer = policyItems[0];
    if (!developer.includes("`sandbox_mode` is `workspace-write`")
      || !developer.includes("Network access is restricted.")
      || !developer.includes("Approval policy is currently never.")
      || !developer.includes(`- path \`${privateRoot}\``)) {
      fail("native resolved-policy diagnostic lacks required effective controls");
    }
    return { cli_version_output_digest: hash(Buffer.from(versionText)),
      login_status_digest: hash(Buffer.from(loginStatus)),
      native_exec_help_digest: hash(Buffer.from(helpText)), resolved_policy_digest: hash(Buffer.from(developer)) };
  } finally {
    unlinkAuth(home);
    rmSync(home, { recursive: true, force: true });
  }
}
function expectedPrecall({ preparation, sources, admission, identity, command, probes, privateRoot, executable, location, projected, noModel }) {
  const body = {
    schema_version: "1.0.0", kind: "successor_host_diagnostic_precall", issue: 291,
    classification: "diagnostic_preflight_outside_measured_inventory",
    experiment_run_instance_id: sources.current_prompt.scope.run_instance_id,
    implementation: structuredClone(preparation.implementation),
    preparation_digest: preparation.preparation_digest,
    runtime_digest: preparation.runtime_digest,
    runtime_config_digest: preparation.runtime.configuration_digest,
    authentication_mode: preparation.runtime.authentication_mode,
    model: preparation.runtime.model,
    reasoning_effort: preparation.runtime.reasoning_effort,
    timeout_ms: preparation.runtime.timeout_ms,
    runtime_identity_digest: canonicalDigest(identity),
    source_scope_digests: Object.fromEntries(ROLES.map(role => [role, sources[role].scope.scope_digest])),
    native_probe_digests: Object.fromEntries(ROLES.map(role => [role, probes[role].probe_digest])),
    measured_effective_command_digest: command && canonicalDigest(command),
    measured_argv_digest: canonicalDigest(projected.measuredArgv),
    diagnostic_argv_digest: canonicalDigest(projected.diagnosticArgv),
    diagnostic_argv_difference: projected.difference,
    executable_digest: hash(readFileSync(executable)),
    private_deny_root_path_digest: canonicalDigest({ path: privateRoot }),
    measured_result_root_identity_digest: admission.result_root_identity_digest,
    diagnostic_namespace_path_digest: canonicalDigest({ path: location }),
    diagnostic_prompt_digest: hash(DIAGNOSTIC_PROMPT),
    output_schema_digest: command.output_schema_digest,
    cli_version_output_digest: noModel.cli_version_output_digest,
    login_status_digest: noModel.login_status_digest,
    native_exec_help_digest: noModel.native_exec_help_digest,
    resolved_policy_digest: noModel.resolved_policy_digest,
    planned_diagnostic_exec_invocations: 1, diagnostic_attempt: 1,
    diagnostic_retry_index: 0, automatic_retries: 0,
    measured_claims: 0, measured_trials: 0, measured_result_reads: 0,
    measured_model_calls_before_diagnostic: 0,
  };
  return { ...body, precall_digest: canonicalDigest(body) };
}
function terminateResidual(pid) {
  if (process.platform === "win32" || !Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(-pid, 0); } catch (error) { if (error?.code === "ESRCH") return false; throw error; }
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try { process.kill(-pid, signal); } catch (error) { if (error?.code === "ESRCH") return true; throw error; }
    for (let index = 0; index < 50; index++) {
      try { process.kill(-pid, 0); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); }
      catch (error) { if (error?.code === "ESRCH") return true; throw error; }
    }
  }
  fail("diagnostic residual process group could not be terminated");
}

function inspectDiagnosticContext(input, { requireUnstarted }) {
  const { root = ROOT, preparation, sources, scoringInputs, calibrationAdmission,
    hostIsolationProbePath, diagnosticRoot, normalizedRoots } = input;
  successorExact(resolve(root), ROOT, "host diagnostic repository root");
  if (typeof hostIsolationProbePath !== "string" || typeof diagnosticRoot !== "string") fail("host diagnostic paths are required");
  const admission = assertCalibrationExecutionAdmission(calibrationAdmission, {
    preparation, sources, scoringInputs, requirePreflight: requireUnstarted,
  });
  if (!normalizedRoots || Object.keys(normalizedRoots).sort().join(",") !== [...ROLES].sort().join(",")) {
    fail("exact paired measured result roots are required");
  }
  successorExact(canonicalDigest(ROLES.map(role => resolve(normalizedRoots[role]))),
    admission.result_root_identity_digest, "diagnostic measured result roots");
  const native = inspectNativePrecall({ root, preparation, sources, hostIsolationProbePath,
    admission, requireUnstarted });
  const location = diagnosticLocation({ root, sources, privateRoot: native.privateRoot, normalizedRoots, diagnosticRoot });
  if (requireUnstarted) {
    const runParent = dirname(resolve(sources.current_prompt.execution.runDir));
    const prefix = `.ask-successor-issue291-${sources.current_prompt.scope.run_instance_id}`;
    if (readdirSync(runParent).some(name => name.startsWith(prefix))) fail("measured journal, claim, or freeze exists before diagnostic");
  }
  const projected = diagnosticCommand(native.command, root, resolve(location, "output.json"));
  const noModel = runNoModelPreflight({ executable: native.executable, environment: native.environment,
    auth: capturedAuthSource(native.identity, native.environment), command: native.command,
    privateRoot: native.privateRoot, runtime: preparation.runtime, cwd: root });
  const precall = expectedPrecall({ preparation, sources, admission, ...native, location, projected, noModel });
  return { ...native, location, projected, precall, preparation, sources };
}

function readDiagnosticResult(context) {
  const { location, precall, preparation, sources, privateRoot } = context;
  const actualPrecall = readJson(resolve(location, "precall.json"), "host diagnostic precall");
  successorExact(actualPrecall, precall, "host diagnostic exact precall binding");
  const result = readJson(resolve(location, "result.json"), "host diagnostic terminal record");
  successorClosed(result, ["schema_version", "kind", "precall_digest", "status", "process_exit_code",
    "process_signal", "process_error_code", "residual_process_group_detected", "stdout_digest", "stderr_digest",
    "output_digest", "session_digest", "session_path_digest", "session_evidence",
    "diagnostic_exec_invocations", "diagnostic_attempt", "diagnostic_retry_index", "automatic_retries",
    "diagnostic_model_calls", "result_digest"], "host diagnostic terminal record");
  successorExact(result.schema_version, "1.0.0", "host diagnostic terminal version");
  successorExact(result.kind, "successor_host_diagnostic_terminal", "host diagnostic terminal kind");
  successorClosed(result.diagnostic_model_calls, ["status", "value"], "diagnostic model-call count");
  if (result.status !== "completed") fail("diagnostic invocation is nonterminal or failed; retry is forbidden");
  if (result.process_exit_code !== 0 || result.process_signal !== null || result.process_error_code !== null
    || result.residual_process_group_detected !== false || result.diagnostic_exec_invocations !== 1
    || result.diagnostic_attempt !== 1 || result.diagnostic_retry_index !== 0
    || result.automatic_retries !== 0 || result.diagnostic_model_calls?.status !== "at_least_one"
    || result.diagnostic_model_calls?.value !== null) fail("host diagnostic terminal execution state is invalid");
  const { result_digest: digest, ...body } = result;
  successorExact(canonicalDigest(body), digest, "host diagnostic terminal digest");
  successorExact(result.precall_digest, precall.precall_digest, "host diagnostic precall digest");
  const stdoutPath = regular(resolve(location, "stdout.jsonl"), "host diagnostic stdout");
  const stderrPath = regular(resolve(location, "stderr.txt"), "host diagnostic stderr");
  const outputPath = regular(resolve(location, "output.json"), "host diagnostic structured output");
  const sessionPath = sessionFiles(resolve(location, "codex-home"));
  const stdout = readStableBytes(stdoutPath, "host diagnostic stdout", MAX_EVENT_BYTES);
  const stderr = readStableBytes(stderrPath, "host diagnostic stderr", MAX_EVENT_BYTES, { allowEmpty: true });
  const output = readStableBytes(outputPath, "host diagnostic structured output", 1024 * 1024);
  const session = readStableBytes(sessionPath, "host diagnostic session", MAX_SESSION_BYTES);
  successorExact(hash(stdout), result.stdout_digest, "host diagnostic stdout bytes");
  successorExact(hash(stderr), result.stderr_digest, "host diagnostic stderr bytes");
  successorExact(hash(output), result.output_digest, "host diagnostic output bytes");
  successorExact(hash(session), result.session_digest, "host diagnostic session bytes");
  successorExact(canonicalDigest({ path: sessionPath }), result.session_path_digest, "host diagnostic session path");
  const observed = parseSuccessorExecSessionEvidence({ stdout, session, source: sources.current_prompt,
    runtime: preparation.runtime, cwd: resolve(location, "workspace"), privateRoot });
  successorExact(observed, result.session_evidence, "host diagnostic resolved session evidence");
  return {
    kind: "successor_host_exec_diagnostic", schema_version: "1.0.0",
    classification: "diagnostic_preflight_outside_measured_inventory",
    exec_session_policy_observed: true,
    diagnostic_exec_invocations: 1, measured_exec_invocations: 0,
    diagnostic_model_calls: { status: "at_least_one", value: null },
    measured_claims: 0, measured_trials: 0, measured_result_reads: 0, automatic_retries: 0,
    experiment_run_instance_id: precall.experiment_run_instance_id,
    implementation: structuredClone(precall.implementation),
    preparation_digest: precall.preparation_digest,
    runtime_identity_digest: precall.runtime_identity_digest,
    measured_effective_command_digest: precall.measured_effective_command_digest,
    diagnostic_argv_digest: precall.diagnostic_argv_digest,
    diagnostic_argv_difference: precall.diagnostic_argv_difference,
    source_scope_digests: structuredClone(precall.source_scope_digests),
    native_probe_digests: structuredClone(precall.native_probe_digests),
    provider: observed.provider, model: observed.model, reasoning_effort: observed.reasoning_effort,
    approval_policy: observed.approval_policy, sandbox: observed.sandbox,
    agent_network: observed.agent_network, provider_network: observed.provider_network,
    active_permission_profile: observed.active_permission_profile,
    executable_digest: precall.executable_digest,
    cli_version_output_digest: precall.cli_version_output_digest,
    login_status_digest: precall.login_status_digest,
    native_exec_help_digest: precall.native_exec_help_digest,
    resolved_policy_digest: precall.resolved_policy_digest,
    precall_digest: precall.precall_digest, result_digest: result.result_digest,
  };
}

/** Reopens exact external bytes; a caller-supplied JSON object cannot mint this evidence. */
export async function openSuccessorExecDiagnostic(input) {
  const { root = ROOT, preparation } = input;
  await validateSuccessorFromRepository(preparation, { root });
  const context = inspectDiagnosticContext(input, { requireUnstarted: false });
  directory(context.location, "existing host diagnostic namespace");
  return readDiagnosticResult(context);
}

/** One non-measured CLI exec. A reserved namespace is never retried. */
export async function runSuccessorExecDiagnostic(input) {
  const { root = ROOT, preparation } = input;
  await validateSuccessorFromRepository(preparation, { root });
  const context = inspectDiagnosticContext(input, { requireUnstarted: true });
  const { location, executable, environment, identity, projected, precall } = context;
  if (existsSync(location)) return readDiagnosticResult(context);
  mkdirSync(location, { mode: 0o700 });
  chmodSync(location, 0o700);
  mkdirSync(resolve(location, "workspace"), { mode: 0o700 });
  const home = linkedHome(resolve(location, "codex-home"), capturedAuthSource(identity, environment));
  writeOnce(resolve(location, "precall.json"), precall);
  let processResult, residual;
  try {
    processResult = spawnSync(executable, projected.diagnosticArgv, {
      cwd: resolve(location, "workspace"), env: { ...environment, CODEX_HOME: home },
      input: DIAGNOSTIC_PROMPT, encoding: null, detached: process.platform !== "win32",
      timeout: preparation.runtime.timeout_ms, killSignal: "SIGKILL", maxBuffer: MAX_EVENT_BYTES,
    });
    residual = terminateResidual(processResult.pid);
  } finally { unlinkAuth(home); }
  const stdout = processResult.stdout ?? Buffer.alloc(0);
  const stderr = processResult.stderr ?? Buffer.alloc(0);
  writeBytesOnce(resolve(location, "stdout.jsonl"), stdout);
  writeBytesOnce(resolve(location, "stderr.txt"), stderr);
  const clean = !processResult.error && !processResult.signal && processResult.status === 0 && !residual;
  let observed = null, sessionPath = null, session = null, output = null;
  if (clean) {
    try {
      sessionPath = sessionFiles(home);
      session = readStableBytes(sessionPath, "host diagnostic session", MAX_SESSION_BYTES);
      output = readStableBytes(regular(resolve(location, "output.json"), "host diagnostic output"),
        "host diagnostic output", 1024 * 1024);
      observed = parseSuccessorExecSessionEvidence({ stdout, session, source: context.sources.current_prompt,
        runtime: preparation.runtime, cwd: resolve(location, "workspace"), privateRoot: context.privateRoot });
    } catch { observed = null; }
  }
  const body = {
    schema_version: "1.0.0", kind: "successor_host_diagnostic_terminal",
    precall_digest: precall.precall_digest,
    status: observed ? "completed" : "failed",
    process_exit_code: processResult.status, process_signal: processResult.signal,
    process_error_code: processResult.error?.code ?? null,
    residual_process_group_detected: residual,
    stdout_digest: hash(stdout), stderr_digest: hash(stderr),
    output_digest: output ? hash(output) : null,
    session_digest: session ? hash(session) : null,
    session_path_digest: sessionPath ? canonicalDigest({ path: sessionPath }) : null,
    session_evidence: observed,
    diagnostic_exec_invocations: 1, diagnostic_attempt: 1,
    diagnostic_retry_index: 0, automatic_retries: 0,
    diagnostic_model_calls: { status: observed ? "at_least_one" : "unknown", value: null },
  };
  writeOnce(resolve(location, "result.json"), { ...body, result_digest: canonicalDigest(body) });
  if (!observed) fail("diagnostic CLI session is incomplete; namespace is reserved and retry is forbidden");
  return readDiagnosticResult(context);
}
