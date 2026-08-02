import { createHash } from "node:crypto";
import { existsSync, lstatSync, opendirSync, realpathSync } from "node:fs";
import { parse, resolve, sep } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const TERMINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH = "benchmarks/schemas/portfolio-terminal-workspace-authority.schema.json";
export const TERMINAL_WORKSPACE_AUTHORITY_PATH = "terminal-workspace-authority.json";
export const TERMINAL_WORKSPACE_AUTHORITY_VERSION = "1.0.0";
export const TERMINAL_WORKSPACE_LIMITS = Object.freeze({
  maximum_file_count: 20_000,
  maximum_per_file_bytes: 8 * 1024 * 1024,
  maximum_workspace_total_bytes: 128 * 1024 * 1024,
  maximum_changed_content_bytes: 6 * 1024 * 1024,
  maximum_serialized_authority_bytes: 8 * 1024 * 1024,
  maximum_portable_path_length: 240,
});
const MAX_AUTHORITY_BYTES = TERMINAL_WORKSPACE_LIMITS.maximum_serialized_authority_bytes;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function modeOf(status) {
  return `0${(status.mode & 0o777).toString(8).padStart(3, "0")}`;
}

function assertNoSymlinkSegments(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symlink`);
  }
}

export function assertTerminalWorkspaceRelativePath(value, label = "terminal workspace path") {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > TERMINAL_WORKSPACE_LIMITS.maximum_portable_path_length
    || value !== value.normalize("NFC")
    || value.includes("\\")
    || value.includes(":")
    || value.includes("\0")
    || value.startsWith("/")
    || value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} is not a portable relative path`);
  }
  return value;
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCanonicalPaths(entries, label) {
  if (!Array.isArray(entries) || entries.length > TERMINAL_WORKSPACE_LIMITS.maximum_file_count) throw new Error(`${label} exceeds the inventory limit`);
  const paths = entries.map((entry) => assertTerminalWorkspaceRelativePath(entry?.path, `${label} path`));
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contains a duplicate path`);
  const folded = paths.map((path) => path.normalize("NFC").toLowerCase());
  if (new Set(folded).size !== folded.length) throw new Error(`${label} contains a case-colliding path`);
  const sorted = [...paths].sort(comparePaths);
  if (stableCanonicalJson(paths) !== stableCanonicalJson(sorted)) throw new Error(`${label} is not canonically ordered`);
  return paths;
}

export function validateTerminalWorkspaceTreeInventory(entries, label = "terminal workspace tree inventory") {
  const paths = assertCanonicalPaths(entries, label);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const path of paths) {
    const entry = byPath.get(path);
    if (!entry || !["regular_file", "directory"].includes(entry.file_type) || !/^0[0-7]{3}$/u.test(entry.mode)) throw new Error(`${label} contains invalid entry metadata: ${path}`);
    if (entry.file_type === "regular_file") {
      if (!Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")) throw new Error(`${label} contains invalid regular file metadata: ${path}`);
    } else if (entry.bytes !== null || entry.sha256 !== null) {
      throw new Error(`${label} directory contains file metadata: ${path}`);
    }
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const ancestor = byPath.get(segments.slice(0, index).join("/"));
      if (!ancestor) throw new Error(`${label} omits a parent directory for ${path}`);
      if (ancestor.file_type !== "directory") throw new Error(`${label} places an entry below a regular file`);
    }
  }
  return entries;
}

function portableEntry(path, status, bytes = null) {
  if (status.isDirectory()) return { path, file_type: "directory", mode: modeOf(status), bytes: null, sha256: null };
  if (!status.isFile()) throw new Error(`terminal workspace contains a special file: ${path}`);
  if (status.nlink !== 1) throw new Error(`terminal workspace contains a hard-linked file: ${path}`);
  const content = bytes ?? Buffer.alloc(0);
  return { path, file_type: "regular_file", mode: modeOf(status), bytes: content.length, sha256: sha256(content) };
}

function statusIdentity(status, canonicalPath) {
  return {
    canonical_path: canonicalPath,
    dev: status.dev,
    ino: status.ino,
    nlink: status.nlink,
    mode: status.mode & 0o777,
    size: status.size,
    mtime_ms: status.mtimeMs,
    ctime_ms: status.ctimeMs,
  };
}

function assertSameIdentity(before, after, label) {
  if (stableCanonicalJson(before) !== stableCanonicalJson(after)) throw new Error(`${label} changed during terminal workspace capture`);
}

export function collectBoundedDirectoryEntryNames(directory, maximumEntries) {
  if (!Number.isInteger(maximumEntries) || maximumEntries < 0) throw new Error("terminal workspace directory entry limit is invalid");
  const names = [];
  try {
    for (;;) {
      const entry = directory.readSync();
      if (entry === null) break;
      if (names.length === maximumEntries) throw new Error("terminal workspace exceeds the file count limit");
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return names.sort(comparePaths);
}

function readBoundedDirectoryEntryNames(path, remainingEntries) {
  return collectBoundedDirectoryEntryNames(opendirSync(path), remainingEntries);
}

function scanTerminalWorkspace(root, scan, inspectionHook) {
  const inventory = [];
  const contents = new Map();
  const identities = new Map();
  let totalBytes = 0;
  const observe = (event) => {
    if (inspectionHook !== null) inspectionHook({ ...event, scan });
  };
  const visit = (directory, directoryPath = null) => {
    assertNoSymlinkSegments(directory, `terminal workspace directory ${directoryPath ?? "."}`);
    const initialStatus = lstatSync(directory);
    if (initialStatus.isSymbolicLink() || !initialStatus.isDirectory()) throw new Error(`terminal workspace directory changed type: ${directoryPath ?? "."}`);
    const initialCanonicalPath = realpathSync(directory);
    const initialIdentity = statusIdentity(initialStatus, initialCanonicalPath);
    observe({ phase: "directory_inspected", path: directoryPath });
    const beforeReadStatus = lstatSync(directory);
    const beforeReadCanonicalPath = realpathSync(directory);
    assertSameIdentity(initialIdentity, statusIdentity(beforeReadStatus, beforeReadCanonicalPath), `terminal workspace directory ${directoryPath ?? "."}`);
    const names = readBoundedDirectoryEntryNames(directory, TERMINAL_WORKSPACE_LIMITS.maximum_file_count - inventory.length);
    observe({ phase: "directory_entries_read", path: directoryPath, names: [...names] });
    for (const name of names) {
      const absolute = resolve(directory, name);
      const path = directoryPath === null ? name : `${directoryPath}/${name}`;
      assertTerminalWorkspaceRelativePath(path);
      assertNoSymlinkSegments(absolute, `terminal workspace entry ${path}`);
      const status = lstatSync(absolute);
      if (status.isSymbolicLink()) throw new Error(`terminal workspace contains a symlink: ${path}`);
      if (status.isDirectory()) {
        inventory.push(portableEntry(path, status));
        visit(absolute, path);
      } else if (status.isFile()) {
        const file = readStableFile(absolute, `terminal workspace file ${path}`, TERMINAL_WORKSPACE_LIMITS.maximum_per_file_bytes, {
          afterOpen: () => observe({ phase: "file_descriptor_opened", path }),
        });
        const finalStatus = lstatSync(absolute);
        if (finalStatus.nlink !== 1 || (finalStatus.mode & 0o777) !== file.evidence.finalPath.mode || finalStatus.dev !== file.evidence.finalPath.dev || finalStatus.ino !== file.evidence.finalPath.ino) throw new Error(`terminal workspace file identity changed: ${path}`);
        inventory.push(portableEntry(path, finalStatus, file.bytes));
        contents.set(path, file.bytes);
        identities.set(path, { canonical_path: file.canonicalPath, evidence: file.evidence, raw_digest: file.rawByteDigest });
        totalBytes += file.bytes.length;
        if (totalBytes > TERMINAL_WORKSPACE_LIMITS.maximum_workspace_total_bytes) throw new Error("terminal workspace exceeds the total byte limit");
      } else {
        throw new Error(`terminal workspace contains a special file: ${path}`);
      }
      if (inventory.length > TERMINAL_WORKSPACE_LIMITS.maximum_file_count) throw new Error("terminal workspace exceeds the file count limit");
    }
    const finalStatus = lstatSync(directory);
    if (finalStatus.isSymbolicLink() || !finalStatus.isDirectory()) throw new Error(`terminal workspace directory changed type: ${directoryPath ?? "."}`);
    const finalCanonicalPath = realpathSync(directory);
    const finalIdentity = statusIdentity(finalStatus, finalCanonicalPath);
    assertSameIdentity(initialIdentity, finalIdentity, `terminal workspace directory ${directoryPath ?? "."}`);
    identities.set(directoryPath ?? "", { ...finalIdentity, entries: names });
  };
  visit(root);
  inventory.sort((left, right) => comparePaths(left.path, right.path));
  validateTerminalWorkspaceTreeInventory(inventory, "terminal workspace inventory");
  return { inventory, contents, identities, totalBytes };
}

function captureTerminalWorkspaceInventoryUnchecked(workspaceRoot, { inspectionHook = null } = {}) {
  const root = resolve(workspaceRoot);
  assertNoSymlinkSegments(root, "terminal workspace root");
  if (!existsSync(root)) throw new Error("terminal workspace root must be a real directory");
  const rootStatus = lstatSync(root);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) throw new Error("terminal workspace root must be a real directory");
  const rootIdentity = statusIdentity(rootStatus, realpathSync(root));
  const first = scanTerminalWorkspace(root, 1, inspectionHook);
  if (inspectionHook !== null) inspectionHook({ phase: "scan_completed", scan: 1, path: null });
  const second = scanTerminalWorkspace(root, 2, inspectionHook);
  if (inspectionHook !== null) inspectionHook({ phase: "scan_completed", scan: 2, path: null });
  const finalStatus = lstatSync(root);
  if (!finalStatus.isDirectory() || finalStatus.isSymbolicLink()) throw new Error("terminal workspace root changed type during capture");
  assertSameIdentity(rootIdentity, statusIdentity(finalStatus, realpathSync(root)), "terminal workspace root");
  if (stableCanonicalJson(first.inventory) !== stableCanonicalJson(second.inventory) || stableCanonicalJson([...first.identities]) !== stableCanonicalJson([...second.identities])) throw new Error("terminal workspace changed between canonical scans");
  for (const [path, bytes] of first.contents) if (!second.contents.get(path)?.equals(bytes)) throw new Error(`terminal workspace content changed between scans: ${path}`);
  return { inventory: second.inventory, contents: second.contents };
}

export function captureTerminalWorkspaceInventory(workspaceRoot, options = {}) {
  try {
    return captureTerminalWorkspaceInventoryUnchecked(workspaceRoot, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/terminal workspace/u.test(message)) throw error;
    throw new Error(`terminal workspace capture failed: ${message}`);
  }
}

function metadata(entry, content = null) {
  if (!entry) return null;
  return {
    file_type: entry.file_type,
    mode: entry.mode,
    bytes: entry.bytes,
    sha256: entry.sha256,
    content_base64: content === null ? null : content.toString("base64"),
  };
}

function comparable(entry) {
  return entry ? { file_type: entry.file_type, mode: entry.mode, bytes: entry.bytes, sha256: entry.sha256 } : null;
}

export function terminalWorkspaceInventoryDigest(inventory) {
  return canonicalDigest(inventory.map((entry) => ({ path: entry.path, ...comparable(entry) })));
}

export function deriveTerminalCandidateInventory(inventory, managedAssetPaths, baseInventory) {
  const managed = new Set(managedAssetPaths);
  const basePaths = new Set(baseInventory.map((entry) => entry.path));
  const managedAncestors = new Set();
  for (const path of [...managed, "BENCHMARK_TASK.md"]) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) managedAncestors.add(segments.slice(0, index).join("/"));
  }
  const retained = inventory.filter((entry) => entry.path !== "BENCHMARK_TASK.md" && !managed.has(entry.path));
  const retainedNonManaged = retained.filter((entry) => entry.file_type === "regular_file" || !managedAncestors.has(entry.path) || !basePaths.has(entry.path));
  const requiredDirectories = new Set(retainedNonManaged.filter((entry) => entry.file_type === "directory" && !basePaths.has(entry.path)).map((entry) => entry.path));
  for (const entry of retainedNonManaged) {
    const segments = entry.path.split("/");
    for (let index = 1; index < segments.length; index += 1) requiredDirectories.add(segments.slice(0, index).join("/"));
  }
  const candidate = retained.filter((entry) => entry.file_type === "regular_file" || !managedAncestors.has(entry.path) || requiredDirectories.has(entry.path));
  validateTerminalWorkspaceTreeInventory(candidate, "terminal candidate inventory");
  return candidate;
}

function authoritySemanticBase(authority) {
  const { authority_digest: ignoredDigest, authority_bytes: ignoredBytes, ...base } = authority;
  return base;
}

export function terminalWorkspaceAuthorityBytes(authority) {
  let value = { ...authority, authority_bytes: 0 };
  for (let index = 0; index < 8; index += 1) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    if (bytes.length > MAX_AUTHORITY_BYTES) throw new Error("terminal workspace authority exceeds the serialized byte limit");
    if (value.authority_bytes === bytes.length) return bytes;
    value = { ...value, authority_bytes: bytes.length };
  }
  throw new Error("terminal workspace authority byte count did not stabilize");
}

export function buildTerminalWorkspaceAuthority({ root, baseSnapshot, terminalWorkspaceRoot, identity, managedAssetPaths }) {
  const terminal = captureTerminalWorkspaceInventory(terminalWorkspaceRoot);
  const managed = [...new Set(managedAssetPaths.map((path) => assertTerminalWorkspaceRelativePath(path, "managed asset path")))].sort(comparePaths);
  validateTerminalWorkspaceTreeInventory(baseSnapshot.inventory, "base workspace inventory");
  const baseByPath = new Map(baseSnapshot.inventory.map((entry) => [entry.path, entry]));
  const terminalByPath = new Map(terminal.inventory.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...baseByPath.keys(), ...terminalByPath.keys()])].sort(comparePaths);
  const delta = [];
  let changedContentBytes = 0;
  for (const path of paths) {
    const before = baseByPath.get(path) ?? null;
    const after = terminalByPath.get(path) ?? null;
    if (stableCanonicalJson(comparable(before)) === stableCanonicalJson(comparable(after))) continue;
    const changeType = before === null ? "addition" : after === null ? "deletion" : "modification";
    const afterContent = after?.file_type === "regular_file" ? terminal.contents.get(path) : null;
    if (afterContent !== null) {
      changedContentBytes += afterContent.length;
      if (changedContentBytes > TERMINAL_WORKSPACE_LIMITS.maximum_changed_content_bytes) throw new Error("terminal workspace exceeds the changed content byte limit");
    }
    delta.push({ path, change_type: changeType, before: metadata(before), after: metadata(after, afterContent) });
  }
  assertCanonicalPaths(delta, "terminal workspace delta inventory");
  const candidate = deriveTerminalCandidateInventory(terminal.inventory, managed, baseSnapshot.inventory);
  const authority = {
    schema_version: TERMINAL_WORKSPACE_AUTHORITY_VERSION,
    schema_path: TERMINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH,
    program: "adaptive_ask_terminal_workspace_authority",
    ...identity,
    base_workspace_portable_digest: terminalWorkspaceInventoryDigest(baseSnapshot.inventory),
    terminal_workspace_portable_digest: terminalWorkspaceInventoryDigest(terminal.inventory),
    terminal_candidate_tree_digest: terminalWorkspaceInventoryDigest(candidate),
    base_inventory: structuredClone(baseSnapshot.inventory),
    managed_asset_paths: managed,
    delta_inventory: delta,
    authority_digest: null,
    authority_bytes: 0,
  };
  authority.authority_digest = canonicalDigest(authoritySemanticBase(authority));
  const bytes = terminalWorkspaceAuthorityBytes(authority);
  authority.authority_bytes = bytes.length;
  assertBenchmarkSchemaInstance(authority, { schemaPath: resolve(root, TERMINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH), label: "terminal workspace authority" });
  const finalizedBytes = terminalWorkspaceAuthorityBytes(authority);
  if (finalizedBytes.length > MAX_AUTHORITY_BYTES) throw new Error("terminal workspace authority exceeds the serialized byte limit");
  return { authority, bytes: finalizedBytes };
}

function applyDelta(authority) {
  validateTerminalWorkspaceTreeInventory(authority.base_inventory, "terminal workspace base inventory");
  assertCanonicalPaths(authority.delta_inventory, "terminal workspace delta inventory");
  const inventory = new Map(authority.base_inventory.map((entry) => [entry.path, structuredClone(entry)]));
  const contents = new Map();
  for (const entry of authority.delta_inventory) {
    for (const [side, value] of [["before", entry.before], ["after", entry.after]]) {
      if (value === null) continue;
      if (!["regular_file", "directory"].includes(value.file_type) || !/^0[0-7]{3}$/u.test(value.mode)) throw new Error(`terminal workspace delta ${side} metadata is invalid: ${entry.path}`);
      if (value.file_type === "directory") {
        if (value.bytes !== null || value.sha256 !== null || value.content_base64 !== null) throw new Error(`terminal workspace delta ${side} directory metadata is invalid: ${entry.path}`);
      } else if (!Number.isInteger(value.bytes) || value.bytes < 0 || !/^[a-f0-9]{64}$/u.test(value.sha256 ?? "")) {
        throw new Error(`terminal workspace delta ${side} regular metadata is invalid: ${entry.path}`);
      }
    }
    if (entry.before?.file_type === "regular_file" && entry.before.content_base64 !== null) throw new Error(`terminal workspace delta before content must be null: ${entry.path}`);
    const existing = inventory.get(entry.path) ?? null;
    if (stableCanonicalJson(comparable(existing)) !== stableCanonicalJson(entry.before === null ? null : { file_type: entry.before.file_type, mode: entry.before.mode, bytes: entry.before.bytes, sha256: entry.before.sha256 })) throw new Error(`terminal workspace delta before metadata mismatch: ${entry.path}`);
    if (
      (entry.change_type === "addition" && (existing !== null || entry.before !== null || entry.after === null))
      || (entry.change_type === "deletion" && (existing === null || entry.before === null || entry.after !== null))
      || (entry.change_type === "modification" && (existing === null || entry.before === null || entry.after === null))
    ) throw new Error(`terminal workspace delta change type mismatch: ${entry.path}`);
    if (entry.after === null) {
      inventory.delete(entry.path);
      continue;
    }
    const next = { path: entry.path, file_type: entry.after.file_type, mode: entry.after.mode, bytes: entry.after.bytes, sha256: entry.after.sha256 };
    if (next.file_type === "regular_file") {
      if (typeof entry.after.content_base64 !== "string") throw new Error(`terminal workspace delta content is missing: ${entry.path}`);
      const content = Buffer.from(entry.after.content_base64, "base64");
      if (content.toString("base64") !== entry.after.content_base64 || content.length !== next.bytes || sha256(content) !== next.sha256) throw new Error(`terminal workspace delta content identity mismatch: ${entry.path}`);
      contents.set(entry.path, content);
    } else if (entry.after.content_base64 !== null) {
      throw new Error(`terminal workspace directory delta contains content: ${entry.path}`);
    }
    inventory.set(entry.path, next);
  }
  const terminal = [...inventory.values()].sort((left, right) => comparePaths(left.path, right.path));
  validateTerminalWorkspaceTreeInventory(terminal, "terminal workspace terminal inventory");
  return { inventory: terminal, contents };
}

export function terminalWorkspaceFileIdentity(file) {
  const status = file.evidence.openedDescriptor;
  return {
    device: String(status.dev),
    inode: String(status.ino),
    size: status.size,
    mtime_ms: status.mtimeMs,
    ctime_ms: status.ctimeMs,
    raw_digest: file.rawByteDigest,
    canonical_path: { classification: "attempt_relative", digest: `sha256:${sha256(Buffer.from(file.canonicalPath))}` },
  };
}

export function terminalWorkspaceAuthorityReference(file, authority) {
  return {
    path: TERMINAL_WORKSPACE_AUTHORITY_PATH,
    sha256: file.rawByteDigest,
    bytes: file.bytes.length,
    digest: authority.authority_digest,
    tree_digest: authority.terminal_candidate_tree_digest,
    file_identity: terminalWorkspaceFileIdentity(file),
  };
}

export function readVerifiedTerminalWorkspaceAuthority({ root, authorityPath, reference = null, expected = {}, expectedBaseInventory = null, expectedManagedAssetPaths = null }) {
  assertNoSymlinkSegments(authorityPath, "terminal workspace authority");
  const file = readStableFile(authorityPath, "terminal workspace authority", MAX_AUTHORITY_BYTES, { allowEmpty: false });
  const authorityStatus = lstatSync(authorityPath);
  if (!authorityStatus.isFile() || authorityStatus.isSymbolicLink() || authorityStatus.nlink !== 1 || (authorityStatus.mode & 0o777) !== 0o444 || authorityStatus.dev !== file.evidence.openedDescriptor.dev || authorityStatus.ino !== file.evidence.openedDescriptor.ino) throw new Error("terminal workspace authority must be a standalone read-only regular file");
  let authority;
  try {
    authority = JSON.parse(file.bytes.toString("utf8"));
  } catch {
    throw new Error("terminal workspace authority contains invalid JSON");
  }
  assertBenchmarkSchemaInstance(authority, { schemaPath: resolve(root, TERMINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH), label: "terminal workspace authority" });
  if (authority.authority_bytes !== file.bytes.length) throw new Error("terminal workspace authority byte count mismatch");
  if (authority.authority_digest !== canonicalDigest(authoritySemanticBase(authority))) throw new Error("terminal workspace authority digest mismatch");
  for (const [field, value] of Object.entries(expected)) if (value !== undefined && authority[field] !== value) throw new Error(`terminal workspace authority ${field} mismatch`);
  if (reference && stableCanonicalJson(reference) !== stableCanonicalJson(terminalWorkspaceAuthorityReference(file, authority))) throw new Error("terminal workspace authority reference mismatch");
  if (expectedBaseInventory) {
    const authorityRegular = authority.base_inventory.filter((entry) => entry.file_type === "regular_file");
    if (stableCanonicalJson(authorityRegular) !== stableCanonicalJson(expectedBaseInventory)) throw new Error("terminal workspace base inventory mismatch");
  }
  if (expectedManagedAssetPaths && stableCanonicalJson(authority.managed_asset_paths) !== stableCanonicalJson([...new Set(expectedManagedAssetPaths)].sort(comparePaths))) throw new Error("terminal workspace managed asset inventory mismatch");
  const terminal = applyDelta(authority);
  if (authority.base_workspace_portable_digest !== terminalWorkspaceInventoryDigest(authority.base_inventory)) throw new Error("terminal workspace base digest mismatch");
  if (authority.terminal_workspace_portable_digest !== terminalWorkspaceInventoryDigest(terminal.inventory)) throw new Error("terminal workspace terminal digest mismatch");
  if (authority.terminal_candidate_tree_digest !== terminalWorkspaceInventoryDigest(deriveTerminalCandidateInventory(terminal.inventory, authority.managed_asset_paths, authority.base_inventory))) throw new Error("terminal workspace candidate tree digest mismatch");
  const after = readStableFile(authorityPath, "terminal workspace authority", MAX_AUTHORITY_BYTES, { allowEmpty: false });
  assertStableFileEvidence(file, after, "terminal workspace authority");
  return { authority, file, terminal };
}

export function terminalWorkspacePathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}${sep}`) || right.startsWith(`${left}${sep}`);
}
