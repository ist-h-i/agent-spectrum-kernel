// Exploratory user-repository preparation. This module never starts Codex.
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { devNull, release } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { buildAgentsBlock, coreImmutableAssetKind, CORE_OWNED_IMMUTABLE_ASSETS, MANAGED_START, MANAGED_END } from "./installer-lifecycle.mjs";
import { skillAssets } from "./skill-assets.mjs";

const SOURCE = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const CORE_STATE = ".agent-spectrum-kernel/install-state.json";
const CODEX_STATE = ".agent-spectrum-kernel/codex-install-state.json";
const SUPPLEMENT = "docs/mac-ask-full-reference-supplement.json";
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const FILE_LIMIT = 32 * 1024 * 1024;
const TREE_LIMIT = 256 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/u;
const NAME = /^[a-z0-9][a-z0-9-]*$/u;
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fail = reason => { throw new Error(reason); };
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

export const comparisonHash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** Returns the supplied safe, portable project-relative path, or throws. */
export function validateUserRelativePath(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024 || isAbsolute(path)
    || /[\\\u0000-\u001f\u007f]/u.test(path) || path.startsWith("-")
    || path.split("/").length > 64 || path.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
    fail("invalid_relative_path");
  }
  return path;
}

/** Instruction surfaces stay read-only even below an allowed source folder. */
export function isComparisonInstructionPath(path) {
  validateUserRelativePath(path);
  const parts = path.split("/");
  return ["AGENTS.md", "AGENTS.override.md", "CUSTOM_INSTRUCTIONS.md"].includes(parts.at(-1))
    || parts.some(part => part === ".agents" || part === ".agent-spectrum-kernel") || parts[0] === "skills";
}

function recognizableSecret(path) {
  const name = basename(path).toLowerCase();
  return name === ".env" || (name.startsWith(".env.") && ![".env.example", ".env.sample", ".env.template"].includes(name))
    || /^(?:auth|credentials?|tokens?|cookies?|secrets?)\.(?:json|jsonl|ya?ml|txt)$/u.test(name)
    || [".netrc", ".npmrc", ".pypirc", "id_rsa", "id_ed25519"].includes(name)
    || /\.(?:p12|pfx|key)$/u.test(name) || path.split("/").some(part => [".ssh", ".aws", ".codex"].includes(part.toLowerCase()));
}

function record(bytes, mode = "100644") {
  return { digest: comparisonHash(bytes), bytes: bytes.length, mode };
}

/** Regular-file inventory used by preparation and offline integrity checks. */
export function inventoryUserTree(root) {
  if (!isAbsolute(root) || realpathSync(root) !== root || !lstatSync(root).isDirectory()) fail("unsafe_inventory_root");
  const inventory = {};
  let total = 0, files = 0;
  function walk(path = "") {
    if (path.split("/").length > 64) fail("tree_depth_limit");
    for (const name of readdirSync(join(root, path)).sort()) {
      if (path === "" && name === ".git") continue;
      const child = path ? `${path}/${name}` : name;
      validateUserRelativePath(child);
      const stat = lstatSync(join(root, child));
      if (stat.isSymbolicLink()) fail(`unsupported_symlink:${child}`);
      if (stat.isDirectory()) walk(child);
      else if (stat.isFile()) {
        if (recognizableSecret(child)) fail(`recognizable_secret_file:${child}`);
        if (stat.nlink !== 1) fail(`unsupported_hard_link:${child}`);
        total += stat.size;
        files += 1;
        if (stat.size > FILE_LIMIT || total > TREE_LIMIT || files > 20000) fail("tree_size_limit");
        Object.defineProperty(inventory, child, { value: record(readFileSync(join(root, child)), stat.mode & 0o111 ? "100755" : "100644"), enumerable: true });
      } else fail(`unsupported_file_kind:${child}`);
    }
  }
  walk();
  return inventory;
}

/** Guard arm Git configuration/identity without invoking Git.
 * Index/objects/logs can change during ordinary staging and are not control
 * identity. Controller diffs use private baseline bytes, never the arm's index
 * or object store. This reads only bounded regular metadata. */
