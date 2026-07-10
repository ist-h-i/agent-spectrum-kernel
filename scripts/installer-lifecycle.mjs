import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

export const LIFECYCLE_SCHEMA_VERSION = 3;
export const MANAGED_START = "<!-- agent-spectrum-kernel:start -->";
export const MANAGED_END = "<!-- agent-spectrum-kernel:end -->";

export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function readJson(path) {
  return JSON.parse(readText(path));
}

export function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return readJson(path);
}

export function buildGitDir(repoRoot) {
  const gitPath = resolve(repoRoot, ".git");
  if (!existsSync(gitPath)) {
    return null;
  }
  const stat = statSync(gitPath);
  if (stat.isDirectory()) {
    return gitPath;
  }
  if (stat.isFile()) {
    const text = readText(gitPath).trim();
    const match = text.match(/^gitdir:\s*(.+)$/);
    if (match) {
      return resolve(repoRoot, match[1]);
    }
  }
  return null;
}

export function readGitRevision(repoRoot) {
  const gitDir = buildGitDir(repoRoot);
  if (!gitDir) {
    return null;
  }
  const headPath = resolve(gitDir, "HEAD");
  if (!existsSync(headPath)) {
    return null;
  }
  const head = readText(headPath).trim();
  if (/^[a-f0-9]{40}$/i.test(head)) {
    return head;
  }
  const refMatch = head.match(/^ref:\s*(.+)$/);
  if (!refMatch) {
    return null;
  }
  const ref = refMatch[1];
  const refPath = resolve(gitDir, ref);
  if (existsSync(refPath)) {
    return readText(refPath).trim() || null;
  }
  const packedRefsPath = resolve(gitDir, "packed-refs");
  if (!existsSync(packedRefsPath)) {
    return null;
  }
  for (const line of readText(packedRefsPath).split(/\r?\n/)) {
    if (line.startsWith("#") || line.startsWith("^")) {
      continue;
    }
    const [hash, packedRef] = line.split(" ");
    if (packedRef === ref) {
      return hash;
    }
  }
  return null;
}

export function createManagedFileRecord({ kind, content, ...extra }) {
  const sha256 = hashText(content);
  return { kind, ...extra, sha256, canonical_sha256: sha256 };
}

export function createManagedBlockRecord({ path, marker, content }) {
  const sha256 = hashText(content);
  return { path, marker, sha256, canonical_sha256: sha256 };
}

export function stripRollbackState(state) {
  if (!state || typeof state !== "object") {
    return null;
  }
  const { previous_successful_state, rollback, ...rest } = state;
  return rest;
}

export function buildLifecycleState({
  manifest,
  repoRoot,
  adapterName,
  adapterVersion = 1,
  selectedProfile = null,
  target,
  installedSkills,
  selectedSkills,
  managedFiles,
  managedPartialFiles = {},
  managedBlocks = {},
  managedHooks = [],
  rollback = { files: {}, blocks: {} },
  previousState = null,
  hasMutations = false,
  extra = {},
}) {
  const previousSuccessfulState =
    previousState?.install_status === "installed"
      ? stripRollbackState(previousState)
      : previousState?.previous_successful_state ?? null;

  const state = {
    ...extra,
    schema_version: LIFECYCLE_SCHEMA_VERSION,
    installer: adapterName,
    adapter: {
      name: adapterName,
      version: adapterVersion,
    },
    source: {
      name: manifest?.name ?? "agent-spectrum-kernel",
      version: manifest?.version ?? null,
      git_revision: readGitRevision(repoRoot),
    },
    selected_profile: selectedProfile,
    installed_skills: installedSkills,
    selected_skills: selectedSkills,
    install_status: "installed",
    previous_successful_state: previousSuccessfulState,
    target,
    managed_files: managedFiles,
    managed_partial_files: managedPartialFiles,
    managed_blocks: managedBlocks,
    managed_hooks: managedHooks,
    rollback,
  };
  if (!hasMutations && previousState?.schema_version === LIFECYCLE_SCHEMA_VERSION && comparableState(previousState) === comparableState(state)) {
    return previousState;
  }
  return state;
}

