import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

export const MN_CLIENT_PROBE_V2_VERSION='client-private-native-v2';
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
  const text=pinnedLegacyText(legacySource),marker='const probeScript = String.raw`',start=text.indexOf(marker)+marker.length;
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
function transformLegacyClientBody(original){
  const start=original.indexOf('function runBehavior(source) {'),end=original.indexOf('export async function evaluateLegacyCandidateSafe');
  if(start<0||end<start)throw new Error('client_v2_template_invalid');
  const replacement=`async function runBehavior(source, repositoryRoot, context) {
  const { runQualifiedMnClientProbeV2 } = await import(pathToFileURL(resolve(repositoryRoot, 'scripts/ask-benchmark-mn-client-probe-v2.mjs')).href);
  return await runQualifiedMnClientProbeV2({ candidateSource: Buffer.from(source), probeScript, privateNativeProbeContext: context });
}

`;
  let result=original.slice(0,start)+replacement+original.slice(end);
  result=replaceOnce(result,'originalWorkspaceAuthority, repositoryDiffArtifact }) {','originalWorkspaceAuthority, repositoryDiffArtifact, privateNativeProbeContext }) {');
  result=replaceOnce(result,'const behavioral = runBehavior(source);','const behavioral = await runBehavior(source, repositoryRoot, privateNativeProbeContext);');
  return 'export const nativeProbeVersion = '+JSON.stringify(MN_CLIENT_PROBE_V2_VERSION)+';\n'+result;
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