export function inventoryComparisonGitMetadata(root) {
  if (!isAbsolute(root) || realpathSync(root) !== root || !lstatSync(root).isDirectory()) fail("unsafe_git_metadata_root");
  const gitRoot = join(root, ".git"), stat = lstatSync(gitRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) fail("unsafe_git_metadata_directory");
  const inventory = {};
  let files = 0, total = 0;
  function present(path) {
    try { return lstatSync(join(root, path)); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  function regular(path) {
    const info = lstatSync(join(root, path));
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (process.getuid && info.uid !== process.getuid())) fail(`unsafe_git_metadata_file:${path}`);
    files += 1; total += info.size;
    if (info.size > 1024 * 1024 || total > 4 * 1024 * 1024 || files > 1024) fail("git_metadata_size_limit");
    Object.defineProperty(inventory, path, { value: record(readFileSync(join(root, path))), enumerable: true });
  }
  function directory(path, recursive = false, depth = 0) {
    const info = lstatSync(join(root, path));
    if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()) || depth > 32) fail(`unsafe_git_metadata_directory:${path}`);
    if (recursive) for (const name of readdirSync(join(root, path)).sort()) {
      if (!name || /[\\\u0000-\u001f\u007f]/u.test(name) || name === "." || name === "..") fail("unsafe_git_metadata_name");
      const child = `${path}/${name}`, childStat = lstatSync(join(root, child));
      if (childStat.isDirectory() && !childStat.isSymbolicLink()) directory(child, true, depth + 1);
      else regular(child);
    }
  }
  // Mutable Git storage has no frozen content hash, but every entry must
  // remain inside the independent copy. Raw lstat never follows a link or
  // opens an object/index/log file, including a dangling or hard-linked leaf.
  let storageEntries = 0;
  function storage(path, depth = 0) {
    if (depth > 32 || ++storageEntries > 100000) fail("git_storage_layout_limit");
    const info = lstatSync(join(root, path));
    if (info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid())) fail(`unsafe_git_storage_entry:${path}`);
    if (info.isDirectory()) {
      const names = readdirSync(join(root, path));
      if (names.length > 100000 - storageEntries) fail("git_storage_layout_limit");
      for (const name of names.sort()) {
        if (!name || /[\\\u0000-\u001f\u007f]/u.test(name) || name === "." || name === "..") fail("unsafe_git_metadata_name");
        storage(`${path}/${name}`, depth + 1);
      }
    } else if (!info.isFile() || info.nlink !== 1) fail(`unsafe_git_storage_entry:${path}`);
  }
  // These arms were initialized as standalone repositories. Additional Git
  // layouts must never redirect the later diff to unaudited common config,
  // attributes or object stores. lstat also notices dangling symlinks without
  // reading their target. Check parent directories before nested controls.
  // https://git-scm.com/docs/gitrepository-layout
  for (const path of ["commondir", "gitdir", "config.worktree", "config.worktree.lock", "common",
    "worktrees", "modules", "reftable", "shallow", "shallow.lock"]) {
    if (present(`.git/${path}`)) fail(`unsupported_git_metadata_control:.git/${path}`);
  }
  directory(".git/objects");
  directory(".git/objects/info");
  directory(".git/objects/pack");
  for (const name of readdirSync(join(gitRoot, "objects"))) {
    if (/^[a-f0-9]{2}$/u.test(name)) directory(`.git/objects/${name}`);
  }
  directory(".git/info");
  for (const path of [".git/objects/info/alternates", ".git/objects/info/http-alternates", ".git/info/grafts", ".git/info/sparse-checkout"]) {
    if (present(path)) fail(`unsupported_git_metadata_control:${path}`);
  }
  storage(".git/objects");
  if (present(".git/logs")) {
    directory(".git/logs");
    storage(".git/logs");
  }
  // Index bytes and object/log contents can change through ordinary staging.
  // A link to an outside index still is not part of an independent repository.
  if (present(".git/index")) {
    const index = lstatSync(join(gitRoot, "index"));
    if (!index.isFile() || index.isSymbolicLink() || index.nlink !== 1 || (process.getuid && index.uid !== process.getuid())) fail("unsafe_git_metadata_file:.git/index");
    storage(".git/index");
  }
  for (const name of readdirSync(gitRoot)) {
    if (name === "index.lock" || /^sharedindex\.[a-f0-9]{40}(?:\.lock)?$/u.test(name)) {
      const path = `.git/${name}`, info = lstatSync(join(root, path));
      if (!info.isFile()) fail(`unsafe_git_storage_entry:${path}`);
      storage(path);
    }
  }
  regular(".git/config");
  regular(".git/HEAD");
  if (present(".git/refs")) directory(".git/refs", true);
  if (present(".git/packed-refs")) regular(".git/packed-refs");
  regular(".git/info/attributes");
  if (present(".git/info/exclude")) regular(".git/info/exclude");
  return inventory;
}

// These children receive no credential/config environment, and only Git and
// this Node runtime are called. No CLI discovery, authentication probe or model.
function childEnvironment() {
  return { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: devNull,
    GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1" };
}

function localChild(bin, args, cwd, input) {
  const result = spawnSync(bin, args, { cwd, env: childEnvironment(), input, shell: false,
    timeout: 120000, maxBuffer: TREE_LIMIT });
  if (result.error || result.signal || result.status !== 0) {
    // Never expose the environment or arbitrary Git stderr in a control record.
    fail(`local_preparation_failed:${basename(bin)}:${result.error?.code ?? result.signal ?? result.status}`);
  }
  return result.stdout;
}

function git(repo, args, input) {
  return localChild("git", ["--no-lazy-fetch", "-c", `core.hooksPath=${devNull}`, "-c", "core.fsmonitor=false", ...args], repo, input);
}

function readCommittedTree(repo, commit) {
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/u.test(commit)) fail("exact_commit_required");
  if (git(repo, ["rev-parse", "--show-toplevel"]).toString().trim() !== repo) fail("repository_root_required");
  if (git(repo, ["rev-parse", "--verify", `${commit}^{commit}`]).toString().trim() !== commit) fail("commit_identity_mismatch");
  const tree = new Map();
  let total = 0;
  let listing;
  const listingBytes = git(repo, ["ls-tree", "-rz", "--full-tree", commit]);
  try { listing = UTF8.decode(listingBytes); }
  catch { fail("unsupported_non_utf8_git_paths"); }
  for (const entry of listing.split("\0").filter(Boolean)) {
    const match = /^(\d{6}) (\w+) ([a-f0-9]{40})\t(.+)$/u.exec(entry);
    if (!match) fail("invalid_git_tree_entry");
    const [, mode, type, objectId, path] = match;
    validateUserRelativePath(path);
    if (type !== "blob" || !["100644", "100755"].includes(mode)) fail(`unsupported_git_entry:${path}`);
    if (recognizableSecret(path)) fail(`recognizable_secret_file:${path}`);
    if ([".agents/runs/", ".agent-spectrum-kernel/runtime/", "ask-runtime/"].some(prefix => path.startsWith(prefix))) fail(`existing_runtime_records_not_supported:${path}`);
    if (tree.has(path)) fail("duplicate_git_tree_path");
    const bytes = git(repo, ["cat-file", "blob", objectId]);
    total += bytes.length;
    if (bytes.length > FILE_LIMIT || total > TREE_LIMIT || tree.size >= 20000) fail("committed_tree_size_limit");
    tree.set(path, { bytes, mode });
  }
  if (tree.size === 0) fail("empty_source_tree");
  return tree;
}

