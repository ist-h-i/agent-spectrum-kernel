// Synthetic producer and fake native observations only. The owned worker is a
// fixed ordinary Node program, never Codex or a native sandbox/candidate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {syntheticPrimarySource} from './test-helpers-primary-evaluation-producer.mjs';
import {producePrimaryEvaluationArtifacts,buildPrimaryEvaluationScoringInputs} from './ask-primary-evaluation-producer.mjs';
import {withPrimaryEvaluatorLogCaptureAsync,primaryEvaluatorExecutionControl,capturePrimaryEvaluatorChildStreams,
  primaryEvaluatorLogFailureReceipts,primaryEvaluatorExecutionFailureReceipts} from './ask-primary-evaluation-scope.mjs';
import {preparePrimaryClientFocusedProbeForTest,verifyPrimaryNativeControllerAudit} from './ask-primary-client-focused-controller.mjs';
import {buildMnFocusedControllerEvaluatorSourceV3,MN_FOCUSED_CONTROLLER_VERSION,inspectMnFocusedControllerRouteV3,
  runMnFocusedProbeV2ForTest} from './ask-benchmark-mn-focused-probe-v2.mjs';

const ROOT=resolve(import.meta.dirname,'..'),FIXTURE='mn-focused-regression-test';
const PRIVATE=resolve(ROOT,'../primary24-runtime-v10-assets-1/private',FIXTURE);
const available=existsSync(join(PRIVATE,'hidden-evaluator.mjs'));
const digest=raw=>'sha256:'+createHash('sha256').update(raw).digest('hex');
const json=path=>JSON.parse(readFileSync(path));
const save=(path,value)=>writeFileSync(path,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
const absent=()=>{throw Object.assign(new Error('synthetic group absent'),{code:'ESRCH'});};

async function fixture(t,scenario){
  const source=syntheticPrimarySource(t,{fixtureId:FIXTURE});
  const producer=await producePrimaryEvaluationArtifacts(source.block,join(source.root,'producer'));
  const options={recordRoot:producer.output_root,externalDigest:producer.external_digest};
  const normalizedResult=buildPrimaryEvaluationScoringInputs(options,{condition:'plain'}).normalizedResult;
  const manifest=json(join(options.recordRoot,'producer.json'));
  assert.equal(manifest.evidence_kind,'synthetic');assert.equal(manifest.scoring_ready,false);
  const proof=process.env.ASK_NATIVE_ALS_PROOF_ROOT;
  const outputRoot=proof?join(realpathSync(proof),scenario):realpathSync(mkdtempSync(join(tmpdir(),'ask-native-als-join-')));
  if(proof)mkdirSync(outputRoot,{mode:0o700});else t.after(()=>rmSync(outputRoot,{recursive:true,force:true}));
  const hiddenBody=Buffer.from(buildMnFocusedControllerEvaluatorSourceV3({legacySource:readFileSync(join(PRIVATE,'hidden-evaluator.mjs')),probeVersion:MN_FOCUSED_CONTROLLER_VERSION}));
  const workspace=join(ROOT,'benchmarks/fixtures/checkpoint-b2',FIXTURE,'workspace');
  const entries=['src/session-key.mjs','test/session-key.test.mjs'].map(path=>({path,file_type:'file',content_base64:readFileSync(join(workspace,path)).toString('base64')}));
  const payload={normalized_result:{source_base64:Buffer.from(JSON.stringify(normalizedResult)).toString('base64')},
    authority_roots:[{kind:'frozen',entries},{kind:'candidate',entries}],modules:[
      {path:'/private/hidden-evaluator.mjs',source_base64:hiddenBody.toString('base64')},
      {path:'/private/authenticated-generic-loader.mjs',source_base64:readFileSync(join(PRIVATE,'authenticated-generic-loader.mjs')).toString('base64')}]};
  const plan=inspectMnFocusedControllerRouteV3({bodySource:hiddenBody}).plan,targets=new Map();
  for(const step of plan.steps)for(const guard of step.requires){const fields=targets.get(guard.step_id)??{};fields[guard.field]=guard.equals;targets.set(guard.step_id,fields);}
  let probes=0;
  const launchers={client:async()=>{throw new Error('unexpected synthetic client');},focused:args=>{
    probes++;const fields=targets.get(args.step_id)??{status:'succeeded',assertion_failure:false};
    const result={status:fields.status,exit_code:fields.status==='failed'?1:0,observed:true,requests:1,
      assertion_failure:fields.assertion_failure??false,authenticated_mixed_boundary:true};
    return runMnFocusedProbeV2ForTest({...args,...args.privateNativeProbeContext},{platform:'darwin',signalProcess:absent,executeSession:async request=>{
      assert.equal(request.executable,'/synthetic/focused-parent');
      request.onSpawn({pid:777});request.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({type:'result',result})+'\n')});
      return {pid:777,exitCode:0,signal:null};
    }});
  }};
  return {options,normalizedResult,outputRoot,hiddenBody,payload,launchers,expectedProbes:plan.steps.length,get probes(){return probes;}};
}

