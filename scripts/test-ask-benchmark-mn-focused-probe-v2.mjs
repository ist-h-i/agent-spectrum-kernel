import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildMnFocusedSourceForTest,buildMnFocusedProspectiveEvaluatorSourceV2,MN_FOCUSED_PROBE_VERSION,observeMnFocusedSequenceForTest,runQualifiedMnFocusedProbeV2,runMnFocusedProbeV2ForTest} from './ask-benchmark-mn-focused-probe-v2.mjs';
const observation=(status='succeeded',observed=true,assertion_failure=status==='failed')=>({status,exit_code:status==='succeeded'?0:status==='failed'?1:null,observed,requests:observed?1:0,assertion_failure,authenticated_mixed_boundary:observed});
const root=t=>{const path=realpathSync(mkdtempSync(join(tmpdir(),'ask-focused-v2-fake-')));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;};
function fake(result,options={}){return async request=>{
  options.inspect?.(request);request.onSpawn({pid:123});
  request.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({type:'stdout',data:Buffer.from('candidate partial\n').toString('base64')})+'\n')});
  if(options.parentStderr)try{request.onOutput({stream:'stderr',chunk:Buffer.from('fixed-private-control')});}catch{}
  if(result)request.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({type:'result',result})+'\n')});
  options.abort?.();
  return {spawnObserved:true,pid:123,exitCode:0,signal:null,error:null,cleanupError:null,timedOut:false,interrupted:options.interrupted??false,outputLimited:false};
};}
const deps=executeSession=>({executeSession,platform:'darwin',signalProcess:()=>{throw Object.assign(new Error('gone'),{code:'ESRCH'});}});

test('production gate precedes all option/context getters and fake transport is mandatory',async()=>{
  let reads=0;const poisoned=new Proxy({}, {get(){reads++;throw Error('must not read');}});
  const result=await runQualifiedMnFocusedProbeV2(poisoned);assert.equal(reads,0);assert.equal(result.observation.status,'unavailable');assert.equal(result.quality,null);
  await assert.rejects(runMnFocusedProbeV2ForTest({outputRoot:'/not-read',trialId:'fake'}),{code:'focused_v2_fake_transport_and_logs_required'});
});

test('generic artificial sequence awaits all21 callbacks without scoring authority',async()=>{
  const trials=Array.from({length:21},(_,index)=>index),calls=[];let active=0;
  const result=await observeMnFocusedSequenceForTest(trials,async value=>{assert.equal(active++,0);await Promise.resolve();calls.push(value);active--;return observation(value%2?'failed':'succeeded');});
  assert.deepEqual(calls,trials);assert.equal(result.observations.length,21);assert.equal(result.quality,null);assert.equal(result.scoring_authority,false);
});

test('generic first-unavailable/throw/invalid stops; ordinary assertion flags remain observations',async()=>{
  const trials=Array.from({length:21},(_,index)=>index);
  for(const stop of [0,2,4,5,9,20])for(const mode of ['unavailable','throw','invalid']){
    let count=0;const result=await observeMnFocusedSequenceForTest(trials,index=>{count++;if(index===stop){if(mode==='throw')throw Error('synthetic abort');return mode==='invalid'?{status:'succeeded'}:observation('unavailable',false);}return observation();});
    assert.equal(count,stop+1);assert.equal(result.observations.at(-1).status,'unavailable');
  }
  const measured=await observeMnFocusedSequenceForTest([0,1],index=>index?observation('succeeded',true,true):observation('failed',true,false));
  assert.deepEqual(measured.observations.map(x=>x.status),['failed','succeeded']);
  assert.deepEqual(measured.observations.map(x=>x.assertion_failure),[false,true]);
});