function readRegular(path, label, limit = 1024 * 1024, allowEmpty = false) {
  if (typeof path !== "string" || !isAbsolute(path) || realpathSync(path) !== path) fail(`unsafe_${label}_file`);
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) fail(`unsafe_${label}_file`);
  if (recognizableSecret(basename(path))) fail(`recognizable_secret_file:${label}`);
  if ((!allowEmpty && before.size === 0) || before.size > limit) fail(`invalid_${label}_size`);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) fail(`unsafe_${label}_file`);
    const value = readFileSync(fd), after = fstatSync(fd);
    if (value.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail(`unstable_${label}_file`);
    return value;
  } finally { closeSync(fd); }
}

function parseJson(bytes, label) {
  try { return parseJsonRejectDuplicateKeys(UTF8.decode(bytes)); }
  catch { fail(`invalid_${label}_json`); }
}

function validateCommand(command, tree) {
  if (!Array.isArray(command) || command.length < 3 || command[0] !== "node" || command[1] !== "--test") fail("unsupported_verification_command");
  for (const path of command.slice(2)) {
    validateUserRelativePath(path);
    if (!path.endsWith(".mjs") || /[*?\[\]{}]/u.test(path) || !tree.has(path)) fail("explicit_existing_mjs_tests_required");
  }
  if (new Set(command.slice(2)).size !== command.length - 2) fail("duplicate_verification_test");
  return command;
}

function validateRecipe(recipe, tree) {
  if (!plainObject(recipe) || Object.keys(recipe).some(key => !["command", "requirements"].includes(key))) fail("invalid_verification_recipe");
  validateCommand(recipe.command, tree);
  if (!Array.isArray(recipe.requirements)) fail("requirements_array_required");
  const ids = new Set();
  for (const item of recipe.requirements) {
    if (!plainObject(item) || Object.keys(item).some(key => !["id", "description", "command"].includes(key))
      || typeof item.id !== "string" || !NAME.test(item.id) || ids.has(item.id)
      || typeof item.description !== "string" || !item.description.trim()) fail("invalid_verification_requirement");
    if (item.id === "task-tests") fail("reserved_verification_requirement_id:task-tests");
    ids.add(item.id);
    if (item.command !== undefined) validateCommand(item.command, tree);
  }
  return recipe;
}

function blockIn(bytes) {
  const text = UTF8.decode(bytes);
  const starts = text.split(MANAGED_START).length - 1, ends = text.split(MANAGED_END).length - 1;
  if (starts === 0 && ends === 0) return null;
  if (starts !== 1 || ends !== 1 || text.indexOf(MANAGED_END) < text.indexOf(MANAGED_START)) fail("ambiguous_agents_markers");
  const start = bytes.indexOf(Buffer.from(MANAGED_START));
  const end = bytes.indexOf(Buffer.from(MANAGED_END)) + Buffer.byteLength(MANAGED_END);
  return { bytes: bytes.subarray(start, end), outside: Buffer.concat([bytes.subarray(0, start), bytes.subarray(end)]) };
}

function sourceDistribution() {
  const manifestBytes = readRegular(join(SOURCE, "manifest.json"), "manifest");
  const manifest = parseJson(manifestBytes, "manifest");
  const corePaths = [...new Set(["CUSTOM_INSTRUCTIONS.md", "schemas/review-signal-gate-map.json",
    ...CORE_OWNED_IMMUTABLE_ASSETS, ...skillAssets(SOURCE, manifest.skills).map(asset => asset.sourcePath)])].sort();
  const projection = buildCodexProjectionPlan({ profileName: "full" });
  const supplementBytes = readRegular(join(SOURCE, SUPPLEMENT), "supplement");
  const supplement = parseJson(supplementBytes, "supplement");
  const roles = new Set(["conditional_context_template", "example_fixture", "runtime_dependency", "contract_schema", "instruction_contract"]);
  if (supplement.kind !== "ask_full_reference_supplement_v1" || !Array.isArray(supplement.assets)) fail("invalid_reference_supplement");
  const extra = new Map();
  for (const asset of supplement.assets) {
    validateUserRelativePath(asset.path);
    if (!/^(?:docs|scripts|schemas)\//u.test(asset.path) || !roles.has(asset.role)
      || asset.disposition !== "include_exact_source_bytes" || extra.has(asset.path)) fail("invalid_reference_supplement_asset");
    // The old frozen manifest contributes classified paths only. Live source
    // bytes and new hashes identify this exploratory package independently.
    extra.set(asset.path, { bytes: readRegular(join(SOURCE, asset.path), "supplement_asset", FILE_LIMIT), role: asset.role });
  }
  const allPaths = [...new Set([...corePaths, ...projection.projectedManagedAssets.map(asset => asset.path), ...extra.keys()])].sort();
  return { manifest, corePaths, projection, extra, allPaths, supplementDigest: comparisonHash(supplementBytes) };
}

