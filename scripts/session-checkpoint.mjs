import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  assertNoSymlinkPathSegments,
  canonicalDigest,
  putContentAddressedJson,
  readContentAddressedJson,
  readJsonFileStrict,
  readStableBytes,
  stableCanonicalJson,
  writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";
import { validateJsonSchema } from "./json-schema-validation.mjs";
import { validateWorkPackagePlan, validateWorkPackagePlanExecutable } from "./epic-admission-work-package-plan.mjs";
import { readVerificationEvidence } from "./verification-evidence.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPOSITORY_SNAPSHOT_SCHEMA_VERSION = "1.0.0";
export const SESSION_CHECKPOINT_SCHEMA_VERSION = "1.0.0";
export const REPOSITORY_SNAPSHOT_SCHEMA_PATH = resolve(ROOT, "schemas/repository-snapshot.schema.json");
export const SESSION_CHECKPOINT_SCHEMA_PATH = resolve(ROOT, "schemas/session-checkpoint.schema.json");
export const MAX_SNAPSHOT_PATHS = 128;
export const MAX_SNAPSHOT_FILE_BYTES = 256 * 1024;
// Runtime-only contract: docs/session-checkpoint-contract.md.
const MAX_WORKTREE_FILES = 4096;
const MAX_TRACKED_FILE_BYTES = 8 * 1024 * 1024;
const MAX_WORKTREE_BYTES = 64 * 1024 * 1024;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitBuffer(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: null,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const stderr = Buffer.from(result.stderr ?? "").toString("utf8").trim();
    throw new Error(`git ${args.join(" ")} failed (${result.status}): ${stderr}`);
  }
  return { status: result.status, stdout: Buffer.from(result.stdout ?? ""), stderr: Buffer.from(result.stderr ?? "") };
}

function gitText(root, args) {
  return gitBuffer(root, args).stdout.toString("utf8").trim();
}

function normalizeRepositoryIdentity(remote) {
  const value = remote.trim();
  const https = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/iu.exec(value);
  if (https) return `${https[1]}/${https[2]}`;
  const scp = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/iu.exec(value);
  if (scp) return `${scp[1]}/${scp[2]}`;
  const ssh = /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/iu.exec(value);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  throw new Error("repository origin must be an explicit github.com owner/repository identity");
}

function normalizedRepositoryRoot(repositoryRoot) {
  const requested = resolve(repositoryRoot);
  assertNoSymlinkPathSegments(requested, "repository root");
  const root = realpathSync(requested);
  const topLevel = realpathSync(gitText(root, ["rev-parse", "--show-toplevel"]));
  if (topLevel !== root) throw new Error("repositoryRoot must name the Git worktree root exactly");
  return root;
}

function validateRelativePath(path, label = "repository path") {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\u0000")) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  const normalized = path.replaceAll("\\", "/");
  if (normalized !== path || path === "." || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return path;
}

function containedPath(root, repositoryPath) {
  validateRelativePath(repositoryPath);
  const absolute = resolve(root, repositoryPath);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error("repository path escapes the worktree");
  return absolute;
}

function readPathIdentity(root, repositoryPath, { allowMissing = true, maxBytes = MAX_SNAPSHOT_FILE_BYTES } = {}) {
  const path = validateRelativePath(repositoryPath);
  const absolute = containedPath(root, path);
  assertNoSymlinkPathSegments(absolute, `repository path ${path}`, { allowMissingLeaf: true });
  if (!existsSync(absolute)) {
    if (!allowMissing) throw new Error(`required repository path is missing: ${path}`);
    return { path, state: "missing", digest: null, bytes: 0, executable: false };
  }
  const status = lstatSync(absolute);
  if (!status.isFile()) throw new Error(`repository path must be a regular file: ${path}`);
  // The JSON CAS reader deliberately rejects empty objects. Empty repository
  // files are valid; bind an empty open descriptor to the same stable inode.
  let bytes;
  if (status.size === 0) {
    const descriptor = openSync(absolute, "r");
    try {
      const opened = fstatSync(descriptor);
      const final = lstatSync(absolute);
      const keys = ["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs", "uid", "gid"];
      if (!opened.isFile() || !final.isFile() || final.isSymbolicLink()
        || keys.some((key) => status[key] !== opened[key] || opened[key] !== final[key])) {
        throw new Error(`repository path ${path} changed during empty-file read`);
      }
      bytes = Buffer.alloc(0);
    } finally {
      closeSync(descriptor);
    }
  } else {
    bytes = readStableBytes(absolute, `repository path ${path}`, maxBytes);
  }
  // Bind executable state to the same file observation as the byte digest,
  // including explicit ignored targets/contracts outside Git's inventory.
  const final = lstatSync(absolute);
  const keys = ["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs", "uid", "gid"];
  if (!final.isFile() || keys.some((key) => status[key] !== final[key])) {
    throw new Error(`repository path ${path} changed during identity capture`);
  }
  return { path, state: "present", digest: sha256(bytes), bytes: bytes.length, executable: (final.mode & 0o111) !== 0 };
}

function nulList(buffer) {
  const text = buffer.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buffer)) throw new Error("Git paths must be valid UTF-8");
  return text.split("\u0000").filter(Boolean);
}