function comparableState(state) {
  const { previous_successful_state, rollback, ...rest } = state ?? {};
  return JSON.stringify(rest);
}

export function buildAgentsBlock(content) {
  return [
    MANAGED_START,
    "<!-- Source: Agent Spectrum Kernel. Managed by Agent Spectrum Kernel installers; edits inside this block will be overwritten. -->",
    content.trimEnd(),
    MANAGED_END,
    "",
  ].join("\n");
}

export function extractManagedBlock(text) {
  const start = text.indexOf(MANAGED_START);
  const end = text.indexOf(MANAGED_END);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    throw new Error("AGENTS.md contains an incomplete agent-spectrum-kernel managed block");
  }
  if (start === -1) {
    return null;
  }
  return {
    start,
    end: end + MANAGED_END.length,
    content: text.slice(start, end + MANAGED_END.length),
  };
}

export function replaceOrAppendManagedBlock(existing, block, allowAppend) {
  const current = extractManagedBlock(existing);
  if (current) {
    const before = existing.slice(0, current.start).replace(/[ \t]*$/u, "");
    const after = existing.slice(current.end).replace(/^\s*\n?/u, "");
    return `${before}${before ? "\n\n" : ""}${block}${after ? `\n${after}` : ""}`;
  }
  if (!allowAppend) {
    throw new Error("AGENTS.md already exists. Re-run with --merge-agents to add/update the managed block.");
  }
  return `${existing.trimEnd()}\n\n${block}`;
}

export function removeManagedBlock(existing) {
  const current = extractManagedBlock(existing);
  if (!current) {
    return existing;
  }
  const before = existing.slice(0, current.start).replace(/[ \t]*$/u, "");
  const after = existing.slice(current.end).replace(/^\s*\n?/u, "");
  if (before && after) {
    return `${before}\n\n${after}`;
  }
  return `${before}${after ? `${before ? "\n" : ""}${after}` : ""}`;
}

function previousManagedRecord(previousState, relativePath) {
  const record = previousState?.managed_files?.[relativePath];
  if (!record || typeof record.sha256 !== "string") {
    return null;
  }
  return record;
}

function previousManagedBlock(previousState, blockKey) {
  const record = previousState?.managed_blocks?.[blockKey];
  if (!record || typeof record.sha256 !== "string") {
    return null;
  }
  return record;
}

function previousManagedPartialRecord(previousState, relativePath) {
  const record = previousState?.managed_partial_files?.[relativePath];
  if (!record || typeof record.sha256 !== "string") {
    return null;
  }
  return record;
}

export function createRollbackSnapshot() {
  return { files: {}, blocks: {} };
}

export function captureRollbackFile(rollback, target, relativePath) {
  if (Object.hasOwn(rollback.files, relativePath)) {
    return;
  }
  const destination = resolve(target, relativePath);
  rollback.files[relativePath] = existsSync(destination)
    ? { content: readText(destination), sha256: hashText(readText(destination)) }
    : { content: null, sha256: null };
}

export function captureRollbackBlock(rollback, target, relativePath, blockKey) {
  if (Object.hasOwn(rollback.blocks, blockKey)) {
    return;
  }
  const destination = resolve(target, relativePath);
  if (!existsSync(destination)) {
    rollback.blocks[blockKey] = { path: relativePath, content: null, sha256: null };
    return;
  }
  const block = extractManagedBlock(readText(destination));
  rollback.blocks[blockKey] = block
    ? { path: relativePath, content: block.content, sha256: hashText(block.content) }
    : { path: relativePath, content: null, sha256: null };
}