function skillRecordPath(path, item, prefix) {
  if (typeof item.skill !== "string" || !NAME.test(item.skill) || !path.startsWith(`${prefix}/${item.skill}/`)) return false;
  const suffix = path.slice(`${prefix}/${item.skill}/`.length);
  return suffix === "SKILL.md" || suffix.startsWith("references/");
}

function recognizedManagedFile(path, item, codex, distribution) {
  const kind = item?.kind;
  if (codex) {
    if (["codex_skill", "stale_codex_skill"].includes(kind)) return distribution.projection.projectedManagedAssets.some(asset => asset.path === path) && skillRecordPath(path, item, ".agents/skills");
    const live = distribution.projection.projectedManagedAssets.find(asset => asset.path === path);
    if (!live) return false;
    if (["codex_prompt", "stale_codex_prompt"].includes(kind)) return path === `.agents/prompts/${item.prompt}`;
    if (["codex_command", "stale_codex_command"].includes(kind)) return path === `.agents/commands/${item.command}`;
    if (["codex_runtime", "stale_codex_runtime"].includes(kind)) return typeof item.script === "string" && basename(path) === item.script;
    return ["codex_asset", "stale_codex_asset"].includes(kind) && item.asset === path;
  }
  if (["skill", "stale_skill"].includes(kind)) return distribution.corePaths.includes(path) && skillRecordPath(path, item, "skills");
  if (kind === "copy_paste_kernel") return path === "CUSTOM_INSTRUCTIONS.md";
  if (kind === "signal_registry") return path === "schemas/review-signal-gate-map.json";
  return coreImmutableAssetKind(path) === kind && item.asset === path;
}

function separateManagedAsk(tree, distribution) {
  const source = new Map(tree), removed = [], identities = [], owned = new Set();
  for (const path of tree.keys()) {
    if (path.startsWith(".agent-spectrum-kernel/") && (path.includes("in-progress") || /(?:^|\/)[^/]*state[^/]*$/u.test(path))
      && ![CORE_STATE, CODEX_STATE].includes(path)) fail(`unsupported_or_partial_install_state:${path}`);
    if (path === ".claude/settings.json" || path.startsWith(".claude/hooks/")) fail("claude_installation_not_supported");
  }
  const agents = source.get("AGENTS.md");
  const block = agents ? blockIn(agents.bytes) : null;
  if (block && !tree.has(CORE_STATE)) fail("unmanaged_ask_agents_block");
  if (agents && !tree.has(CORE_STATE)) {
    const canonicalBody = Buffer.from(UTF8.decode(readRegular(join(SOURCE, "AGENTS.md"), "canonical_agents")).trimEnd());
    if (agents.bytes.includes(canonicalBody)) fail("unmanaged_canonical_agents_body_cannot_separate_safely");
  }
  if (tree.has(CODEX_STATE) && !tree.has(CORE_STATE)) fail("codex_state_without_core");
  for (const statePath of [CORE_STATE, CODEX_STATE]) {
    if (!tree.has(statePath)) continue;
    const state = parseJson(tree.get(statePath).bytes, "install_state"), codex = statePath === CODEX_STATE;
    const expected = codex ? "agent-spectrum-codex-adapter" : "agent-spectrum-kernel";
    if (state.schema_version !== 3 || state.install_status !== "installed" || state.installer !== expected
      || state.adapter?.name !== expected || !plainObject(state.managed_files) || !plainObject(state.managed_blocks)
      || !plainObject(state.managed_partial_files) || Object.keys(state.managed_partial_files).length
      || !Array.isArray(state.managed_hooks) || state.managed_hooks.length
      || !Array.isArray(state.selected_skills) || state.selected_skills.some(skill => typeof skill !== "string" || !NAME.test(skill))) fail("unsupported_install_ownership");
    const expectedTarget = codex ? { kernel: "AGENTS.md", skills_root: ".agents/skills", prompts_root: ".agents/prompts", commands_root: ".agents/commands" }
      : { kernel: "AGENTS.md", copy_paste_kernel: "CUSTOM_INSTRUCTIONS.md", skills_root: "skills" };
    if (!plainObject(state.target) || Object.keys(state.target).length !== Object.keys(expectedTarget).length
      || Object.entries(expectedTarget).some(([key, value]) => state.target[key] !== value)) fail("install_state_target_mismatch");
    if (codex ? Object.keys(state.managed_blocks).length !== 0
      : Object.keys(state.managed_blocks).length !== 1 || !Object.hasOwn(state.managed_blocks, "AGENTS.md#agent-spectrum-kernel")) fail("unsupported_managed_blocks");
    if (!codex) {
      const item = state.managed_blocks["AGENTS.md#agent-spectrum-kernel"];
      if (!block || item.path !== "AGENTS.md" || item.marker !== "agent-spectrum-kernel" || !HASH.test(item.sha256)
        || item.canonical_sha256 !== item.sha256 || comparisonHash(block.bytes) !== `sha256:${item.sha256}`) fail("modified_or_missing_managed_agents_block");
    }
    for (const [path, item] of Object.entries(state.managed_files)) {
      validateUserRelativePath(path);
      if (!plainObject(item) || !recognizedManagedFile(path, item, codex, distribution) || !HASH.test(item.sha256)
        || item.canonical_sha256 !== item.sha256 || !tree.has(path)
        || comparisonHash(tree.get(path).bytes) !== `sha256:${item.sha256}` || owned.has(path)) fail(`modified_or_ambiguous_managed_file:${path}`);
      owned.add(path);
      removed.push({ path, digest: `sha256:${item.sha256}`, kind: item.kind, state: statePath });
      source.delete(path);
    }
    source.delete(statePath);
    removed.push({ path: statePath, digest: comparisonHash(tree.get(statePath).bytes), kind: "install_state" });
    identities.push({ state_path: statePath, source_version: typeof state.source?.version === "string" && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/u.test(state.source.version) ? state.source.version : "unknown",
      source_commit: typeof state.source?.git_revision === "string" && /^[a-f0-9]{40}$/u.test(state.source.git_revision) ? state.source.git_revision : "unknown",
      selected_profile: typeof state.selected_profile === "string" && NAME.test(state.selected_profile) ? state.selected_profile : "unknown",
      selected_skills: state.selected_skills, digest: comparisonHash(tree.get(statePath).bytes) });
  }
  if (block) {
    if (block.outside.length) source.set("AGENTS.md", { bytes: block.outside, mode: agents.mode });
    else source.delete("AGENTS.md");
    removed.push({ path: "AGENTS.md#agent-spectrum-kernel", digest: comparisonHash(block.bytes), kind: "managed_block" });
  }
  for (const path of distribution.allPaths) {
    // An unmanaged byte-identical file is still user-owned. Do not adopt it.
    if (source.has(path) || [...source.keys()].some(existing => existing.startsWith(`${path}/`) || path.startsWith(`${existing}/`))) {
      fail(`unmanaged_full_asset_collision:${path}`);
    }
  }
  return { source, removed, identities };
}