test('fake framed transport retains candidate streams and finite result, never secret carriers or source',async t=>{
  const outputRoot=root(t);let sent=false;
  const result=await runMnFocusedProbeV2ForTest({outputRoot,trialId:'positive',deadlineAtMs:Date.now()+30000},deps(fake(observation(),{inspect:request=>{sent=true;assert.equal(JSON.parse(request.input).key,'1'.repeat(64));assert.equal(request.executable,'/synthetic/focused-parent');}})));
  assert.equal(sent,true);assert.equal(result.observation.status,'succeeded');assert.equal(result.receipt.termination_confirmed,true);assert.equal(result.receipt.synthetic,true);assert.equal(result.receipt.qualification,false);
  const all=readdirSync(outputRoot).map(name=>readFileSync(join(outputRoot,name)).toString()).join('\n');
  assert.match(all,/candidate partial/);for(const forbidden of ['1'.repeat(64),'2'.repeat(64),'3'.repeat(64),'synthetic-source','synthetic-test','focused-parent'])assert.equal(all.includes(forbidden),false);
  assert.equal(readFileSync(join(outputRoot,'positive.stderr.log')).length,0);
});

test('ForTest snapshots the checked fake transport before the import yield',async t=>{
  const outputRoot=root(t);let reads=0,callsA=0,callsB=0;
  const transport=deps(fake(observation(),{inspect:()=>callsA++}));
  const first=transport.executeSession;
  Object.defineProperty(transport,'executeSession',{enumerable:true,configurable:true,get(){reads++;return first;}});
  const pending=runMnFocusedProbeV2ForTest({outputRoot,trialId:'snapshot',deadlineAtMs:Date.now()+30000},transport);
  Object.defineProperty(transport,'executeSession',{value:async()=>{callsB++;throw Error('mutated');},enumerable:true});
  const value=await pending;
  assert.equal(reads,1);assert.equal(callsA,1);assert.equal(callsB,0);assert.equal(value.observation.status,'succeeded');
});

test('cancel, unknown termination, parent diagnostic and capture failure keep partial receipt and refuse quality',async t=>{
  for(const mode of ['cancel','unknown','stderr','collision']){
    const outputRoot=root(t),controller=new AbortController();
    if(mode==='collision')writeFileSync(join(outputRoot,'negative.stdout.log'),'existing',{flag:'wx'});
    const dependencies=deps(fake(observation(),{abort:mode==='cancel'?()=>controller.abort():undefined,parentStderr:mode==='stderr'}));
    if(mode==='unknown')dependencies.signalProcess=()=>true;
    const value=await runMnFocusedProbeV2ForTest({outputRoot,trialId:'negative',signal:controller.signal,deadlineAtMs:Date.now()+30000},dependencies);
    assert.equal(value.observation.status,'unavailable');assert.equal(value.quality,null);assert.ok(value.receipt);assert.match(value.reason,/^native_probe_/);
    if(mode==='collision'){assert.equal(value.receipt.log_capture_status,'incomplete');assert.equal(readFileSync(join(outputRoot,'negative.stdout.log'),'utf8'),'existing');}
    else{assert.equal(value.receipt.log_capture_status,'complete');assert.equal(readFileSync(join(outputRoot,'negative.stdout.log'),'utf8'),'candidate partial\n');}
    if(mode==='stderr')assert.equal(readFileSync(join(outputRoot,'negative.stderr.log')).length,0);
    if(mode==='unknown')assert.equal(value.receipt.termination_confirmed,false);
  }
});

