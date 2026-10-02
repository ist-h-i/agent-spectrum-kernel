import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { executeContainedAgent, effectiveCommand } from "./ask-benchmark-execution.mjs";
import { renderSuccessorStdin } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { captureSuccessorUsage } from "./ask-benchmark-prompt-successor-usage.mjs";
import { canonicalDigest, parseJsonRejectDuplicateKeys, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { closedSessionEntries } from "./ask-local-codex-boundaries.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = "benchmarks/fixtures/pilot-json-aggregate-001";
const FAKE = "scripts/test-fixtures/synthetic-json-pilot-fake.mjs";
const SCHEMA = "benchmarks/schemas/agent-output.schema.json";
const FILES = ["AGENTS.md", `${FIXTURE}/task.md`, `${FIXTURE}/input.json`, SCHEMA, FAKE,
  "scripts/ask-synthetic-json-pilot.mjs", "scripts/ask-benchmark-execution.mjs",
  "scripts/ask-benchmark-prompt-successor-delivery.mjs", "scripts/ask-benchmark-prompt-successor-usage.mjs",
  "scripts/ask-benchmark-stable-file.mjs", "scripts/content-addressed-store.mjs", "scripts/ask-benchmark-schema.mjs", "scripts/ask-local-codex-boundaries.mjs"];
export const PILOT_LIMITS = Object.freeze({ execs: 2, retry: 0, timeout_ms: 120000,
  max_buffer_bytes: 1048576, answer_bytes: 65536, session_bytes: 4194304, grader_ms: 10000,
  trial_tokens: 30000, cumulative_tokens: 60000, future_control: 1, future_control_ms: 10000 });
const LEGACY_LIMITS = Object.freeze({ ...PILOT_LIMITS, trial_tokens: 20000, cumulative_tokens: 30000 });
export const FAKE_SCENARIOS = Object.freeze(["pass", "wrong", "missing", "invalid", "duplicate", "extra-key",
  "unsorted", "utf8", "oversize-answer", "seed-change", "extra-file", "symlink", "hardlink",
  "unscored", "bad-final", "exit", "timeout", "output-limit", "unknown-usage", "threshold",
  "cumulative-threshold", "provider-stop", "identity-drift", "descendant", "evidence-fault"]);
const EXPECTED = { totals: [{ sku: "a", total: 3 }, { sku: "b", total: 6 }] };
const PROVIDER = "ask_pilot_openai";
const NATIVE_DIGEST = "sha256:27ceb5f9b957b43a519efe4eaa3816a0bffb0a531a2c89af18840c0a3c016a7d";
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const copy = value => structuredClone(value);
const bytes = (path, max = 1048576) => readStableFile(path, "pilot artifact", max).bytes;
const json = path => parseJsonRejectDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(bytes(path)));
const save = (path, value) => writeCanonicalJsonNoReplace({ outputPath: path, artifact: value });
const strictText = value => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
const within = (root, path) => path === root || path.startsWith(root + sep);
function canonicalDirectory(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || path === "/"
    || realpathSync(path) !== path || !lstatSync(path).isDirectory()) throw new Error("unsafe or alias directory");
  return path;
}
function exclusiveBytes(path, value) { writeFileSync(path, value, { flag: "wx", mode: 0o600 }); }
function sourceIdentity() {
  const git = arg => execFileSync("git", ["-C", ROOT, "rev-parse", arg], { encoding: "utf8", timeout: 10000 }).trim();
  return { head: git("HEAD"), tree: git("HEAD^{tree}"),
    tracked_diff_digest: sha(execFileSync("git", ["-C", ROOT, "diff", "--binary", "HEAD"], { timeout: 10000, maxBuffer: 16 * 1024 * 1024 })),
    files: Object.fromEntries(FILES.map(path => [path, sha(bytes(join(ROOT, path)))])) };
}
function same(a, b) { return canonicalDigest(a) === canonicalDigest(b); }
function authPath(value) {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || !value.endsWith("/auth.json") || value.split(sep).length < 4) throw new Error("canonical existing auth.json source required");
  return value;
}

/** Reviewable candidate only. No native execution or security setting is applied. */
export function pilotCommand({ privateRoot, controllerRoot, workspaceRoot = null, authSource = null }) {
  const roots = [canonicalDirectory(privateRoot), canonicalDirectory(controllerRoot)];
  // Keep legacy command identity readable for sealed original evidence only.
  // New native preparation below requires the broader root containing prior runs.
  if (![realpathSync(dirname(ROOT)), realpathSync(dirname(dirname(ROOT)))].includes(roots[1])) throw new Error("exact controller working root must deny known source/design/grader copies");
  if (within(roots[0], roots[1]) || within(roots[1], roots[0])) throw new Error("overlapping deny roots");
  if (workspaceRoot !== null) roots.push(canonicalDirectory(workspaceRoot));
  if (authSource !== null) roots.push(authPath(authSource));
  const runtime = { adapter: "codex", availability: "available", model: "gpt-6.1-sol",
    reasoning_effort: "medium", permission_policy: "never", sandbox_policy: "workspace-write" };
  const base = effectiveCommand(ROOT, runtime);
  const argv = base.argv.filter(value => value !== "--ephemeral");
  argv.splice(1, 0, "--strict-config");
  const index = argv.indexOf("--sandbox"); argv.splice(index, 2);
  const settings = ['default_permissions="ask_synthetic_pilot"', 'permissions.ask_synthetic_pilot.extends=":workspace"',
    `permissions.ask_synthetic_pilot.filesystem={ ${roots.map(root => `${JSON.stringify(root)} = "deny"`).join(", ")}, ":workspace_roots" = "write" }`,
    "permissions.ask_synthetic_pilot.network.enabled=false", "project_doc_max_bytes=0", "mcp_servers={}",
    "plugins={}", 'web_search="disabled"', 'forced_login_method="chatgpt"', 'cli_auth_credentials_store="file"',
    `model_provider="${PROVIDER}"`,
    // Built-in provider entries ignore configured overrides in this pinned CLI.
    // A closed alias retains OpenAI auth/Responses and makes retry zero effective.
    `model_providers.${PROVIDER}={name="OpenAI",base_url="https://chatgpt.com/backend-api/codex",wire_api="responses",requires_openai_auth=true,request_max_retries=0,stream_max_retries=0,supports_websockets=false,supports_standalone_web_search=false}`,
    ...["plugins", "plugin_hooks", "remote_plugin", "recommended_plugins", "apps", "enable_mcp_apps", "multi_agent", "multi_agent_v2", "memory_tool", "external_agent_memory_import", "skill_mcp_dependency_install", "responses_websockets", "responses_websockets_v2"].map(name => `features.${name}=false`)];
  argv.splice(argv.length - 1, 0, ...settings.flatMap(value => ["-c", value]));
  return { ...base, argv, deny_roots: roots, execution_status: "requires_fresh_bound_permission", auth_source: authSource };
}
export function assertPilotCommand(command, roots) {
  if (!same(command, pilotCommand(roots))) throw new Error("pilot argv/profile drift");
}