export function assertManagedWriteSafe({ target, relativePath, content, previousState, force = false, allowUnmanaged = false }) {
  const destination = resolve(target, relativePath);
  if (!existsSync(destination)) {
    return;
  }
  const current = readText(destination);
  const currentHash = hashText(current);
  const newHash = hashText(content);
  if (currentHash === newHash) {
    return;
  }
  const record = previousManagedRecord(previousState, relativePath);
  if (!record) {
    if (!allowUnmanaged && !force) {
      throw new Error(`unmanaged target file would be overwritten: ${relativePath}. Use --force to overwrite.`);
    }
    return;
  }
  if (currentHash !== record.sha256 && !force) {
    throw new Error(`managed file conflict: ${relativePath} was modified locally. Use --force to overwrite.`);
  }
}

export function assertManagedDeleteSafe({ target, relativePath, previousState, force = false }) {
  const destination = resolve(target, relativePath);
  if (!existsSync(destination)) {
    return;
  }
  const record = previousManagedRecord(previousState, relativePath);
  if (!record) {
    if (!force) {
      throw new Error(`missing managed file record; refusing to delete: ${relativePath}`);
    }
    return;
  }
  const currentHash = hashText(readText(destination));
  if (currentHash !== record.sha256 && !force) {
    throw new Error(`modified managed file; refusing to prune/delete: ${relativePath}. Use --force to overwrite.`);
  }
}

export function assertManagedBlockSafe({ target, relativePath, blockKey, previousState, force = false }) {
  const destination = resolve(target, relativePath);
  if (!existsSync(destination)) {
    return;
  }
  const block = extractManagedBlock(readText(destination));
  if (!block) {
    return;
  }
  const record = previousManagedBlock(previousState, blockKey);
  if (!record) {
    const fileRecord = previousManagedRecord(previousState, relativePath);
    if (fileRecord) {
      const currentHash = hashText(readText(destination));
      if (currentHash === fileRecord.sha256 || force) {
        return;
      }
      throw new Error(`managed block conflict: ${relativePath} was modified locally. Use --force to overwrite.`);
    }
    if (!force) {
      throw new Error(`managed block record is missing; refusing to update: ${relativePath}. Use --force to overwrite.`);
    }
    return;
  }
  const currentHash = hashText(block.content);
  if (currentHash !== record.sha256 && !force) {
    throw new Error(`managed block conflict: ${relativePath} was modified locally. Use --force to overwrite.`);
  }
}

export function planWriteManaged(operations, { target, relativePath, content, reason, previousState, force = false, rollback, allowUnmanaged = false }) {
  assertManagedWriteSafe({ target, relativePath, content, previousState, force, allowUnmanaged });
  if (rollback) {
    captureRollbackFile(rollback, target, relativePath);
  }
  const destination = resolve(target, relativePath);
  const existing = existsSync(destination) ? readText(destination) : null;
  operations.push({ kind: "write", destination, relativePath, content, reason, unchanged: existing === content });
}

export function planWriteManagedBlock(operations, { target, relativePath, blockKey, content, reason, previousState, force = false, rollback }) {
  assertManagedBlockSafe({ target, relativePath, blockKey, previousState, force });
  if (rollback) {
    captureRollbackBlock(rollback, target, relativePath, blockKey);
  }
  const destination = resolve(target, relativePath);
  const existing = existsSync(destination) ? readText(destination) : null;
  operations.push({ kind: "write", destination, relativePath, content, reason, unchanged: existing === content });
}

export function planDeleteManaged(operations, { target, relativePath, reason, previousState, force = false, rollback }) {
  assertManagedDeleteSafe({ target, relativePath, previousState, force });
  if (rollback) {
    captureRollbackFile(rollback, target, relativePath);
  }
  const destination = resolve(target, relativePath);
  operations.push({ kind: "delete_file", destination, relativePath, reason, unchanged: !existsSync(destination) });
}

export function planRemoveEmptyDirectory(operations, target, relativePath, reason) {
  operations.push({ kind: "remove_empty_dir", destination: resolve(target, relativePath), relativePath, reason, unchanged: false });
}

