import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {readRunJournal,appendRunJournal} from './instruction-run-journal.mjs';
import * as loop from './supervised-instruction-loop.mjs';
import {projectInstructionLoopObservation} from './instruction-loop-feedback.mjs';
const decision=(s,disposition='approved')=>({disposition,packet_digest:canonicalDigest(s.pending_gate),reason:'Explicit synthetic human decision.'});
function fixture(t,{target=null}={}){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'ask-result-discard-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));const root=join(dir,'run'),calls=[];
 const policy={kind:'reference_instruction_loop_v1',id:'old',runtime_digest:canonicalDigest('fixture'),observation:{goal:'Fresh public objective.'},catalog:[{id:'public',public_input_digest:canonicalDigest('task')}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:target,formal_admission_implied:false};
 const report={kind:'supervised_instruction_reference_report_v1',rows:['baseline','challenger'].map(role=>({fixture_id:'private-result-case',repetition:1,role,state:'completed',confirmed_points:987,unknown_points:0,unmet_points:0,maximum_points:987,mandatory_final_validation:true,cli_seconds:987654,root_input_tokens:987654,root_output_tokens:987654})),conditions:{baseline:{confirmed_points:987,cli_seconds:987654},challenger:{confirmed_points:987,cli_seconds:987654}},formal_score:null};
 const runtime={digest:policy.runtime_digest,inspect:async()=>null};for(const k of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[k]=async job=>{calls.push(job);return{request_digest:canonicalDigest(job),status:'completed',output:k==='select'?{case_ids:['public']}:k==='register'?{registry:{snapshot_digest:canonicalDigest('registry')}}:k==='report'?report:k==='trial'?{ready_for_next_root:true}:{}};};
 return{dir,root,policy,report,calls,run:extra=>loop.advanceSupervisedInstructionLoop({root,policy,runtime,...extra})};
}
async function review(f){const cases=await f.run();return f.run({decision:decision(cases)});}
function bindings(f,reason='Discard these results; retain the candidate and original evidence.'){
 const h=readRunJournal(f.root),s=h.state,operationRoot=join(f.dir,'operation');if(!existsSync(operationRoot)){mkdirSync(operationRoot);appendRunJournal(operationRoot,'synthetic_completed_parent',{current:{root:f.root},status:'completed',preparation:null});}return{root:f.root,operationRoot,expectedJournalDigest:h.previous,expectedReportDigest:canonicalDigest(s.outputs.report),expectedDecisionDigest:canonicalDigest(s.result_decision??null),expectedRevisionDigest:s.report_revision?.reference.digest??null,reason};
}
test('explicit result discard completes without extra work and excludes all result-derived continuation inputs',async t=>{
 const f=fixture(t),s=await review(f),count=f.calls.length,before=readRunJournal(f.root).state.outputs.report;
 const end=await f.run({decision:decision(s,'discarded')});assert.equal(end.final.outcome,'result_discarded_retained');assert.equal(f.calls.length,count);assert.deepEqual(end.report,before);assert.equal(end.application,null);
 const h=loop.readCompletedInstructionLoopContinuation(f.root);assert.equal(h.report,null);assert.equal(h.result_disposition.disposition,'discarded');
 const next=loop.prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'next',observation:{goal:'Independent fresh workflow objective.'}}});const text=JSON.stringify(next.policy.observation);assert.equal(next.policy.observation.kind,'instruction_loop_discarded_continuation_v1');assert.ok(!text.includes('987654')&&!text.includes('private-result-case'));assert.equal(next.policy.observation.previous.failure_count,undefined);assert.equal(next.policy.observation.previous.evaluation_summary,undefined);assert.equal(next.policy.observation.previous.report_revision,undefined);assert.equal(projectInstructionLoopObservation(next.policy.observation).previous_cycle.result_disposition.disposition,'discarded');
 assert.throws(()=>loop.prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'override'},resultSummary:'Resurrect old metrics.'}),/discard/);
 assert.throws(()=>loop.prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'revision'},reportRevision:{path:'/unread',digest:canonicalDigest('forbidden')}}),/discard/);
});
test('legacy result rejection is still usable until explicitly discarded with exact append-only bindings',async t=>{
 const f=fixture(t),s=await review(f);await f.run({decision:decision(s,'rejected')});assert.deepEqual(loop.readCompletedInstructionLoopContinuation(f.root).report,f.report);const options=bindings(f),original=readRunJournal(f.root),count=f.calls.length;
 const out=loop.discardCompletedInstructionLoopResult(options);assert.equal(out.result_disposition.disposition,'discarded');assert.equal(f.calls.length,count);const h=readRunJournal(f.root);assert.equal(h.events.length,original.events.length+1);assert.deepEqual(h.state.outputs,original.state.outputs);assert.deepEqual(h.state.result_decision,original.state.result_decision);assert.equal(h.state.outputs.final.outcome,'result_rejected_retained');
 const digest=h.previous;assert.deepEqual(loop.discardCompletedInstructionLoopResult(options),out);assert.equal(readRunJournal(f.root).previous,digest);assert.throws(()=>loop.discardCompletedInstructionLoopResult({...options,reason:'Different request'}),/discard|differ/);assert.equal(readRunJournal(f.root).previous,digest);
});
for(const field of ['expectedJournalDigest','expectedReportDigest','expectedDecisionDigest','expectedRevisionDigest'])test('legacy discard refuses stale '+field+' without journal mutation',async t=>{
 const f=fixture(t),s=await review(f);await f.run({decision:decision(s,'rejected')});const options=bindings(f),before=readRunJournal(f.root).previous;options[field]=canonicalDigest('foreign');assert.throws(()=>loop.discardCompletedInstructionLoopResult(options));assert.equal(readRunJournal(f.root).previous,before);
});
test('discard is unavailable at case approval or an owner change gate',async t=>{
 const f=fixture(t);let s=await f.run(),before=readRunJournal(f.root).previous;await assert.rejects(f.run({decision:decision(s,'discarded')}),/result/);assert.equal(readRunJournal(f.root).previous,before);
 const g=fixture(t,{target:'/synthetic-owner'});s=await review(g);before=readRunJournal(g.root).previous;await assert.rejects(g.run({decision:decision(s,'discarded')}),/result/);assert.equal(readRunJournal(g.root).previous,before);assert.equal(g.calls.some(j=>j.kind==='apply'),false);
});
test('legacy discard refuses approved results, pending gates and active cycle locks',async t=>{
 const f=fixture(t),s=await review(f);const before=readRunJournal(f.root).previous;assert.throws(()=>loop.discardCompletedInstructionLoopResult(bindings(f)),/completed|decision/);assert.equal(readRunJournal(f.root).previous,before);await f.run({decision:decision(s)});assert.throws(()=>loop.discardCompletedInstructionLoopResult(bindings(f)),/reject|discard/);
 const g=fixture(t),q=await review(g);await g.run({decision:decision(q,'rejected')});const options=bindings(g);mkdirSync(join(g.root,'.advance-lock'));assert.throws(()=>loop.discardCompletedInstructionLoopResult(options),/lock|already/);
});

