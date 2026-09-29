#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, connect } from "node:net";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync,
  readlinkSync, realpathSync, symlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
  readStableBytes, stableCanonicalJson, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { writeFileSync, fsyncSync } from "node:fs";
import { buildJudgePacket, createJudgeProtocol, verifyJudgeProtocol } from "./ask-benchmark-llm-judge.mjs";
import { nativeJudgeLaunchProfile, toolFreeNativeJudgeInstruction } from "./ask-benchmark-judge-native-transport.mjs";
import { captureJudgeProcess, judgeProcessStreamFailure } from "./ask-benchmark-judge-process.mjs";
import { startJudgeLoopbackCapture } from "./ask-benchmark-judge-tool-free-capture.mjs";
import { buildJudgeToolFreeExecutionArgv, inspectJudgeToolFreeCatalog, inspectJudgeToolFreeRequest,
  JUDGE_TOOL_FREE_CATALOG_SHA256, JUDGE_TOOL_FREE_CLI_SHA256, JUDGE_TOOL_FREE_CLI_VERSION,
  JUDGE_TOOL_FREE_MODEL } from "./ask-benchmark-judge-tool-free-profile.mjs";
import { assertSuccessorNativeExecutable } from "./ask-benchmark-prompt-successor-native.mjs";
import { JUDGE_HOST_SANDBOX, inspectJudgeHostControlTrace, judgeHostControlPolicy,
  judgeHostControlTemplateDigest } from "./ask-benchmark-judge-host-controls.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const MAX = 20 * 1024 * 1024;
