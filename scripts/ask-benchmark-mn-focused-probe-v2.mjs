// Prospective, unselected focused observations. Neither this body builder nor
// fake fixtures issue native, producer, scoring or admission authority.
import {createHash} from 'node:crypto';

export const MN_FOCUSED_PROBE_VERSION='focused-authenticated-lifetime-v2';
export const MN_FOCUSED_LEGACY_BODY_SHA256='c417a7c53e49272bd54e0455f1cba21a1003aac6b46e10e3b0c766fdef480dbf';
export const MN_FOCUSED_LOADER_SHA256='dd2c18dda9c574a83d177da7e9de72acdecff49113593966d0410cdd3ec37107';
export const MN_FOCUSED_PARENT_V2_SHA256='90475c6fe751779d03d758e43be6855ba47e6d3c6cea62500aed6370005ba458';
const FROZEN_SOURCE_SHA256='34cbda6cafabd736e07b262a655bcbbfb92cbe6af0409803a8b2545bfa9cc510';
const WEAKENED_SOURCE_SHA256='ae3822f0fc92ac79376678056a77e201d417e2d6dc7ca522ade3306aa89f1f0c';
const nativeQualificationEvidence=null;
const hash=value=>createHash('sha256').update(value).digest('hex');
const unavailable=()=>({status:'unavailable',exit_code:null,observed:false,requests:0,assertion_failure:false,authenticated_mixed_boundary:false});
const refusal=code=>Object.assign(new Error(code),{code});
function replaceOnce(source,before,after){
  if(source.split(before).length!==2)throw refusal('focused_v2_source_shape_invalid');
  return source.replace(before,after);
}
function section(source,first,next,replacement){
  const start=source.indexOf(first),end=source.indexOf(next,start+first.length);
  if(start<0||end<0||source.indexOf(first,start+1)>=0)throw refusal('focused_v2_source_shape_invalid');
  return source.slice(0,start)+replacement+'\n'+source.slice(end);
}
function legacyText(value,synthetic=false){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value??'');
  if(!synthetic&&hash(bytes)!==MN_FOCUSED_LEGACY_BODY_SHA256)throw refusal('focused_v2_legacy_pin_changed');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!Buffer.from(text).equals(bytes))throw refusal('focused_v2_source_encoding_invalid');
  return text;
}
function parentLiteral(source){
  const lines=source.split('\n').filter(line=>line.startsWith('const PARENT_SOURCE='));
  if(lines.length!==1||!lines[0].endsWith(';'))throw refusal('focused_v2_parent_literal_invalid');
  let value;try{value=JSON.parse(lines[0].slice('const PARENT_SOURCE='.length,-1));}catch{throw refusal('focused_v2_parent_literal_invalid');}
  if(typeof value!=='string')throw refusal('focused_v2_parent_literal_invalid');
  return {line:lines[0],value};
}

