import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateJsonSchema } from "./execution-envelope.mjs";
import { validateRiskActionEnforcement } from "./codex-risk-workspace.mjs";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ACTION_SCHEMA_PATH = resolve(RUNTIME_ROOT, "codex-risk-action.schema.json");
const DEFAULT_APPROVAL_SCHEMA_PATH = resolve(RUNTIME_ROOT, "codex-risk-approval.schema.json");
const MAX_AUTHORITY_BYTES = 1024 * 1024;
const MAX_EXECUTOR_BYTES = 512 * 1024 * 1024;
const CLOSED_EXECUTION_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const AUTH_ENVIRONMENT_NAMES = Object.freeze(["CODEX_API_KEY", "OPENAI_API_KEY"]);
const TARGET_TRIPLES = Object.freeze({
  "darwin:arm64": { triple: "aarch64-apple-darwin", package: "codex-darwin-arm64", format: "mach-o" },
  "darwin:x64": { triple: "x86_64-apple-darwin", package: "codex-darwin-x64", format: "mach-o" },
  "linux:arm64": { triple: "aarch64-unknown-linux-musl", package: "codex-linux-arm64", format: "elf" },
  "linux:x64": { triple: "x86_64-unknown-linux-musl", package: "codex-linux-x64", format: "elf" },
});

export const RISK_CODEX_SYSTEM_CONFIG_PATHS = Object.freeze([
  "/etc/codex/config.toml",
  "/etc/codex/managed_config.toml",
  "/etc/codex/requirements.toml",
  "/Library/Managed Preferences/com.openai.codex.plist",
  "/Library/Preferences/com.openai.codex.plist",
]);

export const RISK_CODEX_DISABLED_FEATURES = Object.freeze([
  "apps",
  "auth_elicitation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "code_mode_host",
  "computer_use",
  "enable_mcp_apps",
  "executor_capability_discovery",
  "guardian_approval",
  "hooks",
  "image_generation",
  "in_app_browser",
  "in_app_updates",
  "mcp_2026_07_28",
  "memories",
  "multi_agent",
  "multi_agent_v2",
  "plugin_sharing",
  "plugins",
  "recommended_plugins",
  "remote_plugin",
  "skill_mcp_dependency_install",
  "skill_search",
  "shell_snapshot",
  "standalone_web_search",
  "tool_call_mcp_elicitation",
  "tool_suggest",
  "view_image",
  "workspace_dependencies",
]);

export const RISK_CODEX_POLICY_ARGS = Object.freeze([
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--strict-config",
  ...RISK_CODEX_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
  "-c", "analytics.enabled=false",
  "-c", "feedback.enabled=false",
  "-c", "check_for_update_on_startup=false",
  "-c", "include_apps_instructions=false",
  "-c", "include_collaboration_mode_instructions=false",
  "-c", "mcp_servers={}",
  "-c", "shell_environment_policy.inherit=none",
  "-c", "sandbox_workspace_write.network_access=false",
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalRiskJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalRiskDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalRiskJson(value)).digest("hex")}`;
}

export function riskCodexRuntimePolicy() {
  const argv = [...RISK_CODEX_POLICY_ARGS];
  return {
    user_config: "ignored",
    execpolicy_rules: "ignored",
    session_persistence: "ephemeral",
    mcp_servers: "disabled",
    plugins: "disabled",
    external_tool_discovery: "disabled",
    shell_environment_inheritance: "none",
    web_search: "disabled",
    candidate_network_access: "disabled",
    telemetry: "disabled",
    update_checks: "disabled",
    model_control_plane: "codex_api_only",
    builtin_mutation_tools: ["shell_tool", "unified_exec"],
    executor_resolution: "stable_native_snapshot_spawn",
    environment_inheritance: "closed_allowlist",
    project_config_layers: "reject_and_read_deny",
    system_config_layers: "read_deny",
    system_config_paths: [...RISK_CODEX_SYSTEM_CONFIG_PATHS],
    disabled_features: [...RISK_CODEX_DISABLED_FEATURES],
    argv,
    argv_sha256: canonicalRiskDigest(argv),
  };
}

function rawDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export function readStableAuthorityFile(path, label) {
  const absolute = resolve(path);
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  if (realpathSync(absolute) !== absolute) throw new Error(`${label} must not traverse a symbolic link`);
  if (before.size <= 0 || before.size > MAX_AUTHORITY_BYTES) throw new Error(`${label} size is outside the accepted range`);
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameIdentity(before, opened)) throw new Error(`${label} changed while opening`);
    const bytes = readFileSync(descriptor);
    const afterDescriptor = fstatSync(descriptor);
    const afterPath = lstatSync(absolute);
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(opened, afterPath) || realpathSync(absolute) !== absolute) throw new Error(`${label} changed while reading`);
    return { path: absolute, bytes, file_sha256: `sha256:${rawDigest(bytes)}` };
  } finally {
    closeSync(descriptor);
  }
}

export function readStableExecutableFile(path, label = "Codex executable") {
  const absolute = resolve(path);
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must resolve to a regular non-symlink file`);
  if (realpathSync(absolute) !== absolute) throw new Error(`${label} canonical path must not traverse a symbolic link`);
  if ((before.mode & 0o111) === 0) throw new Error(`${label} is not executable`);
  if (before.size <= 0 || before.size > MAX_EXECUTOR_BYTES) throw new Error(`${label} size is outside the accepted range`);
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameIdentity(before, opened)) throw new Error(`${label} changed while opening`);
    const bytes = readFileSync(descriptor);
    const afterDescriptor = fstatSync(descriptor);
    const afterPath = lstatSync(absolute);
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(opened, afterPath) || realpathSync(absolute) !== absolute) throw new Error(`${label} changed while reading`);
    return { path: absolute, bytes, file_sha256: `sha256:${rawDigest(bytes)}` };
  } finally {
    closeSync(descriptor);
  }
}

