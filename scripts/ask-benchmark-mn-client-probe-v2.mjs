import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

export const MN_CLIENT_PROBE_V2_VERSION='client-private-native-v2';
export const MN_CLIENT_PROBE_V3_BODY_VERSION='client-controller-observation-v3';
export const MN_CLIENT_PROBE_V3_BODY_HEADER='export const nativeProbeVersion = \"client-controller-observation-v3\";\n';
export const MN_CLIENT_PROBE_V3_BODY_SHA256='0ccb03aa47c9468516eaa9ca184eeea75e91ec34ea79e8a0f7dadad3e7d0b770';
export const MN_CLIENT_PROBE_V2_LEGACY_SHA256='d540b6064b23fa4b4f69e184aaa51189de30563907b30dca2bb8fdfc85c2faee';
const SCRIPT_SHA256='acfb3b1ba13a0c2be84aaea801c0ea7a482ad616f5b0a829b285f63d8465f72f';
const nativeQualificationEvidence=null;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const unavailable=code=>({state:'manual_review_required',code,quality:null});
const failure=code=>Object.assign(new Error(code),{code});

// C2-PIN: text extraction only. No eval, VM, import of a legacy evaluator, or
// execution of its candidate/probe script is needed to select this new version.
function pinnedLegacyText(legacySource){
  if(!(typeof legacySource==='string'||Buffer.isBuffer(legacySource))||sha(legacySource)!==MN_CLIENT_PROBE_V2_LEGACY_SHA256)
    throw new Error('client_v2_legacy_source_pin_invalid');
  return Buffer.isBuffer(legacySource)?legacySource.toString('utf8'):legacySource;
}
export function extractMnClientProbeV2Script({legacySource}){
  return c2ExtractScript(pinnedLegacyText(legacySource));
}
function c2ExtractScript(text){
  const marker='const probeScript = String.raw`',start=text.indexOf(marker)+marker.length;
  let end=start;
  for(;end<text.length;end++){
    if(text[end]!=='`')continue;
    let backslashes=0;for(let i=end-1;i>=start&&text[i]==='\\';i--)backslashes++;
    if(backslashes%2===0)break;
  }
  const raw=text.slice(start,end);
  if(start<marker.length||end===text.length||raw.includes('${'))throw new Error('client_v2_template_invalid');
  // The pinned original applies precisely this replacement to String.raw.
  const script=raw.replaceAll('\\`','`');
  if(sha(script)!==SCRIPT_SHA256)throw new Error('client_v2_template_invalid');
  return script;
}
function replaceOnce(text,before,after){
  const start=text.indexOf(before);
  if(start<0||text.indexOf(before,start+before.length)!==-1)throw new Error('client_v2_template_invalid');
  return text.slice(0,start)+after+text.slice(start+before.length);
}
export function buildMnClientProbeV2EvaluatorSource({legacySource}){
  const original=pinnedLegacyText(legacySource);extractMnClientProbeV2Script({legacySource});
  return transformLegacyClientBody(original);
}

