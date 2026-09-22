import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest, readStableBytes, parseJsonRejectDuplicateKeys,
  assertNoSymlinkPathSegments,
} from "./content-addressed-store.mjs";
import {
  validatePromptSuccessorPreparation, validateSuccessorSourceScope, validateSuccessorRuntime, successorClosed,
  successorExact, successorFail,
} from "./ask-benchmark-prompt-successor.mjs";
import { readSuccessorParent, readSuccessorImplementationIdentity } from "./ask-benchmark-prompt-successor-repository.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_INPUT_BYTES = 1024 * 1024;
const MARKER = "$ARGUMENTS";
const handles = new WeakMap();
const rawDigest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const copy = (value) => structuredClone(value);

function decode(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) successorFail("SUCCESSOR_INPUT_SIZE", label);
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { successorFail("SUCCESSOR_INPUT_ENCODING", label); }
}

/** Pure transport rule, not evidence that a file was registered or executed. */
export function renderSuccessorStdin(templateBytes, taskBytes) {
  const template = decode(templateBytes, "Prompt template");
  const task = decode(taskBytes, "task input");
  const offset = template.indexOf(MARKER);
  if (offset < 0 || template.indexOf(MARKER, offset + MARKER.length) >= 0) successorFail("SUCCESSOR_ARGUMENT_MARKER", "Prompt template");
  // Literal concatenation, not String.replace replacement-string expansion.
  // Task text may itself contain $&, $`, $', or $ARGUMENTS.
  const result = Buffer.from(template.slice(0, offset) + task + template.slice(offset + MARKER.length), "utf8");
  if (result.length > MAX_INPUT_BYTES) successorFail("SUCCESSOR_INPUT_SIZE", "composed stdin");
  return result;
}

function sourcePath(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._/-]+$/u.test(value)
    || value.split("/").some((p) => ["", ".", ".."].includes(p))
    || posix.isAbsolute(value) || posix.normalize(value) !== value) successorFail("SUCCESSOR_PROMPT_SOURCE_PATH", "Prompt path");
  return value;
}

