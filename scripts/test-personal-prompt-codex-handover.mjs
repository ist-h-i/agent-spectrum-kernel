import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { captureApplyTarget } from "./ask-setup-apply-state.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { syntheticClosure } from "./test-helpers-personal-prompt-adoption.mjs";
import { applyAdoptionPlan } from "./ask-setup-apply.mjs";
import { planPersonalPromptCodexHandover, handoverPersonalPromptCodexPlan, planPersonalPromptCodexReturn, returnPersonalPromptCodexPlan,
  planPersonalPromptTargetApply, applyPersonalPromptTargetPlan, planPersonalPromptTargetRestore, restorePersonalPromptTargetPlan,
  inspectPersonalPromptTarget, planPersonalPromptTargetRecovery, PERSONAL_PROMPT_TARGET_STATE } from "./ask-personal-prompt-target.mjs";
const repo = resolve(import.meta.dirname, ".."), CODEX = ".agent-spectrum-kernel/codex-install-state.json";
function run(script, args, expected = 0, preload = null) {
  const r = spawnSync(process.execPath, [...(preload ? ["--import", preload] : []), join(repo, "scripts", script), ...args], { cwd: repo, encoding: "utf8", timeout: 120000, env: { PATH: process.env.PATH } });
  assert.equal(r.status, expected, r.stdout + r.stderr); return r;
}
function target(t, profile = "full") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-codex-handover-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "AGENTS.md"), "Owned fixture project instructions\n"); writeFileSync(join(root, "app.txt"), "Owned fixture project\n");
  const git = (...args) => { const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "--quiet"); git("add", "AGENTS.md", "app.txt"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "owned fixture");
  run("install-kernel.mjs", ["--target", root, "--merge-agents"]); run("install-codex-adapter.mjs", ["--target", root, "--profile", profile]);
  return root;
}
function child(t, command, request, confirm = null, expected = 0, preload = null) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-codex-request-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "request.json"), bytes = Buffer.from(JSON.stringify(request)); writeFileSync(path, bytes, { mode: 0o600 });
  const args = [command, "--request", path, "--request-digest", comparisonHash(bytes), ...(confirm ? ["--authorized", "--confirm", confirm] : [])];
  return JSON.parse(run("ask-personal-prompt-target-cli.mjs", args, expected, preload).stdout);
}
test("explicit full Codex handover preserves compact controls and returns the exact owner", async t => {
  const f = syntheticClosure(t, { renderedSeed: buildCodexProjectionPlan({ profileName: "full" }).compactProfileArtifacts });
  const root = target(t), rawOwner = readFileSync(join(root, CODEX)), ownerStateDigest = comparisonHash(rawOwner);
  const opts = { targetRoot: root, closure: f.closure, selectionObjectDigest: f.parentSelection, ownerStateDigest };
  const mutate = prepared => ({ prepared, closure: f.closure, confirmedDigest: prepared.digest, authorized: true, ownerStateDigest });
  const baselineDoctor = JSON.parse(run("ask-doctor.mjs", ["--target", root, "--json"]).stdout);
  assert.notEqual(baselineDoctor.status, "fail");
  const baseline = captureApplyTarget(root), protectedFiles = baseline.entries.filter(entry => entry.type === "file" && !entry.path.startsWith(".agents/prompts/") && entry.path !== CODEX);
  await t.test("explicit independent owner pin and exact current full parent are required", () => {
    const before = captureApplyTarget(root).binding;
    assert.throws(() => planPersonalPromptTargetApply({ targetRoot: root, closure: f.closure, selectionObjectDigest: f.parentSelection, role: "parent" }), /personal_target_/);
    assert.throws(() => planPersonalPromptCodexHandover({ ...opts, ownerStateDigest: canonicalDigest("other owner") }), /personal_target_/);
    const p = planPersonalPromptCodexHandover(opts);
    const missing = mutate(p); delete missing.ownerStateDigest; assert.throws(() => handoverPersonalPromptCodexPlan(missing), /personal_target_/);
    assert.deepEqual(captureApplyTarget(root).binding, before);
    for (const damage of [state => delete state.managed_files[protectedFiles.find(e => e.path.startsWith(".agents/skills/")).path],
      state => state.selected_skills.pop(), state => state.actual_installed_inventory.pop(), state => state.compact_runtime_profiles.pop()]) {
      const changed = JSON.parse(rawOwner); damage(changed); const raw = Buffer.from(JSON.stringify(changed)); writeFileSync(join(root, CODEX), raw);
      const broken = captureApplyTarget(root).binding;
      assert.throws(() => planPersonalPromptCodexHandover({ ...opts, ownerStateDigest: comparisonHash(raw) }), /personal_target_/);
      assert.deepEqual(captureApplyTarget(root).binding, broken); writeFileSync(join(root, CODEX), rawOwner);
    }
  });
  let handed;
  await t.test("separate-process handover releases only five records and guards normal Codex operations", async () => {
    handed = child(t, "plan-handover", opts);
    assert.equal(child(t, "handover", { prepared: handed, closure: f.closure, ownerStateDigest }, handed.digest).status, "codex_handed_over");
    const delegated = JSON.parse(readFileSync(join(root, CODEX))), original = JSON.parse(rawOwner);
    assert.deepEqual(delegated.selected_prompts, original.selected_prompts); assert.deepEqual(delegated.projection_plan, original.projection_plan);
    assert.deepEqual(delegated.actual_installed_inventory, original.actual_installed_inventory);
    assert.equal(Object.keys(original.managed_files).length - Object.keys(delegated.managed_files).length, 5);
    for (const args of [[], ["--rollback"], ["--detach"]]) {
      const before = captureApplyTarget(root).binding;
      const r = run("install-codex-adapter.mjs", ["--target", root, "--profile", "full", "--force", ...args], 1);
      assert.match(r.stderr, /ownership|owner return/); assert.deepEqual(captureApplyTarget(root).binding, before);
    }
    const stopped = captureApplyTarget(root).binding;
    const setup = run("ask-setup.mjs", ["plan", "--target", root, "--adapter", "codex", "--profile", "full", "--json"], 1);
    assert.match(setup.stderr, /personal_prompt_owner_active/);
    const applied = await applyAdoptionPlan({ selection: { adapter: "codex" } }, { target: root, authorized: true });
    assert.equal(applied.status, "blocked"); assert.equal(applied.reason, "personal_prompt_owner_active"); assert.equal(applied.mutation_attempted, false);
    assert.deepEqual(captureApplyTarget(root).binding, stopped);
    const doctor = JSON.parse(run("ask-doctor.mjs", ["--target", root, "--json"], 1).stdout);
    assert.equal(doctor.status, "fail"); assert.ok(doctor.failures.some(item => /ownership is delegated/.test(item)));
  });
  await t.test("candidate retains all parent bytes, explicit rollback precedes exact owner return", () => {
    const candidate = planPersonalPromptTargetApply({ targetRoot: root, closure: f.closure, role: "candidate", selectionObjectDigest: f.candidateSelection });
    const { ownerStateDigest: ignored, ...candidateInput } = mutate(candidate); applyPersonalPromptTargetPlan(candidateInput);
    assert.throws(() => planPersonalPromptCodexReturn({ ...opts, selectionObjectDigest: f.candidateSelection }), /personal_target_/);
    const restore = planPersonalPromptTargetRestore({ targetRoot: root, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection });
    const { ownerStateDigest: ignored2, ...restoreInput } = mutate(restore); restorePersonalPromptTargetPlan(restoreInput);
    const returned = child(t, "plan-return", { ...opts, selectionObjectDigest: f.rollbackSelection });
    const sourceFaultRoot = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-source-view-"))); t.after(() => rmSync(sourceFaultRoot, { recursive: true, force: true }));
    const sourceFault = join(sourceFaultRoot, "source-view.mjs");
    writeFileSync(sourceFault, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const original=fs.readFileSync;fs.readFileSync=(path,...args)=>{if(path===${JSON.stringify(join(repo, ".git/HEAD"))}){const text='${"1".repeat(40)}';return typeof args[0]==='string'?text:Buffer.from(text);}return original(path,...args);};syncBuiltinESMExports();\n`);
    const unchanged = captureApplyTarget(root).binding;
    assert.equal(child(t, "plan-return", { ...opts, selectionObjectDigest: f.rollbackSelection }, null, 1, sourceFault).reason_code, "personal_target_refused");
    assert.deepEqual(captureApplyTarget(root).binding, unchanged);
    const protectedPath = join(root, protectedFiles.find(entry => entry.path.startsWith(".agents/skills/")).path), saved = readFileSync(protectedPath);
    writeFileSync(protectedPath, "non-Prompt drift"); const drifted = captureApplyTarget(root).binding;
    assert.throws(() => returnPersonalPromptCodexPlan(mutate(returned)), /personal_target_/); assert.deepEqual(captureApplyTarget(root).binding, drifted); writeFileSync(protectedPath, saved);
    assert.equal(child(t, "return", { prepared: returned, closure: f.closure, ownerStateDigest }, returned.digest).status, "codex_returned");
    assert.deepEqual(readFileSync(join(root, CODEX)), rawOwner); assert.equal(existsSync(join(root, PERSONAL_PROMPT_TARGET_STATE)), false);
    assert.throws(() => handoverPersonalPromptCodexPlan(mutate(handed)), /personal_target_/);
    const after = new Map(captureApplyTarget(root).entries.map(entry => [entry.path, entry]));
    for (const entry of protectedFiles) assert.deepEqual(after.get(entry.path), entry);
    const doctor = JSON.parse(run("ask-doctor.mjs", ["--target", root, "--json"]).stdout); assert.notEqual(doctor.status, "fail");
    run("install-codex-adapter.mjs", ["--target", root, "--profile", "full", "--check"]);
  });
  await t.test("profile mismatch, historical bundle and dropped compact controls refuse", () => {
    const partial = target(t, "implementation"), partialRaw = readFileSync(join(partial, CODEX)), before = captureApplyTarget(partial).binding;
    assert.throws(() => planPersonalPromptCodexHandover({ ...opts, targetRoot: partial, ownerStateDigest: comparisonHash(partialRaw) }), /personal_target_/);
    assert.deepEqual(captureApplyTarget(partial).binding, before);
    const historical = syntheticClosure(t), current = target(t), raw = readFileSync(join(current, CODEX));
    assert.throws(() => planPersonalPromptCodexHandover({ targetRoot: current, closure: historical.closure,
      selectionObjectDigest: historical.parentSelection, ownerStateDigest: comparisonHash(raw) }), /personal_target_/);
    const incompatible = syntheticClosure(t, { renderedSeed: buildCodexProjectionPlan({ profileName: "full" }).compactProfileArtifacts, candidateAppendOnly: false });
    const handover = planPersonalPromptCodexHandover({ targetRoot: current, closure: incompatible.closure, selectionObjectDigest: incompatible.parentSelection, ownerStateDigest: comparisonHash(raw) });
    handoverPersonalPromptCodexPlan({ prepared: handover, closure: incompatible.closure, confirmedDigest: handover.digest, authorized: true, ownerStateDigest: comparisonHash(raw) });
    const parent = captureApplyTarget(current).binding;
    assert.throws(() => planPersonalPromptTargetApply({ targetRoot: current, closure: incompatible.closure, role: "candidate", selectionObjectDigest: incompatible.candidateSelection }), /personal_target_/);
    assert.deepEqual(captureApplyTarget(current).binding, parent);
  });
  await t.test("partial paired owner writes remain stopped with both raw states preserved", () => {
    const faultRoot = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-pair-fault-"))); t.after(() => rmSync(faultRoot, { recursive: true, force: true }));
    for (const operation of ["handover", "return"]) {
      const current = target(t), raw = readFileSync(join(current, CODEX)), pin = comparisonHash(raw);
      const request = { targetRoot: current, closure: f.closure, selectionObjectDigest: f.parentSelection, ownerStateDigest: pin };
      const handover = planPersonalPromptCodexHandover(request);
      if (operation === "return") handoverPersonalPromptCodexPlan({ prepared: handover, closure: f.closure, confirmedDigest: handover.digest, authorized: true, ownerStateDigest: pin });
      const plan = operation === "handover" ? handover : planPersonalPromptCodexReturn(request);
      const fault = join(faultRoot, `${operation}.mjs`);
      writeFileSync(fault, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const method='${operation === "handover" ? "writeFileSync" : "unlinkSync"}',original=fs[method];fs[method]=(path,...args)=>{if(typeof path==='string'&&path.endsWith('/${PERSONAL_PROMPT_TARGET_STATE}'))throw Object.assign(new Error('owned paired-state fault'),{code:'EIO'});return original(path,...args);};syncBuiltinESMExports();\n`);
      const failed = child(t, operation, { prepared: plan, closure: f.closure, ownerStateDigest: pin }, plan.digest, 1, fault);
      assert.equal(failed.reason_code, "personal_target_recovery_required");
      const journalPath = join(current, `${PERSONAL_PROMPT_TARGET_STATE}.operation.json`), journal = JSON.parse(readFileSync(journalPath));
      assert.equal(journal.schema, "ask.personal-prompt-owner-operation@1");
      assert.ok(Buffer.from(journal.before_codex_state_base64, "base64").length); assert.ok(Buffer.from(journal.pending_codex_state_base64, "base64").length);
      const frozen = captureApplyTarget(current).binding;
      assert.throws(() => inspectPersonalPromptTarget({ targetRoot: current }), /personal_target_/);
      assert.throws(() => planPersonalPromptTargetRecovery({ targetRoot: current, closure: f.closure, originalPlanDigest: plan.digest,
        rollbackSelectionObjectDigest: f.rollbackSelection, rollbackTrustedPortfolioAuthorityContexts: [] }), /personal_target_/);
      run("install-codex-adapter.mjs", ["--target", current, "--profile", "full", "--force", "--rollback"], 1);
      assert.match(run("ask-setup.mjs", ["plan", "--target", current, "--adapter", "codex", "--profile", "full", "--json"], 1).stderr, /personal_prompt_owner_active/);
      const doctor = JSON.parse(run("ask-doctor.mjs", ["--target", current, "--json"], 1).stdout); assert.equal(doctor.status, "fail");
      assert.deepEqual(captureApplyTarget(current).binding, frozen); assert.equal(existsSync(journalPath), true);
    }
  });
});
