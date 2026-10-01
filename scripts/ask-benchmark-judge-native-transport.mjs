import { createHash } from "node:crypto";
import { captureJudgeProcess } from "./ask-benchmark-judge-process.mjs";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync,
  realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
  readStableBytes, stableCanonicalJson, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { assertSuccessorNativeExecutable } from "./ask-benchmark-prompt-successor-native.mjs";
import { inspectNativeJudgeCapture, inspectNativeJudgeCli } from "./ask-benchmark-judge-native-capture.mjs";
import {
  JUDGE_TOOL_FREE_CATALOG_SHA256, JUDGE_TOOL_FREE_CLI_SHA256, JUDGE_TOOL_FREE_CLI_VERSION,
  JUDGE_TOOL_FREE_BASE_INSTRUCTIONS, JUDGE_TOOL_FREE_MODEL,
  buildJudgeToolFreeExecutionArgv, inspectJudgeToolFreeCatalog,
} from "./ask-benchmark-judge-tool-free-profile.mjs";
import { captureSuccessorUsage } from "./ask-benchmark-prompt-successor-usage.mjs";
import { JudgeAuthorityError, verifyJudgeProtocol, consumeNativeJudgeInvocation } from "./ask-benchmark-llm-judge.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_STREAM = 20 * 1024 * 1024;
const MAX_FILE = 4 * 1024 * 1024;
const MAX_INPUT = 32 * 1024 * 1024 + 1;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const handles = new WeakMap();
const TOOL_FREE_REVISION = "native-capture-tool-free-v1";
const TOOL_FREE_CATALOG = resolve(ROOT, "benchmarks/prompt-successor-judge-tool-free-catalog.json");
const LIVE_HOST_REQUIREMENTS = Object.freeze([
  "reviewed_credential_supply", "authenticated_tool_dispatch_restriction",
  "provider_only_network", "additional_file_access_restriction",
  "target_session_capture_origin", "separate_live_invocation_authorization",
]);
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function check(ok, code) { if (!ok) throw new JudgeAuthorityError(`native_transport_${code}`); }
function same(a, b, code) { check(stableCanonicalJson(a) === stableCanonicalJson(b), code); }
function external(path) {
  check(typeof path === "string" && isAbsolute(path) && resolve(path) === path, "path");
  const offset = relative(ROOT, path);
  check(offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset), "external_root");
  assertNoSymlinkPathSegments(path, "native capture root", { allowMissingLeaf: true });
}
function bytes(path, limit = MAX_STREAM) {
  return readStableBytes(path, "native transport evidence", limit, { allowEmpty: true });
}
function save(path, value) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
}
function record(path, body) {
  const result = { ...body, record_digest: canonicalDigest(body) };
  writeCanonicalJsonNoReplace({ outputPath: path, artifact: result, maximumBytes: MAX_FILE });
  return result;
}
function load(path) {
  const value = parseJsonRejectDuplicateKeys(bytes(path, MAX_FILE), "native transport record");
  const { record_digest: digest, ...body } = value;
  check(DIGEST.test(digest ?? "") && canonicalDigest(body) === digest, "record_digest");
  return value;
}

/** The launch policy is identity input, not proof that a target CLI enforces it. */
function legacyNativeJudgeLaunchProfile(cliVersion) {
  check(typeof cliVersion === "string" && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/u.test(cliVersion), "cli_version");
  return { schema_version: "1.0.0", kind: "llm_judge_native_launch_profile", cli_version: cliVersion,
    adapter_revision: "native-capture-v1", os: process.platform, arch: process.arch, node: process.version,
    purpose: "synthetic_qualification_only", credential_source: "none", shell: false,
    approval_policy: "never", sandbox_mode: "read-only", web_search: "disabled",
    shell_tool: false, unified_exec: false, view_image: false,
    max_stream_bytes: MAX_STREAM, all_tools_disabled_verified: false };
}

