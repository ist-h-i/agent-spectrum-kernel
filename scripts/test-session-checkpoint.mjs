import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createRepositorySnapshot,
  persistSessionCheckpoint,
  validateSessionResume,
} from "./session-checkpoint.mjs";
import {
  canonicalDigest,
  putContentAddressedJson,
  readJsonFileStrict,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function git(root, ...args) {
  return run("git", ["-C", root, ...args]);
}

function fixture(path) {
  return readJsonFileStrict(resolve(ROOT, path), path);
}

const planBundle = {
  policy: fixture("docs/fixtures/epic-admission-policy.json"),
  decision: fixture("docs/fixtures/issue-275-slice-1-epic-admission-decision.json"),
  context: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json"),
  plan: fixture("docs/fixtures/issue-275-slice-1-work-package-plan.json"),
  previousPlan: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-r2.json"),
  previousContext: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json"),
};

const root = mkdtempSync(resolve(tmpdir(), "ask-session-checkpoint-"));
const repo = resolve(root, "repo");
const store = resolve(root, "store");
mkdirSync(repo);
mkdirSync(store);
try {
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "ASK Test");
  git(repo, "remote", "add", "origin", "https://github.com/example/resume-fixture.git");
  writeFileSync(resolve(repo, "work.txt"), "bounded work\n", "utf8");
  writeFileSync(resolve(repo, "contract.txt"), "contract v1\n", "utf8");
  writeFileSync(resolve(repo, "private.txt"), "do-not-copy-this-body\n", "utf8");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "fixture");

  const active = planBundle.plan.packages[1];
  const completed = [planBundle.plan.packages[0].package_id];
  const nextTaskId = active.ordered_tasks[0].task_id;
  const resumeRef = resolve(root, "resume-reference.json");
  const saved = persistSessionCheckpoint({
    storeRoot: store,
    repositoryRoot: repo,
    planBundle,
    activePackageId: active.package_id,
    completedPackageIds: completed,
    nextTaskId,
    targetPaths: ["work.txt", "private.txt", "future.txt"],
    contractPaths: ["contract.txt"],
    resumeReferencePath: resumeRef,
  });

  assert.equal(saved.reference.checkpoint_digest, saved.checkpointDigest);
  assert.equal(saved.reference.snapshot_digest, saved.snapshotDigest);
  assert.equal(stableCanonicalJson(saved.snapshot).includes("do-not-copy-this-body"), false);
  assert.equal(readJsonFileStrict(resumeRef, "resume reference").checkpoint_digest, saved.checkpointDigest);

  const fresh = validateSessionResume({
    repositoryRoot: repo,
    storeRoot: store,
    checkpointDigest: saved.checkpointDigest,
    planBundle,
  });
  assert.equal(fresh.state_valid, true);
  assert.equal(fresh.status, "context_rollover_required");
  assert.equal(fresh.restart_package.active_package_id, active.package_id);
  assert.deepEqual(fresh.restart_package.completed_package_ids, completed);
  assert.equal(fresh.restart_package.next_action.task_id, nextTaskId);

  const requestPath = resolve(root, "resume-request.json");
  writeFileSync(requestPath, JSON.stringify({
    repository_root: repo,
    store_root: store,
    checkpoint_digest: saved.checkpointDigest,
    plan_bundle_paths: {
      policy: resolve(ROOT, "docs/fixtures/epic-admission-policy.json"),
      decision: resolve(ROOT, "docs/fixtures/issue-275-slice-1-epic-admission-decision.json"),
      context: resolve(ROOT, "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json"),
      plan: resolve(ROOT, "docs/fixtures/issue-275-slice-1-work-package-plan.json"),
      previousPlan: resolve(ROOT, "docs/fixtures/issue-275-slice-1-work-package-plan-r2.json"),
      previousContext: resolve(ROOT, "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json"),
    },
  }), "utf8");
  const child = JSON.parse(run(process.execPath, [resolve(ROOT, "scripts/session-checkpoint.mjs"), "resume", "--request", requestPath]));
  assert.equal(child.status, "context_rollover_required");
  assert.equal(child.restart_package_digest, fresh.restart_package_digest);

  appendFileSync(resolve(repo, "work.txt"), "unexpected change\n");
  const dirty = validateSessionResume({ repositoryRoot: repo, storeRoot: store, checkpointDigest: saved.checkpointDigest, planBundle });
  assert.equal(dirty.status, "blocked");
  assert.ok(dirty.reasons.includes("WORKTREE_DIGEST_MISMATCH"));
  git(repo, "checkout", "--", "work.txt");

  git(repo, "checkout", "-b", "other");
  const wrongBranch = validateSessionResume({ repositoryRoot: repo, storeRoot: store, checkpointDigest: saved.checkpointDigest, planBundle });
  assert.equal(wrongBranch.status, "blocked");
  assert.ok(wrongBranch.reasons.includes("BRANCH_MISMATCH"));
  git(repo, "checkout", "main");

  const transplantRoot = resolve(root, "transplant");
  mkdirSync(transplantRoot);
  git(transplantRoot, "init", "-b", "main");
  git(transplantRoot, "config", "user.email", "test@example.com");
  git(transplantRoot, "config", "user.name", "ASK Test");
  git(transplantRoot, "remote", "add", "origin", "https://github.com/example/other-repo.git");
  cpSync(resolve(repo, "work.txt"), resolve(transplantRoot, "work.txt"));
  cpSync(resolve(repo, "private.txt"), resolve(transplantRoot, "private.txt"));
  cpSync(resolve(repo, "contract.txt"), resolve(transplantRoot, "contract.txt"));
  git(transplantRoot, "add", ".");
  git(transplantRoot, "commit", "-m", "fixture");
  const transplant = validateSessionResume({ repositoryRoot: transplantRoot, storeRoot: store, checkpointDigest: saved.checkpointDigest, planBundle });
  assert.equal(transplant.status, "blocked");
  assert.ok(transplant.reasons.includes("REPOSITORY_MISMATCH"));

  const unknownPackage = structuredClone(saved.checkpoint);
  unknownPackage.active_package_id = "WP-unknown";
  const unknownDigest = canonicalDigest(unknownPackage);
  putContentAddressedJson({ storeRoot: store, artifact: unknownPackage, digest: unknownDigest });
  const unknown = validateSessionResume({ repositoryRoot: repo, storeRoot: store, checkpointDigest: unknownDigest, planBundle });
  assert.equal(unknown.status, "blocked");
  assert.ok(unknown.reasons.includes("PACKAGE_OR_DEPENDENCY_INVALID"));

  const dependencyViolation = structuredClone(saved.checkpoint);
  dependencyViolation.completed_package_ids = [planBundle.plan.packages[1].package_id];
  dependencyViolation.active_package_id = planBundle.plan.packages[2].package_id;
  dependencyViolation.next_action.package_id = planBundle.plan.packages[2].package_id;
  dependencyViolation.next_action.task_id = planBundle.plan.packages[2].ordered_tasks[0].task_id;
  dependencyViolation.stop_condition_refs = planBundle.plan.packages[2].stop_conditions.map((entry) => ({ package_id: planBundle.plan.packages[2].package_id, code: entry.code }));
  const dependencyDigest = canonicalDigest(dependencyViolation);
  putContentAddressedJson({ storeRoot: store, artifact: dependencyViolation, digest: dependencyDigest });
  const dependencyResult = validateSessionResume({ repositoryRoot: repo, storeRoot: store, checkpointDigest: dependencyDigest, planBundle });
  assert.equal(dependencyResult.status, "blocked");
  assert.ok(dependencyResult.reasons.includes("PACKAGE_OR_DEPENDENCY_INVALID"));

  const duplicatePublication = putContentAddressedJson({ storeRoot: store, artifact: saved.snapshot, digest: saved.snapshotDigest });
  assert.equal(duplicatePublication.created, false);

  writeFileSync(resolve(repo, "oversized.txt"), Buffer.alloc(300 * 1024, 0x61));
  assert.throws(() => createRepositorySnapshot({
    repositoryRoot: repo,
    planBundle,
    activePackageId: active.package_id,
    targetPaths: ["oversized.txt"],
  }), /bounded|limit|regular file/i);
  rmSync(resolve(repo, "oversized.txt"));

  const missing = validateSessionResume({
    repositoryRoot: repo,
    storeRoot: store,
    checkpointDigest: `sha256:${"0".repeat(64)}`,
    planBundle,
  });
  assert.equal(missing.status, "blocked");
  assert.deepEqual(missing.reasons, ["CHECKPOINT_OR_SNAPSHOT_MISSING_OR_INVALID"]);

  console.log("session checkpoint/resume tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
