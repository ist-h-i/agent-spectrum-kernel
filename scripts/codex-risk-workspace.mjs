import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

import { assertNoManagedCodexConfiguration, readStableExecutableFile, verifyRiskCodexExecutor } from "./codex-risk-approval.mjs";

const PERMITTED_FILESYSTEM_EFFECTS = new Set(["create", "modify", "delete"]);
const REQUIRED_PROHIBITED_EFFECTS = Object.freeze([
  "external_side_effects",
  "git_metadata_changes",
  "write_outside_target_scope",
]);
const RESERVED_TOP_LEVEL = new Set([".git"]);
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const SYSTEM_CONFIG_READ_DENY_PATHS = Object.freeze([
  "/etc/codex/config.toml",
  "/etc/codex/managed_config.toml",
  "/etc/codex/requirements.toml",
  "/Library/Managed Preferences/com.openai.codex.plist",
  "/Library/Preferences/com.openai.codex.plist",
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function inside(path, root) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function validateRelativePath(path, label) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0") || path.includes("\\") || path.startsWith("/") || path.endsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} must be a canonical non-empty relative POSIX path`);
  }
  if (RESERVED_TOP_LEVEL.has(path.split("/")[0])) throw new Error(`${label} targets reserved Git metadata`);
}

export function validateRiskActionEnforcement(action) {
  for (const path of action.target_scope ?? []) validateRelativePath(path, "risk action target_scope");
  const effects = action.permitted_effects ?? [];
  if (effects.length === 0 || effects.some((effect) => !PERMITTED_FILESYSTEM_EFFECTS.has(effect))) {
    throw new Error("risk action permitted_effects must use only create, modify, and delete");
  }
  for (const required of REQUIRED_PROHIBITED_EFFECTS) {
    if (!(action.prohibited_effects ?? []).includes(required)) throw new Error(`risk action prohibited_effects must include ${required}`);
  }
  const unsupported = (action.prohibited_effects ?? []).filter((effect) => !REQUIRED_PROHIBITED_EFFECTS.includes(effect));
  if (unsupported.length > 0) throw new Error(`risk action contains unsupported prohibited effect: ${unsupported.join(", ")}`);
}