function captureGitState(root) {
  const repositoryId = normalizeRepositoryIdentity(gitText(root, ["config", "--get", "remote.origin.url"]));
  const branch = gitText(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const head = gitText(root, ["rev-parse", "HEAD"]);
  const tree = gitText(root, ["rev-parse", "HEAD^{tree}"]);
  const indexEntries = gitBuffer(root, ["ls-files", "--stage", "-z"]).stdout;
  const headEntries = gitBuffer(root, ["ls-tree", "-r", "-z", "HEAD"]).stdout;
  const tracked = new Set();
  for (const entry of [...nulList(indexEntries), ...nulList(headEntries)]) {
    // A gitlink identifies a commit, not the nested worktree bytes. Even an
    // ignored/clean submodule is unsupported until recursive identity exists.
    if (entry.startsWith("160000 ")) throw new Error("submodule worktrees are unsupported for checkpoint capture");
    const tab = entry.indexOf("\t");
    if (tab < 0) throw new Error("invalid Git tracked-file inventory");
    tracked.add(validateRelativePath(entry.slice(tab + 1), "tracked path"));
  }
  const statusBytes = gitBuffer(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"]).stdout;
  const diffOptions = ["--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--no-renames"];
  const changedTracked = nulList(gitBuffer(root, ["diff", ...diffOptions, "--name-only", "-z", "HEAD", "--"]).stdout);
  const changedIndex = nulList(gitBuffer(root, ["diff", ...diffOptions, "--cached", "--name-only", "-z", "HEAD", "--"]).stdout);
  const untracked = nulList(gitBuffer(root, ["ls-files", "--others", "--exclude-standard", "-z"]).stdout);
  const changedPaths = [...new Set([...changedTracked, ...changedIndex, ...untracked].map((path) => validateRelativePath(path, "changed path")))].sort();
  if (changedPaths.length > MAX_SNAPSHOT_PATHS) throw new Error("repository state exceeds the changed-path limit");

  const paths = [...new Set([...tracked, ...untracked])].sort();
  if (paths.length > MAX_WORKTREE_FILES) throw new Error("repository state exceeds the worktree-file limit");
  const worktreeHasher = createHash("sha256");
  let totalBytes = 0;
  // Hash actual bytes, including Git-clean tracked files: filters and index
  // flags can conceal changes from status/diff. Never persist the file bodies.
  for (const path of paths) {
    const identity = readPathIdentity(root, path, {
      allowMissing: tracked.has(path),
      maxBytes: tracked.has(path) ? MAX_TRACKED_FILE_BYTES : MAX_SNAPSHOT_FILE_BYTES,
    });
    totalBytes += identity.bytes;
    if (totalBytes > MAX_WORKTREE_BYTES) throw new Error("repository state exceeds the worktree-byte limit");
    worktreeHasher.update(stableCanonicalJson(identity));
    worktreeHasher.update("\u0000");
  }

  const indexStatus = gitBuffer(root, ["diff", ...diffOptions, "--cached", "--quiet", "HEAD", "--"], { allowFailure: true }).status;
  if (indexStatus !== 0 && indexStatus !== 1) throw new Error("Git index state is unverifiable");
  return {
    repository_id: repositoryId,
    branch,
    head,
    tree,
    index_state: indexStatus === 1 ? "dirty" : "clean",
    worktree_state: statusBytes.length > 0 ? "dirty" : "clean",
    status_digest: sha256(statusBytes),
    index_digest: sha256(indexEntries),
    worktree_digest: `sha256:${worktreeHasher.digest("hex")}`,
    changed_paths: changedPaths,
  };
}

function loadPlanBundle(bundle) {
  if (!bundle || typeof bundle !== "object") throw new Error("planBundle is required");
  const { plan, policy, decision, context, previousPlan, previousContext, previousPolicy, previousDecision } = bundle;
  // Do not forward caller-controlled schema paths or other validator options.
  const options = { policy, decision, context, previousPlan, previousContext, previousPolicy, previousDecision };
  const issues = validateWorkPackagePlan(plan, options);
  if (issues.length > 0) {
    throw new Error(`Work Package Plan is invalid: ${issues.slice(0, 8).map((entry) => `${entry.code}@${entry.path}`).join(", ")}`);
  }
  // A valid proposed plan may be saved, but it does not authorize work.
  // Keep the existing execution validator (including admission) authoritative.
  return { ...bundle, executionIssues: validateWorkPackagePlanExecutable(plan, options) };
}

function assertPlanTarget(root, repository, integrationBase, plan, activePackageId) {
  const active = packageById(plan, activePackageId);
  for (const target of [plan.repository, active.target_binding]) {
    if (repository.repository_id !== target.repository_id || repository.branch !== target.branch) {
      throw new Error("live repository/branch differs from the Work Package Plan target");
    }
    if (integrationBase.commit !== target.base_commit || integrationBase.tree !== target.base_tree) {
      throw new Error("integration base differs from the Work Package Plan target");
    }
    const actualTree = gitText(root, ["rev-parse", "--verify", `${target.base_commit}^{tree}`]);
    if (actualTree !== target.base_tree) throw new Error("Work Package Plan base tree differs from Git");
    const ancestry = gitBuffer(root, ["merge-base", "--is-ancestor", target.base_commit, repository.head], { allowFailure: true });
    if (ancestry.status !== 0) throw new Error("live HEAD is not a verified descendant of the Work Package Plan base");
  }
}

function planRef(plan) {
  return {
    plan_id: plan.plan_id,
    plan_revision: plan.plan_revision,
    plan_digest: plan.plan_digest,
  };
}

function validateSchema(value, schemaPath, label) {
  const issues = validateJsonSchema(value, { schemaPath });
  if (issues.length > 0) throw new Error(`${label} Schema validation failed: ${issues.slice(0, 8).join("; ")}`);
}

function packageById(plan, packageId) {
  const workPackage = plan.packages.find((entry) => entry.package_id === packageId);
  if (!workPackage) throw new Error(`unknown Work Package: ${packageId}`);
  return workPackage;
}

function planControls(plan) {
  return {
    open_blocker_ids: plan.blockers.filter((entry) => entry.status !== "resolved").map((entry) => entry.blocker_id).sort(),
    unresolved_decision_ids: plan.unresolved_decisions.filter((entry) => entry.status !== "resolved").map((entry) => entry.decision_id).sort(),
    required_approval_ids: plan.human_approvals.filter((entry) => entry.status !== "approved").map((entry) => entry.approval_id).sort(),
  };
}

function assertCompletedPackageClosure(plan, completedPackageIds, activePackageId) {
  if (!Array.isArray(completedPackageIds)) throw new Error("completedPackageIds must be an array");
  const completed = new Set(completedPackageIds);
  if (completed.size !== completedPackageIds.length) throw new Error("completed package IDs must be unique");
  if (completed.has(activePackageId)) throw new Error("active Work Package cannot already be completed");
  for (const packageId of completed) {
    const workPackage = packageById(plan, packageId);
    for (const dependencyId of workPackage.depends_on_package_ids) {
      if (!completed.has(dependencyId)) throw new Error(`completed Work Package ${packageId} is missing dependency ${dependencyId}`);
    }
  }
  const active = packageById(plan, activePackageId);
  for (const dependencyId of active.depends_on_package_ids) {
    if (!completed.has(dependencyId)) throw new Error(`active Work Package ${activePackageId} is missing completed dependency ${dependencyId}`);
  }
  return plan.packages.filter((entry) => completed.has(entry.package_id)).map((entry) => entry.package_id);
}

function captureBoundedPaths(root, paths, { allowMissing }) {
  if (!Array.isArray(paths) || paths.length > MAX_SNAPSHOT_PATHS) throw new Error("snapshot path list exceeds its bound");
  const unique = [...new Set(paths.map((path) => validateRelativePath(path)))].sort((left, right) => left.localeCompare(right, "en"));
  if (unique.length !== paths.length) throw new Error("snapshot path list contains duplicates");
  return unique.map((path) => readPathIdentity(root, path, { allowMissing }));
}

function evidenceRefs(verificationStoreRoot, ids) {
  if (!Array.isArray(ids) || ids.length > 64) throw new Error("verification evidence reference list exceeds its bound");
  const ordered = [...ids].sort();
  if (new Set(ordered).size !== ordered.length) throw new Error("verification evidence IDs must be unique");
  if (ordered.length > 0 && !verificationStoreRoot) throw new Error("verificationStoreRoot is required when evidence IDs are supplied");
  return ordered.map((evidenceId) => {
    const evidence = readVerificationEvidence({ storeRoot: verificationStoreRoot, evidenceId });
    return {
      evidence_id: evidence.evidence_id,
      evidence_digest: evidence.evidence_digest,
    };
  });
}

export function createRepositorySnapshot({
  repositoryRoot,
  planBundle,
  activePackageId,
  targetPaths = [],
  contractPaths = [],
  verificationStoreRoot = null,
  evidenceIds = [],
  integrationBase = null,
} = {}) {
  const { plan } = loadPlanBundle(planBundle);
  packageById(plan, activePackageId);
  const root = normalizedRepositoryRoot(repositoryRoot);
  const repository = captureGitState(root);
  if (repository.repository_id !== plan.repository.repository_id || repository.branch !== plan.repository.branch) {
    throw new Error("live repository/branch differs from the Work Package Plan target");
  }
  integrationBase ??= plan.repository.base_commit;
  if (typeof integrationBase !== "string" || !/^[A-Za-z0-9._/-]+$/u.test(integrationBase) || integrationBase.startsWith("-") || integrationBase.includes("..")) {
    throw new Error("integrationBase must be a bounded Git revision name");
  }
  const baseCommit = gitText(root, ["rev-parse", "--verify", `${integrationBase}^{commit}`]);
  const baseTree = gitText(root, ["rev-parse", "--verify", `${integrationBase}^{tree}`]);
  assertPlanTarget(root, repository, { commit: baseCommit, tree: baseTree }, plan, activePackageId);
  const snapshot = {
    artifact_kind: "ask_repository_snapshot",
    schema_version: REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
    repository,
    target_paths: captureBoundedPaths(root, targetPaths, { allowMissing: true }),
    plan_ref: planRef(plan),
    active_package_id: activePackageId,
    integration_base: { ref: integrationBase, commit: baseCommit, tree: baseTree },
    contract_refs: captureBoundedPaths(root, contractPaths, { allowMissing: false }),
    evidence_refs: evidenceRefs(verificationStoreRoot, evidenceIds),
    limitations: repository.worktree_state === "dirty" ? ["dirty_state_requires_same_working_environment"] : [],
  };
  validateSchema(snapshot, REPOSITORY_SNAPSHOT_SCHEMA_PATH, "repository snapshot");
  return snapshot;
}

export function createSessionCheckpoint({
  snapshotDigest,
  snapshot,
  planBundle,
  completedPackageIds = [],
  currentPhase = "implementation",
  nextTaskId = null,
  rolloverReason = "operator_request",
} = {}) {
  const { plan, executionIssues } = loadPlanBundle(planBundle);
  validateSchema(snapshot, REPOSITORY_SNAPSHOT_SCHEMA_PATH, "repository snapshot");
  if (canonicalDigest(snapshot) !== snapshotDigest) throw new Error("snapshot digest does not match snapshot content");
  if (stableCanonicalJson(snapshot.plan_ref) !== stableCanonicalJson(planRef(plan))) throw new Error("snapshot plan reference differs from the current Work Package Plan");
  const completed = assertCompletedPackageClosure(plan, completedPackageIds, snapshot.active_package_id);
  const active = packageById(plan, snapshot.active_package_id);
  const controls = planControls(plan);
  let nextAction;
  if (executionIssues.length > 0) {
    if (nextTaskId !== null) throw new Error("nextTaskId cannot bypass unresolved plan controls");
    nextAction = { kind: "await_control_resolution", package_id: active.package_id, task_id: null };
  } else {
    const taskId = nextTaskId ?? active.ordered_tasks[0]?.task_id ?? null;
    if (!taskId || !active.ordered_tasks.some((entry) => entry.task_id === taskId)) throw new Error("next task must name an ordered task in the active Work Package");
    nextAction = { kind: "ordered_task", package_id: active.package_id, task_id: taskId };
  }
  const checkpoint = {
    artifact_kind: "ask_session_checkpoint",
    schema_version: SESSION_CHECKPOINT_SCHEMA_VERSION,
    snapshot_ref: { digest: snapshotDigest },
    plan_ref: planRef(plan),
    active_package_id: active.package_id,
    completed_package_ids: completed,
    current_phase: currentPhase,
    ...controls,
    evidence_refs: snapshot.evidence_refs,
    next_action: nextAction,
    stop_condition_refs: active.stop_conditions.map((entry) => ({ package_id: active.package_id, code: entry.code })),
    rollover_reason: rolloverReason,
    adapter_capability: "restart_package_only",
  };
  validateSchema(checkpoint, SESSION_CHECKPOINT_SCHEMA_PATH, "session checkpoint");
  return checkpoint;
}

function checkpointSemantics(checkpoint, snapshot, plan, executionIssues) {
  const reasons = [];
  const expectedPlanRef = planRef(plan);
  if (stableCanonicalJson(checkpoint.plan_ref) !== stableCanonicalJson(expectedPlanRef)
    || stableCanonicalJson(snapshot.plan_ref) !== stableCanonicalJson(expectedPlanRef)) reasons.push("PLAN_REFERENCE_MISMATCH");
  if (checkpoint.active_package_id !== snapshot.active_package_id) reasons.push("ACTIVE_PACKAGE_MISMATCH");
  let active = null;
  try {
    active = packageById(plan, checkpoint.active_package_id);
    assertCompletedPackageClosure(plan, checkpoint.completed_package_ids, checkpoint.active_package_id);
  } catch {
    reasons.push("PACKAGE_OR_DEPENDENCY_INVALID");
  }
  const controls = planControls(plan);
  for (const field of ["open_blocker_ids", "unresolved_decision_ids", "required_approval_ids"]) {
    if (stableCanonicalJson(checkpoint[field]) !== stableCanonicalJson(controls[field])) reasons.push("PLAN_CONTROL_STATE_MISMATCH");
  }
  if (stableCanonicalJson(checkpoint.evidence_refs) !== stableCanonicalJson(snapshot.evidence_refs)) reasons.push("EVIDENCE_REFERENCE_MISMATCH");
  if (active) {
    const expectedStops = active.stop_conditions.map((entry) => ({ package_id: active.package_id, code: entry.code }));
    if (stableCanonicalJson(checkpoint.stop_condition_refs) !== stableCanonicalJson(expectedStops)) reasons.push("STOP_CONDITION_MISMATCH");
    if (checkpoint.next_action.package_id !== active.package_id) reasons.push("NEXT_ACTION_PACKAGE_MISMATCH");
    if (checkpoint.next_action.kind === "ordered_task"
      && !active.ordered_tasks.some((entry) => entry.task_id === checkpoint.next_action.task_id)) reasons.push("NEXT_ACTION_TASK_UNKNOWN");
    if ((checkpoint.next_action.kind === "await_control_resolution") !== (executionIssues.length > 0)
      || (executionIssues.length > 0 && checkpoint.next_action.task_id !== null)) reasons.push("NEXT_ACTION_CONTROL_STATE_MISMATCH");
  }
  return [...new Set(reasons)].sort();
}

function currentSnapshotComparable(repositoryRoot, snapshot) {
  const root = normalizedRepositoryRoot(repositoryRoot);
  let integrationBase = null;
  try {
    integrationBase = {
      ref: snapshot.integration_base.ref,
      commit: gitText(root, ["rev-parse", "--verify", `${snapshot.integration_base.ref}^{commit}`]),
      tree: gitText(root, ["rev-parse", "--verify", `${snapshot.integration_base.ref}^{tree}`]),
    };
  } catch {
    integrationBase = { ref: snapshot.integration_base.ref, commit: null, tree: null };
  }
  return {
    repository: captureGitState(root),
    target_paths: captureBoundedPaths(root, snapshot.target_paths.map((entry) => entry.path), { allowMissing: true }),
    integration_base: integrationBase,
    contract_refs: captureBoundedPaths(root, snapshot.contract_refs.map((entry) => entry.path), { allowMissing: false }),
  };
}

function repositoryMismatchReasons(expected, current) {
  const reasons = [];
  const fields = [
    ["repository_id", "REPOSITORY_MISMATCH"],
    ["branch", "BRANCH_MISMATCH"],
    ["head", "HEAD_MISMATCH"],
    ["tree", "TREE_MISMATCH"],
    ["index_state", "INDEX_STATE_MISMATCH"],
    ["worktree_state", "WORKTREE_STATE_MISMATCH"],
    ["status_digest", "STATUS_DIGEST_MISMATCH"],
    ["index_digest", "INDEX_DIGEST_MISMATCH"],
    ["worktree_digest", "WORKTREE_DIGEST_MISMATCH"],
  ];
  for (const [field, code] of fields) if (expected.repository[field] !== current.repository[field]) reasons.push(code);
  if (stableCanonicalJson(expected.repository.changed_paths) !== stableCanonicalJson(current.repository.changed_paths)) reasons.push("CHANGED_PATHS_MISMATCH");
  if (stableCanonicalJson(expected.target_paths) !== stableCanonicalJson(current.target_paths)) reasons.push("TARGET_PATH_IDENTITY_MISMATCH");
  if (stableCanonicalJson(expected.contract_refs) !== stableCanonicalJson(current.contract_refs)) reasons.push("CONTRACT_IDENTITY_MISMATCH");
  if (stableCanonicalJson(expected.integration_base) !== stableCanonicalJson(current.integration_base)) reasons.push("INTEGRATION_BASE_MISMATCH");
  return reasons;
}

function validateEvidenceReferences(storeRoot, refs) {
  const reasons = [];
  for (const ref of refs) {
    try {
      const evidence = readVerificationEvidence({ storeRoot, evidenceId: ref.evidence_id });
      if (evidence.evidence_digest !== ref.evidence_digest) reasons.push("EVIDENCE_DIGEST_MISMATCH");
    } catch {
      reasons.push("EVIDENCE_MISSING_OR_INVALID");
    }
  }
  return reasons;
}

function pathContains(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function assertCheckpointOutputs(root, storeRoot, resumeReferencePath) {
  // Publication must not mutate either the captured worktree or Git metadata,
  // including the common Git directory outside a linked worktree.
  const protectedRoots = [
    root,
    realpathSync(gitText(root, ["rev-parse", "--absolute-git-dir"])),
    realpathSync(resolve(root, gitText(root, ["rev-parse", "--git-common-dir"]))),
  ];
  const outputs = [["checkpoint store", storeRoot]];
  if (resumeReferencePath !== null) outputs.push(["resume reference", resumeReferencePath]);
  for (const [label, path] of outputs) {
    if (typeof path !== "string" || !path.trim()) throw new Error(`${label} requires a non-empty path`);
    const output = resolve(path);
    assertNoSymlinkPathSegments(output, label, { allowMissingLeaf: true });
    if (protectedRoots.some((protectedRoot) => pathContains(protectedRoot, output) || pathContains(output, protectedRoot))) {
      throw new Error(`${label} must be outside and not overlap the worktree or Git metadata`);
    }
  }
}

export function persistSessionCheckpoint({
  storeRoot,
  repositoryRoot,
  planBundle,
  activePackageId,
  completedPackageIds = [],
  currentPhase = "implementation",
  nextTaskId = null,
  rolloverReason = "operator_request",
  targetPaths = [],
  contractPaths = [],
  verificationStoreRoot = null,
  evidenceIds = [],
  integrationBase = null,
  resumeReferencePath = null,
} = {}) {
  const root = normalizedRepositoryRoot(repositoryRoot);
  assertCheckpointOutputs(root, storeRoot, resumeReferencePath);
  const snapshot = createRepositorySnapshot({
    repositoryRoot: root,
    planBundle,
    activePackageId,
    targetPaths,
    contractPaths,
    verificationStoreRoot,
    evidenceIds,
    integrationBase,
  });
  const snapshotDigest = canonicalDigest(snapshot);
  putContentAddressedJson({ storeRoot, artifact: snapshot, digest: snapshotDigest });
  const storedSnapshot = readContentAddressedJson({ storeRoot, digest: snapshotDigest }).value;
  validateSchema(storedSnapshot, REPOSITORY_SNAPSHOT_SCHEMA_PATH, "stored repository snapshot");

  const checkpoint = createSessionCheckpoint({
    snapshotDigest,
    snapshot: storedSnapshot,
    planBundle,
    completedPackageIds,
    currentPhase,
    nextTaskId,
    rolloverReason,
  });
  const checkpointDigest = canonicalDigest(checkpoint);
  putContentAddressedJson({ storeRoot, artifact: checkpoint, digest: checkpointDigest });
  const storedCheckpoint = readContentAddressedJson({ storeRoot, digest: checkpointDigest }).value;
  validateSchema(storedCheckpoint, SESSION_CHECKPOINT_SCHEMA_PATH, "stored session checkpoint");

  // Read-back shape checks alone do not prove that publication left a resumable
  // state. Preserve unreferenced CAS objects, but never publish a stale entrypoint.
  const resume = validateSessionResume({
    repositoryRoot: root,
    storeRoot,
    checkpointDigest,
    planBundle,
    verificationStoreRoot,
  });
  if (!resume.state_valid) {
    throw new Error(`checkpoint state changed or became invalid during publication: ${resume.reasons.join(", ")}`);
  }

  const reference = {
    artifact_kind: "ask_session_checkpoint_reference",
    schema_version: "1.0.0",
    checkpoint_digest: checkpointDigest,
    snapshot_digest: snapshotDigest,
  };
  if (resumeReferencePath) {
    writeCanonicalJsonNoReplace({ outputPath: resumeReferencePath, artifact: reference, label: "resume checkpoint reference" });
  }
  return { snapshot, checkpoint, reference, snapshotDigest, checkpointDigest };
}

export function validateSessionResume({
  repositoryRoot,
  storeRoot,
  checkpointDigest,
  planBundle,
  verificationStoreRoot = null,
} = {}) {
  let bundle;
  try {
    bundle = loadPlanBundle(planBundle);
  } catch (error) {
    return { state_valid: false, status: "blocked", reasons: ["PLAN_INVALID"], detail: error.message, restart_package: null };
  }
  const { plan, executionIssues } = bundle;
  let checkpoint;
  let snapshot;
  try {
    checkpoint = readContentAddressedJson({ storeRoot, digest: checkpointDigest }).value;
    validateSchema(checkpoint, SESSION_CHECKPOINT_SCHEMA_PATH, "stored session checkpoint");
    snapshot = readContentAddressedJson({ storeRoot, digest: checkpoint.snapshot_ref.digest }).value;
    validateSchema(snapshot, REPOSITORY_SNAPSHOT_SCHEMA_PATH, "stored repository snapshot");
  } catch (error) {
    return {
      state_valid: false,
      status: "blocked",
      reasons: ["CHECKPOINT_OR_SNAPSHOT_MISSING_OR_INVALID"],
      detail: error.message,
      restart_package: null,
    };
  }

  const reasons = checkpointSemantics(checkpoint, snapshot, plan, executionIssues);
  let current = null;
  try {
    current = currentSnapshotComparable(repositoryRoot, snapshot);
    reasons.push(...repositoryMismatchReasons(snapshot, current));
    try {
      assertPlanTarget(normalizedRepositoryRoot(repositoryRoot), current.repository, current.integration_base, plan, checkpoint.active_package_id);
    } catch {
      reasons.push("PLAN_TARGET_BINDING_MISMATCH");
    }
  } catch (error) {
    reasons.push("REPOSITORY_STATE_UNVERIFIABLE");
  }
  if (snapshot.evidence_refs.length > 0) {
    if (!verificationStoreRoot) reasons.push("EVIDENCE_STORE_REQUIRED");
    else reasons.push(...validateEvidenceReferences(verificationStoreRoot, snapshot.evidence_refs));
  }
  if (reasons.length > 0) {
    return {
      state_valid: false,
      status: "blocked",
      reasons: [...new Set(reasons)].sort(),
      restart_package: null,
    };
  }
  // Valid saved state and execution permission are different results. Preserve
  // the bounded waiting package without granting an executable next action.
  const executionReasons = executionIssues.map((entry) => entry.code);
  if (checkpoint.open_blocker_ids.length > 0) executionReasons.push("OPEN_BLOCKER");
  if (checkpoint.unresolved_decision_ids.length > 0) executionReasons.push("HUMAN_DECISION_REQUIRED");
  if (checkpoint.required_approval_ids.length > 0) executionReasons.push("HUMAN_APPROVAL_REQUIRED");

  const restartPackage = {
    artifact_kind: "ask_validated_restart_package",
    schema_version: "1.0.0",
    repository: {
      repository_id: snapshot.repository.repository_id,
      branch: snapshot.repository.branch,
      head: snapshot.repository.head,
      tree: snapshot.repository.tree,
    },
    plan_ref: checkpoint.plan_ref,
    active_package_id: checkpoint.active_package_id,
    completed_package_ids: checkpoint.completed_package_ids,
    current_phase: checkpoint.current_phase,
    evidence_refs: checkpoint.evidence_refs,
    open_blocker_ids: checkpoint.open_blocker_ids,
    unresolved_decision_ids: checkpoint.unresolved_decision_ids,
    required_approval_ids: checkpoint.required_approval_ids,
    next_action: checkpoint.next_action,
    stop_condition_refs: checkpoint.stop_condition_refs,
    checkpoint_digest: checkpointDigest,
    snapshot_digest: checkpoint.snapshot_ref.digest,
    adapter_capability: "restart_package_only",
  };
  return {
    state_valid: true,
    status: executionReasons.length > 0 ? "blocked" : "context_rollover_required",
    reasons: [...new Set(executionReasons)].sort(),
    restart_package: restartPackage,
    restart_package_digest: canonicalDigest(restartPackage),
  };
}

function loadPlanBundlePaths(paths) {
  const required = ["policy", "decision", "context", "plan"];
  const values = {};
  for (const key of required) {
    if (!paths?.[key]) throw new Error(`plan_bundle_paths.${key} is required`);
    values[key] = readJsonFileStrict(paths[key], `plan bundle ${key}`);
  }
  for (const key of ["previousPlan", "previousContext", "previousPolicy", "previousDecision"]) {
    if (paths?.[key]) values[key] = readJsonFileStrict(paths[key], `plan bundle ${key}`);
  }
  return values;
}

function parseCli() {
  const args = process.argv.slice(2);
  const [command, flag, requestPath] = args;
  if (args.length !== 3 || command !== "resume" || flag !== "--request" || !requestPath) {
    throw new Error("usage: node scripts/session-checkpoint.mjs resume --request <request.json>");
  }
  const request = readJsonFileStrict(requestPath, "session resume request");
  const result = validateSessionResume({
    repositoryRoot: request.repository_root,
    storeRoot: request.store_root,
    checkpointDigest: request.checkpoint_digest,
    planBundle: loadPlanBundlePaths(request.plan_bundle_paths),
    verificationStoreRoot: request.verification_store_root ?? null,
  });
  process.stdout.write(`${stableCanonicalJson(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    parseCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