const CANARY = Buffer.from("public bootstrap canary; never a credential\n");
const SCENARIOS = ["success", "zero", "multiple", "tools", "authorization", "timeout", "invalid_stream", "tool_event", "invalid_tail", "tool_tail", "unconfined_controls"];
const SOURCES = [
  "scripts/ask-benchmark-judge-host-bootstrap.mjs", "scripts/ask-benchmark-judge-host-controls.mjs",
  "scripts/ask-benchmark-judge-process.mjs", "scripts/ask-benchmark-judge-tool-free-capture.mjs",
  "scripts/ask-benchmark-judge-tool-free-profile.mjs", "scripts/ask-benchmark-judge-native-transport.mjs",
  "scripts/ask-benchmark-llm-judge.mjs", "scripts/content-addressed-store.mjs",
  "scripts/test-fixtures/judge-host-control-probe.c", "scripts/test-fixtures/judge-host-bootstrap-fake.c",
  "docs/prompt-successor-llm-judge.md", "benchmarks/schemas/llm-judge-response.schema.json",
  "benchmarks/prompt-successor-judge-tool-free-catalog.json",
];
const hash = data => `sha256:${createHash("sha256").update(data).digest("hex")}`;
function check(ok, code) { if (!ok) throw new Error(`JUDGE_HOST_BOOTSTRAP_INVALID: ${code}`); }
function same(a, b, code) { check(stableCanonicalJson(a) === stableCanonicalJson(b), code); }
function closed(v, keys, code) {
  check(v && Object.getPrototypeOf(v) === Object.prototype
    && Object.keys(v).sort().join("|") === [...keys].sort().join("|"), code);
}
function read(path, max = MAX) { return readStableBytes(path, "bootstrap evidence", max, { allowEmpty: true }); }
function external(path, missing = false) {
  check(typeof path === "string" && isAbsolute(path) && resolve(path) === path, "absolute_path");
  assertNoSymlinkPathSegments(path, "bootstrap path", { allowMissingLeaf: missing });
  const offset = relative(ROOT, path);
  check(offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset), "repository_overlap");
  check(missing || realpathSync(path) === path, "canonical_path");
  return path;
}
function save(root, name, bytes) {
  const fd = openSync(resolve(root, name), "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function record(root, name, body) {
  const value = { ...body, record_digest: canonicalDigest(body) };
  writeCanonicalJsonNoReplace({ outputPath: resolve(root, name), artifact: value, maximumBytes: MAX });
  return value;
}
function readRecord(root, name) {
  const value = parseJsonRejectDuplicateKeys(read(resolve(root, name)), name);
  const { record_digest, ...body } = value;
  check(DIGEST.test(record_digest ?? "") && canonicalDigest(body) === record_digest, `${name}_digest`);
  return value;
}
function codeIdentity() {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  check(git.status === 0 && /^[a-f0-9]{40}\s*$/u.test(git.stdout), "source_revision");
  return { revision: git.stdout.trim(), code_digest: canonicalDigest(SOURCES.map(path => ({ path, digest: hash(read(resolve(ROOT, path))) }))) };
}
function verifyExecutionSource(plan) {
  same(plan.source, codeIdentity(), "execution_source_changed");
  if (plan.mode === "target") {
    const git = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
    check(git.status === 0 && git.stdout === "", "clean_target_source_required");
  }
}
function paths(root) {
  return { catalogPath: resolve(root, "model-catalog.json"), instructionPath: resolve(root, "instruction.txt"),
    schemaPath: resolve(root, "response-schema.json"), responsePath: resolve(root, "final.json") };
}
function environment(root) {
  return { HOME: resolve(root, "home"), CODEX_HOME: resolve(root, "home/.codex"), XDG_CONFIG_HOME: resolve(root, "home/.codex"),
    PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NO_COLOR: "1", TMPDIR: resolve(root, "scratch") };
}
function fixedInput({ mode, host, source, image_digest, nonce }) {
  const profile = { ...nativeJudgeLaunchProfile(JUDGE_TOOL_FREE_CLI_VERSION), os: host.os, arch: host.arch, node: host.node };
  const protocol = createJudgeProtocol({ criteria: [{ criterion_id: "constant", rubric: "The supplied source exports the constant one." }],
    instructionText: toolFreeNativeJudgeInstruction(), sourceDigest: source.code_digest,
    targetManifestDigest: canonicalDigest({ purpose: "public_bootstrap_only" }),
    runtimeProfile: { authority_profile: mode === "target" ? "live_native" : "synthetic_only",
      provider: mode === "target" ? "openai" : "fake", model: mode === "target" ? JUDGE_TOOL_FREE_MODEL : "scripted",
      native_identity_digest: image_digest, runtime_config_digest: canonicalDigest(profile), observed_revision: "bootstrap_not_observed",
      transport_kind: mode === "target" ? "native_cli" : "fake_adapter",
      tools_disabled: true, fresh_process_per_slot: true, workspace_isolated: true, response_format_json: true },
    limits: { max_packet_bytes: 65536, max_response_bytes: 65536, timeout_ms: 30000,
      max_input_tokens_per_call: 1, max_output_tokens_per_call: 1, max_total_tokens: 2,
      max_samples: 1, max_calls: 2, unknown_token_policy: "stop_remaining" } });
  const { packet } = buildJudgePacket({ protocol, sampleId: `sample-${nonce.replaceAll("-", "")}`,
    task: "Inspect this public synthetic constant. This is a non-inference request capture, not qualification.",
    documents: [{ kind: "source", text: "export const value = 1;\n" }], originalOutputBytes: Buffer.from("The source exports one.") });
  return { profile, protocol, packet };
}
function template() {
  const root = "/__ask_host_bootstrap__";
  return canonicalDigest({ argv: buildJudgeToolFreeExecutionArgv(paths(root), "http://127.0.0.1:12345/v1"),
    environment: environment(root), outer_policy: judgeHostControlTemplateDigest() });
}
function compile(root, name, source, flags) {
  const compiler = "/usr/bin/cc";
  const args = ["-std=c11", "-Wall", "-Wextra", "-Werror", ...flags, resolve(ROOT, source), "-o", resolve(root, name)];
  const output = spawnSync(compiler, args, { encoding: "buffer", timeout: 30000, maxBuffer: 1024 * 1024 });
  save(root, `${name}-compile.stdout`, output.stdout ?? Buffer.alloc(0));
  save(root, `${name}-compile.stderr`, output.stderr ?? Buffer.alloc(0));
  check(!output.error && output.status === 0 && !output.signal, "control_compile");
  chmodSync(resolve(root, name), 0o500);
  return { compiler, argv: args, source_digest: hash(read(resolve(ROOT, source))), image_digest: hash(read(resolve(root, name))) };
}

/** Preparation has no Codex/probe/provider start and creates no permission. */
export function prepareJudgeHostBootstrap({ evidenceRoot, mode = "target", codexBinary = null, scenario = "success" }) {
  external(evidenceRoot, true);
  check(["target", "synthetic"].includes(mode) && SCENARIOS.includes(scenario), "mode_or_scenario");
  check(mode === "synthetic" ? codexBinary === null : scenario === "success", "synthetic_identity");
  if (mode === "target") {
    check(process.platform === "darwin" && process.arch === "arm64", "target_host_required");
    assertSuccessorNativeExecutable({ path: external(codexBinary), expectedDigest: JUDGE_TOOL_FREE_CLI_SHA256,
      os: "darwin", arch: "arm64" });
    const git = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
    check(git.status === 0 && git.stdout === "", "clean_target_source_required");
  }
  mkdirSync(evidenceRoot, { mode: 0o700 }); // Exclusive namespace; never reused after partial preparation.
  const probe = compile(evidenceRoot, "control-native", "scripts/test-fixtures/judge-host-control-probe.c",
    [`-DPROBE_MODE="${mode}"`, ...(mode === "synthetic" && scenario !== "unconfined_controls" ? ["-DSCRIPTED_DENIALS"] : [])]);
  let native;
  if (mode === "synthetic") native = compile(evidenceRoot, "codex-native", "scripts/test-fixtures/judge-host-bootstrap-fake.c", [`-DSCENARIO="${scenario}"`]);
  else {
    save(evidenceRoot, "codex-native", read(codexBinary, 512 * 1024 * 1024)); chmodSync(resolve(evidenceRoot, "codex-native"), 0o500);
    native = { image_digest: hash(read(resolve(evidenceRoot, "codex-native"), 512 * 1024 * 1024)) };
    same(native.image_digest, JUDGE_TOOL_FREE_CLI_SHA256, "target_image");
    save(evidenceRoot, "sandbox-image.bin", read(JUDGE_HOST_SANDBOX, 16 * 1024 * 1024));
  }
  const source = codeIdentity(), host = { os: process.platform, arch: process.arch, node: process.version }, nonce = randomUUID();
  const input = fixedInput({ mode, host, source, image_digest: native.image_digest, nonce });
  const catalog = read(resolve(ROOT, "benchmarks/prompt-successor-judge-tool-free-catalog.json")); inspectJudgeToolFreeCatalog(catalog);
  save(evidenceRoot, "model-catalog.json", catalog); save(evidenceRoot, "instruction.txt", Buffer.from(input.protocol.instruction_text));
  save(evidenceRoot, "response-schema.json", Buffer.from(stableCanonicalJson(input.packet.response_schema) + "\n"));
  save(evidenceRoot, "stdin.bin", Buffer.from(stableCanonicalJson(input.packet) + "\n"));
  const plan = record(evidenceRoot, "plan.json", { schema_version: "1.0.0", kind: "judge_host_bootstrap_plan", evidence_root: evidenceRoot,
    purpose: "model_free_host_bootstrap", mode, scenario, nonce, source, host, profile: input.profile, protocol: input.protocol,
    packet: input.packet, template_digest: template(), catalog_digest: JUDGE_TOOL_FREE_CATALOG_SHA256,
    native, probe, sandbox_digest: mode === "target" ? hash(read(resolve(evidenceRoot, "sandbox-image.bin"))) : null,
    input_scope: "public_synthetic_only", credential_source: "none", network_scope: "loopback_only",
    max_control_starts: 1, max_codex_starts: 1, provider_calls: 0, automatic_retries: 0 });
  return { evidence_root: evidenceRoot, plan_digest: plan.record_digest, state: "not_started",
    live_execution_authorized: false, measurement_authorized: false };
}
function openPlan(evidenceRoot, planDigest) {
  external(evidenceRoot); const plan = readRecord(evidenceRoot, "plan.json");
  same(plan.record_digest, planDigest, "pinned_plan"); same(plan.evidence_root, evidenceRoot, "plan_transplant");
  same(plan.template_digest, template(), "template_changed");
  check(plan.schema_version === "1.0.0" && plan.kind === "judge_host_bootstrap_plan"
    && plan.purpose === "model_free_host_bootstrap" && ["target", "synthetic"].includes(plan.mode), "plan_kind");
  check(SCENARIOS.includes(plan.scenario) && (plan.mode === "synthetic" || plan.scenario === "success"), "plan_scenario");
  check(/^[a-f0-9-]{36}$/u.test(plan.nonce) && DIGEST.test(plan.source.code_digest), "plan_identity");
  verifyJudgeProtocol(plan.protocol);
  const input = fixedInput({ ...plan, image_digest: plan.native.image_digest });
  same([plan.profile, plan.protocol, plan.packet], [input.profile, input.protocol, input.packet], "fixed_input");
  same(hash(read(resolve(evidenceRoot, "codex-native"), 512 * 1024 * 1024)), plan.native.image_digest, "native_image");
  same(hash(read(resolve(evidenceRoot, "control-native"))), plan.probe.image_digest, "probe_image");
  if (plan.mode === "target") {
    same(plan.native.image_digest, JUDGE_TOOL_FREE_CLI_SHA256, "target_image");
    check(plan.host.os === "darwin" && plan.host.arch === "arm64", "target_host");
    same(hash(read(resolve(evidenceRoot, "sandbox-image.bin"))), plan.sandbox_digest, "sandbox_image");
  } else check(plan.native.image_digest !== JUDGE_TOOL_FREE_CLI_SHA256 && plan.sandbox_digest === null, "synthetic_image");
  same([plan.input_scope, plan.credential_source, plan.network_scope, plan.max_control_starts, plan.max_codex_starts, plan.provider_calls, plan.automatic_retries],
    ["public_synthetic_only", "none", "loopback_only", 1, 1, 0, 0], "plan_scope");
  inspectJudgeToolFreeCatalog(read(resolve(evidenceRoot, "model-catalog.json")));
  same(read(paths(evidenceRoot).instructionPath).toString(), plan.protocol.instruction_text, "instruction_drift");
  same(read(paths(evidenceRoot).schemaPath).toString(), stableCanonicalJson(plan.packet.response_schema) + "\n", "schema_drift");
  same(read(resolve(evidenceRoot, "stdin.bin")).toString(), stableCanonicalJson(plan.packet) + "\n", "stdin_drift");
  return plan;
}

/** Operator approval is supplied independently, not inferred from a result or a hash's syntax. */
export function validateJudgeBootstrapPermission(value, plan, now = Date.now()) {
  closed(value, ["schema_version", "kind", "purpose", "operator_reference", "plan_digest", "code_digest",
    "not_before", "expires_at", "input_scope", "credential_source", "network_scope",
    "max_control_starts", "max_codex_starts", "provider_calls", "automatic_retries"], "permission_shape");
  check(value.schema_version === "1.0.0" && value.kind === "judge_host_bootstrap_permission"
    && value.purpose === "model_free_host_bootstrap", "permission_purpose");
  check(typeof value.operator_reference === "string" && value.operator_reference.trim().length > 0
    && value.operator_reference.length <= 1024, "operator_reference");
  same(value.plan_digest, plan.record_digest, "permission_plan"); same(value.code_digest, plan.source.code_digest, "permission_source");
  for (const key of ["input_scope", "credential_source", "network_scope", "max_control_starts", "max_codex_starts", "provider_calls", "automatic_retries"])
    same(value[key], plan[key], `permission_${key}`);
  check(typeof value.not_before === "string" && typeof value.expires_at === "string" && Number.isFinite(now), "permission_time");
  const start = Date.parse(value.not_before), end = Date.parse(value.expires_at);
  check(Number.isFinite(start) && Number.isFinite(end) && start < end && start <= now && now < end, "permission_expiry");
  return true;
}
function processRecord(root, name, result) {
  const { stdout, stderr, ...process } = result;
  save(root, `${name}.stdout`, stdout); save(root, `${name}.stderr`, stderr);
  return record(root, `${name}.json`, { ...process, stdout_digest: hash(stdout), stderr_digest: hash(stderr) });
}
function processRead(root, name) {
  if (!existsSync(resolve(root, `${name}.json`))) return null;
  const process = readRecord(root, `${name}.json`);
  same(hash(read(resolve(root, `${name}.stdout`))), process.stdout_digest, "stdout_drift");
  same(hash(read(resolve(root, `${name}.stderr`))), process.stderr_digest, "stderr_drift");
  return process;
}
function complete(process) {
  return process !== null && Number.isSafeInteger(process.pid) && process.pid > 1 && process.signal === null
    && process.cause === null && process.kill_error === null && process.residual_detected === false
    && process.truncated.stdout === false && process.truncated.stderr === false && Number.isInteger(process.status);
}
function fileHash(path) { try { return hash(read(path)); } catch { return null; } }
async function negativeListener() {
  let connections = 0; const sockets = new Set();
  const server = createServer(socket => { connections++; sockets.add(socket); socket.once("close", () => sockets.delete(socket)); socket.end(); });
  await new Promise((ok, no) => { server.once("error", no); server.listen(0, "127.0.0.1", ok); });
  const port = server.address().port;
  await new Promise((ok, no) => { const client = connect({ host: "127.0.0.1", port });
    client.on("error", no); client.on("connect", () => client.end()); client.on("close", ok); });
  check(connections === 1, "negative_listener_baseline"); connections = 0;
  return { port, observation: () => ({ baseline_reachable: true, denied_connections: connections }),
    close: async () => { const closed = new Promise(ok => server.close(ok)); for (const socket of sockets) socket.destroy(); await closed; } };
}
function command(plan, root, name, argv) {
  return plan.mode === "target" ? { executable: JUDGE_HOST_SANDBOX,
    argv: ["-f", resolve(root, "outer-policy.sbpl"), resolve(root, name), ...argv] }
    : { executable: resolve(root, name), argv };
}

/** At most one control process and one rejecting request capture. Never accepts credentials or a live provider. */
export async function runJudgeHostBootstrap({ evidenceRoot, planDigest, permissionPath, expectedPermissionDigest }) {
  const plan = openPlan(evidenceRoot, planDigest);
  check(DIGEST.test(expectedPermissionDigest ?? ""), "permission_pin_required");
  if (existsSync(resolve(evidenceRoot, "attempt-claim"))) return reopenJudgeHostBootstrap({ evidenceRoot, planDigest, expectedPermissionDigest });
  const permissionBytes = read(external(permissionPath), 64 * 1024);
  same(hash(permissionBytes), expectedPermissionDigest, "permission_pin");
  const permission = parseJsonRejectDuplicateKeys(permissionBytes, "bootstrap permission");
  validateJudgeBootstrapPermission(permission, plan);
  verifyExecutionSource(plan);
  same(plan.host, { os: process.platform, arch: process.arch, node: process.version }, "execution_host_changed");
  if (plan.mode === "target") same(hash(read(JUDGE_HOST_SANDBOX, 16 * 1024 * 1024)), plan.sandbox_digest, "system_sandbox_changed");
  try { mkdirSync(resolve(evidenceRoot, "attempt-claim"), { mode: 0o700 }); }
  catch (error) { if (error.code === "EEXIST") return reopenJudgeHostBootstrap({ evidenceRoot, planDigest, expectedPermissionDigest }); throw error; }
  // The mkdir claim is exclusive even when two controllers have identical
  // timestamps/content. An idempotent CAS record alone is not a reservation.
  const parentFd = openSync(evidenceRoot, "r");
  try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
  record(evidenceRoot, "started.json", { kind: "judge_bootstrap_start", plan_digest: planDigest,
    permission_digest: expectedPermissionDigest, started_at: new Date().toISOString() });
  // From this point, every error consumes this namespace. A crash leaves ambiguous evidence, never an implicit retry.
  let capture = null, negative = null, terminalError = null, precall = null;
  try {
    save(evidenceRoot, "permission.json", permissionBytes);
    for (const name of ["home", "home/.codex", "scratch", "workspace"]) mkdirSync(resolve(evidenceRoot, name), { mode: 0o700 });
    for (const name of ["allowed-read.txt", "protected-canary.txt", "forbidden-canary.txt"]) save(evidenceRoot, name, CANARY);
    symlinkSync(resolve(evidenceRoot, "protected-canary.txt"), resolve(evidenceRoot, "home/.codex/auth-canary-link"));
    // Parent read/write opens exclude ordinary permissions/absent files as a reason for a child denial.
    for (const name of ["protected-canary.txt", "forbidden-canary.txt"]) closeSync(openSync(resolve(evidenceRoot, name), "r+"));
    capture = await startJudgeLoopbackCapture(); negative = await negativeListener();
    save(evidenceRoot, "outer-policy.sbpl", Buffer.from(judgeHostControlPolicy(evidenceRoot, capture.port)));
    const args = buildJudgeToolFreeExecutionArgv(paths(evidenceRoot), capture.endpoint);
    const config = []; for (let i = 0; i < args.length; i++) if (args[i] === "-c") config.push(args[++i]);
    save(evidenceRoot, "home/.codex/config.toml", Buffer.from(config.join("\n") + "\n"));
    precall = record(evidenceRoot, "precall.json", { plan_digest: planDigest, permission_digest: expectedPermissionDigest,
      endpoint: capture.endpoint, denied_port: negative.port, environment: environment(evidenceRoot),
      control_command: command(plan, evidenceRoot, "control-native", [evidenceRoot, String(capture.port), String(negative.port)]),
      capture_command: command(plan, evidenceRoot, "codex-native", args), policy_digest: hash(read(resolve(evidenceRoot, "outer-policy.sbpl"))),
      parent_canary_access: true, code_digest: plan.source.code_digest });
    const control = await captureJudgeProcess({ ...precall.control_command, env: precall.environment,
      cwd: resolve(evidenceRoot, "workspace"), input: Buffer.alloc(0), timeoutMs: 5000, streamProtocol: "control" });
    processRecord(evidenceRoot, "control", control);
    const unchanged = ["protected-canary.txt", "forbidden-canary.txt"].every(name => fileHash(resolve(evidenceRoot, name)) === hash(CANARY));
    check(complete(control) && control.status === 0, "control_process_failed");
    const controls = inspectJudgeHostControlTrace(control.stdout, { mode: plan.mode,
      deniedConnections: negative.observation().denied_connections, baselineReachable: true, canariesUnchanged: unchanged });
    check(controls.verdict === "passed", "outer_controls_failed");
    validateJudgeBootstrapPermission(permission, plan); // Expiry between probe and request blocks the latter.
    verifyExecutionSource(plan);
    openPlan(evidenceRoot, planDigest); // Recheck snapshots immediately before the only CLI start.
    same(read(resolve(evidenceRoot, "outer-policy.sbpl")).toString(), judgeHostControlPolicy(evidenceRoot, capture.port), "prelaunch_policy_drift");
    same(read(resolve(evidenceRoot, "home/.codex/config.toml")).toString(), config.join("\n") + "\n", "prelaunch_config_drift");
    if (plan.mode === "target") same(hash(read(JUDGE_HOST_SANDBOX)), plan.sandbox_digest, "system_sandbox_changed");
    const result = await captureJudgeProcess({ ...precall.capture_command, env: precall.environment,
      cwd: resolve(evidenceRoot, "workspace"), input: read(resolve(evidenceRoot, "stdin.bin")),
      timeoutMs: plan.mode === "synthetic" && plan.scenario === "timeout" ? 100 : 30000 });
    processRecord(evidenceRoot, "capture", result);
  } catch (error) { terminalError = String(error.message ?? "bootstrap_failed").slice(0, 1024); }
  finally {
    if (capture) await capture.close();
    if (negative) await negative.close();
  }
  const sessionEvidence = [];
  // Capture-only HTTP 400 need not produce a usable session or response. Save
  // what actually exists, but never turn its presence into authenticated origin.
  const sessionsRoot = resolve(evidenceRoot, "home/.codex/sessions");
  try {
    const visit = (dir, depth = 0) => {
      check(depth <= 8, "session_depth");
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        check(!item.isSymbolicLink(), "session_symlink");
        const file = resolve(dir, item.name);
        if (item.isDirectory()) visit(file, depth + 1);
        else {
          check(item.isFile() && item.name.endsWith(".jsonl") && sessionEvidence.length < 8, "session_inventory");
          const data = read(file, 4 * 1024 * 1024), name = `session-${sessionEvidence.length + 1}.bin`;
          save(evidenceRoot, name, data);
          sessionEvidence.push({ name, source_relative_path: relative(evidenceRoot, file), digest: hash(data) });
        }
      }
    };
    if (existsSync(sessionsRoot)) visit(sessionsRoot);
  } catch { terminalError ??= "session_capture_failed"; }
  let responseDigest = null;
  if (existsSync(paths(evidenceRoot).responsePath)) try {
    const response = read(paths(evidenceRoot).responsePath, 4 * 1024 * 1024);
    save(evidenceRoot, "response.bin", response); responseDigest = hash(response);
    if (response.length > 0) terminalError ??= "unexpected_completion_from_rejecting_capture";
  } catch { terminalError ??= "response_capture_failed"; }
  const requestEvidence = [];
  for (const [index, request] of (capture?.requests ?? []).entries()) {
    const prefix = `request-${index + 1}`; save(evidenceRoot, `${prefix}.bin`, request.body);
    const metadata = record(evidenceRoot, `${prefix}.json`, { method: request.method, path: request.path,
      remote_address: request.remote_address, local_address: request.local_address, local_port: request.local_port,
      host_header: request.headers.host ?? null, header_names: Object.keys(request.headers).sort(),
      complete: request.complete, truncated: request.truncated, body_digest: hash(request.body) });
    requestEvidence.push({ body_digest: hash(request.body), metadata_digest: metadata.record_digest });
  }
  const observation = record(evidenceRoot, "observations.json", { terminal_error: terminalError,
    precall_digest: precall?.record_digest ?? null, requests: requestEvidence, sessions: sessionEvidence, response_digest: responseDigest,
    http: capture?.observation() ?? null, network: negative?.observation() ?? null,
    canary_after: Object.fromEntries(["protected-canary.txt", "forbidden-canary.txt", "scratch/allowed-write"].map(name => [name, fileHash(resolve(evidenceRoot, name))])),
    workspace_after: existsSync(resolve(evidenceRoot, "workspace")) ? readdirSync(resolve(evidenceRoot, "workspace")).sort() : null });
  const derived = derive(evidenceRoot, plan, expectedPermissionDigest, observation);
  record(evidenceRoot, "result.json", derived);
  return reopenJudgeHostBootstrap({ evidenceRoot, planDigest, expectedPermissionDigest });
}

