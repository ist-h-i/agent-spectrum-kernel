// A reversible overlay over exact baseline bytes. Existing Evolution owns
// adoption/rollback authority; existing installer lifecycle owns file recovery.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, readJsonFileStrict, listContentAddressedJson, putContentAddressedJson } from './content-addressed-store.mjs';
import { ENVIRONMENT_OWNER_JOURNAL, planEnvironmentOwnerLease, verifyEnvironmentOwnerLease,
  delegatedEnvironmentOwner, ownerStateBytes, verifyReturnedEnvironmentOwner,chainEnvironmentOwnerLease } from './environment-target-owner.mjs';
import {verifySupervisedEnvironmentApplication} from './instruction-loop-environment-approval.mjs';
import { verifyEvolutionApplicationReceipt } from './evolution-loop.mjs';
import { verifyEnvironmentEvolutionBinding } from './environment-evolution-binding.mjs';
import { verifyPortfolioLock } from './portfolio-manager.mjs';
import { assertSetupWritePaths, assertNoSetupInProgress, SETUP_STATE_PATHS } from './ask-setup-apply-state.mjs';
import { PERSONAL_PROMPT_TARGET_STATE as STATE, PERSONAL_PROMPT_TARGET_LOCK,personalPromptTargetActive, withPersonalPromptTargetLock } from './ask-personal-prompt-target-lock.mjs';
import { applyLifecyclePlan, createManagedFileRecord, createRollbackSnapshot, planWriteManaged, planDeleteManaged, rollbackLifecycleState } from './installer-lifecycle.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const plans = new WeakMap();
function checked(options) {
  if(options.supervisedRoot)return verifySupervisedEnvironmentApplication(options);
  const closure = verifyEvolutionApplicationReceipt(options);
  assert.equal(closure.receipt.state, 'completed', 'completed receipt required');
  assert.equal(closure.proposal.action, 'adopt_candidate', 'adoption receipt required');
  assert.equal(closure.decision.disposition, 'approved', 'approved adoption required');
  assert.equal(closure.experiment.projection.mode, 'instruction_environment_v1_exact');
  const binding = verifyEnvironmentEvolutionBinding(options, closure.experiment);
  assert.ok(!binding.pair.baseline.environment.retained_layout_object_digest
    && !binding.pair.challenger.environment.retained_layout_object_digest,
  'retained reference snapshots do not authorize normal-owner mutation');
  return { closure, ...binding };
}
function previousOverlay(root,context){
  if(!context.supervised||!context.previousReceipt)return null;
  const state=readJsonFileStrict(join(root,STATE),'previous supervised overlay',32*1024*1024);
  assert.equal(canonicalDigest(state),context.previousStateDigest,'previous applied overlay state drift');
  assert.equal(state.environment_overlay.owner_lease?.lease_id??null,context.previousLeaseId,'previous approved owner lease drift');
  assert.equal(state.installer,'instruction-environment-overlay');assert.equal(state.environment_overlay.receipt_object_digest,context.previousReceipt);
  assert.equal(state.environment_overlay.environments.challenger,context.binding.environments.baseline,'previous overlay differs from baseline');
  assert.ok(!existsSync(join(root,ENVIRONMENT_OWNER_JOURNAL))&&!existsSync(join(root,`${STATE}.in-progress.json`)),'partial previous overlay');
  return state;
}
const HISTORY = '.agent-spectrum-kernel/environment-operation-history';
function consumed(root, key) {
  return listContentAddressedJson({ storeRoot: join(root, HISTORY) }).some(item => item.value.operation_key === key);
}
function history(root, artifact) { return putContentAddressedJson({ storeRoot: join(root, HISTORY), artifact }); }
function target(root, paths, allowNormalOwner = false) {
  assert.equal(realpathSync(root), root, 'canonical target path required');
  assert.ok(lstatSync(root).isDirectory(), 'target directory required');
  assertSetupWritePaths(root, [...paths, STATE, `${STATE}.in-progress.json`]);
  assertNoSetupInProgress(root);
  for (const state of SETUP_STATE_PATHS) assert.ok(allowNormalOwner || !existsSync(join(root, state)),
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
  const context=checked(options),{ pair, binding } = context, files = overlayFiles(pair),previous=previousOverlay(root,context);
  const paths = [...new Set([...files.baseline, ...files.challenger].map(f => f.path))].sort();
  const lease = previous?.environment_overlay.owner_lease?chainEnvironmentOwnerLease({root,lease:previous.environment_overlay.owner_lease,
    ownerStateDigest:options.ownerStateDigest,environment:pair.baseline.environment,paths,receiptObjectDigest:options.receiptObjectDigest,environments:binding.environments}):options.ownerStateDigest ? planEnvironmentOwnerLease({ root, adapter: pair.baseline.environment.adapter, paths,
    ownerStateDigest: options.ownerStateDigest, receiptObjectDigest: options.receiptObjectDigest,
    environments: binding.environments, parentEnvironment: pair.baseline.environment }) : null;
  const identity = target(root, paths, Boolean(lease));
  const operationKey = canonicalDigest({ target_identity: identity, receipt_object_digest: options.receiptObjectDigest, environments: binding.environments });
  assert.ok(!consumed(root, operationKey), 'environment adoption receipt was already consumed on this target; fresh adoption required');
  assert.ok(previous||!personalPromptTargetActive(root), 'existing environment/Prompt owner or partial operation');
  exactFiles(root, pair.baseline.files);
  const before = { managed_files: Object.fromEntries(files.baseline.map(f => [f.path, createManagedFileRecord({ kind: 'environment_baseline', content: f.text })])) };
  for (const file of files.challenger) if (!before.managed_files[file.path]) assert.ok(!existsSync(join(root, file.path)), 'new candidate path already exists');
  const rollback = createRollbackSnapshot(), operations = [], managed = {};
  for (const f of files.challenger) {
    planWriteManaged(operations, { target: root, relativePath: f.path, content: f.text, previousState: before, rollback, reason: 'approved-environment-overlay' });
    managed[f.path] = createManagedFileRecord({ kind: 'environment_overlay', content: f.text });
  }
  for (const f of files.baseline) if (!managed[f.path]) planDeleteManaged(operations, { target: root, relativePath: f.path, previousState: before, rollback, reason: 'approved-environment-removal' });
  const state = { schema_version: 3, installer: 'instruction-environment-overlay', install_status: 'installed', previous_successful_state: previous,
    managed_files: managed, managed_blocks: {}, managed_partial_files: {}, rollback,
    environment_overlay: { receipt_object_digest: options.receiptObjectDigest, environments: binding.environments, target_identity: identity,
      operation_key: operationKey, ...(lease ? { owner_lease: lease } : {}),
      ...(previous?{previous_overlay_digest:canonicalDigest(previous),previous_owner_state_base64:lease?readFileSync(join(root,lease.owner_path)).toString('base64'):null}:{}) } };
  const plan = { object_kind: 'instruction_environment_apply_plan', target_root: root, target_identity: identity,
    receipt_object_digest: options.receiptObjectDigest, environments: binding.environments,
    files: paths, operation_key: operationKey, ...(lease ? { owner_state_digest: options.ownerStateDigest, lease_id: lease.lease_id } : {}),
    operation_digest: canonicalDigest(operations), models_started: false };
  const digest = canonicalDigest(plan), handle = Object.freeze({ digest });
  if(options.supervisedRoot&&options.supervisedPhase==='apply')assert.equal(digest,options.supervisedPlanDigest,'actual target plan differs from approved supervised plan');
  plans.set(handle, { options, root, paths, identity, pair, state, operations, lease, operationKey,previous });
  return { handle, digest, plan };
}
export function applyEnvironmentTargetPlan(handle, confirmedDigest) {
  const p = plans.get(handle); assert.ok(p, 'owned environment plan required');
  if(p.options.supervisedRoot)assert.equal(p.options.supervisedPhase,'apply','supervised preview handle cannot authorize application');
  assert.equal(confirmedDigest, handle.digest, 'exact environment plan confirmation required');
  return withPersonalPromptTargetLock(p.root, () => {
    assert.ok(same(target(p.root, p.paths, Boolean(p.lease)), p.identity), 'environment target replaced');
    const current=previousOverlay(p.root,checked(p.options));
    assert.ok(same(current,p.previous),'previous overlay changed');
    assert.ok(p.previous||!personalPromptTargetActive(p.root, { excludeOwnedLock: true }), 'environment owner changed');
    checked(p.options); exactFiles(p.root, p.pair.baseline.files);
    assert.ok(!consumed(p.root, p.operationKey), 'environment operation already consumed');
    if (p.lease) {
      const current = p.previous?.environment_overlay.owner_lease?chainEnvironmentOwnerLease({root:p.root,lease:p.previous.environment_overlay.owner_lease,
        ownerStateDigest:p.options.ownerStateDigest,environment:p.pair.baseline.environment,paths:p.paths,receiptObjectDigest:p.options.receiptObjectDigest,environments:p.state.environment_overlay.environments}):planEnvironmentOwnerLease({ root: p.root, adapter: p.pair.baseline.environment.adapter, paths: p.paths,
        ownerStateDigest: p.options.ownerStateDigest, receiptObjectDigest: p.options.receiptObjectDigest,
        environments: p.state.environment_overlay.environments, parentEnvironment: p.pair.baseline.environment });
      assert.ok(same(current, p.lease), 'normal owner changed after plan');
    }
    for (const f of p.pair.challenger.files) if (!p.pair.baseline.files.some(b => b.path === f.path)) assert.ok(!existsSync(join(p.root, f.path)), 'candidate path collision');
    // Consume before writes; a partial application retains the existing
    // lifecycle marker and must be inspected rather than automatically retried.
    plans.delete(handle);
    const owner = p.lease ? Buffer.from(p.lease.original_owner_state_base64, 'base64') : null;
    const delegated = owner ? ownerStateBytes(delegatedEnvironmentOwner(JSON.parse(owner), p.lease, p.pair.challenger.environment)) : null;
    writeFileSync(join(p.root, ENVIRONMENT_OWNER_JOURNAL), JSON.stringify({ operation_key: p.operationKey, operation: 'apply', plan_digest: handle.digest,
      original_owner_state_base64: owner?.toString('base64') ?? null, pending_owner_state_base64: delegated?.toString('base64') ?? null, pending_state: p.state }), { mode: 0o600, flag: 'wx' });
    history(p.root, { schema: 'ask.environment-operation@1', operation_key: p.operationKey, phase: 'started', plan_digest: handle.digest });
    if (p.lease) writeFileSync(join(p.root, p.lease.owner_path), delegated);
    applyLifecyclePlan({ target: p.root, statePath: STATE, operations: p.operations, state: p.state, dryRun: false });
    exactFiles(p.root, p.pair.challenger.files);
    if (p.lease) verifyEnvironmentOwnerLease({ root: p.root, lease: p.lease, ownerStateDigest: p.options.ownerStateDigest, environment: p.pair.challenger.environment });
    const result={status:'applied',environments:p.state.environment_overlay.environments,runtime_use_implied:false,
      overlay_state_digest:canonicalDigest(readJsonFileStrict(join(p.root,STATE),'applied environment state',32*1024*1024))};
    history(p.root,{schema:'ask.environment-operation@1',operation_key:p.operationKey,phase:'applied',plan_digest:handle.digest,result});
    unlinkSync(join(p.root, ENVIRONMENT_OWNER_JOURNAL));return result;
  });
}
export function restoreEnvironmentTarget(options) {
  if(options.supervisedRoot)assert.equal(options.supervisedPhase,'restore','actual supervised restore phase required');
  const root = resolve(options.targetRoot), context=checked(options),{ pair, closure, binding } = context, files = overlayFiles(pair);
  return withPersonalPromptTargetLock(root, () => {
    const state = readJsonFileStrict(join(root, STATE), 'environment overlay state', 32 * 1024 * 1024);
    if(context.supervised)assert.equal(canonicalDigest(state),context.appliedStateDigest,'applied overlay state drift before restoration');
    assert.ok(!existsSync(join(root, `${STATE}.in-progress.json`)), 'partial overlay requires separate inspection/recovery');
    assert.ok(!existsSync(join(root, ENVIRONMENT_OWNER_JOURNAL)), 'partial paired owner operation requires separate recovery');
    assert.equal(state.installer, 'instruction-environment-overlay');
    assert.equal(state.environment_overlay.receipt_object_digest, options.receiptObjectDigest);
    assert.ok(same(state.environment_overlay.environments, binding.environments), 'overlay environment transplant');
    assert.equal(state.environment_overlay.operation_key, canonicalDigest({ target_identity: state.environment_overlay.target_identity,
      receipt_object_digest: options.receiptObjectDigest, environments: binding.environments }), 'overlay operation history transplant');
    const lease = state.environment_overlay.owner_lease;
    if(context.supervised)assert.equal(lease?.lease_id??null,context.approvedLeaseId,'approved restore lease drift');
    assert.ok(same(target(root, [...files.baseline, ...files.challenger].map(f => f.path), Boolean(lease)), state.environment_overlay.target_identity), 'target identity drift');
    if (lease) {
      assert.equal(lease.receipt_object_digest, options.receiptObjectDigest); assert.ok(same(lease.environments, binding.environments));
      assert.deepEqual(lease.paths, [...new Set([...(state.previous_successful_state?.environment_overlay.owner_lease?.paths??[]),...files.baseline.map(f=>f.path),...files.challenger.map(f=>f.path)])].sort());
      verifyEnvironmentOwnerLease({ root, lease, ownerStateDigest: options.ownerStateDigest, environment: pair.challenger.environment });
      if(state.previous_successful_state){
        const previousLease=state.previous_successful_state.environment_overlay.owner_lease;
        const {lease_id,...previousBody}=previousLease;assert.equal(lease_id,canonicalDigest(previousBody),'previous lease identity drift');
        assert.equal(previousLease.original_owner_state_base64,lease.original_owner_state_base64,'previous original owner snapshot drift');
        assert.equal(previousLease.owner_state_digest,options.ownerStateDigest,'previous original owner pin drift');assert.equal(previousLease.adapter,lease.adapter);
        assert.equal(canonicalDigest(previousLease.other_owner_states),canonicalDigest(lease.other_owner_states));
        assert.equal(canonicalDigest(previousLease.protected_partial_files),canonicalDigest(lease.protected_partial_files));
        const original=JSON.parse(Buffer.from(previousLease.original_owner_state_base64,'base64'));
        const expected=ownerStateBytes(delegatedEnvironmentOwner(original,previousLease,pair.baseline.environment));
        assert.equal(state.environment_overlay.previous_owner_state_base64,expected.toString('base64'),'previous delegated owner snapshot drift');
      }
    }
    exactFiles(root, pair.challenger.files);
    let rollbackAuthorityDigest;
    if(context.supervised){assert.ok(context.restoreAuthorityDigest,'fresh actual restore decision required');rollbackAuthorityDigest=context.restoreAuthorityDigest;}
    else{
    const lock = verifyPortfolioLock({ ...options, lockDigest: options.rollbackLockDigest }).lock;
    assert.equal(lock.predecessor.lock_digest, closure.receipt.result_heads.portfolio_lock_digest, 'fresh explicit rollback lock required');
    assert.equal(lock.current_manifest_digest, closure.receipt.rollback_anchor.manifest_digest, 'rollback target transplant');
    // VerifyPortfolioLock checks the supplied external rollback authority. Also
    // require its kind rather than accepting an unrelated activation transition.
    const authority = options.trustedPortfolioAuthorityContexts?.find(a => canonicalDigest(a) === lock.authority_context_digest);
    assert.equal(authority?.authority.kind, 'external_portfolio_rollback_authority', 'explicit rollback authority required');
    rollbackAuthorityDigest=options.rollbackLockDigest;
    }
    const paths = [...new Set([...files.baseline, ...files.challenger].map(f => f.path))].sort();
    assert.deepEqual(Object.keys(state.rollback.files).sort(), paths, 'rollback inventory drift');
    assert.deepEqual(Object.keys(state.rollback.blocks), []);
    if(context.supervised&&state.previous_successful_state){
      assert.equal(canonicalDigest(state.previous_successful_state),state.environment_overlay.previous_overlay_digest);
      assert.equal(state.previous_successful_state.environment_overlay.receipt_object_digest,context.previousReceipt);
    }else assert.equal(state.previous_successful_state, null, 'unexpected previous overlay owner');
    assert.deepEqual(state.managed_blocks, {}); assert.deepEqual(state.managed_partial_files, {});
    assert.deepEqual(state.managed_files, Object.fromEntries(files.challenger.map(f => [f.path,
      createManagedFileRecord({ kind: 'environment_overlay', content: f.text })])), 'overlay managed inventory drift');
    for (const path of paths) {
      const parent = files.baseline.find(f => f.path === path);
      assert.equal(state.rollback.files[path].content, parent?.text ?? null, 'rollback snapshot transplant');
      assert.equal(state.rollback.files[path].sha256, parent?.raw_digest.slice(7) ?? null, 'rollback digest transplant');
    }
    assert.ok(consumed(root, state.environment_overlay.operation_key), 'missing immutable environment operation history');
    writeFileSync(join(root, ENVIRONMENT_OWNER_JOURNAL), JSON.stringify({ operation: 'restore', original_state: state,
      rollback_lock_digest: rollbackAuthorityDigest, original_owner_state_base64: lease?.original_owner_state_base64 ?? null }), { mode: 0o600, flag: 'wx' });
    rollbackLifecycleState({ target: root, statePath: STATE });
    exactFiles(root, pair.baseline.files);
    if (lease) {
      const previous=state.previous_successful_state;
      writeFileSync(join(root, lease.owner_path), Buffer.from(previous?state.environment_overlay.previous_owner_state_base64:lease.original_owner_state_base64, 'base64'));
      if(previous)verifyEnvironmentOwnerLease({root,lease:previous.environment_overlay.owner_lease,ownerStateDigest:options.ownerStateDigest,environment:pair.baseline.environment});
      else verifyReturnedEnvironmentOwner({ root, lease, ownerStateDigest: options.ownerStateDigest });
    }
    const result={status:'restored',environment_object_digest:binding.environments.baseline,runtime_use_implied:false,
      overlay_state_digest:existsSync(join(root,STATE))?canonicalDigest(readJsonFileStrict(join(root,STATE),'returned overlay state',32*1024*1024)):null,
      normal_owner_state_digest:lease?instructionBytesDigest(readFileSync(join(root,lease.owner_path))):null};
    history(root, { schema: 'ask.environment-operation@1', operation_key: state.environment_overlay.operation_key,
      phase: 'restored', rollback_lock_digest: rollbackAuthorityDigest,result });
    unlinkSync(join(root, ENVIRONMENT_OWNER_JOURNAL));
    return result;
  });
}

// Positive completion evidence only. Pending markers/locks, absent completion
// receipts or drift remain uncertain; inspection never repeats owner writes.
export function inspectSupervisedEnvironmentTarget(options){
  assert.ok(options.supervisedRoot);assert.ok(['apply','restore'].includes(options.supervisedPhase));
  const context=checked(options),root=resolve(options.targetRoot);
  if([ENVIRONMENT_OWNER_JOURNAL,`${STATE}.in-progress.json`,PERSONAL_PROMPT_TARGET_LOCK].some(path=>existsSync(join(root,path))))return null;
  const plan=options.supervisedPlan;
  assert.ok(plan&&canonicalDigest(plan)===options.supervisedPlanDigest,'exact approved plan required for completion inspection');
  assert.ok(same(plan.target_identity,target(root,plan.files,Boolean(options.ownerStateDigest))),'inspected target identity drift');
  assert.equal(plan.receipt_object_digest,options.receiptObjectDigest);assert.ok(same(plan.environments,context.binding.environments));
  const key=canonicalDigest({target_identity:plan.target_identity,receipt_object_digest:options.receiptObjectDigest,environments:context.binding.environments});
  const phase=options.supervisedPhase==='apply'?'applied':'restored';
  const records=listContentAddressedJson({storeRoot:join(root,HISTORY)}).map(item=>item.value).filter(item=>item.operation_key===key&&item.phase===phase);
  if(!records.length)return null;assert.equal(records.length,1,'ambiguous owner completion receipts');
  const record=records[0],result=record.result;if(!result)return null;
  const overlay=existsSync(join(root,STATE))?readJsonFileStrict(join(root,STATE),'completed overlay state',32*1024*1024):null;
  assert.equal(overlay?canonicalDigest(overlay):null,result.overlay_state_digest,'completed owner state drift');
  const role=phase==='applied'?'challenger':'baseline',other=role==='challenger'?'baseline':'challenger';
  exactFiles(root,context.pair[role].files);
  for(const f of context.pair[other].files)if(!context.pair[role].files.some(b=>b.path===f.path))assert.ok(!existsSync(join(root,f.path)),'completed removal drift');
  if(phase==='applied'){
    assert.equal(record.plan_digest,options.supervisedPlanDigest);assert.equal(result.status,'applied');
    assert.ok(overlay);assert.equal(overlay.environment_overlay.operation_key,key);
    const lease=overlay.environment_overlay.owner_lease;assert.equal(lease?.lease_id??null,context.approvedLeaseId);
    if(lease)verifyEnvironmentOwnerLease({root,lease,ownerStateDigest:options.ownerStateDigest,environment:context.pair.challenger.environment});
  }else{
    assert.equal(record.rollback_lock_digest,context.restoreAuthorityDigest);assert.equal(result.status,'restored');
    assert.equal(result.environment_object_digest,context.binding.environments.baseline);
    assert.equal(result.overlay_state_digest,context.previousStateDigest);
    const lease=overlay?.environment_overlay.owner_lease;
    if(lease){
      assert.equal(lease.lease_id,context.previousLeaseId);verifyEnvironmentOwnerLease({root,lease,ownerStateDigest:options.ownerStateDigest,environment:context.pair.baseline.environment});
      assert.equal(instructionBytesDigest(readFileSync(join(root,lease.owner_path))),result.normal_owner_state_digest);
    }else if(options.ownerStateDigest){
      const planned=planEnvironmentOwnerLease({root,adapter:context.pair.baseline.environment.adapter,paths:plan.files,ownerStateDigest:options.ownerStateDigest,
        receiptObjectDigest:options.receiptObjectDigest,environments:context.binding.environments,parentEnvironment:context.pair.baseline.environment});
      assert.equal(planned.lease_id,plan.lease_id);assert.equal(result.normal_owner_state_digest,options.ownerStateDigest);
    }else assert.equal(result.normal_owner_state_digest,null);
  }
  return structuredClone(result);
}
