// A separate, explicit normal-application authority from formal Evolution.
// Only the host's current digest-chained supervised journal supplies decisions.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {canonicalDigest,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {verifyInstructionEnvironment} from './instruction-environment.mjs';
import {completedInstructionLoopApplicationIsActive} from './supervised-instruction-loop.mjs';
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
export function supervisedEnvironmentReceipt(state){
  assert.equal(state.evaluation_decision?.disposition,'approved','actual case approval required');
  const c=state.outputs.register;assert.equal(c.kind,'generated_component_instruction_candidate_v1');
  assert.ok(state.outputs.report,'completed whole-environment report required');
  return canonicalDigest({kind:'supervised_component_application_v1',policy:state.policy,candidate:c,
    evaluation_decision:state.evaluation_decision,report:state.outputs.report});
}
export function verifySupervisedEnvironmentApplication(options){
  const root=resolve(options.supervisedRoot);assertNoSymlinkPathSegments(root,'supervised approval journal');
  const {state:s}=readRunJournal(root);assert.ok(s,'supervised journal missing');
  assert.equal(s.policy.evaluation_mode,'practical_v1');assert.equal(s.policy.normal_target,resolve(options.targetRoot),'supervised target mismatch');
  assert.equal(s.pending?.kind,options.supervisedPhase,'current supervised owner stage required');
  assert.ok(['plan','apply','restore'].includes(options.supervisedPhase));
  const receipt=supervisedEnvironmentReceipt(s);assert.equal(options.receiptObjectDigest,receipt,'supervised receipt mismatch');
  if(options.supervisedPhase!=='plan'){
    assert.equal(s.change_decision?.disposition,'approved','actual change approval required');
    assert.equal(s.outputs.plan.environment_plan_digest,options.supervisedPlanDigest,'approved target plan mismatch');
    assert.ok(same(s.pending.input.plan,s.outputs.plan),'pending owner plan transplant');
    const decision=options.supervisedPhase==='restore'?s.restore_decision:s.change_decision;
    assert.equal(decision?.disposition,'approved','actual restore/change approval required');
    assert.ok(same(s.pending.input.decision,decision),'owner decision transplant');
  }
  const c=s.outputs.register,environments={baseline:c.baseline_environment_object_digest,challenger:c.environment_object_digest};
  const pair=Object.fromEntries(Object.entries(environments).map(([role,digest])=>[role,verifyInstructionEnvironment({...options,environmentObjectDigest:digest})]));
  assert.equal(pair.baseline.environment.adapter,pair.challenger.environment.adapter);assert.ok(same(pair.baseline.environment.runtime,pair.challenger.environment.runtime));
  let previousReceipt=null,previousStateDigest=null,previousLeaseId=null;
  const anchor=s.policy.application_anchor??null;
  assert.equal(options.previousSupervisedRoot??null,anchor?.run_root??null,'active application anchor root mismatch');
  assert.equal(options.previousSupervisedJournalDigest??null,anchor?.journal_digest??null,'active application anchor pin mismatch');
  if(options.previousSupervisedRoot){
    const previous=readRunJournal(resolve(options.previousSupervisedRoot));
    assert.ok(completedInstructionLoopApplicationIsActive(previous.state),'previous owner application is no longer active');
    assert.equal(anchor.journal_digest,previous.previous,'previous application journal drift');
    assert.equal(previous.state.outputs.register.environment_object_digest,environments.baseline,'previous applied baseline mismatch');
    assert.equal(previous.state.policy.normal_target,s.policy.normal_target);previousReceipt=supervisedEnvironmentReceipt(previous.state);
    previousStateDigest=previous.state.outputs.apply?.overlay_state_digest;assert.match(previousStateDigest,/^sha256:[a-f0-9]{64}$/u,'previous exact overlay receipt required');
    previousLeaseId=previous.state.outputs.plan.environment_plan.lease_id??null;
  }
  return {pair,binding:{environments},supervised:true,previousReceipt,previousStateDigest,previousLeaseId,
    approvedLeaseId:s.outputs.plan?.environment_plan.lease_id??null,appliedStateDigest:s.outputs.apply?.overlay_state_digest??null,
    restoreAuthorityDigest:s.restore_decision?canonicalDigest(s.restore_decision):null};
}