for(const scenario of ['normal','changed-audit','changed-raw'])test(`active ALS native audit join: ${scenario}`,{skip:!available},async t=>{
  const f=await fixture(t,scenario);let control,prepared,reference,worker,afterCapture=false,failure;
  const run=()=>withPrimaryEvaluatorLogCaptureAsync(f.options,{outputRoot:f.outputRoot,normalizedResult:f.normalizedResult,workerTimeoutMs:5000,nativeProbeBody:f.hiddenBody},async verified=>{
    assert.equal(verified.evidence_kind,'synthetic');control=primaryEvaluatorExecutionControl();assert.ok(control);
    prepared=await preparePrimaryClientFocusedProbeForTest({payload:f.payload,hiddenBody:f.hiddenBody,round:1,control},f.launchers);
    assert.equal(prepared.authority,false);assert.equal(prepared.evidence_kind,'synthetic');
    f.payload.private_native_probe_binding=prepared.ownerBinding;
    reference=control.summary().lifecycle_receipts.find(row=>row.kind==='ask_primary_native_controller_audit_ref_v3').reference;
    const audit=verifyPrimaryNativeControllerAudit({outputRoot:f.outputRoot,reference,ownerBinding:prepared.ownerBinding,round:1,bodyDigest:digest(f.hiddenBody)});
    assert.equal(audit.qualification,false);assert.equal(audit.quality,null);assert.equal(audit.profile,'focused');assert.equal(audit.steps.length,f.expectedProbes);
    worker=await control.executeProcess('worker',{executable:process.execPath,args:['-e','process.stdout.write("synthetic worker output\\n");process.stderr.write("synthetic worker diagnostic\\n")'],
      input:Buffer.alloc(0),cwd:f.outputRoot,env:{PATH:'/usr/bin:/bin',LANG:'C',TZ:'UTC'},timeout_ms:5000,max_buffer_bytes:1024});
    assert.equal(worker.status,0);assert.equal(worker.termination_confirmed,true);
    if(scenario==='changed-audit'){
      writeFileSync(join(f.outputRoot,'original-audit.json'),readFileSync(join(f.outputRoot,reference.path)),{flag:'wx',mode:0o600});
      writeFileSync(join(f.outputRoot,reference.path),JSON.stringify({...audit,round:2})+'\n');
    }else if(scenario==='changed-raw'){
      const receipt=json(join(f.outputRoot,audit.steps[0].receipt_reference.path)),raw=join(f.outputRoot,receipt.stdout.path);
      writeFileSync(join(f.outputRoot,'original-probe-stdout.log'),readFileSync(raw),{flag:'wx',mode:0o600});
      writeFileSync(raw,'synthetic changed observation\n');
    }
    capturePrimaryEvaluatorChildStreams(worker,f.payload);afterCapture=true;
    return {evidence_kind:'synthetic',qualification:false,quality:null};
  });
  let captured;
  if(scenario==='normal')captured=await run();
  else await assert.rejects(run,error=>{failure=error;return error.message==='primary_private_probe_binding_invalid';});
  const receipts=captured?.receipts??primaryEvaluatorLogFailureReceipts(failure);
  const lifecycle=captured?.lifecycle_receipts??primaryEvaluatorExecutionFailureReceipts(failure);
  assert.equal(receipts.length,1);const receipt=receipts[0];
  assert.equal(receipt.kind,'ask_primary_private_worker_stdio_v1');assert.equal(receipt.evidence_kind,'synthetic');assert.equal(receipt.log_capture_status,'complete');
  assert.equal(receipt.normalized_result_digest,f.normalizedResult.normalized_result_digest);
  for(const name of ['stdout','stderr']){const raw=readFileSync(join(f.outputRoot,receipt[name].path));assert.deepEqual(raw,worker[name]);assert.equal(raw.length,receipt[name].bytes);assert.equal(digest(raw),receipt[name].digest);}
  const saved=json(join(f.outputRoot,'0001.receipt.json'));assert.deepEqual(saved,receipt);
  if(scenario==='normal'){
    assert.equal(afterCapture,true);assert.deepEqual(receipt.native_probe,reference);assert.equal(receipt.invalid_native_probe_binding,undefined);
    verifyPrimaryNativeControllerAudit({outputRoot:f.outputRoot,reference:receipt.native_probe,ownerBinding:prepared.ownerBinding,round:1,bodyDigest:digest(f.hiddenBody)});
    assert.equal(lifecycle.at(-1).status,'completed');
  }else{
    assert.equal(afterCapture,false);assert.equal(receipt.native_probe,undefined);
    assert.deepEqual(receipt.invalid_native_probe_binding,{status:'invalid',code:'primary_private_probe_binding_invalid',expected_reference:reference});
    assert.equal(lifecycle.at(-1).status,'failed');assert.equal(lifecycle.at(-1).failure_code,'primary_condition_callback_failed');
  }
  assert.equal(f.probes,f.expectedProbes);assert.equal(control.summary().worker_attempts,1);assert.equal(control.summary().worker_starts,1);
  assert.equal(primaryEvaluatorExecutionControl(),null);
  await assert.rejects(control.executeProcess('worker',{}),/primary_condition_expired/u);
  assert.equal(control.summary().worker_attempts,1);assert.equal(readdirSync(f.outputRoot).filter(x=>/^native-round-\d+\.controller\.json$/u.test(x)).length,1);
  save(join(f.outputRoot,'assertion-summary.json'),{kind:'synthetic_native_als_join_v1',scenario,evidence_kind:'synthetic',qualification:false,quality:null,
    native_calls:0,model_calls:0,key_generation:0,ordinary_node_workers:1,fake_probe_calls:f.probes,worker_receipt:receipt,lifetime:lifecycle.at(-1)});
});
