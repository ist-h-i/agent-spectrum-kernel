import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {runInstructionReferenceScoring} from './instruction-loop-reference-scoring-runtime.mjs';
const module=()=>import('./instruction-loop-host-scoring.mjs');
async function fixture(t,{evidenceKind='synthetic'}={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-host-grade-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const m=await module(),command=m.createHostReferenceScoringCommand({settingsPath:join(root,'settings.json'),protectedRoot:root,evidenceKind});
 const profile={stateRoot:join(root,'state'),storeRoot:join(root,'store'),report:{criteria:null,fixedScoring:{assessments:[]},referenceScoringCommand:command}},job={kind:'report',input:{trials:[],selection:{},candidate:{}}};
 const gradeJob={kind:'grade',input:{...job.input,source_report_job_digest:canonicalDigest(job),store_root:profile.storeRoot,criteria:null,fixed_scoring:{assessments:[]}}};
 const directory=join(profile.stateRoot,'reference-scoring/jobs',canonicalDigest(gradeJob).slice(7));
 return {root,m,profile,job,directory,evidenceKind};
}
const claim=f=>{const request=f.m.readHostReferenceScoringRequest(f.directory);return {handoff_digest:request.handoff_digest,execution_id:'host-1',provider:'host-ai',evidence_kind:f.evidenceKind};};
const completion=(f,c,refs=[])=>({handoff_digest:c.handoff_digest,claim_digest:canonicalDigest(c),status:'completed',fixed_point_assessments:refs,reference_assessments:[],closure:{status:'completed',termination_confirmed:true,evidence_ref:'retained-host-evidence'}});
test('host scoring prepares an exact pending request and recovers its positive completion without dispatch replay',async t=>{
 const f=await fixture(t);await assert.rejects(runInstructionReferenceScoring(f.profile,f.job),/uncertain|unknown/);
 const r=f.m.readHostReferenceScoringRequest(f.directory);assert.equal(r.models_started_by_runtime,false);assert.equal(JSON.parse(readFileSync(r.job_ref.path)).kind,'grade');assert.equal(r.grade_job_digest,canonicalDigest(JSON.parse(readFileSync(r.job_ref.path))));
 const c=claim(f),one=f.m.claimHostReferenceScoring(f.directory,c);assert.equal(one.claim_created,true);assert.equal(f.m.claimHostReferenceScoring(f.directory,c).claim_created,false);
 f.m.completeHostReferenceScoring(f.directory,completion(f,c));
 const result=await runInstructionReferenceScoring(f.profile,f.job,{inspectOnly:true});assert.deepEqual(result.assessments,[]);assert.equal(result.execution.status,'completed');
 const resultPath=join(f.directory,'result.json');unlinkSync(resultPath);
 assert.equal((await runInstructionReferenceScoring(f.profile,f.job,{inspectOnly:true})).execution.result_digest,result.execution.result_digest);
});
test('real host scoring requires runtime and explicit claim model grants; requests grant neither',async t=>{
 const f=await fixture(t,{evidenceKind:'host_reported'});await assert.rejects(runInstructionReferenceScoring(f.profile,f.job),/not authorized/);assert.equal(existsSync(f.directory),false);
 await assert.rejects(runInstructionReferenceScoring(f.profile,f.job,{modelCallsAuthorized:true}),/uncertain|unknown/);const c=claim(f);
 assert.throws(()=>f.m.claimHostReferenceScoring(f.directory,c),/not authorized/);
 assert.equal(f.m.claimHostReferenceScoring(f.directory,c,{modelCallsAuthorized:true}).claim_created,true);
});
test('claimed host grading cannot be taken over or re-claimed after its checkpointed file is removed',async t=>{
 const f=await fixture(t);await assert.rejects(runInstructionReferenceScoring(f.profile,f.job));const c=claim(f);f.m.claimHostReferenceScoring(f.directory,c);
 assert.throws(()=>f.m.claimHostReferenceScoring(f.directory,{...c,execution_id:'other'}),/claim|execution/);
 unlinkSync(join(f.directory,'host-scoring/claim.json'));assert.throws(()=>f.m.claimHostReferenceScoring(f.directory,c),/missing/);
});
test('unclosed completion and another job or claim cannot publish a quality result',async t=>{
 const f=await fixture(t);await assert.rejects(runInstructionReferenceScoring(f.profile,f.job));const c=claim(f);f.m.claimHostReferenceScoring(f.directory,c);
 const s=completion(f,c);assert.throws(()=>f.m.completeHostReferenceScoring(f.directory,{...s,claim_digest:hash(Buffer.from('other'))}));
 assert.throws(()=>f.m.completeHostReferenceScoring(f.directory,{...s,closure:{...s.closure,termination_confirmed:false}}));
 assert.equal((await runInstructionReferenceScoring(f.profile,f.job,{inspectOnly:true})),null);
});
test('host completion verifies reference pins and retains both optional scoring lanes',async t=>{
 const f=await fixture(t);await assert.rejects(runInstructionReferenceScoring(f.profile,f.job));const c=claim(f);f.m.claimHostReferenceScoring(f.directory,c);
 const path=join(f.root,'fixed-reference.json');writeFileSync(path,'{}');const ref={path,digest:hash(readFileSync(path))},s=completion(f,c,[ref]);
 s.reference_assessments=[ref];f.m.completeHostReferenceScoring(f.directory,s);const result=await runInstructionReferenceScoring(f.profile,f.job,{inspectOnly:true});
 assert.deepEqual(result.assessments,[ref]);assert.deepEqual(result.referenceAssessments,[ref]);
 writeFileSync(path,'{"changed":true}');assert.equal(f.m.completeHostReferenceScoring(f.directory,s).status,'completion_recorded');unlinkSync(join(f.directory,'result.json'));assert.equal((await runInstructionReferenceScoring(f.profile,f.job,{inspectOnly:true})).execution.status,'completed','optional file drift never erases known closure');
});
test('official configure selects the shipped native host port without custom argv or settings writes',async t=>{
 const f=await fixture(t),{createNativeInstructionLoopConfiguration,inspectInstructionLoopReadiness}=await import('./instruction-loop-native-configuration.mjs');
 const p={kind:'full_native_reference_loop_profile_v1',stateRoot:join(f.root,'native-state'),protectedRoot:f.root,storeRoot:join(f.root,'store'),generator:{provider:{kind:'fixture'}},normal:{target:null},policy:{normal_target:null},native:{executionKind:'real_codex'},report:{scoringProvider:{kind:'external_host'}}};
 const path=join(f.root,'profile.json');writeFileSync(path,JSON.stringify(p));const config=createNativeInstructionLoopConfiguration(path);
 assert.equal(config.runtime.commands.report.model_calls,true);assert.ok(config.runtime.commands.report.pins.some(x=>x.path.endsWith('instruction-loop-host-scoring.mjs')));assert.equal(existsSync(p.stateRoot),false);
 assert.equal(inspectInstructionLoopReadiness(path).files_written,false);
 p.report.referenceScoringCommand=f.profile.report.referenceScoringCommand;writeFileSync(path,JSON.stringify(p));assert.throws(()=>createNativeInstructionLoopConfiguration(path),/choose/);
 delete p.report.referenceScoringCommand;p.kind='full_practical_instruction_loop_profile_v1';writeFileSync(path,JSON.stringify(p));assert.throws(()=>createNativeInstructionLoopConfiguration(path),/native-only/);
});
test('operator scoring CLI derives the exact pending job and checkpoints claim/completion without a human gate',async t=>{
 const f=await fixture(t),{spawnSync}=await import('node:child_process'),{mkdirSync}=await import('node:fs'),{appendRunJournal,readRunJournal}=await import('./instruction-run-journal.mjs');
 const {createNativeInstructionLoopConfiguration}=await import('./instruction-loop-native-configuration.mjs');
 const p={kind:'full_native_reference_loop_profile_v1',stateRoot:join(f.root,'native-state'),protectedRoot:f.root,storeRoot:join(f.root,'store'),generator:{provider:{kind:'fixture'}},normal:{target:null},policy:{normal_target:null},native:{executionKind:'real_codex'},report:{criteria:null,scoringProvider:{kind:'external_host',evidence_kind:'synthetic'}}};
 const profilePath=join(f.root,'native-profile.json');writeFileSync(profilePath,JSON.stringify(p));const config=createNativeInstructionLoopConfiguration(profilePath),configPath=join(f.root,'config.json');writeFileSync(configPath,JSON.stringify(config));
 const root=join(f.root,'coordinator');mkdirSync(root);appendRunJournal(root,'synthetic_pending_report',{policy:config.policy,pending:f.job});
 await assert.rejects(runInstructionReferenceScoring(p,f.job,{coordinatorRoot:root}),/unknown/);
 const common=['--root',root,'--profile',profilePath,'--config',configPath],cli=join(import.meta.dirname,'supervised-instruction-loop-cli.mjs');
 const call=(command,args=[])=>{const r=spawnSync(process.execPath,[cli,command,...common,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 const before=readRunJournal(root).previous,r=call('scoring-request');assert.equal(readRunJournal(root).previous,before,'request is read-only');
 const {symlinkSync,statSync}=await import('node:fs');const link=join(f.root,'coordinator-link');symlinkSync(root,link);const stamp=statSync(root,{bigint:true}).mtimeNs;const linked=spawnSync(process.execPath,[cli,'scoring-request','--root',link,'--profile',profilePath,'--config',configPath],{encoding:'utf8'});assert.notEqual(linked.status,0);assert.equal(statSync(root,{bigint:true}).mtimeNs,stamp,'symlink refusal precedes lock writes');
 const c={handoff_digest:r.handoff_digest,execution_id:'cli-host',provider:'host-ai',evidence_kind:'synthetic'},claimPath=join(f.root,'claim.json');writeFileSync(claimPath,JSON.stringify(c));
 assert.equal(call('scoring-claim',['--claim',claimPath]).claim_created,true);assert.equal(call('scoring-claim',['--claim',claimPath]).claim_created,false);
 const s=completion(f,c),submission=join(f.root,'completion.json');writeFileSync(submission,JSON.stringify(s));call('scoring-complete',['--submission',submission]);
 assert.equal((await runInstructionReferenceScoring(p,f.job,{inspectOnly:true,coordinatorRoot:root})).execution.status,'completed');
 const state=readRunJournal(root).state;assert.equal(state.reference_scoring_progress.completion_digest,canonicalDigest(s));
 const {instructionReferenceScoringJob}=await import('./instruction-loop-reference-scoring-runtime.mjs');const directory=join(p.stateRoot,'reference-scoring/jobs',canonicalDigest(instructionReferenceScoringJob(p,f.job)).slice(7)),child=join(directory,'host-scoring');
 const transportPath=join(directory,'transport.json'),transport=JSON.parse(readFileSync(transportPath));writeFileSync(transportPath,JSON.stringify({...transport,exit_code:83}));const closedFailure=await runInstructionReferenceScoring(p,f.job,{inspectOnly:true,coordinatorRoot:root});assert.equal(closedFailure.execution.status,'failed');assert.deepEqual(closedFailure.assessments,[],'known transport failure keeps Unknown quality without erasing host closure');writeFileSync(transportPath,JSON.stringify(transport));
 const changed={...s,closure:{...s.closure,evidence_ref:'substituted-child-receipt'}};
 writeFileSync(join(child,'completion.json'),JSON.stringify(changed));const childState=readRunJournal(child).state;childState.completion_digest=canonicalDigest(changed);appendRunJournal(child,'self_consistent_substitution',childState);
 assert.equal(await runInstructionReferenceScoring(p,f.job,{inspectOnly:true,coordinatorRoot:root}),null,'cached result must not bypass the parent checkpoint');
 unlinkSync(join(directory,'result.json'));
 assert.equal(await runInstructionReferenceScoring(p,f.job,{inspectOnly:true,coordinatorRoot:root}),null,'normal resume must enforce the parent checkpoint, not just a self-consistent child');
 writeFileSync(join(child,'completion.json'),JSON.stringify(s));childState.completion_digest=canonicalDigest(s);appendRunJournal(child,'restore_fixture_receipt',childState);
 state.pending={...state.pending,input:{other:true}};appendRunJournal(root,'different_pending',state);
 const bad=spawnSync(process.execPath,[cli,'scoring-request',...common],{encoding:'utf8'});assert.notEqual(bad.status,0,'a different pending report cannot operate the old claim');
});
test('host source/settings drift, job transplant, symlink input and unpinned completion are refused',async t=>{
 const f=await fixture(t),{symlinkSync}=await import('node:fs');await assert.rejects(runInstructionReferenceScoring(f.profile,f.job));const c=claim(f);f.m.claimHostReferenceScoring(f.directory,c);
 const target=join(f.root,'reference.json');writeFileSync(target,'{}');const link=join(f.root,'link.json');symlinkSync(target,link);
 assert.equal(f.m.completeHostReferenceScoring(f.directory,completion(f,c,[{path:link,digest:hash(readFileSync(target))}])).status,'completion_recorded','optional quality paths do not revoke closure; importer refuses unusable evidence');
 const request=join(f.directory,'request.json'),original=readFileSync(request);writeFileSync(request,JSON.stringify({kind:'grade',input:{other:true}}));assert.throws(()=>f.m.readHostReferenceScoringRequest(f.directory),/transplant/);writeFileSync(request,original);
 const settings=join(f.root,'settings.json');writeFileSync(settings,'{}');assert.throws(()=>f.m.readHostReferenceScoringRequest(f.directory),/drift/);
});
test('a closed mixed scoring handoff reaches the native report with separate binary/fixed lanes',async t=>{
 const f=await fixture(t);f.profile.kind='full_native_reference_loop_profile_v1';f.profile.protectedRoot=f.root;f.profile.normal={target:null};f.profile.generator={storeRoot:f.profile.storeRoot,candidateRoot:join(f.root,'candidate'),fullRoot:join(f.root,'full'),stagingRoot:join(f.root,'staging')};f.profile.native={protectedRoot:f.root,root:join(f.root,'native'),workRoot:join(f.root,'work'),executionKind:'real_codex'};f.job.input.selection={execution_binding:{plan_object_digest:'approved-fixture-plan'}};
 t.mock.module('./instruction-loop-reference-report.mjs',{namedExports:{buildInstructionLoopReferenceReport:input=>({received:input,limits:[]})}});const {nativeInstructionLoopWorker}=await import('./instruction-loop-native-host.mjs?mixed-host');
 const resultPath=join(f.root,'outer-result.json');await nativeInstructionLoopWorker({profile:f.profile,job:f.job,resultPath});assert.equal(existsSync(resultPath),false);
 const {instructionReferenceScoringJob}=await import('./instruction-loop-reference-scoring-runtime.mjs');f.directory=join(f.profile.stateRoot,'reference-scoring/jobs',canonicalDigest(instructionReferenceScoringJob(f.profile,f.job)).slice(7));const c=claim(f);f.m.claimHostReferenceScoring(f.directory,c);
 const path=join(f.root,'refs.json');writeFileSync(path,'{}');const ref={path,digest:hash(readFileSync(path))},s=completion(f,c,[ref]);s.reference_assessments=[ref];f.m.completeHostReferenceScoring(f.directory,s);
 await nativeInstructionLoopWorker({profile:f.profile,job:f.job,resultPath,action:'inspect'});const r=JSON.parse(readFileSync(resultPath));assert.equal(r.status,'completed');assert.deepEqual(r.output.received.dynamicAssessments,[ref]);assert.deepEqual(r.output.received.fixedScoring.assessments,[ref]);
});
