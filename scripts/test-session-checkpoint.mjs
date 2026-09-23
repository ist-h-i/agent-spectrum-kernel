import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRepositorySnapshot, createSessionCheckpoint, persistSessionCheckpoint, validateSessionResume } from "./session-checkpoint.mjs";
import { canonicalDigest, putContentAddressedJson, readJsonFileStrict, stableCanonicalJson } from "./content-addressed-store.mjs";
import {
  deriveWorkPackagePlanContentDigest,
  evaluateEpicAdmission,
  sealWorkPackagePlan,
  sealWorkPackagePlanValidationContext,
  validateWorkPackagePlan,
  validateWorkPackagePlanExecutable,
} from "./epic-admission-work-package-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.error ?? result.stderr}`);
  return result.stdout.trim();
}
function git(root, ...args) { return run("git", ["-C", root, ...args]); }
function fixture(path) { return readJsonFileStrict(resolve(ROOT, path), path); }
const fixtureBundle = {
  policy: fixture("docs/fixtures/epic-admission-policy.json"),
  decision: fixture("docs/fixtures/issue-275-slice-1-epic-admission-decision.json"),
  context: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json"),
  plan: fixture("docs/fixtures/issue-275-slice-1-work-package-plan.json"),
  previousPlan: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-r2.json"),
  previousContext: fixture("docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json"),
};

function closePlanContextBinding(bundle) {
  let plan = sealWorkPackagePlan(bundle.plan);
  bundle.context.current_plan_ref = {
    plan_id: plan.plan_id,
    plan_revision: plan.plan_revision,
    lifecycle_state: plan.lifecycle_state,
    plan_content_digest: deriveWorkPackagePlanContentDigest(plan),
  };
  const context = sealWorkPackagePlanValidationContext(bundle.context);
  plan.validation_context_ref = {
    context_id: context.context_id,
    context_revision: context.context_revision,
    context_digest: context.context_digest,
  };
  plan = sealWorkPackagePlan(plan);
  const result = { ...bundle, plan, context };
  assert.equal(deriveWorkPackagePlanContentDigest(plan), context.current_plan_ref.plan_content_digest);
  return result;
}

function bindPlan(repo) {
  const bundle = structuredClone(fixtureBundle);
  const target = {
    repository_id: "ist-h-i/agent-spectrum-kernel",
    branch: git(repo, "symbolic-ref", "--short", "HEAD"),
    base_commit: git(repo, "rev-parse", "HEAD"),
    base_tree: git(repo, "rev-parse", "HEAD^{tree}"),
  };
  bundle.decision = evaluateEpicAdmission({
    policy: bundle.policy,
    subject: { ...bundle.decision.subject, ...target },
    observed_signals: bundle.decision.observed_signals,
    decision_revision: bundle.decision.decision_revision,
  });
  const decisionRef = {
    decision_id: bundle.decision.decision_id,
    decision_revision: bundle.decision.decision_revision,
    decision_digest: bundle.decision.decision_digest,
  };
  bundle.plan.repository = target;
  bundle.context.repository = structuredClone(target);
  bundle.plan.admission_decision_ref = decisionRef;
  bundle.context.current_admission_decision_ref = structuredClone(decisionRef);
  for (const workPackage of bundle.plan.packages) workPackage.target_binding = structuredClone(target);
  for (const unit of bundle.plan.topology.publication_units) {
    unit.branch = target.branch;
    unit.base_commit = target.base_commit;
  }
  const result = closePlanContextBinding(bundle);
  assert.deepEqual(validateWorkPackagePlanExecutable(result.plan, result), [], "temporary Plan must pass the real authority validator");
  return result;
}

