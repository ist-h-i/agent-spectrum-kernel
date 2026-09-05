import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";

const PERMITTED_FILESYSTEM_EFFECTS = new Set(["create", "modify", "delete"]);
const REQUIRED_PROHIBITED_EFFECTS = Object.freeze([
  "external_side_effects",
  "git_metadata_changes",
  "write_outside_target_scope",
]);
const RESERVED_TOP_LEVEL = new Set([".git"]);
const MAX_FILE_BYTES = 512 * 1024 * 1024;

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
    if (type !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(`risk repository contains unsupported tracked entry ${path} (${mode} ${type})`);
    entries.push({ mode, object, path });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
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
  const entries = trackedEntries(canonicalTarget, request.invocation.repository.head_sha);
  try {
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
      target_scope: [...request.action.target_scope],
      permitted_effects: [...request.action.permitted_effects],
      ignored_repository_paths: [...ignoredRepositoryPaths],
    };
  } catch (error) {
    rmSync(taskRoot, { recursive: true, force: true });
    throw error;
  }
}

function sandboxProfile(workspace) {
  const escaped = workspace.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `(version 1)\n(allow default)\n(deny file-write* (require-not (subpath "${escaped}")))\n`;
}

export async function runInRiskWorkspace({ context, executable, args, input, env = process.env }) {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) throw new Error("no supported OS filesystem-isolation provider is available");
  const commandArgs = ["-p", sandboxProfile(context.workspace), executable, ...args];
  const result = await new Promise((resolveResult) => {
    const child = spawn("/usr/bin/sandbox-exec", commandArgs, {
      cwd: context.workspace,
      env,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
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
      resolveResult({
        status: code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: spawnError?.message ?? (overflow ? "isolated process output exceeded the accepted bound" : residual ? "isolated process left a residual child process" : null),
      });
    });
    child.stdin.end(input);
  });
  return {
    command: ["/usr/bin/sandbox-exec", "-p", "<closed-risk-profile>", executable, ...args, "<stdin-prompt>"].join(" "),
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

export function promoteRiskWorkspace(context, audit) {
  assertCleanExactRepository(context.target, context.repository, context.ignored_repository_paths);
  const currentInventory = inventory(context.target, { ignored: new Set([".git"]) });
  const currentBaseline = Object.fromEntries(Object.entries(currentInventory).filter(([path]) => !allowedRunnerStatus(path, context.ignored_repository_paths)));
  if (inventoryDigest(currentBaseline) !== context.workspace_base_sha256) throw new Error("risk repository base bytes changed before promotion");
  const promotionRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-codex-promotion-")));
  const backupRoot = resolve(promotionRoot, "backup");
  const stagedRoot = resolve(promotionRoot, "staged");
  mkdirSync(backupRoot);
  mkdirSync(stagedRoot);
  const destinations = new Map();
  const createdDirectories = [];
  try {
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
    const applied = [];
    try {
      for (const change of audit.delta) {
        const destination = destinations.get(change.path);
        if (change.effect === "delete") {
          unlinkSync(destination);
        } else {
          let parent = dirname(destination);
          const missing = [];
          while (parent !== context.target && !existsSync(parent)) {
            missing.push(parent);
            parent = dirname(parent);
          }
          for (const directory of missing.reverse()) {
            mkdirSync(directory, { mode: 0o755 });
            createdDirectories.push(directory);
          }
          const staged = resolve(stagedRoot, change.path);
          const temporary = resolve(dirname(destination), `.ask-risk-${process.pid}-${createHash("sha256").update(change.path).digest("hex").slice(0, 12)}`);
          copyFileSync(staged, temporary);
          chmodSync(temporary, lstatSync(staged).mode & 0o777);
          renameSync(temporary, destination);
        }
        applied.push(change);
      }
    } catch (error) {
      for (const change of applied.reverse()) {
        const destination = destinations.get(change.path);
        if (change.effect === "create") {
          if (existsSync(destination)) unlinkSync(destination);
        } else {
          const backup = resolve(backupRoot, change.path);
          mkdirSync(dirname(destination), { recursive: true });
          copyFileSync(backup, destination);
          chmodSync(destination, lstatSync(backup).mode & 0o777);
        }
      }
      for (const directory of createdDirectories.reverse()) {
        try { rmSync(directory); } catch { /* a non-empty/user-modified directory is preserved */ }
      }
      throw new Error(`risk promotion failed and was rolled back: ${error.message}`);
    }
    return { promoted_paths: audit.delta.map((change) => change.path), promotion_sha256: audit.delta_sha256 };
  } finally {
    rmSync(promotionRoot, { recursive: true, force: true });
  }
}

export function disposeRiskWorkspace(context) {
  if (!context?.taskRoot) return;
  const canonicalTemporary = realpathSync(tmpdir());
  const canonicalTask = realpathSync(context.taskRoot);
  if (!inside(canonicalTask, canonicalTemporary) || !canonicalTask.split(sep).at(-1).startsWith("ask-codex-risk-")) throw new Error("refusing to dispose an unrecognized risk workspace");
  rmSync(canonicalTask, { recursive: true, force: true });
}