/** Only synthetic plans are materialized. New directories, no credentials. */
export function prepareFakePilot(options = {}) { return preparePilot({ ...options, mode: "fake_only" }); }
export function prepareNativeSimulation(options = {}) { return preparePilot({ ...options, mode: "fake_native" }); }
export function prepareNativePilot(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !["privateRoot", "workspaceParent", "controllerRoot", "nativeExecutable", "authSource"].includes(key))) throw new Error("unknown native descriptor fields");
  return preparePilot({ ...options, mode: "native" });
}
function preparePilot({ privateRoot = null, workspaceParent = null, controllerRoot = dirname(dirname(ROOT)),
  scenarios = ["pass", "pass"], fakeTimeoutMs = null, mode, nativeExecutable = null, authSource = null, controlScenario = "pass" } = {}) {
  if (!Array.isArray(scenarios) || scenarios.length !== 2 || scenarios.some(value => !FAKE_SCENARIOS.includes(value))) throw new Error("exactly two closed fake scenarios required");
  if (fakeTimeoutMs !== null && (!Number.isInteger(fakeTimeoutMs) || fakeTimeoutMs < 20 || fakeTimeoutMs > PILOT_LIMITS.timeout_ms)) throw new Error("invalid synthetic timeout");
  if (!["pass", "deny-mismatch", "positive-fail", "exit", "timeout"].includes(controlScenario)) throw new Error("invalid fake control scenario");
  if (mode === "native") {
    if (controllerRoot !== realpathSync(dirname(dirname(ROOT)))) throw new Error("native controller root must deny prior evidence copies");
    if (process.platform !== "darwin" || process.arch !== "arm64" || process.version !== "v24.19.0" || fakeTimeoutMs !== null || !same(scenarios, ["pass", "pass"]) || controlScenario !== "pass") throw new Error("native plan host or synthetic options invalid");
    if (execFileSync("git", ["-C", ROOT, "status", "--porcelain"], { encoding: "utf8", timeout: 10000 }).trim()) throw new Error("native source must be committed and clean");
    if (typeof nativeExecutable !== "string" || !isAbsolute(nativeExecutable) || realpathSync(nativeExecutable) !== nativeExecutable
      || sha(bytes(nativeExecutable, 256 * 1024 * 1024)) !== NATIVE_DIGEST) throw new Error("pinned native image invalid");
    authPath(authSource); // No credential stat/content read during preparation.
  } else if (mode === "fake_native") {
    nativeExecutable = "/synthetic/not-executed/codex";
    authSource = authPath(authSource ?? "/synthetic/existing-signin/auth.json");
  } else if (authSource !== null || nativeExecutable !== null) throw new Error("fake-only may not bind authentication/native image");
  controllerRoot = canonicalDirectory(controllerRoot);
  const parent = canonicalDirectory(workspaceParent ?? realpathSync(tmpdir()));
  if (within(controllerRoot, parent)) throw new Error("workspaces must be outside controller deny root");
  if (privateRoot === null) privateRoot = mkdtempSync(join(realpathSync(tmpdir()), "ask-pilot-evidence-"));
  else { if (!isAbsolute(privateRoot) || resolve(privateRoot) !== privateRoot) throw new Error("invalid private root"); mkdirSync(privateRoot, { mode: 0o700 }); }
  privateRoot = canonicalDirectory(privateRoot); chmodSync(privateRoot, 0o700);
  if (within(privateRoot, parent) || within(controllerRoot, privateRoot) || within(privateRoot, controllerRoot)) throw new Error("overlapping pilot roots");
  const workspaceRoot = mkdtempSync(join(parent, "ask-pilot-workspaces-")); chmodSync(workspaceRoot, 0o700);
  if (authSource !== null && within(workspaceRoot, authSource)) throw new Error("authentication inside workspace");
  const command = pilotCommand({ privateRoot, controllerRoot, workspaceRoot, authSource });
  const task = bytes(join(ROOT, FIXTURE, "task.md"));
  const kernel = bytes(join(ROOT, "AGENTS.md"));
  const plan = { kind: "ask_synthetic_pilot_v1", mode, schema_version: "1.2.0", source: sourceIdentity(),
    private_root: privateRoot, controller_root: controllerRoot, workspace_root: workspaceRoot,
    model: "gpt-6.1-sol", reasoning: "medium", node: { version: process.version, executable: realpathSync(process.execPath), digest: sha(bytes(realpathSync(process.execPath), 256 * 1024 * 1024)) },
    native: { version: "0.157.1", digest: NATIVE_DIGEST, executable: nativeExecutable, status: mode === "native" ? "bytes_pinned_not_executed" : "not_inspected_or_executed" },
    live_authority: null, auth_source: authSource, control: "not_started_not_authorized", limits: copy(PILOT_LIMITS),
    synthetic_timeout_ms: fakeTimeoutMs, scenarios: copy(scenarios), control_scenario: controlScenario, command,
    trials: ["plain", "kernel_only"].map((condition, index) => ({ index, condition,
      stdin_digest: sha(condition === "plain" ? task : renderSuccessorStdin(Buffer.concat([kernel, Buffer.from("\n$ARGUMENTS\n")]), task)) })) };
  save(join(privateRoot, "plan.json"), plan);
  save(join(privateRoot, "plan-digest.json"), { digest: canonicalDigest(plan) });
  return { privateRoot, planDigest: canonicalDigest(plan) };
}

