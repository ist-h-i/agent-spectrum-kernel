import { spawnSync } from "node:child_process";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readlinkSync, realpathSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { canonicalJson, jsonDigest, pathInside, safeLstat, sha256, validateSetupPaths } from "./ask-setup-inputs.mjs";
import { readSetupRepositoryId, validateSetupGitMetadata } from "./ask-setup-git.mjs";

export const SETUP_INSTALLERS = Object.freeze({
  kernel: Object.freeze({ script: "scripts/install-kernel.mjs", state: ".agent-spectrum-kernel/install-state.json", installer: "agent-spectrum-kernel" }),
  codex: Object.freeze({ script: "scripts/install-codex-adapter.mjs", state: ".agent-spectrum-kernel/codex-install-state.json", installer: "agent-spectrum-codex-adapter" }),
  "claude-code": Object.freeze({ script: "scripts/install-claude-adapter.mjs", state: ".agent-spectrum-kernel/claude-install-state.json", installer: "agent-spectrum-claude-adapter" }),
});
export const SETUP_STATE_PATHS = Object.freeze(Object.values(SETUP_INSTALLERS).map((entry) => entry.state));
const MAX_ENTRIES = 100000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TREE_BYTES = 512 * 1024 * 1024;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const comparePath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
const sortEntries = (entries) => [...entries].sort(comparePath);

export class SetupApplyError extends Error {
  constructor(code) {
    super(code);
    this.name = "SetupApplyError";
    this.code = code;
  }
}
export function applyAssert(condition, code) {
  if (!condition) throw new SetupApplyError(code);
}

// Deliberately do not execute Git status/diff or read arbitrary Git configuration.
// HEAD is a content address for its committed tree; the exact index bytes bind
// staged state. The worktree is independently bound below, including untracked
// and ignored files. A root locator is never emitted in an apply report.
function gitBinding(root) {
  const gitDir = validateSetupGitMetadata(root);
  if (!gitDir) return { repository_id: null, head_digest: null, index_digest: null };
  const read = (base, name) => {
    validateSetupPaths(base, [name]);
    const path = resolve(base, name);
    return safeLstat(path) ? safeBytes(path) : null;
  };
  const head = read(gitDir, "HEAD");
  const pointer = read(gitDir, "commondir");
  const common = pointer ? resolve(gitDir, pointer.toString("utf8").trim()) : gitDir;
  const ref = head?.toString("utf8").trim().match(/^ref:\s*(.+)$/u)?.[1];
  const heads = [head === null ? null : sha256(head)];
  // validateSetupGitMetadata has already validated the symbolic ref and pointers.
  if (ref) {
    for (const base of new Set([gitDir, common])) {
      const loose = read(base, ref);
      heads.push(loose === null ? null : sha256(loose));
      if (loose === null) {
        const packed = read(base, "packed-refs");
        heads.push(packed === null ? null : sha256(packed));
      }
    }
  }
  const index = read(gitDir, "index");
  return {
    repository_id: readSetupRepositoryId(gitDir),
    head_digest: jsonDigest(heads),
    index_digest: index === null ? null : `sha256:${sha256(index)}`,
  };
}

