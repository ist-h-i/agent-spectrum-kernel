// Test-only operator drill. No exported repair API or user-target command.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson, parseJsonRejectDuplicateKeys, listContentAddressedJson } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { assertSetupWritePaths, captureApplyTarget, resultBinding } from "./ask-setup-apply-state.mjs";
import { buildSetupSourceIdentity } from "./ask-setup-inputs.mjs";
import { readGitRevision } from "./installer-lifecycle.mjs";
import { buildCodexProjectionPlan, inspectCodexFullInstallation } from "./install-codex-adapter.mjs";
import { syntheticClosure } from "./test-helpers-personal-prompt-adoption.mjs";
import { PROMPT_PATHS, projection, verifiedInputs, verifyRollbackSelection } from "./ask-personal-prompt-adoption-materialization.mjs";
import { planPersonalPromptCodexHandover, handoverPersonalPromptCodexPlan, planPersonalPromptCodexReturn,
  planPersonalPromptTargetApply, applyPersonalPromptTargetPlan, planPersonalPromptTargetRestore, restorePersonalPromptTargetPlan,
  inspectPersonalPromptTarget, planPersonalPromptTargetRecovery } from "./ask-personal-prompt-target.mjs";
import { PERSONAL_PROMPT_TARGET_STATE as STATE, PERSONAL_PROMPT_TARGET_JOURNAL as JOURNAL,
  PERSONAL_PROMPT_TARGET_MARKER as MARKER, PERSONAL_PROMPT_TARGET_LOCK as LOCK, PERSONAL_PROMPT_TARGET_EVIDENCE as EVIDENCE, withPersonalPromptTargetLock } from "./ask-personal-prompt-target-lock.mjs";
