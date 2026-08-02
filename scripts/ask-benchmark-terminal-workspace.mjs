import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, relative, resolve, sep } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

export const TERMINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH = "benchmarks/schemas/portfolio-terminal-workspace-authority.schema.json";
export const TERMINAL_WORKSPACE_AUTHORITY_PATH = "terminal-workspace-authority.json";
export const TERMINAL_WORKSPACE_AUTHORITY_VERSION = "1.0.0";
const MAX_AUTHORITY_BYTES = 64 * 1024 * 1024;
const MAX_INVENTORY_ENTRIES = 20_000;

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
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} is not a portable relative path`);
  }
  return value;
}

function assertCanonicalInventory(entries, label) {
  if (!Array.isArray(entries) || entries.length > MAX_INVENTORY_ENTRIES) throw new Error(`${label} exceeds the inventory limit`);
  const paths = entries.map((entry) => assertTerminalWorkspaceRelativePath(entry?.path, `${label} path`));
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contains a duplicate path`);
  const folded = paths.map((path) => path.normalize("NFC").toLowerCase());
  if (new Set(folded).size !== folded.length) throw new Error(`${label} contains a case-colliding path`);
  const sorted = [...paths].sort((left, right) => left.localeCompare(right));
  if (stableCanonicalJson(paths) !== stableCanonicalJson(sorted)) throw new Error(`${label} is not canonically ordered`);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const path of paths) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const ancestor = byPath.get(segments.slice(0, index).join("/"));
      if (ancestor?.file_type === "regular_file") throw new Error(`${label} places an entry below a regular file`);
    }
  }
}

function portableEntry(path, status, bytes = null) {
  if (status.isDirectory()) return { path, file_type: "directory", mode: modeOf(status), bytes: null, sha256: null };
  if (!status.isFile()) throw new Error(`terminal workspace contains a special file: ${path}`);
  if (status.nlink !== 1) throw new Error(`terminal workspace contains a hard-linked file: ${path}`);
  const content = bytes ?? Buffer.alloc(0);
  return { path, file_type: "regular_file", mode: modeOf(status), bytes: content.length, sha256: sha256(content) };
}

export function captureTerminalWorkspaceInventory(workspaceRoot) {
  const root = resolve(workspaceRoot);
  assertNoSymlinkSegments(root, "terminal workspace root");
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("terminal workspace root must be a real directory");
  const inventory = [];
  const contents = new Map();
  const visit = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, item.name);
      const path = relative(root, absolute).split(sep).join("/");
      assertTerminalWorkspaceRelativePath(path);
      const status = lstatSync(absolute);
      if (status.isSymbolicLink()) throw new Error(`terminal workspace contains a symlink: ${path}`);
      if (status.isDirectory()) {
        inventory.push(portableEntry(path, status));
        visit(absolute);
      } else if (status.isFile()) {
        const bytes = readFileSync(absolute);
        inventory.push(portableEntry(path, status, bytes));
        contents.set(path, bytes);
      } else {
        throw new Error(`terminal workspace contains a special file: ${path}`);
      }
    }
  };
  visit(root);
  inventory.sort((left, right) => left.path.localeCompare(right.path));
  assertCanonicalInventory(inventory, "terminal workspace inventory");
  return { inventory, contents };
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

function inventoryDigest(inventory) {
  return canonicalDigest(inventory.map((entry) => ({ path: entry.path, ...comparable(entry) })));
}

function candidateInventory(inventory, managedAssetPaths) {
  const managed = new Set(managedAssetPaths);
  return inventory.filter((entry) => entry.path !== "BENCHMARK_TASK.md" && !managed.has(entry.path));
}

function authoritySemanticBase(authority) {
  const { authority_digest: ignoredDigest, authority_bytes: ignoredBytes, ...base } = authority;
  return base;
}

export function terminalWorkspaceAuthorityBytes(authority) {
  let value = { ...authority, authority_bytes: 0 };
  for (let index = 0; index < 8; index += 1) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    if (value.authority_bytes === bytes.length) return bytes;
    value = { ...value, authority_bytes: bytes.length };
  }
  throw new Error("terminal workspace authority byte count did not stabilize");
}

export function buildTerminalWorkspaceAuthority({ root, baseSnapshot, terminalWorkspaceRoot, identity, managedAssetPaths }) {
  const terminal = captureTerminalWorkspaceInventory(terminalWorkspaceRoot);
  const managed = [...new Set(managedAssetPaths.map((path) => assertTerminalWorkspaceRelativePath(path, "managed asset path")))].sort((left, right) => left.localeCompare(right));
  assertCanonicalInventory(baseSnapshot.inventory, "base workspace inventory");
  const baseByPath = new Map(baseSnapshot.inventory.map((entry) => [entry.path, entry]));
  const terminalByPath = new Map(terminal.inventory.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...baseByPath.keys(), ...terminalByPath.keys()])].sort((left, right) => left.localeCompare(right));
  const delta = [];
  for (const path of paths) {
    const before = baseByPath.get(path) ?? null;
    const after = terminalByPath.get(path) ?? null;
    if (stableCanonicalJson(comparable(before)) === stableCanonicalJson(comparable(after))) continue;
    const changeType = before === null ? "addition" : after === null ? "deletion" : "modification";
    const afterContent = after?.file_type === "regular_file" ? terminal.contents.get(path) : null;
    delta.push({ path, change_type: changeType, before: metadata(before), after: metadata(after, afterContent) });
  }
  const authority = {
    schema_version: TERMINAL_WORKSPACE_AUTHORITY_VERSION,
    schema_path: TERMINAL_WORKSPACE_AUTHORITY_SCHEMA_PATH,
    program: "adaptive_ask_terminal_workspace_authority",
    ...identity,
    base_workspace_portable_digest: inventoryDigest(baseSnapshot.inventory),
    terminal_workspace_portable_digest: inventoryDigest(terminal.inventory),
    terminal_candidate_tree_digest: inventoryDigest(candidateInventory(terminal.inventory, managed)),
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
  return { authority, bytes: terminalWorkspaceAuthorityBytes(authority) };
}