function derive(root, plan, permissionDigest, observation) {
  const failures = []; const add = code => failures.push(code);
  const started = readRecord(root, "started.json");
  same(started.plan_digest, plan.record_digest, "started_plan"); same(started.permission_digest, permissionDigest, "started_permission");
  // Replay checks the historical approval at the historical start, not today's expiry.
  const approvalBytes = read(resolve(root, "permission.json"), 64 * 1024); same(hash(approvalBytes), permissionDigest, "saved_permission");
  validateJudgeBootstrapPermission(parseJsonRejectDuplicateKeys(approvalBytes, "saved permission"), plan, Date.parse(started.started_at));
  let control = null, request = null;
  if (observation.terminal_error !== null) add("execution_failed");
  if (observation.precall_digest !== null) {
    const precall = readRecord(root, "precall.json"); same(precall.record_digest, observation.precall_digest, "precall_digest");
    same([precall.plan_digest, precall.permission_digest, precall.code_digest], [plan.record_digest, permissionDigest, plan.source.code_digest], "precall_binding");
    const endpoint = new URL(precall.endpoint); check(endpoint.hostname === "127.0.0.1" && endpoint.protocol === "http:" && endpoint.pathname === "/v1", "endpoint");
    const args = buildJudgeToolFreeExecutionArgv(paths(root), precall.endpoint);
    same(precall.capture_command, command(plan, root, "codex-native", args), "capture_command");
    same(precall.control_command, command(plan, root, "control-native", [root, endpoint.port, String(precall.denied_port)]), "control_command");
    same(precall.environment, environment(root), "environment");
    const policy = read(resolve(root, "outer-policy.sbpl")); same(hash(policy), precall.policy_digest, "policy_digest");
    same(policy.toString(), judgeHostControlPolicy(root, Number(endpoint.port)), "policy_reconstruction");
    const config = []; for (let i = 0; i < args.length; i++) if (args[i] === "-c") config.push(args[++i]);
    same(read(resolve(root, "home/.codex/config.toml")).toString(), config.join("\n") + "\n", "config_drift");
    check(readlinkSync(resolve(root, "home/.codex/auth-canary-link")) === resolve(root, "protected-canary.txt"), "canary_link_changed");
    const process = processRead(root, "control");
    if (process !== null && judgeProcessStreamFailure(read(resolve(root, "control.stdout")), "control") !== null)
      add("control_event_stream_invalid");
    if (!complete(process) || process.status !== 0) add("control_process_incomplete");
    else try {
      control = inspectJudgeHostControlTrace(read(resolve(root, "control.stdout")), { mode: plan.mode,
        deniedConnections: observation.network?.denied_connections,
        baselineReachable: precall.parent_canary_access === true && observation.network?.baseline_reachable === true,
        canariesUnchanged: ["protected-canary.txt", "forbidden-canary.txt"].every(name => observation.canary_after[name] === hash(CANARY))
          && observation.canary_after["scratch/allowed-write"] === hash(Buffer.from("allowed-write\n")) });
      if (control.verdict !== "passed") add("outer_controls_failed");
    } catch { add("control_trace_invalid"); }
    const captured = processRead(root, "capture");
    if (captured !== null && judgeProcessStreamFailure(read(resolve(root, "capture.stdout"))) !== null)
      add("capture_event_stream_invalid");
    if (!complete(captured) || captured.status === 0) add("capture_process_incomplete");
    const requests = observation.requests.map((item, i) => {
      const body = read(resolve(root, `request-${i + 1}.bin`), 4 * 1024 * 1024), meta = readRecord(root, `request-${i + 1}.json`);
      same([hash(body), meta.record_digest], [item.body_digest, item.metadata_digest], "request_digest");
      same(meta.body_digest, item.body_digest, "metadata_body");
      if (meta.complete !== true || meta.truncated !== false) add("request_incomplete");
      check(Array.isArray(meta.header_names) && meta.header_names.every(name => typeof name === "string"), "header_names");
      return { method: meta.method, path: meta.path, remote_address: meta.remote_address,
        local_address: meta.local_address, local_port: meta.local_port,
        headers: Object.fromEntries(meta.header_names.map(name => [name, name.toLowerCase() === "host" ? meta.host_header : ""])), body };
    });
    const actualRequests = readdirSync(root).filter(name => /^request-\d+\.(?:bin|json)$/u.test(name));
    check(actualRequests.length === requests.length * 2, "request_inventory");
    if (observation.http?.failure !== null || observation.http?.requests_seen !== requests.length) add("http_incomplete");
    try { request = inspectJudgeToolFreeRequest(requests, precall.endpoint, { stdinText: stableCanonicalJson(plan.packet) + "\n",
      instructionText: plan.protocol.instruction_text, responseSchema: plan.packet.response_schema }); }
    catch { add("request_not_verified"); }
  } else add("precall_missing");
  for (const [name, digest] of Object.entries(observation.canary_after)) {
    check(["protected-canary.txt", "forbidden-canary.txt", "scratch/allowed-write"].includes(name), "canary_inventory");
    same(fileHash(resolve(root, name)), digest, "canary_artifact_drift");
  }
  for (const [index, session] of observation.sessions.entries()) {
    same(session.name, `session-${index + 1}.bin`, "session_inventory");
    same(hash(read(resolve(root, session.name), 4 * 1024 * 1024)), session.digest, "session_drift");
  }
  same(readdirSync(root).filter(name => /^session-\d+\.bin$/u.test(name)).length, observation.sessions.length, "session_file_inventory");
  if (observation.response_digest !== null) same(hash(read(resolve(root, "response.bin"))), observation.response_digest, "response_drift");
  if (observation.workspace_after !== null) same(readdirSync(resolve(root, "workspace")).sort(), observation.workspace_after, "workspace_artifact_drift");
  if (stableCanonicalJson(observation.workspace_after) !== "[]") add("workspace_changed");
  return { schema_version: "1.0.0", kind: "judge_host_bootstrap_result", plan_digest: plan.record_digest,
    permission_digest: permissionDigest, observations_digest: observation.record_digest,
    state: failures.length ? "failed" : "verified_local", mode: plan.mode, failures, control, request,
    outer_policy_observed: plan.mode === "target" && control?.verdict === "passed",
    session_capture_status: observation.sessions.length ? "captured_unverified" : "not_produced",
    credential_supply_verified: false, provider_only_network_verified: false, authenticated_session_verified: false,
    live_execution_authorized: false, measurement_authorized: false };
}