function readPlan(root, { allowLegacy = false } = {}) {
  canonicalDirectory(root);
  if ((lstatSync(root).mode & 0o777) !== 0o700) throw new Error("private evidence root mode drift");
  const plan = json(join(root, "plan.json"));
  const legacy = allowLegacy && plan.schema_version === "1.1.0";
  const limits = legacy ? LEGACY_LIMITS : PILOT_LIMITS;
  if (plan.kind !== "ask_synthetic_pilot_v1" || !["fake_only", "fake_native", "native"].includes(plan.mode) || (!legacy && plan.schema_version !== "1.2.0") || plan.live_authority !== null
    || plan.private_root !== root || plan.model !== "gpt-6.1-sol" || plan.reasoning !== "medium" || !same(plan.limits, limits)
    || !same(plan.trials.map(({ index, condition }) => ({ index, condition })), [{ index: 0, condition: "plain" }, { index: 1, condition: "kernel_only" }])
    || !same(plan, { ...plan, scenarios: plan.scenarios.filter(value => FAKE_SCENARIOS.includes(value)) })
    || plan.scenarios.length !== 2
    || (plan.synthetic_timeout_ms !== null && (!Number.isInteger(plan.synthetic_timeout_ms) || plan.synthetic_timeout_ms < 20 || plan.synthetic_timeout_ms > PILOT_LIMITS.timeout_ms))
    || canonicalDigest(plan) !== json(join(root, "plan-digest.json")).digest) throw new Error("pilot plan identity invalid");
  canonicalDirectory(plan.workspace_root); canonicalDirectory(plan.controller_root);
  if (within(root, plan.workspace_root) || within(plan.controller_root, plan.workspace_root)
    || within(plan.workspace_root, root) || within(plan.workspace_root, plan.controller_root)) throw new Error("workspace overlap");
  assertPilotCommand(plan.command, { privateRoot: root, controllerRoot: plan.controller_root, workspaceRoot: plan.workspace_root, authSource: plan.auth_source });
  if (plan.mode === "fake_only" && (plan.auth_source !== null || plan.native.executable !== null)) throw new Error("fake-only native binding forbidden");
  if (plan.mode !== "fake_only" && (within(plan.workspace_root, authPath(plan.auth_source)) || plan.native.digest !== NATIVE_DIGEST || plan.native.version !== "0.157.1")) throw new Error("native binding invalid");
  if (!same(plan, { ...plan, control_scenario: ["pass", "deny-mismatch", "positive-fail", "exit", "timeout"].includes(plan.control_scenario) ? plan.control_scenario : null })) throw new Error("control scenario invalid");
  if (plan.mode === "native" && (plan.synthetic_timeout_ms !== null || plan.control_scenario !== "pass" || !same(plan.scenarios, ["pass", "pass"]))) throw new Error("synthetic options in native plan");
  return plan;
}
function assertCurrentSource(plan) {
  if (!same(sourceIdentity(), plan.source) || process.version !== plan.node.version
    || realpathSync(process.execPath) !== plan.node.executable || sha(bytes(plan.node.executable, 256 * 1024 * 1024)) !== plan.node.digest) throw new Error("pilot source/image drift");
  if (plan.mode === "native" && (process.platform !== "darwin" || process.arch !== "arm64" || process.version !== "v24.19.0"
    || execFileSync("git", ["-C", ROOT, "status", "--porcelain"], { encoding: "utf8", timeout: 10000 }).trim()
    || realpathSync(plan.native.executable) !== plan.native.executable || sha(bytes(plan.native.executable, 256 * 1024 * 1024)) !== NATIVE_DIGEST)) throw new Error("native host/source/image drift");
}