export function planRemoveManagedBlock(operations, { target, relativePath, blockKey, reason, previousState, force = false, rollback }) {
  assertManagedBlockSafe({ target, relativePath, blockKey, previousState, force });
  if (rollback) {
    captureRollbackBlock(rollback, target, relativePath, blockKey);
  }
  const destination = resolve(target, relativePath);
  if (!existsSync(destination)) {
    return;
  }
  const content = removeManagedBlock(readText(destination));
  operations.push({ kind: "write", destination, relativePath, content, reason, unchanged: false });
}

export function stateInProgressPath(statePath) {
  return `${statePath}.in-progress.json`;
}

export function applyOperations(operations, dryRun) {
  if (dryRun) {
    return;
  }
  for (const operation of operations) {
    if (operation.kind === "write") {
      mkdirSync(dirname(operation.destination), { recursive: true });
      writeFileSync(operation.destination, operation.content);
    } else if (operation.kind === "delete_file") {
      if (existsSync(operation.destination)) {
        unlinkSync(operation.destination);
      }
    } else if (operation.kind === "remove_empty_dir") {
      if (existsSync(operation.destination) && statSync(operation.destination).isDirectory() && readdirSync(operation.destination).length === 0) {
        rmdirSync(operation.destination);
      }
    } else if (operation.kind === "mkdir") {
      mkdirSync(operation.destination, { recursive: true });
    }
  }
}

export function applyLifecyclePlan({ target, statePath, operations, state, dryRun }) {
  if (dryRun) {
    return;
  }
  const absoluteStatePath = resolve(target, statePath);
  const markerPath = stateInProgressPath(absoluteStatePath);
  mkdirSync(dirname(absoluteStatePath), { recursive: true });
  writeFileSync(
    markerPath,
    `${JSON.stringify({
      install_status: "in_progress",
      state_path: statePath,
      started_at: new Date().toISOString(),
      pending_state: state,
      operations: operations.map(({ kind, relativePath, reason }) => ({ kind, relative_path: relativePath, reason })),
    }, null, 2)}\n`,
  );
  try {
    applyOperations(operations, false);
    writeFileSync(absoluteStatePath, `${JSON.stringify(state, null, 2)}\n`);
    if (existsSync(markerPath)) {
      unlinkSync(markerPath);
    }
  } catch (error) {
    throw error;
  }
}

export function printOperations(target, operations) {
  for (const operation of operations) {
    const marker = operation.reason === "initialize_project_state"
      ? "initialize"
      : operation.reason === "preserve_project_state"
        ? "preserve"
      : operation.reason?.startsWith("claude_")
        ? "refresh"
        : operation.kind === "delete_file"
          ? "delete"
          : operation.kind === "remove_empty_dir"
            ? "rmdir-if-empty"
            : operation.kind === "mkdir"
              ? "mkdir"
              : operation.unchanged
                ? "unchanged"
                : "write";
    console.log(`- ${marker}: ${relative(target, operation.destination)} (${operation.reason})`);
  }
}