// Stable, bounded reads; no symlink following at the final file component.
// Callers validate ancestors separately. This is not an OS isolation boundary.
function safeBytes(path, maximum = MAX_FILE_BYTES) {
  const before = lstatSync(path);
  applyAssert(before.isFile() && before.size <= maximum, "unsafe_or_oversized_file");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    applyAssert(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino
      && opened.size === before.size, "file_changed_during_read");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const named = lstatSync(path);
    applyAssert(bytes.length <= maximum && after.size === opened.size && after.mtimeMs === opened.mtimeMs
      && after.ctimeMs === opened.ctimeMs && named.dev === after.dev && named.ino === after.ino
      && named.isFile(), "file_changed_during_read");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function sensitive(path) {
  const base = basename(path);
  return [".env", ".npmrc", ".netrc", "credentials", "credentials.json"].includes(base)
    || base.startsWith(".env.") || /\.(?:pem|key|p12|pfx|jks)$/u.test(base)
    || path.split("/").some((part) => [".ssh", ".aws", ".azure", ".gnupg"].includes(part));
}

// Entries are internal observations, never the serialized plan/report. Secret
// files use metadata only. Non-sensitive bytes are hashed, not copied/emitted.
// Unrelated symlinks and special files are observed without following/reading;
// installer input/write paths are separately rejected by assertSetupWritePaths.
export function captureApplyTree(target) {
  const root = realpathSync(target);
  const entries = [];
  let totalBytes = 0;
  function visit(directory, prefix) {
    for (const name of readdirSync(directory).sort()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (name === ".git") {
        if (prefix) entries.push({ path, type: "nested_git", metadata_digest: jsonDigest(gitBinding(directory)) });
        continue;
      }
      const absolute = resolve(directory, name);
      const stat = lstatSync(absolute);
      applyAssert(entries.length < MAX_ENTRIES, "target_snapshot_limit");
      const mode = stat.mode & 0o777;
      if (stat.isSymbolicLink()) {
        entries.push({ path, type: "symlink", mode, sha256: sha256(readlinkSync(absolute)) });
      } else if (sensitive(path)) {
        entries.push({ path, type: "opaque", mode, metadata_digest: jsonDigest({ size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, kind: stat.mode & 0o170000 }) });
      } else if (stat.isDirectory()) {
        entries.push({ path, type: "directory", mode });
        visit(absolute, path);
      } else if (stat.isFile()) {
        totalBytes += stat.size;
        applyAssert(totalBytes <= MAX_TREE_BYTES, "target_snapshot_limit");
        entries.push({ path, type: "file", mode, sha256: sha256(safeBytes(absolute)) });
      } else {
        entries.push({ path, type: "special", mode, metadata_digest: jsonDigest({ kind: stat.mode & 0o170000, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs }) });
      }
    }
  }
  visit(root, "");
  return sortEntries(entries);
}

export function applyTreeDigest(entries) {
  return jsonDigest(sortEntries(entries));
}

export function captureApplyTarget(target) {
  const root = realpathSync(target);
  const git = gitBinding(root);
  const entries = captureApplyTree(root);
  applyAssert(canonicalJson(git) === canonicalJson(gitBinding(root)), "target_changed_during_snapshot");
  const binding = { git, worktree_digest: applyTreeDigest(entries) };
  return { entries, binding: { ...binding, digest: jsonDigest(binding) } };
}

// Overlay only observed staging changes, not a second projection/render engine.
// Parents created for the partial staging copy must not replace real project
// directory modes. An existing real directory remains project-owned.
export function overlayStagingResult(targetEntries, beforeStaging, afterStaging) {
  const expected = new Map(targetEntries.map((entry) => [entry.path, entry]));
  const before = new Map(beforeStaging.map((entry) => [entry.path, entry]));
  const after = new Map(afterStaging.map((entry) => [entry.path, entry]));
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(path);
    const b = after.get(path);
    if (canonicalJson(a) === canonicalJson(b)) continue;
    if (!b) expected.delete(path);
    else if (!(b.type === "directory" && expected.get(path)?.type === "directory")) expected.set(path, b);
  }
  return sortEntries(expected.values());
}

export function resultBinding(git, entries) {
  const value = { git, worktree_digest: applyTreeDigest(entries) };
  return { ...value, digest: jsonDigest(value) };
}

export function assertSetupWritePaths(target, paths) {
  validateSetupPaths(target, paths);
  const root = realpathSync(target);
  function visit(path) {
    const stat = safeLstat(path);
    if (!stat) return;
    applyAssert(!stat.isSymbolicLink() && (stat.isFile() || stat.isDirectory()), "unsafe_installer_path");
    if (stat.isFile()) applyAssert(stat.nlink === 1, "hardlinked_installer_path");
    else for (const name of readdirSync(path)) visit(resolve(path, name));
  }
  for (const path of new Set(paths)) {
    applyAssert(typeof path === "string" && !isAbsolute(path) && path !== ".git"
      && !path.split("/").includes(".git") && !sensitive(path)
      && pathInside(root, resolve(root, path)), "unsafe_installer_path");
    visit(resolve(root, path));
  }
}

export function assertNoSetupInProgress(target) {
  for (const state of SETUP_STATE_PATHS) {
    const marker = `${state}.in-progress.json`;
    validateSetupPaths(target, [marker]);
    applyAssert(!safeLstat(resolve(target, marker)), "installer_recovery_required");
  }
}

export function readApplyJson(path) {
  // Validate every existing ancestor, including dangling symlinks, before read.
  let cursor = resolve(path);
  while (true) {
    const stat = safeLstat(cursor);
    applyAssert(stat && !stat.isSymbolicLink(), "unsafe_json_input");
    applyAssert(cursor === resolve(path) ? stat.isFile() : stat.isDirectory(), "unsafe_json_input");
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  try {
    return JSON.parse(safeBytes(resolve(path), 32 * 1024 * 1024).toString("utf8"));
  } catch {
    throw new SetupApplyError("invalid_json_input");
  }
}

export function setupInstallerInvocations(adapter, profile, selectedSkills, target) {
  applyAssert(adapter === "kernel-only" || Object.hasOwn(SETUP_INSTALLERS, adapter) && adapter !== "kernel", "unsupported_adapter");
  applyAssert(typeof profile === "string" && /^[a-z0-9][a-z0-9-]*$/u.test(profile), "unsupported_profile");
  applyAssert(Array.isArray(selectedSkills) && selectedSkills.length > 0
    && selectedSkills.every((skill) => typeof skill === "string" && /^[a-z0-9][a-z0-9-]*$/u.test(skill)), "invalid_skill_selection");
  const commands = [{
    phase: "kernel", ...SETUP_INSTALLERS.kernel,
    args: ["--target", target, "--merge-agents", "--skills", [...selectedSkills].sort().join(",")],
  }];
  if (adapter !== "kernel-only") commands.push({
    phase: "adapter", ...SETUP_INSTALLERS[adapter], args: ["--target", target, "--profile", profile],
  });
  return commands;
}

export function setupChildEnvironment() {
  // No inherited Node preload, Git tracing/config injection, credentials or
  // service tokens. The installers are local filesystem programs, not agents.
  const allowed = new Set(["PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ"]);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key)));
}