function git(target, args, options = {}) {
  const result = spawnSync("git", args, { cwd: target, encoding: options.encoding ?? "utf8", maxBuffer: MAX_FILE_BYTES });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.error?.message || "unknown failure"}`);
  return result.stdout;
}

function allowedRunnerStatus(path, allowed) {
  return allowed.some((entry) => path === entry || (entry.endsWith("/") && path.startsWith(entry)));
}

function assertCleanExactRepository(target, repository, allowedRunnerPaths = []) {
  const head = git(target, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  const tree = git(target, ["rev-parse", "--verify", "HEAD^{tree}"]).trim();
  if (head !== repository.head_sha || tree !== repository.tree_sha) throw new Error("risk repository HEAD/tree changed after approval");
  const status = git(target, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const unexpected = status.split("\0").filter(Boolean).filter((entry) => {
    const path = entry.slice(3).split(" -> ").at(-1);
    return !allowedRunnerStatus(path, allowedRunnerPaths);
  });
  if (unexpected.length > 0) throw new Error(`risk repository must be clean and exactly HEAD-derived before isolated execution or promotion: ${unexpected.join(", ")}`);
}

function trackedEntries(target, headSha) {
  const output = git(target, ["ls-tree", "-rz", headSha], { encoding: "buffer" });
  const entries = [];
  for (const record of output.toString("utf8").split("\0")) {
    if (!record) continue;
    const match = record.match(/^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/u);
    if (!match) throw new Error("cannot parse the exact HEAD tree");
    const [, mode, type, object, path] = match;
    validateRelativePath(path, "tracked path");
    if (path === ".codex/config.toml" || path.endsWith("/.codex/config.toml")) throw new Error(`risk repository contains a project Codex configuration layer: ${path}`);
    if (type !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(`risk repository contains unsupported tracked entry ${path} (${mode} ${type})`);
    entries.push({ mode, object, path });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function codexConfigReadDenyPaths(workspace, environment = {}, systemConfigPaths = []) {
  const paths = new Set(systemConfigPaths);
  for (const root of [environment.CODEX_HOME, environment.HOME ? join(environment.HOME, ".codex") : null]) {
    if (root) paths.add(resolve(root, "config.toml"));
  }
  let cursor = workspace;
  while (true) {
    paths.add(join(cursor, ".codex", "config.toml"));
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return [...paths].sort();
}

function validateClosedEnvironment(environment, policy, taskRoot) {
  if (!environment || !policy || policy.inheritance !== "none" || policy.authentication_mode !== "single_api_key_environment" || policy.runtime_path_derivation !== "runner_task_root_v1") throw new Error("risk Codex execution requires a closed non-inherited single-API-key environment policy");
  const canonicalTaskRoot = realpathSync(taskRoot);
  const derivedValues = {
    "<RUNNER_TASK_ROOT>/home": join(canonicalTaskRoot, "home"),
    "<RUNNER_TASK_ROOT>/codex-home": join(canonicalTaskRoot, "codex-home"),
  };
  const publicBindings = policy.public_bindings ?? [];
  const secretBindings = policy.secret_bindings ?? [];
  if (secretBindings.length !== 1) throw new Error("risk Codex execution requires exactly one approved API-key binding");
  const expectedNames = [...publicBindings.map((entry) => entry.name), ...secretBindings.map((entry) => entry.name)].sort();
  const actualNames = Object.keys(environment).sort();
  if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) throw new Error("risk Codex execution environment contains an unbound or missing name");
  for (const binding of publicBindings) {
    const expectedValue = derivedValues[binding.value] ?? binding.value;
    if (environment[binding.name] !== expectedValue) throw new Error(`risk Codex public environment binding changed: ${binding.name}`);
    if (derivedValues[binding.value]) {
      const status = lstatSync(expectedValue);
      if (!status.isDirectory() || status.isSymbolicLink() || realpathSync(expectedValue) !== expectedValue || readdirSync(expectedValue).length !== 0) throw new Error(`risk Codex derived ${binding.name} must be an empty canonical directory`);
    }
  }
  for (const binding of secretBindings) if (sha256(canonicalJson(environment[binding.name])) !== binding.value_sha256) throw new Error(`risk Codex secret environment binding changed: ${binding.name}`);
  const redactedIdentity = Object.fromEntries([
    ...publicBindings.map(({ name, value }) => [name, value]),
    ...secretBindings.map(({ name, value_sha256 }) => [name, value_sha256]),
  ].sort(([left], [right]) => left.localeCompare(right)));
  if (sha256(canonicalJson(redactedIdentity)) !== policy.environment_sha256) throw new Error("risk Codex execution environment digest changed immediately before spawn");
}

function inventory(root, { ignored = new Set() } = {}) {
  const result = {};
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name);
      const path = relative(root, absolute).split(sep).join("/");
      if (ignored.has(path)) continue;
      const status = lstatSync(absolute);
      if (status.isSymbolicLink()) throw new Error(`risk workspace contains a symbolic link: ${path}`);
      if (status.isDirectory()) {
        if (name === ".git") throw new Error(`risk workspace contains reserved Git metadata: ${path}`);
        visit(absolute);
        continue;
      }
      if (!status.isFile()) throw new Error(`risk workspace contains a special file: ${path}`);
      if (status.nlink !== 1) throw new Error(`risk workspace contains a hard-linked file: ${path}`);
      if (status.size > MAX_FILE_BYTES) throw new Error(`risk workspace file is too large: ${path}`);
      const bytes = readFileSync(absolute);
      const after = statSync(absolute);
      if (after.dev !== status.dev || after.ino !== status.ino || after.size !== status.size || after.mtimeMs !== status.mtimeMs || after.ctimeMs !== status.ctimeMs) throw new Error(`risk workspace file changed while reading: ${path}`);
      result[path] = { sha256: sha256(bytes), mode: status.mode & 0o777, size_bytes: status.size };
    }
  };
  visit(root);
  return result;
}

function inventoryDigest(value) {
  return sha256(canonicalJson(value));
}

function scopeAllows(path, scopes) {
  return scopes.some((scope) => path === scope || path.startsWith(`${scope}/`));
}

function changedFiles(before, after) {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return paths.flatMap((path) => {
    if (!before[path]) return [{ path, effect: "create", before: null, after: after[path] }];
    if (!after[path]) return [{ path, effect: "delete", before: before[path], after: null }];
    return canonicalJson(before[path]) === canonicalJson(after[path]) ? [] : [{ path, effect: "modify", before: before[path], after: after[path] }];
  });
}

export function createRiskWorkspace({ target, request, ignoredRepositoryPaths = [] }) {
  validateRiskActionEnforcement(request.action);
  if (canonicalJson(request.invocation?.runtime_policy?.system_config_paths) !== canonicalJson(SYSTEM_CONFIG_READ_DENY_PATHS)) {
    throw new Error("risk request does not bind the closed system Codex configuration read-deny paths");
  }
  for (const path of ignoredRepositoryPaths) {
    const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
    validateRelativePath(normalized, "runner-owned repository path");
    if (request.action.target_scope.some((scope) => scope === normalized || scope.startsWith(`${normalized}/`) || normalized.startsWith(`${scope}/`))) throw new Error(`risk action target scope overlaps runner-owned path: ${path}`);
  }
  const canonicalTarget = realpathSync(target);
  assertCleanExactRepository(canonicalTarget, request.invocation.repository, ignoredRepositoryPaths);
  const taskRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-codex-risk-")));
  const workspace = resolve(taskRoot, "workspace");
  mkdirSync(workspace, { mode: 0o700 });
  try {
    const entries = trackedEntries(canonicalTarget, request.invocation.repository.head_sha);
    for (const entry of entries) {
      const destination = resolve(workspace, entry.path);
      if (!inside(destination, workspace)) throw new Error(`tracked path escapes risk workspace: ${entry.path}`);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      const blob = git(canonicalTarget, ["cat-file", "blob", entry.object], { encoding: "buffer" });
      writeFileSync(destination, blob, { mode: entry.mode === "100755" ? 0o755 : 0o644, flag: "wx" });
    }
    const baseline = inventory(workspace);
    const repositoryBaseline = Object.fromEntries(Object.entries(baseline).filter(([path]) => !allowedRunnerStatus(path, ignoredRepositoryPaths)));
    return {
      taskRoot,
      workspace,
      target: canonicalTarget,
      baseline,
      repository_baseline: repositoryBaseline,
      workspace_base_sha256: inventoryDigest(repositoryBaseline),
      request_sha256: request.request_sha256,
      repository: structuredClone(request.invocation.repository),
      runtime_policy: structuredClone(request.invocation.runtime_policy),
      target_scope: [...request.action.target_scope],
      permitted_effects: [...request.action.permitted_effects],
      ignored_repository_paths: [...ignoredRepositoryPaths],
    };
  } catch (error) {
    rmSync(taskRoot, { recursive: true, force: true });
    throw error;
  }
}

function sandboxProfile(workspace, configReadDenyPaths) {
  const escaped = workspace.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const deniedReads = configReadDenyPaths.map((path) => `(deny file-read* (literal "${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"))`).join("\n");
  return `(version 1)\n(allow default)\n(deny file-write* (require-not (subpath "${escaped}")))\n${deniedReads}\n`;
}

export function assertRiskIsolationProvider() {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) throw new Error("no supported OS filesystem-isolation provider is available");
}

function openVerifiedExecutorSnapshot(context, executable, executorBinding) {
  verifyRiskCodexExecutor(executorBinding);
  if (executable !== executorBinding.spawn_path || executable !== executorBinding.native_binary?.canonical_path) {
    throw new Error("risk Codex executable does not match the approved native spawn path");
  }
  const source = readStableExecutableFile(executable, "approved Codex native executable at spawn boundary");
  if (source.path !== executorBinding.native_binary.canonical_path
    || source.file_sha256 !== executorBinding.native_binary.raw_sha256
    || source.bytes.length !== executorBinding.native_binary.size_bytes) {
    throw new Error("approved Codex native executable identity changed at the spawn boundary");
  }
  const snapshot = resolve(context.taskRoot, ".codex-native-snapshot");
  writeFileSync(snapshot, source.bytes, { flag: "wx", mode: 0o500 });
  let descriptor = null;
  try {
    descriptor = openSync(snapshot, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.nlink !== 1 || status.size !== source.bytes.length) throw new Error("runner-owned Codex native snapshot is not a closed regular file");
    const snapshotBytes = readFileSync(descriptor);
    if (sha256(snapshotBytes) !== executorBinding.native_binary.raw_sha256) throw new Error("runner-owned Codex native snapshot digest differs from the approved executable");
    return { descriptor, path: snapshot };
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(snapshot)) unlinkSync(snapshot);
    throw error;
  }
}

export async function runInRiskWorkspace({ context, executable, executorBinding, args, input, env, environmentPolicy }) {
  assertRiskIsolationProvider();
  validateClosedEnvironment(env, environmentPolicy, context.taskRoot);
  const configReadDenyPaths = codexConfigReadDenyPaths(context.workspace, env, context.runtime_policy.system_config_paths);
  const current = inventory(context.workspace);
  for (const path of Object.keys(current)) {
    if (path === ".codex/config.toml" || path.endsWith("/.codex/config.toml")) throw new Error(`risk workspace contains a project Codex configuration layer before spawn: ${path}`);
  }
  assertNoManagedCodexConfiguration();
  const snapshot = openVerifiedExecutorSnapshot(context, executable, executorBinding);
  const commandArgs = ["-p", sandboxProfile(context.workspace, configReadDenyPaths), snapshot.path, ...args];
  const result = await new Promise((resolveResult) => {
    let child;
    try {
      child = spawn("/usr/bin/sandbox-exec", commandArgs, {
        cwd: context.workspace,
        env,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      closeSync(snapshot.descriptor);
      if (existsSync(snapshot.path)) unlinkSync(snapshot.path);
      throw error;
    }
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let spawnError = null;
    let overflow = false;
    const collect = (chunks, kind) => (chunk) => {
      if (kind === "stdout") stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes + stderrBytes > 10 * 1024 * 1024) {
        overflow = true;
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* process already exited */ }
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdout, "stdout"));
    child.stderr.on("data", collect(stderr, "stderr"));
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (code) => {
      let residual = false;
      try {
        process.kill(-child.pid, 0);
        residual = true;
        process.kill(-child.pid, "SIGKILL");
      } catch { /* no residual process group */ }
      let snapshotError = null;
      try {
        const finalSnapshot = readStableExecutableFile(snapshot.path, "runner-owned Codex native snapshot after execution");
        if (finalSnapshot.file_sha256 !== executorBinding.native_binary.raw_sha256) snapshotError = "runner-owned Codex native snapshot changed during execution";
      } catch (error) {
        snapshotError = error.message;
      } finally {
        closeSync(snapshot.descriptor);
        if (existsSync(snapshot.path)) unlinkSync(snapshot.path);
      }
      resolveResult({
        status: code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: spawnError?.message ?? snapshotError ?? (overflow ? "isolated process output exceeded the accepted bound" : residual ? "isolated process left a residual child process" : null),
      });
    });
    child.stdin.end(input);
  });
  return {
    command: ["/usr/bin/sandbox-exec", "-p", "<closed-risk-profile>", `<runner-owned-native-snapshot:${executable}>`, ...args, "<stdin-prompt>"].join(" "),
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

export function auditRiskWorkspace(context, { ignoredPaths = [] } = {}) {
  const ignored = new Set(ignoredPaths);
  for (const path of ignored) validateRelativePath(path, "ignored runner path");
  const before = Object.fromEntries(Object.entries(context.baseline).filter(([path]) => !ignored.has(path)));
  const after = inventory(context.workspace, { ignored });
  const delta = changedFiles(before, after);
  for (const change of delta) {
    if (!scopeAllows(change.path, context.target_scope)) throw new Error(`risk workspace changed an out-of-scope path: ${change.path}`);
    if (!context.permitted_effects.includes(change.effect)) throw new Error(`risk workspace performed unapproved ${change.effect} effect: ${change.path}`);
  }
  return {
    delta,
    observed_effects: [...new Set(delta.map((change) => change.effect))].sort(),
    delta_sha256: sha256(canonicalJson(delta)),
  };
}

function validatePromotionDestination(target, path, effect) {
  const destination = resolve(target, path);
  if (!inside(destination, target)) throw new Error(`promotion path escapes target: ${path}`);
  let cursor = dirname(destination);
  while (inside(cursor, target) && cursor !== target) {
    if (existsSync(cursor)) {
      const status = lstatSync(cursor);
      if (status.isSymbolicLink() || !status.isDirectory()) throw new Error(`promotion parent is not a real directory: ${path}`);
    }
    cursor = dirname(cursor);
  }
  if (effect !== "create" && !existsSync(destination)) throw new Error(`promotion source state drifted for ${path}`);
  if (existsSync(destination)) {
    const status = lstatSync(destination);
    if (status.isSymbolicLink() || !status.isFile()) throw new Error(`promotion target is not a regular non-symlink file: ${path}`);
    if (status.nlink !== 1) throw new Error(`promotion target is hard-linked: ${path}`);
    if (effect === "create") throw new Error(`promotion create target already exists: ${path}`);
  }
  return destination;
}

export function beginRiskWorkspacePromotion(context, audit) {
  assertCleanExactRepository(context.target, context.repository, context.ignored_repository_paths);
  const currentInventory = inventory(context.target, { ignored: new Set([".git"]) });
  const currentBaseline = Object.fromEntries(Object.entries(currentInventory).filter(([path]) => !allowedRunnerStatus(path, context.ignored_repository_paths)));
  if (inventoryDigest(currentBaseline) !== context.workspace_base_sha256) throw new Error("risk repository base bytes changed before promotion");
  const promotionRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-codex-promotion-")));
  const backupRoot = resolve(promotionRoot, "backup");
  const stagedRoot = resolve(promotionRoot, "staged");
  const destinations = new Map();
  const createdDirectories = [];
  const applied = [];
  const temporaryFiles = new Map();
  let state = "pending";
  const fileState = (path) => {
    try {
      const status = lstatSync(path);
      return { dev: status.dev, ino: status.ino, mode: status.mode, size: status.size,
        digest: status.isFile() && !status.isSymbolicLink() ? sha256(readFileSync(path)) : null };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
  const ownTemporary = (destination) => {
    const path = resolve(dirname(destination), `.ask-risk-${process.pid}-${createHash("sha256").update(`${promotionRoot}:${destination}`).digest("hex").slice(0, 16)}`);
    const descriptor = openSync(path, "wx", 0o600);
    // Register ownership before copy/chmod/rename can fail.
    temporaryFiles.set(path, fstatSync(descriptor));
    closeSync(descriptor);
    return path;
  };
  const rollback = () => {
    if (state === "rolled_back") return;
    if (state === "finalized") throw new Error("risk promotion was already finalized");
    const failures = [];
    for (let index = applied.length - 1; index >= 0; index -= 1) {
      const { change, published } = applied[index];
      const destination = destinations.get(change.path);
      try {
        if (canonicalJson(fileState(destination)) !== canonicalJson(published)) throw new Error(`concurrent change preserved at ${change.path}`);
        if (change.effect === "create") unlinkSync(destination);
        else {
          const backup = resolve(backupRoot, change.path);
          const temporary = ownTemporary(destination);
          copyFileSync(backup, temporary);
          chmodSync(temporary, lstatSync(backup).mode & 0o777);
          renameSync(temporary, destination);
          temporaryFiles.delete(temporary);
        }
        applied.splice(index, 1);
      } catch (error) { failures.push(`${change.path}: ${error.message}`); }
    }
    for (const [path, owned] of temporaryFiles) {
      try {
        const current = fileState(path);
        if (current && (current.dev !== owned.dev || current.ino !== owned.ino)) throw new Error(`temporary ownership changed: ${path}`);
        if (current) unlinkSync(path);
        temporaryFiles.delete(path);
      } catch (error) { failures.push(error.message); }
    }
    for (const { path: directory, dev, ino } of [...createdDirectories].reverse()) {
      try {
        const current = lstatSync(directory);
        if (current.dev === dev && current.ino === ino) rmdirSync(directory);
      }
      catch (error) {
        // Do not remove unrelated files added to directories created by this promotion.
        if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) failures.push(error.message);
      }
    }
    if (!failures.length) {
      try { rmSync(promotionRoot, { recursive: true, force: true }); }
      catch (error) { failures.push(`backup cleanup: ${error.message}`); }
    }
    if (failures.length) {
      const error = new Error(`risk promotion rollback failed; backup retained at ${promotionRoot}: ${failures.join("; ")}`);
      error.rollback_failed = true;
      error.recovery_path = promotionRoot;
      error.remaining_paths = applied.map(({ change }) => change.path);
      throw error;
    }
    state = "rolled_back";
  };
  try {
    mkdirSync(backupRoot);
    mkdirSync(stagedRoot);
    for (const change of audit.delta) {
      const destination = validatePromotionDestination(context.target, change.path, change.effect);
      destinations.set(change.path, destination);
      if (change.effect !== "create") {
        const current = currentInventory[change.path];
        if (!current || canonicalJson(current) !== canonicalJson(change.before)) throw new Error(`promotion source bytes or mode drifted for ${change.path}`);
        const backup = resolve(backupRoot, change.path);
        mkdirSync(dirname(backup), { recursive: true });
        copyFileSync(destination, backup);
        chmodSync(backup, lstatSync(destination).mode & 0o777);
      }
      if (change.effect !== "delete") {
        const source = resolve(context.workspace, change.path);
        const sourceBytes = readFileSync(source);
        const sourceStatus = lstatSync(source);
        if (sourceStatus.isSymbolicLink() || !sourceStatus.isFile() || sourceStatus.nlink !== 1 || sha256(sourceBytes) !== change.after.sha256 || (sourceStatus.mode & 0o777) !== change.after.mode) throw new Error(`accepted workspace bytes or mode drifted for ${change.path}`);
        const staged = resolve(stagedRoot, change.path);
        mkdirSync(dirname(staged), { recursive: true });
        copyFileSync(source, staged);
        chmodSync(staged, lstatSync(source).mode & 0o777);
      }
    }
    for (const change of audit.delta) {
      const destination = destinations.get(change.path);
      validatePromotionDestination(context.target, change.path, change.effect);
      const expected = currentInventory[change.path];
      const current = fileState(destination);
      if (expected && (!current || current.digest !== expected.sha256 || (current.mode & 0o777) !== expected.mode)) throw new Error(`promotion source changed during promotion: ${change.path}`);
      if (change.effect === "delete") {
        unlinkSync(destination);
        applied.push({ change, published: null });
      } else {
        let parent = dirname(destination);
        const missing = [];
        while (parent !== context.target && !existsSync(parent)) {
          missing.push(parent);
          parent = dirname(parent);
        }
        for (const directory of missing.reverse()) {
          mkdirSync(directory, { mode: 0o755 });
          const { dev, ino } = lstatSync(directory);
          createdDirectories.push({ path: directory, dev, ino });
        }
        const staged = resolve(stagedRoot, change.path);
        const temporary = ownTemporary(destination);
        copyFileSync(staged, temporary);
        chmodSync(temporary, lstatSync(staged).mode & 0o777);
        const published = fileState(temporary);
        renameSync(temporary, destination);
        temporaryFiles.delete(temporary);
        applied.push({ change, published });
      }
    }
    return {
      promoted_paths: audit.delta.map((change) => change.path),
      promotion_sha256: audit.delta_sha256,
      rollback,
      finalize() {
        if (state === "finalized") return;
        if (state !== "pending") throw new Error("risk promotion was already rolled back");
        // Publication is committed by the caller before this cleanup boundary.
        state = "finalized";
        try { rmSync(promotionRoot, { recursive: true, force: true }); }
        catch (cause) {
          const error = new Error(`risk promotion committed but backup cleanup failed at ${promotionRoot}: ${cause.message}`, { cause });
          error.cleanup_failed = true;
          error.recovery_path = promotionRoot;
          throw error;
        }
      },
    };
  } catch (error) {
    try { rollback(); }
    catch (rollbackError) {
      rollbackError.cause = error;
      throw rollbackError;
    }
    throw new Error(`risk promotion failed and was rolled back: ${error.message}`, { cause: error });
  }
}

export function promoteRiskWorkspace(context, audit) {
  const promotion = beginRiskWorkspacePromotion(context, audit);
  promotion.finalize();
  return { promoted_paths: promotion.promoted_paths, promotion_sha256: promotion.promotion_sha256 };
}

export function disposeRiskWorkspace(context) {
  if (!context?.taskRoot) return;
  const canonicalTemporary = realpathSync(tmpdir());
  const canonicalTask = realpathSync(context.taskRoot);
  if (!inside(canonicalTask, canonicalTemporary) || !canonicalTask.split(sep).at(-1).startsWith("ask-codex-risk-")) throw new Error("refusing to dispose an unrecognized risk workspace");
  rmSync(canonicalTask, { recursive: true, force: true });
}
