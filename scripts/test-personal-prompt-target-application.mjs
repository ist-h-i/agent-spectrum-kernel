import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { captureApplyTarget } from "./ask-setup-apply-state.mjs";
import { syntheticClosure } from "./test-helpers-personal-prompt-adoption.mjs";
import { planPersonalPromptTargetApply, applyPersonalPromptTargetPlan, planPersonalPromptTargetRestore,
  restorePersonalPromptTargetPlan, inspectPersonalPromptTarget, PERSONAL_PROMPT_TARGET_STATE } from "./ask-personal-prompt-target.mjs";
import { planPersonalPromptTargetRecovery, recoverPersonalPromptTargetPlan } from "./ask-personal-prompt-target.mjs";

const repo = resolve(import.meta.dirname, ".."), cli = join(repo, "scripts/ask-personal-prompt-target-cli.mjs");
function project(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-normal-target-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "AGENTS.md"), "Project-owned instructions\n");
  writeFileSync(join(root, "app.txt"), "Project-owned application\n");
  const run = (...args) => { const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  run("init", "--quiet"); run("add", "AGENTS.md", "app.txt");
  run("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "owned fixture");
  return { root, run };
}
function child(t, command, request, extra = [], expected = 0, preload = null) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-target-request-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "request.json"), bytes = Buffer.from(JSON.stringify(request));
  writeFileSync(path, bytes, { mode: 0o600 });
  const r = spawnSync(process.execPath, [...(preload ? ["--import", preload] : []), cli, command, "--request", path, "--request-digest", comparisonHash(bytes), ...extra],
    { cwd: repo, encoding: "utf8", timeout: 120000, env: { PATH: process.env.PATH } });
  assert.equal(r.status, expected, r.stdout + r.stderr); return JSON.parse(r.stdout);
}
test("normal target adoption/restoration is explicit, persistent and independently reverified", async t => {
  const f = syntheticClosure(t), x = project(t);
  const opts = (role, root = x.root) => ({ targetRoot: root, closure: f.closure, role,
    selectionObjectDigest: role === "parent" ? f.parentSelection : f.candidateSelection });
  const mutate = p => ({ prepared: p, closure: f.closure, confirmedDigest: p.digest, authorized: true });
  await t.test("parent, candidate and fresh rollback survive separate CLI processes", () => {
    const original = captureApplyTarget(x.root).binding.git;
    const parent = child(t, "plan-apply", opts("parent"));
    child(t, "apply", { prepared: parent, closure: f.closure }, ["--authorized", "--confirm", parent.digest]);
    const parentBytes = readFileSync(join(x.root, ".agents/prompts/skill-verify.md"));
    const candidate = child(t, "plan-apply", opts("candidate"));
    child(t, "apply", { prepared: candidate, closure: f.closure }, ["--authorized", "--confirm", candidate.digest]);
    assert.notDeepEqual(readFileSync(join(x.root, ".agents/prompts/skill-verify.md")), parentBytes);
    assert.equal(child(t, "status", { targetRoot: x.root }).role, "candidate");
    const rollback = child(t, "plan-restore", { targetRoot: x.root, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection });
    child(t, "restore", { prepared: rollback, closure: f.closure }, ["--authorized", "--confirm", rollback.digest]);
    assert.deepEqual(readFileSync(join(x.root, ".agents/prompts/skill-verify.md")), parentBytes);
    assert.equal(inspectPersonalPromptTarget({ targetRoot: x.root }).role, "parent");
    assert.equal(readFileSync(join(x.root, "AGENTS.md"), "utf8"), "Project-owned instructions\n");
    assert.equal(readFileSync(join(x.root, "app.txt"), "utf8"), "Project-owned application\n");
    assert.deepEqual(captureApplyTarget(x.root).binding.git, original);
    assert.throws(() => planPersonalPromptTargetApply(opts("candidate")), /personal_target_refused/);
  });
  await t.test("authorization, trust and confirmation refuse before target writes", () => {
    const y = project(t), p = planPersonalPromptTargetApply(opts("parent", y.root));
    const before = captureApplyTarget(y.root).binding;
    assert.throws(() => applyPersonalPromptTargetPlan({ ...mutate(p), authorized: false }), /personal_target_refused/);
    assert.throws(() => applyPersonalPromptTargetPlan({ ...mutate(p), confirmedDigest: canonicalDigest("wrong") }), /personal_target_refused/);
    assert.throws(() => applyPersonalPromptTargetPlan({ ...mutate(p), closure: { ...f.closure, trustedHumanDecisionAuthorities: [] } }), /personal_target_refused/);
    assert.equal(child(t, "apply", { prepared: p, closure: f.closure }, [], 1).reason_code, "personal_target_refused");
    const forged = structuredClone(p); forged.plan.inventory_digest = canonicalDigest("arbitrary files"); forged.digest = canonicalDigest(forged.plan);
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(forged)), /personal_target_refused/);
    const source = structuredClone(p); source.plan.source_identity_digest = canonicalDigest("other source"); source.digest = canonicalDigest(source.plan);
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(source)), /personal_target_refused/);
    assert.deepEqual(captureApplyTarget(y.root).binding, before);
  });
  await t.test("worktree, index, HEAD, foreign target, selection and input tricks refuse", () => {
    const y = project(t), p = planPersonalPromptTargetApply(opts("parent", y.root));
    writeFileSync(join(y.root, "app.txt"), "local change");
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(p)), /personal_target_refused/);
    writeFileSync(join(y.root, "app.txt"), "Project-owned application\n");
    y.run("add", "app.txt");
    // Bind index bytes, even if worktree bytes were put back.
    const staged = planPersonalPromptTargetApply(opts("parent", y.root));
    writeFileSync(join(y.root, "app.txt"), "stage change"); y.run("add", "app.txt");
    writeFileSync(join(y.root, "app.txt"), "Project-owned application\n");
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(staged)), /personal_target_refused/);
    const head = planPersonalPromptTargetApply(opts("parent", y.root));
    y.run("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "--allow-empty", "-m", "head changed");
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(head)), /personal_target_refused/);
    const foreign = structuredClone(p); foreign.plan.target_root = x.root; foreign.digest = canonicalDigest(foreign.plan);
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(foreign)), /personal_target_refused/);
    assert.throws(() => planPersonalPromptTargetApply({ ...opts("parent", y.root), selectionObjectDigest: f.candidateSelection }), /personal_target_refused/);
    let reads = 0; const hostile = { ...opts("parent", y.root), closure: { get storeRoot() { reads++; return f.closure.storeRoot; } } };
    assert.throws(() => planPersonalPromptTargetApply(hostile), /personal_target_refused/); assert.equal(reads, 0);
    assert.throws(() => planPersonalPromptTargetApply(new Proxy(opts("parent", y.root), { ownKeys() { throw new Error("trap"); } })), /personal_target_refused/);
    const z = project(t), bound = planPersonalPromptTargetApply(opts("parent", z.root)), retained = `${z.root}-retained`;
    renameSync(z.root, retained); t.after(() => rmSync(retained, { recursive: true, force: true }));
    cpSync(retained, z.root, { recursive: true, preserveTimestamps: true });
    assert.deepEqual(captureApplyTarget(z.root).binding, bound.plan.target_before);
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(bound)), /personal_target_refused/);
  });
  await t.test("foreign ownership, locks, partial state and unsafe paths remain untouched", () => {
    for (const kind of ["owner", "lock", "partial", "symlink", "hardlink", "empty-git"]) {
      const y = project(t); mkdirSync(join(y.root, ".agent-spectrum-kernel"));
      const state = join(y.root, PERSONAL_PROMPT_TARGET_STATE);
      if (kind === "owner") writeFileSync(join(y.root, ".agent-spectrum-kernel/codex-install-state.json"), JSON.stringify({ schema_version: 3, installer: "codex", managed_files: { ".agents/prompts/skill-verify.md": {} } }));
      if (kind === "lock") mkdirSync(`${state}.lock`);
      if (kind === "partial") writeFileSync(`${state}.in-progress.json`, "{}\n");
      if (kind === "empty-git") { rmSync(join(y.root, ".git"), { recursive: true }); mkdirSync(join(y.root, ".git")); }
      if (["symlink", "hardlink"].includes(kind)) {
        mkdirSync(join(y.root, ".agents/prompts"), { recursive: true });
        if (kind === "symlink") symlinkSync(join(y.root, "app.txt"), join(y.root, ".agents/prompts/skill-verify.md"));
        else linkSync(join(y.root, "app.txt"), join(y.root, ".agents/prompts/skill-verify.md"));
      }
      const before = captureApplyTarget(y.root).binding;
      assert.throws(() => planPersonalPromptTargetApply(opts("parent", y.root)), /personal_target_(?:refused|recovery_required)/);
      assert.deepEqual(captureApplyTarget(y.root).binding, before);
    }
  });
  await t.test("candidate drift and rollback snapshot tampering refuse on reload", () => {
    const y = project(t); applyPersonalPromptTargetPlan(mutate(planPersonalPromptTargetApply(opts("parent", y.root))));
    // The recorded parent receipt is history, never current adoption authority.
    // A later valid adoption may use the same physical parent with a different
    // receipt. Its accepted parent must still be restorable under this closure.
    const parentStatePath = join(y.root, PERSONAL_PROMPT_TARGET_STATE), parent = JSON.parse(readFileSync(parentStatePath));
    parent.personal_prompt.receipt_object_digest = canonicalDigest("older parent receipt metadata");
    writeFileSync(parentStatePath, JSON.stringify(parent));
    applyPersonalPromptTargetPlan(mutate(planPersonalPromptTargetApply(opts("candidate", y.root))));
    const restore = () => planPersonalPromptTargetRestore({ targetRoot: y.root, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection });
    const p = restore(), file = join(y.root, ".agents/prompts/skill-verify.md"), bytes = readFileSync(file);
    writeFileSync(file, "user edit"); assert.throws(restore, /personal_target_refused/);
    assert.throws(() => restorePersonalPromptTargetPlan(mutate(p)), /personal_target_refused/); writeFileSync(file, bytes);
    const statePath = join(y.root, PERSONAL_PROMPT_TARGET_STATE), originalState = readFileSync(statePath), state = JSON.parse(originalState);
    state.previous_successful_state.target.root = "/foreign-target"; writeFileSync(statePath, JSON.stringify(state));
    const before = captureApplyTarget(y.root).binding; assert.throws(restore, /personal_target_refused/);
    assert.deepEqual(captureApplyTarget(y.root).binding, before); assert.equal(existsSync(`${statePath}.in-progress.json`), false);
    writeFileSync(statePath, originalState); state.previous_successful_state.target.root = y.root;
    state.rollback.files[".agents/prompts/skill-verify.md"].content = "foreign rollback"; writeFileSync(statePath, JSON.stringify(state));
    assert.throws(restore, /personal_target_refused/);
    assert.equal(existsSync(`${statePath}.in-progress.json`), false);
    writeFileSync(statePath, originalState);
    assert.equal(restorePersonalPromptTargetPlan(mutate(restore())).status, "restored");
  });
  await t.test("controlled write failure retains partial outputs and pending snapshot; retry is refused", () => {
    const y = project(t), p = planPersonalPromptTargetApply(opts("parent", y.root));
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-write-fault-"))); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const preload = join(dir, "fault.mjs");
    writeFileSync(preload, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const original=fs.writeFileSync; fs.writeFileSync=(path,...args)=>{
 if(typeof path==='string'&&path.endsWith('/.agents/prompts/skill-review.md')) throw Object.assign(new Error('owned fixture I/O failure'),{code:'EIO'});
 return original(path,...args);}; syncBuiltinESMExports();\n`);
    const result = child(t, "apply", { prepared: p, closure: f.closure }, ["--authorized", "--confirm", p.digest], 1, preload);
    assert.equal(result.reason_code, "personal_target_recovery_required");
    const marker = join(y.root, `${PERSONAL_PROMPT_TARGET_STATE}.in-progress.json`);
    assert.ok(existsSync(marker)); assert.ok(existsSync(join(y.root, ".agents/prompts/skill-implement.md")));
    const pending = JSON.parse(readFileSync(marker)); assert.equal(Object.keys(pending.pending_state.rollback.files).length, 5);
    const before = captureApplyTarget(y.root).binding;
    assert.throws(() => applyPersonalPromptTargetPlan(mutate(p)), /personal_target_recovery_required/);
    assert.throws(() => inspectPersonalPromptTarget({ targetRoot: y.root }), /personal_target_recovery_required/);
    assert.deepEqual(captureApplyTarget(y.root).binding, before);
    const z = project(t); applyPersonalPromptTargetPlan(mutate(planPersonalPromptTargetApply(opts("parent", z.root))));
    applyPersonalPromptTargetPlan(mutate(planPersonalPromptTargetApply(opts("candidate", z.root))));
    const restore = planPersonalPromptTargetRestore({ targetRoot: z.root, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection });
    const state = join(z.root, PERSONAL_PROMPT_TARGET_STATE), savedCandidateState = readFileSync(state);
    const failedRestore = child(t, "restore", { prepared: restore, closure: f.closure }, ["--authorized", "--confirm", restore.digest], 1, preload);
    assert.equal(failedRestore.reason_code, "personal_target_recovery_required");
    const restorePending = JSON.parse(readFileSync(`${state}.in-progress.json`)).pending_state;
    assert.equal(restorePending.personal_prompt.role, "parent");
    assert.ok(Object.values(restorePending.rollback.files).every(file => typeof file.content === "string"));
    assert.deepEqual(readFileSync(state), savedCandidateState);
    const partialRestore = captureApplyTarget(z.root).binding;
    assert.throws(() => restorePersonalPromptTargetPlan(mutate(restore)), /personal_target_recovery_required/);
    assert.deepEqual(captureApplyTarget(z.root).binding, partialRestore);
  });
});

test("explicit recovery aborts partial apply or completes restore without retrying adoption", async t => {
  const f = syntheticClosure(t);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ask-owned-recovery-fault-"))); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const preload = join(dir, "fault.mjs");
  writeFileSync(preload, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const original=fs.writeFileSync; fs.writeFileSync=(path,...args)=>{
 if(typeof path==='string'&&path.endsWith('/.agents/prompts/skill-review.md')) throw Object.assign(new Error('owned fixture recovery fault'),{code:'EIO'});
 return original(path,...args);}; syncBuiltinESMExports();\n`);
  for (const phase of ["initial", "candidate", "restore"]) await t.test(phase, () => {
    const x = project(t), statePath = join(x.root, PERSONAL_PROMPT_TARGET_STATE);
    const rollbackTrust = f.closure.trustedPortfolioAuthorityContexts.filter(context => context.authority.kind === "external_portfolio_rollback_authority");
    assert.equal(rollbackTrust.length, 1);
    const closure = phase === "restore" ? f.closure : { ...f.closure, trustedPortfolioAuthorityContexts:
      f.closure.trustedPortfolioAuthorityContexts.filter(context => context.authority.kind !== "external_portfolio_rollback_authority") };
    const opts = role => ({ targetRoot: x.root, closure, role, selectionObjectDigest: role === "parent" ? f.parentSelection : f.candidateSelection });
    const mut = prepared => ({ prepared, closure, confirmedDigest: prepared.digest, authorized: true });
    if (phase !== "initial") applyPersonalPromptTargetPlan(mut(planPersonalPromptTargetApply(opts("parent"))));
    if (phase === "restore") applyPersonalPromptTargetPlan(mut(planPersonalPromptTargetApply(opts("candidate"))));
    const original = phase === "restore" ? planPersonalPromptTargetRestore({ targetRoot: x.root, closure, rollbackSelectionObjectDigest: f.rollbackSelection })
      : planPersonalPromptTargetApply(opts(phase === "initial" ? "parent" : "candidate"));
    const command = phase === "restore" ? "restore" : "apply";
    assert.equal(child(t, command, { prepared: original, closure }, ["--authorized", "--confirm", original.digest], 1, preload).reason_code, "personal_target_recovery_required");
    const authority = { originalPlanDigest: original.digest, rollbackTrustedPortfolioAuthorityContexts: rollbackTrust };
    const request = { targetRoot: x.root, closure, rollbackSelectionObjectDigest: f.rollbackSelection, ...authority };
    const before = captureApplyTarget(x.root).binding;
    assert.throws(() => planPersonalPromptTargetRecovery({ ...request, originalPlanDigest: canonicalDigest("forged original plan") }), /personal_target_/);
    assert.deepEqual(captureApplyTarget(x.root).binding, before);
    if (phase === "candidate") {
      const saved = readFileSync(statePath); writeFileSync(statePath, "{truncated"); const broken = captureApplyTarget(x.root).binding;
      assert.throws(() => planPersonalPromptTargetRecovery(request), /personal_target_/); assert.deepEqual(captureApplyTarget(x.root).binding, broken); writeFileSync(statePath, saved);
    }
    if (phase === "initial") {
      const retained = join(dir, "retained-original-operation.json"); renameSync(`${statePath}.operation.json`, retained);
      const legacy = captureApplyTarget(x.root).binding;
      assert.throws(() => planPersonalPromptTargetRecovery(request), /personal_target_/); assert.deepEqual(captureApplyTarget(x.root).binding, legacy);
      renameSync(retained, `${statePath}.operation.json`);
    }
    let recovery = child(t, "plan-recover", request);
    assert.throws(() => recoverPersonalPromptTargetPlan({ ...mut(recovery), ...authority, authorized: false }), /personal_target_/);
    assert.throws(() => recoverPersonalPromptTargetPlan({ ...mut(recovery), ...authority, originalPlanDigest: canonicalDigest("wrong independent pin") }), /personal_target_/);
    assert.throws(() => recoverPersonalPromptTargetPlan(mut(recovery)), /personal_target_/);
    if (phase === "initial") {
      const app = join(x.root, "app.txt"), bytes = readFileSync(app);
      writeFileSync(app, "unrelated project edit"); const drifted = captureApplyTarget(x.root).binding;
      assert.throws(() => planPersonalPromptTargetRecovery(request), /personal_target_/); assert.deepEqual(captureApplyTarget(x.root).binding, drifted); writeFileSync(app, bytes);
      const prompt = join(x.root, ".agents/prompts/skill-implement.md"), saved = readFileSync(prompt);
      writeFileSync(prompt, "unknown partial bytes"); const unknown = captureApplyTarget(x.root).binding;
      assert.throws(() => planPersonalPromptTargetRecovery(request), /personal_target_/); assert.deepEqual(captureApplyTarget(x.root).binding, unknown); writeFileSync(prompt, saved);
      for (const fault of ["unlink", "cleanup"]) {
        const faultPath = join(dir, `${fault}.mjs`);
        writeFileSync(faultPath, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const method='${fault === "unlink" ? "unlinkSync" : "rmdirSync"}', original=fs[method];fs[method]=(path,...args)=>{
if(typeof path==='string'&&path.endsWith('${fault === "unlink" ? "/.agents/prompts/skill-implement.md" : "/.agents/prompts"}'))throw Object.assign(new Error('owned recovery failure'),{code:'EIO'});
return original(path,...args);};syncBuiltinESMExports();\n`);
        const failed = child(t, "recover", { prepared: recovery, closure, ...authority }, ["--authorized", "--confirm", recovery.digest], 1, faultPath);
        assert.equal(failed.reason_code, "personal_target_recovery_required");
        assert.equal(existsSync(`${statePath}.operation.json`), true); assert.equal(existsSync(`${statePath}.in-progress.json`), true);
        assert.throws(() => inspectPersonalPromptTarget({ targetRoot: x.root }), /personal_target_recovery_required/);
        assert.throws(() => recoverPersonalPromptTargetPlan({ ...mut(recovery), ...authority }), /personal_target_/);
        recovery = child(t, "plan-recover", request);
      }
    }
    const result = child(t, "recover", { prepared: recovery, closure, ...authority }, ["--authorized", "--confirm", recovery.digest]);
    assert.equal(result.status, phase === "restore" ? "recovered_restore" : "recovered_apply_abort");
    assert.equal(existsSync(`${statePath}.in-progress.json`), false); assert.equal(existsSync(`${statePath}.operation.json`), false);
    assert.equal(inspectPersonalPromptTarget({ targetRoot: x.root }).status, phase === "initial" ? "not_installed" : "installed");
    if (phase !== "initial") assert.equal(JSON.parse(readFileSync(statePath)).personal_prompt.installed_lock_digest,
      result.installed_lock_digest);
    assert.ok(result.evidence_object_digest.startsWith("sha256:"));
    assert.throws(() => recoverPersonalPromptTargetPlan({ ...mut(recovery), ...authority }), /personal_target_/);
  });
});
