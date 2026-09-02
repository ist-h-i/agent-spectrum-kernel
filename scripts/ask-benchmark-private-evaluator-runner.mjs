import * as assertStrict from "node:assert/strict";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";
import * as vm from "node:vm";

const VIRTUAL_ROOT = "/ask-verified-authority";
const PRIVATE_MODULE_PATH = "private/hidden-evaluator.mjs";
const SEALED_FILE_MODE = 0o444;
const SEALED_DIRECTORY_MODE = 0o555;
const completedBarriers = new Set();
const ALLOWED_BUILTINS = new Map([
  ["node:assert/strict", assertStrict],
  ["node:child_process", childProcess],
  ["node:crypto", crypto],
  ["node:fs", fs],
  ["node:http", http],
  ["node:https", https],
  ["node:net", net],
  ["node:os", os],
  ["node:path", path],
  ["node:url", url],
]);

function sha256(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalDigest(value) {
  return sha256(Buffer.from(stableCanonicalJson(value)));
}

function fail(message, code = "ERR_VERIFIED_AUTHORITY") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function portablePath(value, label) {
  const segments = typeof value === "string" ? value.split("/") : [];
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes(":") || value.includes("\0") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.normalize(value) !== value || segments.some((segment) => segment === "" || segment === "." || segment === "..")) fail(`${label} is not a portable relative path`);
  return value;
}

function waitForFile(file, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  const waitArray = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) fail(`${label} timed out`, "ERR_AUTHORITY_BARRIER_TIMEOUT");
    Atomics.wait(waitArray, 0, 0, 5);
  }
}

function barrierMatches(barrier, stage, kind, relativePath) {
  return barrier
    && barrier.run_index === barrier.current_run_index
    && barrier.stage === stage
    && barrier.authority_kind === kind
    && barrier.path === relativePath;
}

function withBarrier(barrier, stage, kind, relativePath, operation) {
  if (!barrierMatches(barrier, stage, kind, relativePath)) return operation();
  const prefix = path.resolve(barrier.directory, `${barrier.run_index}-${stage}-${kind}-${sha256(Buffer.from(relativePath)).slice(7, 19)}`);
  if (completedBarriers.has(prefix)) return operation();
  completedBarriers.add(prefix);
  fs.writeFileSync(`${prefix}.ready`, "ready\n", { flag: "wx" });
  waitForFile(`${prefix}.continue`, "authority race continue barrier");
  const result = operation();
  fs.writeFileSync(`${prefix}.observed`, "observed\n", { flag: "wx" });
  waitForFile(`${prefix}.restored`, "authority race restore barrier");
  return result;
}

function parsePayload() {
  const bytes = fs.readFileSync(0);
  if (bytes.length === 0 || bytes.length > 256 * 1024 * 1024) fail("verified authority payload size is invalid");
  let payload;
  try { payload = JSON.parse(bytes.toString("utf8")); }
  catch { fail("verified authority payload is invalid JSON"); }
  if (payload?.schema_version !== "1.0.0" || payload?.program !== "adaptive_ask_in_memory_evaluator_authority") fail("verified authority payload contract is invalid");
  if (payload.payload_digest !== canonicalDigest(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "payload_digest")))) fail("verified authority payload digest is invalid");
  return payload;
}

function virtualRootFor(kind) {
  return `${VIRTUAL_ROOT}/${kind.replaceAll("_", "-")}`;
}