export function invokeSetupInstaller(sourceRoot, invocation, { dryRun = false } = {}) {
  applyAssert(Object.values(SETUP_INSTALLERS).some((entry) => entry.script === invocation.script), "unsupported_installer");
  const result = spawnSync(process.execPath, [resolve(sourceRoot, invocation.script), ...invocation.args, ...(dryRun ? ["--dry-run"] : [])], {
    cwd: sourceRoot, env: setupChildEnvironment(), encoding: "utf8", timeout: 120000,
    maxBuffer: 32 * 1024 * 1024, shell: false,
  });
  // Output and Error objects never become caller diagnostics or receipts.
  return { status: Number.isInteger(result.status) ? result.status : null, failed: Boolean(result.error || result.signal || result.status !== 0) };
}

export function managedSetupIdentities(target) {
  const result = [];
  for (const definition of Object.values(SETUP_INSTALLERS)) {
    validateSetupPaths(target, [definition.state]);
    if (!safeLstat(resolve(target, definition.state))) continue;
    const state = readApplyJson(resolve(target, definition.state));
    applyAssert(state?.schema_version === 3 && state.installer === definition.installer, "invalid_installer_state");
    const owned = [
      ...Object.entries(state.managed_files ?? {}).map(([path, record]) => ({ path, ownership: "managed_file", record })),
      ...Object.values(state.managed_blocks ?? {}).map((record) => ({ path: record.path, ownership: "managed_block", record })),
      ...Object.entries(state.managed_partial_files ?? {}).map(([path, record]) => ({ path, ownership: "managed_partial_file", record })),
    ].sort(comparePath);
    const files = owned.map(({ path, ownership, record }) => {
      validateSetupPaths(target, [path]);
      const absolute = resolve(target, path);
      const bytes = safeLstat(absolute) ? safeBytes(absolute) : null;
      return { path, ownership, actual_sha256: bytes === null ? null : sha256(bytes),
        managed_sha256: /^[a-f0-9]{64}$/u.test(record.sha256 ?? "") ? record.sha256 : null };
    });
    const identity = {
      installer: definition.installer,
      state_path: definition.state,
      install_status: ["installed", "detached"].includes(state.install_status) ? state.install_status : "unknown",
      profile: typeof state.selected_profile === "string" ? state.selected_profile : null,
      source_revision: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(state.source?.git_revision ?? "") ? state.source.git_revision : null,
      files,
      // These hashes bind generated projection/source identities and owned
      // subsets, without leaking rendered prompts, hooks or rollback contents.
      ownership_digest: jsonDigest({ files: state.managed_files ?? {}, blocks: state.managed_blocks ?? {}, partial: state.managed_partial_files ?? {} }),
      projection_digest: state.projection_plan ? jsonDigest(state.projection_plan) : null,
      installed_inventory_digest: state.actual_installed_inventory ? jsonDigest(state.actual_installed_inventory) : null,
    };
    result.push({ ...identity, identity_digest: jsonDigest(identity) });
  }
  return result;
}

export function setupRecovery(target, invocations) {
  return [...invocations].reverse().map(({ phase, script, state }) => {
    let rollback = "unavailable";
    let marker = false;
    try {
      validateSetupPaths(target, [state, `${state}.in-progress.json`]);
      marker = Boolean(safeLstat(resolve(target, `${state}.in-progress.json`)));
      const value = marker ? readApplyJson(resolve(target, `${state}.in-progress.json`))?.pending_state
        : safeLstat(resolve(target, state)) ? readApplyJson(resolve(target, state)) : null;
      if (value?.rollback && (value.rollback.files || value.rollback.blocks)) rollback = "snapshot_available_requires_dry_run";
    } catch {
      rollback = "unknown";
    }
    return {
      phase, state_path: state, in_progress: marker, rollback,
      rollback_command: ["node", script, "--target", "<target>", "--rollback", "--dry-run"],
      detach_command: ["node", script, "--target", "<target>", "--detach", "--dry-run"],
    };
  });
}

export function validApplyDigest(value) { return typeof value === "string" && DIGEST.test(value); }
