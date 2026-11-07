import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {appendRunJournal,readRunJournal} from './instruction-run-journal.mjs';
import {createNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
import {prepareFailedInstructionLoopConfiguration} from './instruction-loop-failed-preparation.mjs';
import {projectInstructionLoopObservation} from './instruction-loop-feedback.mjs';
function fixture(t,{provider='fixture'}={}){
 const base=realpathSync(mkdtempSync(join(tmpdir(),'ask-failed-prep-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const root=join(base,'old-run');mkdirSync(root);const profilePath=join(base,'profile.json'),configPath=join(base,'config.json');
 const p={kind:'full_native_reference_loop_profile_v1',protectedRoot:base,stateRoot:join(base,'old-state'),storeRoot:join(base,'store'),baselineEnvironmentObjectDigest:canonicalDigest('baseline'),
  generator:{baselineSourceRoot:join(base,'source'),baselineRevision:'synthetic',candidateRoot:join(base,'old-candidate'),fullRoot:join(base,'old-full'),stagingRoot:join(base,'old-staging'),provider:{kind:provider,...(provider==='codex'?{sessionRoot:join(base,'old-provider-session')}:{})},parentAssets:[]},normal:{target:null},
  native:{executionKind:'real_codex',root:join(base,'native-old'),workRoot:join(base,'work-old'),baselineFullRoot:join(base,'baseline-full')},report:{assessments:[]},
  policy:{kind:'reference_instruction_loop_v1',id:'failed-old',observation:{goal:'Improve useful public instructions.'},catalog:[{id:'case',public_input_digest:canonicalDigest('task')}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:null,formal_admission_implied:false}};
 writeFileSync(profilePath,JSON.stringify(p));const config=createNativeInstructionLoopConfiguration(profilePath);writeFileSync(configPath,JSON.stringify(config));
 const pending={kind:'select',key:'select',input:{catalog:p.policy.catalog}},directory=join(root,'jobs',canonicalDigest(pending).slice(7));mkdirSync(directory,{recursive:true});
 const result={request_digest:canonicalDigest(pending),status:'failed',output:{reason:'Public package identity differs from the frozen delivery inventory.'}},transport={request_digest:canonicalDigest(pending),exit_code:1,signal:null};
 for(const [name,value] of [['request',pending],['result',result],['transport',transport]])writeFileSync(join(directory,name+'.json'),JSON.stringify(value));
 const state={policy:config.policy,status:'operation_uncertain',pending,outputs:{generate:{synthetic:true},register:{synthetic:true}},trials:[]};appendRunJournal(root,'inspection_pending',state);
 return {base,p,root,directory,profilePath,configPath,outputRoot:join(base,'fresh'),id:'fresh-cycle',before:hash(readFileSync(join(root,'000000.json'))),state};
}
test('closed pre-case failure prepares fresh pinned configuration idempotently without changing the original failed journal or starting work',t=>{
 const f=fixture(t),result=prepareFailedInstructionLoopConfiguration(f),p=JSON.parse(readFileSync(result.profile_path));
 assert.equal(result.models_started,false);assert.equal(result.approval_carried_forward,false);assert.equal(existsSync(result.run_root),false);
 assert.equal(existsSync(p.native.root),false);assert.equal(existsSync(p.generator.candidateRoot),false);
 assert.notEqual(p.native.root,f.p.native.root);assert.equal(projectInstructionLoopObservation(p.policy.observation).previous_failed_run.failed_stage,'select');
 assert.deepEqual(prepareFailedInstructionLoopConfiguration(f),result);assert.equal(hash(readFileSync(join(f.root,'000000.json'))),f.before);assert.equal(readRunJournal(f.root).state.status,'operation_uncertain');
});
test('unknown closure, model work, active lock, baseline changes and source overlap refuse without fresh work',t=>{
 for(const mutate of [f=>rmSync(join(f.directory,'transport.json')),f=>mkdirSync(join(f.root,'.advance-lock')),f=>f.outputRoot=f.p.generator.candidateRoot,
  f=>{const p=JSON.parse(readFileSync(f.profilePath));p.baselineEnvironmentObjectDigest=canonicalDigest('different baseline');const file=join(f.base,'replacement.json');writeFileSync(file,JSON.stringify(p));f.replacementProfilePath=file;},
  f=>{const c=JSON.parse(readFileSync(f.configPath));c.runtime.commands.select.model_calls=true;writeFileSync(f.configPath,JSON.stringify(c));}]){
  const f=fixture(t);mutate(f);assert.throws(()=>prepareFailedInstructionLoopConfiguration(f));assert.equal(existsSync(join(f.base,'fresh')),false);
 }
});
test('partial preparation and modified prepared files are preserved instead of overwritten or replayed',t=>{
 const f=fixture(t);mkdirSync(f.outputRoot);writeFileSync(join(f.outputRoot,'partial'),'keep');assert.throws(()=>prepareFailedInstructionLoopConfiguration(f),/partial/);assert.equal(readFileSync(join(f.outputRoot,'partial'),'utf8'),'keep');
 const g=fixture(t),prepared=prepareFailedInstructionLoopConfiguration(g);writeFileSync(prepared.profile_path,'changed');assert.throws(()=>prepareFailedInstructionLoopConfiguration(g),/changed/);
});
test('the fresh prepared policy reaches both new human gates and never executes the consumed old stage',async t=>{
 const f=fixture(t),prepared=prepareFailedInstructionLoopConfiguration(f),config=JSON.parse(readFileSync(prepared.config_path));
 const {advanceSupervisedInstructionLoop}=await import('./supervised-instruction-loop.mjs');const calls=[],receipts=new Map();
 const runtime={digest:config.policy.runtime_digest,inspect:async job=>receipts.get(canonicalDigest(job))??{status:'unknown'}};
 for(const kind of ['generate','register','select','trial','report','plan','apply','version','cleanup','restore'])runtime[kind]=async job=>{
  calls.push(kind);const result={request_digest:canonicalDigest(job),status:'completed',output:kind==='select'?{case_ids:['case']}:kind==='trial'?{ready_for_next_root:true}:kind==='report'?{formal_score:null}:{synthetic:true}};receipts.set(canonicalDigest(job),result);return result;
 };
 const run=extra=>advanceSupervisedInstructionLoop({root:prepared.run_root,policy:config.policy,runtime,...extra});
 let state=await run();assert.equal(state.status,'awaiting_evaluation_approval');assert.equal(calls.includes('trial'),false);
 state=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic new-case approval only.'}});
 assert.equal(state.status,'awaiting_result_review');assert.equal(calls.filter(k=>k==='trial').length,2);assert.equal(calls.includes('apply'),false);
 state=await run({decision:{disposition:'rejected',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic second judgment only.'}});assert.equal(state.status,'completed');
 assert.equal(readRunJournal(f.root).state.status,'operation_uncertain');assert.equal(hash(readFileSync(join(f.root,'000000.json'))),f.before);
});
test('old provider evidence roots and every declared input remain outside fresh recovery destinations',t=>{
 const f=fixture(t,{provider:'codex'});mkdirSync(f.p.generator.provider.sessionRoot);f.outputRoot=join(f.p.generator.provider.sessionRoot,'nested-recovery');
 assert.throws(()=>prepareFailedInstructionLoopConfiguration(f),/overlaps/);assert.equal(existsSync(f.outputRoot),false);
});
test('idempotent preparation re-derives official output authority despite self-consistent receipt substitution',t=>{
 for(const kind of ['profile','result','original-result']){
  const f=fixture(t),prepared=prepareFailedInstructionLoopConfiguration(f),path=join(f.outputRoot,'recovery-prepared.json'),receipt=JSON.parse(readFileSync(path));
  if(kind==='profile'){
   const p=JSON.parse(readFileSync(prepared.profile_path));p.policy.observation.feedback={goal:'Substituted instruction authority.'};writeFileSync(prepared.profile_path,JSON.stringify(p));
   const config=createNativeInstructionLoopConfiguration(prepared.profile_path);writeFileSync(prepared.config_path,JSON.stringify(config));receipt.profile.digest=hash(readFileSync(prepared.profile_path));receipt.config.digest=hash(readFileSync(prepared.config_path));
  }else if(kind==='result')receipt.result.run_root=join(f.base,'substituted-run');
  else{const original=JSON.parse(readFileSync(join(f.directory,'result.json')));original.output.reason='Different evidence';writeFileSync(join(f.directory,'result.json'),JSON.stringify(original));}
  writeFileSync(path,JSON.stringify(receipt));assert.throws(()=>prepareFailedInstructionLoopConfiguration(f),/changed|intent/);
 }
});