/** Closed nonsecret environment, not inherited credentials/proxies/config. */
export function nativePilotEnvironment({ home, nodeExecutable }) {
  canonicalDirectory(home);
  return { HOME: home, CODEX_HOME: home, LANG: "C", LC_ALL: "C", TZ: "UTC",
    PATH: `${dirname(nodeExecutable)}:/usr/bin:/bin:/usr/sbin:/sbin` };
}
export function nativeTrialLaunch(plan, { workspace, home, evidenceRoot }) {
  canonicalDirectory(workspace); canonicalDirectory(home); canonicalDirectory(evidenceRoot);
  if (!within(plan.workspace_root, workspace) || !within(plan.private_root, home) || !within(plan.private_root, evidenceRoot)) throw new Error("native trial path mismatch");
  const argv = plan.command.argv.map(value => value === "{output_schema}" ? join(evidenceRoot, "output-schema.json") : value === "{output}" ? join(evidenceRoot, "final.json") : value);
  argv.splice(argv.length - 1, 0, "-C", workspace);
  return { executable: plan.native.executable, argv, env: nativePilotEnvironment({ home, nodeExecutable: plan.node.executable }), cwd: workspace,
    timeout: PILOT_LIMITS.timeout_ms, killSignal: "SIGKILL", maxBuffer: PILOT_LIMITS.max_buffer_bytes };
}
function approvalRef(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 2048 || /[\x00-\x20]/u.test(value)) throw new Error("fresh explicit approval reference required");
  return value;
}
export function pilotPermissionRecord(plan, reference) {
  if (!["native", "fake_native"].includes(plan.mode)) throw new Error("permission cannot bind fake-only or Stage B");
  return { kind: "ask_synthetic_pilot_permission_v1", mode: plan.mode, approval_ref: approvalRef(reference),
    plan_digest: canonicalDigest(plan), source_digest: canonicalDigest(plan.source), native_digest: NATIVE_DIGEST,
    actions: { control: 1, exec: 2, existing_auth_link: true, existing_auth_read: true, ordinary_auth_refresh_write: true,
      retry: 0, new_login: false, auth_copy: false, security_changes: false, push_merge: false },
    model: "gpt-6.1-sol", reasoning: "medium", limits: copy(PILOT_LIMITS) };
}
export function bindNativePermission(root, reference) {
  const plan = readPlan(root);
  if (plan.mode !== "native") throw new Error("only a new native plan may be authorized");
  assertCurrentSource(plan);
  // This command is for the trusted operator AFTER explicit approval of the
  // exact plan. A reference is audit evidence, not cryptographic human identity.
  save(join(root, "permission.json"), pilotPermissionRecord(plan, reference));
}
function attachExistingAuth(plan, home, originalIdentity) {
  const path = authPath(plan.auth_source), info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path || info.uid !== process.getuid()
    || (info.mode & 0o077) !== 0) throw new Error("existing auth metadata unsafe or unavailable");
  const identity = { path_digest: canonicalDigest({ path }), dev: info.dev, ino: info.ino, uid: info.uid };
  if (originalIdentity && !same(identity, originalIdentity)) throw new Error("auth source identity changed");
  symlinkSync(path, join(home, "auth.json")); // no read/copy of credential bytes
  return identity;
}
export const NATIVE_CANARY_CODE = 'const fs=require("fs");const [ok,...denied]=process.argv.slice(1);if(fs.readFileSync(ok,"utf8")!=="ASK_PUBLIC_CANARY\\n")process.exit(4);for(const p of denied){try{const fd=fs.openSync(p,"r");fs.closeSync(fd);process.exit(5)}catch(e){if(!["EPERM","EACCES"].includes(e.code))process.exit(6)}}process.stdout.write("ASK_PILOT_CANARY_PASS\\n");';
export function nativeControlLaunch(plan, { workspace, home, canaries }) {
  const settings = [];
  for (let index = 0; index < plan.command.argv.length; index++) if (plan.command.argv[index] === "-c") settings.push(plan.command.argv[++index]);
  return { executable: plan.native.executable,
    argv: ["sandbox", "-P", "ask_synthetic_pilot", "--include-managed-config", ...settings.flatMap(value => ["-c", value]),
      "-C", workspace, "--", plan.node.executable, "-e", NATIVE_CANARY_CODE, ...canaries],
    env: nativePilotEnvironment({ home, nodeExecutable: plan.node.executable }), cwd: workspace,
    timeout: PILOT_LIMITS.future_control_ms, killSignal: "SIGKILL", maxBuffer: PILOT_LIMITS.max_buffer_bytes };
}
function jsonLines(value, maximumLines = 20000) {
  const lines = strictText(value).trimEnd().split("\n");
  if (!lines.length || lines.length > maximumLines) throw new Error("native session line limit");
  return lines.map(line => parseJsonRejectDuplicateKeys(line));
}
/** Tools are allowed here; Judge's tool-free session parser is not reused. */
export function parsePilotNativeSession({ stdout, session, plan, workspace, sessionHome = null }) {
  if (sessionHome !== null && (typeof sessionHome !== "string" || !isAbsolute(sessionHome)
    || resolve(sessionHome) !== sessionHome || sessionHome === "/" || !plan.command.deny_roots.includes(sessionHome))) throw new Error("native session home must be an exact declared deny root");
  const events = jsonLines(stdout), rows = jsonLines(session);
  const threads = events.filter(row => row.type === "thread.started");
  const metas = rows.filter(row => row.type === "session_meta").map(row => row.payload);
  const contexts = rows.filter(row => row.type === "turn_context").map(row => row.payload);
  if (threads.length !== 1 || metas.length !== 1 || contexts.length < 1 || contexts.length > 32) throw new Error("native session metadata missing/ambiguous");
  const meta = metas[0];
  if (typeof meta.id !== "string" || meta.id.length < 10 || meta.id !== threads[0].thread_id || meta.model_provider !== PROVIDER
    || meta.cli_version !== "0.157.1" || meta.cwd !== workspace) throw new Error("native session provider/version/cwd/id mismatch");
  const turns = new Set();
  const condition = ["plain", "kernel_only"].find(name => workspace === join(plan.workspace_root, name));
  if (!condition) throw new Error("native trial workspace identity mismatch");
  const runtimeParent = join(sessionHome ?? join(plan.private_root, condition, "codex-home"), "tmp", "arg0");
  // Pinned CLI adds its active execve helper directory to the resolved policy.
  // This is a read-only runtime exception, never a general private-root grant.
  const runtimeRead = entry => entry.access === "read" && entry.path?.type === "path"
    && typeof entry.path.path === "string" && resolve(entry.path.path) === entry.path.path
    && dirname(entry.path.path) === runtimeParent && /^codex-arg0[A-Za-z0-9]{6}$/u.test(basename(entry.path.path));
  let observedRuntimeRoot;
  for (const context of contexts) {
    if (context.model !== plan.model || context.effort !== plan.reasoning || context.cwd !== workspace || context.approval_policy !== "never"
      || context.sandbox_policy?.type !== "workspace-write" || context.sandbox_policy?.network_access !== false
      || context.permission_profile?.type !== "managed" || context.permission_profile?.network !== "restricted"
      || context.permission_profile?.file_system?.type !== "restricted"
      || context.active_permission_profile?.id !== "ask_synthetic_pilot" || typeof context.turn_id !== "string" || context.turn_id.length < 10) throw new Error("native resolved model/profile mismatch");
    turns.add(context.turn_id);
    const entries = context.permission_profile.file_system.entries;
    if (!Array.isArray(entries)) throw new Error("native filesystem entries missing");
    const runtimeEntries = entries.filter(runtimeRead);
    if (runtimeEntries.length > 1) throw new Error("native runtime read grant ambiguous");
    const runtimeRoot = runtimeEntries[0]?.path.path ?? null;
    if (observedRuntimeRoot !== undefined && observedRuntimeRoot !== runtimeRoot) throw new Error("native runtime read grant changed");
    observedRuntimeRoot = runtimeRoot;
    if (plan.command.closed_read_scope) closedSessionEntries({ entries, workspace, readRoots: plan.command.read_roots,
      denyRoots: plan.command.deny_roots, runtimeParent });
    for (const root of plan.command.closed_read_scope ? [] : plan.command.deny_roots) {
      if (entries.filter(entry => entry.path?.type === "path" && entry.path.path === root && entry.access === "deny").length !== 1
        || entries.some(entry => entry.path?.type === "path" && within(root, entry.path.path) && entry.access !== "deny"
          && !(root === plan.workspace_root && within(workspace, entry.path.path))
          && !((root === plan.private_root || root === sessionHome) && runtimeRead(entry)))) throw new Error("native exclusive deny rule mismatch");
    }
    if (!entries.some(entry => entry.path?.type === "path" && entry.path.path === workspace && entry.access === "write")) throw new Error("native workspace write grant missing");
  }
  if (turns.size !== 1) throw new Error("native turn identity ambiguous");
  return { session_id: canonicalDigest({ session_id: meta.id }), turn_id: canonicalDigest({ turn_id: [...turns][0] }), model: plan.model,
    reasoning: plan.reasoning, provider: PROVIDER, network: false, profile_digest: canonicalDigest(plan.command), context_count: contexts.length };
}
function nativeSession(home) {
  const found = [];
  function walk(path, depth = 0) {
    if (depth > 5) throw new Error("native session nesting limit");
    const names = readdirSync(path); if (names.length > 64) throw new Error("native session inventory limit");
    for (const name of names) {
      const file = join(path, name), info = lstatSync(file);
      if (info.isSymbolicLink()) throw new Error("native session link fault");
      if (info.isDirectory()) walk(file, depth + 1);
      else if (info.isFile() && name.endsWith(".jsonl")) found.push(file);
      else throw new Error("unknown native session file");
    }
  }
  walk(join(home, "sessions"));
  if (found.length !== 1) throw new Error("exactly one native trial session required");
  return bytes(found[0], PILOT_LIMITS.session_bytes);
}

