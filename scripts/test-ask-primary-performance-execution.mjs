// Condition ownership checks only: fake transport or ordinary Node children.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrimaryPerformanceExecutionForTest,primaryEvaluatorExecutionControl,activePrimaryProducer} from './ask-primary-evaluation-scope.mjs';
import {executeCodexSession} from './codex-exec-runner.mjs';

const reserve=worker=>4*(300000+worker+8000);
const absent=()=>{throw Object.assign(new Error('synthetic absent group'),{code:'ESRCH'});};
const request=(changes={})=>({executable:'/synthetic/node',args:[],cwd:'/synthetic',env:{},input:Buffer.from('synthetic input'),timeout_ms:100,max_buffer_bytes:1024,...changes});
const result={spawnObserved:true,pid:123,status:null,exitCode:0,signal:null,error:null,cleanupError:null,timedOut:false,interrupted:false,outputLimited:false};
function setup(t,{worker=100,options={},transport,expectCloseFailure=false,...dependencies}={}){
  const outputRoot=realpathSync(mkdtempSync(join(tmpdir(),'ask-condition-lifetime-')));
  let time=1000;const calls=[];
  const executeSession=transport??(async options=>{calls.push(options);options.onOutput({stream:'stdout',chunk:Buffer.from('out\n')});options.onOutput({stream:'stderr',chunk:Buffer.from([0,255,10])});return {...result};});
  const control=createPrimaryPerformanceExecutionForTest({workerTimeoutMs:worker,deadlineAtMs:time+reserve(worker),outputRoot,...options},
    {now:()=>time,monotonicNow:()=>time,executeSession,signalProcess:absent,platform:'linux',...dependencies});
  t.after(async()=>{try{if(expectCloseFailure)await control.close().catch(()=>{});else await control.close();}finally{rmSync(outputRoot,{recursive:true,force:true});}});
  return {control,outputRoot,calls,advance:n=>{time+=n;}};
}
test('L1 pre-abort/reservation reject before transport and supply no authority',t=>{
  assert.equal(primaryEvaluatorExecutionControl(),null);assert.equal(activePrimaryProducer(),false);
  for(const options of [{workerTimeoutMs:100,deadlineAtMs:1000+reserve(100)-1},{workerTimeoutMs:0,deadlineAtMs:9999999},{workerTimeoutMs:100,signal:AbortSignal.abort()}])
    assert.throws(()=>createPrimaryPerformanceExecutionForTest(options,{now:()=>1000}),/primary_condition/);
});
test('L2 four optional-probe/worker pairs and no fifth child',async t=>{
  const f=setup(t);for(let i=0;i<4;i++){await f.control.executeProcess('probe',request());await f.control.executeProcess('worker',request());}
  assert.equal(f.calls.length,8);assert.equal(f.control.summary().worker_starts,4);assert.equal(f.control.summary().probe_starts,4);
  await assert.rejects(()=>f.control.executeProcess('worker',request()),/primary_condition/);assert.equal(f.calls.length,8);
  const g=setup(t);for(let i=0;i<4;i++)await g.control.executeProcess('worker',request());assert.equal(g.calls.length,4);
});
test('L3 absolute budget caps each child and time exhaustion forbids next child',async t=>{
  const f=setup(t);f.advance(reserve(100)-4050);await f.control.executeProcess('worker',request());assert.equal(f.calls[0].timeoutMs,50);
  f.advance(51);assert.throws(()=>f.control.assertReady(),/primary_condition/);await assert.rejects(()=>f.control.executeProcess('worker',request()),/primary_condition/);assert.equal(f.calls.length,1);
});
test('L4 cancellation preserves partial bytes and latches refusal',async t=>{
  const abort=new AbortController();const f=setup(t,{options:{signal:abort.signal},transport:options=>new Promise(resolve=>{
    options.onOutput({stream:'stdout',chunk:Buffer.from('partial')});options.signal.addEventListener('abort',()=>resolve({...result,exitCode:null,signal:'SIGTERM',interrupted:true,error:{code:'ABORT_ERR',message:'must not escape'}}),{once:true});
  })});const pending=f.control.executeProcess('worker',request());abort.abort();const observed=await pending;
  assert.equal(observed.cancelled,true);assert.equal(observed.termination_confirmed,true);assert.deepEqual(observed.stdout,Buffer.from('partial'));
  assert.throws(()=>f.control.assertReady(),/primary_condition/);assert.equal(f.control.summary().lifecycle_receipts.length,1);
  const receipt=f.control.summary().lifecycle_receipts[0];assert.deepEqual(readFileSync(join(f.outputRoot,receipt.stdout.path)),Buffer.from('partial'));
});
test('L5 unknown group and transport errors never permit a later launch',async t=>{
  for(const changes of [{cleanupError:{code:'EPERM'}},{error:{code:'EIO',message:'secret'}},{exitCode:9}]){
    const f=setup(t,{transport:async()=>({...result,...changes})});const observed=await f.control.executeProcess('worker',request());
    assert.throws(()=>f.control.assertReady(),/primary_condition/);assert.ok(observed.error_code||observed.status!==0);await assert.rejects(()=>f.control.executeProcess('worker',request()),/primary_condition/);
  }
  const f=setup(t,{signalProcess:()=>{throw Object.assign(new Error('secret'),{code:'EPERM'});}});const observed=await f.control.executeProcess('worker',request());assert.equal(observed.termination_confirmed,false);
});
test('L6 output bound retains partial bytes and capture collision is exclusive/incomplete',async t=>{
  const f=setup(t,{transport:async options=>{try{options.onOutput({stream:'stdout',chunk:Buffer.from('too much')});}catch{}return {...result};}});
  const observed=await f.control.executeProcess('worker',request({max_buffer_bytes:3}));assert.deepEqual(observed.stdout,Buffer.from('too'));assert.equal(observed.error_code,'ENOBUFS');assert.throws(()=>f.control.assertReady());
  const g=setup(t);writeFileSync(join(g.outputRoot,'lifecycle-0001.worker.stdout.log'),'occupied');
  await assert.rejects(()=>g.control.executeProcess('worker',request()),/primary_condition/);assert.equal(readFileSync(join(g.outputRoot,'lifecycle-0001.worker.stdout.log'),'utf8'),'occupied');
  assert.equal(g.control.summary().lifecycle_receipts[0].log_capture_status,'incomplete');assert.throws(()=>g.control.assertReady());
});
test('L7 concurrent and stale control cannot spawn; close joins owned work',async t=>{
  let settle;const f=setup(t,{transport:options=>new Promise(resolve=>{settle=()=>resolve({...result});options.signal.addEventListener('abort',settle,{once:true});})});
  const pending=f.control.executeProcess('worker',request());await assert.rejects(()=>f.control.executeProcess('worker',request()),/primary_condition/);settle();await pending;await f.control.close();
  await assert.rejects(()=>f.control.executeProcess('worker',request()),/primary_condition/);assert.equal(primaryEvaluatorExecutionControl(),null);
});
test('L8 invalid stage/request cannot change fixed budget or group cleanup',async t=>{
  for(const [stage,changes]of [['other',{}],['worker',{terminationScope:'direct_child'}],['worker',{max_buffer_bytes:10*1024*1024+1}],['probe',{timeout_ms:300001}]]){
    const f=setup(t);await assert.rejects(()=>f.control.executeProcess(stage,request(changes)),/primary_condition/);assert.equal(f.calls.length,0);
  }
  const f=setup(t);await f.control.executeProcess('probe',request());await assert.rejects(()=>f.control.executeProcess('probe',request()),/primary_condition/);assert.equal(f.calls.length,1);
});
test('L9 ordinary Node child completes with exact private streams',async t=>{
  const f=setup(t,{worker:5000,transport:executeCodexSession,signalProcess:process.kill,platform:process.platform,now:Date.now,monotonicNow:performance.now.bind(performance),options:{deadlineAtMs:Date.now()+reserve(5000)+1000}});
  const observed=await f.control.executeProcess('worker',request({executable:process.execPath,args:['-e','process.stdout.write("ordinary-node");process.stderr.write("diagnostic");'],cwd:f.outputRoot,timeout_ms:5000}));
  assert.equal(observed.status,0);assert.equal(observed.termination_confirmed,true);assert.equal(observed.stdout.toString(),'ordinary-node');f.control.assertReady();
});
test('L10 ordinary Node child/grandchild cancellation uses only its owned process group',async t=>{
  const abort=new AbortController();const executeSession=(options,...rest)=>executeCodexSession({...options,onOutput:value=>{options.onOutput(value);if(value.chunk.toString().includes('READY'))abort.abort();}},...rest);
  const f=setup(t,{worker:5000,transport:executeSession,signalProcess:process.kill,platform:process.platform,now:Date.now,monotonicNow:performance.now.bind(performance),options:{signal:abort.signal,deadlineAtMs:Date.now()+reserve(5000)+1000}});
  const script=`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>process.exit(0));process.stdout.write("READY");setInterval(()=>{},1000)'],{stdio:['ignore','pipe','ignore']});child.stdout.pipe(process.stdout);process.on('SIGTERM',()=>{});child.on('exit',()=>process.exit(0));setInterval(()=>{},1000);`;
  const observed=await f.control.executeProcess('worker',request({executable:process.execPath,args:['-e',script],cwd:f.outputRoot,timeout_ms:5000}));
  assert.equal(observed.cancelled,true);assert.equal(observed.termination_confirmed,true);assert.throws(()=>f.control.assertReady());assert.ok(readdirSync(f.outputRoot).some(path=>path.endsWith('.receipt.json')));
});
test('L11 close cancels and joins unawaited owned work, then rejects retained control',async t=>{
  let settled=false;const f=setup(t,{transport:options=>new Promise(resolve=>{options.signal.addEventListener('abort',()=>{
    settled=true;resolve({...result,exitCode:null,signal:'SIGTERM',interrupted:true});},{once:true});})});
  const pending=f.control.executeProcess('worker',request());const closed=await f.control.close();await pending;
  assert.equal(settled,true);assert.equal(closed.status,'closed');assert.equal(closed.failure_code,'primary_condition_unawaited_process');assert.equal(closed.lifecycle_receipts.length,2);
  assert.equal(closed.lifecycle_receipts.at(-1).kind,'ask_primary_condition_lifetime_v1');assert.equal(closed.lifecycle_receipts.at(-1).unawaited_process,true);
  await assert.rejects(()=>f.control.executeProcess('worker',request()),/expired/);
});
test('L12 retained scratch paths exist only in private sidecars; persistence failure prevents readiness',async t=>{
  const f=setup(t),secret='/private/ARTIFICIAL_SCRATCH_SENTINEL';const value={cleanup_status:'retained_termination_unconfirmed',scratch_path:secret,spawn_observed:true,termination_confirmed:false,cancelled:true};
  f.control.recordProbeLifecycle(value);const receipt=f.control.summary().lifecycle_receipts[0];
  assert.ok(!JSON.stringify(f.control.summary()).includes(secret));assert.equal(receipt.scratch_retained,true);
  assert.deepEqual(JSON.parse(readFileSync(join(f.outputRoot,receipt.private_lifecycle_reference.path))),value);
  assert.throws(()=>f.control.assertReady(),/cleanup_failed/);
  const g=setup(t);writeFileSync(join(g.outputRoot,'lifecycle-0001.probe-cleanup.json'),'occupied');assert.throws(()=>g.control.recordProbeLifecycle(value),/capture_failed/);
  assert.equal(g.control.summary().lifecycle_receipts[0].log_capture_status,'incomplete');assert.throws(()=>g.control.assertReady());
});
test('L13 backwards monotonic clock latches refusal rather than extending lifetime',async t=>{
  const f=setup(t);f.advance(-1);assert.throws(()=>f.control.assertReady(),/clock_invalid/);f.advance(10);
  await assert.rejects(()=>f.control.executeProcess('worker',request()),/clock_invalid/);assert.equal(f.calls.length,0);
});
test('L14 malformed transport and timeout flags remain finite unscored failures with raw retention',async t=>{
  for(const transport of [async options=>{options.onOutput({stream:'stdout',chunk:Buffer.from('partial')});return null;},async()=>({...result,timedOut:true})]){
    const f=setup(t,{transport});const observed=await f.control.executeProcess('worker',request());assert.ok(['TRANSPORT_ERROR','ETIMEDOUT'].includes(observed.error_code));
    assert.throws(()=>f.control.assertReady());assert.equal(f.control.summary().lifecycle_receipts.length,1);
  }
});
test('L15 condition timer reserves cleanup and expires between calls, with no launch',async t=>{
  let fire,delay,cleared=false;const timer={unref(){}};
  const f=setup(t,{setTimer:(callback,ms)=>{fire=callback;delay=ms;return timer;},clearTimer:value=>{assert.equal(value,timer);cleared=true;}});
  assert.equal(delay,reserve(100)-4000);fire();assert.throws(()=>f.control.assertReady(),/deadline/);assert.equal(f.calls.length,0);
  await f.control.close();assert.equal(cleared,true);
});
test('L16 delayed implementation load rechecks deadline before dispatch and saves not-spawned evidence',async t=>{
  let dispatches=0,load;const f=setup(t,{loadSession:()=>new Promise(resolve=>{load=resolve;})});
  const pending=f.control.executeProcess('worker',request());assert.equal(f.control.summary().worker_attempts,1);assert.equal(f.control.summary().worker_starts,null);
  f.advance(reserve(100)-3999);load(async()=>{dispatches++;return {...result};});const observed=await pending;
  assert.equal(dispatches,0);assert.equal(observed.spawn_observed,false);assert.equal(observed.error_code,'ETIMEDOUT');
  const receipt=f.control.summary().lifecycle_receipts[0];assert.equal(receipt.dispatch_status,'not_dispatched');assert.equal(receipt.spawn_observed,false);assert.equal(receipt.log_capture_status,'complete');
  assert.equal(f.control.summary().worker_starts,0);assert.throws(()=>f.control.assertReady(),/deadline/);
});
test('L17 delayed load recomputes timeout and cancellation/closed scope never dispatch',async t=>{
  let load,timeout;const f=setup(t,{loadSession:()=>new Promise(resolve=>{load=resolve;})});const pending=f.control.executeProcess('worker',request());
  f.advance(reserve(100)-4050);load(async options=>{timeout=options.timeoutMs;return {...result};});await pending;assert.equal(timeout,50);
  for(const mode of ['cancel','close']){
    let release,calls=0;const abort=new AbortController();const g=setup(t,{options:{signal:abort.signal},loadSession:()=>new Promise(resolve=>{release=resolve;})});
    const work=g.control.executeProcess('worker',request());let closing;if(mode==='cancel')abort.abort();else closing=g.control.close();
    release(async()=>{calls++;return {...result};});const observed=await work;if(closing)await closing;
    assert.equal(calls,0);assert.equal(observed.spawn_observed,false);assert.equal(g.control.summary().worker_starts,0);
  }
});
test('L18 unknown transport completion does not become zero observed starts',async t=>{
  const f=setup(t,{transport:async()=>{throw new Error('artificial unknown transport');}});const observed=await f.control.executeProcess('worker',request());
  assert.equal(observed.spawn_observed,null);assert.equal(f.control.summary().worker_starts,null);assert.equal(f.control.summary().worker_attempts,1);
  assert.throws(()=>f.control.assertReady());
});
test('L19 final condition ledger preserves post-worker deadline and closes exactly once',async t=>{
  const f=setup(t);for(let i=0;i<4;i++)await f.control.executeProcess('worker',request());
  f.advance(reserve(100));assert.throws(()=>f.control.assertReady(),/deadline/);
  const first=f.control.close(),second=f.control.close();assert.equal(first,second);const summary=await first;
  const final=summary.lifecycle_receipts.at(-1),bytes=readFileSync(join(f.outputRoot,'condition-lifetime.json')),record=JSON.parse(bytes);
  assert.equal(record.kind,'ask_primary_condition_lifetime_v1');assert.equal(record.failure_code,'primary_condition_deadline');assert.equal(record.status,'failed');
  assert.equal(record.worker_attempts,4);assert.equal(record.worker_starts,4);assert.equal(Object.hasOwn(record,'lifecycle_receipts'),false);
  assert.equal(final.log_capture_status,'complete');assert.equal(final.private_lifetime_reference.bytes,bytes.length);assert.equal(summary.lifecycle_receipts.length,5);
  assert.deepEqual(readFileSync(join(f.outputRoot,'condition-lifetime.json')),bytes);
});
test('L20 occupied final ledger stays immutable and incomplete while worker raw survives',async t=>{
  const f=setup(t,{expectCloseFailure:true});await f.control.executeProcess('worker',request());
  writeFileSync(join(f.outputRoot,'condition-lifetime.json'),'occupied immutable ledger');
  const first=f.control.close();await assert.rejects(first,/capture_failed/);assert.equal(f.control.close(),first);await assert.rejects(f.control.close(),/capture_failed/);
  const summary=f.control.summary(),final=summary.lifecycle_receipts.at(-1);assert.equal(summary.lifecycle_receipts.length,2);
  assert.equal(final.log_capture_status,'incomplete');assert.equal(final.status,'failed');assert.equal(Object.hasOwn(final,'private_lifetime_reference'),false);
  assert.equal(final.capture_failure_code,'primary_condition_capture_failed');assert.ok(final.expected_lifetime_reference);
  assert.equal(readFileSync(join(f.outputRoot,'condition-lifetime.json'),'utf8'),'occupied immutable ledger');
  assert.equal(readFileSync(join(f.outputRoot,summary.lifecycle_receipts[0].stdout.path),'utf8'),'out\n');
});