function applyDelta(authority) {
  assertCanonicalInventory(authority.base_inventory, "terminal workspace base inventory");
  assertCanonicalInventory(authority.delta_inventory, "terminal workspace delta inventory");
  const inventory = new Map(authority.base_inventory.map((entry) => [entry.path, structuredClone(entry)]));
  const contents = new Map();
  for (const entry of authority.delta_inventory) {
    const existing = inventory.get(entry.path) ?? null;
    if (stableCanonicalJson(comparable(existing)) !== stableCanonicalJson(entry.before === null ? null : { file_type: entry.before.file_type, mode: entry.before.mode, bytes: entry.before.bytes, sha256: entry.before.sha256 })) throw new Error(`terminal workspace delta before metadata mismatch: ${entry.path}`);
    if ((entry.change_type === "addition") !== (existing === null) || (entry.change_type === "deletion") !== (entry.after === null)) throw new Error(`terminal workspace delta change type mismatch: ${entry.path}`);
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
  const terminal = [...inventory.values()].sort((left, right) => left.path.localeCompare(right.path));
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
  if (expectedManagedAssetPaths && stableCanonicalJson(authority.managed_asset_paths) !== stableCanonicalJson([...new Set(expectedManagedAssetPaths)].sort((left, right) => left.localeCompare(right)))) throw new Error("terminal workspace managed asset inventory mismatch");
  const terminal = applyDelta(authority);
  if (authority.base_workspace_portable_digest !== inventoryDigest(authority.base_inventory)) throw new Error("terminal workspace base digest mismatch");
  if (authority.terminal_workspace_portable_digest !== inventoryDigest(terminal.inventory)) throw new Error("terminal workspace terminal digest mismatch");
  if (authority.terminal_candidate_tree_digest !== inventoryDigest(candidateInventory(terminal.inventory, authority.managed_asset_paths))) throw new Error("terminal workspace candidate tree digest mismatch");
  const after = readStableFile(authorityPath, "terminal workspace authority", MAX_AUTHORITY_BYTES, { allowEmpty: false });
  assertStableFileEvidence(file, after, "terminal workspace authority");
  return { authority, file, terminal };
}

function assertFreshOutputRoot(outputRoot) {
  const output = resolve(outputRoot);
  assertNoSymlinkSegments(dirname(output), "terminal candidate output parent");
  if (existsSync(output)) throw new Error("terminal candidate output root must be fresh");
  mkdirSync(output, { recursive: false, mode: 0o700 });
  return output;
}

export function materializeTerminalCandidateFromVerifiedAuthority({ verified, materializedCaseRoot, outputRoot }) {
  const output = assertFreshOutputRoot(outputRoot);
  const baseRoot = resolve(materializedCaseRoot);
  const managed = new Set(verified.authority.managed_asset_paths);
  const baseByPath = new Map(verified.authority.base_inventory.map((entry) => [entry.path, entry]));
  const deltaByPath = new Map(verified.authority.delta_inventory.map((entry) => [entry.path, entry]));
  const candidate = candidateInventory(verified.terminal.inventory, verified.authority.managed_asset_paths);
  try {
    for (const entry of candidate) {
      const path = assertTerminalWorkspaceRelativePath(entry.path, "terminal candidate path");
      if (managed.has(path)) throw new Error("terminal candidate includes a managed asset");
      const destination = resolve(output, path);
      if (!destination.startsWith(`${output}${sep}`)) throw new Error("terminal candidate path escapes output root");
      if (entry.file_type === "directory") {
        mkdirSync(destination, { recursive: true, mode: 0o700 });
        continue;
      }
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      const changed = deltaByPath.get(path);
      let bytes;
      if (changed?.after?.file_type === "regular_file") bytes = verified.terminal.contents.get(path);
      else {
        const base = baseByPath.get(path);
        if (!base || base.file_type !== "regular_file") throw new Error(`terminal candidate base content is unavailable: ${path}`);
        const source = resolve(baseRoot, path);
        assertNoSymlinkSegments(source, `terminal candidate base ${path}`);
        const status = lstatSync(source);
        if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) throw new Error(`terminal candidate base is not a standalone regular file: ${path}`);
        bytes = readFileSync(source);
        if (bytes.length !== base.bytes || sha256(bytes) !== base.sha256 || modeOf(status) !== base.mode) throw new Error(`terminal candidate base identity mismatch: ${path}`);
      }
      writeFileSync(destination, bytes, { flag: "wx", mode: 0o444 });
      chmodSync(destination, 0o444);
    }
    const directories = [output, ...readdirDirectories(output)].sort((left, right) => right.length - left.length);
    for (const directory of directories) chmodSync(directory, 0o555);
    const reconstructed = captureTerminalWorkspaceInventory(output);
    const expected = candidate.map((entry) => ({ ...entry, mode: entry.file_type === "regular_file" ? "0444" : "0555" }));
    if (inventoryDigest(reconstructed.inventory) !== inventoryDigest(expected)) throw new Error("terminal candidate reconstruction mismatch");
    return { output_root: realpathSync(output), terminal_workspace_tree_digest: verified.authority.terminal_candidate_tree_digest };
  } catch (error) {
    throw error;
  }
}

function readdirDirectories(root) {
  const directories = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(directory, entry.name);
      directories.push(path);
      visit(path);
    }
  };
  visit(root);
  return directories;
}