function buildVirtualAuthority(payload) {
  const nodes = new Map();
  const roots = new Map();
  const inodeByPath = new Map();
  let nextInode = 10_000;
  const addNode = (absolute, node) => {
    if (nodes.has(absolute)) fail(`duplicate virtual authority path: ${absolute}`);
    nodes.set(absolute, node);
    inodeByPath.set(absolute, nextInode++);
  };
  for (const authority of payload.authority_roots ?? []) {
    if (!/^[a-z][a-z0-9_]*$/u.test(authority.kind ?? "")) fail("virtual authority kind is invalid");
    const root = virtualRootFor(authority.kind);
    if (roots.has(authority.kind)) fail(`duplicate virtual authority root: ${authority.kind}`);
    roots.set(authority.kind, { virtual: root, helper: authority.helper_root ?? null });
    if (authority.root_mode !== SEALED_DIRECTORY_MODE) fail(`${authority.kind} authority root mode is not sealed`);
    addNode(root, { kind: authority.kind, relativePath: "", file_type: "directory", mode: authority.root_mode, bytes: null, sha256: null, content: null });
    const paths = [];
    for (const entry of authority.entries ?? []) {
      portablePath(entry.path, `${authority.kind} authority path`);
      paths.push(entry.path);
      const absolute = path.resolve(root, entry.path);
      if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) fail(`${authority.kind} authority path escapes the virtual root`);
      let content = null;
      if (entry.file_type === "file") {
        content = Buffer.from(entry.content_base64 ?? "", "base64");
        if (entry.mode !== SEALED_FILE_MODE || content.toString("base64") !== entry.content_base64) fail(`${authority.kind} authority file contract is invalid: ${entry.path}`);
        withBarrier(payload.barrier, "before_authority_map_validation", authority.kind, entry.path, () => {
          if (content.length !== entry.bytes || sha256(content) !== entry.sha256) fail(`${authority.kind} authority bytes are invalid: ${entry.path}`);
        });
      } else if (entry.file_type !== "directory" || entry.mode !== SEALED_DIRECTORY_MODE || entry.bytes !== null || entry.sha256 !== null || entry.content_base64 !== undefined) fail(`${authority.kind} authority entry is invalid: ${entry.path}`);
      addNode(absolute, { ...entry, kind: authority.kind, relativePath: entry.path, content });
    }
    if (new Set(paths).size !== paths.length || stableCanonicalJson(paths) !== stableCanonicalJson([...paths].sort())) fail(`${authority.kind} authority inventory is not ordered and unique`);
    for (const relativePath of paths) {
      const parent = path.dirname(path.resolve(root, relativePath));
      const parentNode = nodes.get(parent);
      if (!parentNode || parentNode.kind !== authority.kind || parentNode.file_type !== "directory") fail(`${authority.kind} authority path has no sealed parent: ${relativePath}`);
    }
  }
  return { nodes, roots, inodeByPath };
}

function normalizeFsPath(value) {
  if (value instanceof URL) return url.fileURLToPath(value);
  if (Buffer.isBuffer(value)) return value.toString();
  return typeof value === "string" ? path.resolve(value) : value;
}

function virtualNode(authority, value) {
  const normalized = normalizeFsPath(value);
  return typeof normalized === "string" ? authority.nodes.get(normalized) ?? null : null;
}

function virtualStats(authority, absolute, node) {
  const file = node.file_type === "file";
  const observableMode = node.original_mode ?? node.mode;
  return {
    dev: 1,
    ino: authority.inodeByPath.get(absolute),
    mode: (file ? 0o100000 : 0o040000) | observableMode,
    nlink: 1,
    size: file ? node.bytes : 0,
    mtimeMs: 0,
    ctimeMs: 0,
    isFile: () => file,
    isDirectory: () => !file,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
  };
}