test('discarded projection rejects reintroduced evaluation/count/revision fields',async t=>{
 const f=fixture(t),s=await review(f);await f.run({decision:decision(s,'discarded')});const next=loop.prepareNextSupervisedInstructionLoop({root:f.root,nextPolicy:{...f.policy,id:'next',observation:{goal:'Fresh independent objective.'}}});
 for(const key of ['evaluation_summary','report_revision','failure_count','result_summary','metrics']){const value=structuredClone(next.policy.observation);value.previous[key]=null;assert.throws(()=>projectInstructionLoopObservation(value));}
});

import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
import {createComponentInstructionLoopConfiguration} from './instruction-loop-component-runtime.mjs';
import {advanceInstructionLoopOperation} from './instruction-loop-operation.mjs';
import {buildNextComponentInstructionLoopProfile} from './instruction-loop-component-continuation.mjs';
import {createNativeInstructionLoopConfiguration,buildNextNativeInstructionLoopProfile} from './instruction-loop-native-configuration.mjs';

test('component operation stops after discard and next preparation requires fresh feedback without measured costs',async t=>{
 const f=componentLoopFixture(t);f.profile.normal.target=null;f.profile.policy.normal_target=null;f.profile.selection.observedCosts={public:7};writeFileSync(f.profilePath,JSON.stringify(f.profile));writeFileSync(f.configPath,JSON.stringify(createComponentInstructionLoopConfiguration(f.profilePath)));
 assert.ok(createComponentInstructionLoopConfiguration(f.profilePath).runtime.source_pins.some(p=>p.path.endsWith('/instruction-loop-result-disposition.mjs')));
 const root=join(f.workspaceRoot,'operation'),options={root,profilePath:f.profilePath,configPath:f.configPath,maxCycles:3},run=extra=>advanceInstructionLoopOperation({...options,...extra}),owner=readFileSync(join(f.target,'README.md'));
 let s=await run();s=await run({decision:decision(s)});assert.equal(s.status,'awaiting_result_review');const candidate=s.pending_gate.packet.candidate,before=readRunJournal(s.current_cycle.root).state.outputs.report;
 s=await run({decision:decision(s,'discarded')});assert.equal(s.operation_status,'completed');assert.equal(s.cycle_number,1);assert.equal(s.result_disposition.disposition,'discarded');assert.equal(s.final.outcome,'result_discarded_retained');assert.deepEqual(s.report,before);assert.equal(s.application,null);assert.deepEqual(readFileSync(join(f.target,'README.md')),owner);assert.equal(existsSync(join(root,'cycle-002')),false);assert.equal(existsSync(f.profile.candidateRoot),true);assert.deepEqual(s.final.candidate,candidate);
 const next={root:s.current_cycle.root,profilePath:f.profilePath,configPath:f.configPath,outputRoot:join(f.workspaceRoot,'fresh-next'),id:'fresh-next'};
 assert.throws(()=>buildNextComponentInstructionLoopProfile(next),/fresh feedback/);assert.equal(existsSync(next.outputRoot),false);
 const built=buildNextComponentInstructionLoopProfile({...next,feedback:{goal:'Fresh public instruction objective; no prior evaluation evidence.'}});assert.equal(built.profile.policy.observation.kind,'instruction_loop_discarded_continuation_v1');assert.deepEqual(built.profile.selection.observedCosts,{public:7});assert.equal(existsSync(built.output_root),false);assert.equal(built.profile.policy.observation.previous.evaluation_summary,undefined);
 assert.throws(()=>buildNextComponentInstructionLoopProfile({...next,feedback:{goal:'Fresh'},reportRevision:{path:'/unread',digest:canonicalDigest('foreign')}}),/discard/);
 // Legacy explicit discard can lock and validate the real parent/cycle pair.
 const g=componentLoopFixture(t);g.profile.normal.target=null;g.profile.policy.normal_target=null;writeFileSync(g.profilePath,JSON.stringify(g.profile));writeFileSync(g.configPath,JSON.stringify(createComponentInstructionLoopConfiguration(g.profilePath)));const op=join(g.workspaceRoot,'operation'),run2=extra=>advanceInstructionLoopOperation({root:op,profilePath:g.profilePath,configPath:g.configPath,maxCycles:1,...extra});let q=await run2();q=await run2({decision:decision(q)});q=await run2({decision:decision(q,'rejected')});const h=readRunJournal(q.current_cycle.root),state=h.state,opts={root:q.current_cycle.root,operationRoot:op,expectedJournalDigest:h.previous,expectedReportDigest:canonicalDigest(state.outputs.report),expectedDecisionDigest:canonicalDigest(state.result_decision),expectedRevisionDigest:null,reason:'Explicitly discard this historical rejected result.'};
 mkdirSync(join(op,'.advance-lock'));assert.throws(()=>loop.discardCompletedInstructionLoopResult(opts));rmSync(join(op,'.advance-lock'),{recursive:true});const discarded=loop.discardCompletedInstructionLoopResult(opts);assert.equal(discarded.result_disposition.disposition,'discarded');assert.equal(readRunJournal(op).state.status,'completed');
});