// Pure source transformation. The old body is never imported/evaluated, and
// the new parent is never launched by this builder.
function parentSourceV2(source){
  let parent=parentLiteral(source).value;
  const auth=source.split('\n').find(line=>line.startsWith('function authenticatedObservation('));
  if(!auth)throw refusal('focused_v2_auth_source_missing');
  parent=replaceOnce(parent,"const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-focused-isolated-')));",'const root=realpathSync(data.scratchRoot);');
  parent=replaceOnce(parent,'let api;',`${auth}\nconst frame=value=>writeSync(1,JSON.stringify(value)+'\\n');\nconst emptyResult=()=>({status:'unavailable',exit_code:null,observed:false,requests:0,assertion_failure:false,authenticated_mixed_boundary:false});\nlet api;`);
  const early="writeSync(1,JSON.stringify({status:'unavailable'})+'\\n');process.exit(1);";
  if(parent.split(early).length!==3)throw refusal('focused_v2_parent_early_shape_invalid');
  parent=parent.split(early).join("frame({type:'result',result:emptyResult()});process.exit(1);");
  const oldStreams="child.stdout.on('data',x=>{stdout+=x;if(stdout.length>1048576){invalid=true;child.kill('SIGKILL');}});child.stderr.on('data',x=>{stderr+=x;if(stderr.length>1048576){invalid=true;child.kill('SIGKILL');}});";
  parent=replaceOnce(parent,oldStreams,`let stdoutBytes=0,stderrBytes=0;
const forward=(stream,chunk)=>{const bytes=Buffer.from(chunk),used=stream==='stdout'?stdoutBytes:stderrBytes,accepted=bytes.subarray(0,Math.max(0,1048576-used));
 if(accepted.length){frame({type:stream,data:accepted.toString('base64')});if(stream==='stdout'){stdoutBytes+=accepted.length;stdout+=accepted.toString('utf8');}else{stderrBytes+=accepted.length;stderr+=accepted.toString('utf8');}}
 if(accepted.length!==bytes.length){invalid=true;child.kill('SIGKILL');}};
child.stdout.on('data',bytes=>forward('stdout',bytes));child.stderr.on('data',bytes=>forward('stderr',bytes));`);
  parent=replaceOnce(parent,"writeSync(4,JSON.stringify({...message,binding_token:undefined,mac})+'\\n');observed=true;",
    "const authenticated=JSON.stringify({...message,binding_token:undefined,mac});if(!authenticatedObservation(authenticated,data.key,data.nonce,data.token)){invalid=true;child.kill('SIGKILL');return;}observed=true;");
  parent=replaceOnce(parent,"writeSync(1,JSON.stringify({status,exit_code:code,observed,requests,assertion_failure:/ERR_ASSERTION|AssertionError|not ok/.test(stdout+stderr)})+'\\n');rmSync(root,{recursive:true,force:true});",
    "frame({type:'result',result:{status,exit_code:code,observed,requests,assertion_failure:/ERR_ASSERTION|AssertionError|not ok/.test(stdout+stderr),authenticated_mixed_boundary:observed}});");
  // No dynamic error/message/input is written to trusted-parent stderr. The
  // stdin/fd3/fd4 carriers and authenticated record never become outer frames.
  const start=parent.indexOf('const data=JSON.parse(readFileSync(0,');
  if(start<0)throw refusal('focused_v2_parent_input_shape_invalid');
  parent=parent.slice(0,start)+"try{\n"+parent.slice(start)+"\n}catch{writeSync(2,'focused_parent_failure\\n');process.exitCode=1;}\n";
  return `// ${MN_FOCUSED_PROBE_VERSION}; owner-created scratch, no external fd4 receipt\n`+parent;
}
export function buildMnFocusedParentSourceV2({legacySource}){return parentSourceV2(legacyText(legacySource));}