export function nativeJudgeLaunchProfile(cliVersion) {
  const legacy = legacyNativeJudgeLaunchProfile(cliVersion);
  if (cliVersion !== JUDGE_TOOL_FREE_CLI_VERSION) return legacy;
  const templatePaths = launchPaths("/__ask_judge_invocation__");
  return { ...legacy, adapter_revision: TOOL_FREE_REVISION,
    purpose: "tool_free_judge_preparation_only",
    launch_template_digest: canonicalDigest({ argv: buildJudgeToolFreeExecutionArgv(templatePaths),
      environment: launchEnvironment(templatePaths) }),
    catalog_digest: JUDGE_TOOL_FREE_CATALOG_SHA256,
    target_native_identity_digest: JUDGE_TOOL_FREE_CLI_SHA256,
    requested_model: JUDGE_TOOL_FREE_MODEL, requested_provider: "openai",
    live_execution_authorized: false, required_host_evidence: [...LIVE_HOST_REQUIREMENTS] };
}

function toolFree(profile) { return profile.adapter_revision === TOOL_FREE_REVISION; }
function launchPaths(root) {
  const home = resolve(root, "home"), codexHome = resolve(home, ".codex");
  return { home, codexHome, workspace: resolve(root, "workspace"),
    instructionPath: resolve(root, "instruction.txt"), schemaPath: resolve(root, "response-schema.json"),
    responsePath: resolve(root, "final.json"), catalogPath: resolve(root, "model-catalog.json"),
    configPath: resolve(codexHome, "config.toml"), executablePath: resolve(root, "codex-native") };
}
function launchEnvironment({ home, codexHome }) {
  return { HOME: home, CODEX_HOME: codexHome, XDG_CONFIG_HOME: codexHome,
    PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NO_COLOR: "1" };
}
function launchArgv(profile, protocol, paths) {
  return toolFree(profile) ? buildJudgeToolFreeExecutionArgv(paths)
    : ["exec", "--json", "--skip-git-repo-check", "--model", protocol.runtime_profile.model,
      "--sandbox", "read-only", "--output-schema", paths.schemaPath,
      "--output-last-message", paths.responsePath, "-"];
}
function launchConfig(profile, paths) {
  if (!toolFree(profile)) return configText(paths.instructionPath);
  const argv = buildJudgeToolFreeExecutionArgv(paths), settings = [];
  for (let index = 0; index < argv.length; index++) if (argv[index] === "-c") settings.push(argv[++index]);
  return settings.join("\n") + "\n";
}

/** Exact trusted text block, excluding explanatory status prose in the document. */
export function toolFreeNativeJudgeInstruction() {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes(resolve(ROOT, "docs/prompt-successor-llm-judge.md"), 64 * 1024));
  const blocks = [...text.matchAll(/^```text\n([\s\S]*?)^```$/gmu)];
  check(blocks.length === 1 && blocks[0][1].trim().length > 0, "judge_instruction_source");
  return blocks[0][1];
}

/**
 * Read-only target preparation. The returned plan is NOT an adapter capability.
 * The compiled-fake integration uses the same argv/files without changing its
 * fake/scripted protocol identity into a claim about an actual OpenAI model.
 */
export function prepareToolFreeNativeJudgeLaunch({ protocol, invocationRoot }) {
  verifyJudgeProtocol(protocol);
  external(invocationRoot);
  const profile = nativeJudgeLaunchProfile(JUDGE_TOOL_FREE_CLI_VERSION);
  same(protocol.runtime_profile.runtime_config_digest, canonicalDigest(profile), "profile_digest");
  check(protocol.instruction_text.trim() !== JUDGE_TOOL_FREE_BASE_INSTRUCTIONS, "capture_instruction_not_judge");
  same(protocol.instruction_text, toolFreeNativeJudgeInstruction(), "judge_instruction_binding");
  if (protocol.runtime_profile.authority_profile === "live_native") {
    same(protocol.runtime_profile.provider, "openai", "target_provider");
    same(protocol.runtime_profile.model, JUDGE_TOOL_FREE_MODEL, "target_model");
    same(protocol.runtime_profile.native_identity_digest, JUDGE_TOOL_FREE_CLI_SHA256, "target_image");
  }
  inspectJudgeToolFreeCatalog(bytes(TOOL_FREE_CATALOG, MAX_FILE));
  const paths = launchPaths(invocationRoot);
  return { kind: "llm_judge_tool_free_launch_preparation", protocol_digest: protocol.protocol_digest,
    profile, paths, argv: launchArgv(profile, protocol, paths),
    environment: launchEnvironment(paths), instruction_digest: protocol.instruction_digest,
    response_schema_digest: protocol.response_schema_digest,
    live_execution_authorized: false, missing_host_evidence: [...LIVE_HOST_REQUIREMENTS] };
}