test('native continuation excludes discarded scores, resource summary and observed-cost updates',async t=>{
 const f=fixture(t),profilePath=join(f.dir,'profile.json'),configPath=join(f.dir,'config.json'),profile={kind:'full_native_reference_loop_profile_v1',protectedRoot:f.dir,stateRoot:join(f.dir,'state'),storeRoot:join(f.dir,'store'),generator:{baselineSourceRoot:join(f.dir,'base'),candidateRoot:join(f.dir,'candidate'),fullRoot:join(f.dir,'full'),stagingRoot:join(f.dir,'staging'),provider:{kind:'fixture'}},normal:{target:null},policy:{...f.policy},native:{root:join(f.dir,'native'),workRoot:join(f.dir,'work'),executionKind:'real_codex'},selection:{observedCosts:{public:7}},report:{assessments:[]}};
 writeFileSync(profilePath,JSON.stringify(profile));const config=createNativeInstructionLoopConfiguration(profilePath);writeFileSync(configPath,JSON.stringify(config));f.policy.runtime_digest=config.policy.runtime_digest;for(const command of Object.values(config.runtime.commands))assert.ok(command.pins.some(p=>p.path.endsWith('/instruction-loop-result-disposition.mjs')));
 const {fullPracticalControllerPins}=await import('./instruction-loop-practical-runtime.mjs');assert.ok(fullPracticalControllerPins().some(p=>p.path.endsWith('/instruction-loop-result-disposition.mjs')));
 // A matching fake runtime protects both configured identity and measured sentinels.
 const runtime={digest:config.policy.runtime_digest,inspect:async()=>null};for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[kind]=async job=>({request_digest:canonicalDigest(job),status:'completed',output:kind==='select'?{case_ids:['public']}:kind==='register'?{registry:{snapshot_digest:canonicalDigest('registry')}}:kind==='report'?f.report:kind==='trial'?{ready_for_next_root:true}:{}});
 const run=extra=>loop.advanceSupervisedInstructionLoop({root:f.root,policy:config.policy,runtime,...extra});let s=await run();s=await run({decision:decision(s)});await run({decision:decision(s,'discarded')});
 const opts={root:f.root,profilePath,configPath,outputRoot:join(f.dir,'next'),id:'next'};assert.throws(()=>buildNextNativeInstructionLoopProfile(opts),/fresh feedback/);const built=buildNextNativeInstructionLoopProfile({...opts,feedback:{goal:'Fresh objective without discarded measurements.'}});assert.deepEqual(built.profile.selection.observedCosts,{public:7});assert.equal(built.profile.policy.observation.kind,'instruction_loop_discarded_continuation_v1');assert.ok(!JSON.stringify(built.profile.policy.observation).includes('987654'));
 assert.throws(()=>buildNextNativeInstructionLoopProfile({...opts,feedback:{goal:'Fresh'},resultSummary:'Old metrics'}),/discard/);assert.equal(existsSync(opts.outputRoot),false);
});

test('historical discard requires its completed current parent and cannot omit or substitute it',async t=>{
 const f=fixture(t),s=await review(f);await f.run({decision:decision(s,'rejected')});const options=bindings(f),before=readRunJournal(f.root).previous;const {operationRoot,...noParent}=options;assert.throws(()=>loop.discardCompletedInstructionLoopResult(noParent),/parent operation/);
 for(const changed of [{current:{root:join(f.dir,'another')}},{status:'advancing'},{preparation:{reserved:true}}]){const op=readRunJournal(operationRoot).state;appendRunJournal(operationRoot,'synthetic_parent_changed',{current:{root:f.root},status:'completed',preparation:null,...changed});assert.throws(()=>loop.discardCompletedInstructionLoopResult(options));assert.equal(readRunJournal(f.root).previous,before);}
});