function workspaceInventory(workspace) {
  canonicalDirectory(workspace);
  const names = readdirSync(workspace).sort();
  if (names.length > 32) throw new Error("workspace inventory limit");
  return Object.fromEntries(names.map(name => {
    const path = join(workspace, name), info = lstatSync(path);
    if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)) throw new Error("workspace link boundary fault");
    if (!info.isFile()) return [name, { type: "other", size: info.size, digest: null }];
    return [name, { type: "file", size: info.size, digest: info.size <= PILOT_LIMITS.answer_bytes ? sha(bytes(path, PILOT_LIMITS.answer_bytes)) : null }];
  }));
}
const closed = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort());
export function gradePilotWorkspace({ workspace, seeded }) {
  const started = Date.now();
  let inventory;
  try { inventory = workspaceInventory(workspace); }
  catch { return { status: "boundary_fault", reason: "workspace_inventory_boundary", P1: null, P2: null, P3: null, inventory: null }; }
  const P3 = Object.keys(inventory).every(name => name === "answer.json" || Object.hasOwn(seeded, name))
    && Object.entries(seeded).every(([name, identity]) => same(inventory[name] ?? null, identity));
  let answer = null, P1 = false;
  try {
    answer = parseJsonRejectDuplicateKeys(strictText(bytes(join(workspace, "answer.json"), PILOT_LIMITS.answer_bytes)));
    P1 = closed(answer, ["totals"]) && Array.isArray(answer.totals) && answer.totals.length <= 32
      && answer.totals.every((row, index) => closed(row, ["sku", "total"]) && typeof row.sku === "string"
        && /^[\x00-\x7f]+$/u.test(row.sku) && Number.isSafeInteger(row.total) && row.total >= 0
        && (index === 0 || answer.totals[index - 1].sku < row.sku));
  } catch (error) {
    if (["EACCES", "EPERM", "EIO", "EBUSY", "EMFILE", "ENFILE", "ELOOP"].includes(error?.code)) return { status: "unscored", reason: "grader_io_error", P1: null, P2: null, P3, inventory };
  }
  if (Date.now() - started > PILOT_LIMITS.grader_ms) return { status: "unscored", reason: "grader_time_limit", P1: null, P2: null, P3, inventory };
  const P2 = P1 && same(answer, EXPECTED);
  return { status: P1 && P2 && P3 ? "pass" : "fail", reason: null, P1: Boolean(P1), P2, P3, inventory };
}
function finalFormat(path) {
  try { assertBenchmarkSchemaInstance(json(path), { schemaPath: join(ROOT, SCHEMA), label: "pilot final response" }); return "pass"; }
  catch { return "fail"; }
}
function executeLaunch(plan, launch, synthetic) {
  const { executable, argv, ...options } = launch;
  if (plan.mode === "native") return executeContainedAgent(executable, argv, { ...options, recordCleanupFailure: true });
  if (plan.mode !== "fake_native") throw new Error("native transport mode invalid");
  const { scenario, condition, root, sessionId } = synthetic;
  const env = { ...options.env, PILOT_FINAL: join(root, "final.json"), PILOT_SESSION: join(options.env.CODEX_HOME, "sessions", "synthetic.jsonl"),
    PILOT_PROFILE_DIGEST: canonicalDigest(plan.command), PILOT_SESSION_ID: sessionId, PILOT_DENY_ROOTS: JSON.stringify(plan.command.deny_roots), PILOT_LAUNCH_RECORD: join(root, "received-launch.json") };
  return executeContainedAgent(plan.node.executable, [join(ROOT, FAKE), `--native-${condition === "control" ? "control" : "exec"}`, scenario, condition, ...argv],
    { ...options, env, timeout: plan.synthetic_timeout_ms ?? options.timeout, recordCleanupFailure: true });
}
function persistProcess(root, proc, started, timeout) {
  const stdout = Buffer.from(proc.stdout ?? ""), stderr = Buffer.from(proc.stderr ?? "");
  exclusiveBytes(join(root, "stdout.bin"), stdout.subarray(0, PILOT_LIMITS.max_buffer_bytes));
  exclusiveBytes(join(root, "stderr.bin"), stderr.subarray(0, PILOT_LIMITS.max_buffer_bytes));
  const outcome = { pid: proc.pid ?? null, started, completed: new Date().toISOString(), exit: proc.status ?? null,
    signal: proc.signal ?? null, error: proc.error?.code ?? null, timeout: proc.error?.code === "ETIMEDOUT", actual_timeout_ms: timeout,
    output_limited: stdout.length > PILOT_LIMITS.max_buffer_bytes || stderr.length > PILOT_LIMITS.max_buffer_bytes || proc.error?.code === "ENOBUFS",
    residual_detected: Boolean(proc.workspace_descendants_detected), cleanup_error: Boolean(proc.cleanup_error), stdout_digest: sha(stdout.subarray(0, PILOT_LIMITS.max_buffer_bytes)),
    stderr_digest: sha(stderr.subarray(0, PILOT_LIMITS.max_buffer_bytes)), duration_ms: Date.now() - Date.parse(started) };
  save(join(root, "process.json"), outcome);
  return outcome;
}
function runControl(plan, report, authState) {
  const root = join(plan.private_root, "control"), home = join(root, "codex-home"), workspace = join(plan.workspace_root, "control");
  mkdirSync(root, { mode: 0o700 }); mkdirSync(home, { mode: 0o700 }); mkdirSync(workspace, { mode: 0o700 });
  const deniedOther = join(plan.workspace_root, "other-trial-canary"); mkdirSync(deniedOther, { mode: 0o700 });
  const canaries = [join(workspace, "public.txt"), join(root, "private.txt"), join(ROOT, FIXTURE, "input.json"), join(deniedOther, "private.txt")];
  exclusiveBytes(canaries[0], "ASK_PUBLIC_CANARY\n"); exclusiveBytes(canaries[1], "ASK_PRIVATE_CANARY\n"); exclusiveBytes(canaries[3], "ASK_OTHER_CANARY\n");
  if (plan.mode === "native") { authState.identity = attachExistingAuth(plan, home, null); report.auth_links_created++; save(join(plan.private_root, "auth-source-metadata.json"), authState.identity); }
  const launch = nativeControlLaunch(plan, { workspace, home, canaries }); save(join(root, "launch.json"), launch);
  const started = new Date().toISOString(); save(join(root, "claim.json"), { state: "spent", started, plan_digest: canonicalDigest(plan), launch_digest: canonicalDigest(launch) });
  report.control_starts++;
  if (plan.mode === "native") report.native_cli_starts++; else report.fake_exec_starts++;
  const proc = executeLaunch(plan, launch, { scenario: plan.control_scenario, condition: "control", root, sessionId: "synthetic-control" });
  const process = persistProcess(root, proc, started, plan.synthetic_timeout_ms ?? launch.timeout);
  const pass = proc.status === 0 && !proc.error && !proc.signal && !proc.workspace_descendants_detected && !process.output_limited
    && Buffer.from(proc.stdout ?? "").equals(Buffer.from("ASK_PILOT_CANARY_PASS\n")) && Buffer.from(proc.stderr ?? "").length === 0;
  const result = { state: "completed", status: pass ? "pass" : "fail", process, observed: plan.mode === "native" ? "native_sandbox" : "synthetic_native_sandbox", auth_source_probed: false };
  save(join(root, "result.json"), result); return result;
}
function runTrial(plan, slot, countLaunch, authState) {
  const root = join(plan.private_root, slot.condition); mkdirSync(root, { mode: 0o700 });
  const workspace = join(plan.workspace_root, slot.condition); mkdirSync(workspace, { mode: 0o700 });
  const home = join(root, "codex-home"); mkdirSync(home, { mode: 0o700 });
  for (const name of ["task.md", "input.json"]) exclusiveBytes(join(workspace, name), bytes(join(ROOT, FIXTURE, name)));
  const seeded = workspaceInventory(workspace); save(join(root, "seeded.json"), seeded);
  const task = bytes(join(workspace, "task.md"));
  const stdin = slot.condition === "plain" ? task : renderSuccessorStdin(Buffer.concat([bytes(join(ROOT, "AGENTS.md")), Buffer.from("\n$ARGUMENTS\n")]), task);
  if (sha(stdin) !== slot.stdin_digest) throw new Error("stdin identity drift");
  exclusiveBytes(join(root, "stdin.txt"), stdin);
  exclusiveBytes(join(root, "output-schema.json"), bytes(join(ROOT, SCHEMA)));
  let args = [join(ROOT, FAKE), plan.scenarios[slot.index], slot.condition];
  let env = { HOME: home, CODEX_HOME: home, LANG: "C", LC_ALL: "C", TZ: "UTC", PILOT_FINAL: join(root, "final.json"), PILOT_SESSION: join(home, "session.json"),
    PILOT_PROFILE_DIGEST: canonicalDigest(plan.command), PILOT_SESSION_ID: `${canonicalDigest(plan)}-${slot.index}` };
  let launch = null;
  if (plan.mode !== "fake_only") {
    if (plan.mode === "native") { attachExistingAuth(plan, home, authState.identity); authState.report.auth_links_created++; }
    launch = nativeTrialLaunch(plan, { workspace, home, evidenceRoot: root }); args = launch.argv; env = launch.env;
    save(join(root, "launch.json"), launch);
  }
  const started = new Date().toISOString();
  save(join(root, "claim.json"), { state: "spent", started, condition: slot.condition, plan_digest: canonicalDigest(plan), executable: launch ? plan.native : plan.node, argv_digest: canonicalDigest(args), env_digest: canonicalDigest(env), planned_timeout_ms: PILOT_LIMITS.timeout_ms });
  let proc;
  const timeout = plan.synthetic_timeout_ms ?? PILOT_LIMITS.timeout_ms;
  countLaunch();
  try { proc = launch ? executeLaunch(plan, { ...launch, input: stdin }, { scenario: plan.scenarios[slot.index], condition: slot.condition, root, sessionId: `${canonicalDigest(plan)}-${slot.index}` })
    : executeContainedAgent(plan.node.executable, args, { cwd: workspace, env, input: stdin, timeout, killSignal: "SIGKILL", maxBuffer: PILOT_LIMITS.max_buffer_bytes, recordCleanupFailure: true }); }
  catch { proc = { status: null, signal: null, error: { code: "CONTAINMENT_FAILURE" }, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), pid: null, workspace_descendants_detected: true }; }
  const processOutcome = persistProcess(root, proc, started, timeout);
  const usage = captureSuccessorUsage(proc); save(join(root, "usage.json"), usage);
  let grade;
  try { grade = plan.scenarios[slot.index] === "unscored" ? { status: "unscored", reason: "synthetic_grader_fault", P1: null, P2: null, P3: null } : gradePilotWorkspace({ workspace, seeded }); }
  catch { grade = { status: "unscored", reason: "unexpected_grader_exception", P1: null, P2: null, P3: null }; }
  save(join(root, "grade.json"), grade);
  // Retain bounded answer bytes privately, without following a link or running
  // generated code. Missing/invalid/oversized answers remain in grade evidence.
  try { exclusiveBytes(join(root, "answer.bin"), bytes(join(workspace, "answer.json"), PILOT_LIMITS.answer_bytes)); }
  catch { /* the inventory and grade already retain the failure classification */ }
  let session = null, identity = false;
  try {
    if (plan.mode === "fake_only") {
      session = json(join(home, "session.json"));
      identity = session.id === env.PILOT_SESSION_ID && session.model === plan.model && session.reasoning === plan.reasoning
        && session.profile_digest === canonicalDigest(plan.command) && session.network === false;
    } else {
      session = parsePilotNativeSession({ stdout: Buffer.from(proc.stdout ?? ""), session: nativeSession(home), plan, workspace });
      session.id = session.session_id; identity = true;
    }
  } catch { /* preserved streams and process outcome remain available */ }
  save(join(root, "session-check.json"), { status: identity ? (plan.mode === "native" ? "observed_native_match" : "synthetic_match") : "mismatch", id: identity ? session.id : null });
  const total = usage.metrics.total_tokens;
  const outcome = { condition: slot.condition, state: "completed", grade: { status: grade.status, reason: grade.reason, P1: grade.P1, P2: grade.P2, P3: grade.P3 },
    final_format: finalFormat(join(root, "final.json")), process: processOutcome, usage: { status: total.status, total_tokens: total.value, reason: total.reason }, session_id: identity ? session.id : null,
    stop: null };
  if (proc.error || proc.status !== 0 || proc.signal || proc.workspace_descendants_detected || processOutcome.output_limited) outcome.stop = "process_failure";
  else if (!identity) outcome.stop = "session_identity_failure";
  else if (grade.status === "boundary_fault") outcome.stop = "workspace_boundary_fault";
  else if (usage.provider_stop.status === "detected") outcome.stop = "provider_stop";
  else if (total.status !== "known") outcome.stop = "usage_unknown";
  else if (total.value >= PILOT_LIMITS.trial_tokens) outcome.stop = "trial_token_threshold";
  save(join(root, "outcome.json"), outcome);
  return outcome;
}

