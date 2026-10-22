import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import * as client from './ask-benchmark-mn-client-probe-v2.mjs';

// Exact legacy text stays private/external. The optional local proof reads
// it only. Portable fixtures contain no private scoring or candidate criteria.
const localLegacyPath=resolve(import.meta.dirname,'../../primary24-runtime-v10-assets-1/private/mn-client-compatibility-fix/hidden-evaluator.mjs');
const syntheticLegacySource=`// synthetic template; no evaluator/native authority
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
const probeScript = 'synthetic';
function runBehavior(source) { throw Error('synthetic, never executed'); }

export async function evaluateLegacyCandidateSafe({ repositoryRoot, originalWorkspaceAuthority, repositoryDiffArtifact }) {
  const source = readFileSync(resolve(candidateWorkspace, 'src/preferences.mjs'), 'utf8');
  const behavioral = runBehavior(source);
  return behavioral;
}
`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('C2-PIN: portable synthetic template transforms only the explicit async bridge',()=>{
  const built=client.buildMnClientProbeV2EvaluatorSourceForTest({syntheticLegacySource});
  assert.ok(built.startsWith('export const nativeProbeVersion = "client-controller-observation-v3";\n'));
  assert.match(built,/runBehavior\(source, normalizedResult, privateClientProbe, privateNativeProbeBinding\)/u);
  assert.equal(built.includes('runQualifiedMnClientProbeV2'),false);assert.equal(built.includes('privateNativeProbeContext'),false);assert.equal(built.includes('spawnSync'),false);
  assert.throws(()=>client.buildMnClientProbeV2EvaluatorSource({legacySource:syntheticLegacySource}),/client_v2_legacy_source_pin_invalid/u);
  assert.throws(()=>client.buildMnClientProbeV2EvaluatorSourceForTest({syntheticLegacySource:'unknown template'}),/client_v2_template_invalid/u);
});

test('C2-PIN: optional private legacy pin/script survive pure construction',{skip:!existsSync(localLegacyPath)},()=>{
  const legacySource=readFileSync(localLegacyPath),before=sha(legacySource);
  assert.equal(before,'d540b6064b23fa4b4f69e184aaa51189de30563907b30dca2bb8fdfc85c2faee');
  const script=client.extractMnClientProbeV2Script({legacySource});
  assert.equal(Buffer.byteLength(script),4686);assert.equal(sha(script),'acfb3b1ba13a0c2be84aaea801c0ea7a482ad616f5b0a829b285f63d8465f72f');
  const built=client.buildMnClientProbeV2EvaluatorSource({legacySource});
  assert.ok(built.startsWith('export const nativeProbeVersion = "client-controller-observation-v3";\n'));
  assert.match(built,/runBehavior\(source, normalizedResult, privateClientProbe, privateNativeProbeBinding\)/u);
  assert.equal(built.includes('runQualifiedMnClientProbeV2'),false);assert.equal(built.includes('node:child_process'),false);
  assert.equal(sha(built),client.MN_CLIENT_PROBE_V3_BODY_SHA256);
  assert.equal(client.mnClientProbeV2Route(built),'client-controller-observation-v3');
  assert.equal(client.extractMnClientProbeV2ControllerScript({hiddenSource:built}),script);
  assert.equal(client.mnClientProbeV2Route(legacySource),null);
  assert.throws(()=>client.mnClientProbeV2Route(built+'\n'),/client_v2_body_source_pin_invalid/u);
  assert.equal(sha(readFileSync(localLegacyPath)),before);
  assert.throws(()=>client.buildMnClientProbeV2EvaluatorSource({legacySource:Buffer.concat([legacySource,Buffer.from('\n')])}),/client_v2_legacy_source_pin_invalid/u);
});

test('C3-ROUTE: header-only and unknown client versions never select a native consumer',()=>{
  assert.equal(client.mnClientProbeV2Route('export function ordinary(){}'),null);
  assert.throws(()=>client.mnClientProbeV2Route(client.MN_CLIENT_PROBE_V3_BODY_HEADER+'// fabricated body'),/client_v2_body_source_pin_invalid/u);
  assert.throws(()=>client.mnClientProbeV2Route('export const nativeProbeVersion = "client-private-native-v2";\n'),/client_v2_body_version_unknown/u);
  assert.throws(()=>client.mnClientProbeV2Route('export const nativeProbeVersion = "client-unknown";\n'),/client_v2_body_version_unknown/u);
  assert.throws(()=>client.extractMnClientProbeV2ControllerScript({hiddenSource:'export function arbitrary(){}'}),/client_v2_body_source_pin_invalid/u);
});

