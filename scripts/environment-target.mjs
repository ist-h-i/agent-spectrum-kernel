// A reversible overlay over exact baseline bytes. Existing Evolution owns
// adoption/rollback authority; existing installer lifecycle owns file recovery.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, readJsonFileStrict } from './content-addressed-store.mjs';
import { verifyEvolutionApplicationReceipt } from './evolution-loop.mjs';
import { verifyEnvironmentEvolutionBinding } from './environment-evolution-binding.mjs';
import { verifyPortfolioLock } from './portfolio-manager.mjs';
import { assertSetupWritePaths, assertNoSetupInProgress, SETUP_STATE_PATHS } from './ask-setup-apply-state.mjs';
import { PERSONAL_PROMPT_TARGET_STATE as STATE, personalPromptTargetActive, withPersonalPromptTargetLock } from './ask-personal-prompt-target-lock.mjs';
import { applyLifecyclePlan, createManagedFileRecord, createRollbackSnapshot, planWriteManaged, planDeleteManaged, rollbackLifecycleState } from './installer-lifecycle.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const plans = new WeakMap();
function checked(options) {
  const closure = verifyEvolutionApplicationReceipt(options);
  assert.equal(closure.receipt.state, 'completed', 'completed receipt required');
  assert.equal(closure.proposal.action, 'adopt_candidate', 'adoption receipt required');
  assert.equal(closure.decision.disposition, 'approved', 'approved adoption required');
  assert.equal(closure.experiment.projection.mode, 'instruction_environment_v1_exact');
  const binding = verifyEnvironmentEvolutionBinding(options, closure.experiment);
  return { closure, ...binding };
}
function target(root, paths) {
  assert.equal(realpathSync(root), root, 'canonical target path required');
  assert.ok(lstatSync(root).isDirectory(), 'target directory required');
  assertSetupWritePaths(root, [...paths, STATE, `${STATE}.in-progress.json`]);
  assertNoSetupInProgress(root);
  for (const state of SETUP_STATE_PATHS) assert.ok(!existsSync(join(root, state)),
    'normal installer owner requires explicit ownership transfer; use a fresh exported target');
  return { dev: lstatSync(root).dev, ino: lstatSync(root).ino };
}
function exactFiles(root, files) {
  for (const f of files) {
    assert.ok(existsSync(join(root, f.path)), 'required environment file missing');
    assert.equal(instructionBytesDigest(readFileSync(join(root, f.path))), f.raw_digest, `environment target drift: ${f.path}`);
  }
}
function overlayFiles(pair) {
  assert.ok(same(pair.baseline.environment.support, pair.challenger.environment.support), 'target application cannot change support/runtime/security files');
  const support = new Set(pair.baseline.environment.support.map(f => f.path));
  return Object.fromEntries(['baseline', 'challenger'].map(role => [role, pair[role].files.filter(f => !support.has(f.path))]));
}
export function planEnvironmentTargetApply(input) {
  const options = structuredClone(input), root = resolve(options.targetRoot);
  const { pair, binding } = checked(options), files = overlayFiles(pair);
  const paths = [...new Set([...files.baseline, ...files.challenger].map(f => f.path))].sort();
  const identity = target(root, paths);
  assert.ok(!personalPromptTargetActive(root), 'existing environment/Prompt owner or partial operation');
  exactFiles(root, pair.baseline.files);
  const before = { managed_files: Object.fromEntries(files.baseline.map(f => [f.path, createManagedFileRecord({ kind: 'environment_baseline', content: f.text })])) };
  for (const file of files.challenger) if (!before.managed_files[file.path]) assert.ok(!existsSync(join(root, file.path)), 'new candidate path already exists');
  const rollback = createRollbackSnapshot(), operations = [], managed = {};
  for (const f of files.challenger) {
    planWriteManaged(operations, { target: root, relativePath: f.path, content: f.text, previousState: before, rollback, reason: 'approved-environment-overlay' });
    managed[f.path] = createManagedFileRecord({ kind: 'environment_overlay', content: f.text });
  }
  for (const f of files.baseline) if (!managed[f.path]) planDeleteManaged(operations, { target: root, relativePath: f.path, previousState: before, rollback, reason: 'approved-environment-removal' });
  const state = { schema_version: 3, installer: 'instruction-environment-overlay', install_status: 'installed', previous_successful_state: null,
    managed_files: managed, managed_blocks: {}, managed_partial_files: {}, rollback,
    environment_overlay: { receipt_object_digest: options.receiptObjectDigest, environments: binding.environments, target_identity: identity } };
  const plan = { object_kind: 'instruction_environment_apply_plan', target_root: root, target_identity: identity,
    receipt_object_digest: options.receiptObjectDigest, environments: binding.environments,
    files: paths, operation_digest: canonicalDigest(operations), models_started: false };
  const digest = canonicalDigest(plan), handle = Object.freeze({ digest });
  plans.set(handle, { options, root, paths, identity, pair, state, operations });
  return { handle, digest, plan };
}
export function applyEnvironmentTargetPlan(handle, confirmedDigest) {
  const p = plans.get(handle); assert.ok(p, 'owned environment plan required');
  assert.equal(confirmedDigest, handle.digest, 'exact environment plan confirmation required');
  return withPersonalPromptTargetLock(p.root, () => {
    assert.ok(same(target(p.root, p.paths), p.identity), 'environment target replaced');
    assert.ok(!personalPromptTargetActive(p.root, { excludeOwnedLock: true }), 'environment owner changed');
    checked(p.options); exactFiles(p.root, p.pair.baseline.files);
    for (const f of p.pair.challenger.files) if (!p.pair.baseline.files.some(b => b.path === f.path)) assert.ok(!existsSync(join(p.root, f.path)), 'candidate path collision');
    // Consume before writes; a partial application retains the existing
    // lifecycle marker and must be inspected rather than automatically retried.
    plans.delete(handle);
    applyLifecyclePlan({ target: p.root, statePath: STATE, operations: p.operations, state: p.state, dryRun: false });
    exactFiles(p.root, p.pair.challenger.files);
    return { status: 'applied', environments: p.state.environment_overlay.environments, runtime_use_implied: false };
  });
}
export function restoreEnvironmentTarget(options) {
  const root = resolve(options.targetRoot), { pair, closure, binding } = checked(options), files = overlayFiles(pair);
  return withPersonalPromptTargetLock(root, () => {
    const state = readJsonFileStrict(join(root, STATE), 'environment overlay state');
    assert.ok(!existsSync(join(root, `${STATE}.in-progress.json`)), 'partial overlay requires separate inspection/recovery');
    assert.equal(state.installer, 'instruction-environment-overlay');
    assert.equal(state.environment_overlay.receipt_object_digest, options.receiptObjectDigest);
    assert.ok(same(state.environment_overlay.environments, binding.environments), 'overlay environment transplant');
    assert.ok(same(target(root, [...files.baseline, ...files.challenger].map(f => f.path)), state.environment_overlay.target_identity), 'target identity drift');
    exactFiles(root, pair.challenger.files);
    const lock = verifyPortfolioLock({ ...options, lockDigest: options.rollbackLockDigest }).lock;
    assert.equal(lock.predecessor.lock_digest, closure.receipt.result_heads.portfolio_lock_digest, 'fresh explicit rollback lock required');
    assert.equal(lock.current_manifest_digest, closure.receipt.rollback_anchor.manifest_digest, 'rollback target transplant');
    // VerifyPortfolioLock checks the supplied external rollback authority. Also
    // require its kind rather than accepting an unrelated activation transition.
    const authority = options.trustedPortfolioAuthorityContexts?.find(a => canonicalDigest(a) === lock.authority_context_digest);
    assert.equal(authority?.authority.kind, 'external_portfolio_rollback_authority', 'explicit rollback authority required');
    const paths = [...new Set([...files.baseline, ...files.challenger].map(f => f.path))].sort();
    assert.deepEqual(Object.keys(state.rollback.files).sort(), paths, 'rollback inventory drift');
    assert.deepEqual(Object.keys(state.rollback.blocks), []);
    assert.equal(state.previous_successful_state, null, 'unexpected previous overlay owner');
    assert.deepEqual(state.managed_blocks, {}); assert.deepEqual(state.managed_partial_files, {});
    assert.deepEqual(state.managed_files, Object.fromEntries(files.challenger.map(f => [f.path,
      createManagedFileRecord({ kind: 'environment_overlay', content: f.text })])), 'overlay managed inventory drift');
    for (const path of paths) {
      const parent = files.baseline.find(f => f.path === path);
      assert.equal(state.rollback.files[path].content, parent?.text ?? null, 'rollback snapshot transplant');
      assert.equal(state.rollback.files[path].sha256, parent?.raw_digest.slice(7) ?? null, 'rollback digest transplant');
    }
    rollbackLifecycleState({ target: root, statePath: STATE });
    exactFiles(root, pair.baseline.files);
    return { status: 'restored', environment_object_digest: binding.environments.baseline, runtime_use_implied: false };
  });
}