/** This API cannot select or launch an arbitrary/native executable. */
export function runFakePilot(root) { return runPilot(root, "fake_only"); }
export function runNativeSimulation(root) { return runPilot(root, "fake_native"); }
export function runNativePilot(root) { return runPilot(root, "native"); }
function runPilot(root, expectedMode) {
  const plan = readPlan(root);
  if (plan.mode !== expectedMode) throw new Error("execution mode cannot be transplanted");
  assertCurrentSource(plan);
  let permission = null;
  if (expectedMode === "native") {
    permission = json(join(root, "permission.json"));
    if (!same(permission, pilotPermissionRecord(plan, permission.approval_ref))) throw new Error("fresh native permission binding invalid");
  }
  save(join(root, "run-claim.json"), { state: "spent", plan_digest: canonicalDigest(plan), started: new Date().toISOString(), mode: plan.mode,
    permission_digest: permission ? canonicalDigest(permission) : null });
  const report = { kind: plan.kind, mode: plan.mode, plan_digest: canonicalDigest(plan), control_starts: 0,
    native_cli_starts: 0, provider_model_calls: 0, credential_operations: 0, retry: 0, fake_exec_starts: 0,
    exec_starts: 0, auth_links_created: 0, control: { state: plan.mode === "fake_only" ? "not_required_synthetic" : "not_started" },
    total_known_tokens: 0, stop: null, slots: plan.trials.map(slot => ({ condition: slot.condition, state: "not_started" })) };
  const authState = { identity: null, report };
  save(join(root, "checkpoint-initial.json"), report);
  if (plan.mode !== "fake_only") {
    try {
      report.control = runControl(plan, report, authState);
      if (report.control.status !== "pass") report.stop = "control_failure";
    } catch {
      report.control = { state: existsSync(join(root, "control", "claim.json")) ? "spent_incomplete" : "not_started", status: "fail" };
      report.stop = "control_evidence_or_auth_fault";
    }
    if (plan.mode === "native" && report.auth_links_created) report.credential_operations = "cli_read_refresh_unobserved";
    save(join(root, "checkpoint-control.json"), report);
  }
  for (const slot of plan.trials) {
    if (report.stop) break;
    try {
      assertCurrentSource(plan);
      report.slots[slot.index] = runTrial(plan, slot, () => {
        report.exec_starts++;
        if (plan.mode === "native") { report.native_cli_starts++; report.provider_model_calls = "unobserved"; report.credential_operations = "cli_read_refresh_unobserved"; }
        else report.fake_exec_starts++;
      }, authState);
      const outcome = report.slots[slot.index];
      if (outcome.session_id && report.slots.slice(0, slot.index).some(previous => previous.session_id === outcome.session_id)) outcome.stop = "session_reused";
      report.total_known_tokens += outcome.usage.status === "known" ? outcome.usage.total_tokens : 0;
      report.stop = outcome.stop ?? (report.total_known_tokens >= PILOT_LIMITS.cumulative_tokens ? "cumulative_token_threshold" : null);
    } catch {
      report.slots[slot.index] = { condition: slot.condition, state: existsSync(join(root, slot.condition, "claim.json")) ? "spent_incomplete" : "not_started", stop: "evidence_or_source_fault" };
      report.stop = "evidence_or_source_fault";
      // Unknown launch outcome is never retried or treated as an unused slot.
    }
    save(join(root, `checkpoint-${slot.index}.json`), report);
  }
  save(join(root, "report.json"), report);
  const inventory = evidenceInventory(root);
  save(join(root, "evidence-seal.json"), { plan_digest: canonicalDigest(plan), files: inventory });
  return report;
}
function evidenceInventory(root, path = root) {
  const result = {};
  for (const name of readdirSync(path).sort()) {
    const file = join(path, name), rel = relative(root, file), info = lstatSync(file);
    if (rel === "evidence-seal.json") continue;
    if (name === "codex-home" && info.isDirectory()) {
      // Authentication and cache bytes are NEVER controller evidence inputs.
      // Only explicit rollout/session evidence is sealed. Check expected auth
      // link by metadata/link text without opening it; no credential digest.
      const plan = json(join(root, "plan.json")), auth = join(file, "auth.json");
      if (existsSync(auth) || (() => { try { return lstatSync(auth).isSymbolicLink(); } catch { return false; } })()) {
        if (plan.mode !== "native" || !lstatSync(auth).isSymbolicLink() || readlinkSync(auth) !== plan.auth_source) throw new Error("authentication link identity drift");
        result[relative(root, auth)] = canonicalDigest({ link_path: plan.auth_source, content: "not_read" });
      }
      for (const permitted of ["sessions", "session.json"]) if (existsSync(join(file, permitted))) {
        const item = join(file, permitted), stat = lstatSync(item);
        if (stat.isDirectory()) Object.assign(result, evidenceInventory(root, item));
        else result[relative(root, item)] = sha(bytes(item, PILOT_LIMITS.session_bytes));
      }
      continue;
    }
    if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)) throw new Error("evidence link fault");
    if (info.isDirectory()) Object.assign(result, evidenceInventory(root, file));
    else if (info.isFile()) result[rel] = sha(bytes(file, name.endsWith(".jsonl") ? PILOT_LIMITS.session_bytes : 1048576));
    else throw new Error("unsupported evidence file");
  }
  return result;
}
export function reopenFakePilot(root) {
  const plan = readPlan(root, { allowLegacy: true }), seal = json(join(root, "evidence-seal.json"));
  if (seal.plan_digest !== canonicalDigest(plan) || !same(seal.files, evidenceInventory(root))) throw new Error("pilot evidence digest mismatch");
  const report = json(join(root, "report.json"));
  if (report.plan_digest !== canonicalDigest(plan) || report.mode !== plan.mode) throw new Error("report binding mismatch");
  return report;
}