// A small structural fixture exercises pure source rewriting. It deliberately
// contains no legacy evaluator/scoring body and is never evaluated.
function structuralFixture(){
  const early="writeSync(1,JSON.stringify({status:'unavailable'})+'\\n');process.exit(1);";
  const parent="import {readFileSync,writeSync} from 'node:fs';\nconst data=JSON.parse(readFileSync(0,'utf8'));const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-focused-isolated-')));let api;\n"+early+'\n'+early+"\nchild.stdout.on('data',x=>{stdout+=x;if(stdout.length>1048576){invalid=true;child.kill('SIGKILL');}});child.stderr.on('data',x=>{stderr+=x;if(stderr.length>1048576){invalid=true;child.kill('SIGKILL');}});\nwriteSync(4,JSON.stringify({...message,binding_token:undefined,mac})+'\\n');observed=true;\nwriteSync(1,JSON.stringify({status,exit_code:code,observed,requests,assertion_failure:/ERR_ASSERTION|AssertionError|not ok/.test(stdout+stderr)})+'\\n');rmSync(root,{recursive:true,force:true});";
  return 'const CRITERIA_SENTINEL="unchanged";\nconst PARENT_SOURCE='+JSON.stringify(parent)+';\nfunction authenticatedObservation(){return false;}\nfunction run(source,test,loader,existingBehaviorVariant="synthetic-default"){}\n// Proof of preserved frozen-suite\nfunction existingObservableCoverage(source,oldTest,test,loader){return run(source,test,loader);}\nfunction focusedEvaluate(c,scoring){return existingObservableCoverage(source,oldTest,test,loader);}\nexport async function evaluateLegacyCandidateSafe(c,scoring){try{return focusedEvaluate(c,scoring);}catch{return null;}}\nconst WRAPPER_SENTINEL="unchanged";';
}
test('pure synthetic builder preserves surrounding criteria/wrapper and requires exact pin for production',()=>{
  const source=structuralFixture(),built=buildMnFocusedSourceForTest({legacySource:source});
  assert.match(built,/const CRITERIA_SENTINEL="unchanged"/);assert.match(built,/const WRAPPER_SENTINEL="unchanged"/);assert.match(built,/async function run\(c,source,test,loader,existingBehaviorVariant="synthetic-default"\)\{/);assert.match(built,/async function focusedEvaluate/);assert.match(built,/await focusedEvaluate/);
  assert.match(built,/ask-benchmark-mn-focused-probe-v2.mjs/);assert.match(built,/synthetic-focused-v2/);assert.equal(built.includes('writeSync(4,'),false);
  assert.throws(()=>buildMnFocusedProspectiveEvaluatorSourceV2({legacySource:source}),{code:'focused_v2_explicit_version_required'});
  assert.throws(()=>buildMnFocusedProspectiveEvaluatorSourceV2({legacySource:source,probeVersion:MN_FOCUSED_PROBE_VERSION}),{code:'focused_v2_legacy_pin_changed'});
});

import {buildMnFocusedControllerPlanForTest,buildMnFocusedRequestBindingsV3,createMnFocusedControllerPacketV3,inspectMnFocusedControllerPacketV3,buildMnFocusedControllerEvaluatorSourceForTest,inspectMnFocusedControllerRouteV3} from './ask-benchmark-mn-focused-probe-v2.mjs';
// Fabricated selectors/labels only. This is parser input, never evaluated.
function controllerFixture(){
  return structuralFixture().replace('function existingObservableCoverage(source,oldTest,test,loader){return run(source,test,loader);}',`function existingObservableCoverage(source,oldTest,test,loader){
 const control=run(source,oldTest,loader);const candidateTrials=[];
 if(control.status!=='succeeded')return {state:null,candidateTrials};
 for(const syntheticLabel of ['synthetic-a','synthetic-b','synthetic-c']){
  const calibration=run(source,oldTest,loader,syntheticLabel);
  if(calibration.status!=='failed'||!calibration.assertion_failure)continue;
  const trials=[run(source,test,loader),run(source,test,loader,syntheticLabel),run(source,test,loader,syntheticLabel),run(source,test,loader)];
 }
}`).replace('function focusedEvaluate(c,scoring){return existingObservableCoverage(source,oldTest,test,loader);}',`function focusedEvaluate(c,scoring){
 const weakened=source.replace('synthetic-needle','');
 const baseline=run(weakened,oldTest,loader);const trials=[run(source,test,loader),run(weakened,test,loader),run(weakened,test,loader),run(source,test,loader)];
 const existing=existingObservableCoverage(source,oldTest,test,loader);
}`);
}
function controllerBindings(){
  const plan=buildMnFocusedControllerPlanForTest({legacySource:controllerFixture()});
  return buildMnFocusedRequestBindingsV3({plan,source:'synthetic-source-synthetic-needle',oldTest:'synthetic-old',test:'synthetic-new',loader:'synthetic-loader',normalizedResultDigest:'sha256:'+'a'.repeat(64),ownerBinding:'sha256:'+'b'.repeat(64)});
}
function fakeController(bindings,override=()=>undefined){
  const observations=[],results=new Map();
  for(const step of bindings.requests){
    if(!step.requires.every(guard=>results.get(guard.step_id)?.[guard.field]===guard.equals))continue;
    const result=override(step)??observation(step.site===1?'failed':'succeeded');
    results.set(step.step_id,result);observations.push({step_id:step.step_id,site:step.site,loop_context:step.loop_context,request_digest:step.request_digest,result,receipt_digest:'sha256:'+'c'.repeat(64)});
    if(result.status==='unavailable')break;
  }
  return observations;
}

test('adaptive private recipe preserves21max, distinct loop identities and skips four noncalibrated trials',()=>{
  const bindings=controllerBindings();assert.equal(bindings.requests.length,21);
  assert.equal(fakeController(bindings).length,21);
  const skipped=fakeController(bindings,step=>step.site===1&&step.loop_context==='synthetic-a'?observation('failed',false,false):undefined);
  assert.equal(skipped.length,17);
  const packet=createMnFocusedControllerPacketV3({bindings,observations:skipped});assert.equal(inspectMnFocusedControllerPacketV3({bindings,packet}).valid,true);
  assert.equal(skipped.filter(row=>row.site===2).length,2);
  assert.notEqual(bindings.requests.filter(row=>row.site===2)[0].request_digest,bindings.requests.filter(row=>row.site===2)[1].request_digest);
  assert.equal(fakeController(bindings,step=>step.site===0?observation('failed',false):undefined).length,6);
  assert.equal(fakeController(bindings,()=>observation('unavailable',false)).length,1);
});

test('closed source/owner/receipt binding refuses missing, duplicate, disabled, unknown or changed rows',()=>{
  const bindings=controllerBindings(),packet=createMnFocusedControllerPacketV3({bindings,observations:fakeController(bindings)});
  for(const mutate of [p=>p.observations.reverse(),p=>p.observations.pop(),p=>p.observations.push(p.observations[0]),p=>p.owner_binding='changed',p=>p.observations[0].receipt_digest='unknown',p=>p.observations[0].request_digest='sha256:'+'d'.repeat(64),p=>p.observations[0].result.extra=true,p=>p.extra=true]){
    const changed=structuredClone(packet);mutate(changed);assert.throws(()=>inspectMnFocusedControllerPacketV3({bindings,packet:changed}));
  }
  const other=controllerBindings();other.owner_binding='different-round';assert.throws(()=>inspectMnFocusedControllerPacketV3({bindings:other,packet}));
  const disabled=fakeController(bindings,step=>step.site===0?observation('failed',false):undefined);
  disabled.push(fakeController(bindings)[6]);assert.throws(()=>createMnFocusedControllerPacketV3({bindings,observations:disabled}));
});

test('new synthetic body consumes records inline and cannot use production route identity',()=>{
  const body=buildMnFocusedControllerEvaluatorSourceForTest({legacySource:controllerFixture()});
  const bridge=body.slice(body.indexOf('const MN_FOCUSED_CONTROLLER_VERSION='),body.indexOf('// Proof of preserved frozen-suite'));
  assert.equal(bridge.includes('import('),false);assert.equal(bridge.includes('runQualified'),false);assert.equal(bridge.includes('randomBytes'),false);assert.equal(bridge.includes('spawn'),false);
  assert.match(bridge,/state.consumed.has/);assert.match(bridge,/privateFocusedProbe/);assert.match(bridge,/privateNativeProbeBinding/);
  assert.match(body,/focusedControllerInitialize\(c,source,oldTest,test,loader\)/);assert.match(body,/finally\{focusedControllerFinalize\(c\);/);assert.match(bridge,/state.consumed.size!==state.packet.observations.length/);
  assert.throws(()=>inspectMnFocusedControllerRouteV3({bodySource:body}),{code:'focused_controller_body_pin_invalid'});
});
