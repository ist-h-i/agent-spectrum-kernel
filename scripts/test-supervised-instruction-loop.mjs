import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import {spawnSync} from 'node:child_process';
import { canonicalDigest,putContentAddressedJson } from './content-addressed-store.mjs';
import { advanceSupervisedInstructionLoop,inspectSupervisedInstructionLoop,prepareNextSupervisedInstructionLoop,readCompletedInstructionLoopContinuation } from './supervised-instruction-loop.mjs';
import { createInstructionLoopCommandRuntime } from './instruction-loop-command-runtime.mjs';
import { selectInstructionLoopCases } from './instruction-loop-case-selection.mjs';
import { transitionInstructionLoopAssets } from './instruction-loop-assets.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
import { listAssets } from './asset-registry.mjs';
import { instructionBytesDigest as hash } from './instruction-environment.mjs';

function fixture(t){
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'ask-loop-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const calls=[],receipts=new Map();
  const policy={kind:'reference_instruction_loop_v1',id:'synthetic',runtime_digest:canonicalDigest('fake runtime'),
    observation:{goal:'Synthetic efficiency test; no models'},catalog:[{id:'a',public_input_digest:canonicalDigest('public a'),tags:['routing'],domain:'local'},
      {id:'b',public_input_digest:canonicalDigest('public b'),tags:['state'],domain:'api'}],conditions:['baseline','candidate'],repetitions:2,max_trials:8,
    normal_target:join(dir,'target'),formal_admission_implied:false};
  const output=job=>{
    if(job.kind==='generate')return {content_digest:canonicalDigest('fake candidate'),changed_tags:['routing']};
    if(job.kind==='register')return {version:'fixture-v2',asset_digest:canonicalDigest('fixture asset')};
    if(job.kind==='select')return selectInstructionLoopCases({catalog:policy.catalog,changedTags:['routing'],limit:2});
    if(job.kind==='trial')return {trial_id:job.input.row.id,ready_for_next_root:true,root_usage:{input:1,output:1,cached:0},full_hierarchical_usage:null};
    if(job.kind==='report')return {reference_points:8,full_hierarchical_usage:null,formal_score:null,failures:[],unknowns:['hierarchy']};
    if(job.kind==='plan')return {exact_normal_plan_digest:canonicalDigest('fixture normal plan'),target:policy.normal_target};
    return {kind:job.kind,action:job.input.action??null,completed:true};
  };
  const runtime={digest:policy.runtime_digest,inspect:async job=>receipts.get(canonicalDigest(job))??{status:'unknown'}};
  for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[kind]=async job=>{
    calls.push(job);const result={request_digest:canonicalDigest(job),status:'completed',output:output(job)};receipts.set(canonicalDigest(job),result);return result;
  };
  const run=(extra={})=>advanceSupervisedInstructionLoop({root:join(dir,'run'),policy,runtime,...extra});
  return {dir,calls,receipts,policy,runtime,run,root:join(dir,'run')};
}
const decision=(state,disposition='approved')=>({disposition,packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic owner decision, fixture only'});
test('declining restoration preserves the adopted baseline, and a later restore needs a new distinct judgment',async t=>{
  const f=fixture(t);let s=await f.run();s=await f.run({decision:decision(s)});s=await f.run({decision:decision(s)});
  s=await f.run({requestRestore:true});const refused=s.pending_gate;s=await f.run({decision:decision(s,'rejected')});
  assert.equal(s.final.outcome,'restoration_declined');assert.equal(readCompletedInstructionLoopContinuation(f.root).application_active,true);
  assert.equal(f.calls.filter(c=>c.kind==='apply').length,1);assert.equal(f.calls.filter(c=>c.kind==='restore').length,0);
  s=await f.run({requestRestore:true});assert.notEqual(canonicalDigest(s.pending_gate),canonicalDigest(refused));
  await assert.rejects(f.run({decision:{...decision(s),packet_digest:canonicalDigest(refused)}}),/different packet/);
  s=await f.run({decision:decision(s)});assert.equal(s.final.outcome,'restored');assert.equal(readCompletedInstructionLoopContinuation(f.root).application_active,false);
  assert.equal(f.calls.filter(c=>c.kind==='apply').length,1);assert.equal(f.calls.filter(c=>c.kind==='restore').length,1);
});
test('completed result feeds a fresh second cycle without inherited approvals or repeated trials',async t=>{
  const f=fixture(t);f.policy.normal_target=null;let s=await f.run();
  assert.throws(()=>prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'next'}}),/completed/);
  s=await f.run({decision:decision(s)});s=await f.run({decision:decision(s,'rejected')});
  const original=inspectSupervisedInstructionLoop(f.root);
  const next=prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'next'}});
  assert.equal(next.models_started,false);assert.equal(next.approval_carried_forward,false);
  assert.equal(next.policy.observation.previous.outcome,'result_rejected_retained');
  assert.equal(next.policy.observation.previous.unknown_quality,true);
  assert.equal(next.policy.observation.previous.decisions[1].disposition,'rejected');
  assert.deepEqual(inspectSupervisedInstructionLoop(f.root),original);
  const run=extra=>advanceSupervisedInstructionLoop({root:join(f.dir,'next'),policy:next.policy,runtime:f.runtime,...extra});
  let second=await run();assert.equal(second.status,'awaiting_evaluation_approval');
  await assert.rejects(run({decision:decision(s)}),/different packet/);
  second=await run({decision:decision(second)});assert.equal(second.status,'awaiting_result_review');
  second=await run({decision:decision(second)});assert.equal(second.final.outcome,'result_approved_retained');
  const trialIds=f.calls.filter(j=>j.kind==='trial').map(j=>j.input.row.id);
  assert.equal(trialIds.length,16);assert.equal(new Set(trialIds).size,16);
  assert.equal(f.calls.filter(j=>j.kind==='generate').at(-1).input.observation.previous.outcome,'result_rejected_retained');
});
test('automatic stages stop at exactly the two human judgments; approval applies, cleans and reports',async t=>{
  const f=fixture(t),a=await f.run();assert.equal(a.status,'awaiting_evaluation_approval');
  assert.deepEqual(f.calls.map(j=>j.kind),['generate','register','select']);
  const b=await f.run({decision:decision(a)});assert.equal(b.status,'awaiting_change_approval');
  assert.equal(b.completed_trials,8);assert.equal(f.calls.filter(j=>j.kind==='apply').length,0);
  assert.deepEqual(f.calls.filter(j=>j.kind==='trial').map(j=>j.input.row.condition),['baseline','candidate','candidate','baseline','baseline','candidate','candidate','baseline']);
  const c=await f.run({decision:decision(b)});assert.equal(c.final.outcome,'applied');
  assert.deepEqual(f.calls.slice(-3).map(j=>j.kind),['apply','version','cleanup']);
  const count=f.calls.length;assert.deepEqual(await f.run(),c);assert.equal(f.calls.length,count);
  assert.equal(c.report.full_hierarchical_usage,null);assert.equal(c.report.formal_score,null);
});
for(const disposition of ['approved','rejected'])test(`unselected owner permits result ${disposition} without planning, applying or disposing`,async t=>{
  const f=fixture(t);f.policy.normal_target=null;
  let s=await f.run();assert.equal(s.status,'awaiting_evaluation_approval');
  s=await f.run({decision:decision(s)});assert.equal(s.status,'awaiting_result_review');
  assert.equal(s.completed_trials,8);assert.equal(s.pending_gate.kind,'result');
  assert.equal(s.pending_gate.packet.application_available,false);assert.equal(s.pending_gate.packet.normal_target,null);
  assert.deepEqual(f.calls.slice(-1).map(j=>j.kind),['report']);
  const end=await f.run({decision:decision(s,disposition)});
  assert.equal(end.final.outcome,`result_${disposition}_retained`);assert.equal(end.application,null);
  assert.equal(f.calls.some(j=>['plan','apply','version','cleanup','restore'].includes(j.kind)),false);
  const count=f.calls.length;assert.deepEqual(await f.run(),end);assert.equal(f.calls.length,count);
});
test('a deferred result remains at the exact review gate across resume without consuming a decision',async t=>{
  const f=fixture(t);f.policy.normal_target=null;let s=await f.run();s=await f.run({decision:decision(s)});
  const packet=canonicalDigest(s.pending_gate),count=f.calls.length;
  s=await f.run({decision:decision(s,'deferred')});assert.equal(s.status,'awaiting_result_review');
  assert.equal(canonicalDigest(s.pending_gate),packet);assert.equal(f.calls.length,count);
  assert.deepEqual(await f.run(),s);assert.equal(f.calls.length,count);
  s=await f.run({decision:decision(s)});assert.equal(s.final.outcome,'result_approved_retained');
});
test('unselected-owner Eval rejection retains evidence and cannot dispatch owner cleanup',async t=>{
  const f=fixture(t);f.policy.normal_target=null;const s=await f.run();
  const end=await f.run({decision:decision(s,'rejected')});assert.equal(end.final.outcome,'evaluation_rejected_retained');
  assert.deepEqual(f.calls.map(j=>j.kind),['generate','register','select']);
});
test('result packet cannot approve another target, and deferral is not an Eval approval',async t=>{
  const f=fixture(t);f.policy.normal_target=null;let s=await f.run();
  await assert.rejects(f.run({decision:decision(s,'deferred')}),/deferral requires a result or change gate/);
  s=await f.run({decision:decision(s)});const approved=decision(s);f.policy.normal_target=join(f.dir,'new-owner');
  await assert.rejects(f.run({decision:approved}),/resume cannot change policy/);
  assert.equal(f.calls.some(j=>['plan','apply','version','cleanup'].includes(j.kind)),false);
});
test('target-bound change can be deferred without applying or changing its exact packet',async t=>{
  const f=fixture(t);let s=await f.run();s=await f.run({decision:decision(s)});const packet=canonicalDigest(s.pending_gate),count=f.calls.length;
  s=await f.run({decision:decision(s,'deferred')});assert.equal(s.status,'awaiting_change_approval');
  assert.equal(canonicalDigest(s.pending_gate),packet);assert.equal(f.calls.length,count);
  assert.equal((await f.run({decision:decision(s,'rejected')})).final.outcome,'change_rejected');
});
for(const gate of ['evaluation','change'])test(`${gate} rejection automatically retires and cleans without applying`,async t=>{
  const f=fixture(t);let s=await f.run();if(gate==='change')s=await f.run({decision:decision(s)});
  const end=await f.run({decision:decision(s,'rejected')});assert.equal(end.final.outcome,`${gate}_rejected`);
  assert.deepEqual(f.calls.slice(-2).map(j=>[j.kind,j.input.action??null]),[['version','retire'],['cleanup',null]]);
  assert.equal(f.calls.filter(j=>j.kind==='apply').length,0);
  assert.equal(end.completed_trials,gate==='change'?8:0);
});
test('human decision transplant and policy drift cannot launch a trial',async t=>{
  const f=fixture(t),s=await f.run();await assert.rejects(f.run({decision:{...decision(s),packet_digest:canonicalDigest('other')}}),/different packet/);
  f.policy.repetitions=1;await assert.rejects(f.run(),/change policy/);assert.equal(f.calls.length,3);
});
test('consumed job with lost response is inspected and resumed without duplicate invocation',async t=>{
  const f=fixture(t);const generate=f.runtime.generate;f.runtime.generate=async job=>{await generate(job);throw new Error('synthetic coordinator lost response');};
  let s=await f.run();assert.equal(s.status,'operation_uncertain');assert.equal(f.calls.length,1);
  s=await f.run();assert.equal(s.status,'awaiting_evaluation_approval');assert.equal(f.calls.filter(j=>j.kind==='generate').length,1);
});
test('unknown active root prevents the next root; known terminal failure with closure is reported and continues',async t=>{
  const f=fixture(t),s=await f.run();let first;
  f.runtime.trial=async job=>{f.calls.push(job);first=job;return {status:'running'};};
  let state=await f.run({decision:decision(s)});assert.equal(state.status,'operation_uncertain');
  await f.run();assert.equal(f.calls.filter(j=>j.kind==='trial').length,1);
  f.receipts.set(canonicalDigest(first),{status:'failed',request_digest:canonicalDigest(first),output:{ready_for_next_root:true,reason:'synthetic environment error',root_usage:null}});
  f.runtime.trial=async job=>{f.calls.push(job);return {status:'completed',request_digest:canonicalDigest(job),output:{ready_for_next_root:true,root_usage:null}};};
  state=await f.run();assert.equal(state.status,'awaiting_change_approval');assert.equal(state.completed_trials,8);
});
test('restore is the same human change judgment, then restoration and version switch run automatically',async t=>{
  const f=fixture(t);let s=await f.run();s=await f.run({decision:decision(s)});s=await f.run({decision:decision(s)});
  s=await f.run({requestRestore:true});assert.equal(s.status,'awaiting_change_approval');assert.equal(s.pending_gate.packet.action,'restore');
  s=await f.run({decision:decision(s)});assert.equal(s.final.outcome,'restored');
  assert.deepEqual(f.calls.slice(-2).map(j=>j.kind),['restore','version']);
});
test('public automatic selection covers changed instruction signals and domain diversity without private inputs',()=>{
  const selected=selectInstructionLoopCases({catalog:[{id:'unrelated',tags:[],domain:'x'},{id:'cost',tags:['route'],domain:'x'},{id:'diverse',tags:['state'],domain:'y'}],
    changedTags:['route','state'],observedCosts:{cost:100000},limit:2});assert.deepEqual(selected.case_ids,['cost','diverse']);assert.equal(selected.holdout_claimed,false);
});
test('real process transport invokes workers and consumes their durable output; source drift stops launch',async t=>{
  const f=fixture(t),worker=join(f.dir,'worker.mjs');
  writeFileSync(worker,`import {readFileSync,writeFileSync} from 'node:fs';
import {canonicalDigest} from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};
const [a,b]=process.argv.slice(2),job=JSON.parse(readFileSync(a));
writeFileSync(b,JSON.stringify({request_digest:canonicalDigest(job),status:'completed',output:{observed:job.kind}}),{flag:'wx'});`);
  const command={argv:[process.execPath,worker],pins:[{path:worker,digest:hash(readFileSync(worker))}],model_calls:false};
  const definition={commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,command]))};
  const runtime=createInstructionLoopCommandRuntime({definition}),job={kind:'generate',key:'generate',input:{},input_digest:canonicalDigest({})};
  mkdirSync(f.root);const result=await runtime.generate(job,{root:f.root});assert.equal(result.output.observed,'generate');
  assert.deepEqual(await runtime.inspect(job,{root:f.root}),result);
  await assert.rejects(runtime.generate(job,{root:f.root}),/already allocated/);
  writeFileSync(worker,'changed');await assert.rejects(runtime.report({...job,kind:'report'},{root:f.root}),/source drift/);
});
test('a missing model-call grant fails preflight without consuming or launching the operation',async t=>{
  const f=fixture(t),worker=join(f.dir,'never-run.mjs');writeFileSync(worker,'throw new Error("must not execute")');
  const c={argv:[process.execPath,worker],pins:[{path:worker,digest:hash(readFileSync(worker))}],model_calls:true};
  const definition={commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,c]))};
  const runtime=createInstructionLoopCommandRuntime({definition});f.policy.runtime_digest=runtime.digest;
  await assert.rejects(advanceSupervisedInstructionLoop({root:f.root,policy:f.policy,runtime}),/not authorized/);
  assert.equal(inspectSupervisedInstructionLoop(f.root).active_job,null);
});
test('Registry versions activate, restore and retire through existing lifecycle authority; immutable baseline retained',t=>{
  const f=environmentFixture(t),refs=[f.adapter.baseline_asset,f.adapter.candidate_asset];
  const authority={kind:'external_asset_lifecycle_authority',authority_id:'synthetic-owner',authority_revision:'fixture',authority_evidence_digest:canonicalDigest('fixture authority')};
  const current=transitionInstructionLoopAssets({storeRoot:f.storeRoot,snapshotDigest:f.options.registrySnapshotDigest,candidateAssets:[refs[0]],action:'activate',authority});
  const candidate=transitionInstructionLoopAssets({storeRoot:f.storeRoot,snapshotDigest:current.snapshot_digest,trustedAuthorityContexts:current.trusted_authority_contexts,
    candidateAssets:[refs[1]],baselineAssets:[refs[0]],action:'activate',authority});
  const restored=transitionInstructionLoopAssets({storeRoot:f.storeRoot,snapshotDigest:candidate.snapshot_digest,trustedAuthorityContexts:candidate.trusted_authority_contexts,
    candidateAssets:[refs[1]],baselineAssets:[refs[0]],action:'restore',authority});
  const retired=transitionInstructionLoopAssets({storeRoot:f.storeRoot,snapshotDigest:restored.snapshot_digest,trustedAuthorityContexts:restored.trusted_authority_contexts,
    candidateAssets:[refs[1]],baselineAssets:[refs[0]],action:'retire',authority});
  const assets=listAssets({storeRoot:f.storeRoot,snapshotDigest:retired.snapshot_digest,trustedAuthorityContexts:retired.trusted_authority_contexts});
  assert.equal(assets.find(a=>a.version===refs[0].version&&a.stable_id===refs[0].stable_id).state,'current');
  assert.equal(assets.find(a=>a.version===refs[1].version&&a.stable_id===refs[1].stable_id).state,'retired');
  assert.equal(retired.formal_quality_admission_implied,false);
});
test('shipped public selector and Registry worker CLI consume exact requests with no models',t=>{
  const f=environmentFixture(t),worker=resolve(import.meta.dirname,'instruction-loop-registry-worker.mjs');
  const authority={kind:'external_asset_lifecycle_authority',authority_id:'synthetic-owner',authority_revision:'worker',authority_evidence_digest:canonicalDigest('fixture authority')};
  const config={storeRoot:f.storeRoot,baselineAssets:[f.adapter.baseline_asset],trustedAuthorityContexts:[],authority};
  const cfg=join(f.root,'config.json');writeFileSync(cfg,JSON.stringify(config));
  const invoke=(argv,job,index)=>{
    const request=join(f.root,`request-${index}.json`),result=join(f.root,`result-${index}.json`);writeFileSync(request,JSON.stringify(job));
    const child=spawnSync(process.execPath,[...argv,request,result],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(child.status,0,child.stderr);
    const out=JSON.parse(readFileSync(result));assert.equal(out.request_digest,canonicalDigest(job));assert.equal(out.status,'completed');return out.output;
  };
  const registration=invoke([worker,cfg,hash(readFileSync(cfg))],{kind:'register',input:{candidate:{candidate_asset:f.adapter.candidate_asset,
    imported:{registration:{snapshot_digest:f.options.registrySnapshotDigest}},generation_receipt:'fixture'}}},1);
  const retired=invoke([worker,cfg,hash(readFileSync(cfg))],{kind:'version',input:{candidate:registration,action:'retire'}},2);
  assert.equal(retired.action,'retire');assert.equal(retired.formal_quality_admission_implied,false);
  const settings=join(f.root,'settings.json');writeFileSync(settings,JSON.stringify({limit:1,changedTags:['routing']}));
  const selected=invoke([resolve(import.meta.dirname,'instruction-loop-case-selection.mjs'),settings,hash(readFileSync(settings))],
    {kind:'select',input:{catalog:[{id:'public-a',tags:['routing'],domain:'local'}]}},3);
  assert.deepEqual(selected.case_ids,['public-a']);
});

test('long case ID in a completed native reference cycle prepares the next cycle without inherited approval',async t=>{
  const f=fixture(t),id='a'.repeat(101);f.policy.catalog[0].id=id;f.policy.normal_target=null;
  const report=f.runtime.report;
  f.runtime.report=async(job,context)=>{
    const result=await report(job,context);
    result.output={kind:'supervised_instruction_reference_report_v1',formal_score:null,limits:['Synthetic reference only.'],
      rows:job.input.rows.map(row=>({fixture_id:row.case.id,role:row.condition==='baseline'?'baseline':'challenger',repetition:row.repetition,
        state:'completed',confirmed_points:1,unknown_points:0,unmet_points:0,maximum_points:1,mandatory_final_validation:true,cli_seconds:1}))};
    f.receipts.set(canonicalDigest(job),result);return result;
  };
  let state=await f.run();state=await f.run({decision:decision(state)});state=await f.run({decision:decision(state)});
  assert.equal(state.status,'completed');const before=readCompletedInstructionLoopContinuation(f.root);
  const next=prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'next-long-case'}});
  assert.equal(next.approval_carried_forward,false);
  assert.equal(next.policy.observation.previous.evaluation_summary.cases.filter(c=>c.case_id===id).length,2);
  assert.equal(next.policy.observation.previous.evaluation_summary.report_digest,canonicalDigest(before.report));
  assert.deepEqual(readCompletedInstructionLoopContinuation(f.root),before,'preparation does not mutate the completed source journal');
  const nextState=await advanceSupervisedInstructionLoop({root:join(f.dir,'next-long-case'),policy:next.policy,runtime:f.runtime});
  assert.equal(nextState.status,'awaiting_evaluation_approval');assert.equal(f.calls.filter(j=>j.kind==='trial').length,8);
  const input=f.calls.filter(j=>j.kind==='generate').at(-1).input.observation;
  assert.equal(input.previous.evaluation_summary.cases.find(c=>c.case_id===id).case_id,id);
});
