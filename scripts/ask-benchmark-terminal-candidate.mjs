import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, resolve, sep } from "node:path";
import { verifyExecutionTerminalWorkspaceAuthority } from "./ask-benchmark-execution.mjs";
import {
  NORMALIZED_RUN_MANIFEST_NAME,
  validateNormalizedPortfolioResult,
  verifyNormalizedPortfolioResults,
} from "./ask-benchmark-normalized-results.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";
import {
  assertTerminalWorkspaceRelativePath,
  captureTerminalWorkspaceInventory,
  deriveTerminalCandidateInventory,
  terminalWorkspaceInventoryDigest,
  terminalWorkspacePathsOverlap,
  TERMINAL_WORKSPACE_LIMITS,
  validateTerminalWorkspaceTreeInventory,
} from "./ask-benchmark-terminal-workspace.mjs";

const MAX_NORMALIZED_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_NORMALIZED_RECORD_BYTES = 4 * 1024 * 1024;

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

function parseStableJson(path, label, maximumBytes) {
  const file = readStableFile(path, label, maximumBytes, { allowEmpty: false });
  let value;
  try {
    value = JSON.parse(file.bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} contains invalid JSON`);
  }
  return { file, value };
}

function prefixedSha256(file) {
  return file.rawByteDigest;
}

function normalizedRecordReference(manifest, normalizedResultId) {
  const references = manifest.cases.flatMap((entry) => entry.normalized_attempts).filter((entry) => entry.normalized_result_id === normalizedResultId);
  if (references.length !== 1) throw new Error("normalized result ID does not resolve to exactly one verified generation record");
  const [reference] = references;
  const inventory = manifest.inventory.filter((entry) => entry.path === reference.path);
  if (inventory.length !== 1) throw new Error("normalized result reference does not resolve to exactly one generation inventory entry");
  if (inventory[0].normalized_result_id !== undefined && inventory[0].normalized_result_id !== normalizedResultId) throw new Error("normalized result generation inventory ID mismatch");
  return { reference, inventory: inventory[0] };
}

function assertNormalizedExecutionClosure(record, execution) {
  const lineage = record.lineage;
  const expected = {
    run_instance_id: execution.run_instance_id,
    case_id: execution.case_id,
    attempt: execution.attempt,
    adapter_track: execution.adapter,
    condition: execution.condition,
    fixture_id: execution.fixture_id,
    fixture_input_digest: execution.fixture_input_digest,
    materialization_manifest_digest: execution.materialization_manifest_digest,
    request_digest: execution.request_digest,
    raw_result_digest: execution.raw_result_digest,
    terminal_commit_digest: execution.terminal_commit_digest,
    terminal_workspace_authority_availability: execution.terminal_workspace_authority_availability,
    terminal_workspace_authority_support: execution.terminal_workspace_authority_support,
    terminal_workspace_authority_digest: execution.terminal_workspace_authority_digest,
    terminal_workspace_tree_digest: execution.terminal_workspace_tree_digest,
    terminal_workspace_authority_bytes: execution.terminal_workspace_authority_bytes,
  };
  for (const [field, value] of Object.entries(expected)) {
    const observed = lineage[field];
    if (observed !== value) throw new Error(`normalized terminal workspace lineage ${field} mismatch`);
  }
}

export function verifyTerminalWorkspaceAuthority({
  root,
  config,
  planPath,
  materializedPath,
  selectionState,
  runDir,
  normalizedResultsPath,
  sourceSnapshotDigest,
  normalizedResultId,
}) {
  if (!normalizedResultsPath || !sourceSnapshotDigest || !normalizedResultId) throw new Error("terminal workspace verification requires a normalized collection, source snapshot digest, and normalized result ID");
  const normalized = verifyNormalizedPortfolioResults({
    root,
    config,
    planPath,
    materializedPath,
    selectionState,
    runDir,
    outputPath: normalizedResultsPath,
  });
  if (normalized.manifest.source_snapshot_digest !== sourceSnapshotDigest) throw new Error("normalized source snapshot digest mismatch");
  const collectionRoot = realpathSync(resolve(normalizedResultsPath));
  const generationRoot = realpathSync(normalized.generationPath);
  if (!generationRoot.startsWith(`${collectionRoot}${sep}`)) throw new Error("normalized generation escapes its verified collection");
  const manifestPath = resolve(generationRoot, NORMALIZED_RUN_MANIFEST_NAME);
  const stableManifest = parseStableJson(manifestPath, "normalized generation manifest", MAX_NORMALIZED_MANIFEST_BYTES);
  if (stableCanonicalJson(stableManifest.value) !== stableCanonicalJson(normalized.manifest)) throw new Error("normalized generation manifest changed after full verification");
  const { reference, inventory } = normalizedRecordReference(normalized.manifest, normalizedResultId);
  const recordPath = resolve(generationRoot, reference.path);
  if (!recordPath.startsWith(`${generationRoot}${sep}`)) throw new Error("normalized result path escapes its verified generation");
  const stableRecord = parseStableJson(recordPath, "normalized result record", MAX_NORMALIZED_RECORD_BYTES);
  if (stableRecord.file.bytes.length !== inventory.bytes || prefixedSha256(stableRecord.file) !== inventory.sha256) throw new Error("normalized result record inventory identity mismatch");
  const record = validateNormalizedPortfolioResult(stableRecord.value, { root });
  if (record.normalized_result_id !== normalizedResultId || record.normalized_result_digest !== reference.normalized_result_digest) throw new Error("normalized result identity does not match its verified generation reference");
  const execution = verifyExecutionTerminalWorkspaceAuthority({
    root,
    config,
    planPath,
    materializedPath,
    selectionState,
    runDir,
    caseId: record.lineage.case_id,
    attempt: record.lineage.attempt,
  });
  assertNormalizedExecutionClosure(record, execution.execution);
  const manifestAfter = readStableFile(manifestPath, "normalized generation manifest", MAX_NORMALIZED_MANIFEST_BYTES, { allowEmpty: false });
  const recordAfter = readStableFile(recordPath, "normalized result record", MAX_NORMALIZED_RECORD_BYTES, { allowEmpty: false });
  assertStableFileEvidence(stableManifest.file, manifestAfter, "normalized generation manifest");
  assertStableFileEvidence(stableRecord.file, recordAfter, "normalized result record");
  return {
    ...execution,
    normalized: {
      record,
      record_path: recordPath,
      record_file: stableRecord.file,
      collection_root: collectionRoot,
      generation_root: generationRoot,
      source_snapshot_digest: sourceSnapshotDigest,
    },
  };
}

function directoryIdentity(status, canonicalPath) {
  return { dev: status.dev, ino: status.ino, mode: status.mode & 0o777, canonical_path: canonicalPath };
}

function assertSameDirectoryIdentity(expected, status, canonicalPath, label) {
  const actual = directoryIdentity(status, canonicalPath);
  if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) throw new Error(`${label} changed during terminal candidate output creation`);
}

function createAuthorityOwnedOutputBoundary(outputParent, forbiddenRoots, inspectionHook = null) {
  const parentPath = resolve(outputParent);
  assertNoSymlinkSegments(parentPath, "terminal candidate private output parent");
  const initial = lstatSync(parentPath);
  if (initial.isSymbolicLink() || !initial.isDirectory()) throw new Error("terminal candidate private output parent must be a real directory");
  const canonicalParent = realpathSync(parentPath);
  for (const forbiddenRoot of forbiddenRoots) {
    if (!forbiddenRoot) continue;
    const canonicalForbidden = existsSync(forbiddenRoot) ? realpathSync(forbiddenRoot) : resolve(forbiddenRoot);
    if (terminalWorkspacePathsOverlap(canonicalParent, canonicalForbidden)) throw new Error("terminal candidate private output parent overlaps an authority input root");
  }
  const parentDescriptor = openSync(parentPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
  let outputPath = null;
  let outputIdentity = null;
  try {
    const opened = fstatSync(parentDescriptor);
    const identity = directoryIdentity(initial, canonicalParent);
    assertSameDirectoryIdentity(identity, opened, canonicalParent, "terminal candidate private output parent");
    if (inspectionHook !== null) inspectionHook({ phase: "parent_inspected", parent_path: parentPath });
    assertSameDirectoryIdentity(identity, lstatSync(parentPath), realpathSync(parentPath), "terminal candidate private output parent");
    const name = `.ask-terminal-candidate-${randomUUID()}`;
    outputPath = resolve(parentPath, name);
    mkdirSync(outputPath, { recursive: false, mode: 0o700 });
    chmodSync(outputPath, 0o700);
    const createdStatus = lstatSync(outputPath);
    outputIdentity = directoryIdentity(createdStatus, realpathSync(outputPath));
    if (inspectionHook !== null) inspectionHook({ phase: "output_created", parent_path: parentPath, output_path: outputPath });
    const finalParent = lstatSync(parentPath);
    assertSameDirectoryIdentity(identity, finalParent, realpathSync(parentPath), "terminal candidate private output parent");
    const outputStatus = lstatSync(outputPath);
    const canonicalOutput = realpathSync(outputPath);
    if (
      outputStatus.isSymbolicLink()
      || !outputStatus.isDirectory()
      || dirname(canonicalOutput) !== canonicalParent
      || outputStatus.dev !== outputIdentity.dev
      || outputStatus.ino !== outputIdentity.ino
    ) throw new Error("terminal candidate output is not the authority-owned child created under its private parent");
    return {
      parent_path: parentPath,
      parent_descriptor: parentDescriptor,
      parent_identity: identity,
      output_path: outputPath,
      anchored_output: outputPath,
      output_identity: directoryIdentity(outputStatus, canonicalOutput),
    };
  } catch (error) {
    if (outputPath !== null && outputIdentity !== null) {
      try {
        const current = lstatSync(outputPath);
        const currentIdentity = directoryIdentity(current, realpathSync(outputPath));
        if (!current.isSymbolicLink() && current.isDirectory() && stableCanonicalJson(currentIdentity) === stableCanonicalJson(outputIdentity)) rmdirSync(outputPath);
      } catch {
        // Foreign or unreachable paths are never modified during failed creation.
      }
    }
    closeSync(parentDescriptor);
    throw error;
  }
}

export function createTerminalCandidateOutputBoundaryForTest(outputParent, forbiddenRoots, inspectionHook = null) {
  return createAuthorityOwnedOutputBoundary(outputParent, forbiddenRoots, inspectionHook);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function modeOf(status) {
  return `0${(status.mode & 0o777).toString(8).padStart(3, "0")}`;
}

function assertOwnedOutputIdentity(outputBoundary, phase) {
  const parentPathStatus = lstatSync(outputBoundary.parent_path);
  const parentDescriptorStatus = fstatSync(outputBoundary.parent_descriptor);
  const parentCanonicalPath = realpathSync(outputBoundary.parent_path);
  if (
    parentPathStatus.isSymbolicLink()
    || !parentPathStatus.isDirectory()
    || !parentDescriptorStatus.isDirectory()
    || parentPathStatus.dev !== outputBoundary.parent_identity.dev
    || parentPathStatus.ino !== outputBoundary.parent_identity.ino
    || parentDescriptorStatus.dev !== outputBoundary.parent_identity.dev
    || parentDescriptorStatus.ino !== outputBoundary.parent_identity.ino
    || parentCanonicalPath !== outputBoundary.parent_identity.canonical_path
  ) throw new Error(`terminal candidate output parent changed during ${phase}`);
  const childStatus = lstatSync(outputBoundary.output_path);
  if (childStatus.isSymbolicLink() || !childStatus.isDirectory() || childStatus.dev !== outputBoundary.output_identity.dev || childStatus.ino !== outputBoundary.output_identity.ino) throw new Error(`terminal candidate output was replaced during ${phase}`);
}

function directoryEntries(directory) {
  const entries = [];
  const handle = opendirSync(directory);
  try {
    for (;;) {
      const entry = handle.readSync();
      if (entry === null) break;
      entries.push(entry);
    }
  } finally {
    handle.closeSync();
  }
  return entries;
}

function removeOwnedPartialOutput(outputBoundary) {
  const visit = (directory) => {
    chmodSync(directory, 0o700);
    for (const entry of directoryEntries(directory)) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else chmodSync(path, 0o600);
    }
  };
  const current = lstatSync(outputBoundary.output_path);
  if (current.isSymbolicLink() || !current.isDirectory() || current.dev !== outputBoundary.output_identity.dev || current.ino !== outputBoundary.output_identity.ino) return;
  visit(outputBoundary.output_path);
  rmSync(outputBoundary.output_path, { recursive: true, force: true });
}

function nestedDirectories(root) {
  const directories = [];
  const visit = (directory) => {
    for (const entry of directoryEntries(directory)) {
      if (!entry.isDirectory()) continue;
      const path = resolve(directory, entry.name);
      directories.push(path);
      visit(path);
    }
  };
  visit(root);
  return directories;
}

function materializeResolvedTerminalCandidate({ verified, materializedCaseRoot, outputBoundary, inspectionHook = null, missingChangedContentPath = null }) {
  const output = outputBoundary.output_path;
  const baseRoot = resolve(materializedCaseRoot);
  const managed = new Set(verified.authority.managed_asset_paths);
  const baseByPath = new Map(verified.authority.base_inventory.map((entry) => [entry.path, entry]));
  const deltaByPath = new Map(verified.authority.delta_inventory.map((entry) => [entry.path, entry]));
  const candidate = deriveTerminalCandidateInventory(verified.terminal.inventory, verified.authority.managed_asset_paths, verified.authority.base_inventory);
  try {
    assertOwnedOutputIdentity(outputBoundary, "materialization start");
    for (const entry of candidate) {
      const path = assertTerminalWorkspaceRelativePath(entry.path, "terminal candidate path");
      if (managed.has(path)) throw new Error("terminal candidate includes a managed asset");
      assertOwnedOutputIdentity(outputBoundary, `materialization of ${path}`);
      const destination = resolve(output, path);
      if (!destination.startsWith(`${output}${sep}`)) throw new Error("terminal candidate path escapes output root");
      if (entry.file_type === "directory") {
        mkdirSync(destination, { recursive: true, mode: 0o700 });
      } else {
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
        const changed = deltaByPath.get(path);
        let bytes;
        if (changed?.after?.file_type === "regular_file") bytes = path === missingChangedContentPath ? null : verified.terminal.contents.get(path);
        else {
          const base = baseByPath.get(path);
          if (!base || base.file_type !== "regular_file") throw new Error(`terminal candidate base content is unavailable: ${path}`);
          const source = resolve(baseRoot, path);
          assertNoSymlinkSegments(source, `terminal candidate base ${path}`);
          const file = readStableFile(source, `terminal candidate base ${path}`, TERMINAL_WORKSPACE_LIMITS.maximum_per_file_bytes);
          const status = lstatSync(source);
          if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) throw new Error(`terminal candidate base is not a standalone regular file: ${path}`);
          bytes = file.bytes;
          if (bytes.length !== base.bytes || sha256(bytes) !== base.sha256 || modeOf(status) !== base.mode) throw new Error(`terminal candidate base identity mismatch: ${path}`);
        }
        if (!Buffer.isBuffer(bytes) || bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`terminal candidate content authority is unavailable: ${path}`);
        writeFileSync(destination, bytes, { flag: "wx", mode: 0o444 });
        chmodSync(destination, 0o444);
      }
      if (inspectionHook !== null) inspectionHook({ phase: "entry_materialized", path, output_path: output });
      assertOwnedOutputIdentity(outputBoundary, `materialization of ${path}`);
    }
    for (const directory of [output, ...nestedDirectories(output)].sort((left, right) => right.length - left.length)) chmodSync(directory, 0o555);
    const reconstructed = captureTerminalWorkspaceInventory(output);
    const expected = candidate.map((entry) => ({ ...entry, mode: entry.file_type === "regular_file" ? "0444" : "0555" }));
    validateTerminalWorkspaceTreeInventory(reconstructed.inventory, "reconstructed terminal candidate inventory");
    if (terminalWorkspaceInventoryDigest(reconstructed.inventory) !== terminalWorkspaceInventoryDigest(expected)) throw new Error("terminal candidate reconstruction mismatch");
    assertOwnedOutputIdentity(outputBoundary, "materialization completion");
    return { output_root: realpathSync(output), terminal_workspace_tree_digest: verified.authority.terminal_candidate_tree_digest };
  } catch (error) {
    if (inspectionHook !== null) inspectionHook({ phase: "before_cleanup", path: null, output_path: output });
    try {
      removeOwnedPartialOutput(outputBoundary);
    } catch {
      // Cleanup never follows or mutates a foreign replacement.
    }
    throw error;
  }
}

function candidateForbiddenRoots(options, verified) {
  return [
    options.root,
    options.materializedPath,
    options.selectionState,
    options.runDir,
    verified.normalized.collection_root,
    verified.normalized.generation_root,
    dirname(verified.normalized.record_path),
    options.privateEvaluatorRoot,
  ];
}

export function materializeVerifiedTerminalCandidate(options) {
  for (const forbidden of ["normalizedResult", "normalizedResultRoot", "caseId", "attempt", "outputRoot"]) {
    if (Object.hasOwn(options, forbidden)) throw new Error(`terminal candidate API rejects caller-asserted ${forbidden}`);
  }
  const verified = verifyTerminalWorkspaceAuthority(options);
  const boundary = createAuthorityOwnedOutputBoundary(options.outputParent, candidateForbiddenRoots(options, verified));
  try {
    return materializeResolvedTerminalCandidate({
      verified,
      materializedCaseRoot: resolve(options.materializedPath, verified.execution.case_id),
      outputBoundary: boundary,
    });
  } finally {
    try {
      closeSync(boundary.parent_descriptor);
    } catch {
      // The descriptor is authority-owned and has no caller-visible lifetime.
    }
  }
}

export function materializeVerifiedTerminalCandidateForTest(options, { inspectionHook = null, missingChangedContentPath = null } = {}) {
  const verified = verifyTerminalWorkspaceAuthority(options);
  const boundary = createAuthorityOwnedOutputBoundary(options.outputParent, candidateForbiddenRoots(options, verified));
  try {
    return materializeResolvedTerminalCandidate({
      verified,
      materializedCaseRoot: resolve(options.materializedPath, verified.execution.case_id),
      outputBoundary: boundary,
      inspectionHook,
      missingChangedContentPath,
    });
  } finally {
    closeSync(boundary.parent_descriptor);
  }
}