function configText(instructionPath) {
  return `approval_policy = "never"\nsandbox_mode = "read-only"\nweb_search = "disabled"\n` +
    `model_reasoning_effort = "medium"\nmodel_instructions_file = ${JSON.stringify(instructionPath)}\n` +
    `project_doc_max_bytes = 0\n[features]\nshell_tool = false\nunified_exec = false\n` +
    `[tools]\nview_image = false\n`;
}

/**
 * Actual child-process transport, restricted to explicitly synthetic evidence.
 * No .invoke callback or credential source is accepted. Live activation needs
 * a separately implemented/reviewed effective tool/credential/host policy.
 */
export function createSyntheticNativeJudgeAdapter({ protocol, executable, cliVersion, captureRoot }) {
  verifyJudgeProtocol(protocol);
  check(protocol.runtime_profile.authority_profile === "synthetic_only", "live_profile_unverified");
  check(["linux", "darwin"].includes(process.platform), "platform");
  const profile = nativeJudgeLaunchProfile(cliVersion);
  same(protocol.runtime_profile.runtime_config_digest, canonicalDigest(profile), "profile_digest");
  if (toolFree(profile)) {
    // Local TF3 is not authentication/confinement authority. Never run the
    // pinned target Codex image under the synthetic API, even for --help.
    check(protocol.runtime_profile.native_identity_digest !== JUDGE_TOOL_FREE_CLI_SHA256,
      "target_image_requires_live_host_evidence");
    prepareToolFreeNativeJudgeLaunch({ protocol, invocationRoot: captureRoot });
  }
  const native = assertSuccessorNativeExecutable({ path: executable,
    expectedDigest: protocol.runtime_profile.native_identity_digest, os: process.platform, arch: process.arch });
  const inspected = inspectNativeJudgeCli({ executable, expectedSha256: native.executable_digest, expectedVersion: cliVersion });
  check(Object.values(inspected.advertised_flags).every(Boolean), "cli_flags_missing");
  external(captureRoot);
  mkdirSync(captureRoot, { recursive: true, mode: 0o700 });
  check(realpathSync(captureRoot) === captureRoot, "capture_root_identity");
  const handle = Object.freeze({ kind: "native_capture_adapter" });
  handles.set(handle, { protocolDigest: protocol.protocol_digest, executable, captureRoot, profile, native, inspected });
  return handle;
}
function adapterState(handle, protocol) {
  const found = handles.get(handle);
  check(found !== undefined, "opaque_adapter_required");
  same(found.protocolDigest, protocol.protocol_digest, "adapter_protocol");
  return found;
}
export function assertNativeJudgeAdapter(handle, protocol) { adapterState(handle, protocol); }
function filesUnder(root) {
  const files = [];
  let entries = 0;
  function visit(directory, depth) {
    check(depth < 12, "session_tree_depth");
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      check(++entries <= 512 && !item.isSymbolicLink(), "unexpected_file");
      const path = resolve(directory, item.name);
      if (item.isDirectory()) visit(path, depth + 1);
      else { check(item.isFile(), "unexpected_file"); files.push(path); }
    }
  }
  if (existsSync(root)) visit(root, 0);
  return files;
}
/** Called only by the once-only Judge runner after its durable slot claim. */
export async function invokeNativeJudgeAdapter(handle, { protocol, packet, request, slot, permit }) {
  const state = adapterState(handle, protocol);
  consumeNativeJudgeInvocation(permit, { protocol, request, slot });
  check(["A", "B"].includes(slot), "slot");
  const invocationRoot = resolve(state.captureRoot, protocol.protocol_digest.slice(7), request.request_digest.slice(7), slot);
  external(invocationRoot);
  mkdirSync(dirname(invocationRoot), { recursive: true, mode: 0o700 });
  try { mkdirSync(invocationRoot, { mode: 0o700 }); }
  catch (error) { if (error.code === "EEXIST") throw new JudgeAuthorityError("native_transport_invocation_already_claimed"); throw error; }
  const paths = launchPaths(invocationRoot);
  const { workspace, codexHome, instructionPath, schemaPath, responsePath, configPath, catalogPath } = paths;
  mkdirSync(workspace, { mode: 0o700 }); mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const input = Buffer.from(stableCanonicalJson(packet) + "\n");
  let executable = state.executable;
  if (toolFree(state.profile)) {
    prepareToolFreeNativeJudgeLaunch({ protocol, invocationRoot });
    const catalog = bytes(TOOL_FREE_CATALOG, MAX_FILE);
    inspectJudgeToolFreeCatalog(catalog);
    save(catalogPath, catalog);
    const image = bytes(state.executable, 512 * 1024 * 1024);
    same(hash(image), state.native.executable_digest, "binary_drift");
    executable = paths.executablePath;
    save(executable, image); chmodSync(executable, 0o500);
  }
  save(instructionPath, Buffer.from(protocol.instruction_text));
  save(schemaPath, Buffer.from(stableCanonicalJson(packet.response_schema) + "\n"));
  save(configPath, Buffer.from(launchConfig(state.profile, paths))); save(resolve(invocationRoot, "stdin.bin"), input);
  const argv = launchArgv(state.profile, protocol, paths), env = launchEnvironment(paths);
  const verifyBinary = () => same(assertSuccessorNativeExecutable({ path: executable,
    expectedDigest: protocol.runtime_profile.native_identity_digest, os: process.platform, arch: process.arch }), state.native, "binary_drift");
  const verifyCatalog = () => { if (toolFree(state.profile)) inspectJudgeToolFreeCatalog(bytes(catalogPath, MAX_FILE)); };
  verifyBinary(); verifyCatalog();
  const precall = record(resolve(invocationRoot, "precall.json"), { schema_version: "1.0.0", kind: "llm_judge_native_precall",
    protocol_digest: protocol.protocol_digest, request_digest: request.request_digest, packet_digest: canonicalDigest(packet), slot,
    executable, ...(toolFree(state.profile) ? { source_executable: state.executable } : {}),
    executable_digest: state.native.executable_digest,
    launch_profile: state.profile, interface_inspection: state.inspected, argv, cwd: workspace, environment: env,
    config_digest: hash(bytes(configPath)), instruction_digest: hash(bytes(instructionPath)),
    schema_digest: hash(bytes(schemaPath)), stdin_digest: hash(input), automatic_retries: 0 });
  const result = await captureJudgeProcess({ executable, argv, cwd: workspace, env, input,
    timeoutMs: protocol.limits.timeout_ms });
  save(resolve(invocationRoot, "stdout.bin"), result.stdout); save(resolve(invocationRoot, "stderr.bin"), result.stderr);
  let rejection = result.cause ?? result.kill_error;
  let session = null, response = null, inspection = null;
  try {
    verifyBinary(); verifyCatalog();
    same(hash(bytes(configPath)), precall.config_digest, "config_drift");
    same(hash(bytes(instructionPath)), precall.instruction_digest, "instruction_drift");
    same(hash(bytes(schemaPath)), precall.schema_digest, "schema_drift");
    check(readdirSync(workspace).length === 0, "workspace_changed");
    const sessions = filesUnder(resolve(codexHome, "sessions")).filter(path => path.endsWith(".jsonl"));
    check(sessions.length === 1, "session_inventory");
    session = bytes(sessions[0]); save(resolve(invocationRoot, "session.bin"), session);
    response = bytes(responsePath, MAX_FILE); save(resolve(invocationRoot, "response.bin"), response);
    inspection = inspectNativeJudgeCapture({ protocol, packet, processResult: { ...result, error: rejection,
      workspace_descendants_detected: result.residual_detected }, sessionBytes: session, responseBytes: response,
      expected: { provider: protocol.runtime_profile.provider, model: protocol.runtime_profile.model,
        cli_version: state.profile.cli_version, reasoning_effort: "medium", cwd: workspace }, responseMode: "record_invalid" });
  } catch (error) { rejection ??= error.code ?? "capture_incomplete"; }
  const usage = captureSuccessorUsage({ ...result, error: rejection, workspace_descendants_detected: result.residual_detected });
  const saved = record(resolve(invocationRoot, "result.json"), { schema_version: "1.0.0", kind: "llm_judge_native_capture",
    precall_digest: precall.record_digest, process_id: result.pid, exit_code: result.status, signal: result.signal,
    duration_ms: result.duration_ms, rejection, truncated_streams: result.truncated, residual_process_group_detected: result.residual_detected,
    kill_error: result.kill_error, stdout_digest: hash(result.stdout), stderr_digest: hash(result.stderr),
    response_digest: response === null ? null : hash(response), session_digest: session === null ? null : hash(session),
    inspection, usage, capture_origin: "controller_spawn_and_private_store", authority_profile: "synthetic_only",
    tool_isolation_verified: false, live_qualification_established: false, measurement_authorized: false });
  const ref = { invocation_root: invocationRoot, capture_digest: saved.record_digest };
  const reopened = reopenNativeJudgeCapture({ reference: ref, protocol, packet, request, slot });
  if (reopened.result.rejection !== null) {
    const error = new JudgeAuthorityError(`native_transport_${reopened.result.rejection}`);
    error.nativeCapture = ref; throw error;
  }
  const first = parseJsonRejectDuplicateKeys(session.toString().split("\n")[0], "native session metadata").payload;
  return { rawResponseBytes: response, exitCode: result.status, signal: result.signal, timedOut: false,
    durationMs: result.duration_ms, tokens: { input: usage.metrics.input_tokens.value,
      output: usage.metrics.output_tokens.value, total: usage.metrics.total_tokens.value },
    runtime: { provider: first.model_provider, model: protocol.runtime_profile.model,
      native_identity_digest: state.native.executable_digest, runtime_config_digest: canonicalDigest(state.profile),
      observed_revision: protocol.runtime_profile.observed_revision, session_id: first.id, process_id: result.pid,
      tools_disabled: null, fresh_process: true, workspace_isolated: null }, nativeCapture: ref };
}