/** No compilation, child process, socket or provider call on any replay path. */
export function reopenJudgeHostBootstrap({ evidenceRoot, planDigest, expectedPermissionDigest = null }) {
  const plan = openPlan(evidenceRoot, planDigest);
  if (!existsSync(resolve(evidenceRoot, "started.json"))) return { state: existsSync(resolve(evidenceRoot, "attempt-claim")) ? "ambiguous" : "not_started", plan_digest: planDigest, live_execution_authorized: false, measurement_authorized: false };
  check(existsSync(resolve(evidenceRoot, "attempt-claim")), "missing_attempt_claim");
  const started = readRecord(evidenceRoot, "started.json");
  same(started.plan_digest, planDigest, "started_plan"); same(started.permission_digest, expectedPermissionDigest, "permission_pin_required");
  if (!existsSync(resolve(evidenceRoot, "result.json"))) return { state: "ambiguous", plan_digest: planDigest, live_execution_authorized: false, measurement_authorized: false };
  const observation = readRecord(evidenceRoot, "observations.json"), result = readRecord(evidenceRoot, "result.json");
  const { record_digest, ...saved } = result;
  same(saved, derive(evidenceRoot, plan, expectedPermissionDigest, observation), "result_rederivation");
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  const values = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]));
  Promise.resolve().then(() => {
    check(args.length % 2 === 0 && Object.keys(values).length === args.length / 2, "CLI_arguments");
    if (mode === "prepare") {
      same(Object.keys(values).sort(), ["--codex-bin", "--evidence-root"], "prepare_arguments");
      return prepareJudgeHostBootstrap({ evidenceRoot: values["--evidence-root"], codexBinary: values["--codex-bin"] });
    }
    if (mode === "run") {
      same(Object.keys(values).sort(), ["--evidence-root", "--permission", "--permission-digest", "--plan-digest"], "run_arguments");
      return runJudgeHostBootstrap({ evidenceRoot: values["--evidence-root"], planDigest: values["--plan-digest"],
        permissionPath: values["--permission"], expectedPermissionDigest: values["--permission-digest"] });
    }
    check(mode === "reopen", "mode");
    same(Object.keys(values).sort(), ["--evidence-root", "--permission-digest", "--plan-digest"], "reopen_arguments");
    return reopenJudgeHostBootstrap({ evidenceRoot: values["--evidence-root"], planDigest: values["--plan-digest"], expectedPermissionDigest: values["--permission-digest"] });
  }).then(result => { process.stdout.write(JSON.stringify(result) + "\n"); if (["failed", "ambiguous"].includes(result.state)) process.exitCode = 1; })
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
