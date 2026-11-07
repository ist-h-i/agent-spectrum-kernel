// Large protocol metadata only; no model, task, owner or operational Eval.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {canonicalDigest} from './content-addressed-store.mjs';import {instructionBytesDigest as hash} from './instruction-environment.mjs';import {createInstructionLoopCommandRuntime} from './instruction-loop-command-runtime.mjs';
function temp(t){const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-loop-artifact-bound-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
for(const large of ['request','result'])test(`loop transport carries a >1MiB ${large} within its existing16MiB journal bound without replay`,async t=>{
 const root=temp(t),worker=join(root,'worker.mjs'),counter=join(root,'counter');writeFileSync(worker,`import {readJsonFileStrict,writeCanonicalJsonNoReplace,canonicalDigest} from ${JSON.stringify(join(import.meta.dirname,'content-addressed-store.mjs'))};import {writeFileSync} from 'node:fs';const [request,result]=process.argv.slice(2),job=readJsonFileStrict(request,'synthetic request',16*1024*1024);writeFileSync(${JSON.stringify(counter)},'one',{flag:'wx'});writeCanonicalJsonNoReplace({outputPath:result,artifact:{request_digest:canonicalDigest(job),status:'completed',output:{payload:'x'.repeat(job.input.output_size)}},maximumBytes:16*1024*1024});`);
 const command={argv:[process.execPath,worker],pins:[{path:worker,digest:hash(readFileSync(worker))}],model_calls:false},runtime=createInstructionLoopCommandRuntime({definition:{commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,command]))}});
 const job={kind:'generate',input:{padding:large==='request'?'x'.repeat(2*1024*1024):'',output_size:large==='result'?2*1024*1024:1}};
 const result=await runtime.generate(job,{root});assert.equal(result.status,'completed');assert.equal(result.output.payload.length,job.input.output_size);assert.equal((await runtime.inspect(job,{root})).status,'completed');assert.equal(readFileSync(counter,'utf8'),'one');
});
test('native IPC reads large pinned profile, request and positive sidecar and can inspect the same result twice',t=>{
 const root=temp(t),stateRoot=join(root,'state');mkdirSync(stateRoot);
 const profile={kind:'full_native_reference_loop_profile_v1',protectedRoot:root,stateRoot,storeRoot:join(root,'store'),normal:{target:null},generator:{storeRoot:join(root,'store'),candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging')},native:{protectedRoot:root,root:join(root,'native'),workRoot:join(root,'work'),executionKind:'real_codex'},report:{},padding:'x'.repeat(2*1024*1024)};
 const job={kind:'report',input:{padding:'x'.repeat(2*1024*1024)}},result={request_digest:canonicalDigest(job),status:'completed',output:{padding:'x'.repeat(2*1024*1024)}};
 const p=join(root,'profile.json'),request=join(root,'request.json'),output=join(root,'result.json');writeFileSync(p,JSON.stringify(profile));writeFileSync(request,JSON.stringify(job));writeFileSync(join(stateRoot,'stage-'+canonicalDigest(job).slice(7)+'.json'),JSON.stringify(result));
 for(let n=0;n<2;n++){const read=spawnSync(process.execPath,[join(import.meta.dirname,'instruction-loop-native-worker.mjs'),p,hash(readFileSync(p)),'inspect',request,output],{encoding:'utf8'});assert.equal(read.status,0,read.stderr);assert.equal(JSON.parse(readFileSync(output)).output.padding.length,2*1024*1024);}
});
test('a request above16MiB refuses before reserving any worker directory',async t=>{
 const {existsSync}=await import('node:fs'),root=temp(t),worker=join(root,'worker.mjs');writeFileSync(worker,'throw new Error("must not start");');
 const command={argv:[process.execPath,worker],pins:[{path:worker,digest:hash(readFileSync(worker))}],model_calls:false},runtime=createInstructionLoopCommandRuntime({definition:{commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,command]))}});
 await assert.rejects(runtime.generate({kind:'generate',input:{padding:'x'.repeat(17*1024*1024)}},{root}),/exceeds16MiB/);assert.equal(existsSync(join(root,'jobs')),false);
});
test('practical worker accepts large settings, public metadata request and a large command pin without changing task/source limits',t=>{
 const root=temp(t),settings=join(root,'settings.json'),request=join(root,'request.json'),result=join(root,'result.json'),pin=join(root,'context.json');writeFileSync(pin,JSON.stringify({padding:'x'.repeat(2*1024*1024)}));
 const command={argv:[process.execPath,'-e','process.stdout.write("synthetic check")'],pins:[{path:pin,digest:hash(readFileSync(pin))}],model_calls:false,timeout_ms:5000};
 writeFileSync(settings,JSON.stringify({padding:'x'.repeat(2*1024*1024),cases:{c:{files:[]}},conditions:{baseline:{command,command_role:'check'}}}));
 const job={input:{row:{case_id:'c',condition:'baseline',public_input_digest:canonicalDigest([])},padding:'x'.repeat(2*1024*1024)}};writeFileSync(request,JSON.stringify(job));
 const worker=spawnSync(process.execPath,[join(import.meta.dirname,'practical-evaluation-worker.mjs'),settings,hash(readFileSync(settings)),'execute',request,result],{encoding:'utf8'});assert.equal(worker.status,0,worker.stderr);assert.equal(JSON.parse(readFileSync(result)).output.notes.outcome,'pass');
});
test('model-free assessor accepts large pinned settings/request while preserving the small semantic assessment',t=>{
 const root=temp(t),settings=join(root,'settings.json'),request=join(root,'request.json'),result=join(root,'result.json');
 writeFileSync(settings,JSON.stringify({kind:'fixture',assessment:{action:'reference',reason:'Synthetic only.'},padding:'x'.repeat(2*1024*1024)}));const job={kind:'assess',input:{packet:{padding:'x'.repeat(2*1024*1024)}}};writeFileSync(request,JSON.stringify(job));
 const run=spawnSync(process.execPath,[join(import.meta.dirname,'practical-evaluation-assessor.mjs'),settings,hash(readFileSync(settings)),request,result],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);const value=JSON.parse(readFileSync(result));assert.equal(value.output.assessment.packet_digest,canonicalDigest(job.input.packet));assert.equal(value.output.assessment_execution.model_calls,0);
});
test('standard configure and read-only readiness accept a large native profile without dispatch',t=>{
 const root=temp(t),profile=join(root,'profile.json'),configRoot=join(root,'config');
 writeFileSync(profile,JSON.stringify({kind:'full_native_reference_loop_profile_v1',normal:{target:null},policy:{normal_target:null},generator:{provider:{kind:'fixture'}},native:{executionKind:'real_codex'},padding:'x'.repeat(2*1024*1024)}));
 const cli=join(import.meta.dirname,'supervised-instruction-loop-cli.mjs');let run=spawnSync(process.execPath,[cli,'configure','--root',configRoot,'--profile',profile],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).models_started,false);
 run=spawnSync(process.execPath,[cli,'readiness','--profile',profile],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).execution_readiness,'not_probed');
});
