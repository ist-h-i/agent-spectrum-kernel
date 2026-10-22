import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,realpathSync,rmSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createPrimaryPerformanceExecutionForTest} from './ask-primary-evaluation-scope.mjs';
import {preparePrimaryClientFocusedProbe,preparePrimaryClientFocusedProbeForTest,primaryClientFocusedProbeProfile,verifyPrimaryNativeControllerAudit} from './ask-primary-client-focused-controller.mjs';
import {buildMnClientProbeV2EvaluatorSource,runMnClientProbeV2ForTest} from './ask-benchmark-mn-client-probe-v2.mjs';
import {buildMnFocusedControllerEvaluatorSourceV3,MN_FOCUSED_CONTROLLER_VERSION,runMnFocusedProbeV2ForTest} from './ask-benchmark-mn-focused-probe-v2.mjs';

const repository=resolve(import.meta.dirname,'..'),privateRoot=resolve(repository,'../primary24-runtime-v10-assets-1/private');
const available=existsSync(join(privateRoot,'mn-focused-regression-test/hidden-evaluator.mjs'));
const digest=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const gone=()=>{throw Object.assign(new Error('synthetic group absent'),{code:'ESRCH'});};
function area(t,kind,signal){
  const fixture=kind==='client'?'mn-client-compatibility-fix':'mn-focused-regression-test';
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-controller-v3-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const legacy=readFileSync(join(privateRoot,fixture,'hidden-evaluator.mjs'));
  const hiddenBody=Buffer.from(kind==='client'?buildMnClientProbeV2EvaluatorSource({legacySource:legacy}):buildMnFocusedControllerEvaluatorSourceV3({legacySource:legacy,probeVersion:MN_FOCUSED_CONTROLLER_VERSION}));
  const workspace=join(repository,'benchmarks/fixtures/checkpoint-b2',fixture,'workspace');
  const entry=path=>({path,file_type:'file',content_base64:readFileSync(join(workspace,path)).toString('base64')});
  const entries=kind==='client'?[entry('src/preferences.mjs')]:[entry('src/session-key.mjs'),entry('test/session-key.test.mjs')];
  const normalized={normalized_result_digest:digest('synthetic normalized'),lineage:{fixture_id:fixture,condition:'P',run_instance_id:'synthetic-run'}};
  const payload={normalized_result:{source_base64:Buffer.from(JSON.stringify(normalized)).toString('base64')},authority_roots:[{kind:'frozen',entries},{kind:'candidate',entries}],modules:[{path:'/private/hidden-evaluator.mjs',source_base64:hiddenBody.toString('base64')}]};
  if(kind==='focused')payload.modules.push({path:'/private/authenticated-generic-loader.mjs',source_base64:readFileSync(join(privateRoot,fixture,'authenticated-generic-loader.mjs')).toString('base64')});
  let workers=0;
  const control=createPrimaryPerformanceExecutionForTest({outputRoot:root,workerTimeoutMs:1000,nativeProbeBody:hiddenBody,nativeProbeFixture:fixture,signal},{now:()=>1000,monotonicNow:()=>0,platform:'darwin',signalProcess:gone,executeSession:async r=>{workers++;r.onSpawn({pid:555});r.onOutput({stream:'stdout',chunk:Buffer.from('{}')});return {pid:555,spawnObserved:true,exitCode:0};}});
  const helper={now:()=>1000,monotonicNow:()=>0,platform:'darwin',signalProcess:gone};
  const launchers={client:args=>runMnClientProbeV2ForTest(args,{...helper,executeSession:async r=>{r.onSpawn({pid:666});r.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({passed:true,modes:2,observations:[[true]]}))});return {pid:666,exitCode:0};}}),focused:async()=>{throw new Error('unused synthetic focused');}};
  const options={payload,hiddenBody,round:1,control};
  return {root,fixture,control,options,launchers,helper,get workers(){return workers;}};
}
for(const kind of ['client','focused'])test(`${kind}: production qualification refusal starts no process or worker`,{skip:!available},async t=>{
  const f=area(t,kind);
  await assert.rejects(preparePrimaryClientFocusedProbe(f.options),{code:'native_controller_qualification_unavailable'});
  assert.equal(f.control.summary().probe_starts,0);assert.equal(f.control.summary().worker_attempts,0);
  const audit=JSON.parse(readFileSync(join(f.root,'native-round-1.controller.json')));assert.equal(audit.steps[0].status,'not_started');assert.equal(audit.steps[0].reason,'native_controller_qualification_unavailable');
  await f.control.close();
});
test('client: owned fake probe joins immutable audit, packet and subsequent worker',{skip:!available},async t=>{
  const f=area(t,'client');
  const result=await preparePrimaryClientFocusedProbeForTest(f.options,f.launchers);
  assert.equal(result.packet.result.state,'pass');assert.equal(result.evidence_kind,'synthetic');assert.equal(f.control.summary().probe_starts,1);
  const ref=f.control.summary().lifecycle_receipts.find(x=>x.kind==='ask_primary_native_controller_audit_ref_v3').reference;
  verifyPrimaryNativeControllerAudit({outputRoot:f.root,reference:ref,ownerBinding:result.ownerBinding,round:1,bodyDigest:digest(f.options.hiddenBody)});
  await f.control.executeProcess('worker',{executable:'/synthetic/worker',args:[],input:Buffer.alloc(0),cwd:'/synthetic',env:{LANG:'C'},timeout_ms:1000,max_buffer_bytes:128});
  assert.equal(f.workers,1);assert.equal(f.control.summary().worker_starts,1);await f.control.close();
});
test('client: audit/raw tamper is rejected before worker evidence can join', {skip:!available},async t=>{
  const f=area(t,'client'),result=await preparePrimaryClientFocusedProbeForTest(f.options,f.launchers);
  const ref=f.control.summary().lifecycle_receipts.find(x=>x.kind==='ask_primary_native_controller_audit_ref_v3').reference;
  writeFileSync(join(f.root,'native-0001.stdout.log'),'changed');
  assert.throws(()=>verifyPrimaryNativeControllerAudit({outputRoot:f.root,reference:ref,ownerBinding:result.ownerBinding,round:1,bodyDigest:digest(f.options.hiddenBody)}),/native_controller_stream_changed/u);
  await f.control.close();
});
test('focused: adaptive private recipe skips disabled slots and preserves ordered receipts',{skip:!available},async t=>{
  const f=area(t,'focused'),profile=primaryClientFocusedProbeProfile(f.options.hiddenBody,f.fixture);
  const targets=new Map();for(const step of profile.route.plan.steps)for(const guard of step.requires){const fields=targets.get(guard.step_id)??{};fields[guard.field]=guard.equals;targets.set(guard.step_id,fields);}
  const skip=profile.route.plan.steps.find(step=>targets.get(step.step_id)?.assertion_failure===true).step_id;
  let calls=0;
  f.launchers.focused=args=>{calls++;const fields=args.step_id===skip?{status:'succeeded',assertion_failure:false}:targets.get(args.step_id)??{status:'succeeded',assertion_failure:false};
    const result={status:fields.status,exit_code:fields.status==='failed'?1:0,observed:true,requests:1,assertion_failure:fields.assertion_failure??false,authenticated_mixed_boundary:true};
    return runMnFocusedProbeV2ForTest({...args,...args.privateNativeProbeContext},{...f.helper,executeSession:async r=>{r.onSpawn({pid:777});r.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({type:'result',result})+'\n')});return {pid:777,exitCode:0};}});};
  const observed=await preparePrimaryClientFocusedProbeForTest(f.options,f.launchers);
  assert.equal(calls,17);assert.equal(observed.packet.observations.length,17);assert.equal(observed.audit.steps.filter(x=>x.status==='skipped').length,4);assert.equal(f.control.summary().probe_starts,17);
  assert.equal(f.control.summary().condition_reservation_ms,4*(21*19000+5000));await f.control.close();
});
test('source pin drift and owner mismatch refuse before callbacks',{skip:!available},async t=>{
  const f=area(t,'client');f.options.hiddenBody=Buffer.concat([f.options.hiddenBody,Buffer.from('\n')]);
  await assert.rejects(preparePrimaryClientFocusedProbeForTest(f.options,f.launchers));assert.equal(f.control.summary().probe_attempts,0);await f.control.close();
});
test('owner registers callback before synchronous reentry and joins pending close',{skip:!available},async t=>{
  const f=area(t,'client');f.control.bindNativeProbeBody(f.options.hiddenBody,f.fixture);let release;
  const pending=f.control.executeNativeProbe(async()=>{assert.throws(()=>f.control.executeNativeProbe(()=>{}),/concurrent/u);await new Promise(resolve=>{release=resolve;});throw new Error('synthetic stopped');});
  await Promise.resolve();const closing=f.control.close();let finished=false;closing.then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);release();await assert.rejects(pending);await closing;
});
for(const kind of ['unknown-termination','cancel','capture-failure'])test(`focused: ${kind} retains finite failure, stops tail and distinguishes observed starts`,{skip:!available},async t=>{
  const c=new AbortController(),f=area(t,'focused',c.signal);let calls=0;
  if(kind==='capture-failure')writeFileSync(join(f.root,'native-0001.intent.json'),'{}',{mode:0o600});
  f.launchers.focused=args=>{calls++;return runMnFocusedProbeV2ForTest({...args,...args.privateNativeProbeContext},{...f.helper,signalProcess:kind==='unknown-termination'?()=>{}:gone,executeSession:async r=>{
    r.onSpawn({pid:777});r.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({type:'stdout',data:Buffer.from('partial').toString('base64')})+'\n')});
    if(kind==='cancel')c.abort();return {pid:777,exitCode:0,interrupted:kind==='cancel'};
  }});};
  await assert.rejects(preparePrimaryClientFocusedProbeForTest(f.options,f.launchers));assert.equal(calls,1);assert.equal(f.workers,0);
  const audit=JSON.parse(readFileSync(join(f.root,'native-round-1.controller.json')));assert.equal(audit.steps.filter(row=>row.status==='not_started').length,20);
  const first=audit.steps[0];assert.equal(first.status,'unavailable');assert.ok(first.failure_reference);
  const failure=JSON.parse(readFileSync(join(f.root,first.failure_reference.path)));assert.equal(failure.receipt_status,'available');
  assert.equal(f.control.summary().probe_starts,kind==='capture-failure'?0:1);await f.control.close();
});
test('performance default reservation remains unchanged and no native callback is enabled',async()=>{
  const control=createPrimaryPerformanceExecutionForTest({workerTimeoutMs:1000},{now:()=>1000,monotonicNow:()=>0});
  assert.equal(control.summary().condition_reservation_ms,4*(300000+1000+8000));assert.throws(()=>control.executeNativeProbe(()=>{}),/stage_invalid/u);await control.close();
});
test('native worker dispatch requires completed audit and resets after worker',{skip:!available},async t=>{
  const f=area(t,'client');f.control.bindNativeProbeBody(f.options.hiddenBody,f.fixture);
  await assert.rejects(f.control.executeProcess('worker',{executable:'/synthetic/worker',args:[],input:Buffer.alloc(0),cwd:'/synthetic',env:{},timeout_ms:1000,max_buffer_bytes:128}),/stage_invalid/u);
  assert.equal(f.workers,0);await f.control.close();
});