function installOriginalWorkspaceModes(authority) {
  const originalRoot = authority.roots.get("original_workspace_authority")?.virtual;
  if (!originalRoot) fail("original workspace authority root is missing");
  const authorityNode = authority.nodes.get(path.resolve(originalRoot, "original-workspace-authority.json"));
  const diffNode = authority.nodes.get(path.resolve(originalRoot, "repository-diff-artifact.json"));
  if (!authorityNode?.content || !diffNode?.content) fail("original workspace authority artifacts are missing");
  let originalWorkspaceAuthority;
  let repositoryDiffArtifact;
  try {
    originalWorkspaceAuthority = JSON.parse(authorityNode.content.toString("utf8"));
    repositoryDiffArtifact = JSON.parse(diffNode.content.toString("utf8"));
  } catch { fail("original workspace authority payload is invalid JSON"); }

  const { authority_digest: authorityDigest, authority_bytes: authorityBytes, ...authorityClosure } = originalWorkspaceAuthority;
  if (authorityDigest !== canonicalDigest(authorityClosure) || authorityBytes !== (Buffer.byteLength(stableCanonicalJson(authorityClosure)) || 1)) fail("original workspace authority identity is invalid");
  if (repositoryDiffArtifact.artifact_digest !== canonicalDigest(repositoryDiffArtifact.diff_entries)
    || repositoryDiffArtifact.artifact_bytes !== (Buffer.byteLength(stableCanonicalJson(repositoryDiffArtifact.diff_entries)) || 1)
    || stableCanonicalJson(repositoryDiffArtifact.diff_entries) !== stableCanonicalJson(originalWorkspaceAuthority.diff_entries)
    || originalWorkspaceAuthority.repository_diff_artifact?.digest !== repositoryDiffArtifact.artifact_digest
    || originalWorkspaceAuthority.repository_diff_artifact?.bytes !== repositoryDiffArtifact.artifact_bytes) fail("repository diff artifact identity is invalid");

  for (const [kind, inventoryField, digestField] of [
    ["frozen", "frozen_inventory", "frozen_workspace_portable_digest"],
    ["candidate", "candidate_inventory", "candidate_workspace_portable_digest"],
  ]) {
    const root = authority.roots.get(kind)?.virtual;
    const inventory = originalWorkspaceAuthority[inventoryField];
    if (!root || !Array.isArray(inventory) || originalWorkspaceAuthority[digestField] !== canonicalDigest(inventory)) fail(`${kind} original workspace inventory identity is invalid`);
    const sourceNodes = [...authority.nodes.values()].filter((node) => node.kind === kind && node.relativePath !== "");
    if (sourceNodes.length !== inventory.length) fail(`${kind} original workspace inventory is not closed`);
    const seen = new Set();
    for (const entry of inventory) {
      const relativePath = portablePath(entry.path, `${kind} original workspace path`);
      if (seen.has(relativePath) || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) fail(`${kind} original workspace mode authority is invalid`);
      seen.add(relativePath);
      const node = authority.nodes.get(path.resolve(root, relativePath));
      if (!node || node.kind !== kind || node.relativePath !== relativePath || node.file_type !== entry.file_type || node.bytes !== entry.bytes || node.sha256 !== entry.sha256) fail(`${kind} original workspace inventory is detached at ${relativePath}`);
      node.original_mode = entry.mode;
    }
  }
  return { originalWorkspaceAuthority, repositoryDiffArtifact };
}

function readEncoding(options) {
  if (typeof options === "string") return options;
  return options?.encoding ?? null;
}

