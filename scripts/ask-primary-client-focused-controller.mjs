import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {capturePrimaryNativeProbeFailure} from './ask-primary-native-probe-lifetime.mjs';
import {mnClientProbeV2Route,extractMnClientProbeV2ControllerScript,createMnClientProbeV2Observation,runQualifiedMnClientProbeV2} from './ask-benchmark-mn-client-probe-v2.mjs';
import {inspectMnFocusedControllerRouteV3,buildMnFocusedRequestBindingsV3,createMnFocusedControllerPacketV3,runQualifiedMnFocusedProbeV2} from './ask-benchmark-mn-focused-probe-v2.mjs';

const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fail=code=>Object.assign(new Error(code),{code});
export function primaryClientFocusedProbeProfile(body,fixture){
  if(mnClientProbeV2Route(body)){
    if(fixture!=='mn-client-compatibility-fix')throw fail('native_controller_fixture_mismatch');
    return {kind:'client',maxProbes:1,timeoutMs:5000};
  }
  let route;try{route=inspectMnFocusedControllerRouteV3({bodySource:body});}catch(error){if(Buffer.from(body).subarray(0,200).toString().includes('focused-controller-'))throw error;return null;}
  if(fixture!=='mn-focused-regression-test')throw fail('native_controller_fixture_mismatch');
  return {kind:'focused',maxProbes:21,timeoutMs:15000,route};
}
function source(payload,kind,path,optional=false){
  const entry=payload.authority_roots.find(row=>row.kind===kind)?.entries.find(row=>row.path===path);
  if(optional&&entry?.file_type!=='file')return Buffer.alloc(0);
  if(entry?.file_type!=='file')throw fail('native_controller_source_missing');
  return Buffer.from(entry.content_base64,'base64');
}
function savedReceipt(context,receipt){
  receipt??=JSON.parse(readStableFile(join(context.outputRoot,context.trialId+'.receipt.json'),'native private receipt',32768).bytes);
  if(!receipt||receipt.trial_id!==context.trialId&&receipt.trial_id!==context.trialId+'-1'||receipt.kind!=='ask_native_probe_lifetime_v2'
    ||receipt.termination_confirmed!==true||receipt.cleanup_status!=='removed'||receipt.log_capture_status!=='complete'||receipt.error_code!==null||receipt.post_capture_failure_code||receipt.cancelled!==false)
    throw fail('native_controller_receipt_unavailable');
  const bytes=readStableFile(join(context.outputRoot,receipt.trial_id+'.receipt.json'),'native private receipt',32768).bytes;
  if(canonical(JSON.parse(bytes))!==canonical(receipt))throw fail('native_controller_receipt_changed');
  for(const stream of ['stdout','stderr']){
    const ref=receipt[stream];if(ref?.path!==receipt.trial_id+'.'+stream+'.log'||!Number.isSafeInteger(ref.bytes)||ref.bytes<0||ref.bytes>1048576)throw fail('native_controller_stream_invalid');
    const raw=readStableFile(join(context.outputRoot,ref.path),'native private stream',1048576).bytes;
    if(raw.length!==ref.bytes||digest(raw)!==ref.digest)throw fail('native_controller_stream_changed');
  }
  return {path:receipt.trial_id+'.receipt.json',bytes:bytes.length,digest:digest(bytes)};
}
export function verifyPrimaryNativeControllerAudit({outputRoot,reference,ownerBinding,round,bodyDigest}){
  if(reference?.path!==`native-round-${round}.controller.json`)throw fail('native_controller_audit_detached');
  const bytes=readStableFile(join(outputRoot,reference.path),'native controller audit',131072).bytes;
  if(bytes.length!==reference.bytes||digest(bytes)!==reference.digest)throw fail('native_controller_audit_changed');
  const audit=JSON.parse(bytes);if(audit.round!==round||audit.owner_binding!==ownerBinding||audit.body_digest!==bodyDigest)throw fail('native_controller_audit_detached');
  for(const step of audit.steps){
    if(step.status!=='observed')continue;
    const ref=step.receipt_reference;
    if(!/^native-[0-9]{4}(?:-1)?\.receipt\.json$/u.test(ref?.path??''))throw fail('native_controller_receipt_invalid');
    const raw=readStableFile(join(outputRoot,ref.path),'native process receipt',32768).bytes;
    if(raw.length!==ref.bytes||digest(raw)!==ref.digest)throw fail('native_controller_receipt_changed');
    const receipt=JSON.parse(raw);if(receipt.trial_id+'.receipt.json'!==ref.path)throw fail('native_controller_receipt_invalid');
    savedReceipt({outputRoot,trialId:receipt.trial_id},receipt);
  }
  return audit;
}
async function prepare({payload,hiddenBody,round,control},fakeLaunchers){
  if(!Number.isInteger(round)||round<1||round>4||typeof control?.executeNativeProbe!=='function')throw fail('native_controller_owner_required');
  const normalized=JSON.parse(Buffer.from(payload.normalized_result.source_base64,'base64'));
  const profile=primaryClientFocusedProbeProfile(hiddenBody,normalized.lineage.fixture_id);if(!profile)throw fail('native_controller_route_invalid');
  control.bindNativeProbeBody(hiddenBody,normalized.lineage.fixture_id);
  const ownerBinding=digest(canonical({normalized_result_digest:normalized.normalized_result_digest,fixture_id:normalized.lineage.fixture_id,
    body_digest:digest(hiddenBody),round,condition:normalized.lineage.condition,run_instance_id:normalized.lineage.run_instance_id}));
  const audit={kind:'ask_primary_native_controller_audit_v3',owner_binding:ownerBinding,body_digest:digest(hiddenBody),round,profile:profile.kind,steps:[],quality:null,qualification:false};
  const invoke=async(input,step)=>control.executeNativeProbe(async context=>{
    let value,recorded=false;
    try{
      value=profile.kind==='client'?await (fakeLaunchers?.client??runQualifiedMnClientProbeV2)({...input,privateNativeProbeContext:context}):
        await (fakeLaunchers?.focused??runQualifiedMnFocusedProbeV2)({...input,privateNativeProbeContext:context,trialIndex:1});
      const unavailable=profile.kind==='client'?value?.state==='manual_review_required':value?.observation?.status==='unavailable';
      if(value?.code==='native_client_probe_qualification_unavailable'||value?.reason==='focused_native_qualification_unavailable'){
        audit.steps.push({step_id:step,status:'not_started',reason:'native_controller_qualification_unavailable'});recorded=true;throw fail('native_controller_qualification_unavailable');
      }
      if(unavailable||!value)throw fail('native_controller_probe_unavailable');
      const reference=savedReceipt(context,value.receipt);
      audit.steps.push({step_id:step,status:'observed',receipt_reference:reference});
      return {value,receiptDigest:reference.digest,lifecycle_receipt:JSON.parse(readStableFile(join(context.outputRoot,reference.path),'native lifecycle receipt',32768).bytes)};
    }catch(error){if(!recorded){const failure_reference=capturePrimaryNativeProbeFailure(context,value?.receipt??error?.receipt);audit.steps.push({step_id:step,status:'unavailable',reason:'native_controller_probe_unavailable',failure_reference});}if(value?.receipt)error.receipt=value.receipt;throw error;}
    finally{
      const bytes=Buffer.from(JSON.stringify(audit)+'\n');
      try{writeFileSync(join(context.outputRoot,context.trialId+'.controller.json'),bytes,{flag:'wx',mode:0o600});}catch{throw fail('native_controller_capture_failed');}
    }
  });
  try{
  if(profile.kind==='client'){
    const candidateSource=source(payload,'candidate','src/preferences.mjs',true),probeScript=extractMnClientProbeV2ControllerScript({hiddenSource:hiddenBody});
    const {value,receiptDigest}=await invoke({candidateSource,probeScript},'client-1');
    const {receipt,evidence_kind,...semantic}=value;
    const packet=createMnClientProbeV2Observation({candidateSource,normalizedResultDigest:normalized.normalized_result_digest,ownerBinding,receiptDigest,result:semantic});
    control.captureNativeControllerAudit(audit);
    return {field:'private_client_probe',packet,ownerBinding,audit};
  }
  const frozen=source(payload,'frozen','src/session-key.mjs').toString('utf8'),oldTest=source(payload,'frozen','test/session-key.test.mjs').toString('utf8'),test=source(payload,'candidate','test/session-key.test.mjs').toString('utf8');
  const loaders=payload.modules.filter(row=>row.path.endsWith('/authenticated-generic-loader.mjs'));
  if(loaders.length!==1)throw fail('native_controller_loader_missing');
  const loader=Buffer.from(loaders[0].source_base64,'base64').toString('utf8');
  const bindings=buildMnFocusedRequestBindingsV3({plan:profile.route.plan,source:frozen,oldTest,test,loader,normalizedResultDigest:normalized.normalized_result_digest,ownerBinding});
  const rows=[],states=new Map();
  for(const request of bindings.requests){
    const enabled=request.requires.every(g=>{const prior=states.get(g.step_id);if(!prior)throw fail('native_controller_dependency_missing');return prior.status==='skipped'?false:prior.result[g.field]===g.equals;});
    if(!enabled){states.set(request.step_id,{status:'skipped'});audit.steps.push({step_id:request.step_id,status:'skipped'});continue;}
    const {value,receiptDigest}=await invoke({...request,parentSource:profile.route.parentSource,existingBehaviorVariant:request.variant},request.step_id);
    const row={step_id:request.step_id,site:request.site,loop_context:request.loop_context,request_digest:request.request_digest,result:value.observation,receipt_digest:receiptDigest};
    rows.push(row);states.set(request.step_id,{status:'observed',result:row.result});
  }
  const packet=createMnFocusedControllerPacketV3({bindings,observations:rows});control.captureNativeControllerAudit(audit);
  return {field:'private_focused_probe',packet,ownerBinding,audit};
  }catch(error){
    const ids=profile.kind==='client'?['client-1']:profile.route.plan.steps.map(step=>step.step_id);
    for(const step_id of ids)if(!audit.steps.some(row=>row.step_id===step_id))audit.steps.push({step_id,status:'not_started'});
    control.captureNativeControllerAudit(audit);throw error;
  }
}
export function preparePrimaryClientFocusedProbe(options){return prepare(options,null);}
/** Fake launchers only; returns no production authority or qualification. */
export async function preparePrimaryClientFocusedProbeForTest(options,{client,focused}={}){
  if(typeof client!=='function'||typeof focused!=='function')throw fail('native_controller_fake_launchers_required');
  const result=await prepare(options,{client,focused});return {...result,evidence_kind:'synthetic',authority:false};
}