test('C2-GATE: production null qualification refuses caller assertions before scratch or transport',async()=>{
  let calls=0;const before=readdirSync(tmpdir()).filter(name=>name.startsWith('ask-client-probe-v2-')).sort();
  const result=await client.runQualifiedMnClientProbeV2({candidateSource:Buffer.from('not executed'),probeScript:'not evaluated',
    privateNativeProbeContext:new Proxy({},{get(){calls++;throw Error('context must not be read');}}),
    qualified:true,nativeQualificationEvidence:{accepted:true},executeSession:()=>{calls++;throw Error('must not launch');}});
  assert.deepEqual(result,{state:'manual_review_required',code:'native_client_probe_qualification_unavailable',quality:null});
  assert.equal(calls,0);
  assert.deepEqual(await client.runQualifiedMnClientProbeV2(new Proxy({},{get(){calls++;throw Error('input getter must not run');}})),result);
  assert.equal(calls,0);
  assert.deepEqual(readdirSync(tmpdir()).filter(name=>name.startsWith('ask-client-probe-v2-')).sort(),before);
});

// C2-RAW / C2-LIFE / C2-CRITERIA: artificial process callbacks only. The inert
// script and arbitrary input below are never evaluated by Node/native/VM.
function artificialArea(){const area=realpathSync(mkdtempSync(resolve(tmpdir(),'ask-client-v2-artificial-'))),outputRoot=resolve(area,'logs');mkdirSync(outputRoot,{mode:0o700});return {area,outputRoot};}
function gone(target,signal){assert.ok(target<0);assert.equal(signal,0);throw Object.assign(new Error('gone'),{code:'ESRCH'});}
function fakeDependencies(output,changed={},capture=()=>{}){
  return {platform:'darwin',signalProcess:gone,now:()=>100000,monotonicNow:()=>0,executeSession:async options=>{
    capture(options);options.onSpawn({pid:43101});
    for(const [stream,chunk] of Object.entries(output))options.onOutput({stream,chunk});
    return {pid:43101,spawnObserved:true,exitCode:0,signal:null,error:null,interrupted:false,timedOut:false,cleanupError:null,...changed};
  }};
}
function inputFor(outputRoot,trialId,extra={}){return {candidateSource:Buffer.from('artificial source bytes, never evaluated'),privateNativeProbeContext:{outputRoot,trialId,deadlineAtMs:120000,...extra}};}
function rawSaved(outputRoot,trialId,stdout,stderr){
  assert.deepEqual(readFileSync(resolve(outputRoot,trialId+'.stdout.log')),stdout);
  assert.deepEqual(readFileSync(resolve(outputRoot,trialId+'.stderr.log')),stderr);
}