function virtualFsNamespace(authority, barrier) {
  const descriptors = new Map();
  let nextDescriptor = 50_000;
  const ensureVirtualRead = (value, label) => {
    const absolute = normalizeFsPath(value);
    const node = virtualNode(authority, absolute);
    if (!node || node.file_type !== "file") fail(`${label} is not a virtual regular file: ${absolute}`, "ENOENT");
    return { absolute, node };
  };
  const overrides = {
    existsSync(value) {
      const normalized = normalizeFsPath(value);
      if (typeof normalized === "string" && normalized.startsWith(VIRTUAL_ROOT)) return authority.nodes.has(normalized);
      return fs.existsSync(value);
    },
    lstatSync(value) {
      const absolute = normalizeFsPath(value);
      const node = virtualNode(authority, absolute);
      if (node) return virtualStats(authority, absolute, node);
      if (typeof absolute === "string" && absolute.startsWith(VIRTUAL_ROOT)) fail(`virtual authority path is missing: ${absolute}`, "ENOENT");
      return fs.lstatSync(value);
    },
    statSync(value) { return overrides.lstatSync(value); },
    realpathSync(value, options) {
      const absolute = normalizeFsPath(value);
      if (typeof absolute === "string" && absolute.startsWith(VIRTUAL_ROOT)) {
        if (!authority.nodes.has(absolute)) fail(`virtual authority path is missing: ${absolute}`, "ENOENT");
        return readEncoding(options) === "buffer" ? Buffer.from(absolute) : absolute;
      }
      return fs.realpathSync(value, options);
    },
    readdirSync(value, options) {
      const absolute = normalizeFsPath(value);
      const node = virtualNode(authority, absolute);
      if (node) {
        if (node.file_type !== "directory") fail(`virtual authority path is not a directory: ${absolute}`, "ENOTDIR");
        const prefix = `${absolute}${path.sep}`;
        const children = [...authority.nodes.entries()].filter(([candidate]) => candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes(path.sep)).sort(([left], [right]) => left.localeCompare(right));
        if (options?.withFileTypes) return children.map(([candidate, child]) => ({ name: path.basename(candidate), isFile: () => child.file_type === "file", isDirectory: () => child.file_type === "directory", isSymbolicLink: () => false }));
        return children.map(([candidate]) => path.basename(candidate));
      }
      if (typeof absolute === "string" && absolute.startsWith(VIRTUAL_ROOT)) fail(`virtual authority directory is missing: ${absolute}`, "ENOENT");
      return fs.readdirSync(value, options);
    },
    readFileSync(value, options) {
      if (typeof value === "number" && descriptors.has(value)) {
        const bytes = Buffer.from(descriptors.get(value).node.content);
        const encoding = readEncoding(options);
        return encoding ? bytes.toString(encoding) : bytes;
      }
      const absolute = normalizeFsPath(value);
      const node = virtualNode(authority, absolute);
      if (node) {
        if (node.file_type !== "file") fail(`virtual authority path is not a file: ${absolute}`, "EISDIR");
        const bytes = withBarrier(barrier, "before_authority_read", node.kind, node.relativePath, () => Buffer.from(node.content));
        const encoding = readEncoding(options);
        return encoding ? bytes.toString(encoding) : bytes;
      }
      if (typeof absolute === "string" && absolute.startsWith(VIRTUAL_ROOT)) fail(`virtual authority file is missing: ${absolute}`, "ENOENT");
      return fs.readFileSync(value, options);
    },
    openSync(value, flags, mode) {
      const absolute = normalizeFsPath(value);
      const node = virtualNode(authority, absolute);
      if (node) {
        const flagText = typeof flags === "string" ? flags : null;
        const writeMask = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND;
        if (node.file_type !== "file" || (flagText ? flagText !== "r" && flagText !== "rs" : (flags & writeMask) !== 0)) fail(`virtual authority is read-only: ${absolute}`, "EROFS");
        const descriptor = nextDescriptor++;
        descriptors.set(descriptor, { absolute, node, offset: 0 });
        return descriptor;
      }
      if (typeof absolute === "string" && absolute.startsWith(VIRTUAL_ROOT)) fail(`virtual authority file is missing: ${absolute}`, "ENOENT");
      return fs.openSync(value, flags, mode);
    },
    fstatSync(descriptor) {
      const opened = descriptors.get(descriptor);
      return opened ? virtualStats(authority, opened.absolute, opened.node) : fs.fstatSync(descriptor);
    },
    readSync(descriptor, buffer, offset, length, position) {
      const opened = descriptors.get(descriptor);
      if (!opened) return fs.readSync(descriptor, buffer, offset, length, position);
      const start = position === null || position === undefined ? opened.offset : position;
      const count = Math.max(0, Math.min(length, opened.node.content.length - start));
      opened.node.content.copy(buffer, offset, start, start + count);
      if (position === null || position === undefined) opened.offset += count;
      return count;
    },
    closeSync(descriptor) {
      if (descriptors.delete(descriptor)) return;
      return fs.closeSync(descriptor);
    },
  };
  for (const name of ["writeFileSync", "appendFileSync", "renameSync", "rmSync", "rmdirSync", "unlinkSync", "mkdirSync", "chmodSync", "chownSync", "truncateSync", "copyFileSync", "cpSync", "symlinkSync", "linkSync"]) {
    overrides[name] = (...args) => {
      const target = normalizeFsPath(args[0]);
      if (typeof target === "string" && target.startsWith(VIRTUAL_ROOT)) fail(`virtual authority is read-only: ${target}`, "EROFS");
      return fs[name](...args);
    };
  }
  overrides.realpathSync.native = overrides.realpathSync;
  return { ...fs, ...overrides, default: { ...(fs.default ?? fs), ...overrides } };
}

