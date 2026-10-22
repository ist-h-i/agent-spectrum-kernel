import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runOwnedPrivateNativeProbeForTest as run, capturePrimaryNativeProbeFailure} from './ask-primary-native-probe-lifetime.mjs';

// New artificial transport checks only; no native executable, keys or legacy
// evaluator suites run. PID constants exist solely in injected fake transport.
function fixture(t,overrides={}){
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-native-lifetime-test-')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  let cleanups=0,starts=0,clock=1000;
  const options={request:{executable:'/synthetic/probe',args:['fixed'],input:Buffer.from('PRIVATE_STDIN_NEVER_SAVE'),cwd:'/synthetic/scratch',env:{LANG:'C'},timeout_ms:5000,max_buffer_bytes:128},outputRoot:root,trialId:'trial-1',signal:undefined,deadlineAtMs:15000,cleanup:()=>{cleanups++;},outputMode:'raw_stdio_v1',...overrides};
  const deps={platform:'darwin',now:()=>clock,setTimer:()=>({unref(){}}),clearTimer:()=>{},signalProcess:(pid,value)=>{assert.equal(pid,-123);assert.equal(value,0);throw Object.assign(new Error('finite'),{code:'ESRCH'});},executeSession:async request=>{starts++;assert.equal(request.terminationScope,'process_group');assert.equal(request.retainOutput,false);assert.equal(request.input.toString(),'PRIVATE_STDIN_NEVER_SAVE');request.onSpawn({pid:123});request.onOutput({stream:'stdout',chunk:Buffer.from('partial')});request.onOutput({stream:'stderr',chunk:Buffer.from('error')});return {pid:123,spawnObserved:true,exitCode:0};}};
  return {root,options,deps,get cleanups(){return cleanups;},get starts(){return starts;},set clock(v){clock=v;}};
}
test('normal owned capture saves bounded raw and finite completion, no secret input',async t=>{
  const f=fixture(t),r=await run(f.options,f.deps);
  assert.equal(r.receipt.termination_confirmed,true);assert.equal(f.cleanups,1);assert.equal(r.receipt.qualification,false);assert.equal(r.receipt.synthetic,true);
  assert.equal(readFileSync(join(f.root,r.receipt.stdout.path),'utf8'),'partial');
  assert.equal(readFileSync(join(f.root,r.receipt.stderr.path),'utf8'),'error');
  for(const name of readdirSync(f.root))assert.doesNotMatch(readFileSync(join(f.root,name),'utf8'),/PRIVATE_STDIN|synthetic\/scratch|\/synthetic\/probe|"pid"|"args"/u);
});
test('nonzero parent exit preserves failure and confirmed cleanup',async t=>{
  const f=fixture(t);f.deps.executeSession=async r=>{r.onSpawn({pid:123});return {pid:123,spawnObserved:true,exitCode:1};};
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_process_failed'&&e.receipt.exit_code===1);assert.equal(f.cleanups,1);
});
for(const kind of ['group-present','group-query-denied','missing-exit','pid-mismatch','unknown-signal','transport-throw'])test(`unknown termination retains scratch: ${kind}`,async t=>{
  const f=fixture(t);f.deps.executeSession=async r=>{r.onSpawn({pid:123});r.onOutput({stream:'stdout',chunk:Buffer.from('partial')});if(kind==='transport-throw')throw new Error('not retained');return {pid:kind==='pid-mismatch'?999:123,exitCode:kind==='missing-exit'?null:0,signal:kind==='unknown-signal'?'UNKNOWN':null};};
  if(kind==='group-present')f.deps.signalProcess=()=>{};
  if(kind==='group-query-denied')f.deps.signalProcess=()=>{throw Object.assign(new Error('sensitive'),{code:'EPERM'});};
  await assert.rejects(run(f.options,f.deps),e=>{assert.equal(e.receipt.termination_confirmed,false);assert.equal(e.receipt.cleanup_status,'retained_termination_unknown');return true;});
  assert.equal(f.cleanups,0);assert.equal(readFileSync(join(f.root,'trial-1.stdout.log'),'utf8'),'partial');
});
test('pre-cancel and insufficient total reservation never dispatch',async t=>{
  const c=new AbortController();c.abort();const f=fixture(t,{signal:c.signal});
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_cancelled'&&e.receipt.dispatch_status==='not_dispatched'&&e.receipt.cleanup_status==='removed');assert.equal(f.starts,0);assert.equal(f.cleanups,1);
  f.options.signal=undefined;f.options.deadlineAtMs=5000;f.options.trialId='deadline';
  await assert.rejects(run(f.options,f.deps),{code:'native_probe_deadline'});assert.equal(f.starts,0);assert.equal(f.cleanups,2);
});
test('mid-flight cancellation reaches existing owner and saves partial streams',async t=>{
  const c=new AbortController(),f=fixture(t,{signal:c.signal});
  f.deps.executeSession=async r=>{r.onSpawn({pid:123});r.onOutput({stream:'stdout',chunk:Buffer.from('partial')});c.abort();assert.equal(r.signal.aborted,true);return {pid:123,exitCode:0,interrupted:true};};
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_cancelled'&&e.receipt.cancelled&&e.receipt.termination_confirmed);
  assert.equal(f.cleanups,1);assert.equal(readFileSync(join(f.root,'trial-1.stdout.log'),'utf8'),'partial');
});
test('output overflow saves accepted prefix and refuses result',async t=>{
  const f=fixture(t);f.options.request.max_buffer_bytes=3;
  f.deps.executeSession=async r=>{r.onSpawn({pid:123});try{r.onOutput({stream:'stdout',chunk:Buffer.from('abcdef')});}catch{}return {pid:123,exitCode:0};};
  await assert.rejects(run(f.options,f.deps),{code:'native_probe_output_limit'});assert.equal(f.cleanups,1);assert.equal(readFileSync(join(f.root,'trial-1.stdout.log'),'utf8'),'abc');
});
test('save failure cannot become successful or silently overwrite old capture',async t=>{
  const f=fixture(t);f.deps.write=(path,bytes,options)=>{if(path.endsWith('.stderr.log'))throw new Error('sensitive path');writeFileSync(path,bytes,options);};
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_capture_failed'&&e.receipt.log_capture_status==='incomplete');assert.equal(f.cleanups,1);
  assert.equal(readFileSync(join(f.root,'trial-1.stdout.log'),'utf8'),'partial');
  await assert.rejects(run(f.options,f.deps),{code:'native_probe_capture_failed'});assert.equal(f.starts,1);
});
test('cleanup failure remains unavailable',async t=>{
  const f=fixture(t,{cleanup:()=>{throw new Error('private');}});
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_cleanup_failed'&&e.receipt.cleanup_status==='retained_cleanup_failed');
});
const final={status:'succeeded',exit_code:0,observed:true,requests:2,assertion_failure:false,authenticated_mixed_boundary:true};
test('focused frames preserve only candidate streams and finite verified summary',async t=>{
  const f=fixture(t,{outputMode:'focused_frames_v1'});
  f.deps.executeSession=async r=>{r.onSpawn({pid:123});const frames=Buffer.from(JSON.stringify({type:'stdout',data:Buffer.from('candidate out').toString('base64')})+'\n'+JSON.stringify({type:'stderr',data:Buffer.from('candidate err').toString('base64')})+'\n'+JSON.stringify({type:'result',result:final})+'\n');for(let i=0;i<frames.length;i+=7)r.onOutput({stream:'stdout',chunk:frames.subarray(i,i+7)});return {pid:123,exitCode:0};};
  const r=await run(f.options,f.deps);assert.deepEqual(r.result,final);assert.equal(r.stdout.toString(),'candidate out');assert.equal(r.stderr.toString(),'candidate err');
  const disk=readdirSync(f.root).map(n=>readFileSync(join(f.root,n),'utf8')).join('');assert.doesNotMatch(disk,/authenticated_mixed_boundary|"type"|PRIVATE_STDIN/u);
});
for(const kind of ['unknown-field','secret-field','missing-result','trailing','parent-stderr','invalid-base64','invalid-status'])test(`focused control refuses ${kind} and never saves control payload`,async t=>{
  const f=fixture(t,{outputMode:'focused_frames_v1'});
  f.deps.executeSession=async r=>{r.onSpawn({pid:123});let line={type:'result',result:{...final}};
    if(kind==='unknown-field')line.unknown=true;if(kind==='secret-field')line.result.key='SECRET_MAC_VALUE';if(kind==='invalid-status')line.result.exit_code=1;
    const chunk=kind==='missing-result'?Buffer.from(''):kind==='invalid-base64'?Buffer.from('{"type":"stdout","data":"%%%"}\n'):Buffer.from(JSON.stringify(line)+'\n'+(kind==='trailing'?'x':''));
    try{r.onOutput({stream:kind==='parent-stderr'?'stderr':'stdout',chunk});}catch{}return {pid:123,exitCode:0};};
  await assert.rejects(run(f.options,f.deps));
  const disk=readdirSync(f.root).map(n=>readFileSync(join(f.root,n),'utf8')).join('');assert.doesNotMatch(disk,/SECRET_MAC_VALUE|authenticated_mixed_boundary/u);
});
test('fake API requires explicit fake transport and cannot fall back to native',async t=>{
  const f=fixture(t);await assert.rejects(run(f.options,{}),{code:'native_probe_fake_transport_required'});assert.equal(readdirSync(f.root).length,0);
});
test('focused coalesced and split frames have the same per-stream bounds',async t=>{
  const f=fixture(t,{outputMode:'focused_frames_v1'});f.options.request.max_buffer_bytes=1024*1024;
  const bytes=Buffer.alloc(1024*1024,65),lines=[{type:'stdout',data:bytes.toString('base64')},{type:'stderr',data:bytes.toString('base64')},{type:'result',result:final}].map(x=>Buffer.from(JSON.stringify(x)+'\n'));
  for(const coalesced of [true,false]){
    f.options.trialId=coalesced?'coalesced':'split';
    f.deps.executeSession=async r=>{r.onSpawn({pid:123});for(const chunk of coalesced?[Buffer.concat(lines)]:lines)r.onOutput({stream:'stdout',chunk});return {pid:123,exitCode:0};};
    const r=await run(f.options,f.deps);assert.equal(r.stdout.length,bytes.length);assert.equal(r.stderr.length,bytes.length);
  }
});
for(const raw of ['{"type":"stdout","data":"","data":"QQ=="}\n','\ufeff{"type":"stdout","data":"QQ=="}\n','{"type":"result","result":{"secret":"SECRET_MAC_VALUE"},"result":'+JSON.stringify(final)+'}\n'])test('focused noncanonical control cannot hide duplicate/BOM/secret keys',async t=>{
  const f=fixture(t,{outputMode:'focused_frames_v1'});f.deps.executeSession=async r=>{r.onSpawn({pid:123});try{r.onOutput({stream:'stdout',chunk:Buffer.from(raw)});}catch{}return {pid:123,exitCode:0};};
  await assert.rejects(run(f.options,f.deps),{code:'native_probe_frame_invalid'});
  assert.doesNotMatch(readdirSync(f.root).map(n=>readFileSync(join(f.root,n),'utf8')).join(''),/SECRET_MAC_VALUE/u);
});
test('intent save refusal releases known-no-child scratch and records finite failure',async t=>{
  const f=fixture(t);f.deps.write=(path,bytes,options)=>{if(path.endsWith('.intent.json'))throw new Error('sensitive');writeFileSync(path,bytes,options);};
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_capture_failed'&&e.receipt.spawn_observed===false&&e.receipt.termination_confirmed&&e.receipt.cleanup_status==='removed');
  assert.equal(f.starts,0);assert.equal(f.cleanups,1);assert.equal(JSON.parse(readFileSync(join(f.root,'trial-1.receipt.json'))).dispatch_status,'not_dispatched');
});
test('condition deadline aborts owner and keeps finite deadline cause',async t=>{
  const f=fixture(t);let expire;f.deps.setTimer=fn=>{expire=fn;return {unref(){}};};
  f.deps.executeSession=async r=>{r.onSpawn({pid:123});expire();assert.equal(r.signal.aborted,true);return {pid:123,exitCode:0,interrupted:true};};
  await assert.rejects(run(f.options,f.deps),{code:'native_probe_deadline'});assert.equal(f.cleanups,1);
});
test('cleanup time is inside monotonic reservation',async t=>{
  const f=fixture(t);let mono=0;f.deps.monotonicNow=()=>mono;f.options.cleanup=()=>{mono=10000;};
  await assert.rejects(run(f.options,f.deps),{code:'native_probe_deadline'});
});
test('capture time is inside reservation and preserves immutable saved process evidence',async t=>{
  const f=fixture(t);let mono=0;f.deps.monotonicNow=()=>mono;
  f.deps.write=(path,bytes,options)=>{writeFileSync(path,bytes,options);if(path.endsWith('.receipt.json'))mono=10000;};
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_deadline'&&e.receipt.post_capture_failure_code==='native_probe_deadline'&&e.receipt.log_capture_status==='complete');
  assert.equal(JSON.parse(readFileSync(join(f.root,'trial-1.receipt.json'))).error_code,null);
  assert.equal(readFileSync(join(f.root,'trial-1.stdout.log'),'utf8'),'partial');
});
test('returned PID without observed ownership cannot authorize a group query or cleanup',async t=>{
  const f=fixture(t);let queries=0;f.deps.signalProcess=()=>{queries++;};
  f.deps.executeSession=async()=>({pid:123,spawnObserved:true,exitCode:0});
  await assert.rejects(run(f.options,f.deps),e=>e.code==='native_probe_termination_unknown'&&e.receipt.termination_confirmed===false);
  assert.equal(queries,0);assert.equal(f.cleanups,0);
});
test('the checked fake transport is retained even if its getter changes later',async t=>{
  const f=fixture(t);let reads=0,otherCalls=0;const checked=f.deps.executeSession;
  Object.defineProperty(f.deps,'executeSession',{enumerable:true,get(){reads++;return reads===1?checked:()=>{otherCalls++;throw new Error('unvalidated');};}});
  const r=await run(f.options,f.deps);assert.equal(r.receipt.termination_confirmed,true);assert.equal(f.starts,1);assert.equal(otherCalls,0);assert.equal(reads,1);
});