test('C2-RAW: fake normal result preserves bounded raw and exact legacy request policy/env/oneprocess',async()=>{
  const {area,outputRoot}=artificialArea(),stdout=Buffer.from(JSON.stringify({passed:true,modes:2,observations:[[true],[true]]})),stderr=Buffer.from([0,255,10]);let request,calls=0;
  try{
    const result=await client.runMnClientProbeV2ForTest(inputFor(outputRoot,'normal'),fakeDependencies({stdout,stderr},{},options=>{calls++;request=options;assert.equal(existsSync(options.cwd),true);}));
    assert.equal(calls,1);assert.equal(result.state,'pass');assert.equal(result.quality,null);assert.equal(result.evidence_kind,'synthetic');
    assert.equal(request.executable,'/usr/bin/sandbox-exec');assert.deepEqual(request.argv.slice(2,6),[process.execPath,'--permission','--experimental-vm-modules','-e']);
    assert.match(request.argv[1],/^\(version 1\)\(deny default\)/u);assert.match(request.argv[1],/\(deny file-read-data/u);
    assert.equal(request.argv[6],'// synthetic client probe; never executed\n');
    assert.deepEqual(request.env,{PATH:'/usr/bin:/bin',LANG:'C',TZ:'UTC'});assert.equal(request.timeoutMs,5000);assert.equal(request.terminationScope,'process_group');
    assert.deepEqual(request.input,Buffer.from('artificial source bytes, never evaluated'));assert.equal(existsSync(request.cwd),false);
    rawSaved(outputRoot,'normal',stdout,stderr);
    const receipt=JSON.parse(readFileSync(resolve(outputRoot,'normal.receipt.json')));assert.equal(receipt.synthetic,true);assert.equal(receipt.qualification,false);assert.equal(receipt.termination_confirmed,true);assert.equal(receipt.cleanup_status,'removed');
    assert.equal(JSON.stringify(receipt).includes('artificial source bytes'),false);assert.equal(JSON.stringify(receipt).includes(request.cwd),false);
  }finally{rmSync(area,{recursive:true,force:true});}
});

test('C2-CRITERIA: fake intentional bad and invalid protocol retain distinct failed vs unavailable states',async()=>{
  const {area,outputRoot}=artificialArea();
  try{
    for(const [id,text,expected] of [['bad',JSON.stringify({passed:false,modes:0,observations:[]}),'fail'],['invalid-json','not JSON','manual_review_required'],['invalid-shape','null','manual_review_required'],['wrong-mode',JSON.stringify({passed:true,modes:1,observations:[]}),'fail']]){
      const stdout=Buffer.from(text),stderr=Buffer.alloc(0);
      const result=await client.runMnClientProbeV2ForTest(inputFor(outputRoot,id),fakeDependencies({stdout,stderr}));
      assert.equal(result.state,expected);assert.equal(result.quality,null);rawSaved(outputRoot,id,stdout,stderr);
    }
  }finally{rmSync(area,{recursive:true,force:true});}
});

test('C2-LIFE: fake nonzero process cannot promote a passed:true packet',async()=>{
  const {area,outputRoot}=artificialArea(),stdout=Buffer.from(JSON.stringify({passed:true,modes:2,observations:[]})),stderr=Buffer.from('artificial failure');
  try{
    await assert.rejects(client.runMnClientProbeV2ForTest(inputFor(outputRoot,'nonzero'),fakeDependencies({stdout,stderr},{exitCode:7})),error=>typeof error.code==='string');
    rawSaved(outputRoot,'nonzero',stdout,stderr);
  }finally{rmSync(area,{recursive:true,force:true});}
});

test('C2-LIFE: fake cancellation after partial output throws, retains raw and removes scratch only on owned confirmation',async()=>{
  const {area,outputRoot}=artificialArea(),controller=new AbortController(),stdout=Buffer.from('partial out'),stderr=Buffer.from('partial err');let scratch,calls=0;
  try{
    const deps=fakeDependencies({stdout,stderr},{exitCode:null,signal:'SIGTERM',interrupted:true},options=>{calls++;scratch=options.cwd;});
    const execute=deps.executeSession;deps.executeSession=async options=>{const result=await execute(options);controller.abort();return result;};
    await assert.rejects(client.runMnClientProbeV2ForTest(inputFor(outputRoot,'abort',{signal:controller.signal}),deps),error=>error.code==='native_probe_cancelled');
    assert.equal(calls,1);rawSaved(outputRoot,'abort',stdout,stderr);assert.equal(existsSync(scratch),false);
  }finally{rmSync(area,{recursive:true,force:true});}
});

test('C2-LIFE: fake infrastructure/unknown owned termination preserves scratch and private raw without caught messages',async()=>{
  const {area,outputRoot}=artificialArea(),stdout=Buffer.from('known partial'),stderr=Buffer.from('known stderr');const scratches=[];
  try{
    for(const kind of ['infrastructure','unknown-group']){
      let scratch;
      const deps=fakeDependencies({stdout,stderr},{},options=>{scratch=options.cwd;scratches.push(scratch);});
      if(kind==='infrastructure'){const execute=deps.executeSession;deps.executeSession=async options=>{await execute(options);throw new Error('private transport detail must not escape');};}
      else deps.signalProcess=()=>true;
      await assert.rejects(client.runMnClientProbeV2ForTest(inputFor(outputRoot,kind),deps),error=>typeof error.code==='string'&&!error.message.includes('private transport detail'));
      assert.equal(existsSync(scratch),true);rawSaved(outputRoot,kind,stdout,stderr);
      const receipt=JSON.parse(readFileSync(resolve(outputRoot,kind+'.receipt.json')));assert.equal(receipt.termination_confirmed,false);assert.match(receipt.cleanup_status,/^retained/u);
    }
  }finally{for(const scratch of scratches)rmSync(scratch,{recursive:true,force:true});rmSync(area,{recursive:true,force:true});}
});

test('C2-LIFE: fake receipt write failure preserves completed raw and throws incomplete fixed diagnostic',async()=>{
  const {area,outputRoot}=artificialArea(),stdout=Buffer.from('completed out'),stderr=Buffer.from('completed err');let scratch;
  try{
    const deps=fakeDependencies({stdout,stderr},{},options=>{scratch=options.cwd;});
    deps.write=(path,bytes,options)=>{if(path.endsWith('.receipt.json'))throw new Error('private write detail');return writeFileSync(path,bytes,options);};
    await assert.rejects(client.runMnClientProbeV2ForTest(inputFor(outputRoot,'capture'),deps),error=>error.code==='native_probe_capture_failed'&&error.receipt.log_capture_status==='incomplete'&&!error.message.includes('private write detail'));
    rawSaved(outputRoot,'capture',stdout,stderr);assert.equal(existsSync(scratch),false);
  }finally{rmSync(area,{recursive:true,force:true});}
});

test('C2-GATE: synthetic seam refuses absent fake transport and never chooses a native default',async()=>{
  await assert.rejects(client.runMnClientProbeV2ForTest({candidateSource:Buffer.alloc(0)}),/client_v2_fake_transport_required/u);
});


test('C2-RAW: snapshot source/context/fake transport before async module loading prevents caller substitution',async()=>{
  const {area,outputRoot}=artificialArea(),stdout=Buffer.from(JSON.stringify({passed:true,modes:2,observations:[]})),stderr=Buffer.alloc(0);
  const input=inputFor(outputRoot,'snapshot'),originalSource=Buffer.from(input.candidateSource);let originalCalls=0,substitutedCalls=0;
  try{
    const deps=fakeDependencies({stdout,stderr},{},options=>{originalCalls++;assert.deepEqual(options.input,originalSource);});
    const running=client.runMnClientProbeV2ForTest(input,deps);
    input.candidateSource.fill(0);input.privateNativeProbeContext.outputRoot=resolve(area,'not-created');input.privateNativeProbeContext.trialId='substituted';
    input.privateNativeProbeContext.deadlineAtMs=0;input.privateNativeProbeContext.signal=AbortSignal.abort();
    deps.executeSession=async()=>{substitutedCalls++;throw Error('substituted fake must not execute');};
    const result=await running;assert.equal(result.state,'pass');assert.equal(originalCalls,1);assert.equal(substitutedCalls,0);
    rawSaved(outputRoot,'snapshot',stdout,stderr);assert.equal(existsSync(resolve(area,'not-created')),false);
  }finally{rmSync(area,{recursive:true,force:true});}
});


test('C2-GATE: throwing ordinary context getter is refused before scratch allocation',async()=>{
  const before=readdirSync(tmpdir()).filter(name=>name.startsWith('ask-client-probe-v2-')).sort();let calls=0;
  await assert.rejects(client.runMnClientProbeV2ForTest({candidateSource:Buffer.from('never executed'),privateNativeProbeContext:new Proxy({},{get(){throw Error('private getter detail');}})},
    fakeDependencies({stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)},{},()=>{calls++;})),error=>error.code==='client_v2_private_context_invalid'&&!error.message.includes('private getter detail'));
  assert.equal(calls,0);assert.deepEqual(readdirSync(tmpdir()).filter(name=>name.startsWith('ask-client-probe-v2-')).sort(),before);
});