/** Read-only closure over bytes captured by the controller; the private store is trusted. */
export function reopenNativeJudgeCapture({ reference, protocol, packet, request, slot }) {
  check(reference && Object.keys(reference).sort().join("|") === "capture_digest|invocation_root", "reference");
  external(reference.invocation_root);
  const root = reference.invocation_root;
  const precall = load(resolve(root, "precall.json")), result = load(resolve(root, "result.json"));
  same(result.record_digest, reference.capture_digest, "capture_digest");
  same(result.precall_digest, precall.record_digest, "precall_digest");
  same([precall.protocol_digest, precall.packet_digest, precall.request_digest, precall.slot],
    [protocol.protocol_digest, canonicalDigest(packet), request.request_digest, slot], "request_binding");
  same(precall.executable_digest, protocol.runtime_profile.native_identity_digest, "binary_binding");
  same(canonicalDigest(precall.launch_profile), protocol.runtime_profile.runtime_config_digest, "profile_binding");
  // Creation always selects the new 0.157.1 profile. Historical v1 captures
  // retain their exact old protocol/profile identity and are read-only compatible.
  const savedProfile = precall.launch_profile.adapter_revision === "native-capture-v1"
    ? legacyNativeJudgeLaunchProfile(precall.launch_profile.cli_version)
    : nativeJudgeLaunchProfile(precall.launch_profile.cli_version);
  same(precall.launch_profile, savedProfile, "launch_profile");
  const paths = launchPaths(root);
  same(precall.cwd, paths.workspace, "workspace_binding");
  same(precall.environment, launchEnvironment(paths), "environment_binding");
  same(precall.argv, launchArgv(precall.launch_profile, protocol, paths), "argv_binding");
  same(bytes(paths.instructionPath).toString("utf8"), protocol.instruction_text, "instruction_binding");
  same(bytes(paths.schemaPath).toString("utf8"), stableCanonicalJson(packet.response_schema) + "\n", "schema_binding");
  same(bytes(paths.configPath).toString("utf8"), launchConfig(precall.launch_profile, paths), "config_binding");
  if (toolFree(precall.launch_profile)) {
    check(protocol.instruction_text.trim() !== JUDGE_TOOL_FREE_BASE_INSTRUCTIONS, "capture_instruction_not_judge");
    same(precall.executable, paths.executablePath, "snapshot_path");
    same(hash(bytes(paths.executablePath, 512 * 1024 * 1024)), precall.executable_digest, "snapshot_digest");
    inspectJudgeToolFreeCatalog(bytes(paths.catalogPath, MAX_FILE));
  }
  const { inspection_digest: interfaceDigest, ...interfaceBody } = precall.interface_inspection;
  same(canonicalDigest(interfaceBody), interfaceDigest, "interface_digest");
  same(precall.interface_inspection.executable_digest, precall.executable_digest, "interface_executable");
  same(precall.interface_inspection.cli_version, precall.launch_profile.cli_version, "interface_version");
  check(precall.interface_inspection.native_transport_authorized === false
    && precall.interface_inspection.tool_isolation_verified === false, "interface_authority");
  check(result.rejection !== null || (Number.isSafeInteger(result.process_id) && result.process_id > 1
    && result.kill_error === null && result.exit_code === 0 && result.signal === null
    && result.truncated_streams.stdout === false && result.truncated_streams.stderr === false), "process_completion");
  check(result.authority_profile === "synthetic_only" && result.measurement_authorized === false
    && result.tool_isolation_verified === false && result.live_qualification_established === false, "authority_claim");
  same(hash(bytes(resolve(root, "stdin.bin"), MAX_INPUT)), precall.stdin_digest, "stdin_digest");
  same(bytes(resolve(root, "stdin.bin"), MAX_INPUT).toString("utf8"), stableCanonicalJson(packet) + "\n", "stdin_binding");
  for (const [file, expected] of [["instruction.txt", precall.instruction_digest], ["response-schema.json", precall.schema_digest],
    ["home/.codex/config.toml", precall.config_digest], ["stdout.bin", result.stdout_digest], ["stderr.bin", result.stderr_digest],
    ["response.bin", result.response_digest], ["session.bin", result.session_digest]]) {
    if (expected !== null) same(hash(bytes(resolve(root, file))), expected, "artifact_drift");
  }
  if (result.rejection === null) {
    const inspection = inspectNativeJudgeCapture({ protocol, packet,
      processResult: { status: result.exit_code, signal: result.signal, error: null, stdout: bytes(resolve(root, "stdout.bin")),
        workspace_descendants_detected: result.residual_process_group_detected },
      sessionBytes: bytes(resolve(root, "session.bin")), responseBytes: bytes(resolve(root, "response.bin")),
      expected: { provider: protocol.runtime_profile.provider, model: protocol.runtime_profile.model,
        cli_version: precall.launch_profile.cli_version, reasoning_effort: "medium", cwd: precall.cwd }, responseMode: "record_invalid" });
    same(inspection, result.inspection, "inspection_rederivation");
    same(result.usage, inspection.usage, "usage_rederivation");
  }
  return { precall, result };
}

export function verifyNativeJudgeReceipt({ reference, protocol, packet, request, slot, receipt }) {
  const captured = reopenNativeJudgeCapture({ reference, protocol, packet, request, slot });
  if (captured.result.rejection !== null) {
    check(receipt.status === "transport_error" && receipt.runtime === null, "failed_capture_promoted");
  } else {
    const raw = bytes(resolve(reference.invocation_root, "response.bin"));
    same(receipt.raw_response_digest, hash(raw), "receipt_response");
    same([receipt.exit_code, receipt.signal, receipt.duration_ms, receipt.timed_out],
      [captured.result.exit_code, captured.result.signal, captured.result.duration_ms, false], "receipt_execution");
    same(receipt.runtime?.process_id, captured.result.process_id, "receipt_pid");
    const session = parseJsonRejectDuplicateKeys(bytes(resolve(reference.invocation_root, "session.bin")).toString().split("\n")[0], "session metadata");
    same(receipt.runtime?.session_id, session.payload.id, "receipt_session");
    same(receipt.tokens, { input: captured.result.usage.metrics.input_tokens.value,
      output: captured.result.usage.metrics.output_tokens.value, total: captured.result.usage.metrics.total_tokens.value }, "receipt_usage");
  }
}
