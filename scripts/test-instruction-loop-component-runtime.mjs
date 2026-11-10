import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,renameSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {inspectSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
import {planEnvironmentTargetApply,applyEnvironmentTargetPlan} from './environment-target.mjs';
import {supervisedEnvironmentReceipt} from './instruction-loop-environment-approval.mjs';
import {exportInstructionEnvironment} from './instruction-environment.mjs';
import {writeFileSync} from 'node:fs';
import {practicalReportingGraderPins} from './practical-reporting-grader.mjs';
import {fullPracticalControllerPins} from './instruction-loop-practical-runtime.mjs';
import {createComponentInstructionLoopConfiguration} from './instruction-loop-component-runtime.mjs';
const approve=s=>({disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic exact human decision.'});
test('component profiles pin the transitive isolated-grade controller',t=>{
  const f=componentLoopFixture(t),config=createComponentInstructionLoopConfiguration(f.profilePath);
  assert.ok(f.profile.practical.cases.every(c=>!c.reporting_grader));
  const fullPins=fullPracticalControllerPins();
  for(const source of practicalReportingGraderPins()){
    assert.ok(config.runtime.source_pins.some(p=>p.path===source.path&&p.digest===source.digest));
    assert.ok(fullPins.some(p=>p.path===source.path&&p.digest===source.digest));
  }
  for(const name of ['practical-isolated-grade-continuation.mjs','practical-isolated-grade-continuation-cli.mjs','instruction-loop-source-application.mjs','instruction-loop-source-binding.mjs','instruction-loop-full-candidate.mjs'])assert.ok(config.runtime.source_pins.some(p=>p.path.endsWith('/'+name)));
});
test('trust fields cannot override a component store or application identity',t=>{
  const f=componentLoopFixture(t),profile=structuredClone(f.profile);profile.environmentTrust.storeRoot=f.target;
  const path=join(f.workspaceRoot,'invalid-trust.json');writeFileSync(path,JSON.stringify(profile));
  assert.throws(()=>createComponentInstructionLoopConfiguration(path),/unsupported environment trust option/);assert.equal(existsSync(profile.stateRoot),false);
});
for(const track of ['codex','claude'])test(`${track}: actual component authoring, whole Eval, approved apply and restore complete without mocked lifecycle stages`,async t=>{
  const f=componentLoopFixture(t,track),prefix=track==='codex'?'.agents':'.claude';
  let s=await f.run();assert.equal(s.status,'awaiting_evaluation_approval',JSON.stringify(readRunJournal(f.root).events.at(-1).detail));assert.equal(existsSync(join(f.target,prefix,track==='codex'?'prompts/automatic.md':'commands/automatic.md')),false);
  const generated=s.pending_gate.packet.candidate;assert.equal(generated.components.length,2);assert.equal(generated.candidate_assets.length,3);
  s=await f.run({decision:approve(s)});assert.equal(s.status,'awaiting_change_approval');assert.equal(s.report.all_attempts.length,2);
  assert.ok(s.report.all_attempts.every(a=>a.observation.outcome==='pass'));
  s=await f.run({decision:approve(s)});assert.equal(s.status,'completed');assert.equal(s.final.outcome,'applied');
  assert.equal(readFileSync(join(f.target,prefix,'skills/new-local/SKILL.md'),'utf8'),'Check the actual boundary.\n');
  const fresh=join(f.target,prefix,track==='codex'?'prompts/automatic.md':'commands/automatic.md');assert.equal(existsSync(fresh),true);
  assert.equal(readFileSync(join(f.target,'README.md'),'utf8'),'Unrelated owner content.\n');
  s=await f.run({requestRestore:true});assert.equal(s.status,'awaiting_change_approval');s=await f.run({decision:approve(s)});
  assert.equal(s.final.outcome,'restored');assert.equal(existsSync(fresh),false);
  assert.equal(readFileSync(join(f.target,prefix,'skills/new-local/SKILL.md'),'utf8'),'New root Skill.\n');
});
test('public target APIs reject preview-handle application and changed actual plans before any write',async t=>{
  const f=componentLoopFixture(t),plan=f.runtime.plan,apply=f.runtime.apply;let previewChecked=false,driftChecked=false;
  const options=(root,phase,approvedPlan)=>({...f.profile.environmentTrust,storeRoot:f.storeRoot,targetRoot:f.target,supervisedRoot:root,supervisedPhase:phase,
    receiptObjectDigest:supervisedEnvironmentReceipt(readRunJournal(root).state),supervisedPlanDigest:approvedPlan?.environment_plan_digest});
  f.runtime.plan=async(job,context)=>{
    const p=planEnvironmentTargetApply(options(context.root,'plan'));assert.throws(()=>applyEnvironmentTargetPlan(p.handle,p.digest),/preview handle/);
    previewChecked=true;return plan(job,context);
  };
  f.runtime.apply=async(job,context)=>{
    const parked=f.target+'-parked';renameSync(f.target,parked);
    try{
      exportInstructionEnvironment({...f.options,environmentObjectDigest:f.profile.baselineEnvironmentObjectDigest,outputRoot:f.target});
      assert.throws(()=>planEnvironmentTargetApply(options(context.root,'apply',job.input.plan)),/actual target plan differs/);driftChecked=true;
    }finally{rmSync(f.target,{recursive:true});renameSync(parked,f.target);}
    return apply(job,context);
  };
  let s=await f.run();s=await f.run({decision:approve(s)});assert.equal(previewChecked,true);
  s=await f.run({decision:approve(s)});assert.equal(s.final.outcome,'applied');assert.equal(driftChecked,true);
});
test('component rejection retires only owned candidates, removes exact private projections and preserves CAS/evidence',async t=>{
  const f=componentLoopFixture(t);let s=await f.run();const c=s.pending_gate.packet.candidate;
  s=await f.run({decision:{...approve(s),disposition:'rejected'}});assert.equal(s.final.outcome,'evaluation_rejected');
  assert.equal(existsSync(f.profile.candidateRoot),false);assert.equal(existsSync(f.profile.practical.baselineRoot),false);
  assert.ok(existsSync(join(f.profile.stateRoot,'component-candidate.json')));assert.equal(inspectSupervisedInstructionLoop(f.root).status,'completed');
  const registry=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:s.final.cleanup.registry.snapshot_digest,trustedAuthorityContexts:s.final.cleanup.registry.trusted_authority_contexts});
  assert.ok(c.owned_candidate_assets.every(a=>registry.assets.find(b=>b.record_digest===a.record_digest).state==='retired'));
  assert.equal(registry.assets.find(a=>a.record_digest===f.rootAsset.record_digest).state,'candidate','shared source Asset is not retired');
});