// Pure synthetic template proof only; no evaluator/native authority.
export function buildMnClientProbeV2EvaluatorSourceForTest({syntheticLegacySource}){
  if(typeof syntheticLegacySource!=='string'||!syntheticLegacySource.startsWith('// synthetic template; no evaluator/native authority\n'))throw new Error('client_v2_template_invalid');
  return transformLegacyClientBody(syntheticLegacySource);
}
const C2_CLIENT_BINDING_META=Object.freeze({probe_version:MN_CLIENT_PROBE_V2_VERSION,legacy_source_digest:'sha256:'+MN_CLIENT_PROBE_V2_LEGACY_SHA256,probe_script_digest:'sha256:'+SCRIPT_SHA256});
function c2ClientBinding({candidateSource,normalizedResultDigest,ownerBinding,receiptDigest=null}){
  const isDigest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/u.test(value);
  if(!Buffer.isBuffer(candidateSource)||!isDigest(normalizedResultDigest)||!isDigest(ownerBinding)||(receiptDigest!==null&&!isDigest(receiptDigest)))throw new Error('client_v2_observation_invalid');
  // Fixed lexical order is exactly the canonical JSON order for these seven
  // scalar fields. The root computes ownerBinding from verified round identity.
  return {candidate_source_digest:'sha256:'+createHash('sha256').update(candidateSource).digest('hex'),legacy_source_digest:C2_CLIENT_BINDING_META.legacy_source_digest,
    normalized_result_digest:normalizedResultDigest,owner_binding:ownerBinding,probe_script_digest:C2_CLIENT_BINDING_META.probe_script_digest,
    probe_version:C2_CLIENT_BINDING_META.probe_version,receipt_digest:receiptDigest};
}
function c2ClientResult(value){
  if(!value||typeof value!=='object'||value.quality!==null)return null;
  const fields=Object.keys(value).sort().join(',');
  if(value.state==='manual_review_required'&&fields==='code,quality,state'&&typeof value.code==='string'&&/^[a-z][a-z0-9_]{0,79}$/u.test(value.code))
    return Object.freeze({state:value.state,code:value.code,quality:null});
  if(!['pass','fail'].includes(value.state)||fields!=='code,observation_digest,observations,quality,state'||value.code!=='bounded_behavior_observation'
    ||typeof value.observation_digest!=='string'||!/^sha256:[a-f0-9]{64}$/u.test(value.observation_digest)||!Array.isArray(value.observations)||value.observations.length>2
    ||value.observations.some(row=>!Array.isArray(row)||row.length>18||row.some(item=>typeof item!=='boolean')))return null;
  return Object.freeze({state:value.state,code:value.code,quality:null,observation_digest:value.observation_digest,
    observations:Object.freeze(value.observations.map(row=>Object.freeze([...row])))});
}
// Pure conversion/inspection is not an issuer. Only the controller may supply
// these packets after its own capture/pin checks and module-private gate.
export function createMnClientProbeV2Observation({candidateSource,normalizedResultDigest,ownerBinding,receiptDigest=null,result}){
  const binding=c2ClientBinding({candidateSource,normalizedResultDigest,ownerBinding,receiptDigest}),checked=c2ClientResult(result);
  if(!checked||(receiptDigest===null&&(checked.state!=='manual_review_required'||checked.code!=='native_client_probe_qualification_unavailable')))throw new Error('client_v2_observation_invalid');
  return Object.freeze({...binding,request_digest:'sha256:'+createHash('sha256').update(JSON.stringify(binding)).digest('hex'),result:checked});
}
export function inspectMnClientProbeV2Observation({candidateSource,normalizedResultDigest,ownerBinding,observation}={}){
  try{
    if(!observation||Object.keys(observation).sort().join(',')!=='candidate_source_digest,legacy_source_digest,normalized_result_digest,owner_binding,probe_script_digest,probe_version,receipt_digest,request_digest,result')throw new Error();
    const binding=c2ClientBinding({candidateSource,normalizedResultDigest,ownerBinding,receiptDigest:observation.receipt_digest});
    if(Object.entries(binding).some(([key,value])=>observation[key]!==value)||observation.request_digest!=='sha256:'+createHash('sha256').update(JSON.stringify(binding)).digest('hex'))throw new Error();
    const checked=c2ClientResult(observation.result);
    if(!checked||(binding.receipt_digest===null&&(checked.state!=='manual_review_required'||checked.code!=='native_client_probe_qualification_unavailable')))throw new Error();
    return checked;
  }catch{return {state:'manual_review_required',code:'private_client_probe_observation_unavailable',quality:null};}
}
export function mnClientProbeV2Route(hiddenSource){
  if(!(typeof hiddenSource==='string'||Buffer.isBuffer(hiddenSource)))throw new Error('client_v2_body_source_pin_invalid');
  const text=Buffer.isBuffer(hiddenSource)?hiddenSource.toString('utf8'):hiddenSource;
  if(!text.startsWith(MN_CLIENT_PROBE_V3_BODY_HEADER)){
    if(text.startsWith('export const nativeProbeVersion = "client-'))throw new Error('client_v2_body_version_unknown');
    return null;
  }
  if(sha(hiddenSource)!==MN_CLIENT_PROBE_V3_BODY_SHA256)throw new Error('client_v2_body_source_pin_invalid');
  return MN_CLIENT_PROBE_V3_BODY_VERSION;
}
export function extractMnClientProbeV2ControllerScript({hiddenSource}){
  if(mnClientProbeV2Route(hiddenSource)!==MN_CLIENT_PROBE_V3_BODY_VERSION)throw new Error('client_v2_body_source_pin_invalid');
  return c2ExtractScript(Buffer.isBuffer(hiddenSource)?hiddenSource.toString('utf8'):hiddenSource);
}
function transformLegacyClientBody(original){
  const start=original.indexOf('function runBehavior(source) {'),end=original.indexOf('export async function evaluateLegacyCandidateSafe');
  if(start<0||end<start)throw new Error('client_v2_template_invalid');
  const replacement='const C2_CLIENT_BINDING_META = '+JSON.stringify(C2_CLIENT_BINDING_META)+';\n'+c2ClientBinding.toString()+'\n'+c2ClientResult.toString()+'\n'+inspectMnClientProbeV2Observation.toString()+`\nfunction runBehavior(source, normalizedResult, observation, ownerBinding) {
  return inspectMnClientProbeV2Observation({ candidateSource: source, normalizedResultDigest: normalizedResult?.normalized_result_digest, observation, ownerBinding });
}

`;
  let result=original.slice(0,start)+replacement+original.slice(end);
  result=replaceOnce(result,"import { spawnSync } from 'node:child_process';\n",'');
  result=replaceOnce(result,"import { mkdtempSync, readFileSync, rmSync } from 'node:fs';","import { readFileSync } from 'node:fs';");
  result=replaceOnce(result,"import { tmpdir } from 'node:os';\n",'');
  result=replaceOnce(result,"import { dirname, resolve } from 'node:path';","import { resolve } from 'node:path';");
  result=replaceOnce(result,'originalWorkspaceAuthority, repositoryDiffArtifact }) {','originalWorkspaceAuthority, repositoryDiffArtifact, privateClientProbe, privateNativeProbeBinding }) {');
  result=replaceOnce(result,"const source = readFileSync(resolve(candidateWorkspace, 'src/preferences.mjs'), 'utf8');","const source = readFileSync(resolve(candidateWorkspace, 'src/preferences.mjs'));");
  result=replaceOnce(result,'const behavioral = runBehavior(source);','const behavioral = runBehavior(source, normalizedResult, privateClientProbe, privateNativeProbeBinding);');
  return MN_CLIENT_PROBE_V3_BODY_HEADER+result;
}

