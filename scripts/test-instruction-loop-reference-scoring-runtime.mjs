import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,writeFileSync,readFileSync,rmSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInstructionReferenceScoring} from './instruction-loop-reference-scoring-runtime.mjs';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
function fixture(t,{models=true,status='completed',closed=true,defer=false}={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-reference-grade-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const worker=join(root,'worker.mjs'),counter=join(root,'calls');
 writeFileSync(worker,`import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';import {dirname,join} from 'node:path';import {canonicalDigest} from ${JSON.stringify(join(import.meta.dirname,'content-addressed-store.mjs'))};const [action,request,result]=process.argv.slice(2),receipt=join(dirname(result),'closed.json');if(action==='inspect'){if(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED!=='0')throw new Error('inspect must not launch models');if(existsSync(receipt))copyFileSync(receipt,result);}else{if(${models}&&process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED!=='1')throw new Error('no grant');writeFileSync(${JSON.stringify(counter)},'one dispatch',{flag:'wx'});const job=JSON.parse(readFileSync(request));const value={request_digest:canonicalDigest(job),status:${JSON.stringify(status)},output:{fixed_point_assessments:[],ready_for_next_root:${closed}}};if(!${defer}){writeFileSync(receipt,JSON.stringify(value));writeFileSync(result,JSON.stringify(value));}${status==='failed'?'process.exitCode=1;':''}}`);
 const command={argv:[process.execPath,worker,'execute'],inspect_argv:[process.execPath,worker,'inspect'],pins:[{path:worker,digest:hash(readFileSync(worker))}],model_calls:models};
 const p={stateRoot:join(root,'state'),storeRoot:join(root,'store'),report:{criteria:null,fixedScoring:{assessments:[]},referenceScoringCommand:command}},job={kind:'report',input:{trials:[],rows:[],selection:{},candidate:{}}};
 return {root,p,job,counter};
}
test('routine scoring requires its model grant, executes once and recovers the same positive receipt after response loss',async t=>{
 const f=fixture(t);await assert.rejects(runInstructionReferenceScoring(f.p,f.job),/not authorized/);assert.equal(existsSync(f.counter),false);
 const one=await runInstructionReferenceScoring(f.p,f.job,{modelCallsAuthorized:true});assert.equal(one.execution.status,'completed');assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
 const gradeJob={kind:'grade',input:{source_report_job_digest:canonicalDigest(f.job),...f.job.input,store_root:f.p.storeRoot,criteria:null,fixed_scoring:{assessments:[]}}};
 const result=join(f.p.stateRoot,'reference-scoring/jobs',canonicalDigest(gradeJob).slice(7),'result.json');unlinkSync(result);
 const recovered=await runInstructionReferenceScoring(f.p,f.job,{inspectOnly:true});assert.equal(recovered.execution.result_digest,one.execution.result_digest);
 await runInstructionReferenceScoring(f.p,f.job,{modelCallsAuthorized:true});assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
for(const models of [false,true])test(`closed ${models?'model-labelled fixture':'model-free'} grading failure preserves unknown quality without replay`,async t=>{
 const f=fixture(t,{models,status:'failed'}),result=await runInstructionReferenceScoring(f.p,f.job,{modelCallsAuthorized:models});
 assert.deepEqual(result.assessments,[]);assert.equal(result.execution.status,'failed');await runInstructionReferenceScoring(f.p,f.job,{inspectOnly:true});assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
test('unconfirmed model grading never gains closure from local worker exit',async t=>{
 const f=fixture(t,{closed:false});await assert.rejects(runInstructionReferenceScoring(f.p,f.job,{modelCallsAuthorized:true}),/unconfirmed/);
 await assert.rejects(runInstructionReferenceScoring(f.p,f.job,{inspectOnly:true}),/unconfirmed/);assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
test('native report worker leaves unknown grading pending and imports its later positive receipt without dispatch replay',async t=>{
 const f=fixture(t,{defer:true});f.p.kind='full_native_reference_loop_profile_v1';f.p.protectedRoot=f.root;f.p.normal={target:null};
 f.p.generator={storeRoot:f.p.storeRoot,candidateRoot:join(f.root,'candidate'),fullRoot:join(f.root,'full'),stagingRoot:join(f.root,'staging')};
 f.p.native={protectedRoot:f.root,root:join(f.root,'native'),workRoot:join(f.root,'work'),executionKind:'real_codex'};
 f.job.input.selection={execution_binding:{plan_object_digest:canonicalDigest('plan')}};f.job.input.candidate={source_revision:'synthetic'};
 t.mock.module('./instruction-loop-reference-report.mjs',{namedExports:{buildInstructionLoopReferenceReport:()=>({kind:'synthetic-reference-report',rows:[]})}});
 const {nativeInstructionLoopWorker}=await import('./instruction-loop-native-host.mjs?pending-reference');
 const resultPath=join(f.root,'outer-result.json'),sidecar=join(f.p.stateRoot,'stage-'+canonicalDigest(f.job).slice(7)+'.json');
 await nativeInstructionLoopWorker({profile:f.p,job:f.job,resultPath,modelCallsAuthorized:true});assert.equal(existsSync(sidecar),false);assert.equal(existsSync(resultPath),false);
 const gradeJob={kind:'grade',input:{...f.job.input,source_report_job_digest:canonicalDigest(f.job),store_root:f.p.storeRoot,criteria:null,fixed_scoring:{assessments:[]}}};
 const gradeResult=join(f.p.stateRoot,'reference-scoring/jobs',canonicalDigest(gradeJob).slice(7),'result.json');
 writeFileSync(gradeResult,JSON.stringify({request_digest:canonicalDigest(gradeJob),status:'completed',output:{fixed_point_assessments:[],ready_for_next_root:true}}),{flag:'wx'});
 await nativeInstructionLoopWorker({profile:f.p,job:f.job,resultPath,action:'inspect'});
 assert.equal(JSON.parse(readFileSync(resultPath)).status,'completed');assert.equal(existsSync(sidecar),true);assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
test('outer report transport stays closed successfully while pending and accepts later exact completion',async t=>{
 const f=fixture(t,{defer:true}),{createInstructionLoopCommandRuntime}=await import('./instruction-loop-command-runtime.mjs');
 f.p.kind='full_native_reference_loop_profile_v1';f.p.protectedRoot=f.root;f.p.normal={target:null};f.p.generator={storeRoot:f.p.storeRoot,candidateRoot:join(f.root,'candidate'),fullRoot:join(f.root,'full'),stagingRoot:join(f.root,'staging')};f.p.native={protectedRoot:f.root,root:join(f.root,'native'),workRoot:join(f.root,'work'),executionKind:'real_codex'};
 f.job.input.selection={execution_binding:{plan_object_digest:canonicalDigest('plan')}};f.job.input.candidate={source_revision:'synthetic'};
 const profile=join(f.root,'profile.json');writeFileSync(profile,JSON.stringify(f.p));const profileDigest=hash(readFileSync(profile));
 const wrapper=join(f.root,'native-wrapper.mjs');writeFileSync(wrapper,`import {mock} from 'node:test';mock.module(${JSON.stringify(join(import.meta.dirname,'instruction-loop-reference-report.mjs'))},{namedExports:{buildInstructionLoopReferenceReport:()=>({kind:'synthetic-reference-report',rows:[]})}});await import(${JSON.stringify(join(import.meta.dirname,'instruction-loop-native-worker.mjs'))});`);
 const command={argv:[process.execPath,'--experimental-test-module-mocks',wrapper,profile,profileDigest,'execute'],inspect_argv:[process.execPath,'--experimental-test-module-mocks',wrapper,profile,profileDigest,'inspect'],pins:[{path:wrapper,digest:hash(readFileSync(wrapper))},{path:profile,digest:profileDigest}],model_calls:true};
 const commands=Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,command]));const runtime=createInstructionLoopCommandRuntime({definition:{commands},modelCallsAuthorized:true}),root=join(f.root,'outer');
 let state=await runtime.report(f.job,{root});assert.equal(state.status,'unknown');const directory=join(root,'jobs',canonicalDigest(f.job).slice(7));assert.equal(JSON.parse(readFileSync(join(directory,'transport.json'))).exit_code,0);
 const gradeJob={kind:'grade',input:{...f.job.input,source_report_job_digest:canonicalDigest(f.job),store_root:f.p.storeRoot,criteria:null,fixed_scoring:{assessments:[]}}};
 const gradeResult=join(f.p.stateRoot,'reference-scoring/jobs',canonicalDigest(gradeJob).slice(7),'result.json');writeFileSync(gradeResult,JSON.stringify({request_digest:canonicalDigest(gradeJob),status:'completed',output:{fixed_point_assessments:[],ready_for_next_root:true}}),{flag:'wx'});
 state=await runtime.inspect(f.job,{root});assert.equal(state.status,'completed');assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
for(const shape of ['missing','null-ref','empty-ref','oversized','null-output','missing-output'])test(`closed optional grading ${shape} retains its result and usable trials as Unknown`,async t=>{
 const models=!shape.endsWith('output'),f=fixture(t,{models}),path=f.p.report.referenceScoringCommand.argv[1];let code=readFileSync(path,'utf8');
 if(shape==='null-output')code=code.replace('output:{fixed_point_assessments:[],ready_for_next_root:true}','output:null');
 else if(shape==='missing-output')code=code.replace('output:{fixed_point_assessments:[],ready_for_next_root:true}','output:undefined');
 else code=code.replace('fixed_point_assessments:[]',shape==='missing'?'unused_optional_field:null':'fixed_point_assessments:'+JSON.stringify(shape==='null-ref'?[null]:shape==='empty-ref'?[{}]:Array(257).fill({})));
 writeFileSync(path,code);f.p.report.referenceScoringCommand.pins[0].digest=hash(readFileSync(path));
 const result=await runInstructionReferenceScoring(f.p,f.job,{modelCallsAuthorized:models});assert.deepEqual(result.assessments,[]);assert.equal(result.execution.output_issue,'fixed_point_references_invalid_or_missing');
 assert.equal(result.execution.status,'completed');assert.match(result.execution.result_digest,/^sha256:/);assert.equal((await runInstructionReferenceScoring(f.p,f.job,{inspectOnly:true})).execution.result_digest,result.execution.result_digest);assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
test('closed malformed grading reaches a completed native report with a bounded Unknown limit, not a failed sidecar',async t=>{
 const f=fixture(t),worker=f.p.report.referenceScoringCommand.argv[1];writeFileSync(worker,readFileSync(worker,'utf8').replace('fixed_point_assessments:[]','fixed_point_assessments:[null]'));f.p.report.referenceScoringCommand.pins[0].digest=hash(readFileSync(worker));
 f.p.kind='full_native_reference_loop_profile_v1';f.p.protectedRoot=f.root;f.p.normal={target:null};f.p.generator={storeRoot:f.p.storeRoot,candidateRoot:join(f.root,'candidate'),fullRoot:join(f.root,'full'),stagingRoot:join(f.root,'staging')};f.p.native={protectedRoot:f.root,root:join(f.root,'native'),workRoot:join(f.root,'work'),executionKind:'real_codex'};
 f.job.input.selection={execution_binding:{plan_object_digest:canonicalDigest('plan')}};f.job.input.candidate={source_revision:'synthetic'};
 t.mock.module('./instruction-loop-reference-report.mjs',{namedExports:{buildInstructionLoopReferenceReport:()=>({kind:'synthetic-reference-report',rows:[],limits:[]})}});
 const {nativeInstructionLoopWorker}=await import('./instruction-loop-native-host.mjs?optional-grade-payload');const resultPath=join(f.root,'report-result.json');
 await nativeInstructionLoopWorker({profile:f.p,job:f.job,resultPath,modelCallsAuthorized:true});const result=JSON.parse(readFileSync(resultPath));assert.equal(result.status,'completed');assert.equal(result.output.fixed_scoring_execution.output_issue,'fixed_point_references_invalid_or_missing');assert.match(result.output.limits[0],/quality stays Unknown/);
 await nativeInstructionLoopWorker({profile:f.p,job:f.job,resultPath,action:'inspect'});assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
test('a missing model provider closure stays pending instead of becoming an optional-quality fallback',async t=>{
 const f=fixture(t),path=f.p.report.referenceScoringCommand.argv[1];writeFileSync(path,readFileSync(path,'utf8').replace('output:{fixed_point_assessments:[],ready_for_next_root:true}','output:null'));f.p.report.referenceScoringCommand.pins[0].digest=hash(readFileSync(path));
 await assert.rejects(runInstructionReferenceScoring(f.p,f.job,{modelCallsAuthorized:true}),error=>error.code==='REFERENCE_SCORING_PENDING');assert.equal(readFileSync(f.counter,'utf8'),'one dispatch');
});