// The distribution adapter reuses the pilot's source, grading, process evidence
// and seal mechanics. Existing callers and historical reopen remain unchanged.
export { sourceIdentity as pilotSourceIdentity, assertCurrentSource as assertPilotCurrentSource,
  readPlan as readPilotPlan, workspaceInventory as pilotWorkspaceInventory,
  finalFormat as pilotFinalFormat, persistProcess as persistPilotProcess,
  evidenceInventory as pilotEvidenceInventory };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, root, ...extras] = process.argv.slice(2);
    if (extras.length && !(mode === "bind-live-permission" && extras.length === 1)) throw new Error("unexpected arguments");
    const result = mode === "prepare-fake" && root === undefined ? prepareFakePilot()
      : mode === "run-fake" && root ? runFakePilot(root)
      : mode === "prepare-live" && root ? prepareNativePilot(json(root))
      : mode === "bind-live-permission" && root && extras.length === 1 ? (bindNativePermission(root, extras[0]), { permission: "bound_not_executed" })
      : mode === "run-live" && root && extras.length === 0 ? runNativePilot(root)
      : mode === "reopen" && root ? reopenFakePilot(root)
      : (() => { throw new Error("invalid mode; native execution requires fresh bound permission"); })();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch { process.stderr.write("synthetic pilot refused or failed; existing evidence preserved\n"); process.exitCode = 1; }
}