function writeNew(root, path, bytes, mode = "100644") {
  validateUserRelativePath(path);
  mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, path), bytes, { flag: "wx", mode: mode === "100755" ? 0o700 : 0o600 });
}

function appendKernel(userBytes, block) {
  return Buffer.concat([userBytes, userBytes.length ? Buffer.from("\n\n") : Buffer.alloc(0), block]);
}

export function prepareGitBaseline(root) {
  git(root, ["-c", "init.defaultBranch=ask-comparison", "init", "--quiet", "--template="]);
  git(root, ["config", "--local", "core.hooksPath", devNull]);
  git(root, ["config", "--local", "core.autocrlf", "false"]);
  git(root, ["config", "--local", "core.filemode", "true"]);
  git(root, ["config", "--local", "core.fsmonitor", "false"]);
  // New, local metadata prevents source attributes from normalizing the bytes
  // whose hashes the comparison records; it invokes no source Git filters.
  // .git is intentionally inaccessible through writeNew's project path API.
  mkdirSync(join(root, ".git/info"), { mode: 0o700 });
  writeFileSync(join(root, ".git/info/attributes"), "* -filter -text -ident -working-tree-encoding\n", { mode: 0o600 });
  git(root, ["add", "--force", "--all"]);
  git(root, ["-c", "user.name=ASK user comparison", "-c", "user.email=comparison@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "prepare independent ASK comparison baseline"]);
  return git(root, ["rev-parse", "HEAD"]).toString().trim();
}

function kernelCapability(inventory, config) {
  const primary = { implementation: "controlled-implementation", review: "review-router", investigation: "doubt-driven-development" }[config.task_class];
  const required = config.task_class === "trivial" ? [] : ["operating-mode-router", "skill-router", primary,
    config.task_class === "review" ? "review-ai-quality" : "test-first-verification"];
  const available = [];
  for (const path of Object.keys(inventory)) {
    const match = /^\.agents\/skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md$/u.exec(path);
    if (match) available.push({ name: match[1], origin: "preserved_project_custom_skill" });
  }
  for (const name of config.global_capabilities) available.push({ name, origin: "caller_declared_global_capability_unverified" });
  const missing = [...new Set(required)].filter(name => !available.some(item => item.name === name));
  return { status: missing.length ? "capability_missing" : "available", required: [...new Set(required)], available, missing };
}

function validateOptions(options) {
  if (!plainObject(options)) fail("options_object_required");
  const allowed = ["repo", "commit", "taskFile", "verificationFile", "output", "mutablePaths", "cliBin", "cliVersion", "model", "reasoning", "timeoutMs", "verificationTimeoutMs", "taskClass", "globalCapabilities", "globalAskPresence", "evidenceKind", "rerunOf"];
  if (Object.keys(options).some(key => !allowed.includes(key))) fail("unknown_preparation_option");
  for (const name of ["repo", "output"]) if (typeof options[name] !== "string" || !isAbsolute(options[name]) || resolve(options[name]) !== options[name]) fail(`absolute_${name}_required`);
  if (realpathSync(options.repo) !== options.repo || !lstatSync(options.repo).isDirectory()) fail("canonical_repository_root_required");
  if (existsSync(options.output)) fail("output_exists_use_new_run_directory");
  if (realpathSync(dirname(options.output)) !== dirname(options.output)) fail("canonical_existing_output_parent_required");
  for (const protectedRoot of [SOURCE, options.repo]) {
    if (options.output === protectedRoot || options.output.startsWith(`${protectedRoot}/`) || protectedRoot.startsWith(`${options.output}/`) || options.output === "/") fail("output_overlaps_source_repository");
  }
  const config = { cli_bin: options.cliBin ?? "codex", cli_version: options.cliVersion ?? null, model: options.model ?? null,
    reasoning: options.reasoning ?? null, timeout_ms: options.timeoutMs ?? 600000, verification_timeout_ms: options.verificationTimeoutMs ?? 60000,
    task_class: options.taskClass ?? "implementation", global_capabilities: options.globalCapabilities ?? [], global_ask_presence: options.globalAskPresence ?? "unknown",
    evidence_kind: options.evidenceKind ?? "observed", platform: `${process.platform}/${process.arch}`,
    node_version: process.version, os_release: release() };
  if (typeof config.cli_bin !== "string" || !(config.cli_bin === "codex" || isAbsolute(config.cli_bin)) || /[\u0000-\u001f\u007f]/u.test(config.cli_bin)) fail("invalid_cli_binary");
  for (const field of ["cli_version", "model", "reasoning"]) if (config[field] !== null && (typeof config[field] !== "string" || !config[field].trim() || /[\u0000-\u001f\u007f]/u.test(config[field]))) fail(`invalid_${field}`);
  for (const field of ["timeout_ms", "verification_timeout_ms"]) if (!Number.isSafeInteger(config[field]) || config[field] < 1 || config[field] > 86400000) fail(`invalid_${field}`);
  if (!["implementation", "trivial", "review", "investigation"].includes(config.task_class) || !["observed", "synthetic"].includes(config.evidence_kind)
    || !["unknown", "observed", "not_observed"].includes(config.global_ask_presence) || !Array.isArray(config.global_capabilities)
    || config.global_capabilities.some(name => typeof name !== "string" || !NAME.test(name)) || new Set(config.global_capabilities).size !== config.global_capabilities.length) fail("invalid_comparison_configuration");
  if (options.rerunOf !== undefined && options.rerunOf !== null && (typeof options.rerunOf !== "string" || !/^[a-f0-9-]{36}$/u.test(options.rerunOf))) fail("invalid_rerun_identity");
  if (!Array.isArray(options.mutablePaths) || !options.mutablePaths.length) fail("mutable_paths_required");
  const mutable = options.mutablePaths.map(path => {
    const clean = typeof path === "string" && path.endsWith("/") ? path.slice(0, -1) : path;
    validateUserRelativePath(clean);
    if (recognizableSecret(clean) || isComparisonInstructionPath(clean)) fail("instruction_assets_are_immutable");
    return path;
  });
  if (new Set(mutable).size !== mutable.length) fail("duplicate_mutable_path");
  return { config, mutable };
}

/** Creates one new durable run directory, with no model or CLI subprocess. */
export function prepareUserComparison(options = {}) {
  const { config, mutable } = validateOptions(options);
  const original = readCommittedTree(options.repo, options.commit);
  // Codex selects a non-empty AGENTS.override.md before AGENTS.md in the
  // same directory. Preserving it would hide K/F's canonical root kernel.
  // https://developers.openai.com/codex/guides/agents-md
  if (original.has("AGENTS.override.md") && UTF8.decode(original.get("AGENTS.override.md").bytes).trim()) {
    fail("root_agents_override_prevents_canonical_condition");
  }
  const taskBytes = readRegular(options.taskFile, "task");
  const taskText = UTF8.decode(taskBytes);
  const verificationBytes = readRegular(options.verificationFile, "verification");
  if (options.verificationFile.startsWith(`${options.repo}/`) && original.has(options.verificationFile.slice(options.repo.length + 1))) {
    fail("verification_recipe_is_committed_model_input_keep_it_external");
  }
  const recipe = validateRecipe(parseJson(verificationBytes, "verification"), original);
  const reporterBytes = readRegular(join(SOURCE, "scripts/ask-user-comparison-test-reporter.mjs"), "node_test_reporter");
  const testPaths = [...new Set([recipe.command, ...recipe.requirements.filter(item => item.command).map(item => item.command)].flatMap(command => command.slice(2)))];
  for (const mutablePath of mutable) {
    if (testPaths.some(path => mutablePath.endsWith("/") ? path.startsWith(mutablePath) : path === mutablePath)) fail("mutable_scope_overlaps_verification_test");
  }
  const distribution = sourceDistribution(), separated = separateManagedAsk(original, distribution);
  for (const path of testPaths) if (!separated.source.has(path)) fail("verification_test_is_managed_ask_asset");
  const root = options.output;
  const publicCommands = [...new Map([recipe.command, ...recipe.requirements.filter(item => item.command).map(item => item.command)].map(command => [JSON.stringify(command), command])).values()];
  const prompt = `${taskText}\n\nComparison task boundary:\nWork only in the current repository. Mutable paths: ${JSON.stringify(mutable)}.\nAll other files, including instruction assets and verification tests, are read-only.\nDo not read sibling condition directories, comparison controller records, private evaluator data, answers or global credential files.\nPublic independent verification commands (do not modify their tests):\n${publicCommands.map(command => JSON.stringify(command)).join("\n")}\nThis condition has one session and one attempt. Do not start nested Codex/model sessions, subagents or extra agent processes.\nDo not modify Git configuration, commit, reset or change branches.\nNo retries, installing dependencies, network publication or changes to global configuration are authorized by this task.\n`;
  mkdirSync(root, { mode: 0o700 });
  writeNew(root, "control/task.md", taskBytes);
  writeNew(root, "control/verification.json", verificationBytes);
  writeNew(root, "control/node-test-reporter.mjs", reporterBytes);
  writeNew(root, "inputs/prompt.md", Buffer.from(prompt));
  mkdirSync(join(root, "control/patch-workspaces"), { mode: 0o700 });
  const arms = {};
  const canonicalBytes = readRegular(join(SOURCE, "AGENTS.md"), "canonical_agents");
  const canonicalBlock = Buffer.from(buildAgentsBlock(UTF8.decode(canonicalBytes)));
  const customAgents = separated.source.get("AGENTS.md")?.bytes ?? Buffer.alloc(0);
  for (const [id, label] of [["plain", "P"], ["kernel_only", "K"], ["full_ask", "F"]]) {
    const path = `arms/${id}`, armRoot = join(root, path);
    mkdirSync(armRoot, { recursive: true, mode: 0o700 });
    for (const [file, value] of separated.source) writeNew(armRoot, file, value.bytes, value.mode);
    if (id === "kernel_only") {
      writeFileSync(join(armRoot, "AGENTS.md"), appendKernel(customAgents, canonicalBlock), { mode: 0o600 });
    }
    if (id === "full_ask") {
      const steps = [["install-kernel.mjs", ["--merge-agents"]], ["install-codex-adapter.mjs", ["--profile", "full"]]];
      for (const [script, args] of steps) {
        const log = localChild(process.execPath, [join(SOURCE, "scripts", script), "--target", armRoot, ...args], SOURCE);
        writeNew(root, `control/preparation-${script}.log`, log);
      }
      const installedCodexState = parseJson(readFileSync(join(armRoot, CODEX_STATE)), "new_codex_state");
      if (installedCodexState.projection_plan?.fingerprint !== distribution.projection.fingerprint) fail("full_source_changed_during_preparation");
      // The shared installer trims external whitespace during merging. Restore
      // the exact preserved user bytes while retaining its managed block/state.
      const installedBlock = blockIn(readFileSync(join(armRoot, "AGENTS.md")));
      if (!installedBlock) fail("full_kernel_block_missing");
      writeFileSync(join(armRoot, "AGENTS.md"), appendKernel(customAgents, Buffer.concat([installedBlock.bytes, Buffer.from("\n")])), { mode: 0o600 });
      for (const [file, value] of distribution.extra) {
        if (existsSync(join(armRoot, file))) {
          if (!readFileSync(join(armRoot, file)).equals(value.bytes)) fail(`live_supplement_collision:${file}`);
        } else writeNew(armRoot, file, value.bytes);
      }
    }
    const baseline = inventoryUserTree(armRoot);
    const assetPaths = id === "plain" ? [] : id === "kernel_only" ? ["AGENTS.md"]
      : [...new Set(["AGENTS.md", CORE_STATE, CODEX_STATE, ...distribution.allPaths])].sort();
    const assets = assetPaths.map(file => ({ path: file, ...baseline[file],
      kind: file === "AGENTS.md" ? "canonical_kernel_with_preserved_custom_instructions" : file.endsWith("install-state.json") ? "install_identity" : "full_ask_asset",
      origin: distribution.extra.has(file) ? "live_classified_reference_supplement" : id === "kernel_only" ? "canonical_agents" : "live_core_and_codex_full_installers" }));
    const baselineCommit = prepareGitBaseline(armRoot);
    // Every regular file belongs in the explicit baseline; no task/controller
    // file is placed inside an arm, even during Git initialization.
    const after = inventoryUserTree(armRoot);
    if (JSON.stringify(after) !== JSON.stringify(baseline)) fail("baseline_tree_changed_during_git_preparation");
    const baselinePath = `control/baselines/${id}`;
    for (const [file, entry] of Object.entries(baseline)) {
      const bytes = readRegular(join(armRoot, file), "private_diff_baseline", FILE_LIMIT, true);
      if (comparisonHash(bytes) !== entry.digest) fail("baseline_changed_during_private_capture");
      writeNew(root, `${baselinePath}/${file}`, bytes, entry.mode);
    }
    if (JSON.stringify(inventoryUserTree(join(root, baselinePath))) !== JSON.stringify(baseline)) fail("private_baseline_inventory_mismatch");
    arms[id] = { id, label, path, baseline_path: baselinePath, baseline_commit: baselineCommit, baseline_inventory: baseline,
      baseline_digest: comparisonHash(jsonBytes(baseline)), git_metadata: inventoryComparisonGitMetadata(armRoot), assets,
      capability: id === "kernel_only" ? kernelCapability(baseline, config) : { status: "available", required: [], available: [], missing: [] },
      configuration: id === "plain" ? "No project ASK assets added; preserved custom instructions and global Skills may apply."
        : id === "kernel_only" ? "Canonical AGENTS only; no ASK Skills added; preserved custom/global capabilities may apply."
          : "Live core plus Codex full and all classified reference-supplement paths; preserved custom/global instructions may apply." };
  }
  const sourceInventory = Object.fromEntries([...original].sort(([a], [b]) => a.localeCompare(b)).map(([path, value]) => [path, record(value.bytes, value.mode)]));
  const plan = { schema_version: 1, kind: "ask_user_comparison_plan_v1", run_id: randomUUID(), created_at: new Date().toISOString(),
    rerun_of: options.rerunOf ?? null, root, source: { repo: options.repo, commit: options.commit, inventory: sourceInventory, digest: comparisonHash(jsonBytes(sourceInventory)) },
    task: { path: "control/task.md", digest: comparisonHash(taskBytes), source_path: options.taskFile },
    verification: { path: "control/verification.json", digest: comparisonHash(verificationBytes), recipe, source_path: options.verificationFile,
      reporter: { path: "control/node-test-reporter.mjs", digest: comparisonHash(reporterBytes), format: "ask_node_summary_jsonl_v1" } },
    prompt, input: { path: "inputs/prompt.md", digest: comparisonHash(Buffer.from(prompt)), bytes: Buffer.byteLength(prompt) },
    mutable_paths: mutable, config, policy: { attempts: 1, retries: 0, concurrency: 1 }, arms,
    source_installation: { removed_managed_assets: separated.removed, identities: separated.identities,
      preserved_custom_agents_digest: comparisonHash(customAgents) },
    full_definition: { name: "live_core_plus_codex_full_with_classified_reference_supplement", profile: "full",
      source_repo: SOURCE, source_commit: git(SOURCE, ["rev-parse", "HEAD"]).toString().trim(),
      source_worktree_clean: git(SOURCE, ["status", "--porcelain", "--untracked-files=normal"]).toString().trim() === "", package_version: distribution.manifest.version,
      canonical_agents_digest: comparisonHash(canonicalBytes), renderer: { id: distribution.projection.renderer_id, version: distribution.projection.renderer_version,
        profile: distribution.projection.renderer_profile, fingerprint: distribution.projection.fingerprint,
        canonical_source_digest: distribution.projection.canonical_source_digest }, renderer_inputs: distribution.projection.renderer_inputs,
      counts: { core_assets: distribution.corePaths.length, skills: distribution.projection.skills.length, prompts: distribution.projection.prompts.length,
        commands: distribution.projection.commands.length, reference_supplement: distribution.extra.size, full_assets: arms.full_ask.assets.length },
      supplement: { path: SUPPLEMENT, digest: distribution.supplementDigest, policy: "classified_paths_only_with_live_source_bytes_and_new_hashes" },
      asset_digest: comparisonHash(jsonBytes(arms.full_ask.assets)) },
    condition_differences: ["Project ASK assets differ by P/K/F; custom instructions are preserved.", "K missing routes are capability_missing without adding Skills.",
      "Separate sequential sessions can retain unknown global/provider/session differences."],
    unknowns: ["future_provider_communication", "global_instruction_and_skill_inventory", "authentication_and_permission_state", "effective_model_if_not_declared", "usage_until_reported_by_runner"],
    limitations: ["Initial target: Mac/Git/Codex; regular committed files only, no symlinks/submodules or recognizable secret files.",
      "Independent verification supports explicit dependency-free Node builtin .mjs tests only; arbitrary framework grading is unsupported.",
      "The designated controller verification recipe must not be committed in the source tree, where private descriptions would enter model-visible copies.",
      "Managed separation requires active schema-3 core/Codex state and unchanged recorded hashes; Claude/hooks/partial or ambiguous installs are unsupported.",
      "Bare or embedded canonical AGENTS without managed ownership is refused; ordinary custom ASK mentions are preserved.",
      "Non-empty root AGENTS.override.md is unsupported because it takes precedence over K/F's canonical AGENTS.md; the source override is preserved and preparation stops.",
      "Committed .agents/runs, .agent-spectrum-kernel/runtime or ask-runtime records are refused rather than copied into model input or deleted as managed assets.",
      "Preparation uses local Git and current Node installers only; Codex/model launch count is zero.", "One exploratory task cannot prove general ASK effectiveness or operational promotion."] };
  const serialized = jsonBytes(plan), planDigest = comparisonHash(serialized);
  writeNew(root, "control/plan.json", serialized);
  writeNew(root, "control/plan.digest", Buffer.from(`${planDigest}\n`));
  return { plan, plan_digest: planDigest, root };
}