test('C2-LIFE: pre-cancel and intent capture refusal dispatch no process and release known-empty scratch',async()=>{
  const {area,outputRoot}=artificialArea();let calls=0;
  try{
    for(const kind of ['pre-abort','intent-failure']){
      const before=readdirSync(tmpdir()).filter(name=>name.startsWith('ask-client-probe-v2-')).sort();
      const deps=fakeDependencies({stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)},{},()=>{calls++;});
      const extra=kind==='pre-abort'?{signal:AbortSignal.abort()}:{};
      if(kind==='intent-failure')deps.write=(path,bytes,options)=>{if(path.endsWith('.intent.json'))throw Error('private intent write detail');return writeFileSync(path,bytes,options);};
      const code=kind==='pre-abort'?'native_probe_cancelled':'native_probe_capture_failed';
      await assert.rejects(client.runMnClientProbeV2ForTest(inputFor(outputRoot,kind,extra),deps),error=>error.code===code&&error.receipt.dispatch_status==='not_dispatched'&&error.receipt.spawn_observed===false&&error.receipt.cleanup_status==='removed'&&!error.message.includes('private intent write detail'));
      assert.deepEqual(readdirSync(tmpdir()).filter(name=>name.startsWith('ask-client-probe-v2-')).sort(),before);
      const receipt=JSON.parse(readFileSync(resolve(outputRoot,kind+'.receipt.json')));assert.equal(receipt.qualification,false);assert.equal(receipt.synthetic,true);
    }
    assert.equal(calls,0);
  }finally{rmSync(area,{recursive:true,force:true});}
});