function stableFileIdentity(path, label, { executable = false } = {}) {
  const evidence = executable ? readStableExecutableFile(path, label) : readStableAuthorityFile(path, label);
  return {
    canonical_path: evidence.path,
    raw_sha256: evidence.file_sha256,
    size_bytes: evidence.bytes.length,
    bytes: evidence.bytes,
  };
}

function nativeExecutableFormat(bytes) {
  if (bytes.length < 4) return null;
  const magic = bytes.subarray(0, 4).toString("hex");
  if (["feedface", "cefaedfe", "feedfacf", "cffaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(magic)) return "mach-o";
  if (magic === "7f454c46") return "elf";
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return "pe";
  return null;
}

function targetPlatform() {
  const target = TARGET_TRIPLES[`${process.platform}:${process.arch}`];
  if (!target) throw new Error(`risk Codex execution has no supported native target for ${process.platform}/${process.arch}`);
  return target;
}

function resolveRequestedExecutable(codexBin, target, sourceEnv) {
  if (!codexBin || codexBin.includes("\0") || /[\r\n]/u.test(codexBin)) throw new Error("Codex executable argument is invalid");
  const explicitPath = codexBin.includes("/");
  const candidates = explicitPath
    ? [isAbsolute(codexBin) ? codexBin : resolve(target, codexBin)]
    : (sourceEnv.PATH ?? "").split(delimiter).filter(Boolean).map((entry) => resolve(entry, codexBin));
  for (const candidate of candidates) {
    try {
      const canonicalPath = realpathSync(candidate);
      return { explicitPath, requestedPath: resolve(candidate), canonicalPath };
    } catch {
      // Continue through the caller's resolution candidates without executing them.
    }
  }
  throw new Error(`Codex executable cannot be resolved: ${codexBin}`);
}

function parsePackageManifest(evidence, label) {
  try {
    const value = JSON.parse(evidence.bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("root must be an object");
    return value;
  } catch (error) {
    throw new Error(`${label} is not valid package JSON: ${error.message}`);
  }
}

export function resolveRiskCodexExecutor(codexBin, target, { sourceEnv = process.env } = {}) {
  const resolved = resolveRequestedExecutable(codexBin, target, sourceEnv);
  const requested = stableFileIdentity(resolved.canonicalPath, "Codex requested executable", { executable: true });
  const requestedFormat = nativeExecutableFormat(requested.bytes);
  const platform = targetPlatform();
  if (requestedFormat) {
    throw new Error("risk Codex execution must resolve through the installed @openai/codex launcher; a direct native or alternate launcher is not an accepted Codex package chain");
  }
  if (basename(requested.canonical_path) !== "codex.js" || basename(dirname(requested.canonical_path)) !== "bin") {
    throw new Error("risk Codex execution rejects script/interpreter launchers other than the installed @openai/codex launcher");
  }
  const packageRoot = dirname(dirname(requested.canonical_path));
  const packageManifest = stableFileIdentity(join(packageRoot, "package.json"), "@openai/codex package manifest");
  const packageValue = parsePackageManifest(packageManifest, "@openai/codex package manifest");
  if (packageValue.name !== "@openai/codex" || typeof packageValue.version !== "string" || packageValue.bin?.codex !== "bin/codex.js") {
    throw new Error("resolved launcher is not the closed installed @openai/codex package layout");
  }
  const platformRoot = join(packageRoot, "node_modules", "@openai", platform.package);
  const platformManifest = stableFileIdentity(join(platformRoot, "package.json"), "@openai/codex platform manifest");
  const platformValue = parsePackageManifest(platformManifest, "@openai/codex platform manifest");
  if (platformValue.name !== "@openai/codex"
    || platformValue.version !== `${packageValue.version}-${process.platform}-${process.arch}`
    || !Array.isArray(platformValue.os) || !platformValue.os.includes(process.platform)
    || !Array.isArray(platformValue.cpu) || !platformValue.cpu.includes(process.arch)) {
    throw new Error("installed @openai/codex platform manifest does not bind the current package version and platform");
  }
  const native = stableFileIdentity(join(platformRoot, "vendor", platform.triple, "bin", process.platform === "win32" ? "codex.exe" : "codex"), "@openai/codex native executable", { executable: true });
  const format = nativeExecutableFormat(native.bytes);
  if (format !== platform.format) throw new Error(`installed Codex native executable format ${format ?? "unknown"} does not match ${platform.format}`);
  return {
    requested_bin: codexBin,
    resolution: "installed_openai_codex_platform_package",
    target_triple: platform.triple,
    launcher: {
      canonical_path: requested.canonical_path,
      raw_sha256: requested.raw_sha256,
      size_bytes: requested.size_bytes,
    },
    package_manifest: {
      canonical_path: packageManifest.canonical_path,
      raw_sha256: packageManifest.raw_sha256,
      size_bytes: packageManifest.size_bytes,
      package_name: packageValue.name,
      package_version: packageValue.version,
    },
    platform_manifest: {
      canonical_path: platformManifest.canonical_path,
      raw_sha256: platformManifest.raw_sha256,
      size_bytes: platformManifest.size_bytes,
      package_name: platformValue.name,
      package_version: platformValue.version,
    },
    native_binary: {
      canonical_path: native.canonical_path,
      raw_sha256: native.raw_sha256,
      size_bytes: native.size_bytes,
      executable_format: format,
    },
    spawn_path: native.canonical_path,
    spawn_method: "runner_owned_verified_snapshot",
  };
}

export function verifyRiskCodexExecutor(expected) {
  if (!expected || typeof expected !== "object") throw new Error("approved Codex executor binding is missing");
  if (expected.spawn_method !== "runner_owned_verified_snapshot") throw new Error("approved Codex executor does not require a runner-owned verified snapshot");
  const paths = [
    ["launcher", expected.launcher],
    ["package manifest", expected.package_manifest],
    ["platform manifest", expected.platform_manifest],
    ["native executable", expected.native_binary],
  ];
  for (const [label, binding] of paths) {
    if (!binding) continue;
    const evidence = stableFileIdentity(binding.canonical_path, `approved Codex ${label}`, { executable: label === "launcher" || label === "native executable" });
    if (evidence.raw_sha256 !== binding.raw_sha256 || evidence.size_bytes !== binding.size_bytes) throw new Error(`approved Codex ${label} identity changed immediately before spawn`);
    if (label === "native executable" && nativeExecutableFormat(evidence.bytes) !== binding.executable_format) throw new Error("approved Codex native executable format changed immediately before spawn");
  }
  if (expected.spawn_path !== expected.native_binary?.canonical_path) throw new Error("approved Codex spawn path is not the bound native executable");
  return expected.spawn_path;
}

function canonicalDirectory(path, label) {
  const absolute = resolve(path);
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isDirectory() || realpathSync(absolute) !== absolute) throw new Error(`${label} must be a canonical non-symlink directory`);
  return absolute;
}

export function resolveRiskExecutionEnvironment(sourceEnv = process.env) {
  const home = canonicalDirectory(sourceEnv.HOME, "HOME");
  const codexHome = canonicalDirectory(sourceEnv.CODEX_HOME ?? join(home, ".codex"), "CODEX_HOME");
  const environment = {
    PATH: CLOSED_EXECUTION_PATH,
    HOME: home,
    CODEX_HOME: codexHome,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
    TERM: "dumb",
    SHELL: "/bin/sh",
  };
  const secretBindings = [];
  for (const name of AUTH_ENVIRONMENT_NAMES) {
    const value = sourceEnv[name];
    if (typeof value !== "string" || value.length === 0) continue;
    environment[name] = value;
    secretBindings.push({ name, value_sha256: canonicalRiskDigest(value) });
  }
  const publicBindings = Object.entries(environment)
    .filter(([name]) => !AUTH_ENVIRONMENT_NAMES.includes(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({ name, value }));
  const redactedIdentity = Object.fromEntries(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => [name, AUTH_ENVIRONMENT_NAMES.includes(name) ? canonicalRiskDigest(value) : value]));
  return {
    environment,
    policy: {
      inheritance: "none",
      public_bindings: publicBindings,
      secret_bindings: secretBindings,
      stripped_injection_families: ["NODE_*", "npm_*", "DYLD_*", "LD_*", "*_PROXY", "BASH_ENV", "ENV", "GIT_*", "SSH_*"],
      environment_sha256: canonicalRiskDigest(redactedIdentity),
    },
  };
}

function parseClosedJson(evidence, schemaPath, label) {
  let value;
  try {
    value = JSON.parse(evidence.bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  const errors = validateJsonSchema(value, { schemaPath });
  if (errors.length > 0) throw new Error(`${label} does not match its closed schema: ${errors.join("; ")}`);
  return value;
}

function validateTargetScope(paths) {
  for (const path of paths) {
    if (isAbsolute(path) || path.includes("\0") || path.split(/[\\/]/u).includes("..")) throw new Error("risk action target_scope must contain only relative paths inside target");
  }
}

export function readRiskAction(path, { schemaPath = DEFAULT_ACTION_SCHEMA_PATH } = {}) {
  const evidence = readStableAuthorityFile(path, "risk action descriptor");
  const value = parseClosedJson(evidence, schemaPath, "risk action descriptor");
  validateTargetScope(value.target_scope);
  validateRiskActionEnforcement(value);
  return { ...evidence, value };
}

export function createRiskApprovalRequest({ actionEvidence, invocation }) {
  const action = actionEvidence.value;
  if (invocation.repository.repository_id !== action.repository_id
    || canonicalRiskJson(invocation.target_scope) !== canonicalRiskJson(action.target_scope)
    || invocation.risk_gate !== action.risk_gate
    || invocation.operation !== action.operation
    || canonicalRiskJson(invocation.permitted_effects) !== canonicalRiskJson(action.permitted_effects)
    || canonicalRiskJson(invocation.prohibited_effects) !== canonicalRiskJson(action.prohibited_effects)) {
    throw new Error("risk invocation does not exactly match the action descriptor, including repository identity");
  }
  if (canonicalRiskJson(invocation.runtime_policy) !== canonicalRiskJson(riskCodexRuntimePolicy())) {
    throw new Error("risk invocation runtime policy is not the closed supported Codex policy");
  }
  const requestWithoutDigest = {
    schema_version: "1.0.0",
    kind: "codex_risk_approval_request",
    approval_authority: action.approval_authority,
    action,
    action_sha256: canonicalRiskDigest(action),
    action_file_sha256: actionEvidence.file_sha256,
    invocation,
    invocation_sha256: canonicalRiskDigest(invocation),
  };
  return { ...requestWithoutDigest, request_sha256: canonicalRiskDigest(requestWithoutDigest) };
}

function insidePath(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

export function verifyRiskApproval({ approvalPath, approvalSha256, expectedRequest, target, schemaPath = DEFAULT_APPROVAL_SCHEMA_PATH }) {
  const rejected = (reason, evidence = null) => ({ status: "rejected", reasons: [reason], evidence });
  if (!approvalPath || !/^[a-f0-9]{64}$/u.test(approvalSha256 ?? "")) return rejected("approval requires an exact lowercase raw SHA256 trust value");
  let evidence;
  try {
    evidence = readStableAuthorityFile(approvalPath, "risk approval");
  } catch (error) {
    return rejected(error.message);
  }
  let canonicalTarget;
  try {
    canonicalTarget = realpathSync(target);
  } catch (error) {
    return rejected(`risk approval target is unavailable: ${error.message}`, evidence);
  }
  if (insidePath(evidence.path, canonicalTarget)) return rejected("risk approval must be supplied from outside the target repository", evidence);
  if (evidence.file_sha256 !== `sha256:${approvalSha256}`) return rejected("risk approval raw file SHA256 does not match the caller-supplied trust value", evidence);
  let value;
  try {
    value = parseClosedJson(evidence, schemaPath, "risk approval");
  } catch (error) {
    return rejected(error.message, evidence);
  }
  const requestWithoutDigest = { ...value.request };
  delete requestWithoutDigest.request_sha256;
  if (value.request.request_sha256 !== canonicalRiskDigest(requestWithoutDigest)) return rejected("risk approval request self-digest is invalid", evidence);
  if (value.request_sha256 !== value.request.request_sha256) return rejected("risk approval outer request digest disagrees with the embedded request", evidence);
  if (canonicalRiskJson(value.request) !== canonicalRiskJson(expectedRequest)) return rejected("risk approval does not exactly match the current request", evidence);
  if (value.decision !== "approved") return rejected("approval authority rejected the exact request", evidence);
  return { status: "approved", reasons: [], evidence, value };
}