function checkedFocusedObservation(value){
  if(value?.status==='unavailable')return {status:'unavailable'};
  if(!value||Object.keys(value).sort().join(',')!=='assertion_failure,authenticated_mixed_boundary,exit_code,observed,requests,status'
    ||!['succeeded','failed'].includes(value.status)||!Number.isInteger(value.exit_code)||value.exit_code<0||value.exit_code>255
    ||!Number.isInteger(value.requests)||value.requests<0||value.requests>1000
    ||['observed','assertion_failure','authenticated_mixed_boundary'].some(key=>typeof value[key]!=='boolean')
    ||value.observed!==value.authenticated_mixed_boundary
    ||(value.status==='succeeded'?value.exit_code!==0:value.exit_code===0))return {status:'unavailable'};
  return {...value};
}
function evaluatorSourceV2(legacySource,synthetic=false){
  let source=legacyText(legacySource,synthetic);const parent=parentLiteral(source),newParent=parentSourceV2(source);
  source=replaceOnce(source,parent.line,'const PARENT_SOURCE='+JSON.stringify(newParent)+';');
  const headers=[...source.matchAll(/^function run\(([^\n]*)\)\{/gmu)];
  if(headers.length!==1)throw refusal('focused_v2_run_header_invalid');
  const asyncHeader='async function run(c'+(headers[0][1]?',':'')+headers[0][1]+'){';
  const bridge=`const focusedV2Sequences=new WeakMap();
${asyncHeader}
 const state=focusedV2Sequences.get(c);
 if(!state||state.stopped)return {status:'unavailable'};
 try{
  const module=await import(pathToFileURL(resolve(c.repositoryRoot,'scripts/ask-benchmark-mn-focused-probe-v2.mjs')).href);
  const value=await module.runQualifiedMnFocusedProbeV2({source,test,loader,existingBehaviorVariant,parentSource:PARENT_SOURCE,privateNativeProbeContext:c.privateNativeProbeContext,trialIndex:++state.index});
  if(value.observation.status==='unavailable')state.stopped=true;return value.observation;
 }catch{state.stopped=true;return {status:'unavailable'};}
}`;
  source=section(source,'function run(','// Proof of preserved frozen-suite',bridge);
  const start=source.indexOf('function existingObservableCoverage('),end=source.indexOf('export async function evaluateLegacyCandidateSafe(',start);
  if(start<0||end<0)throw refusal('focused_v2_source_shape_invalid');
  const before=source.slice(start,end);let count=0;
  // These exact-pinned private functions remain private input text. Only their
  // async signatures/call sites change; no scoring expression is copied here.
  let region=before.replace(/\brun\(([^()\n]*)\)/gu,(_match,args)=>{count++;return 'await run(c,'+args+')';});
  if(count==0||(!synthetic&&count!==11))throw refusal('focused_v2_call_shape_invalid');
  region=replaceOnce(region,'function existingObservableCoverage(source,oldTest,test,loader){','async function existingObservableCoverage(c,source,oldTest,test,loader){');
  region=replaceOnce(region,'function focusedEvaluate(c,scoring){',"async function focusedEvaluate(c,scoring){\n if(focusedV2Sequences.has(c))throw Error('focused_v2_evaluation_already_active');\n focusedV2Sequences.set(c,{stopped:false,index:0});try{");
  const closing=region.lastIndexOf('}');if(closing<0)throw refusal('focused_v2_source_shape_invalid');
  region=region.slice(0,closing)+"}finally{focusedV2Sequences.delete(c); }\n"+region.slice(closing);
  region=replaceOnce(region,'existingObservableCoverage(source,oldTest,test,loader)','await existingObservableCoverage(c,source,oldTest,test,loader)');
  source=source.slice(0,start)+region+source.slice(end);
  source=replaceOnce(source,'try{return focusedEvaluate(c,scoring);}','try{return await focusedEvaluate(c,scoring);}');
  return `export const nativeProbeVersion=${JSON.stringify(synthetic?'synthetic-focused-v2':MN_FOCUSED_PROBE_VERSION)};\n`+source;
}
export function buildMnFocusedProspectiveEvaluatorSourceV2({legacySource,probeVersion}={}){
  if(probeVersion!==MN_FOCUSED_PROBE_VERSION)throw refusal('focused_v2_explicit_version_required');
  return evaluatorSourceV2(legacySource);
}
/** Structural fixtures only. Returned text is never evaluated or selected. */
export function buildMnFocusedSourceForTest({legacySource}){return evaluatorSourceV2(legacySource,true);}
/** Generic artificial ordering/latch exercise. No private suite or criterion. */
export async function observeMnFocusedSequenceForTest(trials,executeTrial){
  if(!Array.isArray(trials)||typeof executeTrial!=='function')throw refusal('focused_v2_fake_trial_required');
  const observations=[];
  for(const trial of trials){
    let result;try{result=checkedFocusedObservation(await executeTrial(trial));}catch{result={status:'unavailable'};}
    observations.push(result);if(result.status==='unavailable')break;
  }
  return {observations,evidence_kind:'synthetic',runtime_attestation:'unknown',scoring_authority:false,quality:null};
}

export async function runQualifiedMnFocusedProbeV2(options){
  if(nativeQualificationEvidence===null)return {observation:unavailable(),reason:'focused_native_qualification_unavailable',receipt:null,quality:null};
  // This unreachable future launch still requires separately reviewed genuine
  // qualification and controller-owned binding; context is never authority.
  return launchQualifiedFocusedV2(options);
}

async function launchQualifiedFocusedV2(options){
  if(process.platform!=='darwin'||process.version!=='v24.19.0')return {observation:unavailable(),reason:'focused_platform_or_runtime_unavailable',receipt:null,quality:null};
  // Snapshot every caller-owned field before allocating keys or scratch.
  const {source,test,loader,parentSource,existingBehaviorVariant,trialIndex,privateNativeProbeContext}=options??{};
  const {outputRoot,trialId,signal,deadlineAtMs}=privateNativeProbeContext??{};
  if(typeof loader!=='string'||hash(loader)!==MN_FOCUSED_LOADER_SHA256||typeof parentSource!=='string'||hash(parentSource)!==MN_FOCUSED_PARENT_V2_SHA256
    ||typeof source!=='string'||![FROZEN_SOURCE_SHA256,WEAKENED_SOURCE_SHA256].includes(hash(source))||typeof test!=='string'
    ||(existingBehaviorVariant!==undefined&&typeof existingBehaviorVariant!=='string'))throw refusal('focused_v2_source_pin_invalid');
  if(typeof outputRoot!=='string'||typeof trialId!=='string'||!Number.isInteger(trialIndex)||trialIndex<1||trialIndex>21)throw refusal('focused_v2_context_required');
  const {runOwnedPrivateNativeProbe}=await import('./ask-primary-native-probe-lifetime.mjs');
  const {randomBytes}=await import('node:crypto');
  const {mkdtempSync,realpathSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const key=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex');
  const scratchRoot=mkdtempSync(join(realpathSync(tmpdir()),'ask-focused-isolated-'));
  const request={executable:process.execPath,args:['--input-type=module','--eval',parentSource],cwd:scratchRoot,
    env:{LANG:'C',LC_ALL:'C',TZ:'UTC',PATH:'/usr/bin:/bin'},input:Buffer.from(JSON.stringify({source,test,loader,key,nonce,token,scratchRoot,existingBehaviorVariant})+'\n'),timeout_ms:15000,max_buffer_bytes:1048576};
  try{
    const value=await runOwnedPrivateNativeProbe({request,outputRoot,trialId:trialId+'-'+trialIndex,signal,deadlineAtMs,
      cleanup:()=>rmSync(scratchRoot,{recursive:true,force:true}),outputMode:'focused_frames_v1'});
    return {observation:checkedFocusedObservation(value.result),receipt:value.receipt,quality:null};
  }catch(error){return {observation:unavailable(),reason:finiteFailureCode(error),receipt:ownedFailureReceipt(error),quality:null};}
}

function finiteFailureCode(error){return /^native_probe_[a-z_]+$/u.test(error?.code??'')?error.code:'focused_native_probe_unavailable';}
function ownedFailureReceipt(error){return error?.receipt?.kind==='ask_native_probe_lifetime_v2'?error.receipt:null;}

const FAKE_AUTH=Object.freeze({key:'1'.repeat(64),nonce:'2'.repeat(64),token:'3'.repeat(64)});
/** No real transport, body, candidate, scratch or key generation. The explicit
 * helper seam requires a fake executeSession and records synthetic logs. */
export async function runMnFocusedProbeV2ForTest({source='synthetic-source',test='synthetic-test',loader='synthetic-loader',existingBehaviorVariant='synthetic-variant',outputRoot,trialId,signal,deadlineAtMs},dependencies={}){
  const {executeSession:checkedExecuteSession,...remainingDependencies}=dependencies;
  if(typeof checkedExecuteSession!=='function'||typeof outputRoot!=='string'||typeof trialId!=='string')throw refusal('focused_v2_fake_transport_and_logs_required');
  const transport={...remainingDependencies,executeSession:checkedExecuteSession};
  const {runOwnedPrivateNativeProbeForTest}=await import('./ask-primary-native-probe-lifetime.mjs');
  const request={executable:'/synthetic/focused-parent',args:['--synthetic-focused-parent'],cwd:'/synthetic/focused-scratch',env:{LANG:'C',LC_ALL:'C',TZ:'UTC',PATH:'/usr/bin:/bin'},
    input:Buffer.from(JSON.stringify({source,test,loader,...FAKE_AUTH,scratchRoot:'/synthetic/focused-scratch',existingBehaviorVariant})+'\n'),timeout_ms:15000,max_buffer_bytes:1048576};
  try{
    const value=await runOwnedPrivateNativeProbeForTest({request,outputRoot,trialId,signal,deadlineAtMs,cleanup:()=>{},outputMode:'focused_frames_v1'},transport);
    return {observation:checkedFocusedObservation(value.result),receipt:value.receipt,evidence_kind:'synthetic',runtime_attestation:'unknown',quality:null};
  }catch(error){return {observation:unavailable(),reason:finiteFailureCode(error),receipt:ownedFailureReceipt(error),evidence_kind:'synthetic',runtime_attestation:'unknown',quality:null};}
}