test('C2-RAW: accessor transport uses the function checked before dependency copying',async()=>{
  const {area,outputRoot}=artificialArea(),stdout=Buffer.from(JSON.stringify({passed:true,modes:2,observations:[]})),stderr=Buffer.alloc(0);
  let getterReads=0,checkedCalls=0,substitutedCalls=0;
  try{
    const deps=fakeDependencies({stdout,stderr}),checked=deps.executeSession;
    const fakeA=async(...args)=>{checkedCalls++;return checked(...args);};
    const fakeB=async()=>{substitutedCalls++;throw Error('unchecked fake must not execute');};
    Object.defineProperty(deps,'executeSession',{enumerable:true,get(){getterReads++;return getterReads===1?fakeA:fakeB;}});
    const result=await client.runMnClientProbeV2ForTest(inputFor(outputRoot,'accessor'),deps);
    assert.equal(result.state,'pass');assert.equal(checkedCalls,1);assert.equal(substitutedCalls,0);assert.equal(getterReads,1);
    rawSaved(outputRoot,'accessor',stdout,stderr);
  }finally{rmSync(area,{recursive:true,force:true});}
});


// C3: invented packet data only. This pure converter/consumer pair does not
// issue native observations; production controller construction remains gated.
function artificialControllerInput(){
  return {candidateSource:Buffer.from('artificial candidate, never evaluated'),normalizedResultDigest:'sha256:'+sha('artificial normalized'),
    ownerBinding:'sha256:'+sha('artificial round1'),receiptDigest:'sha256:'+sha('artificial saved receipt'),
    result:{state:'pass',code:'bounded_behavior_observation',quality:null,observation_digest:'sha256:'+sha('artificial stdout'),observations:[[true],[true]]}};
}
test('C3-BIND: controller packet is finite immutable source/normalized/owner/receipt bound',()=>{
  const input=artificialControllerInput(),observation=client.createMnClientProbeV2Observation(input);
  assert.equal(Object.isFrozen(observation),true);assert.equal(Object.isFrozen(observation.result),true);assert.equal(Object.isFrozen(observation.result.observations[0]),true);
  assert.equal(observation.receipt_digest,input.receiptDigest);assert.equal(Object.hasOwn(observation,'raw'),false);
  assert.equal(client.inspectMnClientProbeV2Observation({...input,observation}).state,'pass');
  for(const result of [{...input.result,state:'fail'},{state:'manual_review_required',code:'candidate_observation_invalid',quality:null}]){
    const next=client.createMnClientProbeV2Observation({...input,result});assert.equal(client.inspectMnClientProbeV2Observation({...input,observation:next}).state,result.state);
  }
  input.result.observations[0][0]=false;assert.equal(observation.result.observations[0][0],true);
});
test('C3-BIND: packet drift, wrong owner/normalized/source, extra raw and missing receipt stay unavailable',()=>{
  const input=artificialControllerInput(),original=client.createMnClientProbeV2Observation(input);
  for(const mutate of [o=>o.candidate_source_digest='sha256:'+sha('drift'),o=>o.normalized_result_digest='sha256:'+sha('drift'),o=>o.owner_binding='sha256:'+sha('round2'),
    o=>o.legacy_source_digest='sha256:'+sha('drift'),o=>o.probe_script_digest='sha256:'+sha('drift'),o=>o.request_digest='sha256:'+sha('drift'),o=>o.probe_version='unknown',
    o=>o.receipt_digest=null,o=>o.raw={stdout:'forged'},o=>o.result.raw={},o=>o.result.observations=[[1]],o=>o.result.quality=1]){
    const changed=structuredClone(original);mutate(changed);
    const checked=client.inspectMnClientProbeV2Observation({...input,observation:changed});assert.equal(checked.state,'manual_review_required');assert.equal(checked.quality,null);
  }
  for(const changed of [{candidateSource:Buffer.from('different')},{normalizedResultDigest:'sha256:'+sha('different')},{ownerBinding:'sha256:'+sha('round2')}]){
    assert.equal(client.inspectMnClientProbeV2Observation({...input,...changed,observation:original}).state,'manual_review_required');
  }
  assert.throws(()=>client.createMnClientProbeV2Observation({...input,receiptDigest:null}),/client_v2_observation_invalid/u);
  const absent=client.createMnClientProbeV2Observation({...input,receiptDigest:null,result:{state:'manual_review_required',code:'native_client_probe_qualification_unavailable',quality:null}});
  assert.equal(client.inspectMnClientProbeV2Observation({...input,observation:absent}).state,'manual_review_required');
});