const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-session-checkpoint-")));
let passed = 0;
function checked(name) { passed += 1; console.log(`ok ${passed} - ${name}`); }
function repository(name) {
  const repo = resolve(root, name);
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "ASK Test");
  git(repo, "remote", "add", "origin", "https://github.com/ist-h-i/agent-spectrum-kernel.git");
  writeFileSync(resolve(repo, "work.txt"), "bounded work\n");
  writeFileSync(resolve(repo, "contract.txt"), "contract v1\n");
  writeFileSync(resolve(repo, "private.txt"), "do-not-copy-this-body\n");
  writeFileSync(resolve(repo, "empty.txt"), "");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "fixture");
  git(repo, "checkout", "-b", "feature");
  const bundle = bindPlan(repo);
  const options = {
    repositoryRoot: repo,
    storeRoot: resolve(root, `${name}-store`),
    planBundle: bundle,
    activePackageId: bundle.plan.packages[1].package_id,
    completedPackageIds: [bundle.plan.packages[0].package_id],
  };
  mkdirSync(options.storeRoot);
  return { repo, bundle, options };
}
function resume(options, saved, overrides = {}) {
  return validateSessionResume({ ...options, checkpointDigest: saved.checkpointDigest, ...overrides });
}
function publishCheckpoint(options, checkpoint) {
  const checkpointDigest = canonicalDigest(checkpoint);
  putContentAddressedJson({ storeRoot: options.storeRoot, artifact: checkpoint, digest: checkpointDigest });
  return { checkpointDigest };
}
function expectBlocked(result, reason) {
  assert.equal(result.status, "blocked");
  assert.equal(result.state_valid, false);
  assert.ok(result.reasons.includes(reason), JSON.stringify(result));
  assert.equal(result.restart_package, null);
}
function freshResume(options, saved, name) {
  const planPaths = {};
  for (const [key, value] of Object.entries(options.planBundle)) {
    const path = resolve(root, `${name}-${key}.json`);
    writeFileSync(path, JSON.stringify(value));
    planPaths[key] = path;
  }
  const requestPath = resolve(root, `${name}-request.json`);
  writeFileSync(requestPath, JSON.stringify({
    repository_root: options.repositoryRoot,
    store_root: options.storeRoot,
    checkpoint_digest: saved.checkpointDigest,
    plan_bundle_paths: planPaths,
  }));
  return JSON.parse(run(process.execPath, [resolve(ROOT, "scripts/session-checkpoint.mjs"), "resume", "--request", requestPath]));
}