function virtualChildProcessNamespace(authority) {
  const translateOptions = (args) => {
    const copied = [...args];
    const index = copied.length - 1;
    const options = copied[index] && typeof copied[index] === "object" && !Array.isArray(copied[index]) ? { ...copied[index] } : null;
    if (!options?.cwd) return copied;
    const cwd = normalizeFsPath(options.cwd);
    for (const root of authority.roots.values()) {
      if (cwd === root.virtual || cwd.startsWith(`${root.virtual}${path.sep}`)) {
        if (!root.helper) fail(`helper filesystem access is not authorized for ${cwd}`);
        options.cwd = path.resolve(root.helper, path.relative(root.virtual, cwd));
        copied[index] = options;
        return copied;
      }
    }
    return copied;
  };
  const rejectVirtualArguments = (args, label) => {
    for (const value of args.flat(Infinity)) if (typeof value === "string" && value.includes(VIRTUAL_ROOT)) fail(`${label} cannot establish authority from the helper filesystem`);
  };
  const overrides = {
    spawn(...args) { rejectVirtualArguments(args.slice(0, -1), "spawn"); return childProcess.spawn(...translateOptions(args)); },
    spawnSync(...args) { rejectVirtualArguments(args.slice(0, -1), "spawnSync"); return childProcess.spawnSync(...translateOptions(args)); },
    execFileSync(...args) { rejectVirtualArguments(args, "execFileSync"); return childProcess.execFileSync(...args); },
    execSync(...args) { rejectVirtualArguments(args, "execSync"); return childProcess.execSync(...args); },
  };
  return { ...childProcess, ...overrides, default: { ...(childProcess.default ?? childProcess), ...overrides } };
}