// C2-GATE: no caller assertion/transport/context can qualify native execution.
// Only a separately reviewed source change could close this absent evidence.
export async function runQualifiedMnClientProbeV2(input={}){
  if(nativeQualificationEvidence===null)return unavailable('native_client_probe_qualification_unavailable');
  return launchClientProbe({candidateSource:input.candidateSource,probeScript:input.probeScript,privateNativeProbeContext:input.privateNativeProbeContext});
}

const SYNTHETIC_SCRIPT='// synthetic client probe; never executed\n';
function requestFor({candidateSource,probeScript},cwd,synthetic=false){
  if(!Buffer.isBuffer(candidateSource)||typeof probeScript!=='string'||(synthetic?probeScript!==SYNTHETIC_SCRIPT:sha(probeScript)!==SCRIPT_SHA256))
    throw failure('client_v2_probe_input_invalid');
  const literal=value=>JSON.stringify(value);
  const policy=`(version 1)(deny default)(allow process*)(allow sysctl-read)(allow mach-lookup)(allow file-read*)(deny file-read-data (require-all (subpath "/Users") (require-not (subpath ${literal(dirname(process.execPath))}))) (subpath "/private/tmp") (subpath "/private/var/folders"))`;
  return {executable:'/usr/bin/sandbox-exec',args:['-p',policy,process.execPath,'--permission','--experimental-vm-modules','-e',probeScript],
    input:Buffer.from(candidateSource),cwd,env:{PATH:'/usr/bin:/bin',LANG:'C',TZ:'UTC'},timeout_ms:5000,max_buffer_bytes:16384};
}
function clientObservation(stdout){
  let result;const text=stdout.toString('utf8');
  try{
    result=JSON.parse(text);
    if(Object.keys(result).sort().join()!=='modes,observations,passed'||typeof result.passed!=='boolean'||!Number.isInteger(result.modes)||!Array.isArray(result.observations)||result.observations.some(x=>!Array.isArray(x)||x.some(v=>typeof v!=='boolean')))
      return unavailable('candidate_observation_invalid');
  }catch{return unavailable('candidate_observation_invalid');}
  // Preserve the legacy parser's pass/fail criteria. Quality stays unscored;
  // these private reruns can never supply agent verification or admission.
  return {state:result.passed&&result.modes===2?'pass':'fail',code:'bounded_behavior_observation',
    observation_digest:'sha256:'+sha(text),observations:result.observations,quality:null};
}
async function launchClientProbe(inputs,depsForTest){
  const synthetic=depsForTest!==undefined,request=requestFor(inputs,undefined,synthetic);
  const supplied=inputs.privateNativeProbeContext;
  if(!supplied||typeof supplied!=='object')throw failure('client_v2_private_context_required');
  // Custody only, never qualification. Read ordinary parameters before yielding;
  // keep the selected AbortSignal identity live for cancellation.
  let context;
  try{context={outputRoot:supplied.outputRoot,trialId:supplied.trialId,signal:supplied.signal,deadlineAtMs:supplied.deadlineAtMs};}
  catch{throw failure('client_v2_private_context_invalid');}
  const {runOwnedPrivateNativeProbe,runOwnedPrivateNativeProbeForTest}=await import('./ask-primary-native-probe-lifetime.mjs');
  const scratch=mkdtempSync(resolve(tmpdir(),'ask-client-probe-v2-'));request.cwd=scratch;
  // The shared owner retains raw/failure receipts and is solely responsible
  // for invoking cleanup after owned termination. A throw must propagate;
  // neither capture failure nor uncertain/cancelled work can become a grade.
  const options={request,outputRoot:context.outputRoot,trialId:context.trialId,signal:context.signal,deadlineAtMs:context.deadlineAtMs,
    cleanup:()=>rmSync(scratch,{recursive:true,force:true}),outputMode:'raw_stdio_v1'};
  const processResult=await (synthetic?runOwnedPrivateNativeProbeForTest(options,depsForTest):runOwnedPrivateNativeProbe(options));
  if(processResult.receipt.termination_confirmed!==true||processResult.receipt.cleanup_status!=='removed'||processResult.receipt.exit_code!==0||processResult.receipt.signal!==null||processResult.receipt.error_code!==null||processResult.receipt.cancelled!==false)
    throw failure('client_v2_process_unavailable');
  return clientObservation(processResult.stdout);
}

// Only artificial I/O may use this seam; its script is inert and fixed. It
// cannot select a production body or alter the private qualification gate.
export async function runMnClientProbeV2ForTest({candidateSource,privateNativeProbeContext},depsForTest){
  const {executeSession,...restDeps}=depsForTest??{};
  if(typeof executeSession!=='function')throw failure('client_v2_fake_transport_required');
  const dependencies={...restDeps,executeSession};
  return {...await launchClientProbe({candidateSource,probeScript:SYNTHETIC_SCRIPT,privateNativeProbeContext},dependencies),evidence_kind:'synthetic'};
}