try {
  const { repo, bundle, options } = repository("repo");
  assert.throws(() => createRepositorySnapshot({ ...options, planBundle: fixtureBundle }), /branch|target|repository/iu);
  checked("a canonical fixture is not authority for an unrelated initial checkout");
  const saved = persistSessionCheckpoint({
    ...options,
    targetPaths: ["work.txt", "private.txt", "future.txt", "empty.txt"],
    contractPaths: ["contract.txt"],
    integrationBase: "main",
    resumeReferencePath: resolve(root, "resume-reference.json"),
  });
  assert.equal(saved.reference.checkpoint_digest, saved.checkpointDigest);
  assert.equal(saved.reference.snapshot_digest, saved.snapshotDigest);
  assert.equal(stableCanonicalJson(saved.snapshot).includes("do-not-copy-this-body"), false);
  assert.equal(readJsonFileStrict(resolve(root, "resume-reference.json"), "resume reference").checkpoint_digest, saved.checkpointDigest);
  const fresh = resume(options, saved);
  assert.equal(fresh.state_valid, true);
  assert.equal(fresh.status, "context_rollover_required");
  assert.equal(fresh.restart_package.active_package_id, options.activePackageId);
  assert.deepEqual(fresh.restart_package.completed_package_ids, options.completedPackageIds);
  assert.equal(fresh.restart_package.current_phase, "implementation");
  assert.equal(fresh.restart_package.next_action.task_id, bundle.plan.packages[1].ordered_tasks[0].task_id);
  assert.deepEqual(freshResume(options, saved, "clean"), fresh);
  checked("CAS publication, empty/missing paths, privacy and fresh-process continuation");

  appendFileSync(resolve(repo, "work.txt"), "unexpected change\n");
  expectBlocked(resume(options, saved), "WORKTREE_DIGEST_MISMATCH");
  git(repo, "checkout", "--", "work.txt");
  appendFileSync(resolve(repo, "contract.txt"), "changed contract\n");
  expectBlocked(resume(options, saved), "CONTRACT_IDENTITY_MISMATCH");
  git(repo, "checkout", "--", "contract.txt");
  checked("target and contract drift");

  git(repo, "checkout", "-b", "other");
  assert.throws(() => createRepositorySnapshot(options), /branch|target/iu);
  expectBlocked(resume(options, saved), "BRANCH_MISMATCH");
  const forgedSnapshot = structuredClone(saved.snapshot);
  forgedSnapshot.repository.branch = "other";
  const forgedSnapshotDigest = canonicalDigest(forgedSnapshot);
  putContentAddressedJson({ storeRoot: options.storeRoot, artifact: forgedSnapshot, digest: forgedSnapshotDigest });
  const forgedCheckpoint = structuredClone(saved.checkpoint);
  forgedCheckpoint.snapshot_ref.digest = forgedSnapshotDigest;
  expectBlocked(resume(options, publishCheckpoint(options, forgedCheckpoint)), "PLAN_TARGET_BINDING_MISMATCH");
  git(repo, "checkout", "feature");
  checked("initial branch mismatch and self-consistent branch transplant");

  git(repo, "remote", "set-url", "origin", "https://github.com/example/other-repo.git");
  expectBlocked(resume(options, saved), "REPOSITORY_MISMATCH");
  assert.throws(() => createRepositorySnapshot(options), /repository/iu);
  git(repo, "remote", "set-url", "origin", "https://github.com/ist-h-i/agent-spectrum-kernel.git");
  checked("wrong repository at creation and resume");

  const unknown = structuredClone(saved.checkpoint);
  unknown.active_package_id = "WP-unknown";
  expectBlocked(resume(options, publishCheckpoint(options, unknown)), "PACKAGE_OR_DEPENDENCY_INVALID");
  const dependency = structuredClone(saved.checkpoint);
  dependency.completed_package_ids = [bundle.plan.packages[1].package_id];
  dependency.active_package_id = bundle.plan.packages[2].package_id;
  expectBlocked(resume(options, publishCheckpoint(options, dependency)), "PACKAGE_OR_DEPENDENCY_INVALID");
  assert.throws(() => persistSessionCheckpoint({ ...options, completedPackageIds: [] }), /dependency/iu);
  assert.equal(putContentAddressedJson({ storeRoot: options.storeRoot, artifact: saved.snapshot, digest: saved.snapshotDigest }).created, false);
  expectBlocked(resume(options, { checkpointDigest: `sha256:${"0".repeat(64)}` }), "CHECKPOINT_OR_SNAPSHOT_MISSING_OR_INVALID");
  checked("unknown package, dependency closure, duplicate CAS and missing object");

  appendFileSync(resolve(repo, "work.txt"), "legitimate progress\n");
  git(repo, "add", "work.txt");
  git(repo, "commit", "-m", "progress after pinned base");
  expectBlocked(resume(options, saved), "HEAD_MISMATCH");
  const progressed = persistSessionCheckpoint(options);
  assert.equal(progressed.snapshot.integration_base.commit, bundle.plan.repository.base_commit);
  assert.notEqual(progressed.snapshot.repository.head, bundle.plan.repository.base_commit);
  assert.equal(resume(options, progressed).status, "context_rollover_required");
  assert.throws(() => createRepositorySnapshot({ ...options, integrationBase: "HEAD" }), /integration base/iu);
  checked("descendant HEAD accepted with pinned base; unrelated integration base rejected");

  git(repo, "checkout", "main");
  writeFileSync(resolve(repo, "base-only.txt"), "base moved\n");
  git(repo, "add", "base-only.txt");
  git(repo, "commit", "-m", "advance integration base");
  git(repo, "checkout", "feature");
  expectBlocked(resume(options, saved), "INTEGRATION_BASE_MISMATCH");
  assert.throws(() => createRepositorySnapshot({ ...options, integrationBase: "main" }), /integration base/iu);
  checked("moving integration ref cannot replace the Plan base");

  // A ref with the correct branch name but unrelated history is not continuation.
  const orphanCommit = run("git", ["-C", repo, "commit-tree", bundle.plan.repository.base_tree, "-m", "unrelated history"]);
  git(repo, "update-ref", "refs/heads/feature", orphanCommit);
  assert.throws(() => createRepositorySnapshot(options), /descendant/iu);
  checked("same branch name and tree do not substitute for base ancestry");

  for (const mode of ["textconv", "assume-unchanged", "staged-reverted"]) {
    const item = repository(`raw-${mode}`);
    const file = resolve(item.repo, "private.txt");
    if (mode === "textconv") {
      writeFileSync(resolve(item.repo, ".gitattributes"), "private.txt diff=lossy\n");
      git(item.repo, "add", ".gitattributes");
      git(item.repo, "commit", "-m", "lossy display configuration");
      git(item.repo, "config", "diff.lossy.textconv", "head -n 1");
      writeFileSync(file, "constant header\nfirst private value\n");
    } else if (mode === "assume-unchanged") {
      git(item.repo, "update-index", "--assume-unchanged", "private.txt");
    } else {
      writeFileSync(file, "staged private value\n");
      git(item.repo, "add", "private.txt");
      writeFileSync(file, "do-not-copy-this-body\n");
    }
    const beforeDiff = git(item.repo, "diff", "HEAD", "--", "private.txt");
    const before = persistSessionCheckpoint(item.options);
    assert.equal(resume(item.options, before).status, "context_rollover_required");
    writeFileSync(file, mode === "textconv" ? "constant header\nsecond private value\n" : "second private value\n");
    if (mode !== "staged-reverted") assert.equal(git(item.repo, "diff", "HEAD", "--", "private.txt"), beforeDiff);
    expectBlocked(resume(item.options, before), "WORKTREE_DIGEST_MISMATCH");
    checked(`raw tracked identity outside targetPaths: ${mode}`);
  }

  const submodule = repository("submodule-parent");
  const child = repository("submodule-child");
  git(submodule.repo, "-c", "protocol.file.allow=always", "submodule", "add", child.repo, "nested");
  git(submodule.repo, "commit", "-am", "record submodule");
  git(submodule.repo, "config", "submodule.nested.ignore", "all");
  assert.throws(() => createRepositorySnapshot(submodule.options), /submodule/iu);
  appendFileSync(resolve(submodule.repo, "nested/work.txt"), "dirty nested change\n");
  assert.throws(() => createRepositorySnapshot(submodule.options), /submodule/iu);
  checked("clean and dirty submodules fail closed even with ignore=all");

  const bounded = repository("bounded");
  symlinkSync("missing-destination", resolve(bounded.repo, "dangling.txt"));
  assert.throws(() => createRepositorySnapshot({ ...bounded.options, targetPaths: ["dangling.txt"] }), /symlink/iu);
  rmSync(resolve(bounded.repo, "dangling.txt"));
  writeFileSync(resolve(bounded.repo, "oversized.txt"), Buffer.alloc(300 * 1024, 0x61));
  assert.throws(() => createRepositorySnapshot(bounded.options), /bounded|limit/iu);
  rmSync(resolve(bounded.repo, "oversized.txt"));
  checked("dangling symlink and oversized untracked file are rejected");

  const waiting = repository("waiting");
  for (const kind of ["blocker", "decision", "approval", "proposed"]) {
    let controlBundle = structuredClone(waiting.bundle);
    controlBundle.plan.lifecycle_state = kind === "proposed" ? "proposed" : "bounded";
    let field;
    let id;
    if (kind === "blocker") {
      const record = { blocker_id: "BLOCKER-RESUME", status: "open", description: "Requires resolution." };
      controlBundle.context.known_blockers.push(record);
      controlBundle.plan.blockers.push(structuredClone(record));
      field = "open_blocker_ids"; id = record.blocker_id;
    } else if (kind === "decision") {
      const record = { decision_id: "DECISION-RESUME", description: "Requires a human decision.", authority_kind: "human_program_owner" };
      controlBundle.context.required_human_decisions.push(record);
      controlBundle.plan.unresolved_decisions.push({ ...record, status: "unresolved" });
      field = "unresolved_decision_ids"; id = record.decision_id;
    } else if (kind === "approval") {
      const record = {
        approval_id: "APPROVAL-RESUME", description: "Requires approval.", authority_kind: "human_program_owner",
        status: "required", authority_ref: null, approval_evidence_ref: null, approval_evidence_digest: null,
      };
      controlBundle.context.required_human_approvals.push(record);
      controlBundle.plan.human_approvals.push(structuredClone(record));
      field = "required_approval_ids"; id = record.approval_id;
    }
    controlBundle = closePlanContextBinding(controlBundle);
    assert.deepEqual(validateWorkPackagePlan(controlBundle.plan, controlBundle), [], `${kind} must be valid saved state`);
    assert.ok(validateWorkPackagePlanExecutable(controlBundle.plan, controlBundle).length > 0, "existing execution gate remains strict");
    const controlOptions = { ...waiting.options, planBundle: controlBundle, currentPhase: "waiting_for_approval" };
    const controlSaved = persistSessionCheckpoint(controlOptions);
    const controlResult = resume(controlOptions, controlSaved);
    assert.equal(controlResult.status, "blocked");
    assert.equal(controlResult.state_valid, true);
    assert.equal(controlResult.restart_package.next_action.kind, "await_control_resolution");
    assert.equal(controlResult.restart_package.next_action.task_id, null);
    if (field) assert.ok(controlResult.restart_package[field].includes(id));
    assert.deepEqual(freshResume(controlOptions, controlSaved, `waiting-${kind}`), controlResult);
    assert.throws(() => persistSessionCheckpoint({ ...controlOptions, nextTaskId: controlBundle.plan.packages[1].ordered_tasks[0].task_id }), /bypass/iu);
    const forged = structuredClone(controlSaved.checkpoint);
    forged.next_action = { kind: "ordered_task", package_id: controlOptions.activePackageId, task_id: controlBundle.plan.packages[1].ordered_tasks[0].task_id };
    expectBlocked(resume(controlOptions, publishCheckpoint(controlOptions, forged)), "NEXT_ACTION_CONTROL_STATE_MISMATCH");
    if (field) {
      const hidden = structuredClone(controlSaved.checkpoint);
      hidden[field] = [];
      expectBlocked(resume(controlOptions, publishCheckpoint(controlOptions, hidden)), "PLAN_CONTROL_STATE_MISMATCH");
      const invalidAccepted = structuredClone(controlBundle);
      invalidAccepted.plan.lifecycle_state = "accepted";
      const invalidBundle = closePlanContextBinding(invalidAccepted);
      assert.throws(() => persistSessionCheckpoint({ ...controlOptions, planBundle: invalidBundle }), /invalid/iu);
    }
    checked(`persist and fresh-resume ${kind} without authorizing an ordered task`);
  }
  // Invalid snapshot shape must be rejected at the public builder boundary,
  // not deferred until a consumer happens to call resume.
  const invalidSnapshot = structuredClone(saved.snapshot);
  delete invalidSnapshot.repository;
  assert.throws(() => createSessionCheckpoint({
    snapshot: invalidSnapshot,
    snapshotDigest: canonicalDigest(invalidSnapshot),
    planBundle: bundle,
    completedPackageIds: options.completedPackageIds,
  }), /Schema validation/iu);
  checked("checkpoint builder rejects malformed snapshot shape");

  for (const kind of ["store", "reference", "ignored", "git-metadata", "symlink"]) {
    const item = repository(`publication-${kind}`);
    const reference = resolve(root, `publication-${kind}-resume.json`);
    const unsafe = { ...item.options, resumeReferencePath: reference };
    const internalStore = resolve(item.repo, kind === "git-metadata" ? ".git/checkpoint-store" : "checkpoint-store");
    if (kind === "reference") unsafe.resumeReferencePath = resolve(item.repo, "resume.json");
    else if (kind === "symlink") {
      const alias = resolve(root, "publication-alias");
      symlinkSync(item.repo, alias);
      unsafe.resumeReferencePath = resolve(alias, "resume.json");
    } else {
      unsafe.storeRoot = internalStore;
      if (kind === "ignored") {
        writeFileSync(resolve(item.repo, ".gitignore"), "checkpoint-store/\n");
        git(item.repo, "add", ".gitignore");
        git(item.repo, "commit", "-m", "ignore checkpoint path");
      }
    }
    assert.throws(() => persistSessionCheckpoint(unsafe), /outside|overlap|symlink/iu);
    assert.equal(existsSync(internalStore), false);
    assert.equal(existsSync(unsafe.resumeReferencePath), false);
    assert.deepEqual(readdirSync(item.options.storeRoot), [], "invalid outputs must fail before CAS writes");
    checked(`unsafe ${kind} output rejected before publication`);
  }

  const mainWorktree = repository("publication-common-dir");
  const linked = resolve(root, "publication-linked");
  git(mainWorktree.repo, "worktree", "add", "-b", "linked", linked);
  const linkedBundle = bindPlan(linked);
  const metadataStore = resolve(mainWorktree.repo, ".git/checkpoint-store");
  assert.throws(() => persistSessionCheckpoint({
    ...mainWorktree.options, repositoryRoot: linked, planBundle: linkedBundle, storeRoot: metadataStore,
  }), /outside|overlap/iu);
  assert.equal(existsSync(metadataStore), false);
  checked("linked worktree cannot publish into shared Git metadata");

  // Deterministically mutate the checkout at the CAS publication boundary in a
  // fresh process. Product code has no test-only dependency injection surface.
  const raced = repository("publication-drift");
  const driftReference = resolve(root, "publication-drift-reference.json");
  const driftRequest = resolve(root, "publication-drift-request.json");
  writeFileSync(driftRequest, JSON.stringify({
    module_path: resolve(ROOT, "scripts/session-checkpoint.mjs"),
    options: { ...raced.options, resumeReferencePath: driftReference },
  }));
  run(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import { resolve } from "node:path";
    import { pathToFileURL } from "node:url";
    const request = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const original = fs.linkSync;
    let injected = false;
    fs.linkSync = (source, target) => {
      original(source, target);
      const artifact = JSON.parse(fs.readFileSync(target, "utf8"));
      if (artifact.artifact_kind === "ask_session_checkpoint") {
        injected = true;
        fs.appendFileSync(resolve(request.options.repositoryRoot, "work.txt"), "publication drift\\n");
      }
    };
    syncBuiltinESMExports();
    try {
      const { persistSessionCheckpoint } = await import(pathToFileURL(request.module_path));
      assert.throws(() => persistSessionCheckpoint(request.options), /changed|invalid.*publication/iu);
      assert.equal(injected, true, "test must reach the checkpoint publication boundary");
      assert.equal(fs.existsSync(request.options.resumeReferencePath), false);
    } finally {
      fs.linkSync = original;
      syncBuiltinESMExports();
    }
  `, driftRequest]);
  assert.equal(existsSync(driftReference), false);
  checked("publication drift suppresses the resume reference");

  const extraArguments = spawnSync(process.execPath, [
    resolve(ROOT, "scripts/session-checkpoint.mjs"), "resume", "--request", "missing-request.json", "--unexpected",
  ], { encoding: "utf8" });
  assert.equal(extraArguments.status, 1);
  assert.match(extraArguments.stderr, /usage:/u);
  checked("CLI rejects unexpected arguments before reading a request");

  const malformed = structuredClone(waiting.bundle);
  malformed.plan.plan_digest = `sha256:${"f".repeat(64)}`;
  assert.throws(() => persistSessionCheckpoint({ ...waiting.options, planBundle: malformed }), /invalid/iu);
  expectBlocked(validateSessionResume({ ...waiting.options, planBundle: malformed }), "PLAN_INVALID");
  checked("malformed Plan cannot become valid checkpoint state");
  console.log(`session checkpoint/resume tests passed: ${passed} regression groups`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