export function rollbackLifecycleState({ target, statePath, dryRun = false, force = false }) {
  const absoluteStatePath = resolve(target, statePath);
  const markerPath = stateInProgressPath(absoluteStatePath);
  const pending = readJsonIfExists(markerPath);
  const state = pending?.pending_state ?? readJsonIfExists(absoluteStatePath);
  if (!state) {
    throw new Error(`install state is missing: ${statePath}`);
  }
  const rollback = state.rollback;
  if (!rollback || (!rollback.files && !rollback.blocks)) {
    throw new Error(`rollback snapshot is missing: ${statePath}`);
  }
  const operations = [];
  for (const [relativePath, snapshot] of Object.entries(rollback.files ?? {})) {
    if (state.managed_partial_files?.[relativePath]?.kind === "claude_settings") {
      continue;
    }
    const destination = resolve(target, relativePath);
    const currentHash = existsSync(destination) ? hashText(readText(destination)) : null;
    const managedHash = state.managed_files?.[relativePath]?.sha256 ?? previousManagedPartialRecord(state, relativePath)?.sha256 ?? null;
    const rollbackHash = snapshot.sha256 ?? null;
    if (currentHash === rollbackHash) {
      continue;
    }
    if (!force && currentHash !== managedHash) {
      throw new Error(`rollback conflict: ${relativePath} does not match the pending managed or rollback snapshot. Use --force to overwrite.`);
    }
    const partialRecord = previousManagedPartialRecord(state, relativePath);
    if (!force && partialRecord && existsSync(destination)) {
      if (currentHash !== partialRecord.sha256) {
        throw new Error(`managed partial file conflict: ${relativePath} was modified locally. Use --force to overwrite.`);
      }
    }
    if (snapshot.content === null) {
      operations.push({ kind: "delete_file", destination: resolve(target, relativePath), relativePath, reason: "rollback:remove-new-file", unchanged: !existsSync(resolve(target, relativePath)) });
    } else {
      operations.push({ kind: "write", destination: resolve(target, relativePath), relativePath, content: snapshot.content, reason: "rollback:restore-file", unchanged: existsSync(resolve(target, relativePath)) && readText(resolve(target, relativePath)) === snapshot.content });
    }
  }
  for (const [blockKey, snapshot] of Object.entries(rollback.blocks ?? {})) {
    const destination = resolve(target, snapshot.path);
    if (!existsSync(destination)) {
      continue;
    }
    if (!force) {
      assertManagedBlockSafe({ target, relativePath: snapshot.path, blockKey, previousState: state, force });
    }
    const existing = readText(destination);
    const content = snapshot.content === null ? removeManagedBlock(existing) : replaceOrAppendManagedBlock(existing, `${snapshot.content}\n`, true);
    operations.push({ kind: "write", destination, relativePath: snapshot.path, content, reason: `rollback:restore-block:${blockKey}`, unchanged: existing === content });
  }
  if (!dryRun) {
    applyOperations(operations, false);
    if (state.previous_successful_state) {
      writeFileSync(absoluteStatePath, `${JSON.stringify({ ...state.previous_successful_state, install_status: "installed" }, null, 2)}\n`);
    } else if (existsSync(absoluteStatePath)) {
      unlinkSync(absoluteStatePath);
    }
    const markerPath = stateInProgressPath(absoluteStatePath);
    if (existsSync(markerPath)) {
      unlinkSync(markerPath);
    }
  }
  return operations;
}

export function detachLifecycleState({ target, statePath, dryRun = false, force = false, preserve = [] }) {
  const absoluteStatePath = resolve(target, statePath);
  const state = readJsonIfExists(absoluteStatePath);
  if (!state) {
    throw new Error(`install state is missing: ${statePath}`);
  }
  const preserveSet = new Set(preserve);
  const operations = [];
  for (const relativePath of Object.keys(state.managed_files ?? {}).sort()) {
    if (preserveSet.has(relativePath)) {
      continue;
    }
    planDeleteManaged(operations, { target, relativePath, reason: "detach:remove-managed-file", previousState: state, force });
  }
  for (const [blockKey, block] of Object.entries(state.managed_blocks ?? {})) {
    planRemoveManagedBlock(operations, { target, relativePath: block.path, blockKey, reason: "detach:remove-managed-block", previousState: state, force });
  }
  if (!dryRun) {
    applyOperations(operations, false);
    writeFileSync(absoluteStatePath, `${JSON.stringify({ ...stripRollbackState(state), install_status: "detached", detached_at: new Date().toISOString() }, null, 2)}\n`);
    const markerPath = stateInProgressPath(absoluteStatePath);
    if (existsSync(markerPath)) {
      unlinkSync(markerPath);
    }
  }
  return operations;
}