async function execute(payload, authority) {
  const graph = payload.source_graph;
  if (graph?.graph_digest !== canonicalDigest(Object.fromEntries(Object.entries(graph).filter(([key]) => key !== "graph_digest")))) fail("in-memory source graph digest is invalid");
  if (payload.expected_authority?.source_graph_digest !== graph.graph_digest) fail("in-memory source graph is detached from immutable authority");
  const graphNodePaths = (graph.node_inventory ?? []).map(({ path: modulePath }) => portablePath(modulePath, "source graph node path"));
  if (new Set(graphNodePaths).size !== graphNodePaths.length || stableCanonicalJson(graphNodePaths) !== stableCanonicalJson([...graphNodePaths].sort())) fail("in-memory source graph node inventory is not ordered and unique");
  const graphNodes = new Map((graph.node_inventory ?? []).map((entry) => [entry.path, entry]));
  const edges = graph.edge_inventory ?? [];
  const sortedEdges = [...edges].sort((left, right) => stableCanonicalJson(left).localeCompare(stableCanonicalJson(right)));
  if (stableCanonicalJson(edges) !== stableCanonicalJson(sortedEdges)) fail("in-memory source graph edge inventory is not ordered");
  for (const edge of edges) {
    const { edge_digest: edgeDigest, ...edgeBase } = edge;
    if (edgeDigest !== canonicalDigest(edgeBase)) fail("in-memory source graph edge digest is invalid");
    const ordinary = ["static_import", "export_from", "dynamic_import", "authority_read"].includes(edge.kind) && graphNodes.has(edge.from) && graphNodes.has(edge.to);
    const privateRuntime = edge.kind === "runtime_private_import" && graphNodes.has(edge.from) && edge.to === PRIVATE_MODULE_PATH;
    const privateEntry = edge.kind === "private_entry_import" && edge.from === PRIVATE_MODULE_PATH && graphNodes.has(edge.to);
    if (!ordinary && !privateRuntime && !privateEntry) fail("in-memory source graph edge escapes the closed graph");
  }
  const repositoryRoot = authority.roots.get("repository")?.virtual;
  const privateRoot = authority.roots.get("private_bundle")?.virtual;
  if (!repositoryRoot || !privateRoot) fail("in-memory evaluator roots are incomplete");
  const { originalWorkspaceAuthority, repositoryDiffArtifact } = installOriginalWorkspaceModes(authority);
  const privateManifestNode = authority.nodes.get(path.resolve(privateRoot, "private-evaluator-bundle.json"));
  if (!privateManifestNode || privateManifestNode.file_type !== "file") fail("private evaluator bundle manifest is missing from the verified authority");
  let privateManifest;
  try { privateManifest = JSON.parse(privateManifestNode.content.toString("utf8")); }
  catch { fail("private evaluator bundle manifest is invalid JSON"); }
  const hiddenAsset = (privateManifest.asset_inventory ?? []).find(({ role }) => role === "hidden_tests");
  if (!hiddenAsset || hiddenAsset.path !== payload.hidden_evaluator_path) fail("hidden evaluator path is detached from the private bundle manifest");
  const expectedPrivateModules = (privateManifest.asset_inventory ?? [])
    .filter(({ media_type: mediaType }) => mediaType === "text/javascript")
    .map((asset) => {
      const privateBundlePath = portablePath(asset.path, "private evaluator module asset path");
      const modulePath = privateBundlePath === payload.hidden_evaluator_path ? PRIVATE_MODULE_PATH : `private/${privateBundlePath}`;
      portablePath(modulePath, "private evaluator virtual module path");
      return { modulePath, privateBundlePath, asset };
    })
    .sort((left, right) => left.modulePath.localeCompare(right.modulePath));
  if (!expectedPrivateModules.some(({ modulePath }) => modulePath === PRIVATE_MODULE_PATH)) fail("hidden evaluator is absent from the private module inventory");
  if (new Set(expectedPrivateModules.map(({ modulePath }) => modulePath)).size !== expectedPrivateModules.length) fail("private evaluator module paths collide");
  const expectedPrivateModuleByPath = new Map(expectedPrivateModules.map((entry) => [entry.modulePath, entry]));
  const privateModuleAuthorityByPath = new Map();
  const privateModulePathByAuthority = new Map();
  const moduleSources = new Map();
  for (const entry of payload.modules ?? []) {
    portablePath(entry.path, "in-memory module path");
    if (moduleSources.has(entry.path)) fail(`duplicate in-memory module path: ${entry.path}`);
    const bytes = Buffer.from(entry.source_base64 ?? "", "base64");
    if (bytes.toString("base64") !== entry.source_base64 || bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) fail(`in-memory module bytes are invalid: ${entry.path}`);
    if (entry.private_bundle_path !== undefined) {
      const privateBundlePath = portablePath(entry.private_bundle_path, "in-memory private module authority path");
      const expected = expectedPrivateModuleByPath.get(entry.path);
      if (!expected || expected.privateBundlePath !== privateBundlePath || expected.asset.bytes !== entry.bytes || expected.asset.sha256 !== entry.sha256) fail(`in-memory private module is outside the verified bundle manifest: ${entry.path}`);
      const privateNode = authority.nodes.get(path.resolve(privateRoot, privateBundlePath));
      if (!privateNode || privateNode.file_type !== "file" || privateNode.bytes !== entry.bytes || privateNode.sha256 !== entry.sha256 || Buffer.compare(privateNode.content, bytes) !== 0) fail(`in-memory private module is detached from private byte authority: ${entry.path}`);
      privateModuleAuthorityByPath.set(entry.path, privateBundlePath);
      privateModulePathByAuthority.set(privateBundlePath, entry.path);
    } else {
      const node = graphNodes.get(entry.path);
      if (!node || node.file_type !== "module" || node.bytes !== entry.bytes || node.sha256 !== entry.sha256) fail(`in-memory module is outside the verified source graph: ${entry.path}`);
      const repositoryNode = authority.nodes.get(path.resolve(repositoryRoot, entry.path));
      if (!repositoryNode || repositoryNode.file_type !== "file" || repositoryNode.bytes !== entry.bytes || repositoryNode.sha256 !== entry.sha256 || Buffer.compare(repositoryNode.content, bytes) !== 0) fail(`in-memory module is detached from repository authority: ${entry.path}`);
    }
    moduleSources.set(entry.path, bytes.toString("utf8"));
  }
  const expectedRepositoryModulePaths = [...graphNodes.values()].filter(({ file_type }) => file_type === "module").map(({ path: modulePath }) => modulePath).sort();
  const actualRepositoryModulePaths = [...moduleSources.keys()].filter((modulePath) => !privateModuleAuthorityByPath.has(modulePath)).sort();
  const actualPrivateModulePaths = [...privateModuleAuthorityByPath.keys()].sort();
  if (stableCanonicalJson(actualRepositoryModulePaths) !== stableCanonicalJson(expectedRepositoryModulePaths)
    || stableCanonicalJson(actualPrivateModulePaths) !== stableCanonicalJson(expectedPrivateModules.map(({ modulePath }) => modulePath))) fail("in-memory module inventory is not closed");

  const context = vm.createContext({
    AbortController,
    AbortSignal,
    Atomics,
    Buffer,
    console,
    crypto: globalThis.crypto,
    performance,
    process,
    queueMicrotask,
    setImmediate,
    clearImmediate,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    SharedArrayBuffer,
    structuredClone,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
  });
  const fsNamespace = virtualFsNamespace(authority, payload.barrier);
  const childNamespace = virtualChildProcessNamespace(authority);
  const builtinNamespaces = new Map(ALLOWED_BUILTINS);
  builtinNamespaces.set("node:fs", fsNamespace);
  builtinNamespaces.set("node:child_process", childNamespace);
  const moduleCache = new Map();
  const builtinCache = new Map();
  const identifierForPath = (modulePath) => privateModuleAuthorityByPath.has(modulePath)
    ? url.pathToFileURL(path.resolve(privateRoot, privateModuleAuthorityByPath.get(modulePath))).href
    : url.pathToFileURL(path.resolve(repositoryRoot, modulePath)).href;
  const pathForIdentifier = (identifier) => {
    const absolute = url.fileURLToPath(identifier);
    if (absolute.startsWith(`${privateRoot}${path.sep}`)) {
      const privateBundlePath = path.relative(privateRoot, absolute).split(path.sep).join("/");
      const modulePath = privateModulePathByAuthority.get(privateBundlePath);
      if (modulePath) return modulePath;
      fail(`module identifier escapes verified private module authority: ${identifier}`);
    }
    if (absolute.startsWith(`${repositoryRoot}${path.sep}`)) return path.relative(repositoryRoot, absolute).split(path.sep).join("/");
    fail(`module identifier escapes verified authority: ${identifier}`);
  };
  const edgeAllowed = (from, to, specifier, dynamic) => {
    const fromPrivate = privateModuleAuthorityByPath.has(from);
    const toPrivate = privateModuleAuthorityByPath.has(to);
    if (fromPrivate || toPrivate) {
      if (fromPrivate && toPrivate) return specifier.startsWith("./") || specifier.startsWith("../");
      if (from === PRIVATE_MODULE_PATH && !toPrivate) return dynamic && edges.some((edge) => edge.from === from && edge.to === to && edge.kind === "private_entry_import");
      return false;
    }
    return edges.some((edge) => {
      if (edge.from !== from || edge.to !== to) return false;
      if (dynamic) return edge.kind === "dynamic_import";
      return ["static_import", "export_from"].includes(edge.kind) && edge.specifier === specifier;
    });
  };
  const syntheticBuiltin = (specifier) => {
    if (builtinCache.has(specifier)) return builtinCache.get(specifier);
    const namespace = builtinNamespaces.get(specifier);
    if (!namespace) fail(`module requests an unapproved builtin: ${specifier}`);
    const names = Object.keys(namespace);
    const module = new vm.SyntheticModule(names, function initialize() { for (const name of names) this.setExport(name, namespace[name]); }, { context, identifier: specifier });
    builtinCache.set(specifier, module);
    return module;
  };
  const sourceModule = (modulePath) => {
    if (moduleCache.has(modulePath)) return moduleCache.get(modulePath);
    const source = moduleSources.get(modulePath);
    if (source === undefined) fail(`module is outside the verified byte map: ${modulePath}`);
    const privateBundlePath = privateModuleAuthorityByPath.get(modulePath);
    const kind = privateBundlePath ? "private_bundle" : "repository";
    const relativePath = privateBundlePath ?? modulePath;
    const module = withBarrier(payload.barrier, "before_module_link", kind, relativePath, () => new vm.SourceTextModule(source, {
      context,
      identifier: identifierForPath(modulePath),
      initializeImportMeta(meta, current) { meta.url = current.identifier; },
      importModuleDynamically: async (specifier, current) => {
        const target = resolveModule(specifier, current, true);
        if (target.status === "unlinked") await target.link(linker);
        if (target.status === "linked") await target.evaluate();
        return target;
      },
    }));
    moduleCache.set(modulePath, module);
    return module;
  };
  const resolveModule = (specifier, referencingModule, dynamic) => {
    if (specifier.startsWith("node:")) return syntheticBuiltin(specifier);
    const from = pathForIdentifier(referencingModule.identifier);
    const targetIdentifier = specifier.startsWith("file:") ? specifier : new URL(specifier, referencingModule.identifier).href;
    const to = pathForIdentifier(targetIdentifier);
    if (!edgeAllowed(from, to, specifier, dynamic)) fail(`module resolution is outside the verified dependency edge: ${from} -> ${to}`);
    return sourceModule(to);
  };
  const linker = (specifier, referencingModule) => resolveModule(specifier, referencingModule, false);
  const hidden = sourceModule(PRIVATE_MODULE_PATH);
  await hidden.link(linker);
  await hidden.evaluate();
  if (typeof hidden.namespace.evaluateCandidateSafe !== "function") fail("hidden evaluator does not export evaluateCandidateSafe");
  const normalizedBytes = Buffer.from(payload.normalized_result.source_base64 ?? "", "base64");
  if (normalizedBytes.length !== payload.normalized_result.bytes || sha256(normalizedBytes) !== payload.normalized_result.sha256) fail("normalized result verified-byte binding is invalid");
  let normalized;
  try { normalized = JSON.parse(normalizedBytes.toString("utf8")); }
  catch { fail("normalized result verified bytes are invalid JSON"); }
  const normalizedLineage = normalized?.lineage;
  if (repositoryDiffArtifact.run_instance_id !== normalizedLineage?.run_instance_id
    || repositoryDiffArtifact.case_id !== normalizedLineage?.case_id
    || repositoryDiffArtifact.attempt !== normalizedLineage?.attempt) fail("repository diff artifact lineage is detached from the normalized result");
  if (repositoryDiffArtifact.frozen_workspace_tree_digest !== originalWorkspaceAuthority.frozen_workspace_portable_digest
    || repositoryDiffArtifact.candidate_workspace_tree_digest !== originalWorkspaceAuthority.candidate_workspace_portable_digest
    || stableCanonicalJson(repositoryDiffArtifact.candidate_authority) !== stableCanonicalJson(originalWorkspaceAuthority.candidate_authority)) fail("repository diff artifact workspace authority is detached from the original workspace authority");
  const fragment = await hidden.namespace.evaluateCandidateSafe({
    repositoryRoot,
    frozenWorkspace: authority.roots.get("frozen")?.virtual,
    candidateWorkspace: authority.roots.get("candidate")?.virtual,
    normalizedResult: normalized,
    evaluationInputEvidenceRoot: authority.roots.get("evidence")?.virtual,
    evaluatorAuthority: payload.expected_authority,
    originalWorkspaceAuthority,
    repositoryDiffArtifact,
  });
  process.stdout.write(`${JSON.stringify(fragment)}\n`);
}

try {
  if (typeof vm.SourceTextModule !== "function" || typeof vm.SyntheticModule !== "function") fail("Node vm module support is unavailable");
  const payload = parsePayload();
  if (payload.barrier) payload.barrier.current_run_index = payload.run_index;
  const authority = buildVirtualAuthority(payload);
  await execute(payload, authority);
} catch (error) {
  process.stderr.write(`private evaluator runner failed: ${error.message}\n`);
  process.exitCode = 1;
}
