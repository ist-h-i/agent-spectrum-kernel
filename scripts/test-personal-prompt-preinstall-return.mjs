// Private artificial operator drill; no exported uninstall API/real-target command.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { assertSetupWritePaths, captureApplyTarget, resultBinding } from "./ask-setup-apply-state.mjs";
import { buildSetupSourceIdentity } from "./ask-setup-inputs.mjs";
import { readGitRevision } from "./installer-lifecycle.mjs";
import { syntheticClosure } from "./test-helpers-personal-prompt-adoption.mjs";
import { PROMPT_PATHS, projection, verifiedInputs, verifyRollbackSelection } from "./ask-personal-prompt-adoption-materialization.mjs";
import { planPersonalPromptTargetApply, applyPersonalPromptTargetPlan, planPersonalPromptTargetRestore, restorePersonalPromptTargetPlan, inspectPersonalPromptTarget } from "./ask-personal-prompt-target.mjs";
import { PERSONAL_PROMPT_TARGET_STATE as STATE, PERSONAL_PROMPT_TARGET_LOCK as LOCK, withPersonalPromptTargetLock } from "./ask-personal-prompt-target-lock.mjs";
const repo = resolve(import.meta.dirname, ".."), ownedRoots = new Set();
const directories = [".agents/prompts", ".agents"], META = ".agent-spectrum-kernel";
const removals = [...PROMPT_PATHS, ...directories, STATE];
const source = () => buildSetupSourceIdentity(repo, { selectedSkills: [], coreAssets: [], revision: readGitRevision(repo) }).identity_digest;
function owned(t, prefix) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix))); ownedRoots.add(root);
  t.after(() => { ownedRoots.delete(root); rmSync(root, { recursive: true, force: true }); }); return root;
}
function tree(root, lock = null) {
  const value = captureApplyTarget(root), entries = value.entries.filter(e => !(lock && e.path === LOCK));
  return { entries, binding: resultBinding(value.binding.git, entries) };
}
function publish(saved, value) {
  const raw = Buffer.from(`${JSON.stringify(value)}\n`), digest = comparisonHash(raw), path = join(saved.archive, digest.slice(7) + ".json");
  writeFileSync(path, raw, { mode: 0o600, flag: "wx" }); assert.ok(readFileSync(path).equals(raw)); return digest;
}
function readPinned(saved, digest) {
  const bytes = readFileSync(join(saved.archive, digest.slice(7) + ".json")); assert.equal(comparisonHash(bytes), digest); return JSON.parse(bytes);
}
function reviewed(saved, completed = 0, checkpoint = null) {
  if (completed) {
    assert.ok(checkpoint); const prior = readPinned(saved, checkpoint); assert.equal(prior.completed, completed);
    assert.equal(prior.saved_digest, saved.pin);
  }
  return { saved_digest: saved.pin, completed, checkpoint, before: tree(saved.root).binding,
    destination: "proven_preinstall_absence", closure_digest: canonicalDigest(saved.f.closure) };
}
function checkAuthority(saved, record) {
  assert.equal(record.closure_digest, canonicalDigest(saved.f.closure));
  const { owned: inputs, closure } = verifiedInputs(saved.f.closure);
  const rollback = verifyRollbackSelection({ owned: inputs, closure, rollbackSelectionObjectDigest: saved.f.rollbackSelection });
  assert.equal(saved.state.personal_prompt.role, "parent"); assert.ok(!saved.state.personal_prompt.codex_lease);
  assert.equal(saved.state.personal_prompt.installed_lock_digest, rollback.selection.portfolio_lock.lock_digest);
  const parent = projection(inputs, closure, saved.f.parentSelection, "parent");
  for (const file of parent.files) assert.equal(saved.parentHashes[file.path], file.digest);
}
function check(saved, record, completed, lock = null) {
  // The same code cannot be pointed at an actual project by an argument or env.
  assert.ok(ownedRoots.has(saved.root)); assert.ok(ownedRoots.has(saved.archive));
  assert.equal(realpathSync(saved.root), saved.root); const stat = lstatSync(saved.root);
  assert.deepEqual({ dev: stat.dev, ino: stat.ino }, saved.targetIdentity);
  assert.equal(record.saved_digest, saved.pin); assert.equal(record.destination, "proven_preinstall_absence");
  assert.equal(source(), saved.source);
  const archived = readPinned(saved, saved.pin), initial = readPinned(saved, saved.initialPin);
  assert.equal(archived.initial_pin, saved.initialPin); assert.deepEqual(initial.initial, saved.initial);
  assert.equal(archived.created_directory_pin, saved.createdDirectoryPin);
  const created = readPinned(saved, saved.createdDirectoryPin); assert.equal(created.initial_pin, saved.initialPin);
  assert.deepEqual(created.directory_identities, saved.directoryIdentities);
  assert.deepEqual(initial.target_identity, saved.targetIdentity); assert.equal(initial.source, saved.source);
  assert.equal(initial.root, saved.root); assert.deepEqual(archived.directory_identities, saved.directoryIdentities);
  assert.deepEqual(archived.installed, saved.installed);
  assertSetupWritePaths(saved.root, [...removals, META, LOCK]);
  if (lock) {
    const st = lstatSync(join(saved.root, LOCK)); assert.deepEqual({ dev: st.dev, ino: st.ino }, lock.identity);
    assert.deepEqual(readdirSync(join(saved.root, LOCK)), []);
  } else assert.equal(existsSync(join(saved.root, LOCK)), false);
  const live = tree(saved.root, lock), removed = new Set(removals.slice(0, completed));
  assert.deepEqual(live.binding.git, saved.initial.binding.git);
  assert.deepEqual(live.entries, saved.installed.entries.filter(e => !removed.has(e.path)));
  for (const path of [...directories, META]) {
    if (removed.has(path)) { assert.equal(existsSync(join(saved.root, path)), false); continue; }
    const directory = lstatSync(join(saved.root, path)); assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
    assert.deepEqual({ dev: directory.dev, ino: directory.ino, mode: directory.mode & 0o777 }, saved.directoryIdentities[path]);
  }
  if (!completed) assert.deepEqual(live.binding, record.before);
  return live;
}
function manualRemove(saved, record, { authorized, confirm, failAfter = null }) {
  assert.equal(authorized, true); assert.equal(confirm, canonicalDigest(record));
  assert.ok(Number.isInteger(record.completed) && record.completed >= 0 && record.completed <= removals.length);
  if (record.completed) { const prior = readPinned(saved, record.checkpoint); assert.equal(prior.completed, record.completed); assert.equal(prior.saved_digest, saved.pin); }
  assert.deepEqual(tree(saved.root).binding, record.before); checkAuthority(saved, record); check(saved, record, record.completed);
  withPersonalPromptTargetLock(saved.root, lock => {
    checkAuthority(saved, record); check(saved, record, record.completed, lock);
    for (let i = record.completed; i < removals.length; i++) {
      const before = check(saved, record, i, lock), path = removals[i];
      const removed = new Set(removals.slice(0, i + 1));
      const expectedAfter = resultBinding(saved.initial.binding.git, saved.installed.entries.filter(e => !removed.has(e.path)));
      const intent = publish(saved, { kind: "private_manual_removal_intent", saved_digest: saved.pin, record_digest: canonicalDigest(record), completed: i,
        path, before: before.binding, expected_after: expectedAfter, original_entry: saved.installed.entries.find(e => e.path === path), directory_identity: saved.directoryIdentities[path] ?? null });
      if (directories.includes(path)) rmdirSync(join(saved.root, path)); else unlinkSync(join(saved.root, path));
      const after = check(saved, record, i + 1, lock);
      saved.checkpoint = publish(saved, { kind: "private_manual_removal_checkpoint", saved_digest: saved.pin, intent, completed: i + 1, after: after.binding });
      if (failAfter === i + 1) throw new Error("artificial checkpointed removal stop");
    }
  });
  const end = tree(saved.root); assert.deepEqual(end.binding.git, saved.initial.binding.git);
  assert.deepEqual(end.entries, [...saved.initial.entries, saved.installed.entries.find(e => e.path === META)].sort((a,b) => a.path < b.path ? -1 : 1));
  const st = lstatSync(join(saved.root, META));
  assert.deepEqual({ dev: st.dev, ino: st.ino, mode: st.mode & 0o777 }, saved.directoryIdentities[META]);
  const intent = publish(saved, { kind: "private_final_empty_directory_intent", saved_digest: saved.pin, record_digest: canonicalDigest(record), before: end.binding, expected_after: saved.initial.binding, directory_identity: saved.directoryIdentities[META] });
  rmdirSync(join(saved.root, META));
  assert.deepEqual(captureApplyTarget(saved.root).binding, saved.initial.binding);
  assert.equal(existsSync(join(saved.root, ".agents")), false); assert.equal(existsSync(join(saved.root, META)), false);
  return publish(saved, { kind: "private_manual_removal_complete", saved_digest: saved.pin, intent, final: captureApplyTarget(saved.root).binding });
}
function bootstrapParent(prepared, initialRecord, closure) {
  assert.equal(prepared.plan.source_identity_digest, initialRecord.source);
  assert.deepEqual(prepared.plan.target_identity, initialRecord.target_identity);
  assert.deepEqual(prepared.plan.target_before, initialRecord.initial.binding);
  return applyPersonalPromptTargetPlan({ prepared, closure, authorized: true, confirmedDigest: prepared.digest });
}
function installation(t, f, { exerciseInitialDrift = false } = {}) {
  const root = owned(t, "ask-preinstall-return-fixture-"), archive = owned(t, "ask-preinstall-return-records-");
  writeFileSync(join(root, "app.txt"), "Project owned application\n");
  const git = (...args) => { const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "--quiet"); git("add", "app.txt"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "owned fixture");
  const initial = captureApplyTarget(root); for (const path of [...removals, META]) assert.equal(existsSync(join(root, path)), false);
  const targetStat = lstatSync(root), targetIdentity = { dev: targetStat.dev, ino: targetStat.ino }, sourcePin = source();
  const initialPin = publish({ archive }, { schema: "artificial_preinstall_absence@1", root, target_identity: targetIdentity, source: sourcePin, initial });
  const privateInitial = readPinned({ archive }, initialPin); assert.deepEqual(privateInitial.initial, initial);
  assert.deepEqual(privateInitial.target_identity, targetIdentity); assert.equal(privateInitial.source, sourcePin);
  if (exerciseInitialDrift) {
    const injected = join(root, "fixture-mid-plan-edit.txt"); writeFileSync(injected, "New fixture edit after privately pinned baseline\n");
    const changed = captureApplyTarget(root).binding;
    const drifted = planPersonalPromptTargetApply({ targetRoot: root, closure: f.closure, role: "parent", selectionObjectDigest: f.parentSelection });
    assert.throws(() => bootstrapParent(drifted, privateInitial, f.closure));
    assert.deepEqual(captureApplyTarget(root).binding, changed);
    for (const path of [...removals, META]) assert.equal(existsSync(join(root, path)), false);
    unlinkSync(injected); // Only the explicitly injected owned artificial file.
  }
  const parent = planPersonalPromptTargetApply({ targetRoot: root, closure: f.closure, role: "parent", selectionObjectDigest: f.parentSelection });
  bootstrapParent(parent, privateInitial, f.closure);
  const directoryIdentities = Object.fromEntries([...directories, META].map(path => {
    const st = lstatSync(join(root, path)); return [path, { dev: st.dev, ino: st.ino, mode: st.mode & 0o777 }];
  }));
  const createdDirectoryPin = publish({ archive }, { schema: "artificial_preinstall_created_directories@1", initial_pin: initialPin, directory_identities: directoryIdentities });
  const candidate = planPersonalPromptTargetApply({ targetRoot: root, closure: f.closure, role: "candidate", selectionObjectDigest: f.candidateSelection });
  applyPersonalPromptTargetPlan({ prepared: candidate, closure: f.closure, authorized: true, confirmedDigest: candidate.digest });
  const rollback = planPersonalPromptTargetRestore({ targetRoot: root, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection });
  restorePersonalPromptTargetPlan({ prepared: rollback, closure: f.closure, authorized: true, confirmedDigest: rollback.digest });
  assert.equal(inspectPersonalPromptTarget({ targetRoot: root }).role, "parent");
  const rawState = readFileSync(join(root, STATE)), state = JSON.parse(rawState);
  for (const path of [...directories, META]) {
    const st = lstatSync(join(root, path)); assert.deepEqual({ dev: st.dev, ino: st.ino, mode: st.mode & 0o777 }, directoryIdentities[path]);
  }
  const saved = { root, archive, f, initial, initialPin, createdDirectoryPin, installed: captureApplyTarget(root), state, source: sourcePin,
    targetIdentity, directoryIdentities, parentHashes: Object.fromEntries(PROMPT_PATHS.map(path => [path, comparisonHash(readFileSync(join(root, path)))])) };
  saved.pin = publish(saved, { schema: "artificial_preinstall_return_record@1", initial_pin: initialPin, created_directory_pin: createdDirectoryPin, directory_identities: directoryIdentities, initial, installed: saved.installed, source: saved.source,
    raw_state: rawState.toString("base64"), parents: PROMPT_PATHS.map(path => ({ path, bytes: readFileSync(join(root, path)).toString("base64") })), parent, candidate, rollback });
  assert.equal(readPinned(saved, saved.pin).raw_state, rawState.toString("base64")); return saved;
}
test("operator return to proven pre-install absence stays separate from approved parent rollback", async t => {
  const f = syntheticClosure(t);
  await t.test("exact removal; missing authorization, changed pins, unknown edits and foreign lock stop", () => {
    const saved = installation(t, f, { exerciseInitialDrift: true }), record = reviewed(saved), confirm = canonicalDigest(record), before = tree(saved.root).binding;
    assert.throws(() => manualRemove(saved, record, { authorized: false, confirm }));
    assert.throws(() => manualRemove(saved, record, { authorized: true, confirm: canonicalDigest("wrong") }));
    const forged = { ...record, saved_digest: canonicalDigest("unknown") };
    assert.throws(() => manualRemove(saved, forged, { authorized: true, confirm: canonicalDigest(forged) }));
    assert.deepEqual(tree(saved.root).binding, before);
    const path = join(saved.root, PROMPT_PATHS[0]), bytes = readFileSync(path); writeFileSync(path, "UNKNOWN EDIT\n");
    const changed = tree(saved.root).binding; assert.throws(() => manualRemove(saved, reviewed(saved), { authorized: true, confirm: canonicalDigest(reviewed(saved)) }));
    assert.deepEqual(tree(saved.root).binding, changed); writeFileSync(path, bytes);
    mkdirSync(join(saved.root, LOCK)); const locked = tree(saved.root).binding, foreign = reviewed(saved);
    assert.throws(() => manualRemove(saved, foreign, { authorized: true, confirm: canonicalDigest(foreign) }));
    assert.deepEqual(tree(saved.root).binding, locked); rmdirSync(join(saved.root, LOCK));
    // Keep the old directory alive elsewhere so inode reuse cannot hide replacement.
    const pathToSwap = join(saved.root, ".agents/prompts"), retained = join(saved.archive, "retained-prompts");
    const originalMode = lstatSync(pathToSwap).mode & 0o777;
    renameSync(pathToSwap, retained); mkdirSync(pathToSwap, { mode: originalMode });
    const replacedDirectory = reviewed(saved), replaced = tree(saved.root).binding;
    assert.throws(() => manualRemove(saved, replacedDirectory, { authorized: true, confirm: canonicalDigest(replacedDirectory) }));
    assert.deepEqual(tree(saved.root).binding, replaced); rmdirSync(pathToSwap); renameSync(retained, pathToSwap);
    const completion = manualRemove(saved, record, { authorized: true, confirm }); assert.equal(readPinned(saved, completion).kind, "private_manual_removal_complete");
    t.diagnostic(JSON.stringify({ case: "normal", exact_initial_binding: true, parent_prompts_removed: 5, model_runs: 0, actual_target_writes: 0, archive_digest: saved.pin, completion }));
  });
  await t.test("checkpointed partial removal preserves unknown edits and needs a new exact reviewed record", () => {
    const saved = installation(t, f), record = reviewed(saved);
    assert.throws(() => manualRemove(saved, record, { authorized: true, confirm: canonicalDigest(record), failAfter: 1 }), /checkpointed removal stop/);
    assert.throws(() => inspectPersonalPromptTarget({ targetRoot: saved.root }), /personal_target_refused/);
    const checkpoint = saved.checkpoint, remaining = join(saved.root, PROMPT_PATHS[1]), bytes = readFileSync(remaining);
    writeFileSync(remaining, "UNKNOWN PARTIAL EDIT\n"); const changed = tree(saved.root).binding, unknown = reviewed(saved, 1, checkpoint);
    assert.throws(() => manualRemove(saved, unknown, { authorized: true, confirm: canonicalDigest(unknown) })); assert.deepEqual(tree(saved.root).binding, changed);
    writeFileSync(remaining, bytes); const resume = reviewed(saved, 1, checkpoint);
    assert.throws(() => manualRemove(saved, resume, { authorized: true, confirm: canonicalDigest(record) }));
    assert.throws(() => manualRemove(saved, resume, { authorized: true, confirm: canonicalDigest(resume), failAfter: 5 }), /checkpointed removal stop/);
    const emptyCheckpoint = saved.checkpoint, emptyPath = join(saved.root, ".agents/prompts"), oldEmpty = join(saved.archive, "retained-empty-prompts");
    const mode = lstatSync(emptyPath).mode & 0o777; renameSync(emptyPath, oldEmpty); mkdirSync(emptyPath, { mode });
    const unknownDirectory = reviewed(saved, 5, emptyCheckpoint), unknownTree = tree(saved.root).binding;
    assert.throws(() => manualRemove(saved, unknownDirectory, { authorized: true, confirm: canonicalDigest(unknownDirectory) }));
    assert.deepEqual(tree(saved.root).binding, unknownTree); rmdirSync(emptyPath); renameSync(oldEmpty, emptyPath);
    let next = reviewed(saved, 5, emptyCheckpoint);
    for (const [completed, path] of [[6, ".agents"], [8, META]]) {
      assert.throws(() => manualRemove(saved, next, { authorized: true, confirm: canonicalDigest(next), failAfter: completed }), /checkpointed removal stop/);
      const last = saved.checkpoint, current = join(saved.root, path), retained = join(saved.archive, `retained-directory-${completed}`);
      const mode = lstatSync(current).mode & 0o777; renameSync(current, retained); mkdirSync(current, { mode });
      const unknown = reviewed(saved, completed, last), frozen = tree(saved.root).binding;
      assert.throws(() => manualRemove(saved, unknown, { authorized: true, confirm: canonicalDigest(unknown) }));
      assert.deepEqual(tree(saved.root).binding, frozen); rmdirSync(current); renameSync(retained, current);
      next = reviewed(saved, completed, last);
    }
    const completion = manualRemove(saved, next, { authorized: true, confirm: canonicalDigest(next) });
    t.diagnostic(JSON.stringify({ case: "checkpointed_partial", exact_initial_binding: true, model_runs: 0, actual_target_writes: 0, archive_digest: saved.pin, checkpoint, completion }));
  });
});