function savedFailure(f,receipt){const ref=capturePrimaryNativeProbeFailure({outputRoot:f.root,trialId:f.options.trialId},receipt);return {ref,record:JSON.parse(readFileSync(join(f.root,ref.path)))};}
test('failure sidecar: unknown termination preserves finite actual metadata and verifies existing raw',async t=>{
  const f=fixture(t);f.deps.signalProcess=()=>{};let receipt;
  await assert.rejects(run(f.options,f.deps),error=>{receipt=error.receipt;return error.code==='native_probe_termination_unknown';});
  const {ref,record}=savedFailure(f,receipt);
  assert.equal(record.receipt_status,'available');assert.equal(record.receipt.termination_confirmed,false);assert.equal(record.receipt.spawn_observed,true);
  assert.equal(record.stdout.status,'saved_verified');assert.equal(record.stderr.status,'saved_verified');assert.equal(record.receipt.log_capture_status,'complete');
  assert.equal(ref.path,'trial-1.failure.json');assert.equal(ref.bytes,readFileSync(join(f.root,ref.path)).length);assert.match(ref.digest,/^sha256:[a-f0-9]{64}$/u);
});
test('failure sidecar: incomplete capture keeps saved stdout and missing stderr distinct',async t=>{
  const f=fixture(t);let receipt;f.deps.write=(path,bytes,options)=>{if(path.endsWith('.stderr.log'))throw Error('SECRET_CAPTURE_MESSAGE');return writeFileSync(path,bytes,options);};
  await assert.rejects(run(f.options,f.deps),error=>{receipt=error.receipt;return error.code==='native_probe_capture_failed';});
  const {record}=savedFailure(f,receipt);assert.equal(record.receipt_status,'available');assert.equal(record.receipt.log_capture_status,'incomplete');
  assert.equal(record.stdout.status,'saved_verified');assert.equal(record.stderr.status,'missing_or_changed');assert.equal(record.stderr.expected_reference.path,'trial-1.stderr.log');
  assert.doesNotMatch(JSON.stringify(record),/SECRET_CAPTURE_MESSAGE/u);
});
for(const [name,value,status] of [['missing',null,'unavailable'],['invalid-kind',{kind:'forged',trial_id:'trial-1',spawn_observed:false,exit_code:0},'invalid'],['invalid-metadata',{kind:'ask_native_probe_lifetime_v2',trial_id:'trial-1'},'invalid']])test('failure sidecar: '+name+' receipt never invents observed false/zero',t=>{
  const f=fixture(t),{record}=savedFailure(f,value);assert.equal(record.receipt_status,status);assert.equal(record.receipt,null);
  assert.equal(record.stdout.status,'missing_or_changed');assert.equal(record.stderr.status,'missing_or_changed');
  assert.equal(JSON.stringify(record).includes('spawn_observed'),false);assert.equal(JSON.stringify(record).includes('exit_code'),false);
});
test('failure sidecar: tampered/missing files retain only safe expected pins',async t=>{
  const f=fixture(t),r=await run(f.options,f.deps);writeFileSync(join(f.root,r.receipt.stdout.path),'tampered');rmSync(join(f.root,r.receipt.stderr.path));
  const {record}=savedFailure(f,r.receipt);assert.equal(record.stdout.status,'missing_or_changed');assert.equal(record.stderr.status,'missing_or_changed');
  assert.deepEqual(record.stdout.expected_reference,r.receipt.stdout);assert.deepEqual(record.stderr.expected_reference,r.receipt.stderr);
});
test('failure sidecar: foreign trial/path and secret metadata cannot enter finite diagnostics',async t=>{
  const f=fixture(t),r=await run(f.options,f.deps),receipt={...r.receipt,argv:['SECRET_ARGV'],input:'SECRET_STDIN',cwd:'SECRET_CWD',message:'SECRET_MESSAGE',key:'SECRET_KEY',fd4:'SECRET_CONTROL',stdout:{...r.receipt.stdout,token:'SECRET_TOKEN'}};
  const {record}=savedFailure(f,receipt);assert.equal(record.stdout.status,'saved_verified');assert.doesNotMatch(JSON.stringify(record),/SECRET_|"argv"|"cwd"|"input"|"message"|"fd4"|"key"|"token"/u);
  f.options.trialId='trial-2';const other=savedFailure(f,{...r.receipt,trial_id:'foreign'}).record;assert.equal(other.receipt_status,'invalid');assert.equal(other.receipt,null);
  f.options.trialId='trial-3';const unsafe=savedFailure(f,{...r.receipt,trial_id:'trial-3',stdout:{path:'../secret',bytes:1,digest:r.receipt.stdout.digest}}).record;
  assert.equal(unsafe.stdout.status,'missing_or_changed');assert.equal(unsafe.stdout.expected_reference,null);assert.equal(JSON.stringify(unsafe).includes('../secret'),false);
});
test('failure sidecar: context-owned first child trial may retain actual raw references',async t=>{
  const f=fixture(t);f.options.trialId='base-1';const r=await run(f.options,f.deps);f.options.trialId='base';
  const {record}=savedFailure(f,r.receipt);assert.equal(record.receipt_status,'available');assert.equal(record.receipt.trial_id,'base-1');assert.equal(record.stdout.status,'saved_verified');
});
test('failure sidecar: exclusive write failure is fixed and preserves existing files',async t=>{
  const f=fixture(t),r=await run(f.options,f.deps);writeFileSync(join(f.root,'trial-1.failure.json'),'keep existing failure');
  assert.throws(()=>savedFailure(f,r.receipt),error=>error.code==='native_controller_capture_failed'&&error.message==='native_controller_capture_failed');
  assert.equal(readFileSync(join(f.root,'trial-1.failure.json'),'utf8'),'keep existing failure');assert.equal(readFileSync(join(f.root,'trial-1.stdout.log'),'utf8'),'partial');
});

test('failure sidecar: optional failure code accessor is read once before whitelist copy',async t=>{
  const f=fixture(t),r=await run(f.options,f.deps);let reads=0;
  Object.defineProperty(r.receipt,'post_capture_failure_code',{get(){reads++;return reads===1?'native_probe_deadline':'SECRET_SUBSTITUTED_CODE';}});
  const {record}=savedFailure(f,r.receipt);assert.equal(reads,1);assert.equal(record.receipt.post_capture_failure_code,'native_probe_deadline');
  assert.doesNotMatch(JSON.stringify(record),/SECRET_SUBSTITUTED_CODE/u);
});