function gitBytes(root, revision, path) {
  sourcePath(path);
  return execFileSync("git", ["-C", root, "show", `${revision}:${path}`], {
    encoding: null, timeout: 10000, maxBuffer: MAX_INPUT_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Reads only public pinned Prompt sources. No model, shell, network, evaluation,
 * authentication or measured-result access. Does not publish any authority.
 * The returned handle cannot be created by matching caller-supplied digests.
 */
export async function openSuccessorPromptInput({ preparation, scope, expectedScopeDigest, caseId, root = ROOT }) {
  const implementation = readSuccessorImplementationIdentity(root);
  successorExact(preparation.implementation, implementation, "loaded implementation");
  const { parent } = await readSuccessorParent({ root });
  validatePromptSuccessorPreparation(preparation, { expectedParent: parent });
  validateSuccessorSourceScope(scope, preparation, expectedScopeDigest);
  successorExact(scope.source.repository_revision, implementation.revision, "source implementation");
  const target = preparation.cases.find((entry) => entry.case_id === caseId);
  if (!target) successorFail("SUCCESSOR_CASE_MISSING", "Prompt delivery");
  successorExact(target.prompt_role, scope.prompt_role, "source Prompt role");
  const native = scope.source.bindings.find((entry) => entry.successor_case_id === caseId);
  if (!native) successorFail("SUCCESSOR_CASE_MISSING", "source scope");
  const mode = target.task_class === "review" ? "review" : target.task_class === "implementation" ? "implement" : null;
  if (!mode) successorFail("SUCCESSOR_TASK_CLASS", "Prompt delivery");
  const preregistrationPath = "benchmarks/prompt-v2-preregistration.json";
  const preregistrationBytes = readStableBytes(resolve(root, preregistrationPath), "historical preregistration", MAX_INPUT_BYTES);
  if (!preregistrationBytes.equals(gitBytes(root, parent.source_revision, preregistrationPath))) successorFail("SUCCESSOR_PREREGISTRATION_DRIFT", "historical bytes");
  const preregistration = parseJsonRejectDuplicateKeys(preregistrationBytes, "historical preregistration");
  const sourceTree = execFileSync("git", ["-C", root, "rev-parse", `${parent.source_revision}^{tree}`], { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  successorExact(sourceTree, parent.source_tree, "historical source tree");
  const track = preregistration.prompt_tracks.find((entry) => entry.adapter_track === "codex");
  const name = `skill-${mode}.md`;
  let path;
  let expectedDigest;
  let expectedLength = null;
  if (target.prompt_role === "current_prompt") {
    path = `docs/fixtures/codex-pre-compact-prompts/${name}`;
    const item = track?.current_source_files.find((entry) => entry.path === path);
    if (!item) successorFail("SUCCESSOR_PROMPT_SOURCE_MISSING", "current Prompt");
    expectedDigest = item.raw_byte_digest;
  } else if (target.prompt_role === "prompt_v2") {
    const renderedRoot = preregistration.generated_authority_binding_contract.rendered_source_root;
    sourcePath(renderedRoot);
    const referencePath = `${renderedRoot}/reference.json`;
    const referenceBytes = readStableBytes(resolve(root, referencePath), "rendered reference", MAX_INPUT_BYTES);
    if (!referenceBytes.equals(gitBytes(root, parent.source_revision, referencePath))) successorFail("SUCCESSOR_ARCHIVE_DRIFT", "rendered reference");
    const reference = parseJsonRejectDuplicateKeys(referenceBytes, "rendered reference");
    const { archive_digest: digest, ...content } = reference;
    successorExact(canonicalDigest(content), digest, "rendered archive digest");
    const item = reference.adapters.find((entry) => entry.adapter === "codex")?.files.find((entry) => entry.path === `codex/${name}`);
    if (!item) successorFail("SUCCESSOR_PROMPT_SOURCE_MISSING", "Prompt v2");
    path = `${renderedRoot}/${item.path}`;
    expectedDigest = item.raw_digest;
    expectedLength = item.byte_length;
  } else successorFail("SUCCESSOR_ROLE_INVALID", "Prompt delivery");
  sourcePath(path);
  assertNoSymlinkPathSegments(resolve(root, path), "Prompt source");
  const bytes = readStableBytes(resolve(root, path), "Prompt source", MAX_INPUT_BYTES);
  successorExact(rawDigest(bytes), expectedDigest, "Prompt source digest");
  if (expectedLength !== null) successorExact(bytes.length, expectedLength, "Prompt source byte length");
  if (!bytes.equals(gitBytes(root, parent.source_revision, path))) successorFail("SUCCESSOR_PROMPT_SOURCE_DRIFT", "frozen source bytes");
  // Validate the marker without substituting any actual task or reading outputs.
  renderSuccessorStdin(bytes, Buffer.from("synthetic-marker-check"));
  const handle = Object.freeze({ kind: "successor_prompt_source_handle" });
  handles.set(handle, { preparation: copy(preparation), target: copy(target), path, native: copy(native), scope: copy(scope), bytes: Buffer.from(bytes), used: false });
  return handle;
}

/**
 * Intended runner seam: consume exactly once, immediately before writing stdin.
 * The reference records intended bytes, NOT proof of model receipt or completion.
 * Actual delivery still requires the runner to pass these same bytes to spawn.
 */
export function consumeSuccessorPromptInput(handle, { caseId, taskBytes, expectedTaskDigest }) {
  const source = handles.get(handle);
  if (!source) successorFail("SUCCESSOR_UNVERIFIED_PROMPT_SOURCE", "delivery handle");
  if (source.used) successorFail("SUCCESSOR_DUPLICATE_DELIVERY", "delivery handle");
  successorExact(caseId, source.target.case_id, "delivery case");
  successorExact(rawDigest(taskBytes), expectedTaskDigest, "materialized task bytes");
  const stdin = renderSuccessorStdin(source.bytes, taskBytes);
  const record = {
    schema_version: "1.0.0", kind: "prompt_successor_stdin_binding",
    preparation_digest: source.preparation.preparation_digest,
    successor_case_id: caseId, prompt_role: source.target.prompt_role,
    runtime_digest: source.preparation.runtime_digest,
    common_input_digest: source.target.common_input_digest,
    source_prompt: copy(source.target.source_prompt), template_path: source.path,
    template_digest: rawDigest(source.bytes), template_bytes: source.bytes.length,
    task_digest: expectedTaskDigest, task_bytes: taskBytes.length,
    transport: "utf8_literal_single_argument_substitution",
    stdin_digest: rawDigest(stdin), stdin_bytes: stdin.length,
    delivery_observed: false,
  };
  source.used = true;
  return { stdin, binding: { ...record, binding_digest: canonicalDigest(record) } };
}

export function validateSuccessorStdinBinding(value, expected) {
  successorClosed(value, [...Object.keys(expected)], "stdin binding");
  successorExact(value, expected, "stdin binding");
  const { binding_digest: digest, ...record } = value;
  successorExact(canonicalDigest(record), digest, "stdin binding digest");
  return value;
}


/**
 * Validate the executable that is invoked directly by the native runner.
 * This does not accept the @openai/codex Node wrapper as the successor executable:
 * the measured runner must invoke the pinned platform-native codex binary itself.
 */
export function assertSuccessorExecutableDescriptor(runtime, descriptor) {
  validateSuccessorRuntime(runtime);
  const expectedBasename = runtime.os === "win32" ? "codex.exe" : "codex";
  successorExact(descriptor?.executable_basename, expectedBasename, "native executable basename");
  successorExact(`sha256:${descriptor?.executable_sha256}`, runtime.executable_digest, "native binary");
}

/** Exact local runtime facts, distinct from effective host-isolation evidence. */
export function assertSuccessorAdapterFacts(runtime, identity, { checkHost = false } = {}) {
  validateSuccessorRuntime(runtime);
  for (const [field, expected] of Object.entries({
    adapter: "codex", availability: "available", model: runtime.model,
    reasoning_effort: runtime.reasoning_effort, sandbox_policy: runtime.sandbox,
    permission_policy: runtime.approval_policy, case_timeout_ms: runtime.timeout_ms,
  })) successorExact(identity[field], expected, `native runtime.${field}`);
  successorExact(identity.executable?.observed_version, runtime.cli_version, "native CLI version");
  assertSuccessorExecutableDescriptor(runtime, identity.executable);
  // configuration_digest is defined as the exact native runtime-config file hash.
  successorExact(`sha256:${identity.runtime_config_sha256}`, runtime.configuration_digest, "native config bytes");
  successorExact(identity.effective_command.task_transport, "stdin", "native stdin transport");
  successorExact(canonicalDigest(identity.effective_command), identity.effective_command_digest, "native command digest");
  const args = identity.effective_command.argv;
  if (!Array.isArray(args) || args.at(-1) !== "-"
    || args.filter((value) => value === "sandbox_workspace_write.network_access=false").length !== 1) {
    successorFail("SUCCESSOR_NETWORK_COMMAND_MISSING", "native command");
  }
  if (checkHost) {
    successorExact(process.version.replace(/^v/u, ""), runtime.node_version.replace(/^v/u, ""), "native Node version");
    successorExact(process.platform, runtime.os, "native OS");
    successorExact(process.arch, runtime.arch, "native architecture");
  }
  // These comparisons do not authenticate backend availability, provider revision,
  // subscription credentials or effective OS sandbox enforcement.
}

/** Add the successor's explicit policy without changing ordinary native commands. */
export function successorEffectiveCommand(command) {
  if (command.task_transport !== "stdin" || command.argv.at(-1) !== "-") successorFail("SUCCESSOR_COMMAND_TRANSPORT", "native command");
  if (command.argv.some((value) => value.includes("sandbox_workspace_write.network_access"))) successorFail("SUCCESSOR_COMMAND_CONFLICT", "network override");
  return { ...copy(command), argv: [...command.argv.slice(0, -1), "-c", "sandbox_workspace_write.network_access=false", "-"] };
}

/** Runner checks these immutable mappings before creating a run or spawning. */
export function assertSuccessorInputRun(handle, { adapter, caseId, retryFailed, maxCases }) {
  const source = handles.get(handle);
  if (!source || source.used) successorFail("SUCCESSOR_UNVERIFIED_PROMPT_SOURCE", "execution input");
  successorExact(adapter, "codex", "successor adapter");
  successorExact(caseId, source.native.source_case_id, "native case");
  successorExact(retryFailed, false, "successor retry");
  successorExact(maxCases, 1, "successor maxCases");
}

export function successorRuntimeForInput(handle) {
  const source = handles.get(handle);
  if (!source || source.used) successorFail("SUCCESSOR_UNVERIFIED_PROMPT_SOURCE", "runtime input");
  return copy(source.preparation.runtime);
}

/** Uses the existing runner's verified materialization and runtime identity. */
export function prepareSuccessorInputForAttempt(handle, { entry, context, adapterIdentity, workspace, materializedRecord }) {
  const source = handles.get(handle);
  if (!source || source.used) successorFail("SUCCESSOR_UNVERIFIED_PROMPT_SOURCE", "execution input");
  successorExact(entry.case_id, source.native.source_case_id, "native case");
  successorExact(entry.condition, "full_ask", "native condition");
  successorExact(entry.fixture_id, source.target.source_fixture_id, "native fixture");
  successorExact(entry.repetition, source.target.repetition, "native repetition");
  successorExact(context.identity.run_instance_id, source.scope.source.run_instance_id, "native run");
  successorExact(context.plan.plan_id, source.scope.source.plan_id, "native plan");
  successorExact(context.identity.plan.digest, source.scope.source.plan_digest, "native plan digest");
  successorExact(context.materialized.manifestDigest, source.scope.source.materialization_manifest_digest, "materialization digest");
  assertSuccessorAdapterFacts(source.preparation.runtime, adapterIdentity, { checkHost: true });
  successorExact(canonicalDigest(adapterIdentity), source.scope.source.runtime_identity_digest, "native runtime");
  successorExact(adapterIdentity.effective_command_digest, source.native.effective_command_digest, "native command");
  successorExact(adapterIdentity.environment_snapshot.digest, source.native.environment_snapshot_digest, "native environment");
  const task = materializedRecord.agent_visible_files.find((entry) => entry.path === "BENCHMARK_TASK.md");
  if (!task) successorFail("SUCCESSOR_TASK_SOURCE_MISSING", "materialized task");
  const bytes = readStableBytes(resolve(workspace, task.path), "materialized task", MAX_INPUT_BYTES);
  successorExact(bytes.length, task.bytes, "materialized task size");
  return consumeSuccessorPromptInput(handle, {
    caseId: source.target.case_id, taskBytes: bytes, expectedTaskDigest: `sha256:${task.sha256}`,
  });
}

export function successorInputProjection(binding) {
  return {
    status: "materialized", selected_skills: [], inventory: [],
    source_digests: [
      { path: "successor/preparation", sha256: binding.preparation_digest },
      { path: "successor/stdin-binding", sha256: binding.binding_digest },
      { path: "successor/stdin", sha256: binding.stdin_digest },
      { path: binding.template_path, sha256: binding.template_digest },
    ],
    projection_fingerprint: binding.binding_digest, capability_downgrades: [],
  };
}

/** Compare a complete version token; 0.153.40 is not 0.153.4. */
export function assertSuccessorVersionOutput(expectedVersion, output) {
  if (typeof expectedVersion !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(expectedVersion)) {
    successorFail("SUCCESSOR_VERSION_INVALID", "expected CLI version");
  }
  if (typeof output !== "string" || output.length > 1024 * 1024) successorFail("SUCCESSOR_VERSION_OUTPUT", "CLI version output");
  const escaped = expectedVersion.replace(/[.+]/gu, "\\$&");
  if (!new RegExp(`(?:^|\\s)${escaped}(?=$|\\s)`, "u").test(output)) {
    successorFail("SUCCESSOR_VERSION_OUTPUT", "CLI version token mismatch");
  }
}