const repo = resolve(import.meta.dirname, ".."), CODEX = ".agent-spectrum-kernel/codex-install-state.json";
const raw = (root, path) => existsSync(join(root, path)) ? readFileSync(join(root, path)) : null;
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
function node(script, args, expected = 0, preload = null) {
  const r = spawnSync(process.execPath, [...(preload ? ["--import", preload] : []), join(repo, "scripts", script), ...args],
    { cwd: repo, encoding: "utf8", timeout: 120000, env: { PATH: process.env.PATH } });
  assert.equal(r.status, expected, r.stdout + r.stderr); return r;
}
function owned(t, prefix) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix))); t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}
function fixtureTarget(t) {
  const root = owned(t, "ask-manual-owner-fixture-");
  writeFileSync(join(root, "AGENTS.md"), "Owned fixture instructions\n"); writeFileSync(join(root, "app.txt"), "Owned fixture code\n");
  const git = (...args) => { const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "--quiet"); git("add", "AGENTS.md", "app.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "owned fixture");
  node("install-kernel.mjs", ["--target", root, "--merge-agents"]);
  node("install-codex-adapter.mjs", ["--target", root, "--profile", "full"]); return root;
}
function source() { return buildSetupSourceIdentity(repo, { selectedSkills: [], coreAssets: [], revision: readGitRevision(repo) }).identity_digest; }
const mutable = path => [STATE, CODEX, JOURNAL, MARKER].includes(path) || path === EVIDENCE || path.startsWith(`${EVIDENCE}/`);
// These checks model a separately reviewed, one-use human repair record. This is
// intentionally not a production planner, automatic repair or reusable command.
function reviewRecord(saved, closure, rollback, ownerPin) {
  return { original_plan_digest: saved.plan.digest, owner_pin: ownerPin, closure_digest: canonicalDigest(closure), rollback,
    observed_binding: captureApplyTarget(saved.root).binding, journal_digest: comparisonHash(raw(saved.root, JOURNAL)),
    marker_digest: raw(saved.root, MARKER) ? comparisonHash(raw(saved.root, MARKER)) : null, destination: "original_codex_owner_registered_parent" };
}
function checkOperatorRecord(saved, closure, reviewed, confirm, authorized, ownedLock = null) {
  assert.equal(authorized, true); assert.equal(confirm, canonicalDigest(reviewed));
  assert.equal(reviewed.destination, "original_codex_owner_registered_parent");
  assert.equal(reviewed.original_plan_digest, saved.plan.digest); assert.equal(saved.plan.digest, canonicalDigest(saved.plan.plan));
  assert.equal(reviewed.owner_pin, saved.ownerPin); assert.equal(comparisonHash(saved.originalOwner), saved.ownerPin);
  assert.equal(reviewed.closure_digest, canonicalDigest(closure));
  const { owned: inputs, closure: verified } = verifiedInputs(closure);
  verifyRollbackSelection({ owned: inputs, closure: verified, rollbackSelectionObjectDigest: reviewed.rollback });
  assert.equal(saved.plan.plan.source_identity_digest, source());
  const root = saved.root, st = lstatSync(root); assert.deepEqual(saved.plan.plan.target_identity, { dev: st.dev, ino: st.ino });
  assert.equal(saved.plan.plan.target_root, root); assert.equal(realpathSync(root), root); if (ownedLock) {
    const lock = lstatSync(join(root, LOCK)); assert.ok(lock.isDirectory() && !lock.isSymbolicLink());
    assert.deepEqual({ dev: lock.dev, ino: lock.ino }, ownedLock.identity); assert.deepEqual(readdirSync(join(root, LOCK)), []);
  } else assert.equal(existsSync(join(root, LOCK)), false);
  assertSetupWritePaths(root, [CODEX, STATE, JOURNAL, MARKER, EVIDENCE, ...PROMPT_PATHS]);
  const captured = captureApplyTarget(root), entries = captured.entries.filter(e => !(ownedLock && e.path === LOCK));
  const live = { entries, binding: resultBinding(captured.binding.git, entries) }; assert.deepEqual(live.binding, reviewed.observed_binding);
  for (const path of [CODEX, STATE, JOURNAL, MARKER]) {
    const entry = live.entries.find(e => e.path === path); if (!entry) continue;
    assert.equal(entry.type, "file");
    assert.equal(entry.mode, saved.before.entries.find(e => e.path === path)?.mode ?? 0o600, `unknown mode: ${path}`);
  }
  assert.deepEqual(live.binding.git, saved.before.binding.git);
  assert.deepEqual(live.entries.filter(e => !mutable(e.path)), saved.before.entries.filter(e => !mutable(e.path)));
  assert.equal(comparisonHash(raw(root, JOURNAL)), saved.incidentJournalDigest); assert.equal(reviewed.journal_digest, saved.incidentJournalDigest);
  const marker = raw(root, MARKER);
  assert.equal(marker ? comparisonHash(marker) : null, reviewed.marker_digest);
  if (marker) assert.equal(reviewed.marker_digest, saved.incidentMarkerDigest);
  const j = parseJsonRejectDuplicateKeys(raw(root, JOURNAL)); assert.equal(j.schema, "ask.personal-prompt-owner-operation@1");
  assert.deepEqual(Object.keys(j).sort(), ["schema", "original", "before_personal_state_base64", "pending_personal_state", "before_codex_state_base64", "pending_codex_state_base64", "before_entries"].sort());
  assert.deepEqual(j.original, saved.plan); assert.deepEqual(j.before_entries, saved.before.entries);
  assert.equal(j.before_codex_state_base64, saved.beforeOwner.toString("base64"));
  assert.equal(j.before_personal_state_base64, saved.beforePersonal?.toString("base64") ?? null);
  const afterOwner = Buffer.from(j.pending_codex_state_base64, "base64");
  assert.equal(comparisonHash(saved.beforeOwner), saved.plan.plan.before_owner_digest);
  assert.equal(comparisonHash(afterOwner), saved.plan.plan.after_owner_digest);
  assert.equal(canonicalDigest(j.pending_personal_state), saved.plan.plan.state_digest);
  assert.ok([saved.plan.plan.before_owner_digest, saved.plan.plan.after_owner_digest].includes(comparisonHash(raw(root, CODEX))));
  const personal = raw(root, STATE), prior = saved.beforePersonal, pending = j.pending_personal_state;
  const pendingBytes = pending === null ? null : Buffer.from(`${JSON.stringify(pending, null, 2)}\n`);
  const sameBytes = (a, b) => a === null ? b === null : b !== null && a.equals(b);
  assert.ok(sameBytes(personal, prior) || sameBytes(personal, pendingBytes));
  for (const entry of saved.before.entries.filter(e => e.path === EVIDENCE || e.path.startsWith(`${EVIDENCE}/`))) assert.deepEqual(live.entries.find(e => e.path === entry.path), entry);
  listContentAddressedJson({ storeRoot: join(root, EVIDENCE), maximumBytes: 96 * 1024 * 1024 });
  if (marker) {
    const m = parseJsonRejectDuplicateKeys(marker);
    assert.deepEqual(Object.keys(m).sort(), ["install_status", "state_path", "owner_operation", "original_plan_digest", "pending_state", "pending_owner_digest"].sort());
    assert.equal(m.install_status, "in_progress"); assert.equal(m.state_path, STATE); assert.equal(m.original_plan_digest, saved.plan.digest); assert.equal(m.owner_operation, saved.plan.plan.operation);
    assert.equal(m.pending_owner_digest, saved.plan.plan.after_owner_digest); assert.ok(equal(m.pending_state, pending));
  } else {
    // A retained journal alone is supported only at an exact completed pair or
    // the reviewed normal-owner destination, never an ambiguous mixed pair.
    const completedPair = comparisonHash(raw(root, CODEX)) === saved.plan.plan.after_owner_digest && sameBytes(personal, pendingBytes);
    const originalDestination = raw(root, CODEX).equals(saved.originalOwner) && personal === null;
    let reviewedManualPhase1 = false;
    if (!completedPair && !originalDestination && saved.phase1File) {
      const checkpointBytes = readFileSync(saved.phase1File); assert.equal(comparisonHash(checkpointBytes), saved.phase1FileDigest);
      const checkpoint = parseJsonRejectDuplicateKeys(checkpointBytes);
      assert.equal(checkpoint.schema, "ask.manual-owner-phase1-fixture@1");
      assert.equal(checkpoint.original_plan_digest, saved.plan.digest); assert.equal(checkpoint.start_record_digest, saved.phase1StartDigest);
      assert.equal(checkpoint.owner_pin, saved.ownerPin); assert.equal(checkpoint.journal_digest, saved.incidentJournalDigest);
      assert.deepEqual(checkpoint.end_binding, live.binding);
      assert.equal(checkpoint.personal_digest, personal ? comparisonHash(personal) : null);
      reviewedManualPhase1 = raw(root, CODEX).equals(saved.originalOwner);
    }
    assert.ok(completedPair || originalDestination || reviewedManualPhase1);
  }
  const parent = projection(inputs, verified, saved.parentSelection, "parent");
  for (const file of parent.files) assert.equal(comparisonHash(raw(root, file.path)), file.digest);
  const original = parseJsonRejectDuplicateKeys(saved.originalOwner); assert.equal(original.installer, "agent-spectrum-codex-adapter");
  assert.equal(original.selected_profile, "full"); assert.equal(original.personal_prompt_delegation, undefined);
  assert.equal(Object.keys(original.managed_files).filter(p => PROMPT_PATHS.includes(p)).length, 5);
  for (const [path, record] of Object.entries(original.managed_files)) assert.equal(comparisonHash(raw(root, path)), `sha256:${record.sha256}`);
  return live;
}

test("PV1-7 operator drill restores original Codex owner from known partial pairs only", async t => {
  const f = syntheticClosure(t, { renderedSeed: buildCodexProjectionPlan({ profileName: "full" }).compactProfileArtifacts });
  for (const operation of ["handover", "return"]) for (const phase of ["before_owner", "after_owner", "after_pair", "journal_cleanup"]) await t.test(`${operation}/${phase}`, () => {
    const root = fixtureTarget(t), work = owned(t, "ask-manual-owner-record-"), originalOwner = raw(root, CODEX), ownerPin = comparisonHash(originalOwner);
    const originalSnapshot = captureApplyTarget(root);
    const baselineDoctor = JSON.parse(node("ask-doctor.mjs", ["--target", root, "--json"]).stdout); assert.notEqual(baselineDoctor.status, "fail");
    const opts = { targetRoot: root, closure: f.closure, selectionObjectDigest: f.parentSelection, ownerStateDigest: ownerPin };
    const handover = planPersonalPromptCodexHandover(opts);
    const mutate = prepared => ({ prepared, closure: f.closure, authorized: true, confirmedDigest: prepared.digest });
    if (operation === "return") {
      handoverPersonalPromptCodexPlan({ ...mutate(handover), ownerStateDigest: ownerPin });
      applyPersonalPromptTargetPlan(mutate(planPersonalPromptTargetApply({ targetRoot: root, closure: f.closure, role: "candidate", selectionObjectDigest: f.candidateSelection })));
      restorePersonalPromptTargetPlan(mutate(planPersonalPromptTargetRestore({ targetRoot: root, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection })));
    }
    const plan = operation === "handover" ? handover : planPersonalPromptCodexReturn({ ...opts, selectionObjectDigest: f.rollbackSelection });
    const saved = { root, plan, originalOwner, ownerPin, beforeOwner: raw(root, CODEX), beforePersonal: raw(root, STATE), before: captureApplyTarget(root), parentSelection: f.parentSelection };
    assert.deepEqual(plan.plan.target_before, saved.before.binding);
    // Independently retained BEFORE the interruption; the journal is never its own pin.
    const beforeRecord = Buffer.from(JSON.stringify({ plan, ownerPin, originalOwner: originalOwner.toString("base64"), before: saved.before,
      beforeOwner: saved.beforeOwner.toString("base64"), beforePersonal: saved.beforePersonal?.toString("base64") ?? null }));
    const beforeRecordPin = comparisonHash(beforeRecord); writeFileSync(join(work, "before.json"), beforeRecord, { mode: 0o600, flag: "wx" });
    const method = phase === "before_owner" ? "writeFileSync" : ["after_pair", "journal_cleanup"].includes(phase) || operation === "return" ? "unlinkSync" : "writeFileSync";
    const faultPath = phase === "before_owner" ? CODEX : phase === "after_pair" ? MARKER : phase === "journal_cleanup" ? JOURNAL : STATE;
    const preload = join(work, "fault.mjs");
    writeFileSync(preload, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const old=fs.${method};fs.${method}=(p,...a)=>{if(p===${JSON.stringify(join(root, faultPath))})throw Object.assign(new Error('owned pair interruption'),{code:'EIO'});return old(p,...a);};syncBuiltinESMExports();\n`);
    const req = Buffer.from(JSON.stringify({ prepared: plan, closure: f.closure, ownerStateDigest: ownerPin })), path = join(work, "request.json"); writeFileSync(path, req, { mode: 0o600 });
    const result = JSON.parse(node("ask-personal-prompt-target-cli.mjs", [operation, "--request", path, "--request-digest", comparisonHash(req), "--authorized", "--confirm", plan.digest], 1, preload).stdout);
    assert.equal(result.reason_code, "personal_target_recovery_required");
    const reloadedBeforeBytes = readFileSync(join(work, "before.json")); assert.equal(comparisonHash(reloadedBeforeBytes), beforeRecordPin);
    const reloadedBefore = parseJsonRejectDuplicateKeys(reloadedBeforeBytes);
    assert.deepEqual(reloadedBefore.plan, saved.plan); assert.deepEqual(reloadedBefore.before, saved.before); assert.equal(reloadedBefore.ownerPin, saved.ownerPin);
    assert.deepEqual(Buffer.from(reloadedBefore.originalOwner, "base64"), saved.originalOwner);
    assert.deepEqual(Buffer.from(reloadedBefore.beforeOwner, "base64"), saved.beforeOwner);
    assert.deepEqual(reloadedBefore.beforePersonal === null ? null : Buffer.from(reloadedBefore.beforePersonal, "base64"), saved.beforePersonal);
    saved.incidentJournalDigest = comparisonHash(raw(root, JOURNAL));
    saved.incidentMarkerDigest = raw(root, MARKER) ? comparisonHash(raw(root, MARKER)) : null;
    const freeze = captureApplyTarget(root).binding;
    assert.throws(() => inspectPersonalPromptTarget({ targetRoot: root }), /personal_target_/);
    assert.throws(() => planPersonalPromptTargetRecovery({ targetRoot: root, closure: f.closure, originalPlanDigest: plan.digest, rollbackSelectionObjectDigest: f.rollbackSelection, rollbackTrustedPortfolioAuthorityContexts: [] }), /personal_target_/);
    node("install-codex-adapter.mjs", ["--target", root, "--profile", "full", "--force", "--rollback"], 1);
    assert.deepEqual(captureApplyTarget(root).binding, freeze);
    let reviewed = reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin);
    const check = (record = reviewed, closure = f.closure, authorized = true, lock = null) => checkOperatorRecord(saved, closure, record, canonicalDigest(record), authorized, lock);
    check();
    assert.throws(() => check(reviewed, f.closure, false));
    assert.throws(() => check({ ...reviewed, owner_pin: canonicalDigest("foreign owner") }));
    const untrusted = structuredClone(f.closure); untrusted.trustedPortfolioAuthorityContexts = untrusted.trustedPortfolioAuthorityContexts.filter(c => c.authority.kind !== "external_portfolio_rollback_authority");
    assert.throws(() => check(reviewRecord(saved, untrusted, f.rollbackSelection, ownerPin), untrusted));
    if (phase === "after_owner") {
      for (const file of [PROMPT_PATHS[0], "app.txt", CODEX, JOURNAL, MARKER]) {
        const original = raw(root, file); writeFileSync(join(root, file), "unknown operator edit\n"); const changed = captureApplyTarget(root).binding;
        assert.throws(() => check(reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin)));
        assert.deepEqual(captureApplyTarget(root).binding, changed); // Unknown bytes remain, no repair attempted.
        writeFileSync(join(root, file), original); // Independent fixture control reset, never part of the procedure.
      }
      // Reformatting a known pending JSON value remains an unknown raw endpoint.
      if (raw(root, STATE)) {
        const original = raw(root, STATE); writeFileSync(join(root, STATE), JSON.stringify(JSON.parse(original)));
        const altered = captureApplyTarget(root).binding; assert.throws(() => check(reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin)));
        assert.deepEqual(captureApplyTarget(root).binding, altered); writeFileSync(join(root, STATE), original);
      }
      for (const file of [CODEX, STATE, JOURNAL, MARKER].filter(file => existsSync(join(root, file)))) {
        const oldMode = lstatSync(join(root, file)).mode & 0o777; chmodSync(join(root, file), oldMode ^ 0o100);
        const altered = captureApplyTarget(root).binding; assert.throws(() => check(reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin)));
        assert.deepEqual(captureApplyTarget(root).binding, altered); chmodSync(join(root, file), oldMode);
      }
      mkdirSync(join(root, LOCK)); const locked = captureApplyTarget(root).binding;
      assert.throws(() => check()); assert.deepEqual(captureApplyTarget(root).binding, locked); rmdirSync(join(root, LOCK));
    }
    // Operator archives the raw observed pair/journal/marker BEFORE repair.
    check(); const archive = { schema: "ask.manual-owner-recovery-fixture@1", reviewed,
      journal: raw(root, JOURNAL).toString("base64"), marker: raw(root, MARKER)?.toString("base64") ?? null,
      codex: raw(root, CODEX).toString("base64"), personal: raw(root, STATE)?.toString("base64") ?? null };
    const archived = putContentAddressedJson({ storeRoot: join(work, "evidence"), maximumBytes: 96 * 1024 * 1024, artifact: archive });
    assert.deepEqual(readContentAddressedJson({ storeRoot: join(work, "evidence"), maximumBytes: 96 * 1024 * 1024, digest: archived.digest }).value, archive);
    // Human phase1: same shared lock and fresh in-lock comparison as normal
    // writers. No production repair function is introduced.
    saved.phase1StartDigest = canonicalDigest(reviewed);
    let phase1End;
    withPersonalPromptTargetLock(root, lock => {
      const beforeRepair = check(reviewed, f.closure, true, lock); writeFileSync(join(root, CODEX), originalOwner);
      assert.deepEqual(raw(root, CODEX), originalOwner);
      const after = captureApplyTarget(root), entries = after.entries.filter(e => e.path !== LOCK);
      const expectedEntries = beforeRepair.entries.map(e => e.path === CODEX ? originalSnapshot.entries.find(original => original.path === CODEX) : e);
      assert.deepEqual(entries, expectedEntries); phase1End = resultBinding(after.binding.git, entries);
      assert.deepEqual(after.binding.git, beforeRepair.binding.git);
    });
    if (operation === "handover" && phase === "journal_cleanup") {
      // Marker-absent mixed state is NOT a general endpoint. It needs the exact
      // independently retained approval and observed one-file phase1 delta.
      assert.throws(() => check(reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin)));
    }
    const checkpoint = Buffer.from(JSON.stringify({ schema: "ask.manual-owner-phase1-fixture@1", original_plan_digest: plan.digest,
      start_record_digest: saved.phase1StartDigest, owner_pin: ownerPin, journal_digest: saved.incidentJournalDigest,
      end_binding: phase1End, personal_digest: raw(root, STATE) ? comparisonHash(raw(root, STATE)) : null }));
    saved.phase1File = join(work, "phase1-completion.json"); saved.phase1FileDigest = comparisonHash(checkpoint);
    writeFileSync(saved.phase1File, checkpoint, { mode: 0o600, flag: "wx" });
    if (operation === "handover" && phase === "journal_cleanup") {
      writeFileSync(saved.phase1File, "unknown checkpoint\n"); const untouched = captureApplyTarget(root).binding;
      assert.throws(() => check(reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin)));
      assert.deepEqual(captureApplyTarget(root).binding, untouched); writeFileSync(saved.phase1File, checkpoint);
    }
    assert.equal(existsSync(join(root, JOURNAL)), true); assert.throws(() => inspectPersonalPromptTarget({ targetRoot: root }), /personal_target_/);
    if (phase === "after_owner" && operation === "handover") assert.throws(() => check());
    // Deliberate operator pause after phase1. Every continuation is separately
    // observed, confirmed and archived, even when the first write was a no-op.
    reviewed = reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin); check();
    writeFileSync(join(work, "phase2-confirmation.json"), JSON.stringify({ reviewed, confirmedDigest: canonicalDigest(reviewed) }), { mode: 0o600, flag: "wx" });
    withPersonalPromptTargetLock(root, lock => { check(reviewed, f.closure, true, lock); if (existsSync(join(root, STATE))) unlinkSync(join(root, STATE)); });
    assert.deepEqual(raw(root, CODEX), originalOwner); assert.equal(existsSync(join(root, STATE)), false);
    const trusted = verifiedInputs(f.closure);
    for (const file of projection(trusted.owned, trusted.closure, f.parentSelection, "parent").files) assert.equal(comparisonHash(raw(root, file.path)), file.digest);
    // A complete normal installation is independently checked while its stop
    // journal is still retained. This pure inspector performs no writes.
    inspectCodexFullInstallation(root);
    reviewed = reviewRecord(saved, f.closure, f.rollbackSelection, ownerPin); check();
    writeFileSync(join(work, "cleanup-confirmation.json"), JSON.stringify({ reviewed, confirmedDigest: canonicalDigest(reviewed) }), { mode: 0o600, flag: "wx" });
    withPersonalPromptTargetLock(root, lock => {
      check(reviewed, f.closure, true, lock);
      assert.equal(comparisonHash(raw(root, JOURNAL)), archive.reviewed.journal_digest);
      if (raw(root, MARKER)) { assert.equal(comparisonHash(raw(root, MARKER)), archive.reviewed.marker_digest); unlinkSync(join(root, MARKER)); }
      unlinkSync(join(root, JOURNAL));
    });
    node("install-codex-adapter.mjs", ["--target", root, "--profile", "full", "--check"]);
    const doctor = JSON.parse(node("ask-doctor.mjs", ["--target", root, "--json"]).stdout); assert.deepEqual(doctor, baselineDoctor);
    assert.deepEqual(raw(root, CODEX), originalOwner); assert.equal(existsSync(join(root, STATE)), false);
    const completed = captureApplyTarget(root); assert.deepEqual(completed.binding.git, saved.before.binding.git);
    assert.deepEqual(completed.entries.filter(e => !mutable(e.path)), saved.before.entries.filter(e => !mutable(e.path)));
    assert.equal(completed.entries.find(e => e.path === CODEX).mode, saved.before.entries.find(e => e.path === CODEX).mode);
    assert.equal(existsSync(join(root, JOURNAL)), false); assert.equal(existsSync(join(root, MARKER)), false); assert.equal(existsSync(join(root, LOCK)), false);
    assert.deepEqual(readContentAddressedJson({ storeRoot: join(work, "evidence"), maximumBytes: 96 * 1024 * 1024, digest: archived.digest }).value, archive);
    const replayBefore = captureApplyTarget(root).binding;
    assert.throws(() => handoverPersonalPromptCodexPlan({ ...mutate(handover), ownerStateDigest: ownerPin }), /personal_target_/);
    assert.deepEqual(captureApplyTarget(root).binding, replayBefore);
    t.diagnostic(JSON.stringify({ operation, phase, destination: reviewed.destination, archived_digest: archived.digest, original_owner_digest: ownerPin,
      parent_prompts_verified: 5, normal_installer_check: "passed", doctor: doctor.status, model_runs: 0, actual_target_writes: 0 }));
  });
});
